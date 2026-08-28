"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { browserSupabase } from "../../lib/supabase-browser";
import styles from "./signal-monitor.module.css";

type MonitorOrder = {
  id: string;
  clientOrderId: string | null;
  side: string;
  kind: string;
  status: string;
  requestedQuote: number | null;
  requestedQuantity: number | null;
  filledQuantity: number | null;
  filledQuote: number | null;
  averageFillPrice: number | null;
  exchange: string | null;
  exchangeOrderId: string | null;
  createdAt: string;
  filledAt: string | null;
};
type MonitorEvent = {
  id: string;
  receivedAt: string;
  processedAt: string | null;
  account: { id: string; name: string; kind: string; mode: string };
  automation: { id: string; name: string; type: string; executionMode: string };
  source: string;
  symbol: string;
  action: string;
  rawStatus: string;
  rawReason: string | null;
  requestedQuote: number | null;
  contracts: number | null;
  tradingViewOrderPrice: number | null;
  positionSize: number | null;
  previousPositionSize: number | null;
  marketPosition: string | null;
  previousMarketPosition: string | null;
  tradingViewOrderId: string | null;
  tradingViewEventTime: string | null;
  signalId: string | null;
  positionAction: string | null;
  resultPrice: number | null;
  resultQuote: number | null;
  resultQuantity: number | null;
  remainingQuantity: number | null;
  resultFraction: number | null;
  tradeId: string | null;
  order: MonitorOrder | null;
  capacity: { maxOpenPositions: number | null; activePositions: number | null } | null;
};
type MonitorResponse = { ok?: boolean; events?: MonitorEvent[]; refreshedAt?: string; error?: string };
type Props = { accountId: string; accountName: string };

function reasonLabel(event: MonitorEvent) {
  const raw = String(event.rawReason || "").toLowerCase();
  const capacity = event.capacity;
  if (raw === "strategy_position_capacity_reached" || raw === "position_capacity_reached") {
    if (capacity?.activePositions != null && capacity?.maxOpenPositions != null) return `Maximum open positions reached (${capacity.activePositions}/${capacity.maxOpenPositions})`;
    return "Maximum open positions reached";
  }
  if (raw === "account_position_capacity_reached") return "Account maximum concurrent positions reached";
  if (raw === "live_order_limit_exceeded") return "Per-order execution limit exceeded";
  if (raw === "live_capital_limit_exceeded") return "Maximum live capital reached";
  if (raw === "insufficient_usdt") return "Insufficient available USDT";
  if (raw === "spot_symbol_not_tradeable" || raw === "unsupported_strategy_symbol") return "Unsupported or non-USDT Spot symbol";
  if (raw === "no_active_position") return "No open position to sell";
  if (raw === "short_side_ignored") return "Short-side signal ignored on Spot";
  if (raw === "automation_not_running") return "Automation is paused or stopped";
  if (raw === "already_closing") return "Position is already closing";
  if (raw === "live_trading_not_enabled") return "Live execution is disabled by account safety controls";
  if (raw === "binance_trade_permission_required") return "Binance trading permission is required";
  if (raw === "binance_connection_not_safe") return "Binance connection does not meet account safety requirements";
  if (raw === "strategy_order_below_exchange_minimum") return "Order is below the exchange minimum";
  if (raw === "partial_exit_below_exchange_minimum") return "Partial exit is below the exchange minimum";
  if (raw === "live_exit_below_exchange_minimum") return "Remaining position is below the exchange minimum";
  if (raw.includes("timeout") || raw.includes("operation was aborted")) return "Execution gateway timed out";
  if (raw.startsWith("binance_")) return "Binance execution error";
  if (raw === "[object object]") return "Execution failed";
  if (event.rawReason) return event.rawReason.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  if (event.positionAction === "opened") return "Position opened";
  if (event.positionAction === "added") return "Position increased";
  if (event.positionAction === "reduced") return "Position partially reduced";
  if (event.positionAction === "closed") return "Position closed";
  return "—";
}
function statusLabel(event: MonitorEvent) {
  if (event.order?.status?.toUpperCase() === "PARTIALLY_FILLED") return "Partially executed";
  const status = event.rawStatus.toLowerCase();
  if (status === "processed") return "Executed";
  if (status === "ignored") return "Ignored";
  if (status === "failed") return "Failed";
  if (status === "processing") return "Processing";
  if (status === "pending") return "Received";
  return event.rawStatus || "Received";
}
function actionLabel(action: string) {
  const value = action.toLowerCase();
  if (value === "start" || value === "buy") return "BUY";
  if (value === "add_funds") return "BUY · ADD";
  if (value === "close" || value === "sell") return "SELL";
  return action.replaceAll("_", " ").toUpperCase();
}
function number(value: number | null | undefined, maximumFractionDigits = 8) {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits }).format(value);
}
function money(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 8 }).format(value)} USDT`;
}
function timeLabel(value: string) {
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
function dateTime(value: string | null | undefined) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString([], { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
function requestedSize(event: MonitorEvent) {
  if (event.requestedQuote != null) return money(event.requestedQuote);
  if (event.contracts != null) return `${number(event.contracts)} contracts`;
  return "—";
}

export default function SignalMonitor({ accountId, accountName }: Props) {
  const [events, setEvents] = useState<MonitorEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [automation, setAutomation] = useState("all");
  const [symbol, setSymbol] = useState("all");
  const [action, setAction] = useState("all");
  const [result, setResult] = useState("all");
  const [source, setSource] = useState("all");
  const [range, setRange] = useState("7d");

  const load = useCallback(async (quiet = false) => {
    if (!accountId) return;
    if (quiet) setRefreshing(true); else setLoading(true);
    try {
      const { data, error: invokeError } = await browserSupabase.functions.invoke("trader-signal-monitor", { body: { accountId, limit: 200 } });
      if (invokeError) {
        let message = invokeError.message || "signal_monitor_failed";
        const context = (invokeError as { context?: Response }).context;
        if (context) {
          try {
            const payload = await context.clone().json() as { error?: string };
            if (payload.error) message = payload.error;
          } catch {}
        }
        throw new Error(message);
      }
      const response = (data ?? {}) as MonitorResponse;
      if (response.ok !== true) throw new Error(response.error || "signal_monitor_failed");
      setEvents(response.events ?? []);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load signals.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [accountId]);

  useEffect(() => {
    setExpanded(null);
    setEvents([]);
    setLoading(true);
    void load();
    const timer = window.setInterval(() => void load(true), 5000);
    return () => window.clearInterval(timer);
  }, [load]);

  const automations = useMemo(() => Array.from(new Map(events.map((event) => [event.automation.id, event.automation])).values()).sort((a, b) => a.name.localeCompare(b.name)), [events]);
  const symbols = useMemo(() => Array.from(new Set(events.map((event) => event.symbol))).sort(), [events]);
  const filtered = useMemo(() => {
    const now = Date.now();
    const rangeMs = range === "24h" ? 86_400_000 : range === "7d" ? 604_800_000 : range === "30d" ? 2_592_000_000 : Number.POSITIVE_INFINITY;
    return events.filter((event) => {
      const label = statusLabel(event);
      if (automation !== "all" && event.automation.id !== automation) return false;
      if (symbol !== "all" && event.symbol !== symbol) return false;
      if (action !== "all" && actionLabel(event.action).split(" · ")[0] !== action) return false;
      if (result !== "all" && label !== result) return false;
      if (source !== "all" && event.source !== source) return false;
      if (now - Date.parse(event.receivedAt) > rangeMs) return false;
      return true;
    });
  }, [events, automation, symbol, action, result, source, range]);
  const resultOptions = useMemo(() => Array.from(new Set(events.map(statusLabel))).sort(), [events]);
  const executed = filtered.filter((event) => statusLabel(event) === "Executed" || statusLabel(event) === "Partially executed").length;
  const notExecuted = filtered.filter((event) => statusLabel(event) === "Ignored" || statusLabel(event) === "Failed").length;
  const hasFilters = automation !== "all" || symbol !== "all" || action !== "all" || result !== "all" || source !== "all" || range !== "7d";
  const clear = () => { setAutomation("all"); setSymbol("all"); setAction("all"); setResult("all"); setSource("all"); setRange("7d"); };

  return <div className={styles.monitor}>
    <div className={styles.heading}>
      <div><small>AUTOMATION OPERATIONS</small><h1>Signal Monitor</h1><p>See what each automation received, what executed, and why a signal did not execute.</p></div>
      <div className={styles.headingActions}><span className={styles.accountPill}>{accountName}</span><button type="button" onClick={() => void load(true)} disabled={refreshing}>{refreshing ? "Refreshing…" : "Refresh"}</button></div>
    </div>

    <section className={styles.controls}>
      <div className={styles.summary}><strong>{filtered.length}</strong><span>signals</span><i/><b>{executed}</b><span>executed</span><i/><b>{notExecuted}</b><span>ignored / failed</span></div>
      <div className={styles.filters}>
        <select aria-label="Automation" value={automation} onChange={(event) => setAutomation(event.target.value)}><option value="all">All automations</option>{automations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
        <select aria-label="Symbol" value={symbol} onChange={(event) => setSymbol(event.target.value)}><option value="all">All symbols</option>{symbols.map((item) => <option key={item} value={item}>{item}</option>)}</select>
        <select aria-label="Action" value={action} onChange={(event) => setAction(event.target.value)}><option value="all">All actions</option><option value="BUY">BUY</option><option value="SELL">SELL</option></select>
        <select aria-label="Result" value={result} onChange={(event) => setResult(event.target.value)}><option value="all">All results</option>{resultOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select>
        <select aria-label="Source" value={source} onChange={(event) => setSource(event.target.value)}><option value="all">All sources</option><option value="TradingView">TradingView</option></select>
        <select aria-label="Date range" value={range} onChange={(event) => setRange(event.target.value)}><option value="24h">24 hours</option><option value="7d">7 days</option><option value="30d">30 days</option><option value="all">All loaded</option></select>
        {hasFilters && <button type="button" className={styles.clear} onClick={clear}>Clear</button>}
      </div>
    </section>

    {error && <div className={styles.error}>Signal Monitor could not refresh: {error}</div>}
    {loading ? <div className={styles.state}>Loading recorded signals…</div> : <section className={styles.feed}>
      <div className={styles.tableScroll}>
        <div className={styles.table}>
          <div className={styles.head}><span>Time</span><span>Account</span><span>Automation</span><span>Source</span><span>Symbol</span><span>Signal</span><span>Requested</span><span>Result</span><span>Reason</span></div>
          {filtered.map((event) => {
            const status = statusLabel(event);
            const isOpen = expanded === event.id;
            return <div className={styles.event} key={event.id}>
              <button type="button" className={styles.row} aria-expanded={isOpen} onClick={() => setExpanded(isOpen ? null : event.id)}>
                <span className={styles.time}>{timeLabel(event.receivedAt)}<small>{new Date(event.receivedAt).toLocaleDateString([], { month: "short", day: "numeric" })}</small></span>
                <span>{event.account.name}</span>
                <span className={styles.automation}>{event.automation.name}<small>{event.automation.executionMode || event.automation.type.replaceAll("_", " ")}</small></span>
                <span>{event.source}</span>
                <strong>{event.symbol}</strong>
                <span className={`${styles.signal} ${actionLabel(event.action).startsWith("BUY") ? styles.buy : styles.sell}`}>{actionLabel(event.action)}</span>
                <span>{requestedSize(event)}</span>
                <span className={`${styles.result} ${styles[status.toLowerCase().replaceAll(" ", "").replaceAll("/", "")] || ""}`}>{status}</span>
                <span className={styles.reason}>{reasonLabel(event)}<b>{isOpen ? "⌃" : "⌄"}</b></span>
              </button>
              {isOpen && <div className={styles.details}>
                <section><h3>TradingView signal</h3><dl><div><dt>Order ID</dt><dd>{event.tradingViewOrderId || "—"}</dd></div><div><dt>Event time</dt><dd>{event.tradingViewEventTime ? dateTime(event.tradingViewEventTime) : "—"}</dd></div><div><dt>Contracts</dt><dd>{number(event.contracts)}</dd></div><div><dt>TradingView order price</dt><dd>{number(event.tradingViewOrderPrice)}</dd></div><div><dt>Position transition</dt><dd>{number(event.previousPositionSize)} → {number(event.positionSize)}</dd></div><div><dt>Market position</dt><dd>{event.previousMarketPosition || "—"} → {event.marketPosition || "—"}</dd></div></dl></section>
                <section><h3>LabNarrative result</h3><dl><div><dt>Account</dt><dd>{event.account.name}</dd></div><div><dt>Automation</dt><dd>{event.automation.name}</dd></div><div><dt>Pair</dt><dd>{event.symbol}</dd></div><div><dt>Execution result</dt><dd>{status}</dd></div><div><dt>Explanation</dt><dd>{reasonLabel(event)}</dd></div><div><dt>Requested quote</dt><dd>{money(event.requestedQuote ?? event.order?.requestedQuote)}</dd></div><div><dt>Executed quantity</dt><dd>{number(event.order?.filledQuantity ?? event.resultQuantity)}</dd></div><div><dt>Executed quote</dt><dd>{money(event.order?.filledQuote ?? event.resultQuote)}</dd></div><div><dt>Execution price</dt><dd>{number(event.order?.averageFillPrice ?? event.resultPrice)}</dd></div><div><dt>Trade ID</dt><dd>{event.tradeId || "—"}</dd></div><div><dt>Order ID</dt><dd>{event.order?.clientOrderId || event.order?.id || "—"}</dd></div>{event.order?.exchangeOrderId && <div><dt>Binance order ID</dt><dd>{event.order.exchangeOrderId}</dd></div>}<div><dt>Raw status</dt><dd>{event.rawStatus}</dd></div><div><dt>Raw reason</dt><dd>{event.rawReason || "—"}</dd></div><div><dt>Received</dt><dd>{dateTime(event.receivedAt)}</dd></div><div><dt>Processed</dt><dd>{dateTime(event.processedAt)}</dd></div></dl></section>
              </div>}
            </div>;
          })}
          {!filtered.length && <div className={styles.empty}><strong>No signals match these filters.</strong><span>New TradingView Strategy events will appear here automatically.</span></div>}
        </div>
      </div>
    </section>}
  </div>;
}
