import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

type Json = Record<string, unknown>;
type BotRow = { id:string; status:string; is_archived:boolean; client_state:Json|null };
type TradeRow = { bot_id:string; realized_pnl:number|string|null; invested:number|string|null; total_invested:number|string|null; closed_at:string|null };
type Bucket = { at:string; pnl:number; capital:number; trades:number; wins:number; roi:number|null; winRate:number|null; expectancy:number|null };

function obj(v:unknown):Json{return v&&typeof v==="object"&&!Array.isArray(v)?v as Json:{}}
function num(v:unknown,f=0){const n=Number(v);return Number.isFinite(n)?n:f}
function cors(req:Request){const origin=req.headers.get("origin")||"";const allowed=origin==="https://platform.labnarrative.com"||/^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin);return{"access-control-allow-origin":allowed?origin:"https://platform.labnarrative.com","access-control-allow-headers":"authorization, x-client-info, apikey, content-type","access-control-allow-methods":"POST, OPTIONS","vary":"Origin"}}
function respond(req:Request,body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{...cors(req),"content-type":"application/json","cache-control":"no-store"}})}
function rangeStart(range:string){if(range==="ytd"){const n=new Date();return new Date(Date.UTC(n.getUTCFullYear(),0,1)).toISOString()}const days=range==="7d"?7:range==="30d"?30:range==="90d"?90:0;return days?new Date(Date.now()-days*86400000).toISOString():null}
function botType(bot:BotRow){return String(obj(bot.client_state).automationType||"")==="tradingview_strategy"?"Strategy Execution":"DCA"}
function allowedBot(bot:BotRow,scope:string,type:string){if(type!=="all"&&botType(bot)!==type)return false;if(scope==="running"&&(bot.is_archived||bot.status!=="Running"))return false;if(scope==="paused"&&(bot.is_archived||bot.status==="Running"))return false;if(scope==="archived"&&!bot.is_archived)return false;return true}
function bucketStart(ms:number,mode:"daily"|"weekly"|"monthly"){const d=new Date(ms);if(mode==="monthly")return Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),1);if(mode==="weekly"){const midnight=Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate());const day=(d.getUTCDay()+6)%7;return midnight-day*86400000}return Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate())}
function aggregate(rows:TradeRow[],mode:"daily"|"weekly"|"monthly"):Bucket[]{const map=new Map<number,{pnl:number;capital:number;trades:number;wins:number}>();for(const row of rows){if(!row.closed_at)continue;const ms=Date.parse(row.closed_at);if(!Number.isFinite(ms))continue;const key=bucketStart(ms,mode);const current=map.get(key)||{pnl:0,capital:0,trades:0,wins:0};const pnl=num(row.realized_pnl);current.pnl+=pnl;current.capital+=Math.max(0,num(row.total_invested??row.invested));current.trades+=1;if(pnl>0)current.wins+=1;map.set(key,current)}return[...map.entries()].sort((a,b)=>a[0]-b[0]).map(([at,v])=>({at:new Date(at).toISOString(),pnl:v.pnl,capital:v.capital,trades:v.trades,wins:v.wins,roi:v.capital>0?v.pnl/v.capital*100:null,winRate:v.trades?v.wins/v.trades*100:null,expectancy:v.trades?v.pnl/v.trades:null}))}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors(req)});
  if(req.method!=="POST")return respond(req,{error:"method_not_allowed"},405);
  const url=Deno.env.get("SUPABASE_URL"),service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!service)return respond(req,{error:"server_configuration_missing"},500);
  const db=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  try{
    const bearer=String(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"").trim();
    if(!bearer)return respond(req,{error:"unauthorized"},401);
    const {data:userData,error:userError}=await db.auth.getUser(bearer);
    if(userError||!userData.user)return respond(req,{error:"unauthorized"},401);
    const body=await req.json().catch(()=>({})) as Json;
    const accountId=String(body.accountId||"").trim(),botId=String(body.botId||"").trim();
    const requestedRange=String(body.range||"30d"),range=["7d","30d","90d","ytd","all"].includes(requestedRange)?requestedRange:"30d";
    const scope=["all","running","paused","archived"].includes(String(body.scope||"all"))?String(body.scope||"all"):"all";
    const type=["all","DCA","Strategy Execution"].includes(String(body.type||"all"))?String(body.type||"all"):"all";
    if(!accountId)return respond(req,{error:"account_required"},400);
    const {data:account,error:accountError}=await db.from("trader_accounts").select("id").eq("id",accountId).eq("owner_user_id",userData.user.id).eq("status","active").maybeSingle();
    if(accountError)throw accountError;if(!account)return respond(req,{error:"account_not_found"},404);
    const {data:botData,error:botError}=await db.from("trader_bots").select("id,status,is_archived,client_state").eq("account_id",accountId);
    if(botError)throw botError;
    const bots=(botData??[]) as BotRow[];
    const ids=botId?bots.filter(b=>b.id===botId).map(b=>b.id):bots.filter(b=>allowedBot(b,scope,type)).map(b=>b.id);
    if(botId&&!ids.length)return respond(req,{error:"bot_not_found"},404);
    if(!ids.length)return respond(req,{ok:true,range,botIds:[],daily:[],weekly:[],monthly:[]});
    const rows:TradeRow[]=[];const pageSize=1000;const since=rangeStart(range);
    for(let offset=0;offset<10000;offset+=pageSize){let q=db.from("trader_trades").select("bot_id,realized_pnl,invested,total_invested,closed_at").eq("account_id",accountId).eq("status","Closed").in("bot_id",ids).order("closed_at",{ascending:true}).range(offset,offset+pageSize-1);if(since)q=q.gte("closed_at",since);const {data,error}=await q;if(error)throw error;const page=(data??[]) as TradeRow[];rows.push(...page);if(page.length<pageSize)break}
    return respond(req,{ok:true,range,botIds:ids,daily:aggregate(rows,"daily"),weekly:aggregate(rows,"weekly"),monthly:aggregate(rows,"monthly")});
  }catch(error){console.error("trader-analytics-activity",error);return respond(req,{error:error instanceof Error?error.message:"activity_failed"},500)}
});
