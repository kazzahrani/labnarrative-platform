"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { browserSupabase } from "../../lib/supabase-browser";
import styles from "./trader-app.module.css";

type Automation = {
  id: string;
  number: number | null;
  name: string;
  status: string;
  type: string;
  provider: string;
  executionMode: string;
  market: string;
  activePositions: number;
  maxActivePositions: number | null;
  baseOrder: number | null;
  safetyOrder: number | null;
  maxSafetyOrders: number;
  activeDcaLimit: number;
  averagingEnabled: boolean;
  orderType: string;
  takeProfitPct: number | null;
  stopEnabled: boolean;
  stopPct: number | null;
  trailingPct: number | null;
  maxHoldEnabled: boolean;
  maxHoldHours: number | null;
  updatedAt: string;
};
type AutomationsResponse = {
  ok?: boolean;
  ready?: boolean;
  account?: { name: string };
  summary?: {
    total: number;
    running: number;
    stopped: number;
    dca: number;
    strategies: number;
    activePositions: number;
    providerCounts: Record<string, number>;
  };
  automations?: Automation[];
  readAt?: string;
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

function number(value: unknown, digits = 2) {
  const parsed = Number(value ?? 0);
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(Number.isFinite(parsed) ? parsed : 0);
}
function money(value: unknown) {
  const parsed = Number(value ?? 0);
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(Number.isFinite(parsed) ? parsed : 0);
}
function dateLabel(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}
function readError(error: unknown, fallback: string) { return error instanceof Error ? error.message || fallback : fallback; }
function activeLabel(automation: Automation) {
  return automation.maxActivePositions == null ? `${automation.activePositions} / unlimited` : `${automation.activePositions} / ${automation.maxActivePositions}`;
}
function dcaLabel(automation: Automation) {
  if (automation.type === "Strategy Execution") return "TradingView managed";
  if (!automation.averagingEnabled || automation.maxSafetyOrders <= 0) return "Off";
  return `${automation.maxSafetyOrders} max · ${automation.activeDcaLimit} active`;
}
function exitLabel(automation: Automation) {
  if (automation.type === "Strategy Execution") return "TradingView managed";
  const parts: string[] = [];
  if (automation.takeProfitPct != null) parts.push(`TP ${number(automation.takeProfitPct)}%`);
  if (automation.stopEnabled && automation.stopPct != null) parts.push(`SL ${number(automation.stopPct)}%`);
  if (automation.trailingPct != null && automation.trailingPct > 0) parts.push(`Trail ${number(automation.trailingPct)}%`);
  return parts.join(" · ") || "—";
}

async function invokeAutomations() {
  const started = performance.now();
  const { data, error } = await browserSupabase.functions.invoke("trader-v2-automations-read", { body: {} });
  if (error) {
    let message = error.message || "trader-v2-automations-read_failed";
    const context = (error as { context?: Response }).context;
    if (context) {
      try {
        const responseBody = await context.clone().json() as { error?: string };
        if (responseBody.error) message = responseBody.error;
      } catch {}
    }
    throw new Error(message);
  }
  const payload = (data ?? {}) as AutomationsResponse;
  if (payload.error || payload.ok !== true) throw new Error(payload.error || "trader-v2-automations-read_failed");
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

export default function AutomationsApp() {
  const [authReady, setAuthReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [data, setData] = useState<AutomationsResponse | null>(null);
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
        const result = await invokeAutomations();
        if (cancelled) return;
        setData(result.payload); setLatencyMs(result.latencyMs); setError("");
      } catch (caught) { if (!cancelled) setError(readError(caught, "Unable to load automations.")); }
      finally { if (!cancelled) setLoading(false); }
    };
    setLoading(true); void load();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 15_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [signedIn]);

  if (!authReady) return <div className={styles.loading}>Loading secure session…</div>;
  if (!signedIn) return <AuthCard />;

  const summary = data?.summary;
  const automations = data?.automations ?? [];
  const providers = Object.entries(summary?.providerCounts ?? {}).sort((a, b) => b[1] - a[1]);
  const content = loading ? <div className={styles.loading}>Reading automation configuration…</div> : error ? <div className={styles.error}>{error}</div> : !summary ? <div className={styles.error}>Automation data is unavailable.</div> : <>
    <section className={styles.hero}><div className={styles.heroLabel}>Real-account automations</div><div className={styles.heroValue}>{summary.total}</div><div className={styles.heroMeta}><span>{summary.dca} DCA</span><span>{summary.strategies} strategy execution</span><span>{summary.activePositions} active positions</span>{latencyMs != null && <span>Read {latencyMs} ms</span>}</div></section>
    <div className={styles.cards}><section className={styles.card}><div className={styles.cardLabel}>Running</div><div className={styles.cardValue}>{summary.running}</div></section><section className={styles.card}><div className={styles.cardLabel}>Stopped</div><div className={styles.cardValue}>{summary.stopped}</div></section><section className={styles.card}><div className={styles.cardLabel}>Active positions</div><div className={styles.cardValue}>{summary.activePositions}</div></section></div>
    <section className={styles.panel}><div className={styles.panelHeader}><h2>Exchange distribution</h2><span>Non-archived automations only</span></div><div className={styles.providerGrid}>{providers.map(([provider, count]) => <article className={styles.provider} key={provider}><div className={styles.providerTop}><span className={styles.providerName}>{provider}</span><span className={styles.health}>{count}</span></div><div className={styles.providerValue}>{count} automation{count === 1 ? "" : "s"}</div><div className={styles.providerMeta}>Real-account configuration</div></article>)}</div></section>
    <section className={styles.panel}><div className={styles.panelHeader}><h2>Automation configuration</h2><span>Database read only · refreshes every 15s</span></div>{automations.length === 0 ? <div className={styles.empty}>No active automation configurations found.</div> : <div className={styles.tableWrap}><table className={`${styles.table} ${styles.positionsTable}`}><thead><tr><th>Automation</th><th>Type</th><th>Exchange</th><th>Market</th><th>Status</th><th>Positions</th><th>Base order</th><th>DCA</th><th>Exit plan</th><th>Updated</th></tr></thead><tbody>{automations.map((automation) => {
      const running = automation.status.toLowerCase() === "running";
      return <tr key={automation.id}><td className={styles.botCell}><strong>{automation.name}</strong>{automation.number != null ? ` · #${automation.number}` : ""}</td><td>{automation.type}</td><td><span className={styles.exchange}>{automation.provider}</span></td><td>{automation.market}</td><td><span className={running ? styles.badgeGood : styles.badgeNeutral}>{automation.status}</span></td><td>{activeLabel(automation)}</td><td>{automation.type === "Strategy Execution" || automation.baseOrder == null ? "—" : money(automation.baseOrder)}</td><td>{dcaLabel(automation)}</td><td>{exitLabel(automation)}</td><td>{dateLabel(automation.updatedAt)}</td></tr>;
    })}</tbody></table></div>}</section>
    <section className={styles.panel}><div className={styles.panelHeader}><h2>Automation controls</h2><span>Kept on the current Trader during Core V2 migration</span></div><div className={styles.empty}>Create, edit, start, stop, archive, and TradingView setup remain on the current Trader so this migration cannot alter live execution behavior. <a href="https://platform.labnarrative.com/trader">Open current Trader →</a></div></section>
  </>;

  return <div className={styles.page}>
    <aside className={styles.sidebar}><Link href="/" className={styles.brand}><span className={styles.mark} /><span className={styles.brandText}><strong>LabNarrative</strong><span>Trading</span></span></Link><nav className={styles.nav}>{nav.map(([href, label]) => <Link href={href} key={href} className={href === "/automations" ? styles.active : undefined}>{label}</Link>)}</nav><div className={styles.legacy}><a href="https://platform.labnarrative.com/trader">Open current Trader</a></div></aside>
    <main className={styles.main}><header className={styles.topbar}><div><div className={styles.eyebrow}>Core V2</div><h1 className={styles.title}>Automations</h1></div><div className={styles.topActions}>{summary && <div className={styles.status}><span className={summary.running > 0 ? styles.dot : `${styles.dot} ${styles.dotWarn}`} />{summary.running > 0 ? `${summary.running} running` : "All stopped"}</div>}<a className={styles.ghostButton} href="https://platform.labnarrative.com/trader">Manage</a><button className={styles.ghostButton} onClick={() => browserSupabase.auth.signOut()}>Sign out</button></div></header>{content}</main>
  </div>;
}
