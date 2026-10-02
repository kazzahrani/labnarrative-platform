"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Header, Badge, statusTone } from "../_components";
import { usePVOS } from "../_provider";
import { pvosSupabase } from "../_pvos-supabase";
import { dueLabel, formatDue } from "../_utils";
import styles from "../pvos.module.css";

export default function TasksPage(){
  const {organizationId,session}=usePVOS();
  const [tasks,setTasks]=useState<any[]>([]);
  const [companies,setCompanies]=useState<any[]>([]);
  const [loading,setLoading]=useState(true);
  const [showNew,setShowNew]=useState(false);

  const [products,setProducts]=useState<any[]>([]);
  const [routes,setRoutes]=useState<any[]>([]);
  const [companyId,setCompanyId]=useState("");
  const [productId,setProductId]=useState("");
  const [routeId,setRouteId]=useState("");
  const [title,setTitle]=useState("");
  const [type,setType]=useState("Literature");
  const [priority,setPriority]=useState("medium");
  const [due,setDue]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);

  async function load(){
    if(!organizationId)return;
    setLoading(true);
    const [t,c]=await Promise.all([
      pvosSupabase.from("pvos_tasks").select("*").eq("organization_id",organizationId).neq("status","cancelled").order("due_at",{ascending:true,nullsFirst:false}),
      pvosSupabase.from("pvos_companies").select("id,name").eq("organization_id",organizationId).order("name")
    ]);
    setTasks(t.data??[]);
    setCompanies(c.data??[]);
    if(!companyId&&c.data?.[0]) setCompanyId(c.data[0].id);
    setLoading(false);
  }

  useEffect(()=>{load()},[organizationId]);

  useEffect(()=>{if(!companyId){setProducts([]);setRoutes([]);return;}(async()=>{
    const [p,r]=await Promise.all([
      pvosSupabase.from("pvos_products").select("id,brand_name").eq("company_id",companyId).order("brand_name"),
      pvosSupabase.from("pvos_approval_routes").select("id,name,activity_type").eq("company_id",companyId).eq("active",true).order("created_at")
    ]);
    setProducts(p.data??[]);
    setRoutes(r.data??[]);
    setProductId("");
    setRouteId("");
  })()},[companyId]);

  const company=useMemo(()=>Object.fromEntries(companies.map(c=>[c.id,c.name])),[companies]);

  function resetForm(){
    setTitle("");setType("Literature");setPriority("medium");setDue("");setProductId("");setRouteId("");setError(null);
  }

  function closeModal(){
    if(busy)return;
    setShowNew(false);
    resetForm();
  }

  async function submit(e:FormEvent){
    e.preventDefault();
    if(!organizationId||!session)return;
    setBusy(true);setError(null);

    const {data,error:e2}=await pvosSupabase.from("pvos_tasks").insert({
      organization_id:organizationId,
      company_id:companyId,
      product_id:productId||null,
      title,
      activity_type:type,
      source:"manual",
      status:"not_started",
      priority,
      owner_user_id:session.user.id,
      due_at:due?new Date(due).toISOString():null
    }).select("id").single();

    if(e2){setBusy(false);setError(e2.message);return;}

    if(routeId){
      const {data:steps,error:stepError}=await pvosSupabase.from("pvos_approval_steps").select("*").eq("route_id",routeId).order("position");
      if(stepError){setBusy(false);setError(stepError.message);return;}
      if(steps?.length){
        const {error:approvalError}=await pvosSupabase.from("pvos_task_approvals").insert(steps.map((s:any)=>({
          task_id:data.id,route_id:routeId,step_position:s.position,assigned_user_id:s.assignee_user_id,status:"pending"
        })));
        if(approvalError){setBusy(false);setError(approvalError.message);return;}
      }
    }

    setBusy(false);
    setShowNew(false);
    resetForm();
    await load();
  }

  return <>
    <Header eyebrow="PV workload" title="Tasks" sub="All PV activities in one place so you can always return to work in progress." action={<button className={styles.button} onClick={()=>setShowNew(true)}>+ New task</button>}/>
    <section className={styles.panel}>
      <div className={styles.panelHeader}><h2>All tasks</h2><span className={styles.muted}>{tasks.length} total</span></div>
      {loading?<div className={styles.empty}>Loading tasks…</div>:<div className={styles.tableWrap}><table className={styles.table}>
        <thead><tr><th>Company</th><th>Task</th><th>Type</th><th>Due</th><th>Status</th></tr></thead>
        <tbody>{tasks.map(t=>{const s=dueLabel(t.due_at,t.status);return <tr key={t.id}>
          <td>{company[t.company_id]??"—"}</td>
          <td><Link href={"/pvos/tasks/"+t.id}>{t.title}</Link></td>
          <td>{t.activity_type}</td>
          <td>{formatDue(t.due_at)}</td>
          <td><Badge tone={statusTone(s)}>{s}</Badge></td>
        </tr>})}</tbody>
      </table></div>}
    </section>

    {showNew?<div className={styles.modalBackdrop} onMouseDown={e=>{if(e.target===e.currentTarget)closeModal()}}>
      <div className={styles.modalCard} role="dialog" aria-modal="true" aria-labelledby="new-task-title">
        <div className={styles.modalHeader}>
          <div><div className={styles.eyebrow}>New PV activity</div><h2 id="new-task-title">Create task</h2></div>
          <button className={styles.modalClose} type="button" onClick={closeModal} aria-label="Close">×</button>
        </div>

        <form onSubmit={submit}>
          <div className={styles.formGrid}>
            <label>Company<select className={styles.input} value={companyId} onChange={e=>setCompanyId(e.target.value)} required>{companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            <label>Product (optional)<select className={styles.input} value={productId} onChange={e=>setProductId(e.target.value)}><option value="">Portfolio / none</option>{products.map(p=><option key={p.id} value={p.id}>{p.brand_name}</option>)}</select></label>
            <label className={styles.full}>Task title<input className={styles.input} value={title} onChange={e=>setTitle(e.target.value)} required placeholder="e.g. SFDA inquiry response"/></label>
            <label>Activity type<select className={styles.input} value={type} onChange={e=>setType(e.target.value)}>{["Literature","Signal","RMP","PSSF","PSUR/PBRER","Training","Reconciliation","SOP","SFDA Inquiry","CAPA","Other"].map(x=><option key={x}>{x}</option>)}</select></label>
            <label>Priority<select className={styles.input} value={priority} onChange={e=>setPriority(e.target.value)}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></label>
            <label>Deadline<input className={styles.input} type="datetime-local" value={due} onChange={e=>setDue(e.target.value)}/></label>
            <label>Approval workflow<select className={styles.input} value={routeId} onChange={e=>setRouteId(e.target.value)}><option value="">None</option>{routes.map(r=><option key={r.id} value={r.id}>{r.name}{r.activity_type?" · "+r.activity_type:""}</option>)}</select></label>
          </div>
          {error?<div className={styles.errorBox} style={{marginTop:14}}>{error}</div>:null}
          <div className={styles.modalActions}>
            <button type="button" className={styles.buttonGhost} onClick={closeModal}>Cancel</button>
            <button className={styles.button} disabled={busy}>{busy?"Creating…":"Create task"}</button>
          </div>
        </form>
      </div>
    </div>:null}
  </>;
}
