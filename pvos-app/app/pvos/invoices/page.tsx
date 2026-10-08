"use client";
import Link from "next/link";
import {useCallback,useEffect,useMemo,useRef,useState,type FormEvent} from "react";
import {useSearchParams} from "next/navigation";
import {Badge,Header,Help} from "../_components";
import {usePVOS} from "../_provider";
import {pvosSupabase} from "../_pvos-supabase";
import styles from "../pvos.module.css";

type Invoice={
 id:string;company_id:string;company_name:string;title:string;invoice_ref:string|null;description:string;amount:number|null;currency:string;
 status:string;due_on:string|null;created_at:string;updated_at:string;completed_at:string|null;payment_reference:string|null;payment_date:string|null;payment_note?:string|null;
 requested_by:string;head_user_id:string;finance_user_id:string;requester_email:string;head_email:string;finance_email:string;last_returned_at?:string|null;file_count?:number;
 events?:{action:string;previous_status:string|null;next_status:string|null;note:string|null;created_at:string;actor_email:string}[];
 files?:{id:string;filename:string;storage_path:string;kind:"invoice"|"payment_proof";created_at:string;uploaded_by:string}[];
};
type InboxEvent={id:string;invoice_id:string;event_type:string;created_at:string;delivery_status:string};
type Company={id:string;name:string};
const stages:Record<string,string>={
 draft:"Draft · Attach PDF",head_review:"Head approval",returned_head:"Returned by Head",finance_review:"Finance approval",
 returned_finance:"Returned by Finance",awaiting_payment:"Awaiting payment confirmation",paid:"Payment completed"
};
const actions:Record<string,string>={created:"Draft created",submit:"Submitted to Head",file_uploaded:"Invoice PDF uploaded",payment_proof_uploaded:"Payment proof attached",head_approve:"Head approved",head_return:"Head returned",
 finance_approve:"Finance approved",finance_return:"Finance returned",resubmit:"Resubmitted",confirm_paid:"Payment executed"};
function tone(stage:string):"green"|"amber"|"red"|"default"{return stage==="paid"?"green":stage.startsWith("returned")?"red":"amber";}
const fmt=(d:string)=>new Date(d).toLocaleString("en-GB",{timeZone:"Asia/Riyadh",dateStyle:"medium",timeStyle:"short"});
function allowed(i:Invoice,uid:string){
 return i.status==="draft"?i.requested_by===uid:i.status==="head_review"?i.head_user_id===uid:i.status==="finance_review"||i.status==="awaiting_payment"?i.finance_user_id===uid:
 (i.status==="returned_head"||i.status==="returned_finance")&&i.requested_by===uid;
}
export default function InvoiceProcessingPage(){
 const {session,loading:authLoading}=usePVOS();
 const params=useSearchParams();
 const [rows,setRows]=useState<Invoice[]>([]),[companies,setCompanies]=useState<Company[]>([]),[notices,setNotices]=useState<InboxEvent[]>([]);
 const [opened,setOpened]=useState<string|null>(params.get("invoice")),[detail,setDetail]=useState<Invoice|null>(null);
 const [filter,setFilter]=useState<"mine"|"all"|"completed">("mine"),[search,setSearch]=useState("");
 const [showCreate,setShowCreate]=useState(!!params.get("company")),[companyId,setCompanyId]=useState(params.get("company")||"");
 const [title,setTitle]=useState(""),[description,setDescription]=useState(""),[reference,setReference]=useState("");
 const [headEmail,setHeadEmail]=useState(""),[financeEmail,setFinanceEmail]=useState(""),[dueOn,setDueOn]=useState("");
 const [amount,setAmount]=useState(""),[currency,setCurrency]=useState("SAR");
 const [note,setNote]=useState(""),[payRef,setPayRef]=useState(""),[payDate,setPayDate]=useState(new Date().toISOString().slice(0,10));
 const [busy,setBusy]=useState(false),[fileBusy,setFileBusy]=useState(false),[loading,setLoading]=useState(true),[message,setMessage]=useState(""),[error,setError]=useState("");
 const fileInput=useRef<HTMLInputElement>(null);
 const uid=session?.user.id||"";
 // The global notification bell can navigate between invoices on this same route.
 useEffect(()=>{
  const requested=params.get("invoice");
  if(requested)setOpened(requested);
 },[params]);
 const reload=useCallback(async()=>{
  const [r,c,n]=await Promise.all([
   pvosSupabase.rpc("pvos_invoice_list"),
   pvosSupabase.from("pvos_companies").select("id,name").order("name"),
   pvosSupabase.rpc("pvos_invoice_inbox_notifications")
  ]);
  if(r.error)throw r.error;
  setRows(r.data||[]);
  if(!c.error)setCompanies(c.data||[]);
  if(!n.error)setNotices(n.data||[]);
  setLoading(false);
 },[]);
 const loadDetail=useCallback(async(id:string)=>{
  const {data,error}=await pvosSupabase.rpc("pvos_invoice_detail",{p_invoice_id:id});
  if(error)throw error;
  setDetail(data);
 },[]);
 useEffect(()=>{if(!session)return;reload().catch(e=>{setError(e.message);setLoading(false);});},[session?.user.id,reload]);
 useEffect(()=>{if(!opened){setDetail(null);return;}loadDetail(opened).catch(e=>{setError(e.message);setDetail(null);});},[opened,loadDetail]);
 const visible=useMemo(()=>rows.filter(i=>(filter==="all"||filter==="completed"&&i.status==="paid"||filter==="mine"&&allowed(i,uid))
   &&[i.title,i.company_name,i.invoice_ref||"",i.description].join(" ").toLowerCase().includes(search.trim().toLowerCase())),[rows,uid,search,filter]);
 const current=detail&&detail.id===opened?detail:null;
 async function refresh(){await reload();if(opened)await loadDetail(opened);}
 async function dispatchNotice(invoiceId:string){
  // Best effort only; request and audit are stored even if email transport is not configured.
  try{
   const {data}=await pvosSupabase.auth.getSession();
   if(!data.session)return;
   await fetch("/api/pvos/invoices/dispatch",{method:"POST",headers:{"content-type":"application/json",authorization:"Bearer "+data.session.access_token},body:JSON.stringify({invoice_id:invoiceId})});
  }catch{/* Status remains visible in the in-app inbox. */}
 }
 async function create(e:FormEvent){
  e.preventDefault();setBusy(true);setError("");setMessage("");
  try{
   const v=amount.trim()?Number(amount):null;
   if(v!==null&&(!Number.isFinite(v)||v<0))throw new Error("Enter a valid amount");
   const {data,error:e2}=await pvosSupabase.rpc("pvos_invoice_create",{
    p_company_id:companyId,p_title:title,p_description:description,p_reference:reference||null,
    p_head_email:headEmail.trim(),p_finance_email:financeEmail.trim(),
    p_amount:v,p_currency:currency,p_due_on:dueOn||null
   });
   if(e2)throw e2;
   setShowCreate(false);setTitle("");setDescription("");setReference("");setAmount("");setHeadEmail("");setFinanceEmail("");setDueOn("");
   setMessage("Draft created. Upload the invoice PDF, then click Submit to Head. No approval notification has been sent yet.");
   await reload();setOpened(data.id);await loadDetail(data.id);window.dispatchEvent(new Event("pvos-notifications-changed"));void dispatchNotice(data.id);
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 async function upload(file:File|null,kind:"invoice"|"payment_proof"="invoice"){
  if(!file||!current)return;
  if(file.type!=="application/pdf"||file.size>25*1024*1024){setError("Upload a PDF under 25 MB.");return;}
  setFileBusy(true);setError("");setMessage("");
  try{
   const path=current.id+"/"+(kind==="payment_proof"?"proof-":"")+crypto.randomUUID()+".pdf";
   const uploaded=await pvosSupabase.storage.from("pvos-invoices").upload(path,file,{contentType:"application/pdf",upsert:false});
   if(uploaded.error)throw uploaded.error;
   const r=await pvosSupabase.rpc(kind==="payment_proof"?"pvos_invoice_record_payment_proof":"pvos_invoice_record_file",{p_invoice_id:current.id,p_path:path,p_filename:file.name});
   if(r.error)throw r.error;
   await refresh();setMessage(kind==="payment_proof"?"Payment evidence uploaded. Finance must still explicitly confirm execution.":"PDF uploaded as a new immutable invoice version.");
  }catch(e){setError((e as Error).message);}finally{setFileBusy(false);if(fileInput.current)fileInput.current.value="";}
 }
 async function openFile(path:string){
  setError("");
  const r=await pvosSupabase.storage.from("pvos-invoices").createSignedUrl(path,60);
  if(r.error||!r.data?.signedUrl){setError(r.error?.message||"Could not open this file");return;}
  window.open(r.data.signedUrl,"_blank","noopener,noreferrer");
 }
 async function act(action:string){
  if(!current)return;
  setBusy(true);setError("");setMessage("");
  try{
   const {error:e}=await pvosSupabase.rpc("pvos_invoice_act",{
    p_invoice_id:current.id,p_action:action,p_note:note.trim()||null,
    p_payment_reference:action==="confirm_paid"?payRef.trim():null,
    p_payment_date:action==="confirm_paid"?payDate:null
   });
   if(e)throw e;
   setNote("");setPayRef("");
   setMessage(action==="confirm_paid"?"Payment completion recorded. QPPV notification queued.":"Decision recorded and next assignee notified in PVOS.");
   await refresh();window.dispatchEvent(new Event("pvos-notifications-changed"));void dispatchNotice(current.id);
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 const canUpload=current&&uid===current.requested_by&&["draft","head_review","returned_head","returned_finance"].includes(current.status);
 const canUploadProof=current&&uid===current.finance_user_id&&current.status==="awaiting_payment";
 const nextActor=current?.status==="draft"?current.requester_email:current?.status==="head_review"?current.head_email:current?.status==="finance_review"||current?.status==="awaiting_payment"?current.finance_email:current?.status?.startsWith("returned")?current.requester_email:"—";
 return <div>
  <Header eyebrow="Requests · Invoice processing" title="Invoice processing"
   sub="Head approval → Finance approval → payment execution → QPPV confirmation. The system records actions; it does not transfer funds."
   action={<div className={styles.inlineActions} style={{marginTop:0}}><Link className={styles.buttonGhost} href="/pvos/companies">Companies</Link>{companies.length?<button className={styles.button} onClick={()=>{setError("");setShowCreate(true);}}>+ Process invoice</button>:null}</div>}/>
  {message?<div className={styles.successBox} role="status" style={{marginBottom:12}}>{message}</div>:null}
  {error?<div className={styles.errorBox} role="alert" style={{marginBottom:12}}>{error}</div>:null}
  <section className={styles.panel}>
   <div className={styles.panelHeader}><div><h2>My invoice inbox</h2><p className={styles.muted} style={{margin:"5px 0 0"}}>Only invoices assigned to you or submitted by you are visible.</p></div>
    <Help>Approvers can log in without being invited to the private pharmacovigilance workspace. Email delivery requires mail setup; in-app requests are always recorded.</Help></div>
   <div className={styles.sectionBody}>
    <div className={styles.requestFilters}>
     <input className={styles.input} aria-label="Search invoices" placeholder="Search invoices..." value={search} onChange={e=>setSearch(e.target.value)}/>
     <select aria-label="Invoice filter" className={styles.input} value={filter} onChange={e=>setFilter(e.target.value as typeof filter)}>
      <option value="mine">Needs my action</option><option value="all">All my invoices</option><option value="completed">Payment completed</option>
     </select>
    </div>
    {loading||authLoading?<div className={styles.empty}>Loading invoices...</div>:visible.length?visible.map(i=><button type="button" className={styles.requestListRow} key={i.id} onClick={()=>{setError("");setMessage("");setOpened(i.id);loadDetail(i.id).catch(e=>setError(e.message));}}>
      <span className={styles.requestRowName}><strong>{i.title} · {i.company_name}</strong><span>{i.invoice_ref||"No reference"} · {i.head_email} → {i.finance_email}</span></span>
      <span className={styles.requestRowEnd}><Badge tone={tone(i.status)}>{stages[i.status]||i.status}</Badge><span aria-hidden="true">›</span></span>
    </button>):<div className={styles.empty}>{filter==="mine"?"No invoices currently require your action. Choose All my invoices to view status history.":"No invoices found."}</div>}
   </div>
  </section>
  <section className={styles.panel}>
   <div className={styles.panelHeader}><h2>In-app notifications</h2><span className={styles.muted}>{notices.length}</span></div>
   <div className={styles.sectionBody}>{notices.length?notices.slice(0,15).map(n=><button className={styles.requestListRow} type="button" key={n.id} onClick={()=>setOpened(n.invoice_id)}>
    <span className={styles.requestRowName}><strong>{stages[n.event_type]||n.event_type}</strong><span>{fmt(n.created_at)} · Email: {n.delivery_status==="sent"?"Sent":n.delivery_status==="failed"?"Retry pending":"Queued / awaiting email setup"}</span></span><span aria-hidden="true">›</span>
   </button>):<div className={styles.empty}>No invoice notifications yet.</div>}</div>
  </section>

  {showCreate?<div className={styles.modalBackdrop} onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)setShowCreate(false);}}>
   <div className={styles.requestDialog} role="dialog" aria-modal="true" aria-labelledby="new-processing-title">
    <div className={styles.requestDialogHead}><div><h2 id="new-processing-title">Process invoice</h2><span className={styles.muted}>Select two distinct PVOS accounts for Head and Finance</span></div><button className={styles.modalClose} onClick={()=>setShowCreate(false)} aria-label="Close" disabled={busy}>×</button></div>
    <form onSubmit={create} className={styles.requestForm}>
     <div className={styles.formGrid}>
      <label>Company<select className={styles.input} required value={companyId} onChange={e=>setCompanyId(e.target.value)}><option value="">Select company</option>{companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <label>Invoice reference<input className={styles.input} value={reference} onChange={e=>setReference(e.target.value)} placeholder="INV-2026-001"/></label>
      <label>Head email<input className={styles.input} type="email" required value={headEmail} onChange={e=>setHeadEmail(e.target.value)} placeholder="head@example.com"/></label>
      <label>Finance email<input className={styles.input} type="email" required value={financeEmail} onChange={e=>setFinanceEmail(e.target.value)} placeholder="finance@example.com"/></label>
      <label>Amount (optional)<input className={styles.input} type="number" min="0" step=".01" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="2500.00"/></label>
      <label>Currency<select className={styles.input} value={currency} onChange={e=>setCurrency(e.target.value)}>{["SAR","USD","EUR","AED","GBP"].map(c=><option key={c} value={c}>{c}</option>)}</select></label>
      <label>Due date (optional)<input className={styles.input} type="date" value={dueOn} onChange={e=>setDueOn(e.target.value)}/></label>
     </div>
     <label className={styles.requestField}>Invoice title<input className={styles.input} required minLength={4} value={title} onChange={e=>setTitle(e.target.value)} placeholder="October PV services invoice"/></label>
     <label className={styles.requestField}>Processing details<textarea className={styles.input} required minLength={4} rows={3} value={description} onChange={e=>setDescription(e.target.value)} placeholder="What is being paid, and what must be checked?"/></label>
     <div className={styles.muted}>Both approvers need existing PVOS login accounts. Each receives access only to their assigned invoice. The invoice starts as a draft; attach a PDF and submit it to notify the Head. Email sending requires transport configuration.</div>
     <div className={styles.requestDialogActions}><button type="button" className={styles.buttonGhost} onClick={()=>setShowCreate(false)}>Cancel</button><button className={styles.button} type="submit" disabled={busy}>{busy?"Saving...":"Create draft"}</button></div>
    </form>
   </div>
  </div>:null}

  {opened?<div className={styles.requestDrawerBackdrop} onMouseDown={e=>{if(e.target===e.currentTarget)setOpened(null);}}>
   <div className={styles.requestDrawer} role="dialog" aria-modal="true" aria-labelledby="invoice-processing-details">
    <div className={styles.requestDrawerHeader}><div><div className={styles.muted}>Invoice processing</div><h2 id="invoice-processing-details">{current?.title||"Loading invoice..."}</h2></div><button type="button" className={styles.modalClose} aria-label="Close details" onClick={()=>setOpened(null)}>×</button></div>
    <div className={styles.requestDrawerBody}>
     {!current?<p className={styles.muted}>Loading invoice and approvals...</p>:<>
      <div className={styles.requestStatusLine}><Badge tone={tone(current.status)}>{stages[current.status]||current.status}</Badge><span className={styles.muted}>Created {fmt(current.created_at)}</span></div>
      <p className={styles.requestDescription}>{current.description}</p>
      <div className={styles.requestMeta}>
       <div><span>Company</span><strong>{current.company_name}</strong></div>
       <div><span>Reference</span><strong>{current.invoice_ref||"—"}</strong></div>
       <div><span>Amount</span><strong>{current.amount===null?"—":current.amount+" "+current.currency}</strong></div>
       <div><span>Next responsible</span><strong>{nextActor}</strong></div>
       <div><span>Requester (PV)</span><strong>{current.requester_email}</strong></div>
       <div><span>Head</span><strong>{current.head_email}</strong></div>
       <div><span>Finance</span><strong>{current.finance_email}</strong></div>
       <div><span>Due</span><strong>{current.due_on||"—"}</strong></div>
      </div>
      <section className={styles.requestDetailSection}>
       <h3>Invoice PDF versions</h3>
       {current.files?.length?current.files.map((file,i)=><div className={styles.requestEvidence} key={file.id}><div><strong>{file.filename}{file.kind==="payment_proof"?" · Payment proof":i===0?" · Latest":""}</strong><span className={styles.muted}>{fmt(file.created_at)} · {file.uploaded_by}</span></div><button className={styles.buttonGhost} onClick={()=>openFile(file.storage_path)}>Open PDF</button></div>):<p className={styles.muted}>No invoice PDF uploaded yet.</p>}
       {canUpload?<div><input ref={fileInput} type="file" accept="application/pdf,.pdf" className={styles.input} onChange={e=>{void upload(e.target.files?.[0]||null)}} disabled={fileBusy}/>{fileBusy?<p className={styles.muted}>Uploading...</p>:<p className={styles.muted}>Private invoice PDF · max 25 MB · every upload creates a new version.</p>}</div>:null}
       {canUploadProof?<div><label className={styles.requestField}>Payment proof (optional)<input type="file" accept="application/pdf,.pdf" className={styles.input} onChange={e=>{void upload(e.target.files?.[0]||null,"payment_proof")}} disabled={fileBusy}/></label><p className={styles.muted}>Upload a PDF receipt if available, then confirm the payment separately.</p></div>:null}
      </section>
      {current.status==="paid"?<div className={styles.requestApproved}><strong>Payment confirmed by Finance</strong><p>{current.payment_reference} · {current.payment_date}</p>{current.payment_note?<p>{current.payment_note}</p>:null}<p className={styles.muted}>This records Finance's confirmation; PVOS did not execute a transfer.</p></div>:null}
      {allowed(current,uid)?<section className={styles.requestDetailSection}>
       <h3>Your next action</h3>
       <label className={styles.requestField}>Review note / correction reason<textarea className={styles.input} value={note} onChange={e=>setNote(e.target.value)} rows={2} placeholder="Explain approval or what needs correcting"/></label>
       {current.status==="awaiting_payment"?<div className={styles.formGrid}>
        <label>Payment reference<input className={styles.input} required value={payRef} onChange={e=>setPayRef(e.target.value)} placeholder="Bank or finance reference"/></label>
        <label>Actual payment date<input className={styles.input} type="date" value={payDate} onChange={e=>setPayDate(e.target.value)}/></label>
       </div>:null}
       <div className={styles.requestActionRow}>
        {current.status==="draft"?<button className={styles.button} disabled={busy||!(current.files||[]).some(f=>f.kind==="invoice")} onClick={()=>act("submit")}>Submit to Head for approval</button>:null}
        {current.status==="head_review"?<><button className={styles.button} disabled={busy||!(current.files||[]).some(f=>f.kind==="invoice")} onClick={()=>act("head_approve")}>Approve → Finance</button><button className={styles.buttonGhost} disabled={busy||note.trim().length<4} onClick={()=>act("head_return")}>Return for corrections</button></>:null}
        {current.status==="finance_review"?<><button className={styles.button} disabled={busy} onClick={()=>act("finance_approve")}>Finance approve</button><button className={styles.buttonGhost} disabled={busy||note.trim().length<4} onClick={()=>act("finance_return")}>Return for corrections</button></>:null}
        {current.status==="awaiting_payment"?<button className={styles.button} disabled={busy||payRef.trim().length<3||!payDate} onClick={()=>act("confirm_paid")}>Confirm payment executed</button>:null}
        {current.status.startsWith("returned")?<button className={styles.button} disabled={busy||!(current.files||[]).some(f=>f.kind==="invoice"&&current.last_returned_at&&new Date(f.created_at)>new Date(current.last_returned_at))} onClick={()=>act("resubmit")}>Resubmit corrected PDF</button>:null}
       </div>
       {current.status==="draft"&&!current.files?.some(f=>f.kind==="invoice")?<p className={styles.muted}>Upload the invoice PDF to enable Submit to Head.</p>:null}
       {current.status==="head_review"&&!current.files?.length?<p className={styles.muted}>The requester must upload a PDF before Head approval.</p>:null}
       {current.status.startsWith("returned")?<p className={styles.muted}>Requester must upload a fresh PDF version after the return before resubmitting.</p>:null}
      </section>:null}
      <section className={styles.requestDetailSection}><h3>Processing history</h3>
       {current.events?.map((e,i)=><div key={i} className={styles.requestHistoryItem}><span className={styles.muted}>{fmt(e.created_at)}</span><div><strong>{actions[e.action]||e.action}</strong><p className={styles.muted}>{e.actor_email}</p>{e.note?<p>{e.note}</p>:null}</div></div>)}
      </section>
     </>}
    </div>
   </div>
  </div>:null}
 </div>;
}
