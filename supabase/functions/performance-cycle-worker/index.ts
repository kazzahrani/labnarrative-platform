import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.4";

type Balance={asset:string;available:number;locked:number;total:number};
type J=Record<string,unknown>;
const enc=new TextEncoder();
const GATEWAY="https://labnarrative-trading-gateway.fly.dev";
let lastKrakenNonce=0n;

function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json","cache-control":"no-store"}})}
function envMap(name:string):Record<string,string>{try{return JSON.parse(Deno.env.get(name)||"{}") as Record<string,string>}catch{return{}}}
function serviceKey(){return envMap("SUPABASE_SECRET_KEYS").default||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}
function edgeSecret(...names:string[]){for(const name of names){const direct=Deno.env.get(name);if(direct)return direct;const mapped=envMap(name).default;if(mapped)return mapped}return""}
function gatewayToken(){const v=Deno.env.get("GATEWAY_TOKEN");if(!v)throw new Error("gateway_token_missing");return v}
function n(v:unknown,fallback=0){const x=Number(v);return Number.isFinite(x)?x:fallback}
function clean(rows:Balance[]){return rows.filter(x=>x.total>0||x.available>0||x.locked>0).sort((a,b)=>b.total-a.total).slice(0,300)}
async function read(res:Response){const t=await res.text();try{return t?JSON.parse(t):{}}catch{return{message:t.slice(0,500)}}}
async function hmac(secret:string,payload:string){const key=await crypto.subtle.importKey("raw",enc.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);return new Uint8Array(await crypto.subtle.sign("HMAC",key,enc.encode(payload)))}
function hex(bytes:Uint8Array){return Array.from(bytes).map(b=>b.toString(16).padStart(2,"0")).join("")}
function b64(bytes:Uint8Array){let s="";for(const b of bytes)s+=String.fromCharCode(b);return btoa(s)}
function fromB64(v:string){const bin=atob(v.replace(/\s+/g,""));return Uint8Array.from(bin,c=>c.charCodeAt(0))}
function concat(a:Uint8Array,b:Uint8Array){const out=new Uint8Array(a.length+b.length);out.set(a,0);out.set(b,a.length);return out}
function krakenNonce(){const now=BigInt(Date.now())*1_000_000n;lastKrakenNonce=now>lastKrakenNonce?now:lastKrakenNonce+1n;return lastKrakenNonce.toString()}
async function krakenSign(secret:string,path:string,nonce:string,postData:string){const sec=fromB64(secret);const digest=new Uint8Array(await crypto.subtle.digest("SHA-256",enc.encode(`${nonce}${postData}`)));const msg=concat(enc.encode(path),digest);const key=await crypto.subtle.importKey("raw",sec,{name:"HMAC",hash:"SHA-512"},false,["sign"]);return b64(new Uint8Array(await crypto.subtle.sign("HMAC",key,msg)))}
function exError(provider:string,body:any,status:number){return new Error(`${provider}:${String(body?.msg??body?.retMsg??body?.message??body?.data?.[0]?.sMsg??body?.code??`HTTP ${status}`).slice(0,300)}`)}
async function routedGet(provider:string,path:string,headers:Record<string,string>){return fetch(`${GATEWAY}/exchange-read/${provider}${path}`,{headers:{...headers,Authorization:`Bearer ${gatewayToken()}`},signal:AbortSignal.timeout(12000)})}

async function binance(apiKey:string,secret:string):Promise<Balance[]>{const q=`timestamp=${Date.now()}&recvWindow=5000`,sig=hex(await hmac(secret,q)),path=`/api/v3/account?${q}&signature=${sig}`,res=await routedGet("binance",path,{"X-MBX-APIKEY":apiKey}),body=await read(res);if(!res.ok||body?.code<0)throw exError("Binance",body,res.status);return clean((body?.balances||[]).map((x:any)=>{const available=n(x.free),locked=n(x.locked);return{asset:String(x.asset),available,locked,total:available+locked}}))}
async function bybitAttempt(apiKey:string,secret:string,accountType:string){const ts=String(Date.now()),recv="5000",q=`accountType=${accountType}`,sig=hex(await hmac(secret,`${ts}${apiKey}${recv}${q}`)),path=`/v5/account/wallet-balance?${q}`,res=await routedGet("bybit",path,{"X-BAPI-API-KEY":apiKey,"X-BAPI-TIMESTAMP":ts,"X-BAPI-RECV-WINDOW":recv,"X-BAPI-SIGN":sig});return{res,body:await read(res)}}
async function bybit(apiKey:string,secret:string):Promise<Balance[]>{let last:any=null;for(const type of ["UNIFIED","SPOT"]){const a=await bybitAttempt(apiKey,secret,type);last=a;if(a.res.ok&&a.body?.retCode===0){const coins=a.body?.result?.list?.[0]?.coin||[];return clean(coins.map((x:any)=>{const total=n(x.walletBalance),locked=n(x.locked),available=Math.max(0,total-locked);return{asset:String(x.coin),available,locked,total}}))}}throw exError("Bybit",last?.body||{},last?.res?.status||400)}
async function okx(apiKey:string,secret:string,passphrase:string):Promise<Balance[]>{const ts=new Date().toISOString(),path="/api/v5/account/balance",sig=b64(await hmac(secret,`${ts}GET${path}`)),res=await routedGet("okx",path,{"OK-ACCESS-KEY":apiKey,"OK-ACCESS-SIGN":sig,"OK-ACCESS-TIMESTAMP":ts,"OK-ACCESS-PASSPHRASE":passphrase}),body=await read(res);if(!res.ok||body?.code!=="0")throw exError("OKX",body,res.status);return clean((body?.data?.[0]?.details||[]).map((x:any)=>{const available=Math.max(0,n(x.availBal)),locked=Math.max(0,n(x.frozenBal)),total=Math.max(0,n(x.cashBal)||available+locked);return{asset:String(x.ccy),available,locked,total}}))}
async function kucoinAttempt(apiKey:string,secret:string,passphrase:string,version:"3"|"2"){const path="/api/v1/accounts?type=trade",ts=String(Date.now()),sig=b64(await hmac(secret,`${ts}GET${path}`)),signedPass=b64(await hmac(secret,passphrase)),res=await routedGet("kucoin",path,{"KC-API-KEY":apiKey,"KC-API-SIGN":sig,"KC-API-TIMESTAMP":ts,"KC-API-PASSPHRASE":signedPass,"KC-API-KEY-VERSION":version});return{res,body:await read(res)}}
async function kucoin(apiKey:string,secret:string,passphrase:string):Promise<Balance[]>{let last:any=null;for(const version of ["3","2"] as const){const a=await kucoinAttempt(apiKey,secret,passphrase,version);last=a;if(a.res.ok&&a.body?.code==="200000")return clean((a.body?.data||[]).map((x:any)=>{const available=Math.max(0,n(x.available)),locked=Math.max(0,n(x.holds)),total=Math.max(0,n(x.balance)||available+locked);return{asset:String(x.currency),available,locked,total}}))}throw exError("KuCoin",last?.body||{},last?.res?.status||400)}
function normalizeKrakenAsset(raw:string){let asset=String(raw||"").toUpperCase().replace(/\.(B|F|M|S|T)$/i,"");if(asset==="XXBT"||asset==="XBT")return"BTC";if(asset==="XETH")return"ETH";if(/^Z[A-Z]{3}$/.test(asset)||/^X[A-Z]{3}$/.test(asset))asset=asset.slice(1);return asset}
async function kraken(apiKey:string,secret:string):Promise<Balance[]>{const path="/0/private/BalanceEx",nonce=krakenNonce(),post=new URLSearchParams({nonce}).toString(),sig=await krakenSign(secret,path,nonce,post),res=await fetch(`https://api.kraken.com${path}`,{method:"POST",headers:{"API-Key":apiKey,"API-Sign":sig,"Content-Type":"application/x-www-form-urlencoded; charset=utf-8"},body:post,signal:AbortSignal.timeout(12000)}),body=await read(res),errors=Array.isArray(body?.error)?body.error.filter(Boolean):[];if(!res.ok||errors.length)throw new Error(`Kraken:${String(errors[0]||body?.message||res.status)}`);const grouped=new Map<string,Balance>();for(const[raw,value]of Object.entries(body?.result||{})){const row=value as any,asset=normalizeKrakenAsset(raw),balance=Math.max(0,n(row?.balance)),credit=Math.max(0,n(row?.credit)),used=Math.max(0,n(row?.credit_used)),hold=Math.max(0,n(row?.hold_trade)),total=Math.max(0,balance+credit-used),available=Math.max(0,total-hold),locked=Math.max(0,total-available),cur=grouped.get(asset)||{asset,available:0,locked:0,total:0};cur.available+=available;cur.locked+=locked;cur.total+=total;grouped.set(asset,cur)}return clean([...grouped.values()])}

function compact(pair:string){return pair.replace("/","")}
function dashed(pair:string){return pair.replace("/","-")}
async function pairPrice(provider:string,pair:string){
  if(provider==="binance"){const r=await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${encodeURIComponent(compact(pair))}`,{signal:AbortSignal.timeout(7000)}),b=await read(r),p=n(b?.price);if(r.ok&&p>0)return p}
  if(provider==="bybit"){const r=await fetch(`https://api.bybit.com/v5/market/tickers?category=spot&symbol=${encodeURIComponent(compact(pair))}`,{signal:AbortSignal.timeout(7000)}),b=await read(r),p=n(b?.result?.list?.[0]?.lastPrice);if(r.ok&&b?.retCode===0&&p>0)return p}
  if(provider==="okx"){const r=await fetch(`https://www.okx.com/api/v5/market/ticker?instId=${encodeURIComponent(dashed(pair))}`,{signal:AbortSignal.timeout(7000)}),b=await read(r),p=n(b?.data?.[0]?.last);if(r.ok&&b?.code==="0"&&p>0)return p}
  if(provider==="kucoin"){const r=await fetch(`https://api.kucoin.com/api/v1/market/orderbook/level1?symbol=${encodeURIComponent(dashed(pair))}`,{signal:AbortSignal.timeout(7000)}),b=await read(r),p=n(b?.data?.price);if(r.ok&&b?.code==="200000"&&p>0)return p}
  if(provider==="kraken"){const [base,quote]=pair.split("/"),kb=base==="BTC"?"XBT":base,r=await fetch(`https://api.kraken.com/0/public/Ticker?pair=${encodeURIComponent(`${kb}${quote}`)}`,{signal:AbortSignal.timeout(7000)}),b=await read(r),first=b?.result&&typeof b.result==="object"?Object.values(b.result)[0] as any:null,p=n(first?.c?.[0]);if(r.ok&&p>0)return p}
  if(provider!=="binance"){const r=await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${encodeURIComponent(compact(pair))}`,{signal:AbortSignal.timeout(5000)}),b=await read(r),p=n(b?.price);if(r.ok&&p>0)return p}
  throw new Error(`price_unavailable:${provider}:${pair}`);
}
async function assetPrice(provider:string,asset:string){const a=asset.toUpperCase();if(a==="USDT"||a==="USD"||a==="USDC")return 1;return pairPrice(provider,`${a}/USDT`)}

async function balancesFor(db:any,connection:any){
  const q=await db.rpc("get_exchange_connection_credentials",{p_connection_id:connection.id});
  if(q.error)throw q.error;
  const creds=Array.isArray(q.data)?q.data[0]:q.data;
  if(!creds)throw new Error("credentials_not_found");
  if(connection.provider==="binance")return binance(creds.api_key,creds.api_secret);
  if(connection.provider==="bybit")return bybit(creds.api_key,creds.api_secret);
  if(connection.provider==="okx")return okx(creds.api_key,creds.api_secret,creds.passphrase);
  if(connection.provider==="kucoin")return kucoin(creds.api_key,creds.api_secret,creds.passphrase);
  if(connection.provider==="kraken")return kraken(creds.api_key,creds.api_secret);
  throw new Error("unsupported_provider");
}
async function eligibility(db:any,userId:string,minimum:number){
  const q=await db.from("exchange_connections").select("id,provider,label,status,is_testnet,account_type").eq("user_id",userId).eq("status","connected").eq("is_testnet",false).eq("account_type","spot");
  if(q.error)throw q.error;
  let totalUsd=0;const providers:any[]=[],errors:any[]=[],unpriced:any[]=[];
  for(const connection of q.data||[]){
    try{
      const balances=await balancesFor(db,connection);let providerTotal=0;
      for(const row of balances){
        if(!(row.total>0))continue;
        try{const p=await assetPrice(connection.provider,row.asset),v=row.total*p;providerTotal+=v}
        catch{unpriced.push({connectionId:connection.id,provider:connection.provider,asset:row.asset,total:row.total})}
      }
      totalUsd+=providerTotal;providers.push({connectionId:connection.id,provider:connection.provider,totalUsd:providerTotal});
    }catch(error){errors.push({connectionId:connection.id,provider:connection.provider,error:error instanceof Error?error.message:String(error)})}
  }
  return{totalUsd,eligible:totalUsd+1e-8>=minimum,minimumSpotBalanceUsd:minimum,providers,errors,unpriced,incomplete:errors.length>0||(totalUsd<minimum&&unpriced.length>0),checkedAt:new Date().toISOString()};
}
async function marksForTrades(trades:any[]){
  const marks:any[]=[];
  for(const t of trades){
    let price=0,source="live_quote";
    try{price=await pairPrice(String(t.provider||t.exchange_provider||""),String(t.pair||""))}
    catch{price=n(t.lastPrice??t.last_price);source="last_verifiable"}
    if(!(price>0))throw new Error(`trade_mark_unavailable:${t.tradeId||t.id}`);
    marks.push({tradeId:String(t.tradeId||t.id),markPrice:price,source});
  }
  return marks;
}
function addMonth(iso:string){const d=new Date(iso);const day=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+1);const max=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(day,max));return d.toISOString()}

Deno.serve(async(req:Request)=>{
  if(req.method!=="POST")return json({ok:false,error:"method_not_allowed"},405);
  try{
    const base=Deno.env.get("SUPABASE_URL")||"",key=serviceKey();
    if(!base||!key)return json({ok:false,error:"server_configuration_missing"},500);
    const db=createClient(base,key,{auth:{persistSession:false,autoRefreshToken:false}});
    const expectedQ=await db.rpc("get_live_router_worker_key");
    if(expectedQ.error||!expectedQ.data)return json({ok:false,error:"worker_key_unavailable"},500);
    const supplied=req.headers.get("x-ln-worker-key")||"";
    if(!supplied||supplied!==String(expectedQ.data))return json({ok:false,error:"unauthorized"},401);
    const body=await req.json().catch(()=>({})) as J;
    const action=String(body?.action||"cycle");

    if(action==="canary_status"||action==="canary_start"){
      const userId=String(body?.userId||"").trim();
      if(!userId)return json({ok:false,error:"user_id_required"},400);
      const canaryQ=await db.rpc("performance_canary_allowed_internal",{p_user_id:userId});
      if(canaryQ.error)throw canaryQ.error;
      if(canaryQ.data!==true)return json({ok:false,error:"performance_canary_not_allowed"},403);

      const stateQ=await db.rpc("performance_status_internal",{p_user_id:userId});
      if(stateQ.error)throw stateQ.error;
      const state=(stateQ.data||{}) as any;
      const minimum=n(state?.config?.minimumSpotBalanceUsd,2500);
      const check=await eligibility(db,userId,minimum);
      const periodQ=await db.rpc("performance_settlement_status_internal",{p_user_id:userId});
      if(periodQ.error)throw periodQ.error;
      const providerState={
        paypal:Boolean(edgeSecret("PAYPAL_CLIENT_ID")&&edgeSecret("PAYPAL_CLIENT_SECRET")),
        nowpayments:Boolean(edgeSecret("NOWPAYMENTS_API_KEY","NOWPAYMENTS_KEY","NOWPAYMENTS_KEYS")),
      };

      if(action==="canary_status"){
        return json({ok:true,canary:true,enabled:state?.config?.enabled===true,providers:providerState,eligibility:check,...(periodQ.data||{})});
      }

      if(state?.config?.enabled!==true)return json({ok:false,error:"performance_not_enabled"},409);
      if(!check.eligible)return json({ok:false,error:check.incomplete?"performance_eligibility_incomplete":"performance_minimum_balance_required",eligibility:check},409);
      const existing=(periodQ.data||{}) as any;
      if(existing?.period?.status==="open")return json({ok:true,canary:true,alreadyActive:true,period:existing.period,eligibility:check,providers:providerState});

      const activeQ=await db.from("trading_trades").select("id,exchange_provider,pair,last_price").eq("user_id",userId).eq("execution_mode","live").eq("status","active");
      if(activeQ.error)throw activeQ.error;
      const active=(activeQ.data||[]).map((t:any)=>({tradeId:t.id,provider:t.exchange_provider,pair:t.pair,lastPrice:t.last_price}));
      const marks=await marksForTrades(active);
      const start=new Date().toISOString(),end=addMonth(start);
      const openedQ=await db.rpc("performance_start_period_api_internal",{
        p_user_id:userId,p_period_start:start,p_period_end:end,
        p_spot_balance_usd:check.totalUsd,
        p_eligibility_snapshot:{providers:check.providers,checkedAt:check.checkedAt,canary:true},
        p_marks:marks,
      });
      if(openedQ.error)throw openedQ.error;
      return json({ok:true,canary:true,started:true,period:openedQ.data,eligibility:check,providers:providerState,activeTradeMarks:marks.length});
    }

    const enabledQ=await db.rpc("performance_enabled_internal");
    if(enabledQ.error)throw enabledQ.error;
    if(enabledQ.data!==true)return json({ok:true,enabled:false,processed:0});

    const dueQ=await db.rpc("performance_due_periods_internal",{p_limit:10});
    if(dueQ.error)throw dueQ.error;
    const due=Array.isArray(dueQ.data)?dueQ.data:(dueQ.data||[]);
    const results:any[]=[];

    for(const period of due){
      try{
        const ctxQ=await db.rpc("performance_period_trade_context_internal",{p_period_id:period.periodId});
        if(ctxQ.error)throw ctxQ.error;
        const trades=Array.isArray(ctxQ.data)?ctxQ.data:(ctxQ.data||[]);
        const marks=await marksForTrades(trades);
        const finalQ=await db.rpc("performance_finalize_period_api_internal",{p_period_id:period.periodId,p_marks:marks});
        if(finalQ.error)throw finalQ.error;
        const preparedQ=await db.rpc("performance_prepare_settlement_internal",{p_period_id:period.periodId});
        if(preparedQ.error)throw preparedQ.error;
        const prepared=preparedQ.data as any;

        if(prepared?.noCharge===true){
          const configQ=await db.rpc("performance_status_internal",{p_user_id:period.userId});
          if(configQ.error)throw configQ.error;
          const minimum=n((configQ.data as any)?.config?.minimumSpotBalanceUsd,2500);
          const check=await eligibility(db,String(period.userId),minimum);
          if(check.eligible){
            const activeQ=await db.from("trading_trades").select("id,exchange_provider,pair,last_price").eq("user_id",period.userId).eq("execution_mode","live").eq("status","active");
            if(activeQ.error)throw activeQ.error;
            const active=(activeQ.data||[]).map((t:any)=>({tradeId:t.id,provider:t.exchange_provider,pair:t.pair,lastPrice:t.last_price}));
            const nextMarks=await marksForTrades(active);
            const start=String(period.periodEnd),end=addMonth(start);
            const openedQ=await db.rpc("performance_start_period_api_internal",{
              p_user_id:period.userId,p_period_start:start,p_period_end:end,
              p_spot_balance_usd:check.totalUsd,
              p_eligibility_snapshot:{providers:check.providers,checkedAt:check.checkedAt},
              p_marks:nextMarks,
            });
            if(openedQ.error)throw openedQ.error;
            const subQ=await db.from("user_subscriptions").update({
              status:"active",current_period_start:start,current_period_end:end,updated_at:new Date().toISOString()
            }).eq("user_id",period.userId).eq("plan_key","performance");
            if(subQ.error)throw subQ.error;
            results.push({periodId:period.periodId,outcome:"no_charge_rolled",nextPeriod:openedQ.data});
          }else{
            await db.from("user_subscriptions").update({status:"paused",updated_at:new Date().toISOString()}).eq("user_id",period.userId).eq("plan_key","performance");
            results.push({periodId:period.periodId,outcome:"no_charge_paused_ineligible",eligibility:check});
          }
        }else{
          results.push({periodId:period.periodId,outcome:"payment_due",settlement:prepared});
        }
      }catch(error){
        results.push({periodId:period.periodId,outcome:"error",error:error instanceof Error?error.message:String(error)});
      }
    }
    return json({ok:true,enabled:true,processed:results.length,results});
  }catch(error){
    console.error("performance-cycle-worker",error);
    return json({ok:false,error:"performance_cycle_worker_failed",message:error instanceof Error?error.message:String(error)},500);
  }
});