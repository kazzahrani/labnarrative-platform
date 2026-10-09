"use client";

import Link from "next/link";
import {useCallback,useEffect,useMemo,useState,type FormEvent} from "react";
import {Badge,Help} from "../_components";
import {pvosSupabase} from "../_pvos-supabase";
import styles from "../pvos.module.css";

type RecordRow={
 id:string;cycle_id:string;organization_id:string;company_id:string;product_id:string;task_id:string;
 stage:string;owner_user_id:string|null;reviewer_user_id:string|null;submission_date:string|null;
 submission_reference:string|null;draft_evidence_id:string|null;submission_evidence_id:string|null;acknowledgement_evidence_id:string|null;
 completed_at:string|null;created_at:string;updated_at:string
};
type InputRow={id:string;record_id:string;kind:string;label:string;owner_user_id:string|null;due_on:string|null;
 request_id:string|null;source_task_id:string|null;status:string;created_at:string;updated_at:string};
type Evidence={id:string;title:string;evidence_type:string;file_path:string|null;created_at:string};
type Request={id:string;department:string;request_type:string;status:string;details:string;product_id:string|null;due_at:string;external_reference:string|null};
type SourceTask={id:string;title:string;activity_type:string;status:string;product_id:string|null};
type Review={id:string;cycle:number;status:string;assigned_email:string;sent_at:string;decided_at:string|null;decision_note:string|null};
type Member={user_id:string;email:string;role:string};
type Event={id:number;entity_type:string;entity_id:string|null;event_type:string;created_at:string;actor_user_id:string|null;metadata:Record<string,unknown>};
type Cycle={id:string;status:string;active_substance:string;source_revision:string;authority_basis:string|null;
 jurisdiction:string;data_lock_point:string;submission_due_date:string;confirmed_at:string|null};
const steps=["planning","inputs","draft","review","approved","submitted","complete"];
const kinds=[
 ["sales_exposure","Sales / exposure data"],["medical","Medical input"],["regulatory","Regulatory changes"],
 ["literature","Literature"],["signal","Signal assessment"],["rmp","RMP assessment"],["other","Other input"]
] as const;
const statusLabel:Record<string,string>={waiting:"Waiting",received:"Received",complete:"Complete"};
const requestStatus:Record<string,string>={draft:"Draft",waiting:"Waiting",received:"Received",returned:"Returned",complete:"Complete",cancelled:"Cancelled"};
const fmt=(s:string|null)=>s?new Intl.DateTimeFormat("en-GB",{day:"numeric",month:"short",year:"numeric",timeZone:"Asia/Riyadh"}).format(new Date(s)):"—";
const when=(s:string|null)=>s?new Intl.DateTimeFormat("en-GB",{day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit",timeZone:"Asia/Riyadh"}).format(new Date(s)):"—";
const docEvidence=(e:Evidence)=>Boolean(e.file_path&&e.evidence_type==="document");
type Props={cycle:Cycle;companyId:string;organizationId:string;productName:string;onChanged?:()=>void};
export function PSURLifecycle({cycle,companyId,organizationId,productName,onChanged}:Props){
 const [record,setRecord]=useState<RecordRow|null>(null);
 const [inputs,setInputs]=useState<InputRow[]>([]),[evidence,setEvidence]=useState<Evidence[]>([]);
 const [requests,setRequests]=useState<Request[]>([]),[sourceTasks,setSourceTasks]=useState<SourceTask[]>([]),[members,setMembers]=useState<Member[]>([]);
 const [reviews,setReviews]=useState<Review[]>([]),[history,setHistory]=useState<Event[]>([]);
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState("");
 const [panel,setPanel]=useState<"overview"|"inputs"|"documents"|"review"|"history">("overview");
 const [kind,setKind]=useState("sales_exposure"),[label,setLabel]=useState(""),[owner,setOwner]=useState(""),[due,setDue]=useState("");
 const [requestId,setRequestId]=useState(""),[sourceTaskId,setSourceTaskId]=useState(""),[inputStatus,setInputStatus]=useState("waiting");
 const [reviewer,setReviewer]=useState(""),[submissionDate,setSubmissionDate]=useState(""),[submissionReference,setSubmissionReference]=useState("");
 const [draftFile,setDraftFile]=useState(""),[proofFile,setProofFile]=useState(""),[ackFile,setAckFile]=useState("");
 const [expanded,setExpanded]=useState(false);
 const refresh=useCallback(async()=>{
  const {data:r,error:e}=await pvosSupabase.from("pvos_psur_records").select("*").eq("cycle_id",cycle.id).maybeSingle();
  if(e)throw e;
  setRecord(r);
  if(!r){setLoading(false);return;}
  const [i,ev,req,tasks,m,rev,a]=await Promise.all([
   pvosSupabase.from("pvos_psur_inputs").select("*").eq("record_id",r.id).order("created_at"),
   pvosSupabase.from("pvos_task_evidence").select("id,title,evidence_type,file_path,created_at").eq("task_id",r.task_id).is("archived_at",null).order("created_at",{ascending:false}),
   pvosSupabase.from("pvos_department_requests").select("id,department,request_type,status,details,product_id,due_at,external_reference")
    .eq("company_id",companyId).order("created_at",{ascending:false}).limit(500),
   pvosSupabase.from("pvos_tasks").select("id,title,activity_type,status,product_id")
    .eq("company_id",companyId).order("updated_at",{ascending:false}).limit(500),
   pvosSupabase.rpc("pvos_member_directory",{p_organization_id:organizationId}),
   pvosSupabase.from("pvos_task_reviews").select("id,cycle,status,assigned_email,sent_at,decided_at,decision_note")
    .eq("task_id",r.task_id).order("cycle",{ascending:false}),
   pvosSupabase.from("pvos_audit_events").select("id,entity_type,entity_id,event_type,created_at,actor_user_id,metadata")
    .eq("company_id",companyId).in("entity_type",["psur_record","psur_input"]).order("created_at",{ascending:false}).limit(600)
  ]);
  for(const x of [i,ev,req,tasks,m,rev,a])if(x.error)throw x.error;
  setInputs(i.data||[]);setEvidence(ev.data||[]);setRequests(req.data||[]);setSourceTasks(tasks.data||[]);
  setMembers(m.data||[]);setReviews(rev.data||[]);
  setHistory((a.data||[]).filter((x:Event)=>x.entity_type==="psur_record"&&x.entity_id===r.id||
    x.entity_type==="psur_input"&&x.metadata?.psur_record_id===r.id));
  if(r.reviewer_user_id)setReviewer(r.reviewer_user_id);
  setLoading(false);
 },[cycle.id,companyId,organizationId]);
 useEffect(()=>{setLoading(true);refresh().catch(e=>{setError(e.message);setLoading(false);});},[refresh]);
 useEffect(()=>{
  const onFocus=()=>{if(document.visibilityState==="visible")void refresh().catch(()=>{});};
  window.addEventListener("focus",onFocus);
  const onVisible=()=>{if(document.visibilityState==="visible")onFocus();};
  document.addEventListener("visibilitychange",onVisible);
  return ()=>{window.removeEventListener("focus",onFocus);document.removeEventListener("visibilitychange",onVisible);};
 },[refresh]);
 const fileOptions=evidence.filter(docEvidence);
 const kindLabel=(k:string)=>kinds.find(([id])=>id===k)?.[1]||k;
 const member=(id:string|null)=>id?members.find(x=>x.user_id===id)?.email||"Workspace member":"Unassigned";
 const matchingRequests=requests.filter(x=>!x.product_id||x.product_id===record?.product_id);
 const matchingSourceTasks=sourceTasks.filter(x=>x.id!==record?.task_id&&(!x.product_id||x.product_id===record?.product_id));
 const effective=(input:InputRow)=>{
  const r=requests.find(x=>x.id===input.request_id);
  if(r)return requestStatus[r.status]||r.status;
  const linkedTask=sourceTasks.find(x=>x.id===input.source_task_id);
  if(linkedTask)return linkedTask.status==="complete"?"Complete":linkedTask.status==="awaiting_review"?"In review":linkedTask.status==="in_progress"?"In progress":"Waiting";
  return statusLabel[input.status]||input.status;
 };
 const openInputs=inputs.filter(x=>!["Complete","Cancelled"].includes(effective(x)));
 const lastReview=reviews[0]||null;
 const stageIndex=record?steps.indexOf(record.stage):0;

 async function advance(action:string,extra:Record<string,unknown>={}){
  if(!record||busy)return;
  setBusy(true);setError("");setMessage("");
  try{
   const {data,error:e}=await pvosSupabase.rpc("pvos_psur_advance",{
    p_record_id:record.id,p_action:action,p_reviewer:null,p_evidence_id:null,p_reference:null,p_date:null,...extra
   });
   if(e)throw e;
   if(data?.review_id){
    try{
     const {data:s}=await pvosSupabase.auth.getSession();
     if(s.session)await fetch("/api/pvos/reviews/dispatch",{method:"POST",
      headers:{authorization:"Bearer "+s.session.access_token,"content-type":"application/json"},
      body:JSON.stringify({review_id:data.review_id})});
    }catch{/* The review remains recorded in PVOS if email delivery fails. */}
    window.dispatchEvent(new Event("pvos-notifications-changed"));
   }
   await refresh();onChanged?.();
   setMessage(action==="send_review"?"PSUR draft sent for independent review.":"PSUR stage updated.");
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 async function createInput(e:FormEvent){
  e.preventDefault();if(!record||busy)return;
  setBusy(true);setError("");setMessage("");
  try{
   const {error:x}=await pvosSupabase.rpc("pvos_psur_save_input",{
    p_record_id:record.id,p_id:null,p_kind:kind,p_label:label.trim(),
    p_owner:owner||null,p_due:due||null,p_request:requestId||null,p_source_task:sourceTaskId||null,p_status:inputStatus
   });
   if(x)throw x;
   setLabel("");setRequestId("");setSourceTaskId("");setDue("");setOwner("");await refresh();setMessage("PSUR input added.");
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 async function changeInput(i:InputRow,next:string){
  if(!record||busy)return;
  setBusy(true);setError("");
  try{
   const {error:x}=await pvosSupabase.rpc("pvos_psur_save_input",{
    p_record_id:record.id,p_id:i.id,p_kind:i.kind,p_label:i.label,p_owner:i.owner_user_id,
    p_due:i.due_on,p_request:i.request_id,p_source_task:i.source_task_id,p_status:next
   });
   if(x)throw x;await refresh();
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 const rowLink=(req:Request)=>"/pvos/requests/department?company="+encodeURIComponent(companyId)+"&request="+encodeURIComponent(req.id);
 const fileHref=record?"/pvos/tasks/"+record.task_id+"#evidence":"#";
 const reviewHref=record?"/pvos/tasks/"+record.task_id+"#task-review":"#";
 return <section className={styles.panel} id="psur-lifecycle" style={{scrollMarginTop:20}}>
  <div className={styles.panelHeader}>
   <div><h2>PSUR/PBRER · {productName}</h2><div className={styles.muted} style={{marginTop:5}}>DLP {cycle.data_lock_point} · Due {cycle.submission_due_date}</div></div>
   {record?<Badge tone={record.stage==="complete"?"green":record.stage==="review"?"amber":"default"}>{record.stage[0].toUpperCase()+record.stage.slice(1)}</Badge>:null}
  </div>
  {loading?<div className={styles.empty}>Loading PSUR lifecycle…</div>:!record?<div className={styles.sectionBody}>
   This cycle is not confirmed. Verify regulatory applicability in the EURD register before creating a PSUR lifecycle record.
  </div>:<div className={styles.sectionBody} style={{display:"grid",gap:18}}>
   {error?<div className={styles.errorBox} role="alert">{error}</div>:null}
   {message?<div className={styles.successBox} role="status">{message}</div>:null}
   <div className={styles.psurStages} aria-label="PSUR lifecycle">
    {steps.map((step,index)=><span key={step} data-current={record.stage===step?"true":"false"} data-passed={index<stageIndex?"true":"false"}>
     {step[0].toUpperCase()+step.slice(1)}
    </span>)}
   </div>
   <div className={styles.psurWorkflowTabs} role="group" aria-label="PSUR sections">
    {([["overview","Overview"],["inputs","Inputs ("+inputs.length+")"],["documents","Documents"],["review","Review"],["history","History"]] as const).map(([id,label])=>
     <button type="button" key={id} onClick={()=>setPanel(id)} aria-pressed={panel===id} className={panel===id?styles.psurWorkflowTabActive:styles.psurWorkflowTab}>{label}</button>)}
   </div>
   {panel==="overview"?<div className={styles.psurFacts}>
    <div><span>Active substance</span><strong>{cycle.active_substance}</strong></div>
    <div><span>Jurisdiction</span><strong>{cycle.jurisdiction==="sfda"?"SFDA (locally confirmed)":cycle.jurisdiction.toUpperCase()}</strong></div>
    <div><span>Regulatory basis</span><strong>{cycle.authority_basis||"Not recorded"}</strong></div>
    <div><span>EURD source revision</span><strong>{cycle.source_revision}</strong></div>
    <div><span>DLP</span><strong>{cycle.data_lock_point}</strong></div>
    <div><span>Submission deadline</span><strong>{cycle.submission_due_date}</strong></div>
    <div><span>Owner</span><strong>{member(record.owner_user_id)}</strong></div>
    <div><span>Reviewer</span><strong>{member(record.reviewer_user_id)}</strong></div>
    {record.draft_evidence_id?<div><span>Reviewed draft</span><strong>{evidence.find(x=>x.id===record.draft_evidence_id)?.title||"Uploaded document"}</strong></div>:null}
    {record.submission_date?<div><span>Actual submission</span><strong>{record.submission_date} · {record.submission_reference}</strong></div>:null}
    <div className={styles.psurFullRow}><Link href={fileHref}>Open work, evidence and documents →</Link></div>
   </div>:null}
   {panel==="inputs"?<>
    <div className={styles.muted}>Link inputs from departmental Requests or document PV-owned inputs directly. Linked request statuses update with the request.</div>
    <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Input</th><th>Owner</th><th>Due</th><th>State</th><th>Source</th></tr></thead>
     <tbody>{inputs.map(i=>{const req=requests.find(r=>r.id===i.request_id);const linkedTask=sourceTasks.find(t=>t.id===i.source_task_id);return <tr key={i.id}>
      <td><strong>{i.label}</strong><div className={styles.muted}>{kindLabel(i.kind)}</div></td>
      <td>{member(i.owner_user_id)}</td><td>{fmt(i.due_on)}</td>
      <td>{req||linkedTask?<Badge tone={effective(i)==="Complete"?"green":"amber"}>{effective(i)}</Badge>:
       <select className={styles.input} aria-label={"Status of "+i.label} value={i.status} disabled={busy||!["planning","inputs","draft"].includes(record.stage)}
        onChange={e=>{void changeInput(i,e.target.value);}}>{Object.entries(statusLabel).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>}</td>
      <td>{req?<Link href={rowLink(req)}>{req.department} request →</Link>:linkedTask?<Link href={"/pvos/tasks/"+linkedTask.id}>{linkedTask.title} →</Link>:"Manual"}</td>
     </tr>;})}</tbody></table>{!inputs.length?<div className={styles.empty}>No PSUR inputs yet. Add literature, signal, medical, sales/exposure or regulatory input as needed.</div>:null}</div>
    {["planning","inputs","draft"].includes(record.stage)?<form onSubmit={createInput} className={styles.psurInputForm}>
     <div className={styles.formGrid}>
      <label>Input type<select className={styles.input} value={kind} onChange={e=>setKind(e.target.value)}>{kinds.map(([id,l])=><option key={id} value={id}>{l}</option>)}</select></label>
      <label>Requirement<input required className={styles.input} minLength={2} maxLength={220} placeholder="e.g. October sales data" value={label} onChange={e=>setLabel(e.target.value)}/></label>
      <label>Owner<select className={styles.input} value={owner} onChange={e=>setOwner(e.target.value)}><option value="">Not assigned</option>{members.map(x=><option key={x.user_id} value={x.user_id}>{x.email}</option>)}</select></label>
      <label>Due<input type="date" className={styles.input} value={due} onChange={e=>setDue(e.target.value)}/></label>
      <label>Linked department request<select className={styles.input} disabled={Boolean(sourceTaskId)} value={requestId} onChange={e=>setRequestId(e.target.value)}>
       <option value="">No linked request</option>{matchingRequests.map(x=><option key={x.id} value={x.id}>{x.department} · {x.details.slice(0,70)}</option>)}</select></label>
      <label>Linked PV work (literature / signals / RMP)<select className={styles.input} value={sourceTaskId}
       disabled={Boolean(requestId)} onChange={e=>setSourceTaskId(e.target.value)}>
       <option value="">No linked PV record</option>{matchingSourceTasks.map(x=><option key={x.id} value={x.id}>{x.activity_type} · {x.title}</option>)}</select></label>
      <label>Manual input state<select className={styles.input} disabled={Boolean(requestId||sourceTaskId)} value={inputStatus} onChange={e=>setInputStatus(e.target.value)}>
       {Object.entries(statusLabel).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
     </div>
     <div className={styles.inlineActions}><button className={styles.buttonGhost} type="submit" disabled={busy||!label.trim()}>+ Add input</button>
      <Link href={"/pvos/requests?company="+encodeURIComponent(companyId)}>Manage department requests →</Link></div>
    </form>:null}
   </>:null}
   {panel==="documents"?<>
    <div className={styles.muted}>Documents are securely stored in the existing PSUR work record. Select the reviewed draft and a different submission receipt; upload final reports and acknowledgements there as needed.</div>
    <div className={styles.inlineActions}><Link href={fileHref} className={styles.buttonGhost}>Upload or review documents →</Link></div>
    <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Evidence / document</th><th>Type</th><th>Added</th></tr></thead><tbody>
     {evidence.map(x=><tr key={x.id}><td>{x.title}</td><td>{docEvidence(x)?"Uploaded document":"Evidence note"}</td><td>{fmt(x.created_at)}</td></tr>)}
    </tbody></table>{!evidence.length?<div className={styles.empty}>No supporting evidence recorded yet.</div>:null}</div>
   </>:null}
   {panel==="review"?<>
    <div className={styles.muted}>Named review uses PVOS's existing immutable task-review snapshot and evidence history. A reviewer's approval does not mark a PSUR submitted.</div>
    <div className={styles.inlineActions}><Link href={reviewHref} className={styles.buttonGhost}>Open independent review →</Link></div>
    {reviews.length?<div className={styles.psurHistory}>{reviews.map(r=><div key={r.id} className={styles.psurHistoryRow}>
     <strong>Cycle {r.cycle} · {r.status}</strong><span>{r.assigned_email} · Sent {when(r.sent_at)}{r.decided_at?" · Decided "+when(r.decided_at):""}</span>
     {r.decision_note?<span>{r.decision_note}</span>:null}
    </div>)}</div>:<div className={styles.empty}>No independent review requested yet.</div>}
   </>:null}
   {panel==="history"?<>
    {history.length?<div className={styles.psurHistory}>{history.map(x=><div key={x.id} className={styles.psurHistoryRow}>
     <strong>{x.entity_type==="psur_input"?"Input":"Lifecycle"} · {x.event_type}</strong><span>{when(x.created_at)} · {member(x.actor_user_id)}</span>
    </div>)}</div>:<div className={styles.empty}>No PSUR lifecycle history yet.</div>}
   </>:null}
   <div className={styles.psurStageActions}>
    {record.stage==="planning"?<button disabled={busy} className={styles.button} onClick={()=>void advance("start_inputs")}>Start collecting inputs →</button>:null}
    {record.stage==="inputs"?<div className={styles.psurActionBlock}>
     <button disabled={busy} className={styles.button} onClick={()=>void advance("draft")}>Move to Draft →</button>
     {openInputs.length?<span className={styles.muted}>{openInputs.length} input(s) remain open. Confirm they are not essential before advancing.</span>:null}
    </div>:null}
    {record.stage==="draft"?<div className={styles.psurActionBlock}>
     <label>Independent reviewer<select className={styles.input} value={reviewer} onChange={e=>setReviewer(e.target.value)}>
      <option value="">Choose reviewer</option>{members.map(m=><option key={m.user_id} value={m.user_id}>{m.email}</option>)}</select></label>
     <label>Draft document to freeze for review<select className={styles.input} value={draftFile} onChange={e=>setDraftFile(e.target.value)}>
      <option value="">Select uploaded draft</option>{fileOptions.map(x=><option key={x.id} value={x.id}>{x.title}</option>)}
     </select></label>
     <button disabled={busy||!reviewer||!draftFile} className={styles.button}
      onClick={()=>void advance("send_review",{p_reviewer:reviewer,p_evidence_id:draftFile})}>Send draft for review →</button>
     {!fileOptions.length?<Link href={fileHref}>Upload draft document first →</Link>:null}
    </div>:null}
    {record.stage==="review"?<div className={styles.psurActionBlock}>
     <span>Awaiting independent review by {member(record.reviewer_user_id)}.</span>
     <Link href={reviewHref}>Approve or return in the existing review screen →</Link>
     <button type="button" className={styles.buttonGhost} onClick={()=>void refresh()}>Refresh status</button>
    </div>:null}
    {record.stage==="approved"?<div className={styles.psurActionBlock}>
     <div className={styles.formGrid}>
      <label>Actual submission date<input type="date" className={styles.input} value={submissionDate} onChange={e=>setSubmissionDate(e.target.value)}/></label>
      <label>Submission reference<input className={styles.input} placeholder="Authority receipt / tracking reference" value={submissionReference} onChange={e=>setSubmissionReference(e.target.value)}/></label>
      <label>Submission proof document<select className={styles.input} value={proofFile} onChange={e=>setProofFile(e.target.value)}>
       <option value="">Select uploaded proof</option>{fileOptions.filter(x=>x.id!==record.draft_evidence_id).map(x=><option key={x.id} value={x.id}>{x.title}</option>)}</select></label>
     </div>
     <button disabled={busy||!submissionDate||!submissionReference.trim()||!proofFile} className={styles.button}
      onClick={()=>void advance("submitted",{p_date:submissionDate,p_reference:submissionReference,p_evidence_id:proofFile})}>Record submission →</button>
     <Link href={fileHref}>Upload submission proof →</Link>
    </div>:null}
    {record.stage==="submitted"?<div className={styles.psurActionBlock}>
     <div className={styles.muted}>Submitted {fmt(record.submission_date)} · Reference {record.submission_reference}. An acknowledgement document is optional when the authority has not provided one.</div>
     <label>Authority acknowledgement (optional)<select className={styles.input} value={ackFile} onChange={e=>setAckFile(e.target.value)}>
      <option value="">Not available</option>{fileOptions.map(x=><option key={x.id} value={x.id}>{x.title}</option>)}</select></label>
     <button className={styles.button} disabled={busy} onClick={()=>void advance("complete",{p_evidence_id:ackFile||null})}>Mark PSUR complete →</button>
    </div>:null}
    {record.stage==="complete"?<div className={styles.psurActionBlock}><Badge tone="green">PSUR complete</Badge>
     <span>Submitted {fmt(record.submission_date)} · {record.submission_reference} · Completed {when(record.completed_at)}</span>
     <Link href={fileHref}>View final evidence →</Link></div>:null}
   </div>
  </div>}
 </section>;
}
