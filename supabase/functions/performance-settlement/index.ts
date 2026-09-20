import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.4";

type J = Record<string, unknown>;
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{...cors,"content-type":"application/json","cache-control":"no-store"}})}
function text(v:unknown,max=4000){return typeof v==="string"?v.trim().slice(0,max):""}
function obj(v:unknown):J{return v&&typeof v==="object"&&!Array.isArray(v)?v as J:{}}
function arr(v:unknown):J[]{return Array.isArray(v)?v.filter(x=>x&&typeof x==="object") as J[]:[]}
function envMap(name:string):Record<string,string>{try{return JSON.parse(Deno.env.get(name)||"{}") as Record<string,string>}catch{return{}}}
function serviceKey(){return envMap("SUPABASE_SECRET_KEYS").default||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}
function secret(...names:string[]){for(const name of names){const direct=Deno.env.get(name);if(direct)return direct;const mapped=envMap(name).default;if(mapped)return mapped}return""}
function paypalBase(){return (Deno.env.get("PAYPAL_ENVIRONMENT")||"live").toLowerCase()==="sandbox"?"https://api-m.sandbox.paypal.com":"https://api-m.paypal.com"}
function money(value:unknown){const n=Number(value);return Number.isFinite(n)?Math.round(n*100)/100:0}
function near(a:number,b:number){return Math.abs(a-b)<0.011}

async function paypalAccessToken(){
  const id=secret("PAYPAL_CLIENT_ID"),s=secret("PAYPAL_CLIENT_SECRET");
  if(!id||!s)throw new Error("paypal_not_configured");
  const r=await fetch(`${paypalBase()}/v1/oauth2/token`,{
    method:"POST",
    headers:{Authorization:`Basic ${btoa(`${id}:${s}`)}`,"Content-Type":"application/x-www-form-urlencoded"},
    body:"grant_type=client_credentials",
  });
  const p=await r.json().catch(()=>({})) as J;
  const token=text(p.access_token,6000);
  if(!r.ok||!token)throw new Error(text(p.error_description,1000)||"paypal_auth_failed");
  return token;
}
async function paypal(path:string,init:RequestInit={}){
  const token=await paypalAccessToken();
  const r=await fetch(`${paypalBase()}${path}`,{
    ...init,
    headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json","Prefer":"return=representation",...(init.headers||{})},
  });
  const p=await r.json().catch(()=>({})) as J;
  return {r,p};
}
function paypalApprove(payload:J){
  return text(arr(payload.links).find(x=>text(x.rel,60)==="approve")?.href,4000);
}
function paypalCapture(payload:J){
  const units=arr(payload.purchase_units);
  for(const unit of units){
    const payments=obj(unit.payments);
    const captures=arr(payments.captures);
    if(captures.length)return captures[0];
  }
  return {} as J;
}

function nowApiKey(){return secret("NOWPAYMENTS_API_KEY","NOWPAYMENTS_KEY","NOWPAYMENTS_KEYS")}
async function nowInvoice(body:J){
  const key=nowApiKey(); if(!key)throw new Error("nowpayments_not_configured");
  const r=await fetch("https://api.nowpayments.io/v1/invoice",{
    method:"POST",
    headers:{"x-api-key":key,"Content-Type":"application/json"},
    body:JSON.stringify(body),
  });
  const p=await r.json().catch(()=>({})) as J;
  if(!r.ok)throw new Error(text(p.message,1000)||text(p.error,1000)||"nowpayments_invoice_failed");
  return p;
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return json({ok:false,error:"method_not_allowed"},405);

  const base=Deno.env.get("SUPABASE_URL")||"",key=serviceKey();
  if(!base||!key)return json({ok:false,error:"server_configuration_missing"},500);
  const admin=createClient(base,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const auth=text(req.headers.get("authorization"),8000);
  const token=auth.toLowerCase().startsWith("bearer ")?auth.slice(7):"";
  if(!token)return json({ok:false,error:"unauthorized"},401);
  const userQ=await admin.auth.getUser(token);
  if(userQ.error||!userQ.data.user)return json({ok:false,error:"unauthorized"},401);
  const uid=userQ.data.user.id;
  const body=await req.json().catch(()=>({})) as J;
  const action=text(body.action,80)||"status";

  try{
    const stateQ=await admin.rpc("performance_status_internal",{p_user_id:uid});
    if(stateQ.error)throw stateQ.error;
    const performanceState=(stateQ.data||{}) as any;

    const settlementQ=await admin.rpc("performance_settlement_status_internal",{p_user_id:uid});
    if(settlementQ.error)throw settlementQ.error;
    const settlementState=(settlementQ.data||{}) as any;

    const subQ=await admin.from("user_subscriptions")
      .select("plan_key,status,billing_interval,current_period_start,current_period_end")
      .eq("user_id",uid).maybeSingle();
    if(subQ.error)throw subQ.error;
    const sub=subQ.data;

    const providers={
      paypal:Boolean(secret("PAYPAL_CLIENT_ID")&&secret("PAYPAL_CLIENT_SECRET")),
      nowpayments:Boolean(nowApiKey()),
    };

    if(action==="status"){
      return json({ok:true,enabled:performanceState?.config?.enabled===true,providers,subscription:sub||null,...settlementState});
    }

    if(performanceState?.config?.enabled!==true)return json({ok:false,error:"performance_not_enabled"},409);
    if(!sub||sub.plan_key!=="performance")return json({ok:false,error:"performance_subscription_required"},409);

    if(action==="prepare_due"){
      const periodId=text(settlementState?.period?.id,100);
      if(!periodId)return json({ok:false,error:"performance_period_not_found"},404);
      const prepared=await admin.rpc("performance_prepare_settlement_internal",{p_period_id:periodId});
      if(prepared.error)throw prepared.error;
      return json({ok:true,prepared:prepared.data});
    }

    if(action==="create_paypal_order"){
      if(!providers.paypal)return json({ok:false,error:"paypal_not_configured"},409);
      const attemptQ=await admin.rpc("performance_create_payment_attempt_internal",{p_user_id:uid,p_provider:"paypal"});
      if(attemptQ.error)throw attemptQ.error;
      const attempt=attemptQ.data as any;
      const amount=money(attempt.amountUsd);
      if(!(amount>0&&amount<=99))throw new Error("performance_amount_invalid");

      const made=await paypal("/v2/checkout/orders",{
        method:"POST",
        headers:{"PayPal-Request-Id":`ln-perf-${attempt.attemptId}`},
        body:JSON.stringify({
          intent:"CAPTURE",
          purchase_units:[{
            reference_id:String(attempt.settlementId),
            custom_id:String(attempt.settlementId),
            invoice_id:`LN-PERF-${String(attempt.periodId)}`,
            description:"LabNarrative Performance monthly settlement",
            amount:{currency_code:"USD",value:amount.toFixed(2)},
          }],
          application_context:{
            brand_name:"LabNarrative Trading",
            shipping_preference:"NO_SHIPPING",
            user_action:"PAY_NOW",
          },
        }),
      });
      const orderId=text(made.p.id,300);
      if(!made.r.ok||!orderId){
        await admin.rpc("performance_update_payment_attempt_internal",{
          p_user_id:uid,p_attempt_id:attempt.attemptId,p_status:"failed",
          p_provider_payload:made.p,p_error_message:text(made.p.message,1000)||"paypal_order_create_failed",
        });
        return json({ok:false,error:text(made.p.message,1000)||"paypal_order_create_failed"},502);
      }
      const updated=await admin.rpc("performance_update_payment_attempt_internal",{
        p_user_id:uid,p_attempt_id:attempt.attemptId,p_status:"pending",
        p_external_id:orderId,p_checkout_url:paypalApprove(made.p),p_provider_payload:made.p,p_error_message:null,
      });
      if(updated.error)throw updated.error;
      return json({ok:true,provider:"paypal",attemptId:attempt.attemptId,settlementId:attempt.settlementId,orderId,approvalUrl:paypalApprove(made.p),amountUsd:amount});
    }

    if(action==="capture_paypal"){
      const attemptId=text(body.attemptId,100),orderId=text(body.orderId,300);
      if(!attemptId||!orderId)return json({ok:false,error:"paypal_attempt_and_order_required"},400);
      const attemptQ=await admin.rpc("performance_payment_attempt_internal",{p_user_id:uid,p_attempt_id:attemptId});
      if(attemptQ.error)throw attemptQ.error;
      const attempt=attemptQ.data as any;
      if(attempt.provider!=="paypal")return json({ok:false,error:"paypal_attempt_required"},409);
      if(attempt.settlementStatus==="paid")return json({ok:true,paid:true,alreadyPaid:true,settlementId:attempt.settlementId});
      if(String(attempt.externalId||"")!==orderId)return json({ok:false,error:"paypal_order_mismatch"},409);

      const captured=await paypal(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`,{
        method:"POST",
        headers:{"PayPal-Request-Id":`ln-perf-cap-${attemptId}`},
        body:"{}",
      });
      const capture=paypalCapture(captured.p);
      const captureId=text(capture.id,300);
      const status=text(capture.status,60)||text(captured.p.status,60);
      const amountObj=obj(capture.amount);
      const paidAmount=money(amountObj.value),currency=text(amountObj.currency_code,10).toUpperCase();

      if(!captured.r.ok||status!=="COMPLETED"||!captureId||currency!=="USD"||!near(paidAmount,money(attempt.amountUsd))){
        await admin.rpc("performance_update_payment_attempt_internal",{
          p_user_id:uid,p_attempt_id:attemptId,p_status:"failed",
          p_provider_payload:captured.p,p_error_message:text(captured.p.message,1000)||`paypal_capture_${status||"failed"}`,
        });
        return json({ok:false,error:"paypal_payment_not_completed"},409);
      }

      const attemptUpdate=await admin.rpc("performance_update_payment_attempt_internal",{
        p_user_id:uid,p_attempt_id:attemptId,p_status:"paid",
        p_external_id:captureId,p_provider_payload:{orderId,capture:captured.p},p_error_message:null,
      });
      if(attemptUpdate.error)throw attemptUpdate.error;
      const paidQ=await admin.rpc("performance_mark_settlement_paid_internal",{
        p_settlement_id:attempt.settlementId,p_provider:"paypal",p_external_id:captureId,p_provider_payload:{orderId,capture:captured.p},
      });
      if(paidQ.error)throw paidQ.error;
      return json({ok:true,paid:true,provider:"paypal",captureId,settlement:paidQ.data,resumeRequired:true});
    }

    if(action==="create_crypto_invoice"){
      if(!providers.nowpayments)return json({ok:false,error:"nowpayments_not_configured"},409);
      const attemptQ=await admin.rpc("performance_create_payment_attempt_internal",{p_user_id:uid,p_provider:"nowpayments"});
      if(attemptQ.error)throw attemptQ.error;
      const attempt=attemptQ.data as any;
      const amount=money(attempt.amountUsd);
      if(!(amount>0&&amount<=99))throw new Error("performance_amount_invalid");

      const orderId=`lnperf:${attempt.settlementId}:${attempt.attemptId}`;
      const callback=`${base.replace(/\/$/,"")}/functions/v1/performance-nowpayments-ipn`;
      const invoice=await nowInvoice({
        price_amount:amount,
        price_currency:"usd",
        order_id:orderId,
        order_description:"LabNarrative Performance monthly settlement",
        ipn_callback_url:callback,
        success_url:"https://app.labnarrative.com/pricing?performance=payment-return",
        cancel_url:"https://app.labnarrative.com/pricing?performance=payment-cancelled",
      });
      const invoiceId=text(invoice.id,300)||text(invoice.invoice_id,300);
      const invoiceUrl=text(invoice.invoice_url,4000)||text(invoice.url,4000);
      if(!invoiceId||!invoiceUrl){
        await admin.rpc("performance_update_payment_attempt_internal",{
          p_user_id:uid,p_attempt_id:attempt.attemptId,p_status:"failed",
          p_provider_payload:invoice,p_error_message:"nowpayments_invoice_invalid",
        });
        return json({ok:false,error:"nowpayments_invoice_invalid"},502);
      }
      const updated=await admin.rpc("performance_update_payment_attempt_internal",{
        p_user_id:uid,p_attempt_id:attempt.attemptId,p_status:"pending",
        p_external_id:invoiceId,p_checkout_url:invoiceUrl,p_provider_payload:{...invoice,order_id:orderId},p_error_message:null,
      });
      if(updated.error)throw updated.error;
      return json({ok:true,provider:"nowpayments",attemptId:attempt.attemptId,settlementId:attempt.settlementId,invoiceId,invoiceUrl,amountUsd:amount});
    }

    return json({ok:false,error:"unsupported_action"},400);
  }catch(error){
    console.error("performance-settlement",error);
    const message=error instanceof Error?error.message:"performance_settlement_failed";
    return json({ok:false,error:message},500);
  }
});