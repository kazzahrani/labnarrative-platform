"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { browserSupabase } from "../../lib/supabase-browser";
import CoinLogo from "./CoinLogo";
import styles from "./overview-command-center.module.css";

type Account = {
  id: string;
  name: string;
  kind: "paper" | "real";
  mode: string;
  startingBalance: number;
  exchangeStatus?: string;
  apiKeyLast4?: string | null;
};
type WorkspaceAccount = {
  startingBalance?: number;
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
  status: string;
  lifecycle: string;
  pair: string;
  pnl: number;
  activeTradeCount: number;
  closedTradeCount: number;
  executionMode?: string;
  automationType?: string;
  maxCapital?: number | null;
  updatedAt?: string;
};
type Trade = {
  id: string;
  botName: string;
  pair: string;
  status: string;
  invested: number;
  remainingCostBasis?: number;
  realizedPnl?: number | null;
  pnl: number;
  pnlPct: number;
  openedAt: string;
  closedAt: string | null;
  closeReason: string | null;
};
type SignalEvent = {
  id: string;
  receivedAt: string;
  symbol: string;
  action: string;
  rawStatus: string;
  rawReason: string | null;
  automation: { name: string };
  order: { status?: string | null } | null;
};
type SignalResponse = { ok?: boolean; events?: SignalEvent[]; error?: string };
type ExchangeStatusResponse = { ok?: boolean; connection?: { status?: string } | null; error?: string };
type Props = {
  account: Account;
  workspace: WorkspaceAccount | null;
  controls: { global_live_enabled?: boolean; kill_switch?: boolean } | null;
  worker: { status?: string; started_at?: string; error?: string | null } | null;
  bots: Bot[];
  trades: Trade[];
  displayedEquity: number;
  displayedAvailable: number;
  hasConnectedExchange: boolean;
  onConnections: () => void;
  onExplorePaper: () => void;
  onPortfolio: () => void;
  onAutomations: () => void;
  onPositions: () => void;
  onAnalytics: () => void;
  onSignals: () => void;
  onOpenAutomation: (id: string) => void;
};

function money(value: number | null | undefined) {
  const amount = Number(value ?? 0);
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(Number.isFinite(amount) ? amount : 0);
}
function percent(value: number) {
  if (!Number.isFinite(value)) return "0.00%";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}
function shortTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const diff = Date.now() - date.getTime();
  if (diff < 60_000) return "Just now";
  if (diff < 3_600_000) return `${Math.max(1, Math.floor(diff / 60_000))}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}
function signalStatus(event: SignalEvent) {
  if (String(event.order?.status || "").toUpperCase() === "PARTIALLY_FILLED") return "Partially executed";
  const raw = String(event.rawStatus || "").toLowerCase();
  if (raw === "processed") return "Executed";
  if (raw === "ignored") return "Ignored";
  if (raw === "failed") return "Failed";
  if (raw === "processing") return "Processing";
  return "Received";
}
function signalAction(action: string) {
  const raw = String(action || "").toLowerCase();
  if (raw === "start" || raw === "buy") return "BUY";
  if (raw === "add_funds") return "BUY · ADD";
  if (raw === "close" || raw === "sell") return "SELL";
  return String(action || "SIGNAL").replaceAll("_", " ").toUpperCase();
}
function signalReason(event: SignalEvent) {
  const raw = String(event.rawReason || "").toLowerCase();
  if (!raw) return signalStatus(event) === "Executed" ? "Execution completed" : "Awaiting execution result";
  if (raw.includes("capacity")) return "Position capacity reached";
  if (raw.includes("insufficient_usdt")) return "Insufficient USDT";
  if (raw.includes("automation_not_running")) return "Automation paused";
  if (raw.includes("live_trading_not_enabled")) return "Live execution disabled";
  if (raw.includes("timeout") || raw.includes("aborted")) return "Execution gateway timeout";
  if (raw.startsWith("binance_")) return "Binance execution issue";
  return raw.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function OverviewCommandCenter(props: Props) {
  const { account, workspace, controls, worker, bots, trades, displayedEquity, displayedAvailable, hasConnectedExchange } = props;
  const [signals, setSignals] = useState<SignalEvent[]>([]);
  const [signalError, setSignalError] = useState(false);
  const [bybitConnected, setBybitConnected] = useState(false);

  const loadSignals = useCallback(async () => {
    if (!account.id) return;
    try {
      const { data, error } = await browserSupabase.functions.invoke("trader-signal-monitor", { body: { accountId: account.id, limit: 12 } });
      if (error) throw error;
      const response = (data ?? {}) as SignalResponse;
      if (response.ok !== true) throw new Error(response.error || "signal_monitor_failed");
      setSignals((response.events ?? []).slice(0, 5));
      setSignalError(false);
    } catch {
      setSignalError(true);
    }
  }, [account.id]);

  const loadBybitStatus = useCallback(async () => {
    try {
      const { data, error } = await browserSupabase.functions.invoke("trader-bybit-control", { body: { action: "status" } });
      if (error) throw error;
      const response = (data ?? {}) as ExchangeStatusResponse;
      setBybitConnected(response.ok === true && response.connection?.status === "connected");
    } catch {
      setBybitConnected(false);
    }
  }, []);

  useEffect(() => {
    setSignals([]);
    setSignalError(false);
    void loadSignals();
    const timer = window.setInterval(() => void loadSignals(), 15_000);
    return () => window.clearInterval(timer);
  }, [loadSignals]);
  useEffect(() => { void loadBybitStatus(); }, [account.id, loadBybitStatus]);

  const activeBots = useMemo(() => bots.filter((bot) => bot.lifecycle !== "closed"), [bots]);
  const runningBots = activeBots.filter((bot) => bot.status === "Running");
  const pausedBots = activeBots.length - runningBots.length;
  const activeTrades = useMemo(() => trades.filter((trade) => trade.status === "Active"), [trades]);
  const closedTrades = useMemo(() => trades.filter((trade) => trade.status === "Closed"), [trades]);
  const deployed = activeTrades.reduce((sum, trade) => sum + Math.max(0, Number(trade.remainingCostBasis ?? trade.invested ?? 0)), 0);
  const livePnl = activeTrades.reduce((sum, trade) => sum + Number(trade.pnl || 0), 0);
  const plannedCapital = activeBots.reduce((sum, bot) => sum + Math.max(0, Number(bot.maxCapital ?? 0)), 0);
  const winners = closedTrades.filter((trade) => Number(trade.pnl || 0) > 0).length;
  const losers = closedTrades.filter((trade) => Number(trade.pnl || 0) < 0).length;
  const winRate = winners + losers > 0 ? winners / (winners + losers) * 100 : 0;
  const startingBalance = Number(workspace?.startingBalance ?? account.startingBalance ?? 0);
  const realized = Number(workspace?.realizedPnl ?? 0);
  const realizedRoi = startingBalance > 0 ? realized / startingBalance * 100 : 0;
  const best = activeTrades.length ? [...activeTrades].sort((a, b) => Number(b.pnl || 0) - Number(a.pnl || 0))[0] : null;
  const worst = activeTrades.length ? [...activeTrades].sort((a, b) => Number(a.pnl || 0) - Number(b.pnl || 0))[0] : null;
  const anyConnectedExchange = hasConnectedExchange || bybitConnected;
  const connectionHealthLabel = hasConnectedExchange && bybitConnected ? "2 exchanges connected" : hasConnectedExchange ? "Binance connected" : bybitConnected ? "Bybit connected · read only" : "Paper ready · no exchange";

  const thirtyDayTrades = useMemo(() => {
    const cutoff = Date.now() - 30 * 86_400_000;
    return closedTrades.filter((trade) => trade.closedAt && Date.parse(trade.closedAt) >= cutoff).sort((a, b) => Date.parse(a.closedAt || "") - Date.parse(b.closedAt || ""));
  }, [closedTrades]);
  const thirtyDayPnl = thirtyDayTrades.reduce((sum, trade) => sum + Number(trade.pnl || 0), 0);
  const spark = useMemo(() => {
    const values = [0];
    for (const trade of thirtyDayTrades) values.push(values[values.length - 1] + Number(trade.pnl || 0));
    if (values.length < 2) return "";
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = Math.max(0.01, max - min);
    return values.map((value, index) => {
      const x = values.length === 1 ? 0 : index / (values.length - 1) * 100;
      const y = 36 - (value - min) / span * 30;
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    }).join(" ");
  }, [thirtyDayTrades]);

  const recentActivity = useMemo(() => {
    const rows: Array<{ id: string; at: string; title: string; detail: string; value?: number }> = [];
    for (const trade of trades) {
      if (trade.status === "Closed" && trade.closedAt) rows.push({ id: `closed-${trade.id}`, at: trade.closedAt, title: `${trade.pair} position closed`, detail: trade.closeReason ? trade.closeReason.replaceAll("_", " ") : trade.botName, value: Number(trade.pnl || 0) });
      else if (trade.status === "Active" && trade.openedAt) rows.push({ id: `open-${trade.id}`, at: trade.openedAt, title: `${trade.pair} position opened`, detail: trade.botName });
    }
    return rows.sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 5);
  }, [trades]);

  const attention = useMemo(() => {
    const rows: Array<{ key: string; tone: "warn" | "info"; title: string; detail: string }> = [];
    if (!anyConnectedExchange) rows.push({ key: "exchange", tone: "info", title: "No exchange connected", detail: "Paper trading is available. Connect an exchange when you are ready to sync real assets." });
    if (worker?.error) rows.push({ key: "worker", tone: "warn", title: "Automation worker needs attention", detail: "The latest worker cycle reported an error. Review automation activity before relying on new executions." });
    if (account.kind === "real" && hasConnectedExchange && controls?.kill_switch === false && controls?.global_live_enabled !== true) rows.push({ key: "live-off", tone: "info", title: "Live execution is disabled", detail: "Your Binance exchange is connected, but real-money execution remains disabled by the account safety controls." });
    return rows;
  }, [account.kind, anyConnectedExchange, controls?.global_live_enabled, controls?.kill_switch, hasConnectedExchange, worker?.error]);

  const showPrimaryOnboarding = !anyConnectedExchange && account.kind === "real";
  const showPaperReminder = !anyConnectedExchange && account.kind === "paper";

  return <div className={styles.overview}>
    <div className={styles.heading}>
      <div><small>TRADING COMMAND CENTER</small><h1>Overview</h1><p>Account health, automation activity, positions and signals in one place.</p></div>
      <div className={styles.health}>{anyConnectedExchange ? <><i className={styles.healthGood}/><span>{connectionHealthLabel}</span></> : <><i/><span>{connectionHealthLabel}</span></>}</div>
    </div>

    {showPrimaryOnboarding && <section className={styles.onboarding}>
      <div className={styles.onboardingIcon}>↗</div>
      <div><small>REAL ACCOUNT SETUP</small><h2>Connect your first exchange</h2><p>Your Paper Account is ready. Connect an exchange when you want to sync real balances and prepare live trading features.</p></div>
      <div className={styles.onboardingActions}><button type="button" className={styles.primary} onClick={props.onConnections}>Connect exchange</button><button type="button" onClick={props.onExplorePaper}>Explore Paper Account</button></div>
    </section>}
    {showPaperReminder && <button type="button" className={styles.paperReminder} onClick={props.onConnections}><span><b>Paper Account active</b><small>Connect an exchange when you are ready to sync real assets.</small></span><strong>Connections →</strong></button>}

    <section className={styles.snapshot}>
      <div><span>Equity</span><strong>{money(displayedEquity)}</strong><small>{account.kind === "real" ? "Selected real workspace" : "Paper simulation"}</small></div>
      <div><span>Available</span><strong>{money(displayedAvailable)}</strong><small>Ready capital</small></div>
      <div><span>Deployed</span><strong>{money(deployed)}</strong><small>Current cost basis</small></div>
      <div><span>Reserved</span><strong>{money(workspace?.reserved)}</strong><small>Pending automation capital</small></div>
      <div><span>Unrealized PnL</span><strong className={livePnl >= 0 ? styles.positive : styles.negative}>{money(livePnl)}</strong><small>{activeTrades.length} open position{activeTrades.length === 1 ? "" : "s"}</small></div>
      <div><span>Realized PnL</span><strong className={realized >= 0 ? styles.positive : styles.negative}>{money(realized)}</strong><small>{percent(realizedRoi)} on starting balance</small></div>
    </section>

    <div className={styles.primaryGrid}>
      <section className={`${styles.panel} ${styles.performance}`}>
        <div className={styles.panelHead}><div><small>PERFORMANCE SNAPSHOT</small><h2>Account performance</h2></div><button type="button" onClick={props.onAnalytics}>View Analytics →</button></div>
        <div className={styles.performanceStats}><div><span>30D realized</span><b className={thirtyDayPnl >= 0 ? styles.positive : styles.negative}>{money(thirtyDayPnl)}</b></div><div><span>Win rate</span><b>{winRate.toFixed(1)}%</b></div><div><span>Closed positions</span><b>{closedTrades.length}</b></div></div>
        <div className={styles.sparkWrap}>{spark ? <svg viewBox="0 0 100 40" preserveAspectRatio="none" aria-label="30 day cumulative realized PnL"><path className={styles.sparkArea} d={`${spark} L100,40 L0,40 Z`}/><path className={styles.sparkLine} d={spark}/></svg> : <div className={styles.emptyChart}>Closed positions will build the 30-day performance curve.</div>}</div>
        <div className={styles.sparkFoot}><span>30 days ago</span><span>Today</span></div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHead}><div><small>LIVE AUTOMATIONS</small><h2>{runningBots.length} running · {pausedBots} paused</h2></div><button type="button" onClick={props.onAutomations}>View all →</button></div>
        <div className={styles.automationSummary}><div><span>Active positions</span><b>{activeTrades.length}</b></div><div><span>Planned capital</span><b>{plannedCapital > 0 ? money(plannedCapital) : "—"}</b></div></div>
        <div className={styles.list}>{activeBots.slice(0, 4).map((bot) => <button type="button" className={styles.automationRow} key={bot.id} onClick={() => props.onOpenAutomation(bot.id)}><CoinLogo symbol={bot.pair} size={26}/><span><b>{bot.name}</b><small>{bot.automationType === "tradingview_strategy" ? "Strategy Execution" : bot.pair}</small></span><em className={bot.status === "Running" ? styles.running : styles.paused}>{bot.status}</em><strong className={Number(bot.pnl || 0) >= 0 ? styles.positive : styles.negative}>{money(bot.pnl)}</strong></button>)}{!activeBots.length && <div className={styles.emptyState}>No automations yet. Create one from Automations when you are ready.</div>}</div>
      </section>
    </div>

    <div className={styles.secondaryGrid}>
      <section className={styles.panel}>
        <div className={styles.panelHead}><div><small>POSITIONS PULSE</small><h2>{activeTrades.length} open position{activeTrades.length === 1 ? "" : "s"}</h2></div><button type="button" onClick={props.onPositions}>Open Positions →</button></div>
        <div className={styles.pulseTotal}><span>Live PnL</span><strong className={livePnl >= 0 ? styles.positive : styles.negative}>{money(livePnl)}</strong></div>
        <div className={styles.pulseRows}><div><span>Best now</span>{best ? <b className={styles.positive}>{best.pair} · {money(best.pnl)}</b> : <b>—</b>}</div><div><span>Weakest now</span>{worst ? <b className={Number(worst.pnl || 0) >= 0 ? styles.positive : styles.negative}>{worst.pair} · {money(worst.pnl)}</b> : <b>—</b>}</div><div><span>Capital at work</span><b>{money(deployed)}</b></div></div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHead}><div><small>ATTENTION CENTER</small><h2>{attention.length ? `${attention.length} item${attention.length === 1 ? "" : "s"} to review` : "No action required"}</h2></div>{!anyConnectedExchange && <button type="button" onClick={props.onConnections}>Connections →</button>}</div>
        {attention.length ? <div className={styles.attentionList}>{attention.map((item) => <div key={item.key} className={item.tone === "warn" ? styles.attentionWarn : styles.attentionInfo}><i/><span><b>{item.title}</b><small>{item.detail}</small></span></div>)}</div> : <div className={styles.allClear}><span>✓</span><div><b>Workspace is healthy</b><small>No connection, worker, or execution-state issues require attention right now.</small></div></div>}
      </section>
    </div>

    <div className={styles.bottomGrid}>
      <section className={styles.panel}>
        <div className={styles.panelHead}><div><small>RECENT ACTIVITY</small><h2>What happened recently</h2></div></div>
        <div className={styles.list}>{recentActivity.map((item) => <div className={styles.activityRow} key={item.id}><i/><span><b>{item.title}</b><small>{item.detail} · {shortTime(item.at)}</small></span>{item.value != null && <strong className={item.value >= 0 ? styles.positive : styles.negative}>{money(item.value)}</strong>}</div>)}{!recentActivity.length && <div className={styles.emptyState}>Position activity will appear here as the account starts trading.</div>}</div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHead}><div><small>LATEST SIGNALS</small><h2>Signal Monitor snapshot</h2></div><button type="button" onClick={props.onSignals}>Open Monitor →</button></div>
        <div className={styles.list}>{signals.map((event) => { const status = signalStatus(event); const action = signalAction(event.action); return <div className={styles.signalRow} key={event.id}><span><b>{event.symbol}</b><small>{event.automation.name} · {shortTime(event.receivedAt)}</small></span><em className={action.startsWith("BUY") ? styles.buy : styles.sell}>{action}</em><span className={styles.signalResult}><b>{status}</b><small>{signalReason(event)}</small></span></div>; })}{signalError && <div className={styles.emptyState}>Signal snapshot could not refresh. The full Signal Monitor remains available.</div>}{!signalError && !signals.length && <div className={styles.emptyState}>No recent signals for this account.</div>}</div>
      </section>
    </div>
  </div>;
}
