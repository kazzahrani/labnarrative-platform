"use client";

import Link from "next/link";
import {useCallback,useEffect,useMemo,useState} from "react";
import {useRouter,useSearchParams} from "next/navigation";
import {Badge,Header,Help} from "../_components";
import {usePVOS} from "../_provider";
import {pvosSupabase} from "../_pvos-supabase";
import styles from "../pvos.module.css";
import {getPVOSCache,pvosCacheKey,setPVOSCache,shouldRefreshPVOSCache} from "../_session-cache";

type Invoice={
 id:string;company_id:string;company_name:string;title:string;invoice_ref:string|null;description:string;
 status:string;created_at:string;updated_at:string;requested_by:string;head_user_id:string;finance_user_id:string;
 head_email:string;finance_email:string;requested_email?:string;due_on:string|null;
};
type Department={
 id:string;company_id:string;organization_id:string;request_type:string;department:string;details:string;
 external_reference:string|null;status:string;requester_user_id:string;reviewer_user_id:string|null;recipient_user_id:string|null;
 due_at:string;created_at:string;followup_count:number;
};
type Company={id:string;name:string;organization_id:string};
type Row={key:string;id:string;type:"invoice"|"department";companyId:string;companyName:string;name:string;detail:string;reference:string;stage:string;
 created:string;due:string|null;needsAction:boolean;complete:boolean;url:string};
const invoiceStatus:Record<string,string>={
 draft:"Draft",head_review:"Head approval",returned_head:"Corrections needed",finance_review:"Finance approval",
 returned_finance:"Corrections needed",awaiting_payment:"Payment confirmation",paid:"Payment completed"
};
const deptStatus:Record<string,string>={
 draft:"Draft",waiting:"Waiting for department",received:"Ready for review",returned:"Corrections needed",
 complete:"Complete",cancelled:"Cancelled"
};
const deptType:Record<string,string>={
 invoice:"Invoice request",regulatory_history:"Registration history",safety_data:"Safety / case data",
 labelling:"Label / PIL",document:"Controlled document",other:"Information request"
};
const fmt=(d:string)=>new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Riyadh",day:"numeric",month:"short",year:"numeric"}).format(new Date(d));
const invoiceNeeds=(i:Invoice,uid:string)=>{
 if(i.status==="draft"||i.status==="returned_head"||i.status==="returned_finance")return i.requested_by===uid;
 if(i.status==="head_review")return i.head_user_id===uid;
 if(i.status==="finance_review"||i.status==="awaiting_payment")return i.finance_user_id===uid;
 return false;
};
function tone(r:Row):"green"|"amber"|"red"|"default"{
 if(r.complete)return "green";
 if(r.stage==="Corrections needed")return "red";
 return r.stage==="Draft"?"default":"amber";
}
export default function RequestsPage(){
 const router=useRouter();
 const query=useSearchParams();
 const {session,loading:authLoading,organizationId}=usePVOS();
 type Snapshot={invoices:Invoice[];departments:Department[];companies:Company[]};
 const key=pvosCacheKey(session?.user.id,organizationId,"requests-inbox");
 const previous=getPVOSCache<Snapshot>(key)?.data;
 const [invoices,setInvoices]=useState<Invoice[]>(()=>previous?.invoices||[]);
 const [departments,setDepartments]=useState<Department[]>(()=>previous?.departments||[]);
 const [companies,setCompanies]=useState<Company[]>(()=>previous?.companies||[]);
 const [loading,setLoading]=useState(()=>!previous),[error,setError]=useState("");
 const [view,setView]=useState<"all"|"mine"|"complete">("all");
 const [type,setType]=useState<"all"|"invoice"|"department">("all");
 const [company,setCompany]=useState("all"),[search,setSearch]=useState("");
 const [chooser,setChooser]=useState(false),[newType,setNewType]=useState<"department"|"invoice">("department"),[newCompany,setNewCompany]=useState("");
 const uid=session?.user.id||"";
 useEffect(()=>{setCompany(query.get("company")||"all");},[query]);

 const reload=useCallback(async()=>{
  const [inv,dep,co]=await Promise.all([
   pvosSupabase.rpc("pvos_invoice_list"),
   pvosSupabase.from("pvos_department_requests")
    .select("id,company_id,organization_id,request_type,department,details,external_reference,status,requester_user_id,reviewer_user_id,recipient_user_id,due_at,created_at,followup_count")
    .order("created_at",{ascending:false}).limit(750),
   pvosSupabase.from("pvos_companies").select("id,name,organization_id").order("name").limit(750)
  ]);
  if(inv.error)throw inv.error;
  if(dep.error)throw dep.error;
  if(co.error)throw co.error;
  const snapshot={invoices:inv.data||[],departments:dep.data||[],companies:co.data||[]};
  setPVOSCache(key,snapshot);
  setInvoices(snapshot.invoices);
  setDepartments(snapshot.departments);
  setCompanies(snapshot.companies);
  setLoading(false);
 },[key]);
 useEffect(()=>{
  if(!session||!organizationId)return;
  let active=true;
  const cached=getPVOSCache<Snapshot>(key);
  if(cached){
   setInvoices(cached.data.invoices);setDepartments(cached.data.departments);
   setCompanies(cached.data.companies);setLoading(false);
   if(!shouldRefreshPVOSCache(cached,15000))return;
  }else setLoading(true);
  setError("");
  reload().catch(e=>{if(active){setError((e as Error).message);setLoading(false);}});
  return ()=>{active=false;};
 },[session?.user.id,organizationId,reload,key]);
 useEffect(()=>{
  const onFocus=()=>{if(document.visibilityState==="visible"&&session)reload().catch(()=>{});};
  window.addEventListener("focus",onFocus);
  return ()=>window.removeEventListener("focus",onFocus);
 },[session?.user.id,reload]);

 const rows=useMemo<Row[]>(()=>{
  const labels=new Map(companies.map(c=>[c.id,c.name]));
  const invoiceRows:Row[]=invoices.map(i=>({
   key:"i:"+i.id,id:i.id,type:"invoice",companyId:i.company_id,companyName:i.company_name,
   name:i.title,detail:"Head → Finance → payment",reference:i.invoice_ref||"No reference",
   stage:invoiceStatus[i.status]||i.status,created:i.created_at,due:i.due_on,
   needsAction:invoiceNeeds(i,uid),complete:i.status==="paid",
   url:"/pvos/invoices?invoice="+encodeURIComponent(i.id)
  }));
  const departmentRows:Row[]=departments.map(d=>({
   key:"d:"+d.id,id:d.id,type:"department",companyId:d.company_id,
   companyName:labels.get(d.company_id)||"Company",
   name:(deptType[d.request_type]||"Department request")+" · "+d.department,
   detail:d.details,reference:d.external_reference||"No reference",
   stage:deptStatus[d.status]||d.status,created:d.created_at,due:d.due_at,
   needsAction:
    d.status==="draft"&&d.requester_user_id===uid ||
    d.status==="received"&&d.reviewer_user_id===uid ||
    d.status==="returned"&&d.requester_user_id===uid,
   complete:d.status==="complete"||d.status==="cancelled",
   url:"/pvos/requests/department?company="+encodeURIComponent(d.company_id)+"&request="+encodeURIComponent(d.id)
  }));
  return [...invoiceRows,...departmentRows].sort((a,b)=>b.created.localeCompare(a.created));
 },[invoices,departments,companies,uid]);
 const counts={
  all:rows.length,mine:rows.filter(x=>x.needsAction).length,complete:rows.filter(x=>x.complete).length
 };
 const visible=rows.filter(r=>
  (view==="all"||view==="mine"&&r.needsAction||view==="complete"&&r.complete) &&
  (type==="all"||r.type===type) && (company==="all"||r.companyId===company) &&
  [r.name,r.companyName,r.reference,r.detail,r.stage].join(" ").toLowerCase().includes(search.trim().toLowerCase())
 );
 function start(){
  if(!newCompany||!companies.some(c=>c.id===newCompany))return;
  setChooser(false);
  if(newType==="invoice")router.push("/pvos/invoices?company="+encodeURIComponent(newCompany));
  else router.push("/pvos/requests/department?company="+encodeURIComponent(newCompany)+"&new=1");
 }
 return <div className={styles.unifiedRequests}>
  <Header eyebrow="Workspace" title="Requests"
   sub="Track departmental information requests, invoice approvals and payment confirmations in one place."
   action={companies.length?<button type="button" className={styles.button} onClick={()=>{setNewCompany(company!=="all"?company:companies[0]?.id||"");setNewType("department");setChooser(true);}}>+ New request</button>:null}/>
  {error?<div className={styles.errorBox} role="alert">Unable to load requests: {error} <button className={styles.buttonGhost} onClick={()=>{setError("");setLoading(true);reload().catch(e=>{setError(e.message);setLoading(false);});}}>Retry</button></div>:null}
  <section className={styles.panel}>
   <div className={styles.sectionBody}>
    <div className={styles.requestUnifiedTabs} role="group" aria-label="Request status filter">
     {([{id:"all",label:"All requests",count:counts.all},{id:"mine",label:"Needs my action",count:counts.mine},{id:"complete",label:"Completed",count:counts.complete}] as const).map(v=>
      <button type="button" key={v.id} className={view===v.id?styles.requestUnifiedTabActive:styles.requestUnifiedTab}
       aria-pressed={view===v.id} onClick={()=>setView(v.id)}>{v.label} <span>{v.count}</span></button>
     )}
    </div>
    <div className={styles.requestUnifiedFilters}>
     <input className={styles.input} aria-label="Search all requests" placeholder="Search requests, invoices, references..." value={search} onChange={e=>setSearch(e.target.value)}/>
     <select className={styles.input} aria-label="Request type" value={type} onChange={e=>setType(e.target.value as typeof type)}>
      <option value="all">All types</option><option value="department">Department requests</option><option value="invoice">Invoice processing</option>
     </select>
     <select className={styles.input} aria-label="Company" value={company} onChange={e=>setCompany(e.target.value)}>
      <option value="all">All companies</option>
      {companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
     </select>
    </div>
   </div>
   <div className={styles.requestUnifiedHead}>
    <span>{loading||authLoading?"Loading requests...":visible.length+" request"+(visible.length===1?"":"s")}</span>
    <Help>Invoice processing routes approval through Head and Finance, then records payment completion. Department requests track information, documents, and external follow-ups. Both retain their own audit trails.</Help>
   </div>
   <div className={styles.requestUnifiedList}>
    {!loading&&!authLoading&&visible.length===0?<div className={styles.empty}>{rows.length===0?
     "No requests yet. Create a departmental request or start invoice processing.":
     "No requests match these filters."}</div>:
    visible.map(r=><Link className={styles.requestUnifiedRow} href={r.url} key={r.key}>
     <span className={styles.requestUnifiedMain}>
      <strong>{r.name}</strong>
      <span className={styles.requestUnifiedMeta}>
       {r.companyName} · {r.reference} · {r.type==="invoice"?"Invoice processing":"Department request"}
      </span>
      <span className={styles.requestUnifiedDescription}>{r.detail}</span>
     </span>
     <span className={styles.requestUnifiedEnd}>
      <Badge tone={tone(r)}>{r.stage}</Badge>
      {r.needsAction?<span className={styles.requestUnifiedAction}>Your action</span>:null}
      <span className={styles.requestUnifiedDate}>{r.due?"Due "+fmt(r.due):fmt(r.created)}</span>
     </span>
     <span className={styles.requestUnifiedArrow} aria-hidden="true">›</span>
    </Link>)}
   </div>
  </section>
  {chooser?<div className={styles.modalBackdrop} onMouseDown={e=>{if(e.currentTarget===e.target)setChooser(false);}}>
   <div className={styles.requestDialog} role="dialog" aria-modal="true" aria-labelledby="unified-create-title">
    <div className={styles.requestDialogHead}><div><h2 id="unified-create-title">New request</h2><span className={styles.muted}>Choose the workflow you want to start</span></div><button className={styles.modalClose} aria-label="Close" onClick={()=>setChooser(false)}>×</button></div>
    <div className={styles.requestUnifiedChooser}>
     <label>Company<select className={styles.input} value={newCompany} onChange={e=>setNewCompany(e.target.value)}>
      <option value="">Select company</option>{companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
     </select></label>
     <div className={styles.requestUnifiedChoices}>
      <button type="button" className={newType==="department"?styles.requestUnifiedChoiceSelected:styles.requestUnifiedChoice} onClick={()=>setNewType("department")} aria-pressed={newType==="department"}>
       <strong>Department request</strong>
       <span>Request a document, information or invoice from another department. Track follow-ups, evidence and review.</span>
      </button>
      <button type="button" className={newType==="invoice"?styles.requestUnifiedChoiceSelected:styles.requestUnifiedChoice} onClick={()=>setNewType("invoice")} aria-pressed={newType==="invoice"}>
       <strong>Invoice processing</strong>
       <span>Submit an invoice for Head approval, Finance approval and payment confirmation, with email notifications.</span>
      </button>
     </div>
     <div className={styles.requestDialogActions}>
      <button type="button" className={styles.buttonGhost} onClick={()=>setChooser(false)}>Cancel</button>
      <button type="button" className={styles.button} disabled={!newCompany} onClick={start}>Continue</button>
     </div>
    </div>
   </div>
  </div>:null}
 </div>;
}
