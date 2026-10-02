"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Header } from "../_components";
import { usePVOS } from "../_provider";
import { pvosSupabase } from "../_pvos-supabase";
import { dueLabel } from "../_utils";
import styles from "../pvos.module.css";

export default function Companies(){
  const {organizationId}=usePVOS();
  const [companies,setCompanies]=useState<any[]>([]);
  const [products,setProducts]=useState<any[]>([]);
  const [tasks,setTasks]=useState<any[]>([]);

  useEffect(()=>{ if(!organizationId)return; (async()=>{
    const [c,t]=await Promise.all([
      pvosSupabase.from("pvos_companies").select("*").eq("organization_id",organizationId).order("name"),
      pvosSupabase.from("pvos_tasks").select("*").eq("organization_id",organizationId).neq("status","cancelled")
    ]);
    const cs=c.data??[]; setCompanies(cs); setTasks(t.data??[]);
    if(cs.length){const {data:p}=await pvosSupabase.from("pvos_products").select("*").in("company_id",cs.map(x=>x.id));setProducts(p??[]);}
  })(); },[organizationId]);

  const stats=useMemo(()=>Object.fromEntries(companies.map(c=>{
    const ct=tasks.filter(t=>t.company_id===c.id);
    return [c.id,{
      products:products.filter(p=>p.company_id===c.id).length,
      dueWeek:ct.filter(t=>["Overdue","Due today","Due soon"].includes(dueLabel(t.due_at,t.status))).length,
      overdue:ct.filter(t=>dueLabel(t.due_at,t.status)==="Overdue").length,
    }];
  })),[companies,products,tasks]);

  return <>
    <Header eyebrow="Client portfolio" title="Companies" sub="Each client has its own scope, product portfolio, recurring obligations and evidence history. This live view is backed by the dedicated PVOS database."/>
    <div className={styles.companyGrid}>{companies.map(c=><Link className={styles.companyCard} href={"/pvos/companies/"+c.id} key={c.id}>
      <h3>{c.name}</h3><p>{c.contract_scope??"PV scope not defined"}</p>
      <div className={styles.stats}><div><strong>{stats[c.id]?.products??0}</strong><span>Products</span></div><div><strong>{stats[c.id]?.dueWeek??0}</strong><span>Due this week</span></div><div><strong>{stats[c.id]?.overdue??0}</strong><span>Overdue</span></div></div>
    </Link>)}</div>
  </>;
}
