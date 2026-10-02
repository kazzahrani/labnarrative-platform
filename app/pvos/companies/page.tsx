import Link from "next/link";
import { Header } from "../_components";
import { companies } from "../_data";
import styles from "../pvos.module.css";
export default function Companies(){
  return <>
    <Header eyebrow="Client portfolio" title="Companies" sub="Each client has its own contract scope, QPPV/Deputy coverage, products, recurring PV obligations and evidence history."/>
    <div className={styles.companyGrid}>{companies.map(c=><Link className={styles.companyCard} href={"/pvos/companies/"+c.id} key={c.id}>
      <h3>{c.name}</h3><p>{c.contract}</p>
      <div className={styles.stats}><div><strong>{c.products}</strong><span>Products</span></div><div><strong>{c.dueWeek}</strong><span>Due this week</span></div><div><strong>{c.overdue}</strong><span>Overdue</span></div></div>
    </Link>)}</div>
  </>;
}
