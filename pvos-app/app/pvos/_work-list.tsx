"use client";
import Link from "next/link";
import {Badge,statusTone} from "./_components";
import {niceStatus,formatDue} from "./_utils";
import {deadlineState} from "./_work-utils";
import type {WorkItem} from "./_work";
import styles from "./pvos.module.css";
export function WorkList({items,companies,members,userId,showCompany=true}:{items:WorkItem[],companies:any[],members:any[],userId?:string,showCompany?:boolean}) {
  const company=Object.fromEntries(companies.map(c=>[c.id,c.name])),member=Object.fromEntries(members.map(m=>[m.user_id,m.email]));
  return items.length?<div className={styles.tableWrap}><table className={`${styles.table} ${styles.workTable}`}><thead><tr>{showCompany?<th>Company</th>:null}<th>Activity</th><th>Owner</th><th>Deadline</th><th>Status</th><th>Next action</th></tr></thead><tbody>{items.map(w=>{const due=deadlineState(w.due,w.status);return <tr key={w.id}>
    {showCompany?<td><Link href={"/pvos/companies/"+w.company_id}>{company[w.company_id]||"Company"}</Link></td>:null}
    <td><Link href={w.href}>{w.title}</Link><div className={styles.muted}>{w.kind}</div></td><td>{w.owner===userId?"Me":member[w.owner||""]||"Unassigned"}</td>
    <td>{formatDue(w.due)}{w.kind==="PSUR/PBRER"&&due.days!==null&&due.days>=0&&due.days<=90?<div className={due.days<=14?styles.bad:styles.muted}>PSUR reminder · {due.days===0?"today":due.days+" days remaining"}</div>:due.label&&due.label!=="Scheduled"?<div className={due.overdue?styles.bad:styles.muted}>{due.label}</div>:null}</td><td><Badge tone={statusTone(niceStatus(w.status))}>{niceStatus(w.status)}</Badge></td><td><Link className={styles.buttonGhost} href={w.href}>{w.action}</Link></td>
  </tr>})}</tbody></table></div>:<div className={styles.empty}>No work matches these filters.</div>;
}
