"use client";

import { createClient, type Session } from "@supabase/supabase-js";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./review.module.css";

type Engine = "v3" | "v4";
type RunState = "active" | "producing" | "final_review" | "published" | "completed" | "blocked" | "cancelled";
type Run = { engine:Engine; runId:string; prospectId:string; siteId:string|null; piName:string; slug:string; state:RunState; blockedReason:string|null; startedAt:string; updatedAt:string; previewPath:string|null; publicUrl:string|null; evidenceCount:number; assetCount:number };
type Dashboard = { counts:{ finalReview:number; published:number; blocked:number; v4FinalReview?:number; v4Published?:number }; runs:Run[] };
type OutreachDraftResult = { status?:string; recipientEmail?:string; productionRunId?:string };
type PublishResult = { ok:boolean; engine?:Engine; runId:string; publicUrl:string; outreachSent:boolean; outreachDraft?:OutreachDraftResult };
type SendResult = { ok?:boolean; alreadySent?:boolean; providerMessageId?:string; recipient?:string; messageKind?:string; error?:string };

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function rpc<T>(session:Session,name:string,body:Record<string,unknown>={}):Promise<T>{
  const response=await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`,{method:"POST",headers:{"Content-Type":"application/json",apikey:supabaseKey,Authorization:`Bearer ${session.access_token}`},body:JSON.stringify(body),cache:"no-store"});
  const text=await response.text(); const payload=text?JSON.parse(text):null;
  if(!response.ok){const row=payload as {message?:string;details?:string;hint?:string}|null;throw new Error(row?.message||row?.details||row?.hint||`${name} failed (${response.status}).`)}
  return payload as T;
}

async function sendThroughLabNarrative(session:Session,productionRunId:string):Promise<SendResult>{
  const response=await fetch(`${supabaseUrl}/functions/v1/operator-send-outreach`,{method:"POST",headers:{"Content-Type":"application/json",apikey:supabaseKey,Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({runId:productionRunId,sendKsuCopy:false}),cache:"no-store"});
  const payload=await response.json().catch(()=>({})) as SendResult;
  if(!response.ok||payload.ok!==true)throw new Error(payload.error||`Email delivery failed (${response.status}).`);
  return payload;
}

function dateTime(value?:string|null){
  if(!value)return "—"; const date=new Date(value); if(Number.isNaN(date.getTime()))return "—";
  return new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Riyadh",day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(date);
}

export default function FinalReviewPage(){
  const [session,setSession]=useState<Session|null>(null); const [ready,setReady]=useState(false); const [dashboard,setDashboard]=useState<Dashboard|null>(null); const [notice,setNotice]=useState(""); const [busy,setBusy]=useState("");
  const load=useCallback(async(activeSession:Session)=>{try{setDashboard(await rpc<Dashboard>(activeSession,"engine_admin_dashboard"));setNotice("")}catch(error){setNotice(error instanceof Error?error.message:"Final Review could not be loaded.")}},[]);
  useEffect(()=>{let mounted=true;void supabase.auth.getSession().then(({data})=>{if(!mounted)return;setSession(data.session);setReady(true);if(data.session)void load(data.session)});const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,nextSession)=>{if(!mounted)return;setSession(nextSession);setReady(true);if(nextSession)void load(nextSession);else setDashboard(null)});return()=>{mounted=false;subscription.unsubscribe()}},[load]);

  const finalReview=useMemo(()=>dashboard?.runs.filter(run=>run.state==="final_review")??[],[dashboard]);
  const published=useMemo(()=>dashboard?.runs.filter(run=>run.state==="published").slice(0,24)??[],[dashboard]);

  async function approve(run:Run){
    if(!session||busy)return;
    setBusy(`${run.runId}:approve`);
    try{const result=await rpc<PublishResult>(session,"engine_admin_approve_publish",{p_run_id:run.runId,p_engine:run.engine,p_note:null});if(!result.ok||result.outreachSent)throw new Error("Publication did not return the expected safe draft state.");window.location.href=`/admin/outreach/${run.runId}`}
    catch(error){setNotice(error instanceof Error?error.message:"Approve & Publish failed.");setBusy("")}
  }

  async function approveAll(){
    if(!session||busy||finalReview.length===0)return;
    const runs=[...finalReview];
    let succeeded=0;
    const failed:string[]=[];
    for(let index=0;index<runs.length;index+=1){
      const run=runs[index];
      setBusy(`bulk:${index+1}:${runs.length}`);
      try{
        const result=await rpc<PublishResult>(session,"engine_admin_approve_publish",{p_run_id:run.runId,p_engine:run.engine,p_note:null});
        if(!result.ok||result.outreachSent)throw new Error("Unexpected publish result");
        succeeded+=1;
      }catch(error){
        failed.push(`${run.piName}: ${error instanceof Error?error.message:"publish failed"}`);
      }
    }
    setBusy("");
    await load(session);
    if(failed.length===0)setNotice(`Published all ${succeeded} Final Review concepts. Outreach drafts were prepared; no emails were sent.`);
    else setNotice(`Published ${succeeded} of ${runs.length}. ${failed.length} failed: ${failed.join(" · ")}`);
  }

  async function sendAll(){
    if(!session||busy||finalReview.length===0)return;
    const runs=[...finalReview];
    let sent=0;
    const failed:string[]=[];
    for(let index=0;index<runs.length;index+=1){
      const run=runs[index];
      setBusy(`sendall:${index+1}:${runs.length}`);
      try{
        const publishedResult=await rpc<PublishResult>(session,"engine_admin_approve_publish",{p_run_id:run.runId,p_engine:run.engine,p_note:"Approve, Publish, and Send triggered by administrator."});
        if(!publishedResult.ok||publishedResult.outreachSent)throw new Error("Unexpected publish result");
        const productionRunId=publishedResult.outreachDraft?.productionRunId?.trim()||"";
        const recipientEmail=publishedResult.outreachDraft?.recipientEmail?.trim()||"";
        if(!productionRunId)throw new Error("Outreach compatibility run was not created");
        if(!recipientEmail)throw new Error("Verified recipient email is missing");
        await rpc<boolean>(session,"authorize_operator_send",{p_run_id:productionRunId,p_recipient_email:recipientEmail});
        const sendResult=await sendThroughLabNarrative(session,productionRunId);
        if(sendResult.ok!==true)throw new Error("Email 1 was not confirmed as sent");
        sent+=1;
      }catch(error){
        failed.push(`${run.piName}: ${error instanceof Error?error.message:"send failed"}`);
      }
    }
    setBusy("");
    await load(session);
    if(failed.length===0)setNotice(`Approved, published, and sent Email 1 to all ${sent} Final Review concepts.`);
    else setNotice(`Sent Email 1 to ${sent} of ${runs.length}. ${failed.length} need attention: ${failed.join(" · ")}`);
  }

  async function block(run:Run){
    if(!session||busy)return; const reason=window.prompt(`Why should ${run.piName} be blocked?`)?.trim(); if(!reason)return; if(!window.confirm(`Block ${run.piName}? The private draft will remain unpublished.`))return; setBusy(`${run.runId}:block`);
    try{await rpc(session,"engine_admin_block",{p_run_id:run.runId,p_engine:run.engine,p_reason:reason});setNotice(`${run.piName} was blocked: ${reason}`);await load(session)}catch(error){setNotice(error instanceof Error?error.message:"Block failed.")}finally{setBusy("")}
  }

  async function revise(run:Run){
    if(!session||busy)return; const note=window.prompt(`What should ChatGPT revise for ${run.piName}?`)?.trim(); if(note===undefined)return; setBusy(`${run.runId}:revise`);
    try{await rpc(session,"engine_admin_return_to_production",{p_run_id:run.runId,p_engine:run.engine,p_note:note||null});setNotice(`${run.piName} was returned to ${run.engine.toUpperCase()} production.`);await load(session)}catch(error){setNotice(error instanceof Error?error.message:"Return to production failed.")}finally{setBusy("")}
  }

  if(!ready)return <main className={styles.state}>Preparing Final Review…</main>;
  if(!session)return <main className={styles.state}><section><h1>Administrator sign-in required.</h1><Link href="/admin">Open administrator dashboard</Link></section></main>;

  const bulkParts=busy.startsWith("bulk:")?busy.split(":"):null;
  const sendParts=busy.startsWith("sendall:")?busy.split(":"):null;
  const bulkLabel=bulkParts?`Publishing ${bulkParts[1]}/${bulkParts[2]}…`:`Approve & Publish All (${finalReview.length})`;
  const sendAllLabel=sendParts?`Sending ${sendParts[1]}/${sendParts[2]}…`:`Approve, Publish, and Send All (${finalReview.length})`;

  return <main className={styles.page}>
    <header className={styles.topbar}><div><Link className={styles.brand} href="/admin">LabNarrative</Link><span>Final Review</span></div><nav><Link href="/admin/discovery">Discovery</Link><Link href="/admin/automation">Production</Link><Link href="/admin/sites">Websites</Link><Link href="/admin/sales">Sales</Link></nav></header>
    <section className={styles.content}>
      <div className={styles.hero}><div><p className={styles.kicker}>Human publication gate</p><h1>Review. Publish. Prepare outreach.</h1><p>V4 concepts and preserved v3 concepts meet at the same human gate. Approve & Publish creates editable outreach drafts without sending. Approve, Publish, and Send immediately publishes every waiting concept and sends Email 1 with no extra confirmation.</p></div><div className={styles.heroActions}><button className={styles.bulkPublish} disabled={Boolean(busy)||finalReview.length===0} onClick={()=>void approveAll()} type="button">{bulkLabel}</button><button className={styles.bulkSend} disabled={Boolean(busy)||finalReview.length===0} onClick={()=>void sendAll()} type="button">{sendAllLabel}</button><button disabled={Boolean(busy)} onClick={()=>void load(session)} type="button">Refresh</button></div></div>
      {notice?<p className={styles.notice}>{notice}</p>:null}
      <section className={styles.stats}><article><span>Awaiting review</span><strong>{finalReview.length}</strong></article><article><span>Published concepts</span><strong>{dashboard?.counts.published??published.length}</strong></article><article><span>Blocked</span><strong>{dashboard?.counts.blocked??0}</strong></article></section>
      <section className={styles.panel}>
        <div className={styles.panelHeader}><div><p className={styles.kicker}>Final Review</p><h2>Ready for your decision</h2></div><span>{finalReview.length}</span></div>
        {finalReview.length===0?<p className={styles.empty}>No concepts are waiting for review.</p>:<div className={styles.list}>{finalReview.map(run=><article className={styles.row} key={`${run.engine}:${run.runId}`}><div className={styles.identity}><strong>{run.piName}</strong><span>{run.engine.toUpperCase()} · {run.slug} · evidence {run.evidenceCount} · assets {run.assetCount}</span><time>{dateTime(run.updatedAt)}</time></div><div className={styles.actions}>{run.previewPath?<a className={styles.secondary} href={run.previewPath} target="_blank" rel="noreferrer">Preview ↗</a>:null}<button className={styles.primary} disabled={Boolean(busy)} onClick={()=>void approve(run)} type="button">{busy===`${run.runId}:approve`?"Publishing…":"Approve & Publish"}</button><button className={styles.secondary} disabled={Boolean(busy)} onClick={()=>void revise(run)} type="button">Return to ChatGPT</button><button className={styles.danger} disabled={Boolean(busy)} onClick={()=>void block(run)} type="button">Block</button></div></article>)}</div>}
      </section>
      <section className={styles.panel}>
        <div className={styles.panelHeader}><div><p className={styles.kicker}>Published</p><h2>Outreach drafts</h2></div></div>
        {published.length===0?<p className={styles.empty}>Published concepts will appear here.</p>:<div className={styles.list}>{published.map(run=><article className={styles.row} key={`${run.engine}:${run.runId}`}><div className={styles.identity}><strong>{run.piName}</strong><span>{run.engine.toUpperCase()} · {run.publicUrl||run.slug}</span><time>{dateTime(run.updatedAt)}</time></div><div className={styles.actions}>{run.publicUrl?<a className={styles.secondary} href={run.publicUrl} target="_blank" rel="noreferrer">Open live ↗</a>:null}<Link className={styles.primary} href={`/admin/outreach/${run.runId}`}>Review outreach draft</Link></div></article>)}</div>}
      </section>
    </section>
  </main>;
}
