import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORE_SLUG="trader-tradingview-strategy-webhook";
const UNLIMITED_SENTINEL=1_000_000;
const QUEUE_LEASE_SECONDS=90;
const DRAIN_BUDGET_MS=95_000;
const CORE_EVENT_WAIT_MS=70_000;
type Json=Record<string,unknown>;
type Db=ReturnType<typeof createClient>;
type Bot={id:string;account_id:string;status:string;max_active_trades:number|string;client_state:Json};
type Reservation={allowed?:boolean;activePositions?:number;maxOpenPositions?:number;existingPosition?:boolean;existingReservation?:boolean;reserved?:boolean};
type QueueRow={id:string;account_id:string;bot_id:string;action:"buy"|"sell";pair:string;signal_id:string|null;dedupe_key:string|null;payload:Json;status:string;received_at:string};
type CoreEvent={id:string;status:string;error:string|null};

function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json","cache-control":"no-store"}})}
function n(value:unknown,fallback=0){const parsed=Number(value);return Number.isFinite(parsed)?parsed:fallback}
function obj(value:unknown):Json{return value&&typeof value==="object"&&!Array.isArray(value)?value as Json:{}}
function hasOwn(value:Json,key:string){return Object.prototype.hasOwnProperty.call(value,key)}
function clean(error:unknown){return error instanceof Error?error.message:String(error||"unknown_error")}
function sleep(ms:number){return new Promise(resolve=>setTimeout(resolve,ms))}
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
function shouldReserve(raw:Json){const market=String(raw.market_position||"").trim().toLowerCase(),prev=String(raw.prev_market_position||"").trim().toLowerCase();if(market==="short")return false;if(prev==="short"&&market==="flat")return false;return true}
async function reserveSlot(db:Db,bot:Bot,pair:string,limit:number){const{data,error}=await db.rpc("trader_reserve_strategy_position_slot",{p_bot_id:bot.id,p_account_id:bot.account_id,p_pair:pair,p_max_positions:limit,p_lease_seconds:300});if(error)throw error;return obj(data) as Reservation}
async function recordCapacityIgnore(db:Db,bot:Bot,pair:string,raw:Json,limit:number,active:number){const sig=signalId(raw),dedupe=sig?`start|${pair}|${sig}`:null,now=new Date().toISOString(),payload={result:{ignored:true,reason:"strategy_position_capacity_reached",maxOpenPositions:limit,activePositions:active}};const{error}=await db.from("trader_tradingview_events").insert({account_id:bot.account_id,bot_id:bot.id,action:"start",pair,amount:null,signal_id:sig||null,dedupe_key:dedupe,status:"ignored",processed_at:now,payload});if(error&&String(error.code)!=="23505")throw error}

async function forwardCore(base:string,body:Json){const response=await fetch(`${base}/functions/v1/${CORE_SLUG}`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body),signal:AbortSignal.timeout(15_000)});const text=await response.text();let parsed:Json={};try{parsed=text?JSON.parse(text) as Json:{}}catch{parsed={raw:text.slice(0,500)}}return{status:response.status,body:parsed}}
async function queueStatus(db:Db,id:string){const{data}=await db.from("trader_strategy_signal_queue").select("status").eq("id",id).maybeSingle();return String(data?.status||"")}
async function claimQueue(db:Db,accountId:string,workerId:string){const{data,error}=await db.rpc("trader_claim_strategy_signal_queue",{p_account_id:accountId,p_worker_id:workerId,p_lease_seconds:QUEUE_LEASE_SECONDS});if(error)throw error;return data===true}
async function releaseQueue(db:Db,accountId:string,workerId:string){await db.rpc("trader_release_strategy_signal_queue",{p_account_id:accountId,p_worker_id:workerId})}
async function nextQueued(db:Db,accountId:string){const{data,error}=await db.from("trader_strategy_signal_queue").select("id,account_id,bot_id,action,pair,signal_id,dedupe_key,payload,status,received_at").eq("account_id",accountId).eq("status","pending").order("received_at",{ascending:true}).order("id",{ascending:true}).limit(1).maybeSingle();if(error)throw error;return data as QueueRow|null}
async function coreEventById(db:Db,eventId:string){const{data,error}=await db.from("trader_tradingview_events").select("id,status,error").eq("id",eventId).maybeSingle();if(error)throw error;return data as CoreEvent|null}
async function coreEventByDedupe(db:Db,row:QueueRow){if(!row.dedupe_key)return null;const{data,error}=await db.from("trader_tradingview_events").select("id,status,error").eq("account_id",row.account_id).eq("bot_id",row.bot_id).eq("dedupe_key",row.dedupe_key).order("received_at",{ascending:false}).limit(1).maybeSingle();if(error)throw error;return data as CoreEvent|null}
async function waitForCoreEvent(db:Db,row:QueueRow,eventId:string){const started=Date.now();while(Date.now()-started<CORE_EVENT_WAIT_MS){const event=eventId?await coreEventById(db,eventId):await coreEventByDedupe(db,row);if(event&&["processed","ignored","failed"].includes(event.status))return event;await sleep(500)}return null}
async function releaseReservationIfDone(db:Db,row:QueueRow){if(row.action!=="buy")return;const{count,error}=await db.from("trader_strategy_signal_queue").select("id",{count:"exact",head:true}).eq("bot_id",row.bot_id).eq("pair",row.pair).in("status",["pending","dispatching"]).neq("id",row.id);if(error)throw error;if((count??0)>0)return;await db.from("trader_strategy_position_reservations").delete().eq("bot_id",row.bot_id).eq("pair",row.pair)}

async function dispatchOne(db:Db,base:string,row:QueueRow,workerId:string){const now=new Date().toISOString();const{data:claimed,error:claimError}=await db.from("trader_strategy_signal_queue").update({status:"dispatching",worker_id:workerId,dispatched_at:now,updated_at:now,attempts:1}).eq("id",row.id).eq("status","pending").select("id").maybeSingle();if(claimError)throw claimError;if(!claimed)return;
  try{
    const{data:bot,error:botError}=await db.from("trader_bots").select("tradingview_token,tradingview_enabled,is_archived").eq("id",row.bot_id).eq("account_id",row.account_id).maybeSingle();if(botError)throw botError;if(!bot||bot.is_archived||bot.tradingview_enabled!==true||!bot.tradingview_token)throw new Error("strategy_token_unavailable");
    const requestBody={...obj(row.payload),token:String(bot.tradingview_token),action:row.action,pair:row.pair};
    const forwarded=await forwardCore(base,requestBody);
    let eventId=String(forwarded.body.eventId||"");
    if(forwarded.status===200&&String(forwarded.body.status||"")==="duplicate"){const existing=await coreEventByDedupe(db,row);eventId=existing?.id||""}
    else if(forwarded.status!==202&&forwarded.status!==200)throw new Error(`core_http_${forwarded.status}`);
    const event=await waitForCoreEvent(db,row,eventId);
    if(!event){await db.from("trader_strategy_signal_queue").update({status:"stalled",error:"core_event_timeout",updated_at:new Date().toISOString()}).eq("id",row.id);return}
    const terminal=event.status==="failed"?"failed":"completed";
    await db.from("trader_strategy_signal_queue").update({status:terminal,core_event_id:event.id,error:event.error,completed_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",row.id);
    await releaseReservationIfDone(db,row);
  }catch(error){const message=clean(error);console.error("trader-tv-queue-dispatch",row.id,message);await db.from("trader_strategy_signal_queue").update({status:"failed",error:message,completed_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",row.id);await releaseReservationIfDone(db,row)}
}

async function drainAccount(db:Db,base:string,accountId:string,triggerId:string){const workerId=crypto.randomUUID(),started=Date.now();let owns=false;try{
  while(Date.now()-started<105_000){if(await claimQueue(db,accountId,workerId)){owns=true;break}const state=await queueStatus(db,triggerId);if(state&&state!=="pending")return;await sleep(750)}
  if(!owns)return;
  let emptyPasses=0;
  while(Date.now()-started<DRAIN_BUDGET_MS){await claimQueue(db,accountId,workerId);const row=await nextQueued(db,accountId);if(!row){emptyPasses++;if(emptyPasses>=2)break;await sleep(500);continue}emptyPasses=0;await dispatchOne(db,base,row,workerId)}
}catch(error){console.error("trader-tv-account-queue",accountId,clean(error))}finally{if(owns)try{await releaseQueue(db,accountId,workerId)}catch{}}}

Deno.serve(async(req:Request)=>{
  if(req.method!=="POST")return json({error:"method_not_allowed"},405);
  const base=Deno.env.get("SUPABASE_URL"),service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");if(!base||!service)return json({error:"server_configuration_missing"},500);
  const rawText=await req.text();if(!rawText||rawText.length>16_384)return json({error:"invalid_strategy_message"},400);
  let raw:Json;try{raw=JSON.parse(rawText) as Json}catch{return json({error:"invalid_strategy_message"},400)}
  const token=String(raw.token||"").trim(),actionRaw=String(raw.action||"").trim().toLowerCase(),action=actionRaw==="buy"?"buy":actionRaw==="sell"?"sell":"";if(!token||!action)return json({error:"invalid_strategy_message"},400);
  const db=createClient(base,service,{auth:{persistSession:false,autoRefreshToken:false}});
  try{
    const{data,error}=await db.from("trader_bots").select("id,account_id,status,max_active_trades,client_state").eq("tradingview_token",token).eq("tradingview_enabled",true).eq("is_archived",false).maybeSingle();if(error)throw error;if(!data)return json({error:"invalid_webhook_token"},401);
    const bot=data as Bot;if(String(obj(bot.client_state).automationType||"")!=="tradingview_strategy")return json({error:"strategy_token_required"},400);
    const pair=cleanPair(raw.pair);if(!pair)return json({error:"unsupported_strategy_symbol"},400);
    if(action==="buy"&&bot.status==="Running"&&shouldReserve(raw)){
      const limit=storedLimit(bot);
      if(limit!==null){const reservation=await reserveSlot(db,bot,pair,limit);if(reservation.allowed!==true){const occupied=Math.max(0,Math.round(n(reservation.activePositions)));await recordCapacityIgnore(db,bot,pair,raw,limit,occupied);return json({ok:true,status:"ignored",reason:"strategy_position_capacity_reached",maxOpenPositions:limit,activePositions:occupied},200)}}
    }
    const sig=signalId(raw),eventAction=action==="buy"?"start":"close",dedupe=sig?`${eventAction}|${pair}|${sig}`:null,safePayload={...raw,pair,signal_id:sig||undefined};delete safePayload.token;
    const{data:queued,error:queueError}=await db.from("trader_strategy_signal_queue").insert({account_id:bot.account_id,bot_id:bot.id,action,pair,signal_id:sig||null,dedupe_key:dedupe,payload:safePayload,status:"pending"}).select("id").single();
    if(queueError){if(String(queueError.code)==="23505"&&dedupe){const{data:existing}=await db.from("trader_strategy_signal_queue").select("id").eq("bot_id",bot.id).eq("dedupe_key",dedupe).maybeSingle();if(existing?.id)EdgeRuntime.waitUntil(drainAccount(db,base,bot.account_id,String(existing.id)));return json({ok:true,status:"duplicate"},200)}throw queueError}
    if(!queued)return json({error:"queue_event_not_created"},500);
    EdgeRuntime.waitUntil(drainAccount(db,base,bot.account_id,String(queued.id)));
    return json({ok:true,status:"accepted",queueId:queued.id},202);
  }catch(error){console.error("trader-tradingview-strategy-gateway",error);return json({error:"strategy_gateway_failed"},500)}
});
