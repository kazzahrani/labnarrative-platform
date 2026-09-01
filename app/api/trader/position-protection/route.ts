import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 15;

type Json = Record<string, unknown>;
function json(body: unknown, status = 200) { return Response.json(body,{status,headers:{"cache-control":"private, no-store, max-age=0"}}); }
function obj(value: unknown): Json { return value && typeof value === "object" && !Array.isArray(value) ? value as Json : {}; }
function permittedHost(host:string){return host==="platform.labnarrative.com"||host==="app.labnarrative.com"||host==="localhost"||host==="127.0.0.1"||(process.env.VERCEL_ENV!=="production"&&host.endsWith(".vercel.app"));}
function permittedOrigin(origin:string,host:string){if(!origin)return true;try{return new URL(origin).hostname.toLowerCase()===host;}catch{return false;}}

export async function POST(request:NextRequest){
  const host=(request.headers.get("host")||"").split(":")[0].toLowerCase();
  if(!permittedHost(host)) return json({error:"not_found"},404);
  if(!permittedOrigin(request.headers.get("origin")||"",host)) return json({error:"origin_not_allowed"},403);
  const authorization=request.headers.get("authorization")||"";
  if(!/^Bearer\s+\S+/i.test(authorization)) return json({error:"unauthorized"},401);
  const supabaseUrl=process.env.NEXT_PUBLIC_SUPABASE_URL||"";
  const apikey=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||"";
  if(!supabaseUrl||!apikey) return json({error:"server_configuration_missing"},500);
  const body=obj(await request.json().catch(()=>({})));
  const tradeId=String(body.tradeId||"").trim(),kind=String(body.kind||"").toLowerCase();
  if(!tradeId) return json({error:"position_not_found"},404);
  if(kind!=="sl"&&kind!=="tp") return json({error:"invalid_protection_kind"},400);
  try{
    const response=await fetch(`${supabaseUrl.replace(/\/$/,"")}/functions/v1/trader-v2-position-protection`,{
      method:"POST",
      headers:{authorization,apikey,"content-type":"application/json","x-client-info":"labnarrative-v1-fast-protection/1"},
      body:JSON.stringify({tradeId,kind,enabled:body.enabled!==false,pct:body.pct}),
      cache:"no-store",
      signal:AbortSignal.timeout(8000),
    });
    const text=await response.text();
    let payload:unknown=null;try{payload=text?JSON.parse(text):null;}catch{payload=text||null;}
    if(!response.ok){const data=obj(payload);return json({error:String(data.error||`protection_http_${response.status}`)},response.status);}
    return json(payload,200);
  }catch(error){
    const name=error instanceof Error?error.name:"position_protection_transport_failed";
    return json({error:name==="TimeoutError"||name==="AbortError"?"position_protection_timeout":"position_protection_transport_failed"},502);
  }
}
