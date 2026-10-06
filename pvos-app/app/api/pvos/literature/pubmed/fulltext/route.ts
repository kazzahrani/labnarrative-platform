import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { analyzeArticle, productTerms, type ProductInput } from "../../_pubmed";
import { refineRanking } from "../../_rank";
import { fetchPmcArticle, fetchPmcIdsForPmids } from "../../_pmc";

const SUPABASE_URL=process.env.NEXT_PUBLIC_PVOS_SUPABASE_URL??"https://kvhmxjfenjtzfavyhnvb.supabase.co";
const SUPABASE_KEY=process.env.NEXT_PUBLIC_PVOS_SUPABASE_PUBLISHABLE_KEY??"sb_publishable_3x3ll4gYAdqi9TAnPzNnMA_BxJKNM8D";

type ItemInput={
  id:string;
  title:string;
  pmid:string;
  abstract?:string|null;
  metadata?:Record<string,any>;
  product:ProductInput;
};

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

export async function POST(req:NextRequest){
  try{
    const body=await req.json();
    const user=await requireUser(req,body?.accessToken);
    if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});

    const items=(Array.isArray(body?.items)?body.items:[]) as ItemInput[];
    if(!items.length||items.length>60){
      return NextResponse.json({error:"Choose between 1 and 60 full-text items."},{status:400});
    }

    const pmids=[...new Set(items.map(x=>String(x.pmid||"").trim()).filter(Boolean))];
    if(!pmids.length)return NextResponse.json({error:"No PubMed IDs were found."},{status:400});

    const pmcMap=await fetchPmcIdsForPmids(pmids);
    const articleCache:Record<string,Awaited<ReturnType<typeof fetchPmcArticle>>>= {};
    const updates:any[]=[];
    let retrieved=0;
    let unavailable=0;

    for(const item of items){
      const pmcid=pmcMap[item.pmid]||null;
      const lookupAt=new Date().toISOString();

      if(!pmcid){
        unavailable++;
        updates.push({
          id:item.id,
          metadata:{
            full_text_required:true,
            assessment_state:"full_text_required",
            full_text_lookup_status:"no_pmc_full_text",
            full_text_lookup_at:lookupAt,
            full_text_lookup_source:"PubMed Central"
          }
        });
        continue;
      }

      let pmc=articleCache[pmcid];
      if(pmc===undefined){
        pmc=await fetchPmcArticle(pmcid);
        articleCache[pmcid]=pmc;
      }

      if(!pmc?.fullText&&!pmc?.abstract){
        unavailable++;
        updates.push({
          id:item.id,
          metadata:{
            pmcid,
            full_text_required:true,
            assessment_state:"full_text_required",
            full_text_lookup_status:"pmc_record_without_text",
            full_text_lookup_at:lookupAt,
            full_text_lookup_source:"PubMed Central"
          }
        });
        continue;
      }

      retrieved++;
      const evidence=(pmc.abstract||pmc.fullText.slice(0,40000)).trim();
      const terms=productTerms(item.product);
      const analysis=refineRanking(
        analyzeArticle(item.title,evidence,[],terms),
        item.title,
        evidence,
        terms
      );

      updates.push({
        id:item.id,
        full_text:pmc.fullText||null,
        full_text_source:"PubMed Central",
        full_text_retrieved_at:lookupAt,
        abstract:pmc.abstract||item.abstract||null,
        matched_terms:analysis.matchedTerms,
        relevance:analysis.relevance,
        ai_reason:analysis.reason,
        metadata:{
          pmcid,
          pmc_url:pmc.sourceUrl,
          full_text_required:false,
          assessment_state:"full_text_retrieved",
          full_text_lookup_status:"retrieved",
          full_text_lookup_at:lookupAt,
          full_text_lookup_source:"PubMed Central",
          full_text_analysis_basis:pmc.abstract?"PMC abstract":"PMC full text",
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
          full_text_screened_at:lookupAt
        }
      });
    }

    return NextResponse.json({
      updates,
      requested:items.length,
      retrieved,
      unavailable
    });
  }catch(e:any){
    return NextResponse.json({error:e?.message??"Full-text retrieval failed."},{status:500});
  }
}
