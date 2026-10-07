"use client";
import {useEffect,useState} from "react";
import {Badge} from "../_components";
import styles from "../pvos.module.css";

type Decision="relevant"|"not_relevant"|"needs_review";
export type ReaderProps={items:any[],selectedId:string|null,onSelect:(id:string)=>void,products:Record<string,any>,sources:Record<string,any>,members:Record<string,any>,locked:(item:any)=>boolean,busy:boolean,hasFollowup:(id:string,destination:string)=>boolean,onSave:(item:any,decision:Decision,psur:boolean,signal:boolean)=>Promise<boolean>,batch:boolean,selected:string[],canSelect:(item:any)=>boolean,onToggle:(id:string)=>void};
export function decisionLabel(status:string){return status==="needs_review"?"Needs more information":status==="relevant"?"Relevant":status==="not_relevant"?"Not relevant":"Unreviewed";}
export function ArticleReader(props:ReaderProps){
  const [page,setPage]=useState(0);
  useEffect(()=>{const index=props.items.findIndex(x=>x.id===props.selectedId);if(index>=0)setPage(Math.floor(index/50));},[props.selectedId]);
  const item=props.items.find(x=>x.id===props.selectedId)||props.items[0];
  const last=Math.max(0,Math.ceil(props.items.length/50)-1),current=Math.min(page,last);
  return props.items.length?<div className={styles.literatureReader}>
    <div className={styles.articleList} aria-label="Article queue">
      {props.items.slice(current*50,current*50+50).map(x=><div key={x.id} className={x.id===item?.id?styles.articleSelected:styles.articleRow}>
        {props.batch&&props.canSelect(x)?<input type="checkbox" checked={props.selected.includes(x.id)} onChange={()=>props.onToggle(x.id)} aria-label={"Select "+x.title} disabled={props.busy}/>:null}
        <button onClick={()=>props.onSelect(x.id)} aria-pressed={x.id===item?.id} disabled={props.busy}>
          <span>{x.title}</span><small>{props.products[x.product_id]?.brand_name||"Product"} · {decisionLabel(x.review_status)}</small>
          {x.metadata?.urgent_saudi?<small className={styles.warn}>Potential Saudi case / context</small>:null}
          {x.metadata?.full_text_required?<small className={styles.warn}>Full text required</small>:null}
        </button>
      </div>)}
      <div className={styles.inlineActions} style={{padding:12}}><span className={styles.muted}>{current*50+1}–{Math.min((current+1)*50,props.items.length)} of {props.items.length} article-product records</span><button className={styles.buttonGhost} disabled={current===0||props.busy} onClick={()=>setPage(current-1)}>Previous</button><button className={styles.buttonGhost} disabled={current===last||props.busy} onClick={()=>setPage(current+1)}>Next</button></div>
    </div>
    {item?<ReadingPanel key={item.id} item={item} {...props}/>:null}
  </div>:<div className={styles.empty}>No articles match this view. Choose another screening or filter.</div>;
}

function ReadingPanel({item,...props}:ReaderProps&{item:any}){
  const [decision,setDecision]=useState<Decision|null>(["relevant","not_relevant","needs_review"].includes(item.review_status)?item.review_status:null);
  useEffect(()=>{setDecision(["relevant","not_relevant","needs_review"].includes(item.review_status)?item.review_status:null);},[item.review_status]);
  const [psur,setPsur]=useState(props.hasFollowup(item.id,"psur_evidence")),[signal,setSignal]=useState(props.hasFollowup(item.id,"signal_review"));
  const [saving,setSaving]=useState(false);
  const isLocked=props.locked(item),disabled=isLocked||saving||props.busy,p=props.products[item.product_id];
  async function save(){if(!decision||disabled)return;setSaving(true);try{await props.onSave(item,decision,psur,signal);}finally{setSaving(false);}}
  return <article className={styles.readingPanel} aria-label="Selected article">
    <div className={styles.muted}>{props.sources[item.source_id]?.name||item.journal||"Source not recorded"}{item.publication_date?" · "+item.publication_date:""}</div>
    <h3>{item.title}</h3>
    <p><strong>{p?.brand_name||"Product"}</strong> · {p?.active_ingredient||"Ingredient not recorded"}</p>
    {item.article_url?<a href={item.article_url} target="_blank" rel="noreferrer">Open original article ↗</a>:null}
    {item.metadata?.urgent_saudi?<div className={styles.notice} style={{marginTop:12}}>Potential Saudi case / context — requires prompt human review.</div>:null}
    {item.metadata?.full_text_required?<div className={styles.notice} style={{marginTop:12}}>Full-text review is required. Obtain and read the article before recording a final decision.</div>:null}
    <div className={styles.articleText}><h4>Abstract</h4><p style={{whiteSpace:"pre-wrap"}}>{item.abstract||"No abstract available. Review the original article or record Needs more information."}</p></div>
    {item.full_text?<details><summary>Available article text</summary><div className={styles.articleText} style={{whiteSpace:"pre-wrap"}}>{item.full_text}</div></details>:null}
    <details style={{margin:"14px 0"}}><summary>Why this was prioritised</summary>
      <p>System suggestion: {item.relevance==="likely_relevant"?"Likely relevant":item.relevance==="possible"?"Possible":item.relevance==="unlikely"?"Unlikely":"Not scored"}. This is separate from the QPPV decision.</p>
      <p>{item.ai_reason||"No prioritisation explanation recorded."}</p><p>Matched terms: {(item.matched_terms||[]).join(", ")||"Not recorded"}</p>
      {item.metadata?.product_role?<p>Product role: {String(item.metadata.product_role).replaceAll("_"," ")}</p>:null}
    </details>
    {isLocked?<div className={styles.notice}>Decisions are locked for second review or completed evidence. Recorded decision: <strong>{decisionLabel(item.review_status)}</strong>.</div>:<fieldset className={styles.reviewDecision} disabled={disabled}>
      <legend>QPPV decision</legend>
      <div className={styles.inlineActions}>{([['relevant','Relevant'],['not_relevant','Not relevant'],['needs_review','Needs more information']] as [Decision,string][]).map(([value,label])=><button key={value} className={decision===value?styles.button:styles.buttonGhost} aria-pressed={decision===value} onClick={()=>setDecision(value)}>{label}</button>)}</div>
      {decision==="relevant"?<div style={{marginTop:14}}><p>Use this article for</p><label><input type="checkbox" checked={psur||props.hasFollowup(item.id,"psur_evidence")} disabled={props.hasFollowup(item.id,"psur_evidence")} onChange={e=>setPsur(e.target.checked)}/> PSUR evidence</label><label style={{marginLeft:16}}><input type="checkbox" checked={signal||props.hasFollowup(item.id,"signal_review")} disabled={props.hasFollowup(item.id,"signal_review")} onChange={e=>setSignal(e.target.checked)}/> Signal Review</label></div>:null}
      {decision!=="relevant"&&(props.hasFollowup(item.id,"psur_evidence")||props.hasFollowup(item.id,"signal_review"))?<p className={styles.warn}>Existing downstream records remain linked. Revisit them separately if changing the relevance decision.</p>:null}
      <div className={styles.inlineActions}><button className={styles.button} disabled={!decision||disabled} onClick={save}>{saving?"Saving…":"Save & next"}</button></div>
    </fieldset>}
    {props.hasFollowup(item.id,"psur_evidence")||props.hasFollowup(item.id,"signal_review")?<p className={styles.muted}>Recorded downstream actions: {props.hasFollowup(item.id,"psur_evidence")?"PSUR evidence ":""}{props.hasFollowup(item.id,"signal_review")?"Signal Review":""}</p>:null}
    {item.reviewed_at?<p className={styles.muted}>Recorded first decision: {decisionLabel(item.review_status)} · {props.members[item.reviewer_user_id]?.email||item.reviewer_user_id||"Identity not recorded"} · {new Date(item.reviewed_at).toLocaleString()}</p>:null}
    {item.decision_note?<p className={styles.muted}>Decision note: {item.decision_note}</p>:null}
  </article>;
}
