"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Header, Badge } from "../../_components";
import { usePVOS } from "../../_provider";
import { pvosSupabase } from "../../_pvos-supabase";
import { formatDue, niceStatus } from "../../_utils";
import styles from "../../pvos.module.css";

export default function HandoverDetail(){
  const params=useParams<{id:string}>();
  const {session}=usePVOS();
  const [handover,setHandover]=useState<any|null>(null);
  const [rows,setRows]=useState<any[]>([]);
  const [companies,setCompanies]=useState<any[]>([]);
  const [busy,setBusy]=useState<string|null>(null);
  const [evidence,setEvidence]=useState<any|null>(null);
  const [message,setMessage]=useState<string|null>(null);
  const [loadError,setLoadError]=useState<string|null>(null);

  async function load(){
    if(!params.id)return;
    const [h,r,e]=await Promise.all([
      pvosSupabase.from("pvos_handovers").select("*").eq("id",params.id).single(),
      pvosSupabase.from("pvos_handover_companies").select("*").eq("handover_id",params.id),
      pvosSupabase.from("pvos_handover_evidence").select("id,created_at,snapshot_sha256,template_version").eq("handover_id",params.id).maybeSingle()
    ]);
    if(h.error||r.error||e.error){setLoadError((h.error||r.error||e.error)?.message??"Could not load handover");return;}
    setLoadError(null);setHandover(h.data);setRows(r.data??[]);setEvidence(e.data);
    const ids=(r.data??[]).map((x:any)=>x.company_id);
    if(ids.length){
      const {data:c}=await pvosSupabase.from("pvos_companies").select("id,name,contract_scope").in("id",ids);
      setCompanies(c??[]);
    }else setCompanies([]);
  }

  useEffect(()=>{load()},[params.id]);

  const companyBy=useMemo(()=>Object.fromEntries(companies.map(c=>[c.id,c])),[companies]);
  const allDeputyAcknowledged=rows.length>0&&rows.every(r=>r.deputy_acknowledged_at);
  const allHandbackAcknowledged=rows.length>0&&rows.every(r=>r.qppv_handback_acknowledged_at);
  const verified=handover?.workflow_version===2;
  const isDeputy=verified&&session?.user.id===handover?.deputy_user_id;
  const isQPPV=verified&&session?.user.id===handover?.qppv_user_id;

  async function downloadPDF(){
    const {data}=await pvosSupabase.auth.getSession();
    if(!data.session)throw new Error("Sign in again to download evidence.");
    const response=await fetch(`/api/pvos/handover/${params.id}/pdf`,{headers:{Authorization:"Bearer "+data.session.access_token},cache:"no-store"});
    if(!response.ok){const body=await response.json().catch(()=>({}));throw new Error(body.error||"Could not generate the PDF; retry Download PDF.");}
    const url=URL.createObjectURL(await response.blob());
    const a=document.createElement("a");a.href=url;a.download=`PVOS-handover-${params.id}.pdf`;document.body.appendChild(a);a.click();a.remove();
    window.setTimeout(()=>URL.revokeObjectURL(url),30000);
  }

  async function retryPDF(){
    setBusy("pdf");setMessage(null);
    try{await downloadPDF();setMessage("PDF generated from the frozen acknowledgement evidence.");}
    catch(error){setMessage(error instanceof Error?error.message:"PDF generation failed. Retry the download.");}
    finally{setBusy(null);}
  }

  async function acknowledgeCompany(row:any){
    setBusy("ack-"+row.id);setMessage(null);
    try{
      const {data,error}=await pvosSupabase.rpc("pvos_acknowledge_handover_company",{p_handover_id:handover.id,p_company_record_id:row.id});
      if(error)throw new Error(error.message);
      await load();
      if(data?.accepted){
        setMessage("All companies acknowledged. Generating the PDF…");
        try{await downloadPDF();setMessage("All companies acknowledged. PDF generated; download it again below at any time.");}
        catch(error){setMessage("Acknowledgements saved and evidence frozen. "+(error instanceof Error?error.message:"Retry Download PDF."));}
      }else setMessage("Company acknowledged. The PDF becomes available after every company is acknowledged.");
    }catch(error){setMessage(error instanceof Error?error.message:"Acknowledgement failed.");}
    finally{setBusy(null);}
  }

  async function acknowledgeHandback(row:any){
    setBusy("back-"+row.id);setMessage(null);
    const {error}=await pvosSupabase.rpc("pvos_acknowledge_handover_company",{p_handover_id:handover.id,p_company_record_id:row.id,p_handback:true});
    if(error)setMessage(error.message);
    setBusy(null);await load();
  }

  async function advance(){
    if(!handover)return;setBusy("global");
    setMessage(null);
    const {error}=await pvosSupabase.rpc("pvos_advance_handover",{p_handover_id:handover.id});
    if(error)setMessage(error.message);
    setBusy(null);await load();
  }

  if(loadError&&!handover)return <div className={styles.empty} role="alert">{loadError}<br/><button className={styles.buttonGhost} onClick={load}>Retry</button></div>;
  if(!handover)return <div className={styles.empty}>Loading handover…</div>;

  const actionLabel=
    handover.status==="accepted"?"Start leave":
    handover.status==="active"?"Begin handback":
    handover.status==="handback_pending"?"Close handback":
    null;

  const actionEnabled=
    handover.status==="accepted"?allDeputyAcknowledged:
    handover.status==="active"?true:
    handover.status==="handback_pending"?allHandbackAcknowledged:
    false;

  return <>
    <Header eyebrow="QPPV continuity record" title={"Handover · "+handover.leave_start+" → "+handover.leave_end} sub="Frozen company-by-company workload snapshot with separate acknowledgements for each client." action={<div className={styles.inlineActions} style={{marginTop:0}}><Link className={styles.buttonGhost} href="/pvos/handover">← Handovers</Link><Badge tone={handover.status==="closed"?"green":handover.status==="handback_pending"?"amber":"lime"}>{niceStatus(handover.status)}</Badge></div>}/>
    {!verified?<div className={styles.notice}>Legacy prototype record — preserved read-only. Deputy identity was not verified, so no verified acknowledgement PDF can be issued. Create a new handover with a different assigned Deputy account.</div>:null}
    {message||loadError?<div className={styles.notice} role="status" style={{marginBottom:14}}>{message||loadError}</div>:null}

    <div className={styles.grid2}>
      <section className={styles.info}>
        <h3>Continuity record</h3>
        {verified?<><div className={styles.kv}><span>Originating QPPV</span><span>{handover.participants?.qppv?.email}</span></div><div className={styles.kv}><span>Assigned Deputy</span><span>{handover.participants?.deputy?.email}</span></div></>:null}
        <div className={styles.kv}><span>Leave starts</span><span>{handover.leave_start}</span></div>
        <div className={styles.kv}><span>Leave ends</span><span>{handover.leave_end}</span></div>
        <div className={styles.kv}><span>Sent</span><span>{new Date(handover.created_at).toLocaleString()}</span></div>
        <div className={styles.kv}><span>Company acknowledgements</span><span>{rows.filter(r=>r.deputy_acknowledged_at).length}/{rows.length}</span></div>
        <div className={styles.kv}><span>Handbacks acknowledged</span><span>{rows.filter(r=>r.qppv_handback_acknowledged_at).length}/{rows.length}</span></div>
        <div className={styles.kv}><span>Handback closed</span><span>{handover.handback_at?new Date(handover.handback_at).toLocaleString():"Not yet"}</span></div>
        {handover.status==="sent"?<div className={styles.notice} style={{marginTop:12}}>Each company must be acknowledged separately by the Deputy. The leave becomes ready to start only after all company handovers are acknowledged.</div>:null}
        {handover.status==="handback_pending"&&!allHandbackAcknowledged?<div className={styles.notice} style={{marginTop:12}}>Acknowledge the handback for every company before closing the leave event.</div>:null}
        {actionLabel&&isQPPV?<div className={styles.inlineActions}><button className={styles.button} disabled={!!busy||!actionEnabled} onClick={advance}>{busy==="global"?"Saving…":actionLabel}</button></div>:null}
      </section>

      <aside className={styles.info}>
        <h3>Inspection evidence</h3>
        <p className={styles.sub}>This record preserves what was open when the QPPV generated the handover, even if the live task list changes later.</p>
        <div className={styles.kv}><span>Companies</span><span>{rows.length}</span></div>
        <div className={styles.kv}><span>Deputy acknowledged</span><span>{rows.filter(r=>r.deputy_acknowledged_at).length}</span></div>
        <div className={styles.kv}><span>Status</span><span>{niceStatus(handover.status)}</span></div>
        {evidence?<><div className={styles.kv}><span>Evidence frozen</span><span>{new Date(evidence.created_at).toLocaleString()}</span></div><div className={styles.inlineActions}><button className={styles.button} disabled={!!busy} onClick={retryPDF}>{busy==="pdf"?"Generating PDF…":"Download acknowledged handover PDF"}</button></div><p className={styles.muted}>Both account identities, company acknowledgement times, original tasks and snapshot hash. Later handback remains a separate audit record.</p></>:verified?<p className={styles.muted}>PDF pending — the assigned Deputy must acknowledge all {rows.length} companies.</p>:null}
      </aside>
    </div>

    {rows.map(row=>{
      const snap=row.snapshot??{};
      const taskRows=Array.isArray(snap.tasks)?snap.tasks:[];
      const company=companyBy[row.company_id];
      return <section className={styles.panel} key={row.id}>
        <div className={styles.panelHeader}>
          <div><h2>{snap.company_name??company?.name??"Company"}</h2><span className={styles.muted}>{snap.contract_scope??company?.contract_scope??""}</span></div>
          <div className={styles.inlineActions} style={{marginTop:0}}>
            <Badge tone={snap.risk==="High"?"red":snap.risk==="Medium"?"amber":"default"}>{snap.risk??"—"} risk</Badge>
            {row.deputy_acknowledged_at?<Badge tone="green">Deputy acknowledged</Badge>:handover.status==="sent"&&isDeputy?<button className={styles.buttonGhost} disabled={!!busy} onClick={()=>acknowledgeCompany(row)}>{busy==="ack-"+row.id?"Saving…":"Deputy acknowledge"}</button>:<Badge>Not acknowledged</Badge>}
            {handover.status==="handback_pending"?(row.qppv_handback_acknowledged_at?<Badge tone="green">Handback acknowledged</Badge>:isQPPV?<button className={styles.buttonGhost} disabled={!!busy} onClick={()=>acknowledgeHandback(row)}>{busy==="back-"+row.id?"Saving…":"Acknowledge handback"}</button>:null):null}
          </div>
        </div>

        <div style={{padding:"0 14px 12px"}} className={styles.muted}>
          Deputy acknowledgement: {row.deputy_acknowledged_at?new Date(row.deputy_acknowledged_at).toLocaleString():"Pending"}
          {row.deputy_acknowledged_by?" · "+handover.participants?.deputy?.email:row.deputy_acknowledged_at?" · Legacy: identity not verified":""}
          {row.qppv_handback_acknowledged_at?" · QPPV handback: "+new Date(row.qppv_handback_acknowledged_at).toLocaleString():""}
        </div>

        <div className={styles.tableWrap}><table className={styles.table}>
          <thead><tr><th>Open task</th><th>Type</th><th>Priority</th><th>Due at snapshot</th><th>Status at snapshot</th></tr></thead>
          <tbody>{taskRows.length?taskRows.map((t:any)=><tr key={t.id}><td><Link href={"/pvos/tasks/"+t.id}>{t.title}</Link></td><td>{t.activity_type}</td><td>{niceStatus(t.priority)}</td><td>{formatDue(t.due_at)}</td><td>{niceStatus(t.status)}</td></tr>):<tr><td colSpan={5}>{snap.open_tasks??0} open item(s) were recorded in the older summary snapshot.</td></tr>}</tbody>
        </table></div>
      </section>;
    })}
  </>;
}
