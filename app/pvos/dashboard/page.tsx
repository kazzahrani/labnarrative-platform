import Link from "next/link";
import { Header, Badge, statusTone } from "../_components";
import { tasks } from "../_data";
import styles from "../pvos.module.css";

export default function Dashboard(){
  const counts={
    overdue:tasks.filter(t=>t.status==="Overdue").length,
    today:tasks.filter(t=>t.status==="Due today").length,
    week:tasks.filter(t=>["Due soon","Due today","Overdue"].includes(t.status)).length,
    waiting:tasks.filter(t=>t.status==="Awaiting approval").length,
    complete:7
  };
  return <>
    <Header eyebrow="My PV operation" title="What needs attention now?" sub="One view across every company, product, obligation and deadline. Planned recurring work and ad-hoc SFDA requests live in the same operational queue."/>
    <section className={styles.cards}>
      <div className={[styles.card,styles.danger].join(" ")}><span>Overdue</span><strong>{counts.overdue}</strong></div>
      <div className={[styles.card,styles.warning].join(" ")}><span>Due today</span><strong>{counts.today}</strong></div>
      <div className={styles.card}><span>Due this week</span><strong>{counts.week}</strong></div>
      <div className={styles.card}><span>Awaiting others</span><strong>{counts.waiting}</strong></div>
      <div className={[styles.card,styles.accent].join(" ")}><span>Completed this week</span><strong>{counts.complete}</strong></div>
    </section>
    <section className={styles.panel}>
      <div className={styles.panelHeader}><h2>Unified workload</h2><span className={styles.muted}>Across 6 companies · sorted by urgency</span></div>
      <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Company</th><th>Task</th><th>Type</th><th>Owner</th><th>Due</th><th>Status</th></tr></thead>
      <tbody>{tasks.map(t=><tr key={t.id}><td><Link href={"/pvos/companies/"+t.companyId}>{t.company}</Link></td><td><Link href={"/pvos/tasks/"+t.id}>{t.title}</Link>{t.product?<div className={styles.muted}>{t.product}</div>:null}</td><td>{t.type}</td><td>{t.owner}</td><td>{t.due}</td><td><Badge tone={statusTone(t.status)}>{t.status}</Badge></td></tr>)}</tbody></table></div>
    </section>
  </>;
}
