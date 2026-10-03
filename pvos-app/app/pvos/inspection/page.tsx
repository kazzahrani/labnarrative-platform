"use client";

import { useEffect, useMemo, useState } from "react";
import { Header } from "../_components";
import { usePVOS } from "../_provider";
import { pvosSupabase } from "../_pvos-supabase";
import { niceStatus } from "../_utils";
import styles from "../pvos.module.css";

function csvCell(value:unknown){
  const s=value==null?"":String(value);
  return '"'+s.replaceAll('"','""')+'"';
}

function localDateStamp(){
  const d=new Date();
  const p=(n:number)=>String(n).padStart(2,"0");
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
}

function auditLabel(a:any){
  const before=a.before_data??{};
  const after=a.after_data??{};
  if(a.entity_type==="task"){
    if(a.event_type==="insert") return "Task created";
    if(a.event_type==="delete") return "Task deleted";
    if(before.status!==after.status && after.status) return "Task status changed to "+niceStatus(after.status);
    return "Task updated";
  }
  if(a.entity_type==="approval"){
    if(a.event_type==="insert") return "Approval step created";
    if(after.status==="approved") return "Approval step approved";
    if(after.status==="in_review") return "Approval step sent for review";
    return "Approval step updated";
  }
  if(a.entity_type==="evidence"){
    if(a.event_type==="insert") return after.file_path?"Evidence file uploaded":"Evidence note added";
    return "Evidence updated";
  }
  if(a.entity_type==="obligation"){
    if(a.event_type==="insert") return "Recurring obligation created";
    return "Recurring obligation updated";
  }
  if(a.entity_type==="handover"){
    if(a.event_type==="insert") return "Handover created";
    if(before.status!==after.status && after.status) return "Handover status changed to "+niceStatus(after.status);
    return "Handover updated";
  }
  if(a.entity_type==="handover_company"){
    if(a.event_type==="insert") return "Company handover snapshot created";
    if(!before.deputy_acknowledged_at && after.deputy_acknowledged_at) return "Deputy acknowledged company handover";
    if(!before.qppv_handback_acknowledged_at && after.qppv_handback_acknowledged_at) return "QPPV acknowledged company handback";
    return "Company handover updated";
  }
  return niceStatus(a.event_type);
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
    if(taskRows.length){
      const {data:e}=await pvosSupabase.from("pvos_task_evidence").select("*").in("task_id",taskRows.map(x=>x.id)).is("archived_at",null);
      setEvidence(e??[]);
    }
  })()},[organizationId]);

  const companyBy=useMemo(()=>Object.fromEntries(companies.map(c=>[c.id,c])),[companies]);
  const taskBy=useMemo(()=>Object.fromEntries(tasks.map(t=>[t.id,t])),[tasks]);
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
    const taskHeader=["Company","Task","Activity type","Status","Priority","Due","Completed","Evidence records","Source"];
    const taskRows=tasks.map(t=>[
      companyBy[t.company_id]?.name??"",
      t.title,t.activity_type,niceStatus(t.status),niceStatus(t.priority),t.due_at??"",t.completed_at??"",
      evidenceCounts[t.id]??0,niceStatus(t.source)
    ]);

    const evidenceHeader=["Evidence timestamp","Company","Task","Evidence","Type","File attached"];
    const evidenceRows=evidence.map(e=>{
      const t=taskBy[e.task_id];
      return [
        e.created_at,
        companyBy[t?.company_id]?.name??"",
        t?.title??"",
        e.title,
        niceStatus(e.evidence_type),
        e.file_path?"Yes":"No"
      ];
    });

    const auditHeader=["Audit timestamp","Company / scope","Record","Action"];
    const auditRows=audit.map(a=>[
      a.created_at,
      companyBy[a.company_id]?.name??"Organization-wide",
      niceStatus(a.entity_type),
      auditLabel(a)
    ]);

    const text=[
      "# PVOS TASK REGISTER",
      taskHeader.map(csvCell).join(","),
      ...taskRows.map(r=>r.map(csvCell).join(",")),
      "",
      "# PVOS EVIDENCE REGISTER",
      evidenceHeader.map(csvCell).join(","),
      ...evidenceRows.map(r=>r.map(csvCell).join(",")),
      "",
      "# PVOS AUDIT HISTORY",
      auditHeader.map(csvCell).join(","),
      ...auditRows.map(r=>r.map(csvCell).join(","))
    ].join("\n");

    const blob=new Blob([text],{type:"text/csv;charset=utf-8"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url;a.download="PVOS-inspection-export-"+localDateStamp()+".csv";
    document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
  }

  return <>
    <Header eyebrow="Inspection readiness" title="Can we prove the work was done?" sub="Check whether completed PV activities have supporting evidence and whether important work is overdue. Use the records and audit history to help prepare for inspection. The percentage is a PVOS workflow indicator, not an SFDA score or certification."/>
    <div className={styles.grid2}>
      <section className={styles.info}><h3>Workflow evidence snapshot</h3><div style={{fontSize:42,fontWeight:900,letterSpacing:"-.05em",marginBottom:10}}>{metrics.score}%</div><div className={styles.progress}><span style={{width:metrics.score+"%"}}></span></div><p className={styles.sub} style={{marginTop:14}}>{metrics.missing} completed task(s) are missing evidence and {metrics.overdue} active task(s) are overdue.</p></section>
      <aside className={styles.info}><h3>Inspection export</h3><p className={styles.sub}>Export a readable task register, evidence register and append-only audit history. Internal UUIDs are intentionally excluded from this reviewer-facing export.</p><div className={styles.inlineActions}><button className={styles.button} onClick={exportCsv}>Export CSV</button><span className={styles.pill}>{companies.length} companies tracked</span></div></aside>
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
