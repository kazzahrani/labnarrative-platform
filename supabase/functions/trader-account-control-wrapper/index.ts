import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors={
  "Access-Control-Allow-Origin":"https://platform.labnarrative.com",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS"
};
type Json=Record<string,unknown>;
function n(v:unknown,f=0){const x=Number(v);return Number.isFinite(x)?x:f}
function obj(v:unknown):Json{return v&&typeof v==="object"&&!Array.isArray(v)?v as Json:{}}
function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{...cors,"content-type":"application/json","cache-control":"no-store"}})}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return json({error:"method_not_allowed"},405);
  const url=Deno.env.get("SUPABASE_URL"),service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!service)return json({error:"server_configuration_missing"},500);
  const raw=await req.text();
  const body=(()=>{try{return JSON.parse(raw||"{}") as Json}catch{return{}}})();
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
      const botTypes=new Map<string,string>();
      const{data:dbBots,error:botError}=await db.from("trader_bots").select("client_id,client_state").eq("account_id",accountId);
      if(botError)throw botError;
      for(const row of dbBots??[]){
        const state=obj(row.client_state),type=String(state.automationType||"")==="tradingview_strategy"?"tradingview_strategy":"dca";
        botTypes.set(String(row.client_id),type);
      }
      if(Array.isArray(payload.bots))for(const bot of payload.bots as Json[]){
        const id=String(bot.id||"");
        const type=botTypes.get(id)||"dca";
        bot.automationType=type;
        if(type==="tradingview_strategy")bot.startCondition="TradingView Strategy";
      }
      for(const trade of trades){
        const type=botTypes.get(String(trade.botId||""))||"dca";
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
          .select("id,client_id,total_invested,status")
          .eq("account_id",accountId)
          .in("client_id",clientIds);
        if(tradeError)throw tradeError;

        const lifetime=new Map<string,number>();
        for(const row of dbTrades??[])lifetime.set(String(row.client_id),n(row.total_invested));

        let activeRealized=0,activeLifetime=0;
        const botPnl=new Map<string,number>(),botLifetime=new Map<string,number>();
        for(const trade of trades){
          const id=String(trade.id||""),status=String(trade.status||""),realized=n(trade.realizedPnl),oldPnl=n(trade.pnl),corrected=status==="Active"?oldPnl+realized:oldPnl,capital=lifetime.get(id)||0;
          const remainingCostBasis=n(trade.invested);
          trade.remainingCostBasis=remainingCostBasis;
          trade.lifetimeInvested=capital;
          trade.invested=capital;
          trade.pnl=corrected;
          trade.pnlPct=capital>0?corrected/capital*100:0;
          if(status==="Active"){activeRealized+=realized;activeLifetime+=capital;}
          const botId=String(trade.botId||"");
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
