"use client";

import {FormEvent,useEffect,useMemo,useRef,useState} from "react";
import {Header,Badge,Tabs,Help} from "../_components";
import {usePVOS} from "../_provider";
import {pvosSupabase} from "../_pvos-supabase";
import {RmpExcelImport} from "../_rmp-excel-import";
import Link from "next/link";
import {deadlineState} from "../_work-utils";
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
 const {organizationId,session,reloadToken}=usePVOS();
 const [companies,setCompanies]=useState<any[]>([]),[products,setProducts]=useState<any[]>([]),[sel,setSel]=useState<any|null>(null);
 const [r,setR]=useState<R>({...blank}),[initial,setInitial]=useState<V|null>(null),[msg,setMsg]=useState(""),[busy,setBusy]=useState(false),[tab,setTab]=useState<"overview"|"initial"|"updates">("overview");
 const [companyScope,setCompanyScope]=useState(""),[filter,setFilter]=useState("all"),[loading,setLoading]=useState(true),[error,setError]=useState("");
 const deepLinkOpened=useRef(false);
 const [taskContext,setTaskContext]=useState("");
 const [addOpen,setAddOpen]=useState(false),[expanded,setExpanded]=useState<string|null>(null);
 const [u,setU]=useState<V>({id:"",type:"subsequent",dlp:"",submission_date:"",identified_risks:"",potential_risks:"",missing_information:"",comments_reason:"",additional_rmm:"",created_at:""});

 async function load(){if(!organizationId)return;setLoading(true);setError("");try{const {data:c,error:ce}=await pvosSupabase.from("pvos_companies").select("id,name").eq("organization_id",organizationId).order("name");if(ce)throw ce;const cs=c||[];setCompanies(cs);if(!cs.length){setProducts([]);return;}const {data:p,error:pe}=await pvosSupabase.from("pvos_products").select("*").in("company_id",cs.map(x=>x.id)).order("brand_name");if(pe)throw pe;setProducts(p||[]);const q=new URLSearchParams(window.location.search);if(!deepLinkOpened.current){setCompanyScope(cs.some(c=>c.id===q.get("company"))?q.get("company")||"":"");setTaskContext(q.get("task")||"");const target=p?.find(x=>x.id===q.get("product"));if(target)open(target);deepLinkOpened.current=true;}}catch(e:any){setError(e.message||"Could not load RMP portfolio");}finally{setLoading(false);}}
 useEffect(()=>{load()},[organizationId,reloadToken]);
 const cm=useMemo(()=>Object.fromEntries(companies.map(c=>[c.id,c.name])),[companies]);
 const scoped=products.filter(p=>!companyScope||p.company_id===companyScope),tracked=scoped.filter(p=>rv(p).versions.length);
 const dueState=(p:any)=>deadlineState(rv(p).next_due_date,["Closed","Not required"].includes(rv(p).status)?"complete":"in_progress");
 const overdue=tracked.filter(p=>dueState(p).overdue).length,dueSoon=tracked.filter(p=>{const days=dueState(p).days;return days!==null&&days>=0&&days<=30}).length;
 const withArmm=tracked.filter(p=>arm(last(rv(p)))).length;
 const visible=scoped.filter(p=>filter==="all"||filter==="overdue"&&dueState(p).overdue||filter==="due"&&dueState(p).days!==null&&dueState(p).days!>=0&&dueState(p).days!<=30||filter==="untracked"&&!rv(p).versions.length);
 function open(p:any){const x=rv(p),i=x.versions.find(v=>v.type==="initial")||{id:id(),type:"initial",dlp:"",submission_date:"",identified_risks:"",potential_risks:"",missing_information:"",comments_reason:"",additional_rmm:"",created_at:new Date().toISOString()} as V;setSel(p);setR(x);setInitial(i);setMsg("");setTab("overview");setAddOpen(false);setExpanded(null)}
 async function task(next:string){
  if(!sel||!organizationId||!next)return;
  const {data}=await pvosSupabase.from("pvos_tasks").select("*").eq("product_id",sel.id).eq("activity_type","RMP").in("status",["not_started","in_progress","awaiting_review","awaiting_external"]);
  const ex=(data||[]).find((x:any)=>x.metadata?.rmp_tracker);
  const due_at=new Date(next+"T17:00:00").toISOString();
  let taskId=ex?.id as string|undefined;
  if(ex) await pvosSupabase.from("pvos_tasks").update({due_at,title:"RMP update — "+sel.brand_name}).eq("id",ex.id);
  else {
    const {data:created}=await pvosSupabase.from("pvos_tasks").insert({organization_id:organizationId,company_id:sel.company_id,product_id:sel.id,title:"RMP update — "+sel.brand_name,activity_type:"RMP",source:"system",status:"not_started",priority:"medium",owner_user_id:session?.user.id||null,due_at,metadata:{rmp_tracker:true}}).select("id").single();
    taskId=created?.id;
  }
  if(!taskId)return;
  const {data:existingApprovals}=await pvosSupabase.from("pvos_task_approvals").select("id").eq("task_id",taskId).limit(1);
  if(existingApprovals?.length)return;
  const {data:routes}=await pvosSupabase.from("pvos_approval_routes").select("id").eq("company_id",sel.company_id).eq("active",true).eq("activity_type","RMP").order("created_at").limit(1);
  const routeId=routes?.[0]?.id;
  if(!routeId)return;
  const {data:steps}=await pvosSupabase.from("pvos_approval_steps").select("*").eq("route_id",routeId).order("position");
  if(steps?.length) await pvosSupabase.from("pvos_task_approvals").insert(steps.map((x:any)=>({task_id:taskId,route_id:routeId,step_position:x.position,assigned_user_id:x.assignee_user_id,status:"pending"})));
 }
 async function save(){if(!sel||!initial)return;setBusy(true);let vs=[...r.versions],i=vs.findIndex(v=>v.type==="initial");if(i>=0)vs[i]=initial;else vs.unshift(initial);const next={...r,versions:vs},metadata={...(sel.metadata||{}),rmp:next};const {error}=await pvosSupabase.from("pvos_products").update({metadata,rmp_status:r.status}).eq("id",sel.id);if(!error&&r.next_due_date)await task(r.next_due_date);setBusy(false);setMsg(error?error.message:"RMP tracker saved"+(r.next_due_date?" and next update added to company work.":"."));setR(next);await load()}
 async function add(e:FormEvent){e.preventDefault();if(!sel||!u.submission_date)return;setBusy(true);const v={...u,id:id(),created_at:new Date().toISOString()},next={...r,versions:[...r.versions,v]},metadata={...(sel.metadata||{}),rmp:next};const {error}=await pvosSupabase.from("pvos_products").update({metadata,rmp_status:r.status}).eq("id",sel.id);if(!error&&r.next_due_date)await task(r.next_due_date);setBusy(false);if(error)return setMsg(error.message);setR(next);setU({...u,id:"",dlp:"",submission_date:"",identified_risks:"",potential_risks:"",missing_information:"",comments_reason:"",additional_rmm:"",created_at:""});setExpanded(v.id);setAddOpen(false);setMsg("Subsequent RMP update added.");await load()}

 return <>
  <Header eyebrow="Product safety" title="RMP Tracker" sub="Track initial and subsequent RMP submissions, identified and potential risks, missing information, additional risk minimization measures, and the next DLP/update due date."/>
  {taskContext?<div className={styles.notice}><Link href={"/pvos/tasks/"+taskContext+"#evidence"}>Task evidence & review →</Link> <Help>Saving the RMP register preserves its versions. Open the task to manage evidence and review.</Help></div>:null}
  <div className={styles.workSummary}><span>{tracked.length} tracked</span><button className={styles.summaryButton} onClick={()=>setFilter("overdue")}>{overdue} overdue</button><button className={styles.summaryButton} onClick={()=>setFilter("due")}>{dueSoon} due in 30 days</button><span>{withArmm} with additional RMM <Help>Additional risk minimization measures are recorded in the latest submitted version.</Help></span></div>
  <section className={styles.panel}>
   <div className={styles.panelHeader}><h2>RMP portfolio</h2><RmpExcelImport organizationId={organizationId} userId={session?.user.id} companies={companies} products={products} onImported={load}/></div>
   <div className={styles.filterBar}><select aria-label="RMP company" className={styles.input} value={companyScope} onChange={e=>{setCompanyScope(e.target.value);const q=new URL(window.location.href);if(e.target.value)q.searchParams.set("company",e.target.value);else q.searchParams.delete("company");q.searchParams.delete("product");q.searchParams.delete("task");setTaskContext("");window.history.replaceState({},"",q)}}><option value="">All companies</option>{companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select><select aria-label="RMP work filter" className={styles.input} value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">All products</option><option value="overdue">Overdue</option><option value="due">Due in 30 days</option><option value="untracked">Not set up</option></select></div>
   {error?<div className={styles.errorBox} role="alert">{error} <button className={styles.buttonGhost} onClick={load}>Retry</button></div>:loading?<div className={styles.empty}>Loading RMP portfolio…</div>:<div className={styles.tableWrap}><table className={`${styles.table} ${styles.workTable}`}><thead><tr><th>Company / product</th><th>RMP status</th><th>Latest submission</th><th>Next due</th><th>Additional RMM</th><th>Next action</th></tr></thead><tbody>{visible.map(p=>{const x=rv(p),v=last(x),due=dueState(p);return <tr key={p.id}><td><strong>{p.brand_name}</strong><div>{cm[p.company_id]}</div></td><td><Badge>{v?x.status:"Not set up"}</Badge></td><td>{fmt(v?.submission_date)}{v?<div className={styles.muted}>{v.type==="initial"?"Initial":"Subsequent"} · {x.versions.length} versions</div>:null}</td><td>{x.next_due_date?fmt(x.next_due_date):v?"On request / not set":"—"}{due.label?<div><Badge tone={due.overdue?"red":"default"}>{due.label}</Badge></div>:null}</td><td>{v?arm(v)?"Yes":"No":"—"}</td><td><button className={styles.buttonGhost} onClick={()=>open(p)}>{v?due.overdue?"Review overdue RMP":"Open RMP":"Set up RMP"}</button></td></tr>})}</tbody></table>{!visible.length?<div className={styles.empty}>No products in this view.</div>:null}</div>}
  </section>

  {sel&&initial?<div className={styles.modalBackdrop} onMouseDown={e=>{if(e.target===e.currentTarget)setSel(null)}}>
   <div className={styles.modalCard} style={{width:"min(1080px,100%)",maxHeight:"calc(100vh - 40px)",padding:0}}>
    <div className={styles.modalHeader} style={{padding:"18px 20px 14px",margin:0,borderBottom:"1px solid #e3e8eb",position:"sticky",top:0,zIndex:4,background:"inherit"}}>
      <div><div className={styles.eyebrow}>{cm[sel.company_id]||"Company"}</div><h2>{sel.brand_name} RMP</h2><div className={styles.muted}>{sel.active_ingredient||"Molecule not set"}</div></div>
      <button className={styles.modalClose} onClick={()=>setSel(null)}>×</button>
    </div>

    <div style={{padding:"14px 20px 0"}}><Tabs label="Product RMP areas" value={tab} onChange={v=>setTab(v as typeof tab)} items={[{id:"overview",label:"Overview"},{id:"initial",label:"Initial RMP"},{id:"updates",label:`Subsequent RMP (${r.versions.filter(v=>v.type==="subsequent").length})`}]}/></div>

    {msg?<div className={msg.includes("saved")||msg.includes("added")?styles.successBox:styles.errorBox} style={{margin:"14px 20px 0"}}>{msg}</div>:null}

    {tab==="overview"?<div style={{padding:20}}>
      <div className={styles.formGrid}>
        <label>Submitted to<input className={styles.input} value={r.submitted_to} onChange={e=>setR({...r,submitted_to:e.target.value})}/></label>
        <label>Frequency<input className={styles.input} value={r.frequency} onChange={e=>setR({...r,frequency:e.target.value})}/></label>
        <label>Status<select className={styles.input} value={r.status} onChange={e=>setR({...r,status:e.target.value})}><option>Active</option><option>On request</option><option>Not required</option><option>Closed</option></select></label>
        <label>Next DLP / update due date<input className={styles.input} type="date" value={r.next_due_date} onChange={e=>setR({...r,next_due_date:e.target.value})}/></label>
      </div>
      <div className={styles.info} style={{marginTop:16}}>
        <h3>Current RMP snapshot</h3>
        <div className={styles.kv}><span>Initial RMP — Date of submission</span><span>{fmt(initial.submission_date)}</span></div>
        <div className={styles.kv}><span>Subsequent RMP — Date of submission</span><span>{fmt(r.versions.filter(v=>v.type==="subsequent").slice(-1)[0]?.submission_date)} {r.versions.some(v=>v.type==="subsequent")?<button style={{marginLeft:8,border:0,background:"transparent",padding:0,color:"inherit",textDecoration:"underline",cursor:"pointer",fontSize:12}} onClick={()=>setTab("updates")}>View full history ({r.versions.filter(v=>v.type==="subsequent").length})</button>:null}</span></div>
        <div className={styles.kv}><span>Additional Risk Minimization Measure</span><span>{arm(r.versions.filter(v=>v.type==="subsequent").slice(-1)[0]||initial)?"Yes":"No"}</span></div>
      </div>
      <div className={styles.inlineActions}><button className={styles.button} onClick={save} disabled={busy}>{busy?"Saving…":"Save overview"}</button></div>
    </div>:null}

    {tab==="initial"?<div style={{padding:20}}>
      <h3 style={{margin:"0 0 14px",fontSize:15}}>Initial RMP</h3>
      <div className={styles.formGrid}>
        <label>DLP<input className={styles.input} value={initial.dlp} onChange={e=>setInitial({...initial,dlp:e.target.value})} placeholder="Date or NA"/></label>
        <label>Date of submission<input className={styles.input} type="date" value={initial.submission_date} onChange={e=>setInitial({...initial,submission_date:e.target.value})}/></label>
      </div>
      <div className={styles.info} style={{marginTop:16}}>
        <h3>Information Submitted</h3>
        <div className={styles.formGrid}>
          <label className={styles.full}>RMP Identified<textarea className={styles.input} style={{minHeight:78}} value={initial.identified_risks} onChange={e=>setInitial({...initial,identified_risks:e.target.value})}/></label>
          <label className={styles.full}>RMP Potential<textarea className={styles.input} style={{minHeight:78}} value={initial.potential_risks} onChange={e=>setInitial({...initial,potential_risks:e.target.value})}/></label>
          <label className={styles.full}>Missing Info<textarea className={styles.input} style={{minHeight:68}} value={initial.missing_information} onChange={e=>setInitial({...initial,missing_information:e.target.value})}/></label>
        </div>
      </div>
      <div style={{marginTop:16}}><label className={styles.full} style={{display:"grid",gap:7,fontSize:12,fontWeight:700}}>Additional Risk Minimization Measure<textarea className={styles.input} style={{minHeight:68}} value={initial.additional_rmm} onChange={e=>setInitial({...initial,additional_rmm:e.target.value})}/></label></div>
      <div className={styles.inlineActions}><button className={styles.button} onClick={save} disabled={busy}>{busy?"Saving…":"Save Initial RMP"}</button></div>
    </div>:null}

    {tab==="updates"?<div style={{padding:20}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,marginBottom:14}}>
        <div><h3 style={{margin:0,fontSize:15}}>Subsequent RMP</h3><Help>Newest submission first. Open a record to see submitted information and update details.</Help></div>
        <button className={styles.button} onClick={()=>setAddOpen(true)}>+ Add subsequent RMP</button>
      </div>

      {r.versions.filter(v=>v.type==="subsequent").length?<div style={{display:"grid",gap:10}}>
        {r.versions.filter(v=>v.type==="subsequent").slice().reverse().map(v=>{
          const isOpen=expanded===v.id;
          return <div key={v.id} className={styles.info} style={{padding:0,overflow:"hidden"}}>
            <button onClick={()=>setExpanded(isOpen?null:v.id)} style={{width:"100%",border:0,background:"transparent",padding:"14px 16px",display:"grid",gridTemplateColumns:"150px minmax(220px,1fr) 140px auto",gap:12,alignItems:"center",textAlign:"left",cursor:"pointer",color:"inherit"}}>
              <strong style={{fontSize:13}}>{fmt(v.submission_date)}</strong>
              <span style={{fontSize:12,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{v.comments_reason||"No Comments/Reason for update recorded"}</span>
              <span>{arm(v)?<Badge tone="amber">Additional RMM</Badge>:<Badge>No Additional RMM</Badge>}</span>
              <span className={styles.muted}>{isOpen?"Hide":"View details"} ▾</span>
            </button>
            {isOpen?<div style={{padding:"0 16px 16px",borderTop:"1px solid #e8edef"}}>
              <div className={styles.kv}><span>RMP Identified</span><span>{v.identified_risks||"—"}</span></div>
              <div className={styles.kv}><span>RMP Potential</span><span>{v.potential_risks||"—"}</span></div>
              <div className={styles.kv}><span>Missing Info</span><span>{v.missing_information||"—"}</span></div>
              <div className={styles.kv}><span>Comments/Reason for update</span><span>{v.comments_reason||"—"}</span></div>
              <div className={styles.kv}><span>Additional Risk Minimization Measure</span><span>{v.additional_rmm||"—"}</span></div>
            </div>:null}
          </div>
        })}
      </div>:<div className={styles.empty}>No subsequent RMP updates yet.</div>}
    </div>:null}
   {addOpen?<div className={styles.modalBackdrop} style={{zIndex:1200}} onMouseDown={e=>{if(e.target===e.currentTarget)setAddOpen(false)}}>
      <form onSubmit={add} className={styles.modalCard} style={{width:"min(760px,100%)"}}>
        <div className={styles.modalHeader}>
          <div><div className={styles.eyebrow}>{sel.brand_name}</div><h2>Subsequent RMP</h2><Help>New subsequent RMP records preserve previous submissions.</Help></div>
          <button type="button" className={styles.modalClose} onClick={()=>setAddOpen(false)}>×</button>
        </div>
        <div className={styles.formGrid}>
          <label className={styles.full}>Date of submission<input className={styles.input} type="date" value={u.submission_date} onChange={e=>setU({...u,submission_date:e.target.value})} required/></label>
          <label className={styles.full}>RMP Identified<textarea className={styles.input} style={{minHeight:72}} value={u.identified_risks} onChange={e=>setU({...u,identified_risks:e.target.value})}/></label>
          <label className={styles.full}>RMP Potential<textarea className={styles.input} style={{minHeight:72}} value={u.potential_risks} onChange={e=>setU({...u,potential_risks:e.target.value})}/></label>
          <label className={styles.full}>Missing Info<textarea className={styles.input} style={{minHeight:64}} value={u.missing_information} onChange={e=>setU({...u,missing_information:e.target.value})}/></label>
          <label className={styles.full}>Comments/Reason for update<textarea className={styles.input} style={{minHeight:64}} value={u.comments_reason} onChange={e=>setU({...u,comments_reason:e.target.value})}/></label>
          <label className={styles.full}>Additional Risk Minimization Measure<textarea className={styles.input} style={{minHeight:64}} value={u.additional_rmm} onChange={e=>setU({...u,additional_rmm:e.target.value})}/></label>
        </div>
        <div className={styles.modalActions}><button type="button" className={styles.buttonGhost} onClick={()=>setAddOpen(false)}>Cancel</button><button className={styles.button} disabled={busy}>{busy?"Adding…":"Add subsequent RMP"}</button></div>
      </form>
    </div>:null}
   </div>
  </div>:null}

 </>;
}