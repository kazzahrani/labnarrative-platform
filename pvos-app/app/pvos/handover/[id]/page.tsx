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
  const [busy,setBusy]=useState<string|null>(null);

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
  const allDeputyAcknowledged=rows.length>0&&rows.every(r=>r.deputy_acknowledged_at);
  const allHandbackAcknowledged=rows.length>0&&rows.every(r=>r.qppv_handback_acknowledged_at);

  async function acknowledgeCompany(row:any){
    setBusy("ack-"+row.id);
    await pvosSupabase.from("pvos_handover_companies").update({deputy_acknowledged_at:new Date().toISOString()}).eq("id",row.id);
    const remaining=rows.filter(r=>r.id!==row.id&&!r.deputy_acknowledged_at);
    if(!remaining.length&&handover?.status==="sent"){
      await pvosSupabase.from("pvos_handovers").update({status:"accepted",accepted_at:new Date().toISOString()}).eq("id",handover.id);
    }
    setBusy(null);await load();
  }

  async function acknowledgeHandback(row:any){
    setBusy("back-"+row.id);
    await pvosSupabase.from("pvos_handover_companies").update({qppv_handback_acknowledged_at:new Date().toISOString()}).eq("id",row.id);
    setBusy(null);await load();
  }

  async function advance(){
    if(!handover)return;setBusy("global");
    const next=
      handover.status==="accepted"&&allDeputyAcknowledged?{status:"active"}:
      handover.status==="active"?{status:"handback_pending"}:
      handover.status==="handback_pending"&&allHandbackAcknowledged?{status:"closed",handback_at:new Date().toISOString()}:
      null;
    if(next) await pvosSupabase.from("pvos_handovers").update(next).eq("id",handover.id);
    setBusy(null);await load();
  }

  if(!handover)return <div className={styles.empty}>Loading handover…</div>;

  const actionLabel=
    handover.status==="accepted"?"Start leave":
    handover.status==="active"?"Begin handback":
    handover.status==="handback_pending"?"Close handback":
    null;

  const actionEnabled=
    handover.status==="accepted"?allDeputyAcknowledged:
    handover.status==="active"?true:
    handover.status==="handback_pending"?allHandbackAcknowledged:
    false;

  return <>
    <Header eyebrow="QPPV continuity record" title={"Handover · "+handover.leave_start+" → "+handover.leave_end} sub="Frozen company-by-company workload snapshot with separate acknowledgements for each client." action={<div className={styles.inlineActions} style={{marginTop:0}}><Link className={styles.buttonGhost} href="/pvos/handover">← Handovers</Link><Badge tone={handover.status==="closed"?"green":handover.status==="handback_pending"?"amber":"lime"}>{niceStatus(handover.status)}</Badge></div>}/>

    <div className={styles.grid2}>
      <section className={styles.info}>
        <h3>Continuity record</h3>
        <div className={styles.kv}><span>Leave starts</span><span>{handover.leave_start}</span></div>
        <div className={styles.kv}><span>Leave ends</span><span>{handover.leave_end}</span></div>
        <div className={styles.kv}><span>Sent</span><span>{new Date(handover.created_at).toLocaleString()}</span></div>
        <div className={styles.kv}><span>Company acknowledgements</span><span>{rows.filter(r=>r.deputy_acknowledged_at).length}/{rows.length}</span></div>
        <div className={styles.kv}><span>Handbacks acknowledged</span><span>{rows.filter(r=>r.qppv_handback_acknowledged_at).length}/{rows.length}</span></div>
        <div className={styles.kv}><span>Handback closed</span><span>{handover.handback_at?new Date(handover.handback_at).toLocaleString():"Not yet"}</span></div>
        {handover.status==="sent"?<div className={styles.notice} style={{marginTop:12}}>Each company must be acknowledged separately by the Deputy. The leave becomes ready to start only after all company handovers are acknowledged.</div>:null}
        {handover.status==="handback_pending"&&!allHandbackAcknowledged?<div className={styles.notice} style={{marginTop:12}}>Acknowledge the handback for every company before closing the leave event.</div>:null}
        {actionLabel?<div className={styles.inlineActions}><button className={styles.button} disabled={busy==="global"||!actionEnabled} onClick={advance}>{busy==="global"?"Saving…":actionLabel}</button></div>:null}
      </section>

      <aside className={styles.info}>
        <h3>Inspection evidence</h3>
        <p className={styles.sub}>This record preserves what was open when the QPPV generated the handover, even if the live task list changes later.</p>
        <div className={styles.kv}><span>Companies</span><span>{rows.length}</span></div>
        <div className={styles.kv}><span>Deputy acknowledged</span><span>{rows.filter(r=>r.deputy_acknowledged_at).length}</span></div>
        <div className={styles.kv}><span>Status</span><span>{niceStatus(handover.status)}</span></div>
      </aside>
    </div>

    {rows.map(row=>{
      const snap=row.snapshot??{};
      const taskRows=Array.isArray(snap.tasks)?snap.tasks:[];
      const company=companyBy[row.company_id];
      return <section className={styles.panel} key={row.id}>
        <div className={styles.panelHeader}>
          <div><h2>{company?.name??"Company"}</h2><span className={styles.muted}>{company?.contract_scope??""}</span></div>
          <div className={styles.inlineActions} style={{marginTop:0}}>
            <Badge tone={snap.risk==="High"?"red":snap.risk==="Medium"?"amber":"default"}>{snap.risk??"—"} risk</Badge>
            {row.deputy_acknowledged_at?<Badge tone="green">Deputy acknowledged</Badge>:handover.status==="sent"?<button className={styles.buttonGhost} disabled={busy==="ack-"+row.id} onClick={()=>acknowledgeCompany(row)}>{busy==="ack-"+row.id?"Saving…":"Deputy acknowledge"}</button>:<Badge>Not acknowledged</Badge>}
            {handover.status==="handback_pending"?(row.qppv_handback_acknowledged_at?<Badge tone="green">Handback acknowledged</Badge>:<button className={styles.buttonGhost} disabled={busy==="back-"+row.id} onClick={()=>acknowledgeHandback(row)}>{busy==="back-"+row.id?"Saving…":"Acknowledge handback"}</button>):null}
          </div>
        </div>

        <div style={{padding:"0 14px 12px"}} className={styles.muted}>
          Deputy acknowledgement: {row.deputy_acknowledged_at?new Date(row.deputy_acknowledged_at).toLocaleString():"Pending"}
          {row.qppv_handback_acknowledged_at?" · QPPV handback: "+new Date(row.qppv_handback_acknowledged_at).toLocaleString():""}
        </div>

        <div className={styles.tableWrap}><table className={styles.table}>
          <thead><tr><th>Open task</th><th>Type</th><th>Priority</th><th>Due at snapshot</th><th>Status at snapshot</th></tr></thead>
          <tbody>{taskRows.length?taskRows.map((t:any)=><tr key={t.id}><td><Link href={"/pvos/tasks/"+t.id}>{t.title}</Link></td><td>{t.activity_type}</td><td>{niceStatus(t.priority)}</td><td>{formatDue(t.due_at)}</td><td>{niceStatus(t.status)}</td></tr>):<tr><td colSpan={5}>{snap.open_tasks??0} open item(s) were recorded in the older summary snapshot.</td></tr>}</tbody>
        </table></div>
      </section>;
    })}
  </>;
}
