"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Badge, Header } from "../_components";
import { usePVOS } from "../_provider";
import { pvosSupabase } from "../_pvos-supabase";
import styles from "../pvos.module.css";

type Tab="sources"|"queue"|"runs"|"psur";
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
  const [loading,setLoading]=useState(true);
  const [showSource,setShowSource]=useState(false);
  const [showRun,setShowRun]=useState(false);
  const [selectedRun,setSelectedRun]=useState<any|null>(null);
  const [rapidOpen,setRapidOpen]=useState(false);
  const [rapidItemId,setRapidItemId]=useState<string|null>(null);
  const [rapidSeen,setRapidSeen]=useState<string[]>([]);
  const [rapidTotal,setRapidTotal]=useState(0);
  const [rapidReviewed,setRapidReviewed]=useState(0);
  const [busy,setBusy]=useState(false);
  const [analyzing,setAnalyzing]=useState(false);
  const [queueFilter,setQueueFilter]=useState<"open"|"priority"|"fulltext"|"saudi"|"reviewed"|"all">("open");
  const [productFilter,setProductFilter]=useState("");
  const [runFilter,setRunFilter]=useState("");
  const [batchMode,setBatchMode]=useState(false);
  const [batchSelected,setBatchSelected]=useState<string[]>([]);
  const [batchPinned,setBatchPinned]=useState<string[]>([]);
  const [pendingRelevantId,setPendingRelevantId]=useState<string|null>(null);
  const [secondReviewerId,setSecondReviewerId]=useState("");
  const [secondReviewNote,setSecondReviewNote]=useState("");
  const [message,setMessage]=useState("");
  const [sourceForm,setSourceForm]=useState({name:"",url:"",language:"English",frequency:"weekly",notes:""});
  const [runForm,setRunForm]=useState({companyId:"",start:daysAgo(7),end:today()});

  async function load(){
    if(!organizationId)return;
    setLoading(true);
    const [s,r,i,c,f,rec,sr,mem]=await Promise.all([
      pvosSupabase.from("pvos_literature_sources").select("*").eq("organization_id",organizationId).order("name"),
      pvosSupabase.from("pvos_literature_runs").select("*").eq("organization_id",organizationId).order("period_end",{ascending:false}),
      pvosSupabase.from("pvos_literature_items").select("*").eq("organization_id",organizationId).order("created_at",{ascending:false}),
      pvosSupabase.from("pvos_companies").select("id,name").eq("organization_id",organizationId).order("name"),
      pvosSupabase.from("pvos_literature_followups").select("*").eq("organization_id",organizationId).order("created_at",{ascending:false}),
      pvosSupabase.from("pvos_literature_screening_records").select("*").eq("organization_id",organizationId).order("completed_at",{ascending:false}),
      pvosSupabase.from("pvos_literature_second_reviews").select("*").eq("organization_id",organizationId).order("assigned_at",{ascending:false}),
      pvosSupabase.rpc("pvos_member_directory",{p_organization_id:organizationId})
    ]);
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
    setRunForm(v=>({...v,companyId:v.companyId||cs[0]?.id||""}));
    setLoading(false);
  }

  useEffect(()=>{load()},[organizationId]);

  const companyMap=useMemo(()=>Object.fromEntries(companies.map(x=>[x.id,x.name])),[companies]);
  const productMap=useMemo(()=>Object.fromEntries(products.map(x=>[x.id,x])),[products]);
  const sourceMap=useMemo(()=>Object.fromEntries(sources.map(x=>[x.id,x])),[sources]);
  const memberMap=useMemo(()=>Object.fromEntries(members.map(x=>[x.user_id,x])),[members]);
  const secondReviewMap=useMemo(()=>Object.fromEntries(secondReviews.map(x=>[x.run_id,x])),[secondReviews]);
  const activeSources=sources.filter(x=>x.active);
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
  }),[sortedItems,queueFilter,productFilter,runFilter,pendingRelevantId,batchPinned]);
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
  const batchRunItems=useMemo(()=>runFilter?items.filter(x=>x.run_id===runFilter):[],[items,runFilter]);
  const batchRemainingEligible=batchRunItems.filter(x=>x.review_status==="unreviewed"&&!x.metadata?.full_text_required);
  const batchFullTextOpen=batchRunItems.filter(x=>(x.review_status==="unreviewed"||x.review_status==="needs_review")&&x.metadata?.full_text_required);
  const batchNeedsReview=batchRunItems.filter(x=>x.review_status==="needs_review"&&!x.metadata?.full_text_required);
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

  async function createRun(e:FormEvent){
    e.preventDefault();
    if(!organizationId||!session||!runForm.companyId||!runForm.start||!runForm.end)return;
    if(runForm.end<runForm.start){setMessage("Period end must be on or after the start date.");return;}
    const companyProducts=products.filter(x=>x.company_id===runForm.companyId);
    if(!companyProducts.length){setMessage("This company has no products to screen.");return;}

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
        source_count:1,
        product_count:companyProducts.length,
        metadata:{v0:true,scope:"all_company_products",connectors:["pubmed"]}
      }).select("*").single();
      if(runError||!run)throw runError||new Error("Could not create screening run.");
      runId=run.id;

      const response=await fetch("/api/pvos/literature/pubmed",{
        method:"POST",
        headers:{
          "Content-Type":"application/json",
          "Authorization":"Bearer "+session.access_token
        },
        body:JSON.stringify({
          periodStart:runForm.start,
          periodEnd:runForm.end,
          products:companyProducts.map(p=>({
            id:p.id,
            brand_name:p.brand_name,
            active_ingredient:p.active_ingredient
          }))
        })
      });
      const result=await response.json();
      if(!response.ok)throw new Error(result?.error||"PubMed screening failed.");

      const payload=(result.items||[]).map((x:any)=>({
        ...x,
        organization_id:organizationId,
        run_id:run.id,
        source_id:source.id,
        company_id:runForm.companyId
      }));
      if(payload.length){
        const {error:itemError}=await pvosSupabase.from("pvos_literature_items").insert(payload);
        if(itemError)throw itemError;
      }

      const now=new Date().toISOString();
      await Promise.all([
        pvosSupabase.from("pvos_literature_sources").update({
          last_checked_at:now,
          next_due_at:nextDue("weekly")
        }).eq("id",source.id),
        pvosSupabase.from("pvos_literature_runs").update({
          status:"review",
          result_count:payload.length,
          metadata:{v0:true,scope:"all_company_products",connectors:["pubmed"],pubmed_results:payload.length,searches:result.searches||[]}
        }).eq("id",run.id)
      ]);

      setShowRun(false);
      setTab("queue");
      setMessage("Screening run created: PubMed searched "+companyProducts.length+" products and returned "+payload.length+" articles for QPPV review.");
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

        const response=await fetch("/api/pvos/literature/pubmed/enrich",{
          method:"POST",
          headers:{"Content-Type":"application/json","Authorization":"Bearer "+session.access_token},
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
    setBusy(true);
    const reviewedNow=status==="relevant"||status==="not_relevant";
    const reviewedAt=reviewedNow?new Date().toISOString():null;
    const {error}=await pvosSupabase.from("pvos_literature_items").update({
      review_status:status,
      reviewer_user_id:session.user.id,
      reviewed_at:reviewedAt
    }).eq("id",item.id);
    setBusy(false);
    if(error){setMessage(error.message);return;}
    setItems(prev=>prev.map(x=>x.id===item.id?{
      ...x,
      review_status:status,
      reviewer_user_id:session.user.id,
      reviewed_at:reviewedAt
    }:x));
    if(status==="relevant")setPendingRelevantId(item.id);
    else if(pendingRelevantId===item.id)setPendingRelevantId(null);
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

  async function markBatchRemainingNotRelevant(){
    if(!session||!runFilter)return;
    const second=secondReviewMap[runFilter];
    if(second&&(second.status==="pending"||second.status==="approved")){
      setMessage("This screening run is locked for second review.");
      return;
    }
    const count=batchRemainingEligible.length;
    if(!count){
      setMessage("No eligible unreviewed articles remain in this screening run.");
      return;
    }
    const excluded=batchFullTextOpen.length+batchNeedsReview.length;
    const ok=window.confirm(
      "Mark "+count+" remaining unreviewed article(s) in this screening run as Not relevant?"+
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
    const xs=runItems(run.id);
    const stats=statsForRun(run);
    const secondReview=secondReviewMap[run.id];
    if(stats.open>0){
      setMessage("Cannot complete screening: "+stats.open+" article(s) still need a final QPPV decision.");
      return;
    }
    if(secondReview&&secondReview.status!=="approved"){
      setMessage("Cannot complete screening until the assigned second review is approved.");
      return;
    }
    setBusy(true);setMessage("");
    try{
      const sourceIds=[...new Set(xs.map(x=>x.source_id).filter(Boolean))];
      const sourceSnapshot=sources.filter(x=>sourceIds.includes(x.id)).map(x=>({
        id:x.id,name:x.name,url:x.url,method:x.method,language:x.language
      }));
      const scopedProducts=products.filter(x=>x.company_id===run.company_id).map(x=>({
        id:x.id,brand_name:x.brand_name,active_ingredient:x.active_ingredient
      }));
      const searchSnapshot=(run.metadata?.searches?.length?run.metadata.searches:scopedProducts.map(p=>{
        const sample=xs.find(x=>x.product_id===p.id);
        return {product_id:p.id,brand_name:p.brand_name,active_ingredient:p.active_ingredient,terms:sample?.metadata?.search_terms||[]};
      }));
      const decisions=xs.map(x=>({
        literature_item_id:x.id,
        product_id:x.product_id,
        product:productMap[x.product_id]?.brand_name||null,
        title:x.title,
        pmid:x.metadata?.pmid||null,
        doi:x.doi||null,
        article_url:x.article_url,
        relevance:x.relevance,
        review_status:x.review_status,
        reviewer_user_id:x.reviewer_user_id,
        reviewed_at:x.reviewed_at,
        saudi_alert:!!x.metadata?.urgent_saudi,
        assessment_state:x.metadata?.assessment_state||"standard",
        full_text_required:!!x.metadata?.full_text_required,
        product_role:x.metadata?.product_role||null,
        publication_context:x.metadata?.publication_context||null,
        finding_types:x.metadata?.finding_types||[]
      }));
      const downstream=runFollowups(run.id).map(x=>({
        literature_item_id:x.literature_item_id,
        destination:x.destination,
        status:x.status,
        created_at:x.created_at
      }));
      const completedAt=new Date().toISOString();
      const {error:recordError}=await pvosSupabase.from("pvos_literature_screening_records").upsert({
        organization_id:organizationId,
        run_id:run.id,
        company_id:run.company_id,
        period_start:run.period_start,
        period_end:run.period_end,
        source_snapshot:sourceSnapshot,
        product_snapshot:scopedProducts,
        search_snapshot:searchSnapshot,
        metrics:stats,
        decision_snapshot:decisions,
        downstream_snapshot:downstream,
        completed_by:session.user.id,
        completed_at:completedAt,
        metadata:{
          record_version:"v2",
          review_model:secondReview?"QPPV first review + second reviewer":"QPPV final decision",
          generated_by:"PVOS",
          second_review:secondReview?{
            id:secondReview.id,
            status:secondReview.status,
            assigned_to:secondReview.assigned_to,
            assigned_by:secondReview.assigned_by,
            assigned_at:secondReview.assigned_at,
            reviewed_by:secondReview.reviewed_by,
            reviewed_at:secondReview.reviewed_at,
            note:secondReview.note
          }:null
        }
      },{onConflict:"run_id"});
      if(recordError)throw recordError;
      const {error:runError}=await pvosSupabase.from("pvos_literature_runs").update({
        status:"complete",
        completed_by:session.user.id,
        completed_at:completedAt,
        reviewed_count:stats.reviewed
      }).eq("id",run.id);
      if(runError)throw runError;
      setMessage("Screening completed. Inspection-ready evidence record created.");
      await load();
      setSelectedRun({...run,status:"complete",completed_at:completedAt});
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
    add("PVOS Literature Screening Record","v1");
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
    lines.push('"Article","Product","PMID","Safety priority","QPPV decision","Saudi alert","Reviewed at"');
    for(const d of record.decision_snapshot||[]){
      lines.push([d.title,d.product,d.pmid,d.relevance,d.review_status,d.saudi_alert?"Yes":"No",d.reviewed_at].map((v:any)=>'"'+String(v??"").replaceAll('"','""')+'"').join(","));
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

    {message?<div className={message.includes("added")||message.includes("created")||message.includes("complete")||message.includes("returned")?styles.successBox:styles.errorBox} style={{marginBottom:14}}>{message}</div>:null}

    <section className={styles.panel}>
      <div style={{padding:"12px 14px 0",display:"flex",gap:8,flexWrap:"wrap"}}>
        <button className={tab==="sources"?styles.button:styles.buttonGhost} onClick={()=>setTab("sources")}>Sources</button>
        <button className={tab==="queue"?styles.button:styles.buttonGhost} onClick={()=>setTab("queue")}>Screening Queue {openItems.length?"("+openItems.length+")":""}</button>
        <button className={tab==="runs"?styles.button:styles.buttonGhost} onClick={()=>setTab("runs")}>Screening Runs</button>
        <button className={tab==="psur"?styles.button:styles.buttonGhost} onClick={()=>setTab("psur")}>PSUR Evidence {psurEvidence.length?"("+psurEvidence.length+")":""}</button>
      </div>

      {tab==="sources"?<>
        <div className={styles.panelHeader} style={{marginTop:12}}>
          <h2>Literature sources</h2>
          <span className={styles.muted}>{activeSources.length} active · {sources.length} total</span>
        </div>
        {loading?<div className={styles.empty}>Loading sources…</div>:sources.length?<div className={styles.tableWrap}><table className={styles.table}>
          <thead><tr><th>Source</th><th>Language</th><th>Frequency</th><th>Connection</th><th>Last checked</th><th>Next due</th><th>Status</th></tr></thead>
          <tbody>{sources.map(s=>{
            const due=s.next_due_at&&new Date(s.next_due_at)<new Date();
            return <tr key={s.id}>
              <td><strong>{s.name}</strong>{s.url?<div className={styles.muted} style={{marginTop:4}}><a href={s.url} target="_blank" rel="noreferrer">Open source ↗</a></div>:null}</td>
              <td>{s.language}</td>
              <td>{String(s.screening_frequency).replace("_"," ")}</td>
              <td><Badge>{s.method==="manual"?"Manual / pending automation":s.method.toUpperCase()}</Badge></td>
              <td>{dateLabel(s.last_checked_at)}</td>
              <td>{dateLabel(s.next_due_at)}</td>
              <td><Badge tone={!s.active?"default":due?"amber":"green"}>{!s.active?"Inactive":due?"Due":"Active"}</Badge></td>
            </tr>
          })}</tbody>
        </table></div>:<div className={styles.empty}>No literature sources yet. Add the journals or databases your QPPV team is required to screen.</div>}
      </>:null}

      {tab==="queue"?<>
        <div className={styles.panelHeader} style={{marginTop:12}}>
          <div>
            <h2>Screening queue</h2>
            <div className={styles.muted} style={{marginTop:4}}>{openItems.length} awaiting final QPPV decision · {reviewed.length} reviewed</div>
          </div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            <button className={styles.buttonGhost} onClick={analyzeQueue} disabled={analyzing||!items.length}>{analyzing?"Analyzing abstracts…":"Analyze & prioritize"}</button>
            <button className={batchMode?styles.button:styles.buttonGhost} onClick={batchMode?finishBatchReview:startBatchReview} disabled={!openItems.length}>{batchMode?"Exit batch review":"Batch review"}</button>
            <button className={styles.button} onClick={startRapidReview} disabled={!openItems.length}>Rapid review</button>
          </div>
        </div>
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
                Check only the articles you consider Relevant. Save them first, add Signal/PSUR actions if needed, then mark the remaining eligible articles Not relevant.
              </div>
              <div className={styles.muted} style={{marginTop:5}}>
                {batchSelected.length} selected · {batchRemainingEligible.length} unreviewed eligible · {batchFullTextOpen.length} full-text protected · {batchNeedsReview.length} Needs review protected
              </div>
            </div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              <button className={styles.buttonGhost} disabled={busy||!batchSelected.length||!runFilter} onClick={saveBatchRelevant}>Save selected as Relevant ({batchSelected.length})</button>
              <button className={styles.button} disabled={busy||!batchRemainingEligible.length||!runFilter} onClick={markBatchRemainingNotRelevant}>Mark remaining Not relevant ({batchRemainingEligible.length})</button>
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
                {x.reviewer_user_id?<div className={styles.muted} style={{marginTop:3,fontSize:11}}>Reviewed by {memberMap[x.reviewer_user_id]?.email||"workspace member"}{x.reviewed_at?" · "+dateLabel(x.reviewed_at):""}</div>:null}
                {reviewLocked?<div className={styles.muted} style={{marginTop:4,fontSize:11}}>Locked for second review</div>:null}
                {x.review_status==="relevant"?<div style={{marginTop:10,paddingTop:9,borderTop:"1px solid rgba(148,163,184,.16)"}}>
                  {pendingRelevantId===x.id?<div className={styles.muted} style={{marginBottom:7}}>Decision saved. Add any downstream actions now, then continue.</div>:<div className={styles.muted} style={{marginBottom:6}}>Downstream</div>}
                  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                    <button disabled={busy||hasFollowup(x.id,"signal_review")} className={styles.buttonGhost} onClick={()=>queueFollowup(x,"signal_review")}>{hasFollowup(x.id,"signal_review")?"Signal queued":"Add to Signal Review"}</button>
                    <button disabled={busy||hasFollowup(x.id,"psur_evidence")} className={styles.buttonGhost} onClick={()=>queueFollowup(x,"psur_evidence")}>{hasFollowup(x.id,"psur_evidence")?"PSUR included":"Include in PSUR evidence"}</button>
                    {pendingRelevantId===x.id?<button disabled={busy} className={styles.button} onClick={()=>setPendingRelevantId(null)}>Done</button>:null}
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
              <td><Badge tone={recordMap[r.id]?"green":r.status==="review"?"amber":"default"}>{recordMap[r.id]?"Complete":String(r.status).replace("_"," ")}</Badge></td>
              <td><button className={styles.buttonGhost} onClick={()=>{setSelectedRun(r);setMessage("")}}>Open</button></td>
            </tr>
          })}</tbody>
        </table></div>:<div className={styles.empty}>No screening runs yet. Create one for a historical or current screening period.</div>}
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
              {rec?"This screening run is complete and its evidence snapshot is locked in the inspection record.":s.open?String(s.open)+" article(s) still require a final Relevant / Not relevant decision before the run can be completed.":"All retrieved articles have a final QPPV decision. The run is ready to complete."}
            </div>
            <div className={styles.modalActions}>
              {rec?<button className={styles.button} onClick={()=>exportScreeningRecord(selectedRun)}>Export screening record</button>:<button className={styles.button} disabled={busy||s.open>0} onClick={()=>completeScreening(selectedRun)}>{busy?"Creating record…":"Complete screening & create evidence"}</button>}
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
