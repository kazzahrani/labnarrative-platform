import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { analyzeArticle, productTerms, type ProductInput } from "../_pubmed";
import { refineRanking } from "../_rank";

const SUPABASE_URL=process.env.NEXT_PUBLIC_PVOS_SUPABASE_URL??"https://kvhmxjfenjtzfavyhnvb.supabase.co";
const SUPABASE_KEY=process.env.NEXT_PUBLIC_PVOS_SUPABASE_PUBLISHABLE_KEY??"sb_publishable_3x3ll4gYAdqi9TAnPzNnMA_BxJKNM8D";

type SourceInput={
  id:string;
  name:string;
  url:string;
  metadata?:Record<string,any>;
};
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

function cleanText(v:any){
  return String(v??"")
    .replace(/<jats:[^>]+>/gi," ")
    .replace(/<\/jats:[^>]+>/gi," ")
    .replace(/<[^>]+>/g," ")
    .replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&amp;/g,"&")
    .replace(/&quot;/g,'"').replace(/&apos;/g,"'")
    .replace(/\s+/g," ")
    .trim();
}
function datePartsToIso(parts:any){
  const arr=parts?.["date-parts"]?.[0];
  if(!Array.isArray(arr)||!arr[0])return null;
  const y=String(arr[0]).padStart(4,"0");
  const m=String(arr[1]||1).padStart(2,"0");
  const d=String(arr[2]||1).padStart(2,"0");
  return y+"-"+m+"-"+d;
}
function bestDate(item:any){
  return datePartsToIso(item?.["published-online"])||
    datePartsToIso(item?.published)||
    datePartsToIso(item?.["published-print"])||
    datePartsToIso(item?.created)||
    null;
}
function validIssn(v:any){
  const s=String(v??"").trim();
  return /^\d{4}-[\dXx]{4}$/.test(s)?s:null;
}
async function fetchCrossrefWorks(issn:string,start:string,end:string){
  const rows=500;
  let cursor="*";
  const items:any[]=[];
  let total=0;
  for(let page=0;page<8;page++){
    const url=new URL("https://api.crossref.org/journals/"+encodeURIComponent(issn)+"/works");
    url.searchParams.set("filter","from-pub-date:"+start+",until-pub-date:"+end+",type:journal-article");
    url.searchParams.set("rows",String(rows));
    url.searchParams.set("cursor",cursor);
    url.searchParams.set("cursor-max",String(rows));
    url.searchParams.set("mailto","support@pvos.site");
    const res=await fetch(url.toString(),{
      cache:"no-store",
      headers:{
        "Accept":"application/json",
        "User-Agent":"PVOS literature monitoring/1.0 (https://pvos.site)"
      }
    });
    if(!res.ok)throw new Error("Crossref request failed ("+res.status+").");
    const data=await res.json();
    const message=data?.message||{};
    const pageItems=Array.isArray(message.items)?message.items:[];
    total=Number(message["total-results"]||pageItems.length);
    items.push(...pageItems);
    const next=String(message["next-cursor"]||"");
    if(!next||pageItems.length<rows||items.length>=total)break;
    cursor=next;
  }
  return {items,total,truncated:items.length<total};
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

    if(!/^\d{4}-\d{2}-\d{2}$/.test(periodStart)||!/^\d{4}-\d{2}-\d{2}$/.test(periodEnd)){
      return NextResponse.json({error:"Valid screening dates are required."},{status:400});
    }
    if(!products.length||products.length>50)return NextResponse.json({error:"Choose between 1 and 50 products."},{status:400});
    if(!sources.length||sources.length>30)return NextResponse.json({error:"Choose between 1 and 30 LWW sources."},{status:400});

    const output:any[]=[];
    const reports:any[]=[];
    const retrievedAt=new Date().toISOString();

    for(const source of sources){
      const onlineIssn=validIssn(source.metadata?.online_issn);
      const printIssn=validIssn(source.metadata?.print_issn);
      const issn=onlineIssn||printIssn;
      if(!issn){
        reports.push({source_id:source.id,name:source.name,status:"skipped",reason:"No valid ISSN"});
        continue;
      }

      try{
        const crossref=await fetchCrossrefWorks(issn,periodStart,periodEnd);
        let matched=0;

        for(const work of crossref.items){
          const title=cleanText(Array.isArray(work?.title)?work.title[0]:work?.title);
          if(!title)continue;
          const abstract=cleanText(work?.abstract);
          const keywords=Array.isArray(work?.subject)?work.subject.map(cleanText).filter(Boolean):[];
          const doi=String(work?.DOI||"").trim()||null;
          const url=String(work?.URL||"").trim()||(doi?"https://doi.org/"+doi:null);
          const publicationDate=bestDate(work);

          for(const product of products){
            const terms=productTerms(product);
            const analysis=refineRanking(
              analyzeArticle(title,abstract,keywords,terms),
              title,
              abstract,
              terms
            );
            if(!analysis.matchedTerms.length)continue;
            matched++;

            output.push({
              product_id:product.id,
              title,
              journal:source.name,
              publication_date:publicationDate,
              article_url:url,
              doi,
              abstract:abstract||null,
              matched_terms:analysis.matchedTerms,
              relevance:analysis.relevance,
              ai_reason:analysis.reason,
              metadata:{
                connector:"lww_crossref",
                source_platform:"LWW",
                source_name:source.name,
                source_url:source.url,
                source_issn:issn,
                source_retrieved_at:retrievedAt,
                retrieval_route:"Crossref ISSN",
                direct_source_monitoring:false,
                saudi_journal:true,
                pubmed_indexed:!!source.metadata?.pubmed_indexed,
                crossref_type:work?.type||null,
                crossref_publisher:work?.publisher||null,
                crossref_deposited_at:datePartsToIso(work?.deposited)||null,
                crossref_created_at:datePartsToIso(work?.created)||null,
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
                exposure_hits:analysis.exposureHits,
                product_exposure_hits:analysis.productExposureHits,
                product_interaction_hits:analysis.productInteractionHits,
                product_association_hits:analysis.productAssociationHits,
                breakthrough:analysis.breakthrough,
                quantified_product_evidence:analysis.quantifiedProductEvidence,
                direct_outcome_statement:analysis.directOutcomeStatement,
                prioritization_version:analysis.analysisVersion
              }
            });
          }
        }

        reports.push({
          source_id:source.id,
          name:source.name,
          status:"ok",
          route:"Crossref ISSN",
          issn,
          retrieved:crossref.items.length,
          total_results:crossref.total,
          truncated:crossref.truncated,
          matched
        });
      }catch(e:any){
        reports.push({
          source_id:source.id,
          name:source.name,
          status:"error",
          issn,
          error:e?.message||"Source retrieval failed."
        });
      }
    }

    const deduped:any[]=[];
    const seen=new Set<string>();
    for(const item of output){
      const key=item.product_id+"::"+String(item.doi||item.article_url||item.title).toLowerCase();
      if(seen.has(key))continue;
      seen.add(key);
      deduped.push(item);
    }

    return NextResponse.json({
      connector:"lww_crossref",
      sources_checked:sources.length,
      results:deduped.length,
      items:deduped,
      reports,
      retrieved_at:retrievedAt
    });
  }catch(e:any){
    return NextResponse.json({error:e?.message??"Saudi journal screening failed."},{status:500});
  }
}
