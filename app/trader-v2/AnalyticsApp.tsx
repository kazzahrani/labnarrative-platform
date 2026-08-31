"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { browserSupabase } from "../../lib/supabase-browser";
import styles from "./trader-app.module.css";

type Bucket = {
  trades: number;
  wins: number;
  losses: number;
  breakeven: number;
  pnl: number;
  invested: number;
  winRate: number;
  roi: number;
  averagePnl: number;
};
type AnalyticsSummary = Bucket & {
  activePositions: number;
  grossProfit: number;
  grossLoss: number;
  profitFactor: number | null;
  expectancy: number;
  bestTrade: number | null;
  worstTrade: number | null;
  maxDrawdown: number;
  avgHoldMinutes: number | null;
};
type SeriesPoint = { at: string; pnl: number; cumulative: number };
type ProviderStats = Bucket & { provider: string };
type BotStats = Bucket & { botId: string; botName: string; provider: string; status: string; activePositions: number };
type ExitReason = { reason: string; trades: number; pnl: number };
type PairStats = { pair: string; trades: number; pnl: number };
type AnalyticsResponse = {
  ok?: boolean;
  ready?: boolean;
  ageMs?: number;
  summary?: AnalyticsSummary;
  series?: SeriesPoint[];
  providers?: ProviderStats[];
  bots?: BotStats[];
  exitReasons?: ExitReason[];
  pairs?: PairStats[];
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
function holdLabel(minutes: number | null) {
  if (minutes == null) return "—";
  const rounded = Math.max(0, Math.round(minutes));
  if (rounded < 60) return `${rounded}m`;
  const hours = Math.floor(rounded / 60), rest = rounded % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}
function readError(error: unknown, fallback: string) { return error instanceof Error ? error.message || fallback : fallback; }

async function invokeAnalytics() {
  const started = performance.now();
  const { data, error } = await browserSupabase.functions.invoke("trader-v2-analytics-read", { body: {} });
  if (error) {
    let message = error.message || "trader-v2-analytics-read_failed";
    const context = (error as { context?: Response }).context;
    if (context) {
      try {
        const responseBody = await context.clone().json() as { error?: string };
        if (responseBody.error) message = responseBody.error;
      } catch {}
    }
    throw new Error(message);
  }
  const payload = (data ?? {}) as AnalyticsResponse;
  if (payload.error || payload.ok !== true) throw new Error(payload.error || "trader-v2-analytics-read_failed");
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

function PnlChart({ points }: { points: SeriesPoint[] }) {
  if (points.length < 2) return <div className={styles.empty}>Not enough closed trades to chart yet.</div>;
  const width = 900, height = 230, pad = 16;
  const values = points.map((point) => Number(point.cumulative || 0));
  const min = Math.min(...values, 0), max = Math.max(...values, 0);
  const span = Math.max(0.000001, max - min);
  const x = (index: number) => pad + index / Math.max(1, points.length - 1) * (width - pad * 2);
  const y = (value: number) => pad + (max - value) / span * (height - pad * 2);
  const line = points.map((point, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(2)},${y(Number(point.cumulative || 0)).toFixed(2)}`).join(" ");
  const zeroY = y(0);
  return <div style={{ overflow: "hidden", borderRadius: 12, border: "1px solid #222", background: "#0d0d0d" }}>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Cumulative realized P and L" style={{ width: "100%", height: 230, display: "block" }}>
      <line x1={pad} x2={width - pad} y1={zeroY} y2={zeroY} stroke="currentColor" opacity="0.12" strokeDasharray="5 5" />
      <path d={line} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  </div>;
}

export default function AnalyticsApp() {
  const [authReady, setAuthReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [data, setData] = useState<AnalyticsResponse | null>(null);
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
        const result = await invokeAnalytics();
        if (cancelled) return;
        setData(result.payload); setLatencyMs(result.latencyMs); setError("");
      } catch (caught) { if (!cancelled) setError(readError(caught, "Unable to load analytics.")); }
      finally { if (!cancelled) setLoading(false); }
    };
    setLoading(true); void load();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 30_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [signedIn]);

  if (!authReady) return <div className={styles.loading}>Loading secure session…</div>;
  if (!signedIn) return <AuthCard />;

  const summary = data?.summary;
  const providers = data?.providers ?? [];
  const bots = data?.bots ?? [];
  const reasons = data?.exitReasons ?? [];
  const pairs = data?.pairs ?? [];
  const content = loading ? <div className={styles.loading}>Computing persisted performance…</div> : error ? <div className={styles.error}>{error}</div> : !summary ? <div className={styles.error}>Analytics data is unavailable.</div> : <>
    <section className={styles.hero}><div className={styles.heroLabel}>Net realized P&amp;L</div><div className={`${styles.heroValue} ${summary.pnl >= 0 ? styles.positive : styles.negative}`}>{money(summary.pnl)}</div><div className={styles.heroMeta}><span>{summary.trades} closed trades</span><span>ROI {pct(summary.roi)}</span><span>{summary.activePositions} active positions</span><span>Average hold {holdLabel(summary.avgHoldMinutes)}</span><span>Updated {ageLabel(data?.ageMs)}</span>{latencyMs != null && <span>Read {latencyMs} ms</span>}</div></section>
    <div className={styles.cards}><section className={styles.card}><div className={styles.cardLabel}>Win rate</div><div className={styles.cardValue}>{number(summary.winRate, 1)}%</div></section><section className={styles.card}><div className={styles.cardLabel}>Profit factor</div><div className={styles.cardValue}>{summary.profitFactor == null ? "—" : number(summary.profitFactor, 2)}</div></section><section className={styles.card}><div className={styles.cardLabel}>Max drawdown</div><div className={styles.cardValue}>{money(summary.maxDrawdown)}</div></section></div>
    <section className={styles.panel}><div className={styles.panelHeader}><h2>Cumulative realized P&amp;L</h2><span>Persisted closed trades · read only</span></div><PnlChart points={data?.series ?? []} /><div className={styles.heroMeta}><span>Gross profit {money(summary.grossProfit)}</span><span>Gross loss {money(summary.grossLoss)}</span><span>Best trade {money(summary.bestTrade)}</span><span>Worst trade {money(summary.worstTrade)}</span><span>Expectancy {money(summary.expectancy)}</span></div></section>
    <section className={styles.panel}><div className={styles.panelHeader}><h2>By exchange</h2><span>Closed-trade performance</span></div><div className={styles.providerGrid}>{providers.map((provider) => <article className={styles.provider} key={provider.provider}><div className={styles.providerTop}><span className={styles.providerName}>{provider.provider}</span><span className={provider.pnl >= 0 ? styles.health : styles.healthWarn}>{money(provider.pnl)}</span></div><div className={styles.providerValue}>{number(provider.winRate, 1)}% win rate</div><div className={styles.providerMeta}>{provider.trades} trades · ROI {pct(provider.roi)} · avg {money(provider.averagePnl)}</div></article>)}</div></section>
    <section className={styles.panel}><div className={styles.panelHeader}><h2>Automation performance</h2><span>{bots.length} bots with activity</span></div>{bots.length === 0 ? <div className={styles.empty}>No bot analytics yet.</div> : <div className={styles.tableWrap}><table className={`${styles.table} ${styles.positionsTable}`}><thead><tr><th>Bot</th><th>Exchange</th><th>Status</th><th>Closed</th><th>Active</th><th>Win rate</th><th>ROI</th><th>P&amp;L</th><th>Avg trade</th></tr></thead><tbody>{bots.map((bot) => <tr key={bot.botId}><td className={styles.botCell}><strong>{bot.botName}</strong></td><td><span className={styles.exchange}>{bot.provider}</span></td><td>{bot.status}</td><td>{bot.trades}</td><td>{bot.activePositions}</td><td>{number(bot.winRate, 1)}%</td><td>{pct(bot.roi)}</td><td><span className={bot.pnl >= 0 ? styles.positive : styles.negative}>{money(bot.pnl)}</span></td><td>{money(bot.averagePnl)}</td></tr>)}</tbody></table></div>}</section>
    <div className={styles.providerGrid}><section className={styles.panel}><div className={styles.panelHeader}><h2>Exit reasons</h2><span>{reasons.length} types</span></div>{reasons.length === 0 ? <div className={styles.empty}>No exit reasons yet.</div> : <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Reason</th><th>Trades</th><th>P&amp;L</th></tr></thead><tbody>{reasons.map((reason) => <tr key={reason.reason}><td>{reason.reason}</td><td>{reason.trades}</td><td><span className={reason.pnl >= 0 ? styles.positive : styles.negative}>{money(reason.pnl)}</span></td></tr>)}</tbody></table></div>}</section><section className={styles.panel}><div className={styles.panelHeader}><h2>Top pairs</h2><span>By trade count</span></div>{pairs.length === 0 ? <div className={styles.empty}>No pair analytics yet.</div> : <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Pair</th><th>Trades</th><th>P&amp;L</th></tr></thead><tbody>{pairs.map((pair) => <tr key={pair.pair}><td><strong>{pair.pair}</strong></td><td>{pair.trades}</td><td><span className={pair.pnl >= 0 ? styles.positive : styles.negative}>{money(pair.pnl)}</span></td></tr>)}</tbody></table></div>}</section></div>
  </>;

  return <div className={styles.page}>
    <aside className={styles.sidebar}><Link href="/" className={styles.brand}><span className={styles.mark} /><span className={styles.brandText}><strong>LabNarrative</strong><span>Trading</span></span></Link><nav className={styles.nav}>{nav.map(([href, label]) => <Link href={href} key={href} className={href === "/analytics" ? styles.active : undefined}>{label}</Link>)}</nav><div className={styles.legacy}><a href="https://platform.labnarrative.com/trader">Open current Trader</a></div></aside>
    <main className={styles.main}><header className={styles.topbar}><div><div className={styles.eyebrow}>Core V2</div><h1 className={styles.title}>Analytics</h1></div><div className={styles.topActions}>{summary && <div className={styles.status}><span className={styles.dot} />{summary.trades} closed</div>}<button className={styles.ghostButton} onClick={() => browserSupabase.auth.signOut()}>Sign out</button></div></header>{content}</main>
  </div>;
}
