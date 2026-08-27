import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

type Json=Record<string,unknown>;
function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json","cache-control":"no-store"}})}
function obj(v:unknown):Json{return v&&typeof v==="object"&&!Array.isArray(v)?v as Json:{}}
function cleanPair(v:unknown){let raw=String(v||"").trim().toUpperCase();if(raw.includes(":"))raw=raw.split(":").at(-1)||raw;raw=raw.replace(/[^A-Z0-9]/g,"");if(!raw.endsWith("USDT")||raw.length<=4)return"";const base=raw.slice(0,-4);return /^[A-Z0-9]{1,20}$/.test(base)?`${base}/USDT`:""}

Deno.serve(async(req:Request)=>{
  if(req.method!=="POST")return json({error:"method_not_allowed"},405);
  const url=Deno.env.get("SUPABASE_URL"),service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!service)return json({error:"server_configuration_missing"},500);
  const db=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  try{
    const raw=await req.json().catch(()=>({})) as Json,token=String(raw.token||"").trim(),action=String(raw.action||"").trim().toLowerCase();
    if(!token||!(action==="buy"||action==="sell"))return json({error:"invalid_strategy_message"},400);
    const{data:bot,error}=await db.from("trader_bots").select("id,account_id,pair,status,is_archived,tradingview_enabled,client_state").eq("tradingview_token",token).eq("tradingview_enabled",true).eq("is_archived",false).maybeSingle();
    if(error)throw error;if(!bot)return json({error:"invalid_webhook_token"},401);
    if(String(obj(bot.client_state).automationType||"")!=="tradingview_strategy")return json({error:"strategy_token_required"},400);
    const pair=cleanPair(raw.pair||bot.pair);if(!pair||pair!==cleanPair(bot.pair))return json({error:"pair_not_allowed"},400);
    const signalRaw=String(raw.signal_id||raw.signalId||"").trim(),signalId=signalRaw&&!signalRaw.includes("{{")?signalRaw.slice(0,160):"";
    const upstream=await fetch(`${url}/functions/v1/trader-tradingview-webhook`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({token,action:action==="buy"?"START":"CLOSE",pair,signal_id:signalId||undefined}),signal:AbortSignal.timeout(8000)});
    const text=await upstream.text();
    return new Response(text,{status:upstream.status,headers:{"content-type":upstream.headers.get("content-type")||"application/json","cache-control":"no-store"}});
  }catch(error){console.error("trader-tradingview-strategy-webhook",error);return json({error:"strategy_webhook_failed"},500)}
});