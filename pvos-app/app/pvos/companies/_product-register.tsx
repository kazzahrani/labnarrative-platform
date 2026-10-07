"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { Badge } from "../_components";
import { pvosSupabase } from "../_pvos-supabase";
import { readProductPages, registrationLabel, registrationSummary, registrationTone } from "../_registration";
import { RegistrationFields, type RegistrationDraft } from "./_registration-fields";
import styles from "../pvos.module.css";

type Product={id:string,company_id:string,brand_name:string,active_ingredient:string|null,registration_status:string|null,sfda_registration_number:string|null,registration_reference?:string|null,rmp_status:string|null,updated_at:string};
type Audit={id:string,created_at:string,actor_user_id:string|null,event_type:string,before_data:Record<string,any>|null,after_data:Record<string,any>|null,metadata:{actor_email?:string|null,reason?:string|null}};

function recordedTime(value:string){
  return new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Riyadh",dateStyle:"medium",timeStyle:"medium"}).format(new Date(value))+" · Riyadh";
}

export function ProductRegister({companyId,organizationId,products,onSaved}:{companyId:string,organizationId:string,products:Product[],onSaved:(product:Product)=>void}){
  const [selected,setSelected]=useState<Product|null>(null);
  const [draft,setDraft]=useState<RegistrationDraft>({status:"Not recorded",number:"",reference:""});
  const [reason,setReason]=useState("");
  const [history,setHistory]=useState<Audit[]>([]);
  const [historyLoading,setHistoryLoading]=useState(false);
  const [historyError,setHistoryError]=useState<string|null>(null);
  const [error,setError]=useState<string|null>(null);
  const [message,setMessage]=useState<string|null>(null);
  const [busy,setBusy]=useState(false);
  const [filter,setFilter]=useState("All");
  const closeRef=useRef<HTMLButtonElement>(null);
  const dialogRef=useRef<HTMLDivElement>(null);
  const summary=registrationSummary(products);
  const selectedId=selected?.id;

  useEffect(()=>{
    if(!selectedId)return;
    let active=true;
    setHistoryLoading(true);setHistoryError(null);setHistory([]);
    readProductPages<Audit>((from,to)=>pvosSupabase.from("pvos_audit_events").select("id,created_at,actor_user_id,event_type,before_data,after_data,metadata").eq("organization_id",organizationId).eq("entity_type","product_registration").eq("entity_id",selectedId).order("created_at",{ascending:false}).order("id").range(from,to))
      .then(rows=>{if(active)setHistory(rows);})
      .catch(e=>{if(active)setHistoryError(e.message);})
      .finally(()=>{if(active)setHistoryLoading(false);});
    return()=>{active=false;};
  },[selectedId,organizationId]);

  useEffect(()=>{
    if(!selectedId)return;
    const previous=document.activeElement as HTMLElement|null;
    closeRef.current?.focus();
    return()=>previous?.focus();
  },[selectedId]);

  function open(p:Product){
    setSelected(p);setDraft({status:registrationLabel(p.registration_status),number:p.sfda_registration_number||"",reference:p.registration_reference||""});setReason("");setError(null);setMessage(null);
  }
  function close(){if(!busy)setSelected(null);}
  const changed=!!selected&&(draft.status!==registrationLabel(selected.registration_status)||draft.number.trim()!==(selected.sfda_registration_number||"")||draft.reference.trim()!==(selected.registration_reference||""));

  async function save(e:FormEvent){
    e.preventDefault();if(!selected||busy||!changed)return;
    if(!reason.trim()){setError("Enter a reason for the registration change.");return;}
    setBusy(true);setError(null);
    try{
      const {data,error:saveError}=await pvosSupabase.from("pvos_products").update({registration_status:draft.status==="Not recorded"?null:draft.status,sfda_registration_number:draft.number.trim()||null,registration_reference:draft.reference.trim()||null,registration_change_reason:reason.trim()}).eq("id",selected.id).eq("company_id",companyId).eq("updated_at",selected.updated_at).select("*").maybeSingle();
      if(saveError)throw saveError;
      if(!data)throw new Error("This product changed while you were editing. Close this window and refresh before trying again.");
      onSaved(data);setSelected(null);setMessage("Registration details saved with change history.");
    }catch(e){setError(e instanceof Error?e.message:(e as {message?:string}).message||"Could not save registration details.");}
    finally{setBusy(false);}
  }

  const visible=products.filter(p=>filter==="All"||registrationLabel(p.registration_status)===filter);
  return <div className={styles.panel}>
    <div className={styles.panelHeader}><h2>Products</h2><Link className={styles.buttonGhost} href={"/pvos/companies/"+companyId+"/setup"}>+ Add product</Link></div>
    <div style={{padding:"0 16px 12px"}}>
      <div className={styles.inlineActions} style={{marginTop:0,flexWrap:"wrap"}}>{summary.map(s=><Badge key={s.label} tone={registrationTone(s.label)}>{s.count} {s.label}</Badge>)}</div>
      <p className={styles.muted}>Registration details are recorded by your workspace; they are not automatically verified against SFDA.</p>
      <label className={styles.muted}>Filter by registration status <select className={styles.input} style={{width:"auto",marginLeft:8}} value={filter} onChange={e=>setFilter(e.target.value)}><option>All</option>{summary.map(s=><option key={s.label}>{s.label}</option>)}</select></label>
      {message?<div className={styles.successBox} role="status" style={{marginTop:12}}>{message}</div>:null}
    </div>
    <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Product / ingredient</th><th>Registration</th><th>SFDA number</th><th>RMP</th><th></th></tr></thead><tbody>{visible.length?visible.map(p=><tr key={p.id}>
      <td>{p.brand_name}<div className={styles.muted}>{p.active_ingredient||"—"}</div></td>
      <td><Badge tone={registrationTone(p.registration_status)}>{registrationLabel(p.registration_status)}</Badge></td><td>{p.sfda_registration_number||"Not recorded"}</td><td>{p.rmp_status||"—"}</td>
      <td><button className={styles.buttonGhost} aria-label={"Edit registration and view history for "+p.brand_name} onClick={()=>open(p)}>Edit / history</button></td>
    </tr>):<tr><td colSpan={5}>{products.length?"No products match this status.":"No product records yet."}</td></tr>}</tbody></table></div>

    {selected?<div className={styles.modalBackdrop} onMouseDown={e=>{if(e.target===e.currentTarget)close();}}>
      <div ref={dialogRef} className={styles.modalCard} style={{width:"min(760px,100%)"}} role="dialog" aria-modal="true" aria-labelledby="registration-title" onKeyDown={e=>{
        if(e.key==="Escape"){e.preventDefault();close();}
        if(e.key==="Tab"){
          const nodes=dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input,select,textarea,a[href]');
          if(!nodes?.length)return;const first=nodes[0],last=nodes[nodes.length-1];
          if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
          else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
        }
      }}>
        <div className={styles.modalHeader}><h2 id="registration-title">{selected.brand_name} · Registration</h2><button ref={closeRef} className={styles.modalClose} onClick={close} disabled={busy} aria-label="Close">×</button></div>
        <form onSubmit={save}><div className={styles.form}><RegistrationFields value={draft} onChange={setDraft}/><label>Reason for change<textarea className={styles.input} value={reason} onChange={e=>setReason(e.target.value)} placeholder="What changed and which record supports it?" required={changed} maxLength={2000}/></label></div>
          {error?<div className={styles.errorBox} role="alert" style={{marginTop:12}}>{error}</div>:null}
          <div className={styles.modalActions}><button className={styles.buttonGhost} type="button" onClick={close} disabled={busy}>Close</button><button className={styles.button} disabled={busy||!changed}>{busy?"Saving…":"Save registration"}</button></div>
        </form>
        <h3>Registration history</h3>
        {historyLoading?<p className={styles.muted}>Loading history…</p>:historyError?<div className={styles.errorBox}>{historyError}</div>:history.length?history.map(h=><div className={styles.info} style={{marginBottom:10}} key={h.id}>
          <div>{h.event_type==="insert"?"Registration recorded":registrationLabel(h.before_data?.registration_status)+" → "+registrationLabel(h.after_data?.registration_status)}</div>
          <div className={styles.muted}>{h.metadata?.actor_email||h.actor_user_id||"System · actor not recorded"} · {recordedTime(h.created_at)}</div>
          <div>SFDA number: {h.before_data?.sfda_registration_number||"Not recorded"} → {h.after_data?.sfda_registration_number||"Not recorded"}</div>
          <div style={{overflowWrap:"anywhere"}}>Reference: {h.before_data?.registration_reference||"Not recorded"} → {h.after_data?.registration_reference||"Not recorded"}</div>
          <div>Reason: {h.metadata?.reason||"Initial product record"}</div>
        </div>):<p className={styles.muted}>No registration history has been recorded. Existing details predate registration change tracking.</p>}
      </div>
    </div>:null}
  </div>;
}
