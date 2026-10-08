"use client";
import Link from "next/link";
import {useEffect,useState} from "react";
import {Header,Tabs,Help} from "../_components";
import {NewTaskModal} from "../_new-task-modal";
import {usePVOS} from "../_provider";
import {readWork,type WorkData} from "../_work";
import {WorkList} from "../_work-list";
import {deadlineState} from "../_work-utils";
import styles from "../pvos.module.css";
export default function Dashboard(){
  const {organizationId,session,reloadToken,refresh}=usePVOS();
  const [data,setData]=useState<WorkData|null>(null),[error,setError]=useState(""),[loading,setLoading]=useState(true),[retry,setRetry]=useState(0);
  const [tab,setTab]=useState("mine"),[company,setCompany]=useState("all"),[filter,setFilter]=useState("attention"),[kind,setKind]=useState("all"),[search,setSearch]=useState(""),[showNew,setShowNew]=useState(false);
  useEffect(()=>{const p=new URLSearchParams(window.location.search);if(["mine","reviews","team"].includes(p.get("tab")||""))setTab(p.get("tab")!);if(p.get("company"))setCompany(p.get("company")!);},[]);
  useEffect(()=>{if(!organizationId||!session)return;let active=true;setLoading(true);setError("");readWork(organizationId,session.user.id).then(d=>{if(active)setData(d)}).catch(e=>{if(active)setError(e.message)}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[organizationId,session?.user.id,reloadToken,retry]);
  function changeTab(value:string){setTab(value);setFilter("attention");const u=new URL(window.location.href);u.searchParams.set("tab",value);window.history.replaceState({},"",u);}
  const scoped=(data?.items||[]).filter(w=>company==="all"||w.company_id===company);
  const role=data?.members.find(m=>m.user_id===session?.user.id)?.role,canTeam=["admin","qppv","deputy_qppv","manager"].includes(role||"");
  const reviews=scoped.filter(w=>w.review),mine=scoped.filter(w=>!w.review&&(w.owner===session?.user.id||!w.owner));
  const base=tab==="reviews"?reviews:tab==="team"&&canTeam?scoped:mine;
  const counts={overdue:base.filter(w=>deadlineState(w.due,w.status).overdue).length,week:base.filter(w=>{const d=deadlineState(w.due,w.status);return d.days!==null&&d.days>=0&&d.days<=7}).length,waiting:base.filter(w=>w.waiting&&(!w.review||tab!=="reviews")).length};
  const visible=base.filter(w=>{
    const d=deadlineState(w.due,w.status),complete=w.status==="complete";
    return (kind==="all"||w.kind===kind)&&w.title.toLowerCase().includes(search.toLowerCase())&&(filter==="all"||filter==="completed"&&complete||!complete&&(filter==="attention"&&(d.days===null||d.days<=7||w.waiting||["in_progress","returned"].includes(w.status))||filter==="overdue"&&d.overdue||filter==="week"&&d.days!==null&&d.days>=0&&d.days<=7||filter==="waiting"&&w.waiting));
  }).sort((a,b)=>Number(deadlineState(b.due,b.status).overdue)-Number(deadlineState(a.due,a.status).overdue)||String(a.due||"9999").localeCompare(String(b.due||"9999")));
  return <>
    <Header eyebrow="My PV operation" title="Dashboard" sub="Your work and assigned reviews across authorised companies. Open an activity to continue in its own workspace." action={<div className={styles.inlineActions} style={{marginTop:0}}><Link className={styles.buttonGhost} href="/pvos/handover">Leave handover</Link><button className={styles.button} onClick={()=>setShowNew(true)}>New task</button></div>}/>
    <Tabs label="Dashboard views" value={tab} onChange={changeTab} items={[{id:"mine",label:"My work"},{id:"reviews",label:`Reviews (${reviews.length})`},...(canTeam?[{id:"team",label:"Team"}]:[])]}/>
    <section className={styles.panel}>
      <div className={styles.workSummary}><button onClick={()=>setFilter("overdue")} className={styles.summaryButton}><strong className={styles.bad}>{counts.overdue}</strong> Overdue</button><button onClick={()=>setFilter("week")} className={styles.summaryButton}><strong>{counts.week}</strong> Due this week</button><button onClick={()=>setFilter("waiting")} className={styles.summaryButton}><strong>{counts.waiting}</strong> Waiting</button><Help>Counts follow the selected company and Dashboard tab. Deadline timing is evaluated in Riyadh time, separately from work status.</Help></div>
      <div className={styles.filterBar}>
        <select aria-label="Company" className={styles.input} value={company} onChange={e=>setCompany(e.target.value)}><option value="all">All companies</option>{data?.companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <select aria-label="Work filter" className={styles.input} value={filter} onChange={e=>setFilter(e.target.value)}><option value="attention">Needs attention</option><option value="all">All work</option><option value="overdue">Overdue</option><option value="week">Due this week</option><option value="waiting">Waiting</option><option value="completed">Completed</option></select>
        <select aria-label="Activity type" className={styles.input} value={kind} onChange={e=>setKind(e.target.value)}><option value="all">All activities</option>{[...new Set(base.map(w=>w.kind))].sort().map(k=><option key={k}>{k}</option>)}</select>
        <input aria-label="Search work" className={styles.input} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search work"/>
      </div>
      {error?<div className={styles.errorBox} role="alert">{error} <button className={styles.buttonGhost} onClick={()=>setRetry(n=>n+1)}>Retry</button></div>:loading?<div className={styles.empty}>Loading work and reviews…</div>:data?<WorkList items={visible} companies={data.companies} members={data.members} userId={session?.user.id}/>:null}
    </section>
    <div className={styles.inlineActions}><Link className={styles.buttonGhost} href="/pvos/approvals">Review history</Link><Link className={styles.buttonGhost} href="/pvos/handover">Handover records</Link></div>
    <NewTaskModal open={showNew} onClose={()=>setShowNew(false)} onCreated={()=>{setShowNew(false);refresh()}}/>
  </>;
}
