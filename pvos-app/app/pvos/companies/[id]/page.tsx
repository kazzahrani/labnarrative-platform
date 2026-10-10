"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
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
import {CompanyObligations} from "../_obligations";
import { readProductPages } from "../../_registration";
import {getPVOSCache,pvosCacheKey,setPVOSCache,shouldRefreshPVOSCache} from "../../_session-cache";

export default function CompanyPage(){
  const params=useParams<{id:string}>();
  const router=useRouter();
  const {session,organizationId,reloadToken,refresh}=usePVOS();
  const workKey=pvosCacheKey(session?.user.id,organizationId,"work");
  const companyKey=pvosCacheKey(session?.user.id,organizationId,"company:"+params.id);
  const [tab,setTab]=useState("overview"),[workView,setWorkView]=useState("active");
  const [visitedTabs,setVisitedTabs]=useState<string[]>(["overview"]);
  const [work,setWork]=useState<WorkData|null>(()=>getPVOSCache<WorkData>(workKey)?.data||null);
  const [workError,setWorkError]=useState(""),[showNew,setShowNew]=useState(false);
  const [requestedObligation,setRequestedObligation]=useState<string|null>(null);
  useEffect(()=>{
   const p=new URLSearchParams(window.location.search);
   // Preserve existing company-request bookmarks after removing the duplicate tab.
   if(p.get("tab")==="departments"){
    const target=new URLSearchParams({company:params.id});
    if(p.get("request"))target.set("request",p.get("request")!);
    if(p.get("new")==="1")target.set("new","1");
    const details=target.has("request")||target.has("new");
    router.replace("/pvos/requests"+(details?"/department":"")+"?"+target.toString());
    return;
   }
   if(["overview","work","products","obligations","psur","documents","history"].includes(p.get("tab")||"")){
    const target=p.get("tab")!;
    setTab(target);
    setVisitedTabs(prev=>prev.includes(target)?prev:[...prev,target]);
   }
   setRequestedObligation(p.get("obligation"));
  },[params.id,router]);
  useEffect(()=>{
   if(!organizationId||!session)return;
   let active=true;
   const cached=getPVOSCache<WorkData>(workKey);
   if(cached)setWork(cached.data);
   setWorkError("");
   if(!shouldRefreshPVOSCache(cached,25000))return;
   readWork(organizationId,session.user.id).then(d=>{if(active){setWork(d);setPVOSCache(workKey,d);}})
    .catch(e=>{if(active)setWorkError(e.message)});
   return()=>{active=false};
  },[organizationId,session?.user.id,reloadToken,workKey]);
  type CompanySnapshot={company:any;products:any[];obligations:any[]};
  const initialCompany=getPVOSCache<CompanySnapshot>(companyKey)?.data;
  const [company,setCompany]=useState<any|null>(()=>initialCompany?.company||null);
  const [products,setProducts]=useState<any[]>(()=>initialCompany?.products||[]);
  const [obligations,setObligations]=useState<any[]>(()=>initialCompany?.obligations||[]);
  const [loading,setLoading]=useState(()=>!initialCompany);
  const [error,setError]=useState<string|null>(null);

  useEffect(()=>{
    const id=params.id;if(!id||!organizationId||!session)return;
    let active=true;
    const cached=getPVOSCache<CompanySnapshot>(companyKey);
    if(cached){
      setCompany(cached.data.company);setProducts(cached.data.products);
      setObligations(cached.data.obligations);setLoading(false);
    }else setLoading(true);
    if(!shouldRefreshPVOSCache(cached,30000))return;
    (async()=>{
      const [c,p,o]=await Promise.all([
        pvosSupabase.from("pvos_companies").select("*").eq("id",id).eq("organization_id",organizationId).single(),
        readProductPages<any>((from,to)=>pvosSupabase.from("pvos_products").select("*").eq("company_id",id).order("brand_name").order("id").range(from,to)),
        pvosSupabase.from("pvos_obligations").select("*").eq("company_id",id).eq("active",true).order("activity_type")
      ]);
      if(c.error||o.error)throw new Error(c.error?.message||o.error?.message||"Could not load company.");
      if(active){
        const snapshot={company:c.data,products:p,obligations:o.data??[]};
        setPVOSCache(companyKey,snapshot);
        setCompany(snapshot.company);setProducts(snapshot.products);
        setObligations(snapshot.obligations);setError(null);setLoading(false);
      }
    })().catch(e=>{if(active){setError(e.message);setLoading(false);}});
    return()=>{active=false};
  },[params.id,organizationId,session?.user.id,companyKey,reloadToken]);

  if(error&&!company)return <div className={styles.errorBox} role="alert">{error}</div>;
  if(loading||!company) return <div className={styles.empty}>Loading company workspace…</div>;
  const items=(work?.items||[]).filter(w=>w.company_id===company.id);
  const active=items.filter(w=>w.status!=="complete"&&(deadlineState(w.due,w.status).days===null||(deadlineState(w.due,w.status).days!<=7||(w.kind==="PSUR/PBRER"&&deadlineState(w.due,w.status).days!<=90))||w.waiting||["in_progress","returned"].includes(w.status)));
  const scheduled=items.filter(w=>w.status!=="complete"&&!active.some(a=>a.id===w.id));
  const completed=items.filter(w=>w.status==="complete");
  const visible=workView==="scheduled"?scheduled:workView==="completed"?completed:active;
  function changeTab(value:string){setTab(value);setVisitedTabs(prev=>prev.includes(value)?prev:[...prev,value]);const url=new URL(window.location.href);url.searchParams.set("tab",value);window.history.replaceState({},"",url);}
  return <>
    <Header eyebrow="Company workspace" title={company.name} sub={company.contract_scope??"PV responsibility scope"} action={<div className={styles.inlineActions} style={{marginTop:0}}><Link className={styles.buttonGhost} href={"/pvos/companies/"+company.id+"/setup"}>Company settings</Link><button className={styles.button} onClick={()=>setShowNew(true)}>New task</button></div>}/>
    {error?<div className={styles.errorBox} role="alert">Could not refresh company: {error}</div>:null}
    {workError?<div className={styles.errorBox} role="alert">Work could not load: {workError} <button className={styles.buttonGhost} onClick={refresh}>Retry</button></div>:null}
    <Tabs label="Company workspace" value={tab} onChange={changeTab} items={[{id:"overview",label:"Overview"},{id:"products",label:"Products"},{id:"obligations",label:"Obligations"},{id:"work",label:"Work"},{id:"psur",label:"PSUR"},{id:"documents",label:"Documents"},{id:"history",label:"History"}]}/>
    {tab==="overview"?<>
      <div className={styles.compactSummary}><span><strong>{active.length}</strong> Active items</span><span><strong>{items.filter(w=>deadlineState(w.due,w.status).overdue).length}</strong> Overdue</span><span><strong>{products.length}</strong> Products</span></div>
      <section className={styles.panel}><div className={styles.panelHeader}><h2>Needs attention</h2><button className={styles.buttonGhost} onClick={()=>changeTab("work")}>All company work</button></div>{work?<WorkList items={active} companies={work.companies} members={work.members} userId={session?.user.id} showCompany={false}/>:<div className={styles.empty}>Loading work and reviews…</div>}</section>
      <div className={styles.quietActions}><button type="button" onClick={()=>changeTab("obligations")}>View obligations →</button><Link href={"/pvos/requests?company="+encodeURIComponent(company.id)}>View requests →</Link><Link href={"/pvos/literature?company="+company.id}>Literature</Link><Link href={"/pvos/signal?company="+company.id}>Signals</Link><Link href={"/pvos/rmp?company="+company.id}>RMP</Link><Link href={"/pvos/inspection?company="+company.id}>Inspection</Link></div>
      <details className={styles.info} style={{marginTop:20}}><summary>Company coverage & schedules</summary><div className={styles.kv}><span>QPPV</span><span>{company.qppv_user_id===session?.user.id?"Me":company.qppv_user_id?"Assigned":"Not assigned"}</span></div><div className={styles.kv}><span>Deputy</span><span>{company.deputy_user_id?"Assigned":"Not assigned"}</span></div><div className={styles.kv}><span>Contract scope</span><span>{company.contract_scope??"—"}</span></div>{obligations.map(o=><div className={styles.kv} key={o.id}><span>{o.activity_type}</span><span>{niceStatus(o.cadence)} · {niceStatus(o.responsibility)}</span></div>)}</details>
    </>:null}
    {tab==="work"?<section className={styles.panel}><div className={styles.sectionBody}><Tabs label="Company work views" value={workView} onChange={setWorkView} items={[{id:"active",label:`Active (${active.length})`},{id:"scheduled",label:`Scheduled (${scheduled.length})`},{id:"completed",label:`Completed (${completed.length})`}]}/></div>{work?<WorkList items={visible} companies={work.companies} members={work.members} userId={session?.user.id} showCompany={false}/>:<div className={styles.empty}>Loading work…</div>}</section>:null}
    {/* Keep visited company sections mounted. Returning to an opened section
        restores its complete UI/state immediately rather than remounting
        and repeating its initial Supabase requests. */}
    {visitedTabs.includes("products")?<div hidden={tab!=="products"}><ProductRegister companyId={company.id} organizationId={company.organization_id} products={products} onSaved={p=>{setProducts(rows=>rows.map(row=>row.id===p.id?p:row));refresh();}}/></div>:null}
    {visitedTabs.includes("obligations")?<div hidden={tab!=="obligations"}><CompanyObligations companyId={company.id} organizationId={company.organization_id} products={products} initialObligationId={requestedObligation}/></div>:null}
    {visitedTabs.includes("psur")?<div hidden={tab!=="psur"}><PsurCycles companyId={company.id} organizationId={company.organization_id} products={products} onChanged={refresh}/></div>:null}
    {visitedTabs.includes("documents")?<div hidden={tab!=="documents"}><CompanyRecords companyId={company.id} organizationId={company.organization_id} view="documents"/></div>:null}
    {visitedTabs.includes("history")?<div hidden={tab!=="history"}><CompanyRecords companyId={company.id} organizationId={company.organization_id} view="history"/></div>:null}
    <NewTaskModal open={showNew} initialCompanyId={company.id} onClose={()=>setShowNew(false)} onCreated={()=>{setShowNew(false);refresh()}}/>
  </>;
}
