"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { browserSupabase } from "../../lib/supabase-browser";
import styles from "./trader-app.module.css";

type HistoryTrade = {
  tradeId: string;
  publicTradeNo: number | null;
  botId: string | null;
  botName: string;
  pair: string;
  provider: string;
  executionMode: string | null;
  status: string;
  entryPrice: number;
  averagePrice: number;
  invested: number;
  exitPrice: number;
  realizedPnl: number;
  realizedPct: number;
  closeReason: string | null;
  openedAt: string | null;
  closedAt: string | null;
  durationMs: number | null;
};

type HistorySummary = {
  closedCount: number;
  cancelledCount: number;
  wins: number;
  losses: number;
  breakeven: number;
  winRate: number;
  realizedPnl: number;
  totalInvested: number;
  averagePnl: number;
  providerCounts: Record<string, number>;
  reasonCounts: Record<string, number>;
};

type HistoryResponse = {
  ok?: boolean;
  ready?: boolean;
  ageMs?: number;
  summary?: HistorySummary;
  history?: HistoryTrade[];
  totalRows?: number;
  truncated?: boolean;
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

function money(value: unknown) {
  const parsed = Number(value ?? 0);
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(Number.isFinite(parsed) ? parsed : 0);
}
function number(value: unknown, digits = 2) {
  const parsed = Number(value ?? 0);
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(Number.isFinite(parsed) ? parsed : 0);
}
function pct(value: unknown) {
  const parsed = Number(value ?? 0);
  return `${Number.isFinite(parsed) && parsed > 0 ? "+" : ""}${number(parsed, 2)}%`;
}
function ageLabel(ms: number | undefined) {
  if (ms == null) return "—";
  if (ms < 1500) return "just now";
  if (ms < 60_000) return `${Math.round(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h ago`;
  return `${Math.round(ms / 86_400_000)}d ago`;
}
function durationLabel(ms: number | null) {
  if (ms == null) return "—";
  const minutes = Math.max(0, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60), rest = minutes % 60;
  if (hours < 24) return rest ? `${hours}h ${rest}m` : `${hours}h`;
  const days = Math.floor(hours / 24), hourRest = hours % 24;
  return hourRest ? `${days}d ${hourRest}h` : `${days}d`;
}
function dateLabel(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}
function readError(error: unknown, fallback: string) { return error instanceof Error ? error.message || fallback : fallback; }

async function invokeHistory() {
  const started = performance.now();
  const { data, error } = await browserSupabase.functions.invoke("trader-v2-history-read", { body: {} });
  if (error) {
    let message = error.message || "trader-v2-history-read_failed";
    const context = (error as { context?: Response }).context;
    if (context) {
      try {
        const responseBody = await context.clone().json() as { error?: string };
        if (responseBody.error) message = responseBody.error;
      } catch {}
    }
    throw new Error(message);
  }
  const payload = (data ?? {}) as HistoryResponse;
  if (payload.error || payload.ok !== true) throw new Error(payload.error || "trader-v2-history-read_failed");
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

export default function HistoryApp() {
  const [authReady, setAuthReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [data, setData] = useState<HistoryResponse | null>(null);
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
        const result = await invokeHistory();
        if (cancelled) return;
        setData(result.payload); setLatencyMs(result.latencyMs); setError("");
      } catch (caught) { if (!cancelled) setError(readError(caught, "Unable to load trade history.")); }
      finally { if (!cancelled) setLoading(false); }
    };
    setLoading(true); void load();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 30_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [signedIn]);

  if (!authReady) return <div className={styles.loading}>Loading secure session…</div>;
  if (!signedIn) return <AuthCard />;

  const summary = data?.summary;
  const rows = data?.history ?? [];
  const content = loading ? <div className={styles.loading}>Reading persisted trade history…</div> : error ? <div className={styles.error}>{error}</div> : !summary ? <div className={styles.error}>History data is unavailable.</div> : <>
    <section className={styles.hero}><div className={styles.heroLabel}>Net realized P&amp;L</div><div className={`${styles.heroValue} ${summary.realizedPnl >= 0 ? styles.positive : styles.negative}`}>{money(summary.realizedPnl)}</div><div className={styles.heroMeta}><span>{summary.closedCount} closed trades</span><span>{summary.wins} wins · {summary.losses} losses · {summary.breakeven} breakeven</span><span>Average {money(summary.averagePnl)} / trade</span><span>Latest close {ageLabel(data?.ageMs)}</span>{latencyMs != null && <span>Read {latencyMs} ms</span>}</div></section>
    <div className={styles.cards}><section className={styles.card}><div className={styles.cardLabel}>Closed trades</div><div className={styles.cardValue}>{summary.closedCount}</div></section><section className={styles.card}><div className={styles.cardLabel}>Win rate</div><div className={styles.cardValue}>{number(summary.winRate, 1)}%</div></section><section className={styles.card}><div className={styles.cardLabel}>Capital deployed</div><div className={styles.cardValue}>{money(summary.totalInvested)}</div></section></div>
    <section className={styles.panel}><div className={styles.panelHeader}><h2>Trade history</h2><span>{data?.truncated ? `Latest ${rows.length} of ${data.totalRows ?? rows.length}` : `${rows.length} persisted records`} · read only</span></div>{rows.length === 0 ? <div className={styles.empty}>No closed trades yet.</div> : <div className={styles.tableWrap}><table className={`${styles.table} ${styles.positionsTable}`}><thead><tr><th>#</th><th>Pair</th><th>Exchange</th><th>Bot</th><th>Entry</th><th>Exit</th><th>Invested</th><th>P&amp;L</th><th>Reason</th><th>Duration</th><th>Closed</th></tr></thead><tbody>{rows.map((trade) => <tr key={trade.tradeId}><td>{trade.publicTradeNo ?? "—"}</td><td><strong>{trade.pair}</strong></td><td><span className={styles.exchange}>{trade.provider}</span></td><td className={styles.botCell}>{trade.botName || "—"}</td><td>{money(trade.averagePrice || trade.entryPrice)}</td><td>{trade.status === "Cancelled" ? "—" : money(trade.exitPrice)}</td><td>{trade.invested > 0 ? money(trade.invested) : "—"}</td><td>{trade.status === "Cancelled" ? <span className={styles.muted}>Cancelled</span> : <span className={trade.realizedPnl >= 0 ? styles.positive : styles.negative}>{money(trade.realizedPnl)}<small>{pct(trade.realizedPct)}</small></span>}</td><td>{trade.closeReason || trade.status}</td><td>{durationLabel(trade.durationMs)}</td><td>{dateLabel(trade.closedAt)}</td></tr>)}</tbody></table></div>}</section>
  </>;

  return <div className={styles.page}>
    <aside className={styles.sidebar}><Link href="/" className={styles.brand}><span className={styles.mark} /><span className={styles.brandText}><strong>LabNarrative</strong><span>Trading</span></span></Link><nav className={styles.nav}>{nav.map(([href, label]) => <Link href={href} key={href} className={href === "/history" ? styles.active : undefined}>{label}</Link>)}</nav><div className={styles.legacy}><a href="https://platform.labnarrative.com/trader">Open current Trader</a></div></aside>
    <main className={styles.main}><header className={styles.topbar}><div><div className={styles.eyebrow}>Core V2</div><h1 className={styles.title}>History</h1></div><div className={styles.topActions}>{summary && <div className={styles.status}><span className={styles.dot} />{summary.closedCount} closed</div>}<button className={styles.ghostButton} onClick={() => browserSupabase.auth.signOut()}>Sign out</button></div></header>{content}</main>
  </div>;
}
