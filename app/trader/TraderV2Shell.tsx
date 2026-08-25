"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { browserSupabase } from "../../lib/supabase-browser";
import BinanceConnectionLayer from "./BinanceConnectionLayer";
import styles from "./trader-v2.module.css";

type AccountKind = "paper" | "real";
type Section = "Dashboard" | "Portfolio" | "Bots";
type BotTab = "Active" | "Closed";
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
  createdAt: string;
  updatedAt: string;
};
type Trade = {
  id: string;
  pair: string;
  status: "Active" | "Closed";
  entryPrice: number;
  averagePrice: number;
  quantity: number;
  invested: number;
  lastPrice: number | null;
  realizedPnl: number | null;
  openedAt: string;
  closedAt: string | null;
  closeReason: string | null;
};
type WorkspaceResponse = {
  ok?: boolean;
  account?: WorkspaceAccount;
  controls?: { global_live_enabled?: boolean; kill_switch?: boolean };
  bots?: Bot[];
  trades?: Trade[];
  error?: string;
};
type Balance = { asset: string; free: number; locked: number };
type BalanceResponse = { ok?: boolean; balances?: Balance[]; quoteBalance?: number; error?: string };
type AccountsResponse = { ok?: boolean; accounts?: TraderAccount[]; defaultAccount?: AccountKind; error?: string };

type AuthMode = "login" | "signup";

const PAIRS = ["BTC/USDT", "ETH/USDT", "BNB/USDT", "SOL/USDT", "XRP/USDT", "ADA/USDT", "DOGE/USDT", "LINK/USDT", "AVAX/USDT", "USDC/USDT"];

function money(value: number | null | undefined) {
  const amount = Number(value ?? 0);
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(Number.isFinite(amount) ? amount : 0);
}
function amount(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 8 }).format(value);
}
function dateLabel(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
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

export default function TraderV2Shell() {
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
  const [accountMenu, setAccountMenu] = useState(false);
  const [exchangeModal, setExchangeModal] = useState(false);
  const [botModal, setBotModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const hiddenBinanceButton = useRef<HTMLButtonElement>(null);

  const [botName, setBotName] = useState("My DCA Bot");
  const [pair, setPair] = useState("BTC/USDT");
  const [baseOrder, setBaseOrder] = useState(25);
  const [safetyOrder, setSafetyOrder] = useState(25);
  const [maxSafetyOrders, setMaxSafetyOrders] = useState(5);
  const [deviation, setDeviation] = useState(1);
  const [stepScale, setStepScale] = useState(1);
  const [volumeScale, setVolumeScale] = useState(1);
  const [takeProfit, setTakeProfit] = useState(1.5);
  const [stopEnabled, setStopEnabled] = useState(false);
  const [stopPct, setStopPct] = useState(8);

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

  const loadAccounts = async (bootstrap = false) => {
    try {
      const result = await invokeAccount({ action: bootstrap ? "bootstrap" : "list" });
      const next = (result.accounts ?? []) as TraderAccount[];
      setAccounts(next);
      if (bootstrap) {
        const saved = sessionStorage.getItem("ln-trader-v2-account");
        const nextKind = saved === "paper" && next.some((account) => account.kind === "paper") ? "paper" : "real";
        setSelectedKind(nextKind);
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
    if (!connected) { setBalances([]); setQuoteBalance(null); return; }
    try {
      const result = await invokeBalances();
      setBalances(result.balances ?? []);
      setQuoteBalance(Number(result.quoteBalance ?? 0));
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
      if (hasSession) void loadAccounts(true);
    });
    const { data: listener } = browserSupabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      const hasSession = Boolean(session);
      setSignedIn(hasSession); setAuthReady(true);
      if (hasSession) { setAccountsReady(false); void loadAccounts(true); }
      else { setAccounts([]); setWorkspace(null); setAccountsReady(false); setSelectedKind("real"); }
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);

  useEffect(() => { if (currentAccount) void loadWorkspace(); }, [currentAccount?.id]);
  useEffect(() => { if (connected) void loadBalances(true); else { setBalances([]); setQuoteBalance(null); } }, [connected, currentAccount?.id]);
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
    setSelectedKind(kind); sessionStorage.setItem("ln-trader-v2-account", kind); setAccountMenu(false); setSection("Dashboard"); setBotTab("Active"); setNotice("");
  };
  const signOut = async () => {
    sessionStorage.removeItem("ln-trader-v2-account");
    await browserSupabase.auth.signOut();
  };
  const openBinance = () => {
    setExchangeModal(false);
    window.setTimeout(() => hiddenBinanceButton.current?.click(), 30);
  };
  const createBot = async (event: FormEvent) => {
    event.preventDefault();
    if (!currentAccount || busy) return;
    if (currentAccount.kind === "real" && !connected) { setBotModal(false); setExchangeModal(true); return; }
    setBusy(true); setError("");
    try {
      const result = await invokeAccount({ action: "create_bot", accountId: currentAccount.id, name: botName.trim(), pair, baseOrder, safetyOrder, maxSafetyOrders, limitSafetyOrders: 1, maxActiveTrades: 1, deviation, stepScale, volumeScale, takeProfit, stopEnabled, stopPct });
      setWorkspace(result); setBotModal(false); setBotTab("Active");
      setNotice(currentAccount.kind === "real" ? "Bot created in the Real Account. Execution remains in Shadow mode until Live is explicitly enabled later." : "Paper bot created and started.");
      setBotName("My DCA Bot");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Unable to create bot.";
      if (message.includes("exchange_connection_required")) { setBotModal(false); setExchangeModal(true); }
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
    if (!currentAccount || busy || !window.confirm(`Close ${bot.name}? Its history will remain available in Closed bots.`)) return;
    setBusy(true);
    try {
      const result = await invokeAccount({ action: "close_bot", accountId: currentAccount.id, botId: bot.id });
      setWorkspace(result); setNotice(`${bot.name} moved to Closed bots.`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to close bot."); }
    finally { setBusy(false); }
  };

  if (!authReady) return <div className={styles.loadingPage}>Checking secure session…</div>;
  if (!signedIn) return <TraderAuth />;
  if (!accountsReady || !currentAccount) return <div className={styles.loadingPage}>Loading your trading workspace…</div>;

  const dashboard = <>
    <div className={styles.pageHeading}><div><small>{currentAccount.kind === "real" ? "REAL ACCOUNT" : "PAPER ACCOUNT"}</small><h1>Dashboard</h1></div>{currentAccount.kind === "real" && <button className={styles.primaryButton} onClick={() => setExchangeModal(true)}>{connected ? "Exchange connected" : "Connect Exchange"}</button>}</div>
    <div className={styles.heroGrid}>
      <section className={styles.heroCard}><div className={styles.cardTop}><span>Total balance</span><small>{currentAccount.kind === "real" ? (connected ? "Binance + bot activity" : "Connect exchange to sync") : "Simulation"}</small></div><strong>{money(stateAccount?.equity ?? currentAccount.startingBalance)}</strong><div className={styles.heroMeta}><span>Available {money(stateAccount?.available)}</span><span>In bots {money(stateAccount?.invested)}</span></div><div className={styles.chartLine}><i/><i/><i/><i/><i/><i/><i/></div></section>
      <div className={styles.metricStack}><section className={styles.metricCard}><span>Active bots</span><strong>{activeBots.length}</strong><small>{activeBots.filter((bot) => bot.status === "Running").length} running</small></section><section className={styles.metricCard}><span>Active trades</span><strong>{activeTrades.length}</strong><small>{closedTrades.length} closed trades</small></section><section className={styles.metricCard}><span>PnL</span><strong className={(stateAccount?.realizedPnl ?? 0) + (stateAccount?.unrealizedPnl ?? 0) >= 0 ? styles.positive : styles.negative}>{money((stateAccount?.realizedPnl ?? 0) + (stateAccount?.unrealizedPnl ?? 0))}</strong><small>Realized + unrealized</small></section></div>
    </div>
    <div className={styles.dashboardGrid}>
      <section className={styles.panel}><div className={styles.panelTitle}><div><h2>Exchange</h2><p>{currentAccount.kind === "real" ? "Connected broker for this account" : "Paper account does not require an exchange"}</p></div></div>{currentAccount.kind === "real" ? <div className={styles.exchangeRow}><span className={styles.exchangeLogo}>◆</span><div><strong>Binance Spot</strong><small>{connected ? `Connected${currentAccount.apiKeyLast4 ? ` · ••••${currentAccount.apiKeyLast4}` : ""}` : "Not connected"}</small></div><span className={connected ? styles.connected : styles.muted}>{connected ? "CONNECTED" : "OFFLINE"}</span><button onClick={() => setExchangeModal(true)}>{connected ? "Manage" : "Connect"}</button></div> : <div className={styles.emptyCompact}><strong>Paper simulation</strong><p>Switch to Real Account from the top header when you want to connect an exchange.</p></div>}</section>
      <section className={styles.panel}><div className={styles.panelTitle}><div><h2>Recent bot activity</h2><p>Latest bots in this account</p></div><button onClick={() => setSection("Bots")}>View all</button></div><div className={styles.rows}>{activeBots.slice(0,4).map((bot) => <div className={styles.simpleRow} key={bot.id}><div><strong>{bot.name}</strong><small>{bot.pair} · {bot.executionMode}</small></div><span>{bot.status}</span></div>)}{!activeBots.length && <div className={styles.emptyCompact}><strong>No active bots</strong><p>Create your first bot to begin.</p></div>}</div></section>
    </div>
  </>;

  const portfolio = <>
    <div className={styles.pageHeading}><div><small>PORTFOLIO</small><h1>{currentAccount.kind === "real" ? "My Portfolio" : "Paper Portfolio"}</h1></div>{currentAccount.kind === "real" && <button className={styles.ghostButton} onClick={() => connected ? void loadBalances(false) : setExchangeModal(true)}>{connected ? "Refresh" : "Connect Exchange"}</button>}</div>
    <div className={styles.portfolioGrid}><section className={styles.heroCard}><div className={styles.cardTop}><span>Account equity</span><small>{currentAccount.kind === "real" ? "Real account" : "Simulation"}</small></div><strong>{money(stateAccount?.equity ?? currentAccount.startingBalance)}</strong><div className={styles.statGrid}><div><span>Available</span><b>{money(stateAccount?.available)}</b></div><div><span>Invested</span><b>{money(stateAccount?.invested)}</b></div><div><span>Reserved</span><b>{money(stateAccount?.reserved)}</b></div><div><span>Realized PnL</span><b className={(stateAccount?.realizedPnl ?? 0) >= 0 ? styles.positive : styles.negative}>{money(stateAccount?.realizedPnl)}</b></div></div></section><section className={styles.panel}><div className={styles.panelTitle}><div><h2>Assets</h2><p>{currentAccount.kind === "real" ? "Binance Spot balances" : "Paper account cash"}</p></div></div>{currentAccount.kind === "real" ? connected ? <div className={styles.assetRows}>{balances.length ? balances.map((item) => <div className={styles.assetRow} key={item.asset}><span className={styles.assetLogo}>{item.asset.slice(0, 2)}</span><div><strong>{item.asset}</strong><small>Free {amount(item.free)}</small></div><b>{amount(item.free + item.locked)}</b></div>) : <div className={styles.emptyCompact}><strong>No non-zero Binance assets</strong><p>Your account may currently be empty.</p></div>}</div> : <div className={styles.connectEmpty}><span>◆</span><strong>Connect your exchange</strong><p>Link Binance to display your actual Spot balances here.</p><button className={styles.primaryButton} onClick={() => setExchangeModal(true)}>Connect Exchange</button></div> : <div className={styles.assetRow}><span className={styles.assetLogo}>US</span><div><strong>USDT</strong><small>Paper balance</small></div><b>{money(stateAccount?.available ?? currentAccount.startingBalance)}</b></div>}</section></div>
  </>;

  const botsPage = <>
    <div className={styles.pageHeading}><div><small>BOTS</small><h1>Trading Bots</h1></div><button className={styles.primaryButton} onClick={() => currentAccount.kind === "real" && !connected ? setExchangeModal(true) : setBotModal(true)}>＋ Create Bot</button></div>
    <div className={styles.tabs}><button className={botTab === "Active" ? styles.tabActive : ""} onClick={() => setBotTab("Active")}>Active <span>{activeBots.length}</span></button><button className={botTab === "Closed" ? styles.tabActive : ""} onClick={() => setBotTab("Closed")}>Closed <span>{closedBots.length}</span></button></div>
    <section className={styles.panel}><div className={styles.botTableHead}><span>Bot</span><span>Pair</span><span>Capital</span><span>Take profit</span><span>Status</span><span/></div>{displayBots.length ? displayBots.map((bot) => <div className={styles.botRow} key={bot.id}><div><strong>{bot.name}</strong><small>{bot.startCondition} · {bot.executionMode}</small></div><b>{bot.pair}</b><span>{money(bot.baseOrder + bot.safetyOrder * bot.maxSafetyOrders)}</span><span>{bot.takeProfit}%</span><span className={bot.status === "Running" && bot.lifecycle !== "closed" ? styles.connected : styles.muted}>{bot.lifecycle === "closed" ? "CLOSED" : bot.status.toUpperCase()}</span><div className={styles.rowActions}>{bot.lifecycle !== "closed" && <><button onClick={() => void toggleBot(bot)}>{bot.status === "Running" ? "Pause" : "Resume"}</button><button onClick={() => void closeBot(bot)}>Close</button></>}</div></div>) : <div className={styles.emptyState}><strong>No {botTab.toLowerCase()} bots</strong><p>{botTab === "Active" ? "Create a bot to start automating this account." : "Bots you close will remain here with their history."}</p></div>}</section>
  </>;

  return <div className={styles.page}>
    <aside className={styles.sidebar}><div><div className={styles.brand}><span className={styles.brandMark}>LN</span><div><strong>LabNarrative</strong><small>Trading</small></div></div><nav className={styles.nav}><button className={section === "Dashboard" ? styles.navActive : ""} onClick={() => setSection("Dashboard")}><span>⌘</span>Dashboard</button><button className={section === "Portfolio" ? styles.navActive : ""} onClick={() => setSection("Portfolio")}><span>◔</span>Portfolio</button><button className={section === "Bots" ? styles.navActive : ""} onClick={() => setSection("Bots")}><span>▣</span>Bots</button></nav></div><div className={styles.sidebarBottom}><div><span className={currentAccount.kind === "real" ? styles.liveDot : styles.paperDot}/><div><strong>{currentAccount.kind === "real" ? "Real workspace" : "Paper workspace"}</strong><small>{currentAccount.kind === "real" ? (currentAccount.mode === "live" ? "Live" : "Shadow") : "Simulation"}</small></div></div></div></aside>
    <div className={styles.workspace}><header className={styles.topbar}><div><small>{section.toUpperCase()}</small><strong>{currentAccount.kind === "real" ? "Real Account" : "Paper Account"}</strong></div><div className={styles.topActions}><button className={styles.accountButton} onClick={() => setAccountMenu((value) => !value)}><span>{currentAccount.kind === "real" ? "R" : "P"}</span><div><strong>{currentAccount.kind === "real" ? "Real Account" : "Paper Account"}</strong><small>{currentAccount.kind === "real" ? (connected ? "Binance connected" : "Real workspace") : "Simulation"}</small></div><i>⌄</i></button>{accountMenu && <div className={styles.accountMenu}><button className={selectedKind === "real" ? styles.accountMenuActive : ""} onClick={() => chooseAccount("real")}><span>R</span><div><strong>Real Account</strong><small>{accounts.find((item) => item.kind === "real")?.exchangeStatus === "connected" ? "Binance connected" : "Connect an exchange"}</small></div></button><button className={selectedKind === "paper" ? styles.accountMenuActive : ""} onClick={() => chooseAccount("paper")}><span>P</span><div><strong>Paper Account</strong><small>Simulation workspace</small></div></button><div className={styles.menuDivider}/><button onClick={() => void signOut()}><span>↪</span><div><strong>Sign out</strong><small>End this session</small></div></button></div>}</div></header>
      <main className={styles.content}>{notice && <button className={styles.notice} onClick={() => setNotice("")}>{notice}<span>×</span></button>}{error && <button className={styles.errorNotice} onClick={() => setError("")}>{error}<span>×</span></button>}{loading ? <div className={styles.loadingCard}>Loading workspace…</div> : section === "Dashboard" ? dashboard : section === "Portfolio" ? portfolio : botsPage}</main>
    </div>

    {exchangeModal && <div className={styles.backdrop} onMouseDown={(event) => { if (event.target === event.currentTarget) setExchangeModal(false); }}><section className={styles.modal}><div className={styles.modalHead}><div><small>EXCHANGES</small><h2>Connect Exchange</h2><p>Choose the exchange you want to connect to this Real Account.</p></div><button onClick={() => setExchangeModal(false)}>×</button></div><button className={styles.exchangeChoice} onClick={openBinance}><span className={styles.exchangeChoiceLogo}>◆</span><div><strong>Binance</strong><small>Spot trading · API connection</small></div><span>{connected ? "CONNECTED" : "CONNECT"}</span></button><div className={styles.comingSoon}>More exchanges and brokers will appear here as they are added.</div></section></div>}

    {botModal && <div className={styles.backdrop} onMouseDown={(event) => { if (event.target === event.currentTarget) setBotModal(false); }}><form className={`${styles.modal} ${styles.botModal}`} onSubmit={createBot}><div className={styles.modalHead}><div><small>{currentAccount.kind === "real" ? "REAL ACCOUNT" : "PAPER ACCOUNT"}</small><h2>Create Bot</h2><p>Start with the core DCA settings. More strategy conditions will be added in the next V2 phase.</p></div><button type="button" onClick={() => setBotModal(false)}>×</button></div><div className={styles.formGrid}><label><span>Bot name</span><input value={botName} onChange={(event) => setBotName(event.target.value)} /></label><label><span>Pair</span><select value={pair} onChange={(event) => setPair(event.target.value)}>{PAIRS.map((item) => <option key={item}>{item}</option>)}</select></label><label><span>Base order</span><div className={styles.inputUnit}><input type="number" min="1" value={baseOrder} onChange={(event) => setBaseOrder(Number(event.target.value))}/><b>USDT</b></div></label><label><span>Safety order</span><div className={styles.inputUnit}><input type="number" min="1" value={safetyOrder} onChange={(event) => setSafetyOrder(Number(event.target.value))}/><b>USDT</b></div></label><label><span>Max safety orders</span><input type="number" min="0" max="50" value={maxSafetyOrders} onChange={(event) => setMaxSafetyOrders(Number(event.target.value))}/></label><label><span>Price deviation</span><div className={styles.inputUnit}><input type="number" min="0.1" step="0.1" value={deviation} onChange={(event) => setDeviation(Number(event.target.value))}/><b>%</b></div></label><label><span>Step scale</span><input type="number" min="0.1" step="0.1" value={stepScale} onChange={(event) => setStepScale(Number(event.target.value))}/></label><label><span>Volume scale</span><input type="number" min="0.1" step="0.1" value={volumeScale} onChange={(event) => setVolumeScale(Number(event.target.value))}/></label><label><span>Take profit</span><div className={styles.inputUnit}><input type="number" min="0" step="0.1" value={takeProfit} onChange={(event) => setTakeProfit(Number(event.target.value))}/><b>%</b></div></label><label className={styles.stopField}><span>Stop loss</span><button type="button" className={`${styles.switch} ${stopEnabled ? styles.switchOn : ""}`} onClick={() => setStopEnabled((value) => !value)}><i/></button></label>{stopEnabled && <label><span>Stop loss</span><div className={styles.inputUnit}><input type="number" min="0" step="0.1" value={stopPct} onChange={(event) => setStopPct(Number(event.target.value))}/><b>%</b></div></label>}</div><div className={styles.modalActions}><button type="button" className={styles.ghostButton} onClick={() => setBotModal(false)}>Cancel</button><button className={styles.primaryButton} disabled={busy}>{busy ? "Creating…" : "Create Bot"}</button></div></form></div>}

    <button ref={hiddenBinanceButton} type="button" className={styles.hiddenButton}>Connect Binance</button>
    <BinanceConnectionLayer />
  </div>;
}
