import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "https://platform.labnarrative.com",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const EXPECTED_GATEWAY_ORIGIN = "https://trader-gateway.labnarrative.com";
const PUBLIC_PRICE_ENDPOINTS = [
  "https://data-api.binance.vision/api/v3/ticker/price",
  "https://api.binance.com/api/v3/ticker/price",
];

type Db = ReturnType<typeof createClient>;
type GatewayConfig = { name:string; base_url:string|null; status:string; egress_ip:string|null; last_health_at:string|null; last_error:string|null };
type Connection = {
  id:string; account_id:string; status:string; environment:string; api_key_fingerprint:string|null; api_key_last4:string|null;
  permission_read:boolean; permission_trade:boolean; permission_withdraw:boolean; permission_internal_transfer:boolean;
  ip_restricted:boolean|null; binance_uid_last4:string|null; last_verified_at:string|null; last_error:string|null;
};
type RealAccount = {id:string;owner_user_id:string;account_kind:"real";status:string;mode:"paper"|"shadow"|"live";starting_balance?:number|string};

let cachedGatewaySigningKey: CryptoKey | null = null;

function json(body:unknown,status=200){ return new Response(JSON.stringify(body),{status,headers:{...cors,"content-type":"application/json","cache-control":"no-store"}}); }
function cleanError(error:unknown){ if(error instanceof Error)return error.message; return String(error||"unknown_error"); }
function n(value:unknown,fallback=0){ const number=Number(value); return Number.isFinite(number)?number:fallback; }
function arr(value:unknown):unknown[]{ return Array.isArray(value)?value:[]; }
function obj(value:unknown):Record<string,unknown>{ return value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{}; }
async function hmacHex(secret:string,message:string){ const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]); const sig=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(message)); return Array.from(new Uint8Array(sig)).map(b=>b.toString(16).padStart(2,"0")).join(""); }
async function sha256(value:string){ const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value)); return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,"0")).join(""); }
function nonce(){ const bytes=new Uint8Array(24); crypto.getRandomValues(bytes); return Array.from(bytes).map(b=>b.toString(16).padStart(2,"0")).join(""); }
function pemBytes(pem:string){
  const base64=pem.replace(/-----BEGIN [^-]+-----/g,"").replace(/-----END [^-]+-----/g,"").replace(/\s+/g,"");
  const binary=atob(base64),bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i+=1)bytes[i]=binary.charCodeAt(i);
  return bytes;
}
function base64Bytes(buffer:ArrayBuffer){ const bytes=new Uint8Array(buffer); let binary=""; for(const byte of bytes)binary+=String.fromCharCode(byte); return btoa(binary); }

async function ownerRealAccount(admin:Db,userId:string){
  const {data,error}=await admin.from("trader_accounts")
    .select("id,owner_user_id,account_kind,status,mode,starting_balance")
    .eq("owner_user_id",userId)
    .eq("account_kind","real")
    .eq("status","active")
    .limit(1)
    .maybeSingle();
  if(error)throw error;
  if(!data)throw new Error("real_account_required");
  return data as RealAccount;
}
async function gatewayConfig(admin:Db){ const {data,error}=await admin.from("trader_gateway_config").select("name,base_url,status,egress_ip,last_health_at,last_error").eq("name","binance").single(); if(error)throw error; return data as GatewayConfig; }
function validatedGatewayOrigin(config:GatewayConfig,requireReady=true){
  if(!config.base_url)throw new Error("gateway_not_configured");
  if(requireReady&&config.status!=="ready")throw new Error("gateway_not_ready");
  const url=new URL(config.base_url);
  if(url.origin!==EXPECTED_GATEWAY_ORIGIN||url.pathname!=="/")throw new Error("gateway_origin_not_allowed");
  return url.origin;
}
async function gatewaySigningKey(admin:Db){
  if(cachedGatewaySigningKey)return cachedGatewaySigningKey;
  const {data,error}=await admin.rpc("trader_gateway_read_signing_private_key");
  if(error||!data)throw new Error("gateway_signing_key_not_configured");
  cachedGatewaySigningKey=await crypto.subtle.importKey("pkcs8",pemBytes(String(data)),{name:"ECDSA",namedCurve:"P-256"},false,["sign"]);
  return cachedGatewaySigningKey;
}
async function gatewaySignature(admin:Db,message:string){
  const key=await gatewaySigningKey(admin);
  const signature=await crypto.subtle.sign({name:"ECDSA",hash:"SHA-256"},key,new TextEncoder().encode(message));
  return base64Bytes(signature);
}
async function relay(admin:Db,payload:Record<string,unknown>){
  const config=await gatewayConfig(admin),origin=validatedGatewayOrigin(config,true);
  const raw=JSON.stringify(payload),timestamp=Date.now(),nce=nonce(),signature=await gatewaySignature(admin,`${timestamp}\n${nce}\n${raw}`);
  const response=await fetch(`${origin}/relay`,{method:"POST",headers:{"content-type":"application/json","x-ln-timestamp":String(timestamp),"x-ln-nonce":nce,"x-ln-signature":signature},body:raw,signal:AbortSignal.timeout(12_000)});
  const envelope=await response.json().catch(()=>({})) as Record<string,unknown>;
  if(!response.ok)throw new Error(`gateway_${response.status}:${String(envelope.error||"relay_failed")}`);
  const upstreamStatus=Number(envelope.upstreamStatus||0),upstreamBody=String(envelope.upstreamBody||"");
  let body:Record<string,unknown>|unknown[]={}; try{body=upstreamBody?JSON.parse(upstreamBody):{};}catch{throw new Error("binance_invalid_json");}
  if(upstreamStatus<200||upstreamStatus>=300){ const value=body as Record<string,unknown>; throw new Error(`binance_${String(value.code??upstreamStatus)}:${String(value.msg??"request_failed")}`); }
  return body;
}
async function serverTime(admin:Db){ const payload=await relay(admin,{requestId:crypto.randomUUID(),method:"GET",path:"/api/v3/time",query:""}) as Record<string,unknown>; const t=Number(payload.serverTime); if(!Number.isFinite(t)||t<=0)throw new Error("binance_time_invalid"); return t; }
async function signedBinance(admin:Db,method:"GET"|"POST"|"DELETE",path:string,apiKey:string,apiSecret:string,params:Record<string,string|number|boolean>={}){
  const q=new URLSearchParams(); Object.entries(params).forEach(([k,v])=>q.set(k,String(v))); q.set("timestamp",String(await serverTime(admin))); q.set("recvWindow","5000"); q.set("signature",await hmacHex(apiSecret,q.toString()));
  return await relay(admin,{requestId:crypto.randomUUID(),method,path,query:q.toString(),apiKey});
}
function checkedPermissions(raw:Record<string,unknown>){
  const read=raw.enableReading===true,trade=raw.enableSpotAndMarginTrading===true,withdraw=raw.enableWithdrawals===true,internal=raw.enableInternalTransfer===true||raw.permitsUniversalTransfer===true,ipRestricted=raw.ipRestrict===true;
  if(!read)throw new Error("binance_key_reading_disabled");
  if(!trade)throw new Error("binance_key_trading_disabled");
  const forbidden=["enableWithdrawals","enableInternalTransfer","permitsUniversalTransfer","enableFutures","enableVanillaOptions","enablePortfolioMarginTrading","enableFixApiTrade"].filter(k=>raw[k]===true);
  if(forbidden.length)throw new Error(`binance_key_unsafe_permissions:${forbidden.join(",")}`);
  if(!ipRestricted)throw new Error("binance_key_ip_restriction_required");
  return {read,trade,withdraw,internal,ipRestricted};
}
async function readConnection(admin:Db,accountId:string){ const {data,error}=await admin.from("trader_binance_connections").select("id,account_id,status,environment,api_key_fingerprint,api_key_last4,permission_read,permission_trade,permission_withdraw,permission_internal_transfer,ip_restricted,binance_uid_last4,last_verified_at,last_error").eq("account_id",accountId).maybeSingle(); if(error)throw error; return data as Connection|null; }
async function publicStatus(admin:Db,accountId:string){
  const [connection,controls,gateway]=await Promise.all([
    readConnection(admin,accountId),
    admin.from("trader_execution_controls").select("global_live_enabled,kill_switch,max_live_capital,max_single_order,max_concurrent_live_trades,daily_loss_limit,live_confirmed_at,live_generation").eq("account_id",accountId).single(),
    gatewayConfig(admin),
  ]);
  return {connection:connection?{status:connection.status,environment:connection.environment,apiKeyLast4:connection.api_key_last4,permissionRead:connection.permission_read,permissionTrade:connection.permission_trade,permissionWithdraw:connection.permission_withdraw,permissionInternalTransfer:connection.permission_internal_transfer,ipRestricted:connection.ip_restricted,binanceUidLast4:connection.binance_uid_last4,lastVerifiedAt:connection.last_verified_at,lastError:connection.last_error}:null,controls:controls.data,gateway:{status:gateway.status,baseUrl:gateway.base_url,egressIp:gateway.egress_ip,lastHealthAt:gateway.last_health_at,lastError:gateway.last_error}};
}
async function verifyAndPersist(admin:Db,userId:string,accountId:string,apiKey:string,apiSecret:string){
  const restrictions=await signedBinance(admin,"GET","/sapi/v1/account/apiRestrictions",apiKey,apiSecret) as Record<string,unknown>,p=checkedPermissions(restrictions);
  const accountInfo=await signedBinance(admin,"GET","/api/v3/account",apiKey,apiSecret,{omitZeroBalances:true}) as Record<string,unknown>;
  const fingerprint=(await sha256(apiKey)).slice(0,16),uid=accountInfo.uid?String(accountInfo.uid):"";
  const row={account_id:accountId,owner_user_id:userId,provider:"Binance",environment:"mainnet",status:"connected",api_key_fingerprint:fingerprint,api_key_last4:apiKey.slice(-4),permission_read:p.read,permission_trade:p.trade,permission_withdraw:p.withdraw,permission_internal_transfer:p.internal,ip_restricted:p.ipRestricted,binance_uid_last4:uid.slice(-4)||null,last_verified_at:new Date().toISOString(),last_error:null,updated_at:new Date().toISOString()};
  const {error}=await admin.from("trader_binance_connections").upsert(row,{onConflict:"account_id"}); if(error)throw error;
  const {error:secretError}=await admin.rpc("trader_binance_store_secret",{p_account_id:accountId,p_owner_user_id:userId,p_secret:JSON.stringify({apiKey,apiSecret})}); if(secretError)throw secretError;
  return await publicStatus(admin,accountId);
}
async function storedCredentials(admin:Db,accountId:string){
  const {data:secret,error}=await admin.rpc("trader_binance_read_secret",{p_account_id:accountId});
  if(error||!secret)throw new Error("credential_not_found");
  const credentials=JSON.parse(String(secret)) as {apiKey?:string;apiSecret?:string};
  if(!credentials.apiKey||!credentials.apiSecret)throw new Error("credential_not_found");
  return {apiKey:credentials.apiKey,apiSecret:credentials.apiSecret};
}

async function publicTickerPrices(){
  let lastError="binance_public_prices_failed";
  for(const endpoint of PUBLIC_PRICE_ENDPOINTS){
    try{
      const response=await fetch(endpoint,{headers:{accept:"application/json"},signal:AbortSignal.timeout(8_000)});
      if(!response.ok){ lastError=`binance_public_prices_${response.status}`; continue; }
      const payload=await response.json().catch(()=>null);
      if(!Array.isArray(payload)){ lastError="binance_public_prices_invalid"; continue; }
      const prices=new Map<string,number>();
      for(const row of payload){
        const item=obj(row),symbol=String(item.symbol||""),price=n(item.price);
        if(symbol&&price>0)prices.set(symbol,price);
      }
      if(prices.size)return prices;
      lastError="binance_public_prices_empty";
    }catch(error){ lastError=cleanError(error); }
  }
  throw new Error(lastError.startsWith("binance_")?lastError:"binance_public_prices_failed");
}
function assetUsdPrice(asset:string,prices:Map<string,number>){
  if(asset==="USDT")return 1;
  const direct=prices.get(`${asset}USDT`);
  if(direct&&direct>0)return direct;
  const stableAssets=new Set(["USDC","FDUSD","TUSD","DAI","BUSD"]);
  if(stableAssets.has(asset)){
    const inverse=prices.get(`USDT${asset}`);
    if(inverse&&inverse>0)return 1/inverse;
    return 1;
  }
  const btcUsd=prices.get("BTCUSDT");
  const viaBtc=prices.get(`${asset}BTC`);
  if(viaBtc&&btcUsd&&viaBtc>0&&btcUsd>0)return viaBtc*btcUsd;
  const bnbUsd=prices.get("BNBUSDT");
  const viaBnb=prices.get(`${asset}BNB`);
  if(viaBnb&&bnbUsd&&viaBnb>0&&bnbUsd>0)return viaBnb*bnbUsd;
  return null;
}
async function sanitizedBalances(admin:Db,account:RealAccount){
  const connection=await readConnection(admin,account.id);
  if(!connection||connection.status!=="connected")throw new Error("binance_not_connected");
  const credentials=await storedCredentials(admin,account.id);
  const [info,prices]=await Promise.all([
    signedBinance(admin,"GET","/api/v3/account",credentials.apiKey,credentials.apiSecret,{omitZeroBalances:true}) as Promise<Record<string,unknown>>,
    publicTickerPrices(),
  ]);
  const rawBalances=arr(info.balances).map(obj).map((row)=>({
    asset:String(row.asset||""),
    free:Math.max(0,n(row.free)),
    locked:Math.max(0,n(row.locked)),
  })).filter((row)=>row.asset&&row.free+row.locked>0);
  const balances=rawBalances.map((row)=>{
    const usdPrice=assetUsdPrice(row.asset,prices);
    const total=row.free+row.locked;
    return {...row,usdPrice,usdValue:usdPrice==null?null:total*usdPrice};
  }).sort((a,b)=>(b.usdValue??-1)-(a.usdValue??-1));
  const totalUsd=balances.reduce((sum,row)=>sum+(row.usdValue??0),0);
  const quote=balances.find((row)=>row.asset==="USDT");
  const quoteBalance=(quote?.free||0)+(quote?.locked||0);

  const [{count:tradeCount,error:tradeError},{count:orderCount,error:orderError},{count:fillCount,error:fillError}]=await Promise.all([
    admin.from("trader_trades").select("id",{count:"exact",head:true}).eq("account_id",account.id),
    admin.from("trader_orders").select("id",{count:"exact",head:true}).eq("account_id",account.id),
    admin.from("trader_fills").select("id",{count:"exact",head:true}).eq("account_id",account.id),
  ]);
  if(tradeError||orderError||fillError)throw tradeError||orderError||fillError;
  const hasFinancialHistory=(tradeCount||0)>0||(orderCount||0)>0||(fillCount||0)>0;
  const currentStarting=n(account.starting_balance);
  if(!hasFinancialHistory&&totalUsd>=0&&Math.abs(currentStarting-totalUsd)>0.00000001){
    const {error:updateError}=await admin.from("trader_accounts").update({starting_balance:totalUsd}).eq("id",account.id).eq("owner_user_id",account.owner_user_id);
    if(updateError)throw updateError;
  }
  return {balances,quoteAsset:"USDT",quoteBalance,totalUsd,pricedAssetCount:balances.filter((row)=>row.usdValue!=null).length,canSeedShadowBalance:!hasFinancialHistory,serverTime:info.updateTime||null};
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return json({error:"method_not_allowed"},405);
  const supabaseUrl=Deno.env.get("SUPABASE_URL"),serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"); if(!supabaseUrl||!serviceKey)return json({error:"server_configuration_missing"},500);
  const admin=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"").trim(); if(!token)return json({error:"unauthorized"},401);
  const {data:userData,error:userError}=await admin.auth.getUser(token),user=userData.user; if(userError||!user)return json({error:"unauthorized"},401);
  try{
    const account=await ownerRealAccount(admin,user.id),body=await req.json().catch(()=>({})) as Record<string,unknown>,action=String(body.action||"status");
    if(action==="status")return json({ok:true,...await publicStatus(admin,account.id)});
    if(action==="balances")return json({ok:true,...await sanitizedBalances(admin,account),...await publicStatus(admin,account.id)});
    if(action==="gateway_health"){
      const config=await gatewayConfig(admin),origin=validatedGatewayOrigin(config,false);
      const response=await fetch(`${origin}/health`,{signal:AbortSignal.timeout(8000)}),health=await response.json().catch(()=>({})) as Record<string,unknown>;
      if(!response.ok||health.ok!==true||health.auth!=="ecdsa-p256")throw new Error("gateway_health_failed");
      await admin.from("trader_gateway_config").update({status:"ready",egress_ip:String(health.egressIp||"")||null,last_health_at:new Date().toISOString(),last_error:null,updated_at:new Date().toISOString()}).eq("name","binance");
      return json({ok:true,health,...await publicStatus(admin,account.id)});
    }
    if(action==="connect"){
      const apiKey=String(body.apiKey||"").trim(),apiSecret=String(body.apiSecret||"").trim(); if(apiKey.length<10||apiSecret.length<10)return json({error:"invalid_credentials_format"},400);
      validatedGatewayOrigin(await gatewayConfig(admin),true);
      return json({ok:true,...await verifyAndPersist(admin,user.id,account.id,apiKey,apiSecret)});
    }
    if(action==="reverify"){
      const credentials=await storedCredentials(admin,account.id); return json({ok:true,...await verifyAndPersist(admin,user.id,account.id,credentials.apiKey,credentials.apiSecret)});
    }
    if(action==="disconnect"){
      await admin.from("trader_binance_connections").update({status:"disconnected",permission_read:false,permission_trade:false,last_error:null,updated_at:new Date().toISOString()}).eq("account_id",account.id);
      await admin.from("trader_execution_controls").update({global_live_enabled:false,kill_switch:true,updated_by:user.id,updated_at:new Date().toISOString()}).eq("account_id",account.id);
      return json({ok:true,...await publicStatus(admin,account.id)});
    }
    return json({error:"unknown_action"},400);
  }catch(error){
    const message=cleanError(error); console.error("trader-binance-control",message);
    const safe = message.startsWith("binance_")||message.startsWith("gateway_")||message.includes("credential_not_found")||message.includes("real_account_required") ? message : "binance_control_failed";
    return json({error:safe},safe.includes("not_ready")||safe.includes("not_configured")||safe.includes("real_account_required")?409:400);
  }
});
