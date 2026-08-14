"use client";

import { createClient, type Session } from "@supabase/supabase-js";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./systems-outreach.module.css";

type ProspectStatus = "discovered"|"researching"|"qualified"|"concept_ready"|"ready_to_send"|"contacted"|"connected"|"replied"|"meeting"|"proposal"|"won"|"not_fit"|"blocked";
type Prospect = {
  id:string; company_name:string; slug:string; website_url:string|null; linkedin_url:string|null; country:string|null; city:string|null; industry:string|null; company_summary:string|null; fit_score:number; fit_reason:string|null; public_evidence:unknown; status:ProspectStatus; demo_status:"none"|"draft"|"ready"; linkedin_note:string|null; email_subject:string|null; email_body:string|null; followup_1:string|null; followup_2:string|null; last_researched_at:string|null; created_at:string;
};
type Contact = {id:string; prospect_id:string; name:string; title:string; linkedin_url:string|null; email:string|null; source_url:string|null; priority:number; is_current_verified:boolean; evidence:unknown};

type Filter = "all"|"ready_to_send"|"qualified"|"contacted"|"replied"|"won";
const supabaseUrl=process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const supabase=createClient(supabaseUrl,supabaseKey);

const filters:Array<{id:Filter;label:string}>=[
  {id:"all",label:"All"},{id:"ready_to_send",label:"Ready to send"},{id:"qualified",label:"Qualified"},{id:"contacted",label:"Contacted"},{id:"replied",label:"Replied"},{id:"won",label:"Won"}
];
const stageButtons:Array<{value:ProspectStatus;label:string}>=[
  {value:"ready_to_send",label:"Ready to send"},{value:"contacted",label:"Mark contacted"},{value:"connected",label:"Connected"},{value:"replied",label:"Replied"},{value:"meeting",label:"Meeting"},{value:"proposal",label:"Proposal"},{value:"won",label:"Won"},{value:"not_fit",label:"Not fit"}
];

function evidenceUrls(value:unknown):string[]{
  if(!Array.isArray(value)) return [];
  return value.flatMap((item)=>{
    if(typeof item==="string" && item.startsWith("http")) return [item];
    if(item && typeof item==="object" && "url" in item && typeof (item as {url?:unknown}).url==="string") return [(item as {url:string}).url];
    return [];
  }).slice(0,8);
}
function dateLabel(value:string|null){if(!value)return "—";const d=new Date(value);return Number.isNaN(d.getTime())?"—":new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Riyadh",day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(d)}

export default function SystemsOutreachPage(){
  const [session,setSession]=useState<Session|null>(null),[authReady,setAuthReady]=useState(false),[role,setRole]=useState<string|null>(null),[prospects,setProspects]=useState<Prospect[]>([]),[contacts,setContacts]=useState<Contact[]>([]),[loading,setLoading]=useState(false),[notice,setNotice]=useState(""),[filter,setFilter]=useState<Filter>("ready_to_send"),[search,setSearch]=useState(""),[selectedId,setSelectedId]=useState<string|null>(null),[updating,setUpdating]=useState(false);

  const load=useCallback(async(activeSession:Session)=>{
    setLoading(true);setNotice("");
    const {data:roleRow,error:roleError}=await supabase.from("user_roles").select("role").eq("user_id",activeSession.user.id).maybeSingle();
    if(roleError||roleRow?.role!=="admin"){setRole(roleRow?.role??null);setNotice(roleError?.message??"Administrator access required.");setLoading(false);return}
    setRole("admin");
    const [p,c]=await Promise.all([
      supabase.from("systems_outreach_prospects").select("id,company_name,slug,website_url,linkedin_url,country,city,industry,company_summary,fit_score,fit_reason,public_evidence,status,demo_status,linkedin_note,email_subject,email_body,followup_1,followup_2,last_researched_at,created_at").order("fit_score",{ascending:false}).order("created_at",{ascending:false}),
      supabase.from("systems_outreach_contacts").select("id,prospect_id,name,title,linkedin_url,email,source_url,priority,is_current_verified,evidence").order("priority",{ascending:true})
    ]);
    if(p.error||c.error){setNotice(p.error?.message??c.error?.message??"Unable to load Systems outreach.");setLoading(false);return}
    const nextProspects=(p.data??[]) as Prospect[];setProspects(nextProspects);setContacts((c.data??[]) as Contact[]);setSelectedId((current)=>current&&nextProspects.some((x)=>x.id===current)?current:(nextProspects.find((x)=>x.status==="ready_to_send")?.id??nextProspects[0]?.id??null));setLoading(false);
  },[]);

  useEffect(()=>{supabase.auth.getSession().then(({data})=>{setSession(data.session);setAuthReady(true);if(data.session)void load(data.session)});const {data:{subscription}}=supabase.auth.onAuthStateChange((_e,next)=>{setSession(next);setAuthReady(true);if(next)void load(next);else{setRole(null);setProspects([]);setContacts([])}});return()=>subscription.unsubscribe()},[load]);

  const metrics=useMemo(()=>({
    total:prospects.length,
    ready:prospects.filter((p)=>p.status==="ready_to_send").length,
    qualified:prospects.filter((p)=>["qualified","concept_ready","ready_to_send"].includes(p.status)).length,
    contacted:prospects.filter((p)=>["contacted","connected","replied","meeting","proposal","won"].includes(p.status)).length,
    replies:prospects.filter((p)=>["replied","meeting","proposal","won"].includes(p.status)).length,
  }),[prospects]);
  const visible=useMemo(()=>prospects.filter((p)=>{
    if(filter!=="all"&&p.status!==filter&&!(filter==="qualified"&&["qualified","concept_ready"].includes(p.status)))return false;
    const q=search.trim().toLowerCase();if(!q)return true;return [p.company_name,p.industry,p.city,p.country,p.fit_reason,p.status].join(" ").toLowerCase().includes(q)
  }),[prospects,filter,search]);
  const selected=prospects.find((p)=>p.id===selectedId)??null;
  const selectedContacts=selected?contacts.filter((c)=>c.prospect_id===selected.id):[];

  const updateStage=async(status:ProspectStatus)=>{
    if(!selected||updating)return;setUpdating(true);setNotice("");
    const patch:Record<string,unknown>={status,updated_at:new Date().toISOString()};
    if(status==="contacted")patch.contacted_at=new Date().toISOString();
    if(status==="replied")patch.replied_at=new Date().toISOString();
    const {error}=await supabase.from("systems_outreach_prospects").update(patch).eq("id",selected.id);
    if(error)setNotice(error.message);else if(session){await supabase.from("systems_outreach_events").insert({prospect_id:selected.id,channel:"internal",event_type:`stage_${status}`,status:"recorded",content:`Human gate moved prospect to ${status}.`});setNotice(`${selected.company_name} → ${status.replaceAll("_"," ")}.`);await load(session)}
    setUpdating(false);
  };
  const copy=async(text:string|null,label:string)=>{if(!text)return;await navigator.clipboard?.writeText(text);setNotice(`${label} copied.`)};

  if(!authReady)return <main className={styles.page}><section className={styles.auth}>Preparing Systems outreach…</section></main>;
  if(!session)return <main className={styles.page}><section className={styles.auth}><div className={styles.brand}><span>Lab</span>Narrative</div><p className={styles.eyebrow}>Systems outreach</p><h1>Administrator sign-in required.</h1><p>Use the existing LabNarrative administrator login, then return to this command center.</p><Link href="/admin">Go to admin sign-in →</Link></section></main>;
  if(role!=="admin")return <main className={styles.page}><section className={styles.auth}><h1>Administrator permission required.</h1><p>{notice}</p></section></main>;

  return <main className={styles.page}><div className={styles.shell}>
    <header className={styles.top}><div><div className={styles.brand}><span>Lab</span>Narrative</div><p className={styles.eyebrow}>Systems · acquisition</p><h1>Outreach command center</h1><p>Automated company research, decision-maker discovery, tailored concept generation and outreach drafting — with a human send gate.</p></div><div className={styles.actions}><Link className={styles.linkButton} href="/systems">Systems site ↗</Link><button className={`${styles.button} ${styles.primary}`} onClick={()=>session&&void load(session)} disabled={loading}>{loading?"Refreshing…":"Refresh queue"}</button></div></header>
    {notice?<div className={styles.notice}>{notice}</div>:null}
    <section className={styles.metrics}><article className={styles.metric}><span>Total researched</span><strong>{metrics.total}</strong><small>Durable prospect records</small></article><article className={styles.metric}><span>Ready to send</span><strong>{metrics.ready}</strong><small>Human gate</small></article><article className={styles.metric}><span>Qualified</span><strong>{metrics.qualified}</strong><small>Strong-fit prospects</small></article><article className={styles.metric}><span>Contacted</span><strong>{metrics.contacted}</strong><small>Across channels</small></article><article className={styles.metric}><span>Replies+</span><strong>{metrics.replies}</strong><small>Reply → won</small></article></section>
    <section className={styles.grid}>
      <article className={styles.panel}><div className={styles.panelHead}><div><h2>Prospect queue</h2><p>Research and drafts are prepared automatically; sending stays manual.</p></div><div className={styles.filters}>{filters.map((f)=><button key={f.id} onClick={()=>setFilter(f.id)} className={`${styles.filter} ${filter===f.id?styles.filterActive:""}`}>{f.label}</button>)}</div></div><input className={styles.search} placeholder="Search company, industry, city or status…" value={search} onChange={(e)=>setSearch(e.target.value)}/>{visible.length?<table className={styles.table}><thead><tr><th>Company</th><th>Fit</th><th>Status</th><th>Demo</th><th>Researched</th></tr></thead><tbody>{visible.map((p)=><tr key={p.id} onClick={()=>setSelectedId(p.id)} className={p.id===selectedId?styles.selectedRow:""}><td><span className={styles.company}>{p.company_name}</span><span className={styles.sub}>{[p.city,p.country,p.industry].filter(Boolean).join(" · ")}</span></td><td><span className={`${styles.score} ${p.fit_score>=80?styles.scoreHigh:""}`}>{p.fit_score}</span></td><td><span className={styles.status}>{p.status.replaceAll("_"," ")}</span></td><td>{p.demo_status==="ready"?<span><i className={styles.readyDot}></i>Ready</span>:<span className={styles.muted}>{p.demo_status}</span>}</td><td>{dateLabel(p.last_researched_at)}</td></tr>)}</tbody></table>:<div className={styles.empty}>{loading?"Loading…":"No prospects in this view yet."}</div>}</article>

      <aside className={styles.panel}>{selected?<div className={styles.detail}><h2>{selected.company_name}</h2><p className={styles.detailLead}>{[selected.industry,selected.city,selected.country].filter(Boolean).join(" · ")} · Fit {selected.fit_score}/100</p>{selected.company_summary?<div className={styles.summary}>{selected.company_summary}</div>:null}<div className={styles.section}><h3>Why it fits</h3><div className={styles.summary}>{selected.fit_reason||"Qualification rationale pending."}</div></div>
      <div className={styles.section}><h3>Decision-makers</h3>{selectedContacts.length?selectedContacts.map((c)=><div className={styles.contact} key={c.id}><strong>{c.name}</strong><p>{c.title}{c.is_current_verified?" · current role verified":""}</p><div>{c.linkedin_url?<a href={c.linkedin_url} target="_blank" rel="noreferrer">LinkedIn ↗</a>:null}{c.email?<span className={styles.muted}> · {c.email}</span>:null}</div></div>):<p className={styles.muted}>Contact research pending.</p>}</div>
      <div className={styles.section}><h3>Private concept</h3>{selected.demo_status==="ready"?<a className={`${styles.linkButton} ${styles.primary}`} href={`/systems/demos/${selected.slug}`} target="_blank" rel="noreferrer">Open tailored concept ↗</a>:<p className={styles.muted}>Demo not frozen yet.</p>}</div>
      <div className={styles.section}><h3>LinkedIn connection note</h3><div className={styles.draft}><label>≤ 300 characters</label><pre>{selected.linkedin_note||"Draft pending."}</pre>{selected.linkedin_note?<div className={styles.draftActions}><button className={styles.smallButton} onClick={()=>void copy(selected.linkedin_note,"LinkedIn note")}>Copy note</button></div>:null}</div></div>
      <div className={styles.section}><h3>Email outreach</h3><div className={styles.draft}><label>{selected.email_subject||"Subject pending"}</label><pre>{selected.email_body||"Email draft pending."}</pre>{selected.email_body?<div className={styles.draftActions}><button className={styles.smallButton} onClick={()=>void copy(`${selected.email_subject??""}\n\n${selected.email_body}`,"Email draft")}>Copy email</button></div>:null}</div>{selected.followup_1?<div className={styles.draft}><label>Follow-up 1</label><pre>{selected.followup_1}</pre></div>:null}{selected.followup_2?<div className={styles.draft}><label>Follow-up 2</label><pre>{selected.followup_2}</pre></div>:null}</div>
      <div className={styles.section}><h3>Evidence</h3><div className={styles.evidence}>{evidenceUrls(selected.public_evidence).length?evidenceUrls(selected.public_evidence).map((url)=><a key={url} href={url} target="_blank" rel="noreferrer">{url} ↗</a>):<span className={styles.muted}>Evidence links pending.</span>}</div></div>
      <div className={styles.section}><h3>Human gate</h3><div className={styles.statusButtons}>{stageButtons.map((s)=><button key={s.value} disabled={updating||selected.status===s.value} className={styles.smallButton} onClick={()=>void updateStage(s.value)}>{s.label}</button>)}</div></div>
      </div>:<div className={styles.empty}>Select a prospect to inspect the research, contacts, demo and outreach drafts.</div>}</aside>
    </section>
  </div></main>;
}
