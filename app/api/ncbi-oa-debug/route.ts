import type { NextRequest } from "next/server";
export const runtime="nodejs"; export const dynamic="force-dynamic";
export async function GET(request:NextRequest){
 const pmcid=(request.nextUrl.searchParams.get("pmcid")||"").toUpperCase();
 if(!/^PMC\d+$/.test(pmcid)) return new Response("invalid",{status:400});
 const u=new URL("https://www.ncbi.nlm.nih.gov/pmc/utils/oa/oa.fcgi");u.searchParams.set("id",pmcid);
 const r=await fetch(u,{headers:{"User-Agent":"LabNarrative-NCBI-OA-Debug/1.0 (+https://labnarrative.com)",Accept:"application/xml,text/xml"},cache:"no-store"});
 const raw=await r.text();
 const safe=raw.replace(/<\?xml[^>]*>/g,"").slice(0,5000);
 return new Response(safe,{status:r.status,headers:{"Content-Type":"text/plain; charset=utf-8","Cache-Control":"no-store"}});
}
