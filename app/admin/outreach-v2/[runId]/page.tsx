"use client";

import { createClient, type Session } from "@supabase/supabase-js";
import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";
import styles from "../../outreach/[runId]/outreach.module.css";

type OutreachDraft={runId:string;prospectId?:string;siteId?:string;recipientEmail:string;senderEmail:string;subject:string;bodyText:string;status:string;providerMessageId?:string;errorMessage?:string;sentAt?:string|null};
type SendResult={ok?:boolean;alreadySent?:boolean;providerMessageId?:string;recipient?:string;replyTo?:string;error?:string};

const supabaseUrl=process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const supabase=createClient(supabaseUrl,supabaseKey);

async function rpc<T>(session:Session,name:string,body:Record<string,unknown>={}):Promise<T>{
  const response=await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`,{method:"POST",headers:{"Content-Type":"application/json",apikey:supabaseKey,Authorization:`Bearer ${session.access_token}`},body:JSON.stringify(body),cache:"no-store"});
  const text=await response.text();const payload=text?JSON.parse(text):null;
  if(!response.ok){const row=payload as {message?:string;details?:string;hint?:string}|null;throw new Error(row?.message||row?.details||row?.hint||`${name} failed (${response.status}).`)}
  return payload as T;
}

async function sendThroughLabNarrative(session:Session,runId:string):Promise<SendResult>{
  const response=await fetch(`${supabaseUrl}/functions/v1/labnarrative-engine-v2-outreach-send`,{method:"POST",headers:{"Content-Type":"application/json",apikey:supabaseKey,Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({runId}),cache:"no-store"});
  const payload=await response.json().catch(()=>({})) as SendResult;
  if(!response.ok||payload.ok!==true)throw new Error(payload.error||`Email delivery failed (${response.status}).`);
  return payload;
}

export default function PreV3OutreachDraftPage(){
  const params=useParams<{runId:string}>();const runId=String(params.runId??"");
  const [session,setSession]=useState<Session|null>(null);const [ready,setReady]=useState(false);const [draft,setDraft]=useState<OutreachDraft|null>(null);const [recipientEmail,setRecipientEmail]=useState("");const [subject,setSubject]=useState("");const [bodyText,setBodyText]=useState("");const [notice,setNotice]=useState("");const [action,setAction]=useState<""|"save"|"send">("");

  const load=useCallback(async(activeSession:Session)=>{if(!runId)return;try{const row=await rpc<OutreachDraft>(activeSession,"engine_v2_admin_outreach_get",{p_run_id:runId});setDraft(row);setRecipientEmail(row.recipientEmail||"");setSubject(row.subject||"");setBodyText(row.bodyText||"");setNotice("")}catch(error){setNotice(error instanceof Error?error.message:"The outreach draft could not be loaded.")}},[runId]);
  useEffect(()=>{let mounted=true;void supabase.auth.getSession().then(({data})=>{if(!mounted)return;setSession(data.session);setReady(true);if(data.session)void load(data.session)});const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,nextSession)=>{if(!mounted)return;setSession(nextSession);setReady(true);if(nextSession)void load(nextSession);else setDraft(null)});return()=>{mounted=false;subscription.unsubscribe()}},[load]);

  async function persistDraft(activeSession:Session,showNotice=true):Promise<OutreachDraft>{
    const row=await rpc<OutreachDraft>(activeSession,"engine_v2_admin_outreach_save",{p_run_id:runId,p_recipient_email:recipientEmail,p_subject:subject,p_body_text:bodyText});
    setDraft(current=>({... (current??row),...row}));if(showNotice)setNotice("Draft saved. No email was sent.");return row;
  }

  async function save(event:FormEvent){event.preventDefault();if(!session||action||draft?.status!=="draft")return;setAction("save");try{await persistDraft(session,true)}catch(error){setNotice(error instanceof Error?error.message:"The outreach draft could not be saved.")}finally{setAction("")}}

  async function sendNow(){
    if(!session||action||!draft||draft.status!=="draft")return;
    if(!recipientEmail.trim()){setNotice("Add the verified recipient email before sending.");return}
    setAction("send");
    try{
      await persistDraft(session,false);
      const result=await sendThroughLabNarrative(session,runId);
      setNotice(result.alreadySent?"This outreach email had already been sent.":`Email sent successfully to ${result.recipient||recipientEmail}.`);
      await load(session);
    }catch(error){setNotice(error instanceof Error?error.message:"The email could not be sent.")}finally{setAction("")}
  }

  if(!ready)return <main className={styles.state}>Preparing outreach draft…</main>;
  if(!session)return <main className={styles.state}><section><h1>Administrator sign-in required.</h1><Link href="/admin">Open administrator dashboard</Link></section></main>;
  const editable=draft?.status==="draft";

  return <main className={styles.page}>
    <header className={styles.topbar}><div><Link className={styles.brand} href="/admin">LabNarrative</Link><span>Outreach</span></div><nav><Link href="/admin/sites">Websites</Link><Link href="/admin/sales">Sales</Link></nav></header>
    <section className={styles.content}>
      <div className={styles.hero}><div><p className={styles.kicker}>Human-controlled outreach</p><h1>Review, then send E1.</h1><p>This is the compatibility outreach flow for live pre-v3 concepts. Saving never sends. “Send Email Now” sends only after your explicit click and then activates the normal F1 → F2 sequence.</p></div></div>
      <div className={styles.safety} data-status={draft?.status||"draft"}><strong>{draft?.status==="sent"?"Outreach complete:":"Human gate:"}</strong><span>{draft?.status==="sent"?"E1 is already recorded as sent. The editor is now read-only.":`Outreach status is ${draft?.status||"draft"}. Nothing is sent unless you explicitly click Send Email Now.`}</span></div>
      {notice?<p className={styles.notice}>{notice}</p>:null}
      {!draft&&!notice?<p>Loading outreach draft…</p>:null}
      {draft?<form className={styles.form} onSubmit={save}>
        <label><span>From</span><input readOnly value={draft.senderEmail||"LabNarrative <khaled@labnarrative.com>"}/></label>
        <label><span>Recipient email</span><input disabled={!editable||Boolean(action)} placeholder="Verified institutional email" type="email" value={recipientEmail} onChange={event=>setRecipientEmail(event.target.value)}/></label>
        {editable&&!recipientEmail.trim()?<p className={styles.warning}>Recipient is still missing. Add the verified institutional email before sending.</p>:null}
        <label><span>Subject</span><input disabled={!editable||Boolean(action)} required value={subject} onChange={event=>setSubject(event.target.value)}/></label>
        <label><span>Email body</span><textarea disabled={!editable||Boolean(action)} required rows={24} value={bodyText} onChange={event=>setBodyText(event.target.value)}/></label>
        <div className={styles.actions}>{editable?<><button className={styles.saveButton} disabled={Boolean(action)} type="submit">{action==="save"?"Saving…":"Save Draft"}</button><button className={styles.sendButton} disabled={Boolean(action)||!recipientEmail.trim()} onClick={()=>void sendNow()} type="button">{action==="send"?"Sending…":"Send Email Now"}</button></>:null}<Link href="/admin/sites">Back to Websites</Link></div>
      </form>:null}
    </section>
  </main>;
}