import { notFound } from "next/navigation";
import { Header, Badge, statusTone } from "../../_components";
import { tasks } from "../../_data";
import styles from "../../pvos.module.css";
export default async function TaskPage({params}:{params:Promise<{id:string}>}){
  const {id}=await params; const t=tasks.find(x=>x.id===id); if(!t) notFound();
  const checklist=["Required source data collected","Saudi-specific information reviewed","Supporting document attached","Second-person review completed"];
  return <>
    <Header eyebrow={t.type+" · "+t.company} title={t.title} sub="Structured PV task with ownership, deadline, evidence, approvals and immutable activity history." action={<Badge tone={statusTone(t.status)}>{t.status}</Badge>}/>
    <div className={styles.grid2}>
      <section className={styles.stack}>
        <div className={styles.info}><h3>Task details</h3><div className={styles.kv}><span>Company</span><span>{t.company}</span></div>{t.product?<div className={styles.kv}><span>Product</span><span>{t.product}</span></div>:null}<div className={styles.kv}><span>Owner</span><span>{t.owner}</span></div><div className={styles.kv}><span>Due</span><span>{t.due}</span></div><div className={styles.kv}><span>Priority</span><span>{t.priority}</span></div></div>
        <div className={styles.info}><h3>Checklist</h3>{checklist.map((x,i)=><div className={styles.kv} key={x}><span>{i<2?"✓":"○"}</span><span>{x}</span></div>)}</div>
        <div className={styles.info}><h3>Evidence & documents</h3><div className={styles.notice}><strong>{t.evidence ?? 0} evidence item(s) attached.</strong><br/>In production this area will store file metadata, source, uploader, version and timestamp without turning PVOS into a full SharePoint replacement.</div></div>
      </section>
      <aside className={styles.stack}>
        <div className={styles.info}><h3>Approval route</h3><div className={styles.timeline}>
          <div className={[styles.step,styles.done].join(" ")}><span className={styles.dot}></span><div><strong>QPPV</strong><p>Completed · 2 Oct 09:42</p></div></div>
          <div className={[styles.step,t.approvalStage?styles.current:styles.done].join(" ")}><span className={styles.dot}></span><div><strong>{t.approvalStage ?? "Quality"}</strong><p>{t.approvalStage?"Currently under review":"Approved"}</p></div></div>
          <div className={styles.step}><span className={styles.dot}></span><div><strong>Final approver</strong><p>Not yet reached</p></div></div>
        </div></div>
        <div className={styles.info}><h3>Audit history</h3><div className={styles.kv}><span>2 Oct 09:42</span><span>QPPV completed review</span></div><div className={styles.kv}><span>2 Oct 09:43</span><span>Sent to next approver</span></div><div className={styles.kv}><span>2 Oct 11:12</span><span>Evidence file attached</span></div></div>
      </aside>
    </div>
  </>;
}
