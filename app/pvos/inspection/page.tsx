import { Header } from "../_components";
import { inspection } from "../_data";
import styles from "../pvos.module.css";
export default function Inspection(){
  const score=82;
  return <>
    <Header eyebrow="Inspection readiness" title="Can we prove the work was done?" sub="This view summarizes operational evidence and gaps. It is not a regulatory certification score; it is a practical readiness workspace for the PV team."/>
    <div className={styles.grid2}>
      <section className={styles.info}><h3>Readiness snapshot</h3><div style={{fontSize:42,fontWeight:900,letterSpacing:"-.05em",marginBottom:10}}>{score}%</div><div className={styles.progress}><span style={{width:score+"%"}}></span></div><p className={styles.sub} style={{marginTop:14}}>3 evidence gaps require attention before the next internal audit.</p></section>
      <aside className={styles.info}><h3>Inspection export</h3><p className={styles.sub}>Generate a chronological activity history with owner, timestamp, evidence and review status for a selected company and date range.</p><span className={styles.button}>Preview export</span></aside>
    </div>
    <section className={styles.panel}><div className={styles.panelHeader}><h2>Control checks</h2><span className={styles.muted}>Prototype rules only</span></div><div style={{padding:14}} className={styles.metricList}>{inspection.map(i=><div className={styles.metricRow} key={i.label}><span>{i.label}</span><strong className={i.state==="good"?styles.good:i.state==="warn"?styles.warn:styles.bad}>{i.score}</strong></div>)}</div></section>
  </>;
}
