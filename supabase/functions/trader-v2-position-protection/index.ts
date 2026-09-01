import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

type Json = Record<string, unknown>;
function obj(value: unknown): Json { return value && typeof value === "object" && !Array.isArray(value) ? value as Json : {}; }
function n(value: unknown, fallback = 0) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; }
function clean(error: unknown) { return (error instanceof Error ? error.message : String(error || "unknown_error")).slice(0, 160); }
function cors(req: Request) { const origin=req.headers.get("origin")||""; const allowed=origin==="https://platform.labnarrative.com"||origin==="https://app.labnarrative.com"||/^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin); return {"Access-Control-Allow-Origin":allowed?origin:"https://platform.labnarrative.com","Vary":"Origin","Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info","Access-Control-Allow-Methods":"POST, OPTIONS"}; }
function json(req: Request, body: unknown, status=200) { return new Response(JSON.stringify(body),{status,headers:{...cors(req),"content-type":"application/json","cache-control":"private, no-store"}}); }
function uuid(value:string){return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);}
async function sleep(ms:number){await new Promise(resolve=>setTimeout(resolve,ms));}

Deno.serve(async (req:Request)=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:cors(req)});
  if(req.method!=="POST") return json(req,{error:"method_not_allowed"},405);
  const url=Deno.env.get("SUPABASE_URL"), key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!key) return json(req,{error:"server_configuration_missing"},500);
  const token=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"").trim();
  if(!token) return json(req,{error:"unauthorized"},401);
  const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:userData,error:userError}=await db.auth.getUser(token);
  if(userError||!userData.user) return json(req,{error:"unauthorized"},401);
  let lockId="", accountId="", lockHeld=false;
  try{
    const body=obj(await req.json().catch(()=>({})));
    const tradeRef=String(body.tradeId||"").trim(), kind=String(body.kind||"").toLowerCase();
    const enabled=body.enabled!==false, pct=Math.round(Math.max(0,Math.min(1000,n(body.pct)))*10000)/10000;
    if(!tradeRef) throw new Error("position_not_found");
    if(kind!=="sl"&&kind!=="tp") throw new Error("invalid_protection_kind");
    if(enabled&&!(pct>0)) throw new Error(kind==="sl"?"invalid_stop_loss":"invalid_take_profit");

    const tradeQuery=db.from("trader_trades").select("id,account_id,bot_id,client_id,pair,status,execution_mode,client_state,take_profit_pct,stop_enabled,stop_pct");
    const {data:trade,error:tradeError}=uuid(tradeRef)?await tradeQuery.eq("id",tradeRef).maybeSingle():await tradeQuery.eq("client_id",tradeRef).maybeSingle();
    if(tradeError) throw tradeError;
    if(!trade) throw new Error("position_not_found");
    accountId=String(trade.account_id||"");
    const [{data:account,error:accountError},{data:control,error:controlError}]=await Promise.all([
      db.from("trader_accounts").select("id,owner_user_id,account_kind,mode,status").eq("id",accountId).maybeSingle(),
      db.from("trader_execution_controls").select("global_live_enabled,kill_switch").eq("account_id",accountId).maybeSingle(),
    ]);
    if(accountError) throw accountError;
    if(controlError) throw controlError;
    if(!account||String(account.owner_user_id)!==userData.user.id) throw new Error("position_not_found");
    if(account.status!=="active"||trade.status!=="Active") throw new Error("position_not_active");
    if(account.account_kind==="real"){
      if(account.mode!=="live"||trade.execution_mode!=="live"||!control||control.global_live_enabled!==true||control.kill_switch!==false) throw new Error("live_trading_not_enabled");
    } else if(account.account_kind==="paper") {
      if(trade.execution_mode!=="paper") throw new Error("position_mode_not_supported");
    } else throw new Error("position_mode_not_supported");

    lockId=crypto.randomUUID();
    for(let attempt=0;attempt<4&&!lockHeld;attempt++){
      const {data:locked,error:lockError}=await db.rpc("trader_begin_exit_command",{p_account_id:accountId,p_lock_id:lockId,p_lease_seconds:8});
      if(lockError) throw lockError;
      lockHeld=locked===true;
      if(!lockHeld&&attempt<3) await sleep(180);
    }
    if(!lockHeld) throw new Error("position_protection_busy");

    const {data:fresh,error:freshError}=await db.from("trader_trades").select("id,account_id,bot_id,client_id,pair,status,execution_mode,client_state,take_profit_pct,stop_enabled,stop_pct").eq("id",trade.id).maybeSingle();
    if(freshError) throw freshError;
    if(!fresh||fresh.status!=="Active") throw new Error("position_not_active");
    const state=obj(fresh.client_state);
    if(state.exitStrategyV2!==true) throw new Error("exit_strategy_v2_required");
    const now=new Date().toISOString();
    let patch:Json={updated_at:now};
    if(kind==="sl"){
      delete state.stopLossTriggeredAt;
      state.stopEnabled=enabled;
      state.stopPct=enabled?pct:0;
      patch={...patch,stop_enabled:enabled,stop_pct:enabled?pct:0,client_state:state};
    }else{
      state.takeProfitFilled=[];
      state.takeProfitTargets=enabled?[{profitPct:pct,allocationPct:100}]:[];
      patch={...patch,take_profit_pct:enabled?pct:0,client_state:state};
    }
    const {data:updated,error:updateError}=await db.from("trader_trades").update(patch).eq("id",fresh.id).eq("status","Active").select("id").maybeSingle();
    if(updateError) throw updateError;
    if(!updated) throw new Error("position_not_active");
    await db.from("trader_broker_events").insert({account_id:fresh.account_id,bot_id:fresh.bot_id,trade_id:fresh.id,mode:fresh.execution_mode,event_type:"position_protection_updated_v2",pair:fresh.pair,payload:{kind,enabled,pct:enabled?pct:0,coreV2:true,fastPath:true}}).catch(()=>undefined);
    return json(req,{ok:true,positionId:fresh.id,clientId:fresh.client_id,pair:fresh.pair,kind,enabled,pct:enabled?pct:0,appliedAt:now});
  }catch(error){
    const code=clean(error);
    const known=["position_not_found","position_not_active","position_mode_not_supported","live_trading_not_enabled","invalid_protection_kind","invalid_stop_loss","invalid_take_profit","position_protection_busy","exit_strategy_v2_required"].includes(code);
    const status=code==="position_not_found"?404:code==="live_trading_not_enabled"?403:code==="position_protection_busy"?409:400;
    return json(req,{error:known?code:"position_protection_failed"},status);
  }finally{
    if(lockHeld&&accountId&&lockId) await db.rpc("trader_release_exit_account",{p_account_id:accountId,p_worker_id:lockId}).catch(()=>undefined);
  }
});