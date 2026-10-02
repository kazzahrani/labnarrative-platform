import { Header, Badge } from "../_components";
import { approvalItems } from "../_data";
import styles from "../pvos.module.css";
export default function Approvals(){
  return <>
    <Header eyebrow="Accountability" title="Approval tracking" sub="Know exactly where every document is, who has it, and how long it has been waiting. This protects the QPPV when another party delays review."/>
    <section className={styles.panel}><div className={styles.panelHeader}><h2>Documents in review</h2><span className={styles.muted}>Configurable per company</span></div>
    <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Company</th><th>Document</th><th>Workflow</th><th>Currently with</th><th>Waiting</th></tr></thead><tbody>{approvalItems.map(a=><tr key={a.id}><td>{a.company}</td><td>{a.document}</td><td>{a.workflow.join(" → ")}</td><td><Badge tone="amber">{a.current}</Badge></td><td>{a.waiting}</td></tr>)}</tbody></table></div></section>
  </>;
}
