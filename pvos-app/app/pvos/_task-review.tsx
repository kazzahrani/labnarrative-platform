"use client";

import Link from "next/link";
import {useCallback,useEffect,useState} from "react";
import {Badge,Help} from "./_components";
import {pvosSupabase} from "./_pvos-supabase";
import {readApprovalRows,type Member} from "./_approval";
import styles from "./pvos.module.css";

type MailDispatch={configured?:boolean;attempted?:number;sent?:number;failed?:number;queued?:boolean};
async function dispatchReviewEmail(reviewId:string):Promise<MailDispatch|null>{
 try{
  const {data}=await pvosSupabase.auth.getSession();
  if(!data.session)return null;
  const response=await fetch("/api/pvos/reviews/dispatch",{
   method:"POST",headers:{"content-type":"application/json",authorization:"Bearer "+data.session.access_token},
   body:JSON.stringify({review_id:reviewId})
  });
  if(!response.ok)return null;
  return await response.json() as MailDispatch;
 }catch{return null;}
}
function mailStatus(dispatch:MailDispatch|null){
 if(dispatch?.sent)return " Email notification sent.";
 if(dispatch?.configured===false||dispatch?.queued)return " Email notification queued; mail transport requires attention.";
 if(dispatch?.failed)return " Email delivery failed; the review is saved and the notification can be retried.";
 return " Review saved. Email delivery was not confirmed.";
}

export function reviewTime(value:string){return new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Riyadh",dateStyle:"medium",timeStyle:"short"}).format(new Date(value));}
export function TaskReviewPanel({task,members,userId,onChanged,onPending}:{task:any,members:Member[],userId?:string,onChanged:()=>void,onPending:(pending:boolean,hasHistory:boolean)=>void}){
  const [rows,setRows]=useState<any[]>([]),[reviewer,setReviewer]=useState(""),[note,setNote]=useState("");
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(""),[result,setResult]=useState("");
  const load=useCallback(async()=>{
    setLoading(true);setError("");onPending(true,true);
    try{const next=await readApprovalRows<any>((from,to)=>pvosSupabase.from("pvos_task_reviews").select("*").eq("organization_id",task.organization_id).eq("task_id",task.id).order("cycle",{ascending:false}).range(from,to));setRows(next);onPending(next.some(r=>r.status==="pending"),next.length>0);
      const waiting=next.find(r=>r.status==="pending"&&(r.sent_by===userId||r.assigned_to===userId));
      if(waiting)void dispatchReviewEmail(waiting.id);}
    catch(e){setError((e as Error).message);onPending(true,true);}
    finally{setLoading(false);}
  },[task.id,task.organization_id,onPending,userId]);
  useEffect(()=>{setRows([]);setNote("");setResult("");load();},[load]);
  useEffect(()=>{if(task.reviewer_user_id&&task.reviewer_user_id!==userId&&members.some(m=>m.user_id===task.reviewer_user_id))setReviewer(task.reviewer_user_id);},[task.id,task.reviewer_user_id,userId,members]);
  const pending=rows.find(r=>r.status==="pending"),currentRole=members.find(m=>m.user_id===userId)?.role;
  const canSend=task.owner_user_id===userId||["admin","qppv","deputy_qppv"].includes(currentRole||"");
  async function send(){
    if(busy||!reviewer)return;setBusy(true);setError("");setResult("");
    try{
      const {data,error}=await pvosSupabase.rpc("pvos_send_task_review",{p_task_id:task.id,p_reviewer_id:reviewer,p_note:note||null});
      if(error)throw error;
      const delivery=await dispatchReviewEmail(data.review_id);
      setResult("Review assigned to "+data.assigned_email+". Find it in Dashboard → Reviews."+mailStatus(delivery));
      setNote("");await load();onChanged();
      window.dispatchEvent(new Event("pvos-notifications-changed"));
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  async function decide(decision:"approved"|"returned"){
    if(busy||!pending)return;setBusy(true);setError("");setResult("");
    try{
      const {error}=await pvosSupabase.rpc("pvos_decide_task_review",{p_review_id:pending.id,p_decision:decision,p_note:note||null});
      if(error)throw error;
      const delivery=await dispatchReviewEmail(pending.id);
      setResult((decision==="approved"?"Approval recorded. Task completed; evidence remains here.":"Returned with your reason. The task is open for correction and resubmission.")+mailStatus(delivery));
      setNote("");await load();onChanged();
      window.dispatchEvent(new Event("pvos-notifications-changed"));
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  return <div className={styles.info} id="task-review">
    <h3>Task review</h3>
    {error?<div className={styles.errorBox} role="alert">{error} <button className={styles.buttonGhost} onClick={load}>Refresh reviews</button></div>:null}
    {result?<div className={styles.successBox} role="status">{result} <Link href="/pvos/dashboard?tab=reviews">Open review queue →</Link></div>:null}
    {loading?<p>Loading review history…</p>:pending?<>
      <p><Badge tone="amber">Awaiting review</Badge></p>
      <p>Waiting for <strong>{pending.assigned_email}</strong> · Sent {reviewTime(pending.sent_at)} Riyadh</p>
      <p className={styles.muted}>Submitted by {pending.sent_by_email} · Cycle {pending.cycle}</p>
      {pending.submission_note?<p>{pending.submission_note}</p>:null}
      <div className={styles.notice}><strong>Submitted for review</strong><p>{pending.snapshot.task.title}</p><p className={styles.muted}>{pending.snapshot.task.notes||"No task notes"}</p><div>{pending.snapshot.evidence.length} evidence reference(s) frozen at submission. Open the documents in Evidence & documents.</div></div>
      {pending.assigned_to===userId?<>
        <label style={{display:"block",marginTop:12}}>Decision note <textarea className={styles.input} value={note} onChange={e=>setNote(e.target.value)} placeholder="Explain corrections when returning"/></label>
        <div className={styles.inlineActions}><button className={styles.buttonGhost} disabled={busy||!note.trim()} onClick={()=>decide("returned")}>Return with reason</button><button className={styles.button} disabled={busy} onClick={()=>decide("approved")}>Approve & complete task</button></div>
      </>:<p className={styles.muted}>Only the assigned reviewer can approve or return this task.</p>}
    </>:canSend&&!["complete","cancelled"].includes(task.status)?<>
      {rows[0]?.status==="returned"?<div className={styles.notice}><strong>Returned for correction</strong><p>{rows[0].decision_note}</p></div>:null}
      <label>Reviewer <select className={styles.input} value={reviewer} onChange={e=>setReviewer(e.target.value)} disabled={busy}><option value="">Choose workspace member</option>{members.filter(m=>m.user_id!==userId).map(m=><option key={m.user_id} value={m.user_id}>{m.email}</option>)}</select></label>
      <label style={{display:"block",marginTop:10}}>Submission note <textarea className={styles.input} value={note} onChange={e=>setNote(e.target.value)} placeholder="Optional context for the reviewer"/></label>
      <div className={styles.inlineActions}><button className={styles.button} disabled={busy||!reviewer||!!error} onClick={send}>{busy?"Sending…":rows.length?"Resubmit for review":"Send for review"}</button></div>
      <Help>Appears in the assigned reviewer’s Dashboard → Reviews and notification bell. PVOS also sends an email when configured.</Help>
    </>:null}
    {rows.length?<details style={{marginTop:14}}><summary>Review history ({rows.length} cycle{rows.length===1?"":"s"})</summary>{rows.map(r=><div key={r.id} className={styles.notice} style={{marginTop:8}}>
      <strong>Cycle {r.cycle} · {r.status}</strong><p>Sent by {r.sent_by_email} to {r.assigned_email} · {reviewTime(r.sent_at)} Riyadh</p>
      {r.decided_at?<p>{r.status==="approved"?"Approved":"Returned"} by {r.decided_email} · {reviewTime(r.decided_at)} Riyadh</p>:null}
      {r.decision_note?<p>{r.decision_note}</p>:null}
      <details><summary>Submitted task and evidence references</summary><p>{r.snapshot.task.title}</p><p>{r.snapshot.task.notes}</p>{r.snapshot.evidence.map((e:any)=><div key={e.id}>{e.title} · {e.version||"Version not recorded"}</div>)}</details>
    </div>)}</details>:null}
  </div>;
}

export function TaskReviewQueue({rows,company,search,history}:{rows:any[],company:string,search:string,history:boolean}){
  const filtered=rows.filter(r=>(history?r.status!=="pending":r.status==="pending")&&(!company||r.company_id===company)&&[r.snapshot.task.title,r.assigned_email,r.sent_by_email,r.pvos_tasks?.pvos_companies?.name].join(" ").toLowerCase().includes(search.toLowerCase()));
  return <section className={styles.panel}><div className={styles.panelHeader}><h2>{history?"Task review history":"Named task reviews"}</h2><span className={styles.muted}>{filtered.length}</span></div>
    {filtered.length?<div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Company / submitted task</th><th>Reviewer</th><th>{history?"Decision":"Sent"}</th><th>Record</th></tr></thead><tbody>{filtered.map(r=><tr key={r.id}>
      <td><div className={styles.muted}>{r.pvos_tasks?.pvos_companies?.name}</div>{r.snapshot.task.title}<div className={styles.muted}>Cycle {r.cycle}</div></td>
      <td>{r.assigned_email}</td><td>{history?<><Badge tone={r.status==="approved"?"green":"amber"}>{r.status}</Badge><div>{r.decided_email}</div><div className={styles.muted}>{reviewTime(r.decided_at)} Riyadh</div>{r.decision_note?<p>{r.decision_note}</p>:null}</>:<>{reviewTime(r.sent_at)} Riyadh<div className={styles.muted}>From {r.sent_by_email}</div></>}</td>
      <td><Link className={styles.buttonGhost} href={`/pvos/tasks/${r.task_id}#task-review`}>{history?"View history":"Open review"}</Link></td>
    </tr>)}</tbody></table></div>:<div className={styles.empty}>No task reviews match these filters.</div>}
  </section>;
}
