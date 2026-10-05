"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { Header, Badge } from "../_components";
import { usePVOS } from "../_provider";
import { pvosSupabase } from "../_pvos-supabase";
import { PV_TEMPLATES, suggestedDueDate, type PVTemplate } from "../_pv-templates";
import styles from "../pvos.module.css";

type ImportKind="companies"|"products"|"obligations"|"tasks";
type Row=Record<string,string>;

const SAMPLES:Record<ImportKind,string>={
  companies:"name,contract_scope,status\nAlpha Pharma,Full PV service,active\nBeta Pharma,Literature + ICSR,active",
  products:"company,brand_name,active_ingredient,registration_status,sfda_registration_number,rmp_status\nAlpha Pharma,Oncora,osimeritinib,Registered,SFDA-001,Active",
  obligations:"company,product,title,activity_type,cadence,first_due,responsibility,evidence_required\nAlpha Pharma,,Weekly literature review,Literature,weekly,2026-10-12,organization,true",
  tasks:"company,product,title,activity_type,due_at,priority,status\nAlpha Pharma,Oncora,SFDA safety inquiry response,SFDA Inquiry,2026-10-09,high,not_started"
};

function parseCsv(text:string):Row[]{
  const lines=text.replace(/\r/g,"").split("\n").filter(x=>x.trim());
  if(lines.length<2)return[];
  const h=lines[0].split(",").map(x=>x.trim().toLowerCase().replace(/[^a-z0-9]+/g,"_"));
  return lines.slice(1).map(line=>{
    const v=line.split(",").map(x=>x.trim());
    return Object.fromEntries(h.map((k,i)=>[k,v[i]||""]));
  });
}
function toIso(v:string){if(!v)return null;const d=new Date(/^\d{4}-\d{2}-\d{2}$/.test(v)?v+"T17:00:00":v);return Number.isNaN(d.getTime())?null:d.toISOString();}
function yes(v:string){return !v||["1","true","yes","y"].includes(v.toLowerCase());}
function download(kind:ImportKind){
  const url=URL.createObjectURL(new Blob([SAMPLES[kind]],{type:"text/csv;charset=utf-8"}));
  const a=document.createElement("a");a.href=url;a.download="pvos-"+kind+"-template.csv";a.click();URL.revokeObjectURL(url);
}

export default function AutomationPage(){
  const {organizationId,session,refresh}=usePVOS();
  const [companies,setCompanies]=useState<any[]>([]);
  const [products,setProducts]=useState<any[]>([]);
  const [obligations,setObligations]=useState<any[]>([]);
  const [companyId,setCompanyId]=useState("");
  const [dates,setDates]=useState<Record<string,string>>(()=>Object.fromEntries(PV_TEMPLATES.map(t=>[t.id,suggestedDueDate(t)])));
  const [busy,setBusy]=useState<string|null>(null);
  const [message,setMessage]=useState<string|null>(null);
  const [kind,setKind]=useState<ImportKind>("products");
  const [csv,setCsv]=useState(SAMPLES.products);
  const [importing,setImporting]=useState(false);
  const [importMessage,setImportMessage]=useState<string|null>(null);

  async function load(){
    if(!organizationId)return;
    const {data:c}=await pvosSupabase.from("pvos_companies").select("*").eq("organization_id",organizationId).order("name");
    const cs=c||[];setCompanies(cs);setCompanyId(v=>v||cs[0]?.id||"");
    if(!cs.length){setProducts([]);setObligations([]);return;}
    const ids=cs.map(x=>x.id);
    const [p,o]=await Promise.all([
      pvosSupabase.from("pvos_products").select("*").in("company_id",ids).order("brand_name"),
      pvosSupabase.from("pvos_obligations").select("*").in("company_id",ids).eq("active",true)
    ]);
    setProducts(p.data||[]);setObligations(o.data||[]);
  }
  useEffect(()=>{load()},[organizationId]);

  const companyMap=useMemo(()=>new Map(companies.map(c=>[String(c.name).toLowerCase(),c])),[companies]);
  const productMap=useMemo(()=>new Map(products.map(p=>[p.company_id+"|"+String(p.brand_name).toLowerCase(),p])),[products]);
  const currentCompany=companies.find(c=>c.id===companyId);
  const added=new Set(obligations.filter(o=>o.company_id===companyId&&o.source_type==="template").map(o=>o.source_reference));
  const recurring=obligations.filter(o=>o.cadence!=="event").length;

  async function generate(){
    setMessage(null);
    const {data,error}=await pvosSupabase.rpc("pvos_materialize_due_obligations",{horizon_days:60});
    if(error)setMessage(error.message);else setMessage(String(data||0)+" upcoming tasks generated. Future recurring instances will continue to generate automatically.");
    refresh();await load();
  }

  async function addTemplate(t:PVTemplate){
    if(!companyId||!session)return;
    if(t.cadence!=="event"&&!dates[t.id]){setMessage("Choose the first due date.");return;}
    setBusy(t.id);setMessage(null);
    const {error}=await pvosSupabase.from("pvos_obligations").insert({
      company_id:companyId,title:t.title,activity_type:t.activityType,cadence:t.cadence,
      responsibility:"organization",owner_user_id:session.user.id,evidence_required:true,
      next_due_at:t.cadence==="event"?null:toIso(dates[t.id]),source_type:"template",source_reference:t.id
    });
    if(!error&&t.cadence!=="event")await pvosSupabase.rpc("pvos_materialize_due_obligations",{horizon_days:60});
    setBusy(null);setMessage(error?error.message:t.title+" added to "+(currentCompany?.name||"company")+".");
    refresh();await load();
  }

  function changeKind(k:ImportKind){setKind(k);setCsv(SAMPLES[k]);setImportMessage(null);}
  async function fileChanged(e:ChangeEvent<HTMLInputElement>){const f=e.target.files?.[0];if(f)setCsv(await f.text());}

  async function runImport(){
    if(!organizationId||!session)return;
    const rows=parseCsv(csv);if(!rows.length){setImportMessage("No data rows found.");return;}
    setImporting(true);setImportMessage(null);let count=0;const skipped:string[]=[];
    try{
      if(kind==="companies"){
        const payload=rows.flatMap((r,i)=>{if(!r.name){skipped.push("row "+(i+2)+": missing name");return[]}
          return[{organization_id:organizationId,name:r.name,contract_scope:r.contract_scope||null,status:["active","pre_registration","inactive"].includes(r.status)?r.status:"active"}]});
        if(payload.length){const {error}=await pvosSupabase.from("pvos_companies").insert(payload);if(error)throw error;count=payload.length;}
      }
      if(kind==="products"){
        const payload=rows.flatMap((r,i)=>{const c=companyMap.get((r.company||"").toLowerCase());if(!c||!r.brand_name){skipped.push("row "+(i+2)+": company or brand not found");return[]}
          return[{company_id:c.id,brand_name:r.brand_name,active_ingredient:r.active_ingredient||null,registration_status:r.registration_status||null,sfda_registration_number:r.sfda_registration_number||null,rmp_status:r.rmp_status||null}]});
        if(payload.length){const {error}=await pvosSupabase.from("pvos_products").insert(payload);if(error)throw error;count=payload.length;}
      }
      if(kind==="obligations"){
        const cadence=new Set(["daily","weekly","monthly","quarterly","semiannual","annual","event"]);
        const payload=rows.flatMap((r,i)=>{const c=companyMap.get((r.company||"").toLowerCase());if(!c||!r.title||!r.activity_type){skipped.push("row "+(i+2)+": required fields missing");return[]}
          const p=r.product?productMap.get(c.id+"|"+r.product.toLowerCase()):null;if(r.product&&!p){skipped.push("row "+(i+2)+": product not found");return[]}
          const cd=cadence.has(r.cadence)?r.cadence:"event";const due=cd==="event"?null:toIso(r.first_due);if(cd!=="event"&&!due){skipped.push("row "+(i+2)+": first_due required");return[]}
          return[{company_id:c.id,product_id:p?.id||null,title:r.title,activity_type:r.activity_type,cadence:cd,responsibility:["organization","client","shared"].includes(r.responsibility)?r.responsibility:"organization",owner_user_id:session.user.id,evidence_required:yes(r.evidence_required),next_due_at:due,source_type:"bulk_import",source_reference:"csv-"+Date.now()+"-"+i}]});
        if(payload.length){const {error}=await pvosSupabase.from("pvos_obligations").insert(payload);if(error)throw error;count=payload.length;await pvosSupabase.rpc("pvos_materialize_due_obligations",{horizon_days:60});}
      }
      if(kind==="tasks"){
        const payload=rows.flatMap((r,i)=>{const c=companyMap.get((r.company||"").toLowerCase());if(!c||!r.title||!r.activity_type){skipped.push("row "+(i+2)+": required fields missing");return[]}
          const p=r.product?productMap.get(c.id+"|"+r.product.toLowerCase()):null;if(r.product&&!p){skipped.push("row "+(i+2)+": product not found");return[]}
          return[{organization_id:organizationId,company_id:c.id,product_id:p?.id||null,title:r.title,activity_type:r.activity_type,source:"manual",status:["not_started","in_progress","awaiting_review","awaiting_external","complete","cancelled"].includes(r.status)?r.status:"not_started",priority:["low","medium","high","critical"].includes(r.priority)?r.priority:"medium",owner_user_id:session.user.id,due_at:toIso(r.due_at),metadata:{imported_from_csv:true}}]});
        if(payload.length){const {error}=await pvosSupabase.from("pvos_tasks").insert(payload);if(error)throw error;count=payload.length;}
      }
      await load();refresh();setImportMessage(String(count)+" "+kind+" imported"+(skipped.length?". Skipped: "+skipped.slice(0,3).join("; "):"."));
    }catch(e:any){setImportMessage(e?.message||"Import failed.");}
    finally{setImporting(false);}
  }

  return <>
    <Header eyebrow="Reduce manual setup" title="Automation & import" sub="Create recurring PV work automatically, start from PV-specific templates, and migrate existing trackers without retyping every task or product."/>
    <section className={styles.cards}>
      <div className={styles.card}><span>Recurring obligations</span><strong>{recurring}</strong></div>
      <div className={styles.card}><span>Event-driven</span><strong>{obligations.length-recurring}</strong></div>
      <div className={styles.card}><span>Companies</span><strong>{companies.length}</strong></div>
      <div className={styles.card}><span>Products</span><strong>{products.length}</strong></div>
    </section>

    <section className={styles.panel} style={{marginBottom:16}}>
      <div className={styles.panelHeader}><div><h2>Recurring task engine</h2><div className={styles.muted}>Create an obligation once. PVOS creates the individual task instances and preserves every previous cycle.</div></div><button className={styles.button} onClick={generate}>Generate next 60 days</button></div>
      <div className={styles.notice} style={{margin:14}}>Automatic generation already runs when the workspace loads. Use this after changing schedules or importing obligations.</div>
      {message?<div className={styles.successBox} style={{margin:"0 14px 14px"}}>{message}</div>:null}
    </section>

    <section className={styles.panel} style={{marginBottom:16}}>
      <div className={styles.panelHeader}><div><h2>PV template library</h2><div className={styles.muted}>Templates reduce setup, but the first due date must still match the real contract, SOP and regulatory schedule.</div></div><select className={styles.input} style={{maxWidth:260}} value={companyId} onChange={e=>setCompanyId(e.target.value)}><option value="">Select company</option>{companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
      <div style={{padding:14,display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(290px,1fr))",gap:12}}>
        {PV_TEMPLATES.map(t=><div key={t.id} className={styles.info} style={{margin:0}}>
          <div style={{display:"flex",justifyContent:"space-between",gap:10}}><div><h3 style={{marginTop:0}}>{t.title}</h3><div className={styles.muted}>{t.description}</div></div><Badge>{t.cadence==="event"?"Event":t.cadence}</Badge></div>
          {t.cadence!=="event"?<label style={{display:"block",marginTop:12}}>First due date<input className={styles.input} type="date" value={dates[t.id]||""} onChange={e=>setDates(v=>({...v,[t.id]:e.target.value}))}/></label>:<div className={styles.notice} style={{marginTop:12}}>No automatic deadline until the event or product-specific schedule is confirmed.</div>}
          <div className={styles.inlineActions}><button className={added.has(t.id)?styles.buttonGhost:styles.button} disabled={!companyId||!!busy||added.has(t.id)} onClick={()=>addTemplate(t)}>{added.has(t.id)?"Added":busy===t.id?"Adding…":"Add template"}</button></div>
        </div>)}
      </div>
    </section>

    <section className={styles.panel} style={{marginBottom:16}}>
      <div className={styles.panelHeader}><div><h2>Bulk import</h2><div className={styles.muted}>Export the current Excel tracker as CSV, match these headers, then import instead of retyping.</div></div><button className={styles.buttonGhost} onClick={()=>download(kind)}>Download CSV template</button></div>
      <div style={{padding:14}}>
        <div className={styles.inlineActions} style={{marginTop:0,flexWrap:"wrap"}}>{(["companies","products","obligations","tasks"] as ImportKind[]).map(k=><button key={k} className={kind===k?styles.button:styles.buttonGhost} onClick={()=>changeKind(k)}>{k[0].toUpperCase()+k.slice(1)}</button>)}</div>
        <div className={styles.formGrid} style={{marginTop:14}}>
          <label>CSV file<input className={styles.input} type="file" accept=".csv,text/csv" onChange={fileChanged}/></label>
          <div><strong>Recommended order</strong><div className={styles.muted} style={{marginTop:8}}>Companies → Products → Obligations / Tasks.</div></div>
          <label className={styles.full}>CSV preview<textarea className={styles.input} style={{minHeight:210,fontFamily:"ui-monospace,SFMono-Regular,Menlo,monospace"}} value={csv} onChange={e=>setCsv(e.target.value)}/></label>
        </div>
        {importMessage?<div className={importMessage.toLowerCase().includes("failed")?styles.errorBox:styles.successBox} style={{marginTop:12}}>{importMessage}</div>:null}
        <div className={styles.inlineActions}><button className={styles.button} disabled={importing} onClick={runImport}>{importing?"Importing…":"Import "+kind}</button></div>
      </div>
    </section>

    <section className={styles.panel}>
      <div className={styles.panelHeader}><div><h2>Microsoft 365 integration</h2><div className={styles.muted}>Next layer after the migration and recurring-workflow path are validated.</div></div><Badge>Planned</Badge></div>
      <div className={styles.notice} style={{margin:14}}>Outlook can later turn selected regulatory emails into suggested tasks and deadlines. SharePoint / OneDrive can link controlled documents instead of duplicating them. The QPPV remains the final reviewer.</div>
    </section>
  </>;
}
