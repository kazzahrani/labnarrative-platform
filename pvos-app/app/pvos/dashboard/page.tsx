"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Header, Badge, statusTone } from "../_components";
import { NewTaskModal } from "../_new-task-modal";
import { usePVOS } from "../_provider";
import { pvosSupabase } from "../_pvos-supabase";
import { dueLabel, formatDue } from "../_utils";
import styles from "../pvos.module.css";

export default function Dashboard(){
  const {organizationId,session,reloadToken}=usePVOS();
  const [tasks,setTasks]=useState<any[]>([]);
  const [companies,setCompanies]=useState<any[]>([]);
  const [products,setProducts]=useState<any[]>([]);
  const [loading,setLoading]=useState(true);
  const [companyFilter,setCompanyFilter]=useState("all");
  const [typeFilter,setTypeFilter]=useState("all");
  const [statusFilter,setStatusFilter]=useState("all");
  const [queueFilter,setQueueFilter]=useState("attention");
  const [showNew,setShowNew]=useState(false);

  useEffect(()=>{ if(!organizationId)return; let active=true; (async()=>{
    setLoading(true);
    const [t,c]=await Promise.all([
      pvosSupabase.from("pvos_tasks").select("*").eq("organization_id",organizationId).neq("status","cancelled").order("due_at",{ascending:true,nullsFirst:false}),
      pvosSupabase.from("pvos_companies").select("*").eq("organization_id",organizationId).order("name")
    ]);
    if(!active)return;
    const cs=c.data??[]; setCompanies(cs); setTasks(t.data??[]);
    if(cs.length){
      const {data:p}=await pvosSupabase.from("pvos_products").select("*").in("company_id",cs.map(x=>x.id));
      if(active)setProducts(p??[]);
    }
    setLoading(false);
  })(); return()=>{active=false}; },[organizationId,reloadToken]);

  const company=useMemo(()=>Object.fromEntries(companies.map(c=>[c.id,c])),[companies]);
  const product=useMemo(()=>Object.fromEntries(products.map(p=>[p.id,p])),[products]);
  const labels=useMemo(()=>tasks.map(t=>({...t,displayStatus:dueLabel(t.due_at,t.status)})),[tasks]);
  const filtered=useMemo(()=>labels.filter(t=>{
    const due=t.due_at?new Date(t.due_at).getTime():null;
    const withinWeek=due===null||due<=Date.now()+7*86400000;
    const attention=t.status!=="complete"&&(withinWeek||["awaiting_review","awaiting_external","in_progress"].includes(t.status));
    return (queueFilter==="all"||attention) &&
      (companyFilter==="all"||t.company_id===companyFilter) &&
      (typeFilter==="all"||t.activity_type===typeFilter) &&
      (statusFilter==="all"||t.displayStatus===statusFilter);
  }),[labels,queueFilter,companyFilter,typeFilter,statusFilter]);
  const activityTypes=[...new Set(labels.map(t=>t.activity_type))].sort();
  const statusTypes=[...new Set(labels.map(t=>t.displayStatus))].sort();
  const counts={
    overdue:labels.filter(t=>t.displayStatus==="Overdue").length,
    today:labels.filter(t=>t.displayStatus==="Due today").length,
    week:labels.filter(t=>["Overdue","Due today","Due soon"].includes(t.displayStatus)).length,
    waiting:labels.filter(t=>t.displayStatus==="Awaiting approval").length,
    complete:labels.filter(t=>t.status==="complete").length,
  };

  return <>
    <Header eyebrow="My PV operation" title="What needs attention now?" sub="See what needs attention across all companies — overdue work, upcoming deadlines, approvals and active PV tasks. Use the filters to focus on a company, activity type or status." action={<button className={styles.button} onClick={()=>setShowNew(true)}>+ New task</button>}/>
    <section className={styles.cards}>
      <div className={[styles.card,styles.danger].join(" ")}><span>Overdue</span><strong>{counts.overdue}</strong></div>
      <div className={[styles.card,styles.warning].join(" ")}><span>Due today</span><strong>{counts.today}</strong></div>
      <div className={styles.card}><span>Due this week</span><strong>{counts.week}</strong></div>
      <div className={styles.card}><span>Awaiting others</span><strong>{counts.waiting}</strong></div>
      <div className={[styles.card,styles.accent].join(" ")}><span>Completed</span><strong>{counts.complete}</strong></div>
    </section>
    <section className={styles.panel}>
      <div className={styles.panelHeader}><h2>Unified workload</h2><span className={styles.muted}>{loading?"Loading…":`${companies.length} companies`}</span></div>
      <div style={{padding:"12px 14px",display:"grid",gridTemplateColumns:"repeat(4,minmax(150px,220px))",gap:10,borderBottom:"1px solid #1d252d"}}>
        <select className={styles.input} value={queueFilter} onChange={e=>setQueueFilter(e.target.value)}><option value="attention">Attention queue</option><option value="all">All scheduled work</option></select>
        <select className={styles.input} value={companyFilter} onChange={e=>setCompanyFilter(e.target.value)}><option value="all">All companies</option>{companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <select className={styles.input} value={typeFilter} onChange={e=>setTypeFilter(e.target.value)}><option value="all">All activity types</option>{activityTypes.map(x=><option key={x}>{x}</option>)}</select>
        <select className={styles.input} value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="all">All statuses</option>{statusTypes.map(x=><option key={x}>{x}</option>)}</select>
      </div>
      {loading?<div className={styles.empty}>Loading live PV tasks…</div>:filtered.length?<div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Company</th><th>Task</th><th>Type</th><th>Owner</th><th>Due</th><th>Status</th></tr></thead>
      <tbody>{filtered.map(t=><tr key={t.id}><td><Link href={"/pvos/companies/"+t.company_id}>{company[t.company_id]?.name??"—"}</Link></td><td><Link href={"/pvos/tasks/"+t.id}>{t.title}</Link>{t.product_id?<div className={styles.muted}>{product[t.product_id]?.brand_name??"Product"}</div>:null}</td><td>{t.activity_type}</td><td>{t.owner_user_id===session?.user.id?"Me":"Team"}</td><td>{formatDue(t.due_at)}</td><td><Badge tone={statusTone(t.displayStatus)}>{t.displayStatus}</Badge></td></tr>)}</tbody></table></div>:<div className={styles.empty}>No tasks need attention under these filters. Switch to “All scheduled work” to see future recurring tasks.</div>}
    </section>
    <NewTaskModal open={showNew} onClose={()=>setShowNew(false)} onCreated={()=>location.reload()}/>
  </>;
}
