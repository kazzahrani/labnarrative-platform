"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Header, Badge, statusTone } from "../../_components";
import { usePVOS } from "../../_provider";
import { pvosSupabase } from "../../_pvos-supabase";
import { dueLabel, formatDue, niceStatus } from "../../_utils";
import styles from "../../pvos.module.css";

export default function TaskPage(){
  const params=useParams<{id:string}>();
  const {session}=usePVOS();
  const [task,setTask]=useState<any|null>(null);
  const [company,setCompany]=useState<any|null>(null);
  const [product,setProduct]=useState<any|null>(null);
  const [evidence,setEvidence]=useState<any[]>([]);
  const [approvals,setApprovals]=useState<any[]>([]);
  const [audit,setAudit]=useState<any[]>([]);
  const [evidenceTitle,setEvidenceTitle]=useState("");
  const [busy,setBusy]=useState(false);

  async function load(){
    const id=params.id; if(!id)return;
    const {data:t}=await pvosSupabase.from("pvos_tasks").select("*").eq("id",id).single();
    setTask(t); if(!t)return;
    const queries:any[]=[
      pvosSupabase.from("pvos_companies").select("*").eq("id",t.company_id).single(),
      pvosSupabase.from("pvos_task_evidence").select("*").eq("task_id",id).is("archived_at",null).order("created_at",{ascending:false}),
      pvosSupabase.from("pvos_task_approvals").select("*").eq("task_id",id).order("step_position"),
      pvosSupabase.from("pvos_audit_events").select("*").eq("entity_type","task").eq("entity_id",id).order("created_at",{ascending:false}).limit(20)
    ];
    if(t.product_id) queries.push(pvosSupabase.from("pvos_products").select("*").eq("id",t.product_id).single());
    const r=await Promise.all(queries);
    setCompany(r[0].data); setEvidence(r[1].data??[]); setApprovals(r[2].data??[]); setAudit(r[3].data??[]);
    setProduct(t.product_id?r[4]?.data:null);
  }

  useEffect(()=>{load()},[params.id]);

  async function setStatus(status:string){
    if(!task)return; setBusy(true);
    await pvosSupabase.from("pvos_tasks").update({status,completed_at:status==="complete"?new Date().toISOString():null}).eq("id",task.id);
    setBusy(false); await load();
  }

  async function addEvidence(){
    if(!task||!session||!evidenceTitle.trim())return; setBusy(true);
    await pvosSupabase.from("pvos_task_evidence").insert({task_id:task.id,title:evidenceTitle.trim(),evidence_type:"document",uploaded_by:session.user.id});
    setEvidenceTitle("");setBusy(false);await load();
  }

  async function approveCurrent(){
    const current=approvals.find(a=>a.status==="in_review")??approvals.find(a=>a.status==="pending");
    if(!current)return; setBusy(true);
    await pvosSupabase.from("pvos_task_approvals").update({status:"approved",completed_at:new Date().toISOString()}).eq("id",current.id);
    const next=approvals.find(a=>a.step_position>current.step_position&&a.status==="pending");
    if(next) await pvosSupabase.from("pvos_task_approvals").update({status:"in_review",received_at:new Date().toISOString()}).eq("id",next.id);
    else await pvosSupabase.from("pvos_tasks").update({status:"complete",completed_at:new Date().toISOString()}).eq("id",task.id);
    setBusy(false);await load();
  }

  if(!task||!company)return <div className={styles.empty}>Loading task…</div>;
  const displayStatus=dueLabel(task.due_at,task.status);
  return <>
    <Header eyebrow={task.activity_type+" · "+company.name} title={task.title} sub="Live structured PV task. Status changes are persisted and written automatically to the audit trail." action={<Badge tone={statusTone(displayStatus)}>{displayStatus}</Badge>}/>
    <div className={styles.grid2}>
      <section className={styles.stack}>
        <div className={styles.info}><h3>Task details</h3><div className={styles.kv}><span>Company</span><span>{company.name}</span></div>{product?<div className={styles.kv}><span>Product</span><span>{product.brand_name} · {product.active_ingredient}</span></div>:null}<div className={styles.kv}><span>Owner</span><span>{task.owner_user_id===session?.user.id?"Me":"Team"}</span></div><div className={styles.kv}><span>Due</span><span>{formatDue(task.due_at)}</span></div><div className={styles.kv}><span>Priority</span><span>{niceStatus(task.priority)}</span></div><div className={styles.kv}><span>Source</span><span>{niceStatus(task.source)}</span></div>
        <div className={styles.inlineActions}>{task.status!=="in_progress"&&task.status!=="complete"?<button className={styles.buttonGhost} disabled={busy} onClick={()=>setStatus("in_progress")}>Start work</button>:null}{task.status!=="awaiting_review"&&task.status!=="complete"?<button className={styles.buttonGhost} disabled={busy} onClick={()=>setStatus("awaiting_review")}>Send for review</button>:null}{task.status!=="complete"?<button className={styles.button} disabled={busy} onClick={()=>setStatus("complete")}>Mark complete</button>:<button className={styles.buttonGhost} disabled={busy} onClick={()=>setStatus("in_progress")}>Reopen</button>}</div></div>
        <div className={styles.info}><h3>Evidence & documents</h3>{evidence.map(e=><div className={styles.kv} key={e.id}><span>{new Date(e.created_at).toLocaleDateString()}</span><span>{e.title}</span></div>)}<div className={styles.inlineActions}><input className={styles.input} value={evidenceTitle} onChange={e=>setEvidenceTitle(e.target.value)} placeholder="Evidence title / document note"/><button className={styles.buttonGhost} disabled={busy||!evidenceTitle.trim()} onClick={addEvidence}>Add evidence</button></div></div>
      </section>
      <aside className={styles.stack}>
        <div className={styles.info}><h3>Approval route</h3>{approvals.length?<><div className={styles.timeline}>{approvals.map(a=><div key={a.id} className={[styles.step,a.status==="approved"?styles.done:a.status==="in_review"?styles.current:""].join(" ")}><span className={styles.dot}></span><div><strong>Step {a.step_position}</strong><p>{niceStatus(a.status)}{a.completed_at?" · "+new Date(a.completed_at).toLocaleString():""}</p></div></div>)}</div>{approvals.some(a=>["in_review","pending"].includes(a.status))?<button className={styles.button} disabled={busy} onClick={approveCurrent}>Approve current step</button>:null}</>:<div className={styles.muted}>No approval workflow attached to this task.</div>}</div>
        <div className={styles.info}><h3>Audit history</h3>{audit.length?audit.map(a=><div className={styles.kv} key={a.id}><span>{new Date(a.created_at).toLocaleString()}</span><span>{niceStatus(a.event_type)}</span></div>):<div className={styles.muted}>No changes recorded yet.</div>}</div>
      </aside>
    </div>
  </>;
}
