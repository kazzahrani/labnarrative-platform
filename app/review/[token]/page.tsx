"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { browserSupabase as supabase } from "@/lib/supabase-browser";
import styles from "./final-review.module.css";

type ReviewData={
 review:{id:string;version:number;status:string;site_url:string;prepared_at?:string|null;sent_at?:string|null;approved_at?:string|null;changes_requested_at?:string|null;change_request?:string};
 prospect:{pi_name:string;institution:string;department?:string|null};
 site:{slug:string;domain_url?:string|null;updated_at?:string|null};
 stale:boolean;
 balance?:{token:string;status:string;amount:number|string;currency:string;paid_at?:string|null}|null;
};

function label(value:string){return value.replaceAll("_"," ").replace(/\b\w/g,l=>l.toUpperCase())}
function money(value:number|string,currency:string){const n=Number(value||0)||0;try{return new Intl.NumberFormat("en-US",{style:"currency",currency:currency||"USD",maximumFractionDigits:2}).format(n)}catch{return`${currency||"USD"} ${n.toFixed(2)}`}}

export default function ClientFinalReviewPage(){
 const params=useParams<{token:string}>();const token=String(params?.token||"");
 const[data,setData]=useState<ReviewData|null>(null);const[loading,setLoading]=useState(true);const[error,setError]=useState("");const[notice,setNotice]=useState("");const[decision,setDecision]=useState<"approve"|"changes"|null>(null);const[name,setName]=useState("");const[email,setEmail]=useState("");const[changes,setChanges]=useState("");const[busy,setBusy]=useState(false);
 const load=useCallback(async()=>{if(!token)return;setLoading(true);setError("");const{data:res,error:e}=await supabase.rpc("sales_client_final_review_public_get",{p_token:token});if(e)setError(e.message);else if(res&&typeof res==="object"&&"error" in res)setError(String((res as{error?:string}).error||"Review unavailable"));else setData(res as ReviewData);setLoading(false)},[token]);
 useEffect(()=>{void load()},[load]);
 async function submit(){if(!decision||name.trim().length<2)return;setBusy(true);setError("");const{data:res,error:e}=await supabase.rpc("sales_client_final_review_public_decide",{p_token:token,p_decision:decision,p_name:name,p_email:email||null,p_changes:decision==="changes"?changes:null});setBusy(false);if(e)setError(e.message);else if(res&&typeof res==="object"&&"error" in res)setError(String((res as{error?:string}).error||"Could not record your response"));else{setNotice(decision==="approve"?"Website approval recorded. Thank you.":"Your requested changes have been sent to LabNarrative.");setDecision(null);await load()}}
 if(loading)return <main className={styles.state}><section className={styles.stateBox}><div className={styles.logo}>LabNarrative</div><h1>Opening final review…</h1><p>Loading the website version prepared for your approval.</p></section></main>;
 if(!data)return <main className={styles.state}><section className={styles.stateBox}><div className={styles.logo}>LabNarrative</div><h1>Review unavailable.</h1><p>{error||"This private final-review link is unavailable."}</p></section></main>;
 const approved=data.review.status==="approved";const requested=data.review.status==="changes_requested";const canDecide=!data.stale&&!approved&&!requested;const balance=data.balance;const paid=balance?.status==="paid";
 return <main className={styles.page}>
  <header className={styles.topbar}><div className={styles.logo}>LabNarrative</div><div className={styles.meta}><span>Final website review · v{data.review.version}</span><strong>{label(data.review.status)}</strong><a className={styles.openSite} href={data.review.site_url} target="_blank" rel="noreferrer">Open website ↗</a></div></header>
  <div className={styles.workspace}>
   <section className={styles.preview}><iframe src={data.review.site_url} title={`${data.prospect.pi_name} website final review`}/></section>
   <aside className={styles.panel}>
    <p className={styles.eyebrow}>Final website approval</p><span className={styles.status}>{label(data.review.status)}</span><h1>Review the finished website.</h1><p>Please browse the website on the left, including its pages, text, images and links. Your approval applies specifically to the website version shown in this review.</p>
    <div className={styles.client}><strong>{data.prospect.pi_name}</strong><span>{data.prospect.institution}{data.prospect.department?` · ${data.prospect.department}`:""}</span></div>
    {data.stale?<div className={styles.stale}><strong>This review version has been replaced.</strong><br/>The website changed after this review was prepared, so approval is disabled. Please ask LabNarrative for the latest review link.</div>:null}
    {notice?<p className={styles.success}>{notice}</p>:null}{error?<p className={styles.error}>{error}</p>:null}
    {approved?<div className={styles.approvedBox}><h2>Website approved.</h2><p>Your final website approval has been recorded. {paid?"The project balance is also paid in full.":balance?"The remaining project balance is now ready for secure payment.":"LabNarrative will now proceed to the final delivery step."}</p>{balance?.token?<a className={styles.paymentLink} href={`/pay/${balance.token}`}>{paid?"View payment receipt":`Pay final balance · ${money(balance.amount,balance.currency)}`} →</a>:null}</div>:null}
    {requested?<div className={styles.changeBox}><h2>Changes requested.</h2><p>{data.review.change_request||"Your requested changes have been recorded."}</p><p>LabNarrative will make the revisions and send you a fresh review link for the updated website.</p></div>:null}
    {canDecide?<div className={styles.actions}><button className={styles.approve} type="button" onClick={()=>setDecision("approve")}>Approve final website</button><button className={styles.changes} type="button" onClick={()=>setDecision("changes")}>Request changes</button></div>:null}
    <p className={styles.fine}>Approval does not publish a new website version or charge you automatically. If a remaining balance is due, a separate secure payment request is created after approval.</p>
   </aside>
  </div>
  {decision?<div className={styles.modalBackdrop} onMouseDown={e=>{if(e.target===e.currentTarget)setDecision(null)}}><section className={styles.modal} role="dialog" aria-modal="true"><p className={styles.eyebrow}>{decision==="approve"?"Approve website":"Request changes"}</p><h2>{decision==="approve"?"Confirm this final website version.":"Tell us what should change."}</h2><label><span>Your name</span><input value={name} onChange={e=>setName(e.target.value)} autoFocus/></label><label><span>Email (optional)</span><input type="email" value={email} onChange={e=>setEmail(e.target.value)}/></label>{decision==="changes"?<label><span>Requested changes</span><textarea value={changes} onChange={e=>setChanges(e.target.value)} placeholder="Please be as specific as possible — page, wording, image, team member, link, layout, etc."/></label>:<p className={styles.notice}>This confirms that you approve the website version currently shown in this review. If a final project balance remains, the secure payment step will appear after approval.</p>}<div className={styles.modalActions}><button type="button" onClick={()=>setDecision(null)}>Cancel</button><button className={styles.confirm} type="button" onClick={()=>void submit()} disabled={busy||name.trim().length<2||(decision==="changes"&&changes.trim().length<5)}>{busy?"Recording…":decision==="approve"?"Confirm approval":"Send change request"}</button></div></section></div>:null}
 </main>
}
