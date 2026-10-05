"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Badge, Header } from "../_components";
import { usePVOS } from "../_provider";
import { pvosSupabase } from "../_pvos-supabase";
import styles from "../pvos.module.css";

type Tab="sources"|"queue"|"runs";
type ReviewStatus="unreviewed"|"relevant"|"not_relevant"|"needs_review";

const today=()=>new Date().toISOString().slice(0,10);
function daysAgo(n:number){const d=new Date();d.setDate(d.getDate()-n);return d.toISOString().slice(0,10)}
function nextDue(frequency:string){
  const d=new Date();
  if(frequency==="daily")d.setDate(d.getDate()+1);
  else if(frequency==="weekly")d.setDate(d.getDate()+7);
  else if(frequency==="monthly")d.setMonth(d.getMonth()+1);
  else if(frequency==="quarterly")d.setMonth(d.getMonth()+3);
  else return null;
  return d.toISOString();
}
function dateLabel(v?:string|null){
  if(!v)return "—";
  const d=new Date(v.length===10?v+"T00:00:00":v);
  return Number.isNaN(d.getTime())?"—":d.toLocaleDateString(undefined,{day:"2-digit",month:"short",year:"numeric"});
}
function relevanceLabel(v:string){
  if(v==="likely_relevant")return "Likely relevant";
  if(v==="possible")return "Possible";
  if(v==="unlikely")return "Unlikely";
  return "Unscored";
}
function relevanceTone(v:string):"default"|"red"|"amber"|"green"|"lime"{
  if(v==="likely_relevant")return "red";
  if(v==="possible")return "amber";
  if(v==="unlikely")return "green";
  return "default";
}
function reviewLabel(v:string){
  if(v==="relevant")return "Relevant";
  if(v==="not_relevant")return "Not relevant";
  if(v==="needs_review")return "Needs review";
  return "Unreviewed";
}

export default function LiteraturePage(){
  const {organizationId,session}=usePVOS();
  const [tab,setTab]=useState<Tab>("sources");
  const [sources,setSources]=useState<any[]>([]);
  const [runs,setRuns]=useState<any[]>([]);
  const [items,setItems]=useState<any[]>([]);
  const [companies,setCompanies]=useState<any[]>([]);
  const [products,setProducts]=useState<any[]>([]);
  const [loading,setLoading]=useState(true);
  const [showSource,setShowSource]=useState(false);
  const [showRun,setShowRun]=useState(false);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [sourceForm,setSourceForm]=useState({name:"",url:"",language:"English",frequency:"weekly",notes:""});
  const [runForm,setRunForm]=useState({companyId:"",start:daysAgo(7),end:today()});

  async function load(){
    if(!organizationId)return;
    setLoading(true);
    const [s,r,i,c]=await Promise.all([
      pvosSupabase.from("pvos_literature_sources").select("*").eq("organization_id",organizationId).order("name"),
      pvosSupabase.from("pvos_literature_runs").select("*").eq("organization_id",organizationId).order("period_end",{ascending:false}),
      pvosSupabase.from("pvos_literature_items").select("*").eq("organization_id",organizationId).order("created_at",{ascending:false}),
      pvosSupabase.from("pvos_companies").select("id,name").eq("organization_id",organizationId).order("name")
    ]);
    const cs=c.data||[];
    let ps:any[]=[];
    if(cs.length){
      const {data}=await pvosSupabase.from("pvos_products").select("id,company_id,brand_name,active_ingredient").in("company_id",cs.map(x=>x.id)).order("brand_name");
      ps=data||[];
    }
    setSources(s.data||[]);
    setRuns(r.data||[]);
    setItems(i.data||[]);
    setCompanies(cs);
    setProducts(ps);
    setRunForm(v=>({...v,companyId:v.companyId||cs[0]?.id||""}));
    setLoading(false);
  }

  useEffect(()=>{load()},[organizationId]);

  const companyMap=useMemo(()=>Object.fromEntries(companies.map(x=>[x.id,x.name])),[companies]);
  const productMap=useMemo(()=>Object.fromEntries(products.map(x=>[x.id,x])),[products]);
  const sourceMap=useMemo(()=>Object.fromEntries(sources.map(x=>[x.id,x])),[sources]);
  const activeSources=sources.filter(x=>x.active);
  const openItems=items.filter(x=>x.review_status==="unreviewed"||x.review_status==="needs_review");
  const reviewed=items.filter(x=>x.review_status==="relevant"||x.review_status==="not_relevant");
  const runCounts=useMemo(()=>{
    const out:Record<string,{total:number;reviewed:number}>={};
    for(const x of items){
      out[x.run_id]??={total:0,reviewed:0};
      out[x.run_id].total++;
      if(x.review_status==="relevant"||x.review_status==="not_relevant")out[x.run_id].reviewed++;
    }
    return out;
  },[items]);

  async function addSource(e:FormEvent){
    e.preventDefault();
    if(!organizationId||!sourceForm.name.trim())return;
    setBusy(true);setMessage("");
    const {error}=await pvosSupabase.from("pvos_literature_sources").insert({
      organization_id:organizationId,
      name:sourceForm.name.trim(),
      url:sourceForm.url.trim()||null,
      language:sourceForm.language,
      screening_frequency:sourceForm.frequency,
      method:"manual",
      next_due_at:nextDue(sourceForm.frequency),
      notes:sourceForm.notes.trim()||null,
      metadata:{v0:true}
    });
    setBusy(false);
    if(error){setMessage(error.message);return;}
    setSourceForm({name:"",url:"",language:"English",frequency:"weekly",notes:""});
    setShowSource(false);setMessage("Literature source added.");await load();
  }

  async function createRun(e:FormEvent){
    e.preventDefault();
    if(!organizationId||!session||!runForm.companyId||!runForm.start||!runForm.end)return;
    if(runForm.end<runForm.start){setMessage("Period end must be on or after the start date.");return;}
    const companyProducts=products.filter(x=>x.company_id===runForm.companyId);
    setBusy(true);setMessage("");
    const {error}=await pvosSupabase.from("pvos_literature_runs").insert({
      organization_id:organizationId,
      company_id:runForm.companyId,
      period_start:runForm.start,
      period_end:runForm.end,
      status:"draft",
      started_by:session.user.id,
      source_count:activeSources.length,
      product_count:companyProducts.length,
      metadata:{v0:true,scope:"all_company_products"}
    });
    setBusy(false);
    if(error){setMessage(error.message);return;}
    setShowRun(false);setTab("runs");setMessage("Screening run created. Source automation will populate its screening queue.");await load();
  }

  async function setReview(item:any,status:ReviewStatus){
    if(!session)return;
    setBusy(true);setMessage("");
    const reviewedNow=status==="relevant"||status==="not_relevant";
    const {error}=await pvosSupabase.from("pvos_literature_items").update({
      review_status:status,
      reviewer_user_id:session.user.id,
      reviewed_at:reviewedNow?new Date().toISOString():null
    }).eq("id",item.id);
    setBusy(false);
    if(error){setMessage(error.message);return;}
    await load();
  }

  return <>
    <Header
      eyebrow="Safety intelligence"
      title="Literature"
      sub="Register required literature sources, collect potential safety articles into one screening queue, record the QPPV decision, and preserve a traceable screening history."
      action={<div className={styles.inlineActions} style={{marginTop:0}}>
        <button className={styles.buttonGhost} onClick={()=>{setShowSource(true);setMessage("")}}>+ Add source</button>
        <button className={styles.button} onClick={()=>{setShowRun(true);setMessage("")}} disabled={!companies.length}>+ New screening run</button>
      </div>}
    />

    <section className={styles.cards}>
      <div className={styles.card}><span>Active sources</span><strong>{activeSources.length}</strong></div>
      <div className={styles.card}><span>Products in scope</span><strong>{products.length}</strong></div>
      <div className={[styles.card,openItems.length?styles.warning:""].join(" ")}><span>Open articles</span><strong>{openItems.length}</strong></div>
      <div className={styles.card}><span>Reviewed</span><strong>{reviewed.length}</strong></div>
      <div className={styles.card}><span>Screening runs</span><strong>{runs.length}</strong></div>
    </section>

    {message?<div className={message.includes("added")||message.includes("created")?styles.successBox:styles.errorBox} style={{marginBottom:14}}>{message}</div>:null}

    <section className={styles.panel}>
      <div style={{padding:"12px 14px 0",display:"flex",gap:8,flexWrap:"wrap"}}>
        <button className={tab==="sources"?styles.button:styles.buttonGhost} onClick={()=>setTab("sources")}>Sources</button>
        <button className={tab==="queue"?styles.button:styles.buttonGhost} onClick={()=>setTab("queue")}>Screening Queue {openItems.length?"("+openItems.length+")":""}</button>
        <button className={tab==="runs"?styles.button:styles.buttonGhost} onClick={()=>setTab("runs")}>Screening Runs</button>
      </div>

      {tab==="sources"?<>
        <div className={styles.panelHeader} style={{marginTop:12}}>
          <h2>Literature sources</h2>
          <span className={styles.muted}>{activeSources.length} active · {sources.length} total</span>
        </div>
        {loading?<div className={styles.empty}>Loading sources…</div>:sources.length?<div className={styles.tableWrap}><table className={styles.table}>
          <thead><tr><th>Source</th><th>Language</th><th>Frequency</th><th>Connection</th><th>Last checked</th><th>Next due</th><th>Status</th></tr></thead>
          <tbody>{sources.map(s=>{
            const due=s.next_due_at&&new Date(s.next_due_at)<new Date();
            return <tr key={s.id}>
              <td><strong>{s.name}</strong>{s.url?<div className={styles.muted} style={{marginTop:4}}><a href={s.url} target="_blank" rel="noreferrer">Open source ↗</a></div>:null}</td>
              <td>{s.language}</td>
              <td>{String(s.screening_frequency).replace("_"," ")}</td>
              <td><Badge>{s.method==="manual"?"Manual / pending automation":s.method.toUpperCase()}</Badge></td>
              <td>{dateLabel(s.last_checked_at)}</td>
              <td>{dateLabel(s.next_due_at)}</td>
              <td><Badge tone={!s.active?"default":due?"amber":"green"}>{!s.active?"Inactive":due?"Due":"Active"}</Badge></td>
            </tr>
          })}</tbody>
        </table></div>:<div className={styles.empty}>No literature sources yet. Add the journals or databases your QPPV team is required to screen.</div>}
      </>:null}

      {tab==="queue"?<>
        <div className={styles.panelHeader} style={{marginTop:12}}>
          <h2>Screening queue</h2>
          <span className={styles.muted}>{openItems.length} awaiting a final QPPV decision</span>
        </div>
        {loading?<div className={styles.empty}>Loading screening queue…</div>:items.length?<div className={styles.tableWrap}><table className={styles.table} style={{minWidth:1180}}>
          <thead><tr><th>Article</th><th>Product</th><th>Source</th><th>Published</th><th>Matched terms</th><th>AI relevance</th><th>QPPV review</th></tr></thead>
          <tbody>{items.map(x=>{
            const p=productMap[x.product_id];
            return <tr key={x.id}>
              <td style={{minWidth:290}}>
                {x.article_url?<a href={x.article_url} target="_blank" rel="noreferrer">{x.title}</a>:<strong>{x.title}</strong>}
                {x.ai_reason?<div className={styles.muted} style={{marginTop:5,maxWidth:430}}>{x.ai_reason}</div>:null}
              </td>
              <td>{p?<><strong>{p.brand_name}</strong><div className={styles.muted} style={{marginTop:3}}>{p.active_ingredient||"—"}</div></>:"—"}</td>
              <td>{sourceMap[x.source_id]?.name||x.journal||"—"}</td>
              <td>{dateLabel(x.publication_date)}</td>
              <td>{(x.matched_terms||[]).length?(x.matched_terms||[]).join(", "):"—"}</td>
              <td><Badge tone={relevanceTone(x.relevance)}>{relevanceLabel(x.relevance)}</Badge></td>
              <td style={{minWidth:275}}>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  <button disabled={busy} className={x.review_status==="relevant"?styles.button:styles.buttonGhost} onClick={()=>setReview(x,"relevant")}>Relevant</button>
                  <button disabled={busy} className={x.review_status==="not_relevant"?styles.button:styles.buttonGhost} onClick={()=>setReview(x,"not_relevant")}>Not relevant</button>
                  <button disabled={busy} className={x.review_status==="needs_review"?styles.button:styles.buttonGhost} onClick={()=>setReview(x,"needs_review")}>Needs review</button>
                </div>
                <div className={styles.muted} style={{marginTop:6}}>{reviewLabel(x.review_status)}</div>
              </td>
            </tr>
          })}</tbody>
        </table></div>:<div className={styles.empty}>No articles yet. Once source automation is connected, retrieved articles will appear here for QPPV review rather than being silently discarded.</div>}
      </>:null}

      {tab==="runs"?<>
        <div className={styles.panelHeader} style={{marginTop:12}}>
          <h2>Screening runs</h2>
          <span className={styles.muted}>One auditable record per screening period</span>
        </div>
        {loading?<div className={styles.empty}>Loading screening runs…</div>:runs.length?<div className={styles.tableWrap}><table className={styles.table}>
          <thead><tr><th>Period</th><th>Company</th><th>Sources</th><th>Products</th><th>Results</th><th>Reviewed</th><th>Status</th></tr></thead>
          <tbody>{runs.map(r=>{
            const counts=runCounts[r.id]||{total:r.result_count||0,reviewed:r.reviewed_count||0};
            return <tr key={r.id}>
              <td><strong>{dateLabel(r.period_start)} – {dateLabel(r.period_end)}</strong></td>
              <td>{companyMap[r.company_id]||"All companies"}</td>
              <td>{r.source_count}</td>
              <td>{r.product_count}</td>
              <td>{counts.total}</td>
              <td>{counts.reviewed}</td>
              <td><Badge tone={r.status==="complete"?"green":r.status==="review"?"amber":"default"}>{String(r.status).replace("_"," ")}</Badge></td>
            </tr>
          })}</tbody>
        </table></div>:<div className={styles.empty}>No screening runs yet. Create one for a historical or current screening period.</div>}
      </>:null}
    </section>

    {showSource?<div className={styles.modalBackdrop} onMouseDown={e=>{if(e.target===e.currentTarget)setShowSource(false)}}>
      <form className={styles.modalCard} onSubmit={addSource}>
        <div className={styles.modalHeader}>
          <div><div className={styles.eyebrow}>Source registry</div><h2>Add literature source</h2></div>
          <button type="button" className={styles.modalClose} onClick={()=>setShowSource(false)}>×</button>
        </div>
        <div className={styles.formGrid}>
          <label className={styles.full}>Journal / database name<input className={styles.input} value={sourceForm.name} onChange={e=>setSourceForm({...sourceForm,name:e.target.value})} required/></label>
          <label className={styles.full}>URL<input className={styles.input} type="url" value={sourceForm.url} onChange={e=>setSourceForm({...sourceForm,url:e.target.value})} placeholder="https://…"/></label>
          <label>Language<select className={styles.input} value={sourceForm.language} onChange={e=>setSourceForm({...sourceForm,language:e.target.value})}><option>English</option><option>Arabic</option><option>Arabic + English</option><option>Other</option></select></label>
          <label>Screening frequency<select className={styles.input} value={sourceForm.frequency} onChange={e=>setSourceForm({...sourceForm,frequency:e.target.value})}><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="manual">On demand</option></select></label>
          <label className={styles.full}>Notes<textarea className={styles.input} style={{minHeight:80}} value={sourceForm.notes} onChange={e=>setSourceForm({...sourceForm,notes:e.target.value})} placeholder="Access notes, search limitations, required coverage…"/></label>
        </div>
        <div className={styles.modalActions}><button type="button" className={styles.buttonGhost} onClick={()=>setShowSource(false)}>Cancel</button><button className={styles.button} disabled={busy}>{busy?"Adding…":"Add source"}</button></div>
      </form>
    </div>:null}

    {showRun?<div className={styles.modalBackdrop} onMouseDown={e=>{if(e.target===e.currentTarget)setShowRun(false)}}>
      <form className={styles.modalCard} onSubmit={createRun}>
        <div className={styles.modalHeader}>
          <div><div className={styles.eyebrow}>Literature screening</div><h2>New screening run</h2><div className={styles.muted} style={{marginTop:5}}>V0 records the screening scope and review trail. Automated retrieval will be connected source-by-source.</div></div>
          <button type="button" className={styles.modalClose} onClick={()=>setShowRun(false)}>×</button>
        </div>
        <div className={styles.formGrid}>
          <label className={styles.full}>Company<select className={styles.input} value={runForm.companyId} onChange={e=>setRunForm({...runForm,companyId:e.target.value})} required>{companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label>Period start<input className={styles.input} type="date" value={runForm.start} onChange={e=>setRunForm({...runForm,start:e.target.value})} required/></label>
          <label>Period end<input className={styles.input} type="date" value={runForm.end} onChange={e=>setRunForm({...runForm,end:e.target.value})} required/></label>
        </div>
        <div className={styles.info} style={{marginTop:16}}>
          <div className={styles.kv}><span>Active sources</span><span>{activeSources.length}</span></div>
          <div className={styles.kv}><span>Products</span><span>{products.filter(x=>x.company_id===runForm.companyId).length}</span></div>
          <div className={styles.kv}><span>Review model</span><span>Automation prioritizes · QPPV decides</span></div>
        </div>
        <div className={styles.modalActions}><button type="button" className={styles.buttonGhost} onClick={()=>setShowRun(false)}>Cancel</button><button className={styles.button} disabled={busy}>{busy?"Creating…":"Create run"}</button></div>
      </form>
    </div>:null}
  </>;
}
