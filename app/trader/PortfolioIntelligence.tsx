"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { browserSupabase } from "../../lib/supabase-browser";
import BenchmarkPerformanceChart from "./BenchmarkPerformanceChart";
import CoinLogo from "./CoinLogo";
import styles from "./portfolio-intelligence.module.css";

type AccountKind = "paper" | "real";
type Balance = { asset: string; free: number; locked: number; usdPrice: number | null; usdValue: number | null };
type Fill = { kind?: string; price: number; amount?: number; quantity: number; at: string };
type Trade = {
  id: string;
  botId: string | null;
  botName: string;
  pair: string;
  status: "Active" | "Closed";
  averagePrice: number;
  quantity: number;
  invested: number;
  totalInvested?: number;
  lastPrice: number | null;
  realizedPnl: number | null;
  pnl: number;
  pnlPct: number;
  openedAt: string;
  closedAt: string | null;
  fills?: Fill[];
};
type Bot = { id: string; name: string; status: string; lifecycle?: string; executionMode?: string; pair?: string; pnl?: number };
type Props = {
  accountId: string;
  accountName: string;
  accountKind: AccountKind;
  startingBalance: number;
  equity: number;
  available: number;
  realizedPnl: number;
  unrealizedPnl: number;
  balances: Balance[];
  trades: Trade[];
  bots: Bot[];
  onRefresh?: () => void;
};
type ScopeMode = "core" | "all" | "custom";
type AllocationMode = "asset" | "source" | "bot";
type HoldingSource = "cash" | "core" | "bot";
type HoldingRow = {
  key: string;
  symbol: string;
  quantity: number;
  price: number | null;
  value: number;
  source: HoldingSource;
  botId: string | null;
  botName: string | null;
  averageCost: number | null;
  unrealizedPnl: number | null;
};
type Snapshot = {
  captured_at: string;
  total_value: number | string;
  cash_value: number | string;
  core_value: number | string;
  bot_value: number | string;
  holdings: unknown;
};
type SnapshotHolding = { symbol?: string; quantity?: number; value?: number; source?: HoldingSource; botId?: string | null; botName?: string | null };
type SeriesPoint = { at: string; pnl: number; cumulative: number };

const RANGE_OPTIONS = [
  ["7d", "7D"], ["30d", "30D"], ["90d", "90D"], ["ytd", "YTD"], ["1y", "1Y"], ["all", "ALL"],
] as const;
const COLORS = ["#60dca5", "#79a2ef", "#e8b862", "#b98cff", "#61c8d6", "#ec8ccc", "#9bd26f", "#df7b84", "#8f9cac", "#d7c86e"];
const STABLES = new Set(["USDT", "USDC", "FDUSD", "DAI", "TUSD", "USDP"]);
const DAY = 86_400_000;

function finite(value: number | string | null | undefined, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
function money(value: number | null | undefined, digits = 2) {
  if (value == null || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}$${Math.abs(value).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}
function plainMoney(value: number | null | undefined, digits = 2) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `$${Math.abs(value).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}
function pct(value: number | null | undefined, digits = 2) {
  if (value == null || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${Math.abs(value).toFixed(digits)}%`;
}
function quantity(value: number) {
  return value.toLocaleString("en-US", { maximumFractionDigits: value >= 100 ? 3 : 8 });
}
function baseAsset(pair: string) { return String(pair || "").split("/")[0].split("USDT")[0] || String(pair || "").split("/")[0]; }
function rangeStart(range: string) {
  const now = Date.now();
  if (range === "7d") return now - 7 * DAY;
  if (range === "30d") return now - 30 * DAY;
  if (range === "90d") return now - 90 * DAY;
  if (range === "1y") return now - 365 * DAY;
  if (range === "ytd") return Date.UTC(new Date(now).getUTCFullYear(), 0, 1);
  return 0;
}
function dateLabel(value: string) {
  return new Date(value).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric" });
}
function donut(parts: Array<{ value: number; color: string }>) {
  const total = parts.reduce((sum, item) => sum + Math.max(0, item.value), 0);
  if (!total) return "conic-gradient(#303030 0 100%)";
  let cursor = 0;
  return `conic-gradient(${parts.map((item) => {
    const start = cursor / total * 100; cursor += Math.max(0, item.value); const end = cursor / total * 100;
    return `${item.color} ${start.toFixed(2)}% ${end.toFixed(2)}%`;
  }).join(",")})`;
}
function AnimatedNumber({ value, format }: { value: number; format: (value: number) => string }) {
  const [shown, setShown] = useState(value);
  const previous = useRef(value);
  useEffect(() => {
    const from = previous.current, to = value, started = performance.now(), duration = 320;
    let frame = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - started) / duration), eased = 1 - Math.pow(1 - p, 3);
      setShown(from + (to - from) * eased);
      if (p < 1) frame = requestAnimationFrame(tick); else previous.current = to;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return <>{format(shown)}</>;
}
function svgPath(values: Array<{ x: number; y: number }>) { return values.length ? `M${values.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" L")}` : ""; }

function buildAttribution(accountKind: AccountKind, balances: Balance[], available: number, activeTrades: Trade[]): HoldingRow[] {
  const botRowsRaw = activeTrades.map((trade) => {
    const symbol = baseAsset(trade.pair);
    const price = finite(trade.lastPrice, finite(trade.averagePrice, 0));
    const cost = finite(trade.totalInvested, finite(trade.invested, finite(trade.averagePrice) * finite(trade.quantity)));
    return {
      key: `bot-${trade.id}`, symbol, quantity: Math.max(0, finite(trade.quantity)), price: price > 0 ? price : null,
      value: Math.max(0, finite(trade.quantity) * price), source: "bot" as const, botId: trade.botId, botName: trade.botName,
      averageCost: finite(trade.quantity) > 0 && cost > 0 ? cost / finite(trade.quantity) : finite(trade.averagePrice) || null,
      unrealizedPnl: finite(trade.pnl),
    };
  }).filter((row) => row.quantity > 0 && row.symbol);

  if (accountKind === "paper") {
    const cash: HoldingRow = { key: "cash-USDT", symbol: "USDT", quantity: Math.max(0, available), price: 1, value: Math.max(0, available), source: "cash", botId: null, botName: null, averageCost: 1, unrealizedPnl: 0 };
    return [cash, ...botRowsRaw];
  }

  const balanceRows = balances.map((balance) => {
    const qty = Math.max(0, finite(balance.free) + finite(balance.locked));
    const price = balance.usdPrice != null && finite(balance.usdPrice) > 0 ? finite(balance.usdPrice) : qty > 0 && balance.usdValue != null ? finite(balance.usdValue) / qty : null;
    return { symbol: balance.asset, qty, price, value: balance.usdValue != null ? Math.max(0, finite(balance.usdValue)) : price != null ? qty * price : 0 };
  }).filter((row) => row.qty > 0 || row.value > 0);

  const bySymbol = new Map<string, HoldingRow[]>();
  botRowsRaw.forEach((row) => { const list = bySymbol.get(row.symbol) ?? []; list.push(row); bySymbol.set(row.symbol, list); });
  const rows: HoldingRow[] = [];
  for (const balance of balanceRows) {
    if (STABLES.has(balance.symbol)) {
      rows.push({ key: `cash-${balance.symbol}`, symbol: balance.symbol, quantity: balance.qty, price: balance.price, value: balance.value, source: "cash", botId: null, botName: null, averageCost: 1, unrealizedPnl: 0 });
      continue;
    }
    const positions = bySymbol.get(balance.symbol) ?? [];
    const requested = positions.reduce((sum, row) => sum + row.quantity, 0);
    const scale = requested > 0 ? Math.min(1, balance.qty / requested) : 0;
    let attributedQty = 0;
    positions.forEach((position) => {
      const qty = position.quantity * scale, value = balance.price != null ? qty * balance.price : position.value * scale;
      attributedQty += qty;
      rows.push({ ...position, quantity: qty, price: balance.price ?? position.price, value, unrealizedPnl: position.averageCost != null && balance.price != null ? (balance.price - position.averageCost) * qty : position.unrealizedPnl });
    });
    const coreQty = Math.max(0, balance.qty - attributedQty);
    const coreValue = balance.price != null ? coreQty * balance.price : Math.max(0, balance.value - rows.filter((row) => row.symbol === balance.symbol && row.source === "bot").reduce((sum, row) => sum + row.value, 0));
    if (coreQty > 0 || coreValue > 0.005) rows.push({ key: `core-${balance.symbol}`, symbol: balance.symbol, quantity: coreQty, price: balance.price, value: coreValue, source: "core", botId: null, botName: null, averageCost: null, unrealizedPnl: null });
    bySymbol.delete(balance.symbol);
  }
  return rows.filter((row) => row.value > 0.005 || row.quantity > 0);
}

function aggregateHoldings(rows: HoldingRow[]) {
  const map = new Map<string, { symbol: string; quantity: number; value: number; costValue: number; costQty: number; pnl: number; pnlKnown: boolean; sources: Set<string> }>();
  rows.forEach((row) => {
    const current = map.get(row.symbol) ?? { symbol: row.symbol, quantity: 0, value: 0, costValue: 0, costQty: 0, pnl: 0, pnlKnown: false, sources: new Set<string>() };
    current.quantity += row.quantity; current.value += row.value; current.sources.add(row.source === "bot" ? row.botName || "Bot" : row.source === "cash" ? "Cash" : "Core");
    if (row.averageCost != null) { current.costValue += row.averageCost * row.quantity; current.costQty += row.quantity; }
    if (row.unrealizedPnl != null) { current.pnl += row.unrealizedPnl; current.pnlKnown = true; }
    map.set(row.symbol, current);
  });
  return Array.from(map.values()).sort((a, b) => b.value - a.value);
}

function snapshotRows(snapshot: Snapshot): SnapshotHolding[] {
  return Array.isArray(snapshot.holdings) ? snapshot.holdings as SnapshotHolding[] : [];
}
function snapshotValue(snapshot: Snapshot, mode: ScopeMode, excluded: Set<string>) {
  if (mode === "all") return finite(snapshot.total_value);
  const rows = snapshotRows(snapshot);
  if (rows.length) return rows.reduce((sum, row) => {
    if (row.source === "bot" && (mode === "core" || (row.botId && excluded.has(row.botId)))) return sum;
    return sum + Math.max(0, finite(row.value));
  }, 0);
  if (mode === "core") return finite(snapshot.cash_value) + finite(snapshot.core_value);
  return finite(snapshot.total_value);
}
function buildSnapshotSeries(rows: Snapshot[], mode: ScopeMode, excluded: Set<string>): { series: SeriesPoint[]; base: number } {
  if (!rows.length) return { series: [], base: 0 };
  const values = rows.map((row) => ({ at: row.captured_at, value: snapshotValue(row, mode, excluded) })).filter((row) => Number.isFinite(Date.parse(row.at)));
  if (!values.length) return { series: [], base: 0 };
  const base = values[0].value;
  let previous = base;
  return { base, series: values.map((row) => { const pnl = row.value - previous; previous = row.value; return { at: row.at, pnl, cumulative: row.value - base }; }) };
}
function buildTradeSeries(trades: Trade[], included: Set<string>, start: number, base: number): SeriesPoint[] {
  const rows = trades.filter((trade) => trade.status === "Closed" && trade.closedAt && (!trade.botId || included.has(trade.botId)) && Date.parse(trade.closedAt) >= start)
    .sort((a, b) => Date.parse(a.closedAt!) - Date.parse(b.closedAt!));
  let cumulative = 0;
  const firstAt = start > 0 ? new Date(start).toISOString() : rows[0]?.closedAt ?? new Date().toISOString();
  const series: SeriesPoint[] = [{ at: firstAt, pnl: 0, cumulative: 0 }];
  rows.forEach((trade) => { const pnl = finite(trade.realizedPnl, finite(trade.pnl)); cumulative += pnl; series.push({ at: trade.closedAt!, pnl, cumulative }); });
  if (series.length === 1 && base > 0) series.push({ at: new Date().toISOString(), pnl: 0, cumulative: 0 });
  return series;
}
function drawdownSeries(series: SeriesPoint[], base: number) {
  let peak = base;
  return series.map((point) => { const equity = Math.max(0, base + finite(point.cumulative)); peak = Math.max(peak, equity); return { at: point.at, value: peak > 0 ? (equity / peak - 1) * 100 : 0 }; });
}

export default function PortfolioIntelligence(props: Props) {
  const { accountId, accountName, accountKind, startingBalance, equity, available, balances, trades, bots, onRefresh } = props;
  const [range, setRange] = useState("90d");
  const [scope, setScope] = useState<ScopeMode>("all");
  const [excludedBots, setExcludedBots] = useState<string[]>([]);
  const [allocationMode, setAllocationMode] = useState<AllocationMode>("asset");
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [prefsReady, setPrefsReady] = useState(false);
  const [historyReady, setHistoryReady] = useState(false);
  const [timeIndex, setTimeIndex] = useState(-1);
  const [saving, setSaving] = useState(false);
  const lastSnapshotAt = useRef(0);

  const activeTrades = useMemo(() => trades.filter((trade) => trade.status === "Active"), [trades]);
  const allRows = useMemo(() => buildAttribution(accountKind, balances, available, activeTrades), [accountKind, balances, available, activeTrades]);
  const excludedSet = useMemo(() => new Set(excludedBots), [excludedBots]);
  const includedBotIds = useMemo(() => new Set(bots.filter((bot) => scope === "all" || (scope === "custom" && !excludedSet.has(bot.id))).map((bot) => bot.id)), [bots, scope, excludedSet]);
  const selectedRows = useMemo(() => allRows.filter((row) => row.source !== "bot" || (scope !== "core" && (!row.botId || includedBotIds.has(row.botId)))), [allRows, scope, includedBotIds]);
  const holdings = useMemo(() => aggregateHoldings(selectedRows), [selectedRows]);
  const currentValue = selectedRows.reduce((sum, row) => sum + row.value, 0);
  const botExposure = selectedRows.filter((row) => row.source === "bot").reduce((sum, row) => sum + row.value, 0);
  const cashValue = selectedRows.filter((row) => row.source === "cash").reduce((sum, row) => sum + row.value, 0);
  const coreValue = selectedRows.filter((row) => row.source === "core").reduce((sum, row) => sum + row.value, 0);
  const selectedUnrealized = selectedRows.filter((row) => row.source === "bot").reduce((sum, row) => sum + finite(row.unrealizedPnl), 0);
  const stableValue = holdings.filter((row) => STABLES.has(row.symbol)).reduce((sum, row) => sum + row.value, 0);
  const topWeight = currentValue > 0 ? (holdings[0]?.value ?? 0) / currentValue * 100 : 0;
  const top3Weight = currentValue > 0 ? holdings.slice(0, 3).reduce((sum, row) => sum + row.value, 0) / currentValue * 100 : 0;
  const stableWeight = currentValue > 0 ? stableValue / currentValue * 100 : 0;

  useEffect(() => {
    let active = true;
    setPrefsReady(false); setHistoryReady(false);
    void (async () => {
      const [pref, history] = await Promise.all([
        browserSupabase.from("trader_portfolio_preferences").select("scope_mode,excluded_bot_ids").eq("account_id", accountId).maybeSingle(),
        browserSupabase.from("trader_portfolio_snapshots").select("captured_at,total_value,cash_value,core_value,bot_value,holdings").eq("account_id", accountId).order("captured_at", { ascending: true }).limit(5000),
      ]);
      if (!active) return;
      if (pref.data) { setScope((pref.data.scope_mode as ScopeMode) || "all"); setExcludedBots(Array.isArray(pref.data.excluded_bot_ids) ? pref.data.excluded_bot_ids : []); }
      setSnapshots((history.data ?? []) as Snapshot[]); setPrefsReady(true); setHistoryReady(true);
    })();
    return () => { active = false; };
  }, [accountId]);

  useEffect(() => {
    if (!prefsReady || !allRows.length || Date.now() - lastSnapshotAt.current < 60_000) return;
    lastSnapshotAt.current = Date.now();
    const allCash = allRows.filter((row) => row.source === "cash").reduce((sum, row) => sum + row.value, 0);
    const allCore = allRows.filter((row) => row.source === "core").reduce((sum, row) => sum + row.value, 0);
    const allBots = allRows.filter((row) => row.source === "bot").reduce((sum, row) => sum + row.value, 0);
    const payload = allRows.map((row) => ({ symbol: row.symbol, quantity: row.quantity, value: row.value, source: row.source, botId: row.botId, botName: row.botName }));
    void browserSupabase.rpc("trader_record_portfolio_snapshot", {
      p_account_id: accountId, p_total_value: allCash + allCore + allBots, p_cash_value: allCash, p_core_value: allCore, p_bot_value: allBots,
      p_holdings: payload, p_metadata: { accountKind, reconciled: true },
    });
  }, [accountId, accountKind, prefsReady, allRows]);

  const persist = async (nextScope: ScopeMode, nextExcluded: string[]) => {
    setScope(nextScope); setExcludedBots(nextExcluded); setSaving(true);
    await browserSupabase.from("trader_portfolio_preferences").upsert({ account_id: accountId, scope_mode: nextScope, excluded_bot_ids: nextExcluded, updated_at: new Date().toISOString() }, { onConflict: "account_id" });
    setSaving(false);
  };
  const toggleBot = (botId: string) => {
    const next = excludedSet.has(botId) ? excludedBots.filter((id) => id !== botId) : [...excludedBots, botId];
    void persist("custom", next);
  };

  const start = rangeStart(range);
  const filteredSnapshots = snapshots.filter((row) => Date.parse(row.captured_at) >= start);
  const snapshotHistory = buildSnapshotSeries(filteredSnapshots, scope, excludedSet);
  const tradeHistory = buildTradeSeries(trades, includedBotIds, start, startingBalance);
  const useSnapshots = snapshotHistory.series.length >= 2;
  const wealthSeries = useSnapshots ? snapshotHistory.series : tradeHistory;
  const historyBase = useSnapshots ? snapshotHistory.base : Math.max(0, startingBalance);
  const currentGain = historyBase > 0 ? currentValue - historyBase : wealthSeries.at(-1)?.cumulative ?? 0;
  const netReturn = historyBase > 0 ? currentGain / historyBase * 100 : 0;
  const dd = drawdownSeries(wealthSeries, Math.max(1, historyBase));
  const maxDd = dd.length ? Math.min(0, ...dd.map((row) => row.value)) : 0;

  const allocationItems = useMemo(() => {
    const map = new Map<string, number>();
    if (allocationMode === "asset") holdings.forEach((row) => map.set(row.symbol, (map.get(row.symbol) ?? 0) + row.value));
    else if (allocationMode === "source") selectedRows.forEach((row) => { const label = row.source === "cash" ? "Cash & stablecoins" : row.source === "core" ? "Core holdings" : "Included bots"; map.set(label, (map.get(label) ?? 0) + row.value); });
    else selectedRows.forEach((row) => { const label = row.source === "bot" ? row.botName || "Bot" : row.source === "cash" ? "Cash & stablecoins" : "Core holdings"; map.set(label, (map.get(label) ?? 0) + row.value); });
    return Array.from(map.entries()).map(([label, value], index) => ({ label, value, color: COLORS[index % COLORS.length] })).sort((a, b) => b.value - a.value);
  }, [allocationMode, holdings, selectedRows]);
  const allocationGradient = donut(allocationItems);

  const selectedClosedTrades = trades.filter((trade) => trade.status === "Closed" && trade.closedAt && Date.parse(trade.closedAt) >= start && (!trade.botId || includedBotIds.has(trade.botId)));
  const contributions = useMemo(() => {
    const map = new Map<string, { pnl: number; trades: number }>();
    selectedClosedTrades.forEach((trade) => { const symbol = baseAsset(trade.pair); const current = map.get(symbol) ?? { pnl: 0, trades: 0 }; current.pnl += finite(trade.realizedPnl, finite(trade.pnl)); current.trades++; map.set(symbol, current); });
    return Array.from(map.entries()).map(([symbol, data]) => ({ symbol, ...data })).sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl)).slice(0, 8);
  }, [selectedClosedTrades]);
  const contributionMax = Math.max(1, ...contributions.map((row) => Math.abs(row.pnl)));

  const botRows = useMemo(() => {
    const map = new Map<string, { id: string; name: string; value: number; pnl: number; positions: number }>();
    allRows.filter((row) => row.source === "bot" && row.botId).forEach((row) => { const current = map.get(row.botId!) ?? { id: row.botId!, name: row.botName || "Automation", value: 0, pnl: 0, positions: 0 }; current.value += row.value; current.pnl += finite(row.unrealizedPnl); current.positions++; map.set(row.botId!, current); });
    return Array.from(map.values()).sort((a, b) => b.value - a.value);
  }, [allRows]);

  const timeRows = filteredSnapshots.length ? filteredSnapshots : snapshots;
  const safeTimeIndex = timeRows.length ? (timeIndex < 0 ? timeRows.length - 1 : Math.min(timeIndex, timeRows.length - 1)) : -1;
  const timeSnapshot = safeTimeIndex >= 0 ? timeRows[safeTimeIndex] : null;
  const timeValue = timeSnapshot ? snapshotValue(timeSnapshot, scope, excludedSet) : null;

  const ddW = 900, ddH = 190, padX = 52, padT = 16, padB = 32;
  const ddMin = Math.min(-0.1, ...dd.map((row) => row.value));
  const ddPts = dd.map((row, index) => ({ x: padX + (dd.length <= 1 ? 0 : index / (dd.length - 1)) * (ddW - padX - 12), y: padT + (0 - row.value) / (0 - ddMin || 1) * (ddH - padT - padB) }));

  return <div className={styles.page} key={`${accountId}-${range}-${scope}-${excludedBots.join("-")}`}>
    <header className={styles.heading}>
      <div><small>LONG-TERM WEALTH</small><h1>Portfolio</h1><p>Understand what you own, where it came from, and how your long-term wealth is evolving.</p></div>
      <div className={styles.headingControls}><span>{accountName}</span>{onRefresh && <button type="button" onClick={onRefresh}>↻ Refresh</button>}</div>
    </header>

    <section className={styles.scopeBar}>
      <div><small>PORTFOLIO SCOPE</small><strong>{scope === "core" ? "Core holdings" : scope === "all" ? "Everything" : "Custom portfolio"}</strong><span>{saving ? "Saving…" : "Bot attribution is reconciled, never double-counted"}</span></div>
      <div className={styles.scopeButtons}>{(["core", "all", "custom"] as ScopeMode[]).map((item) => <button type="button" key={item} className={scope === item ? styles.active : ""} onClick={() => void persist(item, excludedBots)}>{item === "core" ? "Core Holdings" : item === "all" ? "All Assets" : "Custom"}</button>)}</div>
      <div className={styles.ranges}>{RANGE_OPTIONS.map(([value, label]) => <button type="button" key={value} className={range === value ? styles.active : ""} onClick={() => setRange(value)}>{label}</button>)}</div>
    </section>

    <div className={styles.metrics}>
      <article><span>Portfolio value</span><strong><AnimatedNumber value={currentValue || equity} format={(value) => plainMoney(value)} /></strong><small>{scope === "all" ? "Reconciled account scope" : "Selected holdings scope"}</small></article>
      <article><span>Net return</span><strong className={netReturn >= 0 ? styles.positive : styles.negative}><AnimatedNumber value={netReturn} format={(value) => pct(value)} /></strong><small>{useSnapshots ? "From first recorded portfolio snapshot" : accountKind === "paper" ? "Realized-history proxy" : "History begins with Portfolio Intelligence"}</small></article>
      <article><span>Included bot exposure</span><strong><AnimatedNumber value={botExposure} format={(value) => plainMoney(value)} /></strong><small>{currentValue > 0 ? `${(botExposure / currentValue * 100).toFixed(1)}% of selected portfolio` : "0%"}</small></article>
      <article><span>Included unrealized PnL</span><strong className={selectedUnrealized >= 0 ? styles.positive : styles.negative}><AnimatedNumber value={selectedUnrealized} format={(value) => money(value)} /></strong><small>Open positions from included bots</small></article>
      <article><span>Portfolio drawdown</span><strong className={styles.negative}><AnimatedNumber value={maxDd} format={(value) => pct(value)} /></strong><small>Peak-to-trough in selected history</small></article>
    </div>

    <section className={`${styles.card} ${styles.heroChart}`}>
      <header><div><small>WEALTH CURVE</small><h2>Long-term performance</h2></div><div className={styles.legendText}>{useSnapshots ? "True recorded portfolio equity" : accountKind === "paper" ? "Paper realized-equity history until snapshots accumulate" : "Recorded snapshots will build this history automatically"}</div></header>
      {wealthSeries.length >= 2 ? <BenchmarkPerformanceChart series={wealthSeries} capitalUsed={Math.max(1, historyBase)} mode="Cumulative PnL" range={range} referenceLabel="Portfolio" /> : <div className={styles.emptyChart}><strong>Portfolio history starts here</strong><span>Current holdings are already reconciled. The wealth curve will become richer as hourly snapshots accumulate.</span></div>}
    </section>

    <div className={styles.twoCol}>
      <section className={styles.card}><header><div><small>ALLOCATION INTELLIGENCE</small><h2>What your portfolio is made of</h2></div><div className={styles.miniTabs}>{(["asset", "source", "bot"] as AllocationMode[]).map((item) => <button type="button" key={item} className={allocationMode === item ? styles.active : ""} onClick={() => setAllocationMode(item)}>By {item}</button>)}</div></header><div className={styles.allocationBody}><div className={styles.donut} style={{ background: allocationGradient }}><div><strong>{holdings.length}</strong><span>assets</span></div></div><div className={styles.legend}>{allocationItems.slice(0, 9).map((item) => <div key={item.label}><i style={{ background: item.color }} /><span>{item.label}</span><b>{currentValue > 0 ? `${(item.value / currentValue * 100).toFixed(1)}%` : "0%"}</b><small>{plainMoney(item.value)}</small></div>)}</div></div></section>

      <section className={styles.card}><header><div><small>PORTFOLIO HEALTH</small><h2>Concentration & reserves</h2></div><span>Transparent risk, not a black-box score</span></header><div className={styles.healthMetrics}><div><span>Largest asset</span><b>{holdings[0]?.symbol ?? "—"}</b><strong>{topWeight.toFixed(1)}%</strong></div><div><span>Top 3 concentration</span><b>{holdings.slice(0, 3).map((row) => row.symbol).join(" · ") || "—"}</b><strong>{top3Weight.toFixed(1)}%</strong></div><div><span>Stable reserve</span><b>Cash + stablecoins</b><strong>{stableWeight.toFixed(1)}%</strong></div></div><div className={styles.treemap}>{holdings.slice(0, 8).map((row, index) => <div key={row.symbol} style={{ flexGrow: Math.max(5, row.value), background: `${COLORS[index % COLORS.length]}22`, borderColor: `${COLORS[index % COLORS.length]}55` }}><CoinLogo symbol={row.symbol} size={20}/><b>{row.symbol}</b><span>{currentValue > 0 ? `${(row.value / currentValue * 100).toFixed(1)}%` : "0%"}</span></div>)}</div></section>
    </div>

    <section className={styles.card}><header><div><small>AUTOMATION ATTRIBUTION</small><h2>Choose which bot positions belong in Portfolio</h2></div><span>Core holdings remain included · bot positions can be switched individually</span></header><div className={styles.botScope}>{bots.filter((bot) => bot.lifecycle !== "closed" || botRows.some((row) => row.id === bot.id)).map((bot) => { const exposure = botRows.find((row) => row.id === bot.id); const included = scope === "all" || (scope === "custom" && !excludedSet.has(bot.id)); return <button type="button" key={bot.id} className={`${styles.botToggle} ${included ? styles.botIncluded : ""}`} onClick={() => toggleBot(bot.id)}><span className={styles.switch}><i /></span><div><strong>{bot.name}</strong><small>{bot.executionMode || "Automation"} · {bot.status}</small></div><b>{exposure ? plainMoney(exposure.value) : "No open position"}</b></button>; })}</div>{!bots.length && <div className={styles.emptySmall}>No automations on this account yet.</div>}</section>

    <div className={styles.twoCol}>
      <section className={styles.card}><header><div><small>RETURN CONTRIBUTION</small><h2>What created realized return</h2></div><span>{range.toUpperCase()}</span></header><div className={styles.contribution}>{contributions.length ? contributions.map((row) => <div key={row.symbol}><div><CoinLogo symbol={row.symbol} size={20}/><span>{row.symbol}</span><small>{row.trades} trades</small></div><div className={styles.barTrack}><i className={row.pnl >= 0 ? styles.barPositive : styles.barNegative} style={{ width: `${Math.max(3, Math.abs(row.pnl) / contributionMax * 100)}%` }} /></div><b className={row.pnl >= 0 ? styles.positive : styles.negative}>{money(row.pnl)}</b></div>) : <div className={styles.emptySmall}>No realized contribution in this selected period and scope.</div>}</div></section>

      <section className={styles.card}><header><div><small>ACCUMULATION & COST BASIS</small><h2>Long-term holdings intelligence</h2></div><span>Known bot cost basis is separated from unknown core cost</span></header><div className={styles.accumulation}>{holdings.slice(0, 7).map((row) => { const avgCost = row.costQty > 0 && Math.abs(row.costQty - row.quantity) < Math.max(.00000001, row.quantity * .001) ? row.costValue / row.costQty : STABLES.has(row.symbol) ? 1 : null; const marketPrice = row.quantity > 0 ? row.value / row.quantity : null; return <div key={row.symbol}><CoinLogo symbol={row.symbol} size={25}/><div><strong>{row.symbol}</strong><span>{quantity(row.quantity)} accumulated</span></div><div><span>Avg cost</span><b>{avgCost == null ? "Not recorded" : plainMoney(avgCost)}</b></div><div><span>Market</span><b>{marketPrice == null ? "—" : plainMoney(marketPrice)}</b></div><div className={styles.allocationLine}><i style={{ width: `${currentValue > 0 ? row.value / currentValue * 100 : 0}%` }} /></div></div>})}</div></section>
    </div>

    <section className={styles.card}><header><div><small>UNDERWATER WEALTH</small><h2>Portfolio drawdown & recovery</h2></div><strong className={styles.negative}>{pct(maxDd)}</strong></header>{dd.length >= 2 ? <svg className={styles.ddChart} viewBox={`0 0 ${ddW} ${ddH}`} preserveAspectRatio="none"><line x1={padX} x2={ddW - 12} y1={padT} y2={padT} className={styles.zeroLine}/>{[0,.25,.5,.75,1].map((ratio) => { const value = ddMin * ratio, y = padT + ratio * (ddH - padT - padB); return <g key={ratio}><line x1={padX} x2={ddW - 12} y1={y} y2={y} className={styles.gridLine}/><text x={padX - 8} y={y + 3} textAnchor="end">{value.toFixed(1)}%</text></g>; })}<path d={`${svgPath(ddPts)} L${ddPts.at(-1)?.x ?? padX},${padT} L${ddPts[0]?.x ?? padX},${padT} Z`} className={styles.ddArea}/><path d={svgPath(ddPts)} className={styles.ddLine}/><text x={padX} y={ddH - 8}>Older</text><text x={ddW - 12} y={ddH - 8} textAnchor="end">Latest</text><text x="14" y={ddH / 2} transform={`rotate(-90 14 ${ddH / 2})`} textAnchor="middle">Drawdown (%)</text></svg> : <div className={styles.emptySmall}>More history is needed for a portfolio drawdown path.</div>}</section>

    <section className={styles.card}><header><div><small>PORTFOLIO TIME MACHINE</small><h2>Revisit recorded portfolio states</h2></div><span>{timeSnapshot ? dateLabel(timeSnapshot.captured_at) : "Snapshots begin automatically"}</span></header>{timeRows.length ? <div className={styles.timeMachine}><input type="range" min="0" max={Math.max(0, timeRows.length - 1)} value={Math.max(0, safeTimeIndex)} onChange={(event) => setTimeIndex(Number(event.target.value))}/><div><span>Selected portfolio value</span><strong>{timeValue == null ? "—" : plainMoney(timeValue)}</strong><small>{timeRows.length} recorded states</small></div><div><span>Core + cash</span><strong>{timeSnapshot ? plainMoney(finite(timeSnapshot.core_value) + finite(timeSnapshot.cash_value)) : "—"}</strong><small>Non-bot wealth</small></div><div><span>Bot positions</span><strong>{timeSnapshot ? plainMoney(finite(timeSnapshot.bot_value)) : "—"}</strong><small>All bot-attributed holdings</small></div></div> : <div className={styles.emptySmall}>The first hourly state is being recorded now. This slider will become a true portfolio time machine as history accumulates.</div>}</section>

    <section className={styles.card}><header><div><small>HOLDINGS</small><h2>Portfolio ledger</h2></div><span>{holdings.length} assets · {plainMoney(currentValue)}</span></header><div className={styles.holdingsTable}><div className={styles.holdingsHead}><span>Asset</span><span>Quantity</span><span>Value</span><span>Allocation</span><span>Avg cost</span><span>Unrealized PnL</span><span>Source</span></div>{holdings.map((row) => { const allocation = currentValue > 0 ? row.value / currentValue * 100 : 0; const avgCost = row.costQty > 0 && Math.abs(row.costQty - row.quantity) < Math.max(.00000001, row.quantity * .001) ? row.costValue / row.costQty : STABLES.has(row.symbol) ? 1 : null; return <div className={styles.holdingsRow} key={row.symbol}><span className={styles.assetCell}><CoinLogo symbol={row.symbol} size={26}/><b>{row.symbol}</b></span><span>{quantity(row.quantity)}</span><b>{plainMoney(row.value)}</b><span>{allocation.toFixed(2)}%</span><span>{avgCost == null ? "—" : plainMoney(avgCost)}</span><span className={row.pnl >= 0 ? styles.positive : styles.negative}>{row.pnlKnown ? money(row.pnl) : "—"}</span><span>{Array.from(row.sources).join(" + ")}</span></div>; })}{!holdings.length && <div className={styles.emptySmall}>No holdings in the current scope.</div>}</div></section>

    {!historyReady && <div className={styles.loadingNote}>Loading long-term portfolio history…</div>}
  </div>;
}
