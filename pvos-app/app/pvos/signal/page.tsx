"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge, Header } from "../_components";
import { usePVOS } from "../_provider";
import { pvosSupabase } from "../_pvos-supabase";
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
    const [f,i,p,r]=await Promise.all([
      pvosSupabase.from("pvos_literature_followups").select("*").eq("organization_id",organizationId).eq("destination","signal_review").order("created_at",{ascending:false}),
      pvosSupabase.from("pvos_literature_items").select("*").eq("organization_id",organizationId),
      pvosSupabase.from("pvos_products").select("id,brand_name,active_ingredient"),
      pvosSupabase.from("pvos_signal_reviews").select("*").eq("organization_id",organizationId).order("updated_at",{ascending:false})
    ]);
    setFollowups(f.data||[]);
    setItems(i.data||[]);
    setProducts(p.data||[]);
    setReviews(r.data||[]);
    setLoading(false);
  }

  useEffect(()=>{load()},[organizationId]);

  const itemMap=useMemo(()=>Object.fromEntries(items.map(x=>[x.id,x])),[items]);
  const productMap=useMemo(()=>Object.fromEntries(products.map(x=>[x.id,x])),[products]);
  const reviewMap=useMemo(()=>Object.fromEntries(reviews.map(x=>[x.literature_item_id,x])),[reviews]);

  const rows=followups.map(f=>{
    const item=itemMap[f.literature_item_id];
    const product=productMap[f.product_id||item?.product_id];
    const review=reviewMap[f.literature_item_id];
    return {followup:f,item,product,review};
  }).filter(x=>x.item);

  const newCount=rows.filter(x=>!x.review||x.review.status==="new").length;
  const inReview=rows.filter(x=>x.review?.status==="under_review").length;
  const potential=rows.filter(x=>x.review?.assessment==="potential_signal").length;
  const closed=rows.filter(x=>x.review?.status==="closed").length;

  async function saveReview(row:any,assessment:Assessment,status:"new"|"under_review"|"closed"){
    if(!organizationId||!session)return;
    setBusy(true);setMessage("");
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
      title="Signal Review"
      sub="Review safety findings escalated from literature. PVOS preserves the evidence trail; the QPPV makes the signal assessment."
    />

    <section className={styles.cards}>
      <div className={styles.card}><span>New findings</span><strong>{newCount}</strong></div>
      <div className={styles.card}><span>Under review</span><strong>{inReview}</strong></div>
      <div className={[styles.card,potential?styles.warning:""].join(" ")}><span>Potential signals</span><strong>{potential}</strong></div>
      <div className={styles.card}><span>Closed</span><strong>{closed}</strong></div>
      <div className={styles.card}><span>Total escalated</span><strong>{rows.length}</strong></div>
    </section>

    {message?<div className={message.includes("saved")||message.includes("updated")?styles.successBox:styles.errorBox} style={{marginBottom:14}}>{message}</div>:null}

    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <h2>Literature findings for signal assessment</h2>
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
            <td><Badge tone={x.relevance==="likely_relevant"?"red":x.relevance==="possible"?"amber":"default"}>{x.relevance==="likely_relevant"?"Likely relevant":x.relevance==="possible"?"Possible":"Unscored"}</Badge></td>
            <td><Badge tone={review?.status==="under_review"?"amber":review?.status==="closed"?"green":"default"}>{review?.status==="under_review"?"Under review":review?.status==="closed"?"Closed":"New"}</Badge></td>
            <td><Badge tone={assessmentTone(review?.assessment||"unassessed")}>{assessmentLabel(review?.assessment||"unassessed")}</Badge></td>
            <td><button className={styles.buttonGhost} onClick={()=>openRow(row)}>Open</button></td>
          </tr>
        })}</tbody>
      </table></div>:<div className={styles.empty}>No literature findings have been escalated to Signal Review yet.</div>}
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
          <div className={styles.kv}><span>Safety priority</span><span>{selected.item.relevance==="likely_relevant"?"Likely relevant":selected.item.relevance==="possible"?"Possible":"Unscored"}</span></div>
          <div className={styles.kv}><span>Saudi context</span><span>{selected.item.metadata?.urgent_saudi?"Yes — priority review":"No flag detected"}</span></div>
          <div className={styles.kv}><span>Safety terms</span><span>{selected.item.metadata?.safety_hits?.length?selected.item.metadata.safety_hits.join(", "):"—"}</span></div>
        </div>

        {selected.item.abstract?<div className={styles.notice} style={{marginTop:14}}><strong>Abstract</strong><div style={{marginTop:7,lineHeight:1.6}}>{selected.item.abstract}</div></div>:null}

        <label style={{display:"grid",gap:7,marginTop:16,fontSize:12,fontWeight:700,color:"#9cabb8"}}>
          QPPV assessment notes
          <textarea className={styles.input} style={{minHeight:110}} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Document the rationale, required follow-up, or evidence needed…"/>
        </label>

        <div className={styles.modalActions} style={{justifyContent:"space-between",flexWrap:"wrap"}}>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            <button className={styles.buttonGhost} disabled={busy} onClick={()=>saveReview(selected,"unassessed","under_review")}>Start / keep under review</button>
            <button className={styles.buttonGhost} disabled={busy} onClick={()=>saveReview(selected,"needs_more_info","under_review")}>Needs more info</button>
          </div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            <button className={styles.buttonGhost} disabled={busy} onClick={()=>saveReview(selected,"no_signal_concern","closed")}>Close — no signal concern</button>
            <button className={styles.button} disabled={busy} onClick={()=>saveReview(selected,"potential_signal","under_review")}>Mark potential signal</button>
          </div>
        </div>
      </div>
    </div>:null}
  </>;
}
