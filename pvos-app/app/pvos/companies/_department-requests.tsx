"use client";

import Link from "next/link";
import {useCallback,useEffect,useMemo,useState,type FormEvent} from "react";
import {Badge,Help} from "../_components";
import {pvosSupabase} from "../_pvos-supabase";
import styles from "../pvos.module.css";

type RequestRow={
 id:string;company_id:string;product_id:string|null;task_id:string;request_type:string;department:string;
 recipient_user_id:string|null;recipient_email:string|null;requester_user_id:string;reviewer_user_id:string|null;
 details:string;external_reference:string|null;status:string;response_note:string|null;decision_note:string|null;
 last_return_reason:string|null;last_returned_at:string|null;approved_evidence_id:string|null;
 followup_count:number;last_followup_at:string|null;due_at:string;created_at:string;received_at:string|null;
};
type Member={user_id:string;email:string;role:string};
type Evidence={id:string;title:string;created_at:string;file_path:string|null;external_url:string|null;evidence_type:string;archived_at:string|null};
type History={id:number;created_at:string;event_type:string;actor_user_id:string|null;metadata:Record<string,unknown>|null};
const types=[["invoice","Invoice"],["regulatory_history","Registration history"],["safety_data","Safety / case data"],["labelling","Label / PIL"],["document","Controlled document"],["other","Information request"]];
const labelType=(v:string)=>types.find(x=>x[0]===v)?.[1]||v;
const date=(s:string)=>new Intl.DateTimeFormat("en-GB",{day:"numeric",month:"short",year:"numeric",timeZone:"Asia/Riyadh"}).format(new Date(s));
const stamp=(s:string)=>new Intl.DateTimeFormat("en-GB",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit",timeZone:"Asia/Riyadh"}).format(new Date(s));
const docNeeded=(r:RequestRow)=>["invoice","document","labelling"].includes(r.request_type);
const auditName=(v:string)=>({
 created:"Created",mark_requested:"Request sent (recorded)",follow_up:"Follow-up logged",
 mark_received:"Response received",return:"Returned for corrections",resend:"Corrections requested",
 reviewer_assigned:"Reviewer assigned",approve:"Approved",cancel:"Cancelled"
} as Record<string,string>)[v]||v.replaceAll("_"," ");
function statusFor(r:RequestRow,documents:Evidence[]|undefined=undefined){
 if(r.status==="complete")return "Complete";
 if(r.status==="cancelled")return "Cancelled";
 if(r.status==="draft")return "Draft";
 if(r.status==="waiting")return "Waiting for department";
 if(r.status==="returned")return "Corrections needed";
 if(r.status==="received"){
   if(!r.reviewer_user_id)return "Reviewer needed";
   if(documents&&docNeeded(r)&&!documents.some(e=>(e.file_path||e.external_url)&&(!r.last_returned_at||new Date(e.created_at)>new Date(r.last_returned_at))))return "Evidence needed";
   return "Ready for review";
 }
 return r.status;
}
const toneFor=(status:string):"default"|"green"|"amber"|"red"=>status==="Complete"?"green":status==="Corrections needed"?"red":status==="Waiting for department"?"amber":status==="Ready for review"?"green":"default";
function isOverdue(r:RequestRow){return !["complete","cancelled"].includes(r.status)&&new Date(r.due_at).getTime()<Date.now();}
export function DepartmentRequests({companyId,organizationId,products,onChanged}:{companyId:string;organizationId:string;products:any[];onChanged?:()=>void}){
 const [rows,setRows]=useState<RequestRow[]>([]),[members,setMembers]=useState<Member[]>([]),[currentUser,setCurrentUser]=useState("");
 const [openCreate,setOpenCreate]=useState(false),[opened,setOpened]=useState<string|null>(null),[advanced,setAdvanced]=useState(false);
 const [evidence,setEvidence]=useState<Evidence[]>([]),[history,setHistory]=useState<History[]>([]);
 const [busy,setBusy]=useState(false),[detailsBusy,setDetailsBusy]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState("");
 const [search,setSearch]=useState(""),[filter,setFilter]=useState("open");
 const [type,setType]=useState("invoice"),[department,setDepartment]=useState("Finance"),[product,setProduct]=useState("");
 const [recipient,setRecipient]=useState(""),[email,setEmail]=useState(""),[reviewer,setReviewer]=useState("");
 const [details,setDetails]=useState(""),[reference,setReference]=useState(""),[due,setDue]=useState("");
 const [actionNote,setActionNote]=useState(""),[reviewerAssignment,setReviewerAssignment]=useState("");
 const [selectedEvidence,setSelectedEvidence]=useState("");
 const [revision,setRevision]=useState(0);
 const current=rows.find(r=>r.id===opened)||null;
 const memberName=(id:string|null)=>members.find(m=>m.user_id===id)?.email||"Not assigned";
 const load=useCallback(async()=>{
  const [r,m,u]=await Promise.all([
   pvosSupabase.from("pvos_department_requests").select("*").eq("organization_id",organizationId).eq("company_id",companyId).order("created_at",{ascending:false}),
   pvosSupabase.rpc("pvos_member_directory",{p_organization_id:organizationId}),
   pvosSupabase.auth.getUser()
  ]);
  if(r.error||m.error)throw r.error||m.error;
  setRows(r.data||[]);setMembers(m.data||[]);setCurrentUser(u.data.user?.id||"");
 },[organizationId,companyId]);
 const loadDetail=useCallback(async(row:RequestRow)=>{
  setDetailsBusy(true);
  const [e,h]=await Promise.all([
   pvosSupabase.from("pvos_task_evidence").select("id,title,created_at,file_path,external_url,evidence_type,archived_at").eq("task_id",row.task_id).is("archived_at",null).order("created_at",{ascending:false}),
   pvosSupabase.from("pvos_audit_events").select("id,created_at,event_type,actor_user_id,metadata").eq("entity_type","department_request").eq("entity_id",row.id).order("created_at",{ascending:false}).limit(100)
  ]);
  setDetailsBusy(false);
  if(e.error||h.error)throw e.error||h.error;
  setEvidence(e.data||[]);setHistory(h.data||[]);
 },[]);
 useEffect(()=>{load().catch(e=>setError(e.message));},[load]);
 useEffect(()=>{
  if(!openCreate&&!opened)return;
  const onKey=(e:KeyboardEvent)=>{if(e.key==="Escape"){setOpenCreate(false);setOpened(null);}};
  window.addEventListener("keydown",onKey);
  return ()=>window.removeEventListener("keydown",onKey);
 },[openCreate,opened]);
 useEffect(()=>{if(opened){const r=rows.find(x=>x.id===opened);if(r)loadDetail(r).catch(e=>setError(e.message));}},[opened,revision,loadDetail]);
 const filtered=useMemo(()=>rows.filter(r=>{
  const matches=filter==="all"||filter==="open"&&!["complete","cancelled"].includes(r.status)||filter==="complete"&&r.status==="complete";
  return matches&&[labelType(r.request_type),r.department,r.details,r.external_reference||""].join(" ").toLowerCase().includes(search.trim().toLowerCase());
 }),[rows,filter,search]);
 const counts={waiting:rows.filter(r=>r.status==="waiting").length,review:rows.filter(r=>r.status==="received").length,overdue:rows.filter(isOverdue).length};
 const detailsStatus=current?statusFor(current,evidence):"";
 const eligibleEvidence=current?evidence.filter(e=>(!docNeeded(current)||e.file_path||e.external_url)&&(!current.last_returned_at||new Date(e.created_at)>new Date(current.last_returned_at))):[];
 const latest=eligibleEvidence[0];
 function resetModal(){
  setOpenCreate(false);setAdvanced(false);setType("invoice");setDepartment("Finance");setProduct("");setRecipient("");setEmail("");setReviewer("");setDetails("");setReference("");setDue("");
 }
 function showRequest(r:RequestRow){
  setError("");setMessage("");setActionNote("");setSelectedEvidence("");setReviewerAssignment("");
  setEvidence([]);setHistory([]);setOpened(r.id);setRevision(v=>v+1);
 }
 async function create(e:FormEvent){
  e.preventDefault();setBusy(true);setError("");setMessage("");
  try{
   const {data,error:e2}=await pvosSupabase.rpc("pvos_new_department_request",{
    p_company_id:companyId,p_product_id:product||null,p_request_type:type,p_department:department.trim(),
    p_recipient_user_id:recipient||null,p_recipient_email:email.trim()||null,p_reviewer_user_id:reviewer||null,
    p_details:details.trim(),p_reference:reference.trim()||null,p_due_date:due
   });
   if(e2)throw e2;
   await load();onChanged?.();resetModal();setFilter("open");setSearch("");
   setMessage("Request created. Mark it requested after contacting the department; no email was sent.");
   if(data?.request_id){setOpened(data.request_id);setRevision(v=>v+1);}
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 async function act(action:string){
  if(!current)return;
  const id=current.id;setBusy(true);setError("");setMessage("");
  try{
   const {error:e}=action==="approve"
    ?await pvosSupabase.rpc("pvos_approve_department_request",{p_request_id:id,p_evidence_id:selectedEvidence||null,p_note:actionNote.trim()||null})
    :await pvosSupabase.rpc("pvos_act_department_request",{p_request_id:id,p_action:action,p_note:actionNote.trim()||null});
   if(e)throw e;
   setActionNote("");setSelectedEvidence("");
   setMessage(action==="follow_up"?"Follow-up recorded. No email was sent.":action==="approve"?"Approved with the selected document version.":"Request updated; linked task synchronized.");
   await load();setRevision(v=>v+1);onChanged?.();
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 async function assignReviewer(){
  if(!current||!reviewerAssignment)return;
  setBusy(true);setError("");setMessage("");
  try{
   const {error:e}=await pvosSupabase.rpc("pvos_assign_department_reviewer",{p_request_id:current.id,p_reviewer_id:reviewerAssignment});
   if(e)throw e;
   setMessage("Independent reviewer assigned.");setReviewerAssignment("");await load();setRevision(v=>v+1);onChanged?.();
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 const approvedTitle=current&&evidence.find(e=>e.id===current.approved_evidence_id)?.title;
 return <div className={styles.requestWorkspace}>
  <section className={styles.panel}>
   <div className={styles.panelHeader}>
    <div><h2>Requests</h2><div className={styles.muted} style={{marginTop:5}}>Track information, documents and invoices across departments</div></div>
    <div className={styles.inlineActions} style={{marginTop:0}}>
     <Help>Mark requested and follow-ups record external communication only; they do not send email. Reviewer approval is independent and evidence-linked.</Help>
     <button type="button" className={styles.button} onClick={()=>{setError("");setMessage("");setOpenCreate(true);}}>+ New request</button>
    </div>
   </div>
   <div className={styles.sectionBody}>
    <div className={styles.requestSummary}>
     <div><span>Waiting</span><strong>{counts.waiting}</strong></div>
     <div><span>For review</span><strong>{counts.review}</strong></div>
     <div><span>Overdue</span><strong>{counts.overdue}</strong></div>
    </div>
    <div className={styles.requestFilters}>
     <input aria-label="Search requests" className={styles.input} placeholder="Search requests..." value={search} onChange={e=>setSearch(e.target.value)}/>
     <select aria-label="Filter requests" className={styles.input} value={filter} onChange={e=>setFilter(e.target.value)}>
      <option value="open">Open</option><option value="complete">Completed</option><option value="all">All requests</option>
     </select>
    </div>
    <div className={styles.requestList}>
     {filtered.length?filtered.map(r=>{
      const title=r.request_type==="invoice"?"Invoice":labelType(r.request_type);
      const status=statusFor(r);
      return <button type="button" key={r.id} className={styles.requestListRow} onClick={()=>showRequest(r)}>
       <span className={styles.requestRowName}><strong>{title} <span className={styles.requestRowDot}>·</span> {r.department}</strong>
        <span>{r.external_reference||r.details} · Due {date(r.due_at)}{r.followup_count?" · "+r.followup_count+" follow-up"+(r.followup_count===1?"":"s"):""}</span>
       </span>
       <span className={styles.requestRowEnd}>{isOverdue(r)?<Badge tone="red">Overdue</Badge>:null}<Badge tone={toneFor(status)}>{status}</Badge><span aria-hidden="true">›</span></span>
      </button>;
     }):<div className={styles.empty}>{rows.length?"No requests match these filters.":"No requests yet. Create your first departmental request."}</div>}
    </div>
   </div>
  </section>
  {!opened&&message?<div className={styles.successBox} role="status">{message}</div>:null}
  {!opened&&!openCreate&&error?<div className={styles.errorBox} role="alert">{error}</div>:null}

  {openCreate?<div className={styles.modalBackdrop} onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)setOpenCreate(false);}}>
   <div className={styles.requestDialog} role="dialog" aria-modal="true" aria-labelledby="pvos-create-request">
    <div className={styles.requestDialogHead}>
     <div><h2 id="pvos-create-request">New request</h2><span className={styles.muted}>Request information or documents from a department</span></div>
     <button type="button" className={styles.modalClose} aria-label="Close new request" disabled={busy} onClick={()=>setOpenCreate(false)}>×</button>
    </div>
    <form onSubmit={create} className={styles.requestForm}>
     <div className={styles.formGrid}>
      <label>Request type<select className={styles.input} value={type} onChange={e=>{setType(e.target.value);if(e.target.value==="invoice")setDepartment("Finance");}}>{types.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
      <label>Department<input className={styles.input} required maxLength={100} placeholder="Finance / Regulatory / Medical" value={department} onChange={e=>setDepartment(e.target.value)}/></label>
      <label>Contact email (optional)<input className={styles.input} type="email" placeholder="finance@example.com" value={email} onChange={e=>setEmail(e.target.value)}/></label>
      <label>Due date<input className={styles.input} type="date" required value={due} onChange={e=>setDue(e.target.value)}/></label>
     </div>
     <label className={styles.requestField}>What do you need?<textarea className={styles.input} rows={3} required minLength={4} value={details} onChange={e=>setDetails(e.target.value)} placeholder="e.g. Provide the October PV service invoice for the company records"/></label>
     <button type="button" className={styles.requestAdvancedToggle} aria-expanded={advanced} onClick={()=>setAdvanced(x=>!x)}>{advanced?"− Hide optional details":"+ Optional details"}</button>
     {advanced?<div className={styles.formGrid}>
      <label>Product<select className={styles.input} value={product} onChange={e=>setProduct(e.target.value)}><option value="">Company-wide</option>{products.map(p=><option key={p.id} value={p.id}>{p.brand_name}</option>)}</select></label>
      <label>Reference<input className={styles.input} value={reference} onChange={e=>setReference(e.target.value)} placeholder="Invoice / request reference"/></label>
      <label>Internal recipient<select className={styles.input} value={recipient} onChange={e=>setRecipient(e.target.value)}><option value="">External department</option>{members.map(m=><option key={m.user_id} value={m.user_id}>{m.email}</option>)}</select></label>
      <label>Independent reviewer<select className={styles.input} value={reviewer} onChange={e=>setReviewer(e.target.value)}><option value="">Assign later</option>{members.filter(m=>m.user_id!==currentUser).map(m=><option key={m.user_id} value={m.user_id}>{m.email}</option>)}</select></label>
     </div>:null}
     <div className={styles.muted}>Creating a request does not email the department. You'll record when it has been sent.</div>
     {error?<div className={styles.errorBox} role="alert">{error}</div>:null}
     <div className={styles.requestDialogActions}><button type="button" className={styles.buttonGhost} disabled={busy} onClick={()=>setOpenCreate(false)}>Cancel</button><button type="submit" className={styles.button} disabled={busy}>{busy?"Creating...":"Create request"}</button></div>
    </form>
   </div>
  </div>:null}

  {current?<div className={styles.requestDrawerBackdrop} onMouseDown={e=>{if(e.target===e.currentTarget)setOpened(null);}}>
   <div className={styles.requestDrawer} role="dialog" aria-modal="true" aria-labelledby="pvos-request-detail">
    <div className={styles.requestDrawerHeader}>
     <div><div className={styles.muted}>Departmental request</div><h2 id="pvos-request-detail">{labelType(current.request_type)} · {current.department}</h2></div>
     <button type="button" className={styles.modalClose} aria-label="Close request details" onClick={()=>{setOpened(null);setMessage("");setError("");}}>×</button>
    </div>
    <div className={styles.requestDrawerBody}>
     <div className={styles.requestStatusLine}><Badge tone={toneFor(detailsStatus)}>{detailsStatus}</Badge><span className={styles.muted}>Due {date(current.due_at)}</span></div>
     <p className={styles.requestDescription}>{current.details}</p>
     {current.last_return_reason&&current.status!=="complete"?<div className={styles.requestReturnReason}><strong>Corrections requested</strong><p>{current.last_return_reason}</p><span className={styles.muted}>Reviewer feedback · {current.last_returned_at?stamp(current.last_returned_at):"previous review"}</span></div>:null}
     <div className={styles.requestMeta}>
      {current.external_reference?<div><span>Reference</span><strong>{current.external_reference}</strong></div>:null}
      <div><span>Contact</span><strong>{current.recipient_user_id?memberName(current.recipient_user_id):current.recipient_email||"External / not recorded"}</strong></div>
      <div><span>Reviewer</span><strong>{memberName(current.reviewer_user_id)}</strong></div>
      <div><span>Follow-ups</span><strong>{current.followup_count}</strong></div>
     </div>
     {!current.reviewer_user_id&&!["complete","cancelled"].includes(current.status)&&currentUser===current.requester_user_id?<div className={styles.requestDetailSection}>
      <h3>Assign independent reviewer</h3>
      <div className={styles.requestActionRow}>
       <select className={styles.input} aria-label="Select independent reviewer" value={reviewerAssignment} onChange={e=>setReviewerAssignment(e.target.value)}>
        <option value="">Select team member</option>{members.filter(m=>m.user_id!==current.requester_user_id).map(m=><option key={m.user_id} value={m.user_id}>{m.email}</option>)}
       </select>
       <button className={styles.buttonGhost} disabled={busy||!reviewerAssignment} onClick={assignReviewer}>Assign</button>
      </div>
      {!members.some(m=>m.user_id!==current.requester_user_id)?<span className={styles.muted}>Add a second member to this workspace before approving.</span>:null}
     </div>:null}
     <section className={styles.requestDetailSection}>
      <div className={styles.requestSectionHead}><h3>Documents & evidence</h3><button className={styles.requestTextButton} type="button" disabled={detailsBusy} onClick={()=>setRevision(v=>v+1)}>Refresh</button></div>
      {detailsBusy?<p className={styles.muted}>Loading evidence...</p>:evidence.length?evidence.map((e,i)=><div className={styles.requestEvidence} key={e.id}>
       <div><strong>{e.title}</strong><span className={styles.muted}>{stamp(e.created_at)}{i===0?" · Latest":""}{e.id===current.approved_evidence_id?" · Approved version":""}</span></div>
      </div>):<p className={styles.muted}>No evidence attached yet.</p>}
      <Link className={styles.buttonGhost} href={"/pvos/tasks/"+current.task_id+"#evidence"}>Open documents & evidence ↗</Link>
     </section>
     {current.status==="received"&&currentUser===current.reviewer_user_id?<section className={styles.requestDetailSection}>
      <h3>Review evidence</h3>
      {detailsBusy?<div className={styles.muted}>Loading documents...</div>:!latest?<div className={styles.requestReturnReason}>No eligible evidence is available. {current.last_returned_at?"Upload a new document after the latest return.":"Add a document before approving."}</div>:<label className={styles.requestField}>Document version to approve
       <select className={styles.input} value={selectedEvidence} onChange={e=>setSelectedEvidence(e.target.value)}>
        <option value="">Select the version you actually reviewed</option>
        {eligibleEvidence.map(e=><option key={e.id} value={e.id}>{e.title}{e.id===latest.id?" · Latest":""} · {stamp(e.created_at)}</option>)}
       </select>
       <span className={styles.muted}>Only the newest eligible version can be approved. After a return, it must be newly attached.</span>
      </label>}
     </section>:null}
     {current.status==="complete"&&current.approved_evidence_id?<div className={styles.requestApproved}><strong>Approved evidence</strong><div>{approvedTitle||"Evidence reference: "+current.approved_evidence_id}</div>{current.decision_note?<p className={styles.muted}>{current.decision_note}</p>:null}</div>:null}
     {!["complete","cancelled"].includes(current.status)?<section className={styles.requestDetailSection}>
      <h3>Next action</h3>
      <label className={styles.requestField}>Note / reason
       <textarea className={styles.input} rows={2} value={actionNote} onChange={e=>setActionNote(e.target.value)} placeholder={current.status==="received"?"Review decision or explanation":current.status==="waiting"?"Follow-up or receipt details":"Describe the action"}/>
      </label>
      <div className={styles.requestActionRow}>
       {current.status==="draft"?<button className={styles.button} disabled={busy} onClick={()=>act("mark_requested")}>Mark requested</button>:null}
       {current.status==="waiting"?<><button className={styles.buttonGhost} disabled={busy} onClick={()=>act("follow_up")}>Log follow-up</button><button className={styles.button} disabled={busy||actionNote.trim().length<4} onClick={()=>act("mark_received")}>Mark received</button></>:null}
       {current.status==="returned"?<button className={styles.button} disabled={busy||actionNote.trim().length<4} onClick={()=>act("resend")}>Request corrections</button>:null}
       {current.status==="received"&&currentUser===current.reviewer_user_id?<><button className={styles.button} disabled={busy||detailsBusy||!selectedEvidence||selectedEvidence!==latest?.id} onClick={()=>act("approve")}>Approve selected version</button><button className={styles.buttonGhost} disabled={busy||actionNote.trim().length<4} onClick={()=>act("return")}>Return for corrections</button></>:null}
       {["draft","waiting"].includes(current.status)?<button className={styles.buttonGhost} disabled={busy} onClick={()=>act("cancel")}>Cancel request</button>:null}
      </div>
      {current.status==="received"&&currentUser!==current.reviewer_user_id?<p className={styles.muted}>This request awaits independent review. Only the assigned reviewer can approve or return it.</p>:null}
      {current.status==="waiting"?<p className={styles.muted}>Follow-up and receipt actions log communication; no emails are sent.</p>:null}
     </section>:null}
     {message?<div className={styles.successBox} role="status">{message}</div>:null}
     {error?<div className={styles.errorBox} role="alert">{error}</div>:null}
     <section className={styles.requestDetailSection}>
      <h3>Activity history</h3>
      {detailsBusy?<p className={styles.muted}>Loading activity...</p>:history.length?<div className={styles.requestHistory}>
       {history.map(h=><div key={h.id} className={styles.requestHistoryItem}><span className={styles.muted}>{stamp(h.created_at)}</span><div><strong>{auditName(h.event_type)}</strong>{typeof h.metadata?.note==="string"&&h.metadata.note.trim()?<p>{h.metadata.note}</p>:null}{typeof h.metadata?.approved_evidence_title==="string"?<p>Evidence: {h.metadata.approved_evidence_title}</p>:null}<span className={styles.muted}>{memberName(h.actor_user_id)}</span></div></div>)}
      </div>:<p className={styles.muted}>No activity yet.</p>}
     </section>
    </div>
   </div>
  </div>:null}
 </div>;
}
