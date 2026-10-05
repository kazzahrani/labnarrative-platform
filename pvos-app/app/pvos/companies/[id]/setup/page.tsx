"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
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
  const params=useParams<{id:string}>(); const router=useRouter(); const {session}=usePVOS();
  const [company,setCompany]=useState<any|null>(null);
  const [productName,setProductName]=useState(""); const [ingredient,setIngredient]=useState(""); const [rmp,setRmp]=useState("Routine");
  const [obligationTitle,setObligationTitle]=useState(""); const [activity,setActivity]=useState("Literature"); const [cadence,setCadence]=useState("weekly"); const [nextDue,setNextDue]=useState(localInput(7)); const [responsibility,setResponsibility]=useState("organization");
  const [routeName,setRouteName]=useState(""); const [routeActivity,setRouteActivity]=useState("General"); const [routeRoles,setRouteRoles]=useState("QPPV, Quality, Manager, Client");
  const [routes,setRoutes]=useState<any[]>([]);
  const [message,setMessage]=useState<string|null>(null); const [busy,setBusy]=useState(false);

  async function load(){
    if(!params.id)return;
    const [c,r]=await Promise.all([
      pvosSupabase.from("pvos_companies").select("*").eq("id",params.id).single(),
      pvosSupabase.from("pvos_approval_routes").select("*").eq("company_id",params.id).eq("active",true).order("created_at")
    ]);
    setCompany(c.data); setRoutes(r.data??[]);
  }
  useEffect(()=>{load()},[params.id]);

  async function addProduct(e:FormEvent){
    e.preventDefault();if(!company)return;setBusy(true);setMessage(null);
    const {error}=await pvosSupabase.from("pvos_products").insert({company_id:company.id,brand_name:productName.trim(),active_ingredient:ingredient.trim()||null,registration_status:"Registered",rmp_status:rmp});
    setBusy(false); if(error){setMessage(error.message);return;} setProductName("");setIngredient("");setMessage("Product added.");
  }

  async function addObligation(e:FormEvent){
    e.preventDefault();if(!company||!session)return;setBusy(true);setMessage(null);
    const {error}=await pvosSupabase.from("pvos_obligations").insert({
      company_id:company.id,title:obligationTitle.trim()||activity+" obligation",activity_type:activity,cadence,owner_user_id:session.user.id,responsibility,evidence_required:true,next_due_at:cadence==="event"?null:new Date(nextDue).toISOString()
    });
    if(!error) await pvosSupabase.rpc("pvos_materialize_due_obligations",{horizon_days:30});
    setBusy(false); if(error){setMessage(error.message);return;} setObligationTitle("");setMessage(cadence==="event"?"Event-triggered obligation added.":"Recurring obligation added and upcoming tasks generated.");
  }

  async function addRoute(e:FormEvent){
    e.preventDefault();if(!company)return;setBusy(true);setMessage(null);
    const roles=routeRoles.split(",").map(x=>x.trim()).filter(Boolean);
    if(!roles.length){setBusy(false);setMessage("Add at least one approval role.");return;}
    const {data:route,error}=await pvosSupabase.from("pvos_approval_routes").insert({
      company_id:company.id,name:routeName.trim()||roles.join(" → "),activity_type:routeActivity==="General"?null:routeActivity
    }).select("id").single();
    if(error){setBusy(false);setMessage(error.message);return;}
    const {error:stepError}=await pvosSupabase.from("pvos_approval_steps").insert(roles.map((role,i)=>({route_id:route.id,position:i+1,role,assignee_user_id:i===0?session?.user.id:null})));
    setBusy(false); if(stepError){setMessage(stepError.message);return;} setRouteName("");setMessage("Approval workflow added.");await load();
  }

  if(!company)return <div className={styles.empty}>Loading company setup…</div>;
  return <>
    <Header eyebrow="PV configuration" title={company.name+" setup"} sub="Configure products, recurring PV obligations and company-specific approval workflows." action={<Link className={styles.buttonGhost} href="/pvos/automation">Automation & import</Link>}/>
    {message?<div className={message.toLowerCase().includes("added")?styles.successBox:styles.errorBox} style={{marginBottom:16}}>{message}</div>:null}
    <div className={styles.grid2}>
      <form className={styles.info} onSubmit={addProduct}><h3>Add product</h3><div className={styles.form}>
        <label>Brand name<input className={styles.input} value={productName} onChange={e=>setProductName(e.target.value)} required/></label>
        <label>Active ingredient<input className={styles.input} value={ingredient} onChange={e=>setIngredient(e.target.value)}/></label>
        <label>RMP status<select className={styles.input} value={rmp} onChange={e=>setRmp(e.target.value)}><option>Routine</option><option>Active</option><option>Not required</option><option>Under review</option></select></label>
      </div><div className={styles.inlineActions}><button className={styles.button} disabled={busy}>Add product</button></div></form>

      <form className={styles.info} onSubmit={addObligation}><h3>Add recurring obligation</h3><div className={styles.form}>
        <label>Activity<select className={styles.input} value={activity} onChange={e=>setActivity(e.target.value)}>{["Literature","Signal","PSSF","RMP","PSUR/PBRER","Training","Reconciliation","SOP","CAPA","Other"].map(x=><option key={x}>{x}</option>)}</select></label>
        <label>Title<input className={styles.input} value={obligationTitle} onChange={e=>setObligationTitle(e.target.value)} placeholder="e.g. Monthly authority review"/></label>
        <label>Frequency<select className={styles.input} value={cadence} onChange={e=>setCadence(e.target.value)}><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="semiannual">Every 6 months</option><option value="annual">Annual</option><option value="event">Event-triggered</option></select></label>
        <label>Responsibility<select className={styles.input} value={responsibility} onChange={e=>setResponsibility(e.target.value)}><option value="organization">Our organization</option><option value="client">Client</option><option value="shared">Shared</option></select></label>{cadence!=="event"?<label>Next due date<input className={styles.input} type="datetime-local" value={nextDue} onChange={e=>setNextDue(e.target.value)} required/></label>:null}
      </div><div className={styles.inlineActions}><button className={styles.button} disabled={busy}>Add obligation</button></div></form>
    </div>

    <form className={styles.info} style={{marginTop:16}} onSubmit={addRoute}><h3>Approval workflow</h3>
      <div className={styles.formGrid}>
        <label>Workflow name<input className={styles.input} value={routeName} onChange={e=>setRouteName(e.target.value)} placeholder="e.g. RMP approval"/></label>
        <label>Activity<select className={styles.input} value={routeActivity} onChange={e=>setRouteActivity(e.target.value)}>{["General","Literature","Signal","RMP","PSSF","PSUR/PBRER","Training","Reconciliation","SOP","SFDA Inquiry","CAPA"].map(x=><option key={x}>{x}</option>)}</select></label>
        <label className={styles.full}>Approval roles, in order<input className={styles.input} value={routeRoles} onChange={e=>setRouteRoles(e.target.value)} placeholder="QPPV, Deputy, Quality, Manager, Client"/></label>
      </div>
      <div className={styles.notice} style={{marginTop:12}}>Example: <strong>QPPV → Deputy → Quality → Manager → Client</strong>. V0 tracks role stages now; named team assignments come with team invitations.</div>
      <div className={styles.inlineActions}><button className={styles.button} disabled={busy}>Add workflow</button></div>
      {routes.length?<div className={styles.metricList} style={{marginTop:12}}>{routes.map(r=><div className={styles.metricRow} key={r.id}><span>{r.name}</span><strong>{r.activity_type??"General"}</strong></div>)}</div>:null}
    </form>
    <div className={styles.inlineActions}><button className={styles.buttonGhost} onClick={()=>router.push("/pvos/companies/"+company.id)}>Back to company</button></div>
  </>;
}
