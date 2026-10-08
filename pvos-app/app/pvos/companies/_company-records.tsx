"use client";
import Link from "next/link";
import {useEffect,useState} from "react";
import {Help,Badge} from "../_components";
import {pvosSupabase} from "../_pvos-supabase";
import {readApprovalRows} from "../_approval";
import styles from "../pvos.module.css";
export function CompanyRecords({companyId,organizationId,view}:{companyId:string,organizationId:string,view:"documents"|"history"}) {
  const [rows,setRows]=useState<any[]>([]),[screenings,setScreenings]=useState<any[]>([]),[handovers,setHandovers]=useState<any[]>([]),[error,setError]=useState(""),[loading,setLoading]=useState(true);
  useEffect(()=>{let active=true;setLoading(true);setError("");(async()=>{
    if(view==="documents")return {rows:await readApprovalRows<any>((from,to)=>pvosSupabase.from("pvos_task_evidence").select("*,pvos_tasks!inner(title,company_id,organization_id)").eq("pvos_tasks.company_id",companyId).eq("pvos_tasks.organization_id",organizationId).is("archived_at",null).order("id").range(from,to)),screenings:[],handovers:[]};
    const [records,leaves,audit]=await Promise.all([
      readApprovalRows<any>((from,to)=>pvosSupabase.from("pvos_literature_screening_records").select("*").eq("organization_id",organizationId).eq("company_id",companyId).order("id").range(from,to)),
      readApprovalRows<any>((from,to)=>pvosSupabase.from("pvos_handover_companies").select("*,pvos_handovers!inner(id,organization_id,leave_start,leave_end,status)").eq("company_id",companyId).eq("pvos_handovers.organization_id",organizationId).order("id").range(from,to)),
      pvosSupabase.from("pvos_audit_events").select("id,entity_type,event_type,created_at,actor_user_id").eq("organization_id",organizationId).eq("company_id",companyId).order("created_at",{ascending:false}).limit(100)
    ]);if(audit.error)throw audit.error;return {rows:audit.data||[],screenings:records,handovers:leaves};
  })().then(d=>{if(active){setRows(d.rows);setScreenings(d.screenings);setHandovers(d.handovers)}}).catch(e=>{if(active)setError(e.message)}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[companyId,organizationId,view]);
  if(loading)return <div className={styles.empty}>Loading company records…</div>;
  if(error)return <div className={styles.errorBox} role="alert">{error}</div>;
  return <>
    {view==="documents"?<section className={styles.panel}><div className={styles.panelHeader}><h2>Documents & evidence</h2><Help>Documents and evidence already attached to company tasks. Open the originating task to view or add evidence; existing versions and review locks remain in effect.</Help></div>{rows.length?<div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Document / evidence</th><th>Activity</th><th>Added</th><th></th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td>{r.title}<div className={styles.muted}>{r.version||r.evidence_type}</div></td><td>{r.pvos_tasks.title}</td><td>{new Date(r.created_at).toLocaleDateString("en-GB",{timeZone:"Asia/Riyadh"})}</td><td><Link className={styles.buttonGhost} href={`/pvos/tasks/${r.task_id}#evidence`}>Open evidence</Link></td></tr>)}</tbody></table></div>:<div className={styles.empty}>No documents or evidence attached yet.</div>}</section>:<>
      <section className={styles.panel}><div className={styles.panelHeader}><h2>Screening records</h2><Link className={styles.buttonGhost} href={`/pvos/literature?company=${companyId}&view=runs`}>All screening records</Link></div>{screenings.length?<div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Period</th><th>Status</th><th></th></tr></thead><tbody>{screenings.map(r=><tr key={r.id}><td>{r.period_start} – {r.period_end}</td><td><Badge tone="green">Completed</Badge></td><td><Link className={styles.buttonGhost} href={`/pvos/literature?company=${companyId}&inspectionRun=${r.run_id}`}>View record</Link></td></tr>)}</tbody></table></div>:<div className={styles.empty}>No completed screening records.</div>}</section>
      <section className={styles.panel}><div className={styles.panelHeader}><h2>Handover records</h2></div>{handovers.length?<div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Leave period</th><th>Status</th><th></th></tr></thead><tbody>{handovers.map(r=><tr key={r.id}><td>{r.pvos_handovers.leave_start} – {r.pvos_handovers.leave_end}</td><td>{r.pvos_handovers.status}</td><td><Link className={styles.buttonGhost} href={"/pvos/handover/"+r.handover_id}>View handover</Link></td></tr>)}</tbody></table></div>:<div className={styles.empty}>No handover records.</div>}</section>
      <details className={styles.info} style={{marginTop:16}}><summary>Recent activity ({rows.length}) <Help>Latest 100 company audit events. Full evidence and audit exports remain available in Inspection.</Help></summary>{rows.map(r=><div className={styles.kv} key={r.id}><span>{new Date(r.created_at).toLocaleString("en-GB",{timeZone:"Asia/Riyadh"})}</span><span>{r.entity_type} · {r.event_type}</span></div>)}</details>
    </>}
  </>;
}
