import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors={"Access-Control-Allow-Origin":"https://platform.labnarrative.com","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const CORE_SLUG="trader-tradingview-strategy-control";
const UNLIMITED_SENTINEL=1_000_000;
type Json=Record<string,unknown>;
type Db=ReturnType<typeof createClient>;

function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{...cors,"content-type":"application/json","cache-control":"no-store"}})}
function n(value:unknown,fallback=0){const parsed=Number(value);return Number.isFinite(parsed)?parsed:fallback}
function obj(value:unknown):Json{return value&&typeof value==="object"&&!Array.isArray(value)?value as Json:{}}
function hasOwn(value:Json,key:string){return Object.prototype.hasOwnProperty.call(value,key)}
function parseLimit(value:unknown,fallback:number|null):number|null{
  if(value===undefined)return fallback;
  if(value===null||String(value).trim().toLowerCase()==="unlimited")return null;
  const raw=n(value,NaN),rounded=Math.round(raw);
  if(!Number.isFinite(raw)||Math.abs(raw-rounded)>1e-9||rounded<1||rounded>100)throw new Error("invalid_max_open_positions");
  return rounded;
}
function storedLimit(row:Record<string,unknown>):number|null{
  const state=obj(row.client_state);
  if(hasOwn(state,"strategyMaxOpenPositions")){
    const raw=state.strategyMaxOpenPositions;
    if(raw===null||String(raw).trim().toLowerCase()==="unlimited")return null;
    const value=Math.round(n(raw));
    if(value>=1&&value<=100)return value;
  }
  const legacy=Math.max(1,Math.round(n(row.max_active_trades,5)));
  return legacy>=UNLIMITED_SENTINEL?null:Math.min(100,legacy);
}
async function ownedAccount(db:Db,userId:string,accountId:string){
  const{data,error}=await db.from("trader_accounts").select("id").eq("id",accountId).eq("owner_user_id",userId).eq("status","active").maybeSingle();
  if(error)throw error;
  if(!data)throw new Error("trader_account_not_owned");
}
async function getStrategy(db:Db,accountId:string,botId:string){
  const{data,error}=await db.from("trader_bots").select("id,client_id,max_active_trades,client_state").eq("account_id",accountId).eq("client_id",botId).maybeSingle();
  if(error)throw error;
  if(!data||String(obj(data.client_state).automationType||"")!=="tradingview_strategy")throw new Error("strategy_not_found");
  return data as Record<string,unknown>;
}
async function patchLimit(db:Db,accountId:string,botId:string,limit:number|null){
  const row=await getStrategy(db,accountId,botId),state=obj(row.client_state),nextState={...state,strategyVersion:5,strategyMaxOpenPositions:limit};
  const{error}=await db.from("trader_bots").update({max_active_trades:limit===null?UNLIMITED_SENTINEL:limit,client_state:nextState,updated_at:new Date().toISOString()}).eq("id",String(row.id));
  if(error)throw error;
}
async function callCore(req:Request,body:Json){
  const base=Deno.env.get("SUPABASE_URL");
  if(!base)throw new Error("server_configuration_missing");
  const headers:Record<string,string>={"content-type":"application/json"};
  const auth=req.headers.get("Authorization");if(auth)headers.authorization=auth;
  const apikey=req.headers.get("apikey");if(apikey)headers.apikey=apikey;
  const response=await fetch(`${base}/functions/v1/${CORE_SLUG}`,{method:"POST",headers,body:JSON.stringify(body),signal:AbortSignal.timeout(12_000)});
  const payload=await response.json().catch(()=>({})) as Json;
  return{response,payload};
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return json({error:"method_not_allowed"},405);
  const base=Deno.env.get("SUPABASE_URL"),service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!base||!service)return json({error:"server_configuration_missing"},500);
  const db=createClient(base,service,{auth:{persistSession:false,autoRefreshToken:false}}),bearer=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"").trim();
  if(!bearer)return json({error:"unauthorized"},401);
  const{data:userData,error:userError}=await db.auth.getUser(bearer),user=userData.user;
  if(userError||!user)return json({error:"unauthorized"},401);
  try{
    const body=await req.json().catch(()=>({})) as Json,accountId=String(body.accountId||"").trim(),action=String(body.action||"strategy_detail");
    if(!accountId)return json({error:"account_id_required"},400);
    await ownedAccount(db,user.id,accountId);
    let desired:number|null|undefined;
    if(action==="create_strategy")desired=parseLimit(body.maxOpenPositions,5);
    else if(action==="update_strategy"){
      const botId=String(body.botId||"").trim();if(!botId)return json({error:"strategy_id_required"},400);
      const current=await getStrategy(db,accountId,botId);desired=parseLimit(body.maxOpenPositions,storedLimit(current));
    }
    const{response,payload}=await callCore(req,body);
    if(!response.ok||payload.ok!==true)return json(payload,response.status);
    const botId=String(payload.botId||body.botId||obj(payload.strategy).id||"").trim();
    if((action==="create_strategy"||action==="update_strategy")&&botId){
      await patchLimit(db,accountId,botId,desired===undefined?5:desired);
      const strategy=obj(payload.strategy);payload.strategy={...strategy,maxOpenPositions:desired===undefined?5:desired};
    }else if(action==="strategy_detail"&&botId){
      const row=await getStrategy(db,accountId,botId),strategy=obj(payload.strategy);payload.strategy={...strategy,maxOpenPositions:storedLimit(row)};
    }
    return json(payload,response.status);
  }catch(error){
    const message=error instanceof Error?error.message:String(error);
    console.error("trader-tradingview-strategy-config",message);
    const safe=new Set(["trader_account_not_owned","strategy_not_found","invalid_max_open_positions","server_configuration_missing"]);
    return json({error:safe.has(message)?message:"tradingview_strategy_config_failed"},message==="trader_account_not_owned"?403:400);
  }
});
