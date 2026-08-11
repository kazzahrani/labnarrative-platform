"use client";

import { createClient, type Session } from "@supabase/supabase-js";
import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";
import styles from "./outreach.module.css";

type OutreachDraft={runId:string;productionRunId:string;messageId:string;recipientEmail:string;senderEmail:string;subject:string;bodyText:string;status:string;publicUrl?:string};
type SendResult={ok?:boolean;alreadySent?:boolean;providerMessageId?:string;recipient?:string;messageKind?:string;bccIncluded?:boolean;bccAddress?:string;error?:string};
type WebsiteMode="lab_exists"|"lab_doesnt_exist";
type WebsiteModeResult={ok?:boolean;mode?:WebsiteMode;bodyText?:string;subject?:string;status?:string};

const supabaseUrl=process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const supabase=createClient(supabaseUrl,supabaseKey);
const KSU_COPY_EMAIL="kazzahrani@ksu.edu.sa";
const LAB_EXISTS_SENTENCE="I am aware that your laboratory already has an online presence, but I felt there may be an opportunity to present the group’s research, publications, and scientific direction in a more focused and contemporary way.";
const LAB_DOESNT_EXIST_SENTENCE="Given the significance and breadth of your work, I felt that it could benefit from a dedicated website presenting the laboratory’s research, publications, and scientific direction in one place.";

function applyWebsiteMode(body:string,mode:WebsiteMode){
  const target=mode==="lab_exists"?LAB_EXISTS_SENTENCE:LAB_DOESNT_EXIST_SENTENCE;
  if(body.includes(LAB_EXISTS_SENTENCE))return body.replace(LAB_EXISTS_SENTENCE,target);
  if(body.includes(LAB_DOESNT_EXIST_SENTENCE))return body.replace(LAB_DOESNT_EXIST_SENTENCE,target);
  return body.replace(/(I have followed your research on[^\n]+for years, although unfortunately we have never had the opportunity to connect\.)[^\n]*/i,`$1 ${target}`);
}

function returnToSourcePage(){
  const fallback="/admin/review";
  try{
    if(document.referrer){
      const referrer=new URL(document.referrer);
      if(referrer.origin===window.location.origin&&referrer.pathname.startsWith("/admin/")&&!referrer.pathname.startsWith("/admin/outreach/")){
        window.location.href=`${referrer.pathname}${referrer.search}${referrer.hash}`;
        return;
      }
    }
  }catch{}
  if(window.history.length>1){window.history.back();return}
  window.location.href=fallback;
}

async function rpc<T>(session:Session,name:string,body:Record<string,unknown>={}):Promise<T>{
  const response=await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`,{method:"POST",headers:{"Content-Type":"application/json",apikey:supabaseKey,Authorization:`Bearer ${session.access_token}`},body:JSON.stringify(body),cache:"no-store"});
  const text=await response.text();const payload=text?JSON.parse(text):null;
  if(!response.ok){const row=payload as {message?:string;details?:string;hint?:string}|null;throw new Error(row?.message||row?.details||row?.hint||`${name} failed (${response.status}).`)}
  return payload as T;
}

async function sendThroughLabNarrative(session:Session,productionRunId:string,sendKsuCopy:boolean):Promise<SendResult>{
  const response=await fetch(`${supabaseUrl}/functions/v1/operator-send-outreach`,{method:"POST",headers:{"Content-Type":"application/json",apikey:supabaseKey,Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({runId:productionRunId,sendKsuCopy}),cache:"no-store"});
  const payload=await response.json().catch(()=>({})) as SendResult;
  if(!response.ok||payload.ok!==true)throw new Error(payload.error||`Email delivery failed (${response.status}).`);
  return payload;
}

export default function OutreachDraftPage(){
  const params=useParams<{runId:string}>();const runId=String(params.runId??"");
  const [session,setSession]=useState<Session|null>(null);const [ready,setReady]=useState(false);const [draft,setDraft]=useState<OutreachDraft|null>(null);const [recipientEmail,setRecipientEmail]=useState("");const [subject,setSubject]=useState("");const [bodyText,setBodyText]=useState("");const [websiteMode,setWebsiteMode]=useState<WebsiteMode>("lab_exists");const [sendKsuCopy,setSendKsuCopy]=useState(false);const [notice,setNotice]=useState("");const [action,setAction]=useState<""|"save"|"send"|"private"|"template">("");

  const load=useCallback(async(activeSession:Session)=>{if(!runId)return;try{
    const row=await rpc<OutreachDraft>(activeSession,"engine_admin_outreach_get",{p_run_id:runId});
    let loaded=row;
    if(row.status==="draft"){
      const selected=await rpc<WebsiteModeResult>(activeSession,"engine_admin_outreach_set_website_awareness",{p_run_id:runId,p_mode:"lab_exists"});
      loaded={...row,subject:typeof selected.subject==="string"?selected.subject:row.subject,bodyText:typeof selected.bodyText==="string"?selected.bodyText:applyWebsiteMode(row.bodyText||"","lab_exists")};
    }
    setDraft(loaded);setRecipientEmail(loaded.recipientEmail||"");setSubject(loaded.subject||"");setBodyText(applyWebsiteMode(loaded.bodyText||"","lab_exists"));setWebsiteMode("lab_exists");setNotice("");
  }catch(error){setNotice(error instanceof Error?error.message:"The outreach draft could not be loaded.")}},[runId]);
  useEffect(()=>{let mounted=true;void supabase.auth.getSession().then(({data})=>{if(!mounted)return;setSession(data.session);setReady(true);if(data.session)void load(data.session)});const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,nextSession)=>{if(!mounted)return;setSession(nextSession);setReady(true);if(nextSession)void load(nextSession);else setDraft(null)});return()=>{mounted=false;subscription.unsubscribe()}},[load]);

  async function persistDraft(activeSession:Session,showNotice=true):Promise<OutreachDraft>{
    const row=await rpc<OutreachDraft>(activeSession,"engine_admin_outreach_save",{p_run_id:runId,p_recipient_email:recipientEmail,p_subject:subject,p_body_text:bodyText});
    setDraft(current=>({...(current??row),...row}));if(showNotice)setNotice("Draft saved. No email was sent.");return row;
  }

  async function save(event:FormEvent){event.preventDefault();if(!session||action||draft?.status!=="draft")return;setAction("save");try{await persistDraft(session,true)}catch(error){setNotice(error instanceof Error?error.message:"The outreach draft could not be saved.")}finally{setAction("")}}

  async function switchWebsiteMode(nextMode:WebsiteMode){
    if(!session||action||!draft||draft.status!=="draft")return;
    const nextBody=applyWebsiteMode(bodyText,nextMode);
    setWebsiteMode(nextMode);
    setBodyText(nextBody);
    setDraft(current=>current?{...current,bodyText:nextBody}:current);
    setAction("template");
    try{
      await rpc<OutreachDraft>(session,"engine_admin_outreach_save",{p_run_id:runId,p_recipient_email:recipientEmail,p_subject:subject,p_body_text:nextBody});
      const result=await rpc<WebsiteModeResult>(session,"engine_admin_outreach_set_website_awareness",{p_run_id:runId,p_mode:nextMode});
      const confirmedBody=typeof result.bodyText==="string"?applyWebsiteMode(result.bodyText,nextMode):nextBody;
      setBodyText(confirmedBody);
      setDraft(current=>current?{...current,subject:typeof result.subject==="string"?result.subject:current.subject,bodyText:confirmedBody}:current);
      if(typeof result.subject==="string")setSubject(result.subject);
      setNotice(nextMode==="lab_exists"?"Loaded the outreach draft for a lab that already has a website.":"Loaded the outreach draft for a lab without an existing website.");
    }catch(error){setNotice(error instanceof Error?error.message:"The outreach template could not be changed.")}finally{setAction("")}
  }

  async function sendNow(){
    if(!session||action||!draft||draft.status!=="draft")return;
    if(!recipientEmail.trim()){setNotice("Add the verified recipient email before sending.");return}
    setAction("send");
    try{
      const saved=await persistDraft(session,false);
      await rpc<boolean>(session,"authorize_operator_send",{p_run_id:saved.productionRunId,p_recipient_email:saved.recipientEmail});
      await sendThroughLabNarrative(session,saved.productionRunId,sendKsuCopy);
      returnToSourcePage();
    }catch(error){setNotice(error instanceof Error?error.message:"The email could not be sent.");setAction("")}
  }

  async function confirmPrivateSend(){
    if(!session||action||!draft||draft.status!=="draft")return;
    if(!recipientEmail.trim()){setNotice("Add the recipient email before recording a private send.");return}
    setAction("private");
    try{
      const saved=await persistDraft(session,false);
      await rpc(session,"mark_private_outreach_sent",{p_run_id:saved.productionRunId});
      returnToSourcePage();
    }catch(error){setNotice(error instanceof Error?error.message:"The private send could not be recorded.");setAction("")}
  }

  if(!ready)return <main className={styles.state}>Preparing outreach draft…</main>;
  if(!session)return <main className={styles.state}><section><h1>Administrator sign-in required.</h1><Link href="/admin">Open administrator dashboard</Link></section></main>;
  const editable=draft?.status==="draft";

  const templateButton=(mode:WebsiteMode,label:string)=>{
    const active=websiteMode===mode;
    return <button type="button" disabled={!editable||Boolean(action)} onClick={()=>void switchWebsiteMode(mode)} style={{border:`1px solid ${active?"rgba(72,154,127,.72)":"rgba(92,132,151,.30)"}`,borderRadius:10,padding:"9px 13px",background:active?"#214f43":"#0d1f2a",color:active?"#effbf6":"#c9d5dc",font:"inherit",fontSize:".78rem",fontWeight:800,cursor:!editable||action?"default":"pointer",opacity:!editable||action?.72:1}}>{action==="template"&&active?"Loading…":label}</button>;
  };

  return <main className={styles.page}>
    <header className={styles.topbar}><div><Link className={styles.brand} href="/admin">LabNarrative</Link><span>Outreach</span></div><nav><Link href="/admin/review">Final Review</Link><Link href="/admin/automation">Production</Link><Link href="/admin/sites">Websites</Link><Link href="/admin/sales">Sales</Link></nav></header>
    <section className={styles.content}>
      <div className={styles.hero}><div><p className={styles.kicker}>Human-controlled outreach</p><h1>Review, then choose how to send.</h1><p>The same protected outreach workspace supports new Engine v4 concepts and preserved v3 concepts. Saving never sends. “Send Email Now” sends only after your explicit action.</p></div>{draft?.publicUrl?<a href={draft.publicUrl} target="_blank" rel="noreferrer">Open published concept ↗</a>:null}</div>
      <div className={styles.safety} data-status={draft?.status||"draft"}><strong>{draft?.status==="sent"?"Outreach complete:":"Human gate:"}</strong><span>{draft?.status==="sent"?"This outreach is already recorded as sent. The editor is now read-only.":`Outreach status is ${draft?.status||"draft"}. Nothing is sent unless you explicitly choose a send action below.`}</span></div>
      {notice?<p className={styles.notice}>{notice}</p>:null}
      {!draft&&!notice?<p>Loading outreach draft…</p>:null}
      {draft?<form className={styles.form} onSubmit={save}>
        <label><span>From</span><input readOnly value={draft.senderEmail||"LabNarrative <khaled@labnarrative.com>"}/></label>
        <label><span>Recipient email</span><input disabled={!editable||Boolean(action)} placeholder="Verified institutional email" type="email" value={recipientEmail} onChange={event=>setRecipientEmail(event.target.value)}/></label>
        {editable&&!recipientEmail.trim()?<p className={styles.warning}>Recipient is still missing. The draft can be saved, but it cannot be sent until a verified email is added.</p>:null}
        {editable?<div style={{display:"grid",gap:8,padding:"12px 14px",border:"1px solid rgba(92,132,151,.28)",borderRadius:12,background:"rgba(11,31,42,.72)"}}><span style={{fontSize:".72rem",fontWeight:850,letterSpacing:".06em",textTransform:"uppercase",opacity:.68}}>Choose outreach draft</span><div style={{display:"flex",gap:8,flexWrap:"wrap"}}>{templateButton("lab_exists","Lab exists")}{templateButton("lab_doesnt_exist","Lab doesn’t exist")}</div></div>:null}
        <label><span>Subject</span><input disabled={!editable||Boolean(action)} required value={subject} onChange={event=>setSubject(event.target.value)}/></label>
        <label><span>Email body</span><textarea disabled={!editable||Boolean(action)} required rows={24} value={bodyText} onChange={event=>setBodyText(event.target.value)}/></label>
        {editable?<label style={{display:"flex",alignItems:"center",gap:10,padding:"12px 14px",border:"1px solid rgba(92,132,151,.28)",borderRadius:12,background:"rgba(11,31,42,.72)",cursor:action?"default":"pointer"}}><input type="checkbox" checked={sendKsuCopy} disabled={Boolean(action)} onChange={event=>setSendKsuCopy(event.target.checked)} style={{width:17,height:17,margin:0,accentColor:"#2f7c68"}}/><span style={{fontSize:".82rem",fontWeight:750}}>Send me a private copy at {KSU_COPY_EMAIL}</span></label>:null}
        <div className={styles.actions}>{editable?<><button className={styles.saveButton} disabled={Boolean(action)} type="submit">{action==="save"?"Saving…":"Save Draft"}</button><button className={styles.sendButton} disabled={Boolean(action)||!recipientEmail.trim()} onClick={()=>void sendNow()} type="button">{action==="send"?"Sending…":"Send Email Now"}</button><button className={styles.privateButton} disabled={Boolean(action)||!recipientEmail.trim()} onClick={()=>void confirmPrivateSend()} type="button">{action==="private"?"Recording…":"Confirm Sent From Personal Email"}</button></>:null}<Link href="/admin/review">Back to Final Review</Link></div>
      </form>:null}
    </section>
  </main>;
}
