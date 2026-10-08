"use client";
import Link from "next/link";
import {useCallback,useEffect,useState,type FormEvent} from "react";
import {Badge,Help} from "../_components";
import {pvosSupabase} from "../_pvos-supabase";
import styles from "../pvos.module.css";
type RequestRow={id:string,company_id:string,product_id:string|null,task_id:string,request_type:string,department:string,recipient_user_id:string|null,recipient_email:string|null,requester_user_id:string,reviewer_user_id:string|null,details:string,external_reference:string|null,status:string,response_note:string|null,decision_note:string|null,followup_count:number,last_followup_at:string|null,due_at:string};
type Member={user_id:string,email:string,role:string};
const types=[["invoice","Invoice"],["regulatory_history","Registration history"],["safety_data","Safety / case data"],["labelling","Label / PIL"],["document","Controlled document"],["other","Other information"]];
const date=(s:string)=>new Intl.DateTimeFormat("en-GB",{dateStyle:"medium",timeZone:"Asia/Riyadh"}).format(new Date(s));
export function DepartmentRequests({companyId,organizationId,products,onChanged}:{companyId:string,organizationId:string,products:any[],onChanged?:()=>void}){
 const [rows,setRows]=useState<RequestRow[]>([]),[members,setMembers]=useState<Member[]>([]);
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState("");
 const [type,setType]=useState("invoice"),[department,setDepartment]=useState("Finance"),[product,setProduct]=useState("");
 const [recipient,setRecipient]=useState(""),[email,setEmail]=useState(""),[reviewer,setReviewer]=useState("");
 const [details,setDetails]=useState(""),[reference,setReference]=useState(""),[due,setDue]=useState("");
 const [notes,setNotes]=useState<Record<string,string>>({});
 const [reviewerAssignments,setReviewerAssignments]=useState<Record<string,string>>({});
 const [currentUser,setCurrentUser]=useState("");
 const load=useCallback(async()=>{
  const [r,m,u]=await Promise.all([
   pvosSupabase.from("pvos_department_requests").select("*").eq("organization_id",organizationId).eq("company_id",companyId).order("created_at",{ascending:false}),
   pvosSupabase.rpc("pvos_member_directory",{p_organization_id:organizationId}),
   pvosSupabase.auth.getUser()
  ]);
  if(r.error||m.error)throw r.error||m.error;
  setRows(r.data||[]);setMembers(m.data||[]);setCurrentUser(u.data.user?.id||"");
 },[organizationId,companyId]);
 useEffect(()=>{load().catch(e=>setError(e.message));},[load]);
 const userName=(id:string|null)=>members.find(m=>m.user_id===id)?.email||"Not assigned";
 async function create(e:FormEvent){
  e.preventDefault();setBusy(true);setError("");setMessage("");
  try{
   const {error:e2}=await pvosSupabase.rpc("pvos_new_department_request",{
    p_company_id:companyId,p_product_id:product||null,p_request_type:type,p_department:department,
    p_recipient_user_id:recipient||null,p_recipient_email:email||null,p_reviewer_user_id:reviewer||null,
    p_details:details,p_reference:reference||null,p_due_date:due
   });
   if(e2)throw e2;
   setMessage("Request saved. Use Mark requested after contacting the department, or assign an internal recipient.");
   setDetails("");setReference("");setDue("");await load();onChanged?.();
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 async function act(id:string,action:string){
  setBusy(true);setError("");setMessage("");
  try{
   const {error:e}=await pvosSupabase.rpc("pvos_act_department_request",{p_request_id:id,p_action:action,p_note:notes[id]||null});
   if(e)throw e;
   setNotes(prev=>({...prev,[id]:""}));
   setMessage(action==="follow_up"?"Follow-up logged in the audit history (no email was sent).":"Request updated and linked task synchronized.");
   await load();onChanged?.();
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 async function assignReviewer(id:string){
  const reviewerId=reviewerAssignments[id];
  if(!reviewerId)return;
  setBusy(true);setError("");setMessage("");
  try{
   const {error:e}=await pvosSupabase.rpc("pvos_assign_department_reviewer",{p_request_id:id,p_reviewer_id:reviewerId});
   if(e)throw e;
   setMessage("Independent reviewer assigned. They can now approve or return received evidence.");
   await load();onChanged?.();
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 return <div style={{display:"grid",gap:16}}>
  <section className={styles.panel}>
   <div className={styles.panelHeader}><h2>Departmental information & invoices</h2><Help>Request information from Finance, Regulatory, Medical or another department. Records track who owes what, when, receipt, evidence, and independent review. Mark requested and follow-up actions log external communication; they do not send emails.</Help></div>
   <div className={styles.sectionBody}>
    <form onSubmit={create} style={{display:"grid",gap:12}}>
     <div className={styles.formGrid}>
      <label>Request type<select className={styles.input} value={type} onChange={e=>{setType(e.target.value);if(e.target.value==="invoice")setDepartment("Finance");}}>{types.map(([v,t])=><option key={v} value={v}>{t}</option>)}</select></label>
      <label>Department<input className={styles.input} required value={department} onChange={e=>setDepartment(e.target.value)} placeholder="Finance / Regulatory / Medical"/></label>
      <label>Product (optional)<select className={styles.input} value={product} onChange={e=>setProduct(e.target.value)}><option value="">Company-wide</option>{products.map(p=><option key={p.id} value={p.id}>{p.brand_name}</option>)}</select></label>
      <label>Internal recipient (optional)<select className={styles.input} value={recipient} onChange={e=>setRecipient(e.target.value)}><option value="">External department / not on PVOS</option>{members.map(m=><option key={m.user_id} value={m.user_id}>{m.email} · {m.role}</option>)}</select></label>
      <label>External recipient email (optional)<input className={styles.input} type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="finance@example.com"/></label>
      <label>Independent reviewer (optional until final review)<select className={styles.input} value={reviewer} onChange={e=>setReviewer(e.target.value)}><option value="">Select reviewer</option>{members.filter(m=>m.user_id!==currentUser).map(m=><option key={m.user_id} value={m.user_id}>{m.email} · {m.role}</option>)}</select></label>
      <label>Deadline<input required className={styles.input} type="date" value={due} onChange={e=>setDue(e.target.value)}/></label>
      <label>Invoice / department reference (optional)<input className={styles.input} value={reference} onChange={e=>setReference(e.target.value)} placeholder="PO or request reference"/></label>
     </div>
     <label>Information or documentation required<textarea required className={styles.input} value={details} onChange={e=>setDetails(e.target.value)} rows={3} placeholder="What exactly must the department provide, and for which regulatory activity?"/></label>
     <div><button type="submit" className={styles.button} disabled={busy}>Create request</button></div>
    </form>
   </div>
  </section>
  {error?<div className={styles.errorBox} role="alert">{error}</div>:null}
  {message?<div className={styles.info} role="status">{message}</div>:null}
  <section className={styles.panel}>
   <div className={styles.panelHeader}><h2>Departmental request tracker</h2><Help>Use the linked task to upload received invoices/documents as evidence. Reviewer approval is blocked until evidence is attached. Every action is audited.</Help></div>
   {rows.length?rows.map(r=><div key={r.id} className={styles.sectionBody} style={{borderBottom:"1px solid var(--line, #ddd)"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"start",gap:12,flexWrap:"wrap"}}>
     <div><strong>{types.find(t=>t[0]===r.request_type)?.[1]||r.request_type} · {r.department}</strong>
      <div className={styles.muted}>Due {date(r.due_at)} · {r.recipient_user_id?userName(r.recipient_user_id):r.recipient_email||"External contact not recorded"} · Reviewer {userName(r.reviewer_user_id)}</div>
      <div>{r.details}</div>
      {r.response_note?<div className={styles.muted}>Received: {r.response_note}</div>:null}
      {r.external_reference?<div className={styles.muted}>Reference: {r.external_reference}</div>:null}
      {r.followup_count?<div className={styles.muted}>Follow-ups: {r.followup_count}{r.last_followup_at?" · Last "+date(r.last_followup_at):""}</div>:null}
     </div>
     <Badge tone={r.status==="complete"?"green":r.status==="waiting"?"amber":"default"}>{r.status==="waiting"?"Waiting for department":r.status==="received"?"Ready for review":r.status}</Badge>
    </div>
    {!r.reviewer_user_id&&r.status!=="complete"&&r.status!=="cancelled"?<div style={{display:"flex",gap:8,alignItems:"center",marginTop:12,flexWrap:"wrap"}}>
     <select aria-label="Assign reviewer" className={styles.input} value={reviewerAssignments[r.id]||""} onChange={e=>setReviewerAssignments(p=>({...p,[r.id]:e.target.value}))}>
      <option value="">Assign reviewer when available</option>
      {members.filter(m=>m.user_id!==r.requester_user_id).map(m=><option key={m.user_id} value={m.user_id}>{m.email} · {m.role}</option>)}
     </select>
     <button className={styles.buttonGhost} disabled={busy||!reviewerAssignments[r.id]} onClick={()=>assignReviewer(r.id)}>Assign reviewer</button>
     <Help>An independent workspace member is required before approval; requests and follow-ups can begin now.</Help>
    </div>:null}
    {r.status!=="complete"&&r.status!=="cancelled"?<div style={{display:"grid",gap:8,marginTop:12}}>
     <label>Action note<input className={styles.input} value={notes[r.id]||""} onChange={e=>setNotes(p=>({...p,[r.id]:e.target.value}))} placeholder={r.status==="waiting"?"Receipt note required when marking received":"Explain the action or review decision"}/></label>
     <div className={styles.inlineActions}>
      {r.status==="draft"?<button disabled={busy} className={styles.buttonGhost} onClick={()=>act(r.id,"mark_requested")}>Mark requested</button>:null}
      {r.status==="waiting"?<>
       <button disabled={busy} className={styles.buttonGhost} onClick={()=>act(r.id,"follow_up")}>Log follow-up</button>
       <button disabled={busy} className={styles.buttonGhost} onClick={()=>act(r.id,"mark_received")}>Mark received</button>
      </>:null}
      {r.status==="received"&&currentUser===r.reviewer_user_id?<>
       <button disabled={busy} className={styles.buttonGhost} onClick={()=>act(r.id,"approve")}>Approve received evidence</button>
       <button disabled={busy} className={styles.buttonGhost} onClick={()=>act(r.id,"return")}>Return for corrections</button>
      </>:null}
      {r.status==="returned"?<button disabled={busy} className={styles.buttonGhost} onClick={()=>act(r.id,"resend")}>Request corrections</button>:null}
      {["draft","waiting"].includes(r.status)?<button disabled={busy} className={styles.buttonGhost} onClick={()=>act(r.id,"cancel")}>Cancel</button>:null}
      <Link className={styles.buttonGhost} href={"/pvos/tasks/"+r.task_id+"#evidence"}>Documents & evidence</Link>
     </div>
    </div>:<div style={{marginTop:10}}><Link className={styles.buttonGhost} href={"/pvos/tasks/"+r.task_id+"#evidence"}>View final record</Link></div>}
   </div>):<div className={styles.empty}>No departmental requests yet. Start with an invoice or information request above.</div>}
  </section>
 </div>;
}
