import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { analyzeArticle, fetchPubMedDetails, ncbiJson, productTerms, sleep, type ProductInput, ymd } from "../_pubmed";

const SUPABASE_URL = process.env.NEXT_PUBLIC_PVOS_SUPABASE_URL ?? "https://kvhmxjfenjtzfavyhnvb.supabase.co";
const SUPABASE_KEY = process.env.NEXT_PUBLIC_PVOS_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_3x3ll4gYAdqi9TAnPzNnMA_BxJKNM8D";

type SummaryDoc = {
  uid?: string;
  title?: string;
  fulljournalname?: string;
  source?: string;
  pubdate?: string;
  sortpubdate?: string;
  articleids?: Array<{idtype?: string; value?: string}>;
};

async function requireUser(req:NextRequest){
  const auth=req.headers.get("authorization") ?? "";
  const token=auth.startsWith("Bearer ")?auth.slice(7):"";
  if(!token)return null;
  const supabase=createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await supabase.auth.getUser(token);
  if(error||!data.user)return null;
  return data.user;
}

export async function POST(req:NextRequest){
  try{
    const user=await requireUser(req);
    if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});

    const body=await req.json();
    const products=(Array.isArray(body?.products)?body.products:[]) as ProductInput[];
    const periodStart=String(body?.periodStart ?? "");
    const periodEnd=String(body?.periodEnd ?? "");

    if(!products.length||products.length>30)return NextResponse.json({error:"Choose between 1 and 30 products."},{status:400});
    if(!/^\d{4}-\d{2}-\d{2}$/.test(periodStart)||!/^\d{4}-\d{2}-\d{2}$/.test(periodEnd))return NextResponse.json({error:"Invalid screening period."},{status:400});

    const start=new Date(periodStart+"T00:00:00Z"),end=new Date(periodEnd+"T23:59:59Z");
    const days=(end.getTime()-start.getTime())/86400000;
    if(days<0||days>366)return NextResponse.json({error:"Screening period must be between 0 and 366 days."},{status:400});

    const items:any[]=[];
    let requestCount=0;

    for(const product of products){
      const terms=productTerms(product);
      if(!terms.length)continue;
      const query=terms.map(t=>`"${t.replace(/"/g,"")}"[Title/Abstract]`).join(" OR ");

      if(requestCount)await sleep(360);
      const search=await ncbiJson("esearch.fcgi",new URLSearchParams({
        db:"pubmed",retmode:"json",retmax:"100",sort:"pub date",
        term:"("+query+")",datetype:"pdat",mindate:periodStart,maxdate:periodEnd
      }));
      requestCount++;
      const ids=(search?.esearchresult?.idlist ?? []) as string[];
      if(!ids.length)continue;

      await sleep(360);
      const summary=await ncbiJson("esummary.fcgi",new URLSearchParams({
        db:"pubmed",retmode:"json",id:ids.join(",")
      }));
      requestCount++;

      await sleep(360);
      const detailMap=await fetchPubMedDetails(ids);
      requestCount++;

      const uids=(summary?.result?.uids ?? []) as string[];
      for(const uid of uids){
        const doc=(summary?.result?.[uid] ?? {}) as SummaryDoc;
        const title=String(doc.title ?? "").replace(/<[^>]+>/g,"").trim();
        if(!title)continue;

        const detail=detailMap[uid];
        const abstract=detail?.abstract ?? "";
        const keywords=detail?.keywords ?? [];
        const analysis=analyzeArticle(title,abstract,keywords,terms);
        const doi=doc.articleids?.find(x=>x.idtype==="doi")?.value ?? null;
        const primaryDate=detail?.online_date || detail?.pubmed_date || ymd(doc.sortpubdate || doc.pubdate);
        const issueDate=detail?.issue_date || ymd(doc.sortpubdate || doc.pubdate);

        items.push({
          product_id:product.id,
          title,
          journal:doc.fulljournalname || doc.source || "PubMed",
          publication_date:primaryDate,
          article_url:"https://pubmed.ncbi.nlm.nih.gov/"+uid+"/",
          doi,
          abstract:abstract||null,
          matched_terms:analysis.matchedTerms,
          relevance:analysis.relevance,
          ai_reason:analysis.reason,
          review_status:"unreviewed",
          metadata:{
            connector:"pubmed",
            pmid:uid,
            search_terms:terms,
            retrieved_at:new Date().toISOString(),
            keywords,
            match_locations:analysis.matchLocations,
            matched_term_locations:analysis.termLocations,
            urgent_saudi:analysis.urgentSaudi,
            saudi_hits:analysis.saudiHits,
            safety_hits:analysis.safetyHits,
            case_hits:analysis.caseHits,
            online_date:detail?.online_date ?? null,
            issue_date:issueDate,
            pubmed_date:detail?.pubmed_date ?? null,
            date_display_basis:detail?.online_date?"online":detail?.pubmed_date?"pubmed":"issue"
          }
        });
      }
    }

    const seen=new Set<string>();
    const deduped=items.filter(x=>{
      const key=x.product_id+"|"+(x.doi?String(x.doi).toLowerCase():x.article_url);
      if(seen.has(key))return false;
      seen.add(key);return true;
    });

    const priority=deduped.filter(x=>x.relevance==="likely_relevant").length;
    const saudi=deduped.filter(x=>x.metadata?.urgent_saudi).length;

    return NextResponse.json({
      source:"PubMed",
      products_searched:products.length,
      results:deduped.length,
      priority,
      saudi_alerts:saudi,
      items:deduped
    });
  }catch(e:any){
    return NextResponse.json({error:e?.message ?? "PubMed screening failed."},{status:500});
  }
}
