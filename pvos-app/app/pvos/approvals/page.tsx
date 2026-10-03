"use client";

import { useEffect, useMemo, useState } from "react";
import { Header, Badge } from "../_components";
import { usePVOS } from "../_provider";
import { pvosSupabase } from "../_pvos-supabase";
import { niceStatus } from "../_utils";
import styles from "../pvos.module.css";

export default function Approvals(){
  const {organizationId}=usePVOS();
  const [approvals,setApprovals]=useState<any[]>([]);
  const [tasks,setTasks]=useState<any[]>([]);
  const [companies,setCompanies]=useState<any[]>([]);
  const [steps,setSteps]=useState<any[]>([]);
  const [busy,setBusy]=useState<string|null>(null);

  async function load(){
    if(!organizationId)return;
    const [t,c]=await Promise.all([
      pvosSupabase.from("pvos_tasks").select("*").eq("organization_id",organizationId),
      pvosSupabase.from("pvos_companies").select("*").eq("organization_id",organizationId)
    ]);
    const taskRows=t.data??[]; setTasks(taskRows); setCompanies(c.data??[]);
    if(!taskRows.length){setApprovals([]);return;}
    const {data:a}=await pvosSupabase.from("pvos_task_approvals").select("*").in("task_id",taskRows.map(x=>x.id)).order("received_at",{ascending:true});
    setApprovals(a??[]);
    const routeIds=[...new Set((a??[]).map((x:any)=>x.route_id).filter(Boolean))] as string[];
    if(routeIds.length){const {data:s}=await pvosSupabase.from("pvos_approval_steps").select("*").in("route_id",routeIds);setSteps(s??[]);}
  }
  useEffect(()=>{load()},[organizationId]);

  const taskBy=useMemo(()=>Object.fromEntries(tasks.map(t=>[t.id,t])),[tasks]);
  const companyBy=useMemo(()=>Object.fromEntries(companies.map(c=>[c.id,c])),[companies]);
  const stepBy=useMemo(()=>Object.fromEntries(steps.map(s=>[s.route_id+"|"+s.position,s])),[steps]);
  const active=approvals.filter(a=>a.status!=="approved"&&a.status!=="skipped");

  async function approve(a:any){
    setBusy(a.id);
    await pvosSupabase.from("pvos_task_approvals").update({status:"approved",completed_at:new Date().toISOString()}).eq("id",a.id);
    const allForTask=approvals.filter(x=>x.task_id===a.task_id);
    const next=allForTask.find(x=>x.step_position>a.step_position&&x.status==="pending");
    if(next) await pvosSupabase.from("pvos_task_approvals").update({status:"in_review",received_at:new Date().toISOString()}).eq("id",next.id);
    else await pvosSupabase.from("pvos_tasks").update({status:"complete",completed_at:new Date().toISOString()}).eq("id",a.task_id);
    setBusy(null);await load();
  }

  return <>
    <Header eyebrow="Accountability" title="Approval tracking" sub="Track documents and tasks through each approval step. See who currently has it, how long it has been waiting, and the full approval history."/>
    <section className={styles.panel}><div className={styles.panelHeader}><h2>Currently waiting</h2><span className={styles.muted}>{active.length} active approval step(s)</span></div>
    {active.length?<div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Company</th><th>Task</th><th>Step</th><th>Status</th><th>Waiting since</th><th></th></tr></thead><tbody>{active.map(a=>{const t=taskBy[a.task_id];const s=stepBy[a.route_id+"|"+a.step_position];return <tr key={a.id}><td>{companyBy[t?.company_id]?.name??"—"}</td><td>{t?.title??"Task"}</td><td>{s?.role??("Step "+a.step_position)}</td><td><Badge tone={a.status==="in_review"?"amber":"default"}>{niceStatus(a.status)}</Badge></td><td>{new Date(a.received_at).toLocaleString()}</td><td>{["in_review","pending"].includes(a.status)?<button className={styles.buttonGhost} disabled={busy===a.id} onClick={()=>approve(a)}>{busy===a.id?"Saving…":"Approve"}</button>:null}</td></tr>})}</tbody></table></div>:<div className={styles.empty}>Nothing is waiting for approval.</div>}</section>
  </>;
}
