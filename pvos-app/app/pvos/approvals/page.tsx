"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Header, Badge } from "../_components";
import { usePVOS } from "../_provider";
import { pvosSupabase } from "../_pvos-supabase";
import { niceStatus } from "../_utils";
import { readApprovalRows,canApproveStep,decisionAttribution,approvalOutcome,type Member } from "../_approval";
import {TaskReviewQueue} from "../_task-review";
import styles from "../pvos.module.css";

export default function Approvals(){
  const {organizationId,session}=usePVOS();
  const [approvals,setApprovals]=useState<any[]>([]),[steps,setSteps]=useState<any[]>([]),[audit,setAudit]=useState<any[]>([]);
  const [members,setMembers]=useState<Member[]>([]);
  const [taskReviews,setTaskReviews]=useState<any[]>([]);
  const [tab,setTab]=useState<"waiting"|"history">("waiting");
  const [company,setCompany]=useState(""),[search,setSearch]=useState("");
  const [busy,setBusy]=useState<string|null>(null),[loading,setLoading]=useState(true);
  const [error,setError]=useState<string|null>(null),[result,setResult]=useState<{taskId:string;text:string}|null>(null);

  async function load(){
    if(!organizationId)return;setLoading(true);setError(null);
    try{
      const [rows,events,directory,reviews]=await Promise.all([
        readApprovalRows<any>((from,to)=>pvosSupabase.from("pvos_task_approvals").select("*,pvos_tasks!inner(id,title,status,company_id,organization_id,pvos_companies(name))").eq("pvos_tasks.organization_id",organizationId).order("id").range(from,to)),
        readApprovalRows<any>((from,to)=>pvosSupabase.from("pvos_audit_events").select("id,entity_id,actor_user_id,event_type,before_data,after_data,created_at").eq("organization_id",organizationId).eq("entity_type","approval").eq("event_type","update").order("id").range(from,to)),
        pvosSupabase.rpc("pvos_member_directory",{p_organization_id:organizationId}),
        readApprovalRows<any>((from,to)=>pvosSupabase.from("pvos_task_reviews").select("*,pvos_tasks!inner(pvos_companies(name))").eq("organization_id",organizationId).order("sent_at",{ascending:false}).order("id").range(from,to))
      ]);
      if(directory.error)throw new Error(directory.error.message);
      const routeIds=[...new Set(rows.map(a=>a.route_id).filter(Boolean))] as string[];
      const definitions:any[]=[];
      for(let i=0;i<routeIds.length;i+=100){
        definitions.push(...await readApprovalRows<any>((from,to)=>pvosSupabase.from("pvos_approval_steps").select("*").in("route_id",routeIds.slice(i,i+100)).order("id").range(from,to)));
      }
      setApprovals(rows);setAudit(events);setMembers(directory.data??[]);setSteps(definitions);setTaskReviews(reviews);
    }catch(e){setError(e instanceof Error?e.message:"Could not load approval history. Retry Refresh.");}
    finally{setLoading(false);}
  }
  useEffect(()=>{setApprovals([]);setTaskReviews([]);setResult(null);load()},[organizationId]);

  const stepBy=useMemo(()=>Object.fromEntries(steps.map(s=>[s.route_id+"|"+s.position,s])),[steps]);
  const actorBy=useMemo(()=>Object.fromEntries(approvals.map(a=>[a.id,decisionAttribution(a,audit,members)])),[approvals,audit,members]);
  const companies=useMemo(()=>[...new Map([...approvals.map(a=>({id:a.pvos_tasks.company_id,name:a.pvos_tasks.pvos_companies?.name??"Company"})),...taskReviews.map(r=>({id:r.company_id,name:r.pvos_tasks?.pvos_companies?.name??"Company"}))].map(c=>[c.id,c])).values()].sort((a,b)=>a.name.localeCompare(b.name)),[approvals,taskReviews]);
  function label(a:any){return a.decision_context?.step_role||stepBy[a.route_id+"|"+a.step_position]?.role||"Step "+a.step_position;}
  const filtered=approvals.filter(a=>(!company||a.pvos_tasks.company_id===company)&&[a.pvos_tasks.title,a.pvos_tasks.pvos_companies?.name,label(a),actorBy[a.id]?.name].join(" ").toLowerCase().includes(search.toLowerCase()));
  const active=filtered.filter(a=>a.status==="in_review").sort((a,b)=>String(a.received_at).localeCompare(String(b.received_at)));
  const queued=filtered.filter(a=>a.status==="pending");
  const history=filtered.filter(a=>["approved","rejected","skipped"].includes(a.status)).sort((a,b)=>String(actorBy[b.id]?.at??"").localeCompare(String(actorBy[a.id]?.at??"")));
  const filteredReviews=taskReviews.filter(r=>(!company||r.company_id===company)&&[r.snapshot.task.title,r.assigned_email,r.sent_by_email,r.pvos_tasks?.pvos_companies?.name].join(" ").toLowerCase().includes(search.toLowerCase()));

  async function approve(a:any){
    if(busy)return;setBusy(a.id);setError(null);setResult(null);
    try{
      const {data,error}=await pvosSupabase.rpc("pvos_approve_task_step",{p_approval_id:a.id});
      if(error)throw new Error(error.message);
      setResult({taskId:a.task_id,text:data.destination==="next_step"?`Approved. Sent to ${data.next_step_role}; this decision is now in History.`:"Final approval recorded. Task completed; its evidence remains on the task record."});
      await load();
    }catch(e){setError(e instanceof Error?e.message:"Approval failed. Refresh and try again.");}
    finally{setBusy(null);}
  }

  return <>
    <Header eyebrow="Accountability" title="Approval tracking" sub="Waiting steps and permanent decision history. Approved work stays on its task record with the attached evidence." action={<button className={styles.buttonGhost} disabled={loading||!!busy} onClick={load}>Refresh</button>}/>
    {error?<div className={styles.errorBox} role="alert">{error}</div>:null}
    {result?<div className={styles.successBox} role="status" style={{marginBottom:14}}>{result.text} <Link href={`/pvos/tasks/${result.taskId}#evidence`}>Open task & evidence →</Link></div>:null}
    <div className={styles.inlineActions} style={{marginBottom:16}}>
      <button className={tab==="waiting"?styles.button:styles.buttonGhost} aria-pressed={tab==="waiting"} onClick={()=>setTab("waiting")}>Waiting ({active.length+filteredReviews.filter(r=>r.status==="pending").length})</button>
      <button className={tab==="history"?styles.button:styles.buttonGhost} aria-pressed={tab==="history"} onClick={()=>setTab("history")}>History ({history.length+filteredReviews.filter(r=>r.status!=="pending").length})</button>
      <label>Company <select className={styles.input} value={company} onChange={e=>setCompany(e.target.value)}><option value="">All companies</option>{companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <label>Search <input className={styles.input} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Task, step or reviewer"/></label>
    </div>
    {!loading&&!error?<TaskReviewQueue rows={taskReviews} company={company} search={search} history={tab==="history"}/>:null}
    {loading?<div className={styles.empty}>Loading approval records…</div>:tab==="waiting"?<>
      <section className={styles.panel}><div className={styles.panelHeader}><h2>Currently waiting</h2><span className={styles.muted}>{active.length} active step(s)</span></div>
        {active.length?<div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Company / task</th><th>Current step / reviewer</th><th>Waiting since</th><th>After approval</th><th></th></tr></thead><tbody>{active.map(a=>{
          const next=approvals.filter(x=>x.task_id===a.task_id&&x.step_position>a.step_position&&x.status==="pending").sort((x,y)=>x.step_position-y.step_position)[0];
          const canApprove=canApproveStep(a,stepBy[a.route_id+"|"+a.step_position],session?.user.id,members);
          return <tr key={a.id}><td><div className={styles.muted}>{a.pvos_tasks.pvos_companies?.name}</div><Link href={`/pvos/tasks/${a.task_id}#approval`}>{a.pvos_tasks.title}</Link></td><td>{label(a)}<div className={styles.muted}>{a.assigned_user_id?members.find(m=>m.user_id===a.assigned_user_id)?.email??a.assigned_user_id:"Unassigned · role reviewer or administrator"}</div></td><td>{a.received_at?new Date(a.received_at).toLocaleString():"—"}</td><td>{next?"Next: "+label(next):"Task completed; evidence retained"}</td><td>{canApprove?<button className={styles.buttonGhost} disabled={!!busy} onClick={()=>approve(a)}>{busy===a.id?"Saving…":"Approve"}</button>:<span className={styles.muted}>Awaiting reviewer</span>}</td></tr>;
        })}</tbody></table></div>:<div className={styles.empty}>Nothing is waiting for approval. Previous decisions are in History.</div>}
      </section>
      <section className={styles.panel}><div className={styles.panelHeader}><h2>Queued steps</h2><span className={styles.muted}>{queued.length} awaiting submission or an earlier reviewer</span></div>{queued.length?<div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Company / task</th><th>Step</th><th>Status</th></tr></thead><tbody>{queued.map(a=><tr key={a.id}><td><div className={styles.muted}>{a.pvos_tasks.pvos_companies?.name}</div><Link href={`/pvos/tasks/${a.task_id}#approval`}>{a.pvos_tasks.title}</Link></td><td>{label(a)}</td><td><Badge>Queued</Badge></td></tr>)}</tbody></table></div>:<div className={styles.empty}>No queued steps.</div>}</section>
    </>:<section className={styles.panel}><div className={styles.panelHeader}><h2>Approval history</h2><span className={styles.muted}>Decisions remain visible after the task is complete</span></div>
      {history.length?<div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Company / task</th><th>Step / decision</th><th>Decision by / time</th><th>Outcome / record</th></tr></thead><tbody>{history.map(a=>{
        const actor=actorBy[a.id];
        return <tr key={a.id}><td><div className={styles.muted}>{a.pvos_tasks.pvos_companies?.name}</div><Link href={`/pvos/tasks/${a.task_id}#approval`}>{a.decision_context?.task_title??a.pvos_tasks.title}</Link></td><td>{label(a)}<div><Badge tone={a.status==="approved"?"green":a.status==="rejected"?"red":"default"}>{niceStatus(a.status)}</Badge></div>{a.comment?<div className={styles.muted}>{a.comment}</div>:null}</td><td>{actor.name}<div className={styles.muted}>{actor.at?new Date(actor.at).toLocaleString():"Time not recorded"}</div>{a.decision_context?.acting_workspace_role?<div className={styles.muted}>Workspace role: {niceStatus(a.decision_context.acting_workspace_role)}</div>:null}{!actor.recorded?<div className={styles.muted}>Older record; assignment does not verify the approver.</div>:null}</td><td>{approvalOutcome(a,a.pvos_tasks,approvals,stepBy)}<div className={styles.muted}>Current task: {niceStatus(a.pvos_tasks.status)}</div><Link href={`/pvos/tasks/${a.task_id}#evidence`}>Open task & evidence →</Link></td></tr>;
      })}</tbody></table></div>:<div className={styles.empty}>No decisions match these filters.</div>}
      <p className={styles.muted} style={{padding:"0 14px 14px"}}>Final approval completes the PVOS task. It does not submit a report to a health authority or send a document externally.</p>
    </section>}
  </>;
}
