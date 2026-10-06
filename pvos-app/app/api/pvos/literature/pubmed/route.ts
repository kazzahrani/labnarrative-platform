import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { analyzeArticle, fetchPubMedDetails, ncbiJson, productTerms, sleep, type ProductInput, ymd } from "../_pubmed";

const SUPABASE_URL = process.env.NEXT_PUBLIC_PVOS_SUPABASE_URL ?? "https://kvhmxjfenjtzfavyhnvb.supabase.co";
const SUPABASE_KEY = process.env.NEXT_PUBLIC_PVOS_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_3x3ll4gYAdqi9TAnPzNnMA_BxJKNM8D";

const SEARCH_PAGE_SIZE=500;
const SUMMARY_CHUNK_SIZE=200;
const MAX_RESULTS_PER_PRODUCT=5000;

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
    const searches:any[]=[];
    let requestCount=0;

    const pacedJson=async(path:string,params:URLSearchParams)=>{
      if(requestCount)await sleep(360);
      const result=await ncbiJson(path,params);
      requestCount++;
      return result;
    };

    for(const product of products){
      const terms=productTerms(product);
      if(!terms.length)continue;
      const query=terms.map(t=>'"'+t.replace(/"/g,"")+'"[Title/Abstract]').join(" OR ");

      const ids:string[]=[];
      const seenIds=new Set<string>();
      let totalCount=0;
      let pages=0;
      let retstart=0;

      while(true){
        const search=await pacedJson("esearch.fcgi",new URLSearchParams({
          db:"pubmed",
          retmode:"json",
          retmax:String(SEARCH_PAGE_SIZE),
          retstart:String(retstart),
          sort:"pub date",
          term:"("+query+")",
          datetype:"pdat",
          mindate:periodStart,
          maxdate:periodEnd
        }));

        const result=search?.esearchresult ?? {};
        totalCount=Number(result.count ?? 0);
        if(!Number.isFinite(totalCount)||totalCount<0)totalCount=0;

        if(totalCount>MAX_RESULTS_PER_PRODUCT){
          throw new Error(
            "PubMed returned "+totalCount+" results for "+(product.brand_name||product.active_ingredient||"a product")+
            ". PVOS will not silently truncate literature results. Narrow the screening period and run again."
          );
        }

        const pageIds=((result.idlist ?? []) as string[]).filter(Boolean);
        for(const id of pageIds){
          if(!seenIds.has(id)){
            seenIds.add(id);
            ids.push(id);
          }
        }
        pages++;
        retstart+=pageIds.length;

        if(!pageIds.length){
          if(ids.length<totalCount){
            throw new Error("PubMed pagination stopped before all results were retrieved. No screening record was created.");
          }
          break;
        }
        if(ids.length>=totalCount)break;
      }

      if(ids.length!==totalCount){
        throw new Error(
          "PubMed reported "+totalCount+" results but PVOS retrieved "+ids.length+
          ". No screening record was created because retrieval completeness could not be confirmed."
        );
      }

      searches.push({
        product_id:product.id,
        brand_name:product.brand_name||null,
        active_ingredient:product.active_ingredient||null,
        terms,
        query,
        pubmed_count:totalCount,
        retrieved_count:ids.length,
        pagination_pages:pages,
        complete:ids.length===totalCount
      });

      if(!ids.length)continue;

      const summaryDocs:Record<string,SummaryDoc>={};
      for(let i=0;i<ids.length;i+=SUMMARY_CHUNK_SIZE){
        const chunk=ids.slice(i,i+SUMMARY_CHUNK_SIZE);
        const summary=await pacedJson("esummary.fcgi",new URLSearchParams({
          db:"pubmed",retmode:"json",id:chunk.join(",")
        }));
        const uids=(summary?.result?.uids ?? []) as string[];
        for(const uid of uids){
          summaryDocs[uid]=(summary?.result?.[uid] ?? {}) as SummaryDoc;
        }
      }

      if(requestCount)await sleep(360);
      const detailMap=await fetchPubMedDetails(ids);
      requestCount++;

      for(const uid of ids){
        const doc=summaryDocs[uid] ?? {};
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
      retrieval_complete:searches.every(x=>x.complete),
      searches,
      items:deduped
    });
  }catch(e:any){
    return NextResponse.json({error:e?.message ?? "PubMed screening failed."},{status:500});
  }
}
