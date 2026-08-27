import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORE_SLUG="trader-tradingview-strategy-webhook";
const UNLIMITED_SENTINEL=1_000_000;
type Json=Record<string,unknown>;
type Db=ReturnType<typeof createClient>;

type Bot={id:string;account_id:string;status:string;max_active_trades:number|string;client_state:Json};
function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json","cache-control":"no-store"}})}
function n(value:unknown,fallback=0){const parsed=Number(value);return Number.isFinite(parsed)?parsed:fallback}
function obj(value:unknown):Json{return value&&typeof value==="object"&&!Array.isArray(value)?value as Json:{}}
function hasOwn(value:Json,key:string){return Object.prototype.hasOwnProperty.call(value,key)}
function cleanPair(value:unknown){let raw=String(value||"").trim().toUpperCase();if(raw.includes(":"))raw=raw.split(":").at(-1)||raw;raw=raw.replace(/[^A-Z0-9]/g,"");if(!raw.endsWith("USDT")||raw.length<=4)return"";const base=raw.slice(0,-4);return /^[A-Z0-9]{1,20}$/.test(base)?`${base}/USDT`:""}
function storedLimit(bot:Bot):number|null{
  const state=obj(bot.client_state);
  if(hasOwn(state,"strategyMaxOpenPositions")){
    const raw=state.strategyMaxOpenPositions;
    if(raw===null||String(raw).trim().toLowerCase()==="unlimited")return null;
    const value=Math.round(n(raw));if(value>=1&&value<=100)return value;
  }
  const legacy=Math.max(1,Math.round(n(bot.max_active_trades,5)));
  return legacy>=UNLIMITED_SENTINEL?null:Math.min(100,legacy);
}
function signalId(raw:Json){const legacy=String(raw.signal_id||raw.signalId||"").trim();if(legacy&&!legacy.includes("{{"))return legacy.slice(0,160);const orderId=String(raw.order_id||raw.orderId||"").trim(),eventTime=String(raw.event_time||raw.eventTime||"").trim();const goodOrder=orderId&&!orderId.includes("{{")?orderId:"",goodTime=eventTime&&!eventTime.includes("{{")?eventTime:"";if(goodOrder&&goodTime)return`${goodOrder}|${goodTime}`.slice(0,160);return(goodTime||goodOrder).slice(0,160)}
async function activeTradeForPair(db:Db,bot:Bot,pair:string){const{data,error}=await db.from("trader_trades").select("id").eq("account_id",bot.account_id).eq("bot_id",bot.id).eq("pair",pair).eq("status","Active").limit(1).maybeSingle();if(error)throw error;return Boolean(data)}
async function activeCount(db:Db,bot:Bot){const{count,error}=await db.from("trader_trades").select("id",{count:"exact",head:true}).eq("account_id",bot.account_id).eq("bot_id",bot.id).eq("status","Active");if(error)throw error;return count??0}
async function recordCapacityIgnore(db:Db,bot:Bot,pair:string,raw:Json,limit:number,active:number){const sig=signalId(raw),dedupe=sig?`start|${pair}|${sig}`:null,now=new Date().toISOString(),payload={result:{ignored:true,reason:"strategy_position_capacity_reached",maxOpenPositions:limit,activePositions:active}};const{error}=await db.from("trader_tradingview_events").insert({account_id:bot.account_id,bot_id:bot.id,action:"start",pair,amount:null,signal_id:sig||null,dedupe_key:dedupe,status:"ignored",processed_at:now,payload});if(error&&String(error.code)!=="23505")throw error}
async function forward(base:string,rawText:string){const response=await fetch(`${base}/functions/v1/${CORE_SLUG}`,{method:"POST",headers:{"content-type":"application/json"},body:rawText,signal:AbortSignal.timeout(12_000)});const body=await response.text();return new Response(body,{status:response.status,headers:{"content-type":response.headers.get("content-type")||"application/json","cache-control":"no-store"}})}

Deno.serve(async(req:Request)=>{
  if(req.method!=="POST")return json({error:"method_not_allowed"},405);
  const base=Deno.env.get("SUPABASE_URL"),service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");if(!base||!service)return json({error:"server_configuration_missing"},500);
  const rawText=await req.text();if(!rawText||rawText.length>16_384)return json({error:"invalid_strategy_message"},400);
  let raw:Json;try{raw=JSON.parse(rawText) as Json}catch{return json({error:"invalid_strategy_message"},400)}
  const token=String(raw.token||"").trim(),action=String(raw.action||"").trim().toLowerCase();if(!token||(action!=="buy"&&action!=="sell"))return json({error:"invalid_strategy_message"},400);
  const db=createClient(base,service,{auth:{persistSession:false,autoRefreshToken:false}});
  try{
    const{data,error}=await db.from("trader_bots").select("id,account_id,status,max_active_trades,client_state").eq("tradingview_token",token).eq("tradingview_enabled",true).eq("is_archived",false).maybeSingle();if(error)throw error;if(!data)return json({error:"invalid_webhook_token"},401);
    const bot=data as Bot;if(String(obj(bot.client_state).automationType||"")!=="tradingview_strategy")return json({error:"strategy_token_required"},400);
    if(action==="buy"&&bot.status==="Running"){
      const pair=cleanPair(raw.pair);if(!pair)return json({error:"unsupported_strategy_symbol"},400);
      if(!await activeTradeForPair(db,bot,pair)){
        const limit=storedLimit(bot);
        if(limit!==null){const active=await activeCount(db,bot);if(active>=limit){await recordCapacityIgnore(db,bot,pair,raw,limit,active);return json({ok:true,status:"ignored",reason:"strategy_position_capacity_reached",maxOpenPositions:limit,activePositions:active},200)}}
      }
    }
    return await forward(base,rawText);
  }catch(error){console.error("trader-tradingview-strategy-gateway",error);return json({error:"strategy_gateway_failed"},500)}
});
