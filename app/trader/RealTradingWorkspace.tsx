"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { browserSupabase } from "../../lib/supabase-browser";
import styles from "./trader.module.css";

type Section = "Dashboard" | "My Portfolio" | "DCA bots" | "Smart Trades";
type RealAccount = {
  id: string;
  name: string;
  mode: "paper" | "shadow" | "live";
  exchangeStatus: string;
  apiKeyLast4: string | null;
};
type WorkspaceAccount = {
  id: string;
  name: string;
  kind: "paper" | "real";
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
type Controls = {
  global_live_enabled?: boolean;
  kill_switch?: boolean;
  live_confirmed_at?: string | null;
};
type Bot = {
  id: string;
  name: string;
  status: "Running" | "Stopped";
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
type Order = {
  id: string;
  pair: string;
  kind: string;
  side: string;
  status: string;
  price: number | null;
  amount: number;
  reserved: number;
};
type WorkspaceResponse = {
  ok?: boolean;
  account?: WorkspaceAccount;
  controls?: Controls;
  bots?: Bot[];
  trades?: Trade[];
  orders?: Order[];
  worker?: { status?: string; started_at?: string; error?: string | null } | null;
  botId?: string;
  error?: string;
};
type Balance = { asset: string; free: number; locked: number };
type BalanceResponse = {
  ok?: boolean;
  balances?: Balance[];
  quoteAsset?: string;
  quoteBalance?: number;
  error?: string;
};

type Props = {
  account: RealAccount;
  onOpenAccounts: () => void;
};

const NAV: Section[] = ["Dashboard", "My Portfolio", "DCA bots", "Smart Trades"];
const PAIRS = ["BTC/USDT", "ETH/USDT", "BNB/USDT", "SOL/USDT", "XRP/USDT", "ADA/USDT", "DOGE/USDT", "LINK/USDT", "AVAX/USDT", "USDC/USDT"];

function compactMoney(value: number | null | undefined) {
  const amount = Number(value ?? 0);
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(Number.isFinite(amount) ? amount : 0);
}
function qty(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 8 }).format(value);
}
function pct(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}
function navGlyph(section: Section) {
  if (section === "Dashboard") return "⌘";
  if (section === "My Portfolio") return "◔";
  if (section === "DCA bots") return "▣";
  return "↕";
}

async function invokeWorkspace(body: Record<string, unknown>) {
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
  const result = (data ?? {}) as WorkspaceResponse;
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

export default function RealTradingWorkspace({ account, onOpenAccounts }: Props) {
  const [section, setSection] = useState<Section>("Dashboard");
  const [workspace, setWorkspace] = useState<WorkspaceResponse | null>(null);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [quoteBalance, setQuoteBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshingBalances, setRefreshingBalances] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [dcaCreate, setDcaCreate] = useState(false);

  const [botName, setBotName] = useState("My Real DCA Bot");
  const [pair, setPair] = useState("BTC/USDT");
  const [baseOrder, setBaseOrder] = useState(25);
  const [safetyOrder, setSafetyOrder] = useState(25);
  const [maxSafetyOrders, setMaxSafetyOrders] = useState(5);
  const [limitSafetyOrders, setLimitSafetyOrders] = useState(1);
  const [maxActiveTrades, setMaxActiveTrades] = useState(1);
  const [deviation, setDeviation] = useState(1);
  const [stepScale, setStepScale] = useState(1);
  const [volumeScale, setVolumeScale] = useState(1);
  const [takeProfit, setTakeProfit] = useState(1.5);
  const [stopEnabled, setStopEnabled] = useState(false);
  const [stopPct, setStopPct] = useState(8);

  const bots = workspace?.bots ?? [];
  const trades = workspace?.trades ?? [];
  const orders = workspace?.orders ?? [];
  const stateAccount = workspace?.account;
  const controls = workspace?.controls;
  const connected = account.exchangeStatus === "connected";
  const activeBots = bots.filter((bot) => bot.status === "Running");
  const activeTrades = trades.filter((trade) => trade.status === "Active");
  const closedTrades = trades.filter((trade) => trade.status === "Closed");
  const liveOff = controls?.global_live_enabled !== true;
  const killOn = controls?.kill_switch !== false;

  const totalBotCapital = useMemo(() => {
    return baseOrder + Array.from({ length: Math.max(0, maxSafetyOrders) }, (_, index) => safetyOrder * Math.pow(volumeScale, index)).reduce((sum, value) => sum + value, 0);
  }, [baseOrder, safetyOrder, maxSafetyOrders, volumeScale]);

  const loadWorkspace = async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const result = await invokeWorkspace({ action: "workspace_state", accountId: account.id });
      setWorkspace(result);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load Real Account workspace.");
    } finally {
      if (!quiet) setLoading(false);
    }
  };

  const loadBalances = async (quiet = false) => {
    if (!connected) {
      setBalances([]);
      setQuoteBalance(null);
      return;
    }
    if (!quiet) setRefreshingBalances(true);
    try {
      const result = await invokeBalances();
      setBalances(result.balances ?? []);
      setQuoteBalance(Number(result.quoteBalance ?? 0));
      await loadWorkspace(true);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      if (!quiet) setNotice(message.includes("credential") ? "Binance credentials need to be reverified." : "Could not refresh Binance balances right now.");
    } finally {
      if (!quiet) setRefreshingBalances(false);
    }
  };

  useEffect(() => {
    void (async () => {
      if (connected) await loadBalances(true);
      await loadWorkspace();
    })();
  }, [account.id, connected]);

  useEffect(() => {
    const timer = window.setInterval(() => { void loadWorkspace(true); }, 5000);
    return () => window.clearInterval(timer);
  }, [account.id]);

  useEffect(() => {
    if (!connected) return;
    const timer = window.setInterval(() => { void loadBalances(true); }, 60000);
    return () => window.clearInterval(timer);
  }, [account.id, connected]);

  const openSection = (next: Section) => {
    setSection(next);
    if (next !== "DCA bots") setDcaCreate(false);
  };

  const createBot = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (!connected) {
      setNotice("Connect Binance before creating a Real Account bot.");
      return;
    }
    if (!botName.trim() || baseOrder <= 0 || safetyOrder <= 0) {
      setNotice("Add a bot name and valid order amounts.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await invokeWorkspace({
        action: "create_shadow_bot",
        accountId: account.id,
        name: botName.trim(), pair, baseOrder, safetyOrder, maxSafetyOrders, limitSafetyOrders,
        maxActiveTrades, deviation, stepScale, volumeScale, takeProfit, stopEnabled, stopPct,
      });
      setWorkspace(result);
      setDcaCreate(false);
      setNotice("DCA bot created in the Real Account. It is running in Shadow mode; no Binance order is sent.");
      setBotName("My Real DCA Bot");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to create DCA bot.");
    } finally {
      setBusy(false);
    }
  };

  const toggleBot = async (bot: Bot) => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await invokeWorkspace({ action: "set_bot_status", accountId: account.id, botId: bot.id, status: bot.status === "Running" ? "Stopped" : "Running" });
      setWorkspace(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to update bot status.");
    } finally {
      setBusy(false);
    }
  };

  const tradePnl = (trade: Trade) => {
    if (trade.status === "Closed") return trade.realizedPnl ?? 0;
    const mark = trade.lastPrice ?? trade.averagePrice;
    return (mark - trade.averagePrice) * trade.quantity;
  };

  const dashboard = <div className={styles.pageContent}>
    <div className={styles.pageHeading}><div><span className={styles.eyebrow}>REAL ACCOUNT · SHADOW</span><h1>Dashboard</h1></div></div>
    <div className={styles.moduleCards}>
      <section className={styles.moduleCard}><div className={styles.moduleTitle}><h3>DCA Bots</h3><button onClick={() => { setSection("DCA bots"); setDcaCreate(true); }}>Create</button></div><div className={styles.moduleLine}><span>Active Bots</span><b>{activeBots.length}</b></div><div className={styles.moduleLine}><span>Execution</span><b>Shadow</b></div><div className={styles.moduleLine}><span>Live orders</span><b className={styles.greenText}>OFF</b></div></section>
      <section className={styles.moduleCard}><div className={styles.moduleTitle}><h3>Trades</h3><button onClick={() => setSection("Smart Trades")}>Open</button></div><div className={styles.moduleLine}><span>Active</span><b>{activeTrades.length}</b></div><div className={styles.moduleLine}><span>Closed</span><b>{closedTrades.length}</b></div><div className={styles.moduleLine}><span>Unrealized PnL</span><b className={(stateAccount?.unrealizedPnl ?? 0) >= 0 ? styles.greenText : styles.redText}>{compactMoney(stateAccount?.unrealizedPnl)}</b></div></section>
      <section className={styles.moduleCard}><div className={styles.moduleTitle}><h3>My Portfolio</h3><button onClick={() => setSection("My Portfolio")}>Open</button></div><div className={styles.moduleLine}><span>Shadow equity</span><b>{compactMoney(stateAccount?.equity)}</b></div><div className={styles.moduleLine}><span>Available USDT</span><b>{compactMoney(stateAccount?.available)}</b></div><div className={styles.moduleLine}><span>Reserved</span><b>{compactMoney(stateAccount?.reserved)}</b></div></section>
      <section className={styles.moduleCard}><div className={styles.moduleTitle}><h3>Binance Spot</h3>{connected ? <button onClick={() => void loadBalances()}>Refresh</button> : <button>Connect Binance</button>}</div><div className={styles.moduleLine}><span>Connection</span><b className={connected ? styles.greenText : styles.redText}>{connected ? "Connected" : "Not connected"}</b></div><div className={styles.moduleLine}><span>Binance USDT</span><b>{quoteBalance == null ? "—" : compactMoney(quoteBalance)}</b></div><div className={styles.moduleLine}><span>Kill switch</span><b className={styles.greenText}>{killOn ? "ON" : "CHECK"}</b></div></section>
    </div>
    <section className={styles.accountBanner}><span>ⓘ</span><div><strong>Real Account is in Shadow mode</strong><p>Strategies use your Real Account workspace and Binance market data, but orders are simulated. Live execution remains OFF and the kill switch remains ON.</p></div><button onClick={onOpenAccounts}>Switch account</button></section>
    <section className={`${styles.card} ${styles.totalBalanceCard}`}><div className={styles.cardHeader}><h2>Account capital</h2><button onClick={() => void loadWorkspace(true)}>↻</button></div><div className={styles.totalBalanceBody}><div className={styles.balanceNumbers}><span>Shadow equity</span><strong>{compactMoney(stateAccount?.equity)}</strong><em className={(stateAccount?.unrealizedPnl ?? 0) >= 0 ? styles.greenText : styles.redText}>{compactMoney(stateAccount?.unrealizedPnl)} unrealized</em><small>Available: {compactMoney(stateAccount?.available)} · Reserved: {compactMoney(stateAccount?.reserved)}</small></div></div></section>
  </div>;

  const portfolio = <div className={styles.pageContent}>
    <div className={styles.pageHeading}><div><span className={styles.eyebrow}>MY PORTFOLIO</span><h1>Real Account</h1></div>{connected ? <button className={styles.primaryButton} onClick={() => void loadBalances()} disabled={refreshingBalances}>{refreshingBalances ? "Refreshing…" : "Refresh Binance"}</button> : <button className={styles.primaryButton}>Connect Binance</button>}</div>
    <section className={`${styles.card} ${styles.statisticsCard}`}><div className={styles.cardHeader}><h2>Shadow trading capital</h2><span>REAL / SHADOW</span></div><div className={styles.statisticsBody}><div className={styles.balanceNumbers}><span>Equity</span><strong>{compactMoney(stateAccount?.equity)}</strong><em className={(stateAccount?.unrealizedPnl ?? 0) >= 0 ? styles.greenText : styles.redText}>{compactMoney(stateAccount?.unrealizedPnl)} unrealized</em><small>Invested: {compactMoney(stateAccount?.invested)} · Reserved: {compactMoney(stateAccount?.reserved)} · Available: {compactMoney(stateAccount?.available)}</small></div></div></section>
    <div className={styles.exchangeDivider}>BINANCE SPOT BALANCES</div>
    <section className={styles.exchangeCard}><div className={styles.exchangeCardHead}><span className={styles.exchangeIcon}>◆</span><div><h3>Binance Spot</h3><p>{connected ? `Connected${account.apiKeyLast4 ? ` · key ••••${account.apiKeyLast4}` : ""}` : "Not connected"}</p></div><button onClick={() => void loadBalances()}>↻</button></div><div className={styles.exchangeStats}><div><span>USDT available at sync</span><b>{quoteBalance == null ? "—" : compactMoney(quoteBalance)}</b></div><div><span>Live execution</span><b className={styles.greenText}>{liveOff ? "OFF" : "CHECK"}</b></div><div><span>Kill switch</span><b className={styles.greenText}>{killOn ? "ON" : "CHECK"}</b></div></div></section>
    <section className={styles.card}><div className={styles.listToolbar}><h2>Assets</h2><span>{balances.length} non-zero assets</span></div><div className={styles.tableWrap}><table><thead><tr><th>Asset</th><th>Free</th><th>Locked</th><th>Total</th></tr></thead><tbody>{balances.length ? balances.map((balance) => <tr key={balance.asset}><td><strong>{balance.asset}</strong></td><td>{qty(balance.free)}</td><td>{qty(balance.locked)}</td><td>{qty(balance.free + balance.locked)}</td></tr>) : <tr className={styles.emptyRow}><td colSpan={4}>{connected ? "No non-zero Binance balances returned." : "Connect Binance to load real balances."}</td></tr>}</tbody></table></div></section>
  </div>;

  const dcaList = <div className={styles.pageContent}>
    <div className={styles.pageHeading}><div><span className={styles.eyebrow}>DCA BOT · REAL ACCOUNT</span><h1>My bots</h1></div><button className={styles.primaryButton} onClick={() => setDcaCreate(true)}>＋ Create DCA Bot</button></div>
    <div className={styles.rangePills}><button className={styles.rangeActive}>All</button><button>Shadow</button><button>Running</button><button>Stopped</button></div>
    <div className={styles.botAnalytics}><div className={styles.botStatsColumn}><section><span>Execution</span><strong>Shadow</strong><small>No Binance orders</small></section><section><span>Active bots</span><strong>{activeBots.length}</strong><small>Total bots: {bots.length}</small></section></div><section className={styles.botChartCard}><div><button className={styles.choiceActive}>Safety</button></div><div style={{ padding: "32px" }}><strong>Live execution OFF</strong><p>Real-account DCA strategies run through the durable worker in Shadow mode. The separate Live transition is still locked.</p></div></section></div>
    <section className={styles.card}><div className={styles.listToolbar}><h2>Bots</h2><button onClick={() => void loadWorkspace(true)}>Refresh</button></div><div className={styles.tableWrap}><table><thead><tr><th>Name</th><th>Pair</th><th>Base / Safety</th><th>Safety orders</th><th>Take profit</th><th>Execution</th><th>Status</th></tr></thead><tbody>{bots.length ? bots.map((bot) => <tr key={bot.id}><td><strong>{bot.name}</strong><small>Long · {bot.startCondition}</small></td><td>{bot.pair}</td><td>{compactMoney(bot.baseOrder)} / {compactMoney(bot.safetyOrder)}</td><td>{bot.maxSafetyOrders}</td><td>{bot.takeProfit}%</td><td><strong>{bot.executionMode === "shadow" ? "Shadow" : bot.executionMode}</strong></td><td><button className={`${styles.statusSwitch} ${bot.status === "Running" ? styles.switchOn : ""}`} disabled={busy} onClick={() => void toggleBot(bot)}><i/></button><small>{bot.status}</small></td></tr>) : <tr className={styles.emptyRow}><td colSpan={7}>No Real Account DCA bots yet.</td></tr>}</tbody></table></div></section>
  </div>;

  const dcaBuilder = <div className={styles.builderPage}>
    <div className={styles.pageHeading}><div><span className={styles.eyebrow}>DCA BOT · REAL ACCOUNT</span><h1>Create DCA Bot</h1><p>Binance Spot · Shadow execution</p></div><button className={styles.backLink} onClick={() => setDcaCreate(false)}>Back to bots</button></div>
    <form className={styles.builderGrid} onSubmit={createBot}><div className={styles.builderForm}>
      <section className={styles.builderCard}><h2>Main settings</h2><div className={styles.formGrid}><label><span>Bot name</span><input value={botName} onChange={(event) => setBotName(event.target.value)}/></label><label><span>Pair</span><select value={pair} onChange={(event) => setPair(event.target.value)}>{PAIRS.map((item) => <option key={item}>{item}</option>)}</select></label><label><span>Base order</span><div className={styles.inputUnit}><input type="number" min="1" step="0.01" value={baseOrder} onChange={(event) => setBaseOrder(Math.max(1, Number(event.target.value)))}/><b>USDT</b></div></label><label><span>Safety order</span><div className={styles.inputUnit}><input type="number" min="1" step="0.01" value={safetyOrder} onChange={(event) => setSafetyOrder(Math.max(1, Number(event.target.value)))}/><b>USDT</b></div></label></div></section>
      <section className={styles.builderCard}><h2>Averaging orders</h2><div className={styles.formGrid}><label><span>Max safety orders</span><input type="number" min="0" max="50" value={maxSafetyOrders} onChange={(event) => { const value = Math.max(0, Math.min(50, Number(event.target.value))); setMaxSafetyOrders(value); setLimitSafetyOrders(Math.min(Math.max(0, value), Math.max(1, Math.min(limitSafetyOrders, value || 1)))); }}/></label><label><span>Active safety orders</span><input type="number" min="0" max={Math.max(0, maxSafetyOrders)} value={limitSafetyOrders} onChange={(event) => setLimitSafetyOrders(Math.max(0, Math.min(maxSafetyOrders, Number(event.target.value))))}/></label><label><span>Price deviation</span><div className={styles.inputUnit}><input type="number" min="0.1" step="0.1" value={deviation} onChange={(event) => setDeviation(Math.max(.1, Number(event.target.value)))}/><b>%</b></div></label><label><span>Step scale</span><input type="number" min="0.1" step="0.1" value={stepScale} onChange={(event) => setStepScale(Math.max(.1, Number(event.target.value)))}/></label><label><span>Volume scale</span><input type="number" min="0.1" step="0.1" value={volumeScale} onChange={(event) => setVolumeScale(Math.max(.1, Number(event.target.value)))}/></label><label><span>Max active trades</span><input type="number" min="1" max="20" value={maxActiveTrades} onChange={(event) => setMaxActiveTrades(Math.max(1, Math.min(20, Number(event.target.value))))}/></label></div></section>
      <section className={styles.builderCard}><h2>Exit settings</h2><div className={styles.formGrid}><label><span>Start condition</span><div className={styles.fakeSelect}>Immediately</div></label><label><span>Take profit</span><div className={styles.inputUnit}><input type="number" min="0.1" step="0.1" value={takeProfit} onChange={(event) => setTakeProfit(Math.max(.1, Number(event.target.value)))}/><b>%</b></div></label><label><span>Stop loss</span><select value={stopEnabled ? "On" : "Off"} onChange={(event) => setStopEnabled(event.target.value === "On")}><option>Off</option><option>On</option></select></label>{stopEnabled && <label><span>Stop loss distance</span><div className={styles.inputUnit}><input type="number" min="0.1" step="0.1" value={stopPct} onChange={(event) => setStopPct(Math.max(.1, Number(event.target.value)))}/><b>%</b></div></label>}</div></section>
    </div><aside className={styles.botPreview}><div className={styles.previewHeader}><div><span className={styles.coinAvatar}>{pair.slice(0,2)}</span><div><strong>{botName || "DCA Bot"}</strong><small>{pair} · Binance Spot</small></div></div><span>Shadow</span></div><div className={styles.previewSummary}><div><span>Base order</span><strong>{compactMoney(baseOrder)}</strong></div><div><span>Max capital</span><strong>{compactMoney(totalBotCapital)}</strong></div><div><span>Safety orders</span><strong>{maxSafetyOrders}</strong></div><div><span>Take profit</span><strong>{takeProfit}%</strong></div></div><p className={styles.helperText}>This bot belongs only to the Real Account. It will be evaluated by the durable server worker, but execution remains Shadow until Live is explicitly unlocked later.</p><button type="submit" className={styles.primaryButton} disabled={busy || !connected}>{busy ? "Creating…" : connected ? "Create Shadow DCA bot" : "Connect Binance first"}</button></aside></form>
  </div>;

  const smartTrades = <div className={styles.pageContent}>
    <div className={styles.pageHeading}><div><span className={styles.eyebrow}>TRADES · REAL ACCOUNT</span><h1>Trades</h1></div><button className={styles.primaryButton} onClick={() => { setSection("DCA bots"); setDcaCreate(true); }}>Create DCA Bot</button></div>
    <section className={styles.accountBanner}><span>ⓘ</span><div><strong>Shadow trades only</strong><p>Trades opened by Real Account DCA bots are recorded here with real market prices. No Binance order is submitted while Live execution is OFF.</p></div></section>
    <section className={styles.card}><div className={styles.listToolbar}><h2>Trade history</h2><span>{activeTrades.length} active · {closedTrades.length} closed</span></div><div className={styles.tableWrap}><table><thead><tr><th>Pair</th><th>Opened</th><th>Invested</th><th>Average price</th><th>Status</th><th>PnL</th></tr></thead><tbody>{trades.length ? trades.map((trade) => { const pnl = tradePnl(trade); return <tr key={trade.id}><td><strong>{trade.pair}</strong><small>{trade.id}</small></td><td>{new Date(trade.openedAt).toLocaleString()}</td><td>{compactMoney(trade.invested)}</td><td>{compactMoney(trade.averagePrice)}</td><td>{trade.status}<small>{trade.closeReason || (trade.status === "Active" ? "Shadow position" : "")}</small></td><td className={pnl >= 0 ? styles.greenText : styles.redText}>{compactMoney(pnl)}</td></tr>; }) : <tr className={styles.emptyRow}><td colSpan={6}>No Real Account shadow trades yet.</td></tr>}</tbody></table></div></section>
    {orders.length > 0 && <section className={styles.card}><div className={styles.listToolbar}><h2>Open orders</h2><span>{orders.length}</span></div><div className={styles.tableWrap}><table><thead><tr><th>Pair</th><th>Type</th><th>Side</th><th>Price</th><th>Reserved</th><th>Status</th></tr></thead><tbody>{orders.map((order) => <tr key={order.id}><td>{order.pair}</td><td>{order.kind}</td><td>{order.side}</td><td>{order.price == null ? "—" : compactMoney(order.price)}</td><td>{compactMoney(order.reserved)}</td><td>{order.status}</td></tr>)}</tbody></table></div></section>}
  </div>;

  return <main className={styles.appShell}>
    <header className={styles.topHeader}><button className={styles.wordmark} onClick={() => openSection("Dashboard")}><span>LN</span><strong>LabNarrative</strong></button><button className={styles.sidebarCollapse}>▯</button><button className={styles.accountSummary} onClick={onOpenAccounts}><span>REAL ACCOUNT</span><strong>{compactMoney(stateAccount?.equity)}</strong><small className={styles.greenText}>SHADOW · LIVE OFF</small></button><div className={styles.headerSpacer}/>{!connected && <button className={styles.fullAccessButton}>Connect Binance</button>}<button className={styles.profileButton} onClick={onOpenAccounts}>R</button><span className={styles.headerChevron}>⌄</span></header>
    <aside className={styles.sidebar}><nav className={styles.nav}>{NAV.map((item) => <button key={item} className={section === item ? styles.navActive : ""} onClick={() => openSection(item)}><span>{navGlyph(item)}</span>{item === "DCA bots" ? "DCA Bot" : item === "Smart Trades" ? "SmartTrade" : item}</button>)}</nav><div className={styles.sidebarPromo}><strong>◆ Binance Spot</strong><p>{connected ? "Connected · Real Account" : "Not connected"}</p></div><div className={styles.sidebarFooter}><span>Shadow mode</span><span>Live OFF</span></div></aside>
    <section className={styles.main}><div className={styles.demoBanner}><span>ⓘ</span> Real Account · Shadow execution <button onClick={onOpenAccounts}>Switch account</button></div>{notice && <button className={styles.notice} onClick={() => setNotice("")}>{notice}<span>×</span></button>}{error && <button className={styles.notice} onClick={() => setError("")}>{error}<span>×</span></button>}{loading ? <div className={styles.pageContent}><div className={styles.pageHeading}><h1>Loading Real Account…</h1></div></div> : <>{section === "Dashboard" && dashboard}{section === "My Portfolio" && portfolio}{section === "DCA bots" && (dcaCreate ? dcaBuilder : dcaList)}{section === "Smart Trades" && smartTrades}</>}</section>
  </main>;
}
