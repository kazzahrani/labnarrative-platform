"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import styles from "./pvos.module.css";
import { usePVOS } from "./_provider";
import { pvosSupabase } from "./_pvos-supabase";
import { NotificationCenter } from "./_notification-center";

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
  const navItems=[
    ["/pvos/dashboard","Dashboard"],
    ["/pvos/companies","Companies"],
    ["/pvos/invoices","Invoice approvals"],
    ["/pvos/literature","Literature"],
    ["/pvos/signal","Signals"],
    ["/pvos/rmp","RMP"],
    ["/pvos/inspection","Inspection"],
    ["/pvos/automation","Settings"],
  ] as const;
  const isActive=(href:string)=>pathname===href || (href==="/pvos/dashboard"&&["/pvos/tasks","/pvos/approvals","/pvos/handover"].some(x=>pathname===x||pathname.startsWith(x+"/"))) || (href!=="/pvos/dashboard" && pathname.startsWith(href+"/"));

  if(pathname==="/pvos/login") return <div className={rootClass}>{children}</div>;

  if(loading) return <div className={rootClass}><div className={styles.loading}><span className={styles.spinner}></span><strong>Preparing your PVOS workspace…</strong></div></div>;
  if(error) return <div className={rootClass}><div className={styles.authWrap}><div className={styles.authCard}><h1 className={styles.title}>PVOS could not start</h1><div className={styles.errorBox}>{error}</div><button className={styles.button} onClick={()=>location.reload()}>Retry</button></div></div></div>;
  if(!session) return <div className={rootClass}></div>;

  return <div className={rootClass}><div className={styles.shell}>
    <aside className={styles.sidebar}>
      <div className={styles.sidebarBrandRow}>
       <div className={styles.brand}><img className={styles.mark} src="/pvos-mark.svg" alt="" aria-hidden="true"/><div>PVOS</div></div>
       <NotificationCenter userId={session.user.id}/>
      </div>
      <nav className={styles.nav}>
        {navItems.map(([href,label])=><Link key={href} href={href} className={isActive(href)?styles.navActive:undefined} aria-current={isActive(href)?"page":undefined}>{label}</Link>)}
      </nav>
      <div className={styles.foot}>
        <div className={styles.userEmail}>{session.user.email}</div>
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

export function Help({children,label="More information"}:{children:ReactNode,label?:string}) {
  return <span className={styles.infoTip} tabIndex={0} aria-label={label}>i<span className={styles.tooltip} role="tooltip">{children}</span></span>;
}

export function Tabs({label,value,items,onChange}:{label:string,value:string,items:{id:string,label:string}[],onChange:(id:string)=>void}) {
  return <div className={styles.tabs} role="tablist" aria-label={label}>{items.map((item,i)=><button key={item.id} type="button" role="tab" aria-selected={value===item.id} tabIndex={value===item.id?0:-1} className={value===item.id?styles.tabActive:styles.tab} onClick={()=>onChange(item.id)} onKeyDown={e=>{let next=i;if(e.key==="ArrowRight")next=(i+1)%items.length;else if(e.key==="ArrowLeft")next=(i+items.length-1)%items.length;else if(e.key==="Home")next=0;else if(e.key==="End")next=items.length-1;else return;e.preventDefault();onChange(items[next].id);(e.currentTarget.parentElement?.children[next] as HTMLElement)?.focus();}}>{item.label}</button>)}</div>;
}

export function statusTone(status:string):"default"|"red"|"amber"|"green"|"lime" {
  if(status==="Overdue") return "red";
  if(status==="Due today" || status==="Awaiting approval") return "amber";
  if(status==="Complete") return "green";
  if(status==="In progress") return "lime";
  return "default";
}

