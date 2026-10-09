"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Header } from "../../../_components";
import { usePVOS } from "../../../_provider";
import { pvosSupabase } from "../../../_pvos-supabase";
import styles from "../../../pvos.module.css";
import { emptyRegistration, RegistrationFields } from "../../_registration-fields";

export default function CompanySetupPage(){
  const params=useParams<{id:string}>(); const router=useRouter(); const {session}=usePVOS();
  const [company,setCompany]=useState<any|null>(null);
  const [productName,setProductName]=useState(""); const [ingredient,setIngredient]=useState(""); const [rmp,setRmp]=useState("Routine");
  const [registration,setRegistration]=useState(emptyRegistration);
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
    const {error}=await pvosSupabase.from("pvos_products").insert({company_id:company.id,brand_name:productName.trim(),active_ingredient:ingredient.trim()||null,registration_status:registration.status==="Not recorded"?null:registration.status,sfda_registration_number:registration.number.trim()||null,registration_reference:registration.reference.trim()||null,rmp_status:rmp});
    setBusy(false); if(error){setMessage(error.message);return;} setProductName("");setIngredient("");setRegistration(emptyRegistration);setMessage("Product added.");
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
    <Header eyebrow="PV configuration" title={company.name+" setup"} sub="Configure products and company-specific approval workflows. Manage PV obligations in the company workspace." action={<Link className={styles.buttonGhost} href="/pvos/automation">Automation & import</Link>}/>
    {message?<div className={message.toLowerCase().includes("added")?styles.successBox:styles.errorBox} style={{marginBottom:16}}>{message}</div>:null}
    <div className={styles.grid2}>
      <form className={styles.info} onSubmit={addProduct}><h3>Add product</h3><div className={styles.form}>
        <label>Brand name<input className={styles.input} value={productName} onChange={e=>setProductName(e.target.value)} required/></label>
        <label>Active ingredient<input className={styles.input} value={ingredient} onChange={e=>setIngredient(e.target.value)}/></label>
        <RegistrationFields value={registration} onChange={setRegistration}/>
        <label>RMP status<select className={styles.input} value={rmp} onChange={e=>setRmp(e.target.value)}><option>Routine</option><option>Active</option><option>Not required</option><option>Under review</option></select></label>
      </div><div className={styles.inlineActions}><button className={styles.button} disabled={busy}>Add product</button></div></form>

      <div className={styles.info}>
        <h3>Obligations</h3>
        <p className={styles.muted}>Define and review requirements, schedules, responsible team members and linked evidence within the company workspace.</p>
        <div className={styles.inlineActions}><Link className={styles.buttonGhost} href={"/pvos/companies/"+company.id+"?tab=obligations"}>Manage obligations →</Link></div>
      </div>
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
