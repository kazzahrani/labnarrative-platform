"use client";
import Link from "next/link";
import {useState} from "react";
import {Badge} from "../_components";
import {pvosSupabase} from "../_pvos-supabase";
import {checklistCounts,checklistLabels,checklistStatus,type ChecklistRow as Row} from "../_inspection-checklist";
import type {InspectionData} from "../_inspection";
import styles from "../pvos.module.css";

const reviewerRoles=["admin","qppv","deputy_qppv"];
function Status({item}:{item:Row}){const status=checklistStatus(item);return <Badge tone={status==="reviewed"?"green":status==="not_applicable"?"default":"amber"}>{checklistLabels[status]}</Badge>;}
function at(value:string){return new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Riyadh",dateStyle:"medium",timeStyle:"short"}).format(new Date(value));}

export default function InspectionChecklist({data,companyId,userId,onCompany,onRefresh}:{data:InspectionData,companyId:string,userId?:string,onCompany:(id:string)=>void,onRefresh:()=>Promise<void>}){
  const [busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),[notice,setNotice]=useState<string|null>(null);
  const [selected,setSelected]=useState<string|null>(null),[filter,setFilter]=useState("all");
  const items=(data.checklistItems||[]).filter(i=>companyId==="all"||i.company_id===companyId);
  const role=data.members.find(m=>m.user_id===userId)?.role||"",canReview=reviewerRoles.includes(role);
  const counts=checklistCounts(items);
  async function action(name:string,args:Row,message:string){
    if(busy)return;setBusy(true);setError(null);setNotice(null);
    try{const result=await pvosSupabase.rpc(name,args);if(result.error)throw result.error;await onRefresh();setNotice(message);}
    catch(e){setError((e as {message?:string}).message||"Could not save. Refresh and try again.");}
    finally{setBusy(false);}
  }
  if(companyId==="all")return <section className={styles.panel}>
    <div className={styles.panelHeader}><h2>Company inspection checklists</h2></div>
    <p style={{padding:"0 16px"}}>Choose a company to prepare evidence and record human conclusions across 15 inspection areas.</p>
    <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Company</th><th>Checklist</th><th>Reviewed / not applicable</th><th>Outstanding</th><th></th></tr></thead><tbody>{data.companies.map(c=>{
      const rows=(data.checklistItems||[]).filter(i=>i.company_id===c.id),n=checklistCounts(rows);
      return <tr key={c.id}><td>{c.name}</td><td>{rows.length?`${rows.length} checkpoints`:"Not started"}</td><td>{n.reviewed} / {n.not_applicable}</td><td>{rows.length?rows.length-n.reviewed-n.not_applicable:"Start checklist"}</td><td><button className={styles.buttonGhost} onClick={()=>onCompany(c.id)}>Open checklist →</button></td></tr>;
    })}</tbody></table></div>
    <p className={styles.muted} style={{padding:"0 16px"}}>Based on Dalal’s supplied overview template. The QPPV must confirm applicability against the company’s SOPs and applicable requirements.</p>
  </section>;
  return <>
    {error?<div className={styles.errorBox} role="alert">{error}</div>:null}
    {notice?<div className={styles.notice} role="status">{notice}</div>:null}
    {!items.length?<section className={styles.panel} style={{padding:20}}><h2>Start this company’s checklist</h2><p>46 checkpoints grouped into 15 areas. Every checkpoint starts with Missing evidence; no compliance conclusions are pre-filled.</p><button className={styles.button} disabled={!canReview||busy} onClick={()=>action("pvos_start_inspection_checklist",{p_company_id:companyId},"Company checklist started. Choose a checkpoint to prepare its evidence.")}>{busy?"Starting…":"Start company checklist"}</button>{!canReview?<p className={styles.muted}>An administrator, QPPV or Deputy QPPV must start the checklist.</p>:null}</section>:<>
      <div className={styles.inlineActions} style={{flexWrap:"wrap",marginBottom:14}}>{Object.entries(counts).map(([status,count])=><button key={status} className={filter===status?styles.button:styles.buttonGhost} aria-pressed={filter===status} disabled={busy} onClick={()=>setFilter(filter===status?"all":status)}>{checklistLabels[status]} · {count}</button>)}{filter!=="all"?<button className={styles.buttonGhost} onClick={()=>setFilter("all")}>Show all {items.length}</button>:null}</div>
      <p className={styles.muted}>Link evidence → QPPV review → recorded conclusion. “Reviewed” records a human assessment; it does not certify compliance. External references are versioned links; PVOS does not retrieve their document contents.</p>
      {Array.from(new Set(items.map(i=>i.area_order))).sort((a,b)=>a-b).map(order=>{
        const area=items.filter(i=>i.area_order===order).sort((a,b)=>a.requirement_key.localeCompare(b.requirement_key)),visible=area.filter(i=>filter==="all"||checklistStatus(i)===filter);
        if(!visible.length)return null;const n=checklistCounts(area);
        return <details className={styles.panel} key={order} style={{marginBottom:10}} open={selected?area.some(i=>i.id===selected):undefined}>
          <summary style={{padding:16,cursor:"pointer"}}><strong>{order}. {area[0].area_title}</strong><span className={styles.muted} style={{marginLeft:12}}>{n.reviewed+n.not_applicable} of {area.length} assessed</span></summary>
          {visible.map(i=><div key={i.id} style={{padding:"12px 16px",borderTop:"1px solid var(--line, #e5e7eb)"}}>
            <div className={styles.inlineActions} style={{justifyContent:"space-between",flexWrap:"wrap"}}><button className={styles.buttonGhost} aria-expanded={selected===i.id} disabled={busy} onClick={()=>setSelected(selected===i.id?null:i.id)} style={{textAlign:"left",flex:1}}>{i.title}</button><Status item={i}/></div>
            <div className={styles.muted}>Owner: {data.members.find(m=>m.user_id===i.owner_user_id)?.email||i.owner_user_id||"Unassigned"} · {(data.checklistLinks||[]).filter(l=>l.item_id===i.id).length} evidence links</div>
            {selected===i.id?<CheckpointEditor key={i.id+":"+i.revision} item={i} data={data} userId={userId} canReview={canReview} busy={busy} action={action}/>:null}
          </div>)}
        </details>;
      })}
    </>}
  </>;
}

function CheckpointEditor({item,data,userId,canReview,busy,action}:{item:Row,data:InspectionData,userId?:string,canReview:boolean,busy:boolean,action:(name:string,args:Row,message:string)=>Promise<void>}){
  const canPrepare=canReview||item.owner_user_id===userId;
  const [owner,setOwner]=useState(item.owner_user_id||""),[sop,setSop]=useState(item.sop_reference||""),[note,setNote]=useState(item.preparation_note||"");
  const [kind,setKind]=useState("document"),[reference,setReference]=useState(""),[title,setTitle]=useState(""),[url,setUrl]=useState(""),[version,setVersion]=useState("");
  const [decision,setDecision]=useState("reviewed"),[conclusion,setConclusion]=useState("");
  const links=(data.checklistLinks||[]).filter(l=>l.item_id===item.id),reviews=(data.checklistReviews||[]).filter(r=>r.item_id===item.id).sort((a,b)=>b.reviewed_at.localeCompare(a.reviewed_at)||b.item_revision-a.item_revision);
  const companyTasks=data.tasks.filter(t=>t.company_id===item.company_id),taskIds=new Set(companyTasks.map(t=>t.id));
  const options:Row[]=kind==="task"?companyTasks:kind==="document"?data.evidence.filter(e=>taskIds.has(e.task_id)&&!e.archived_at):kind==="literature"?data.literatureRecords.filter(r=>r.company_id===item.company_id).map(r=>({...r,title:`Screening ${r.run_id.slice(0,8).toUpperCase()} · ${r.period_start} → ${r.period_end}`})):kind==="handover"?data.handoverEvidence.filter(e=>e.snapshot?.companies?.some((c:Row)=>c.company_id===item.company_id)).map(e=>({...e,title:`Handover ${e.handover_id.slice(0,8).toUpperCase()} · ${at(e.created_at)}`})):[];
  const available=options.filter(o=>!links.some(l=>l.kind===kind&&l.reference_id===o.id));
  const changed=owner!==(item.owner_user_id||"")||sop!==(item.sop_reference||"")||note!==(item.preparation_note||"");
  const params={p_item_id:item.id,p_revision:item.revision};
  const selected=available.find(o=>o.id===reference);
  function destination(l:Row){
    if(l.kind==="external")return l.external_url;
    if(l.kind==="task")return `/pvos/tasks/${l.reference_id}#evidence`;
    if(l.kind==="document"){const e=data.evidence.find(e=>e.id===l.reference_id);return e?`/pvos/tasks/${e.task_id}#evidence`:null;}
    if(l.kind==="literature"){const r=data.literatureRecords.find(r=>r.id===l.reference_id);return r?`/pvos/literature?inspectionRun=${r.run_id}`:null;}
    if(l.kind==="handover"){const r=data.handoverEvidence.find(r=>r.id===l.reference_id);return r?`/pvos/handover/${r.handover_id}`:null;}
    return null;
  }
  return <div style={{paddingTop:14}}>
    {checklistStatus(item)==="needs_review"?<div className={styles.notice}>Linked evidence has changed since the recorded conclusion. Review the current references before recording a new conclusion; the previous snapshot is retained.</div>:null}
    <fieldset disabled={!canPrepare||busy} style={{border:0,padding:0,margin:0}}><legend><strong>Prepare evidence</strong></legend>
      <div className={styles.formGrid} style={{marginTop:12}}><label>Owner<select className={styles.input} value={owner} onChange={e=>setOwner(e.target.value)}><option value="">Unassigned</option>{data.members.map(m=><option key={m.user_id} value={m.user_id}>{m.email} · {m.role}</option>)}</select></label><label>SOP / requirement reference<input className={styles.input} value={sop} maxLength={2000} onChange={e=>setSop(e.target.value)} placeholder="SOP identifier and version / applicable requirement"/></label></div>
      <label>Preparation note<textarea className={styles.input} value={note} maxLength={10000} onChange={e=>setNote(e.target.value)} rows={2}/></label>
      <button className={styles.buttonGhost} disabled={!changed} onClick={()=>action("pvos_prepare_inspection_checkpoint",{...params,p_owner_id:owner||null,p_sop_reference:sop,p_note:note},"Preparation saved. A new human conclusion is required.")}>Save preparation</button>
    </fieldset>
    <h4>Linked evidence</h4>
    {links.length?<ul>{links.map(l=>{const href=destination(l);return <li key={l.id} style={{marginBottom:8}}>{href?<Link href={href} target={l.kind==="external"?"_blank":undefined} rel={l.kind==="external"?"noopener noreferrer":undefined}>{l.title} →</Link>:l.title}<span className={styles.muted}> · {l.kind}{l.version?` · ${l.version}`:""}</span>{canPrepare?<button className={styles.buttonGhost} style={{marginLeft:8}} disabled={busy||changed} onClick={()=>action("pvos_unlink_inspection_evidence",{...params,p_link_id:l.id},"Evidence link removed; earlier review snapshots remain available.")}>Remove link</button>:null}</li>;})}</ul>:<p className={styles.muted}>No evidence linked yet.</p>}
    {canPrepare?<fieldset disabled={busy||changed} style={{border:0,padding:0,margin:0}}><legend>Add evidence</legend>
      <div className={styles.formGrid} style={{marginTop:10}}><label>Evidence type<select className={styles.input} value={kind} onChange={e=>{setKind(e.target.value);setReference("");}}><option value="document">Task document / evidence</option><option value="task">Task and its active evidence</option><option value="literature">Completed literature record</option><option value="handover">Frozen handover evidence</option><option value="external">External document reference</option></select></label>
      {kind!=="external"?<label>Company evidence<select className={styles.input} value={reference} onChange={e=>setReference(e.target.value)}><option value="">{available.length?"Choose evidence":"No available records of this type"}</option>{available.map(o=><option value={o.id} key={o.id}>{o.title}{o.version?` · ${o.version}`:""} · {o.id.slice(0,8)}</option>)}</select></label>:<label>Document title<input className={styles.input} value={title} maxLength={1000} onChange={e=>setTitle(e.target.value)}/></label>}</div>
      {kind==="external"?<div className={styles.formGrid}><label>HTTPS reference<input className={styles.input} value={url} maxLength={4000} onChange={e=>setUrl(e.target.value)} placeholder="https://…"/></label><label>Document version / dated edition<input className={styles.input} value={version} maxLength={500} onChange={e=>setVersion(e.target.value)} placeholder="Version 2 / 2026-10-08"/></label></div>:null}
      <button className={styles.buttonGhost} disabled={kind==="external"?!(title.trim()&&url.trim()&&version.trim()):!selected} onClick={()=>action("pvos_link_inspection_evidence",{...params,p_kind:kind,p_reference_id:kind==="external"?null:reference,p_title:kind==="external"?title:selected?.title,p_url:kind==="external"?url.trim():null,p_version:kind==="external"?version:selected?.version||null},"Evidence linked. Awaiting human review where supporting evidence is available.")}>Link evidence</button>
    </fieldset>:null}
    {changed?<p className={styles.muted}>Save preparation before adding evidence or recording a review.</p>:null}
    <h4>QPPV conclusion</h4>
    {canReview?<fieldset disabled={busy||changed} style={{border:0,padding:0,margin:0}}><label>Review decision<select className={styles.input} value={decision} onChange={e=>setDecision(e.target.value)}><option value="reviewed">Reviewed</option><option value="missing_evidence">Missing evidence / return for preparation</option><option value="not_applicable">Not applicable</option></select></label><label>{decision==="not_applicable"?"Applicability justification":"Recorded conclusion / required follow-up"}<textarea className={styles.input} rows={3} value={conclusion} maxLength={10000} onChange={e=>setConclusion(e.target.value)} placeholder="Explain the assessment against the applicable requirement."/></label><button className={styles.button} disabled={!conclusion.trim()||(decision==="reviewed"&&!item.support_count)} onClick={()=>action("pvos_review_inspection_checkpoint",{...params,p_decision:decision,p_conclusion:conclusion},"Human conclusion recorded with reviewer identity, time and evidence snapshot.")}>Record conclusion</button>{!item.support_count&&decision==="reviewed"?<p className={styles.muted}>Reviewed requires supporting evidence. A task status or evidence note alone is insufficient.</p>:null}</fieldset>:<p className={styles.muted}>An administrator, QPPV or Deputy QPPV records the human conclusion.</p>}
    <details style={{marginTop:18}}><summary>Review history · {reviews.length}</summary>{reviews.map(r=><article key={r.id} style={{padding:"12px 0",borderBottom:"1px solid #e5e7eb"}}><strong>{checklistLabels[r.decision]}</strong><div className={styles.muted}>{r.reviewer_email} · {r.reviewer_role} · {at(r.reviewed_at)} · revision {r.item_revision}</div><p style={{whiteSpace:"pre-wrap"}}>{r.conclusion}</p><details><summary>Recorded evidence snapshot</summary><pre style={{maxHeight:300,overflow:"auto",whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{JSON.stringify(r.snapshot,null,2)}</pre></details></article>)}</details>
  </div>;
}
