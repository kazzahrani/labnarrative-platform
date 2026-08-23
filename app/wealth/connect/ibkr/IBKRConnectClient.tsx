"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { browserSupabase } from "@/lib/supabase-browser";
import styles from "../binance/binance.module.css";

type Connection = {
  id: string;
  status: "pending" | "connected" | "syncing" | "error" | "disconnected" | "archived";
  last_sync_at: string | null;
  last_sync_status: "success" | "partial" | "error" | null;
  last_error: string | null;
  config: Record<string, unknown> | null;
};

type Account = { id: string; account_name: string | null; currency: string; status: string; updated_at: string };

function formatDate(value: string | null) {
  if (!value) return "لم تتم المزامنة بعد";
  return new Intl.DateTimeFormat("ar-SA-u-nu-arab", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
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

export default function IBKRConnectClient() {
  const [flexToken, setFlexToken] = useState("");
  const [queryId, setQueryId] = useState("");
  const [connection, setConnection] = useState<Connection | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get("portfolio") === "paper") { window.location.replace("/wealth/connect/ibkr"); return; }
      const { data: userData, error: userError } = await browserSupabase.auth.getUser();
      if (userError || !userData.user) {
        window.location.replace(`/wealth/login?next=${encodeURIComponent("/wealth/connect/ibkr")}`);
        return;
      }
      const uid = userData.user.id;
      const { data: row, error: ce } = await browserSupabase.from("wealth_connections")
        .select("id,status,last_sync_at,last_sync_status,last_error,config")
        .eq("user_id", uid).eq("provider", "Interactive Brokers").eq("portfolio_kind", "real").neq("status", "archived")
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (ce) throw ce;
      setConnection((row || null) as Connection | null);
      if (row?.id) {
        const { data: a, error: ae } = await browserSupabase.from("wealth_accounts")
          .select("id,account_name,currency,status,updated_at").eq("user_id", uid).eq("connection_id", row.id).order("created_at");
        if (ae) throw ae;
        setAccounts((a || []) as Account[]);
      } else setAccounts([]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تعذر تحميل حالة الاتصال.");
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const connect = async (event: FormEvent) => {
    event.preventDefault();
    if (!flexToken.trim() || !queryId.trim()) return;
    setWorking(true); setError(""); setMessage("");
    try {
      const { data, error: invokeError } = await browserSupabase.functions.invoke("wealth-ibkr", {
        body: { action: "connect", token: flexToken.trim(), queryId: queryId.trim() },
      });
      if (invokeError) throw invokeError;
      if (!data?.ok) throw new Error(data?.message || data?.error || "تعذر ربط Interactive Brokers.");
      setFlexToken(""); setQueryId("");
      const s = data?.stats || {};
      setMessage(`تم الربط: ${Number(s.accounts || 0)} حساب، ${Number(s.positions || 0)} مركز، و${Number(s.cash_balances || 0)} رصيد نقدي.`);
      await load();
    } catch (reason) { setError(await edgeErrorMessage(reason)); }
    finally { setWorking(false); }
  };

  const sync = async () => {
    if (!connection) return;
    setWorking(true); setError(""); setMessage("");
    try {
      const { data, error: invokeError } = await browserSupabase.functions.invoke("wealth-ibkr", { body: { action: "sync", connectionId: connection.id } });
      if (invokeError) throw invokeError;
      if (!data?.ok) throw new Error(data?.message || data?.error || "تعذر تحديث Interactive Brokers.");
      const s = data?.stats || {};
      setMessage(`تم تحديث IBKR: ${Number(s.positions || 0)} مركز، ${Number(s.cash_balances || 0)} رصيد نقدي، و${Number(s.transactions || 0)} حركة.`);
      await load();
    } catch (reason) { setError(await edgeErrorMessage(reason)); }
    finally { setWorking(false); }
  };

  const disconnect = async () => {
    if (!connection) return;
    setWorking(true); setError(""); setMessage("");
    try {
      const { data, error: invokeError } = await browserSupabase.functions.invoke("wealth-ibkr", { body: { action: "disconnect", connectionId: connection.id } });
      if (invokeError) throw invokeError;
      if (!data?.ok) throw new Error(data?.message || data?.error || "تعذر إيقاف المزامنة.");
      setMessage("تم إيقاف مزامنة Interactive Brokers. البيانات الحالية بقيت محفوظة في ثروة.");
      await load();
    } catch (reason) { setError(await edgeErrorMessage(reason)); }
    finally { setWorking(false); }
  };

  const connected = connection?.status === "connected" || connection?.status === "syncing";
  const retryable = !!connection && connection.status !== "disconnected" && connection.status !== "archived";

  return <main className={styles.page} dir="rtl">
    <div className={styles.shell}>
      <header className={styles.header}>
        <div><Link href="/wealth/accounts" className={styles.back}>العودة إلى الحسابات</Link><p>ربط فعلي · تقارير فقط</p><h1>Interactive Brokers</h1><span>مزامنة المحفظة من Flex Web Service بدون كلمة مرور وبدون أي قدرة على التداول.</span></div>
        <Link href="/wealth" className={styles.ghost}>نظرة عامة</Link>
      </header>

      {loading ? <section className={styles.state}>جاري تحميل حالة الاتصال…</section> : <>
        {message && <div className={styles.success}>{message}</div>}
        {error && <div className={styles.error}>{error}</div>}

        {connection && <section className={styles.statusCard}>
          <div><small>حالة الاتصال</small><strong className={connected ? styles.good : connection.status === "error" ? styles.bad : styles.muted}>{connected ? "متصل" : connection.status === "error" ? "يحتاج مراجعة" : "غير متصل"}</strong></div>
          <div><small>الحسابات</small><strong>{accounts.length || "—"}</strong></div>
          <div><small>آخر مزامنة</small><strong>{formatDate(connection.last_sync_at)}</strong></div>
          <div><small>آخر نتيجة</small><strong>{connection.last_sync_status === "success" ? "ناجحة" : connection.last_sync_status === "partial" ? "جزئية" : connection.last_sync_status === "error" ? "فشلت" : "—"}</strong></div>
          {connection.last_error && <p className={styles.lastError}>{connection.last_error}</p>}
          <div className={styles.statusActions}>
            <button type="button" onClick={sync} disabled={working || !retryable} className={styles.primary}>{working ? "IBKR ينشئ التقرير…" : connection.status === "error" ? "إعادة المزامنة" : "تحديث الآن"}</button>
            <button type="button" onClick={disconnect} disabled={working || !retryable} className={styles.secondary}>إيقاف المزامنة</button>
          </div>
        </section>}

        <section className={styles.grid}>
          <article className={styles.panel}>
            <small>Flex Web Service</small><h2>{connection ? "تغيير بيانات Flex" : "ربط حساب IBKR"}</h2>
            <p>أدخل <b>Current Token</b> و<b>Query ID</b> من Client Portal. ثروة لا تحتاج اسم المستخدم أو كلمة المرور ولا تنشئ جلسة تداول.</p>
            <form onSubmit={connect} className={styles.form} autoComplete="off">
              <label>Flex Token<input type="password" value={flexToken} onChange={e=>setFlexToken(e.target.value)} dir="ltr" spellCheck={false} autoComplete="new-password" placeholder="Current Token" /></label>
              <label>Query ID<input value={queryId} onChange={e=>setQueryId(e.target.value.replace(/\D/g,""))} dir="ltr" inputMode="numeric" placeholder="مثال 123456" /></label>
              <button className={styles.primary} disabled={working || !flexToken.trim() || !queryId.trim()}>{working ? "جاري إنشاء واسترجاع تقرير IBKR…" : connection ? "تحقق واستبدل بيانات Flex" : "تحقق واربط"}</button>
            </form>
            <div className={styles.security}><b>الأمان</b><span>Flex Token يُحفظ في Supabase Vault المشفر فقط. Query ID ليس كلمة مرور. هذا المسار مخصص للتقارير ولا يرسل أوامر تداول.</span></div>
          </article>

          <article className={styles.panel}>
            <small>إعداد Flex Query</small><h2>أنشئ Query باسم Tharwa</h2>
            <div className={styles.rules}>
              <div><i className={styles.dotGood}/><span><b>الصيغة: XML</b><small>مطلوبة حتى يستطيع ثروة قراءة الأقسام بأمان.</small></span></div>
              <div><i className={styles.dotGood}/><span><b>Account Information</b><small>Account ID، Currency، Name، Account Type.</small></span></div>
              <div><i className={styles.dotGood}/><span><b>Open Positions</b><small>Symbol، Description، Conid، Quantity، Mark Price، Position Value، Cost Basis Price/Money، FX Rate to Base.</small></span></div>
              <div><i className={styles.dotGood}/><span><b>Cash Report</b><small>Currency، Ending Cash، Ending Settled Cash، Report Date.</small></span></div>
              <div><i className={styles.dotGood}/><span><b>Trades + Cash Transactions</b><small>للتاريخ، الإيداعات، السحوبات والتوزيعات. يفضّل إضافتها لكنها ليست شرطًا لعرض المراكز الحالية.</small></span></div>
            </div>
            <p className={styles.note}>المزامنة قد تستغرق نحو 20 ثانية لأن IBKR ينشئ نسخة التقرير أولًا ثم يسمح باسترجاعها.</p>
          </article>
        </section>

        <section className={styles.whatSyncs}>
          <div><small>ما الذي يدخل إلى ثروة؟</small><h2>بيانات IBKR المرجعية</h2></div>
          <div className={styles.syncItems}><span>الحسابات</span><span>Open Positions</span><span>متوسط التكلفة</span><span>Cost Basis</span><span>القيمة الحالية</span><span>Unrealized P&amp;L</span><span>النقد والعملات</span><span>Trades</span><span>Dividends / Cash Transactions</span></div>
          <p>في IBKR نأخذ التكلفة من تقرير الوسيط نفسه، لذلك لا نعيد حساب Average Cost من الصفقات إلا إذا احتجنا ذلك لاحقًا للتحقق.</p>
        </section>
      </>}
    </div>
  </main>;
}
