"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Header, Badge, Tabs } from "../../_components";
import { usePVOS } from "../../_provider";
import { pvosSupabase } from "../../_pvos-supabase";
import { niceStatus } from "../../_utils";
import styles from "../../pvos.module.css";
import { ProductRegister } from "../_product-register";
import {NewTaskModal} from "../../_new-task-modal";
import {readWork,type WorkData} from "../../_work";
import {WorkList} from "../../_work-list";
import {deadlineState} from "../../_work-utils";
import {CompanyRecords} from "../_company-records";
import {PsurCycles} from "../_psur-cycles";
import {DepartmentRequests} from "../_department-requests";
import { readProductPages } from "../../_registration";

export default function CompanyPage(){
  const params=useParams<{id:string}>();
  const {session,organizationId,reloadToken,refresh}=usePVOS();
  const [tab,setTab]=useState("overview"),[workView,setWorkView]=useState("active"),[work,setWork]=useState<WorkData|null>(null),[workError,setWorkError]=useState(""),[showNew,setShowNew]=useState(false);
  const [initialRequestId,setInitialRequestId]=useState<string|null>(null),[startDepartmentRequest,setStartDepartmentRequest]=useState(false);
  useEffect(()=>{
   const p=new URLSearchParams(window.location.search);
   if(["overview","work","products","psur","departments","documents","history"].includes(p.get("tab")||""))setTab(p.get("tab")!);
   setInitialRequestId(p.get("request"));
   setStartDepartmentRequest(p.get("new")==="1");
  },[]);
  useEffect(()=>{if(!organizationId||!session)return;let active=true;setWorkError("");readWork(organizationId,session.user.id).then(d=>{if(active)setWork(d)}).catch(e=>{if(active)setWorkError(e.message)});return()=>{active=false}},[organizationId,session?.user.id,reloadToken]);
  const [company,setCompany]=useState<any|null>(null);
  const [products,setProducts]=useState<any[]>([]);
  const [obligations,setObligations]=useState<any[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState<string|null>(null);

  useEffect(()=>{ const id=params.id; if(!id)return; let active=true; (async()=>{
    setLoading(true);
    const [c,p,o]=await Promise.all([
      pvosSupabase.from("pvos_companies").select("*").eq("id",id).single(),
      readProductPages<any>((from,to)=>pvosSupabase.from("pvos_products").select("*").eq("company_id",id).order("brand_name").order("id").range(from,to)),
      pvosSupabase.from("pvos_obligations").select("*").eq("company_id",id).eq("active",true).order("activity_type")
    ]);
    if(c.error||o.error)throw new Error(c.error?.message||o.error?.message||"Could not load company.");
    if(active){setCompany(c.data);setProducts(p);setObligations(o.data??[]);setError(null);setLoading(false);}
  })().catch(e=>{if(active){setError(e.message);setLoading(false);}}); return()=>{active=false}; },[params.id,reloadToken]);

  if(error)return <div className={styles.errorBox} role="alert">{error}</div>;
  if(loading||!company) return <div className={styles.empty}>Loading company workspace…</div>;
  const items=(work?.items||[]).filter(w=>w.company_id===company.id);
  const active=items.filter(w=>w.status!=="complete"&&(deadlineState(w.due,w.status).days===null||(deadlineState(w.due,w.status).days!<=7||(w.kind==="PSUR/PBRER"&&deadlineState(w.due,w.status).days!<=90))||w.waiting||["in_progress","returned"].includes(w.status)));
  const scheduled=items.filter(w=>w.status!=="complete"&&!active.some(a=>a.id===w.id));
  const completed=items.filter(w=>w.status==="complete");
  const visible=workView==="scheduled"?scheduled:workView==="completed"?completed:active;
  function changeTab(value:string){setTab(value);const url=new URL(window.location.href);url.searchParams.set("tab",value);window.history.replaceState({},"",url);}
  return <>
    <Header eyebrow="Company workspace" title={company.name} sub={company.contract_scope??"PV responsibility scope"} action={<div className={styles.inlineActions} style={{marginTop:0}}><Link className={styles.buttonGhost} href={"/pvos/companies/"+company.id+"/setup"}>Company settings</Link><button className={styles.button} onClick={()=>setShowNew(true)}>New task</button></div>}/>
    {workError?<div className={styles.errorBox} role="alert">Work could not load: {workError} <button className={styles.buttonGhost} onClick={refresh}>Retry</button></div>:null}
    <Tabs label="Company workspace" value={tab} onChange={changeTab} items={[{id:"overview",label:"Overview"},{id:"work",label:"Work"},{id:"products",label:"Products"},{id:"psur",label:"PSUR"},{id:"departments",label:"Requests"},{id:"documents",label:"Documents"},{id:"history",label:"History"}]}/>
    {tab==="overview"?<>
      <div className={styles.compactSummary}><span><strong>{active.length}</strong> Active items</span><span><strong>{items.filter(w=>deadlineState(w.due,w.status).overdue).length}</strong> Overdue</span><span><strong>{products.length}</strong> Products</span></div>
      <section className={styles.panel}><div className={styles.panelHeader}><h2>Needs attention</h2><button className={styles.buttonGhost} onClick={()=>changeTab("work")}>All company work</button></div>{work?<WorkList items={active} companies={work.companies} members={work.members} userId={session?.user.id} showCompany={false}/>:<div className={styles.empty}>Loading work and reviews…</div>}</section>
      <div className={styles.quietActions}><Link href={"/pvos/literature?company="+company.id}>Literature</Link><Link href={"/pvos/signal?company="+company.id}>Signals</Link><Link href={"/pvos/rmp?company="+company.id}>RMP</Link><Link href={"/pvos/inspection?company="+company.id}>Inspection</Link></div>
      <details className={styles.info} style={{marginTop:20}}><summary>Company coverage & schedules</summary><div className={styles.kv}><span>QPPV</span><span>{company.qppv_user_id===session?.user.id?"Me":company.qppv_user_id?"Assigned":"Not assigned"}</span></div><div className={styles.kv}><span>Deputy</span><span>{company.deputy_user_id?"Assigned":"Not assigned"}</span></div><div className={styles.kv}><span>Contract scope</span><span>{company.contract_scope??"—"}</span></div>{obligations.map(o=><div className={styles.kv} key={o.id}><span>{o.activity_type}</span><span>{niceStatus(o.cadence)} · {niceStatus(o.responsibility)}</span></div>)}</details>
    </>:null}
    {tab==="work"?<section className={styles.panel}><div className={styles.sectionBody}><Tabs label="Company work views" value={workView} onChange={setWorkView} items={[{id:"active",label:`Active (${active.length})`},{id:"scheduled",label:`Scheduled (${scheduled.length})`},{id:"completed",label:`Completed (${completed.length})`}]}/></div>{work?<WorkList items={visible} companies={work.companies} members={work.members} userId={session?.user.id} showCompany={false}/>:<div className={styles.empty}>Loading work…</div>}</section>:null}
    {tab==="products"?<ProductRegister companyId={company.id} organizationId={company.organization_id} products={products} onSaved={p=>setProducts(rows=>rows.map(row=>row.id===p.id?p:row))}/>:null}
    {tab==="psur"?<PsurCycles companyId={company.id} organizationId={company.organization_id} products={products} onChanged={refresh}/>:null}
    {tab==="departments"?<DepartmentRequests companyId={company.id} organizationId={company.organization_id} products={products} onChanged={refresh} initialRequestId={initialRequestId} startCreate={startDepartmentRequest}/>:null}
    {tab==="documents"||tab==="history"?<CompanyRecords companyId={company.id} organizationId={company.organization_id} view={tab}/>:null}
    <NewTaskModal open={showNew} initialCompanyId={company.id} onClose={()=>setShowNew(false)} onCreated={()=>{setShowNew(false);refresh()}}/>
  </>;
}
