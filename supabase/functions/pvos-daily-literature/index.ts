import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { analyzeArticle, fetchPubMedDetails, ncbiJson, productTerms, sleep, ymd } from "./_pubmed.ts";
import { refineRanking } from "./_rank.ts";
import { crossrefIssns, fetchCrossrefWorks, unusableJournalPage, readAllRows } from "./_sources.ts";

const SEARCH_PAGE_SIZE=500;
const SUMMARY_CHUNK_SIZE=200;
const MAX_RESULTS_PER_PRODUCT=5000;

function isoDate(d=new Date()){return d.toISOString().slice(0,10)}
function minusDays(v:string,n:number){const d=new Date(v+"T00:00:00Z");d.setUTCDate(d.getUTCDate()-n);return isoDate(d)}
function clean(v:any){return String(v??"").replace(/<[^>]+>/g," ").replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/\s+/g," ").trim()}
function datePartsToIso(parts:any){const a=parts?.["date-parts"]?.[0];if(!Array.isArray(a)||!a[0])return null;return String(a[0]).padStart(4,"0")+"-"+String(a[1]||1).padStart(2,"0")+"-"+String(a[2]||1).padStart(2,"0")}
function bestCrossrefDate(x:any){return datePartsToIso(x?.["published-online"])||datePartsToIso(x?.published)||datePartsToIso(x?.["published-print"])||datePartsToIso(x?.created)||null}
function decode(v:string){return String(v||"").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,"$1").replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/&lt;/gi,"<").replace(/&gt;/gi,">").replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n))).replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCharCode(parseInt(n,16)))}
function attr(tag:string,name:string){return tag.match(new RegExp(name+'=["\\\']([^"\\\']+)["\\\']',"i"))?.[1]||""}
function meta(html:string,names:string[]){const wanted=new Set(names.map(x=>x.toLowerCase()));for(const m of html.matchAll(/<meta\b[^>]*>/gi)){const tag=m[0];const k=(attr(tag,"name")||attr(tag,"property")).toLowerCase();if(wanted.has(k)){const v=attr(tag,"content");if(v)return clean(decode(v))}}return ""}
function canonical(html:string,base:string){for(const m of html.matchAll(/<link\b[^>]*>/gi)){const tag=m[0];if(attr(tag,"rel").toLowerCase()==="canonical"){try{return new URL(attr(tag,"href"),base).toString()}catch{}}}return base}
function doiFrom(html:string){const m=html.match(/\b10\.\d{4,9}\/[-._;()/:A-Z0-9]+\b/i);return m?m[0].replace(/[),.;]+$/,""):null}
function parseDate(v:string){if(!v)return null;const m=v.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);if(m)return m[1]+"-"+m[2]+"-"+m[3];const d=new Date(v);return Number.isNaN(d.getTime())?null:isoDate(d)}
function titleFrom(html:string,fallback:string){return meta(html,["citation_title","dc.title","og:title"])||clean(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]||"")||fallback}
function abstractFrom(html:string){const m=meta(html,["citation_abstract","dc.description","dcterms.abstract"]);if(m&&m.length>80)return m;const s=html.match(/<(?:h2|h3)[^>]*>\s*Abstract\s*<\/(?:h2|h3)>([\s\S]*?)(?=<(?:h2|h3)\b|<footer\b|$)/i)?.[1]||html.match(/<div[^>]+class=["'][^"']*abstract[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1]||"";const t=clean(s);return t.length>80?t:meta(html,["description","og:description","twitter:description"])}
function publicationDateFrom(html:string){return parseDate(meta(html,["citation_publication_date","article:published_time","dc.date","date"]))}
function externalKey(doi:string|null,url:string){return doi?"doi:"+doi.toLowerCase():"url:"+url.toLowerCase()}
function uniqueKey(x:any){return x.product_id+"::"+(x.doi?String(x.doi).toLowerCase():String(x.article_url||x.title).toLowerCase())}

async function fetchHtml(url:string){
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),10000);
  try{const r=await fetch(url,{redirect:"follow",cache:"no-store",signal:controller.signal,headers:{"User-Agent":"Mozilla/5.0 PVOS literature monitor","Accept":"text/html,application/xhtml+xml;q=0.9,*/*;q=0.5"}});
    return {ok:r.ok,status:r.status,url:r.url||url,text:await r.text()}
  }catch(e:any){return {ok:false,status:0,url,text:"",error:e?.message||"fetch failed"}}
  finally{clearTimeout(timer)}
}
function scanUrls(source:any){const xs=Array.isArray(source.metadata?.direct_scan_urls)?source.metadata.direct_scan_urls:[];return [...new Set([...xs,String(source.metadata?.direct_scan_url||""),String(source.url||"")].filter(Boolean))]}
function articleCandidates(html:string,base:string,source:any){
  const platform=String(source.metadata?.platform||"generic"),out:any[]=[];const seen=new Set<string>();const host=(()=>{try{return new URL(base).host}catch{return ""}})();
  const deny=/^(home|about|issues?|archives?|current issue|ahead of print|contact|submit|login|register|pdf|full text|abstract|read article|read more|for authors)$/i;
  const code=String(source.metadata?.journal_code||"").toLowerCase();
  if(platform==="saudijournals"&&code){for(const m of html.matchAll(new RegExp("10\\.36348\\/"+code+"\\.[A-Z0-9._-]+","gi"))){const doi=String(m[0]).replace(/[),.;]+$/,"");if(!seen.has(doi.toLowerCase())){seen.add(doi.toLowerCase());out.push({url:"https://doi.org/"+doi,title:doi})}}}
  if(platform==="ejmanager"){for(const m of html.matchAll(/10\.5455\/mjhs\.[A-Z0-9._-]+/gi)){const doi=String(m[0]).replace(/[),.;]+$/,"");if(!seen.has(doi.toLowerCase())){seen.add(doi.toLowerCase());out.push({url:"https://doi.org/"+doi,title:doi})}}}
  for(const m of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)){const raw=decode(m[1]).trim(),text=clean(m[2]);if(!raw||!text||text.length<18||deny.test(text))continue;let url="";try{url=new URL(raw,base).toString()}catch{continue};const u=new URL(url),path=u.pathname+u.search;let ok=false;
    if(platform==="researchcommons")ok=/\/jmeds\/vol\d+\/iss\d+\/\d+/i.test(path);
    else if(platform==="ejmanager")ok=/[?&]mno=\d+/i.test(path);
    else if(platform==="scientific_scholar")ok=u.host===host&&u.pathname.split("/").filter(Boolean).length===1&&(u.pathname.match(/-/g)||[]).length>=4;
    else if(platform==="springer"||platform==="nature")ok=u.host===host&&(/\/article\//i.test(path)||/\/articles\//i.test(path));
    else ok=u.host===host&&text.length>=28&&(/\/article/i.test(path)||/article|paper|study|case|review|trial|effect|association|prevalence|outcome|analysis/i.test(text));
    if(ok&&!seen.has(url.toLowerCase())){seen.add(url.toLowerCase());out.push({url,title:text})}
    if(out.length>=40)break;
  }
  return out.slice(0,40)
}

async function fetchCrossref(issn:string,start:string,end:string,mode:"publication"|"update"="update"){
  const result=await fetchCrossrefWorks(issn,start,end,mode);
  if(result.truncated)throw new Error("Crossref retrieval incomplete: "+result.items.length+" of "+result.total);
  return result.items;
}

async function pubmedForProduct(product:any,start:string,end:string){
  const terms=productTerms(product);if(!terms.length)return {items:[],search:null};
  const query=terms.map(t=>'"'+t.replace(/"/g,"")+'"[Title/Abstract]').join(" OR ");
  const ids:string[]=[];let retstart=0,total=0,requests=0;
  while(true){
    if(requests++)await sleep(360);
    const s=await ncbiJson("esearch.fcgi",new URLSearchParams({db:"pubmed",retmode:"json",retmax:String(SEARCH_PAGE_SIZE),retstart:String(retstart),sort:"pub date",term:"("+query+")",datetype:"edat",mindate:start,maxdate:end}));
    const r=s?.esearchresult||{};total=Number(r.count||0);if(total>MAX_RESULTS_PER_PRODUCT)throw new Error("PubMed automated scan too broad for "+(product.brand_name||product.active_ingredient||product.id));
    const page=(r.idlist||[]).filter(Boolean);ids.push(...page);retstart+=page.length;if(!page.length||ids.length>=total)break;
  }
  if(!ids.length)return {items:[],search:{product_id:product.id,count:0,terms,query}};
  const docs:any={};
  for(let i=0;i<ids.length;i+=SUMMARY_CHUNK_SIZE){await sleep(360);const chunk=ids.slice(i,i+SUMMARY_CHUNK_SIZE);const s=await ncbiJson("esummary.fcgi",new URLSearchParams({db:"pubmed",retmode:"json",id:chunk.join(",")}));for(const uid of (s?.result?.uids||[]))docs[uid]=s.result[uid]||{}}
  await sleep(360);const details=await fetchPubMedDetails(ids);const out:any[]=[];
  for(const uid of ids){const doc=docs[uid]||{},title=clean(doc.title||"");if(!title)continue;const d=details[uid],abstract=d?.abstract||"",keywords=d?.keywords||[];const a=refineRanking(analyzeArticle(title,abstract,keywords,terms),title,abstract,terms);const doi=doc.articleids?.find((x:any)=>x.idtype==="doi")?.value||null;const pubDate=d?.online_date||d?.pubmed_date||ymd(doc.sortpubdate||doc.pubdate);
    out.push({product_id:product.id,title,journal:doc.fulljournalname||doc.source||"PubMed",publication_date:pubDate,article_url:"https://pubmed.ncbi.nlm.nih.gov/"+uid+"/",doi,abstract:abstract||null,matched_terms:a.matchedTerms,relevance:a.relevance,ai_reason:a.reason,review_status:"unreviewed",metadata:{connector:"pubmed",pmid:uid,automated_screening:true,discovery_channel:"pubmed_entrez_date",retrieved_at:new Date().toISOString(),keywords,urgent_saudi:a.urgentSaudi,saudi_hits:a.saudiHits,safety_hits:a.safetyHits,special_hits:a.specialHits,lack_efficacy_hits:a.lackEfficacyHits,interaction_hits:a.interactionHits,case_hits:a.caseHits,assessment_state:a.assessmentState,full_text_required:a.fullTextRequired,publication_context:a.publicationContext,product_role:a.productRole,finding_types:a.findingTypes,prioritization_version:a.analysisVersion}})
  }
  return {items:out,search:{product_id:product.id,count:ids.length,terms,query}}
}

function alertFor(item:any){
  const metadata=item.metadata||{};
  const types=new Set<string>(Array.isArray(metadata.finding_types)?metadata.finding_types:[]);
  const saudiJournal=!!metadata.saudi_journal;
  const title=String(item.title||"").toLowerCase();
  const abstract=String(item.abstract||"").toLowerCase();
  const directCase=/case report|case series/.test(title)||
    /\bwe report (?:a|an)\b|\bcase presentation\b/.test(abstract);

  if(metadata.urgent_saudi){
    return {
      alert_type:"saudi_case_context",
      severity:"critical",
      trigger:"saudi_case_context",
      reason:"Saudi human clinical context with a product-linked safety, case, special-situation, interaction, or efficacy concern requires same-day QPPV review."
    };
  }

  if(saudiJournal&&item.relevance!=="unlikely"){
    return {
      alert_type:"saudi_journal_match",
      severity:"high",
      trigger:"saudi_journal_product_match",
      reason:"A monitored product appeared in a Saudi journal source and requires same-day QPPV review."
    };
  }

  if(item.relevance!=="likely_relevant")return null;

  if(types.has("special_situation")){
    return {
      alert_type:"priority_literature",
      severity:"high",
      trigger:"special_situation",
      reason:"Potential special-situation evidence involving the monitored product requires prompt QPPV review."
    };
  }
  if(types.has("interaction")){
    return {
      alert_type:"priority_literature",
      severity:"high",
      trigger:"interaction",
      reason:"Potential product-linked drug interaction evidence requires prompt QPPV review."
    };
  }
  if(types.has("lack_of_efficacy")){
    return {
      alert_type:"priority_literature",
      severity:"high",
      trigger:"lack_of_efficacy",
      reason:"Potential product-linked lack-of-efficacy, progression, resistance, or breakthrough evidence requires prompt QPPV review."
    };
  }
  if(directCase&&types.has("safety")){
    return {
      alert_type:"priority_literature",
      severity:"high",
      trigger:"case_safety",
      reason:"A case report/series contains product-linked safety evidence requiring prompt QPPV review."
    };
  }

  // Other likely-relevant safety/benefit evidence remains in the screening queue
  // and PSUR workflow but does not interrupt the QPPV as a high-priority alert.
  return null;
}

Deno.serve(async(req)=>{
  const url=Deno.env.get("SUPABASE_URL")!;
  const legacy=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  let key=legacy||"";
  if(!key){try{key=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||""}catch{}}
  if(!key)return Response.json({error:"No backend Supabase key available"},{status:500});
  const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const token=req.headers.get("x-pvos-cron-secret")||"";
  const validation=await admin.rpc("pvos_validate_literature_cron_secret",{p_token:token});
  if(validation.error||validation.data!==true)return new Response("Unauthorized",{status:401});
  const now=new Date(),today=isoDate(now),windowStart=minusDays(today,1);
  const body=await req.json().catch(()=>({}));
  // Authenticated, read-only source probes use the exact scheduled retrieval code.
  if(body.diagnostic===true){
    const ids=Array.isArray(body.source_ids)?body.source_ids.slice(0,5):[];
    if(!ids.length)return Response.json({error:"Source IDs required"},{status:400});
    const {data:sources,error}=await admin.from("pvos_literature_sources").select("*").in("id",ids);
    if(error)return Response.json({error:error.message},{status:500});
    const reports=[];
    for(const source of sources||[]){
      const report:any={source_id:source.id,source:source.name,coverage_limitation:source.metadata?.coverage_limitation||null,issn_reports:[],direct_attempts:[]};
      for(const issn of crossrefIssns(source.metadata)){
        try{const result=await fetchCrossrefWorks(issn,body.baseline?minusDays(today,365):windowStart,today,body.baseline?"publication":"update");
          report.issn_reports.push({issn,status:result.truncated?"partial":"ok",total:result.total,retrieved:result.items.length,sample:result.items.slice(0,3).map((x:any)=>({doi:x.DOI,title:x.title,issn:x.ISSN}))});
        }catch(e:any){report.issn_reports.push({issn,status:"error",error:e.message})}
      }
      if(body.check_direct===true){for(const scanUrl of scanUrls(source)){const page=await fetchHtml(scanUrl);report.direct_attempts.push({url:scanUrl,status:page.status,usable:page.ok&&!unusableJournalPage(page.text),candidates:page.ok?articleCandidates(page.text,page.url,source).length:0,error:page.error||null})}}
      reports.push(report);
    }
    return Response.json({diagnostic:true,checked_at:now.toISOString(),reports});
  }
  const {data:settings,error:settingsError}=await admin.from("pvos_literature_automation_settings").select("*").eq("enabled",true);
  if(settingsError)return Response.json({error:settingsError.message},{status:500});
  const overall:any[]=[];

  for(const setting of settings||[]){
    const orgId=setting.organization_id;
    await admin.from("pvos_literature_automation_settings").update({last_status:"running",last_run_at:now.toISOString()}).eq("organization_id",orgId);
    const failures:any[]=[];const coverageGaps:any[]=[];let orgNew=0,orgAlerts=0;
    try{
      const [{data:companies},{data:sources}]=await Promise.all([
        admin.from("pvos_companies").select("*").eq("organization_id",orgId).neq("status","inactive"),
        admin.from("pvos_literature_sources").select("*").eq("organization_id",orgId).eq("active",true)
      ]);
      for(const source of sources||[]){if(source.metadata?.coverage_limitation)coverageGaps.push({source:source.name,source_id:source.id,reason:source.metadata.coverage_limitation});}
      const pubmedSource=(sources||[]).find((s:any)=>s.metadata?.connector==="pubmed");
      const crossrefSources=(sources||[]).filter((s:any)=>["lww_crossref","crossref_journal"].includes(s.metadata?.connector));
      const openSources=(sources||[]).filter((s:any)=>s.metadata?.connector==="open_web_snapshot");

      for(const company of companies||[]){
        const {data:products}=await admin.from("pvos_products").select("*").eq("company_id",company.id);
        if(!products?.length)continue;

        let {data:run}=await admin.from("pvos_literature_runs").select("*").eq("organization_id",orgId).eq("company_id",company.id).eq("period_start",today).eq("period_end",today).contains("metadata",{automated:true}).neq("status","complete").order("created_at",{ascending:false}).limit(1).maybeSingle();
        if(run){const {data:review}=await admin.from("pvos_literature_second_reviews").select("status").eq("run_id",run.id).maybeSingle();if(["pending","approved"].includes(review?.status||""))run=null;}
        if(!run){
          const ins=await admin.from("pvos_literature_runs").insert({organization_id:orgId,company_id:company.id,period_start:today,period_end:today,status:"review",source_count:(sources||[]).length,product_count:products.length,metadata:{automated:true,automation_cadence_hours:setting.cadence_hours,connectors:["pubmed_entrez_date","crossref_update","open_web_snapshot"],checks:[]}}).select("*").single();
          if(ins.error)throw ins.error;run=ins.data;
        }

        const existing=await readAllRows((from,to)=>admin.from("pvos_literature_items").select("product_id,doi,article_url,title").eq("organization_id",orgId).order("id").range(from,to));
        const globalSeen=new Set((existing||[]).map((x:any)=>x.product_id+"::"+(x.doi?String(x.doi).toLowerCase():String(x.article_url||x.title).toLowerCase())));
        const candidates:any[]=[];const sourceReports:any[]=[];

        for(const product of products){
          try{const p=await pubmedForProduct(product,windowStart,today);for(const x of p.items)candidates.push({...x,source_id:pubmedSource?.id||null});sourceReports.push({source:"PubMed",product_id:product.id,status:"ok",retrieved:p.items.length})}
          catch(e:any){failures.push({company_id:company.id,source:"PubMed",error:e?.message||String(e)});sourceReports.push({source:"PubMed",product_id:product.id,status:"error"})}
        }

        for(const source of crossrefSources){
          const issns=crossrefIssns(source.metadata);
          const works=new Map<string,any>();let ok=false;const issnReports:any[]=[];
          const baselineStart=source.metadata?.crossref_backfill_pending?String(source.metadata.crossref_backfill_start||minusDays(today,365)):null;
          if(!issns.length)failures.push({company_id:company.id,source:source.name,error:"No configured Crossref ISSN"});
          for(const issn of issns){try{for(const w of [...await fetchCrossref(issn,windowStart,today),...(baselineStart?await fetchCrossref(issn,baselineStart,today,"publication"):[])]){const k=String(w.DOI||clean(Array.isArray(w.title)?w.title[0]:w.title)).toLowerCase();if(k&&!works.has(k))works.set(k,w)}ok=true;issnReports.push({issn,status:"ok"})}catch(e:any){const issue={company_id:company.id,source:source.name,issn,error:e?.message||String(e)};failures.push(issue);issnReports.push({...issue,status:"error"})}}
          if(ok)await admin.from("pvos_literature_sources").update({last_checked_at:now.toISOString(),next_due_at:new Date(now.getTime()+Number(setting.cadence_hours||4)*3600000).toISOString(),metadata:{...(source.metadata||{}),last_automated_check_at:now.toISOString(),automation_status:issnReports.some(x=>x.status==="error")?"partial":"ok",connector_status:"active",...(baselineStart&&!issnReports.some(x=>x.status==="error")?{crossref_backfill_pending:false,crossref_backfill_completed_at:now.toISOString()}:{}),last_automated_report:{retrieved:works.size,issn_reports:issnReports}}}).eq("id",source.id);
          sourceReports.push({source:source.name,status:ok?(issnReports.some(x=>x.status==="error")?"partial":"ok"):"error",retrieved:works.size,issn_reports:issnReports});
          for(const w of works.values()){
            const title=clean(Array.isArray(w.title)?w.title[0]:w.title);if(!title)continue;const abstract=clean(w.abstract||""),doi=String(w.DOI||"").trim()||null,urlx=String(w.URL||"").trim()||(doi?"https://doi.org/"+doi:source.url),pubDate=bestCrossrefDate(w);
            for(const product of products){const terms=productTerms(product);const a=refineRanking(analyzeArticle(title,abstract,Array.isArray(w.subject)?w.subject:[],terms),title,abstract,terms);if(!a.matchedTerms.length)continue;
              candidates.push({product_id:product.id,source_id:source.id,title,journal:source.name,publication_date:pubDate,article_url:urlx,doi,abstract:abstract||null,matched_terms:a.matchedTerms,relevance:a.relevance,ai_reason:a.reason,review_status:"unreviewed",metadata:{connector:source.metadata?.connector||"crossref_journal",automated_screening:true,discovery_channel:baselineStart?"crossref_initial_baseline_and_updates":"crossref_update_date",crossref_baseline_start:baselineStart,retrieved_at:now.toISOString(),saudi_journal:true,urgent_saudi:a.urgentSaudi,saudi_hits:a.saudiHits,safety_hits:a.safetyHits,special_hits:a.specialHits,lack_efficacy_hits:a.lackEfficacyHits,interaction_hits:a.interactionHits,case_hits:a.caseHits,assessment_state:a.assessmentState,full_text_required:a.fullTextRequired,publication_context:a.publicationContext,product_role:a.productRole,finding_types:a.findingTypes,prioritization_version:a.analysisVersion}})
            }
          }
        }

        for(const source of openSources){
          let landing:any=null;const attempts:any[]=[];
          for(const scanUrl of scanUrls(source)){const r=await fetchHtml(scanUrl);attempts.push({url:scanUrl,status:r.status,ok:r.ok});if(r.ok&&!unusableJournalPage(r.text)){landing=r;break}}
          if(!landing){failures.push({company_id:company.id,source:source.name,error:"Open source unavailable"});sourceReports.push({source:source.name,status:"error"});continue}
          const cands=articleCandidates(landing.text,landing.url,source);
          if(!cands.length){failures.push({company_id:company.id,source:source.name,error:"No article links found; coverage not verified",attempts});sourceReports.push({source:source.name,status:"error"});continue}
          const known=await readAllRows((from,to)=>admin.from("pvos_literature_source_entries").select("external_key,article_url,first_seen_at").eq("source_id",source.id).order("id").range(from,to));
          const knownKeys=new Map(known.map((x:any)=>[x.external_key,x]));
          const knownUrls=new Set((known||[]).map((x:any)=>String(x.article_url||"").toLowerCase()));
          const newCands=cands.filter((x:any)=>!knownUrls.has(String(x.url).toLowerCase())).slice(0,20);
          let added=0;const sourceFailureStart=failures.length;
          for(const cand of newCands){
            const page=await fetchHtml(cand.url);if(!page.ok||unusableJournalPage(page.text)){failures.push({company_id:company.id,source:source.name,error:"Article page unavailable",article_url:cand.url,http_status:page.status});continue;}
            const canon=canonical(page.text,page.url||cand.url),doi=meta(page.text,["citation_doi","dc.identifier"])||doiFrom(page.text),title=titleFrom(page.text,cand.title),abstract=abstractFrom(page.text)||null,pubDate=publicationDateFrom(page.text);
            const keyx=externalKey(doi||null,canon);
            await admin.from("pvos_literature_source_entries").upsert({organization_id:orgId,source_id:source.id,external_key:keyx,title,article_url:canon,doi:doi||null,publication_date:pubDate,abstract,first_seen_at:knownKeys.get(keyx)?.first_seen_at||now.toISOString(),last_seen_at:now.toISOString(),metadata:{connector:"open_web_snapshot",automated:true,source_retrieved_at:now.toISOString()}},{onConflict:"source_id,external_key"});
            added++;
            for(const product of products){const terms=productTerms(product);const a=refineRanking(analyzeArticle(title,abstract||"",[],terms),title,abstract||"",terms);if(!a.matchedTerms.length)continue;
              candidates.push({product_id:product.id,source_id:source.id,title,journal:source.name,publication_date:pubDate,article_url:canon,doi:doi||null,abstract,matched_terms:a.matchedTerms,relevance:a.relevance,ai_reason:a.reason,review_status:"unreviewed",metadata:{connector:"open_web_snapshot",automated_screening:true,discovery_channel:"first_seen_snapshot",retrieved_at:now.toISOString(),saudi_journal:true,source_first_seen_at:now.toISOString(),urgent_saudi:a.urgentSaudi,saudi_hits:a.saudiHits,safety_hits:a.safetyHits,special_hits:a.specialHits,lack_efficacy_hits:a.lackEfficacyHits,interaction_hits:a.interactionHits,case_hits:a.caseHits,assessment_state:a.assessmentState,full_text_required:a.fullTextRequired,publication_context:a.publicationContext,product_role:a.productRole,finding_types:a.findingTypes,prioritization_version:a.analysisVersion}})
            }
          }
          await admin.from("pvos_literature_sources").update({last_checked_at:now.toISOString(),next_due_at:new Date(now.getTime()+Number(setting.cadence_hours||4)*3600000).toISOString(),metadata:{...(source.metadata||{}),snapshot_initialized:true,last_automated_check_at:now.toISOString(),automation_status:failures.length>sourceFailureStart?"partial":"ok"}}).eq("id",source.id);
          sourceReports.push({source:source.name,status:failures.length>sourceFailureStart?"partial":"ok",candidates:cands.length,new_entries:added});
        }

        const dedup=new Map<string,any>();for(const x of candidates){const k=uniqueKey(x);if(!globalSeen.has(k)&&!dedup.has(k))dedup.set(k,x)}
        const inserted:any[]=[];
        for(const x of dedup.values()){
          const ins=await admin.from("pvos_literature_items").insert({...x,organization_id:orgId,run_id:run.id,company_id:company.id}).select("*").single();
          if(ins.error){if(!/duplicate/i.test(ins.error.message))failures.push({company_id:company.id,source:x.journal,error:ins.error.message});continue}
          inserted.push(ins.data);globalSeen.add(uniqueKey(x));
          const al=alertFor(ins.data);
          if(al){const ai=await admin.from("pvos_literature_alerts").upsert({organization_id:orgId,company_id:company.id,product_id:ins.data.product_id,literature_item_id:ins.data.id,alert_type:al.alert_type,severity:al.severity,title:ins.data.title,reason:al.reason,metadata:{automated:true,created_from_run:run.id,alert_policy_version:"v2",trigger:al.trigger||null}},{onConflict:"literature_item_id,alert_type"});if(!ai.error)orgAlerts++}
        }
        orgNew+=inserted.length;
        const {count}=await admin.from("pvos_literature_items").select("id",{count:"exact",head:true}).eq("run_id",run.id);
        await admin.from("pvos_literature_runs").update({status:"review",result_count:count||0,metadata:{...(run.metadata||{}),automated:true,last_automated_check_at:now.toISOString(),last_check_new_items:inserted.length,last_check_alerts:inserted.filter((x:any)=>!!alertFor(x)).length,last_check_source_reports:sourceReports,last_check_failures:failures.filter((x:any)=>x.company_id===company.id)}}).eq("id",run.id);
      }
      const status=failures.length||coverageGaps.length?"partial":"ok";const next=new Date(now.getTime()+Number(setting.cadence_hours||4)*3600000).toISOString();
      await admin.from("pvos_literature_automation_settings").update({last_run_at:now.toISOString(),next_due_at:next,last_status:status,last_result:{new_items:orgNew,alerts:orgAlerts,failures,coverage_gaps:coverageGaps,checked_at:now.toISOString()},updated_at:now.toISOString()}).eq("organization_id",orgId);
      overall.push({organization_id:orgId,status,new_items:orgNew,alerts:orgAlerts,failures:failures.length});
    }catch(e:any){
      await admin.from("pvos_literature_automation_settings").update({last_run_at:now.toISOString(),next_due_at:new Date(now.getTime()+Number(setting.cadence_hours||4)*3600000).toISOString(),last_status:"error",last_result:{error:e?.message||String(e),checked_at:now.toISOString()},updated_at:now.toISOString()}).eq("organization_id",orgId);
      overall.push({organization_id:orgId,status:"error",error:e?.message||String(e)});
    }
  }
  return Response.json({ok:true,checked_at:now.toISOString(),organizations:overall});
});

