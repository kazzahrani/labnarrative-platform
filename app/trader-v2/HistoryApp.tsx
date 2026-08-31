"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { browserSupabase } from "../../lib/supabase-browser";
import CoinLogo from "../trader/CoinLogo";
import DcaTradeChartV2Workstation from "../trader/DcaTradeChartV2Workstation";
import base from "./trader-app.module.css";
import styles from "./history-app.module.css";

type HistoryTrade = {
  tradeId: string;
  clientId: string | null;
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
  averagingFilled: number;
  maxAveraging: number;
  activeOrdersLimit: number;
  takeProfitPct: number;
  stopEnabled: boolean;
  stopPct: number;
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
  accountId?: string;
  ageMs?: number;
  summary?: HistorySummary;
  history?: HistoryTrade[];
  totalRows?: number;
  truncated?: boolean;
  error?: string;
};

type DonutPart = { label: string; value: number; color: string };

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

function finite(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
function money(value: unknown) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(finite(value));
}
function price(value: unknown) {
  const parsed = finite(value);
  if (!(parsed > 0)) return "—";
  const digits = parsed >= 1000 ? 2 : parsed >= 1 ? 4 : parsed >= .01 ? 6 : 8;
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(parsed);
}
function pct(value: unknown) {
  const parsed = finite(value);
  return `${parsed > 0 ? "+" : ""}${parsed.toFixed(2)}%`;
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
  return new Intl.DateTimeFormat("en-US", { month: "numeric", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}
function ageLabel(ms: number | undefined) {
  if (ms == null) return "—";
  if (ms < 1500) return "just now";
  if (ms < 60_000) return `${Math.round(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h ago`;
  return `${Math.round(ms / 86_400_000)}d ago`;
}
function readError(error: unknown, fallback: string) { return error instanceof Error ? error.message || fallback : fallback; }
function donutGradient(parts: DonutPart[]) {
  const nonzero = parts.filter((part) => part.value > 0);
  const total = nonzero.reduce((sum, part) => sum + part.value, 0);
  if (!(total > 0)) return "conic-gradient(#343434 0deg 360deg)";
  let cursor = 0;
  return `conic-gradient(${nonzero.map((part) => {
    const from = cursor / total * 360;
    cursor += part.value;
    const to = cursor / total * 360;
    return `${part.color} ${from.toFixed(2)}deg ${to.toFixed(2)}deg`;
  }).join(",")})`;
}
function normalizedExitReasons(reasonCounts: Record<string, number>) {
  const out = { "Take Profit": 0, "Stop Loss": 0, Other: 0, Manual: 0 };
  for (const [reason, count] of Object.entries(reasonCounts)) {
    const key = reason.toLowerCase();
    if (key.includes("take profit") || key === "tp" || key.includes("trailing profit")) out["Take Profit"] += count;
    else if (key.includes("stop loss") || key === "sl" || key.includes("stop")) out["Stop Loss"] += count;
    else if (key.includes("manual")) out.Manual += count;
    else out.Other += count;
  }
  return out;
}

async function invokeHistory() {
  const started = performance.now();
  const { data, error } = await browserSupabase.functions.invoke("trader-v2-history-read", { body: {} });
  if (error) {
    let message = error.message || "trader-v2-history-read_failed";
    const context = (error as { context?: Response }).context;
    if (context) { try { const body = await context.clone().json() as { error?: string }; if (body.error) message = body.error; } catch {} }
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
    event.preventDefault(); const value = email.trim().toLowerCase(); if (!value.includes("@")) return setError("Enter a valid email address.");
    setBusy(true); setError(""); try { const { error: authError } = await browserSupabase.auth.signInWithOtp({ email: value, options: { shouldCreateUser: false } }); if (authError) throw authError; setSent(true); } catch (caught) { setError(readError(caught, "Unable to send verification code.")); } finally { setBusy(false); }
  };
  const verify = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(""); try { const { error: verifyError } = await browserSupabase.auth.verifyOtp({ email: email.trim().toLowerCase(), token: code.trim(), type: "email" }); if (verifyError) throw verifyError; } catch (caught) { setError(readError(caught, "Unable to verify code.")); } finally { setBusy(false); }
  };
  return <main className={base.auth}><section className={base.authCard}>
    <div className={base.brand}><span className={base.mark} /><span className={base.brandText}><strong>LabNarrative</strong><span>Trading</span></span></div>
    <h1>{sent ? "Verify your email" : "Sign in"}</h1><p>{sent ? `Enter the verification code sent to ${email.trim().toLowerCase()}.` : "Access the fast Core V2 trading workspace."}</p>
    <form className={base.form} onSubmit={sent ? verify : send}>{!sent ? <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" /></label> : <label>Verification code<input value={code} onChange={(event) => setCode(event.target.value)} inputMode="numeric" autoComplete="one-time-code" /></label>}{error && <div className={base.error}>{error}</div>}<button className={base.primaryButton} disabled={busy}>{busy ? "Please wait…" : sent ? "Continue" : "Send verification code"}</button>{sent && <button type="button" className={base.ghostButton} onClick={() => { setSent(false); setCode(""); setError(""); }}>Use another email</button>}</form>
  </section></main>;
}

function DonutCard({ title, subtitle, headline, center, centerLabel, parts }: { title: string; subtitle: string; headline: string; center: string; centerLabel: string; parts: DonutPart[] }) {
  return <section className={styles.insightCard}><div className={styles.insightHead}><div><strong>{title}</strong><small>{subtitle}</small></div><b>{headline}</b></div><div className={styles.insightBody}><div className={styles.donut} style={{ background: donutGradient(parts) }}><div><strong>{center}</strong><small>{centerLabel}</small></div></div><div className={styles.legend}>{parts.map((part) => <div className={styles.legendRow} key={part.label}><i style={{ background: part.color }} /><span>{part.label}</span><b>{part.value}</b></div>)}</div></div></section>;
}

function RecentPnlCard({ trades }: { trades: HistoryTrade[] }) {
  const recent = trades.filter((trade) => trade.status !== "Cancelled").slice(0, 12).reverse();
  const maxAbs = Math.max(...recent.map((trade) => Math.abs(trade.realizedPnl)), .01);
  const total = recent.reduce((sum, trade) => sum + trade.realizedPnl, 0);
  const wins = recent.filter((trade) => trade.realizedPnl > 0).length;
  const losses = recent.filter((trade) => trade.realizedPnl < 0).length;
  return <section className={styles.insightCard}><div className={styles.insightHead}><div><strong>Recent PnL</strong><small>Last {recent.length} completed positions</small></div><b className={total >= 0 ? styles.positive : styles.negative}>{money(total)}</b></div><div className={styles.recentBody}><div className={styles.recentBars}>{recent.map((trade) => { const height = Math.max(3, Math.abs(trade.realizedPnl) / maxAbs * 38); return <div className={styles.recentBarSlot} key={trade.tradeId} title={`${trade.pair}: ${money(trade.realizedPnl)}`}><div className={`${styles.recentBar} ${trade.realizedPnl >= 0 ? styles.recentPositive : styles.recentNegative}`} style={{ height }} /></div>; })}</div><div className={styles.recentFoot}><span>Older</span><b>{wins}W · {losses}L</b><span>Latest</span></div></div></section>;
}

function HistoryRail({ trade }: { trade: HistoryTrade }) {
  const avg = finite(trade.averagePrice || trade.entryPrice);
  const exit = finite(trade.exitPrice, avg);
  const sl = trade.stopEnabled && trade.stopPct > 0 && avg > 0 ? avg * (1 - trade.stopPct / 100) : null;
  const tp = trade.takeProfitPct > 0 && avg > 0 ? avg * (1 + trade.takeProfitPct / 100) : null;
  const values = [avg, exit, sl, tp].filter((value): value is number => value != null && value > 0);
  const anchor = avg || exit || 1;
  let low = values.length ? Math.min(...values) : anchor * .98;
  let high = values.length ? Math.max(...values) : anchor * 1.02;
  if (!(high > low)) { low = anchor * .99; high = anchor * 1.01; }
  const span = Math.max(high - low, anchor * .003, 1e-12); low -= span * .12; high += span * .12;
  const x = (value: number) => Math.max(3, Math.min(97, (value - low) / (high - low) * 100));
  const avgX = x(avg || anchor), exitX = x(exit || anchor), start = Math.min(avgX, exitX), width = Math.max(.7, Math.abs(exitX - avgX));
  const outcomeClass = trade.realizedPnl > .005 ? styles.railPositive : trade.realizedPnl < -.005 ? styles.railNegative : styles.railFlat;
  return <div className={styles.railWrap} aria-label={`Average ${price(avg)}, exit ${price(exit)}`}><div className={styles.railTrack} /><div className={`${styles.railMove} ${outcomeClass}`} style={{ left: `${start}%`, width: `${width}%` }} />{sl != null && <div className={`${styles.railLevel} ${styles.railTop}`} style={{ left: `${x(sl)}%` }}><span>SL</span></div>}<div className={`${styles.railLevel} ${styles.railBottom}`} style={{ left: `${avgX}%` }}><span>AVG</span></div>{tp != null && <div className={`${styles.railLevel} ${styles.railTop}`} style={{ left: `${x(tp)}%` }}><span>TP</span></div>}<div className={`${styles.exitMarker} ${outcomeClass}`} style={{ left: `${exitX}%` }}><i /><span>EXIT</span></div><div className={styles.railPrices}><span>AVG {price(avg)}</span><span>EXIT {price(exit)}</span></div></div>;
}

function HistoryRow({ trade, onOpenChart }: { trade: HistoryTrade; onOpenChart: (trade: HistoryTrade) => void }) {
  return <article className={styles.tradeRow} role="button" tabIndex={0} aria-label={`Open ${trade.pair} TV chart`} onClick={() => onOpenChart(trade)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onOpenChart(trade); } }}>
    <div className={styles.tradeTop}><div className={styles.identity}><CoinLogo symbol={trade.pair} size={25} /><div><strong>{trade.pair}</strong><small>{trade.botName || "Manual position"} · {trade.provider}{trade.executionMode ? ` · ${trade.executionMode}` : ""}</small></div></div><HistoryRail trade={trade} /><div className={styles.valueBlock}><span>Invested</span><b>{trade.invested > 0 ? money(trade.invested) : "—"}</b></div><div className={styles.pnlBlock}><span>PnL</span><small className={trade.realizedPnl >= 0 ? styles.positive : styles.negative}>{money(trade.realizedPnl)}</small><strong className={trade.realizedPnl >= 0 ? styles.positive : styles.negative}>{pct(trade.realizedPct)}</strong></div></div>
    <div className={styles.tradeMeta}><div><b>DCA</b><span>Completed: <strong>{trade.averagingFilled}</strong></span><span>Active: <strong>0</strong></span><span>Max: <strong>{trade.maxAveraging}</strong></span></div><div><span>ID: <strong>{trade.publicTradeNo != null ? `#${trade.publicTradeNo}` : "—"}</strong></span><span>Start: <strong>{dateLabel(trade.openedAt)}</strong></span><span>End: <strong>{dateLabel(trade.closedAt)}</strong></span><span>Duration: <strong>{durationLabel(trade.durationMs)}</strong></span></div></div>
  </article>;
}

export default function HistoryApp() {
  const [authReady, setAuthReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedTrade, setSelectedTrade] = useState<HistoryTrade | null>(null);
  const nav = useMemo(() => NAV, []);

  useEffect(() => {
    browserSupabase.auth.getSession().then(({ data: session }) => { setSignedIn(Boolean(session.session)); setAuthReady(true); });
    const { data: listener } = browserSupabase.auth.onAuthStateChange((_event, session) => { setSignedIn(Boolean(session)); setAuthReady(true); });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!signedIn) { setLoading(false); return; }
    let cancelled = false;
    const load = async () => { try { const result = await invokeHistory(); if (cancelled) return; setData(result.payload); setLatencyMs(result.latencyMs); setError(""); } catch (caught) { if (!cancelled) setError(readError(caught, "Unable to load trade history.")); } finally { if (!cancelled) setLoading(false); } };
    setLoading(true); void load();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 30_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [signedIn]);

  if (!authReady) return <div className={base.loading}>Loading secure session…</div>;
  if (!signedIn) return <AuthCard />;

  const summary = data?.summary;
  const rows = (data?.history ?? []).filter((trade) => trade.status !== "Cancelled");
  const reasons = normalizedExitReasons(summary?.reasonCounts ?? {});
  const outcomeParts: DonutPart[] = [
    { label: "Winners", value: summary?.wins ?? 0, color: "#2fbf83" },
    { label: "Losers", value: summary?.losses ?? 0, color: "#b97076" },
    { label: "Breakeven", value: summary?.breakeven ?? 0, color: "#777" },
  ];
  const exitParts: DonutPart[] = [
    { label: "Take Profit", value: reasons["Take Profit"], color: "#2fbf83" },
    { label: "Stop Loss", value: reasons["Stop Loss"], color: "#b97076" },
    { label: "Other", value: reasons.Other, color: "#777" },
    { label: "Manual", value: reasons.Manual, color: "#e1b558" },
  ];

  const content = loading ? <div className={base.loading}>Reading persisted trade history…</div> : error ? <div className={base.error}>{error}</div> : !summary ? <div className={base.error}>History data is unavailable.</div> : <>
    <div className={styles.insightGrid}><DonutCard title="Outcome Mix" subtitle="Realized position outcomes" headline={`${summary.winRate.toFixed(1)}% win rate`} center={String(summary.closedCount)} centerLabel="closed" parts={outcomeParts} /><DonutCard title="Exit Reasons" subtitle="How positions were resolved" headline={`${exitParts.filter((part) => part.value > 0).length} types`} center={String(summary.closedCount)} centerLabel="exits" parts={exitParts} /><RecentPnlCard trades={rows} /></div>
    {rows.length ? <div className={styles.historyList}>{rows.map((trade) => <HistoryRow key={trade.tradeId} trade={trade} onOpenChart={setSelectedTrade} />)}</div> : <div className={styles.empty}>No closed positions yet.</div>}
    {data?.truncated && <div className={styles.truncated}>Showing the latest {rows.length} of {data.totalRows ?? rows.length} persisted history records.</div>}
  </>;

  return <div className={base.page}>
    <aside className={base.sidebar}><Link href="/" className={base.brand}><span className={base.mark} /><span className={base.brandText}><strong>LabNarrative</strong><span>Trading</span></span></Link><nav className={base.nav}>{nav.map(([href, label]) => <Link href={href} key={href} className={href === "/history" ? base.active : undefined}>{label}</Link>)}</nav><div className={base.legacy}><a href="https://platform.labnarrative.com/trader">Open current Trader</a></div></aside>
    <main className={`${base.main} ${styles.main}`}><header className={`${base.topbar} ${styles.topbar}`}><div><div className={base.eyebrow}>HISTORY</div><h1 className={base.title}>History</h1></div><div className={base.topActions}>{summary && <div className={base.status}><span className={base.dot} />{summary.closedCount} closed · {ageLabel(data?.ageMs)}{latencyMs != null ? ` · ${latencyMs} ms` : ""}</div>}<button className={base.ghostButton} onClick={() => browserSupabase.auth.signOut()}>Sign out</button></div></header>{content}</main>
    {selectedTrade && data?.accountId && <DcaTradeChartV2Workstation accountId={data.accountId} tradeId={selectedTrade.clientId || selectedTrade.tradeId} pair={selectedTrade.pair} status="Closed" entryPrice={finite(selectedTrade.entryPrice)} averagePrice={finite(selectedTrade.averagePrice || selectedTrade.entryPrice)} createdAt={selectedTrade.openedAt || selectedTrade.closedAt || new Date().toISOString()} closedAt={selectedTrade.closedAt || undefined} exitPrice={finite(selectedTrade.exitPrice)} closeReason={selectedTrade.closeReason} takeProfitPrice={selectedTrade.takeProfitPct > 0 && selectedTrade.averagePrice > 0 ? selectedTrade.averagePrice * (1 + selectedTrade.takeProfitPct / 100) : null} stopLossPrice={selectedTrade.stopEnabled && selectedTrade.stopPct > 0 && selectedTrade.averagePrice > 0 ? selectedTrade.averagePrice * (1 - selectedTrade.stopPct / 100) : null} onClose={() => setSelectedTrade(null)} />}
  </div>;
}
