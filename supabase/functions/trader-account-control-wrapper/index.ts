import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors={
  "Access-Control-Allow-Origin":"https://platform.labnarrative.com",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS"
};
type Json=Record<string,unknown>;
type BotMeta={type:"dca"|"tradingview_strategy";marketLabel:string;marketScope:"single"|"multi"|"all"|"dynamic";maxCapital:number|null};
function n(v:unknown,f=0){const x=Number(v);return Number.isFinite(x)?x:f}
function obj(v:unknown):Json{return v&&typeof v==="object"&&!Array.isArray(v)?v as Json:{}}
function strings(v:unknown){return Array.isArray(v)?v.map(x=>String(x||"").trim()).filter(Boolean):[]}
function has(o:Json,key:string){return Object.prototype.hasOwnProperty.call(o,key)}
function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{...cors,"content-type":"application/json","cache-control":"no-store"}})}
function dcaPositionCapital(state:Json){
  let total=Math.max(0,n(state.baseOrder));
  if(state.averagingEnabled===false)return total;
  const count=Math.max(0,Math.round(n(state.maxSafetyOrders)));
  const safety=Math.max(0,n(state.safetyOrder));
  const scale=Math.max(0.000001,n(state.volumeScale,1));
  for(let index=0;index<count;index+=1)total+=safety*Math.pow(scale,index);
  return total;
}
function botMetaFromState(state:Json):BotMeta{
  const type=String(state.automationType||"")==="tradingview_strategy"?"tradingview_strategy":"dca";
  if(type==="tradingview_strategy")return{type,marketLabel:"From TradingView",marketScope:"dynamic",maxCapital:null};
  const allPairs=state.allPairs===true,pairs=strings(state.pairs),pair=String(state.pair||"").trim();
  const marketScope=allPairs?"all":pairs.length>1?"multi":"single";
  const marketLabel=allPairs?"All coins":pairs.length>1?"Multi coins":pairs[0]||pair||"—";
  const maxActive=Math.max(1,Math.round(n(state.maxActiveTrades,1)));
  const marketCapacity=allPairs?maxActive:Math.max(1,pairs.length||1);
  const concurrent=Math.max(1,Math.min(maxActive,marketCapacity));
  return{type,marketLabel,marketScope,maxCapital:dcaPositionCapital(state)*concurrent};
}
function firstTpPct(tradeState:Json,botState:Json,fallback:number){
  const candidates=[tradeState.takeProfitTargets,botState.takeProfitTargets];
  for(const candidate of candidates){
    if(!Array.isArray(candidate))continue;
    const values=candidate.map(item=>n(obj(item).profitPct)).filter(value=>value>0).sort((a,b)=>a-b);
    if(values.length)return values[0];
  }
  const direct=[tradeState.takeProfit,botState.takeProfit,botState.takeProfitPct,fallback].map(value=>n(value)).find(value=>value>0);
  return direct??0;
}
function enrichDcaLevels(trade:Json,tradeState:Json,botState:Json){
  const avg=n(trade.averagePrice),entry=n(trade.entryPrice,avg);
  const tpPct=firstTpPct(tradeState,botState,n(trade.takeProfitPct));
  if(tpPct>0){
    trade.takeProfitPct=tpPct;
    trade.takeProfitPrice=avg>0?avg*(1+tpPct/100):trade.takeProfitPrice??null;
  }

  const stopEnabled=has(tradeState,"stopEnabled")?tradeState.stopEnabled===true:has(botState,"stopEnabled")?botState.stopEnabled===true:trade.stopEnabled===true;
  const stopPct=has(tradeState,"stopPct")?n(tradeState.stopPct):has(botState,"stopPct")?n(botState.stopPct):n(trade.stopPct);
  trade.stopEnabled=stopEnabled;
  trade.stopPct=stopPct;
  trade.stopLossPrice=stopEnabled&&stopPct>0&&avg>0?avg*(1-stopPct/100):null;

  const status=String(trade.status||"");
  const averagingEnabled=has(tradeState,"averagingEnabled")?tradeState.averagingEnabled!==false:botState.averagingEnabled!==false;
  const filled=Math.max(0,Math.round(n(trade.averagingFilled)));
  const max=Math.max(0,Math.round(n(trade.maxAveraging,n(botState.maxSafetyOrders))));
  const deviation=n(botState.deviation);
  const stepScale=Math.max(0.000001,n(botState.stepScale,1));
  let next:number|null=null;
  if(status==="Active"&&averagingEnabled&&filled<max&&entry>0&&deviation>0){
    let cumulative=0,step=deviation;
    for(let index=0;index<=filled;index+=1){cumulative+=step;step*=stepScale;}
    const price=entry*(1-cumulative/100);
    if(Number.isFinite(price)&&price>0)next=price;
  }
  trade.nextAveragingPrice=next;
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return json({error:"method_not_allowed"},405);
  const url=Deno.env.get("SUPABASE_URL"),service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!service)return json({error:"server_configuration_missing"},500);
  const raw=await req.text();
  const body=(()=>{try{return JSON.parse(raw||"{}") as Json}catch{return{}}})();

  // TradingView Strategy positions must be closed by TradingView (or the position
  // close path) before the automation can be archived. Enforce this server-side,
  // not only through the disabled Archive button in the browser.
  if(String(body.action||"")==="close_bot"){
    const accountId=String(body.accountId||"").trim(),botId=String(body.botId||"").trim();
    const bearer=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"").trim();
    if(accountId&&botId&&bearer){
      try{
        const guardDb=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
        const{data:userData}=await guardDb.auth.getUser(bearer),user=userData.user;
        if(user){
          const{data:account,error:accountError}=await guardDb.from("trader_accounts").select("id").eq("id",accountId).eq("owner_user_id",user.id).eq("status","active").maybeSingle();
          if(accountError)throw accountError;
          if(account){
            const{data:bot,error:botError}=await guardDb.from("trader_bots").select("id,client_state").eq("account_id",accountId).eq("client_id",botId).maybeSingle();
            if(botError)throw botError;
            if(bot&&String(obj(bot.client_state).automationType||"")==="tradingview_strategy"){
              const{count,error:tradeError}=await guardDb.from("trader_trades").select("id",{count:"exact",head:true}).eq("account_id",accountId).eq("bot_id",bot.id).eq("status","Active");
              if(tradeError)throw tradeError;
              if((count??0)>0)return json({error:"strategy_has_active_position"},409);
            }
          }
        }
      }catch(error){
        console.error("trader-account-control-archive-guard",error);
        return json({error:"trader_account_control_failed"},400);
      }
    }
  }

  let response:Response;
  try{
    response=await fetch(`${url}/functions/v1/trader-account-control-core`,{
      method:"POST",
      headers:{"content-type":"application/json","authorization":req.headers.get("Authorization")||"","apikey":service},
      body:raw||"{}"
    });
  }catch(error){console.error("trader-account-control-wrapper",error);return json({error:"trader_account_control_failed"},400)}

  const text=await response.text();
  let payload:Json;
  try{payload=JSON.parse(text) as Json}catch{return new Response(text,{status:response.status,headers:{...cors,"content-type":"application/json"}})}
  if(!response.ok||payload.error||!Array.isArray(payload.trades))return json(payload,response.status);

  try{
    const trades=payload.trades as Json[],accountId=String(body.accountId||"");
    if(accountId){
      const db=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
      const botMeta=new Map<string,BotMeta>();
      const botStates=new Map<string,Json>();
      const{data:dbBots,error:botError}=await db.from("trader_bots").select("client_id,client_state").eq("account_id",accountId);
      if(botError)throw botError;
      for(const row of dbBots??[]){
        const id=String(row.client_id),state=obj(row.client_state);
        botMeta.set(id,botMetaFromState(state));
        botStates.set(id,state);
      }
      if(Array.isArray(payload.bots))for(const bot of payload.bots as Json[]){
        const id=String(bot.id||""),meta=botMeta.get(id)??{type:"dca" as const,marketLabel:String(bot.pair||"—"),marketScope:"single" as const,maxCapital:null};
        bot.automationType=meta.type;
        bot.marketLabel=meta.marketLabel;
        bot.marketScope=meta.marketScope;
        bot.maxCapital=meta.maxCapital;
        bot.executedCount=n(bot.activeTradeCount)+n(bot.closedTradeCount);
        if(meta.type==="tradingview_strategy")bot.startCondition="TradingView Strategy";
      }
      for(const trade of trades){
        const type=botMeta.get(String(trade.botId||""))?.type||"dca";
        trade.automationType=type;
        if(type==="tradingview_strategy"){
          trade.takeProfitPct=0;
          trade.takeProfitPrice=null;
          trade.stopEnabled=false;
          trade.stopPct=0;
          trade.stopLossPrice=null;
          trade.nextAveragingPrice=null;
          trade.averagingFilled=0;
          trade.maxAveraging=0;
          trade.activeOrdersLimit=0;
        }
      }

      if(trades.length){
        const clientIds=trades.map(t=>String(t.id||"")).filter(Boolean);
        const{data:dbTrades,error:tradeError}=await db.from("trader_trades")
          .select("id,client_id,total_invested,status,client_state")
          .eq("account_id",accountId)
          .in("client_id",clientIds);
        if(tradeError)throw tradeError;

        const lifetime=new Map<string,number>();
        const tradeStates=new Map<string,Json>();
        for(const row of dbTrades??[]){
          const id=String(row.client_id);
          lifetime.set(id,n(row.total_invested));
          tradeStates.set(id,obj(row.client_state));
        }

        let activeRealized=0,activeLifetime=0;
        const botPnl=new Map<string,number>(),botLifetime=new Map<string,number>();
        for(const trade of trades){
          const id=String(trade.id||""),status=String(trade.status||""),realized=n(trade.realizedPnl),oldPnl=n(trade.pnl),corrected=status==="Active"?oldPnl+realized:oldPnl,capital=lifetime.get(id)||0;
          const botId=String(trade.botId||"");
          const type=botMeta.get(botId)?.type||"dca";
          if(type==="dca")enrichDcaLevels(trade,tradeStates.get(id)??{},botStates.get(botId)??{});
          const remainingCostBasis=n(trade.invested);
          trade.remainingCostBasis=remainingCostBasis;
          trade.lifetimeInvested=capital;
          trade.invested=capital;
          trade.pnl=corrected;
          trade.pnlPct=capital>0?corrected/capital*100:0;
          if(status==="Active"){activeRealized+=realized;activeLifetime+=capital;}
          if(botId){botPnl.set(botId,(botPnl.get(botId)||0)+corrected);botLifetime.set(botId,(botLifetime.get(botId)||0)+capital);}
        }

        const account=obj(payload.account);
        if(Object.keys(account).length){
          account.realizedPnl=n(account.realizedPnl)+activeRealized;
          account.available=n(account.available)+activeRealized;
          account.equity=n(account.equity)+activeRealized;
          account.remainingCostBasis=n(account.invested);
          account.invested=activeLifetime;
          account.lifetimeInvested=activeLifetime;
          payload.account=account;
        }

        if(Array.isArray(payload.bots))for(const bot of payload.bots as Json[]){
          const id=String(bot.id||"");if(!id)continue;
          const pnl=botPnl.get(id),capital=botLifetime.get(id)||0;
          if(pnl!==undefined)bot.pnl=pnl;
          bot.lifetimeInvested=capital;
          if("invested" in bot)bot.invested=capital;
          if(capital>0)bot.pnlPct=n(pnl)/capital*100;
        }
      }
    }
  }catch(error){console.error("trader-account-control-wrapper",error)}
  return json(payload,response.status);
});
