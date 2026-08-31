"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { browserSupabase } from "../../lib/supabase-browser";
import base from "./trader-app.module.css";
import styles from "./automations-app.module.css";

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
  conditionLabel: string;
  isArchived: boolean;
  executions: number;
  closedPositions: number;
  activePositions: number;
  maxActivePositions: number | null;
  maxCapital: number | null;
  realizedPnl: number;
  unrealizedPnl: number;
  pnl: number;
  activeCapital: number;
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
    archived: number;
    running: number;
    stopped: number;
    dca: number;
    strategies: number;
    activePositions: number;
    closedPositions: number;
    realizedPnl: number;
    unrealizedPnl: number;
    automationPnl: number;
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

type ViewTab = "active" | "archived";
type FilterValue = "all" | "dca" | "strategy";

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

function finite(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
function money(value: unknown) {
  const parsed = finite(value);
  const abs = Math.abs(parsed);
  const formatted = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(abs);
  return parsed < 0 ? `-${formatted}` : formatted;
}
function readError(error: unknown, fallback: string) { return error instanceof Error ? error.message || fallback : fallback; }
function activeLabel(automation: Automation) {
  return automation.maxActivePositions == null ? `${automation.activePositions} / ∞` : `${automation.activePositions} / ${automation.maxActivePositions}`;
}
function automationSubtitle(automation: Automation) {
  const mode = automation.executionMode ? ` · ${automation.executionMode}` : "";
  if (automation.type === "Strategy Execution") return `Strategy Execution${mode}`;
  return `DCA · ${automation.conditionLabel || "Immediately"}${mode}`;
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
function providerLabel(provider: string) {
  const normalized = String(provider || "").toLowerCase();
  if (normalized === "okx") return "OKX";
  if (normalized === "kucoin") return "KuCoin";
  if (normalized === "bybit") return "Bybit";
  if (normalized === "binance") return "Binance";
  return provider || "—";
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
  const [tab, setTab] = useState<ViewTab>("active");
  const [filter, setFilter] = useState<FilterValue>("all");
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

  if (!authReady) return <div className={base.loading}>Loading secure session…</div>;
  if (!signedIn) return <AuthCard />;

  const summary = data?.summary;
  const automations = data?.automations ?? [];
  const supportedProviders = data?.supportedProviders?.length ? data.supportedProviders : DEFAULT_PROVIDERS;
  const editing = editingId ? automations.find((automation) => automation.id === editingId) ?? null : null;
  const visibleAutomations = automations.filter((automation) => {
    if (tab === "active" && automation.isArchived) return false;
    if (tab === "archived" && !automation.isArchived) return false;
    if (filter === "dca" && automation.type !== "DCA") return false;
    if (filter === "strategy" && automation.type !== "Strategy Execution") return false;
    return true;
  });

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
    if (!botForm.name.trim() || !(botForm.baseOrder > 0) || !(botForm.safetyOrder > 0)) return setError("Add an automation name and valid base/safety order amounts.");
    const isCreate = editorMode === "create";
    if (!isCreate && !editing) return;
    const prompt = isCreate
      ? `Create and start ${botForm.name.trim()} on ${botForm.provider.toUpperCase()}? A running Real DCA automation may open live positions when its entry conditions are met.`
      : `Apply these settings to ${editing?.name}? Existing active positions keep their current trade levels; future entries use the updated automation settings.`;
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
      setNotice(result.pending ? "Automation command queued and will finish automatically." : isCreate ? "DCA automation created through Core V2." : "Automation settings updated through Core V2.");
      setEditorMode(null); setEditingId(null); await load(true);
    } catch (caught) { setError(commandError(readError(caught, "Unable to save automation."))); }
    finally { setBusy(false); }
  };

  const toggleAutomation = async (automation: Automation) => {
    if (!data?.account?.id || !automation.canManage || busy) return;
    const running = automation.status.toLowerCase() === "running";
    const next = running ? "Stopped" : "Running";
    if (!window.confirm(`${next === "Running" ? "Resume" : "Pause"} ${automation.name}?${next === "Running" ? " A running Real automation may open new live positions." : " Existing positions remain managed by their normal position/exit workers."}`)) return;
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
    if (!window.confirm(`Close ${automation.name}? Its history will remain available under Archived. Automations with active positions or open orders cannot be closed.`)) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await invokeAutomationAction({ action: "close_bot", accountId: data.account.id, automationId: automation.id });
      setNotice(result.pending ? "Close command queued." : `${automation.name} moved to Archived through Core V2.`);
      await load(true);
    } catch (caught) { setError(commandError(readError(caught, "Unable to close automation."))); }
    finally { setBusy(false); }
  };

  const editor = editorMode && <section className={`${base.panel} ${styles.editorPanel}`}>
    <div className={base.panelHeader}><h2>{editorMode === "create" ? "New Automation · DCA" : `Edit ${editing?.name || "DCA automation"}`}</h2><button className={base.ghostButton} onClick={closeEditor} disabled={busy}>Close</button></div>
    <form className={base.automationForm} onSubmit={saveBot}>
      <label>Name<input value={botForm.name} onChange={(event) => setBotForm((current) => ({ ...current, name: event.target.value }))} /></label>
      <label>Exchange<select value={botForm.provider} disabled={editorMode === "edit"} onChange={(event) => setBotForm((current) => ({ ...current, provider: event.target.value }))}>{supportedProviders.map((provider) => <option value={provider} key={provider}>{providerLabel(provider)}</option>)}</select></label>
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
      <div className={base.automationFormActions}><span>{editorMode === "edit" ? `Exchange is locked to ${providerLabel(botForm.provider)} for an existing automation.` : "New Automation currently creates the production DCA automation type. Strategy Execution remains read-only here."}</span><button className={base.primaryButton} disabled={busy}>{busy ? "Saving…" : editorMode === "create" ? "Create automation" : "Save changes"}</button></div>
    </form>
  </section>;

  const content = loading ? <div className={base.loading}>Reading automation configuration…</div> : error && !data ? <div className={base.error}>{error}</div> : !summary ? <div className={base.error}>Automation data is unavailable.</div> : <>
    {error && <div className={base.error}>{error}</div>}{notice && <div className={base.notice}>{notice}</div>}
    <div className={styles.statGrid}>
      <section className={styles.statCard}><span>Automation PnL</span><strong className={summary.automationPnl >= 0 ? styles.positive : styles.negative}>{money(summary.automationPnl)}</strong><small>Across active and closed bot positions</small></section>
      <section className={styles.statCard}><span>Active automations</span><strong>{summary.total}</strong><small>{summary.running} running</small></section>
      <section className={styles.statCard}><span>Active positions</span><strong>{summary.activePositions}</strong><small>{money(summary.unrealizedPnl)} unrealized</small></section>
      <section className={styles.statCard}><span>Closed positions</span><strong>{summary.closedPositions}</strong><small>{money(summary.realizedPnl)} realized</small></section>
    </div>
    {editor}
    <div className={styles.toolbar}>
      <div className={styles.tabs}>
        <button type="button" className={tab === "active" ? styles.tabActive : ""} onClick={() => setTab("active")}>Running / paused <b>{summary.total}</b></button>
        <button type="button" className={tab === "archived" ? styles.tabActive : ""} onClick={() => setTab("archived")}>Archived <b>{summary.archived}</b></button>
        <label className={styles.filterPill}><span>Filter</span><select value={filter} onChange={(event) => setFilter(event.target.value as FilterValue)}><option value="all">All</option><option value="dca">DCA</option><option value="strategy">Strategy</option></select></label>
      </div>
      <span className={styles.toolbarHint}>Open a DCA automation to inspect or edit its strategy and capital plan.{latencyMs != null ? ` · ${latencyMs} ms read` : ""}</span>
    </div>
    <section className={styles.tableShell}>
      {visibleAutomations.length === 0 ? <div className={styles.empty}>No automations match this view.</div> : <div className={styles.tableWrap}><table className={styles.automationTable}>
        <thead><tr><th>Automation</th><th>Market</th><th>Exchange</th><th>Executions</th><th>Positions</th><th>Max capital</th><th>PnL</th><th>Status</th><th /></tr></thead>
        <tbody>{visibleAutomations.map((automation) => {
          const running = automation.status.toLowerCase() === "running";
          return <tr key={automation.id} className={automation.canManage ? styles.clickableRow : undefined} onClick={() => openEdit(automation)}>
            <td><strong>{automation.name}</strong><small>{automationSubtitle(automation)}</small></td>
            <td>{automation.market}</td>
            <td><span className={styles.exchangePill}>{providerLabel(automation.provider)}</span></td>
            <td>{automation.executions}</td>
            <td>{activeLabel(automation)}</td>
            <td>{automation.maxCapital == null ? "Dynamic" : money(automation.maxCapital)}</td>
            <td className={automation.pnl >= 0 ? styles.positive : styles.negative}>{money(automation.pnl)}</td>
            <td><span className={running ? styles.statusRunning : styles.statusStopped}>{automation.isArchived ? "ARCHIVED" : running ? "RUNNING" : "STOPPED"}</span></td>
            <td><div className={styles.rowActions} onClick={(event) => event.stopPropagation()}>{automation.isArchived ? <span className={styles.readOnly}>Archived</span> : automation.canManage ? <><button type="button" disabled={busy} onClick={() => void toggleAutomation(automation)}>{running ? "Pause" : "Resume"}</button><button type="button" disabled={busy || automation.activePositions > 0} onClick={() => void archiveAutomation(automation)}>Close</button></> : <span className={styles.readOnly}>Read only</span>}</div></td>
          </tr>;
        })}</tbody>
      </table></div>}
    </section>
  </>;

  return <div className={base.page}>
    <aside className={base.sidebar}><Link href="/" className={base.brand}><span className={base.mark} /><span className={base.brandText}><strong>LabNarrative</strong><span>Trading</span></span></Link><nav className={base.nav}>{nav.map(([href, label]) => <Link href={href} key={href} className={href === "/automations" ? base.active : undefined}>{label}</Link>)}</nav><div className={styles.workspace}><i /><div><strong>Real workspace</strong><span>Live</span></div></div></aside>
    <main className={`${base.main} ${styles.main}`}><header className={`${base.topbar} ${styles.topbar}`}><div><div className={base.eyebrow}>AUTOMATIONS</div><h1 className={base.title}>Automations</h1></div><div className={styles.headingActions}><button className={styles.newButton} type="button" onClick={openCreate} disabled={busy}>＋ New Automation</button><button className={styles.signOut} type="button" onClick={() => browserSupabase.auth.signOut()}>Sign out</button></div></header>{content}</main>
  </div>;
}
