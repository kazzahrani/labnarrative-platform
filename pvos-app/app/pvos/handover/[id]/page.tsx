"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Header, Badge } from "../../_components";
import { pvosSupabase } from "../../_pvos-supabase";
import { formatDue, niceStatus } from "../../_utils";
import styles from "../../pvos.module.css";

export default function HandoverDetail(){
  const params=useParams<{id:string}>();
  const [handover,setHandover]=useState<any|null>(null);
  const [rows,setRows]=useState<any[]>([]);
  const [companies,setCompanies]=useState<any[]>([]);
  const [busy,setBusy]=useState(false);

  async function load(){
    if(!params.id)return;
    const [h,r]=await Promise.all([
      pvosSupabase.from("pvos_handovers").select("*").eq("id",params.id).single(),
      pvosSupabase.from("pvos_handover_companies").select("*").eq("handover_id",params.id)
    ]);
    setHandover(h.data);setRows(r.data??[]);
    const ids=(r.data??[]).map((x:any)=>x.company_id);
    if(ids.length){
      const {data:c}=await pvosSupabase.from("pvos_companies").select("id,name,contract_scope").in("id",ids);
      setCompanies(c??[]);
    }else setCompanies([]);
  }
  useEffect(()=>{load()},[params.id]);

  const companyBy=useMemo(()=>Object.fromEntries(companies.map(c=>[c.id,c])),[companies]);

  async function advance(){
    if(!handover)return;setBusy(true);
    const next=
      handover.status==="sent"?{status:"accepted",accepted_at:new Date().toISOString()}:
      handover.status==="accepted"?{status:"active"}:
      handover.status==="active"?{status:"handback_pending"}:
      handover.status==="handback_pending"?{status:"closed",handback_at:new Date().toISOString()}:
      null;
    if(next) await pvosSupabase.from("pvos_handovers").update(next).eq("id",handover.id);
    setBusy(false);await load();
  }

  if(!handover)return <div className={styles.empty}>Loading handover…</div>;

  const actionLabel=
    handover.status==="sent"?"Deputy acknowledge":
    handover.status==="accepted"?"Start leave":
    handover.status==="active"?"Begin handback":
    handover.status==="handback_pending"?"Close handback":
    null;

  return <>
    <Header eyebrow="QPPV continuity record" title={"Handover · "+handover.leave_start+" → "+handover.leave_end} sub="Frozen company-by-company workload snapshot with acknowledgement and handback state." action={<div className={styles.inlineActions} style={{marginTop:0}}><Link className={styles.buttonGhost} href="/pvos/handover">← Handovers</Link><Badge tone={handover.status==="closed"?"green":handover.status==="handback_pending"?"amber":"lime"}>{niceStatus(handover.status)}</Badge></div>}/>
    <div className={styles.grid2}>
      <section className={styles.info}>
        <h3>Continuity record</h3>
        <div className={styles.kv}><span>Leave starts</span><span>{handover.leave_start}</span></div>
        <div className={styles.kv}><span>Leave ends</span><span>{handover.leave_end}</span></div>
        <div className={styles.kv}><span>Sent</span><span>{new Date(handover.created_at).toLocaleString()}</span></div>
        <div className={styles.kv}><span>Deputy accepted</span><span>{handover.accepted_at?new Date(handover.accepted_at).toLocaleString():"Not yet"}</span></div>
        <div className={styles.kv}><span>Handback closed</span><span>{handover.handback_at?new Date(handover.handback_at).toLocaleString():"Not yet"}</span></div>
        {actionLabel?<div className={styles.inlineActions}><button className={styles.button} disabled={busy} onClick={advance}>{busy?"Saving…":actionLabel}</button></div>:null}
      </section>
      <aside className={styles.info}>
        <h3>Inspection evidence</h3>
        <p className={styles.sub}>This record preserves what was open when the QPPV generated the handover, even if the live task list changes later.</p>
        <div className={styles.kv}><span>Companies</span><span>{rows.length}</span></div>
        <div className={styles.kv}><span>Status</span><span>{niceStatus(handover.status)}</span></div>
      </aside>
    </div>

    {rows.map(row=>{
      const snap=row.snapshot??{};
      const taskRows=Array.isArray(snap.tasks)?snap.tasks:[];
      return <section className={styles.panel} key={row.id}>
        <div className={styles.panelHeader}><div><h2>{companyBy[row.company_id]?.name??"Company"}</h2><span className={styles.muted}>{companyBy[row.company_id]?.contract_scope??""}</span></div><Badge tone={snap.risk==="High"?"red":snap.risk==="Medium"?"amber":"default"}>{snap.risk??"—"} risk</Badge></div>
        <div className={styles.tableWrap}><table className={styles.table}>
          <thead><tr><th>Open task</th><th>Type</th><th>Priority</th><th>Due at snapshot</th><th>Status at snapshot</th></tr></thead>
          <tbody>{taskRows.length?taskRows.map((t:any)=><tr key={t.id}><td><Link href={"/pvos/tasks/"+t.id}>{t.title}</Link></td><td>{t.activity_type}</td><td>{niceStatus(t.priority)}</td><td>{formatDue(t.due_at)}</td><td>{niceStatus(t.status)}</td></tr>):<tr><td colSpan={5}>{snap.open_tasks??0} open item(s) were recorded in the older summary snapshot.</td></tr>}</tbody>
        </table></div>
      </section>;
    })}
  </>;
}
