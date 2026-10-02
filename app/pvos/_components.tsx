import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./pvos.module.css";

export function AppShell({children}:{children:ReactNode}) {
  return <div className={styles.root}><div className={styles.shell}>
    <aside className={styles.sidebar}>
      <div className={styles.brand}><span className={styles.mark}>PV</span><div>PVOS<small>Saudi PV operations</small></div></div>
      <nav className={styles.nav}>
        <Link href="/pvos/dashboard">Dashboard</Link>
        <Link href="/pvos/companies">Companies</Link>
        <Link href="/pvos/approvals">Approvals</Link>
        <Link href="/pvos/handover">Handover</Link>
        <Link href="/pvos/inspection">Inspection</Link>
      </nav>
      <div className={styles.foot}>Prototype mode<br/>Dummy companies and no patient data.</div>
    </aside>
    <main className={styles.main}>{children}</main>
  </div></div>
}

export function Header({eyebrow,title,sub,action}:{eyebrow:string,title:string,sub:string,action?:ReactNode}) {
  return <div className={styles.top}><div><div className={styles.eyebrow}>{eyebrow}</div><h1 className={styles.title}>{title}</h1><div className={styles.sub}>{sub}</div></div>{action ?? <span className={styles.pill}>V0 · prototype</span>}</div>
}

export function Badge({children,tone="default"}:{children:ReactNode,tone?:"default"|"red"|"amber"|"green"|"lime"}) {
  const cls=[styles.badge,tone==="red"?styles.badgeRed:"",tone==="amber"?styles.badgeAmber:"",tone==="green"?styles.badgeGreen:"",tone==="lime"?styles.badgeLime:""].filter(Boolean).join(" ");
  return <span className={cls}>{children}</span>
}

export function statusTone(status:string):"default"|"red"|"amber"|"green"|"lime" {
  if(status==="Overdue") return "red";
  if(status==="Due today" || status==="Awaiting approval") return "amber";
  if(status==="Complete") return "green";
  if(status==="In progress") return "lime";
  return "default";
}
