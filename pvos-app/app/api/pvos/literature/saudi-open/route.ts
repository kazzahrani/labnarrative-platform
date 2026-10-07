import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { analyzeArticle, productTerms, type ProductInput } from "../_pubmed";
import { refineRanking } from "../_rank";
import { unusableJournalPage, scanSaudiJournal, parseSaudiJournalArticle } from "../_sources";

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
  return String(v||"")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,"$1")
    .replace(/&nbsp;/gi," ")
    .replace(/&amp;/gi,"&").replace(/&lt;/gi,"<").replace(/&gt;/gi,">")
    .replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'")
    .replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCharCode(parseInt(n,16)));
}
function clean(v:string){
  return decode(String(v||"").replace(/<script\b[\s\S]*?<\/script>/gi," ").replace(/<style\b[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim());
}
function attr(tag:string,name:string){
  return tag.match(new RegExp(name+'=["\\\']([^"\\\']+)["\\\']',"i"))?.[1]||"";
}
function meta(html:string,names:string[]){
  const wanted=new Set(names.map(x=>x.toLowerCase()));
  for(const m of html.matchAll(/<meta\b[^>]*>/gi)){
    const tag=m[0];
    const key=(attr(tag,"name")||attr(tag,"property")).toLowerCase();
    if(!wanted.has(key))continue;
    const value=attr(tag,"content");
    if(value)return clean(value);
  }
  return "";
}
function canonical(html:string,base:string){
  for(const m of html.matchAll(/<link\b[^>]*>/gi)){
    const tag=m[0];
    if(attr(tag,"rel").toLowerCase()==="canonical"){
      try{return new URL(attr(tag,"href"),base).toString();}catch{}
    }
  }
  return base;
}
function parseDate(v:string){
  if(!v)return null;
  const direct=v.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if(direct)return direct[1]+"-"+direct[2]+"-"+direct[3];
  const d=new Date(v);
  return Number.isNaN(d.getTime())?null:d.toISOString().slice(0,10);
}
function doiFrom(html:string){
  const m=html.match(/\b10\.\d{4,9}\/[-._;()/:A-Z0-9]+\b/i);
  return m?m[0].replace(/[),.;]+$/,""):null;
}
function abstractFrom(html:string){
  const fromMeta=meta(html,["citation_abstract","dc.description","dcterms.abstract"]);
  if(fromMeta&&fromMeta.length>80)return fromMeta;
  const section=html.match(/<(?:h2|h3)[^>]*>\s*Abstract\s*<\/(?:h2|h3)>([\s\S]*?)(?=<(?:h2|h3)\b|<footer\b|$)/i)?.[1]||
    html.match(/<div[^>]+class=["'][^"']*abstract[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1]||"";
  const text=clean(section);
  return text.length>80?text:meta(html,["description","og:description","twitter:description"]);
}
function titleFrom(html:string,fallback:string){
  return meta(html,["citation_title","dc.title","og:title"])||
    clean(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]||"")||
    fallback;
}
function publicationDateFrom(html:string){
  const m=meta(html,["citation_publication_date","article:published_time","dc.date","date"]);
  if(m)return parseDate(m);
  const text=clean(html.slice(0,220000));
  return parseDate(
    text.match(/\bPublished\s*:\s*([^|]{4,30})/i)?.[1]||
    text.match(/\b(?:Original Research Article|Review Article|Case Report)\s*\|\s*([A-Za-z]{3,9}\.?\s+\d{1,2},\s+20\d{2})/i)?.[1]||
    ""
  );
}
async function fetchHtml(url:string){
  let last:any={ok:false,status:0,url,text:"",contentType:"",error:"fetch failed"};
  for(let attempt=0;attempt<2;attempt++){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),20000);
    try{
      const res=await fetch(url,{
        redirect:"follow",
        cache:"no-store",
        signal:controller.signal,
        headers:{
          "User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/154 Safari/537.36",
          "Accept":"text/html,application/xhtml+xml;q=0.9,*/*;q=0.6",
          "Accept-Language":"en-US,en;q=0.9"
        }
      });
      const text=await res.text();
      last={ok:res.ok,status:res.status,url:res.url||url,text,contentType:res.headers.get("content-type")||""};
      if(res.ok)return last;
    }catch(e:any){
      last={ok:false,status:0,url,text:"",contentType:"",error:e?.message||"fetch failed"};
    }finally{clearTimeout(timer);}
    if(attempt===0)await new Promise(r=>setTimeout(r,700));
  }
  return last;
}
function scanUrls(source:SourceInput){
  const configured=Array.isArray(source.metadata?.direct_scan_urls)?source.metadata.direct_scan_urls:[];
  return [...new Set([
    ...configured.map((x:any)=>String(x||"").trim()),
    String(source.metadata?.direct_scan_url||"").trim(),
    String(source.url||"").trim()
  ].filter(Boolean))];
}
function articleCandidates(html:string,base:string,platform:string,metadata:Record<string,any>={}){
  const out:{url:string;title:string}[]=[];
  const seen=new Set<string>();
  const baseHost=(()=>{try{return new URL(base).host}catch{return ""}})();
  const deny=/^(home|about|issues?|archives?|current issue|ahead of print|contact|submit|login|register|pdf|full text|abstract|read article|read more|for authors)$/i;

  if(platform==="saudijournals"){
    const code=String(metadata?.journal_code||"").trim().toLowerCase();
    if(code){
      const re=new RegExp("10\\.36348\\/"+code+"\\.[A-Z0-9._-]+","gi");
      for(const m of html.matchAll(re)){
        const doi=String(m[0]).replace(/[),.;]+$/,"");
        const key=doi.toLowerCase();
        if(seen.has(key))continue;
        seen.add(key);
        out.push({url:"https://doi.org/"+doi,title:doi});
      }
      return out.slice(0,30);
    }
  }

  if(platform==="ejmanager"){
    for(const m of html.matchAll(/10\.5455\/mjhs\.[A-Z0-9._-]+/gi)){
      const doi=String(m[0]).replace(/[),.;]+$/,"");
      const key=doi.toLowerCase();
      if(seen.has(key))continue;
      seen.add(key);
      out.push({url:"https://doi.org/"+doi,title:doi});
      if(out.length>=40)break;
    }
  }

  for(const m of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)){
    const rawHref=decode(m[1]).trim();
    const text=clean(m[2]);
    if(!rawHref||!text||text.length<18||deny.test(text))continue;
    let url="";
    try{url=new URL(rawHref,base).toString()}catch{continue}
    const u=new URL(url);
    const path=u.pathname+u.search;
    let ok=false;

    if(platform==="researchcommons")ok=/\/jmeds\/vol\d+\/iss\d+\/\d+/i.test(path);
    else if(platform==="ejmanager")ok=/[?&]mno=\d+/i.test(path);
    else if(platform==="scientific_scholar"){
      ok=u.host===baseHost&&
        u.pathname.split("/").filter(Boolean).length===1&&
        (u.pathname.match(/-/g)||[]).length>=4;
    }else if(platform==="springer"||platform==="nature"){
      ok=u.host===baseHost&&(/\/article\//i.test(path)||/\/articles\//i.test(path));
    }else{
      ok=u.host===baseHost&&text.length>=28&&
        (/\/article/i.test(path)||/article|paper|study|case|review|trial|effect|association|prevalence|outcome|analysis/i.test(text));
    }

    if(!ok)continue;
    const key=url.toLowerCase();
    if(seen.has(key))continue;
    seen.add(key);
    out.push({url,title:text});
    if(out.length>=40)break;
  }
  return out;
}
async function mapLimited<T,R>(items:T[],limit:number,fn:(x:T)=>Promise<R>){
  const out:R[]=[];
  for(let i=0;i<items.length;i+=limit){
    const batch=items.slice(i,i+limit);
    out.push(...await Promise.all(batch.map(fn)));
  }
  return out;
}
function within(date:string|null,start:string,end:string){
  return !!date&&date>=start&&date<=end;
}
function externalKey(doi:string|null,url:string){
  return doi?("doi:"+doi.toLowerCase()):("url:"+url.replace(/[#?]utm_[^#]+/i,"").toLowerCase());
}

export async function POST(req:NextRequest){
  try{
    const body=await req.json();
    const user=await requireUser(req,body?.accessToken);
    if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});

    const organizationId=String(body?.organizationId||"");
    const periodStart=String(body?.periodStart||"");
    const periodEnd=String(body?.periodEnd||"");
    const products=(Array.isArray(body?.products)?body.products:[]) as ProductWithId[];
    const sources=(Array.isArray(body?.sources)?body.sources:[]) as SourceInput[];

    if(!organizationId)return NextResponse.json({error:"Workspace is required."},{status:400});
    if(!products.length||!sources.length)return NextResponse.json({error:"Products and sources are required."},{status:400});

    const entries:any[]=[];
    const matches:any[]=[];
    const reports:any[]=[];
    const retrievedAt=new Date().toISOString();

    for(const source of sources){
      const platform=String(source.metadata?.platform||"generic");
      const attempts:any[]=[];
      const candidateMap=new Map<string,{url:string;title:string}>();
      let landingUrl="";

      if(platform==="saudijournals"){
        const scan=await scanSaudiJournal(source,fetchHtml);
        attempts.push(...scan.attempts);landingUrl=scan.landingUrl;
        for(const item of scan.candidates)candidateMap.set(item.url.toLowerCase(),item);
      }else for(const scanUrl of scanUrls(source)){
        const landing=await fetchHtml(scanUrl);
        attempts.push({
          url:scanUrl,
          final_url:landing.url||scanUrl,
          ok:landing.ok,
          http_status:landing.status,
          error:landing.error||null
        });
        if(!landing.ok||unusableJournalPage(landing.text))continue;
        if(!landingUrl)landingUrl=landing.url||scanUrl;
        const found=articleCandidates(landing.text,landing.url||scanUrl,platform,source.metadata||{});
        for(const x of found){
          const key=x.url.toLowerCase();
          if(!candidateMap.has(key))candidateMap.set(key,x);
        }
      }

      if(!landingUrl){
        const last=attempts[attempts.length-1]||{};
        reports.push({source_id:source.id,name:source.name,status:"error",stage:"landing",http_status:last.http_status||0,error:last.error||"Source page unavailable",attempts});
        continue;
      }

      const candidates=[...candidateMap.values()];
      if(!candidates.length){
        reports.push({source_id:source.id,name:source.name,status:"error",stage:"parsing",error:"No article links found; journal coverage could not be verified.",attempts});
        continue;
      }
      const details=await mapLimited(candidates,5,async candidate=>{
        const page=await fetchHtml(candidate.url);
        if(!page.ok||unusableJournalPage(page.text))return {
          external_key:"url:"+candidate.url.toLowerCase(),
          title:candidate.title,
          article_url:candidate.url,
          doi:null,
          publication_date:null,
          abstract:null,
          fetch_ok:false
        };
        const url=canonical(page.text,page.url||candidate.url);
        const direct=platform==="saudijournals"?parseSaudiJournalArticle(page.text):null;
        const doi=direct?.doi||meta(page.text,["citation_doi","dc.identifier"])||doiFrom(page.text);
        return {
          external_key:externalKey(doi||null,url),
          title:direct?direct.title:titleFrom(page.text,candidate.title),
          article_url:url,
          doi:doi||null,
          publication_date:direct?direct.publicationDate:publicationDateFrom(page.text),
          abstract:(direct?direct.abstract:abstractFrom(page.text))||null,
          fetch_ok:!direct||!!direct.title
        };
      });

      let matched=0;
      for(const detail of details){
        entries.push({
          organization_id:organizationId,
          source_id:source.id,
          external_key:detail.external_key,
          title:detail.title,
          article_url:detail.article_url,
          doi:detail.doi,
          publication_date:detail.publication_date,
          abstract:detail.abstract,
          metadata:{
            connector:"open_web_snapshot",
            platform,
            source_name:source.name,
            source_retrieved_at:retrievedAt,
            fetch_ok:detail.fetch_ok,
            ...(platform==="saudijournals"?{parser_version:"saudijournals_v2"}:{})
          }
        });

        for(const product of products){
          const terms=productTerms(product);
          const analysis=refineRanking(
            analyzeArticle(detail.title,detail.abstract||"",[],terms),
            detail.title,
            detail.abstract||"",
            terms
          );
          if(!analysis.matchedTerms.length)continue;
          matched++;
          matches.push({
            source_id:source.id,
            external_key:detail.external_key,
            product_id:product.id,
            title:detail.title,
            journal:source.name,
            publication_date:detail.publication_date,
            article_url:detail.article_url,
            doi:detail.doi,
            abstract:detail.abstract,
            matched_terms:analysis.matchedTerms,
            relevance:analysis.relevance,
            ai_reason:analysis.reason,
            in_requested_period:within(detail.publication_date,periodStart,periodEnd),
            metadata:{
              connector:"open_web_snapshot",
              source_platform:platform,
              source_name:source.name,
              source_url:source.url,
              source_retrieved_at:retrievedAt,
              retrieval_route:"Direct public journal page snapshot",
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
          });
        }
      }

      reports.push({
        source_id:source.id,
        name:source.name,
        status:details.every(x=>x.fetch_ok)&&attempts.every(x=>x.ok)?"ok":"partial",
        direct:true,
        platform,
        scan_url:landingUrl,
        candidates:candidates.length,
        landing_attempts:attempts,
        entries:details.length,
        detail_fetch_ok:details.filter(x=>x.fetch_ok).length,
        matched
      });
    }

    return NextResponse.json({
      connector:"open_web_snapshot",
      sources_checked:sources.length,
      sources_ok:reports.filter(r=>r.status==="ok").length,
      entries,
      matches,
      reports,
      retrieved_at:retrievedAt
    });
  }catch(e:any){
    return NextResponse.json({error:e?.message||"Open Saudi journal monitoring failed."},{status:500});
  }
}
