import { Header, Badge } from "../_components";
import { handovers } from "../_data";
import styles from "../pvos.module.css";
export default function Handover(){
  return <>
    <Header eyebrow="QPPV continuity" title="Leave handover" sub="Create one leave event and PVOS prepares a separate, auditable handover for every selected company. The Deputy accepts responsibility, then hands it back on return." action={<span className={styles.pill}>12–18 Oct · Deputy: Sarah M.</span>}/>
    <div className={styles.notice}><strong>Prototype scenario:</strong> the QPPV is going on leave for one week. Four companies have work due during the absence. In V0, PVOS assembles the open tasks and next deadlines automatically.</div>
    <section className={styles.panel}><div className={styles.panelHeader}><h2>Generated company handovers</h2><span className={styles.muted}>4 selected companies</span></div>
    <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Company</th><th>Open items</th><th>Next deadline</th><th>Risk</th><th>Deputy acceptance</th></tr></thead><tbody>{handovers.map(h=><tr key={h.company}><td>{h.company}</td><td>{h.open}</td><td>{h.next}</td><td><Badge tone={h.risk==="High"?"red":h.risk==="Medium"?"amber":"default"}>{h.risk}</Badge></td><td><Badge tone="lime">Ready to send</Badge></td></tr>)}</tbody></table></div></section>
    <div style={{marginTop:16,display:"flex",gap:10}}><span className={styles.button}>Generate 4 handovers</span><span className={styles.buttonGhost}>Preview handback</span></div>
  </>;
}
