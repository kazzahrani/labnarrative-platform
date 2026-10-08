"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge, Header, Tabs, Help } from "../_components";
import { usePVOS } from "../_provider";
import { pvosSupabase } from "../_pvos-supabase";
import AuthorityMonitoring from "./_authority-monitoring";
import { readApprovalRows } from "../_approval";
import styles from "../pvos.module.css";

type Assessment="unassessed"|"potential_signal"|"no_signal_concern"|"needs_more_info";

function dateLabel(v?:string|null){
  if(!v)return "—";
  const d=new Date(v.length===10?v+"T00:00:00":v);
  return Number.isNaN(d.getTime())?"—":d.toLocaleDateString(undefined,{day:"2-digit",month:"short",year:"numeric"});
}
function assessmentLabel(v:string){
  if(v==="potential_signal")return "Potential signal";
  if(v==="no_signal_concern")return "No signal concern";
  if(v==="needs_more_info")return "Needs more info";
  return "Unassessed";
}
function assessmentTone(v:string):"default"|"red"|"amber"|"green"|"lime"{
  if(v==="potential_signal")return "red";
  if(v==="needs_more_info")return "amber";
  if(v==="no_signal_concern")return "green";
  return "default";
}

export default function SignalReviewPage(){
  const {organizationId,session}=usePVOS();
  const [companyScope,setCompanyScope]=useState("all"),[companies,setCompanies]=useState<any[]>([]);
  const [view,setView]=useState<"review"|"authority">("review");
  useEffect(()=>{const params=new URLSearchParams(window.location.search);setCompanyScope(params.get("company")||"all");if(params.get("view")==="authority"||params.has("authorityPeriod"))setView("authority");},[]);
  function changeView(next:"review"|"authority"){
    setView(next);const url=new URL(window.location.href);url.searchParams.set("view",next);if(next==="review")url.searchParams.delete("authorityPeriod");window.history.replaceState(window.history.state,"",url);
  }
  const [followups,setFollowups]=useState<any[]>([]);
  const [items,setItems]=useState<any[]>([]);
  const [products,setProducts]=useState<any[]>([]);
  const [reviews,setReviews]=useState<any[]>([]);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [selected,setSelected]=useState<any|null>(null);
  const [notes,setNotes]=useState("");
  const [message,setMessage]=useState("");

  async function load(){
    if(!organizationId)return;
    setLoading(true);
    try{
      const rows=(table:string)=>readApprovalRows<any>((from,to)=>pvosSupabase.from(table).select("*").eq("organization_id",organizationId).order("id").range(from,to));
      const [f,i,p,r,c]=await Promise.all([
        readApprovalRows<any>((from,to)=>pvosSupabase.from("pvos_literature_followups").select("*").eq("organization_id",organizationId).eq("destination","signal_review").order("id").range(from,to)),
        rows("pvos_literature_items"),
        readApprovalRows<any>((from,to)=>pvosSupabase.from("pvos_products").select("*,pvos_companies!inner(organization_id)").eq("pvos_companies.organization_id",organizationId).order("id").range(from,to)),rows("pvos_signal_reviews"),rows("pvos_companies")
      ]);
      setFollowups(f);setItems(i);setProducts(p);setReviews(r);setCompanies(c);
    }catch(e){setMessage("Signal records could not be fully loaded: "+((e as {message?:string}).message||"Refresh and retry."));}
    finally{setLoading(false);}
  }

  useEffect(()=>{load()},[organizationId]);

  const itemMap=useMemo(()=>Object.fromEntries(items.map(x=>[x.id,x])),[items]);
  const productMap=useMemo(()=>Object.fromEntries(products.map(x=>[x.id,x])),[products]);
  const reviewMap=useMemo(()=>Object.fromEntries(reviews.map(x=>[x.literature_item_id,x])),[reviews]);

  const rows=followups.map(f=>{
    const item=itemMap[f.literature_item_id];
    const product=productMap[f.product_id||item?.product_id];
    const review=reviewMap[f.literature_item_id];
    return {followup:f,item,product,review,origin:"literature"};
  }).filter(x=>x.item).concat(reviews.filter(r=>r.authority_finding_id).map(r=>{
    const f=r.metadata?.finding_snapshot||{},ps=r.metadata?.product_snapshot||[];
    return {followup:{id:r.id,company_id:r.company_id,product_id:r.product_id},item:{id:r.authority_finding_id,title:r.metadata?.title||f.title,article_url:r.metadata?.url||f.url,abstract:f.rationale,journal:r.metadata?.authority_name||"Health authority",publication_date:f.notice_snapshot?.published_at,metadata:{},relevance:"human_confirmed"},product:ps.length?{brand_name:ps.map((p:any)=>p.brand_name).join(", "),active_ingredient:ps.map((p:any)=>p.active_ingredient).filter(Boolean).join(", ")}:productMap[r.product_id],review:r,origin:"authority"};
  })).filter(x=>companyScope==="all"||(x.followup.company_id||x.item.company_id)===companyScope);

  const newCount=rows.filter(x=>!x.review||x.review.status==="new").length;
  const inReview=rows.filter(x=>x.review?.status==="under_review").length;
  const potential=rows.filter(x=>x.review?.assessment==="potential_signal").length;
  const closed=rows.filter(x=>x.review?.status==="closed").length;

  async function saveReview(row:any,assessment:Assessment,status:"new"|"under_review"|"closed"){
    if(!organizationId||!session)return;
    setBusy(true);setMessage("");
    if(row.origin==="authority"){
      const {error}=await pvosSupabase.rpc("pvos_assess_authority_signal",{p_review_id:row.review.id,p_assessment:assessment,p_status:status==="new"?"under_review":status,p_notes:notes});
      setBusy(false);if(error){setMessage(error.message);return;}
      setMessage("Authority signal assessment updated.");await load();setSelected(null);setNotes("");return;
    }
    const now=new Date().toISOString();
    const {error}=await pvosSupabase.from("pvos_signal_reviews").upsert({
      organization_id:organizationId,
      company_id:row.followup.company_id||row.item.company_id,
      product_id:row.followup.product_id||row.item.product_id,
      literature_item_id:row.item.id,
      followup_id:row.followup.id,
      status,
      assessment,
      reviewer_user_id:session.user.id,
      notes:notes||row.review?.notes||null,
      reviewed_at:status==="closed"?now:null,
      metadata:{
        source:"literature",
        article_title:row.item.title,
        article_url:row.item.article_url,
        pmid:row.item.metadata?.pmid||null
      }
    },{onConflict:"literature_item_id"});
    setBusy(false);
    if(error){setMessage(error.message);return;}
    if(status==="closed"){
      await pvosSupabase.from("pvos_literature_followups").update({status:"included"}).eq("id",row.followup.id);
    }
    setMessage(status==="closed"?"Signal assessment saved and closed.":"Signal assessment updated.");
    await load();
    setSelected(null);
    setNotes("");
  }

  function openRow(row:any){
    setSelected(row);
    setNotes(row.review?.notes||"");
    setMessage("");
  }

  return <>
    <Header
      eyebrow="Safety intelligence"
      title={view==="authority"?"Authority monitoring":"Signal Review"}
      sub={view==="authority"?"Prepare monthly company monitoring, send it to a named QPPV reviewer and retain the evidence.":"Review findings escalated from literature and health authorities. The QPPV makes the signal assessment."}
    />

    <Tabs label="Signals areas" value={view} onChange={v=>changeView(v as typeof view)} items={[{id:"review",label:"Signal Review"},{id:"authority",label:"Authority monitoring"}]}/>
    {view==="review"?<div className={styles.filterBar}><select aria-label="Signal company" className={styles.input} value={companyScope} onChange={e=>{setCompanyScope(e.target.value);const u=new URL(window.location.href);if(e.target.value==="all")u.searchParams.delete("company");else u.searchParams.set("company",e.target.value);window.history.replaceState({},"",u)}}><option value="all">All companies</option>{companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div>:null}
    {view==="authority"?<AuthorityMonitoring/>:<>
    <div className={styles.compactSummary}><span>{newCount} New</span><span>{inReview} Under review</span><span>{potential} Potential signals</span><span>{closed} Closed</span></div>

    {message?<div className={message.includes("saved")||message.includes("updated")?styles.successBox:styles.errorBox} style={{marginBottom:14}}>{message}</div>:null}

    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <h2>Escalated findings for signal assessment</h2>
          <div className={styles.muted} style={{marginTop:4}}>Only findings explicitly escalated by the reviewer appear here.</div>
        </div>
      </div>

      {loading?<div className={styles.empty}>Loading signal review…</div>:rows.length?<div className={styles.tableWrap}><table className={styles.table}>
        <thead><tr><th>Finding</th><th>Product</th><th>Source</th><th>Safety priority</th><th>Status</th><th>Assessment</th><th></th></tr></thead>
        <tbody>{rows.map(row=>{
          const x=row.item;
          const review=row.review;
          return <tr key={row.followup.id}>
            <td style={{minWidth:350}}>
              {x.article_url?<a href={x.article_url} target="_blank" rel="noreferrer">{x.title}</a>:<strong>{x.title}</strong>}
              {x.metadata?.urgent_saudi?<div style={{marginTop:7}}><Badge tone="red">Saudi context</Badge></div>:null}
              {x.abstract?<div className={styles.muted} style={{marginTop:6,maxWidth:480,display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"}}>{x.abstract}</div>:null}
            </td>
            <td>{row.product?<><strong>{row.product.brand_name}</strong><div className={styles.muted} style={{marginTop:3}}>{row.product.active_ingredient||"—"}</div></>:"—"}</td>
            <td>{x.journal||"PubMed"}<div className={styles.muted} style={{marginTop:3}}>{dateLabel(x.publication_date)}</div></td>
            <td><Badge tone={x.relevance==="likely_relevant"?"red":x.relevance==="possible"?"amber":"default"}>{row.origin==="authority"?"Human escalation":x.relevance==="likely_relevant"?"Likely relevant":x.relevance==="possible"?"Possible":"Unscored"}</Badge></td>
            <td><Badge tone={review?.status==="under_review"?"amber":review?.status==="closed"?"green":"default"}>{review?.status==="under_review"?"Under review":review?.status==="closed"?"Closed":"New"}</Badge></td>
            <td><Badge tone={assessmentTone(review?.assessment||"unassessed")}>{assessmentLabel(review?.assessment||"unassessed")}</Badge></td>
            <td><button className={styles.buttonGhost} onClick={()=>openRow(row)}>Open</button></td>
          </tr>
        })}</tbody>
      </table></div>:<div className={styles.empty}>No findings have been escalated to Signal Review yet.</div>}
    </section>

    {selected?<div className={styles.modalBackdrop} onMouseDown={e=>{if(e.target===e.currentTarget)setSelected(null)}}>
      <div className={styles.modalCard}>
        <div className={styles.modalHeader}>
          <div>
            <div className={styles.eyebrow}>Signal assessment</div>
            <h2>{selected.product?.brand_name||"Literature finding"}</h2>
          </div>
          <button className={styles.modalClose} onClick={()=>setSelected(null)}>×</button>
        </div>

        <div className={styles.info}>
          <h3>{selected.item.title}</h3>
          <div className={styles.kv}><span>Product</span><span>{selected.product?.brand_name||"—"} · {selected.product?.active_ingredient||"—"}</span></div>
          <div className={styles.kv}><span>Source</span><span>{selected.item.journal||"PubMed"}</span></div>
          <div className={styles.kv}><span>Available</span><span>{dateLabel(selected.item.publication_date)}</span></div>
          <div className={styles.kv}><span>Safety priority</span><span>{selected.origin==="authority"?"Human escalation":selected.item.relevance==="likely_relevant"?"Likely relevant":selected.item.relevance==="possible"?"Possible":"Unscored"}</span></div>
          {selected.origin==="literature"?<><div className={styles.kv}><span>Saudi context</span><span>{selected.item.metadata?.urgent_saudi?"Yes — priority review":"No flag detected"}</span></div>
          <div className={styles.kv}><span>Safety terms</span><span>{selected.item.metadata?.safety_hits?.length?selected.item.metadata.safety_hits.join(", "):"—"}</span></div></>:null}
        </div>

        {selected.item.abstract?<div className={styles.notice} style={{marginTop:14}}><strong>{selected.origin==="authority"?"Recorded finding rationale":"Abstract"}</strong><div style={{marginTop:7,lineHeight:1.6}}>{selected.item.abstract}</div></div>:null}

        <label style={{display:"grid",gap:7,marginTop:16,fontSize:12,fontWeight:700,color:"#9cabb8"}}>
          QPPV assessment notes
          <textarea className={styles.input} style={{minHeight:110}} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Document the rationale, required follow-up, or evidence needed…"/>
        </label>

        <div className={styles.modalActions} style={{justifyContent:"space-between",flexWrap:"wrap"}}>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            <button className={styles.buttonGhost} disabled={busy||(selected.origin==="authority"&&!notes.trim())} onClick={()=>saveReview(selected,"unassessed","under_review")}>Start / keep under review</button>
            <button className={styles.buttonGhost} disabled={busy||(selected.origin==="authority"&&!notes.trim())} onClick={()=>saveReview(selected,"needs_more_info","under_review")}>Needs more info</button>
          </div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            <button className={styles.buttonGhost} disabled={busy||(selected.origin==="authority"&&!notes.trim())} onClick={()=>saveReview(selected,"no_signal_concern","closed")}>Close — no signal concern</button>
            <button className={styles.button} disabled={busy||(selected.origin==="authority"&&!notes.trim())} onClick={()=>saveReview(selected,"potential_signal","under_review")}>Mark potential signal</button>
          </div>
        </div>
      </div>
    </div>:null}
    </>}
  </>;
}
