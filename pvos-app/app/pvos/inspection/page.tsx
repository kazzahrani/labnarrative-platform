"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Header, Badge } from "../_components";
import { usePVOS } from "../_provider";
import { pvosSupabase } from "../_pvos-supabase";
import { niceStatus } from "../_utils";
import { registrationLabel, registrationTone } from "../_registration";
import { loadInspection, loadInspectionAudit, scopeInspection, inspectionAccount, inspectionApprovals, inspectionChecks, inspectionExport, auditDescription, type InspectionData } from "../_inspection";
import InspectionChecklist from "./_checklist";
import { loadInspectionChecklist } from "../_inspection-checklist";
import styles from "../pvos.module.css";

type Tab="literature"|"handover"|"approvals"|"registration"|"tasks"|"audit";
type Row=Record<string,any>;
const tabs:[Tab,string][]=[["literature","Literature"],["handover","Handover"],["approvals","Approvals"],["registration","Registration"],["tasks","Tasks & evidence"],["audit","Audit history"]];
function time(value?:string|null){return value?new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Riyadh",dateStyle:"medium",timeStyle:"medium"}).format(new Date(value)):"Not recorded";}
function RecordId({value}:{value?:string|null}){return <span title={value||undefined}>{value?value.slice(0,8)+"…":"Not recorded"}</span>;}
function saveFile(text:string,type:string,name:string){
  const url=URL.createObjectURL(new Blob([text],{type}));
  const a=document.createElement("a");a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();window.setTimeout(()=>URL.revokeObjectURL(url),30000);
}

function RowsTable({headers,rows,render}:{headers:string[],rows:Row[],render:(row:Row)=>ReactNode[]}){
  const [page,setPage]=useState(0);
  const last=Math.max(0,Math.ceil(rows.length/50)-1),current=Math.min(page,last);
  return rows.length?<>
    <div className={styles.tableWrap}><table className={styles.table}><thead><tr>{headers.map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{rows.slice(current*50,current*50+50).map(r=><tr key={r.id}>{render(r).map((cell,i)=><td key={i}>{cell}</td>)}</tr>)}</tbody></table></div>
    <div className={styles.inlineActions} style={{padding:"0 14px 14px"}}><span className={styles.muted}>{current*50+1}–{Math.min(current*50+50,rows.length)} of {rows.length} · exports include all rows</span><button className={styles.buttonGhost} disabled={current===0} onClick={()=>setPage(current-1)}>Previous</button><button className={styles.buttonGhost} disabled={current===last} onClick={()=>setPage(current+1)}>Next</button></div>
  </>:<div className={styles.empty}>No records in this company scope.</div>;
}

function AuditDetail({row,organizationId}:{row:Row,organizationId:string}){
  const [detail,setDetail]=useState<Row|null>(row.after_data!==undefined?row:null);
  const [busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
  async function fetchDetail(){
    if(detail||busy)return;setBusy(true);setError(null);
    try{const result=await pvosSupabase.from("pvos_audit_events").select("*").eq("organization_id",organizationId).eq("id",row.id).single();if(result.error)throw result.error;setDetail(result.data);}
    catch(e){setError((e as {message?:string}).message||"Could not load this event.");}
    finally{setBusy(false);}
  }
  return <details onToggle={e=>{if(e.currentTarget.open)fetchDetail();}}><summary>Before / after</summary>{busy?<p>Loading event…</p>:error?<div className={styles.errorBox}>{error} <button className={styles.buttonGhost} onClick={fetchDetail}>Retry</button></div>:detail?<pre style={{maxWidth:480,maxHeight:300,overflow:"auto",whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{JSON.stringify({before:detail.before_data,after:detail.after_data,metadata:detail.metadata},null,2)}</pre>:null}</details>;
}

export default function Inspection(){
  const {organizationId,session}=usePVOS();
  const [view,setView]=useState<"checklist"|"evidence">("checklist");
  const [data,setData]=useState<InspectionData|null>(null);
  const [companyFilter,setCompanyFilter]=useState("all");
  const [tab,setTab]=useState<Tab>("literature");
  const [loading,setLoading]=useState(true),[error,setError]=useState<string|null>(null);
  const [exporting,setExporting]=useState<"csv"|"json"|null>(null),[exportError,setExportError]=useState<string|null>(null);
  const request=useRef(0);
  const load=useCallback(async()=>{
    if(!organizationId)return;const id=++request.current;setLoading(true);setError(null);
    try{const next=await loadInspection(pvosSupabase,organizationId);if(id===request.current)setData(next);}
    catch(e){if(id===request.current)setError(e instanceof Error?e.message:"Could not load inspection records.");}
    finally{if(id===request.current)setLoading(false);}
  },[organizationId]);
  useEffect(()=>{setData(null);setCompanyFilter("all");load();return()=>{request.current++;};},[load]);
  const scoped=useMemo(()=>data?scopeInspection(data,companyFilter):null,[data,companyFilter]);
  const approvals=useMemo(()=>scoped?inspectionApprovals(scoped):[],[scoped]);
  const checks=useMemo(()=>scoped?inspectionChecks(scoped):null,[scoped]);
  const companyBy=useMemo(()=>Object.fromEntries((data?.companies||[]).map(c=>[c.id,c.name])),[data]);
  const taskBy=useMemo(()=>Object.fromEntries((scoped?.tasks||[]).map(t=>[t.id,t])),[scoped]);
  const registrationHistory=useMemo(()=>scoped?.audit.filter(a=>a.entity_type==="product_registration")||[],[scoped]);
  const account=(id?:string|null)=>scoped?inspectionAccount(scoped,id):"Actor not recorded";
  const company=(id?:string|null)=>id?companyBy[id]||id:"Organization / shared record";
  const actor=(id?:string|null,label?:string|null)=><>{label||account(id)}{id?<div className={styles.muted}>Account <RecordId value={id}/></div>:null}</>;
  const linkRun=(id:string)=><Link href={"/pvos/literature?inspectionRun="+id}>Open screening run →</Link>;
  const shared=!!scoped&&companyFilter!=="all"&&scoped.handoverEvidence.some(e=>e.snapshot?.companies?.some((c:Row)=>c.company_id!==companyFilter));

  async function refreshChecklist(){
    if(!organizationId)return;
    const organization=organizationId;
    const next=await loadInspectionChecklist(pvosSupabase,organization);
    setData(current=>current?.organizationId===organization?{...current,...next}:current);
  }

  async function download(kind:"csv"|"json"){
    if(!data||loading||error||exporting)return;setExporting(kind);setExportError(null);
    try{
      const audit=kind==="json"?await loadInspectionAudit(pvosSupabase,data.organizationId):data.audit;
      const checklist=await loadInspectionChecklist(pvosSupabase,data.organizationId);
      const complete=scopeInspection({...data,...checklist,audit,auditLoadedAt:kind==="json"?new Date().toISOString():data.loadedAt},companyFilter);
      const out=inspectionExport(complete,companyFilter);
      const stamp=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Riyadh",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
      const name=`PVOS-inspection-${companyFilter}-${stamp}.${kind}`;
      saveFile(kind==="csv"?out.csv:JSON.stringify(out.json,null,2),kind==="csv"?"text/csv;charset=utf-8":"application/json;charset=utf-8",name);
    }catch(e){setExportError("Export was not created because the full audit history could not be loaded: "+((e as {message?:string}).message||"Refresh and retry."));}
    finally{setExporting(null);}
  }

  return <>
    <Header eyebrow="Inspection evidence" title="Prepare for inspection" sub="Prepare company evidence, record QPPV conclusions and inspect the supporting history." action={<button className={styles.buttonGhost} onClick={load} disabled={loading||!!exporting}>Refresh</button>}/>
    <div className={styles.inlineActions} style={{marginBottom:14,flexWrap:"wrap"}}>
      <label>Company <select className={styles.input} value={companyFilter} onChange={e=>setCompanyFilter(e.target.value)} disabled={loading||!!exporting}><option value="all">All companies</option>{data?.companies.map(c=><option value={c.id} key={c.id}>{c.name}</option>)}</select></label>
      <button className={styles.button} disabled={!data||loading||!!error||!!exporting} onClick={()=>download("csv")}>{exporting==="csv"?"Loading full history…":"Export CSV"}</button>
      <button className={styles.buttonGhost} disabled={!data||loading||!!error||!!exporting} onClick={()=>download("json")}>{exporting==="json"?"Loading full history…":"Export full records JSON"}</button>
    </div>
    {exportError?<div className={styles.errorBox} role="alert">{exportError}</div>:null}
    {error?<div className={styles.errorBox} role="alert">Inspection could not load every record: {error}. Refresh before exporting.</div>:loading?<div className={styles.empty}>Loading complete inspection registers…</div>:scoped&&checks?<>
      <p className={styles.muted}>Reads completed {time(scoped.loadedAt)} · All displayed times are Riyadh time; export timestamps are UTC. Exports contain file references, not attached document bytes.</p>
      {shared?<div className={styles.notice}>This scope includes shared handovers. The JSON export retains their full original snapshots, including other covered companies, so the recorded SHA-256 still refers to the original evidence.</div>:null}
      <div className={styles.inlineActions} style={{marginBottom:16}}><button className={view==="checklist"?styles.button:styles.buttonGhost} aria-pressed={view==="checklist"} onClick={()=>setView("checklist")}>Checklist</button><button className={view==="evidence"?styles.button:styles.buttonGhost} aria-pressed={view==="evidence"} onClick={()=>setView("evidence")}>Evidence & history</button></div>
      {view==="checklist"?<InspectionChecklist key={companyFilter} data={data!} companyId={companyFilter} userId={session?.user.id} onCompany={setCompanyFilter} onRefresh={refreshChecklist}/>:<>
      <div className={styles.cards}>
        {[['Literature evidence records',scoped.literatureRecords.length],['Frozen handover snapshots',scoped.handoverEvidence.length],['Attributed approval decisions',approvals.filter(a=>a.actor.recorded).length],['Registration history events',registrationHistory.length]].map(([label,count])=><div className={styles.card} key={label}><div className={styles.muted}>{label}</div><div style={{fontSize:28,marginTop:8}}>{count}</div></div>)}
      </div>
      <details className={styles.info} style={{marginBottom:16}}><summary>Control checks and outstanding work</summary><div className={styles.metricList} style={{marginTop:12}}>
        {([
          ['Completed tasks missing active evidence',checks.missingTaskEvidence],['Overdue active tasks',checks.overdueTasks],['Unfinished screening runs',checks.unfinishedRuns],['Second reviews pending or returned',checks.pendingSecondReviews],['Approval steps waiting or queued',checks.pendingApprovals],['Older approval decisions without a recorded actor',checks.unattributedApprovals],['Literature evidence without recorded second approval',checks.legacyLiterature],['Accepted handovers missing frozen evidence',checks.missingHandoverEvidence],['Products with registration status not recorded',checks.unknownRegistration],['Registered products missing an SFDA number',checks.missingRegistrationNumber]
        ] as [string,number][]).map(([label,count])=><div className={styles.metricRow} key={label}><span>{label}</span><strong className={count?styles.warn:styles.good}>{count}</strong></div>)}
      </div><p className={styles.muted}>Counts describe the stored records. An empty gap count does not establish complete journal coverage, evidence quality or regulatory compliance.</p></details>
      <div className={styles.inlineActions} style={{marginBottom:16,flexWrap:"wrap"}}>{tabs.map(([id,label])=><button key={id} className={tab===id?styles.button:styles.buttonGhost} aria-pressed={tab===id} onClick={()=>setTab(id)}>{label}</button>)}</div>
      <section className={styles.panel}><div className={styles.panelHeader}><h2>{tabs.find(([id])=>id===tab)?.[1]}</h2><span className={styles.muted}>{companyFilter==="all"?"All companies":company(companyFilter)}</span></div>
        {tab==="literature"?<RowsTable key={tab+companyFilter} headers={["Company / period","Evidence / completed","First reviewers","Second review","Earlier cycles","Record"]} rows={scoped.literatureRecords} render={r=>[
          <>{company(r.company_id)}<div className={styles.muted}>{r.period_start} → {r.period_end}</div></>,<><RecordId value={r.id}/><div className={styles.muted}>{time(r.completed_at)}</div></>,
          <>{(r.metadata?.first_reviewer_user_ids||[]).map((id:string)=><div key={id}>{actor(id)}</div>)}</>,
          <><Badge tone={r.metadata?.second_review?.status==="approved"?"green":"amber"}>{r.metadata?.second_review?.status||"Not recorded / legacy"}</Badge><div>{actor(r.metadata?.second_review?.reviewed_by)}</div><div className={styles.muted}>{time(r.metadata?.second_review?.reviewed_at)}</div><div className={styles.muted}>Selected article scope; detailed decisions in export</div></>,
          (r.metadata?.second_review?.metadata?.history||[]).length,linkRun(r.run_id)
        ]}/>:null}
        {tab==="handover"?<RowsTable key={tab+companyFilter} headers={["Companies / leave","Current status","Assigned accounts","Deputy acknowledgement / handback","Frozen evidence","Record"]} rows={scoped.handovers} render={h=>{
          const e=scoped.handoverEvidence.find(e=>e.handover_id===h.id),rows=scoped.handoverCompanies.filter(c=>c.handover_id===h.id);
          return [<>{rows.map(c=>company(c.company_id)).join(", ")}<div className={styles.muted}>{h.leave_start} → {h.leave_end}</div></>,<><Badge>{niceStatus(h.status)}</Badge>{h.workflow_version!==2?<div className={styles.muted}>Legacy workflow</div>:null}</>,<><div>QPPV: {actor(h.qppv_user_id,h.participants?.qppv?.email)}</div><div>Deputy: {actor(h.deputy_user_id,h.participants?.deputy?.email)}</div></>,<>{rows.map(c=><div key={c.id}><div>{company(c.company_id)}</div><div className={styles.muted}>Deputy: {account(c.deputy_acknowledged_by)} · {time(c.deputy_acknowledged_at)}</div><div className={styles.muted}>Handback: {account(c.qppv_handback_acknowledged_by)} · {time(c.qppv_handback_acknowledged_at)}</div></div>)}</>,e?<><RecordId value={e.id}/><div className={styles.muted}>{time(e.created_at)}</div><div className={styles.muted} title={e.snapshot_sha256}>SHA-256: {e.snapshot_sha256.slice(0,16)}…</div></>:"No frozen evidence",<Link href={"/pvos/handover/"+h.id}>Open record / PDF →</Link>];
        }}/>:null}
        {tab==="approvals"?<><h3 style={{padding:"0 14px"}}>Named task reviews</h3><RowsTable headers={["Company / submitted task","Cycle / status","Sent / assigned","Decision / time","Reason","Record"]} rows={scoped.taskReviews||[]} render={r=>[
          <>{company(r.company_id)}<div>{r.snapshot?.task?.title}</div></>,<>{r.cycle} · {r.status}</>,<>{r.sent_by_email} → {r.assigned_email}<div className={styles.muted}>{time(r.sent_at)}</div></>,<>{r.decided_email||"Awaiting reviewer"}<div className={styles.muted}>{r.decided_at?time(r.decided_at):"Pending"}</div></>,r.decision_note||r.submission_note||"—",<Link href={"/pvos/tasks/"+r.task_id+"#task-review"}>Open review history →</Link>
        ]}/><h3 style={{padding:"0 14px"}}>Staged approval history</h3><RowsTable key={tab+companyFilter} headers={["Company / task","Step / decision","Account / decision time","Workspace role","Outcome","Record"]} rows={approvals} render={a=>[
          <>{company(a.task?.company_id)}<div>{a.decision_context?.task_title||a.task?.title}</div></>,<>{a.step_role}<div><Badge tone={a.status==="approved"?"green":"default"}>{niceStatus(a.status)}</Badge></div></>,<>{actor(a.actor_id,a.actor.name)}<div className={styles.muted}>{time(a.actor.at)}</div></>,a.decision_context?.acting_workspace_role||"Not recorded",<>{a.outcome}{a.comment?<div className={styles.muted}>{a.comment}</div>:null}</>,<Link href={"/pvos/tasks/"+a.task_id+"#approval"}>Open task & evidence →</Link>
        ]}/></>:null}
        {tab==="registration"?<><RowsTable key={tab+companyFilter} headers={["Company / product","User-recorded registration","SFDA number","Reference","Record"]} rows={scoped.products} render={p=>[
          <>{company(p.company_id)}<div>{p.brand_name}</div></>,<Badge tone={registrationTone(p.registration_status)}>{registrationLabel(p.registration_status)}</Badge>,p.sfda_registration_number||"Not recorded",p.registration_reference||"Not recorded",<Link href={"/pvos/companies/"+p.company_id}>Open company / edit →</Link>
        ]}/><h3 style={{padding:"0 14px"}}>Registration change history</h3><RowsTable key={"registration-history"+companyFilter} headers={["Recorded","Product ID","Account","Status change","Number / reference change","Reason"]} rows={registrationHistory} render={a=>[
          time(a.created_at),<RecordId value={a.entity_id}/>,actor(a.actor_user_id,a.metadata?.actor_email),<>{registrationLabel(a.before_data?.registration_status)} → {registrationLabel(a.after_data?.registration_status)}</>,<><div>{a.before_data?.sfda_registration_number||"Not recorded"} → {a.after_data?.sfda_registration_number||"Not recorded"}</div><div className={styles.muted}>{a.before_data?.registration_reference||"Not recorded"} → {a.after_data?.registration_reference||"Not recorded"}</div></>,a.metadata?.reason||"Initial record"
        ]}/><p className={styles.muted} style={{padding:"0 14px 14px"}}>User-recorded details; no automatic SFDA registry verification. Earlier values without a history entry remain unattributed.</p></>:null}
        {tab==="tasks"?<><RowsTable key={tab+companyFilter} headers={["Company / task","Type","Status","Due / completed","Active evidence","Record"]} rows={scoped.tasks} render={t=>[
          <>{company(t.company_id)}<div>{t.title}</div></>,t.activity_type,niceStatus(t.status),<><div>Due: {time(t.due_at)}</div><div className={styles.muted}>Completed: {time(t.completed_at)}</div></>,scoped.evidence.filter(e=>e.task_id===t.id&&!e.archived_at).length,<Link href={"/pvos/tasks/"+t.id+"#evidence"}>Open evidence →</Link>
        ]}/><h3 style={{padding:"0 14px"}}>Evidence register, including archived references</h3><RowsTable key={"evidence"+companyFilter} headers={["Task / evidence","Recorded","Account","Reference","Archived"]} rows={scoped.evidence} render={e=>[
          <>{taskBy[e.task_id]?.title}<div>{e.title}</div></>,time(e.created_at),actor(e.uploaded_by),e.file_path||e.external_url||"Evidence note",e.archived_at?time(e.archived_at):"Active"
        ]}/></>:null}
        {tab==="audit"?<RowsTable key={tab+companyFilter} headers={["Recorded","Company / scope","Entity / action","Account","Details"]} rows={scoped.audit} render={a=>[
          time(a.created_at),company(a.company_id),<>{niceStatus(a.entity_type)}<div className={styles.muted}><RecordId value={a.entity_id}/></div><div>{auditDescription(a)}</div></>,actor(a.actor_user_id,a.metadata?.actor_email||a.actor_email),<AuditDetail key={String(a.id)+scoped.loadedAt} row={a} organizationId={scoped.organizationId}/>
        ]}/>:null}
      </section>
      </>}
    </>:null}
  </>;
}
