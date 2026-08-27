import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

type Json = Record<string, unknown>;
type Db = ReturnType<typeof createClient>;
type Bot = { id:string; account_id:string; pair:string; pairs:string[]; all_pairs:boolean; tradingview_token:string; tradingview_enabled:boolean };
type EventRow = { id:string; status:string; error:string|null; payload:Json };

function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json","cache-control":"no-store"}})}
function n(value:unknown,fallback=0){const parsed=Number(value);return Number.isFinite(parsed)?parsed:fallback}
function clean(error:unknown){return error instanceof Error?error.message:String(error||"unknown_error")}
function cleanPair(value:unknown){let raw=String(value||"").trim().toUpperCase();if(raw.includes(":"))raw=raw.split(":").at(-1)||raw;raw=raw.replace(/[^A-Z0-9]/g,"");if(!raw.endsWith("USDT")||raw.length<=4)return"";const base=raw.slice(0,-4);return /^[A-Z0-9]{1,20}$/.test(base)?`${base}/USDT`:""}
function pairAllowed(bot:Bot,pair:string){if(bot.all_pairs)return true;const allowed=(bot.pairs?.length?bot.pairs:[bot.pair]).map(cleanPair);return allowed.includes(pair)}
function sleep(ms:number){return new Promise(resolve=>setTimeout(resolve,ms))}

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
    }
    const signalRaw=String(raw.signal_id||raw.signalId||"").trim(),signalId=signalRaw&&!signalRaw.includes("{{")?signalRaw.slice(0,140):"";
    const dedupeKey=signalId?`add_funds_split|${pair}|${signalId}`:null;
    const{data:event,error:eventError}=await db.from("trader_tradingview_events").insert({account_id:account.id,bot_id:bot.id,action:"add_funds",pair,amount,signal_id:signalId||null,dedupe_key:dedupeKey,status:"pending",payload:{split:true,requestedAmount:amount}}).select("id").single();
    if(eventError){if(String(eventError.code)==="23505")return json({ok:true,status:"duplicate"},200);throw eventError}if(!event)return json({error:"event_not_created"},500);
    EdgeRuntime.waitUntil(processSplit(db,baseUrl,event.id,bot,pair,amount,signalId,maxOrder));
    return json({ok:true,status:"accepted",eventId:event.id,executionParts:Math.max(1,Math.ceil(amount/maxOrder))},202);
  }catch(error){console.error("trader-tradingview-add-funds-ingress",error);return json({error:"add_funds_webhook_failed"},500)}
});
