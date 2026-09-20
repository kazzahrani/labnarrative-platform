import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
type Json = Record<string, unknown>;
type Connection = { id:string; provider:string; label?:string|null; status:string; is_testnet:boolean; account_type:string };
type Balance = { asset:string; available?:number; locked?:number; total?:number };
type ValuedAsset = Balance & { usdPrice:number|null; usdValue:number|null };

function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{...cors,"content-type":"application/json","cache-control":"no-store"}})}
function envKey(name:string){const raw=Deno.env.get(name);if(!raw)throw new Error(`missing_${name.toLowerCase()}`);try{const parsed=JSON.parse(raw);if(parsed?.default)return String(parsed.default)}catch{}return raw}
function n(v:unknown,fallback=0){const x=Number(v);return Number.isFinite(x)?x:fallback}
function clean(error:unknown){return error instanceof Error?error.message:String(error||"unknown_error")}
async function read(res:Response){const text=await res.text();try{return text?JSON.parse(text):{}}catch{return{message:text.slice(0,500)}}}
function compact(pair:string){return pair.replace("/","")}
function dashed(pair:string){return pair.replace("/","-")}
function addMonth(iso:string){const d=new Date(iso);const day=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+1);const max=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(day,max));return d.toISOString()}

async function pairPrice(provider:string,pair:string){
  if(provider==="binance"){
    const r=await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${encodeURIComponent(compact(pair))}`,{signal:AbortSignal.timeout(7000)}),b=await read(r),p=n(b?.price);
    if(r.ok&&p>0)return p;
  }
  if(provider==="bybit"){
    const r=await fetch(`https://api.bybit.com/v5/market/tickers?category=spot&symbol=${encodeURIComponent(compact(pair))}`,{signal:AbortSignal.timeout(7000)}),b=await read(r),p=n(b?.result?.list?.[0]?.lastPrice);
    if(r.ok&&b?.retCode===0&&p>0)return p;
  }
  if(provider==="okx"){
    const r=await fetch(`https://www.okx.com/api/v5/market/ticker?instId=${encodeURIComponent(dashed(pair))}`,{signal:AbortSignal.timeout(7000)}),b=await read(r),p=n(b?.data?.[0]?.last);
    if(r.ok&&b?.code==="0"&&p>0)return p;
  }
  if(provider==="kucoin"){
    const r=await fetch(`https://api.kucoin.com/api/v1/market/orderbook/level1?symbol=${encodeURIComponent(dashed(pair))}`,{signal:AbortSignal.timeout(7000)}),b=await read(r),p=n(b?.data?.price);
    if(r.ok&&b?.code==="200000"&&p>0)return p;
  }
  if(provider==="kraken"){
    const [base,quote]=pair.split("/"),kb=base==="BTC"?"XBT":base;
    const r=await fetch(`https://api.kraken.com/0/public/Ticker?pair=${encodeURIComponent(`${kb}${quote}`)}`,{signal:AbortSignal.timeout(7000)}),b=await read(r);
    const first=b?.result&&typeof b.result==="object"?Object.values(b.result)[0] as any:null,p=n(first?.c?.[0]);
    if(r.ok&&(!Array.isArray(b?.error)||b.error.length===0)&&p>0)return p;
  }
  if(provider!=="binance"){
    try{
      const r=await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${encodeURIComponent(compact(pair))}`,{signal:AbortSignal.timeout(5000)}),b=await read(r),p=n(b?.price);
      if(r.ok&&p>0)return p;
    }catch{}
  }
  throw new Error(`price_unavailable:${provider}:${pair}`);
}

async function assetPrice(provider:string,asset:string){
  const upper=asset.toUpperCase();
  if(upper==="USDT"||upper==="USD"||upper==="USDC")return 1;
  return pairPrice(provider,`${upper}/USDT`);
}

async function accountSnapshot(base:string,publishable:string,auth:string,connectionId:string){
  const r=await fetch(`${base}/functions/v1/exchange-account-read`,{
    method:"POST",
    headers:{apikey:publishable,Authorization:auth,"content-type":"application/json"},
    body:JSON.stringify({connectionId}),
    signal:AbortSignal.timeout(30000),
  });
  const b=await read(r);
  if(!r.ok||b?.ok!==true)throw new Error(String(b?.message||b?.error||"account_read_failed"));
  return b?.snapshot||{};
}

async function eligibility(db:any,base:string,publishable:string,auth:string,userId:string,minimum:number){
  const q=await db.from("exchange_connections")
    .select("id,provider,label,status,is_testnet,account_type")
    .eq("user_id",userId)
    .eq("status","connected")
    .eq("is_testnet",false)
    .eq("account_type","spot");
  if(q.error)throw q.error;
  const connections=(q.data||[]) as Connection[];

  const checks=await Promise.all(connections.map(async(connection)=>{
    try{
      const snapshot=await accountSnapshot(base,publishable,auth,connection.id);
      const balances=Array.isArray(snapshot?.balances)?snapshot.balances as Balance[]:[];
      const valued=await Promise.all(balances.map(async(row)=>{
        const asset=String(row.asset||"").toUpperCase(),total=n(row.total);
        if(!asset||!(total>0))return null;
        try{
          const price=await assetPrice(connection.provider,asset),value=total*price;
          return {ok:true,row:{...row,asset,total,usdPrice:price,usdValue:value} as ValuedAsset};
        }catch{
          return {ok:false,row:{...row,asset,total,usdPrice:null,usdValue:null} as ValuedAsset};
        }
      }));
      const rows=valued.filter(Boolean) as Array<{ok:boolean;row:ValuedAsset}>;
      const providerTotal=rows.reduce((sum,item)=>sum+n(item.row.usdValue),0);
      return {
        ok:true,
        provider:{connectionId:connection.id,provider:connection.provider,label:connection.label||null,totalUsd:providerTotal,balances:rows.map(item=>item.row)},
        unpriced:rows.filter(item=>!item.ok).map(item=>({connectionId:connection.id,provider:connection.provider,asset:item.row.asset,total:item.row.total})),
      };
    }catch(error){
      return {ok:false,error:{connectionId:connection.id,provider:connection.provider,error:clean(error)},unpriced:[]};
    }
  }));

  const providers=checks.filter((x:any)=>x.ok).map((x:any)=>x.provider);
  const errors=checks.filter((x:any)=>!x.ok).map((x:any)=>x.error);
  const unpriced=checks.flatMap((x:any)=>x.unpriced||[]);
  const totalUsd=providers.reduce((sum:number,row:any)=>sum+n(row.totalUsd),0);

  return {
    totalUsd,
    eligible:totalUsd+1e-8>=minimum,
    minimumSpotBalanceUsd:minimum,
    connectedSpotExchanges:connections.length,
    providers,
    errors,
    unpriced,
    incomplete:errors.length>0||unpriced.length>0,
    checkedAt:new Date().toISOString(),
  };
}

async function liveMarks(db:any,userId:string){
  const q=await db.from("trading_trades")
    .select("id,exchange_provider,pair,last_price,status,execution_mode")
    .eq("user_id",userId)
    .eq("execution_mode","live")
    .eq("status","active");
  if(q.error)throw q.error;
  const marks:any[]=[];
  for(const trade of q.data||[]){
    let price=0,source="live_quote";
    try{price=await pairPrice(String(trade.exchange_provider||""),String(trade.pair||""))}
    catch{price=n(trade.last_price);source="last_verifiable"}
    if(!(price>0))throw new Error(`trade_mark_unavailable:${trade.id}`);
    marks.push({tradeId:String(trade.id),markPrice:price,source});
  }
  return marks;
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return json({ok:false,error:"method_not_allowed"},405);
  try{
    const base=Deno.env.get("SUPABASE_URL")||"",publishable=envKey("SUPABASE_PUBLISHABLE_KEYS"),secret=envKey("SUPABASE_SECRET_KEYS"),auth=req.headers.get("Authorization")||"";
    if(!base||!auth.startsWith("Bearer "))return json({ok:false,error:"unauthorized"},401);
    const authRes=await fetch(`${base}/auth/v1/user`,{headers:{apikey:publishable,Authorization:auth}}),user=await read(authRes);
    if(!authRes.ok||!user?.id)return json({ok:false,error:"unauthorized"},401);
    const uid=String(user.id),db=createClient(base,secret,{auth:{persistSession:false,autoRefreshToken:false}}),body=await req.json().catch(()=>({})),action=String(body?.action||"status");

    const statusQ=await db.rpc("performance_status_internal",{p_user_id:uid});
    if(statusQ.error)throw statusQ.error;
    const state=(statusQ.data||{}) as any;
    const canaryQ=await db.rpc("performance_canary_allowed_internal",{p_user_id:uid});
    if(canaryQ.error)throw canaryQ.error;
    const canary=canaryQ.data===true;
    const canarySettingsQ=await db.rpc("performance_canary_settings_internal",{p_user_id:uid});
    if(canarySettingsQ.error)throw canarySettingsQ.error;
    const canarySettings=(canarySettingsQ.data||{}) as any;
    const configuredMinimum=n(state?.config?.minimumSpotBalanceUsd,2500);
    const canaryMinimum=n(canarySettings?.minimumSpotBalanceOverrideUsd,0);
    const minimum=canary&&canaryMinimum>0?canaryMinimum:configuredMinimum;
    const cap=n(state?.config?.monthlyChargeCapUsd,99);
    const performancePlanQ=await db.from("billing_plans").select("is_active").eq("plan_key","performance").maybeSingle();
    if(performancePlanQ.error)throw performancePlanQ.error;
    const publicPlanActive=performancePlanQ.data?.is_active===true;

    if(action==="status")return json({ok:true,canary,publicPlanActive,effectiveMinimumSpotBalanceUsd:minimum,configuredMinimumSpotBalanceUsd:configuredMinimum,...state});

    if(action==="preview_eligibility"){
      const check=await eligibility(db,base,publishable,auth,uid,minimum);
      return json({ok:true,canary,config:{minimumSpotBalanceUsd:minimum,configuredMinimumSpotBalanceUsd:configuredMinimum,monthlyChargeCapUsd:cap},eligibility:check});
    }

    if(action==="estimate"){
      const contextQ=await db.rpc("performance_current_estimate_context_internal",{p_user_id:uid});
      if(contextQ.error)throw contextQ.error;
      const context=(contextQ.data||{}) as any;
      if(!context?.period)return json({ok:true,active:false,netPnl:0,estimatedFee:0,period:null,trades:[]});
      const rows=Array.isArray(context.trades)?context.trades:[];
      let net=0;
      const contributions:any[]=[];
      for(const row of rows){
        const opening=n(row.openingCumulativePnl);
        let cumulative=0;
        let markPrice=n(row.closingMarkPrice);
        let markSource="crystallized";
        if(row.closingMarkedAt){
          cumulative=n(row.closingCumulativePnl);
        }else{
          markSource="live_quote";
          try{markPrice=await pairPrice(String(row.provider||""),String(row.pair||""))}
          catch{markPrice=n(row.lastPrice);markSource="last_verifiable"}
          if(!(markPrice>0))throw new Error(`trade_mark_unavailable:${row.tradeId}`);
          cumulative=n(row.realizedPnl)+n(row.quantity)*(markPrice-n(row.averagePrice,markPrice));
        }
        const contribution=cumulative-opening;
        net+=contribution;
        contributions.push({tradeId:row.tradeId,pair:row.pair,markPrice,markSource,contribution});
      }
      const periodCap=n(context?.period?.monthlyChargeCapUsd,cap);
      const estimatedFee=Math.round(Math.min(Math.max(net,0),periodCap)*100)/100;
      return json({ok:true,active:true,period:context.period,netPnl:net,estimatedFee,cap:periodCap,trades:contributions,checkedAt:new Date().toISOString()});
    }

    if(action==="enroll"){
      if(state?.config?.enabled!==true)return json({ok:false,error:"performance_not_enabled"},409);
      const planQ=await db.from("billing_plans").select("plan_key,is_active").eq("plan_key","performance").maybeSingle();
      if(planQ.error)throw planQ.error;
      if(!canary&&!planQ.data?.is_active)return json({ok:false,error:"performance_plan_not_active"},409);

      const existingQ=await db.from("user_subscriptions")
        .select("plan_key,status,current_period_end")
        .eq("user_id",uid).maybeSingle();
      if(existingQ.error)throw existingQ.error;
      const existing=existingQ.data;
      if(!canary&&existing?.plan_key==="performance"&&["active","paused","past_due"].includes(String(existing.status))){
        return json({ok:true,alreadyEnrolled:true,subscription:existing});
      }
      const paidStillActive=Boolean(existing&&existing.plan_key!=="free"&&["active","trialing","past_due"].includes(String(existing.status))&&existing.current_period_end&&Date.parse(String(existing.current_period_end))>Date.now());
      if(!canary&&paidStillActive)return json({ok:false,error:"existing_paid_access_active",accessEndsAt:existing.current_period_end},409);

      const check=await eligibility(db,base,publishable,auth,uid,minimum);
      if(!check.eligible)return json({ok:false,error:check.incomplete?"performance_eligibility_incomplete":"performance_minimum_balance_required",eligibility:check},409);

      const start=new Date().toISOString(),end=addMonth(start),marks=await liveMarks(db,uid);
      if(!canary){
        const subRow={
          user_id:uid,plan_key:"performance",billing_interval:"month",status:"active",provider:"performance",
          provider_customer_id:null,provider_subscription_id:null,current_period_start:start,current_period_end:end,
          cancel_at_period_end:false,canceled_at:null,updated_at:new Date().toISOString()
        };
        const subSave=await db.from("user_subscriptions").upsert(subRow,{onConflict:"user_id"});
        if(subSave.error)throw subSave.error;
      }

      const periodQ=await db.rpc("performance_start_period_api_internal",{
        p_user_id:uid,p_period_start:start,p_period_end:end,p_spot_balance_usd:check.totalUsd,
        p_eligibility_snapshot:{providers:check.providers.map((p:any)=>({connectionId:p.connectionId,provider:p.provider,totalUsd:p.totalUsd})),checkedAt:check.checkedAt},
        p_marks:marks,
      });
      if(periodQ.error)throw periodQ.error;
      return json({ok:true,enrolled:true,canary,period:periodQ.data,eligibility:check});
    }

    if(action==="resume"){
      if(state?.config?.enabled!==true)return json({ok:false,error:"performance_not_enabled"},409);
      const settlementQ=await db.rpc("performance_settlement_status_internal",{p_user_id:uid});
      if(settlementQ.error)throw settlementQ.error;
      const settlementState=(settlementQ.data||{}) as any;
      if(settlementState?.period?.status==="open")return json({ok:true,alreadyActive:true,period:settlementState.period});
      if(settlementState?.period&&settlementState.period.status!=="paid")return json({ok:false,error:"performance_previous_period_unsettled",period:settlementState.period,settlement:settlementState.settlement},409);

      const subQ=await db.from("user_subscriptions").select("plan_key,status").eq("user_id",uid).maybeSingle();
      if(subQ.error)throw subQ.error;
      if(!canary&&(!subQ.data||subQ.data.plan_key!=="performance"))return json({ok:false,error:"performance_subscription_required"},409);

      const check=await eligibility(db,base,publishable,auth,uid,minimum);
      if(!check.eligible)return json({ok:false,error:check.incomplete?"performance_eligibility_incomplete":"performance_minimum_balance_required",eligibility:check},409);

      const start=new Date().toISOString(),end=addMonth(start),marks=await liveMarks(db,uid);
      const periodQ=await db.rpc("performance_start_period_api_internal",{
        p_user_id:uid,p_period_start:start,p_period_end:end,p_spot_balance_usd:check.totalUsd,
        p_eligibility_snapshot:{providers:check.providers.map((p:any)=>({connectionId:p.connectionId,provider:p.provider,totalUsd:p.totalUsd})),checkedAt:check.checkedAt},
        p_marks:marks,
      });
      if(periodQ.error)throw periodQ.error;
      if(!canary){
        const subSave=await db.from("user_subscriptions").update({
          status:"active",current_period_start:start,current_period_end:end,cancel_at_period_end:false,canceled_at:null,updated_at:new Date().toISOString()
        }).eq("user_id",uid).eq("plan_key","performance");
        if(subSave.error)throw subSave.error;
      }
      return json({ok:true,resumed:true,canary,period:periodQ.data,eligibility:check});
    }

    if(action==="start_period"){
      if(state?.config?.enabled!==true)return json({ok:false,error:"performance_not_enabled"},409);
      const subQ=await db.from("user_subscriptions")
        .select("user_id,plan_key,status,billing_interval,current_period_start,current_period_end")
        .eq("user_id",uid)
        .eq("plan_key","performance")
        .in("status",["active","trialing"])
        .maybeSingle();
      if(subQ.error)throw subQ.error;
      const sub=subQ.data;
      if(!sub)return json({ok:false,error:"performance_subscription_required"},409);
      if(sub.billing_interval!=="month")return json({ok:false,error:"performance_monthly_cycle_required"},409);
      const start=String(sub.current_period_start||""),end=String(sub.current_period_end||"");
      if(!start||!end||!Number.isFinite(Date.parse(start))||!Number.isFinite(Date.parse(end))||Date.parse(end)<=Date.parse(start))return json({ok:false,error:"performance_subscription_period_invalid"},409);

      const check=await eligibility(db,base,publishable,auth,uid,minimum);
      if(!check.eligible)return json({ok:false,error:check.incomplete?"performance_eligibility_incomplete":"performance_minimum_balance_required",eligibility:check},409);

      const marks=await liveMarks(db,uid);
      const periodQ=await db.rpc("performance_start_period_api_internal",{
        p_user_id:uid,
        p_period_start:start,
        p_period_end:end,
        p_spot_balance_usd:check.totalUsd,
        p_eligibility_snapshot:{providers:check.providers.map((p:any)=>({connectionId:p.connectionId,provider:p.provider,totalUsd:p.totalUsd})),checkedAt:check.checkedAt},
        p_marks:marks,
      });
      if(periodQ.error)throw periodQ.error;
      return json({ok:true,period:periodQ.data,eligibility:check});
    }

    return json({ok:false,error:"unsupported_action"},400);
  }catch(error){
    console.error("performance-accounting",clean(error));
    return json({ok:false,error:"performance_accounting_failed",message:clean(error)},500);
  }
});
