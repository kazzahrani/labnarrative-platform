"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Badge, Header } from "../_components";
import { usePVOS } from "../_provider";
import { pvosSupabase } from "../_pvos-supabase";
import styles from "../pvos.module.css";

type Tab="sources"|"queue"|"runs"|"second"|"alerts"|"psur";
type ReviewStatus="unreviewed"|"relevant"|"not_relevant"|"needs_review";

const today=()=>new Date().toISOString().slice(0,10);
function daysAgo(n:number){const d=new Date();d.setDate(d.getDate()-n);return d.toISOString().slice(0,10)}
function nextDue(frequency:string){
  const d=new Date();
  if(frequency==="daily")d.setDate(d.getDate()+1);
  else if(frequency==="weekly")d.setDate(d.getDate()+7);
  else if(frequency==="monthly")d.setMonth(d.getMonth()+1);
  else if(frequency==="quarterly")d.setMonth(d.getMonth()+3);
  else return null;
  return d.toISOString();
}
function dateLabel(v?:string|null){
  if(!v)return "—";
  const d=new Date(v.length===10?v+"T00:00:00":v);
  return Number.isNaN(d.getTime())?"—":d.toLocaleDateString(undefined,{day:"2-digit",month:"short",year:"numeric"});
}
function dateTimeLabel(v?:string|null){
  if(!v)return "—";
  const d=new Date(v);
  return Number.isNaN(d.getTime())?"—":d.toLocaleString(undefined,{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"});
}
function relevanceLabel(v:string){
  if(v==="likely_relevant")return "Likely relevant";
  if(v==="possible")return "Possible";
  if(v==="unlikely")return "Unlikely";
  return "Unscored";
}
function relevanceTone(v:string):"default"|"red"|"amber"|"green"|"lime"{
  if(v==="likely_relevant")return "red";
  if(v==="possible")return "amber";
  if(v==="unlikely")return "green";
  return "default";
}
function reviewLabel(v:string){
  if(v==="relevant")return "Relevant";
  if(v==="not_relevant")return "Not relevant";
  if(v==="needs_review")return "Needs review";
  return "Unreviewed";
}
type SecondPassDecision="relevant"|"not_relevant"|"needs_review"|"full_text";
function secondPassSuggestion(x:any):SecondPassDecision{
  if(x.metadata?.full_text_required)return "full_text";
  const text=((x.title||"")+" "+(x.abstract||"")).toLowerCase();
  const role=x.metadata?.product_role||"";
  const context=x.metadata?.publication_context||"";
  const types:Array<string>=Array.isArray(x.metadata?.finding_types)?x.metadata.finding_types:[];

  if(x.metadata?.urgent_saudi)return "needs_review";

  if(
    text.includes("withheld")||
    text.includes("discontinuation")||
    text.includes("stopping anticoagulation")||
    text.includes("perioperative interruption")
  )return "needs_review";

  const directSafety=
    types.includes("safety")||
    types.includes("special_situation")||
    types.includes("interaction")||
    types.includes("lack_of_efficacy");

  if(
    text.includes("pharmacovigilance")||
    text.includes("faers")||
    text.includes("adverse event reporting system")||
    text.includes("drug-drug interaction signal")||
    text.includes("interaction signals")||
    (text.includes("resistance")&&role==="subject")||
    (text.includes("fertility")&&text.includes("negative impact")&&role==="subject")
  )return "relevant";

  if(role==="subject"&&directSafety&&context==="human_clinical")return "relevant";

  if(
    role==="comparator"&&
    directSafety&&
    (text.includes("bleeding")||text.includes("adverse event")||text.includes("pharmacovigilance"))
  )return "relevant";

  if(
    role==="comparator"||
    ["preclinical","health_economic","environmental","analytical_or_formulation"].includes(context)||
    text.includes("positive control metformin")||
    text.includes("protective effect")||
    text.includes("associated with lower")||
    text.includes("significant reduction in")||
    text.includes("unexpected breast cancer regression")||
    text.includes("clinical benefits of metformin")||
    text.includes("pharmacologic cancer prevention")
  )return "not_relevant";

  if(
    text.includes("review")||
    text.includes("meta-analysis")||
    text.includes("meta analysis")||
    text.includes("top 20 research studies")
  )return directSafety?"needs_review":"not_relevant";

  return "needs_review";
}

export default function LiteraturePage(){
  const {organizationId,session}=usePVOS();
  const [tab,setTab]=useState<Tab>("sources");
  const [sources,setSources]=useState<any[]>([]);
  const [runs,setRuns]=useState<any[]>([]);
  const [items,setItems]=useState<any[]>([]);
  const [companies,setCompanies]=useState<any[]>([]);
  const [products,setProducts]=useState<any[]>([]);
  const [followups,setFollowups]=useState<any[]>([]);
  const [records,setRecords]=useState<any[]>([]);
  const [secondReviews,setSecondReviews]=useState<any[]>([]);
  const [members,setMembers]=useState<any[]>([]);
  const [alerts,setAlerts]=useState<any[]>([]);
  const [automationSetting,setAutomationSetting]=useState<any|null>(null);
  const [loading,setLoading]=useState(true);
  const [showSource,setShowSource]=useState(false);
  const [showRun,setShowRun]=useState(false);
  const [selectedRun,setSelectedRun]=useState<any|null>(null);
  const [selectedSecondReviewId,setSelectedSecondReviewId]=useState<string|null>(null);
  const [rapidOpen,setRapidOpen]=useState(false);
  const [rapidItemId,setRapidItemId]=useState<string|null>(null);
  const [rapidSeen,setRapidSeen]=useState<string[]>([]);
  const [rapidTotal,setRapidTotal]=useState(0);
  const [rapidReviewed,setRapidReviewed]=useState(0);
  const [busy,setBusy]=useState(false);
  const [analyzing,setAnalyzing]=useState(false);
  const [queueFilter,setQueueFilter]=useState<"open"|"priority"|"fulltext"|"saudi"|"reviewed"|"all">("open");
  const [sourceFilter,setSourceFilter]=useState<"all"|"active"|"saudi"|"planned">("all");
  const [productFilter,setProductFilter]=useState("");
  const [runFilter,setRunFilter]=useState("");
  const [batchMode,setBatchMode]=useState(false);
  const [batchSelected,setBatchSelected]=useState<string[]>([]);
  const [batchPinned,setBatchPinned]=useState<string[]>([]);
  const [pendingRelevantId,setPendingRelevantId]=useState<string|null>(null);
  const [focusedAlertItemId,setFocusedAlertItemId]=useState<string|null>(null);
  const [activeAlertId,setActiveAlertId]=useState<string|null>(null);
  const [secondReviewerId,setSecondReviewerId]=useState("");
  const [secondReviewNote,setSecondReviewNote]=useState("");
  const [reviewerEmail,setReviewerEmail]=useState("");
  const [reviewerRole,setReviewerRole]=useState("deputy_qppv");
  const [message,setMessage]=useState("");
  const [sourceForm,setSourceForm]=useState({name:"",url:"",language:"English",frequency:"weekly",notes:""});
  const [runForm,setRunForm]=useState({companyId:"",start:daysAgo(7),end:today()});

  async function loadRows(table:"pvos_literature_items"|"pvos_literature_followups"){
    const rows:any[]=[];
    for(let offset=0;;offset+=1000){
      const result=await pvosSupabase.from(table).select("*").eq("organization_id",organizationId).order("created_at",{ascending:false}).order("id").range(offset,offset+999);
      if(result.error)return {data:null,error:result.error};
      rows.push(...(result.data||[]));
      if((result.data||[]).length<1000)return {data:rows,error:null};
    }
  }

  async function load(){
    if(!organizationId)return;
    setLoading(true);
    const [s,r,i,c,f,rec,sr,mem,al,auto]=await Promise.all([
      pvosSupabase.from("pvos_literature_sources").select("*").eq("organization_id",organizationId).order("name"),
      pvosSupabase.from("pvos_literature_runs").select("*").eq("organization_id",organizationId).order("period_end",{ascending:false}),
      loadRows("pvos_literature_items"),
      pvosSupabase.from("pvos_companies").select("id,name").eq("organization_id",organizationId).order("name"),
      loadRows("pvos_literature_followups"),
      pvosSupabase.from("pvos_literature_screening_records").select("*").eq("organization_id",organizationId).order("completed_at",{ascending:false}),
      pvosSupabase.from("pvos_literature_second_reviews").select("*").eq("organization_id",organizationId).order("assigned_at",{ascending:false}),
      pvosSupabase.rpc("pvos_member_directory",{p_organization_id:organizationId}),
      pvosSupabase.from("pvos_literature_alerts").select("*").eq("organization_id",organizationId).order("created_at",{ascending:false}),
      pvosSupabase.from("pvos_literature_automation_settings").select("*").eq("organization_id",organizationId).maybeSingle()
    ]);
    const loadError=[s,r,i,c,f,rec,sr,mem,al,auto].find(result=>result.error)?.error;
    if(loadError){setMessage("Could not load the complete literature workspace: "+loadError.message);setLoading(false);return;}
    const cs=c.data||[];
    let ps:any[]=[];
    if(cs.length){
      const {data}=await pvosSupabase.from("pvos_products").select("id,company_id,brand_name,active_ingredient").in("company_id",cs.map(x=>x.id)).order("brand_name");
      ps=data||[];
    }
    setSources(s.data||[]);
    setRuns(r.data||[]);
    setItems(i.data||[]);
    setCompanies(cs);
    setProducts(ps);
    setFollowups(f.data||[]);
    setRecords(rec.data||[]);
    setSecondReviews(sr.data||[]);
    setMembers(mem.data||[]);
    setAlerts(al.data||[]);
    setAutomationSetting(auto.data||null);
    setRunForm(v=>({...v,companyId:v.companyId||cs[0]?.id||""}));
    setLoading(false);
  }

  useEffect(()=>{load()},[organizationId]);

  const companyMap=useMemo(()=>Object.fromEntries(companies.map(x=>[x.id,x.name])),[companies]);
  const productMap=useMemo(()=>Object.fromEntries(products.map(x=>[x.id,x])),[products]);
  const sourceMap=useMemo(()=>Object.fromEntries(sources.map(x=>[x.id,x])),[sources]);
  const memberMap=useMemo(()=>Object.fromEntries(members.map(x=>[x.user_id,x])),[members]);
  const literatureItemMap=useMemo(()=>Object.fromEntries(items.map(x=>[x.id,x])),[items]);
  const runMap=useMemo(()=>Object.fromEntries(runs.map(x=>[x.id,x])),[runs]);
  const secondReviewMap=useMemo(()=>Object.fromEntries(secondReviews.map(x=>[x.run_id,x])),[secondReviews]);
  const myPendingSecondReviews=secondReviews.filter(x=>x.status==="pending"&&x.assigned_to===session?.user.id);
  const selectedSecondReview=selectedSecondReviewId?secondReviews.find(x=>x.id===selectedSecondReviewId)||null:null;
  const selectedSecondRun=selectedSecondReview?runMap[selectedSecondReview.run_id]||null:null;
  const selectedSecondScope=Array.isArray(selectedSecondReview?.metadata?.scope_snapshot)?selectedSecondReview.metadata.scope_snapshot:[];
  const openAlerts=alerts.filter(x=>x.status==="open");
  const automationResult=automationSetting?.last_result||{};
  const automationFailures=Array.isArray(automationResult?.failures)?automationResult.failures:[];
  const activeSources=sources.filter(x=>x.active);
  const saudiSources=sources.filter(x=>x.metadata?.source_group==="Saudi journals 2025");
  const liveSaudiSources=saudiSources.filter(x=>x.active);
  const plannedSaudiSources=saudiSources.filter(x=>!x.active);
  const visibleSources=sources.filter(x=>{
    if(sourceFilter==="active")return !!x.active;
    if(sourceFilter==="saudi")return x.metadata?.source_group==="Saudi journals 2025";
    if(sourceFilter==="planned")return !x.active&&x.metadata?.source_group==="Saudi journals 2025";
    return true;
  });
  const openItems=items.filter(x=>x.review_status==="unreviewed"||x.review_status==="needs_review");
  const reviewed=items.filter(x=>x.review_status==="relevant"||x.review_status==="not_relevant");
  const priorityItems=items.filter(x=>x.relevance==="likely_relevant"&&(x.review_status==="unreviewed"||x.review_status==="needs_review"));
  const fullTextItems=items.filter(x=>x.metadata?.full_text_required&&(x.review_status==="unreviewed"||x.review_status==="needs_review"));
  const saudiAlerts=items.filter(x=>x.metadata?.urgent_saudi&&(x.review_status==="unreviewed"||x.review_status==="needs_review"));
  const sortedItems=useMemo(()=>items.slice().sort((a,b)=>{
    const score=(x:any)=>{
      let n=0;
      if(x.metadata?.urgent_saudi)n+=100;
      if(x.metadata?.full_text_required)n+=45;
      if(x.relevance==="likely_relevant")n+=50;
      else if(x.relevance==="possible")n+=30;
      else if(x.relevance==="unscored")n+=20;
      else n+=10;
      return n;
    };
    return score(b)-score(a);
  }),[items]);
  const visibleItems=useMemo(()=>sortedItems.filter(x=>{
    if(focusedAlertItemId&&x.id!==focusedAlertItemId)return false;
    if(runFilter&&x.run_id!==runFilter)return false;
    if(productFilter&&x.product_id!==productFilter)return false;
    const open=x.review_status==="unreviewed"||x.review_status==="needs_review";
    const keepRelevantHere=(x.id===pendingRelevantId||batchPinned.includes(x.id))&&x.review_status==="relevant";
    if(queueFilter==="open")return open||keepRelevantHere;
    if(queueFilter==="priority")return x.relevance==="likely_relevant"&&(open||keepRelevantHere);
    if(queueFilter==="fulltext")return !!x.metadata?.full_text_required&&(open||keepRelevantHere);
    if(queueFilter==="saudi")return !!x.metadata?.urgent_saudi&&(open||keepRelevantHere);
    if(queueFilter==="reviewed")return x.review_status==="relevant"||x.review_status==="not_relevant";
    return true;
  }),[sortedItems,queueFilter,productFilter,runFilter,pendingRelevantId,batchPinned,focusedAlertItemId]);
  const rapidCandidates=useMemo(()=>sortedItems.filter(x=>{
    if(runFilter&&x.run_id!==runFilter)return false;
    if(productFilter&&x.product_id!==productFilter)return false;
    if(rapidSeen.includes(x.id))return false;
    return x.review_status==="unreviewed"||x.review_status==="needs_review";
  }),[sortedItems,productFilter,runFilter,rapidSeen]);
  const rapidItem=rapidItemId?items.find(x=>x.id===rapidItemId)||null:null;
  const hasFollowup=(itemId:string,destination:string)=>followups.some(x=>x.literature_item_id===itemId&&x.destination===destination&&x.status!=="dismissed");
  const recordMap=useMemo(()=>Object.fromEntries(records.map(x=>[x.run_id,x])),[records]);
  const selectedQueueRun=useMemo(()=>runs.find(x=>x.id===runFilter)||null,[runs,runFilter]);
  const queueSecondReview=selectedQueueRun?secondReviewMap[selectedQueueRun.id]:null;
  const queueLockedForSecondReview=!!queueSecondReview&&(queueSecondReview.status==="pending"||queueSecondReview.status==="approved");

  async function freshAccessToken(){
    const {data:{session:current}}=await pvosSupabase.auth.getSession();
    const now=Math.floor(Date.now()/1000);
    if(current?.access_token && (!current.expires_at || current.expires_at-now>60))return current.access_token;
    const {data,error}=await pvosSupabase.auth.refreshSession();
    if(error||!data.session?.access_token)throw new Error("Your PVOS session expired. Please sign in again.");
    return data.session.access_token;
  }

  async function authorizedFetch(input:string,init:RequestInit){
    const requestWithToken=async(token:string)=>{
      let body=init.body;
      if(typeof body==="string"){
        try{
          const parsed=JSON.parse(body);
          body=JSON.stringify({...parsed,accessToken:token});
        }catch{}
      }
      return fetch(input,{
        ...init,
        body,
        headers:{...(init.headers||{}),"Authorization":"Bearer "+token}
      });
    };

    let token=await freshAccessToken();
    let response=await requestWithToken(token);
    if(response.status===401){
      const {data,error}=await pvosSupabase.auth.refreshSession();
      if(error||!data.session?.access_token)return response;
      token=data.session.access_token;
      response=await requestWithToken(token);
    }
    return response;
  }
  const batchRunItems=useMemo(()=>runFilter?items.filter(x=>x.run_id===runFilter):[],[items,runFilter]);
  const batchRemainingEligible=batchRunItems.filter(x=>x.review_status==="unreviewed"&&!x.metadata?.full_text_required);
  const batchLikelyOpen=batchRunItems.filter(x=>x.review_status==="unreviewed"&&x.relevance==="likely_relevant"&&!x.metadata?.full_text_required);
  const batchPossibleOpen=batchRunItems.filter(x=>x.review_status==="unreviewed"&&x.relevance==="possible"&&!x.metadata?.full_text_required);
  const batchHighConfidenceRelevant=batchRunItems.filter(x=>
    x.review_status==="unreviewed"&&
    x.relevance==="likely_relevant"&&
    x.metadata?.product_role==="subject"&&
    x.metadata?.publication_context==="human_clinical"&&
    Array.isArray(x.metadata?.finding_types)&&
    x.metadata.finding_types.some((v:string)=>["safety","special_situation","lack_of_efficacy","interaction"].includes(v))
  );
  const batchLowRiskPossible=batchRunItems.filter(x=>{
    const types=Array.isArray(x.metadata?.finding_types)?x.metadata.finding_types:[];
    return x.review_status==="unreviewed"&&
      x.relevance==="possible"&&
      !x.metadata?.full_text_required&&
      x.metadata?.product_role==="comparator"&&
      (
        ["health_economic","preclinical"].includes(x.metadata?.publication_context)||
        types.length===0||
        (types.length===1&&types[0]==="quantified")
      );
  });
  const batchUnlikelyOpen=batchRunItems.filter(x=>x.review_status==="unreviewed"&&x.relevance==="unlikely"&&!x.metadata?.full_text_required&&!x.metadata?.urgent_saudi);
  const batchFullTextOpen=batchRunItems.filter(x=>(x.review_status==="unreviewed"||x.review_status==="needs_review")&&x.metadata?.full_text_required);
  const batchNeedsReview=batchRunItems.filter(x=>x.review_status==="needs_review"&&!x.metadata?.full_text_required);
  const batchSecondPass=useMemo(()=>{
    const out={relevant:[] as any[],not_relevant:[] as any[],needs_review:[] as any[],full_text:[] as any[]};
    for(const x of batchRunItems){
      if(x.review_status!=="unreviewed")continue;
      const decision=secondPassSuggestion(x);
      out[decision].push(x);
    }
    return out;
  },[batchRunItems]);
  const runItems=(runId:string)=>items.filter(x=>x.run_id===runId);
  const runFollowups=(runId:string)=>{
    const ids=new Set(runItems(runId).map(x=>x.id));
    return followups.filter(x=>ids.has(x.literature_item_id));
  };
  const statsForRun=(run:any)=>{
    const xs=runItems(run.id);
    const fs=runFollowups(run.id);
    const reviewed=xs.filter(x=>x.review_status==="relevant"||x.review_status==="not_relevant");
    return {
      total:xs.length,
      reviewed:reviewed.length,
      open:xs.filter(x=>x.review_status==="unreviewed"||x.review_status==="needs_review").length,
      relevant:xs.filter(x=>x.review_status==="relevant").length,
      notRelevant:xs.filter(x=>x.review_status==="not_relevant").length,
      saudi:xs.filter(x=>x.metadata?.urgent_saudi).length,
      signal:fs.filter(x=>x.destination==="signal_review"&&x.status!=="dismissed").length,
      psur:fs.filter(x=>x.destination==="psur_evidence"&&x.status!=="dismissed").length
    };
  };
  const psurEvidence=followups
    .filter(x=>x.destination==="psur_evidence"&&x.status!=="dismissed")
    .map(x=>({followup:x,item:items.find(i=>i.id===x.literature_item_id),product:productMap[x.product_id]}))
    .filter(x=>x.item);
  const runCounts=useMemo(()=>{
    const out:Record<string,{total:number;reviewed:number}>={};
    for(const x of items){
      out[x.run_id]??={total:0,reviewed:0};
      out[x.run_id].total++;
      if(x.review_status==="relevant"||x.review_status==="not_relevant")out[x.run_id].reviewed++;
    }
    return out;
  },[items]);

  async function addSource(e:FormEvent){
    e.preventDefault();
    if(!organizationId||!sourceForm.name.trim())return;
    setBusy(true);setMessage("");
    const {error}=await pvosSupabase.from("pvos_literature_sources").insert({
      organization_id:organizationId,
      name:sourceForm.name.trim(),
      url:sourceForm.url.trim()||null,
      language:sourceForm.language,
      screening_frequency:sourceForm.frequency,
      method:"manual",
      next_due_at:nextDue(sourceForm.frequency),
      notes:sourceForm.notes.trim()||null,
      metadata:{v0:true}
    });
    setBusy(false);
    if(error){setMessage(error.message);return;}
    setSourceForm({name:"",url:"",language:"English",frequency:"weekly",notes:""});
    setShowSource(false);setMessage("Literature source added.");await load();
  }

  async function updateLiteratureAlert(alert:any,status:"acknowledged"|"dismissed"){
    if(!session)return;
    setBusy(true);setMessage("");
    try{
      const patch=status==="acknowledged"
        ?{status,acknowledged_by:session.user.id,acknowledged_at:new Date().toISOString()}
        :{status,acknowledged_by:null,acknowledged_at:null};
      const {error}=await pvosSupabase.from("pvos_literature_alerts").update(patch).eq("id",alert.id);
      if(error)throw error;
      await load();
    }catch(e:any){
      setMessage(e?.message||"Could not update literature alert.");
    }finally{
      setBusy(false);
    }
  }

  function openAlertInQueue(alert:any){
    const item=literatureItemMap[alert.literature_item_id];
    if(item){
      setRunFilter(item.run_id||"");
      setProductFilter(item.product_id||"");
      setQueueFilter("all");
      setFocusedAlertItemId(item.id);
      setActiveAlertId(alert.id);
    }
    setTab("queue");
  }

  async function finishAlertReview(item:any){
    setPendingRelevantId(null);
    if(!activeAlertId||focusedAlertItemId!==item.id)return;
    if(!session)return;
    setBusy(true);
    try{
      const {error}=await pvosSupabase.from("pvos_literature_alerts").update({
        status:"acknowledged",
        acknowledged_by:session.user.id,
        acknowledged_at:new Date().toISOString()
      }).eq("id",activeAlertId);
      if(error)throw error;
      setFocusedAlertItemId(null);
      setActiveAlertId(null);
      setRunFilter("");
      setProductFilter("");
      setQueueFilter("open");
      await load();
      setTab("alerts");
    }catch(e:any){
      setMessage(e?.message||"Could not complete alert review.");
    }finally{
      setBusy(false);
    }
  }

  async function createRun(e:FormEvent){
    e.preventDefault();
    if(!organizationId||!session||!runForm.companyId||!runForm.start||!runForm.end)return;
    if(runForm.end<runForm.start){setMessage("Period end must be on or after the start date.");return;}
    const companyProducts=products.filter(x=>x.company_id===runForm.companyId);
    if(!companyProducts.length){setMessage("This company has no products to screen.");return;}
    const crossrefSources=sources.filter(x=>x.active&&["lww_crossref","crossref_journal"].includes(x.metadata?.connector));
    const lwwSources=crossrefSources.filter(x=>x.metadata?.platform==="lww");
    const openWebSources=sources.filter(x=>x.active&&x.metadata?.connector==="open_web_snapshot");

    setBusy(true);setMessage("");
    let runId:string|undefined;
    try{
      const {data:source,error:sourceError}=await pvosSupabase.from("pvos_literature_sources").upsert({
        organization_id:organizationId,
        name:"PubMed",
        url:"https://pubmed.ncbi.nlm.nih.gov/",
        language:"English",
        screening_frequency:"weekly",
        method:"api",
        active:true,
        next_due_at:nextDue("weekly"),
        metadata:{system_source:true,connector:"pubmed"}
      },{onConflict:"organization_id,name"}).select("*").single();
      if(sourceError)throw sourceError;

      const {data:run,error:runError}=await pvosSupabase.from("pvos_literature_runs").insert({
        organization_id:organizationId,
        company_id:runForm.companyId,
        period_start:runForm.start,
        period_end:runForm.end,
        status:"running",
        started_by:session.user.id,
        source_count:1+crossrefSources.length+openWebSources.length,
        product_count:companyProducts.length,
        metadata:{
          v0:true,
          scope:"all_company_products",
          connectors:[
            "pubmed",
            ...(crossrefSources.length?["crossref_journal"]:[]),
            ...(lwwSources.length?["lww_direct"]:[]),
            ...(openWebSources.length?["open_web_snapshot"]:[])
          ]
        }
      }).select("*").single();
      if(runError||!run)throw runError||new Error("Could not create screening run.");
      runId=run.id;

      const productPayload=companyProducts.map(p=>({
        id:p.id,
        brand_name:p.brand_name,
        active_ingredient:p.active_ingredient
      }));

      const response=await authorizedFetch("/api/pvos/literature/pubmed",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          periodStart:runForm.start,
          periodEnd:runForm.end,
          products:productPayload
        })
      });
      const result=await response.json();
      if(!response.ok)throw new Error(result?.error||"PubMed screening failed.");

      let lwwResult:any={items:[],reports:[],sources_checked:0,results:0};
      let lwwDirect:any={items:[],reports:[],sources_checked:0,results:0,skipped:false};
      let lwwError:string|null=null;
      let lwwDirectError:string|null=null;
      if(crossrefSources.length){
        try{
          const lwwResponse=await authorizedFetch("/api/pvos/literature/lww",{
            method:"POST",
            headers:{"Content-Type":"application/json"},
            body:JSON.stringify({
              periodStart:runForm.start,
              periodEnd:runForm.end,
              products:productPayload,
              sources:crossrefSources.map(s=>({
                id:s.id,
                name:s.name,
                url:s.url,
                metadata:s.metadata||{}
              }))
            })
          });
          lwwResult=await lwwResponse.json();
          if(!lwwResponse.ok)throw new Error(lwwResult?.error||"Saudi journal metadata screening failed.");
        }catch(e:any){
          lwwError=e?.message||"Saudi journal metadata screening failed.";
          lwwResult={items:[],reports:[],sources_checked:crossrefSources.length,results:0};
        }
      }

      if(lwwSources.length){
        try{
          const directResponse=await authorizedFetch("/api/pvos/literature/lww-direct",{
            method:"POST",
            headers:{"Content-Type":"application/json"},
            body:JSON.stringify({
              periodStart:runForm.start,
              periodEnd:runForm.end,
              products:productPayload,
              sources:lwwSources.map(s=>({
                id:s.id,
                name:s.name,
                url:s.url,
                metadata:s.metadata||{}
              }))
            })
          });
          lwwDirect=await directResponse.json();
          if(!directResponse.ok)throw new Error(lwwDirect?.error||"Direct LWW monitoring failed.");
        }catch(e:any){
          lwwDirectError=e?.message||"Direct LWW monitoring failed.";
          lwwDirect={items:[],reports:[],sources_checked:lwwSources.length,results:0,skipped:false};
        }
      }

      let openWebResult:any={entries:[],matches:[],reports:[],sources_checked:0,sources_ok:0};
      let openWebError:string|null=null;
      let openRegistration:any={new_keys:[],new_count:0,total:0};

      if(openWebSources.length){
        try{
          const openResponse=await authorizedFetch("/api/pvos/literature/saudi-open",{
            method:"POST",
            headers:{"Content-Type":"application/json"},
            body:JSON.stringify({
              organizationId,
              periodStart:runForm.start,
              periodEnd:runForm.end,
              products:productPayload,
              sources:openWebSources.map(s=>({
                id:s.id,
                name:s.name,
                url:s.url,
                metadata:s.metadata||{}
              }))
            })
          });
          openWebResult=await openResponse.json();
          if(!openResponse.ok)throw new Error(openWebResult?.error||"Open Saudi journal monitoring failed.");

          if((openWebResult.entries||[]).length){
            const {data,error}=await pvosSupabase.rpc("pvos_register_literature_source_entries",{
              p_entries:openWebResult.entries
            });
            if(error)throw error;
            openRegistration=data||openRegistration;
          }
        }catch(e:any){
          openWebError=e?.message||"Open Saudi journal monitoring failed.";
          openWebResult={entries:[],matches:[],reports:[],sources_checked:openWebSources.length,sources_ok:0};
        }
      }

      const failedJournalReports=(lwwResult.reports||[]).filter((r:any)=>r.status!=="ok"||r.truncated);
      const journalWarning=lwwError||(failedJournalReports.length?failedJournalReports.length+" of "+crossrefSources.length+" Saudi metadata checks failed or were incomplete.":null);
      const failedOpenReports=(openWebResult.reports||[]).filter((r:any)=>r.status!=="ok");
      const openWarning=openWebError||(failedOpenReports.length?failedOpenReports.length+" of "+openWebSources.length+" open Saudi journal checks failed.":null);

      const pubmedPayload=(result.items||[]).map((x:any)=>({
        ...x,
        organization_id:organizationId,
        run_id:run.id,
        source_id:source.id,
        company_id:runForm.companyId
      }));
      const crossrefSourceMap=Object.fromEntries(crossrefSources.map(s=>[s.name,s.id]));
      const saudiPayload=(lwwResult.items||[]).map((x:any)=>({
        ...x,
        organization_id:organizationId,
        run_id:run.id,
        source_id:crossrefSourceMap[x.metadata?.source_name]||null,
        company_id:runForm.companyId
      })).filter((x:any)=>!!x.source_id);
      const directSaudiPayload=(lwwDirect.items||[]).map((x:any)=>({
        ...x,
        organization_id:organizationId,
        run_id:run.id,
        source_id:crossrefSourceMap[x.metadata?.source_name]||null,
        company_id:runForm.companyId
      })).filter((x:any)=>!!x.source_id);
      const openSourceMap=Object.fromEntries(openWebSources.map(s=>[s.id,s]));
      const newOpenKeys=new Set<string>((openRegistration?.new_keys||[]).map((x:any)=>String(x)));
      const endDistance=Math.abs(Date.now()-new Date(runForm.end+"T23:59:59").getTime());
      const recentRun=endDistance<=45*86400000;
      const openSaudiPayload=(openWebResult.matches||[]).filter((x:any)=>{
        const s=openSourceMap[x.source_id];
        if(!s)return false;
        const registeredKey=x.source_id+"::"+x.external_key;
        if(!recentRun)return !!x.in_requested_period;
        if(!s.metadata?.snapshot_initialized)return !!x.in_requested_period;
        return newOpenKeys.has(registeredKey);
      }).map((x:any)=>({
        ...x,
        organization_id:organizationId,
        run_id:run.id,
        company_id:runForm.companyId,
        metadata:{
          ...(x.metadata||{}),
          source_snapshot_new:newOpenKeys.has(x.source_id+"::"+x.external_key),
          source_snapshot_baseline:!openSourceMap[x.source_id]?.metadata?.snapshot_initialized
        }
      }));

      const merged=new Map<string,any>();
      for(const x of pubmedPayload){
        const key=x.product_id+"::"+String(x.doi||x.article_url||x.title).toLowerCase();
        merged.set(key,x);
      }
      for(const x of [...saudiPayload,...directSaudiPayload,...openSaudiPayload]){
        const key=x.product_id+"::"+String(x.doi||x.article_url||x.title).toLowerCase();
        const existing=merged.get(key);
        if(existing){
          merged.set(key,{
            ...existing,
            ...x,
            abstract:x.abstract||existing.abstract,
            publication_date:x.publication_date||existing.publication_date,
            metadata:{
              ...(existing.metadata||{}),
              ...(x.metadata||{}),
              also_found_in:[...new Set([
                ...(existing.metadata?.also_found_in||[]),
                existing.metadata?.connector==="pubmed"?"PubMed":null,
                x.metadata?.connector==="open_web_snapshot"?"Direct Saudi journal":null,
                x.metadata?.direct_source_monitoring?"Direct LWW":"Saudi journal metadata"
              ].filter(Boolean))],
              pubmed_pmid:existing.metadata?.pmid||existing.metadata?.pubmed_pmid||null,
              direct_source_duplicate:true
            }
          });
        }else merged.set(key,x);
      }
      const payload=[...merged.values()];

      if(payload.length){
        const {error:itemError}=await pvosSupabase.from("pvos_literature_items").insert(payload);
        if(itemError)throw itemError;
      }

      const now=new Date().toISOString();
      const sourceUpdates=[
        pvosSupabase.from("pvos_literature_sources").update({
          last_checked_at:now,
          next_due_at:nextDue("weekly")
        }).eq("id",source.id),
        ...crossrefSources.map(s=>{
          const report=(lwwResult.reports||[]).find((r:any)=>r.source_id===s.id);
          const isLww=s.metadata?.platform==="lww";
          const directReport=isLww?(lwwDirect.reports||[]).find((r:any)=>r.source_id===s.id):null;
          const fallbackComplete=!lwwError&&report?.status==="ok"&&!report?.truncated;
          const directComplete=directReport?.status==="ok"&&directReport?.direct===true;
          return pvosSupabase.from("pvos_literature_sources").update({
            ...(fallbackComplete?{last_checked_at:now,next_due_at:nextDue("daily")}:{ }),
            metadata:{
              ...(s.metadata||{}),
              last_connector_check_at:now,
              last_connector_report:report||null,
              ...(isLww?{
                last_direct_check_at:now,
                last_direct_report:directReport||null,
                direct_monitoring_status:lwwDirect?.skipped
                  ?"historical_not_applicable"
                  :directComplete
                    ?"active"
                    :(directReport?.status||(lwwDirectError?"error":"unknown"))
              }:{}),
              connector_status:fallbackComplete?"active":"error"
            }
          }).eq("id",s.id);
        }),
        ...openWebSources.map(s=>{
          const report=(openWebResult.reports||[]).find((r:any)=>r.source_id===s.id);
          const complete=!openWebError&&report?.status==="ok";
          return pvosSupabase.from("pvos_literature_sources").update({
            ...(complete?{last_checked_at:now,next_due_at:nextDue("daily")}:{ }),
            metadata:{
              ...(s.metadata||{}),
              snapshot_initialized:complete?true:!!s.metadata?.snapshot_initialized,
              snapshot_initialized_at:!s.metadata?.snapshot_initialized&&complete?now:s.metadata?.snapshot_initialized_at||null,
              last_snapshot_check_at:now,
              last_snapshot_report:report||null,
              connector_status:complete?"active":"error",
              direct_monitoring_status:complete?"active":"error"
            }
          }).eq("id",s.id);
        })
      ];

      await Promise.all([
        ...sourceUpdates,
        pvosSupabase.from("pvos_literature_runs").update({
          status:"review",
          result_count:payload.length,
          metadata:{
            v0:true,
            scope:"all_company_products",
            connectors:[
              "pubmed",
              ...(crossrefSources.length?["crossref_journal"]:[]),
              ...(lwwSources.length?["lww_direct"]:[]),
              ...(openWebSources.length?["open_web_snapshot"]:[])
            ],
            pubmed_results:pubmedPayload.length,
            saudi_journal_results:saudiPayload.length,
            saudi_direct_results:directSaudiPayload.length,
            saudi_direct_sources_ok:Number(lwwDirect.direct_sources_ok||0),
            saudi_direct_sources_blocked:Number(lwwDirect.blocked_sources||0),
            saudi_direct_skipped:!!lwwDirect.skipped,
            open_saudi_sources_checked:openWebSources.length,
            open_saudi_sources_ok:Number(openWebResult.sources_ok||0),
            open_saudi_entries_seen:Number(openWebResult.entries?.length||0),
            open_saudi_new_entries:Number(openRegistration?.new_count||0),
            open_saudi_product_matches:openSaudiPayload.length,
            merged_results:payload.length,
            searches:result.searches||[],
            saudi_journal_reports:lwwResult.reports||[],
            saudi_direct_reports:lwwDirect.reports||[],
            saudi_journal_error:journalWarning,
            saudi_direct_error:lwwDirectError,
            open_saudi_reports:openWebResult.reports||[],
            open_saudi_error:openWarning,
            source_coverage_complete:!journalWarning&&!openWarning
          }
        }).eq("id",run.id)
      ]);

      setShowRun(false);
      setTab("queue");
      setMessage(
        "Screening run created: "+payload.length+" unique article-product results · "+
        pubmedPayload.length+" from PubMed"+
        (crossrefSources.length?" · "+saudiPayload.length+" Saudi product matches from "+crossrefSources.length+" metadata-monitored journals":"")+
        (lwwDirect?.skipped?" · direct LWW check skipped for historical period":lwwSources.length?" · "+Number(lwwDirect.direct_sources_ok||0)+"/"+lwwSources.length+" direct LWW sources reachable":"")+
        (journalWarning?" · WARNING — "+journalWarning:"")+
        (lwwDirectError?" · Direct LWW warning: "+lwwDirectError:"")+
        (openWebSources.length?" · "+Number(openWebResult.sources_ok||0)+"/"+openWebSources.length+" open Saudi sources reachable · "+openSaudiPayload.length+" new/date-matched product result(s)":"")+
        (openWarning?" · Open-source warning: "+openWarning:"")
      );
      await load();
    }catch(e:any){
      if(runId)await pvosSupabase.from("pvos_literature_runs").update({status:"draft",metadata:{v0:true,error:e?.message||"Screening failed"}}).eq("id",runId);
      setMessage(e?.message||"Screening failed.");
    }finally{
      setBusy(false);
    }
  }

  async function analyzeQueue(){
    if(!session)return;
    const candidates=items.filter(x=>x.metadata?.connector==="pubmed"&&x.metadata?.pmid&&(
      x.relevance==="unscored"||
      x.metadata?.prioritization_version!=="v3.1"
    ));
    if(!candidates.length){setMessage("Queue analysis is already complete for the available PubMed items.");return;}
    setAnalyzing(true);setMessage("");
    try{
      const BATCH_SIZE=250;
      let appliedTotal=0;
      let priorityTotal=0;
      let fullTextTotal=0;
      let saudiTotal=0;
      const batches=Math.ceil(candidates.length/BATCH_SIZE);

      for(let i=0;i<candidates.length;i+=BATCH_SIZE){
        const batch=candidates.slice(i,i+BATCH_SIZE);
        const batchNumber=Math.floor(i/BATCH_SIZE)+1;
        setMessage("Analyzing literature batch "+batchNumber+" of "+batches+"…");

        const body=batch.map(x=>({
          id:x.id,
          title:x.title,
          pmid:String(x.metadata.pmid),
          abstract:x.abstract||"",
          metadata:x.metadata||{},
          product:productMap[x.product_id]||{id:x.product_id}
        }));

        const response=await authorizedFetch("/api/pvos/literature/pubmed/enrich",{
          method:"POST",
          headers:{"Content-Type":"application/json"},
          body:JSON.stringify({items:body})
        });
        const result=await response.json();
        if(!response.ok)throw new Error(result?.error||("Queue analysis failed in batch "+batchNumber+"."));

        const {data,error}=await pvosSupabase.rpc("pvos_apply_literature_enrichment",{updates:result.updates||[]});
        if(error)throw error;

        appliedTotal+=Number(data||0);
        priorityTotal+=Number(result.priority||0);
        fullTextTotal+=Number(result.full_text_required||0);
        saudiTotal+=Number(result.saudi_alerts||0);
      }

      setMessage("Prioritization v3.1 complete: "+appliedTotal+" articles analyzed; "+priorityTotal+" high-priority, "+fullTextTotal+" full-text review, and "+saudiTotal+" potential Saudi case/context alerts.");
      await load();
    }catch(e:any){
      setMessage((e?.message||"Queue analysis failed.")+" Any completed batches were saved; click Analyze & prioritize again to resume.");
    }finally{
      setAnalyzing(false);
    }
  }

  async function setReview(item:any,status:ReviewStatus){
    if(!session)return;
    if(item.review_status===status){if(status==="relevant")setPendingRelevantId(item.id);return;}
    setBusy(true);
    const reviewedNow=status!=="unreviewed";
    const reviewedAt=reviewedNow?new Date().toISOString():null;
    const {error}=await pvosSupabase.from("pvos_literature_items").update({
      review_status:status,
      reviewer_user_id:session.user.id,
      reviewed_at:reviewedAt
    }).eq("id",item.id);
    if(error){setBusy(false);setMessage(error.message);return;}
    setItems(prev=>prev.map(x=>x.id===item.id?{
      ...x,
      review_status:status,
      reviewer_user_id:session.user.id,
      reviewed_at:reviewedAt
    }:x));

    if(status==="relevant"){
      setPendingRelevantId(item.id);
      setBusy(false);
      return;
    }

    if(pendingRelevantId===item.id)setPendingRelevantId(null);

    if(status==="not_relevant"&&activeAlertId&&focusedAlertItemId===item.id){
      const {error:alertError}=await pvosSupabase.from("pvos_literature_alerts").update({
        status:"acknowledged",
        acknowledged_by:session.user.id,
        acknowledged_at:new Date().toISOString()
      }).eq("id",activeAlertId);
      if(alertError){setBusy(false);setMessage(alertError.message);return;}
      setFocusedAlertItemId(null);
      setActiveAlertId(null);
      setRunFilter("");
      setProductFilter("");
      setQueueFilter("open");
      await load();
      setTab("alerts");
    }
    setBusy(false);
  }

  function startBatchReview(){
    const targetRun=runFilter||runs.find(r=>!recordMap[r.id]&&r.status==="review")?.id||runs[0]?.id||"";
    if(!targetRun){
      setMessage("Create a screening run before starting batch review.");
      return;
    }
    const second=secondReviewMap[targetRun];
    if(second&&(second.status==="pending"||second.status==="approved")){
      setMessage("This screening run is locked while second review is pending or approved. Return it first to change QPPV decisions.");
      return;
    }
    setRunFilter(targetRun);
    setQueueFilter("open");
    setBatchSelected([]);
    setBatchPinned([]);
    setBatchMode(true);
    setMessage("");
  }

  function toggleBatchSelected(id:string){
    setBatchSelected(prev=>prev.includes(id)?prev.filter(x=>x!==id):[...prev,id]);
  }

  async function saveBatchRelevant(){
    if(!session||!runFilter||!batchSelected.length)return;
    const second=secondReviewMap[runFilter];
    if(second&&(second.status==="pending"||second.status==="approved")){
      setMessage("This screening run is locked for second review.");
      return;
    }
    setBusy(true);setMessage("");
    const ids=[...batchSelected];
    const {data,error}=await pvosSupabase.rpc("pvos_mark_literature_relevant",{
      p_run_id:runFilter,
      p_item_ids:ids
    });
    setBusy(false);
    if(error){setMessage(error.message);return;}
    const reviewedAt=new Date().toISOString();
    setItems(prev=>prev.map(x=>ids.includes(x.id)?{
      ...x,review_status:"relevant",reviewer_user_id:session.user.id,reviewed_at:reviewedAt
    }:x));
    setBatchPinned(prev=>[...new Set([...prev,...ids])]);
    setBatchSelected([]);
    setMessage(String(data||ids.length)+" selected article(s) marked Relevant. Add Signal/PSUR actions if needed, then mark the remaining articles Not relevant.");
  }

  async function retrieveAvailableFullText(){
    if(!session||!runFilter)return;
    const candidates=batchFullTextOpen.filter(x=>x.metadata?.pmid);
    if(!candidates.length){
      setMessage("There are no PubMed full-text items to retrieve in this screening run.");
      return;
    }
    setBusy(true);setMessage("Checking PubMed Central and open literature indexes for available article text…");
    try{
      const body=candidates.map(x=>({
        id:x.id,
        title:x.title,
        pmid:String(x.metadata.pmid),
        doi:x.doi||null,
        abstract:x.abstract||"",
        metadata:x.metadata||{},
        product:productMap[x.product_id]||{id:x.product_id}
      }));
      const response=await authorizedFetch("/api/pvos/literature/pubmed/fulltext",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({items:body})
      });
      const result=await response.json();
      if(!response.ok)throw new Error(result?.error||"Full-text retrieval failed.");

      const {data,error}=await pvosSupabase.rpc("pvos_apply_literature_fulltext_updates",{updates:result.updates||[]});
      if(error)throw error;

      setMessage(
        "Article-text lookup complete: "+String(result.retrieved||0)+" retrieved automatically · "+
        String(result.unavailable||0)+" still require external full text."
      );
      await load();
    }catch(e:any){
      setMessage(e?.message||"Full-text retrieval failed.");
    }finally{
      setBusy(false);
    }
  }

  async function applySecondPassSuggestions(){
    if(!session||!runFilter)return;
    const relevant=batchSecondPass.relevant.map(x=>x.id);
    const notRelevant=batchSecondPass.not_relevant.map(x=>x.id);
    const needsReview=batchSecondPass.needs_review.map(x=>x.id);
    const total=relevant.length+notRelevant.length+needsReview.length;
    if(!total){
      setMessage("There are no abstract-available articles left for PVOS second-pass review.");
      return;
    }
    const ok=window.confirm(
      "Apply PVOS second-pass suggestions to "+total+" article(s)? "+
      relevant.length+" will be marked Relevant, "+
      notRelevant.length+" Not relevant, and "+
      needsReview.length+" Needs review. "+
      batchSecondPass.full_text.length+" Full-text article(s) will remain untouched."
    );
    if(!ok)return;
    setBusy(true);setMessage("");
    const {data,error}=await pvosSupabase.rpc("pvos_apply_literature_second_pass",{
      p_run_id:runFilter,
      p_relevant_ids:relevant,
      p_not_relevant_ids:notRelevant,
      p_needs_review_ids:needsReview
    });
    setBusy(false);
    if(error){setMessage(error.message);return;}
    const reviewedAt=new Date().toISOString();
    setItems(prev=>prev.map(x=>{
      if(relevant.includes(x.id))return {...x,review_status:"relevant",reviewer_user_id:session.user.id,reviewed_at:reviewedAt,decision_note:"Batch accepted from PVOS second-pass Relevant suggestion"};
      if(notRelevant.includes(x.id))return {...x,review_status:"not_relevant",reviewer_user_id:session.user.id,reviewed_at:reviewedAt,decision_note:"Batch accepted from PVOS second-pass Not relevant suggestion"};
      if(needsReview.includes(x.id))return {...x,review_status:"needs_review",reviewer_user_id:session.user.id,reviewed_at:reviewedAt,decision_note:"PVOS second-pass suggestion: manual QPPV review required"};
      return x;
    }));
    setBatchPinned(prev=>[...new Set([...prev,...relevant])]);
    setMessage(
      "Second pass applied: "+String((data as any)?.relevant??relevant.length)+" Relevant · "+
      String((data as any)?.not_relevant??notRelevant.length)+" Not relevant · "+
      String((data as any)?.needs_review??needsReview.length)+" Needs review. Full-text items stayed open."
    );
  }

  async function acceptHighConfidenceRelevant(){
    if(!session||!runFilter)return;
    const count=batchHighConfidenceRelevant.length;
    if(!count){setMessage("There are no open high-confidence Relevant suggestions in this run.");return;}
    const ok=window.confirm(
      "Accept "+count+" high-confidence PVOS suggestions as Relevant? These are human-clinical articles where the monitored product is the subject and a direct safety, special-situation, interaction, or lack-of-efficacy finding was detected. This records your QPPV batch decision."
    );
    if(!ok)return;
    setBusy(true);setMessage("");
    const {data,error}=await pvosSupabase.rpc("pvos_accept_high_confidence_relevant",{p_run_id:runFilter});
    setBusy(false);
    if(error){setMessage(error.message);return;}
    const reviewedAt=new Date().toISOString();
    setItems(prev=>prev.map(x=>batchHighConfidenceRelevant.some(y=>y.id===x.id)
      ?{...x,review_status:"relevant",reviewer_user_id:session.user.id,reviewed_at:reviewedAt,decision_note:"Batch accepted from PVOS high-confidence Relevant suggestion"}
      :x
    ));
    setBatchPinned(prev=>[...new Set([...prev,...batchHighConfidenceRelevant.map(x=>x.id)])]);
    setMessage(String(data||count)+" high-confidence article(s) accepted as Relevant. Add Signal/PSUR actions to any of these where needed.");
  }

  async function confirmLowRiskPossibleNotRelevant(){
    if(!session||!runFilter)return;
    const count=batchLowRiskPossible.length;
    if(!count){setMessage("There are no open low-risk Possible suggestions in this run.");return;}
    const ok=window.confirm(
      "Confirm "+count+" low-risk Possible article(s) as Not relevant? These are comparator-led, preclinical/economic, or quantified-only papers without a direct PV finding. Full-text items are excluded. This records your QPPV batch decision."
    );
    if(!ok)return;
    setBusy(true);setMessage("");
    const {data,error}=await pvosSupabase.rpc("pvos_confirm_low_risk_possible_not_relevant",{p_run_id:runFilter});
    setBusy(false);
    if(error){setMessage(error.message);return;}
    const reviewedAt=new Date().toISOString();
    setItems(prev=>prev.map(x=>batchLowRiskPossible.some(y=>y.id===x.id)
      ?{...x,review_status:"not_relevant",reviewer_user_id:session.user.id,reviewed_at:reviewedAt,decision_note:"Batch confirmed Not relevant from PVOS low-risk Possible suggestion"}
      :x
    ));
    setMessage(String(data||count)+" low-risk Possible article(s) confirmed Not relevant.");
  }

  async function confirmUnlikelyNotRelevant(){
    if(!session||!runFilter)return;
    const second=secondReviewMap[runFilter];
    if(second&&(second.status==="pending"||second.status==="approved")){
      setMessage("This screening run is locked for second review.");
      return;
    }
    const count=batchUnlikelyOpen.length;
    if(!count){
      setMessage("There are no open PVOS Unlikely articles in this screening run.");
      return;
    }
    const ok=window.confirm(
      "Confirm "+count+" PVOS Unlikely article(s) as Not relevant? Full-text items and Saudi alerts are excluded. This is recorded as your QPPV batch decision."
    );
    if(!ok)return;
    setBusy(true);setMessage("");
    const {data,error}=await pvosSupabase.rpc("pvos_confirm_unlikely_not_relevant",{p_run_id:runFilter});
    setBusy(false);
    if(error){setMessage(error.message);return;}
    const reviewedAt=new Date().toISOString();
    setItems(prev=>prev.map(x=>
      x.run_id===runFilter&&
      x.review_status==="unreviewed"&&
      x.relevance==="unlikely"&&
      !x.metadata?.full_text_required&&
      !x.metadata?.urgent_saudi
        ?{...x,review_status:"not_relevant",reviewer_user_id:session.user.id,reviewed_at:reviewedAt,decision_note:"Bulk confirmed Not relevant from PVOS Unlikely triage"}
        :x
    ));
    setMessage(String(data||count)+" PVOS Unlikely article(s) confirmed Not relevant. Likely, Possible, Full-text, and Saudi-alert articles remain open for review.");
  }

  async function markBatchRemainingNotRelevant(){
    if(!session||!runFilter)return;
    const second=secondReviewMap[runFilter];
    if(second&&(second.status==="pending"||second.status==="approved")){
      setMessage("This screening run is locked for second review.");
      return;
    }
    if(batchSelected.length){
      setMessage("Save the selected Relevant articles first, then mark the remaining articles Not relevant.");
      return;
    }
    const count=batchRemainingEligible.length;
    if(!count){
      setMessage("No eligible unreviewed articles remain in this screening run.");
      return;
    }
    const excluded=batchFullTextOpen.length+batchNeedsReview.length;
    const priorityRemaining=batchRemainingEligible.filter(x=>x.relevance==="likely_relevant").length;
    const saudiRemaining=batchRemainingEligible.filter(x=>x.metadata?.urgent_saudi).length;
    const ok=window.confirm(
      "Mark "+count+" remaining unreviewed article(s) in this screening run as Not relevant?"+
      (priorityRemaining?" This includes "+priorityRemaining+" Priority article(s).":"")+
      (saudiRemaining?" This includes "+saudiRemaining+" Saudi alert(s).":"")+
      (excluded?" "+excluded+" Full text / Needs review item(s) will stay open.":"")
    );
    if(!ok)return;
    setBusy(true);setMessage("");
    const {data,error}=await pvosSupabase.rpc("pvos_mark_literature_remaining_not_relevant",{p_run_id:runFilter});
    setBusy(false);
    if(error){setMessage(error.message);return;}
    const reviewedAt=new Date().toISOString();
    setItems(prev=>prev.map(x=>
      x.run_id===runFilter&&x.review_status==="unreviewed"&&!x.metadata?.full_text_required
        ?{...x,review_status:"not_relevant",reviewer_user_id:session.user.id,reviewed_at:reviewedAt}
        :x
    ));
    setMessage(String(data||count)+" remaining article(s) marked Not relevant. Full-text and Needs review items were preserved.");
  }

  function finishBatchReview(){
    setBatchMode(false);
    setBatchSelected([]);
    setBatchPinned([]);
    setMessage("Batch review closed. Your decisions are saved.");
  }

  async function addReviewerByEmail(){
    if(!organizationId||!reviewerEmail.trim())return;
    setBusy(true);setMessage("");
    const {data,error}=await pvosSupabase.rpc("pvos_invite_workspace_member",{
      p_organization_id:organizationId,
      p_email:reviewerEmail.trim(),
      p_role:reviewerRole
    });
    setBusy(false);
    if(error){setMessage(error.message);return;}
    const status=(data as any)?.status;
    setReviewerEmail("");
    setMessage(status==="member_added"
      ?"Reviewer added to this workspace. You can now assign the second review."
      :"Reviewer email authorized. When they first sign in to PVOS with that email, they will join this workspace.");
    await load();
  }

  async function assignSecondReviewer(run:any){
    if(!secondReviewerId){setMessage("Choose a second reviewer.");return;}
    setBusy(true);setMessage("");
    const {error}=await pvosSupabase.rpc("pvos_assign_literature_second_review",{
      p_run_id:run.id,
      p_assigned_to:secondReviewerId
    });
    setBusy(false);
    if(error){setMessage(error.message);return;}
    setSecondReviewerId("");
    setSecondReviewNote("");
    setMessage("Screening run sent to the second reviewer.");
    await load();
  }

  async function decideSecondReview(run:any,decision:"approved"|"returned"){
    if(decision==="returned"&&!secondReviewNote.trim()){
      setMessage("Add a note explaining what needs to be changed before returning the screening.");
      return;
    }
    setBusy(true);setMessage("");
    const {error}=await pvosSupabase.rpc("pvos_decide_literature_second_review",{
      p_run_id:run.id,
      p_decision:decision,
      p_note:secondReviewNote.trim()||null
    });
    setBusy(false);
    if(error){setMessage(error.message);return;}
    setSecondReviewNote("");
    setMessage(decision==="approved"?"Second review approved with reviewer and timestamp recorded.":"Screening returned to the first reviewer with a review note.");
    await load();
  }

  function openRunDecisions(run:any){
    setSelectedRun(null);
    setRunFilter(run.id);
    setProductFilter("");
    setQueueFilter("reviewed");
    setBatchMode(false);
    setBatchSelected([]);
    setBatchPinned([]);
    setTab("queue");
  }

  function startRapidReview(){
    const candidates=sortedItems.filter(x=>
      (!runFilter||x.run_id===runFilter) &&
      (!productFilter||x.product_id===productFilter) &&
      (x.review_status==="unreviewed"||x.review_status==="needs_review")
    );
    if(!candidates.length){
      setMessage("No open articles are available for rapid review.");
      return;
    }
    setQueueFilter("open");
    setRapidSeen([]);
    setRapidReviewed(0);
    setRapidTotal(candidates.length);
    setRapidItemId(candidates[0].id);
    setRapidOpen(true);
    setMessage("");
  }

  function skipRapid(){
    if(!rapidItem)return;
    const seen=[...rapidSeen,rapidItem.id];
    const next=sortedItems.find(x=>
      x.id!==rapidItem.id &&
      !seen.includes(x.id) &&
      (!runFilter||x.run_id===runFilter) &&
      (!productFilter||x.product_id===productFilter) &&
      (x.review_status==="unreviewed"||x.review_status==="needs_review")
    );
    setRapidSeen(seen);
    if(next)setRapidItemId(next.id);
    else{setRapidOpen(false);setRapidItemId(null);}
  }

  async function rapidDecision(status:ReviewStatus){
    if(!session||!rapidItem||busy)return;
    const current=rapidItem;
    const seen=[...rapidSeen,current.id];
    const next=sortedItems.find(x=>
      x.id!==current.id &&
      !seen.includes(x.id) &&
      (!runFilter||x.run_id===runFilter) &&
      (!productFilter||x.product_id===productFilter) &&
      (x.review_status==="unreviewed"||x.review_status==="needs_review")
    );
    setBusy(true);setMessage("");
    const final=status==="relevant"||status==="not_relevant";
    const reviewedAt=final?new Date().toISOString():null;
    const {error}=await pvosSupabase.from("pvos_literature_items").update({
      review_status:status,
      reviewer_user_id:session.user.id,
      reviewed_at:reviewedAt
    }).eq("id",current.id);
    setBusy(false);
    if(error){setMessage(error.message);return;}
    setItems(prev=>prev.map(x=>x.id===current.id?{
      ...x,review_status:status,reviewer_user_id:session.user.id,reviewed_at:reviewedAt
    }:x));
    setRapidSeen(seen);
    setRapidReviewed(v=>v+1);
    if(next)setRapidItemId(next.id);
    else{
      setRapidOpen(false);
      setRapidItemId(null);
      setMessage("Rapid review pass complete.");
    }
  }

  async function queueFollowup(item:any,destination:"signal_review"|"psur_evidence"){
    if(!organizationId||!session)return;
    setBusy(true);
    const {data,error}=await pvosSupabase.from("pvos_literature_followups").upsert({
      organization_id:organizationId,
      company_id:item.company_id,
      product_id:item.product_id,
      literature_item_id:item.id,
      destination,
      status:"queued",
      created_by:session.user.id,
      metadata:{
        article_title:item.title,
        article_url:item.article_url,
        pmid:item.metadata?.pmid||null,
        source:item.journal||"PubMed"
      }
    },{onConflict:"literature_item_id,destination"}).select("*").single();
    setBusy(false);
    if(error){setMessage(error.message);return;}
    if(data)setFollowups(prev=>[
      data,
      ...prev.filter(x=>!(x.literature_item_id===item.id&&x.destination===destination))
    ]);
  }

  async function completeScreening(run:any){
    if(!organizationId||!session)return;
    const stats=statsForRun(run);
    const secondReview=secondReviewMap[run.id];
    if(stats.open>0){
      setMessage("Cannot complete screening: "+stats.open+" article(s) still need a final QPPV decision.");
      return;
    }
    if(!secondReview){
      setMessage("Cannot complete screening until a second reviewer has reviewed and approved the first-review decisions.");
      return;
    }
    if(secondReview.status!=="approved"){
      setMessage("Cannot complete screening until the assigned second review is approved.");
      return;
    }
    setBusy(true);setMessage("");
    try{
      const {error}=await pvosSupabase.rpc("pvos_complete_literature_screening",{p_run_id:run.id});
      if(error)throw error;
      setMessage("Screening completed. Both reviewers and review history are preserved in the evidence record.");
      await load();
      setSelectedRun(null);
    }catch(e:any){
      setMessage(e?.message||"Could not complete screening.");
    }finally{
      setBusy(false);
    }
  }

  function exportScreeningRecord(run:any){
    const record=recordMap[run.id];
    if(!record)return;
    const lines:string[]=[];
    const add=(k:string,v:any)=>lines.push('"'+String(k).replaceAll('"','""')+'","'+String(v??"").replaceAll('"','""')+'"');
    add("PVOS Literature Screening Record",record.metadata?.record_version||"v1");
    add("Company",companyMap[run.company_id]||"");
    add("Period",run.period_start+" to "+run.period_end);
    add("Completed at",record.completed_at);
    add("Sources",(record.source_snapshot||[]).map((x:any)=>x.name).join("; "));
    add("Products",(record.product_snapshot||[]).map((x:any)=>x.brand_name+" — "+(x.active_ingredient||"")).join("; "));
    const m=record.metrics||{};
    add("Total results",m.total);
    add("Reviewed",m.reviewed);
    add("Relevant",m.relevant);
    add("Not relevant",m.notRelevant);
    add("Saudi alerts",m.saudi);
    add("Signal escalations",m.signal);
    add("PSUR selections",m.psur);
    const second=record.metadata?.second_review;
    add("Second review status",second?.status||"Not assigned");
    add("Second reviewer",second?.reviewed_by?memberMap[second.reviewed_by]?.email||second.reviewed_by:second?.assigned_to?memberMap[second.assigned_to]?.email||second.assigned_to:"");
    add("Second reviewed at",second?.reviewed_at||"");
    add("Second review note",second?.note||"");
    lines.push("");
    add("Second review scope",second?.metadata?.scope_rule||"");
    add("Second review cycle",second?.metadata?.assignment_cycle||1);
    lines.push('"Article","Product","PMID","DOI","Safety priority","First decision","First reviewer ID","First reviewer","First reviewed at","Decision note","Saudi alert"');
    for(const d of record.decision_snapshot||[]){
      lines.push([d.title,d.product,d.pmid,d.doi,d.relevance,d.review_status,d.reviewer_user_id,memberMap[d.reviewer_user_id]?.email||d.reviewer_user_id,d.reviewed_at,d.decision_note,d.saudi_alert?"Yes":"No"].map((v:any)=>'"'+String(v??"").replaceAll('"','""')+'"').join(","));
    }
    lines.push("",'"Cycle","Status","Assigned to ID","Assigned at","Second reviewer ID","Second reviewer","Reviewed at","Reason"');
    for(const cycle of [...(second?.metadata?.history||[]),...(second?[second]:[])]){
      lines.push([cycle.cycle||cycle.metadata?.assignment_cycle||1,cycle.status,cycle.assigned_to,cycle.assigned_at,cycle.reviewed_by,memberMap[cycle.reviewed_by]?.email||cycle.reviewed_by,cycle.reviewed_at,cycle.note].map((v:any)=>'"'+String(v??"").replaceAll('"','""')+'"').join(","));
    }
    const blob=new Blob([lines.join("\n")],{type:"text/csv;charset=utf-8"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url;a.download="PVOS-literature-screening-"+run.period_end+".csv";
    document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
  }

  useEffect(()=>{
    if(!rapidOpen||!rapidItemId)return;
    const onKey=(e:KeyboardEvent)=>{
      const tag=(document.activeElement?.tagName||"").toLowerCase();
      if(tag==="input"||tag==="textarea"||tag==="select")return;
      const key=e.key.toLowerCase();
      if(key==="r"){e.preventDefault();rapidDecision("relevant");}
      else if(key==="n"){e.preventDefault();rapidDecision("not_relevant");}
      else if(key==="m"){e.preventDefault();rapidDecision("needs_review");}
      else if(key==="s"){e.preventDefault();skipRapid();}
      else if(key==="escape"){setRapidOpen(false);setRapidItemId(null);}
    };
    window.addEventListener("keydown",onKey);
    return ()=>window.removeEventListener("keydown",onKey);
  },[rapidOpen,rapidItemId,busy,rapidSeen,productFilter,sortedItems]);

  return <>
    <Header
      eyebrow="Safety intelligence"
      title="Literature"
      sub="Register required literature sources, collect potential safety articles into one screening queue, record the QPPV decision, and preserve a traceable screening history."
      action={<div className={styles.inlineActions} style={{marginTop:0}}>
        <button className={styles.buttonGhost} onClick={()=>{setShowSource(true);setMessage("")}}>+ Add source</button>
        <button className={styles.button} onClick={()=>{setShowRun(true);setMessage("")}} disabled={!companies.length}>+ New screening run</button>
      </div>}
    />

    <section className={styles.cards}>
      <div className={styles.card}><span>Active sources</span><strong>{activeSources.length}</strong></div>
      <div className={styles.card}><span>Products in scope</span><strong>{products.length}</strong></div>
      <div className={[styles.card,openItems.length?styles.warning:""].join(" ")}><span>Open articles</span><strong>{openItems.length}</strong></div>
      <div className={[styles.card,priorityItems.length?styles.warning:""].join(" ")}><span>Priority review</span><strong>{priorityItems.length}</strong></div>
      <div className={[styles.card,saudiAlerts.length?styles.danger:""].join(" ")}><span>Saudi alerts</span><strong>{saudiAlerts.length}</strong></div>
    </section>

    {automationSetting?<div className={automationSetting.last_status==="error"?styles.errorBox:styles.successBox} style={{marginBottom:14,display:"flex",justifyContent:"space-between",gap:12,alignItems:"center",flexWrap:"wrap"}}>
      <div>
        <strong>Automatic literature monitoring</strong>
        <span style={{marginLeft:8}}>Every {automationSetting.cadence_hours}h</span>
        <span style={{marginLeft:8}}>· Last check {dateTimeLabel(automationSetting.last_run_at)}</span>
        <span style={{marginLeft:8}}>· Next check {dateTimeLabel(automationSetting.next_due_at)}</span>
      </div>
      <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
        <Badge tone={automationSetting.last_status==="error"?"red":automationSetting.last_status==="partial"?"amber":"green"}>{String(automationSetting.last_status||"never").replace("_"," ")}</Badge>
        <span>{Number(automationResult?.new_items||0)} new</span>
        <span>{Number(automationResult?.alerts||0)} alerts</span>
        {automationFailures.length?<span>{automationFailures.length} source issue{automationFailures.length===1?"":"s"}</span>:null}
      </div>
    </div>:null}

    {message?<div className={message.includes("added")||message.includes("created")||message.includes("complete")||message.includes("returned")||message.includes("approved")||message.includes("sent")?styles.successBox:styles.errorBox} style={{marginBottom:14}}>{message}</div>:null}

    <section className={styles.panel}>
      <div style={{padding:"12px 14px 0",display:"flex",gap:8,flexWrap:"wrap"}}>
        <button className={tab==="sources"?styles.button:styles.buttonGhost} onClick={()=>setTab("sources")}>Sources</button>
        <button className={tab==="queue"?styles.button:styles.buttonGhost} onClick={()=>setTab("queue")}>Screening Queue {openItems.length?"("+openItems.length+")":""}</button>
        <button className={tab==="runs"?styles.button:styles.buttonGhost} onClick={()=>setTab("runs")}>Screening Runs</button>
        <button className={tab==="second"?styles.button:styles.buttonGhost} onClick={()=>setTab("second")}>Second Review {myPendingSecondReviews.length?"("+myPendingSecondReviews.length+")":""}</button>
        <button className={tab==="alerts"?styles.button:styles.buttonGhost} onClick={()=>setTab("alerts")}>Alerts {openAlerts.length?"("+openAlerts.length+")":""}</button>
        <button className={tab==="psur"?styles.button:styles.buttonGhost} onClick={()=>setTab("psur")}>PSUR Evidence {psurEvidence.length?"("+psurEvidence.length+")":""}</button>
      </div>

      {tab==="sources"?<>
        <div className={styles.panelHeader} style={{marginTop:12}}>
          <div>
            <h2>Literature sources</h2>
            <div className={styles.muted} style={{marginTop:4}}>{activeSources.length} active · {sources.length} total · {saudiSources.length} Saudi journals · {liveSaudiSources.length} connected</div>
          </div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            <button className={sourceFilter==="all"?styles.button:styles.buttonGhost} onClick={()=>setSourceFilter("all")}>All ({sources.length})</button>
            <button className={sourceFilter==="active"?styles.button:styles.buttonGhost} onClick={()=>setSourceFilter("active")}>Active ({activeSources.length})</button>
            <button className={sourceFilter==="saudi"?styles.button:styles.buttonGhost} onClick={()=>setSourceFilter("saudi")}>Saudi journals ({saudiSources.length})</button>
            <button className={sourceFilter==="planned"?styles.button:styles.buttonGhost} onClick={()=>setSourceFilter("planned")}>Planned ({plannedSaudiSources.length})</button>
          </div>
        </div>
        {loading?<div className={styles.empty}>Loading sources…</div>:sources.length?<div className={styles.tableWrap}><table className={styles.table}>
          <thead><tr><th>Source</th><th>Coverage</th><th>Frequency</th><th>Connection</th><th>Last checked</th><th>Next due</th><th>Status</th></tr></thead>
          <tbody>{visibleSources.map(s=>{
            const due=s.next_due_at&&new Date(s.next_due_at)<new Date();
            return <tr key={s.id}>
              <td><strong>{s.name}</strong>{s.url?<div className={styles.muted} style={{marginTop:4}}><a href={s.url} target="_blank" rel="noreferrer">Open source ↗</a></div>:null}</td>
              <td>{s.metadata?.source_group==="Saudi journals 2025"?<div><Badge tone="lime">Saudi journal</Badge>{s.metadata?.pubmed_indexed?<div className={styles.muted} style={{marginTop:4}}>PubMed indexed</div>:<div className={styles.muted} style={{marginTop:4}}>Not PubMed indexed</div>}</div>:s.language}</td>
              <td>{String(s.screening_frequency).replace("_"," ")}</td>
              <td>{s.metadata?.connector==="lww_crossref"?<div>
                <Badge>{s.metadata?.direct_monitoring_status==="active"?"Direct LWW + fallback":"LWW metadata fallback"}</Badge>
                <div className={styles.muted} style={{marginTop:4}}>
                  {s.metadata?.direct_monitoring_status==="active"?"Current-issue feed + Crossref":s.metadata?.direct_monitoring_status==="blocked"?"Direct feed blocked · Crossref fallback":s.metadata?.direct_monitoring_status==="historical_not_applicable"?"Crossref backfill · direct monitoring runs on recent periods":"Crossref ISSN + update watch"}
                </div>
              </div>:s.metadata?.connector==="crossref_journal"?<div>
                <Badge>Metadata monitor</Badge>
                <div className={styles.muted} style={{marginTop:4}}>Crossref ISSN + rolling update watch</div>
              </div>:s.metadata?.connector==="open_web_snapshot"?<div>
                <Badge>Direct journal monitor</Badge>
                <div className={styles.muted} style={{marginTop:4}}>
                  {s.metadata?.snapshot_initialized?"Snapshot tracking active":"Baseline pending"}
                </div>
              </div>:s.metadata?.connector_status==="planned"?<Badge>Planned</Badge>:<Badge>{s.method==="manual"?"Manual / pending automation":s.method.toUpperCase()}</Badge>}</td>
              <td>{dateLabel(s.last_checked_at)}</td>
              <td>{dateLabel(s.next_due_at)}</td>
              <td><Badge tone={!s.active?"default":s.metadata?.connector_status==="error"?"red":due?"amber":"green"}>{!s.active?"Planned":s.metadata?.connector_status==="error"?"Connection issue":due?"Due":"Active"}</Badge></td>
            </tr>
          })}</tbody>
        </table></div>:<div className={styles.empty}>No literature sources yet. Add the journals or databases your QPPV team is required to screen.</div>}
      </>:null}

      {tab==="alerts"?<>
        <div className={styles.panelHeader} style={{marginTop:12}}>
          <div>
            <h2>Literature alerts</h2>
            <div className={styles.muted} style={{marginTop:4}}>Review-required notifications from automatic monitoring · {openAlerts.length} open</div>
          </div>
        </div>
        {alerts.length?<div className={styles.tableWrap}><table className={styles.table}>
          <thead><tr><th>Severity</th><th>Article</th><th>Product</th><th>Company</th><th>Type</th><th>Detected</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>{alerts.map(a=>{
            const item=literatureItemMap[a.literature_item_id];
            const product=productMap[a.product_id||item?.product_id];
            const typeLabel=a.alert_type==="saudi_case_context"?"Saudi case / context":a.alert_type==="saudi_journal_match"?"Saudi journal match":"Priority literature";
            return <tr key={a.id}>
              <td><Badge tone={a.severity==="critical"?"red":a.severity==="high"?"amber":"default"}>{a.severity}</Badge></td>
              <td style={{minWidth:300}}><strong>{a.title}</strong>{a.reason?<div className={styles.muted} style={{marginTop:4}}>{a.reason}</div>:null}</td>
              <td>{product?<><strong>{product.brand_name}</strong><div className={styles.muted}>{product.active_ingredient}</div></>:"—"}</td>
              <td>{companyMap[a.company_id]||"—"}</td>
              <td>{typeLabel}</td>
              <td>{dateTimeLabel(a.created_at)}</td>
              <td><Badge tone={a.status==="open"?"amber":"green"}>{a.status}</Badge></td>
              <td><div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                <button className={styles.buttonGhost} onClick={()=>openAlertInQueue(a)}>Open in queue</button>
                {item?.article_url?<a className={styles.buttonGhost} href={item.article_url} target="_blank" rel="noreferrer">Article ↗</a>:null}
                {a.status==="open"?<>
                  <button className={styles.button} disabled={busy} onClick={()=>updateLiteratureAlert(a,"acknowledged")}>Acknowledge</button>
                  <button className={styles.buttonGhost} disabled={busy} onClick={()=>updateLiteratureAlert(a,"dismissed")}>Dismiss</button>
                </>:null}
              </div></td>
            </tr>
          })}</tbody>
        </table></div>:<div className={styles.empty}>No literature alerts yet. Automatic monitoring will place review-required findings here.</div>}
      </>:null}

      {tab==="queue"?<>
        <div className={styles.panelHeader} style={{marginTop:12}}>
          <div>
            <h2>Screening queue</h2>
            <div className={styles.muted} style={{marginTop:4}}>{openItems.length} awaiting final QPPV decision · {reviewed.length} reviewed</div>
          </div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            <button className={styles.buttonGhost} onClick={analyzeQueue} disabled={analyzing||!items.length||queueLockedForSecondReview}>{analyzing?"Analyzing abstracts…":"Analyze & prioritize"}</button>
            <button className={batchMode?styles.button:styles.buttonGhost} onClick={batchMode?finishBatchReview:startBatchReview} disabled={!openItems.length||queueLockedForSecondReview}>{batchMode?"Exit batch review":"Batch review"}</button>
            <button className={styles.button} onClick={startRapidReview} disabled={!openItems.length||queueLockedForSecondReview}>Rapid review</button>
          </div>
        </div>
        {focusedAlertItemId?<div className={styles.notice} style={{margin:"0 14px 12px",padding:"10px 12px",display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,flexWrap:"wrap"}}>
          <div><strong>Reviewing literature alert</strong><span className={styles.muted} style={{marginLeft:8}}>Only the alerted article is shown.</span></div>
          <button className={styles.buttonGhost} onClick={()=>{setFocusedAlertItemId(null);setActiveAlertId(null);setRunFilter("");setProductFilter("");setQueueFilter("open");setTab("alerts")}}>Back to Alerts</button>
        </div>:null}
        <div style={{padding:"12px 14px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,flexWrap:"wrap"}}>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            <button className={queueFilter==="open"?styles.button:styles.buttonGhost} onClick={()=>setQueueFilter("open")}>Open ({openItems.length})</button>
            <button className={queueFilter==="priority"?styles.button:styles.buttonGhost} onClick={()=>setQueueFilter("priority")}>Priority ({priorityItems.length})</button>
            <button className={queueFilter==="fulltext"?styles.button:styles.buttonGhost} onClick={()=>setQueueFilter("fulltext")}>Full text ({fullTextItems.length})</button>
            <button className={queueFilter==="saudi"?styles.button:styles.buttonGhost} onClick={()=>setQueueFilter("saudi")}>Saudi alerts ({saudiAlerts.length})</button>
            <button className={queueFilter==="reviewed"?styles.button:styles.buttonGhost} onClick={()=>setQueueFilter("reviewed")}>Reviewed ({reviewed.length})</button>
            <button className={queueFilter==="all"?styles.button:styles.buttonGhost} onClick={()=>setQueueFilter("all")}>All ({items.length})</button>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
            <select className={styles.input} style={{width:245}} value={runFilter} onChange={e=>{setRunFilter(e.target.value);setBatchSelected([]);setBatchPinned([])}}>
              <option value="">All screening runs</option>
              {runs.map(r=><option key={r.id} value={r.id}>{dateLabel(r.period_start)} – {dateLabel(r.period_end)} · {companyMap[r.company_id]||"Company"}</option>)}
            </select>
            <select className={styles.input} style={{width:210}} value={productFilter} onChange={e=>setProductFilter(e.target.value)}>
              <option value="">All products</option>
              {products.map(p=><option key={p.id} value={p.id}>{p.brand_name}</option>)}
            </select>
            <span className={styles.muted}>Showing {visibleItems.length}</span>
          </div>
        </div>
        {batchMode?<div className={styles.notice} style={{margin:"0 14px 12px",padding:14}}>
          <div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"center",flexWrap:"wrap"}}>
            <div>
              <strong>Batch review · {selectedQueueRun?dateLabel(selectedQueueRun.period_start)+" – "+dateLabel(selectedQueueRun.period_end):"Select one screening run"}</strong>
              <div className={styles.muted} style={{marginTop:5}}>
                You do not need to inspect every article. First confirm the low-risk PVOS Unlikely group in one action, then review only the smaller Likely / Possible / Full-text set.
              </div>
              <div className={styles.muted} style={{marginTop:5}}>
                {batchLikelyOpen.length} Likely · {batchPossibleOpen.length} Possible · {batchUnlikelyOpen.length} Unlikely · {batchFullTextOpen.length} Full text · {batchSelected.length} selected
              </div>
              <div className={styles.muted} style={{marginTop:5}}>
                PVOS suggestions: {batchHighConfidenceRelevant.length} high-confidence Relevant · {batchLowRiskPossible.length} low-risk Possible
              </div>
              <div className={styles.muted} style={{marginTop:5}}>
                Second pass: {batchSecondPass.relevant.length} Relevant · {batchSecondPass.not_relevant.length} Not relevant · {batchSecondPass.needs_review.length} Needs review · {batchSecondPass.full_text.length} Full text untouched
              </div>
            </div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              <button className={styles.buttonGhost} disabled={busy||!batchFullTextOpen.length||!runFilter} onClick={retrieveAvailableFullText}>Retrieve available article text ({batchFullTextOpen.length})</button>
              <button className={styles.button} disabled={busy||!(batchSecondPass.relevant.length+batchSecondPass.not_relevant.length+batchSecondPass.needs_review.length)||!runFilter} onClick={applySecondPassSuggestions}>Apply second-pass suggestions ({batchSecondPass.relevant.length+batchSecondPass.not_relevant.length+batchSecondPass.needs_review.length})</button>
              <button className={styles.button} disabled={busy||!batchUnlikelyOpen.length||!runFilter} onClick={confirmUnlikelyNotRelevant}>Confirm Unlikely → Not relevant ({batchUnlikelyOpen.length})</button>
              <button className={styles.button} disabled={busy||!batchHighConfidenceRelevant.length||!runFilter} onClick={acceptHighConfidenceRelevant}>Accept high-confidence Relevant ({batchHighConfidenceRelevant.length})</button>
              <button className={styles.buttonGhost} disabled={busy||!batchLowRiskPossible.length||!runFilter} onClick={confirmLowRiskPossibleNotRelevant}>Confirm low-risk Possible → Not relevant ({batchLowRiskPossible.length})</button>
              <button className={styles.buttonGhost} disabled={busy||!batchSelected.length||!runFilter} onClick={saveBatchRelevant}>Save selected as Relevant ({batchSelected.length})</button>
              <button className={styles.buttonGhost} disabled={busy||!!batchSelected.length||!batchRemainingEligible.length||!runFilter} onClick={markBatchRemainingNotRelevant}>Mark all other eligible Not relevant ({batchRemainingEligible.length})</button>
            </div>
          </div>
        </div>:null}
        {loading?<div className={styles.empty}>Loading screening queue…</div>:items.length?<div className={styles.tableWrap}><table className={styles.table} style={{minWidth:1180}}>
          <thead><tr>{batchMode?<th style={{width:74}}>Relevant?</th>:null}<th>Article</th><th>Product</th><th>Source</th><th>Available</th><th>Matched terms</th><th>Safety priority</th><th>QPPV review</th></tr></thead>
          <tbody>{visibleItems.map(x=>{
            const p=productMap[x.product_id];
            const second=secondReviewMap[x.run_id];
            const reviewLocked=!!second&&(second.status==="pending"||second.status==="approved");
            const batchEligible=!reviewLocked&&x.run_id===runFilter&&(x.review_status==="unreviewed"||x.review_status==="needs_review")&&!x.metadata?.full_text_required;
            return <tr key={x.id}>
              {batchMode?<td style={{textAlign:"center",verticalAlign:"top"}}>
                {batchEligible?<input type="checkbox" aria-label={"Mark "+x.title+" as relevant"} checked={batchSelected.includes(x.id)} onChange={()=>toggleBatchSelected(x.id)} style={{width:18,height:18,cursor:"pointer"}}/>:x.metadata?.full_text_required?<Badge tone="amber">Full text</Badge>:x.review_status==="relevant"?<Badge tone="green">Relevant</Badge>:null}
              </td>:null}
              <td style={{minWidth:340}}>
                {x.metadata?.urgent_saudi?<div style={{marginBottom:7}}><Badge tone="red">⚠ Potential Saudi case / context</Badge></div>:null}
                {x.article_url?<a href={x.article_url} target="_blank" rel="noreferrer">{x.title}</a>:<strong>{x.title}</strong>}
                {x.abstract?<div className={styles.muted} style={{marginTop:6,maxWidth:500,display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"}}>{x.abstract}</div>:null}
                {x.ai_reason?<div style={{marginTop:6,fontSize:11,lineHeight:1.45}}>{x.ai_reason}</div>:null}
              </td>
              <td>{p?<><strong>{p.brand_name}</strong><div className={styles.muted} style={{marginTop:3}}>{p.active_ingredient||"—"}</div></>:"—"}</td>
              <td>{sourceMap[x.source_id]?.name||x.journal||"—"}</td>
              <td>
                <strong>{dateLabel(x.publication_date)}</strong>
                {x.metadata?.issue_date&&x.metadata.issue_date!==x.publication_date?<div className={styles.muted} style={{marginTop:3}}>Issue: {dateLabel(x.metadata.issue_date)}</div>:null}
              </td>
              <td>
                {(x.matched_terms||[]).length?(x.matched_terms||[]).join(", "):"—"}
                {x.metadata?.match_locations?.length?<div className={styles.muted} style={{marginTop:4}}>Matched in: {x.metadata.match_locations.join(" · ")}</div>:null}
              </td>
              <td>
                {x.metadata?.full_text_required?<Badge tone="amber">Full text required</Badge>:<Badge tone={relevanceTone(x.relevance)}>{relevanceLabel(x.relevance)}</Badge>}
                {x.metadata?.product_role?<div className={styles.muted} style={{marginTop:5}}>Role: {String(x.metadata.product_role).replaceAll("_"," ")}</div>:null}
                {x.metadata?.finding_types?.length?<div className={styles.muted} style={{marginTop:3,maxWidth:190}}>{x.metadata.finding_types.slice(0,3).map((v:string)=>v.replaceAll("_"," ")).join(" · ")}</div>:x.metadata?.safety_hits?.length?<div className={styles.muted} style={{marginTop:3,maxWidth:190}}>{x.metadata.safety_hits.slice(0,3).join(", ")}</div>:null}
              </td>
              <td style={{minWidth:275}}>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  <button disabled={busy||reviewLocked} className={x.review_status==="relevant"?styles.button:styles.buttonGhost} onClick={()=>setReview(x,"relevant")}>Relevant</button>
                  <button disabled={busy||reviewLocked} className={x.review_status==="not_relevant"?styles.button:styles.buttonGhost} onClick={()=>setReview(x,"not_relevant")}>Not relevant</button>
                  <button disabled={busy||reviewLocked} className={x.review_status==="needs_review"?styles.button:styles.buttonGhost} onClick={()=>setReview(x,"needs_review")}>Needs review</button>
                </div>
                <div className={styles.muted} style={{marginTop:6}}>{reviewLabel(x.review_status)}</div>
                {x.reviewer_user_id?<div className={styles.muted} style={{marginTop:3,fontSize:11}}>Reviewed by {memberMap[x.reviewer_user_id]?.email||"workspace member"}{x.reviewed_at?" · "+dateTimeLabel(x.reviewed_at):""}</div>:null}
                {reviewLocked?<div className={styles.muted} style={{marginTop:4,fontSize:11}}>Locked for second review</div>:null}
                {x.review_status==="relevant"?<div style={{marginTop:10,paddingTop:9,borderTop:"1px solid rgba(148,163,184,.16)"}}>
                  {pendingRelevantId===x.id?<div className={styles.muted} style={{marginBottom:7}}>Decision saved. Add any downstream actions now, then continue.</div>:<div className={styles.muted} style={{marginBottom:6}}>Downstream</div>}
                  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                    <button disabled={busy||hasFollowup(x.id,"signal_review")} className={styles.buttonGhost} onClick={()=>queueFollowup(x,"signal_review")}>{hasFollowup(x.id,"signal_review")?"Signal queued":"Add to Signal Review"}</button>
                    <button disabled={busy||hasFollowup(x.id,"psur_evidence")} className={styles.buttonGhost} onClick={()=>queueFollowup(x,"psur_evidence")}>{hasFollowup(x.id,"psur_evidence")?"PSUR included":"Include in PSUR evidence"}</button>
                    {pendingRelevantId===x.id?<button disabled={busy} className={styles.button} onClick={()=>finishAlertReview(x)}>Done</button>:null}
                  </div>
                </div>:null}
              </td>
            </tr>
          })}</tbody>
        </table></div>:<div className={styles.empty}>No articles yet. Run a screening period to retrieve PubMed results for the company products. Every result remains visible; automated prioritization only changes review order.</div>}
      </>:null}

      {tab==="runs"?<>
        <div className={styles.panelHeader} style={{marginTop:12}}>
          <h2>Screening runs</h2>
          <span className={styles.muted}>One auditable record per screening period</span>
        </div>
        {loading?<div className={styles.empty}>Loading screening runs…</div>:runs.length?<div className={styles.tableWrap}><table className={styles.table}>
          <thead><tr><th>Period</th><th>Company</th><th>Sources</th><th>Products</th><th>Results</th><th>Reviewed</th><th>Second review</th><th>Status</th><th></th></tr></thead>
          <tbody>{runs.map(r=>{
            const counts=runCounts[r.id]||{total:r.result_count||0,reviewed:r.reviewed_count||0};
            return <tr key={r.id}>
              <td><strong>{dateLabel(r.period_start)} – {dateLabel(r.period_end)}</strong></td>
              <td>{companyMap[r.company_id]||"All companies"}</td>
              <td>{r.source_count}</td>
              <td>{r.product_count}</td>
              <td>{counts.total}</td>
              <td>{counts.reviewed}</td>
              <td>{secondReviewMap[r.id]?<Badge tone={secondReviewMap[r.id].status==="approved"?"green":secondReviewMap[r.id].status==="returned"?"red":"amber"}>{String(secondReviewMap[r.id].status).replace("_"," ")}</Badge>:<span className={styles.muted}>Not assigned</span>}</td>
              <td><Badge tone={recordMap[r.id]?"green":r.status==="review"?"amber":"default"}>{recordMap[r.id]?"Complete":secondReviewMap[r.id]?.status==="pending"?"Awaiting second review":secondReviewMap[r.id]?.status==="returned"?"Returned for correction":String(r.status).replace("_"," ")}</Badge></td>
              <td><button className={styles.buttonGhost} onClick={()=>{setSelectedRun(r);setMessage("")}}>Open</button></td>
            </tr>
          })}</tbody>
        </table></div>:<div className={styles.empty}>No screening runs yet. Create one for a historical or current screening period.</div>}
      </>:null}

      {tab==="second"?<>
        <div className={styles.panelHeader} style={{marginTop:12}}>
          <div>
            <h2>Second review</h2>
            <div className={styles.muted} style={{marginTop:4}}>Independent verification of first-review literature decisions before an inspection-ready screening record can be completed.</div>
          </div>
          <span className={styles.muted}>{myPendingSecondReviews.length} assigned to you · {secondReviews.filter(x=>x.status==="pending").length} pending in workspace</span>
        </div>

        {!selectedSecondReview?<>
          {secondReviews.length?<div className={styles.tableWrap}><table className={styles.table}>
            <thead><tr><th>Period</th><th>Company</th><th>Review scope</th><th>Assigned to</th><th>Assigned</th><th>Status</th><th></th></tr></thead>
            <tbody>{secondReviews.map(sr=>{
              const run=runMap[sr.run_id];
              const summary=sr.metadata?.summary||{};
              return <tr key={sr.id}>
                <td><strong>{run?dateLabel(run.period_start)+" – "+dateLabel(run.period_end):"Screening run"}</strong></td>
                <td>{run?companyMap[run.company_id]||"—":"—"}</td>
                <td>
                  <strong>{Number(summary.scope_count||0)} focused decision{Number(summary.scope_count||0)===1?"":"s"}</strong>
                  <div className={styles.muted} style={{marginTop:3}}>{Number(summary.relevant||0)} Relevant · {Number(summary.likely_relevant||0)} Likely · {Number(summary.saudi_alerts||0)} Saudi · {Number(summary.full_text||0)} Full text</div>
                </td>
                <td>{memberMap[sr.assigned_to]?.email||"Workspace member"}{sr.assigned_to===session?.user.id?<div style={{marginTop:4}}><Badge tone="lime">You</Badge></div>:null}</td>
                <td>{dateTimeLabel(sr.assigned_at)}</td>
                <td><Badge tone={sr.status==="approved"?"green":sr.status==="returned"?"red":"amber"}>{String(sr.status).replaceAll("_"," ")}</Badge></td>
                <td><button className={styles.buttonGhost} onClick={()=>{setSelectedSecondReviewId(sr.id);setSecondReviewNote(sr.note||"")}}>Open</button></td>
              </tr>
            })}</tbody>
          </table></div>:<div className={styles.empty}>No second-review assignments yet. Screen each article, then assign an independent workspace member from Screening Runs. Needs review decisions can be returned for resolution.</div>}
        </>:<>
          {(()=>{
            const sr=selectedSecondReview;
            const run=selectedSecondRun;
            const summary=sr.metadata?.summary||{};
            const assignedToMe=sr.assigned_to===session?.user.id;
            return <>
              <div style={{padding:"12px 14px",display:"flex",justifyContent:"space-between",gap:10,alignItems:"center",flexWrap:"wrap",borderTop:"1px solid rgba(148,163,184,.14)"}}>
                <button className={styles.buttonGhost} onClick={()=>{setSelectedSecondReviewId(null);setSecondReviewNote("")}}>← Back to second reviews</button>
                <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                  <Badge tone={sr.status==="approved"?"green":sr.status==="returned"?"red":"amber"}>{String(sr.status).replaceAll("_"," ")}</Badge>
                  <span className={styles.muted}>Cycle {Number(sr.metadata?.assignment_cycle||1)} · snapshot {dateTimeLabel(sr.metadata?.snapshot_at)}</span>
                </div>
              </div>

              <div className={styles.notice} style={{margin:"0 14px 14px"}}>
                <strong>{run?companyMap[run.company_id]||"Company":"Screening"} · {run?dateLabel(run.period_start)+" – "+dateLabel(run.period_end):""}</strong>
                <div className={styles.muted} style={{marginTop:5}}>
                  Second review is intentionally focused on the decisions with the highest regulatory value: Relevant and Needs review articles, Likely-relevant exclusions, Saudi alerts, and Full-text decisions. Routine low-risk Not relevant decisions remain preserved in the first-review audit trail.
                </div>
                <div style={{display:"flex",gap:14,flexWrap:"wrap",marginTop:10}}>
                  <span><strong>{Number(summary.total||0)}</strong> total screened</span>
                  <span><strong>{Number(summary.relevant||0)}</strong> Relevant</span>
                  <span><strong>{Number(summary.needs_review||0)}</strong> Needs review</span><span><strong>{Number(summary.not_relevant||0)}</strong> Not relevant</span>
                  <span><strong>{Number(summary.scope_count||selectedSecondScope.length)}</strong> in second-review scope</span>
                </div>
                <div className={styles.muted} style={{marginTop:8}}>
                  Assigned by {memberMap[sr.assigned_by]?.email||"workspace member"} · assigned to {memberMap[sr.assigned_to]?.email||"workspace member"} · {dateTimeLabel(sr.assigned_at)}
                </div>
              </div>

              {selectedSecondScope.length?<div className={styles.tableWrap}><table className={styles.table} style={{minWidth:1180}}>
                <thead><tr><th>Article</th><th>Product</th><th>Why in scope</th><th>First decision</th><th>First reviewer</th><th>Downstream</th></tr></thead>
                <tbody>{selectedSecondScope.map((x:any)=>{
                  const p=productMap[x.product_id];
                  const reasons=[
                    x.review_status==="relevant"?"Relevant":x.review_status==="needs_review"?"Needs review":null,
                    x.relevance==="likely_relevant"?"Likely relevant":null,
                    x.saudi_alert?"Saudi alert":null,
                    x.full_text_required?"Full text":null
                  ].filter(Boolean);
                  const downstream=Array.isArray(x.followups)?x.followups:[];
                  return <tr key={x.id}>
                    <td style={{minWidth:390}}>
                      {x.article_url?<a href={x.article_url} target="_blank" rel="noreferrer">{x.title} ↗</a>:<strong>{x.title}</strong>}
                      <details style={{marginTop:8,maxWidth:520}}>
                        <summary style={{cursor:"pointer"}}>Article text & first-review note</summary>
                        <div style={{marginTop:8,whiteSpace:"pre-wrap",lineHeight:1.5}}>{x.abstract||"Abstract unavailable. Open the source article for review."}</div>
                        {x.decision_note?<div style={{marginTop:8}}>First-review note: {x.decision_note}</div>:null}
                        {literatureItemMap[x.id]?.full_text?<details style={{marginTop:8}}><summary style={{cursor:"pointer"}}>Retrieved full text</summary><div style={{whiteSpace:"pre-wrap",maxHeight:360,overflow:"auto",marginTop:8}}>{literatureItemMap[x.id].full_text}</div></details>:null}
                      </details>
                      {x.ai_reason?<div style={{marginTop:6,fontSize:11,lineHeight:1.45}}>{x.ai_reason}</div>:null}
                    </td>
                    <td>{p?<><strong>{p.brand_name}</strong><div className={styles.muted}>{p.active_ingredient||"—"}</div></>:"—"}</td>
                    <td><div style={{display:"flex",gap:5,flexWrap:"wrap"}}>{reasons.map((v:any)=><Badge key={v} tone={v==="Saudi alert"?"red":v==="Relevant"?"green":"amber"}>{v}</Badge>)}</div></td>
                    <td><Badge tone={x.review_status==="relevant"?"green":"default"}>{reviewLabel(x.review_status)}</Badge>{x.reviewed_at?<div className={styles.muted} style={{marginTop:4}}>{dateTimeLabel(x.reviewed_at)}</div>:null}</td>
                    <td>{memberMap[x.reviewer_user_id]?.email||"Workspace member"}</td>
                    <td>{downstream.length?<div style={{display:"flex",gap:5,flexWrap:"wrap"}}>{downstream.map((v:string)=><Badge key={v}>{v==="psur_evidence"?"PSUR evidence":v==="signal_review"?"Signal review":v.replaceAll("_"," ")}</Badge>)}</div>:<span className={styles.muted}>None</span>}</td>
                  </tr>
                })}</tbody>
              </table></div>:<div className={styles.empty}>No articles meet the focused review policy. First-review decisions remain available through Screening Runs.</div>}

              {Array.isArray(sr.metadata?.history)&&sr.metadata.history.length?<details style={{margin:"14px"}}>
                <summary style={{cursor:"pointer"}}>Previous review cycles ({sr.metadata.history.length})</summary>
                {sr.metadata.history.map((cycle:any,index:number)=><div key={index} className={styles.notice} style={{marginTop:8}}>
                  <strong>Cycle {cycle.cycle} · {cycle.status}</strong>
                  <div style={{marginTop:5}}>{memberMap[cycle.reviewed_by]?.email||cycle.reviewed_by||"No decision"} · {dateTimeLabel(cycle.reviewed_at)}</div>
                  {cycle.note?<div style={{marginTop:5}}>{cycle.note}</div>:null}
                  <details style={{marginTop:6}}><summary style={{cursor:"pointer"}}>First-review decisions in this cycle</summary>{(cycle.metadata?.scope_snapshot||[]).map((x:any)=><div key={x.id} style={{marginTop:8}}>{x.title} · {reviewLabel(x.review_status)} · {memberMap[x.reviewer_user_id]?.email||x.reviewer_user_id} · {dateTimeLabel(x.reviewed_at)}</div>)}</details>
                </div>)}
              </details>:null}
              {sr.note?<div className={sr.status==="returned"?styles.errorBox:styles.notice} style={{margin:"14px"}}><strong>Second-review note</strong><div style={{marginTop:5}}>{sr.note}</div></div>:null}

              {sr.status==="pending"&&assignedToMe?<div className={styles.notice} style={{margin:"14px"}}>
                <strong>Second-review decision</strong>
                {Number(summary.needs_review||0)>0?<div style={{marginTop:8}}>Return this screening with a reason so the first reviewer can resolve Needs review articles. Approval requires final decisions.</div>:null}
                <div className={styles.muted} style={{marginTop:5}}>Check the scoped decisions and their downstream actions. Approve to lock reviewer identity and timestamp, or return the screening with a required note explaining what the first reviewer must revisit.</div>
                <textarea className={styles.input} style={{minHeight:88,marginTop:10}} value={secondReviewNote} onChange={e=>setSecondReviewNote(e.target.value)} placeholder="Return note (required only when returning)…"/>
                <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:10,flexWrap:"wrap"}}>
                  <button className={styles.buttonGhost} disabled={busy} onClick={()=>decideSecondReview(run,"returned")}>Return to first reviewer</button>
                  <button className={styles.button} disabled={busy||!run||runItems(run.id).some(x=>x.review_status==="unreviewed"||x.review_status==="needs_review")} onClick={()=>decideSecondReview(run,"approved")}>Approve second review</button>
                </div>
              </div>:null}

              {sr.status==="pending"&&!assignedToMe?<div className={styles.notice} style={{margin:"14px"}}>Pending independent review by <strong>{memberMap[sr.assigned_to]?.email||"assigned reviewer"}</strong>. First-review decisions are locked until the reviewer approves or returns the screening.</div>:null}
              {sr.status==="approved"?<div className={styles.successBox} style={{margin:"14px"}}>Approved by {memberMap[sr.reviewed_by]?.email||"the assigned reviewer"}{sr.reviewed_at?" on "+dateTimeLabel(sr.reviewed_at):""}. The dual-review record is now ready for screening completion.</div>:null}
              {sr.status==="returned"?<div className={styles.errorBox} style={{margin:"14px"}}>Returned to the first reviewer. The screening can be edited and then reassigned; the previous review cycle remains in the audit history.</div>:null}
            </>;
          })()}
        </>}
      </>:null}

      {tab==="psur"?<>
        <div className={styles.panelHeader} style={{marginTop:12}}>
          <div>
            <h2>PSUR evidence pool</h2>
            <div className={styles.muted} style={{marginTop:4}}>Relevant literature findings selected by the QPPV for downstream aggregate reporting.</div>
          </div>
          <span className={styles.muted}>{psurEvidence.length} selected</span>
        </div>
        {loading?<div className={styles.empty}>Loading PSUR evidence…</div>:psurEvidence.length?<div className={styles.tableWrap}><table className={styles.table}>
          <thead><tr><th>Article</th><th>Product</th><th>Source</th><th>Available</th><th>Safety priority</th><th>Evidence status</th></tr></thead>
          <tbody>{psurEvidence.map(row=>{
            const x=row.item;
            return <tr key={row.followup.id}>
              <td style={{minWidth:360}}>
                {x.article_url?<a href={x.article_url} target="_blank" rel="noreferrer">{x.title}</a>:<strong>{x.title}</strong>}
                {x.abstract?<div className={styles.muted} style={{marginTop:6,maxWidth:520,display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"}}>{x.abstract}</div>:null}
              </td>
              <td>{row.product?<><strong>{row.product.brand_name}</strong><div className={styles.muted} style={{marginTop:3}}>{row.product.active_ingredient||"—"}</div></>:"—"}</td>
              <td>{x.journal||"PubMed"}</td>
              <td>{dateLabel(x.publication_date)}</td>
              <td><Badge tone={relevanceTone(x.relevance)}>{relevanceLabel(x.relevance)}</Badge></td>
              <td><Badge tone="green">Selected for PSUR evidence</Badge></td>
            </tr>
          })}</tbody>
        </table></div>:<div className={styles.empty}>No literature findings have been selected for PSUR evidence yet.</div>}
      </>:null}
    </section>

    {rapidOpen&&rapidItem?<div className={styles.modalBackdrop} onMouseDown={e=>{if(e.target===e.currentTarget){setRapidOpen(false);setRapidItemId(null)}}}>
      <div className={styles.modalCard} style={{width:"min(960px,100%)"}}>
        <div className={styles.modalHeader}>
          <div>
            <div className={styles.eyebrow}>Rapid literature review</div>
            <h2>{productMap[rapidItem.product_id]?.brand_name||"Article review"}</h2>
            <div className={styles.muted} style={{marginTop:6}}>
              {rapidReviewed} of {rapidTotal} processed this pass · {Math.max(0,rapidTotal-rapidReviewed)} remaining
            </div>
          </div>
          <button className={styles.modalClose} onClick={()=>{setRapidOpen(false);setRapidItemId(null)}}>×</button>
        </div>

        <div className={styles.progress} style={{marginBottom:18}}>
          <span style={{width:(rapidTotal?Math.round((rapidReviewed/rapidTotal)*100):0)+"%"}}></span>
        </div>

        <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:12}}>
          {rapidItem.metadata?.urgent_saudi?<Badge tone="red">⚠ Potential Saudi case / context</Badge>:null}
          {rapidItem.metadata?.full_text_required?<Badge tone="amber">Full text required</Badge>:<Badge tone={relevanceTone(rapidItem.relevance)}>{relevanceLabel(rapidItem.relevance)}</Badge>}
          <Badge>{sourceMap[rapidItem.source_id]?.name||rapidItem.journal||"PubMed"}</Badge>
          <Badge>{dateLabel(rapidItem.publication_date)}</Badge>
        </div>

        <div className={styles.info}>
          <h3 style={{fontSize:17,lineHeight:1.4,marginBottom:10}}>
            {rapidItem.article_url?<a href={rapidItem.article_url} target="_blank" rel="noreferrer">{rapidItem.title} ↗</a>:rapidItem.title}
          </h3>
          <div className={styles.kv}><span>Product</span><span>{productMap[rapidItem.product_id]?.brand_name||"—"} · {productMap[rapidItem.product_id]?.active_ingredient||"—"}</span></div>
          <div className={styles.kv}><span>Matched terms</span><span>{rapidItem.matched_terms?.length?rapidItem.matched_terms.join(", "):"—"}</span></div>
          <div className={styles.kv}><span>Matched in</span><span>{rapidItem.metadata?.match_locations?.length?rapidItem.metadata.match_locations.join(" · "):"—"}</span></div>
          <div className={styles.kv}><span>Product role</span><span>{rapidItem.metadata?.product_role?String(rapidItem.metadata.product_role).replaceAll("_"," "):"—"}</span></div>
          <div className={styles.kv}><span>Evidence context</span><span>{rapidItem.metadata?.publication_context?String(rapidItem.metadata.publication_context).replaceAll("_"," "):"—"}</span></div>
          <div className={styles.kv}><span>Finding type</span><span>{rapidItem.metadata?.finding_types?.length?rapidItem.metadata.finding_types.map((v:string)=>v.replaceAll("_"," ")).join(" · "):"—"}</span></div>
          <div className={styles.kv}><span>Safety terms</span><span>{rapidItem.metadata?.safety_hits?.length?rapidItem.metadata.safety_hits.join(", "):"—"}</span></div>
          <div className={styles.kv}><span>Automation note</span><span>{rapidItem.ai_reason||"—"}</span></div>
        </div>

        <div className={styles.notice} style={{marginTop:14,maxHeight:300,overflow:"auto"}}>
          <strong>Abstract</strong>
          <div style={{marginTop:8,lineHeight:1.7,whiteSpace:"pre-wrap"}}>{rapidItem.abstract||"No abstract available from PubMed."}</div>
        </div>

        <div style={{marginTop:14,display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
          <span className={styles.muted}>Keyboard:</span>
          <Badge>R · Relevant</Badge>
          <Badge>N · Not relevant</Badge>
          <Badge>M · Needs review</Badge>
          <Badge>S · Skip</Badge>
        </div>

        <div className={styles.modalActions} style={{justifyContent:"space-between",flexWrap:"wrap"}}>
          <button className={styles.buttonGhost} disabled={busy} onClick={skipRapid}>Skip</button>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            <button className={styles.buttonGhost} disabled={busy} onClick={()=>rapidDecision("needs_review")}>Needs review</button>
            <button className={styles.buttonGhost} disabled={busy} onClick={()=>rapidDecision("not_relevant")}>Not relevant</button>
            <button className={styles.button} disabled={busy} onClick={()=>rapidDecision("relevant")}>Relevant</button>
          </div>
        </div>
      </div>
    </div>:null}

    {selectedRun?<div className={styles.modalBackdrop} onMouseDown={e=>{if(e.target===e.currentTarget)setSelectedRun(null)}}>
      <div className={styles.modalCard}>
        <div className={styles.modalHeader}>
          <div>
            <div className={styles.eyebrow}>Screening evidence</div>
            <h2>{dateLabel(selectedRun.period_start)} – {dateLabel(selectedRun.period_end)}</h2>
            <div className={styles.muted} style={{marginTop:5}}>{companyMap[selectedRun.company_id]||"Company"}</div>
          </div>
          <button className={styles.modalClose} onClick={()=>setSelectedRun(null)}>×</button>
        </div>
        {(()=>{
          const s=statsForRun(selectedRun);
          const rec=recordMap[selectedRun.id];
          const second=secondReviewMap[selectedRun.id];
          const firstReviewerIds=new Set(runItems(selectedRun.id).map(x=>x.reviewer_user_id).filter(Boolean));
          const otherMembers=members.filter(m=>m.user_id!==session?.user.id&&!firstReviewerIds.has(m.user_id));
          const unreviewedCount=runItems(selectedRun.id).filter(x=>x.review_status==="unreviewed").length;
          return <>
            <div className={styles.info}>
              <div className={styles.kv}><span>Results retrieved</span><span>{s.total}</span></div>
              <div className={styles.kv}><span>Final decisions</span><span>{s.reviewed} / {s.total}</span></div>
              <div className={styles.kv}><span>Still open</span><span>{s.open}</span></div>
              <div className={styles.kv}><span>Relevant</span><span>{s.relevant}</span></div>
              <div className={styles.kv}><span>Not relevant</span><span>{s.notRelevant}</span></div>
              <div className={styles.kv}><span>Saudi alerts</span><span>{s.saudi}</span></div>
              <div className={styles.kv}><span>Signal escalations</span><span>{s.signal}</span></div>
              <div className={styles.kv}><span>PSUR selections</span><span>{s.psur}</span></div>
            </div>
            <div className={s.open?styles.notice:styles.successBox} style={{marginTop:14}}>
              {rec?"This screening run is complete and its evidence snapshot is locked in the inspection record.":s.open?String(s.open)+" article(s) still require a final Relevant / Not relevant decision before the run can be completed.":"All retrieved articles have a final first-review decision."}
            </div>

            {!rec?<div className={styles.info} style={{marginTop:14}}>
              <div className={styles.kv}><span>Second review</span><span>{second?String(second.status).replace("_"," "):"Not assigned"}</span></div>
              {second?.assigned_to?<div className={styles.kv}><span>Assigned to</span><span>{memberMap[second.assigned_to]?.email||"Workspace member"}</span></div>:null}
              {second?.assigned_at?<div className={styles.kv}><span>Assigned at</span><span>{dateTimeLabel(second.assigned_at)}</span></div>:null}
              {second?.reviewed_by?<div className={styles.kv}><span>Reviewed by</span><span>{memberMap[second.reviewed_by]?.email||"Workspace member"}</span></div>:null}
              {second?.reviewed_at?<div className={styles.kv}><span>Reviewed at</span><span>{dateTimeLabel(second.reviewed_at)}</span></div>:null}
              {second?.note?<div className={styles.kv}><span>Review note</span><span>{second.note}</span></div>:null}
            </div>:null}

            {!rec&&unreviewedCount===0&&(!second||second.status==="returned")?<div className={styles.notice} style={{marginTop:14}}>
              <strong>{second?.status==="returned"?"Resend for second review":"Send to second reviewer"}</strong>
              <div className={styles.muted} style={{marginTop:5}}>Relevant, Needs review and flagged decisions are routed for independent verification. Routine low-risk exclusions remain in the first-review audit trail.</div>
              {otherMembers.length?<div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",marginTop:10}}>
                <select className={styles.input} style={{minWidth:260}} value={secondReviewerId} onChange={e=>setSecondReviewerId(e.target.value)}>
                  <option value="">Choose workspace member</option>
                  {otherMembers.map(m=><option key={m.user_id} value={m.user_id}>{m.email} · {m.role}</option>)}
                </select>
                <button className={styles.button} disabled={busy||!secondReviewerId} onClick={()=>assignSecondReviewer(selectedRun)}>{busy?"Sending…":"Send for second review"}</button>
              </div>:<div className={styles.muted} style={{marginTop:10}}>No independent reviewer is available. Add a member who did not make first-review decisions in this run.</div>}
              <div style={{marginTop:12,paddingTop:12,borderTop:"1px solid rgba(148,163,184,.18)"}}>
                <div className={styles.muted} style={{marginBottom:7}}>Add reviewer by email</div>
                <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                  <input className={styles.input} style={{minWidth:260}} type="email" value={reviewerEmail} onChange={e=>setReviewerEmail(e.target.value)} placeholder="reviewer@company.com"/>
                  <select className={styles.input} aria-label="New reviewer workspace role" value={reviewerRole} onChange={e=>setReviewerRole(e.target.value)}>
                    <option value="deputy_qppv">Deputy QPPV</option><option value="qppv">QPPV</option><option value="pv_specialist">PV specialist</option><option value="quality">Quality</option>
                  </select>
                  <button className={styles.buttonGhost} disabled={busy||!reviewerEmail.trim()} onClick={addReviewerByEmail}>Add reviewer</button>
                </div>
                <div className={styles.muted} style={{marginTop:6,fontSize:11}}>Workspace access is granted by email; no email notification is sent. Existing PVOS accounts are added immediately. A new reviewer joins this workspace when they first sign in using the same email.</div>
              </div>
            </div>:null}

            {!rec&&second?<div style={{marginTop:14}}>
              <button className={styles.buttonGhost} onClick={()=>{setSelectedRun(null);setSelectedSecondReviewId(second.id);setSecondReviewNote(second.note||"");setTab("second")}}>Open focused second review</button>
            </div>:null}

            {!rec&&second?.status==="pending"&&second.assigned_to!==session?.user.id?<div className={styles.notice} style={{marginTop:14}}>Pending second review by <strong>{memberMap[second.assigned_to]?.email||"assigned reviewer"}</strong>.</div>:null}
            {!rec&&second?.status==="approved"?<div className={styles.successBox} style={{marginTop:14}}>Second review approved by {memberMap[second.reviewed_by]?.email||"the assigned reviewer"}{second.reviewed_at?" on "+dateTimeLabel(second.reviewed_at):""}. The screening can now be completed.</div>:null}

            <div className={styles.modalActions} style={{justifyContent:"space-between",flexWrap:"wrap"}}>
              <button className={styles.buttonGhost} onClick={()=>openRunDecisions(selectedRun)}>Review decisions</button>
              {rec?<button className={styles.button} onClick={()=>exportScreeningRecord(selectedRun)}>Export screening record</button>:<button className={styles.button} disabled={busy||s.open>0||!second||second.status!=="approved"} onClick={()=>completeScreening(selectedRun)}>{busy?"Creating record…":"Complete screening & create evidence"}</button>}
            </div>
          </>;
        })()}
      </div>
    </div>:null}

    {showSource?<div className={styles.modalBackdrop} onMouseDown={e=>{if(e.target===e.currentTarget)setShowSource(false)}}>
      <form className={styles.modalCard} onSubmit={addSource}>
        <div className={styles.modalHeader}>
          <div><div className={styles.eyebrow}>Source registry</div><h2>Add literature source</h2></div>
          <button type="button" className={styles.modalClose} onClick={()=>setShowSource(false)}>×</button>
        </div>
        <div className={styles.formGrid}>
          <label className={styles.full}>Journal / database name<input className={styles.input} value={sourceForm.name} onChange={e=>setSourceForm({...sourceForm,name:e.target.value})} required/></label>
          <label className={styles.full}>URL<input className={styles.input} type="url" value={sourceForm.url} onChange={e=>setSourceForm({...sourceForm,url:e.target.value})} placeholder="https://…"/></label>
          <label>Language<select className={styles.input} value={sourceForm.language} onChange={e=>setSourceForm({...sourceForm,language:e.target.value})}><option>English</option><option>Arabic</option><option>Arabic + English</option><option>Other</option></select></label>
          <label>Screening frequency<select className={styles.input} value={sourceForm.frequency} onChange={e=>setSourceForm({...sourceForm,frequency:e.target.value})}><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="manual">On demand</option></select></label>
          <label className={styles.full}>Notes<textarea className={styles.input} style={{minHeight:80}} value={sourceForm.notes} onChange={e=>setSourceForm({...sourceForm,notes:e.target.value})} placeholder="Access notes, search limitations, required coverage…"/></label>
        </div>
        <div className={styles.modalActions}><button type="button" className={styles.buttonGhost} onClick={()=>setShowSource(false)}>Cancel</button><button className={styles.button} disabled={busy}>{busy?"Adding…":"Add source"}</button></div>
      </form>
    </div>:null}

    {showRun?<div className={styles.modalBackdrop} onMouseDown={e=>{if(e.target===e.currentTarget)setShowRun(false)}}>
      <form className={styles.modalCard} onSubmit={createRun}>
        <div className={styles.modalHeader}>
          <div><div className={styles.eyebrow}>Literature screening</div><h2>New screening run</h2><div className={styles.muted} style={{marginTop:5}}>This first live connector searches PubMed for every product in the selected company and sends every retrieved result to the QPPV review queue.</div></div>
          <button type="button" className={styles.modalClose} onClick={()=>setShowRun(false)}>×</button>
        </div>
        <div className={styles.formGrid}>
          <label className={styles.full}>Company<select className={styles.input} value={runForm.companyId} onChange={e=>setRunForm({...runForm,companyId:e.target.value})} required>{companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label>Period start<input className={styles.input} type="date" value={runForm.start} onChange={e=>setRunForm({...runForm,start:e.target.value})} required/></label>
          <label>Period end<input className={styles.input} type="date" value={runForm.end} onChange={e=>setRunForm({...runForm,end:e.target.value})} required/></label>
        </div>
        <div className={styles.info} style={{marginTop:16}}>
          <div className={styles.kv}><span>Connected now</span><span>PubMed API</span></div>
          <div className={styles.kv}><span>Products</span><span>{products.filter(x=>x.company_id===runForm.companyId).length}</span></div>
          <div className={styles.kv}><span>Review model</span><span>Automation prioritizes · QPPV decides</span></div>
        </div>
        <div className={styles.modalActions}><button type="button" className={styles.buttonGhost} onClick={()=>setShowRun(false)}>Cancel</button><button className={styles.button} disabled={busy}>{busy?"Searching PubMed…":"Run screening"}</button></div>
      </form>
    </div>:null}
  </>;
}
