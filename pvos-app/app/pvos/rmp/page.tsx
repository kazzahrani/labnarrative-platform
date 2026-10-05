"use client";

import {FormEvent,useEffect,useMemo,useState} from "react";
import {Header,Badge} from "../_components";
import {usePVOS} from "../_provider";
import {pvosSupabase} from "../_pvos-supabase";
import styles from "../pvos.module.css";

type V={id:string,type:"initial"|"subsequent",dlp:string,submission_date:string,identified_risks:string,potential_risks:string,missing_information:string,comments_reason:string,additional_rmm:string,created_at:string};
type R={submitted_to:string,frequency:string,next_due_date:string,status:string,versions:V[]};
const blank:R={submitted_to:"SFDA",frequency:"On request",next_due_date:"",status:"Active",versions:[]};
const rv=(p:any):R=>{const x=p?.metadata?.rmp||{};return{...blank,...x,versions:Array.isArray(x.versions)?x.versions:[]}};
const last=(r:R)=>r.versions[r.versions.length-1];
const fmt=(v?:string)=>v?new Date(v+"T00:00:00").toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"}):"—";
const arm=(v?:V)=>{const x=(v?.additional_rmm||"").trim().toLowerCase();return !!x&&!["none","na","n/a","no armms","no armm"].includes(x)};
const id=()=>crypto.randomUUID();

export default function RmpPage(){
 const {organizationId,session}=usePVOS();
 const [companies,setCompanies]=useState<any[]>([]),[products,setProducts]=useState<any[]>([]),[sel,setSel]=useState<any|null>(null);
 const [r,setR]=useState<R>({...blank}),[initial,setInitial]=useState<V|null>(null),[msg,setMsg]=useState(""),[busy,setBusy]=useState(false);
 const [u,setU]=useState<V>({id:"",type:"subsequent",dlp:"",submission_date:"",identified_risks:"",potential_risks:"",missing_information:"",comments_reason:"",additional_rmm:"",created_at:""});
 async function load(){if(!organizationId)return;const {data:c}=await pvosSupabase.from("pvos_companies").select("id,name").eq("organization_id",organizationId).order("name");const cs=c||[];setCompanies(cs);if(!cs.length)return setProducts([]);const {data:p}=await pvosSupabase.from("pvos_products").select("*").in("company_id",cs.map(x=>x.id)).order("brand_name");setProducts(p||[])}
 useEffect(()=>{load()},[organizationId]);
 const cm=useMemo(()=>Object.fromEntries(companies.map(c=>[c.id,c.name])),[companies]);
 const tracked=products.filter(p=>rv(p).versions.length),today=new Date(new Date().toDateString()),soon=new Date(today);soon.setDate(soon.getDate()+30);
 const overdue=tracked.filter(p=>rv(p).next_due_date&&new Date(rv(p).next_due_date+"T00:00:00")<today).length;
 const dueSoon=tracked.filter(p=>{const d=rv(p).next_due_date;if(!d)return false;const x=new Date(d+"T00:00:00");return x>=today&&x<=soon}).length;
 const withArmm=tracked.filter(p=>arm(last(rv(p)))).length;
 function open(p:any){const x=rv(p),i=x.versions.find(v=>v.type==="initial")||{id:id(),type:"initial",dlp:"",submission_date:"",identified_risks:"",potential_risks:"",missing_information:"",comments_reason:"",additional_rmm:"",created_at:new Date().toISOString()} as V;setSel(p);setR(x);setInitial(i);setMsg("")}
 async function task(next:string){if(!sel||!organizationId||!next)return;const {data}=await pvosSupabase.from("pvos_tasks").select("*").eq("product_id",sel.id).eq("activity_type","RMP").in("status",["not_started","in_progress","awaiting_review","awaiting_external"]);const ex=(data||[]).find((x:any)=>x.metadata?.rmp_tracker);const due_at=new Date(next+"T17:00:00").toISOString();if(ex)await pvosSupabase.from("pvos_tasks").update({due_at,title:"RMP update — "+sel.brand_name}).eq("id",ex.id);else await pvosSupabase.from("pvos_tasks").insert({organization_id:organizationId,company_id:sel.company_id,product_id:sel.id,title:"RMP update — "+sel.brand_name,activity_type:"RMP",source:"system",status:"not_started",priority:"medium",owner_user_id:session?.user.id||null,due_at,metadata:{rmp_tracker:true}})}
 async function save(e:FormEvent){e.preventDefault();if(!sel||!initial)return;setBusy(true);let vs=[...r.versions],i=vs.findIndex(v=>v.type==="initial");if(i>=0)vs[i]=initial;else vs.unshift(initial);const next={...r,versions:vs},metadata={...(sel.metadata||{}),rmp:next};const {error}=await pvosSupabase.from("pvos_products").update({metadata,rmp_status:r.status}).eq("id",sel.id);if(!error&&r.next_due_date)await task(r.next_due_date);setBusy(false);setMsg(error?error.message:"RMP tracker saved"+(r.next_due_date?" and next update added to Tasks.":"."));setR(next);await load()}
 async function add(e:FormEvent){e.preventDefault();if(!sel||!u.submission_date)return;setBusy(true);const v={...u,id:id(),created_at:new Date().toISOString()},next={...r,versions:[...r.versions,v]},metadata={...(sel.metadata||{}),rmp:next};const {error}=await pvosSupabase.from("pvos_products").update({metadata,rmp_status:r.status}).eq("id",sel.id);if(!error&&r.next_due_date)await task(r.next_due_date);setBusy(false);if(error)return setMsg(error.message);setR(next);setU({...u,id:"",dlp:"",submission_date:"",identified_risks:"",potential_risks:"",missing_information:"",comments_reason:"",additional_rmm:"",created_at:""});setMsg("Subsequent RMP update added.");await load()}

 return <>
  <Header eyebrow="Product safety" title="RMP Tracker" sub="Track initial and subsequent RMP submissions, identified and potential risks, missing information, additional risk minimization measures, and the next DLP/update due date."/>
  <section className={styles.cards}><div className={styles.card}><span>RMPs tracked</span><strong>{tracked.length}</strong></div><div className={styles.card}><span>Due in 30 days</span><strong>{dueSoon}</strong></div><div className={[styles.card,overdue?styles.danger:""].join(" ")}><span>Overdue</span><strong>{overdue}</strong></div><div className={styles.card}><span>With additional RMM</span><strong>{withArmm}</strong></div></section>
  <section className={styles.panel}><div className={styles.panelHeader}><h2>RMP portfolio</h2><span className={styles.muted}>{products.length} products</span></div><div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Company</th><th>Product</th><th>Molecule</th><th>Submitted to</th><th>Frequency</th><th>Latest submission</th><th>Next DLP / update</th><th>aRMM</th><th></th></tr></thead><tbody>
  {products.map(p=>{const x=rv(p),l=last(x),tr=x.versions.length>0,late=x.next_due_date&&new Date(x.next_due_date+"T00:00:00")<today;return <tr key={p.id}><td>{cm[p.company_id]||"—"}</td><td><strong>{p.brand_name}</strong></td><td>{p.active_ingredient||"—"}</td><td>{tr?x.submitted_to:"—"}</td><td>{tr?x.frequency:"—"}</td><td>{tr?fmt(l?.submission_date):"—"}</td><td>{x.next_due_date?<Badge tone={late?"red":"default"}>{fmt(x.next_due_date)}</Badge>:tr?"On request / not set":"—"}</td><td>{tr?(arm(l)?<Badge tone="amber">Yes</Badge>:<Badge>No</Badge>):"—"}</td><td><button className={tr?styles.buttonGhost:styles.button} onClick={()=>open(p)}>{tr?"Open":"Set up"}</button></td></tr>})}
  </tbody></table></div></section>

  {sel&&initial?<section className={styles.panel}><div className={styles.panelHeader}><div><h2>{sel.brand_name} RMP</h2><span className={styles.muted}>{cm[sel.company_id]} · {sel.active_ingredient||"Molecule not set"}</span></div><button className={styles.buttonGhost} onClick={()=>setSel(null)}>Close</button></div>
   {msg?<div className={msg.includes("saved")||msg.includes("added")?styles.successBox:styles.errorBox} style={{margin:16}}>{msg}</div>:null}
   <form onSubmit={save} style={{padding:16}}><div className={styles.formGrid}>
    <label>Submitted to<input className={styles.input} value={r.submitted_to} onChange={e=>setR({...r,submitted_to:e.target.value})}/></label>
    <label>Frequency<input className={styles.input} value={r.frequency} onChange={e=>setR({...r,frequency:e.target.value})}/></label>
    <label>Status<select className={styles.input} value={r.status} onChange={e=>setR({...r,status:e.target.value})}><option>Active</option><option>On request</option><option>Not required</option><option>Closed</option></select></label>
    <label>Next DLP / update due date<input className={styles.input} type="date" value={r.next_due_date} onChange={e=>setR({...r,next_due_date:e.target.value})}/></label>
    <label>DLP<input className={styles.input} value={initial.dlp} onChange={e=>setInitial({...initial,dlp:e.target.value})} placeholder="Date or NA"/></label>
    <label>Initial submission date<input className={styles.input} type="date" value={initial.submission_date} onChange={e=>setInitial({...initial,submission_date:e.target.value})}/></label>
    <label className={styles.full}>RMP identified risks<textarea className={styles.input} value={initial.identified_risks} onChange={e=>setInitial({...initial,identified_risks:e.target.value})}/></label>
    <label className={styles.full}>RMP potential risks<textarea className={styles.input} value={initial.potential_risks} onChange={e=>setInitial({...initial,potential_risks:e.target.value})}/></label>
    <label className={styles.full}>Missing information<textarea className={styles.input} value={initial.missing_information} onChange={e=>setInitial({...initial,missing_information:e.target.value})}/></label>
    <label className={styles.full}>Additional Risk Minimization Measure<textarea className={styles.input} value={initial.additional_rmm} onChange={e=>setInitial({...initial,additional_rmm:e.target.value})}/></label>
   </div><div className={styles.inlineActions}><button className={styles.button} disabled={busy}>{busy?"Saving…":"Save tracker"}</button></div></form>

   {r.versions.filter(v=>v.type==="subsequent").length?<div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Subsequent submission</th><th>DLP</th><th>Identified</th><th>Potential</th><th>Missing info</th><th>Reason</th><th>aRMM</th></tr></thead><tbody>{r.versions.filter(v=>v.type==="subsequent").slice().reverse().map(v=><tr key={v.id}><td>{fmt(v.submission_date)}</td><td>{v.dlp||"—"}</td><td>{v.identified_risks||"—"}</td><td>{v.potential_risks||"—"}</td><td>{v.missing_information||"—"}</td><td>{v.comments_reason||"—"}</td><td>{v.additional_rmm||"—"}</td></tr>)}</tbody></table></div>:null}

   <form onSubmit={add} style={{padding:16,borderTop:"1px solid var(--border,#dfe5e9)"}}><h3>Add subsequent RMP update</h3><div className={styles.formGrid}>
    <label>DLP<input className={styles.input} value={u.dlp} onChange={e=>setU({...u,dlp:e.target.value})} placeholder="Date or NA"/></label>
    <label>Date of submission<input className={styles.input} type="date" value={u.submission_date} onChange={e=>setU({...u,submission_date:e.target.value})} required/></label>
    <label className={styles.full}>RMP identified risks<textarea className={styles.input} value={u.identified_risks} onChange={e=>setU({...u,identified_risks:e.target.value})}/></label>
    <label className={styles.full}>RMP potential risks<textarea className={styles.input} value={u.potential_risks} onChange={e=>setU({...u,potential_risks:e.target.value})}/></label>
    <label className={styles.full}>Missing information<textarea className={styles.input} value={u.missing_information} onChange={e=>setU({...u,missing_information:e.target.value})}/></label>
    <label className={styles.full}>Comments / reason for update<textarea className={styles.input} value={u.comments_reason} onChange={e=>setU({...u,comments_reason:e.target.value})}/></label>
    <label className={styles.full}>Additional Risk Minimization Measure<textarea className={styles.input} value={u.additional_rmm} onChange={e=>setU({...u,additional_rmm:e.target.value})}/></label>
   </div><div className={styles.inlineActions}><button className={styles.button} disabled={busy}>{busy?"Adding…":"Add RMP update"}</button></div></form>
  </section>:null}
 </>;
}
