import Link from "next/link";
import { notFound } from "next/navigation";
import { Header, Badge, statusTone } from "../../_components";
import { companies, products, tasks } from "../../_data";
import styles from "../../pvos.module.css";
export default async function CompanyPage({params}:{params:Promise<{id:string}>}){
  const {id}=await params; const c=companies.find(x=>x.id===id); if(!c) notFound();
  const ct=tasks.filter(t=>t.companyId===id); const cp=products.filter(p=>p.companyId===id);
  return <>
    <Header eyebrow="Company workspace" title={c.name} sub={c.contract} action={<Link className={styles.button} href="/pvos/handover">Start handover</Link>}/>
    <div className={styles.grid2}>
      <section>
        <div className={styles.panel}><div className={styles.panelHeader}><h2>Current work</h2><span className={styles.muted}>{ct.length} active items</span></div>
        <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Task</th><th>Owner</th><th>Due</th><th>Status</th></tr></thead><tbody>{ct.map(t=><tr key={t.id}><td><Link href={"/pvos/tasks/"+t.id}>{t.title}</Link>{t.product?<div className={styles.muted}>{t.product}</div>:null}</td><td>{t.owner}</td><td>{t.due}</td><td><Badge tone={statusTone(t.status)}>{t.status}</Badge></td></tr>)}</tbody></table></div></div>
        <div className={styles.panel}><div className={styles.panelHeader}><h2>Products</h2><span className={styles.muted}>{c.products} total · sample shown</span></div>
        <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Product</th><th>Active ingredient</th><th>Registration</th><th>RMP</th><th>Next review</th></tr></thead><tbody>{cp.length?cp.map(p=><tr key={p.id}><td>{p.name}</td><td>{p.ingredient}</td><td>{p.status}</td><td>{p.rmp}</td><td>{p.nextReview}</td></tr>):<tr><td colSpan={5}>No sample product records loaded in V0.</td></tr>}</tbody></table></div></div>
      </section>
      <aside className={styles.stack}>
        <div className={styles.info}><h3>Coverage</h3><div className={styles.kv}><span>QPPV</span><span>{c.qppv}</span></div><div className={styles.kv}><span>Deputy</span><span>{c.deputy}</span></div><div className={styles.kv}><span>Contract scope</span><span>{c.contract}</span></div><div className={styles.kv}><span>Evidence status</span><span>92% attached</span></div></div>
        <div className={styles.info}><h3>Recurring obligations</h3><div className={styles.kv}><span>Literature</span><span>Weekly</span></div><div className={styles.kv}><span>Signal / HA review</span><span>Monthly</span></div><div className={styles.kv}><span>PSSF</span><span>Monthly + annual</span></div><div className={styles.kv}><span>Training</span><span>On hire + 6 months</span></div></div>
      </aside>
    </div>
  </>;
}
