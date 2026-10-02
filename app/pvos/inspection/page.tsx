"use client";

import { useEffect, useMemo, useState } from "react";
import { Header } from "../_components";
import { usePVOS } from "../_provider";
import { pvosSupabase } from "../_pvos-supabase";
import styles from "../pvos.module.css";

function csvCell(value:unknown){
  const s=value==null?"":String(value);
  return '"'+s.replaceAll('"','""')+'"';
}

export default function Inspection(){
  const {organizationId}=usePVOS();
  const [tasks,setTasks]=useState<any[]>([]);
  const [evidence,setEvidence]=useState<any[]>([]);
  const [companies,setCompanies]=useState<any[]>([]);
  const [audit,setAudit]=useState<any[]>([]);

  useEffect(()=>{if(!organizationId)return;(async()=>{
    const [t,c,a]=await Promise.all([
      pvosSupabase.from("pvos_tasks").select("*").eq("organization_id",organizationId).neq("status","cancelled"),
      pvosSupabase.from("pvos_companies").select("*").eq("organization_id",organizationId),
      pvosSupabase.from("pvos_audit_events").select("*").eq("organization_id",organizationId).order("created_at",{ascending:false}).limit(2000)
    ]);
    const taskRows=t.data??[];setTasks(taskRows);setCompanies(c.data??[]);setAudit(a.data??[]);
    if(taskRows.length){const {data:e}=await pvosSupabase.from("pvos_task_evidence").select("*").in("task_id",taskRows.map(x=>x.id)).is("archived_at",null);setEvidence(e??[]);}
  })()},[organizationId]);

  const companyBy=useMemo(()=>Object.fromEntries(companies.map(c=>[c.id,c])),[companies]);
  const evidenceCounts=useMemo(()=>{
    const map:Record<string,number>={};
    for(const e of evidence) map[e.task_id]=(map[e.task_id]??0)+1;
    return map;
  },[evidence]);
  const metrics=useMemo(()=>{
    const completed=tasks.filter(t=>t.status==="complete").length;
    const evidenceTaskIds=new Set(evidence.map(e=>e.task_id));
    const missing=tasks.filter(t=>t.status==="complete"&&!evidenceTaskIds.has(t.id)).length;
    const overdue=tasks.filter(t=>t.status!=="complete"&&t.due_at&&new Date(t.due_at)<new Date()).length;
    const score=tasks.length?Math.max(0,Math.min(100,Math.round(((completed + (tasks.length-missing) + (tasks.length-overdue))/(tasks.length*3))*100))):100;
    return {completed,missing,overdue,score};
  },[tasks,evidence]);

  function exportCsv(){
    const header=["Company","Task","Activity type","Status","Priority","Due","Completed","Evidence records","Source","Task ID"];
    const rows=tasks.map(t=>[
      companyBy[t.company_id]?.name??"",
      t.title,t.activity_type,t.status,t.priority,t.due_at??"",t.completed_at??"",
      evidenceCounts[t.id]??0,t.source,t.id
    ]);
    const auditHeader=["Audit timestamp","Company","Entity type","Event","Entity ID","Actor user ID"];
    const auditRows=audit.map(a=>[
      a.created_at,companyBy[a.company_id]?.name??"",a.entity_type,a.event_type,a.entity_id??"",a.actor_user_id??""
    ]);
    const text=[
      "# PVOS TASK & EVIDENCE REGISTER",
      header.map(csvCell).join(","),
      ...rows.map(r=>r.map(csvCell).join(",")),
      "",
      "# PVOS AUDIT HISTORY",
      auditHeader.map(csvCell).join(","),
      ...auditRows.map(r=>r.map(csvCell).join(","))
    ].join("\n");
    const blob=new Blob([text],{type:"text/csv;charset=utf-8"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url;a.download="PVOS-inspection-export-"+new Date().toISOString().slice(0,10)+".csv";
    document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
  }

  return <>
    <Header eyebrow="Inspection readiness" title="Can we prove the work was done?" sub="A live operational evidence view. The percentage below is a prototype workflow-health indicator, not a regulatory certification or SFDA score."/>
    <div className={styles.grid2}>
      <section className={styles.info}><h3>Workflow evidence snapshot</h3><div style={{fontSize:42,fontWeight:900,letterSpacing:"-.05em",marginBottom:10}}>{metrics.score}%</div><div className={styles.progress}><span style={{width:metrics.score+"%"}}></span></div><p className={styles.sub} style={{marginTop:14}}>{metrics.missing} completed task(s) are missing evidence and {metrics.overdue} active task(s) are overdue.</p></section>
      <aside className={styles.info}><h3>Inspection export</h3><p className={styles.sub}>Export the current task/evidence register plus the append-only audit history. This is a V0 operational export, not an SFDA-formatted submission package.</p><div className={styles.inlineActions}><button className={styles.button} onClick={exportCsv}>Export CSV</button><span className={styles.pill}>{companies.length} companies tracked</span></div></aside>
    </div>
    <section className={styles.panel}><div className={styles.panelHeader}><h2>Control checks</h2><span className={styles.muted}>Calculated from the live PVOS database</span></div><div style={{padding:14}} className={styles.metricList}>
      <div className={styles.metricRow}><span>Completed PV activities</span><strong className={styles.good}>{metrics.completed}</strong></div>
      <div className={styles.metricRow}><span>Completed tasks missing evidence</span><strong className={metrics.missing?styles.bad:styles.good}>{metrics.missing}</strong></div>
      <div className={styles.metricRow}><span>Overdue active tasks</span><strong className={metrics.overdue?styles.warn:styles.good}>{metrics.overdue}</strong></div>
      <div className={styles.metricRow}><span>Evidence records retained</span><strong className={styles.good}>{evidence.length}</strong></div>
      <div className={styles.metricRow}><span>Audit events retained</span><strong className={styles.good}>{audit.length}</strong></div>
    </div></section>
  </>;
}
