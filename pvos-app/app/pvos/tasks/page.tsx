"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Header, Badge, statusTone } from "../_components";
import { NewTaskModal } from "../_new-task-modal";
import { usePVOS } from "../_provider";
import { pvosSupabase } from "../_pvos-supabase";
import { dueLabel, formatDue } from "../_utils";
import styles from "../pvos.module.css";

export default function TasksPage(){
  const {organizationId}=usePVOS();
  const [tasks,setTasks]=useState<any[]>([]);
  const [companies,setCompanies]=useState<any[]>([]);
  const [loading,setLoading]=useState(true);
  const [showNew,setShowNew]=useState(false);

  async function load(){
    if(!organizationId)return;
    setLoading(true);
    const [t,c]=await Promise.all([
      pvosSupabase.from("pvos_tasks").select("*").eq("organization_id",organizationId).neq("status","cancelled").order("due_at",{ascending:true,nullsFirst:false}),
      pvosSupabase.from("pvos_companies").select("id,name").eq("organization_id",organizationId).order("name")
    ]);
    setTasks(t.data??[]);
    setCompanies(c.data??[]);
    setLoading(false);
  }

  useEffect(()=>{load()},[organizationId]);

  const company=useMemo(()=>Object.fromEntries(companies.map(c=>[c.id,c.name])),[companies]);

  return <>
    <Header eyebrow="PV workload" title="Tasks" sub="View and manage all PV activities in one place, including recurring obligations, ad-hoc requests, deadlines and work in progress." action={<button className={styles.button} onClick={()=>setShowNew(true)}>+ New task</button>}/>
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
    <NewTaskModal open={showNew} onClose={()=>setShowNew(false)} onCreated={load}/>
  </>;
}
