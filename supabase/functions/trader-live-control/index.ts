import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "https://platform.labnarrative.com",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const EXPECTED_GATEWAY_ORIGIN = "https://trader-gateway.labnarrative.com";
const HARD_TEST_CAP_USDT = 20;
const ARM_TTL_MS = 10 * 60 * 1000;

type Db = ReturnType<typeof createClient>;
type RealAccount = { id:string; owner_user_id:string; account_kind:"real"; status:string; mode:"paper"|"shadow"|"live" };
type Connection = { status:string; environment:string; permission_read:boolean; permission_trade:boolean; permission_withdraw:boolean; permission_internal_transfer:boolean; ip_restricted:boolean|null; last_verified_at:string|null };
type Controls = { global_live_enabled:boolean; kill_switch:boolean; max_live_capital:number|string; max_single_order:number|string; max_concurrent_live_trades:number; daily_loss_limit:number|string; live_confirmed_at:string|null; live_generation:number|string };
type GatewayConfig = { base_url:string|null; status:string; egress_ip:string|null };

let cachedGatewaySigningKey: CryptoKey | null = null;
function json(body:unknown,status=200){ return new Response(JSON.stringify(body),{status,headers:{...cors,"content-type":"application/json","cache-control":"no-store"}}); }
function cleanError(error:unknown){ return error instanceof Error ? error.message : String(error||"unknown_error"); }
function n(value:unknown,fallback=0){ const v=Number(value); return Number.isFinite(v)?v:fallback; }
function pemBytes(pem:string){ const b64=pem.replace(/-----BEGIN [^-]+-----/g,"").replace(/-----END [^-]+-----/g,"").replace(/\s+/g,""); const binary=atob(b64),bytes=new Uint8Array(binary.length); for(let i=0;i<binary.length;i+=1)bytes[i]=binary.charCodeAt(i); return bytes; }
function base64Bytes(buffer:ArrayBuffer){ const bytes=new Uint8Array(buffer); let binary=""; for(const byte of bytes)binary+=String.fromCharCode(byte); return btoa(binary); }
function nonce(){ const bytes=new Uint8Array(24); crypto.getRandomValues(bytes); return Array.from(bytes).map(b=>b.toString(16).padStart(2,"0")).join(""); }
async function hmacHex(secret:string,message:string){ const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]); const sig=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(message)); return Array.from(new Uint8Array(sig)).map(b=>b.toString(16).padStart(2,"0")).join(""); }

async function ownerAccount(admin:Db,userId:string){ const {data,error}=await admin.from("trader_accounts").select("id,owner_user_id,account_kind,status,mode").eq("owner_user_id",userId).eq("account_kind","real").eq("status","active").single(); if(error||!data)throw new Error("real_account_required"); return data as RealAccount; }
async function connection(admin:Db,accountId:string){ const {data,error}=await admin.from("trader_binance_connections").select("status,environment,permission_read,permission_trade,permission_withdraw,permission_internal_transfer,ip_restricted,last_verified_at").eq("account_id",accountId).single(); if(error||!data)throw new Error("binance_not_connected"); return data as Connection; }
async function controls(admin:Db,accountId:string){ const {data,error}=await admin.from("trader_execution_controls").select("global_live_enabled,kill_switch,max_live_capital,max_single_order,max_concurrent_live_trades,daily_loss_limit,live_confirmed_at,live_generation").eq("account_id",accountId).single(); if(error||!data)throw new Error("execution_controls_missing"); return data as Controls; }
async function gatewayConfig(admin:Db){ const {data,error}=await admin.from("trader_gateway_config").select("base_url,status,egress_ip").eq("name","binance").single(); if(error||!data)throw new Error("gateway_not_configured"); return data as GatewayConfig; }
function gatewayOrigin(config:GatewayConfig){ if(!config.base_url||config.status!=="ready")throw new Error("gateway_not_ready"); const url=new URL(config.base_url); if(url.origin!==EXPECTED_GATEWAY_ORIGIN||url.pathname!=="/")throw new Error("gateway_origin_not_allowed"); return url.origin; }
async function gatewaySigningKey(admin:Db){ if(cachedGatewaySigningKey)return cachedGatewaySigningKey; const {data,error}=await admin.rpc("trader_gateway_read_signing_private_key"); if(error||!data)throw new Error("gateway_signing_key_not_configured"); cachedGatewaySigningKey=await crypto.subtle.importKey("pkcs8",pemBytes(String(data)),{name:"ECDSA",namedCurve:"P-256"},false,["sign"]); return cachedGatewaySigningKey; }
async function gatewaySignature(admin:Db,message:string){ const key=await gatewaySigningKey(admin); const signature=await crypto.subtle.sign({name:"ECDSA",hash:"SHA-256"},key,new TextEncoder().encode(message)); return base64Bytes(signature); }
async function relay(admin:Db,payload:Record<string,unknown>){ const origin=gatewayOrigin(await gatewayConfig(admin)); const raw=JSON.stringify(payload),ts=Date.now(),nce=nonce(),sig=await gatewaySignature(admin,`${ts}\n${nce}\n${raw}`); const response=await fetch(`${origin}/relay`,{method:"POST",headers:{"content-type":"application/json","x-ln-timestamp":String(ts),"x-ln-nonce":nce,"x-ln-signature":sig},body:raw,signal:AbortSignal.timeout(12000)}); const envelope=await response.json().catch(()=>({})) as Record<string,unknown>; if(!response.ok)throw new Error(`gateway_${response.status}:${String(envelope.error||"relay_failed")}`); const upstreamStatus=Number(envelope.upstreamStatus||0),rawBody=String(envelope.upstreamBody||""); let body:Record<string,unknown>|unknown[]={}; try{ body=rawBody?JSON.parse(rawBody):{}; }catch{ throw new Error("binance_invalid_json"); } if(upstreamStatus<200||upstreamStatus>=300){ const value=body as Record<string,unknown>; throw new Error(`binance_${String(value.code??upstreamStatus)}:${String(value.msg??"request_failed")}`); } return body; }
async function serverTime(admin:Db){ const payload=await relay(admin,{requestId:crypto.randomUUID(),method:"GET",path:"/api/v3/time",query:""}) as Record<string,unknown>; const t=n(payload.serverTime); if(t<=0)throw new Error("binance_time_invalid"); return t; }
async function signedBinance(admin:Db,method:"GET"|"POST"|"DELETE",path:string,apiKey:string,apiSecret:string,params:Record<string,string|number|boolean>={}){ const q=new URLSearchParams(); Object.entries(params).forEach(([k,v])=>q.set(k,String(v))); q.set("timestamp",String(await serverTime(admin))); q.set("recvWindow","5000"); q.set("signature",await hmacHex(apiSecret,q.toString())); return await relay(admin,{requestId:crypto.randomUUID(),method,path,query:q.toString(),apiKey}); }
async function storedCredentials(admin:Db,accountId:string){ const {data,error}=await admin.rpc("trader_binance_read_secret",{p_account_id:accountId}); if(error||!data)throw new Error("credential_not_found"); const value=JSON.parse(String(data)) as {apiKey?:string;apiSecret?:string}; if(!value.apiKey||!value.apiSecret)throw new Error("credential_not_found"); return {apiKey:value.apiKey,apiSecret:value.apiSecret}; }

function safeConnection(c:Connection){ if(c.status!=="connected"||c.environment!=="mainnet")throw new Error("binance_not_connected"); if(!c.permission_read||!c.permission_trade)throw new Error("binance_trade_permission_required"); if(c.permission_withdraw||c.permission_internal_transfer)throw new Error("binance_unsafe_permissions"); if(c.ip_restricted!==true)throw new Error("binance_ip_restriction_required"); }
function normalizePair(value:unknown){ const pair=String(value||"").toUpperCase().trim(); if(!/^[A-Z0-9]{2,12}\/USDT$/.test(pair)||pair==="USDT/USDT")throw new Error("live_test_pair_must_be_usdt_spot"); return pair; }
function quoteAmount(value:unknown){ const amount=Number(value); if(!Number.isFinite(amount)||amount<5||amount>HARD_TEST_CAP_USDT)throw new Error("live_test_amount_must_be_5_to_20_usdt"); return Math.round(amount*100)/100; }
function clientOrderId(){ return `LNT${Date.now().toString(36)}${crypto.randomUUID().replace(/-/g,"").slice(0,12)}`.slice(0,36); }
async function availableUsdt(admin:Db,accountId:string){ const creds=await storedCredentials(admin,accountId); const info=await signedBinance(admin,"GET","/api/v3/account",creds.apiKey,creds.apiSecret,{omitZeroBalances:true}) as Record<string,unknown>; const balances=Array.isArray(info.balances)?info.balances as Record<string,unknown>[]:[]; const usdt=balances.find(row=>String(row.asset||"")==="USDT"); return {free:n(usdt?.free),creds}; }
async function validateOrder(admin:Db,account:RealAccount,pair:string,amount:number){ const {free,creds}=await availableUsdt(admin,account.id); if(free+1e-8<amount)throw new Error(`insufficient_usdt_for_live_test:${free.toFixed(8)}`); const symbol=pair.replace("/",""); const testClient=clientOrderId(); await signedBinance(admin,"POST","/api/v3/order/test",creds.apiKey,creds.apiSecret,{symbol,side:"BUY",type:"MARKET",quoteOrderQty:amount,newClientOrderId:testClient,newOrderRespType:"FULL"}); return {freeUsdt:free,symbol,creds}; }
async function event(admin:Db,accountId:string,eventType:string,pair:string|null,clientId:string|null,payload:Record<string,unknown>){ await admin.from("trader_broker_events").insert({account_id:accountId,mode:"live",event_type:eventType,pair,client_order_id:clientId,payload}); }
async function persistOrder(admin:Db,accountId:string,pair:string,amount:number,clientId:string,response:Record<string,unknown>){ const executedQty=n(response.executedQty),filledQuote=n(response.cummulativeQuoteQty),status=String(response.status||"UNKNOWN"),orderId=String(response.orderId||"")||null,avg=executedQty>0?filledQuote/executedQty:null,now=new Date().toISOString(); const {data:order,error}=await admin.from("trader_orders").upsert({account_id:accountId,bot_id:null,trade_id:null,client_order_id:clientId,pair,kind:"LiveTest",side:"BUY",order_type:"MARKET",status,sequence_no:null,price:null,requested_quote:amount,requested_qty:0,reserved_quote:0,filled_qty:executedQty,filled_quote:filledQuote,average_fill_price:avg,exchange:"binance",exchange_order_id:orderId,metadata:{source:"live_test_v1"},opened_at:now,filled_at:status==="FILLED"?now:null,updated_at:now},{onConflict:"account_id,client_order_id"}).select("id").single(); if(error||!order)throw error||new Error("live_order_ledger_failed"); const fills=Array.isArray(response.fills)?response.fills as Record<string,unknown>[]:[]; if(fills.length){ const rows=fills.map(fill=>{ const price=n(fill.price),qty=n(fill.qty); return {account_id:accountId,bot_id:null,trade_id:null,order_id:order.id,pair,side:"BUY",kind:"LiveTest",price,quantity:qty,quote_amount:price*qty,fee_asset:String(fill.commissionAsset||"")||null,fee_amount:n(fill.commission),exchange_trade_id:String(fill.tradeId||"")||null,filled_at:now,metadata:{source:"binance_full_response"}}; }); const {error:fillError}=await admin.from("trader_fills").insert(rows); if(fillError)throw fillError; }
 return {ledgerOrderId:order.id,status,exchangeOrderId:orderId,executedQty,filledQuote,averageFillPrice:avg}; }
async function reconcileByClientId(admin:Db,creds:{apiKey:string;apiSecret:string},symbol:string,clientId:string){ return await signedBinance(admin,"GET","/api/v3/order",creds.apiKey,creds.apiSecret,{symbol,origClientOrderId:clientId}) as Record<string,unknown>; }

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response(null,{headers:cors});
  if(req.method!=="POST")return json({error:"method_not_allowed"},405);
  const supabaseUrl=Deno.env.get("SUPABASE_URL"),serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"); if(!supabaseUrl||!serviceKey)return json({error:"server_configuration_missing"},500);
  const admin=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"").trim(); if(!token)return json({error:"unauthorized"},401);
  const {data:userData,error:userError}=await admin.auth.getUser(token),user=userData.user; if(userError||!user)return json({error:"unauthorized"},401);
  try{
    const account=await ownerAccount(admin,user.id),conn=await connection(admin,account.id),ctl=await controls(admin,account.id); safeConnection(conn);
    const body=await req.json().catch(()=>({})) as Record<string,unknown>,action=String(body.action||"status");
    if(action==="status")return json({ok:true,hardCapUsdt:HARD_TEST_CAP_USDT,account:{mode:account.mode},controls:{globalLiveEnabled:ctl.global_live_enabled,killSwitch:ctl.kill_switch,maxLiveCapital:n(ctl.max_live_capital),maxSingleOrder:n(ctl.max_single_order),liveConfirmedAt:ctl.live_confirmed_at},connection:{status:conn.status,environment:conn.environment,ipRestricted:conn.ip_restricted}});
    if(action==="validate_test_buy"){
      const pair=normalizePair(body.pair),amount=quoteAmount(body.quoteAmount),validated=await validateOrder(admin,account,pair,amount);
      await event(admin,account.id,"live_test_validated",pair,null,{quoteAmount:amount,freeUsdt:validated.freeUsdt});
      return json({ok:true,validated:true,pair,quoteAmount:amount,freeUsdt:validated.freeUsdt,liveOrderSent:false});
    }
    if(action==="arm_test"){
      if(String(body.confirmation||"")!=="ARM LIVE TEST")throw new Error("live_test_confirmation_required");
      const amount=quoteAmount(body.maxSingleOrder),now=new Date().toISOString(),generation=n(ctl.live_generation)+1;
      const {error:controlError}=await admin.from("trader_execution_controls").update({global_live_enabled:true,kill_switch:false,max_live_capital:amount,max_single_order:amount,max_concurrent_live_trades:1,daily_loss_limit:amount,live_confirmed_at:now,live_generation:generation,updated_by:user.id,updated_at:now}).eq("account_id",account.id); if(controlError)throw controlError;
      const {error:accountError}=await admin.from("trader_accounts").update({mode:"live",updated_at:now}).eq("id",account.id); if(accountError){ await admin.from("trader_execution_controls").update({global_live_enabled:false,kill_switch:true,updated_by:user.id,updated_at:new Date().toISOString()}).eq("account_id",account.id); throw accountError; }
      await event(admin,account.id,"live_test_armed",null,null,{maxSingleOrder:amount,generation});
      return json({ok:true,armed:true,maxSingleOrder:amount,expiresInSeconds:ARM_TTL_MS/1000});
    }
    if(action==="disarm"){
      const now=new Date().toISOString(); await admin.from("trader_execution_controls").update({global_live_enabled:false,kill_switch:true,max_live_capital:0,max_single_order:0,live_confirmed_at:null,updated_by:user.id,updated_at:now}).eq("account_id",account.id); await admin.from("trader_accounts").update({mode:"shadow",updated_at:now}).eq("id",account.id); await event(admin,account.id,"live_test_disarmed",null,null,{}); return json({ok:true,armed:false});
    }
    if(action==="place_test_buy"){
      const pair=normalizePair(body.pair),amount=quoteAmount(body.quoteAmount),freshCtl=await controls(admin,account.id),expected=`BUY ${pair} ${amount.toFixed(2)} USDT`;
      if(account.mode!=="live"||freshCtl.global_live_enabled!==true||freshCtl.kill_switch!==false)throw new Error("live_test_not_armed");
      if(!freshCtl.live_confirmed_at||Date.now()-new Date(freshCtl.live_confirmed_at).getTime()>ARM_TTL_MS)throw new Error("live_test_arm_expired");
      if(amount>n(freshCtl.max_single_order)||amount>n(freshCtl.max_live_capital)||amount>HARD_TEST_CAP_USDT)throw new Error("live_test_limit_exceeded");
      if(String(body.confirmation||"")!==expected)throw new Error(`exact_confirmation_required:${expected}`);
      const validated=await validateOrder(admin,account,pair,amount),clientId=clientOrderId();
      await event(admin,account.id,"live_order_submit_started",pair,clientId,{side:"BUY",type:"MARKET",quoteAmount:amount});
      let orderResponse:Record<string,unknown>;
      try{
        orderResponse=await signedBinance(admin,"POST","/api/v3/order",validated.creds.apiKey,validated.creds.apiSecret,{symbol:validated.symbol,side:"BUY",type:"MARKET",quoteOrderQty:amount,newClientOrderId:clientId,newOrderRespType:"FULL"}) as Record<string,unknown>;
      }catch(submitError){
        await event(admin,account.id,"live_order_submit_error",pair,clientId,{error:cleanError(submitError)});
        try{ orderResponse=await reconcileByClientId(admin,validated.creds,validated.symbol,clientId); await event(admin,account.id,"live_order_reconciled_after_submit_error",pair,clientId,{status:String(orderResponse.status||"UNKNOWN")}); }
        catch(reconcileError){ throw new Error(`live_order_submission_uncertain:${cleanError(submitError)}:${cleanError(reconcileError)}`); }
      }
      const ledger=await persistOrder(admin,account.id,pair,amount,clientId,orderResponse);
      await event(admin,account.id,"live_order_reconciled",pair,clientId,{status:ledger.status,exchangeOrderId:ledger.exchangeOrderId,filledQuote:ledger.filledQuote,executedQty:ledger.executedQty});
      const now=new Date().toISOString(); await admin.from("trader_execution_controls").update({global_live_enabled:false,kill_switch:true,max_live_capital:0,max_single_order:0,live_confirmed_at:null,updated_by:user.id,updated_at:now}).eq("account_id",account.id); await admin.from("trader_accounts").update({mode:"shadow",updated_at:now}).eq("id",account.id);
      return json({ok:true,liveOrderSent:true,pair,quoteAmount:amount,clientOrderId:clientId,...ledger,safetyRestored:{mode:"shadow",globalLiveEnabled:false,killSwitch:true}});
    }
    return json({error:"unknown_action"},400);
  }catch(error){ return json({error:cleanError(error)},400); }
});
