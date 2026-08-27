import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors={"Access-Control-Allow-Origin":"https://platform.labnarrative.com","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
type Json=Record<string,unknown>;
function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{...cors,"content-type":"application/json","cache-control":"no-store"}})}
function token(){const bytes=new Uint8Array(32);crypto.getRandomValues(bytes);return Array.from(bytes).map(x=>x.toString(16).padStart(2,"0")).join("")}
function isTvRule(conditions:unknown){return Array.isArray(conditions)&&conditions.some(raw=>raw&&typeof raw==="object"&&String((raw as Json).id||"").startsWith("tv-signal-"))}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return json({error:"method_not_allowed"},405);
  const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!key)return json({error:"server_configuration_missing"},500);
  const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const bearer=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"").trim();
  if(!bearer)return json({error:"unauthorized"},401);
  const{data:userData,error:userError}=await admin.auth.getUser(bearer),user=userData.user;
  if(userError||!user)return json({error:"unauthorized"},401);
  try{
    const body=await req.json().catch(()=>({})) as Json;
    const accountId=String(body.accountId||"").trim(),botId=String(body.botId||"").trim(),action=String(body.action||"get_link");
    if(!accountId||!botId)return json({error:"account_and_bot_required"},400);
    const{data:account,error:ae}=await admin.from("trader_accounts").select("id,account_kind").eq("id",accountId).eq("owner_user_id",user.id).eq("status","active").maybeSingle();
    if(ae)throw ae;if(!account)return json({error:"account_not_owned"},403);
    let maxSingleOrder:number|null=null;
    if(account.account_kind==="real"){
      const{data:controls,error:ce}=await admin.from("trader_execution_controls").select("max_single_order").eq("account_id",accountId).maybeSingle();
      if(ce)throw ce;
      const parsed=Number(controls?.max_single_order);
      maxSingleOrder=Number.isFinite(parsed)&&parsed>0?parsed:null;
    }
    const{data:bot,error:be}=await admin.from("trader_bots").select("id,client_id,name,conditions,tradingview_token,tradingview_enabled,is_archived").eq("account_id",accountId).eq("client_id",botId).maybeSingle();
    if(be)throw be;if(!bot||bot.is_archived)return json({error:"bot_not_found"},404);
    let current=String(bot.tradingview_token||"");
    let enabled=bot.tradingview_enabled===true;
    if(action==="regenerate"){
      current=token();enabled=true;
      const{error}=await admin.from("trader_bots").update({tradingview_token:current,tradingview_enabled:true,updated_at:new Date().toISOString()}).eq("id",bot.id);if(error)throw error;
    }else if(action==="set_enabled"){
      enabled=body.enabled===true;
      if(enabled&&!current)current=token();
      const{error}=await admin.from("trader_bots").update({tradingview_token:current||null,tradingview_enabled:enabled,updated_at:new Date().toISOString()}).eq("id",bot.id);if(error)throw error;
    }else if(action!=="get_link")return json({error:"unknown_action"},400);
    return json({ok:true,enabled,token:enabled?current:"",webhookUrl:"https://platform.labnarrative.com/api/trader/tradingview",entryRuleEnabled:isTvRule(bot.conditions),accountKind:account.account_kind,maxSingleOrder});
  }catch(error){console.error("trader-tradingview-control",error);return json({error:error instanceof Error?error.message:String(error)},500)}
});
