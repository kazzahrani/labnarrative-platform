"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { browserSupabase } from "@/lib/supabase-browser";
import styles from "./income.module.css";

type PortfolioKind = "real" | "paper";
type Account = { id:string; provider:string|null; account_name:string|null };
type Holding = { id:string; account_id:string; asset_name:string; symbol:string|null; asset_type:string|null; quantity:number|string|null };
type IncomeEvent = { holdingId:string; symbol:string; assetName:string; eventDate:string; timestamp:number; amountPerUnitNative:number; amountPerUnitSar:number; totalSar:number; nativeCurrency:string; source:string };

function numeric(value:number|string|null|undefined){const n=Number(value??0);return Number.isFinite(n)?n:0}
function fmt(value:number,digits=2){return new Intl.NumberFormat("ar-SA-u-nu-arab",{maximumFractionDigits:digits}).format(value)}
function sar(value:number){return `${fmt(value)} ر.س`}

export default function IncomeClient(){
  const [kind,setKind]=useState<PortfolioKind>("real");
  const [accounts,setAccounts]=useState<Account[]>([]);
  const [holdings,setHoldings]=useState<Holding[]>([]);
  const [events,setEvents]=useState<IncomeEvent[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");

  useEffect(()=>{let active=true;async function load(){try{
    const mode:PortfolioKind=new URLSearchParams(window.location.search).get("portfolio")==="paper"?"paper":"real";setKind(mode);
    const {data:userData,error:userError}=await browserSupabase.auth.getUser();if(userError||!userData.user){window.location.replace(`/wealth/login?next=${encodeURIComponent(window.location.pathname+window.location.search)}`);return}
    const userId=userData.user.id;
    if(mode==="paper"){const {error:seedError}=await browserSupabase.rpc("ensure_wealth_paper_portfolio");if(seedError)throw seedError}
    const [a,h]=await Promise.all([
      browserSupabase.from("wealth_accounts").select("id,provider,account_name").eq("user_id",userId).eq("portfolio_kind",mode).order("created_at"),
      browserSupabase.from("wealth_holdings").select("id,account_id,asset_name,symbol,asset_type,quantity").eq("user_id",userId).eq("portfolio_kind",mode)
    ]);
    if(a.error)throw a.error;if(h.error)throw h.error;
    const accountRows=(a.data??[]) as Account[];const holdingRows=(h.data??[]) as Holding[];
    const eligible=holdingRows.filter(row=>Boolean(row.symbol)&&numeric(row.quantity)>0&&["saudi_stock","reit","global_stock"].includes(row.asset_type||""));
    const response=await fetch("/api/wealth/market/income",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({assets:eligible.map(row=>({holdingId:row.id,symbol:row.symbol,assetType:row.asset_type,quantity:numeric(row.quantity),assetName:row.asset_name}))}),cache:"no-store"});
    if(!response.ok)throw new Error("تعذر جلب سجل التوزيعات.");
    const payload=await response.json() as {events?:IncomeEvent[]};const incomeEvents=Array.isArray(payload.events)?payload.events:[];
    if(incomeEvents.length){const rows=incomeEvents.map(event=>({user_id:userId,holding_id:event.holdingId,portfolio_kind:mode,event_date:event.eventDate,event_type:"distribution",amount_per_unit_sar:event.amountPerUnitSar,total_amount_sar:event.totalSar,source:event.source,metadata:{symbol:event.symbol,asset_name:event.assetName,native_currency:event.nativeCurrency,amount_per_unit_native:event.amountPerUnitNative}}));const {error:persistError}=await browserSupabase.from("wealth_income_events").upsert(rows,{onConflict:"user_id,holding_id,event_date,event_type"});if(persistError)throw persistError}
    if(!active)return;setAccounts(accountRows);setHoldings(holdingRows);setEvents(incomeEvents);
  }catch(reason){if(active)setError(reason instanceof Error?reason.message:"تعذر تحميل الدخل.")}finally{if(active)setLoading(false)}}void load();return()=>{active=false}},[]);

  const accountMap=useMemo(()=>new Map(accounts.map(account=>[account.id,account])),[accounts]);
  const holdingMap=useMemo(()=>new Map(holdings.map(holding=>[holding.id,holding])),[holdings]);
  const metrics=useMemo(()=>{
    const now=new Date();const cutoff=new Date(now);cutoff.setFullYear(cutoff.getFullYear()-1);const ttm=events.filter(event=>new Date(`${event.eventDate}T12:00:00`)>=cutoff);const total=ttm.reduce((sum,event)=>sum+event.totalSar,0);
    const byHolding=new Map<string,number>();const byAccount=new Map<string,number>();
    ttm.forEach(event=>{byHolding.set(event.holdingId,(byHolding.get(event.holdingId)??0)+event.totalSar);const accountId=holdingMap.get(event.holdingId)?.account_id;if(accountId)byAccount.set(accountId,(byAccount.get(accountId)??0)+event.totalSar)});
    const monthKeys:string[]=[];const monthLabels:string[]=[];for(let i=11;i>=0;i--){const date=new Date(now.getFullYear(),now.getMonth()-i,1);monthKeys.push(`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}`);monthLabels.push(new Intl.DateTimeFormat("ar-SA-u-nu-arab",{month:"short"}).format(date))}
    const monthly=monthKeys.map((key,index)=>({key,label:monthLabels[index],value:ttm.filter(event=>event.eventDate.startsWith(key)).reduce((sum,event)=>sum+event.totalSar,0)}));const maxMonthly=Math.max(...monthly.map(item=>item.value),1);
    const topAssets=[...byHolding].map(([id,value])=>({id,value,name:holdingMap.get(id)?.asset_name||"أصل"})).sort((a,b)=>b.value-a.value);
    const topAccounts=[...byAccount].map(([id,value])=>({id,value,name:accountMap.get(id)?.provider||accountMap.get(id)?.account_name||"حساب"})).sort((a,b)=>b.value-a.value);
    return{ttm,total,payers:byHolding.size,monthly,maxMonthly,topAssets,topAccounts,latest:events[0]??null};
  },[events,holdingMap,accountMap]);

  const paper=kind==="paper";const suffix=paper?"?portfolio=paper":"";
  if(loading)return <main className={styles.page}><div className={styles.state}>جاري تحليل التوزيعات الفعلية…</div></main>;
  if(error)return <main className={styles.page}><div className={styles.state}><strong>تعذر تحميل الدخل.</strong><span>{error}</span></div></main>;

  return <main className={styles.page} dir="rtl">
    <aside className={styles.sidebar}><div><div className={styles.brand}>ثروة</div><div className={styles.brandSub}>{paper?"محفظة تجريبية":"إدارة الثروة"}</div></div><nav className={styles.nav}><Link href={`/wealth${suffix}`} className={styles.navItem}>نظرة عامة</Link><Link href={`/wealth/assets${suffix}`} className={styles.navItem}>الأصول</Link><Link href={`/wealth/income${suffix}`} className={`${styles.navItem} ${styles.active}`}>الدخل</Link><span className={styles.navItem}>التحليلات</span><span className={styles.navItem}>الالتزام الشرعي</span><span className={styles.navItem}>الحسابات</span></nav></aside>
    <section className={styles.workspace}><header className={styles.topbar}><div><p>{paper?"بيئة الاختبار":"المحفظة الحقيقية"}</p><h1>الدخل والتوزيعات</h1></div><div className={styles.actions}><Link href={paper?"/wealth/income":"/wealth/income?portfolio=paper"} className={styles.ghost}>{paper?"محفظتي الحقيقية":"محفظة تجريبية"}</Link><Link href={paper?"/wealth/assets?portfolio=paper&manage=1":"/wealth/assets?manage=1"} className={styles.primary}>إدارة الأصول</Link></div></header>
      <div className={styles.content}>{paper&&<div className={styles.paperNote}>التوزيعات هنا محسوبة من التاريخ الفعلي للأوراق المالية الموجودة في المحفظة التجريبية، وليست أرقامًا وهمية.</div>}
        <section className={styles.metrics}><article><small>دخل آخر 12 شهرًا</small><strong className={styles.profit}>{sar(metrics.total)}</strong><span>توزيعات تاريخية فعلية</span></article><article><small>الدخل السنوي المرجعي</small><strong>{sar(metrics.total)}</strong><span>Run-rate مبني على آخر 12 شهرًا</span></article><article><small>أصول دفعت توزيعات</small><strong>{fmt(metrics.payers,0)}</strong><span>ضمن الأصول المسجلة</span></article><article><small>آخر توزيع</small><strong>{metrics.latest?sar(metrics.latest.totalSar):"—"}</strong><span>{metrics.latest?metrics.latest.assetName:"لا توجد بيانات"}</span></article></section>
        <section className={styles.chartCard}><div className={styles.panelHead}><div><small>التدفق النقدي</small><h2>التوزيعات الشهرية — آخر 12 شهرًا</h2></div><strong>{sar(metrics.total)}</strong></div><div className={styles.bars}>{metrics.monthly.map(item=><div className={styles.barCol} key={item.key}><div className={styles.barValue}>{item.value>0?sar(item.value):""}</div><div className={styles.barTrack}><i style={{height:`${Math.max(item.value/metrics.maxMonthly*100,item.value>0?4:0)}%`}}/></div><span>{item.label}</span></div>)}</div></section>
        <section className={styles.twoCol}><article className={styles.panel}><div className={styles.panelHead}><div><small>الأصول</small><h2>أعلى مصادر الدخل</h2></div></div><div className={styles.rankList}>{metrics.topAssets.slice(0,6).map((item,index)=><div key={item.id}><span>{index+1}</span><b>{item.name}</b><strong>{sar(item.value)}</strong></div>)}{!metrics.topAssets.length&&<p>لا توجد توزيعات مسجلة في الفترة.</p>}</div></article><article className={styles.panel}><div className={styles.panelHead}><div><small>الحسابات</small><h2>الدخل حسب الحساب</h2></div></div><div className={styles.rankList}>{metrics.topAccounts.map((item,index)=><div key={item.id}><span>{index+1}</span><b>{item.name}</b><strong>{sar(item.value)}</strong></div>)}{!metrics.topAccounts.length&&<p>لا توجد توزيعات مسجلة في الفترة.</p>}</div></article></section>
        <section className={styles.history}><div className={styles.panelHead}><div><small>السجل</small><h2>آخر التوزيعات</h2></div><span>{events.length} حدث خلال 5 سنوات</span></div><div className={styles.table}><div className={`${styles.row} ${styles.headRow}`}><span>التاريخ</span><span>الأصل</span><span>الحساب</span><span>للوحدة</span><span>الإجمالي</span></div>{events.slice(0,40).map(event=>{const holding=holdingMap.get(event.holdingId);const account=holding?accountMap.get(holding.account_id):null;return <div className={styles.row} key={`${event.holdingId}-${event.eventDate}`}><span>{new Intl.DateTimeFormat("ar-SA-u-nu-arab",{day:"numeric",month:"short",year:"numeric"}).format(new Date(`${event.eventDate}T12:00:00`))}</span><span><b>{event.assetName}</b><small>{event.symbol}</small></span><span>{account?.provider||account?.account_name||"—"}</span><span>{sar(event.amountPerUnitSar)}</span><span className={styles.profit}><b>{sar(event.totalSar)}</b></span></div>})}</div></section>
        <div className={styles.sourceNote}>المصدر الحالي للتاريخ والتوزيعات: Yahoo Finance كـ fallback بحثي متأخر. قبل الإطلاق التجاري سنستبدله بمصدر مرخص مناسب.</div>
      </div>
    </section>
  </main>;
}
