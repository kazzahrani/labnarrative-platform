"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Header, Badge, statusTone } from "../../_components";
import { usePVOS } from "../../_provider";
import { pvosSupabase } from "../../_pvos-supabase";
import { dueLabel, formatDue } from "../../_utils";
import styles from "../../pvos.module.css";

export default function CompanyPage(){
  const params=useParams<{id:string}>();
  const {session}=usePVOS();
  const [company,setCompany]=useState<any|null>(null);
  const [tasks,setTasks]=useState<any[]>([]);
  const [products,setProducts]=useState<any[]>([]);
  const [obligations,setObligations]=useState<any[]>([]);
  const [loading,setLoading]=useState(true);

  useEffect(()=>{ const id=params.id; if(!id)return; let active=true; (async()=>{
    setLoading(true);
    const [c,t,p,o]=await Promise.all([
      pvosSupabase.from("pvos_companies").select("*").eq("id",id).single(),
      pvosSupabase.from("pvos_tasks").select("*").eq("company_id",id).neq("status","cancelled").order("due_at"),
      pvosSupabase.from("pvos_products").select("*").eq("company_id",id).order("brand_name"),
      pvosSupabase.from("pvos_obligations").select("*").eq("company_id",id).eq("active",true).order("activity_type")
    ]);
    if(active){setCompany(c.data);setTasks(t.data??[]);setProducts(p.data??[]);setObligations(o.data??[]);setLoading(false);}
  })(); return()=>{active=false}; },[params.id]);

  if(loading||!company) return <div className={styles.empty}>Loading company workspace…</div>;
  return <>
    <Header eyebrow="Company workspace" title={company.name} sub={company.contract_scope??"PV responsibility scope"} action={<div className={styles.inlineActions} style={{marginTop:0}}><Link className={styles.buttonGhost} href={"/pvos/companies/"+company.id+"/setup"}>Configure</Link><Link className={styles.buttonGhost} href="/pvos/rmp">RMP Tracker</Link><Link className={styles.button} href="/pvos/handover">Start handover</Link></div>}/>
    <div className={styles.grid2}>
      <section>
        <div className={styles.panel}><div className={styles.panelHeader}><h2>Current work</h2><span className={styles.muted}>{tasks.filter(t=>t.status!=="complete").length} active items</span></div>
        <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Task</th><th>Type</th><th>Due</th><th>Status</th></tr></thead><tbody>{tasks.map(t=>{const s=dueLabel(t.due_at,t.status);return <tr key={t.id}><td><Link href={"/pvos/tasks/"+t.id}>{t.title}</Link></td><td>{t.activity_type}</td><td>{formatDue(t.due_at)}</td><td><Badge tone={statusTone(s)}>{s}</Badge></td></tr>})}</tbody></table></div></div>
        <div className={styles.panel}><div className={styles.panelHeader}><h2>Products</h2><span className={styles.muted}>{products.length} loaded in V0</span></div>
        <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Product</th><th>Active ingredient</th><th>Registration</th><th>RMP</th></tr></thead><tbody>{products.length?products.map(p=><tr key={p.id}><td>{p.brand_name}</td><td>{p.active_ingredient??"—"}</td><td>{p.registration_status??"—"}</td><td>{p.rmp_status??"—"}</td></tr>):<tr><td colSpan={4}>No product records yet.</td></tr>}</tbody></table></div></div>
      </section>
      <aside className={styles.stack}>
        <div className={styles.info}><h3>Coverage</h3><div className={styles.kv}><span>QPPV</span><span>{company.qppv_user_id===session?.user.id?"Me":company.qppv_user_id?"Assigned":"Not assigned"}</span></div><div className={styles.kv}><span>Deputy</span><span>{company.deputy_user_id?"Assigned":"Not assigned"}</span></div><div className={styles.kv}><span>Contract scope</span><span>{company.contract_scope??"—"}</span></div></div>
        <div className={styles.info}><h3>Recurring obligations</h3>{obligations.length?obligations.map(o=><div className={styles.kv} key={o.id}><span>{o.activity_type}</span><span>{o.cadence}</span></div>):<div className={styles.muted}>No recurring obligations configured yet.</div>}<div className={styles.inlineActions}><Link className={styles.buttonGhost} href={"/pvos/companies/"+company.id+"/setup"}>Add product / obligation</Link></div></div>
      </aside>
    </div>
  </>;
}
