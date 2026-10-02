"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Header } from "../../../_components";
import { usePVOS } from "../../../_provider";
import { pvosSupabase } from "../../../_pvos-supabase";
import styles from "../../../pvos.module.css";

function localInput(offsetDays:number){
  const d=new Date();d.setDate(d.getDate()+offsetDays);d.setMinutes(d.getMinutes()-d.getTimezoneOffset());
  return d.toISOString().slice(0,16);
}

export default function CompanySetupPage(){
  const params=useParams<{id:string}>();
  const router=useRouter();
  const {session}=usePVOS();
  const [company,setCompany]=useState<any|null>(null);
  const [productName,setProductName]=useState("");
  const [ingredient,setIngredient]=useState("");
  const [rmp,setRmp]=useState("Routine");
  const [obligationTitle,setObligationTitle]=useState("");
  const [activity,setActivity]=useState("Literature");
  const [cadence,setCadence]=useState("weekly");
  const [nextDue,setNextDue]=useState(localInput(7));
  const [message,setMessage]=useState<string|null>(null);
  const [busy,setBusy]=useState(false);

  useEffect(()=>{if(!params.id)return;(async()=>{
    const {data}=await pvosSupabase.from("pvos_companies").select("*").eq("id",params.id).single();
    setCompany(data);
  })()},[params.id]);

  async function addProduct(e:FormEvent){
    e.preventDefault();if(!company)return;setBusy(true);setMessage(null);
    const {error}=await pvosSupabase.from("pvos_products").insert({
      company_id:company.id,brand_name:productName.trim(),active_ingredient:ingredient.trim()||null,
      registration_status:"Registered",rmp_status:rmp
    });
    setBusy(false);
    if(error){setMessage(error.message);return;}
    setProductName("");setIngredient("");setMessage("Product added.");
  }

  async function addObligation(e:FormEvent){
    e.preventDefault();if(!company||!session)return;setBusy(true);setMessage(null);
    const {error}=await pvosSupabase.from("pvos_obligations").insert({
      company_id:company.id,title:obligationTitle.trim()||activity+" obligation",activity_type:activity,
      cadence,owner_user_id:session.user.id,responsibility:"organization",evidence_required:true,
      next_due_at:cadence==="event"?null:new Date(nextDue).toISOString()
    });
    if(!error) await pvosSupabase.rpc("pvos_materialize_due_obligations",{horizon_days:30});
    setBusy(false);
    if(error){setMessage(error.message);return;}
    setObligationTitle("");setMessage(cadence==="event"?"Event-triggered obligation added.":"Recurring obligation added and upcoming tasks generated.");
  }

  if(!company)return <div className={styles.empty}>Loading company setup…</div>;
  return <>
    <Header eyebrow="PV configuration" title={company.name+" setup"} sub="Add product records and recurring PV obligations. Upcoming task instances are generated automatically from each obligation's frequency and next due date."/>
    {message?<div className={styles.successBox} style={{marginBottom:16}}>{message}</div>:null}
    <div className={styles.grid2}>
      <form className={styles.info} onSubmit={addProduct}>
        <h3>Add product</h3>
        <div className={styles.form}>
          <label>Brand name<input className={styles.input} value={productName} onChange={e=>setProductName(e.target.value)} required/></label>
          <label>Active ingredient<input className={styles.input} value={ingredient} onChange={e=>setIngredient(e.target.value)}/></label>
          <label>RMP status<select className={styles.input} value={rmp} onChange={e=>setRmp(e.target.value)}><option>Routine</option><option>Active</option><option>Not required</option><option>Under review</option></select></label>
        </div>
        <div className={styles.inlineActions}><button className={styles.button} disabled={busy}>Add product</button></div>
      </form>
      <form className={styles.info} onSubmit={addObligation}>
        <h3>Add recurring obligation</h3>
        <div className={styles.form}>
          <label>Activity<select className={styles.input} value={activity} onChange={e=>setActivity(e.target.value)}>{["Literature","Signal","PSSF","RMP","PSUR/PBRER","Training","Reconciliation","SOP","CAPA","Other"].map(x=><option key={x}>{x}</option>)}</select></label>
          <label>Title<input className={styles.input} value={obligationTitle} onChange={e=>setObligationTitle(e.target.value)} placeholder="e.g. Monthly authority review"/></label>
          <label>Frequency<select className={styles.input} value={cadence} onChange={e=>setCadence(e.target.value)}><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="semiannual">Every 6 months</option><option value="annual">Annual</option><option value="event">Event-triggered</option></select></label>
          {cadence!=="event"?<label>Next due date<input className={styles.input} type="datetime-local" value={nextDue} onChange={e=>setNextDue(e.target.value)} required/></label>:null}
        </div>
        <div className={styles.inlineActions}><button className={styles.button} disabled={busy}>Add obligation</button></div>
      </form>
    </div>
    <div className={styles.inlineActions}><button className={styles.buttonGhost} onClick={()=>router.push("/pvos/companies/"+company.id)}>Back to company</button></div>
  </>;
}
