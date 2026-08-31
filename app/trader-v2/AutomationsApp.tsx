"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { browserSupabase } from "../../lib/supabase-browser";
import styles from "./trader-app.module.css";

type Automation = {
  id: string;
  clientId: string;
  number: number | null;
  name: string;
  status: string;
  type: string;
  provider: string;
  executionMode: string;
  pair: string;
  market: string;
  activePositions: number;
  maxActivePositions: number | null;
  baseOrder: number | null;
  safetyOrder: number | null;
  maxSafetyOrders: number;
  activeDcaLimit: number;
  deviation: number;
  stepScale: number;
  volumeScale: number;
  averagingEnabled: boolean;
  orderType: string;
  takeProfitPct: number | null;
  stopEnabled: boolean;
  stopPct: number | null;
  trailingPct: number | null;
  maxHoldEnabled: boolean;
  maxHoldHours: number | null;
  canManage: boolean;
  updatedAt: string;
};
type AutomationsResponse = {
  ok?: boolean;
  ready?: boolean;
  account?: { id: string; name: string };
  supportedProviders?: string[];
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
type BotForm = {
  name: string;
  provider: string;
  pair: string;
  baseOrder: number;
  safetyOrder: number;
  maxSafetyOrders: number;
  limitSafetyOrders: number;
  maxActiveTrades: number;
  deviation: number;
  stepScale: number;
  volumeScale: number;
  takeProfit: number;
  stopEnabled: boolean;
  stopPct: number;
};

type CommandResponse = {
  ok?: boolean;
  pending?: boolean;
  command?: { id?: string; status?: string; type?: string };
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
const DEFAULT_PROVIDERS = ["binance", "bybit", "okx", "kucoin"];
const DEFAULT_BOT: BotForm = {
  name: "",
  provider: "binance",
  pair: "BTC/USDT",
  baseOrder: 20,
  safetyOrder: 20,
  maxSafetyOrders: 5,
  limitSafetyOrders: 1,
  maxActiveTrades: 1,
  deviation: 1,
  stepScale: 1,
  volumeScale: 1,
  takeProfit: 1.5,
  stopEnabled: false,
  stopPct: 8,
};

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
function formFromAutomation(automation: Automation): BotForm {
  return {
    name: automation.name,
    provider: automation.provider,
    pair: automation.pair || "BTC/USDT",
    baseOrder: automation.baseOrder ?? 20,
    safetyOrder: automation.safetyOrder ?? 20,
    maxSafetyOrders: automation.maxSafetyOrders,
    limitSafetyOrders: automation.activeDcaLimit,
    maxActiveTrades: automation.maxActivePositions ?? 1,
    deviation: automation.deviation || 1,
    stepScale: automation.stepScale || 1,
    volumeScale: automation.volumeScale || 1,
    takeProfit: automation.takeProfitPct ?? 1.5,
    stopEnabled: automation.stopEnabled,
    stopPct: automation.stopPct ?? 8,
  };
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
async function invokeAutomationAction(body: Record<string, unknown>) {
  const idempotencyKey = `app-${String(body.action || "automation")}-${crypto.randomUUID()}`;
  const { data, error } = await browserSupabase.functions.invoke("trader-v2-automation-submit", { body: { ...body, idempotencyKey } });
  if (error) {
    let message = error.message || "automation_command_failed";
    const context = (error as { context?: Response }).context;
    if (context) {
      try {
        const responseBody = await context.clone().json() as { error?: string };
        if (responseBody.error) message = responseBody.error;
      } catch {}
    }
    throw new Error(message);
  }
  const payload = (data ?? {}) as CommandResponse;
  if (payload.error || payload.ok !== true) throw new Error(payload.error || "automation_command_failed");
  return payload;
}
function commandError(message: string) {
  if (message.includes("core_v2_execute_disabled")) return "Automation management is temporarily locked by the Core V2 safety gate.";
  if (message.includes("exchange_connection_required")) return "Connect this exchange before creating a DCA bot.";
  if (message.includes("bot_pair_locked_by_active_trade")) return "The pair cannot change while this bot has an active position.";
  if (message.includes("bot_has_active_trades")) return "This bot cannot be archived while it has active positions.";
  if (message.includes("bot_has_open_orders")) return "This bot cannot be archived while it has open orders.";
  if (message.includes("automation_provider_locked")) return "An existing bot cannot be moved to another exchange. Create a new bot instead.";
  if (message.includes("unsupported_provider")) return "This exchange is not supported by Core V2 automations.";
  if (message.includes("automation_command_pending")) return "The command is queued and will finish automatically.";
  return message;
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editorMode, setEditorMode] = useState<"create" | "edit" | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [botForm, setBotForm] = useState<BotForm>({ ...DEFAULT_BOT });
  const nav = useMemo(() => NAV, []);

  useEffect(() => {
    browserSupabase.auth.getSession().then(({ data: session }) => { setSignedIn(Boolean(session.session)); setAuthReady(true); });
    const { data: listener } = browserSupabase.auth.onAuthStateChange((_event, session) => { setSignedIn(Boolean(session)); setAuthReady(true); });
    return () => listener.subscription.unsubscribe();
  }, []);

  const load = async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const result = await invokeAutomations();
      setData(result.payload); setLatencyMs(result.latencyMs); setError("");
    } catch (caught) { setError(readError(caught, "Unable to load automations.")); }
    finally { if (!quiet) setLoading(false); }
  };

  useEffect(() => {
    if (!signedIn) { setLoading(false); return; }
    let cancelled = false;
    const refresh = async () => { if (!cancelled) await load(true); };
    setLoading(true); void invokeAutomations().then((result) => {
      if (cancelled) return;
      setData(result.payload); setLatencyMs(result.latencyMs); setError(""); setLoading(false);
    }).catch((caught) => { if (!cancelled) { setError(readError(caught, "Unable to load automations.")); setLoading(false); } });
    const timer = window.setInterval(() => { if (document.visibilityState === "visible" && !busy) void refresh(); }, 15_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [signedIn, busy]);

  if (!authReady) return <div className={styles.loading}>Loading secure session…</div>;
  if (!signedIn) return <AuthCard />;

  const summary = data?.summary;
  const automations = data?.automations ?? [];
  const providers = Object.entries(summary?.providerCounts ?? {}).sort((a, b) => b[1] - a[1]);
  const supportedProviders = data?.supportedProviders?.length ? data.supportedProviders : DEFAULT_PROVIDERS;
  const editing = editingId ? automations.find((automation) => automation.id === editingId) ?? null : null;

  const openCreate = () => {
    setBotForm({ ...DEFAULT_BOT, provider: supportedProviders[0] || "binance" });
    setEditingId(null); setEditorMode("create"); setError(""); setNotice("");
  };
  const openEdit = (automation: Automation) => {
    if (!automation.canManage || automation.type !== "DCA") return;
    setBotForm(formFromAutomation(automation)); setEditingId(automation.id); setEditorMode("edit"); setError(""); setNotice("");
  };
  const closeEditor = () => { if (!busy) { setEditorMode(null); setEditingId(null); } };

  const saveBot = async (event: FormEvent) => {
    event.preventDefault();
    if (!data?.account?.id || busy) return;
    if (!botForm.name.trim() || !(botForm.baseOrder > 0) || !(botForm.safetyOrder > 0)) return setError("Add a bot name and valid base/safety order amounts.");
    const isCreate = editorMode === "create";
    if (!isCreate && !editing) return;
    const prompt = isCreate
      ? `Create and start ${botForm.name.trim()} on ${botForm.provider.toUpperCase()}? A running Real DCA bot may open live positions when its entry conditions are met.`
      : `Apply these settings to ${editing?.name}? Existing active positions keep their current trade levels; future entries use the updated bot settings.`;
    if (!window.confirm(prompt)) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await invokeAutomationAction({
        action: isCreate ? "create_bot" : "update_bot",
        accountId: data.account.id,
        automationId: isCreate ? undefined : editing?.id,
        provider: botForm.provider,
        name: botForm.name.trim(), pair: botForm.pair.trim().toUpperCase(),
        baseOrder: botForm.baseOrder, safetyOrder: botForm.safetyOrder,
        maxSafetyOrders: botForm.maxSafetyOrders, limitSafetyOrders: botForm.limitSafetyOrders,
        maxActiveTrades: botForm.maxActiveTrades, deviation: botForm.deviation,
        stepScale: botForm.stepScale, volumeScale: botForm.volumeScale,
        takeProfit: botForm.takeProfit, stopEnabled: botForm.stopEnabled, stopPct: botForm.stopPct,
      });
      setNotice(result.pending ? "Automation command queued and will finish automatically." : isCreate ? "DCA bot created through Core V2." : "Automation settings updated through Core V2.");
      setEditorMode(null); setEditingId(null); await load(true);
    } catch (caught) { setError(commandError(readError(caught, "Unable to save automation."))); }
    finally { setBusy(false); }
  };

  const toggleAutomation = async (automation: Automation) => {
    if (!data?.account?.id || !automation.canManage || busy) return;
    const running = automation.status.toLowerCase() === "running";
    const next = running ? "Stopped" : "Running";
    if (!window.confirm(`${next === "Running" ? "Resume" : "Pause"} ${automation.name}?${next === "Running" ? " A running Real bot may open new live positions." : " Existing positions remain managed by their normal position/exit workers."}`)) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await invokeAutomationAction({ action: "set_bot_status", accountId: data.account.id, automationId: automation.id, status: next });
      setNotice(result.pending ? "Automation command queued." : `${automation.name} ${next === "Running" ? "resumed" : "paused"} through Core V2.`);
      await load(true);
    } catch (caught) { setError(commandError(readError(caught, "Unable to update automation."))); }
    finally { setBusy(false); }
  };

  const archiveAutomation = async (automation: Automation) => {
    if (!data?.account?.id || !automation.canManage || busy) return;
    if (!window.confirm(`Archive ${automation.name}? Its history will remain available. Bots with active positions or open orders cannot be archived.`)) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await invokeAutomationAction({ action: "close_bot", accountId: data.account.id, automationId: automation.id });
      setNotice(result.pending ? "Archive command queued." : `${automation.name} archived through Core V2.`);
      await load(true);
    } catch (caught) { setError(commandError(readError(caught, "Unable to archive automation."))); }
    finally { setBusy(false); }
  };

  const editor = editorMode && <section className={styles.panel}>
    <div className={styles.panelHeader}><h2>{editorMode === "create" ? "New DCA bot" : `Edit ${editing?.name || "DCA bot"}`}</h2><button className={styles.ghostButton} onClick={closeEditor} disabled={busy}>Close</button></div>
    <form className={styles.automationForm} onSubmit={saveBot}>
      <label>Name<input value={botForm.name} onChange={(event) => setBotForm((current) => ({ ...current, name: event.target.value }))} /></label>
      <label>Exchange<select value={botForm.provider} disabled={editorMode === "edit"} onChange={(event) => setBotForm((current) => ({ ...current, provider: event.target.value }))}>{supportedProviders.map((provider) => <option value={provider} key={provider}>{provider.toUpperCase()}</option>)}</select></label>
      <label>Pair<input value={botForm.pair} onChange={(event) => setBotForm((current) => ({ ...current, pair: event.target.value.toUpperCase() }))} placeholder="BTC/USDT" /></label>
      <label>Base order (USDT)<input type="number" min="0.01" step="0.01" value={botForm.baseOrder} onChange={(event) => setBotForm((current) => ({ ...current, baseOrder: Number(event.target.value) }))} /></label>
      <label>Safety order (USDT)<input type="number" min="0.01" step="0.01" value={botForm.safetyOrder} onChange={(event) => setBotForm((current) => ({ ...current, safetyOrder: Number(event.target.value) }))} /></label>
      <label>Max safety orders<input type="number" min="0" max="50" step="1" value={botForm.maxSafetyOrders} onChange={(event) => setBotForm((current) => ({ ...current, maxSafetyOrders: Number(event.target.value) }))} /></label>
      <label>Active safety orders<input type="number" min="0" max={Math.max(0, botForm.maxSafetyOrders)} step="1" value={botForm.limitSafetyOrders} onChange={(event) => setBotForm((current) => ({ ...current, limitSafetyOrders: Number(event.target.value) }))} /></label>
      <label>Max active trades<input type="number" min="1" max="20" step="1" value={botForm.maxActiveTrades} onChange={(event) => setBotForm((current) => ({ ...current, maxActiveTrades: Number(event.target.value) }))} /></label>
      <label>Price deviation (%)<input type="number" min="0.000001" step="0.01" value={botForm.deviation} onChange={(event) => setBotForm((current) => ({ ...current, deviation: Number(event.target.value) }))} /></label>
      <label>Step scale<input type="number" min="0.000001" step="0.01" value={botForm.stepScale} onChange={(event) => setBotForm((current) => ({ ...current, stepScale: Number(event.target.value) }))} /></label>
      <label>Volume scale<input type="number" min="0.000001" step="0.01" value={botForm.volumeScale} onChange={(event) => setBotForm((current) => ({ ...current, volumeScale: Number(event.target.value) }))} /></label>
      <label>Take profit (%)<input type="number" min="0" step="0.01" value={botForm.takeProfit} onChange={(event) => setBotForm((current) => ({ ...current, takeProfit: Number(event.target.value) }))} /></label>
      <label>Stop loss<select value={botForm.stopEnabled ? "On" : "Off"} onChange={(event) => setBotForm((current) => ({ ...current, stopEnabled: event.target.value === "On" }))}><option>Off</option><option>On</option></select></label>
      <label>Stop distance (%)<input type="number" min="0" step="0.01" disabled={!botForm.stopEnabled} value={botForm.stopPct} onChange={(event) => setBotForm((current) => ({ ...current, stopPct: Number(event.target.value) }))} /></label>
      <div className={styles.automationFormActions}><span>{editorMode === "edit" ? `Exchange is locked to ${botForm.provider.toUpperCase()} for an existing bot.` : "New bots start in Running status, matching the current Trader behavior."}</span><button className={styles.primaryButton} disabled={busy}>{busy ? "Saving…" : editorMode === "create" ? "Create DCA bot" : "Save changes"}</button></div>
    </form>
  </section>;

  const content = loading ? <div className={styles.loading}>Reading automation configuration…</div> : error && !data ? <div className={styles.error}>{error}</div> : !summary ? <div className={styles.error}>Automation data is unavailable.</div> : <>
    {error && <div className={styles.error}>{error}</div>}{notice && <div className={styles.notice}>{notice}</div>}
    <section className={styles.hero}><div className={styles.heroLabel}>Real-account automations</div><div className={styles.heroValue}>{summary.total}</div><div className={styles.heroMeta}><span>{summary.dca} DCA</span><span>{summary.strategies} strategy execution</span><span>{summary.activePositions} active positions</span>{latencyMs != null && <span>Read {latencyMs} ms</span>}</div></section>
    <div className={styles.cards}><section className={styles.card}><div className={styles.cardLabel}>Running</div><div className={styles.cardValue}>{summary.running}</div></section><section className={styles.card}><div className={styles.cardLabel}>Stopped</div><div className={styles.cardValue}>{summary.stopped}</div></section><section className={styles.card}><div className={styles.cardLabel}>Active positions</div><div className={styles.cardValue}>{summary.activePositions}</div></section></div>
    {editor}
    <section className={styles.panel}><div className={styles.panelHeader}><h2>Exchange distribution</h2><span>Non-archived automations only</span></div><div className={styles.providerGrid}>{providers.map(([provider, count]) => <article className={styles.provider} key={provider}><div className={styles.providerTop}><span className={styles.providerName}>{provider}</span><span className={styles.health}>{count}</span></div><div className={styles.providerValue}>{count} automation{count === 1 ? "" : "s"}</div><div className={styles.providerMeta}>Real-account configuration</div></article>)}</div></section>
    <section className={styles.panel}><div className={styles.panelHeader}><h2>Automation configuration</h2><span>Core V2 management · refreshes every 15s</span></div>{automations.length === 0 ? <div className={styles.empty}>No active automation configurations found.</div> : <div className={styles.tableWrap}><table className={`${styles.table} ${styles.positionsTable}`}><thead><tr><th>Automation</th><th>Type</th><th>Exchange</th><th>Market</th><th>Status</th><th>Positions</th><th>Base order</th><th>DCA</th><th>Exit plan</th><th>Updated</th><th>Actions</th></tr></thead><tbody>{automations.map((automation) => {
      const running = automation.status.toLowerCase() === "running";
      return <tr key={automation.id}><td className={styles.botCell}><strong>{automation.name}</strong>{automation.number != null ? ` · #${automation.number}` : ""}</td><td>{automation.type}</td><td><span className={styles.exchange}>{automation.provider}</span></td><td>{automation.market}</td><td><span className={running ? styles.badgeGood : styles.badgeNeutral}>{automation.status}</span></td><td>{activeLabel(automation)}</td><td>{automation.type === "Strategy Execution" || automation.baseOrder == null ? "—" : money(automation.baseOrder)}</td><td>{dcaLabel(automation)}</td><td>{exitLabel(automation)}</td><td>{dateLabel(automation.updatedAt)}</td><td><div className={styles.rowActions}>{automation.canManage ? <><button onClick={() => openEdit(automation)} disabled={busy}>Edit</button><button onClick={() => void toggleAutomation(automation)} disabled={busy}>{running ? "Pause" : "Resume"}</button><button onClick={() => void archiveAutomation(automation)} disabled={busy || automation.activePositions > 0}>Archive</button></> : <span>Read only</span>}</div></td></tr>;
    })}</tbody></table></div>}</section>
    {summary.strategies > 0 && <section className={styles.panel}><div className={styles.panelHeader}><h2>Strategy Execution</h2><span>TradingView-controlled automations remain read-only in this phase</span></div><div className={styles.empty}>Strategy Execution state is already read from Core V2. Its TradingView setup and write controls will migrate separately so DCA management does not change strategy execution behavior.</div></section>}
  </>;

  return <div className={styles.page}>
    <aside className={styles.sidebar}><Link href="/" className={styles.brand}><span className={styles.mark} /><span className={styles.brandText}><strong>LabNarrative</strong><span>Trading</span></span></Link><nav className={styles.nav}>{nav.map(([href, label]) => <Link href={href} key={href} className={href === "/automations" ? styles.active : undefined}>{label}</Link>)}</nav></aside>
    <main className={styles.main}><header className={styles.topbar}><div><div className={styles.eyebrow}>Core V2</div><h1 className={styles.title}>Automations</h1></div><div className={styles.topActions}>{summary && <div className={styles.status}><span className={summary.running > 0 ? styles.dot : `${styles.dot} ${styles.dotWarn}`} />{summary.running > 0 ? `${summary.running} running` : "All stopped"}</div>}<button className={styles.primaryButton} onClick={openCreate} disabled={busy}>New DCA bot</button><button className={styles.ghostButton} onClick={() => browserSupabase.auth.signOut()}>Sign out</button></div></header>{content}</main>
  </div>;
}