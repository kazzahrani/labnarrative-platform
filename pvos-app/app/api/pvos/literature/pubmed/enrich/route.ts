import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { analyzeArticle, fetchPubMedDetails, productTerms, type ProductInput } from "../../_pubmed";
import { refineRanking, PRIORITIZATION_VERSION } from "../../_rank";

const SUPABASE_URL = process.env.NEXT_PUBLIC_PVOS_SUPABASE_URL ?? "https://kvhmxjfenjtzfavyhnvb.supabase.co";
const SUPABASE_KEY = process.env.NEXT_PUBLIC_PVOS_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_3x3ll4gYAdqi9TAnPzNnMA_BxJKNM8D";

type ItemInput = {
  id:string;
  title:string;
  pmid:string;
  abstract?:string|null;
  metadata?:Record<string,any>;
  product:ProductInput;
};

async function requireUser(req:NextRequest,bodyToken?:string){
  const auth=req.headers.get("authorization") ?? "";
  const headerToken=auth.startsWith("Bearer ")?auth.slice(7):"";
  const token=headerToken||String(bodyToken||"");
  if(!token)return null;
  const supabase=createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await supabase.auth.getUser(token);
  if(error||!data.user)return null;
  return data.user;
}

export async function POST(req:NextRequest){
  try{
    const body=await req.json();
    const user=await requireUser(req,body?.accessToken);
    if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
    const items=(Array.isArray(body?.items)?body.items:[]) as ItemInput[];
    if(!items.length||items.length>300)return NextResponse.json({error:"Choose between 1 and 300 PubMed items."},{status:400});

    const ids=[...new Set(items.map(x=>String(x.pmid||"").trim()).filter(Boolean))];
    if(!ids.length)return NextResponse.json({error:"No PubMed IDs were found."},{status:400});
    const details=await fetchPubMedDetails(ids);

    const updates=items.map(item=>{
      const detail=details[item.pmid];
      const abstract=detail?.abstract||item.abstract||"";
      const keywords=detail?.keywords||(Array.isArray(item.metadata?.keywords)?item.metadata.keywords:[]);
      const terms=productTerms(item.product);
      const analysis=refineRanking(analyzeArticle(item.title,abstract,keywords,terms),item.title,abstract,terms);
      const primaryDate=detail?.online_date||detail?.pubmed_date||detail?.issue_date||item.metadata?.online_date||item.metadata?.pubmed_date||item.metadata?.issue_date||null;
      return {
        id:item.id,
        abstract:abstract||null,
        matched_terms:analysis.matchedTerms,
        relevance:analysis.relevance,
        ai_reason:analysis.reason,
        publication_date:primaryDate,
        metadata:{
          keywords,
          match_locations:analysis.matchLocations,
          matched_term_locations:analysis.termLocations,
          urgent_saudi:analysis.urgentSaudi,
          saudi_hits:analysis.saudiHits,
          safety_hits:analysis.safetyHits,
          special_hits:analysis.specialHits,
          lack_efficacy_hits:analysis.lackEfficacyHits,
          interaction_hits:analysis.interactionHits,
          case_hits:analysis.caseHits,
          product_safety_hits:analysis.productSafetyHits,
          product_special_hits:analysis.productSpecialHits,
          product_lack_efficacy_hits:analysis.productLackEfficacyHits,
          exposure_hits:analysis.exposureHits,
          product_exposure_hits:analysis.productExposureHits,
          product_interaction_hits:analysis.productInteractionHits,
          product_association_hits:analysis.productAssociationHits,
          breakthrough:analysis.breakthrough,
          quantified_product_evidence:analysis.quantifiedProductEvidence,
          direct_outcome_statement:analysis.directOutcomeStatement,
          assessment_state:analysis.assessmentState,
          full_text_required:analysis.fullTextRequired,
          publication_context:analysis.publicationContext,
          product_role:analysis.productRole,
          finding_types:analysis.findingTypes,
          human_clinical:analysis.humanClinical,
          non_human:analysis.nonHuman,
          environmental:analysis.environmental,
          economic:analysis.economic,
          analytical_or_formulation:analysis.analyticalOrFormulation,
          review_article:analysis.reviewArticle,
          treatment_pattern:analysis.treatmentPattern,
          prioritization_version:analysis.analysisVersion,
          online_date:detail?.online_date??item.metadata?.online_date??null,
          issue_date:detail?.issue_date??item.metadata?.issue_date??null,
          pubmed_date:detail?.pubmed_date??item.metadata?.pubmed_date??null,
          date_display_basis:detail?.online_date?"online":detail?.pubmed_date?"pubmed":item.metadata?.date_display_basis||"issue",
          enriched_at:new Date().toISOString(),
          enrichment_version:PRIORITIZATION_VERSION
        }
      };
    });

    return NextResponse.json({
      updates,
      analyzed:updates.length,
      priority:updates.filter(x=>x.relevance==="likely_relevant").length,
      full_text_required:updates.filter(x=>x.metadata.full_text_required).length,
      saudi_alerts:updates.filter(x=>x.metadata.urgent_saudi).length
    });
  }catch(e:any){
    return NextResponse.json({error:e?.message ?? "PubMed enrichment failed."},{status:500});
  }
}
