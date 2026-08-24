"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { browserSupabase } from "@/lib/supabase-browser";
import styles from "./binance.module.css";

type Connection = {
  id: string;
  status: "pending" | "connected" | "syncing" | "error" | "disconnected" | "archived";
  last_sync_at: string | null;
  last_sync_status: "success" | "partial" | "error" | null;
  last_error: string | null;
  config: Record<string, unknown> | null;
};
type Account = { id: string; account_name: string | null; status: string; updated_at: string };
type LedgerCounts = { deposits:number; withdrawals:number; converts:number; transfers:number; fees:number };

function formatDate(value: string | null) {
  if (!value) return "لم تتم المزامنة الكاملة بعد";
  return new Intl.DateTimeFormat("ar-SA-u-nu-arab", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
function ledgerCounts(config: Record<string, unknown> | null): LedgerCounts {
  const raw = (config?.ledger_last_counts || {}) as Record<string, unknown>;
  return { deposits:Number(raw.deposits||0), withdrawals:Number(raw.withdrawals||0), converts:Number(raw.converts||0), transfers:Number(raw.transfers||0), fees:Number(raw.fees||0) };
}
async function edgeErrorMessage(error: unknown) {
  const fallback = error instanceof Error ? error.message : "تعذر إكمال العملية.";
  const context = (error as { context?: unknown } | null)?.context;
  if (!context) return fallback;
  try {
    if (context instanceof Response) {
      const payload = await context.clone().json();
      return payload?.message || payload?.error || fallback;
    }
    if (typeof context === "object") {
      const payload = context as Record<string, unknown>;
      return String(payload.message || payload.error || fallback);
    }
  } catch {}
  return fallback;
}

export default function BinanceConnectClient() {
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [connection, setConnection] = useState<Connection | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get("portfolio") === "paper") { window.location.replace("/wealth/connect/binance"); return; }
      const { data: userData, error: userError } = await browserSupabase.auth.getUser();
      if (userError || !userData.user) { window.location.replace(`/wealth/login?next=${encodeURIComponent("/wealth/connect/binance")}`); return; }
      const uid = userData.user.id;
      const { data: connectionRow, error: connectionError } = await browserSupabase.from("wealth_connections")
        .select("id,status,last_sync_at,last_sync_status,last_error,config")
        .eq("user_id", uid).eq("provider", "Binance").eq("portfolio_kind", "real").neq("status", "archived")
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (connectionError) throw connectionError;
      setConnection((connectionRow || null) as Connection | null);
      if (connectionRow?.id) {
        const { data: accountRow, error: accountError } = await browserSupabase.from("wealth_accounts")
          .select("id,account_name,status,updated_at").eq("user_id", uid).eq("connection_id", connectionRow.id).maybeSingle();
        if (accountError) throw accountError;
        setAccount((accountRow || null) as Account | null);
      } else setAccount(null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "تعذر تحميل حالة الاتصال."); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const connect = async (event: FormEvent) => {
    event.preventDefault(); if (!apiKey.trim() || !apiSecret.trim()) return;
    setWorking(true); setError(""); setMessage("");
    try {
      const { data, error: invokeError } = await browserSupabase.functions.invoke("wealth-binance", { body: { action: "connect", apiKey: apiKey.trim(), apiSecret: apiSecret.trim() } });
      if (invokeError) throw invokeError; if (!data?.ok) throw new Error(data?.message || data?.error || "تعذر ربط Binance.");
      setApiKey(""); setApiSecret("");
      const ledger = data?.stats?.financial_ledger;
      setMessage(`تم الربط والمزامنة${ledger?.initialBackfill ? " مع بناء السجل المالي الأولي" : ""}. تم فحص الأرصدة والصفقات والإيداعات والسحوبات وConvert والتحويلات والرسوم.`);
      await load();
    } catch (reason) { setError(await edgeErrorMessage(reason)); } finally { setWorking(false); }
  };

  const sync = async () => {
    if (!connection) return; setWorking(true); setError(""); setMessage("");
    try {
      const { data, error: invokeError } = await browserSupabase.functions.invoke("wealth-binance", { body: { action: "sync", connectionId: connection.id } });
      if (invokeError) throw invokeError; if (!data?.ok) throw new Error(data?.message || data?.error || "تعذر تحديث Binance.");
      const ledger = data?.stats?.financial_ledger;
      setMessage(`تم تحديث Binance بالكامل. السجل المالي في هذه المزامنة: ${Number(ledger?.deposits||0)} إيداع · ${Number(ledger?.withdrawals||0)} سحب · ${Number(ledger?.converts||0)} Convert · ${Number(ledger?.transfers||0)} تحويل · ${Number(ledger?.fees||0)} رسوم.`);
      await load();
    } catch (reason) { setError(await edgeErrorMessage(reason)); } finally { setWorking(false); }
  };

  const disconnect = async () => {
    if (!connection) return; setWorking(true); setError(""); setMessage("");
    try {
      const { data, error: invokeError } = await browserSupabase.functions.invoke("wealth-binance", { body: { action: "disconnect", connectionId: connection.id } });
      if (invokeError) throw invokeError; if (!data?.ok) throw new Error(data?.message || data?.error || "تعذر فصل Binance.");
      setMessage("تم إيقاف المزامنة. الأصول والسجل المالي الحالي بقيا محفوظين في ثروة."); await load();
    } catch (reason) { setError(await edgeErrorMessage(reason)); } finally { setWorking(false); }
  };

  const connected = connection?.status === "connected" || connection?.status === "syncing";
  const retryable = !!connection && connection.status !== "disconnected" && connection.status !== "archived";
  const ledger = ledgerCounts(connection?.config || null);
  const ledgerReady = Number(connection?.config?.financial_ledger_version || 0) >= 1;

  return <main className={styles.page} dir="rtl"><div className={styles.shell}>
    <header className={styles.header}><div><Link href="/wealth/accounts" className={styles.back}>العودة إلى الحسابات</Link><p>ربط فعلي · قراءة فقط</p><h1>Binance</h1><span>مزامنة المحفظة والسجل المالي دون تداول أو سحب أو تحويل أموال.</span></div><Link href="/wealth" className={styles.ghost}>نظرة عامة</Link></header>
    {loading ? <section className={styles.state}>جاري تحميل حالة الاتصال…</section> : <>
      {message && <div className={styles.success}>{message}</div>}{error && <div className={styles.error}>{error}</div>}
      {connection && <section className={styles.statusCard}>
        <div><small>حالة الاتصال</small><strong className={connected ? styles.good : connection.status === "error" ? styles.bad : styles.muted}>{connected ? "متصل" : connection.status === "error" ? "يحتاج إعادة مزامنة" : "غير متصل"}</strong></div>
        <div><small>الحساب</small><strong>{account?.account_name || "Binance Spot"}</strong></div>
        <div><small>آخر مزامنة</small><strong>{formatDate(connection.last_sync_at)}</strong></div>
        <div><small>السجل المالي</small><strong>{ledgerReady ? "مفعّل" : "بانتظار أول مزامنة"}</strong></div>
        {connection.last_error && connection.last_error !== "[object Object]" && <p className={styles.lastError}>{connection.last_error}</p>}
        <div className={styles.statusActions}><button type="button" onClick={sync} disabled={working || !retryable} className={styles.primary}>{working ? "جاري التحديث…" : connection.status === "error" ? "إعادة المزامنة" : "تحديث الآن"}</button><button type="button" onClick={disconnect} disabled={working || !retryable} className={styles.secondary}>إيقاف المزامنة</button></div>
      </section>}
      <section className={styles.grid}><article className={styles.panel}><small>إعداد المفتاح</small><h2>{connection ? "تغيير مفتاح Binance" : "ربط حساب Binance"}</h2><p>أنشئ API key مخصصًا لثروة. يجب أن تكون <b>Enable Reading</b> مفعلة، وكل صلاحيات التداول والسحب والتحويل معطلة.</p><form onSubmit={connect} className={styles.form} autoComplete="off"><label>API Key<input value={apiKey} onChange={e=>setApiKey(e.target.value)} dir="ltr" spellCheck={false} autoCapitalize="none" autoComplete="off" placeholder="Binance API Key" /></label><label>Secret Key<input type="password" value={apiSecret} onChange={e=>setApiSecret(e.target.value)} dir="ltr" spellCheck={false} autoCapitalize="none" autoComplete="new-password" placeholder="Binance Secret Key" /></label><button className={styles.primary} disabled={working || !apiKey.trim() || !apiSecret.trim()}>{working ? "جاري التحقق…" : connection ? "تحقق واستبدل المفتاح" : "تحقق واربط"}</button></form><div className={styles.security}><b>الأمان</b><span>المفتاح والـSecret لا يُحفظان في localStorage ولا في جدول عادي. بعد التحقق ينتقلان إلى Supabase Vault المشفر.</span></div></article>
        <article className={styles.panel}><small>الصلاحيات المقبولة</small><h2>قراءة فقط، بلا استثناء.</h2><div className={styles.rules}><div><i className={styles.dotGood}/><span><b>Enable Reading</b><small>يجب أن تكون مفعلة.</small></span></div><div><i className={styles.dotBad}/><span><b>Spot & Margin Trading</b><small>يجب أن تكون معطلة.</small></span></div><div><i className={styles.dotBad}/><span><b>Withdrawals / Transfers</b><small>صلاحية التنفيذ يجب أن تكون معطلة؛ قراءة السجل فقط مسموحة.</small></span></div><div><i className={styles.dotBad}/><span><b>Margin / Futures / Options</b><small>كلها يجب أن تكون معطلة.</small></span></div></div><p className={styles.note}>ثروة تعيد فحص الصلاحيات عند كل مزامنة. إذا تغيرت لاحقًا، تتوقف المزامنة تلقائيًا.</p></article></section>
      <section className={styles.whatSyncs}><div><small>السجل المالي</small><h2>ما الذي تتم مزامنته؟</h2></div><div className={styles.syncItems}><span>أرصدة Spot</span><span>Spot trades</span><span>الإيداعات {ledger.deposits}</span><span>السحوبات {ledger.withdrawals}</span><span>Convert {ledger.converts}</span><span>التحويلات الداخلية {ledger.transfers}</span><span>الرسوم {ledger.fees}</span><span>Cost Basis وP&amp;L عند إمكانية إثباتهما</span></div><p>الإيداع الخارجي الذي لا يحمل تكلفة شراء قابلة للإثبات لا يحصل على تكلفة مخمّنة. إذا استطاع السجل المالي تفسير الرصيد كاملًا تُحسب التكلفة منه؛ وإلا تستخدم ثروة المصالحة المحافظة من أحدث صفقات Spot التي تفسر الرصيد الحالي.</p></section>
    </>}
  </div></main>;
}
