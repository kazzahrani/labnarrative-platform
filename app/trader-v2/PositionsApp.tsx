"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { browserSupabase } from "../../lib/supabase-browser";
import CoinLogo from "../trader/CoinLogo";
import base from "./trader-app.module.css";
import styles from "./positions-app.module.css";

type TakeProfitTarget = { profitPct?: number; allocationPct?: number };
type Position = {
  trade_id: string;
  public_trade_no: number | null;
  bot_id: string | null;
  bot_name: string | null;
  pair: string;
  provider: string;
  execution_mode: string | null;
  status: string;
  average_price: number;
  quantity: number;
  remaining_cost_basis: number;
  last_price: number;
  market_value: number;
  unrealized_pnl: number;
  unrealized_pct: number;
  realized_pnl: number;
  completed_dca_orders: number;
  max_dca_orders: number;
  active_dca_limit: number;
  active_dca_orders: number;
  stop_enabled: boolean;
  stop_pct: number;
  take_profit_targets: TakeProfitTarget[] | null;
  take_profit_filled: unknown[] | null;
  exit_strategy_v2: boolean;
  opened_at: string | null;
  updated_at: string | null;
};
type PositionsSummary = {
  count: number;
  costBasis: number;
  marketValue: number;
  unrealizedPnl: number;
  providerCounts: Record<string, number>;
};
type PositionsResponse = {
  ok?: boolean;
  ready?: boolean;
  ageMs?: number;
  summary?: PositionsSummary;
  positions?: Position[];
  error?: string;
};
type AssetProvider = { provider: string; total: number; free: number; locked: number; usdValue: number };
type AssetTotal = { asset: string; total: number; usdValue: number; priceUsd: number | null; priced: boolean; providers: AssetProvider[] };
type Portfolio = {
  cash_usd: number;
  asset_totals: AssetTotal[];
};
type PortfolioResponse = { ok?: boolean; ready?: boolean; portfolio?: Portfolio; error?: string };

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
const PALETTE = ["#6f8cff", "#2fbf83", "#aa78df", "#e1b558", "#55b8c7"];
const CASH_ASSETS = new Set(["USD", "USDT", "USDC", "FDUSD", "BUSD"]);

function finite(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
function money(value: unknown) {
  const parsed = finite(value);
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(parsed);
}
function price(value: unknown) {
  const parsed = finite(value);
  if (!(parsed > 0)) return "—";
  const digits = parsed >= 1000 ? 2 : parsed >= 1 ? 4 : parsed >= 0.01 ? 6 : 8;
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(parsed);
}
function pct(value: unknown) {
  const parsed = finite(value);
  return `${parsed > 0 ? "+" : ""}${parsed.toFixed(2)}%`;
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
  return `${Math.round(ms / 60_000)}m ago`;
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
function lockedCashUsd(portfolio: Portfolio | null) {
  if (!portfolio) return 0;
  return portfolio.asset_totals.reduce((sum, asset) => {
    if (!CASH_ASSETS.has(String(asset.asset || "").toUpperCase())) return sum;
    const totalUnits = Math.max(0, finite(asset.total));
    const lockedUnits = asset.providers.reduce((providerSum, provider) => providerSum + Math.max(0, finite(provider.locked)), 0);
    if (!(totalUnits > 0) || !(asset.usdValue > 0) || !(lockedUnits > 0)) return sum;
    return sum + Math.max(0, asset.usdValue * Math.min(1, lockedUnits / totalUnits));
  }, 0);
}

async function invokeFunction<T extends { ok?: boolean; error?: string }>(name: string, body: Record<string, unknown> = {}) {
  const started = performance.now();
  const { data, error } = await browserSupabase.functions.invoke(name, { body });
  if (error) {
    let message = error.message || `${name}_failed`;
    const context = (error as { context?: Response }).context;
    if (context) {
      try {
        const payload = await context.clone().json() as { error?: string };
        if (payload.error) message = payload.error;
      } catch {}
    }
    throw new Error(message);
  }
  const payload = (data ?? {}) as T;
  if (payload.error || payload.ok !== true) throw new Error(payload.error || `${name}_failed`);
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
  return <main className={base.auth}><section className={base.authCard}>
    <div className={base.brand}><span className={base.mark} /><span className={base.brandText}><strong>LabNarrative</strong><span>Trading</span></span></div>
    <h1>{sent ? "Verify your email" : "Sign in"}</h1>
    <p>{sent ? `Enter the verification code sent to ${email.trim().toLowerCase()}.` : "Access the fast Core V2 trading workspace."}</p>
    <form className={base.form} onSubmit={sent ? verify : send}>
      {!sent ? <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" /></label> : <label>Verification code<input value={code} onChange={(event) => setCode(event.target.value)} inputMode="numeric" autoComplete="one-time-code" /></label>}
      {error && <div className={base.error}>{error}</div>}
      <button className={base.primaryButton} disabled={busy}>{busy ? "Please wait…" : sent ? "Continue" : "Send verification code"}</button>
      {sent && <button type="button" className={base.ghostButton} onClick={() => { setSent(false); setCode(""); setError(""); }}>Use another email</button>}
    </form>
  </section></main>;
}

function LevelRail({ position }: { position: Position }) {
  const avg = finite(position.average_price);
  const now = finite(position.last_price, avg);
  const sl = position.stop_enabled && position.stop_pct > 0 && avg > 0 ? avg * (1 - position.stop_pct / 100) : null;
  const firstTp = (position.take_profit_targets ?? []).map((target) => finite(target.profitPct)).find((value) => value > 0) ?? null;
  const tp = firstTp && avg > 0 ? avg * (1 + firstTp / 100) : null;
  const values = [avg, now, sl, tp].filter((value): value is number => value != null && value > 0);
  const anchor = avg || now || 1;
  let low = values.length ? Math.min(...values) : anchor * .98;
  let high = values.length ? Math.max(...values) : anchor * 1.02;
  if (!(high > low)) { low = anchor * .99; high = anchor * 1.01; }
  const span = Math.max(high - low, anchor * .003, 1e-12);
  low -= span * .12; high += span * .12;
  const x = (value: number) => Math.max(3, Math.min(97, (value - low) / (high - low) * 100));
  const avgX = x(avg || anchor);
  const nowX = x(now || anchor);
  const start = Math.min(avgX, nowX);
  const width = Math.max(.7, Math.abs(nowX - avgX));
  const outcomeClass = position.unrealized_pnl > .005 ? styles.railPositive : position.unrealized_pnl < -.005 ? styles.railNegative : styles.railFlat;
  return <div className={styles.railWrap} aria-label={`Average ${price(avg)}, current ${price(now)}`}>
    <div className={styles.railTrack} />
    <div className={`${styles.railMove} ${outcomeClass}`} style={{ left: `${start}%`, width: `${width}%` }} />
    {sl != null && <div className={`${styles.railLevel} ${styles.railTop}`} style={{ left: `${x(sl)}%` }} title={`Stop loss ${price(sl)}`}><span>SL</span></div>}
    <div className={`${styles.railLevel} ${styles.railBottom}`} style={{ left: `${avgX}%` }} title={`Average ${price(avg)}`}><span>AVG</span></div>
    {tp != null && <div className={`${styles.railLevel} ${styles.railTop}`} style={{ left: `${x(tp)}%` }} title={`Take profit ${price(tp)}`}><span>TP</span></div>}
    <div className={`${styles.nowMarker} ${outcomeClass}`} style={{ left: `${nowX}%` }} title={`Current ${price(now)}`}><i /><span>NOW</span></div>
    <div className={styles.railPrices}><span>AVG {price(avg)}</span><span>NOW {price(now)}</span></div>
  </div>;
}

function PositionRow({ position }: { position: Position }) {
  const live = String(position.execution_mode || "").toLowerCase() === "live";
  const canEditExit = live && position.exit_strategy_v2;
  const editExitPlan = () => {
    if (!canEditExit) return;
    window.dispatchEvent(new CustomEvent("labnarrative:edit-exit-plan", { detail: { tradeId: position.trade_id } }));
  };
  return <article className={styles.positionRow}>
    <div className={styles.positionTop}>
      <div className={styles.identity}>
        <CoinLogo symbol={position.pair} size={25} />
        <div><strong>{position.pair}</strong><small>{position.bot_name || "Manual position"} · {position.provider}{position.execution_mode ? ` · ${position.execution_mode}` : ""}</small></div>
      </div>
      <LevelRail position={position} />
      <div className={styles.valueBlock}><span>Invested</span><b>{money(position.remaining_cost_basis)}</b></div>
      <div className={styles.pnlBlock}><span>PnL</span><small className={position.unrealized_pnl >= 0 ? styles.positive : styles.negative}>{money(position.unrealized_pnl)}</small><strong className={position.unrealized_pnl >= 0 ? styles.positive : styles.negative}>{pct(position.unrealized_pct)}</strong></div>
      <div className={styles.actions}>
        <button type="button" disabled title="Add funds will be enabled only after its Core V2 market-order path is migrated" aria-label="Add funds unavailable">＋</button>
        <button type="button" onClick={editExitPlan} disabled={!canEditExit} title={canEditExit ? "Edit exit plan" : live ? "This position is not yet on Exit Strategy V2" : "Exit-plan editing is only available for live Core V2 positions"} aria-label="Edit exit plan">✎</button>
        <button type="button" disabled title="Close position will be enabled only after its Core V2 market-order path is migrated" aria-label="Close position unavailable">×</button>
      </div>
    </div>
    <div className={styles.positionMeta}>
      <div><b>DCA</b><span>Completed: <strong>{position.completed_dca_orders}</strong></span><span>Active: <strong>{position.active_dca_orders}</strong></span><span>Max: <strong>{position.max_dca_orders}</strong></span>{position.active_dca_limit > 0 && <span>Limit: <strong>{position.active_dca_limit}</strong></span>}</div>
      <div><span>ID: <strong>{position.public_trade_no != null ? `#${position.public_trade_no}` : "—"}</strong></span><span>Start: <strong>{dateLabel(position.opened_at)}</strong></span></div>
    </div>
  </article>;
}

export default function PositionsApp() {
  const [authReady, setAuthReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [positionsData, setPositionsData] = useState<PositionsResponse | null>(null);
  const [portfolioData, setPortfolioData] = useState<PortfolioResponse | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const nav = useMemo(() => NAV, []);

  useEffect(() => {
    browserSupabase.auth.getSession().then(({ data }) => { setSignedIn(Boolean(data.session)); setAuthReady(true); });
    const { data: listener } = browserSupabase.auth.onAuthStateChange((_event, session) => { setSignedIn(Boolean(session)); setAuthReady(true); });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!signedIn) { setLoading(false); return; }
    let cancelled = false;
    const load = async () => {
      try {
        const [positionsResult, portfolioResult] = await Promise.allSettled([
          invokeFunction<PositionsResponse>("trader-v2-positions-read"),
          invokeFunction<PortfolioResponse>("trader-v2-portfolio-read", { includeHistory: false }),
        ]);
        if (cancelled) return;
        if (positionsResult.status === "rejected") throw positionsResult.reason;
        setPositionsData(positionsResult.value.payload);
        setLatencyMs(positionsResult.value.latencyMs);
        if (portfolioResult.status === "fulfilled") setPortfolioData(portfolioResult.value.payload);
        setError("");
      } catch (caught) {
        if (!cancelled) setError(readError(caught, "Unable to load positions."));
      } finally { if (!cancelled) setLoading(false); }
    };
    setLoading(true); void load();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 15_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [signedIn]);

  if (!authReady) return <div className={base.loading}>Loading secure session…</div>;
  if (!signedIn) return <AuthCard />;

  const positions = positionsData?.positions ?? [];
  const summary = positionsData?.summary ?? { count: positions.length, costBasis: 0, marketValue: 0, unrealizedPnl: 0, providerCounts: {} };
  const portfolio = portfolioData?.portfolio ?? null;
  const reserved = lockedCashUsd(portfolio);
  const available = Math.max(0, finite(portfolio?.cash_usd) - reserved);
  const deployed = Math.max(0, finite(summary.costBasis));
  const capitalTotal = available + deployed + reserved;
  const usedPct = capitalTotal > 0 ? (deployed + reserved) / capitalTotal * 100 : 0;
  const capitalParts: DonutPart[] = [
    { label: "Available", value: available, color: PALETTE[0] },
    { label: "Deployed", value: deployed, color: PALETTE[1] },
    { label: "Reserved", value: reserved, color: PALETTE[3] },
  ];
  const pairMap = new Map<string, number>();
  for (const position of positions) pairMap.set(position.pair, (pairMap.get(position.pair) ?? 0) + Math.max(0, finite(position.remaining_cost_basis)));
  const rawPairs = Array.from(pairMap.entries()).sort((a, b) => b[1] - a[1]);
  const pairEntries: DonutPart[] = rawPairs.length <= 5
    ? rawPairs.map(([label, value], index) => ({ label, value, color: PALETTE[index] }))
    : [...rawPairs.slice(0, 4).map(([label, value], index) => ({ label, value, color: PALETTE[index] })), { label: "Other", value: rawPairs.slice(4).reduce((sum, [, value]) => sum + value, 0), color: PALETTE[4] }];
  const epsilon = .005;
  const liveWins = positions.filter((position) => position.unrealized_pnl > epsilon).length;
  const liveLosses = positions.filter((position) => position.unrealized_pnl < -epsilon).length;
  const liveFlat = Math.max(0, positions.length - liveWins - liveLosses);
  const liveParts: DonutPart[] = [
    { label: "In profit", value: liveWins, color: "#2fbf83" },
    { label: "In loss", value: liveLosses, color: "#b97076" },
    { label: "Flat", value: liveFlat, color: "#666b73" },
  ];

  const content = loading && !positionsData ? <div className={base.loading}>Reading persisted positions…</div> : error ? <div className={base.error}>{error}</div> : <>
    <div className={styles.insightGrid}>
      <section className={styles.insightCard}>
        <div className={styles.insightHead}><div><strong>Capital Deployment</strong><small>Where account capital sits now</small></div><b>{usedPct.toFixed(0)}% used</b></div>
        <div className={styles.insightBody}><div className={styles.donut} style={{ background: donutGradient(capitalParts) }}><div><strong>{money(deployed)}</strong><small>deployed</small></div></div><div className={styles.legend}>{capitalParts.map((part) => <div className={styles.legendRow} key={part.label}><i style={{ background: part.color }} /><span>{part.label}</span><b>{money(part.value)}</b></div>)}</div></div>
      </section>
      <section className={styles.insightCard}>
        <div className={styles.insightHead}><div><strong>Market Concentration</strong><small>Capital across open pairs</small></div><b>{pairEntries.length} market{pairEntries.length === 1 ? "" : "s"}</b></div>
        <div className={styles.insightBody}><div className={styles.donut} style={{ background: donutGradient(pairEntries) }}><div><strong>{positions.length}</strong><small>open</small></div></div><div className={styles.legend}>{pairEntries.length ? pairEntries.map((part) => <div className={styles.legendRow} key={part.label}><i style={{ background: part.color }} /><span>{part.label === "Other" ? part.label : part.label.split("/")[0]}</span><b>{deployed > 0 ? `${(part.value / deployed * 100).toFixed(1)}%` : "0.0%"}</b></div>) : <div className={styles.legendEmpty}>No open exposure</div>}</div></div>
      </section>
      <section className={styles.insightCard}>
        <div className={styles.insightHead}><div><strong>Live Outcome Mix</strong><small>Current mark-to-market state</small></div><b className={summary.unrealizedPnl >= 0 ? styles.positive : styles.negative}>{money(summary.unrealizedPnl)}</b></div>
        <div className={styles.insightBody}><div className={styles.donut} style={{ background: donutGradient(liveParts) }}><div><strong>{positions.length}</strong><small>positions</small></div></div><div className={styles.legend}>{liveParts.map((part) => <div className={styles.legendRow} key={part.label}><i style={{ background: part.color }} /><span>{part.label}</span><b>{part.value}</b></div>)}</div></div>
      </section>
    </div>
    <section className={styles.positionsSection}>
      {positions.length === 0 ? <div className={styles.empty}>No open positions.</div> : <div className={styles.positionList}>{positions.map((position) => <PositionRow key={position.trade_id} position={position} />)}</div>}
    </section>
  </>;

  return <div className={base.page}>
    <aside className={base.sidebar}><Link href="/" className={base.brand}><span className={base.mark} /><span className={base.brandText}><strong>LabNarrative</strong><span>Trading</span></span></Link><nav className={base.nav}>{nav.map(([href, label]) => <Link href={href} key={href} className={href === "/positions" ? base.active : undefined}>{label}</Link>)}</nav><div className={base.legacy}><a href="https://platform.labnarrative.com/trader">Open current Trader</a></div></aside>
    <main className={`${base.main} ${styles.main}`}><header className={`${base.topbar} ${styles.topbar}`}><div><div className={base.eyebrow}>Core V2</div><h1 className={base.title}>Positions</h1></div><div className={base.topActions}>{positionsData && <div className={base.status}><span className={base.dot} />{positions.length} open · {ageLabel(positionsData.ageMs)}{latencyMs != null ? ` · ${latencyMs} ms` : ""}</div>}<button className={base.ghostButton} onClick={() => browserSupabase.auth.signOut()}>Sign out</button></div></header>{content}</main>
  </div>;
}
