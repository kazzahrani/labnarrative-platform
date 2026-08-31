"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { browserSupabase } from "../../lib/supabase-browser";
import styles from "./trader-app.module.css";

type View = "overview" | "portfolio" | "positions" | "automations" | "signal-monitor" | "analytics" | "history" | "connections";
type ProviderTotal = { provider: string; totalUsd: number; cashUsd: number; assetCount: number; sourceAt: string | null; fresh: boolean; syncDurationMs?: number | null; syncError?: string | null };
type AssetProvider = { provider: string; total: number; free: number; locked: number; usdValue: number };
type AssetTotal = { asset: string; total: number; usdValue: number; priceUsd: number | null; priced: boolean; providers: AssetProvider[] };
type Portfolio = {
  captured_at: string;
  exchange_total_usd: number;
  in_transit_usd: number;
  accounting_total_usd: number;
  cash_usd: number;
  holdings_usd: number;
  connected_provider_count: number;
  fresh_provider_count: number;
  stale_provider_count: number;
  unsupported_provider_count: number;
  unpriced_asset_count: number;
  provider_totals: ProviderTotal[];
  asset_totals: AssetTotal[];
  in_transit_items: unknown[];
  sync_state?: { unsupportedProviders?: string[]; unpricedAssets?: string[] };
};
type PortfolioReadResponse = { ok?: boolean; ready?: boolean; ageMs?: number; portfolio?: Portfolio; error?: string; message?: string };
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
type PositionsSummary = { count: number; costBasis: number; marketValue: number; unrealizedPnl: number; providerCounts: Record<string, number> };
type PositionsReadResponse = { ok?: boolean; ready?: boolean; ageMs?: number; summary?: PositionsSummary; positions?: Position[]; error?: string };
type Connection = {
  provider: string;
  environment: string;
  status: string;
  apiKeyLast4: string | null;
  permissionRead: boolean;
  permissionTrade: boolean;
  permissionWithdraw: boolean;
  permissionInternalTransfer: boolean | null;
  ipRestricted: boolean | null;
  lastVerifiedAt: string | null;
  verificationAgeMs: number | null;
  lastError: string | null;
  coreV2Supported: boolean;
  portfolioFresh: boolean | null;
  portfolioTotalUsd: number | null;
  portfolioAssetCount: number | null;
  portfolioSourceAt: string | null;
};
type ConnectionsReadResponse = {
  ok?: boolean;
  ready?: boolean;
  account?: { id: string; name: string; mode: string };
  portfolioCapturedAt?: string | null;
  summary?: { connectedCount: number; coreV2SupportedCount: number; freshPortfolioCount: number };
  connections?: Connection[];
  error?: string;
};

const NAV: Array<{ view: View; href: string; label: string; migrated: boolean }> = [
  { view: "overview", href: "/", label: "Overview", migrated: true },
  { view: "portfolio", href: "/portfolio", label: "Portfolio", migrated: true },
  { view: "positions", href: "/positions", label: "Positions", migrated: true },
  { view: "automations", href: "/automations", label: "Automations", migrated: false },
  { view: "signal-monitor", href: "/signal-monitor", label: "Signal Monitor", migrated: false },
  { view: "analytics", href: "/analytics", label: "Analytics", migrated: false },
  { view: "history", href: "/history", label: "History", migrated: false },
  { view: "connections", href: "/connections", label: "Connections", migrated: true },
];

function money(value: unknown) {
  const parsed = Number(value ?? 0);
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(Number.isFinite(parsed) ? parsed : 0);
}
function number(value: unknown, digits = 8) {
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
function titleFor(view: View) { return NAV.find((item) => item.view === view)?.label ?? "Trader"; }
function readError(error: unknown, fallback: string) { return error instanceof Error ? error.message || fallback : fallback; }
async function invokeFunction<T>(name: string, body: Record<string, unknown> = {}) {
  const started = performance.now();
  const { data, error } = await browserSupabase.functions.invoke(name, { body });
  if (error) {
    let message = error.message || `${name}_failed`;
    const context = (error as { context?: Response }).context;
    if (context) {
      try {
        const responseBody = await context.clone().json() as { error?: string };
        if (responseBody.error) message = responseBody.error;
      } catch {}
    }
    throw new Error(message);
  }
  const payload = (data ?? {}) as T & { ok?: boolean; error?: string };
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

function Overview({ portfolio, ageMs, latencyMs }: { portfolio: Portfolio; ageMs?: number; latencyMs: number | null }) {
  const unsupported = portfolio.sync_state?.unsupportedProviders ?? [];
  return <>
    {unsupported.length > 0 && <div className={styles.warning}>{unsupported.join(", ")} {unsupported.length === 1 ? "is" : "are"} connected but not yet supported by Core V2. Supported exchanges continue updating independently.</div>}
    <section className={styles.hero}><div className={styles.heroLabel}>Total portfolio equity</div><div className={styles.heroValue}>{money(portfolio.accounting_total_usd)}</div><div className={styles.heroMeta}><span>{portfolio.fresh_provider_count}/{portfolio.connected_provider_count} exchanges fresh</span><span>Updated {ageLabel(ageMs)}</span>{latencyMs != null && <span>Read {latencyMs} ms</span>}</div></section>
    <div className={styles.cards}><section className={styles.card}><div className={styles.cardLabel}>Cash</div><div className={styles.cardValue}>{money(portfolio.cash_usd)}</div></section><section className={styles.card}><div className={styles.cardLabel}>Holdings</div><div className={styles.cardValue}>{money(portfolio.holdings_usd)}</div></section><section className={styles.card}><div className={styles.cardLabel}>In transit</div><div className={styles.cardValue}>{money(portfolio.in_transit_usd)}</div></section></div>
    <section className={styles.panel}><div className={styles.panelHeader}><h2>Exchange health</h2><span>Independent background sync</span></div><div className={styles.providerGrid}>{portfolio.provider_totals.map((provider) => <article className={styles.provider} key={provider.provider}><div className={styles.providerTop}><span className={styles.providerName}>{provider.provider}</span><span className={provider.fresh ? styles.health : styles.healthWarn}>{provider.fresh ? "Fresh" : "Using last good snapshot"}</span></div><div className={styles.providerValue}>{money(provider.totalUsd)}</div><div className={styles.providerMeta}>{provider.assetCount} assets · cash {money(provider.cashUsd)}{provider.syncDurationMs != null ? ` · sync ${provider.syncDurationMs} ms` : ""}</div></article>)}</div></section>
  </>;
}

function PortfolioView({ portfolio }: { portfolio: Portfolio }) {
  const unpriced = portfolio.sync_state?.unpricedAssets ?? [];
  return <>
    {unpriced.length > 0 && <div className={styles.warning}>{unpriced.length} tiny asset{unpriced.length === 1 ? "" : "s"} currently lack a USDT price ({unpriced.join(", ")}). They are shown but excluded from USD totals until priced.</div>}
    <section className={styles.hero}><div className={styles.heroLabel}>Transfer-aware portfolio</div><div className={styles.heroValue}>{money(portfolio.accounting_total_usd)}</div><div className={styles.heroMeta}><span>Exchange assets {money(portfolio.exchange_total_usd)}</span><span>In transit {money(portfolio.in_transit_usd)}</span><span>{portfolio.connected_provider_count} connected exchanges</span></div></section>
    <section className={styles.panel}><div className={styles.panelHeader}><h2>By exchange</h2><span>Latest successful balance images</span></div><div className={styles.providerGrid}>{portfolio.provider_totals.map((provider) => <article className={styles.provider} key={provider.provider}><div className={styles.providerTop}><span className={styles.providerName}>{provider.provider}</span><span className={provider.fresh ? styles.health : styles.healthWarn}>{provider.fresh ? "Fresh" : "Stale"}</span></div><div className={styles.providerValue}>{money(provider.totalUsd)}</div><div className={styles.providerMeta}>Cash {money(provider.cashUsd)} · {provider.assetCount} assets</div></article>)}</div></section>
    <section className={styles.panel}><div className={styles.panelHeader}><h2>Assets</h2><span>{portfolio.asset_totals.length} assets</span></div><div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Asset</th><th>Amount</th><th>Price</th><th>Value</th><th>Exchanges</th></tr></thead><tbody>{portfolio.asset_totals.map((asset) => <tr key={asset.asset}><td>{asset.asset}</td><td>{number(asset.total)}</td><td>{asset.priced ? money(asset.priceUsd) : <span className={styles.muted}>Unpriced</span>}</td><td>{asset.priced ? money(asset.usdValue) : "—"}</td><td>{asset.providers.map((provider) => provider.provider).join(", ")}</td></tr>)}</tbody></table></div></section>
  </>;
}

function PositionsView({ response, latencyMs }: { response: PositionsReadResponse; latencyMs: number | null }) {
  const positions = response.positions ?? [];
  const summary = response.summary ?? { count: positions.length, costBasis: 0, marketValue: 0, unrealizedPnl: 0, providerCounts: {} };
  return <>
    <section className={styles.hero}><div className={styles.heroLabel}>Open position value</div><div className={styles.heroValue}>{money(summary.marketValue)}</div><div className={styles.heroMeta}><span>{summary.count} open position{summary.count === 1 ? "" : "s"}</span><span>Cost basis {money(summary.costBasis)}</span><span>Updated {ageLabel(response.ageMs)}</span>{latencyMs != null && <span>Read {latencyMs} ms</span>}</div></section>
    <div className={styles.cards}><section className={styles.card}><div className={styles.cardLabel}>Open positions</div><div className={styles.cardValue}>{summary.count}</div></section><section className={styles.card}><div className={styles.cardLabel}>Market value</div><div className={styles.cardValue}>{money(summary.marketValue)}</div></section><section className={styles.card}><div className={styles.cardLabel}>Unrealized P&amp;L</div><div className={`${styles.cardValue} ${summary.unrealizedPnl >= 0 ? styles.positive : styles.negative}`}>{money(summary.unrealizedPnl)}</div></section></div>
    <section className={styles.panel}><div className={styles.panelHeader}><h2>Active positions</h2><span>Normalized Core V2 state · read only</span></div>{positions.length === 0 ? <div className={styles.empty}>No active positions.</div> : <div className={styles.tableWrap}><table className={`${styles.table} ${styles.positionsTable}`}><thead><tr><th>#</th><th>Pair</th><th>Exchange</th><th>Bot</th><th>Entry</th><th>Last</th><th>Value</th><th>P&amp;L</th><th>SL</th><th>TP</th><th>DCA</th></tr></thead><tbody>{positions.map((position) => {
      const targets = Array.isArray(position.take_profit_targets) ? position.take_profit_targets : [];
      const targetLabel = targets.length > 0 ? targets.map((target) => `${number(target.profitPct, 2)}%`).join(" / ") : "Off";
      return <tr key={position.trade_id}><td>{position.public_trade_no ?? "—"}</td><td><strong>{position.pair}</strong></td><td><span className={styles.exchange}>{position.provider}</span></td><td className={styles.botCell}>{position.bot_name || "—"}</td><td>{money(position.average_price)}</td><td>{money(position.last_price)}</td><td>{money(position.market_value)}</td><td><span className={Number(position.unrealized_pnl) >= 0 ? styles.positive : styles.negative}>{money(position.unrealized_pnl)}<small>{pct(position.unrealized_pct)}</small></span></td><td>{position.stop_enabled ? `${number(position.stop_pct, 2)}%` : <span className={styles.muted}>Off</span>}</td><td>{targetLabel}</td><td>{position.completed_dca_orders}/{position.max_dca_orders}{position.active_dca_orders > 0 ? ` · ${position.active_dca_orders} active` : ""}</td></tr>;
    })}</tbody></table></div>}</section>
  </>;
}

function ConnectionsView({ response, latencyMs }: { response: ConnectionsReadResponse; latencyMs: number | null }) {
  const connections = response.connections ?? [];
  const summary = response.summary ?? { connectedCount: connections.length, coreV2SupportedCount: 0, freshPortfolioCount: 0 };
  return <>
    <section className={styles.hero}><div className={styles.heroLabel}>Connected exchanges</div><div className={styles.heroValue}>{summary.connectedCount}</div><div className={styles.heroMeta}><span>{summary.coreV2SupportedCount} Core V2 supported</span><span>{summary.freshPortfolioCount} portfolio feeds fresh</span>{latencyMs != null && <span>Read {latencyMs} ms</span>}</div></section>
    <div className={styles.cards}><section className={styles.card}><div className={styles.cardLabel}>Connected</div><div className={styles.cardValue}>{summary.connectedCount}</div></section><section className={styles.card}><div className={styles.cardLabel}>Core V2 supported</div><div className={styles.cardValue}>{summary.coreV2SupportedCount}</div></section><section className={styles.card}><div className={styles.cardLabel}>Fresh balance feeds</div><div className={styles.cardValue}>{summary.freshPortfolioCount}</div></section></div>
    <section className={styles.panel}><div className={styles.panelHeader}><h2>Exchange connections</h2><span>Credential-safe metadata only</span></div><div className={styles.connectionGrid}>{connections.map((connection) => <article className={styles.connectionCard} key={connection.provider}>
      <div className={styles.connectionTop}><div><strong className={styles.providerName}>{connection.provider}</strong><div className={styles.providerMeta}>{connection.environment} · key ••••{connection.apiKeyLast4 || "—"}</div></div><div className={styles.connectionBadges}><span className={connection.status === "connected" ? styles.badgeGood : styles.badgeWarn}>{connection.status}</span><span className={connection.coreV2Supported ? styles.badgeNeutral : styles.badgeWarn}>{connection.coreV2Supported ? "Core V2" : "Not yet supported"}</span></div></div>
      <div className={styles.connectionRows}><div><span>Permissions</span><strong>Read {connection.permissionRead ? "✓" : "—"} · Trade {connection.permissionTrade ? "✓" : "—"} · Withdraw {connection.permissionWithdraw ? "✓" : "Off"}</strong></div><div><span>IP restriction</span><strong>{connection.ipRestricted == null ? "Unknown" : connection.ipRestricted ? "On" : "Off"}</strong></div><div><span>Verified</span><strong>{ageLabel(connection.verificationAgeMs ?? undefined)}</strong></div><div><span>Portfolio feed</span><strong>{!connection.coreV2Supported ? "Not supported" : connection.portfolioFresh === true ? `Fresh · ${connection.portfolioAssetCount ?? 0} assets` : connection.portfolioFresh === false ? "Using last good snapshot" : "Pending"}</strong></div>{connection.coreV2Supported && connection.portfolioTotalUsd != null && <div><span>Current value</span><strong>{money(connection.portfolioTotalUsd)}</strong></div>}{connection.lastError && <div><span>Last verification error</span><strong className={styles.negative}>{connection.lastError}</strong></div>}</div>
    </article>)}</div></section>
    <section className={styles.connectionManage}><div><div className={styles.eyebrow}>Credential changes</div><h2>Connection writes stay on the current Trader for now</h2><p>The V2 page intentionally does not expose API-secret write controls until the existing verification and vault workflow is migrated and validated separately.</p></div><a href="https://platform.labnarrative.com/trader">Manage connections in current Trader</a></section>
  </>;
}

export default function TraderApp({ view }: { view: View }) {
  const [authReady, setAuthReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [portfolioData, setPortfolioData] = useState<PortfolioReadResponse | null>(null);
  const [positionsData, setPositionsData] = useState<PositionsReadResponse | null>(null);
  const [connectionsData, setConnectionsData] = useState<ConnectionsReadResponse | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const migrated = view === "overview" || view === "portfolio" || view === "positions" || view === "connections";

  useEffect(() => {
    browserSupabase.auth.getSession().then(({ data: session }) => { setSignedIn(Boolean(session.session)); setAuthReady(true); });
    const { data: listener } = browserSupabase.auth.onAuthStateChange((_event, session) => { setSignedIn(Boolean(session)); setAuthReady(true); });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!signedIn || !migrated) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    const load = async () => {
      try {
        if (view === "positions") {
          const result = await invokeFunction<PositionsReadResponse>("trader-v2-positions-read");
          if (cancelled) return;
          setPositionsData(result.payload); setLatencyMs(result.latencyMs); setError("");
        } else if (view === "connections") {
          const result = await invokeFunction<ConnectionsReadResponse>("trader-v2-connections-read");
          if (cancelled) return;
          setConnectionsData(result.payload); setLatencyMs(result.latencyMs); setError("");
        } else {
          const result = await invokeFunction<PortfolioReadResponse>("trader-v2-portfolio-read", { includeHistory: false });
          if (cancelled) return;
          setPortfolioData(result.payload); setLatencyMs(result.latencyMs); setError("");
        }
      } catch (caught) {
        const fallback = view === "positions" ? "Unable to load positions." : view === "connections" ? "Unable to load connections." : "Unable to load portfolio.";
        if (!cancelled) setError(readError(caught, fallback));
      } finally { if (!cancelled) setLoading(false); }
    };
    void load();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 15_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [signedIn, migrated, view]);

  const portfolio = portfolioData?.portfolio;
  const nav = useMemo(() => NAV, []);
  if (!authReady) return <div className={styles.loading}>Loading secure session…</div>;
  if (!signedIn) return <AuthCard />;

  const loadingLabel = view === "positions" ? "Reading normalized positions…" : view === "connections" ? "Reading connection health…" : "Reading portfolio snapshot…";
  let content;
  if (!migrated) content = <section className={styles.bridge}><div className={styles.eyebrow}>Migration in progress</div><h2>{titleFor(view)} is still running on Core V1</h2><p>This route is reserved in the new app architecture. We are moving sections one at a time so the existing live trading system stays operational while Core V2 is validated.</p><a href="https://platform.labnarrative.com/trader">Open current {titleFor(view)}</a></section>;
  else if (loading) content = <div className={styles.loading}>{loadingLabel}</div>;
  else if (error) content = <div className={styles.error}>{error}</div>;
  else if (view === "positions") content = positionsData?.ready === false ? <section className={styles.bridge}><h2>Positions model pending</h2><p>Core V2 is waiting for the normalized position model.</p></section> : positionsData ? <PositionsView response={positionsData} latencyMs={latencyMs} /> : <div className={styles.error}>Position data is unavailable.</div>;
  else if (view === "connections") content = connectionsData ? <ConnectionsView response={connectionsData} latencyMs={latencyMs} /> : <div className={styles.error}>Connection data is unavailable.</div>;
  else if (portfolioData?.ready === false) content = <section className={styles.bridge}><h2>Portfolio snapshot pending</h2><p>Connect an exchange first, then Core V2 will build the fast read model automatically.</p><Link href="/connections">Go to Connections</Link></section>;
  else content = portfolio ? (view === "portfolio" ? <PortfolioView portfolio={portfolio} /> : <Overview portfolio={portfolio} ageMs={portfolioData?.ageMs} latencyMs={latencyMs} />) : <div className={styles.error}>Portfolio data is unavailable.</div>;

  return <div className={styles.page}>
    <aside className={styles.sidebar}><Link href="/" className={styles.brand}><span className={styles.mark} /><span className={styles.brandText}><strong>LabNarrative</strong><span>Trading</span></span></Link><nav className={styles.nav}>{nav.map((item) => <Link href={item.href} key={item.view} className={view === item.view ? styles.active : undefined}>{item.label}</Link>)}</nav><div className={styles.legacy}><a href="https://platform.labnarrative.com/trader">Open current Trader</a></div></aside>
    <main className={styles.main}>
      <header className={styles.topbar}><div><div className={styles.eyebrow}>Core V2</div><h1 className={styles.title}>{titleFor(view)}</h1></div><div className={styles.topActions}>{(view === "overview" || view === "portfolio") && portfolio && <div className={styles.status}><span className={portfolio.stale_provider_count === 0 ? styles.dot : `${styles.dot} ${styles.dotWarn}`} />{portfolio.stale_provider_count === 0 ? "All exchanges fresh" : `${portfolio.stale_provider_count} stale`}</div>}{view === "positions" && positionsData && <div className={styles.status}><span className={styles.dot} />{positionsData.summary?.count ?? 0} active</div>}{view === "connections" && connectionsData && <div className={styles.status}><span className={(connectionsData.summary?.freshPortfolioCount ?? 0) === (connectionsData.summary?.coreV2SupportedCount ?? -1) ? styles.dot : `${styles.dot} ${styles.dotWarn}`} />{connectionsData.summary?.connectedCount ?? 0} connected</div>}<button className={styles.ghostButton} onClick={() => browserSupabase.auth.signOut()}>Sign out</button></div></header>
      {content}
    </main>
  </div>;
}
