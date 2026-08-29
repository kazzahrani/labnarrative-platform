import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const EXPECTED_GATEWAY_ORIGIN = "https://trader-gateway.labnarrative.com";
const cors = {
  "Access-Control-Allow-Origin": "https://platform.labnarrative.com",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Db = ReturnType<typeof createClient>;
type Json = Record<string, unknown>;
type Trade = {
  id:string; account_id:string; bot_id:string; client_id:string; pair:string; status:string;
  quantity:number|string; invested:number|string; client_state:Json; execution_mode:string;
};
type GatewayConfig = { base_url:string|null; status:string };
type Creds = { apiKey:string; apiSecret:string };

let cachedSigningKey: CryptoKey | null = null;
function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{...cors,"content-type":"application/json","cache-control":"no-store"}})}
function n(v:unknown,f=0){const x=Number(v);return Number.isFinite(x)?x:f}
function obj(v:unknown):Json{return v&&typeof v==="object"&&!Array.isArray(v)?v as Json:{}}
function clean(e:unknown){return e instanceof Error?e.message:String(e||"unknown_error")}
function nonce(){const bytes=new Uint8Array(24);crypto.getRandomValues(bytes);return Array.from(bytes).map(x=>x.toString(16).padStart(2,"0")).join("")}
function pemBytes(pem:string){const b64=pem.replace(/-----BEGIN [^-]+-----/g,"").replace(/-----END [^-]+-----/g,"").replace(/\s+/g,"");const bin=atob(b64),bytes=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);return bytes}
function b64(buffer:ArrayBuffer){const bytes=new Uint8Array(buffer);let s="";for(const x of bytes)s+=String.fromCharCode(x);return btoa(s)}
async function hmac(secret:string,message:string){const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);const sig=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(message));return Array.from(new Uint8Array(sig)).map(x=>x.toString(16).padStart(2,"0")).join("")}

async function ownedAccount(db:Db,userId:string,accountId:string){
  const {data,error}=await db.from("trader_accounts").select("id,mode,account_kind,status").eq("id",accountId).eq("owner_user_id",userId).eq("account_kind","real").eq("status","active").maybeSingle();
  if(error)throw error;if(!data)throw new Error("real_account_required");if(String(data.mode)!=="live")throw new Error("live_trading_not_enabled");return data;
}
async function safeConnection(db:Db,accountId:string){
  const {data,error}=await db.from("trader_binance_connections").select("status,environment,permission_read,permission_trade,permission_withdraw,permission_internal_transfer,ip_restricted").eq("account_id",accountId).maybeSingle();
  if(error||!data)throw new Error("binance_not_connected");
  if(data.status!=="connected"||data.environment!=="mainnet"||!data.permission_read||!data.permission_trade)throw new Error("binance_trade_permission_required");
  if(data.permission_withdraw||data.permission_internal_transfer||data.ip_restricted!==true)throw new Error("binance_connection_not_safe");
}
async function ownedTrade(db:Db,accountId:string,tradeId:string){
  const {data,error}=await db.from("trader_trades").select("id,account_id,bot_id,client_id,pair,status,quantity,invested,client_state,execution_mode").eq("account_id",accountId).eq("client_id",tradeId).maybeSingle();
  if(error)throw error;if(!data)throw new Error("trade_not_found");if(String(data.execution_mode)!=="live")throw new Error("trade_not_live");return data as Trade;
}
async function gatewayConfig(db:Db){const{data,error}=await db.from("trader_gateway_config").select("base_url,status").eq("name","binance").single();if(error||!data)throw new Error("gateway_not_configured");return data as GatewayConfig}
async function signingKey(db:Db){if(cachedSigningKey)return cachedSigningKey;const{data,error}=await db.rpc("trader_gateway_read_signing_private_key");if(error||!data)throw new Error("gateway_signing_key_not_configured");cachedSigningKey=await crypto.subtle.importKey("pkcs8",pemBytes(String(data)),{name:"ECDSA",namedCurve:"P-256"},false,["sign"]);return cachedSigningKey}
async function relay(db:Db,payload:Record<string,unknown>){
  const cfg=await gatewayConfig(db);if(cfg.status!=="ready"||!cfg.base_url)throw new Error("gateway_not_ready");
  const origin=new URL(cfg.base_url).origin;if(origin!==EXPECTED_GATEWAY_ORIGIN)throw new Error("gateway_origin_not_allowed");
  const raw=JSON.stringify(payload),ts=Date.now(),nce=nonce(),key=await signingKey(db),sig=b64(await crypto.subtle.sign({name:"ECDSA",hash:"SHA-256"},key,new TextEncoder().encode(`${ts}\n${nce}\n${raw}`)));
  const response=await fetch(`${origin}/relay`,{method:"POST",headers:{"content-type":"application/json","x-ln-timestamp":String(ts),"x-ln-nonce":nce,"x-ln-signature":sig},body:raw,signal:AbortSignal.timeout(12000)});
  const envelope=await response.json().catch(()=>({})) as Json;if(!response.ok)throw new Error(`gateway_${response.status}:${String(envelope.error||"relay_failed")}`);
  const upstreamStatus=n(envelope.upstreamStatus),rawBody=String(envelope.upstreamBody||"");let body:Json={};try{body=rawBody?JSON.parse(rawBody):{}}catch{throw new Error("binance_invalid_json")}
  if(upstreamStatus<200||upstreamStatus>=300)throw new Error(`binance_${String(body.code??upstreamStatus)}:${String(body.msg??"request_failed")}`);return body;
}
async function credentials(db:Db,accountId:string){const{data,error}=await db.rpc("trader_binance_read_secret",{p_account_id:accountId});if(error||!data)throw new Error("credential_not_found");const c=JSON.parse(String(data)) as {apiKey?:string;apiSecret?:string};if(!c.apiKey||!c.apiSecret)throw new Error("credential_not_found");return{apiKey:c.apiKey,apiSecret:c.apiSecret}}
async function signed(db:Db,creds:Creds,method:"GET"|"DELETE",path:string,params:Record<string,string|number|boolean>={}){
  const serverTime=await relay(db,{requestId:crypto.randomUUID(),method:"GET",path:"/api/v3/time",query:""});
  const q=new URLSearchParams();for(const[k,v]of Object.entries(params))q.set(k,String(v));q.set("timestamp",String(n(serverTime.serverTime)));q.set("recvWindow","5000");q.set("signature",await hmac(creds.apiSecret,q.toString()));
  return await relay(db,{requestId:crypto.randomUUID(),method,path,query:q.toString(),apiKey:creds.apiKey});
}

async function cancelTrade(db:Db,trade:Trade){
  if(trade.status!=="Active")throw new Error("trade_not_active");
  const now=new Date().toISOString();
  const {data:locked,error:lockError}=await db.from("trader_trades").update({status:"Closing",updated_at:now}).eq("id",trade.id).eq("status","Active").select("id").maybeSingle();
  if(lockError)throw lockError;if(!locked)throw new Error("trade_not_active");
  try{
    const creds=await credentials(db,trade.account_id),symbol=trade.pair.replace("/","");
    const {data:orders,error:ordersError}=await db.from("trader_orders")
      .select("id,client_order_id,exchange_order_id,status,side,kind")
      .eq("trade_id",trade.id).eq("exchange","binance")
      .in("status",["OPEN","PENDING","NEW","PARTIALLY_FILLED"]);
    if(ordersError)throw ordersError;
    let cancelledOrders=0;
    for(const order of orders??[]){
      try{
        if(order.client_order_id||order.exchange_order_id){
          const params:Record<string,string|number|boolean>={symbol};
          if(order.client_order_id)params.origClientOrderId=String(order.client_order_id);else params.orderId=String(order.exchange_order_id);
          await signed(db,creds,"DELETE","/api/v3/order",params);
        }
      }catch(error){
        const message=clean(error);
        // Binance -2011 means the order is no longer open. Reconciliation below is still safe.
        if(!message.includes("-2011"))throw error;
      }
      const {error:updateError}=await db.from("trader_orders").update({status:"CANCELED",reserved_quote:0,cancelled_at:now,updated_at:now}).eq("id",order.id);
      if(updateError)throw updateError;cancelledOrders+=1;
    }

    const retainedQuantity=Math.max(0,n(trade.quantity));
    const retainedCostBasis=Math.max(0,n(trade.invested));
    const nextState={...obj(trade.client_state),cancelledWithoutSale:true,retainedQuantity,retainedCostBasis,cancelledAt:now};
    delete nextState.stopLossTriggeredAt;
    const {error:closeError}=await db.from("trader_trades").update({
      status:"Closed",quantity:0,invested:0,realized_pnl:null,exit_price:null,close_reason:"Cancelled",closed_at:now,client_state:nextState,updated_at:now,
    }).eq("id",trade.id).eq("status","Closing");
    if(closeError)throw closeError;
    await db.from("trader_broker_events").insert({account_id:trade.account_id,bot_id:trade.bot_id,trade_id:trade.id,order_id:null,mode:"live",event_type:"manual_trade_cancelled",pair:trade.pair,client_order_id:null,exchange_order_id:null,payload:{cancelledOrders,retainedQuantity,retainedCostBasis,noSale:true}});
    return {cancelledOrders,retainedQuantity,retainedCostBasis,noSale:true};
  }catch(error){
    await db.from("trader_trades").update({status:"Active",updated_at:new Date().toISOString()}).eq("id",trade.id).eq("status","Closing");
    throw error;
  }
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});if(req.method!=="POST")return json({error:"method_not_allowed"},405);
  const url=Deno.env.get("SUPABASE_URL"),service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");if(!url||!service)return json({error:"server_configuration_missing"},500);
  const db=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}}),token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"").trim();if(!token)return json({error:"unauthorized"},401);
  const {data:userData,error:userError}=await db.auth.getUser(token);if(userError||!userData.user)return json({error:"unauthorized"},401);
  try{
    const body=await req.json().catch(()=>({})) as Json,accountId=String(body.accountId||"").trim(),tradeId=String(body.tradeId||"").trim();if(!accountId)throw new Error("account_id_required");if(!tradeId)throw new Error("trade_id_required");
    await ownedAccount(db,userData.user.id,accountId);await safeConnection(db,accountId);const trade=await ownedTrade(db,accountId,tradeId);const result=await cancelTrade(db,trade);return json({ok:true,action:"cancel_trade",result});
  }catch(error){
    const message=clean(error);console.error("trader-live-cancel-control",message);
    const publicErrors=["real_account_required","live_trading_not_enabled","binance_not_connected","binance_trade_permission_required","binance_connection_not_safe","trade_not_found","trade_not_active","trade_not_live","account_id_required","trade_id_required"].includes(message)||message.startsWith("binance_")||message.startsWith("gateway_")?message:"live_cancel_failed";
    return json({error:publicErrors},publicErrors==="real_account_required"?403:400);
  }
});
