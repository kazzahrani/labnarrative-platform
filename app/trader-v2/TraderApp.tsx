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
type ReadResponse = { ok?: boolean; ready?: boolean; ageMs?: number; portfolio?: Portfolio; error?: string; message?: string };

const NAV: Array<{ view: View; href: string; label: string; migrated: boolean }> = [
  { view: "overview", href: "/", label: "Overview", migrated: true },
  { view: "portfolio", href: "/portfolio", label: "Portfolio", migrated: true },
  { view: "positions", href: "/positions", label: "Positions", migrated: false },
  { view: "automations", href: "/automations", label: "Automations", migrated: false },
  { view: "signal-monitor", href: "/signal-monitor", label: "Signal Monitor", migrated: false },
  { view: "analytics", href: "/analytics", label: "Analytics", migrated: false },
  { view: "history", href: "/history", label: "History", migrated: false },
  { view: "connections", href: "/connections", label: "Connections", migrated: false },
];

function money(value: unknown) {
  const number = Number(value ?? 0);
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(Number.isFinite(number) ? number : 0);
}
function number(value: unknown, digits = 8) {
  const parsed = Number(value ?? 0);
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(Number.isFinite(parsed) ? parsed : 0);
}
function ageLabel(ms: number | undefined) {
  if (ms == null) return "—";
  if (ms < 1500) return "just now";
  if (ms < 60_000) return `${Math.round(ms / 1000)}s ago`;
  return `${Math.round(ms / 60_000)}m ago`;
}
function titleFor(view: View) {
  return NAV.find((item) => item.view === view)?.label ?? "Trader";
}

async function invokeRead() {
  const started = performance.now();
  const { data, error } = await browserSupabase.functions.invoke("trader-v2-portfolio-read", { body: { includeHistory: false } });
  if (error) {
    let message = error.message || "trader_v2_portfolio_read_failed";
    const context = (error as { context?: Response }).context;
    if (context) {
      try {
        const body = await context.clone().json() as { error?: string };
        if (body.error) message = body.error;
      } catch {}
    }
    throw new Error(message);
  }
  const payload = (data ?? {}) as ReadResponse;
  if (payload.error || payload.ok !== true) throw new Error(payload.error || "trader_v2_portfolio_read_failed");
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
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to send verification code."); }
    finally { setBusy(false); }
  };
  const verify = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      const { error: verifyError } = await browserSupabase.auth.verifyOtp({ email: email.trim().toLowerCase(), token: code.trim(), type: "email" });
      if (verifyError) throw verifyError;
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to verify code."); }
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
    <section className={styles.hero}>
      <div className={styles.heroLabel}>Total portfolio equity</div>
      <div className={styles.heroValue}>{money(portfolio.accounting_total_usd)}</div>
      <div className={styles.heroMeta}><span>{portfolio.fresh_provider_count}/{portfolio.connected_provider_count} exchanges fresh</span><span>Updated {ageLabel(ageMs)}</span>{latencyMs != null && <span>Read {latencyMs} ms</span>}</div>
    </section>
    <div className={styles.cards}>
      <section className={styles.card}><div className={styles.cardLabel}>Cash</div><div className={styles.cardValue}>{money(portfolio.cash_usd)}</div></section>
      <section className={styles.card}><div className={styles.cardLabel}>Holdings</div><div className={styles.cardValue}>{money(portfolio.holdings_usd)}</div></section>
      <section className={styles.card}><div className={styles.cardLabel}>In transit</div><div className={styles.cardValue}>{money(portfolio.in_transit_usd)}</div></section>
    </div>
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

export default function TraderApp({ view }: { view: View }) {
  const [authReady, setAuthReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [data, setData] = useState<ReadResponse | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const migrated = view === "overview" || view === "portfolio";

  useEffect(() => {
    browserSupabase.auth.getSession().then(({ data: session }) => { setSignedIn(Boolean(session.session)); setAuthReady(true); });
    const { data: listener } = browserSupabase.auth.onAuthStateChange((_event, session) => { setSignedIn(Boolean(session)); setAuthReady(true); });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!signedIn || !migrated) { setLoading(false); return; }
    let cancelled = false;
    const load = async () => {
      try {
        const result = await invokeRead();
        if (cancelled) return;
        setData(result.payload); setLatencyMs(result.latencyMs); setError("");
      } catch (caught) { if (!cancelled) setError(caught instanceof Error ? caught.message : "Unable to load portfolio."); }
      finally { if (!cancelled) setLoading(false); }
    };
    void load();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 15_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [signedIn, migrated]);

  const portfolio = data?.portfolio;
  const nav = useMemo(() => NAV, []);
  if (!authReady) return <div className={styles.loading}>Loading secure session…</div>;
  if (!signedIn) return <AuthCard />;

  return <div className={styles.page}>
    <aside className={styles.sidebar}>
      <Link href="/" className={styles.brand}><span className={styles.mark} /><span className={styles.brandText}><strong>LabNarrative</strong><span>Trading</span></span></Link>
      <nav className={styles.nav}>{nav.map((item) => <Link href={item.href} key={item.view} className={view === item.view ? styles.active : undefined}>{item.label}</Link>)}</nav>
      <div className={styles.legacy}><a href="https://platform.labnarrative.com/trader">Open current Trader</a></div>
    </aside>
    <main className={styles.main}>
      <header className={styles.topbar}><div><div className={styles.eyebrow}>Core V2</div><h1 className={styles.title}>{titleFor(view)}</h1></div><div className={styles.topActions}>{migrated && portfolio && <div className={styles.status}><span className={portfolio.stale_provider_count === 0 ? styles.dot : `${styles.dot} ${styles.dotWarn}`} />{portfolio.stale_provider_count === 0 ? "All exchanges fresh" : `${portfolio.stale_provider_count} stale`}</div>}<button className={styles.ghostButton} onClick={() => browserSupabase.auth.signOut()}>Sign out</button></div></header>
      {!migrated ? <section className={styles.bridge}><div className={styles.eyebrow}>Migration in progress</div><h2>{titleFor(view)} is still running on Core V1</h2><p>This route is reserved in the new app architecture. We are moving sections one at a time so the existing live trading system stays operational while Core V2 is validated.</p><a href="https://platform.labnarrative.com/trader">Open current {titleFor(view)}</a></section> : loading ? <div className={styles.loading}>Reading portfolio snapshot…</div> : error ? <div className={styles.error}>{error}</div> : data?.ready === false ? <section className={styles.bridge}><h2>Portfolio snapshot pending</h2><p>Connect an exchange first, then Core V2 will build the fast read model automatically.</p><Link href="/connections">Go to Connections</Link></section> : portfolio ? (view === "portfolio" ? <PortfolioView portfolio={portfolio} /> : <Overview portfolio={portfolio} ageMs={data?.ageMs} latencyMs={latencyMs} />) : <div className={styles.error}>Portfolio data is unavailable.</div>}
    </main>
  </div>;
}
