"use client";

import { useEffect, useMemo, useState } from "react";
import { Header, Badge } from "../_components";
import { usePVOS } from "../_provider";
import { pvosSupabase } from "../_pvos-supabase";
import { dueLabel, formatDue, niceStatus } from "../_utils";
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

  const preview=useMemo(()=>companies.map(c=>{
    const ct=tasks.filter(t=>t.company_id===c.id);
    const sorted=[...ct].filter(t=>t.due_at).sort((a,b)=>new Date(a.due_at).getTime()-new Date(b.due_at).getTime());
    const urgent=ct.some(t=>["Overdue","Due today"].includes(dueLabel(t.due_at,t.status)));
    return {company:c,open:ct.length,next:sorted[0],risk:urgent?"High":ct.length>1?"Medium":"Low"};
  }).filter(x=>x.open>0),[companies,tasks]);

  async function create(){
    if(!organizationId||!session)return;setBusy(true);setMessage(null);
    const {data:h,error}=await pvosSupabase.from("pvos_handovers").insert({
      organization_id:organizationId,
      qppv_user_id:session.user.id,
      deputy_user_id:session.user.id,
      leave_start:start,leave_end:end,status:"sent"
    }).select("*").single();
    if(error){setMessage(error.message);setBusy(false);return;}
    const rows=preview.map(p=>({
      handover_id:h.id,company_id:p.company.id,
      snapshot:{open_tasks:p.open,next_deadline:p.next?.due_at??null,next_task:p.next?.title??null,risk:p.risk,created_from:"PVOS V0"}
    }));
    if(rows.length) await pvosSupabase.from("pvos_handover_companies").insert(rows);
    setMessage(`${rows.length} company handover(s) generated and saved.`);
    setBusy(false);await load();
  }

  async function advance(h:any){
    const next=h.status==="sent"?{status:"accepted",accepted_at:new Date().toISOString()}:h.status==="accepted"?{status:"active"}:h.status==="active"?{status:"handback_pending"}:{status:"closed",handback_at:new Date().toISOString()};
    await pvosSupabase.from("pvos_handovers").update(next).eq("id",h.id);await load();
  }

  return <>
    <Header eyebrow="QPPV continuity" title="Leave handover" sub="Generate a separate, auditable snapshot for every company with open work during a QPPV absence. V0 uses your own account as the demo Deputy until team invitations are added."/>
    <div className={styles.grid2}>
      <section className={styles.info}><h3>Create handover</h3><div className={styles.formGrid}><label>Leave starts<input className={styles.input} type="date" value={start} onChange={e=>setStart(e.target.value)}/></label><label>Leave ends<input className={styles.input} type="date" value={end} onChange={e=>setEnd(e.target.value)}/></label></div><div className={styles.notice} style={{marginTop:14}}><strong>{preview.length} company workspace(s) have open work.</strong><br/>PVOS will freeze the current open-task summary into each company handover record.</div>{message?<div className={styles.successBox} style={{marginTop:12}}>{message}</div>:null}<div className={styles.inlineActions}><button className={styles.button} disabled={busy||!preview.length} onClick={create}>{busy?"Generating…":`Generate ${preview.length} handovers`}</button></div></section>
      <aside className={styles.info}><h3>How the V0 flow works</h3><div className={styles.kv}><span>1</span><span>QPPV sends</span></div><div className={styles.kv}><span>2</span><span>Deputy acknowledges</span></div><div className={styles.kv}><span>3</span><span>Leave becomes active</span></div><div className={styles.kv}><span>4</span><span>Handback pending</span></div><div className={styles.kv}><span>5</span><span>QPPV closes handback</span></div></aside>
    </div>
    <section className={styles.panel}><div className={styles.panelHeader}><h2>Current handover preview</h2><span className={styles.muted}>Generated from live tasks</span></div><div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Company</th><th>Open items</th><th>Next deadline</th><th>Risk</th></tr></thead><tbody>{preview.map(p=><tr key={p.company.id}><td>{p.company.name}</td><td>{p.open}</td><td>{p.next?`${p.next.title} · ${formatDue(p.next.due_at)}`:"—"}</td><td><Badge tone={p.risk==="High"?"red":p.risk==="Medium"?"amber":"default"}>{p.risk}</Badge></td></tr>)}</tbody></table></div></section>
    <section className={styles.panel}><div className={styles.panelHeader}><h2>Saved leave events</h2><span className={styles.muted}>{handovers.length} recent</span></div>{handovers.length?<div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Leave</th><th>Status</th><th>Created</th><th></th></tr></thead><tbody>{handovers.map(h=><tr key={h.id}><td>{h.leave_start} → {h.leave_end}</td><td><Badge tone={h.status==="closed"?"green":h.status==="handback_pending"?"amber":"lime"}>{niceStatus(h.status)}</Badge></td><td>{new Date(h.created_at).toLocaleString()}</td><td>{h.status!=="closed"?<button className={styles.buttonGhost} onClick={()=>advance(h)}>Advance demo state</button>:null}</td></tr>)}</tbody></table></div>:<div className={styles.empty}>No handovers created yet.</div>}</section>
  </>;
}
