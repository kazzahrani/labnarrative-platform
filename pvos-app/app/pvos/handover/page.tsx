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
  const [members,setMembers]=useState<{user_id:string;email:string;role:string}[]>([]);
  const [deputy,setDeputy]=useState("");
  const [start,setStart]=useState(dateInput(1));
  const [end,setEnd]=useState(dateInput(7));
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState<string|null>(null);

  async function load(){
    if(!organizationId)return;
    async function openTasks(){
      const all:any[]=[];
      for(let offset=0;;offset+=1000){
        const result=await pvosSupabase.from("pvos_tasks").select("*").eq("organization_id",organizationId).neq("status","complete").neq("status","cancelled").order("id").range(offset,offset+999);
        if(result.error)throw result.error;
        all.push(...(result.data??[]));if((result.data??[]).length<1000)return all;
      }
    }
    try{
    const [c,t,h,m]=await Promise.all([
      pvosSupabase.from("pvos_companies").select("*").eq("organization_id",organizationId).order("name"),
      openTasks(),
      pvosSupabase.from("pvos_handovers").select("*").eq("organization_id",organizationId).order("created_at",{ascending:false}).limit(10),
      pvosSupabase.rpc("pvos_member_directory",{p_organization_id:organizationId})
    ]);
    if(c.error||h.error||m.error)throw c.error||h.error||m.error;
    setCompanies(c.data??[]);setTasks(t);setHandovers(h.data??[]);setMembers(m.data??[]);
    }catch(error){setMessage(error instanceof Error?error.message:"Could not load handover data. Refresh and try again.");}
  }

  useEffect(()=>{load()},[organizationId]);

  const preview=useMemo(()=>{
    const saudiDate=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Riyadh",year:"numeric",month:"2-digit",day:"2-digit"});
    const now=new Date();

    return companies.map(c=>{
      const ct=tasks.filter(t=>t.company_id===c.id);
      const sorted=[...ct].filter(t=>t.due_at).sort((a,b)=>new Date(a.due_at).getTime()-new Date(b.due_at).getTime());
      const dueDuring=ct.filter(t=>{
        if(!t.due_at)return false;
        const d=saudiDate.format(new Date(t.due_at));
        return d>=start&&d<=end;
      });
      const overdue=ct.some(t=>t.due_at&&new Date(t.due_at)<now);
      const highPriorityDuring=dueDuring.some(t=>["high","critical"].includes(t.priority));
      const risk=overdue||highPriorityDuring?"High":dueDuring.length||ct.length>2?"Medium":"Low";
      return {company:c,open:ct.length,next:sorted[0],dueDuring:dueDuring.length,risk};
    }).filter(x=>x.open>0);
  },[companies,tasks,start,end]);

  async function create(){
    if(!organizationId||!session)return;setBusy(true);setMessage(null);
    const {data:id,error}=await pvosSupabase.rpc("pvos_create_handover",{
      p_organization_id:organizationId,p_deputy_user_id:deputy,p_leave_start:start,p_leave_end:end
    });
    if(error){setMessage(error.message);setBusy(false);return;}
    setBusy(false);window.location.assign("/pvos/handover/"+id);
  }

  const canCreate=members.some(m=>m.user_id===session?.user.id&&["admin","qppv"].includes(m.role));
  const eligibleDeputies=members.filter(m=>m.user_id!==session?.user.id&&["deputy_qppv","qppv"].includes(m.role));

  return <>
    <Header eyebrow="QPPV continuity" title="Leave handover" sub="Prepare a separate handover for every company before QPPV leave. PVOS highlights work due during the leave period, freezes the current workload, and preserves company-by-company acknowledgement records."/>
    <div className={styles.grid2}>
      <section className={styles.info}>
        <h3>Create handover</h3>
        <div className={styles.formGrid}>
          <label>Leave starts<input className={styles.input} type="date" value={start} onChange={e=>setStart(e.target.value)}/></label>
          <label>Leave ends<input className={styles.input} type="date" value={end} onChange={e=>setEnd(e.target.value)}/></label>
        </div>
        <label style={{display:"block",marginTop:12}}>Assigned Deputy QPPV
          <select className={styles.input} value={deputy} onChange={e=>setDeputy(e.target.value)} disabled={!canCreate||busy}>
            <option value="">Choose a different QPPV / Deputy account</option>
            {eligibleDeputies.map(m=><option key={m.user_id} value={m.user_id}>{m.email} · {niceStatus(m.role)}</option>)}
          </select>
        </label>
        {!eligibleDeputies.length?<p className={styles.muted}>A different workspace member with a QPPV or Deputy QPPV role is required. Self-acknowledgement is not allowed.</p>:null}
        <div className={styles.notice} style={{marginTop:14}}><strong>{preview.length} company workspace(s) have open work.</strong><br/>PVOS will freeze the current open tasks separately for every company and flag deadlines that fall during leave.</div>
        {message?<div className={styles.successBox} style={{marginTop:12}}>{message}</div>:null}
        <div className={styles.inlineActions}><button className={styles.button} disabled={busy||!canCreate||!deputy||!preview.length||!start||!end||end<start} onClick={create}>{busy?"Generating…":`Send handover for ${preview.length} companies`}</button></div>
        <div className={styles.muted} style={{marginTop:10}}>Only the assigned Deputy account can acknowledge each company. The final acknowledgement freezes the evidence and generates its PDF. This does not send an email notification.</div>
      </section>

      <aside className={styles.info}>
        <h3>Continuity flow</h3>
        <div className={styles.kv}><span>1</span><span>QPPV freezes open work</span></div>
        <div className={styles.kv}><span>2</span><span>Deputy acknowledges each company → PDF</span></div>
        <div className={styles.kv}><span>3</span><span>Leave becomes active</span></div>
        <div className={styles.kv}><span>4</span><span>QPPV reviews each company on return</span></div>
        <div className={styles.kv}><span>5</span><span>Handback closes</span></div>
      </aside>
    </div>

    <section className={styles.panel}>
      <div className={styles.panelHeader}><h2>Current handover preview</h2><span className={styles.muted}>Live workload · leave deadlines use Asia/Riyadh dates</span></div>
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
