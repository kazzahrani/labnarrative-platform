import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { analyzeArticle, fetchPubMedDetails, productTerms, type ProductInput } from "../../_pubmed";

const SUPABASE_URL = process.env.NEXT_PUBLIC_PVOS_SUPABASE_URL ?? "https://kvhmxjfenjtzfavyhnvb.supabase.co";
const SUPABASE_KEY = process.env.NEXT_PUBLIC_PVOS_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_3x3ll4gYAdqi9TAnPzNnMA_BxJKNM8D";

type ItemInput = {
  id:string;
  title:string;
  pmid:string;
  metadata?:Record<string,any>;
  product:ProductInput;
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
    const items=(Array.isArray(body?.items)?body.items:[]) as ItemInput[];
    if(!items.length||items.length>300)return NextResponse.json({error:"Choose between 1 and 300 PubMed items."},{status:400});

    const ids=[...new Set(items.map(x=>String(x.pmid||"").trim()).filter(Boolean))];
    if(!ids.length)return NextResponse.json({error:"No PubMed IDs were found."},{status:400});
    const details=await fetchPubMedDetails(ids);

    const updates=items.flatMap(item=>{
      const detail=details[item.pmid];
      if(!detail)return [];
      const terms=productTerms(item.product);
      const analysis=analyzeArticle(item.title,detail.abstract,detail.keywords,terms);
      const primaryDate=detail.online_date||detail.pubmed_date||detail.issue_date||null;
      return [{
        id:item.id,
        abstract:detail.abstract||null,
        matched_terms:analysis.matchedTerms,
        relevance:analysis.relevance,
        ai_reason:analysis.reason,
        publication_date:primaryDate,
        metadata:{
          keywords:detail.keywords,
          match_locations:analysis.matchLocations,
          matched_term_locations:analysis.termLocations,
          urgent_saudi:analysis.urgentSaudi,
          saudi_hits:analysis.saudiHits,
          safety_hits:analysis.safetyHits,
          case_hits:analysis.caseHits,
          online_date:detail.online_date,
          issue_date:detail.issue_date,
          pubmed_date:detail.pubmed_date,
          date_display_basis:detail.online_date?"online":detail.pubmed_date?"pubmed":"issue",
          enriched_at:new Date().toISOString(),
          enrichment_version:"v1"
        }
      }];
    });

    return NextResponse.json({
      updates,
      analyzed:updates.length,
      priority:updates.filter(x=>x.relevance==="likely_relevant").length,
      saudi_alerts:updates.filter(x=>x.metadata.urgent_saudi).length
    });
  }catch(e:any){
    return NextResponse.json({error:e?.message ?? "PubMed enrichment failed."},{status:500});
  }
}
