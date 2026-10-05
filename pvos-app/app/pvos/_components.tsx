"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import styles from "./pvos.module.css";
import { usePVOS } from "./_provider";
import { pvosSupabase } from "./_pvos-supabase";

export function AppShell({children}:{children:ReactNode}) {
  const pathname=usePathname();
  const {session,loading,error}=usePVOS();
  const [theme,setTheme]=useState<"light"|"dark">("light");

  useEffect(()=>{
    const saved=window.localStorage.getItem("pvos-theme");
    if(saved==="dark"||saved==="light") setTheme(saved);
  },[]);

  function toggleTheme(){
    const next=theme==="light"?"dark":"light";
    setTheme(next);
    window.localStorage.setItem("pvos-theme",next);
  }

  const rootClass=[styles.root,theme==="light"?styles.light:styles.dark].join(" ");

  if(pathname==="/pvos/login") return <div className={rootClass}>{children}</div>;

  if(loading) return <div className={rootClass}><div className={styles.loading}><span className={styles.spinner}></span><strong>Preparing your PVOS workspace…</strong></div></div>;
  if(error) return <div className={rootClass}><div className={styles.authWrap}><div className={styles.authCard}><h1 className={styles.title}>PVOS could not start</h1><div className={styles.errorBox}>{error}</div><button className={styles.button} onClick={()=>location.reload()}>Retry</button></div></div></div>;
  if(!session) return <div className={rootClass}></div>;

  return <div className={rootClass}><div className={styles.shell}>
    <aside className={styles.sidebar}>
      <div className={styles.brand}><img className={styles.mark} src="/pvos-mark.svg" alt="" aria-hidden="true"/><div>PVOS</div></div>
      <nav className={styles.nav}>
        <Link href="/pvos/dashboard">Dashboard</Link>
        <Link href="/pvos/companies">Companies</Link>
        <Link href="/pvos/tasks">Tasks</Link>
        <Link href="/pvos/automation">Automation</Link>
        <Link href="/pvos/rmp">RMP Tracker</Link>
        <Link href="/pvos/approvals">Approvals</Link>
        <Link href="/pvos/handover">Handover</Link>
        <Link href="/pvos/inspection">Inspection</Link>
      </nav>
      <div className={styles.foot}>
        <div className={styles.userEmail}>{session.user.email}</div>
        <div>Private prototype · no patient data</div>
        <div className={styles.footerActions}>
          <button className={styles.signOut} onClick={()=>pvosSupabase.auth.signOut()}>Sign out</button>
          <button className={styles.themeToggle} onClick={toggleTheme} title={theme==="light"?"Switch to dark theme":"Switch to light theme"} aria-label={theme==="light"?"Switch to dark theme":"Switch to light theme"}>{theme==="light"?"☾":"☀"}</button>
        </div>
      </div>
    </aside>
    <main className={styles.main}>{children}</main>
  </div></div>;
}

export function Header({eyebrow,title,sub,action}:{eyebrow:string,title:string,sub?:string,action?:ReactNode}) {
  return <div className={styles.top}>
    <div>
      <div className={styles.eyebrow}>{eyebrow}</div>
      <div className={styles.titleRow}>
        <h1 className={styles.title}>{title}</h1>
        {sub?<span className={styles.infoTip} tabIndex={0} aria-label={sub}>i<span className={styles.tooltip} role="tooltip">{sub}</span></span>:null}
      </div>
    </div>
    {action ?? null}
  </div>;
}

export function Badge({children,tone="default"}:{children:ReactNode,tone?:"default"|"red"|"amber"|"green"|"lime"}) {
  const cls=[styles.badge,tone==="red"?styles.badgeRed:"",tone==="amber"?styles.badgeAmber:"",tone==="green"?styles.badgeGreen:"",tone==="lime"?styles.badgeLime:""].filter(Boolean).join(" ");
  return <span className={cls}>{children}</span>;
}

export function statusTone(status:string):"default"|"red"|"amber"|"green"|"lime" {
  if(status==="Overdue") return "red";
  if(status==="Due today" || status==="Awaiting approval") return "amber";
  if(status==="Complete") return "green";
  if(status==="In progress") return "lime";
  return "default";
}
