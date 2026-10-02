"use client";

import { useParams } from "next/navigation";
import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { Header, Badge, statusTone } from "../../_components";
import { usePVOS } from "../../_provider";
import { pvosSupabase } from "../../_pvos-supabase";
import { dueLabel, formatDue, niceStatus } from "../../_utils";
import styles from "../../pvos.module.css";

function safeName(name:string){return name.replace(/[^a-zA-Z0-9._-]+/g,"-").slice(0,120)}

export default function TaskPage(){
  const params=useParams<{id:string}>(); const {session,organizationId}=usePVOS();
  const [task,setTask]=useState<any|null>(null); const [company,setCompany]=useState<any|null>(null); const [product,setProduct]=useState<any|null>(null);
  const [evidence,setEvidence]=useState<any[]>([]); const [approvals,setApprovals]=useState<any[]>([]); const [steps,setSteps]=useState<any[]>([]); const [audit,setAudit]=useState<any[]>([]);
  const [evidenceTitle,setEvidenceTitle]=useState(""); const [busy,setBusy]=useState(false); const [uploadMessage,setUploadMessage]=useState<string|null>(null);

  async function load(){
    const id=params.id;if(!id)return;
    const {data:t}=await pvosSupabase.from("pvos_tasks").select("*").eq("id",id).single();setTask(t);if(!t)return;
    const [c,e,a,au,p]=await Promise.all([
      pvosSupabase.from("pvos_companies").select("*").eq("id",t.company_id).single(),
      pvosSupabase.from("pvos_task_evidence").select("*").eq("task_id",id).is("archived_at",null).order("created_at",{ascending:false}),
      pvosSupabase.from("pvos_task_approvals").select("*").eq("task_id",id).order("step_position"),
      pvosSupabase.from("pvos_audit_events").select("*").eq("entity_type","task").eq("entity_id",id).order("created_at",{ascending:false}).limit(20),
      t.product_id?pvosSupabase.from("pvos_products").select("*").eq("id",t.product_id).single():Promise.resolve({data:null})
    ]);
    setCompany(c.data);setEvidence(e.data??[]);setApprovals(a.data??[]);setAudit(au.data??[]);setProduct((p as any).data);
    const routeIds=[...new Set((a.data??[]).map((x:any)=>x.route_id).filter(Boolean))] as string[];
    if(routeIds.length){const {data:s}=await pvosSupabase.from("pvos_approval_steps").select("*").in("route_id",routeIds);setSteps(s??[])}else setSteps([]);
  }
  useEffect(()=>{load()},[params.id]);

  const stepBy=useMemo(()=>Object.fromEntries(steps.map(s=>[s.route_id+"|"+s.position,s])),[steps]);

  async function setStatus(status:string){
    if(!task)return;setBusy(true);
    if(status==="awaiting_review"&&approvals.length){
      const first=approvals.find(a=>a.status==="pending");
      if(first) await pvosSupabase.from("pvos_task_approvals").update({status:"in_review",received_at:new Date().toISOString()}).eq("id",first.id);
    }
    await pvosSupabase.from("pvos_tasks").update({status,completed_at:status==="complete"?new Date().toISOString():null}).eq("id",task.id);
    setBusy(false);await load();
  }
  async function addEvidence(){if(!task||!session||!evidenceTitle.trim())return;setBusy(true);await pvosSupabase.from("pvos_task_evidence").insert({task_id:task.id,title:evidenceTitle.trim(),evidence_type:"note",uploaded_by:session.user.id});setEvidenceTitle("");setBusy(false);await load()}
  async function uploadEvidence(e:ChangeEvent<HTMLInputElement>){
    const file=e.target.files?.[0];if(!file||!task||!session||!organizationId)return;setBusy(true);setUploadMessage(null);
    const path=`${organizationId}/${task.id}/${crypto.randomUUID()}-${safeName(file.name)}`;
    const {error:uploadError}=await pvosSupabase.storage.from("pvos-evidence").upload(path,file,{upsert:false});
    if(uploadError){setUploadMessage(uploadError.message);setBusy(false);e.target.value="";return}
    const {error:recordError}=await pvosSupabase.from("pvos_task_evidence").insert({task_id:task.id,title:file.name,evidence_type:"document",file_path:path,uploaded_by:session.user.id});
    setUploadMessage(recordError?recordError.message:"File uploaded securely.");setBusy(false);e.target.value="";await load();
  }
  async function openEvidence(item:any){if(!item.file_path)return;const {data,error}=await pvosSupabase.storage.from("pvos-evidence").createSignedUrl(item.file_path,60);if(error||!data?.signedUrl){setUploadMessage(error?.message??"Could not open file.");return}window.open(data.signedUrl,"_blank","noopener,noreferrer")}
  async function approveCurrent(){
    const current=approvals.find(a=>a.status==="in_review")??approvals.find(a=>a.status==="pending");if(!current)return;setBusy(true);
    await pvosSupabase.from("pvos_task_approvals").update({status:"approved",completed_at:new Date().toISOString()}).eq("id",current.id);
    const next=approvals.find(a=>a.step_position>current.step_position&&a.status==="pending");
    if(next) await pvosSupabase.from("pvos_task_approvals").update({status:"in_review",received_at:new Date().toISOString()}).eq("id",next.id);
    else await pvosSupabase.from("pvos_tasks").update({status:"complete",completed_at:new Date().toISOString()}).eq("id",task.id);
    setBusy(false);await load();
  }

  if(!task||!company)return <div className={styles.empty}>Loading task…</div>;
  const displayStatus=dueLabel(task.due_at,task.status);
  return <>
    <Header eyebrow={task.activity_type+" · "+company.name} title={task.title} sub="Live structured PV task. Status, evidence and approval handoffs are persisted with audit history." action={<Badge tone={statusTone(displayStatus)}>{displayStatus}</Badge>}/>
    <div className={styles.grid2}>
      <section className={styles.stack}>
        <div className={styles.info}><h3>Task details</h3><div className={styles.kv}><span>Company</span><span>{company.name}</span></div>{product?<div className={styles.kv}><span>Product</span><span>{product.brand_name} · {product.active_ingredient}</span></div>:null}<div className={styles.kv}><span>Owner</span><span>{task.owner_user_id===session?.user.id?"Me":"Team"}</span></div><div className={styles.kv}><span>Due</span><span>{formatDue(task.due_at)}</span></div><div className={styles.kv}><span>Priority</span><span>{niceStatus(task.priority)}</span></div><div className={styles.kv}><span>Source</span><span>{niceStatus(task.source)}</span></div>
          <div className={styles.inlineActions}>{task.status!=="in_progress"&&task.status!=="complete"?<button className={styles.buttonGhost} disabled={busy} onClick={()=>setStatus("in_progress")}>Start work</button>:null}{task.status!=="awaiting_review"&&task.status!=="complete"?<button className={styles.buttonGhost} disabled={busy} onClick={()=>setStatus("awaiting_review")}>{approvals.length?"Send into approval":"Send for review"}</button>:null}{task.status!=="complete"?<button className={styles.button} disabled={busy} onClick={()=>setStatus("complete")}>Mark complete</button>:<button className={styles.buttonGhost} disabled={busy} onClick={()=>setStatus("in_progress")}>Reopen</button>}</div>
        </div>

        <div className={styles.info}><h3>Evidence & documents</h3>
          {evidence.length?evidence.map(e=><div className={styles.kv} key={e.id}><span>{new Date(e.created_at).toLocaleDateString()}</span><span>{e.title}{e.file_path?<button className={styles.buttonGhost} style={{marginLeft:8}} onClick={()=>openEvidence(e)}>Open file</button>:null}</span></div>):<div className={styles.muted}>No evidence attached yet.</div>}
          <div className={styles.inlineActions}><input className={styles.input} value={evidenceTitle} onChange={e=>setEvidenceTitle(e.target.value)} placeholder="Evidence note"/><button className={styles.buttonGhost} disabled={busy||!evidenceTitle.trim()} onClick={addEvidence}>Add note</button></div>
          <div className={styles.inlineActions}><label className={styles.buttonGhost} style={{cursor:"pointer"}}>Upload file<input type="file" style={{display:"none"}} onChange={uploadEvidence} disabled={busy}/></label><span className={styles.muted}>Private storage · max 25 MB</span></div>
          {uploadMessage?<div className={uploadMessage.includes("uploaded")?styles.successBox:styles.errorBox} style={{marginTop:10}}>{uploadMessage}</div>:null}
        </div>
      </section>

      <aside className={styles.stack}>
        <div className={styles.info}><h3>Approval route</h3>{approvals.length?<><div className={styles.timeline}>{approvals.map(a=>{const s=stepBy[a.route_id+"|"+a.step_position];return <div key={a.id} className={[styles.step,a.status==="approved"?styles.done:a.status==="in_review"?styles.current:""].join(" ")}><span className={styles.dot}></span><div><strong>{s?.role??("Step "+a.step_position)}</strong><p>{niceStatus(a.status)}{a.completed_at?" · "+new Date(a.completed_at).toLocaleString():""}</p></div></div>})}</div>{approvals.some(a=>["in_review","pending"].includes(a.status))?<button className={styles.button} disabled={busy} onClick={approveCurrent}>Approve current step</button>:null}</>:<div className={styles.muted}>No approval workflow attached to this task.</div>}</div>
        <div className={styles.info}><h3>Audit history</h3>{audit.length?audit.map(a=><div className={styles.kv} key={a.id}><span>{new Date(a.created_at).toLocaleString()}</span><span>{niceStatus(a.event_type)}</span></div>):<div className={styles.muted}>No changes recorded yet.</div>}</div>
      </aside>
    </div>
  </>;
}
