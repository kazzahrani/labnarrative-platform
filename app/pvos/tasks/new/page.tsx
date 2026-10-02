"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Header } from "../../_components";
import { usePVOS } from "../../_provider";
import { pvosSupabase } from "../../_pvos-supabase";
import styles from "../../pvos.module.css";

export default function NewTaskPage(){
  const {organizationId,session} = usePVOS();
  const router=useRouter();
  const [companies,setCompanies]=useState<any[]>([]);
  const [products,setProducts]=useState<any[]>([]);
  const [companyId,setCompanyId]=useState("");
  const [productId,setProductId]=useState("");
  const [title,setTitle]=useState("");
  const [type,setType]=useState("Literature");
  const [priority,setPriority]=useState("medium");
  const [due,setDue]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);

  useEffect(()=>{ if(!organizationId)return; (async()=>{
    const {data:c}=await pvosSupabase.from("pvos_companies").select("id,name").eq("organization_id",organizationId).order("name");
    setCompanies(c??[]); if(c?.[0]) setCompanyId(v=>v||c[0].id);
  })(); },[organizationId]);

  useEffect(()=>{ if(!companyId){setProducts([]);return;} (async()=>{
    const {data}=await pvosSupabase.from("pvos_products").select("id,brand_name").eq("company_id",companyId).order("brand_name");
    setProducts(data??[]); setProductId("");
  })(); },[companyId]);

  async function submit(e:FormEvent){
    e.preventDefault(); if(!organizationId||!session)return;
    setBusy(true); setError(null);
    const {data,error:e2}=await pvosSupabase.from("pvos_tasks").insert({
      organization_id:organizationId, company_id:companyId, product_id:productId||null,
      title, activity_type:type, source:"manual", status:"not_started", priority,
      owner_user_id:session.user.id, due_at:due?new Date(due).toISOString():null
    }).select("id").single();
    setBusy(false);
    if(e2){setError(e2.message);return;}
    router.push("/pvos/tasks/"+data.id);
  }

  const selectedCompany=useMemo(()=>companies.find(c=>c.id===companyId),[companies,companyId]);
  return <>
    <Header eyebrow="New PV activity" title="Create task" sub={"Add an ad-hoc or manually scheduled PV activity"+(selectedCompany?" for "+selectedCompany.name:".")+" Every change is recorded in the audit history."}/>
    <form onSubmit={submit} className={styles.info} style={{maxWidth:720}}>
      <div className={styles.formGrid}>
        <label>Company<select className={styles.input} value={companyId} onChange={e=>setCompanyId(e.target.value)} required>{companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label>Product (optional)<select className={styles.input} value={productId} onChange={e=>setProductId(e.target.value)}><option value="">Portfolio / none</option>{products.map(p=><option key={p.id} value={p.id}>{p.brand_name}</option>)}</select></label>
        <label className={styles.full}>Task title<input className={styles.input} value={title} onChange={e=>setTitle(e.target.value)} required placeholder="e.g. SFDA inquiry response"/></label>
        <label>Activity type<select className={styles.input} value={type} onChange={e=>setType(e.target.value)}>{["Literature","Signal","RMP","PSSF","PSUR/PBRER","Training","Reconciliation","SOP","SFDA Inquiry","CAPA","Other"].map(x=><option key={x}>{x}</option>)}</select></label>
        <label>Priority<select className={styles.input} value={priority} onChange={e=>setPriority(e.target.value)}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></label>
        <label className={styles.full}>Deadline<input className={styles.input} type="datetime-local" value={due} onChange={e=>setDue(e.target.value)}/></label>
      </div>
      {error?<div className={styles.errorBox}>{error}</div>:null}
      <div style={{display:"flex",gap:10,marginTop:16}}><button className={styles.button} disabled={busy}>{busy?"Creating…":"Create task"}</button><button type="button" className={styles.buttonGhost} onClick={()=>router.back()}>Cancel</button></div>
    </form>
  </>;
}
