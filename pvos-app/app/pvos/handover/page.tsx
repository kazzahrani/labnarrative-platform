"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Header, Badge } from "../_components";
import { usePVOS } from "../_provider";
import { pvosSupabase } from "../_pvos-supabase";
import { formatDue, niceStatus } from "../_utils";
import styles from "../pvos.module.css";

function dateInput(offset:number){
  const d=new Date(); d.setDate(d.getDate()+offset);
  return d.toISOString().slice(0,10);
}

export default function Handover(){
  const {organizationId,session}=usePVOS();
  const [companies,setCompanies]=useState<any[]>([]);
  const [tasks,setTasks]=useState<any[]>([]);
  const [handovers,setHandovers]=useState<any[]>([]);
  const [start,setStart]=useState(dateInput(1));
  const [end,setEnd]=useState(dateInput(7));
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState<string|null>(null);

  async function load(){
    if(!organizationId)return;
    const [c,t,h]=await Promise.all([
      pvosSupabase.from("pvos_companies").select("*").eq("organization_id",organizationId).order("name"),
      pvosSupabase.from("pvos_tasks").select("*").eq("organization_id",organizationId).neq("status","complete").neq("status","cancelled"),
      pvosSupabase.from("pvos_handovers").select("*").eq("organization_id",organizationId).order("created_at",{ascending:false}).limit(10)
    ]);
    setCompanies(c.data??[]);setTasks(t.data??[]);setHandovers(h.data??[]);
  }

  useEffect(()=>{load()},[organizationId]);

  const preview=useMemo(()=>{
    const leaveStart=new Date(start+"T00:00:00");
    const leaveEnd=new Date(end+"T23:59:59");
    const today=new Date(); today.setHours(0,0,0,0);

    return companies.map(c=>{
      const ct=tasks.filter(t=>t.company_id===c.id);
      const sorted=[...ct].filter(t=>t.due_at).sort((a,b)=>new Date(a.due_at).getTime()-new Date(b.due_at).getTime());
      const dueDuring=ct.filter(t=>{
        if(!t.due_at)return false;
        const d=new Date(t.due_at);
        return d>=leaveStart&&d<=leaveEnd;
      });
      const overdue=ct.some(t=>t.due_at&&new Date(t.due_at)<today);
      const highPriorityDuring=dueDuring.some(t=>["high","critical"].includes(t.priority));
      const risk=overdue||highPriorityDuring?"High":dueDuring.length||ct.length>2?"Medium":"Low";
      return {company:c,open:ct.length,next:sorted[0],dueDuring:dueDuring.length,risk};
    }).filter(x=>x.open>0);
  },[companies,tasks,start,end]);

  async function create(){
    if(!organizationId||!session)return;setBusy(true);setMessage(null);
    const {data:h,error}=await pvosSupabase.from("pvos_handovers").insert({
      organization_id:organizationId,qppv_user_id:session.user.id,deputy_user_id:session.user.id,
      leave_start:start,leave_end:end,status:"sent"
    }).select("*").single();

    if(error){setMessage(error.message);setBusy(false);return;}

    const rows=preview.map(p=>{
      const companyTasks=tasks.filter(t=>t.company_id===p.company.id).map(t=>({
        id:t.id,title:t.title,activity_type:t.activity_type,status:t.status,priority:t.priority,due_at:t.due_at
      }));
      return {
        handover_id:h.id,company_id:p.company.id,
        snapshot:{
          open_tasks:p.open,due_during_leave:p.dueDuring,next_deadline:p.next?.due_at??null,next_task:p.next?.title??null,
          risk:p.risk,tasks:companyTasks,created_at:new Date().toISOString(),created_from:"PVOS V0"
        }
      };
    });

    if(rows.length) await pvosSupabase.from("pvos_handover_companies").insert(rows);
    setMessage(`${rows.length} company handover record(s) generated. Open the leave event to review each company separately.`);
    setBusy(false);await load();
  }

  return <>
    <Header eyebrow="QPPV continuity" title="Leave handover" sub="Prepare a separate handover for every company before QPPV leave. PVOS highlights work due during the leave period, freezes the current workload, and preserves company-by-company acknowledgement records."/>
    <div className={styles.grid2}>
      <section className={styles.info}>
        <h3>Create handover</h3>
        <div className={styles.formGrid}>
          <label>Leave starts<input className={styles.input} type="date" value={start} onChange={e=>setStart(e.target.value)}/></label>
          <label>Leave ends<input className={styles.input} type="date" value={end} onChange={e=>setEnd(e.target.value)}/></label>
        </div>
        <div className={styles.notice} style={{marginTop:14}}><strong>{preview.length} company workspace(s) have open work.</strong><br/>PVOS will freeze the current open tasks separately for every company and flag deadlines that fall during leave.</div>
        {message?<div className={styles.successBox} style={{marginTop:12}}>{message}</div>:null}
        <div className={styles.inlineActions}><button className={styles.button} disabled={busy||!preview.length} onClick={create}>{busy?"Generating…":`Generate handover for ${preview.length} companies`}</button></div>
        <div className={styles.muted} style={{marginTop:10}}>Prototype note: team invitations are not enabled yet, so Deputy acknowledgement is not identity-verified in V0. The company-by-company handover structure is ready for review.</div>
      </section>

      <aside className={styles.info}>
        <h3>Continuity flow</h3>
        <div className={styles.kv}><span>1</span><span>QPPV freezes open work</span></div>
        <div className={styles.kv}><span>2</span><span>Deputy reviews each company</span></div>
        <div className={styles.kv}><span>3</span><span>Leave becomes active</span></div>
        <div className={styles.kv}><span>4</span><span>QPPV reviews each company on return</span></div>
        <div className={styles.kv}><span>5</span><span>Handback closes</span></div>
      </aside>
    </div>

    <section className={styles.panel}>
      <div className={styles.panelHeader}><h2>Current handover preview</h2><span className={styles.muted}>Calculated from live tasks and selected leave dates</span></div>
      <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Company</th><th>Open items</th><th>Due during leave</th><th>Next deadline</th><th>Risk</th></tr></thead>
      <tbody>{preview.map(p=><tr key={p.company.id}><td>{p.company.name}</td><td>{p.open}</td><td>{p.dueDuring}</td><td>{p.next?`${p.next.title} · ${formatDue(p.next.due_at)}`:"—"}</td><td><Badge tone={p.risk==="High"?"red":p.risk==="Medium"?"amber":"default"}>{p.risk}</Badge></td></tr>)}</tbody></table></div>
    </section>

    <section className={styles.panel}>
      <div className={styles.panelHeader}><h2>Saved leave events</h2><span className={styles.muted}>{handovers.length} recent</span></div>
      {handovers.length?<div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Leave</th><th>Status</th><th>Created</th><th></th></tr></thead>
      <tbody>{handovers.map(h=><tr key={h.id}><td>{h.leave_start} → {h.leave_end}</td><td><Badge tone={h.status==="closed"?"green":h.status==="handback_pending"?"amber":"lime"}>{niceStatus(h.status)}</Badge></td><td>{new Date(h.created_at).toLocaleString()}</td><td><Link className={styles.buttonGhost} href={"/pvos/handover/"+h.id}>Open</Link></td></tr>)}</tbody></table></div>:<div className={styles.empty}>No handovers created yet.</div>}
    </section>
  </>;
}
