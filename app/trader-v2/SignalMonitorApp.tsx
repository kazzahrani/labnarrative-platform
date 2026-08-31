"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { browserSupabase } from "../../lib/supabase-browser";
import styles from "./trader-app.module.css";

type Automation = { id: string; name: string; status: string; provider: string };
type SignalEvent = {
  id: string;
  source: string;
  automationId: string;
  automationName: string;
  automationStatus: string;
  executionMode: string;
  provider: string;
  action: string;
  pair: string;
  status: string;
  receivedAt: string;
  processedAt: string | null;
  latencyMs: number | null;
  signalId: string | null;
  tradingViewOrderId: string | null;
  tradingViewEventTime: string | null;
  reason: string | null;
  requestedQuote: number | null;
  resultPrice: number | null;
  resultQuote: number | null;
  resultQuantity: number | null;
  remainingQuantity: number | null;
  resultFraction: number | null;
  positionAction: string | null;
  activePositions: number | null;
  maxOpenPositions: number | null;
  contracts: number | null;
  marketPosition: string | null;
};
type SignalMonitorResponse = {
  ok?: boolean;
  ready?: boolean;
  account?: { name: string };
  latestReceivedAt?: string | null;
  ageMs?: number | null;
  summary?: { totalEvents: number; processed: number; ignored: number; failed: number; activeQueue: number; strategyAutomations: number };
  automations?: Automation[];
  events?: SignalEvent[];
  error?: string;
};

const NAV = [
  ["/", "Overview"],
  ["/portfolio", "Portfolio"],
  ["/positions", "Positions"],
  ["/automations", "Automations"],
  ["/signal-monitor", "Signal Monitor"],
  ["/analytics", "Analytics"],
  ["/history", "History"],
  ["/connections", "Connections"],
] as const;

function number(value: unknown, digits = 6) {
  const parsed = Number(value ?? 0);
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(Number.isFinite(parsed) ? parsed : 0);
}
function money(value: unknown) {
  const parsed = Number(value ?? 0);
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 4 }).format(Number.isFinite(parsed) ? parsed : 0);
}
function ageLabel(ms: number | null | undefined) {
  if (ms == null) return "—";
  if (ms < 1500) return "just now";
  if (ms < 60_000) return `${Math.round(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h ago`;
  return `${Math.round(ms / 86_400_000)}d ago`;
}
function dateLabel(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(date);
}
function latencyLabel(ms: number | null) {
  if (ms == null) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${number(ms / 1000, 2)} s`;
}
function short(value: string | null | undefined, max = 34) {
  const clean = String(value || "").trim();
  if (!clean) return "—";
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}
function resultLabel(event: SignalEvent) {
  if (event.reason) return event.reason;
  if (event.status === "pending") return "Waiting in queue";
  if (event.status === "processing") return "Processing";
  if (event.resultQuote != null && event.resultPrice != null) return `${money(event.resultQuote)} @ ${money(event.resultPrice)}`;
  if (event.resultQuantity != null && event.resultPrice != null) return `${number(event.resultQuantity)} @ ${money(event.resultPrice)}`;
  if (event.positionAction) return event.positionAction;
  if (event.requestedQuote != null) return `Requested ${money(event.requestedQuote)}`;
  return "—";
}
function readError(error: unknown, fallback: string) { return error instanceof Error ? error.message || fallback : fallback; }

async function invokeMonitor() {
  const started = performance.now();
  const { data, error } = await browserSupabase.functions.invoke("trader-v2-signal-monitor-read", { body: {} });
  if (error) {
    let message = error.message || "trader-v2-signal-monitor-read_failed";
    const context = (error as { context?: Response }).context;
    if (context) {
      try {
        const responseBody = await context.clone().json() as { error?: string };
        if (responseBody.error) message = responseBody.error;
      } catch {}
    }
    throw new Error(message);
  }
  const payload = (data ?? {}) as SignalMonitorResponse;
  if (payload.error || payload.ok !== true) throw new Error(payload.error || "trader-v2-signal-monitor-read_failed");
  return { payload, latencyMs: Math.round(performance.now() - started) };
}

function AuthCard() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const send = async (event: FormEvent) => {
    event.preventDefault();
    const value = email.trim().toLowerCase();
    if (!value.includes("@")) return setError("Enter a valid email address.");
    setBusy(true); setError("");
    try {
      const { error: authError } = await browserSupabase.auth.signInWithOtp({ email: value, options: { shouldCreateUser: false } });
      if (authError) throw authError;
      setSent(true);
    } catch (caught) { setError(readError(caught, "Unable to send verification code.")); }
    finally { setBusy(false); }
  };
  const verify = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const { error: verifyError } = await browserSupabase.auth.verifyOtp({ email: email.trim().toLowerCase(), token: code.trim(), type: "email" });
      if (verifyError) throw verifyError;
    } catch (caught) { setError(readError(caught, "Unable to verify code.")); }
    finally { setBusy(false); }
  };
  return <main className={styles.auth}><section className={styles.authCard}>
    <div className={styles.brand}><span className={styles.mark} /><span className={styles.brandText}><strong>LabNarrative</strong><span>Trading</span></span></div>
    <h1>{sent ? "Verify your email" : "Sign in"}</h1>
    <p>{sent ? `Enter the verification code sent to ${email.trim().toLowerCase()}.` : "Access the new fast multi-exchange Trader workspace."}</p>
    <form className={styles.form} onSubmit={sent ? verify : send}>
      {!sent ? <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" /></label> : <label>Verification code<input value={code} onChange={(event) => setCode(event.target.value)} inputMode="numeric" autoComplete="one-time-code" /></label>}
      {error && <div className={styles.error}>{error}</div>}
      <button className={styles.primaryButton} disabled={busy}>{busy ? "Please wait…" : sent ? "Continue" : "Send verification code"}</button>
      {sent && <button type="button" className={styles.ghostButton} onClick={() => { setSent(false); setCode(""); setError(""); }}>Use another email</button>}
    </form>
  </section></main>;
}

export default function SignalMonitorApp() {
  const [authReady, setAuthReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [data, setData] = useState<SignalMonitorResponse | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const nav = useMemo(() => NAV, []);

  useEffect(() => {
    browserSupabase.auth.getSession().then(({ data: session }) => { setSignedIn(Boolean(session.session)); setAuthReady(true); });
    const { data: listener } = browserSupabase.auth.onAuthStateChange((_event, session) => { setSignedIn(Boolean(session)); setAuthReady(true); });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!signedIn) { setLoading(false); return; }
    let cancelled = false;
    const load = async () => {
      try {
        const result = await invokeMonitor();
        if (cancelled) return;
        setData(result.payload); setLatencyMs(result.latencyMs); setError("");
      } catch (caught) { if (!cancelled) setError(readError(caught, "Unable to load signal monitor.")); }
      finally { if (!cancelled) setLoading(false); }
    };
    setLoading(true); void load();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 10_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [signedIn]);

  if (!authReady) return <div className={styles.loading}>Loading secure session…</div>;
  if (!signedIn) return <AuthCard />;

  const summary = data?.summary;
  const events = data?.events ?? [];
  const automations = data?.automations ?? [];
  const content = loading ? <div className={styles.loading}>Reading persisted signal events…</div> : error ? <div className={styles.error}>{error}</div> : !summary ? <div className={styles.error}>Signal monitor data is unavailable.</div> : <>
    <section className={styles.hero}><div className={styles.heroLabel}>TradingView signals received</div><div className={styles.heroValue}>{summary.totalEvents}</div><div className={styles.heroMeta}><span>{summary.strategyAutomations} strategy automations</span><span>{summary.activeQueue} currently queued</span><span>Latest signal {ageLabel(data?.ageMs)}</span>{latencyMs != null && <span>Read {latencyMs} ms</span>}</div></section>
    <div className={styles.cards}><section className={styles.card}><div className={styles.cardLabel}>Processed</div><div className={styles.cardValue}>{summary.processed}</div></section><section className={styles.card}><div className={styles.cardLabel}>Ignored</div><div className={styles.cardValue}>{summary.ignored}</div></section><section className={styles.card}><div className={styles.cardLabel}>Failed</div><div className={`${styles.cardValue} ${summary.failed > 0 ? styles.negative : ""}`}>{summary.failed}</div></section></div>
    <section className={styles.panel}><div className={styles.panelHeader}><h2>Strategy automations</h2><span>Persisted configuration · no webhook secrets</span></div>{automations.length === 0 ? <div className={styles.empty}>No TradingView strategy automations found.</div> : <div className={styles.providerGrid}>{automations.map((automation) => <article className={styles.provider} key={automation.id}><div className={styles.providerTop}><span className={styles.providerName}>{automation.name}</span><span className={automation.status === "Running" || automation.status === "running" ? styles.health : styles.healthWarn}>{automation.status}</span></div><div className={styles.providerValue}>{automation.provider}</div><div className={styles.providerMeta}>TradingView strategy execution</div></article>)}</div>}</section>
    <section className={styles.panel}><div className={styles.panelHeader}><h2>Recent signal events</h2><span>Latest {events.length} · database read only · refreshes every 10s</span></div>{events.length === 0 ? <div className={styles.empty}>No TradingView signals have been received yet.</div> : <div className={styles.tableWrap}><table className={`${styles.table} ${styles.positionsTable}`}><thead><tr><th>Received</th><th>Pair</th><th>Action</th><th>Exchange</th><th>Automation</th><th>Status</th><th>Result / reason</th><th>Latency</th><th>Signal</th></tr></thead><tbody>{events.map((event) => {
      const good = event.status === "processed";
      const warning = event.status === "failed" || event.status === "pending" || event.status === "processing";
      return <tr key={event.id}><td>{dateLabel(event.receivedAt)}</td><td><strong>{event.pair}</strong></td><td>{event.action}</td><td><span className={styles.exchange}>{event.provider}</span></td><td className={styles.botCell}>{event.automationName}</td><td><span className={good ? styles.badgeGood : warning ? styles.badgeWarn : styles.badgeNeutral}>{event.status}</span></td><td title={event.reason || undefined}>{short(resultLabel(event), 48)}</td><td>{latencyLabel(event.latencyMs)}</td><td title={event.signalId || undefined}>{short(event.tradingViewOrderId || event.signalId, 30)}</td></tr>;
    })}</tbody></table></div>}</section>
  </>;

  return <div className={styles.page}>
    <aside className={styles.sidebar}><Link href="/" className={styles.brand}><span className={styles.mark} /><span className={styles.brandText}><strong>LabNarrative</strong><span>Trading</span></span></Link><nav className={styles.nav}>{nav.map(([href, label]) => <Link href={href} key={href} className={href === "/signal-monitor" ? styles.active : undefined}>{label}</Link>)}</nav><div className={styles.legacy}><a href="https://platform.labnarrative.com/trader">Open current Trader</a></div></aside>
    <main className={styles.main}><header className={styles.topbar}><div><div className={styles.eyebrow}>Core V2</div><h1 className={styles.title}>Signal Monitor</h1></div><div className={styles.topActions}>{summary && <div className={styles.status}><span className={summary.activeQueue > 0 ? `${styles.dot} ${styles.dotWarn}` : styles.dot} />{summary.activeQueue > 0 ? `${summary.activeQueue} queued` : "Queue clear"}</div>}<button className={styles.ghostButton} onClick={() => browserSupabase.auth.signOut()}>Sign out</button></div></header>{content}</main>
  </div>;
}
