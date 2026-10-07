import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { analyzeArticle, productTerms, type ProductInput } from "../_pubmed";
import { refineRanking } from "../_rank";

const SUPABASE_URL=process.env.NEXT_PUBLIC_PVOS_SUPABASE_URL??"https://kvhmxjfenjtzfavyhnvb.supabase.co";
const SUPABASE_KEY=process.env.NEXT_PUBLIC_PVOS_SUPABASE_PUBLISHABLE_KEY??"sb_publishable_3x3ll4gYAdqi9TAnPzNnMA_BxJKNM8D";

type SourceInput={id:string;name:string;url:string;metadata?:Record<string,any>};
type ProductWithId=ProductInput&{id:string};

async function requireUser(req:NextRequest,bodyToken?:string){
  const auth=req.headers.get("authorization")??"";
  const headerToken=auth.startsWith("Bearer ")?auth.slice(7):"";
  const token=headerToken||String(bodyToken||"");
  if(!token)return null;
  const supabase=createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await supabase.auth.getUser(token);
  if(error||!data.user)return null;
  return data.user;
}
function decode(v:string){
  return v
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,"$1")
    .replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">")
    .replace(/&quot;/g,'"').replace(/&apos;/g,"'")
    .replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCharCode(parseInt(n,16)));
}
function clean(v:string){
  return decode(String(v||"").replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim());
}
function tag(block:string,name:string){
  const m=block.match(new RegExp("<"+name+"(?:\\s[^>]*)?>([\\s\\S]*?)<\\/"+name+">","i"));
  return m?clean(m[1]):"";
}
function parseDate(v:string){
  const d=new Date(v);
  return Number.isNaN(d.getTime())?null:d.toISOString().slice(0,10);
}
function within(date:string|null,start:string,end:string){
  if(!date)return true;
  return date>=start&&date<=end;
}
function currentPeriod(periodStart:string,periodEnd:string){
  const end=new Date(periodEnd+"T23:59:59Z").getTime();
  const now=Date.now();
  return Math.abs(now-end)<=45*86400000;
}
async function fetchText(url:string){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),12000);
  try{
    const res=await fetch(url,{
      redirect:"follow",
      cache:"no-store",
      signal:controller.signal,
      headers:{
        "User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/154 Safari/537.36",
        "Accept":"application/rss+xml,application/xml,text/xml,text/html;q=0.9,*/*;q=0.5",
        "Accept-Language":"en-US,en;q=0.9"
      }
    });
    const text=await res.text();
    return {ok:res.ok,status:res.status,url:res.url,contentType:res.headers.get("content-type")||"",text};
  }catch(e:any){
    return {ok:false,status:0,url,contentType:"",text:"",error:e?.message||"fetch failed"};
  }finally{
    clearTimeout(timer);
  }
}
function rssItems(xml:string){
  const out:any[]=[];
  for(const m of xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)){
    const block=m[0];
    const title=tag(block,"title");
    const link=tag(block,"link")||tag(block,"guid");
    const description=tag(block,"description")||tag(block,"content:encoded");
    const date=parseDate(tag(block,"pubDate")||tag(block,"dc:date"));
    if(title)out.push({title,link,description,date});
  }
  return out;
}
function htmlItems(html:string,base:string){
  const out:any[]=[];
  const seen=new Set<string>();
  const re=/<a\b[^>]*href=["']([^"']*(?:\/Abstract\/|\/Fulltext\/)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for(const m of html.matchAll(re)){
    let href=decode(m[1]);
    const title=clean(m[2]);
    if(!title||title.length<12)continue;
    try{href=new URL(href,base).toString();}catch{}
    const key=(href||title).toLowerCase();
    if(seen.has(key))continue;
    seen.add(key);
    out.push({title,link:href,description:"",date:null});
  }
  return out;
}
function feedCandidates(source:SourceInput){
  const slug=String(source.metadata?.lww_slug||"").trim();
  const stored=String(source.metadata?.feed_url||"").trim();
  const urls:string[]=[];
  if(stored)urls.push(stored);
  if(slug){
    urls.push(
      "https://journals.lww.com/"+slug+"/_layouts/15/OAKS.Journals/feed.aspx?FeedType=CurrentIssue",
      "https://cdn.journals.lww.com/"+slug+"/_layouts/OAKS.Journals/feed.aspx?FeedType=CurrentIssue",
      "https://journals.lww.com/"+slug+"/pages/currenttoc.aspx"
    );
  }
  return [...new Set(urls)];
}
function makeOutput(source:SourceInput,raw:any,product:ProductWithId,retrievedAt:string,route:string){
  const terms=productTerms(product);
  const analysis=refineRanking(
    analyzeArticle(raw.title,raw.description||"",[],terms),
    raw.title,
    raw.description||"",
    terms
  );
  if(!analysis.matchedTerms.length)return null;
  return {
    product_id:product.id,
    title:raw.title,
    journal:source.name,
    publication_date:raw.date,
    article_url:raw.link||source.url,
    doi:null,
    abstract:raw.description||null,
    matched_terms:analysis.matchedTerms,
    relevance:analysis.relevance,
    ai_reason:analysis.reason,
    metadata:{
      connector:"lww_direct",
      source_platform:"LWW",
      source_name:source.name,
      source_url:source.url,
      source_retrieved_at:retrievedAt,
      retrieval_route:route,
      direct_source_monitoring:true,
      saudi_journal:true,
      pubmed_indexed:!!source.metadata?.pubmed_indexed,
      full_text_required:analysis.fullTextRequired,
      assessment_state:analysis.assessmentState,
      publication_context:analysis.publicationContext,
      product_role:analysis.productRole,
      finding_types:analysis.findingTypes,
      urgent_saudi:true,
      saudi_hits:["Saudi journal source"],
      safety_hits:analysis.safetyHits,
      special_hits:analysis.specialHits,
      lack_efficacy_hits:analysis.lackEfficacyHits,
      interaction_hits:analysis.interactionHits,
      case_hits:analysis.caseHits,
      product_safety_hits:analysis.productSafetyHits,
      product_special_hits:analysis.productSpecialHits,
      product_lack_efficacy_hits:analysis.productLackEfficacyHits,
      product_interaction_hits:analysis.productInteractionHits,
      prioritization_version:analysis.analysisVersion
    }
  };
}

export async function POST(req:NextRequest){
  try{
    const body=await req.json();
    const user=await requireUser(req,body?.accessToken);
    if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});

    const periodStart=String(body?.periodStart||"");
    const periodEnd=String(body?.periodEnd||"");
    const products=(Array.isArray(body?.products)?body.products:[]) as ProductWithId[];
    const sources=(Array.isArray(body?.sources)?body.sources:[]) as SourceInput[];

    if(!currentPeriod(periodStart,periodEnd)){
      return NextResponse.json({
        connector:"lww_direct",
        skipped:true,
        reason:"Direct LWW current-issue monitoring is only used for recent screening periods.",
        items:[],
        reports:sources.map(s=>({source_id:s.id,name:s.name,status:"skipped_historical",direct:false}))
      });
    }

    const retrievedAt=new Date().toISOString();
    const items:any[]=[];
    const reports:any[]=[];

    for(const source of sources){
      const attempts:any[]=[];
      let chosen:any=null;
      let parsed:any[]=[];

      for(const url of feedCandidates(source)){
        const res=await fetchText(url);
        const blocked=res.status===401||res.status===403||/access denied|captcha|cloudflare/i.test(res.text.slice(0,5000));
        let rows:any[]=[];
        if(res.ok&&!blocked){
          rows=/<(rss|feed)\b/i.test(res.text)?rssItems(res.text):htmlItems(res.text,res.url||url);
        }
        attempts.push({url,status:res.status,ok:res.ok,blocked,items:rows.length,content_type:res.contentType});
        if(res.ok&&!blocked&&rows.length){
          chosen={url:res.url||url,route:/<(rss|feed)\b/i.test(res.text)?"LWW RSS":"LWW current TOC"};
          parsed=rows;
          break;
        }
      }

      if(!chosen){
        const blocked=attempts.some(a=>a.blocked);
        reports.push({
          source_id:source.id,
          name:source.name,
          status:blocked?"blocked":"unavailable",
          direct:false,
          attempts
        });
        continue;
      }

      const periodRows=parsed.filter(x=>within(x.date,periodStart,periodEnd));
      let matched=0;
      for(const raw of periodRows){
        for(const product of products){
          const out=makeOutput(source,raw,product,retrievedAt,chosen.route);
          if(out){items.push(out);matched++;}
        }
      }
      reports.push({
        source_id:source.id,
        name:source.name,
        status:"ok",
        direct:true,
        route:chosen.route,
        url:chosen.url,
        retrieved:periodRows.length,
        feed_items:parsed.length,
        matched,
        attempts
      });
    }

    const deduped:any[]=[];
    const seen=new Set<string>();
    for(const item of items){
      const key=item.product_id+"::"+String(item.article_url||item.title).toLowerCase();
      if(seen.has(key))continue;
      seen.add(key);deduped.push(item);
    }

    return NextResponse.json({
      connector:"lww_direct",
      sources_checked:sources.length,
      direct_sources_ok:reports.filter(r=>r.status==="ok").length,
      blocked_sources:reports.filter(r=>r.status==="blocked").length,
      results:deduped.length,
      items:deduped,
      reports,
      retrieved_at:retrievedAt
    });
  }catch(e:any){
    return NextResponse.json({error:e?.message||"Direct LWW monitoring failed."},{status:500});
  }
}
