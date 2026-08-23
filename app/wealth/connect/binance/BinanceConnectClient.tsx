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

type Account = {
  id: string;
  account_name: string | null;
  status: string;
  updated_at: string;
};

function formatDate(value: string | null) {
  if (!value) return "لم تتم المزامنة بعد";
  return new Intl.DateTimeFormat("ar-SA-u-nu-arab", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

async function edgeErrorMessage(error: unknown) {
  const fallback = error instanceof Error ? error.message : "تعذر إكمال العملية.";
  const context = (error as { context?: Response } | null)?.context;
  if (!context) return fallback;
  try {
    const payload = await context.clone().json();
    return payload?.message || payload?.error || fallback;
  } catch {
    return fallback;
  }
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
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get("portfolio") === "paper") {
        window.location.replace("/wealth/connect/binance");
        return;
      }
      const { data: userData, error: userError } = await browserSupabase.auth.getUser();
      if (userError || !userData.user) {
        window.location.replace(`/wealth/login?next=${encodeURIComponent("/wealth/connect/binance")}`);
        return;
      }
      const uid = userData.user.id;
      const { data: connectionRow, error: connectionError } = await browserSupabase
        .from("wealth_connections")
        .select("id,status,last_sync_at,last_sync_status,last_error,config")
        .eq("user_id", uid)
        .eq("provider", "Binance")
        .eq("portfolio_kind", "real")
        .neq("status", "archived")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (connectionError) throw connectionError;
      setConnection((connectionRow || null) as Connection | null);
      if (connectionRow?.id) {
        const { data: accountRow, error: accountError } = await browserSupabase
          .from("wealth_accounts")
          .select("id,account_name,status,updated_at")
          .eq("user_id", uid)
          .eq("connection_id", connectionRow.id)
          .maybeSingle();
        if (accountError) throw accountError;
        setAccount((accountRow || null) as Account | null);
      } else {
        setAccount(null);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تعذر تحميل حالة الاتصال.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const connect = async (event: FormEvent) => {
    event.preventDefault();
    if (!apiKey.trim() || !apiSecret.trim()) return;
    setWorking(true);
    setError("");
    setMessage("");
    try {
      const { data, error: invokeError } = await browserSupabase.functions.invoke("wealth-binance", {
        body: { action: "connect", apiKey: apiKey.trim(), apiSecret: apiSecret.trim() },
      });
      if (invokeError) throw invokeError;
      if (!data?.ok) throw new Error(data?.message || data?.error || "تعذر ربط Binance.");
      setApiKey("");
      setApiSecret("");
      const unpriced = Number(data?.stats?.unpriced || 0);
      setMessage(unpriced > 0 ? `تم الربط والمزامنة. يوجد ${unpriced} أصل لم نتمكن من تسعيره بعد.` : "تم ربط Binance والتحقق من أن المفتاح للقراءة فقط، ثم تمت المزامنة بنجاح.");
      await load();
    } catch (reason) {
      setError(await edgeErrorMessage(reason));
    } finally {
      setWorking(false);
    }
  };

  const sync = async () => {
    if (!connection) return;
    setWorking(true);
    setError("");
    setMessage("");
    try {
      const { data, error: invokeError } = await browserSupabase.functions.invoke("wealth-binance", {
        body: { action: "sync", connectionId: connection.id },
      });
      if (invokeError) throw invokeError;
      if (!data?.ok) throw new Error(data?.message || data?.error || "تعذر تحديث Binance.");
      setMessage("تم تحديث أرصدة Binance والقيم الحالية وصافي الثروة.");
      await load();
    } catch (reason) {
      setError(await edgeErrorMessage(reason));
    } finally {
      setWorking(false);
    }
  };

  const disconnect = async () => {
    if (!connection) return;
    setWorking(true);
    setError("");
    setMessage("");
    try {
      const { data, error: invokeError } = await browserSupabase.functions.invoke("wealth-binance", {
        body: { action: "disconnect", connectionId: connection.id },
      });
      if (invokeError) throw invokeError;
      if (!data?.ok) throw new Error(data?.message || data?.error || "تعذر فصل Binance.");
      setMessage("تم إيقاف المزامنة. الأصول الحالية بقيت محفوظة في ثروة.");
      await load();
    } catch (reason) {
      setError(await edgeErrorMessage(reason));
    } finally {
      setWorking(false);
    }
  };

  const connected = connection?.status === "connected" || connection?.status === "syncing";

  return <main className={styles.page} dir="rtl">
    <div className={styles.shell}>
      <header className={styles.header}>
        <div>
          <Link href="/wealth/accounts" className={styles.back}>العودة إلى الحسابات</Link>
          <p>ربط فعلي · قراءة فقط</p>
          <h1>Binance</h1>
          <span>مزامنة أرصدة Spot إلى ثروة دون تداول أو سحب أو تحويل أموال.</span>
        </div>
        <Link href="/wealth" className={styles.ghost}>نظرة عامة</Link>
      </header>

      {loading ? <section className={styles.state}>جاري تحميل حالة الاتصال…</section> : <>
        {message && <div className={styles.success}>{message}</div>}
        {error && <div className={styles.error}>{error}</div>}

        {connection && <section className={styles.statusCard}>
          <div><small>حالة الاتصال</small><strong className={connected ? styles.good : connection.status === "error" ? styles.bad : styles.muted}>{connected ? "متصل" : connection.status === "error" ? "يحتاج انتباه" : "غير متصل"}</strong></div>
          <div><small>الحساب</small><strong>{account?.account_name || "Binance Spot"}</strong></div>
          <div><small>آخر مزامنة</small><strong>{formatDate(connection.last_sync_at)}</strong></div>
          <div><small>آخر نتيجة</small><strong>{connection.last_sync_status === "success" ? "ناجحة" : connection.last_sync_status === "partial" ? "جزئية" : connection.last_sync_status === "error" ? "فشلت" : "—"}</strong></div>
          {connection.last_error && <p className={styles.lastError}>{connection.last_error}</p>}
          <div className={styles.statusActions}>
            <button type="button" onClick={sync} disabled={working || !connected} className={styles.primary}>{working ? "جاري التحديث…" : "تحديث الآن"}</button>
            <button type="button" onClick={disconnect} disabled={working || !connected} className={styles.secondary}>إيقاف المزامنة</button>
          </div>
        </section>}

        <section className={styles.grid}>
          <article className={styles.panel}>
            <small>إعداد المفتاح</small>
            <h2>{connection ? "تغيير مفتاح Binance" : "ربط حساب Binance"}</h2>
            <p>أنشئ API key مخصصًا لثروة. يجب أن تكون <b>Enable Reading</b> مفعلة، وكل صلاحيات التداول والسحب والتحويل معطلة.</p>
            <form onSubmit={connect} className={styles.form} autoComplete="off">
              <label>API Key<input value={apiKey} onChange={(event) => setApiKey(event.target.value)} dir="ltr" spellCheck={false} autoCapitalize="none" autoComplete="off" placeholder="Binance API Key" /></label>
              <label>Secret Key<input type="password" value={apiSecret} onChange={(event) => setApiSecret(event.target.value)} dir="ltr" spellCheck={false} autoCapitalize="none" autoComplete="new-password" placeholder="Binance Secret Key" /></label>
              <button className={styles.primary} disabled={working || !apiKey.trim() || !apiSecret.trim()}>{working ? "جاري التحقق…" : connection ? "تحقق واستبدل المفتاح" : "تحقق واربط"}</button>
            </form>
            <div className={styles.security}><b>الأمان</b><span>المفتاح والـSecret لا يُحفظان في localStorage ولا في جدول عادي. بعد التحقق ينتقلان إلى Supabase Vault المشفر.</span></div>
          </article>

          <article className={styles.panel}>
            <small>الصلاحيات المقبولة</small>
            <h2>قراءة فقط، بلا استثناء.</h2>
            <div className={styles.rules}>
              <div><i className={styles.dotGood} /><span><b>Enable Reading</b><small>يجب أن تكون مفعلة.</small></span></div>
              <div><i className={styles.dotBad} /><span><b>Spot & Margin Trading</b><small>يجب أن تكون معطلة.</small></span></div>
              <div><i className={styles.dotBad} /><span><b>Withdrawals / Transfers</b><small>السحب والتحويلات يجب أن تكون معطلة.</small></span></div>
              <div><i className={styles.dotBad} /><span><b>Margin / Futures / Options</b><small>كلها يجب أن تكون معطلة.</small></span></div>
            </div>
            <p className={styles.note}>ثروة تتحقق من هذه الصلاحيات مع Binance عند الربط، وتعيد فحصها عند كل مزامنة. إذا تغيرت الصلاحيات لاحقًا، تتوقف المزامنة بدل الاستمرار.</p>
          </article>
        </section>

        <section className={styles.whatSyncs}>
          <div><small>ما الذي يُزامن الآن؟</small><h2>النسخة الأولى من الربط الفعلي</h2></div>
          <div className={styles.syncItems}>
            <span>أرصدة Spot غير الصفرية</span>
            <span>الكمية الحرة والمحجوزة</span>
            <span>السعر الحالي</span>
            <span>القيمة بالريال</span>
            <span>Snapshot لصافي الثروة</span>
            <span>سجل نجاح/فشل المزامنة</span>
          </div>
          <p>متوسط التكلفة وP&amp;L التاريخي لا يتم اختلاقهما من رصيد Binance. سنضيفهما فقط بعد مزامنة سجل الصفقات بطريقة موثوقة.</p>
        </section>
      </>}
    </div>
  </main>;
}
