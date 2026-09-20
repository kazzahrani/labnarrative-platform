import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.4";

type J = Record<string, unknown>;
function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json","cache-control":"no-store"}})}
function text(v:unknown,max=4000){return typeof v==="string"?v.trim().slice(0,max):""}
function envMap(name:string):Record<string,string>{try{return JSON.parse(Deno.env.get(name)||"{}") as Record<string,string>}catch{return{}}}
function secret(...names:string[]){for(const name of names){const direct=Deno.env.get(name);if(direct)return direct;const mapped=envMap(name).default;if(mapped)return mapped}return""}
function serviceKey(){return envMap("SUPABASE_SECRET_KEYS").default||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}
function money(v:unknown){const n=Number(v);return Number.isFinite(n)?Math.round(n*100)/100:0}
function near(a:number,b:number){return Math.abs(a-b)<0.011}
function parseOrderId(value:string){
  const parts=value.split(":");
  if(parts.length!==3||parts[0]!=="lnperf")return null;
  const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if(!uuid.test(parts[1])||!uuid.test(parts[2]))return null;
  return {settlementId:parts[1],attemptId:parts[2]};
}
async function nowPayment(paymentId:string){
  const apiKey=secret("NOWPAYMENTS_API_KEY","NOWPAYMENTS_KEY","NOWPAYMENTS_KEYS");
  if(!apiKey)throw new Error("nowpayments_not_configured");
  const r=await fetch(`https://api.nowpayments.io/v1/payment/${encodeURIComponent(paymentId)}`,{
    headers:{"x-api-key":apiKey,"Accept":"application/json"},
    signal:AbortSignal.timeout(15000),
  });
  const p=await r.json().catch(()=>({})) as J;
  if(!r.ok)throw new Error(text(p.message,1000)||text(p.error,1000)||"nowpayments_verify_failed");
  return p;
}

Deno.serve(async(req:Request)=>{
  if(req.method!=="POST")return json({ok:false,error:"method_not_allowed"},405);
  try{
    const base=Deno.env.get("SUPABASE_URL")||"",key=serviceKey();
    if(!base||!key)return json({ok:false,error:"server_configuration_missing"},500);
    const db=createClient(base,key,{auth:{persistSession:false,autoRefreshToken:false}});
    const callback=await req.json().catch(()=>({})) as J;
    const callbackOrder=text(callback.order_id,300);
    const callbackPaymentId=text(callback.payment_id,300);
    const parsed=parseOrderId(callbackOrder);
    if(!parsed||!callbackPaymentId)return json({ok:true,ignored:true});

    const contextQ=await db.rpc("performance_nowpayments_attempt_internal",{
      p_attempt_id:parsed.attemptId,
      p_settlement_id:parsed.settlementId,
    });
    if(contextQ.error)return json({ok:true,ignored:true});
    const context=contextQ.data as any;
    if(context.settlementStatus==="paid")return json({ok:true,paid:true,alreadyPaid:true});

    const verified=await nowPayment(callbackPaymentId);
    const verifiedOrder=text(verified.order_id,300);
    const status=text(verified.payment_status,60).toLowerCase();
    if(verifiedOrder!==callbackOrder)return json({ok:false,error:"nowpayments_order_mismatch"},409);

    const expected=money(context.amountUsd);
    const priceAmount=money(verified.price_amount);
    const priceCurrency=text(verified.price_currency,20).toUpperCase();
    if(priceCurrency!=="USD"||!near(priceAmount,expected))return json({ok:false,error:"nowpayments_amount_mismatch"},409);

    let attemptStatus:"pending"|"paid"|"failed"|"expired"="pending";
    if(status==="finished")attemptStatus="paid";
    else if(status==="expired")attemptStatus="expired";
    else if(status==="failed"||status==="refunded")attemptStatus="failed";

    const updateQ=await db.rpc("performance_update_payment_attempt_internal",{
      p_user_id:context.userId,
      p_attempt_id:parsed.attemptId,
      p_status:attemptStatus,
      p_external_id:callbackPaymentId,
      p_checkout_url:null,
      p_provider_payload:{callback,verified},
      p_error_message:attemptStatus==="failed"?`nowpayments_${status}`:null,
    });
    if(updateQ.error)throw updateQ.error;

    if(status!=="finished"){
      return json({ok:true,paid:false,status});
    }

    const paidQ=await db.rpc("performance_mark_settlement_paid_internal",{
      p_settlement_id:parsed.settlementId,
      p_provider:"nowpayments",
      p_external_id:callbackPaymentId,
      p_provider_payload:{verified},
    });
    if(paidQ.error)throw paidQ.error;

    return json({ok:true,paid:true,status:"finished"});
  }catch(error){
    console.error("performance-nowpayments-ipn",error);
    return json({ok:false,error:"performance_nowpayments_ipn_failed"},500);
  }
});