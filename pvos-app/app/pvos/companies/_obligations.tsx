"use client";

import Link from "next/link";
import {useCallback,useEffect,useMemo,useRef,useState,type FormEvent} from "react";
import {Badge,Help,Tabs} from "../_components";
import {pvosSupabase} from "../_pvos-supabase";
import styles from "../pvos.module.css";

type Obligation={
 id:string;company_id:string;product_id:string|null;activity_type:string;title:string;
 requirement_text:string|null;responsibility:string;owner_user_id:string|null;reviewer_user_id:string|null;
 cadence:string;cadence_config:Record<string,unknown>;evidence_required:boolean;active:boolean;
 source_type:string|null;source_reference:string|null;basis_confirmed:boolean;next_due_at:string|null;created_at:string;updated_at:string;
};
type Work={id:string;obligation_id:string|null;title:string;activity_type:string;status:string;
 due_at:string|null;completed_at:string|null;owner_user_id:string|null;reviewer_user_id:string|null;created_at:string};
type Evidence={id:string;task_id:string;title:string;evidence_type:string;created_at:string;file_path:string|null;external_url:string|null};
type Review={id:string;task_id:string;status:string;assigned_email:string;sent_at:string;decided_at:string|null};
type History={id:number;entity_type:string;entity_id:string|null;event_type:string;actor_user_id:string|null;before_data:Record<string,unknown>|null;after_data:Record<string,unknown>|null;created_at:string};
type Member={user_id:string;email:string;role:string};
type Product={id:string;brand_name:string;active_ingredient?:string|null};
type Draft={
 title:string;requirement_text:string;activity_type:string;product_id:string;source_type:string;source_reference:string;
 cadence:string;next_due_at:string;responsibility:string;owner_user_id:string;reviewer_user_id:string;
 evidence_required:boolean;active:boolean;basis_confirmed:boolean;
};
const cadenceOptions=[["daily","Daily"],["weekly","Weekly"],["monthly","Monthly"],["quarterly","Quarterly"],["semiannual","Every 6 months"],["annual","Annual"],["event","Event-triggered"]];
const sourceOptions=[["","Not documented"],["sfda","SFDA requirement"],["eurd","EURD / applicability decision"],["pva","PVA / SDEA"],["rmp","RMP commitment"],["sop","SOP / internal"],["contract","Contract scope"],["inquiry","Regulatory inquiry"],["manual","QPPV decision"],["template","Template (confirm basis)"],["other","Other"]];
const activityOptions=["Literature","Signal","RMP","PSUR/PBRER","PSSF","Reconciliation","Training","SOP","CAPA","SFDA Inquiry","Other"];
const cadenceLabel=(s:string)=>cadenceOptions.find(x=>x[0]===s)?.[1]||s;
const sourceLabel=(s:string|null)=>sourceOptions.find(x=>x[0]===(s||""))?.[1]||s||"Not documented";
const fmt=(d:string|null)=>d?new Intl.DateTimeFormat("en-GB",{day:"numeric",month:"short",year:"numeric",timeZone:"Asia/Riyadh"}).format(new Date(d)):"—";
const fmtStamp=(d:string)=>new Intl.DateTimeFormat("en-GB",{day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit",timeZone:"Asia/Riyadh"}).format(new Date(d));
const dateInput=(v:string|null)=>v?new Date(new Date(v).getTime()-new Date(v).getTimezoneOffset()*60000).toISOString().slice(0,16):"";
const defaultDue=()=>{const d=new Date();d.setDate(d.getDate()+30);return dateInput(d.toISOString());};
const blank=():Draft=>({
 title:"",requirement_text:"",activity_type:"Literature",product_id:"",source_type:"",source_reference:"",
 cadence:"monthly",next_due_at:defaultDue(),responsibility:"organization",owner_user_id:"",reviewer_user_id:"",
 evidence_required:true,active:true,basis_confirmed:false
});
const statusText=(s:string)=>({not_started:"Not started",in_progress:"In progress",awaiting_review:"Awaiting review",
 awaiting_external:"Waiting for input",complete:"Complete",cancelled:"Cancelled"} as Record<string,string>)[s]||s;
const roleText=(s:string)=>({organization:"Our organization",shared:"Shared",client:"Client"} as Record<string,string>)[s]||s;

export function CompanyObligations({
 companyId,organizationId,products,initialObligationId,active=true
}:{companyId:string;organizationId:string;products:Product[];initialObligationId?:string|null;active?:boolean}){
 const [obligations,setObligations]=useState<Obligation[]>([]);
 const [work,setWork]=useState<Work[]>([]),[evidence,setEvidence]=useState<Evidence[]>([]);
 const [reviews,setReviews]=useState<Review[]>([]),[audit,setAudit]=useState<History[]>([]);
 const [members,setMembers]=useState<Member[]>([]);
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
 const [error,setError]=useState(""),[message,setMessage]=useState("");
 const [search,setSearch]=useState(""),[showInactive,setShowInactive]=useState(false);
 const [selected,setSelected]=useState<string|null>(initialObligationId||null);
 const [detailTab,setDetailTab]=useState("requirement");
 const [editing,setEditing]=useState<string|null>(null),[modal,setModal]=useState(false),[draft,setDraft]=useState<Draft>(blank);
 const detailRef=useRef<HTMLDivElement>(null);
 const lastLoadedAt=useRef(0);
 const [revision,setRevision]=useState(0);

 const load=useCallback(async()=>{
  const [o,t,m,a,r]=await Promise.all([
   pvosSupabase.from("pvos_obligations").select("*").eq("company_id",companyId).order("title"),
   pvosSupabase.from("pvos_tasks").select("id,obligation_id,title,activity_type,status,due_at,completed_at,owner_user_id,reviewer_user_id,created_at")
    .eq("company_id",companyId).not("obligation_id","is",null).order("due_at",{ascending:false}).limit(900),
   pvosSupabase.rpc("pvos_member_directory",{p_organization_id:organizationId}),
   pvosSupabase.from("pvos_audit_events").select("id,entity_type,entity_id,event_type,actor_user_id,before_data,after_data,created_at")
    .eq("company_id",companyId).in("entity_type",["obligation","task"]).order("created_at",{ascending:false}).limit(800),
   pvosSupabase.from("pvos_task_reviews").select("id,task_id,status,assigned_email,sent_at,decided_at")
    .eq("company_id",companyId).order("sent_at",{ascending:false}).limit(600)
  ]);
  if(o.error||t.error||m.error||a.error||r.error)throw o.error||t.error||m.error||a.error||r.error;
  const workRows=(t.data||[]) as Work[];
  const ids=workRows.map(x=>x.id);
  let files:Evidence[]=[];
  if(ids.length){
   const result=await pvosSupabase.from("pvos_task_evidence").select("id,task_id,title,evidence_type,created_at,file_path,external_url")
    .in("task_id",ids).is("archived_at",null).order("created_at",{ascending:false}).limit(1000);
   if(result.error)throw result.error;
   files=(result.data||[]) as Evidence[];
  }
  setObligations((o.data||[]) as Obligation[]);setWork(workRows);setMembers((m.data||[]) as Member[]);
  setEvidence(files);setAudit((a.data||[]) as History[]);setReviews((r.data||[]) as Review[]);
  lastLoadedAt.current=Date.now();
  setLoading(false);
 },[companyId,organizationId]);

 useEffect(()=>{let active=true;setLoading(true);setError("");load().catch(e=>{if(active){setError((e as Error).message);setLoading(false);}});return ()=>{active=false;};},[load,revision]);
 useEffect(()=>{if(active&&lastLoadedAt.current&&Date.now()-lastLoadedAt.current>30000){void load().catch(e=>setError((e as Error).message));}},[active,load]);
 useEffect(()=>{if(initialObligationId)setSelected(initialObligationId);},[initialObligationId]);
 useEffect(()=>{if(selected&&detailRef.current)detailRef.current.scrollIntoView({behavior:"smooth",block:"nearest"});},[selected]);
 useEffect(()=>{if(!modal)return;const onKey=(e:KeyboardEvent)=>{if(e.key==="Escape"&&!busy)setModal(false);};window.addEventListener("keydown",onKey);return ()=>window.removeEventListener("keydown",onKey);},[modal,busy]);

 const productName=(id:string|null)=>id?products.find(p=>p.id===id)?.brand_name||"Unknown product":"Company-wide";
 const memberName=(id:string|null)=>id?members.find(m=>m.user_id===id)?.email||"Not in directory":"Unassigned";
 const byObligation=useMemo(()=>{
  const map=new Map<string,Work[]>();
  for(const t of work){if(!t.obligation_id)continue;const arr=map.get(t.obligation_id)||[];arr.push(t);map.set(t.obligation_id,arr);}
  return map;
 },[work]);
 const byTask=useMemo(()=>{
  const map=new Map<string,Evidence[]>();
  for(const f of evidence){const arr=map.get(f.task_id)||[];arr.push(f);map.set(f.task_id,arr);}return map;
 },[evidence]);
 const byReview=useMemo(()=>{
  const map=new Map<string,Review[]>();
  for(const r of reviews){const arr=map.get(r.task_id)||[];arr.push(r);map.set(r.task_id,arr);}return map;
 },[reviews]);
 const stats=(o:Obligation)=>{
  const tasks=byObligation.get(o.id)||[];
  const outstanding=tasks.filter(t=>t.status!=="complete"&&t.status!=="cancelled");
  const completed=tasks.filter(t=>t.status==="complete").sort((a,b)=>(b.completed_at||"").localeCompare(a.completed_at||""));
  const nextOutstanding=outstanding.filter(t=>t.due_at).sort((a,b)=>(a.due_at||"").localeCompare(b.due_at||""))[0]?.due_at||null;
  const due=nextOutstanding||o.next_due_at;
  const overdue=outstanding.some(t=>t.due_at&&new Date(t.due_at).getTime()<Date.now());
  const missing=completed.filter(t=>o.evidence_required&&!(byTask.get(t.id)||[]).length).length;
  const evidenceCount=tasks.reduce((n,t)=>n+(byTask.get(t.id)||[]).length,0);
  const pendingReviews=tasks.reduce((n,t)=>n+(byReview.get(t.id)||[]).filter(r=>r.status==="pending").length,0);
  return {tasks,outstanding,completed,nextOutstanding,due,overdue,missing,evidenceCount,pendingReviews};
 };
 const visible=obligations.filter(o=>(o.active||showInactive)&&[
  o.title,o.activity_type,productName(o.product_id),sourceLabel(o.source_type),o.source_reference||"",
  o.requirement_text||""
 ].join(" ").toLowerCase().includes(search.toLowerCase()));
 const current=obligations.find(o=>o.id===selected)||null;
 const curr=current?stats(current):null;

 function startCreate(){setEditing(null);setDraft({...blank(),owner_user_id:members.find(m=>m.role==="qppv")?.user_id||members[0]?.user_id||""});setError("");setMessage("");setModal(true);}
 function startEdit(o:Obligation){
  setEditing(o.id);setDraft({
   title:o.title,requirement_text:o.requirement_text||"",activity_type:o.activity_type,product_id:o.product_id||"",
   source_type:o.source_type||"",source_reference:o.source_reference||"",cadence:o.cadence,
   next_due_at:dateInput(o.next_due_at),responsibility:o.responsibility,owner_user_id:o.owner_user_id||"",
   reviewer_user_id:o.reviewer_user_id||"",evidence_required:o.evidence_required,active:o.active,basis_confirmed:o.basis_confirmed
  });
  setError("");setMessage("");setModal(true);
 }
 function update<K extends keyof Draft>(field:K,value:Draft[K]){setDraft(x=>({...x,[field]:value}));}
 async function save(e:FormEvent){
  e.preventDefault();setBusy(true);setError("");setMessage("");
  try{
   if(!draft.title.trim())throw new Error("Enter a requirement name.");
   if(draft.owner_user_id&&draft.reviewer_user_id&&draft.owner_user_id===draft.reviewer_user_id)throw new Error("Choose a different person for independent review.");
   if(draft.product_id&&!products.some(p=>p.id===draft.product_id))throw new Error("Choose a product registered to this company.");
   if(draft.owner_user_id&&!members.some(m=>m.user_id===draft.owner_user_id))throw new Error("Choose an owner from the company team.");
   if(draft.reviewer_user_id&&!members.some(m=>m.user_id===draft.reviewer_user_id))throw new Error("Choose a reviewer from the company team.");
   if(draft.cadence!=="event"&&!draft.next_due_at)throw new Error("Enter the next scheduled date.");
   if(draft.basis_confirmed&&(!draft.requirement_text.trim()||!draft.source_reference.trim()||!draft.source_type||draft.source_type==="template"))
    throw new Error("Record a specific non-template source, its reference and the rationale before confirming applicability.");
   const next=draft.cadence==="event"?null:new Date(draft.next_due_at).toISOString();
   const payload={
    company_id:companyId,title:draft.title.trim(),requirement_text:draft.requirement_text.trim()||null,
    activity_type:draft.activity_type,product_id:draft.product_id||null,
    source_type:draft.source_type||null,source_reference:draft.source_reference.trim()||null,
    cadence:draft.cadence,next_due_at:next,responsibility:draft.responsibility,
    owner_user_id:draft.owner_user_id||null,reviewer_user_id:draft.reviewer_user_id||null,
    evidence_required:draft.evidence_required,active:draft.active,basis_confirmed:draft.basis_confirmed
   };
   const result=editing?
    await pvosSupabase.from("pvos_obligations").update(payload).eq("id",editing).eq("company_id",companyId):
    await pvosSupabase.from("pvos_obligations").insert(payload);
   if(result.error)throw result.error;
   // The existing scheduler is authoritative; generated records are never reset or deleted.
   let generatedWarning="";
   if(draft.active&&draft.cadence!=="event"){
    const scheduled=await pvosSupabase.rpc("pvos_materialize_due_obligations",{horizon_days:30});
    if(scheduled.error)generatedWarning=" Saved, but upcoming work could not refresh: "+scheduled.error.message;
   }
   await load();
   setModal(false);setMessage((editing?"Obligation updated.":"Obligation created.")+
    " Existing work and audit history were retained."+generatedWarning);
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 const history=current?audit.filter(a=>a.entity_type==="obligation"&&a.entity_id===current.id||
  a.entity_type==="task"&&curr?.tasks.some(t=>t.id===a.entity_id)):[];

 return <div className={styles.obligationsWorkspace}>
  <section className={styles.panel}>
   <div className={styles.panelHeader}>
    <div><h2>Obligations</h2><div className={styles.muted} style={{marginTop:5}}>Requirements, assigned responsibility and linked operational records</div></div>
    <div className={styles.inlineActions} style={{marginTop:0}}>
     <Help>Each obligation is a standing requirement. Scheduled work is created from it and keeps its own reviews, evidence and audit history. A source must be confirmed before treating a template as a regulatory requirement.</Help>
     <button type="button" className={styles.button} onClick={startCreate}>+ New obligation</button>
    </div>
   </div>
   {message?<div className={styles.successBox} role="status" style={{margin:"12px 14px"}}>{message}</div>:null}
   {!modal&&error?<div className={styles.errorBox} role="alert" style={{margin:"12px 14px"}}>{error}</div>:null}
   <div className={styles.sectionBody}>
    <div className={styles.obligationFilters}>
     <input className={styles.input} aria-label="Search obligations" placeholder="Search obligations, products, sources..." value={search} onChange={e=>setSearch(e.target.value)}/>
     <label className={styles.obligationToggle}><input type="checkbox" checked={showInactive} onChange={e=>setShowInactive(e.target.checked)}/> Include inactive</label>
    </div>
   </div>
   <div className={styles.tableWrap}>
    <table className={styles.table} style={{minWidth:890}}>
     <thead><tr>
      <th>Obligation</th><th>Applies to</th><th>Basis</th><th>Frequency</th>
      <th>Next due</th><th>Work</th><th>Evidence</th><th>Execution</th>
     </tr></thead>
     <tbody>
      {visible.map(o=>{
       const s=stats(o);
       const label=!o.active?"Inactive":s.overdue?"Overdue":s.missing?"Evidence gap":s.pendingReviews?"In review":s.outstanding.length?"Pending work":s.completed.length?"Up to date":o.cadence==="event"?"Event-based":"Scheduled";
       const labelTone=s.overdue?"red":s.missing||s.pendingReviews?"amber":"default";
       return <tr key={o.id} className={selected===o.id?styles.obligationSelected:undefined}>
        <td><button className={styles.obligationLink} type="button" onClick={()=>{setSelected(o.id);setDetailTab("requirement");}}>{o.title}</button><div className={styles.muted}>{o.activity_type}</div></td>
        <td>{productName(o.product_id)}</td>
        <td><div className={styles.obligationBasis}><span>{sourceLabel(o.source_type)}</span>
          <Badge tone={o.basis_confirmed?"green":"amber"}>{o.basis_confirmed?"Confirmed":"Needs confirmation"}</Badge>
         </div></td>
        <td>{cadenceLabel(o.cadence)}</td>
        <td>{fmt(s.due)}{s.nextOutstanding?<div className={styles.muted}>Outstanding</div>:null}</td>
        <td><span>{s.outstanding.length} open</span><div className={styles.muted}>{s.completed.length} complete</div></td>
        <td>{s.evidenceCount} item{s.evidenceCount===1?"":"s"}
         {s.missing?<div className={styles.obligationGapInline}>{s.missing} missing</div>:null}
        </td>
        <td><Badge tone={labelTone}>{label}</Badge></td>
       </tr>;
      })}
     </tbody>
    </table>
    {!loading&&!visible.length?<div className={styles.empty}>No obligations match this view. Add a confirmed requirement or show inactive records.</div>:null}
    {loading?<div className={styles.empty}>Loading obligations and linked evidence…</div>:null}
   </div>
  </section>
  {current&&curr?<div ref={detailRef} className={styles.obligationDetail}>
   <section className={styles.panel}>
    <div className={styles.panelHeader}>
     <div><h2>{current.title}</h2><div className={styles.muted} style={{marginTop:5}}>{productName(current.product_id)} · {current.activity_type}</div></div>
     <div className={styles.inlineActions} style={{marginTop:0}}>
      <button type="button" className={styles.buttonGhost} onClick={()=>startEdit(current)}>Edit</button>
      <button type="button" className={styles.buttonGhost} onClick={()=>setSelected(null)}>Close</button>
     </div>
    </div>
    <div className={styles.sectionBody}>
     <Tabs label="Obligation details" value={detailTab} onChange={setDetailTab} items={[
      {id:"requirement",label:"Requirement"},{id:"schedule",label:"Schedule"},{id:"responsibility",label:"Responsibility"},
      {id:"work",label:"Generated work ("+curr.tasks.length+")"},{id:"evidence",label:"Evidence ("+curr.evidenceCount+")"},
      {id:"history",label:"History"}
     ]}/>
     {detailTab==="requirement"?<div className={styles.obligationFacts}>
      <div><span>Requirement</span><strong>{current.requirement_text||"Not yet documented"}</strong></div>
      <div><span>Applies to</span><strong>{productName(current.product_id)}</strong></div>
      <div><span>Source / basis</span><strong>{sourceLabel(current.source_type)}</strong></div>
      <div><span>Applicability</span><strong>{current.basis_confirmed?"Confirmed by QPPV":"Needs confirmation"}</strong></div>
      <div><span>Reference / applicability decision</span><strong>{current.source_reference||"Not yet documented"}</strong></div>
      {!current.basis_confirmed?<p className={styles.muted}>This is a scheduling record, not a confirmed regulatory obligation. Verify the applicable source and document the decision before confirming its basis.</p>:null}
     </div>:null}
     {detailTab==="schedule"?<div className={styles.obligationFacts}>
      <div><span>Frequency</span><strong>{cadenceLabel(current.cadence)}</strong></div>
      <div><span>Next outstanding deadline</span><strong>{fmt(curr.nextOutstanding)}</strong></div>
      <div><span>Next scheduled generation</span><strong>{fmt(current.next_due_at)}</strong></div>
      <div><span>Last completed</span><strong>{fmt(curr.completed[0]?.completed_at||null)}</strong></div>
      <div><span>Work already generated</span><strong>{curr.tasks.length}</strong></div>
      <div><span>Outstanding activities</span><strong>{curr.outstanding.length}</strong></div>
      <div><span>State</span><strong>{current.active?"Active":"Inactive — no new work generated"}</strong></div>
      <p className={styles.muted}>Next scheduled generation is advanced by PVOS after upcoming work is created. Earlier unfinished activities remain visible and are not marked complete automatically.</p>
     </div>:null}
     {detailTab==="responsibility"?<div className={styles.obligationFacts}>
      <div><span>Responsible party</span><strong>{roleText(current.responsibility)}</strong></div>
      <div><span>Named owner</span><strong>{memberName(current.owner_user_id)}</strong></div>
      <div><span>Named reviewer</span><strong>{memberName(current.reviewer_user_id)}</strong></div>
      <div><span>Evidence required</span><strong>{current.evidence_required?"Yes":"No"}</strong></div>
      <p className={styles.muted}>Changes to assignments apply to newly generated work. Existing work keeps its assigned owner and reviewer unless changed on that record.</p>
     </div>:null}
     {detailTab==="work"?<>
      {curr.tasks.length?<div className={styles.tableWrap}><table className={styles.table}>
       <thead><tr><th>Operational record</th><th>Owner</th><th>Reviewer</th><th>Deadline</th><th>Status</th><th>Evidence</th></tr></thead>
       <tbody>{[...curr.tasks].sort((a,b)=>(b.due_at||b.created_at).localeCompare(a.due_at||a.created_at)).slice(0,150).map(t=>
        <tr key={t.id}><td><Link href={"/pvos/tasks/"+t.id}>{t.title}</Link></td><td>{memberName(t.owner_user_id)}</td>
        <td>{memberName(t.reviewer_user_id)}</td><td>{fmt(t.due_at)}</td>
        <td>{statusText(t.status)}</td><td>{(byTask.get(t.id)||[]).length}</td></tr>)}</tbody>
      </table></div>:<div className={styles.empty}>No operational records yet. Event-triggered obligations do not automatically create recurring work.</div>}
     </>:null}
     {detailTab==="evidence"?<>
      {curr.missing?<p className={styles.obligationGap}>{curr.missing} completed activit{curr.missing===1?"y is":"ies are"} missing evidence.</p>:null}
      {curr.pendingReviews?<p className={styles.obligationGap}>{curr.pendingReviews} pending independent review{curr.pendingReviews===1?"":"s"}.</p>:null}
      {curr.evidenceCount?<div className={styles.obligationEvidence}>
       {[...curr.tasks].flatMap(t=>(byTask.get(t.id)||[]).map(f=>({f,t}))).sort((a,b)=>b.f.created_at.localeCompare(a.f.created_at)).slice(0,120).map(({f,t})=>
        <Link key={f.id} href={"/pvos/tasks/"+t.id+"#evidence"} className={styles.obligationEvidenceItem}>
         <strong>{f.title}</strong><span>{t.title} · {fmtStamp(f.created_at)} · Open evidence →</span>
        </Link>)}
      </div>:<div className={styles.empty}>No evidence recorded against generated work yet. Evidence is managed on each operational record.</div>}
     </>:null}
     {detailTab==="history"?<div className={styles.obligationHistory}>
      {history.slice(0,100).map(event=>{
       const before=event.before_data,after=event.after_data;
       const schedulerOnly=event.entity_type==="obligation"&&event.event_type==="update"&&before&&after&&
        Object.keys(after).every(k=>k==="next_due_at"||JSON.stringify(after[k])===JSON.stringify(before[k]));
       return <div className={styles.obligationHistoryItem} key={event.id}>
        <div><strong>{schedulerOnly?"Next scheduled date advanced":event.entity_type==="obligation"?
         event.event_type==="insert"?"Obligation created":event.event_type==="update"?"Obligation updated":"Obligation changed":
         "Work "+event.event_type.replaceAll("_"," ")}</strong><span>{fmtStamp(event.created_at)}</span></div>
        <span>{memberName(event.actor_user_id)}</span>
       </div>;
      })}
      {!history.length?<div className={styles.empty}>No history entries recorded.</div>:null}
     </div>:null}
    </div>
   </section>
  </div>:null}
  {modal?<div className={styles.modalBackdrop} onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)setModal(false);}}>
   <div className={styles.modalCard} role="dialog" aria-modal="true" aria-labelledby="obligation-form-title" style={{maxWidth:790,maxHeight:"calc(100vh - 50px)",overflowY:"auto"}}>
    <div className={styles.modalHeader}>
     <div><div className={styles.eyebrow}>Company obligations</div><h2 id="obligation-form-title">{editing?"Edit obligation":"New obligation"}</h2></div>
     <button className={styles.modalClose} type="button" aria-label="Close" onClick={()=>setModal(false)} disabled={busy}>×</button>
    </div>
    <form onSubmit={save}>
     <div className={styles.formGrid}>
      <label className={styles.full}>Obligation<input className={styles.input} required maxLength={220} value={draft.title} onChange={e=>update("title",e.target.value)} placeholder="e.g. Monthly literature screening"/></label>
      <label>Activity<select className={styles.input} value={draft.activity_type} onChange={e=>update("activity_type",e.target.value)}>
       {[...new Set([...activityOptions,draft.activity_type])].map(x=><option key={x}>{x}</option>)}</select></label>
      <label>Product<select className={styles.input} value={draft.product_id} onChange={e=>update("product_id",e.target.value)}>
       <option value="">Company-wide</option>{products.map(p=><option key={p.id} value={p.id}>{p.brand_name}</option>)}</select></label>
      <label className={styles.full}>Why is this activity required?<textarea className={styles.input} rows={2} maxLength={4000} value={draft.requirement_text} onChange={e=>{update("requirement_text",e.target.value);update("basis_confirmed",false);}} placeholder="Short requirement or applicability rationale"/></label>
      <label>Source / basis<select className={styles.input} value={draft.source_type} onChange={e=>{update("source_type",e.target.value);update("basis_confirmed",false);}}>
       {[...sourceOptions,...(draft.source_type&&!sourceOptions.some(s=>s[0]===draft.source_type)?[[draft.source_type,draft.source_type]]:[])].map(x=><option value={x[0]} key={x[0]}>{x[1]}</option>)}
      </select></label>
      <label>Source reference<input className={styles.input} maxLength={500} value={draft.source_reference} onChange={e=>{update("source_reference",e.target.value);update("basis_confirmed",false);}} placeholder="SOP ID, agreement, SFDA reference, decision"/></label>
      <label>Cadence<select className={styles.input} value={draft.cadence} onChange={e=>update("cadence",e.target.value)}>{cadenceOptions.map(x=><option key={x[0]} value={x[0]}>{x[1]}</option>)}</select></label>
      {draft.cadence!=="event"?<label>Next scheduled date<input className={styles.input} type="datetime-local" required value={draft.next_due_at} onChange={e=>update("next_due_at",e.target.value)}/></label>:<label>Schedule<input className={styles.input} disabled value="Triggered manually"/></label>}
      <label>Responsible party<select className={styles.input} value={draft.responsibility} onChange={e=>update("responsibility",e.target.value)}>
       <option value="organization">Our organization</option><option value="client">Client</option><option value="shared">Shared</option></select></label>
      <label>Owner<select className={styles.input} value={draft.owner_user_id} onChange={e=>update("owner_user_id",e.target.value)}>
       <option value="">Unassigned</option>{members.map(m=><option key={m.user_id} value={m.user_id}>{m.email}</option>)}</select></label>
      <label>Independent reviewer<select className={styles.input} value={draft.reviewer_user_id} onChange={e=>update("reviewer_user_id",e.target.value)}>
       <option value="">Not assigned</option>{members.map(m=><option key={m.user_id} value={m.user_id}>{m.email}</option>)}</select></label>
      <div className={styles.obligationChecks}>
       <label><input type="checkbox" checked={draft.evidence_required} onChange={e=>update("evidence_required",e.target.checked)}/> Evidence required</label>
       <label title="Only confirm after checking the source, reference and applicability rationale"><input type="checkbox" checked={draft.basis_confirmed}
        disabled={!draft.requirement_text.trim()||!draft.source_reference.trim()||!draft.source_type||draft.source_type==="template"}
        onChange={e=>update("basis_confirmed",e.target.checked)}/> Confirmed basis</label>
       <label><input type="checkbox" checked={draft.active} onChange={e=>update("active",e.target.checked)}/> Active</label>
      </div>
     </div>
     <p className={styles.muted} style={{margin:"12px 0"}}>Updates change future scheduling; previously generated activities, evidence, approvals and history are preserved.</p>
     {error?<div className={styles.errorBox} role="alert" style={{marginTop:12}}>{error}</div>:null}
     <div className={styles.modalActions}>
      <button type="button" className={styles.buttonGhost} disabled={busy} onClick={()=>setModal(false)}>Cancel</button>
      <button type="submit" className={styles.button} disabled={busy}>{busy?"Saving…":editing?"Save changes":"Create obligation"}</button>
     </div>
    </form>
   </div>
  </div>:null}
 </div>;
}
