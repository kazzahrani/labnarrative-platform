"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { browserSupabase } from "../../lib/supabase-browser";
import BinanceConnectionLayer from "./BinanceConnectionLayer";
import CoinLogo from "./CoinLogo";
import DcaTradeChart from "./DcaTradeChart";
import styles from "./trader-v2.module.css";
import dca from "./trader-dca-v2.module.css";

type AccountKind = "paper" | "real";
type Section = "Dashboard" | "Portfolio" | "Bots" | "Active Trades" | "Closed Trades";
type BotTab = "Active" | "Closed";
type BotModalMode = "create" | "view" | "edit" | null;
type AuthMode = "login" | "signup";

type TraderAccount = {
  id: string;
  name: string;
  kind: AccountKind;
  mode: "paper" | "shadow" | "live";
  status: string;
  quoteAsset: string;
  startingBalance: number;
  exchangeStatus: string;
  apiKeyLast4: string | null;
};
type WorkspaceAccount = {
  id: string;
  name: string;
  kind: AccountKind;
  mode: "paper" | "shadow" | "live";
  quoteAsset: string;
  startingBalance: number;
  invested: number;
  reserved: number;
  available: number;
  realizedPnl: number;
  unrealizedPnl: number;
  equity: number;
  lastWorkerAt: string | null;
};
type Bot = {
  id: string;
  name: string;
  status: "Running" | "Stopped";
  lifecycle: "active" | "closed";
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
  startCondition: string;
  executionMode: string;
  activeTradeCount: number;
  closedTradeCount: number;
  pnl: number;
  createdAt: string;
  updatedAt: string;
};
type Fill = {
  kind: "Base" | "Averaging";
  price: number;
  amount: number;
  quantity: number;
  at: string;
};
type Trade = {
  id: string;
  botId: string | null;
  botName: string;
  pair: string;
  status: "Active" | "Closed";
  entryPrice: number;
  averagePrice: number;
  quantity: number;
  invested: number;
  averagingFilled: number;
  maxAveraging: number;
  activeOrdersLimit: number;
  takeProfitPct: number;
  takeProfitPrice: number | null;
  stopEnabled: boolean;
  stopPct: number;
  stopLossPrice: number | null;
  nextAveragingPrice: number | null;
  lastPrice: number | null;
  realizedPnl: number | null;
  pnl: number;
  pnlPct: number;
  exitPrice: number | null;
  openedAt: string;
  closedAt: string | null;
  closeReason: string | null;
  executionMode: string;
  fills: Fill[];
};
type WorkspaceResponse = {
  ok?: boolean;
  account?: WorkspaceAccount;
  controls?: { global_live_enabled?: boolean; kill_switch?: boolean };
  worker?: { status?: string; started_at?: string; error?: string | null } | null;
  bots?: Bot[];
  trades?: Trade[];
  error?: string;
};
type Balance = { asset: string; free: number; locked: number; usdPrice: number | null; usdValue: number | null };
type BalanceResponse = { ok?: boolean; balances?: Balance[]; quoteBalance?: number; totalUsd?: number; error?: string };
type AccountsResponse = { ok?: boolean; accounts?: TraderAccount[]; defaultAccount?: AccountKind; error?: string };
type BotForm = {
  name: string;
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

const DEFAULT_PAIRS = ["BTC/USDT", "ETH/USDT", "BNB/USDT", "SOL/USDT", "XRP/USDT", "ADA/USDT", "DOGE/USDT", "LINK/USDT", "AVAX/USDT", "TRX/USDT", "USDC/USDT"];
const NEW_BOT: BotForm = {
  name: "My DCA Bot",
  pair: "BTC/USDT",
  baseOrder: 25,
  safetyOrder: 25,
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

function money(value: number | null | undefined) {
  const amount = Number(value ?? 0);
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(Number.isFinite(amount) ? amount : 0);
}
function amount(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 8 }).format(value);
}
function pct(value: number | null | undefined) {
  const number = Number(value ?? 0);
  return `${number >= 0 ? "+" : ""}${number.toFixed(2)}%`;
}
function dateLabel(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
function botCapital(bot: Pick<BotForm, "baseOrder" | "safetyOrder" | "maxSafetyOrders" | "volumeScale">) {
  let total = Math.max(0, bot.baseOrder);
  for (let index = 0; index < Math.max(0, Math.round(bot.maxSafetyOrders)); index += 1) total += Math.max(0, bot.safetyOrder) * Math.pow(Math.max(0.000001, bot.volumeScale), index);
  return total;
}
function botFormFrom(bot: Bot): BotForm {
  return {
    name: bot.name,
    pair: bot.pair,
    baseOrder: bot.baseOrder,
    safetyOrder: bot.safetyOrder,
    maxSafetyOrders: bot.maxSafetyOrders,
    limitSafetyOrders: bot.limitSafetyOrders,
    maxActiveTrades: bot.maxActiveTrades,
    deviation: bot.deviation,
    stepScale: bot.stepScale,
    volumeScale: bot.volumeScale,
    takeProfit: bot.takeProfit,
    stopEnabled: bot.stopEnabled,
    stopPct: bot.stopPct,
  };
}
function liveBarPosition(trade: Trade) {
  const positiveRange = Math.max(trade.takeProfitPct || 1, 0.25);
  const negativeRange = Math.max(trade.stopEnabled ? trade.stopPct : positiveRange * 2, 0.5);
  const zero = negativeRange / (negativeRange + positiveRange) * 100;
  const current = Math.max(0, Math.min(100, (trade.pnlPct + negativeRange) / (negativeRange + positiveRange) * 100));
  return { zero, current };
}

async function invokeAccount(body: Record<string, unknown>) {
  const { data, error } = await browserSupabase.functions.invoke("trader-account-control", { body });
  if (error) {
    let message = error.message || "trader_account_control_failed";
    const context = (error as { context?: Response }).context;
    if (context) {
      try {
        const payload = await context.clone().json() as { error?: string };
        if (payload.error) message = payload.error;
      } catch {}
    }
    throw new Error(message);
  }
  const result = (data ?? {}) as AccountsResponse & WorkspaceResponse;
  if (result.error || result.ok !== true) throw new Error(result.error || "trader_account_control_failed");
  return result;
}
async function invokeBalances() {
  const { data, error } = await browserSupabase.functions.invoke("trader-binance-control", { body: { action: "balances" } });
  if (error) {
    let message = error.message || "binance_balance_failed";
    const context = (error as { context?: Response }).context;
    if (context) {
      try {
        const payload = await context.clone().json() as { error?: string };
        if (payload.error) message = payload.error;
      } catch {}
    }
    throw new Error(message);
  }
  const result = (data ?? {}) as BalanceResponse;
  if (result.error || result.ok !== true) throw new Error(result.error || "binance_balance_failed");
  return result;
}

function TraderAuth() {
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const sendCode = async (event: FormEvent) => {
    event.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail.includes("@")) return setError("Enter a valid email address.");
    setBusy(true); setError("");
    try {
      const { error: authError } = await browserSupabase.auth.signInWithOtp({ email: cleanEmail, options: { shouldCreateUser: mode === "signup" } });
      if (authError) throw authError;
      setOtpSent(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to send verification code.");
    } finally { setBusy(false); }
  };
  const verify = async (event: FormEvent) => {
    event.preventDefault();
    if (!otp.trim()) return setError("Enter the verification code from your email.");
    setBusy(true); setError("");
    try {
      const { data, error: verifyError } = await browserSupabase.auth.verifyOtp({ email: email.trim().toLowerCase(), token: otp.trim(), type: "email" });
      if (verifyError) throw verifyError;
      if (!data.session) throw new Error("Sign in did not create a secure session.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to verify code.");
    } finally { setBusy(false); }
  };

  return <div className={styles.authPage}><section className={styles.authCard}>
    <div className={styles.authBrand}><span>LN</span><strong>LabNarrative</strong></div>
    <small>TRADING AUTOMATION</small>
    <h1>{otpSent ? "Verify your email" : mode === "login" ? "Welcome back" : "Create your account"}</h1>
    <p>{otpSent ? `Enter the code sent to ${email.trim().toLowerCase()}.` : "Access your Real trading workspace and optional Paper account."}</p>
    {!otpSent && <div className={styles.authTabs}><button className={mode === "login" ? styles.authTabActive : ""} onClick={() => setMode("login")}>Sign in</button><button className={mode === "signup" ? styles.authTabActive : ""} onClick={() => setMode("signup")}>Sign up</button></div>}
    {otpSent ? <form onSubmit={verify} className={styles.authForm}><label><span>Verification code</span><input value={otp} onChange={(event) => setOtp(event.target.value)} inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit code" /></label>{error && <div className={styles.errorBox}>{error}</div>}<button className={styles.primaryButton} disabled={busy}>{busy ? "Verifying…" : "Continue"}</button><button type="button" className={styles.textButton} onClick={() => { setOtpSent(false); setOtp(""); setError(""); }}>Use another email</button></form> : <form onSubmit={sendCode} className={styles.authForm}><label><span>Email</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="you@example.com" /></label>{error && <div className={styles.errorBox}>{error}</div>}<button className={styles.primaryButton} disabled={busy}>{busy ? "Sending…" : "Send verification code"}</button></form>}
  </section></div>;
}

export default function TraderV2FullShell() {
  const [authReady, setAuthReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [accountsReady, setAccountsReady] = useState(false);
  const [accounts, setAccounts] = useState<TraderAccount[]>([]);
  const [selectedKind, setSelectedKind] = useState<AccountKind>("real");
  const [section, setSection] = useState<Section>("Dashboard");
  const [botTab, setBotTab] = useState<BotTab>("Active");
  const [workspace, setWorkspace] = useState<WorkspaceResponse | null>(null);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [quoteBalance, setQuoteBalance] = useState<number | null>(null);
  const [totalUsd, setTotalUsd] = useState<number | null>(null);
  const [accountMenu, setAccountMenu] = useState(false);
  const [exchangeModal, setExchangeModal] = useState(false);
  const [botModalMode, setBotModalMode] = useState<BotModalMode>(null);
  const [selectedBotId, setSelectedBotId] = useState<string | null>(null);
  const [selectedTradeId, setSelectedTradeId] = useState<string | null>(null);
  const [botForm, setBotForm] = useState<BotForm>({ ...NEW_BOT });
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const hiddenBinanceButton = useRef<HTMLButtonElement>(null);
  const sessionBootstrapped = useRef(false);

  const currentAccount = useMemo(() => accounts.find((account) => account.kind === selectedKind) ?? null, [accounts, selectedKind]);
  const stateAccount = workspace?.account;
  const bots = workspace?.bots ?? [];
  const trades = workspace?.trades ?? [];
  const activeBots = bots.filter((bot) => bot.lifecycle !== "closed");
  const closedBots = bots.filter((bot) => bot.lifecycle === "closed");
  const activeTrades = trades.filter((trade) => trade.status === "Active");
  const closedTrades = trades.filter((trade) => trade.status === "Closed");
  const connected = currentAccount?.kind === "real" && currentAccount.exchangeStatus === "connected";
  const displayBots = botTab === "Active" ? activeBots : closedBots;
  const displayBalances = useMemo(() => [...balances].sort((a, b) => (b.usdValue ?? -1) - (a.usdValue ?? -1)), [balances]);
  const displayedEquity = currentAccount?.kind === "real" && connected && totalUsd != null ? totalUsd : (stateAccount?.equity ?? currentAccount?.startingBalance ?? 0);
  const displayedAvailable = currentAccount?.kind === "real" && connected && quoteBalance != null ? quoteBalance : (stateAccount?.available ?? currentAccount?.startingBalance ?? 0);
  const selectedBot = selectedBotId ? bots.find((bot) => bot.id === selectedBotId) ?? null : null;
  const selectedTrade = selectedTradeId ? trades.find((trade) => trade.id === selectedTradeId) ?? null : null;
  const totalBotPnl = bots.reduce((sum, bot) => sum + Number(bot.pnl || 0), 0);
  const pairOptions = useMemo(() => Array.from(new Set([botForm.pair, ...DEFAULT_PAIRS])).filter(Boolean), [botForm.pair]);
  const dcaPreview = useMemo(() => {
    let cumulative = 0;
    let step = Math.max(0.000001, botForm.deviation);
    return Array.from({ length: Math.max(0, Math.min(50, Math.round(botForm.maxSafetyOrders))) }, (_, index) => {
      cumulative += step;
      const orderAmount = botForm.safetyOrder * Math.pow(Math.max(0.000001, botForm.volumeScale), index);
      const row = { index: index + 1, deviation: cumulative, orderAmount };
      step *= Math.max(0.000001, botForm.stepScale);
      return row;
    });
  }, [botForm]);

  const loadAccounts = async (bootstrap = false) => {
    try {
      const result = await invokeAccount({ action: bootstrap ? "bootstrap" : "list" });
      const next = (result.accounts ?? []) as TraderAccount[];
      setAccounts(next);
      if (bootstrap) {
        const saved = sessionStorage.getItem("ln-trader-v2-account");
        setSelectedKind(saved === "paper" && next.some((account) => account.kind === "paper") ? "paper" : "real");
      }
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load trading accounts.");
    } finally { setAccountsReady(true); }
  };
  const loadWorkspace = async (quiet = false) => {
    if (!currentAccount) return;
    if (!quiet) setLoading(true);
    try {
      const result = await invokeAccount({ action: "workspace_state", accountId: currentAccount.id });
      setWorkspace(result);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load workspace.");
    } finally { if (!quiet) setLoading(false); }
  };
  const loadBalances = async (quiet = false) => {
    if (!connected) { setBalances([]); setQuoteBalance(null); setTotalUsd(null); return; }
    try {
      const result = await invokeBalances();
      setBalances(result.balances ?? []);
      setQuoteBalance(Number(result.quoteBalance ?? 0));
      setTotalUsd(Number(result.totalUsd ?? 0));
      await loadWorkspace(true);
    } catch (caught) {
      if (!quiet) setNotice(caught instanceof Error ? caught.message : "Could not refresh Binance balances.");
    }
  };

  useEffect(() => {
    let active = true;
    void browserSupabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      const hasSession = Boolean(data.session);
      setSignedIn(hasSession); setAuthReady(true);
      if (hasSession) { sessionBootstrapped.current = true; void loadAccounts(true); }
    });
    const { data: listener } = browserSupabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      const hasSession = Boolean(session);
      setSignedIn(hasSession); setAuthReady(true);
      if (hasSession) {
        if (!sessionBootstrapped.current) { sessionBootstrapped.current = true; void loadAccounts(true); }
      } else {
        sessionBootstrapped.current = false;
        setAccounts([]); setWorkspace(null); setAccountsReady(false); setSelectedKind("real");
        setBalances([]); setQuoteBalance(null); setTotalUsd(null);
      }
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);
  useEffect(() => { if (currentAccount) void loadWorkspace(); }, [currentAccount?.id]);
  useEffect(() => { if (connected) void loadBalances(true); else { setBalances([]); setQuoteBalance(null); setTotalUsd(null); } }, [connected, currentAccount?.id]);
  useEffect(() => {
    if (!signedIn || !currentAccount) return;
    const timer = window.setInterval(() => { void loadAccounts(false); void loadWorkspace(true); }, 5000);
    return () => window.clearInterval(timer);
  }, [signedIn, currentAccount?.id]);
  useEffect(() => {
    if (!connected) return;
    const timer = window.setInterval(() => void loadBalances(true), 60000);
    return () => window.clearInterval(timer);
  }, [connected, currentAccount?.id]);

  const chooseAccount = (kind: AccountKind) => {
    setSelectedKind(kind);
    sessionStorage.setItem("ln-trader-v2-account", kind);
    setAccountMenu(false); setSection("Dashboard"); setBotTab("Active"); setNotice("");
    setBotModalMode(null); setSelectedBotId(null); setSelectedTradeId(null);
  };
  const signOut = async () => {
    sessionStorage.removeItem("ln-trader-v2-account");
    await browserSupabase.auth.signOut();
  };
  const openBinance = () => {
    setExchangeModal(false);
    window.setTimeout(() => hiddenBinanceButton.current?.click(), 30);
  };
  const openCreateBot = () => {
    if (!currentAccount) return;
    if (currentAccount.kind === "real" && !connected) { setExchangeModal(true); return; }
    setBotForm({ ...NEW_BOT }); setSelectedBotId(null); setBotModalMode("create");
  };
  const openBot = (bot: Bot) => {
    setSelectedBotId(bot.id); setBotForm(botFormFrom(bot)); setBotModalMode("view");
  };
  const editBot = () => {
    if (!selectedBot || selectedBot.lifecycle === "closed") return;
    setBotForm(botFormFrom(selectedBot)); setBotModalMode("edit");
  };
  const saveBot = async (event: FormEvent) => {
    event.preventDefault();
    if (!currentAccount || busy) return;
    if (!botForm.name.trim() || botForm.baseOrder <= 0 || botForm.safetyOrder <= 0) { setNotice("Add a bot name and valid order amounts."); return; }
    setBusy(true); setError("");
    try {
      const body = {
        accountId: currentAccount.id,
        name: botForm.name.trim(), pair: botForm.pair, baseOrder: botForm.baseOrder, safetyOrder: botForm.safetyOrder,
        maxSafetyOrders: botForm.maxSafetyOrders, limitSafetyOrders: botForm.limitSafetyOrders, maxActiveTrades: botForm.maxActiveTrades,
        deviation: botForm.deviation, stepScale: botForm.stepScale, volumeScale: botForm.volumeScale,
        takeProfit: botForm.takeProfit, stopEnabled: botForm.stopEnabled, stopPct: botForm.stopPct,
      };
      const result = botModalMode === "create"
        ? await invokeAccount({ action: "create_bot", ...body })
        : await invokeAccount({ action: "update_bot", botId: selectedBotId, ...body });
      setWorkspace(result);
      if (botModalMode === "create") {
        const createdId = String((result as { botId?: string }).botId || "");
        if (createdId) setSelectedBotId(createdId);
        setNotice(currentAccount.kind === "real" ? "DCA bot created in the Real Account. Execution remains Shadow until Live is explicitly enabled." : "Paper DCA bot created and started.");
      } else setNotice("Bot settings saved. Existing active trades keep their current trade levels; new trades use the updated bot settings.");
      setBotModalMode("view"); setBotTab("Active");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Unable to save bot.";
      if (message.includes("exchange_connection_required")) { setBotModalMode(null); setExchangeModal(true); }
      else if (message.includes("bot_pair_locked_by_active_trade")) setError("Pair cannot be changed while this bot has an active trade. Other settings can still be edited.");
      else setError(message);
    } finally { setBusy(false); }
  };
  const toggleBot = async (bot: Bot) => {
    if (!currentAccount || busy) return;
    setBusy(true);
    try {
      const result = await invokeAccount({ action: "set_bot_status", accountId: currentAccount.id, botId: bot.id, status: bot.status === "Running" ? "Stopped" : "Running" });
      setWorkspace(result);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to update bot."); }
    finally { setBusy(false); }
  };
  const closeBot = async (bot: Bot) => {
    if (!currentAccount || busy || !window.confirm(`Close ${bot.name}? Its bot and trade history will remain available.`)) return;
    setBusy(true);
    try {
      const result = await invokeAccount({ action: "close_bot", accountId: currentAccount.id, botId: bot.id });
      setWorkspace(result); setBotModalMode(null); setSelectedBotId(null); setNotice(`${bot.name} moved to Closed bots.`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to close bot."); }
    finally { setBusy(false); }
  };

  if (!authReady) return <div className={styles.loadingPage}>Checking secure session…</div>;
  if (!signedIn) return <TraderAuth />;
  if (!accountsReady || !currentAccount) return <div className={styles.loadingPage}>Loading your trading workspace…</div>;

  const dashboard = <>
    <div className={styles.pageHeading}><div><small>{currentAccount.kind === "real" ? "REAL ACCOUNT" : "PAPER ACCOUNT"}</small><h1>Dashboard</h1></div>{currentAccount.kind === "real" && <button className={styles.primaryButton} onClick={() => setExchangeModal(true)}>{connected ? "Exchange connected" : "Connect Exchange"}</button>}</div>
    <div className={styles.heroGrid}>
      <section className={styles.heroCard}><div className={styles.cardTop}><span>Total balance</span><small>{currentAccount.kind === "real" ? (connected ? "Binance Spot market value" : "Connect exchange to sync") : "Simulation"}</small></div><strong>{money(displayedEquity)}</strong><div className={styles.heroMeta}><span>{currentAccount.kind === "real" && connected ? "USDT available" : "Available"} {money(displayedAvailable)}</span><span>In bots {money(stateAccount?.invested)}</span></div><div className={styles.chartLine}><i/><i/><i/><i/><i/><i/><i/></div></section>
      <div className={styles.metricStack}><section className={styles.metricCard}><span>Active bots</span><strong>{activeBots.length}</strong><small>{activeBots.filter((bot) => bot.status === "Running").length} running</small></section><section className={styles.metricCard}><span>Active trades</span><strong>{activeTrades.length}</strong><small>{closedTrades.length} closed trades</small></section><section className={styles.metricCard}><span>DCA PnL</span><strong className={totalBotPnl >= 0 ? styles.positive : styles.negative}>{money(totalBotPnl)}</strong><small>Active + closed bot trades</small></section></div>
    </div>
    <div className={styles.dashboardGrid}>
      <section className={styles.panel}><div className={styles.panelTitle}><div><h2>Exchange</h2><p>{currentAccount.kind === "real" ? "Connected broker for this account" : "Paper account does not require an exchange"}</p></div></div>{currentAccount.kind === "real" ? <div className={styles.exchangeRow}><span className={styles.exchangeLogo}>◆</span><div><strong>Binance Spot</strong><small>{connected ? `Connected${currentAccount.apiKeyLast4 ? ` · ••••${currentAccount.apiKeyLast4}` : ""}` : "Not connected"}</small></div><span className={connected ? styles.connected : styles.muted}>{connected ? "CONNECTED" : "OFFLINE"}</span><button onClick={() => setExchangeModal(true)}>{connected ? "Manage" : "Connect"}</button></div> : <div className={styles.emptyCompact}><strong>Paper simulation</strong><p>Switch to Real Account from the top header when you want to connect an exchange.</p></div>}</section>
      <section className={styles.panel}><div className={styles.panelTitle}><div><h2>Recent DCA bots</h2><p>Open a bot to inspect or edit its configuration</p></div><button onClick={() => setSection("Bots")}>View all</button></div><div className={styles.rows}>{activeBots.slice(0,4).map((bot) => <button className={styles.simpleRow} style={{width:"100%",border:0,background:"transparent",color:"inherit",cursor:"pointer",textAlign:"left"}} key={bot.id} onClick={() => openBot(bot)}><div><strong>{bot.name}</strong><small style={{display:"flex",alignItems:"center",gap:6}}><CoinLogo symbol={bot.pair} size={14}/><span>{bot.pair} · {bot.executionMode}</span></small></div><span>{bot.status}</span></button>)}{!activeBots.length && <div className={styles.emptyCompact}><strong>No active bots</strong><p>Create your first DCA bot to begin.</p></div>}</div></section>
    </div>
  </>;

  const portfolio = <>
    <div className={styles.pageHeading}><div><small>PORTFOLIO</small><h1>{currentAccount.kind === "real" ? "My Portfolio" : "Paper Portfolio"}</h1></div>{currentAccount.kind === "real" && <button className={styles.ghostButton} onClick={() => connected ? void loadBalances(false) : setExchangeModal(true)}>{connected ? "Refresh" : "Connect Exchange"}</button>}</div>
    <div className={styles.portfolioGrid}><section className={styles.heroCard}><div className={styles.cardTop}><span>Account equity</span><small>{currentAccount.kind === "real" && connected ? "All Binance Spot assets in USD" : currentAccount.kind === "real" ? "Real account" : "Simulation"}</small></div><strong>{money(displayedEquity)}</strong><div className={styles.statGrid}><div><span>{currentAccount.kind === "real" && connected ? "Available USDT" : "Available"}</span><b>{money(displayedAvailable)}</b></div><div><span>Bot capital</span><b>{money(stateAccount?.invested)}</b></div><div><span>Reserved</span><b>{money(stateAccount?.reserved)}</b></div><div><span>Realized PnL</span><b className={(stateAccount?.realizedPnl ?? 0) >= 0 ? styles.positive : styles.negative}>{money(stateAccount?.realizedPnl)}</b></div></div></section><section className={styles.panel}><div className={styles.panelTitle}><div><h2>Assets</h2><p>{currentAccount.kind === "real" ? "Binance Spot balances · current USD value" : "Paper account cash"}</p></div></div>{currentAccount.kind === "real" ? connected ? <div className={styles.assetRows}>{displayBalances.length ? displayBalances.map((item) => <div className={styles.assetRow} key={item.asset}><CoinLogo symbol={item.asset} size={36}/><div><strong>{item.asset}</strong><small>Free {amount(item.free)}{item.locked > 0 ? ` · Locked ${amount(item.locked)}` : ""}</small></div><b style={{display:"grid",gap:3,textAlign:"right"}}><span>{item.usdValue == null ? "—" : money(item.usdValue)}</span><small style={{fontSize:8,color:"#6c6c6c",fontWeight:400}}>{amount(item.free + item.locked)} {item.asset}{item.usdPrice != null ? ` · ${money(item.usdPrice)}` : " · price unavailable"}</small></b></div>) : <div className={styles.emptyCompact}><strong>No non-zero Binance assets</strong><p>Your account may currently be empty.</p></div>}</div> : <div className={styles.connectEmpty}><span>◆</span><strong>Connect your exchange</strong><p>Link Binance to display your actual Spot balances here.</p><button className={styles.primaryButton} onClick={() => setExchangeModal(true)}>Connect Exchange</button></div> : <div className={styles.assetRow}><CoinLogo symbol="USDT" size={36}/><div><strong>USDT</strong><small>Paper balance</small></div><b>{money(stateAccount?.available ?? currentAccount.startingBalance)}</b></div>}</section></div>
  </>;

  const botsPage = <>
    <div className={styles.pageHeading}><div><small>DCA BOTS</small><h1>Trading Bots</h1></div><button className={styles.primaryButton} onClick={openCreateBot}>＋ Create DCA Bot</button></div>
    <div className={dca.dcaIntro}>
      <section className={dca.metric}><span>Total DCA PnL</span><strong className={totalBotPnl >= 0 ? dca.green : dca.red}>{money(totalBotPnl)}</strong><small>Across active and closed bot trades</small></section>
      <section className={dca.metric}><span>Active bots</span><strong>{activeBots.length}</strong><small>{activeBots.filter((bot) => bot.status === "Running").length} running</small></section>
      <section className={dca.metric}><span>Active trades</span><strong>{activeTrades.length}</strong><small>{money(stateAccount?.unrealizedPnl)} unrealized</small></section>
      <section className={dca.metric}><span>Closed trades</span><strong>{closedTrades.length}</strong><small>{money(stateAccount?.realizedPnl)} realized</small></section>
    </div>
    <div className={dca.botToolbar}><div className={dca.botTabs}><button className={botTab === "Active" ? dca.tabActive : ""} onClick={() => setBotTab("Active")}>Active bots <span>{activeBots.length}</span></button><button className={botTab === "Closed" ? dca.tabActive : ""} onClick={() => setBotTab("Closed")}>Closed bots <span>{closedBots.length}</span></button></div><span className={dca.hint}>Click any bot to open its full configuration.</span></div>
    <section className={dca.botTable}><div className={dca.botHead}><span>Bot</span><span>Pair</span><span>Trades</span><span>Capital</span><span>PnL</span><span>Status</span><span/></div>{displayBots.length ? displayBots.map((bot) => <div className={dca.botRow} key={bot.id} onClick={() => openBot(bot)}><div className={dca.botIdentity}><strong>{bot.name}</strong><small>Long · {bot.startCondition} · {bot.executionMode}</small></div><span className={dca.botCell} style={{display:"flex",alignItems:"center",gap:7}}><CoinLogo symbol={bot.pair} size={18}/>{bot.pair}</span><span className={dca.botCell}>{bot.activeTradeCount} / {bot.maxActiveTrades}</span><span className={dca.botCell}>{money(botCapital(bot))}</span><span className={`${dca.botCell} ${bot.pnl >= 0 ? dca.green : dca.red}`}>{money(bot.pnl)}</span><span className={`${dca.status} ${bot.status === "Running" && bot.lifecycle !== "closed" ? dca.green : ""}`}>{bot.lifecycle === "closed" ? "CLOSED" : bot.status.toUpperCase()}</span><div className={dca.rowActions}>{bot.lifecycle !== "closed" && <><button onClick={(event) => { event.stopPropagation(); void toggleBot(bot); }}>{bot.status === "Running" ? "Pause" : "Resume"}</button><button onClick={(event) => { event.stopPropagation(); void closeBot(bot); }}>Close</button></>}</div></div>) : <div className={dca.empty}><strong>No {botTab.toLowerCase()} bots</strong><p>{botTab === "Active" ? "Create a DCA bot to start automating this account." : "Closed bots remain here with their complete history."}</p></div>}</section>
  </>;

  const tradesPage = (tradeState: "Active" | "Closed") => {
    const rows = tradeState === "Active" ? activeTrades : closedTrades;
    const totalPnl = rows.reduce((sum, trade) => sum + trade.pnl, 0);
    return <>
      <div className={styles.pageHeading}><div><small>DCA BOTS · TRADES</small><h1>{tradeState} Trades</h1></div></div>
      <div className={dca.tradeStats}><section className={dca.metric}><span>{tradeState} trades</span><strong>{rows.length}</strong><small>{tradeState === "Active" ? "Updated by the durable worker" : "Permanent trade history"}</small></section><section className={dca.metric}><span>{tradeState === "Active" ? "Unrealized PnL" : "Realized PnL"}</span><strong className={totalPnl >= 0 ? dca.green : dca.red}>{money(totalPnl)}</strong><small>DCA trade PnL</small></section><section className={dca.metric}><span>Execution</span><strong>{currentAccount.kind === "real" ? (currentAccount.mode === "live" ? "Live" : "Shadow") : "Paper"}</strong><small>{currentAccount.kind === "real" && currentAccount.mode !== "live" ? "No Binance orders are sent" : currentAccount.kind === "paper" ? "Simulation" : "Real execution"}</small></section></div>
      <div className={dca.tradeTable}>{rows.length ? rows.map((trade) => { const bar = liveBarPosition(trade); return <article className={dca.tradeCard} key={trade.id} onClick={() => setSelectedTradeId(trade.id)}><div className={dca.tradeTop}><div className={dca.tradeIdentity}><strong style={{display:"flex",alignItems:"center",gap:8}}><CoinLogo symbol={trade.pair} size={22}/>{trade.pair}</strong><small>{trade.botName} · {trade.executionMode}</small></div><div className={dca.tradeValue}><span>Invested</span><b>{money(trade.invested)}</b></div><div className={dca.tradeValue}><span>Average price</span><b>{money(trade.averagePrice)}</b></div><div className={dca.tradeValue}><span>{tradeState === "Active" ? "Live price" : "Exit price"}</span><b>{money(tradeState === "Active" ? trade.lastPrice : trade.exitPrice)}</b></div><div className={dca.tradeValue}><span>PnL</span><b className={trade.pnl >= 0 ? dca.green : dca.red}>{money(trade.pnl)} · {pct(trade.pnlPct)}</b></div><button className={dca.chartButton} onClick={(event) => { event.stopPropagation(); setSelectedTradeId(trade.id); }}>TV Chart</button></div>{tradeState === "Active" && <div className={dca.liveStrip}><span className={dca.liveLabel}><i className={dca.liveDot}/> LIVE</span><div className={dca.liveTrack}><i style={{left:`${bar.zero}%`}}/><b data-negative={trade.pnlPct < 0} style={trade.pnlPct >= 0 ? {left:`${bar.zero}%`,width:`${Math.max(1,bar.current-bar.zero)}%`} : {left:`${bar.current}%`,width:`${Math.max(1,bar.zero-bar.current)}%`}}/></div><span className={`${dca.livePct} ${trade.pnlPct >= 0 ? dca.green : dca.red}`}>{pct(trade.pnlPct)}</span></div>}<div className={dca.tradeMeta}><span>Base <b>{money(trade.entryPrice)}</b></span><span>TP <b>{trade.takeProfitPrice ? money(trade.takeProfitPrice) : "—"}</b></span><span>Next DCA <b>{trade.nextAveragingPrice ? money(trade.nextAveragingPrice) : "—"}</b></span><span>Averaging <b>{trade.averagingFilled} / {trade.maxAveraging}</b></span><span>{tradeState === "Active" ? "Opened" : "Closed"} <b>{dateLabel(tradeState === "Active" ? trade.openedAt : trade.closedAt)}</b></span>{trade.closeReason && <span>Reason <b>{trade.closeReason}</b></span>}</div></article>; }) : <div className={dca.botTable}><div className={dca.empty}><strong>No {tradeState.toLowerCase()} trades</strong><p>{tradeState === "Active" ? "Open DCA positions will appear here with a live PnL bar." : "Completed DCA trades remain here and can still be opened on the chart."}</p></div></div>}</div>
    </>;
  };

  const renderBotReadOnly = (bot: Bot) => <div className={dca.detailBody}>
    <div className={dca.summaryGrid}><div className={dca.summaryItem}><span>Status</span><b>{bot.lifecycle === "closed" ? "Closed" : bot.status}</b></div><div className={dca.summaryItem}><span>Pair</span><b style={{display:"flex",alignItems:"center",gap:7}}><CoinLogo symbol={bot.pair} size={18}/>{bot.pair}</b></div><div className={dca.summaryItem}><span>Active trades</span><b>{bot.activeTradeCount} / {bot.maxActiveTrades}</b></div><div className={dca.summaryItem}><span>Bot PnL</span><b className={bot.pnl >= 0 ? dca.green : dca.red}>{money(bot.pnl)}</b></div><div className={dca.summaryItem}><span>Capital plan</span><b>{money(botCapital(bot))}</b></div></div>
    <div className={dca.settingsGrid}><section className={dca.settingsCard}><h3>Main settings</h3><div className={dca.settingRows}><div className={dca.settingRow}><span>Direction</span><b>Long</b></div><div className={dca.settingRow}><span>Start condition</span><b>{bot.startCondition}</b></div><div className={dca.settingRow}><span>Base order</span><b>{money(bot.baseOrder)}</b></div><div className={dca.settingRow}><span>Order type</span><b>Market</b></div></div></section><section className={dca.settingsCard}><h3>Averaging orders</h3><div className={dca.settingRows}><div className={dca.settingRow}><span>Safety order</span><b>{money(bot.safetyOrder)}</b></div><div className={dca.settingRow}><span>Max safety orders</span><b>{bot.maxSafetyOrders}</b></div><div className={dca.settingRow}><span>Active safety orders</span><b>{bot.limitSafetyOrders}</b></div><div className={dca.settingRow}><span>Price deviation</span><b>{bot.deviation}%</b></div><div className={dca.settingRow}><span>Step scale</span><b>{bot.stepScale}×</b></div><div className={dca.settingRow}><span>Volume scale</span><b>{bot.volumeScale}×</b></div></div></section><section className={dca.settingsCard}><h3>Exit settings</h3><div className={dca.settingRows}><div className={dca.settingRow}><span>Take profit</span><b>{bot.takeProfit}%</b></div><div className={dca.settingRow}><span>Stop loss</span><b>{bot.stopEnabled ? `${bot.stopPct}%` : "Off"}</b></div></div></section><section className={dca.settingsCard}><h3>Concurrency</h3><div className={dca.settingRows}><div className={dca.settingRow}><span>Max active trades</span><b>{bot.maxActiveTrades}</b></div><div className={dca.settingRow}><span>Execution</span><b>{bot.executionMode}</b></div><div className={dca.settingRow}><span>Created</span><b>{dateLabel(bot.createdAt)}</b></div><div className={dca.settingRow}><span>Last updated</span><b>{dateLabel(bot.updatedAt)}</b></div></div></section></div>
  </div>;

  const renderBotEditor = () => <form className={dca.detailBody} onSubmit={saveBot}>
    <div className={dca.sectionDivider}><div><h3>Main settings</h3><p>Core pair and initial order configuration.</p></div></div>
    <div className={dca.editorGrid}><label><span>Bot name</span><input value={botForm.name} onChange={(event) => setBotForm((value) => ({...value,name:event.target.value}))}/></label><label><span>Pair</span><div style={{position:"relative"}}><span style={{position:"absolute",left:11,top:"50%",transform:"translateY(-50%)",zIndex:1,pointerEvents:"none",display:"grid"}}><CoinLogo symbol={botForm.pair} size={18}/></span><select style={{paddingLeft:39}} value={botForm.pair} onChange={(event) => setBotForm((value) => ({...value,pair:event.target.value}))}>{pairOptions.map((item) => <option key={item}>{item}</option>)}</select></div></label><label><span>Base order</span><div className={dca.inputUnit}><input type="number" min="1" step="0.01" value={botForm.baseOrder} onChange={(event) => setBotForm((value) => ({...value,baseOrder:Number(event.target.value)}))}/><b>USDT</b></div></label><label><span>Start condition</span><select value="Immediately" disabled><option>Immediately</option></select></label></div>
    <div className={dca.sectionDivider}><div><h3>Averaging orders</h3><p>Control the DCA ladder, order count and capital scaling.</p></div></div>
    <div className={dca.editorGrid}><label><span>Safety order</span><div className={dca.inputUnit}><input type="number" min="1" step="0.01" value={botForm.safetyOrder} onChange={(event) => setBotForm((value) => ({...value,safetyOrder:Number(event.target.value)}))}/><b>USDT</b></div></label><label><span>Max safety orders</span><input type="number" min="0" max="50" value={botForm.maxSafetyOrders} onChange={(event) => { const max = Math.max(0,Math.min(50,Number(event.target.value))); setBotForm((value) => ({...value,maxSafetyOrders:max,limitSafetyOrders:max === 0 ? 0 : Math.min(max,Math.max(1,value.limitSafetyOrders))})); }}/></label><label><span>Active safety orders</span><input type="number" min="0" max={botForm.maxSafetyOrders} value={botForm.limitSafetyOrders} onChange={(event) => setBotForm((value) => ({...value,limitSafetyOrders:value.maxSafetyOrders === 0 ? 0 : Math.min(value.maxSafetyOrders,Math.max(1,Number(event.target.value)))}))}/></label><label><span>Max active trades</span><input type="number" min="1" max="20" value={botForm.maxActiveTrades} onChange={(event) => setBotForm((value) => ({...value,maxActiveTrades:Math.max(1,Math.min(20,Number(event.target.value)))}))}/></label><label><span>Price deviation</span><div className={dca.inputUnit}><input type="number" min="0.1" step="0.1" value={botForm.deviation} onChange={(event) => setBotForm((value) => ({...value,deviation:Number(event.target.value)}))}/><b>%</b></div></label><label><span>Step scale</span><input type="number" min="0.1" step="0.1" value={botForm.stepScale} onChange={(event) => setBotForm((value) => ({...value,stepScale:Number(event.target.value)}))}/></label><label><span>Volume scale</span><input type="number" min="0.1" step="0.1" value={botForm.volumeScale} onChange={(event) => setBotForm((value) => ({...value,volumeScale:Number(event.target.value)}))}/></label></div>
    <div className={dca.sectionDivider}><div><h3>Exit settings</h3><p>Take profit and optional stop loss.</p></div></div>
    <div className={dca.editorGrid}><label><span>Take profit</span><div className={dca.inputUnit}><input type="number" min="0.1" step="0.1" value={botForm.takeProfit} onChange={(event) => setBotForm((value) => ({...value,takeProfit:Number(event.target.value)}))}/><b>%</b></div></label><label><span>Stop loss</span><select value={botForm.stopEnabled ? "On" : "Off"} onChange={(event) => setBotForm((value) => ({...value,stopEnabled:event.target.value === "On"}))}><option>Off</option><option>On</option></select></label>{botForm.stopEnabled && <label><span>Stop loss distance</span><div className={dca.inputUnit}><input type="number" min="0.1" step="0.1" value={botForm.stopPct} onChange={(event) => setBotForm((value) => ({...value,stopPct:Number(event.target.value)}))}/><b>%</b></div></label>}</div>
    <div className={dca.sectionDivider}><div><h3>DCA ladder preview</h3><p>Capital requirements based on the configured volume and step scales.</p></div></div>
    <div className={dca.preview}><div className={dca.previewTop}><span>Total planned capital</span><b>{money(botCapital(botForm))}</b><b>{botForm.maxSafetyOrders} safety orders</b></div><div className={dca.previewHead}><span>#</span><span>Cumulative drop</span><span>Order amount</span><span>Active window</span></div>{dcaPreview.map((row) => <div className={dca.previewRow} key={row.index}><span>{row.index}</span><span>-{row.deviation.toFixed(2)}%</span><span>{money(row.orderAmount)}</span><span>{row.index <= botForm.limitSafetyOrders ? "Active" : "Queued"}</span></div>)}</div>
    {botModalMode === "edit" && selectedBot?.activeTradeCount ? <div className={dca.editorNotice}>This bot currently has {selectedBot.activeTradeCount} active trade{selectedBot.activeTradeCount === 1 ? "" : "s"}. Its pair is locked until those trades close. Other saved settings apply to future trades; existing active trades retain their current trade-level DCA/TP/SL values.</div> : null}
    <div className={dca.modalFooter}><button type="button" onClick={() => botModalMode === "edit" && selectedBot ? setBotModalMode("view") : setBotModalMode(null)}>Cancel</button><button className={dca.primary} disabled={busy}>{busy ? "Saving…" : botModalMode === "create" ? "Create DCA Bot" : "Save changes"}</button></div>
  </form>;

  return <div className={styles.page}>
    <aside className={styles.sidebar}><div><div className={styles.brand}><span className={styles.brandMark}>LN</span><div><strong>LabNarrative</strong><small>Trading</small></div></div><nav className={styles.nav}><button className={section === "Dashboard" ? styles.navActive : ""} onClick={() => setSection("Dashboard")}><span>⌘</span>Dashboard</button><button className={section === "Portfolio" ? styles.navActive : ""} onClick={() => setSection("Portfolio")}><span>◔</span>Portfolio</button><button className={section === "Bots" ? styles.navActive : ""} onClick={() => setSection("Bots")}><span>▣</span>Bots</button><div className={dca.subnav}><button className={section === "Active Trades" ? dca.subnavActive : ""} onClick={() => setSection("Active Trades")}><span>•</span>Active Trades <em className={dca.subnavCount}>{activeTrades.length}</em></button><button className={section === "Closed Trades" ? dca.subnavActive : ""} onClick={() => setSection("Closed Trades")}><span>•</span>Closed Trades <em className={dca.subnavCount}>{closedTrades.length}</em></button></div></nav></div><div className={styles.sidebarBottom}><div><span className={currentAccount.kind === "real" ? styles.liveDot : styles.paperDot}/><div><strong>{currentAccount.kind === "real" ? "Real workspace" : "Paper workspace"}</strong><small>{currentAccount.kind === "real" ? (currentAccount.mode === "live" ? "Live" : "Shadow") : "Simulation"}</small></div></div></div></aside>
    <div className={styles.workspace}><header className={styles.topbar}><div><small>{section.toUpperCase()}</small><strong>{currentAccount.kind === "real" ? "Real Account" : "Paper Account"}</strong></div><div className={styles.topActions}><button className={styles.accountButton} onClick={() => setAccountMenu((value) => !value)}><span>{currentAccount.kind === "real" ? "R" : "P"}</span><div><strong>{currentAccount.kind === "real" ? "Real Account" : "Paper Account"}</strong><small>{currentAccount.kind === "real" ? (connected ? "Binance connected" : "Real workspace") : "Simulation"}</small></div><i>⌄</i></button>{accountMenu && <div className={styles.accountMenu}><button className={selectedKind === "real" ? styles.accountMenuActive : ""} onClick={() => chooseAccount("real")}><span>R</span><div><strong>Real Account</strong><small>{accounts.find((item) => item.kind === "real")?.exchangeStatus === "connected" ? "Binance connected" : "Connect an exchange"}</small></div></button><button className={selectedKind === "paper" ? styles.accountMenuActive : ""} onClick={() => chooseAccount("paper")}><span>P</span><div><strong>Paper Account</strong><small>Simulation workspace</small></div></button><div className={styles.menuDivider}/><button onClick={() => void signOut()}><span>↪</span><div><strong>Sign out</strong><small>End this session</small></div></button></div>}</div></header>
      <main className={styles.content}>{notice && <button className={styles.notice} onClick={() => setNotice("")}>{notice}<span>×</span></button>}{error && <button className={styles.errorNotice} onClick={() => setError("")}>{error}<span>×</span></button>}{loading ? <div className={styles.loadingCard}>Loading workspace…</div> : section === "Dashboard" ? dashboard : section === "Portfolio" ? portfolio : section === "Bots" ? botsPage : section === "Active Trades" ? tradesPage("Active") : tradesPage("Closed")}</main>
    </div>

    {exchangeModal && <div className={styles.backdrop} onMouseDown={(event) => { if (event.target === event.currentTarget) setExchangeModal(false); }}><section className={styles.modal}><div className={styles.modalHead}><div><small>EXCHANGES</small><h2>Connect Exchange</h2><p>Choose the exchange you want to connect to this Real Account.</p></div><button onClick={() => setExchangeModal(false)}>×</button></div><button className={styles.exchangeChoice} onClick={openBinance}><span className={styles.exchangeChoiceLogo}>◆</span><div><strong>Binance</strong><small>Spot trading · API connection</small></div><span>{connected ? "CONNECTED" : "CONNECT"}</span></button><div className={styles.comingSoon}>More exchanges and brokers will appear here as they are added.</div></section></div>}

    {botModalMode && <div className={dca.overlay} onMouseDown={(event) => { if (event.target === event.currentTarget) setBotModalMode(null); }}><section className={dca.detail}><div className={dca.detailHeader}><div className={dca.detailTitle}><small>{botModalMode === "create" ? "NEW DCA BOT" : selectedBot?.lifecycle === "closed" ? "CLOSED DCA BOT" : "DCA BOT"}</small><h2>{botModalMode === "create" ? "Create DCA Bot" : selectedBot?.name ?? "DCA Bot"}</h2><p style={{display:"flex",alignItems:"center",gap:6}}>{botModalMode === "create" ? <span>{currentAccount.kind === "real" ? "Binance Spot · Shadow" : "Paper simulation"}</span> : <><CoinLogo symbol={selectedBot?.pair ?? ""} size={15}/><span>{selectedBot?.pair ?? ""} · {selectedBot?.executionMode ?? ""}</span></>}</p></div><div className={dca.detailHeaderActions}>{botModalMode === "view" && selectedBot?.lifecycle !== "closed" && <><button className={dca.primary} onClick={editBot}>Edit bot</button><button disabled={busy} onClick={() => void toggleBot(selectedBot!)}>{selectedBot?.status === "Running" ? "Pause" : "Resume"}</button><button disabled={busy} onClick={() => void closeBot(selectedBot!)}>Close bot</button></>}<button className={dca.closeX} onClick={() => setBotModalMode(null)}>×</button></div></div>{botModalMode === "view" && selectedBot ? renderBotReadOnly(selectedBot) : renderBotEditor()}</section></div>}

    {selectedTrade && <DcaTradeChart pair={selectedTrade.pair} status={selectedTrade.status} entryPrice={selectedTrade.entryPrice} averagePrice={selectedTrade.averagePrice} createdAt={selectedTrade.openedAt} closedAt={selectedTrade.closedAt ?? undefined} exitPrice={selectedTrade.exitPrice ?? undefined} closeReason={selectedTrade.closeReason ?? undefined} lastPrice={selectedTrade.lastPrice ?? undefined} fills={selectedTrade.fills} takeProfitPrice={selectedTrade.takeProfitPrice} stopLossPrice={selectedTrade.stopLossPrice} nextAveragingPrice={selectedTrade.nextAveragingPrice} onClose={() => setSelectedTradeId(null)}/>}

    <button ref={hiddenBinanceButton} type="button" className={styles.hiddenButton}>Connect Binance</button>
    <BinanceConnectionLayer />
  </div>;
}
