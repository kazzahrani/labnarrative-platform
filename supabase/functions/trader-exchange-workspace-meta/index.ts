import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors={"Access-Control-Allow-Origin":"https://platform.labnarrative.com","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{...cors,"content-type":"application/json","cache-control":"no-store"}})}
Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return json({error:"method_not_allowed"},405);
  const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!key)return json({error:"server_configuration_missing"},500);
  const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}}),token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"").trim();
  if(!token)return json({error:"unauthorized"},401);
  const {data:u,error:ue}=await db.auth.getUser(token);if(ue||!u.user)return json({error:"unauthorized"},401);
  try{
    const body=await req.json().catch(()=>({})) as Record<string,unknown>,accountId=String(body.accountId||"").trim();if(!accountId)return json({error:"account_id_required"},400);
    const {data:account,error:ae}=await db.from("trader_accounts").select("id,account_kind").eq("id",accountId).eq("owner_user_id",u.user.id).eq("status","active").maybeSingle();if(ae)throw ae;if(!account)return json({error:"trader_account_not_owned"},403);
    const [bots,trades,orders,generic,binance]=await Promise.all([
      db.from("trader_bots").select("client_id,exchange_provider").eq("account_id",accountId),
      db.from("trader_trades").select("client_id,exchange_provider").eq("account_id",accountId),
      db.from("trader_orders").select("client_order_id,exchange").eq("account_id",accountId),
      db.from("trader_exchange_connections").select("provider,status,api_key_last4,permission_trade,capabilities").eq("account_id",accountId),
      db.from("trader_binance_connections").select("status,api_key_last4").eq("account_id",accountId).maybeSingle(),
    ]);
    for(const r of [bots,trades,orders,generic,binance])if(r.error)throw r.error;
    const connections=[] as Array<Record<string,unknown>>;
    if(binance.data?.status==="connected")connections.push({provider:"binance",status:"connected",apiKeyLast4:binance.data.api_key_last4,permissionTrade:true,liveExecution:true});
    for(const row of generic.data??[]){const caps=(row.capabilities&&typeof row.capabilities==="object"?row.capabilities:{}) as Record<string,unknown>;connections.push({provider:String(row.provider),status:String(row.status),apiKeyLast4:row.api_key_last4,permissionTrade:row.permission_trade===true,liveExecution:caps.liveExecution===true});}
    return json({ok:true,bots:(bots.data??[]).map(x=>({id:String(x.client_id),exchangeProvider:String(x.exchange_provider||"binance")})),trades:(trades.data??[]).map(x=>({id:String(x.client_id),exchangeProvider:String(x.exchange_provider||"binance")})),orders:(orders.data??[]).map(x=>({id:String(x.client_order_id),exchangeProvider:String(x.exchange||"binance")})),connections});
  }catch(e){console.error("trader-exchange-workspace-meta",e);return json({error:"exchange_workspace_meta_failed"},400)}
});
