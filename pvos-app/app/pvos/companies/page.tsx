"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Header } from "../_components";
import { usePVOS } from "../_provider";
import { pvosSupabase } from "../_pvos-supabase";
import { dueLabel } from "../_utils";
import styles from "../pvos.module.css";

export default function Companies(){
  const {organizationId,session}=usePVOS();
  const [companies,setCompanies]=useState<any[]>([]);
  const [products,setProducts]=useState<any[]>([]);
  const [tasks,setTasks]=useState<any[]>([]);
  const [showAdd,setShowAdd]=useState(false);
  const [name,setName]=useState("");
  const [scope,setScope]=useState("PV full service");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);

  async function load(){
    if(!organizationId)return;
    const [c,t]=await Promise.all([
      pvosSupabase.from("pvos_companies").select("*").eq("organization_id",organizationId).order("name"),
      pvosSupabase.from("pvos_tasks").select("*").eq("organization_id",organizationId).neq("status","cancelled")
    ]);
    const cs=c.data??[];
    setCompanies(cs);
    setTasks(t.data??[]);
    if(cs.length){
      const {data:p}=await pvosSupabase.from("pvos_products").select("*").in("company_id",cs.map(x=>x.id));
      setProducts(p??[]);
    }else setProducts([]);
  }

  useEffect(()=>{load()},[organizationId]);

  const stats=useMemo(()=>Object.fromEntries(companies.map(c=>{
    const ct=tasks.filter(t=>t.company_id===c.id);
    return [c.id,{
      products:products.filter(p=>p.company_id===c.id).length,
      dueWeek:ct.filter(t=>["Overdue","Due today","Due soon"].includes(dueLabel(t.due_at,t.status))).length,
      overdue:ct.filter(t=>dueLabel(t.due_at,t.status)==="Overdue").length,
    }];
  })),[companies,products,tasks]);

  function closeModal(){
    if(busy)return;
    setShowAdd(false);setName("");setScope("PV full service");setError(null);
  }

  async function submit(e:FormEvent){
    e.preventDefault();
    if(!organizationId||!session)return;
    setBusy(true);setError(null);
    const {error:e2}=await pvosSupabase.from("pvos_companies").insert({
      organization_id:organizationId,
      name:name.trim(),
      contract_scope:scope.trim()||null,
      qppv_user_id:session.user.id
    });
    setBusy(false);
    if(e2){setError(e2.message);return;}
    closeModal();
    await load();
  }

  return <>
    <Header eyebrow="Client portfolio" title="Companies" sub="Manage each company separately — its PV scope, products, recurring obligations, deadlines and related records." action={<button className={styles.button} onClick={()=>setShowAdd(true)}>+ Add company</button>}/>
    <div className={styles.companyGrid}>{companies.map(c=><Link className={styles.companyCard} href={"/pvos/companies/"+c.id} key={c.id}>
      <h3>{c.name}</h3><p>{c.contract_scope??"PV scope not defined"}</p>
      <div className={styles.stats}><div><strong>{stats[c.id]?.products??0}</strong><span>Products</span></div><div><strong>{stats[c.id]?.dueWeek??0}</strong><span>Due this week</span></div><div><strong>{stats[c.id]?.overdue??0}</strong><span>Overdue</span></div></div>
    </Link>)}</div>

    {showAdd?<div className={styles.modalBackdrop} onMouseDown={e=>{if(e.target===e.currentTarget)closeModal()}}>
      <div className={styles.modalCard} style={{width:"min(620px,100%)"}} role="dialog" aria-modal="true" aria-labelledby="add-company-title">
        <div className={styles.modalHeader}>
          <div><div className={styles.eyebrow}>Client setup</div><h2 id="add-company-title">Add company</h2></div>
          <button className={styles.modalClose} type="button" onClick={closeModal} aria-label="Close">×</button>
        </div>
        <form onSubmit={submit}>
          <div className={styles.form}>
            <label>Company / client name<input className={styles.input} value={name} onChange={e=>setName(e.target.value)} required placeholder="e.g. Riyadh Pharma"/></label>
            <label>PV scope<input className={styles.input} value={scope} onChange={e=>setScope(e.target.value)} placeholder="e.g. Local QPPV + literature + PSSF"/></label>
          </div>
          {error?<div className={styles.errorBox} style={{marginTop:14}}>{error}</div>:null}
          <div className={styles.modalActions}>
            <button type="button" className={styles.buttonGhost} onClick={closeModal}>Cancel</button>
            <button className={styles.button} disabled={busy}>{busy?"Creating…":"Create company"}</button>
          </div>
        </form>
      </div>
    </div>:null}
  </>;
}
