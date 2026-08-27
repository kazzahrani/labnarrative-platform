import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const EXPECTED_GATEWAY_ORIGIN="https://trader-gateway.labnarrative.com";
type Json = Record<string, unknown>;
type Db = ReturnType<typeof createClient>;
type Bot = { id:string; account_id:string; pair:string; pairs:string[]; all_pairs:boolean; tradingview_token:string; tradingview_enabled:boolean };
type EventRow = { id:string; status:string; error:string|null; payload:Json };
type Creds = { apiKey:string; apiSecret:string };
let cachedSigningKey:CryptoKey|null=null;

function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json","cache-control":"no-store"}})}
function n(value:unknown,fallback=0){const parsed=Number(value);return Number.isFinite(parsed)?parsed:fallback}
function clean(error:unknown){return error instanceof Error?error.message:String(error||"unknown_error")}
function cleanPair(value:unknown){let raw=String(value||"").trim().toUpperCase();if(raw.includes(":"))raw=raw.split(":").at(-1)||raw;raw=raw.replace(/[^A-Z0-9]/g,"");if(!raw.endsWith("USDT")||raw.length<=4)return"";const base=raw.slice(0,-4);return /^[A-Z0-9]{1,20}$/.test(base)?`${base}/USDT`:""}
function pairAllowed(bot:Bot,pair:string){if(bot.all_pairs)return true;const allowed=(bot.pairs?.length?bot.pairs:[bot.pair]).map(cleanPair);return allowed.includes(pair)}
function sleep(ms:number){return new Promise(resolve=>setTimeout(resolve,ms))}
function nonce(){const bytes=new Uint8Array(24);crypto.getRandomValues(bytes);return Array.from(bytes).map(x=>x.toString(16).padStart(2,"0")).join("")}
function pemBytes(pem:string){const base64=pem.replace(/-----BEGIN [^-]+-----/g,"").replace(/-----END [^-]+-----/g,"").replace(/\s+/g,"");const binary=atob(base64),bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);return bytes}
function b64(buffer:ArrayBuffer){const bytes=new Uint8Array(buffer);let raw="";for(const byte of bytes)raw+=String.fromCharCode(byte);return btoa(raw)}
async function hmac(secret:string,message:string){const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);const sig=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(message));return Array.from(new Uint8Array(sig)).map(x=>x.toString(16).padStart(2,"0")).join("")}

async function gatewayOrigin(db:Db){const{data,error}=await db.from("trader_gateway_config").select("base_url,status").eq("name","binance").single();if(error||!data)throw new Error("gateway_not_configured");if(data.status!=="ready"||!data.base_url)throw new Error("gateway_not_ready");const origin=new URL(String(data.base_url)).origin;if(origin!==EXPECTED_GATEWAY_ORIGIN)throw new Error("gateway_origin_not_allowed");return origin}
async function signingKey(db:Db){if(cachedSigningKey)return cachedSigningKey;const{data,error}=await db.rpc("trader_gateway_read_signing_private_key");if(error||!data)throw new Error("gateway_signing_key_not_configured");cachedSigningKey=await crypto.subtle.importKey("pkcs8",pemBytes(String(data)),{name:"ECDSA",namedCurve:"P-256"},false,["sign"]);return cachedSigningKey}
async function relay(db:Db,payload:Json){const origin=await gatewayOrigin(db),raw=JSON.stringify(payload),ts=Date.now(),nce=nonce(),key=await signingKey(db),sig=b64(await crypto.subtle.sign({name:"ECDSA",hash:"SHA-256"},key,new TextEncoder().encode(`${ts}\n${nce}\n${raw}`)));const response=await fetch(`${origin}/relay`,{method:"POST",headers:{"content-type":"application/json","x-ln-timestamp":String(ts),"x-ln-nonce":nce,"x-ln-signature":sig},body:raw,signal:AbortSignal.timeout(12_000)});const envelope=await response.json().catch(()=>({})) as Json;if(!response.ok)throw new Error(`gateway_${response.status}:${String(envelope.error||"relay_failed")}`);const status=n(envelope.upstreamStatus),bodyRaw=String(envelope.upstreamBody||"");let body:Json={};try{body=bodyRaw?JSON.parse(bodyRaw):{}}catch{throw new Error("binance_invalid_json")}if(status<200||status>=300)throw new Error(`binance_${String(body.code??status)}:${String(body.msg??"request_failed")}`);return body}
async function credentials(db:Db,accountId:string){const{data,error}=await db.rpc("trader_binance_read_secret",{p_account_id:accountId});if(error||!data)throw new Error("credential_not_found");const parsed=JSON.parse(String(data)) as {apiKey?:string;apiSecret?:string};if(!parsed.apiKey||!parsed.apiSecret)throw new Error("credential_not_found");return{apiKey:parsed.apiKey,apiSecret:parsed.apiSecret}}
async function signed(db:Db,creds:Creds,path:string,params:Record<string,string|number|boolean>={}){const time=await relay(db,{requestId:crypto.randomUUID(),method:"GET",path:"/api/v3/time",query:""});const query=new URLSearchParams();for(const[key,value]of Object.entries(params))query.set(key,String(value));query.set("timestamp",String(n(time.serverTime)));query.set("recvWindow","5000");query.set("signature",await hmac(creds.apiSecret,query.toString()));return await relay(db,{requestId:crypto.randomUUID(),method:"GET",path,query:query.toString(),apiKey:creds.apiKey})}
async function freeUsdt(db:Db,accountId:string){const creds=await credentials(db,accountId),info=await signed(db,creds,"/api/v3/account",{omitZeroBalances:true});const balances=Array.isArray(info.balances)?info.balances as Json[]:[];return Math.max(0,n(balances.find(row=>String(row.asset||"")==="USDT")?.free))}

async function waitForEvent(db:Db,eventId:string){
  const deadline=Date.now()+20_000;
  while(Date.now()<deadline){
    const{data,error}=await db.from("trader_tradingview_events").select("id,status,error,payload").eq("id",eventId).maybeSingle();
    if(error)throw error;
    if(data&&["processed","failed","ignored"].includes(String(data.status)))return data as EventRow;
    await sleep(300);
  }
  throw new Error("add_funds_execution_timeout");
}

async function existingEvent(db:Db,botId:string,dedupeKey:string){
  const{data,error}=await db.from("trader_tradingview_events").select("id,status,error,payload").eq("bot_id",botId).eq("dedupe_key",dedupeKey).maybeSingle();
  if(error)throw error;
  return data as EventRow|null;
}

async function liveExposure(db:Db,accountId:string){
  const[{data:trades,error:tradeError},{data:orders,error:orderError}]=await Promise.all([
    db.from("trader_trades").select("invested").eq("account_id",accountId).eq("status","Active").eq("execution_mode","live"),
    db.from("trader_orders").select("requested_quote").eq("account_id",accountId).eq("exchange","binance").eq("side","BUY").in("status",["OPEN","PENDING","NEW","PARTIALLY_FILLED"]),
  ]);
  if(tradeError)throw tradeError;if(orderError)throw orderError;
  return (trades??[]).reduce((sum,row)=>sum+n(row.invested),0)+(orders??[]).reduce((sum,row)=>sum+n(row.requested_quote),0);
}

async function forwardPart(baseUrl:string,payload:Json){
  const response=await fetch(`${baseUrl}/functions/v1/trader-tradingview-webhook`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload),signal:AbortSignal.timeout(10_000)});
  const body=await response.json().catch(()=>({})) as Json;
  if(!response.ok)throw new Error(String(body.error||`add_funds_upstream_${response.status}`));
  return body;
}

async function processSplit(db:Db,baseUrl:string,aggregateId:string,bot:Bot,pair:string,amount:number,signalId:string,maxOrder:number){
  const parts:Json[]=[];
  try{
    await db.from("trader_tradingview_events").update({status:"processing"}).eq("id",aggregateId);
    const count=Math.max(1,Math.ceil(amount/maxOrder));
    if(count>20)throw new Error("add_funds_too_many_execution_parts");
    const even=Number((amount/count).toFixed(8));
    let requested=0;
    for(let index=0;index<count;index+=1){
      const partAmount=index===count-1?Number((amount-requested).toFixed(8)):even;
      requested=Number((requested+partAmount).toFixed(8));
      if(!(partAmount>0)||partAmount>maxOrder+1e-8)throw new Error("add_funds_split_invalid");
      const partSignal=`${signalId||aggregateId}:part:${index+1}/${count}`;
      const dedupeKey=`add_funds|${pair}|${partSignal}`;
      const upstream=await forwardPart(baseUrl,{token:bot.tradingview_token,action:"ADD_FUNDS",pair,amount:partAmount,signal_id:partSignal});
      let event:EventRow|null=null;
      const eventId=String(upstream.eventId||"");
      if(eventId)event=await waitForEvent(db,eventId);
      else if(String(upstream.status||"")==="duplicate"){
        event=await existingEvent(db,bot.id,dedupeKey);
        if(event&&!["processed","failed","ignored"].includes(event.status))event=await waitForEvent(db,event.id);
      }
      if(!event)throw new Error("add_funds_part_event_missing");
      parts.push({index:index+1,amount:partAmount,status:event.status,error:event.error||undefined,result:event.payload?.result});
      if(event.status==="failed")throw new Error(event.error||"add_funds_part_failed");
      if(event.status==="ignored")throw new Error(String((event.payload?.result as Json|undefined)?.reason||"add_funds_part_ignored"));
    }
    await db.from("trader_tradingview_events").update({status:"processed",processed_at:new Date().toISOString(),payload:{split:true,requestedAmount:amount,executionParts:count,parts}}).eq("id",aggregateId);
  }catch(error){
    await db.from("trader_tradingview_events").update({status:"failed",processed_at:new Date().toISOString(),error:clean(error),payload:{split:true,requestedAmount:amount,completedParts:parts.length,parts}}).eq("id",aggregateId);
    console.error("trader-tradingview-add-funds",aggregateId,error);
  }
}

Deno.serve(async(req:Request)=>{
  if(req.method!=="POST")return json({error:"method_not_allowed"},405);
  const baseUrl=Deno.env.get("SUPABASE_URL"),serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!baseUrl||!serviceKey)return json({error:"server_configuration_missing"},500);
  const db=createClient(baseUrl,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  try{
    const raw=await req.json().catch(()=>({})) as Json;
    const token=String(raw.token||"").trim(),action=String(raw.action||"").trim().toLowerCase().replace(/\s+/g,"_");
    if(!token||action!=="add_funds")return json({error:"invalid_add_funds_message"},400);
    const amount=n(raw.amount);if(!(amount>0))return json({error:"invalid_add_funds_amount"},400);
    const{data:botData,error:botError}=await db.from("trader_bots").select("id,account_id,pair,pairs,all_pairs,tradingview_token,tradingview_enabled").eq("tradingview_token",token).eq("tradingview_enabled",true).eq("is_archived",false).maybeSingle();
    if(botError)throw botError;if(!botData)return json({error:"invalid_webhook_token"},401);const bot=botData as Bot;
    const pair=cleanPair(raw.pair||bot.pair);if(!pair||!pairAllowed(bot,pair))return json({error:"pair_not_allowed"},400);
    const{data:account,error:accountError}=await db.from("trader_accounts").select("id,account_kind,mode,status").eq("id",bot.account_id).eq("status","active").maybeSingle();
    if(accountError)throw accountError;if(!account)return json({error:"account_unavailable"},409);
    let maxOrder=amount;
    if(account.account_kind==="real"){
      const{data:controls,error:controlsError}=await db.from("trader_execution_controls").select("global_live_enabled,kill_switch,max_live_capital,max_single_order").eq("account_id",account.id).maybeSingle();
      if(controlsError)throw controlsError;if(!controls||controls.global_live_enabled!==true||controls.kill_switch===true||account.mode!=="live")return json({error:"live_trading_not_enabled"},409);
      maxOrder=n(controls.max_single_order);if(!(maxOrder>0))return json({error:"live_order_limit_missing"},409);
      const exposure=await liveExposure(db,account.id),liveCapital=n(controls.max_live_capital);
      if(exposure+amount>liveCapital+1e-9)return json({error:"live_capital_limit_exceeded"},409);
      const free=await freeUsdt(db,account.id);if(free+1e-8<amount)return json({error:"insufficient_usdt"},409);
    }
    const signalRaw=String(raw.signal_id||raw.signalId||"").trim(),signalId=signalRaw&&!signalRaw.includes("{{")?signalRaw.slice(0,140):"";
    const dedupeKey=signalId?`add_funds_split|${pair}|${signalId}`:null;
    const{data:event,error:eventError}=await db.from("trader_tradingview_events").insert({account_id:account.id,bot_id:bot.id,action:"add_funds",pair,amount,signal_id:signalId||null,dedupe_key:dedupeKey,status:"pending",payload:{split:true,requestedAmount:amount}}).select("id").single();
    if(eventError){if(String(eventError.code)==="23505")return json({ok:true,status:"duplicate"},200);throw eventError}if(!event)return json({error:"event_not_created"},500);
    EdgeRuntime.waitUntil(processSplit(db,baseUrl,event.id,bot,pair,amount,signalId,maxOrder));
    return json({ok:true,status:"accepted",eventId:event.id,executionParts:Math.max(1,Math.ceil(amount/maxOrder))},202);
  }catch(error){console.error("trader-tradingview-add-funds-ingress",error);return json({error:"add_funds_webhook_failed"},500)}
});
