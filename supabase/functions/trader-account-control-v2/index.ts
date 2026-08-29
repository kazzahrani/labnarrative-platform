import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors={
  "Access-Control-Allow-Origin":"https://platform.labnarrative.com",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS"
};
type Json=Record<string,unknown>;
function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{...cors,"content-type":"application/json","cache-control":"no-store"}})}
function obj(value:unknown):Json{return value&&typeof value==="object"&&!Array.isArray(value)?value as Json:{}}
function clean(error:unknown){return error instanceof Error?error.message:String(error||"unknown_error")}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return json({error:"method_not_allowed"},405);

  const url=Deno.env.get("SUPABASE_URL"),service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!service)return json({error:"server_configuration_missing"},500);
  const raw=await req.text();
  const body=(()=>{try{return JSON.parse(raw||"{}") as Json}catch{return{}}})();
  const action=String(body.action||"");
  const accountId=String(body.accountId||"").trim();
  const bearer=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"").trim();
  const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});

  const forward=async(forwardBody:Json=body)=>{
    const response=await fetch(`${url}/functions/v1/trader-account-control`,{
      method:"POST",
      headers:{"content-type":"application/json","authorization":req.headers.get("Authorization")||"","apikey":service},
      body:JSON.stringify(forwardBody)
    });
    const text=await response.text();
    let payload:Json;
    try{payload=JSON.parse(text) as Json}catch{return new Response(text,{status:response.status,headers:{...cors,"content-type":"application/json"}})}
    if(response.ok&&accountId&&Array.isArray(payload.bots)){
      const{data:rows,error}=await admin.from("trader_bots").select("client_id,client_state").eq("account_id",accountId);
      if(!error){
        const deleted=new Set((rows??[]).filter(row=>obj(row.client_state).deleted===true).map(row=>String(row.client_id)));
        payload.bots=(payload.bots as Json[]).filter(bot=>!deleted.has(String(bot.id||"")));
      }
    }
    return json(payload,response.status);
  };

  if(action!=="copy_bot"&&action!=="delete_bot"){
    try{return await forward()}catch(error){console.error("trader-account-control-v2-forward",error);return json({error:"trader_account_control_failed"},400)}
  }

  if(!bearer)return json({error:"unauthorized"},401);
  if(!accountId)return json({error:"account_id_required"},400);
  const botId=String(body.botId||"").trim();
  if(!botId)return json({error:"bot_id_required"},400);

  try{
    const{data:userData,error:userError}=await admin.auth.getUser(bearer),user=userData.user;
    if(userError||!user)return json({error:"unauthorized"},401);
    const{data:account,error:accountError}=await admin.from("trader_accounts").select("id").eq("id",accountId).eq("owner_user_id",user.id).eq("status","active").maybeSingle();
    if(accountError)throw accountError;
    if(!account)return json({error:"trader_account_not_owned"},403);

    const{data:bot,error:botError}=await admin.from("trader_bots").select("*").eq("account_id",accountId).eq("client_id",botId).maybeSingle();
    if(botError)throw botError;
    if(!bot)return json({error:"bot_not_found"},404);
    const state=obj(bot.client_state);
    if(state.deleted===true)return json({error:"bot_not_found"},404);
    const automationType=String(state.automationType||"dca");
    if(automationType==="tradingview_strategy")return json({error:action==="copy_bot"?"strategy_copy_not_supported":"strategy_delete_not_supported"},409);

    if(action==="copy_bot"){
      const now=new Date().toISOString();
      const newClientId=`bot-${Date.now()}-${crypto.randomUUID().slice(0,8)}`;
      const newName=`${String(bot.name||"DCA Bot")} Copy`;
      const nextState={...state,id:newClientId,name:newName,status:"Stopped",deleted:false,copiedFrom:String(bot.client_id),copiedAt:now,createdAt:now};
      delete nextState.deletedAt;
      const{error:insertError}=await admin.from("trader_bots").insert({
        account_id:bot.account_id,
        client_id:newClientId,
        name:newName,
        status:"Stopped",
        pair:bot.pair,
        pairs:bot.pairs,
        all_pairs:bot.all_pairs,
        base_order:bot.base_order,
        safety_order:bot.safety_order,
        max_safety_orders:bot.max_safety_orders,
        limit_safety_orders:bot.limit_safety_orders,
        max_active_trades:bot.max_active_trades,
        deviation:bot.deviation,
        step_scale:bot.step_scale,
        volume_scale:bot.volume_scale,
        take_profit_pct:bot.take_profit_pct,
        stop_enabled:bot.stop_enabled,
        stop_pct:bot.stop_pct,
        trailing_pct:bot.trailing_pct,
        max_hold_enabled:bot.max_hold_enabled,
        max_hold_hours:bot.max_hold_hours,
        averaging_enabled:bot.averaging_enabled,
        order_type:bot.order_type,
        conditions:bot.conditions,
        client_state:nextState,
        scan_cursor:0,
        next_scan_at:null,
        last_scan_at:null,
        last_scan_candle_key:null,
        is_archived:false,
        execution_mode:bot.execution_mode,
        tradingview_token:null,
        tradingview_enabled:false,
        created_at:now,
        updated_at:now
      });
      if(insertError)throw insertError;
      return await forward({action:"workspace_state",accountId});
    }

    const[{count:activeTrades,error:tradeError},{count:openOrders,error:orderError}]=await Promise.all([
      admin.from("trader_trades").select("id",{count:"exact",head:true}).eq("account_id",accountId).eq("bot_id",bot.id).eq("status","Active"),
      admin.from("trader_orders").select("id",{count:"exact",head:true}).eq("account_id",accountId).eq("bot_id",bot.id).in("status",["OPEN","PENDING","NEW","PARTIALLY_FILLED"])
    ]);
    if(tradeError)throw tradeError;
    if(orderError)throw orderError;
    if((activeTrades??0)>0)return json({error:"bot_has_active_trades"},409);
    if((openOrders??0)>0)return json({error:"bot_has_open_orders"},409);

    const now=new Date().toISOString();
    const{error:updateError}=await admin.from("trader_bots").update({status:"Stopped",is_archived:true,client_state:{...state,status:"Stopped",deleted:true,deletedAt:now},updated_at:now}).eq("id",bot.id);
    if(updateError)throw updateError;
    return await forward({action:"workspace_state",accountId});
  }catch(error){
    console.error("trader-account-control-v2",error);
    return json({error:"trader_bot_action_failed",detail:clean(error)},400);
  }
});
