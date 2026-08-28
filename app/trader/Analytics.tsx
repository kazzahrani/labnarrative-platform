"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { browserSupabase } from "../../lib/supabase-browser";
import styles from "./analytics.module.css";

type SeriesPoint = { at: string; pnl: number; cumulative: number };
type PairStat = { pair: string; trades: number; pnl: number };
type ExitStat = { reason: string; trades: number; pnl: number };
type AutomationStats = {
  id: string;
  name: string;
  type: string;
  status: string;
  executionMode: string;
  archived: boolean;
  market: string;
  activePositions: number;
  maxActivePositions: number | null;
  closedTrades: number;
  wins: number;
  losses: number;
  breakeven: number;
  realizedPnl: number;
  realizedRoi: number | null;
  winRate: number | null;
  profitFactor: number | null;
  grossProfit: number;
  grossLoss: number;
  expectancy: number | null;
  bestTrade: number | null;
  worstTrade: number | null;
  maxDrawdown: number;
  avgHoldMinutes: number | null;
  firstTradeAt: string | null;
  lastActivityAt: string | null;
  series: SeriesPoint[];
  pairs: PairStat[];
  exitReasons: ExitStat[];
};
type Summary = {
  realizedPnl: number;
  realizedRoi: number | null;
  closedTrades: number;
  activePositions: number;
  winRate: number | null;
  profitFactor: number | null;
  maxDrawdown: number;
  wins: number;
  losses: number;
  breakeven: number;
  runningAutomations: number;
  automationCount: number;
  bestAutomation: { id: string; name: string; pnl: number } | null;
};
type AnalyticsResponse = {
  ok?: boolean;
  range?: string;
  summary?: Summary;
  series?: SeriesPoint[];
  automations?: AutomationStats[];
  error?: string;
};
type Props = { accountId: string; accountName: string };
type SortKey = "name" | "closedTrades" | "realizedPnl" | "realizedRoi" | "winRate" | "profitFactor" | "expectancy" | "maxDrawdown" | "avgHoldMinutes" | "lastActivityAt";

const RANGE_OPTIONS = [
  { value: "7d", label: "7D" },
  { value: "30d", label: "30D" },
  { value: "90d", label: "90D" },
  { value: "all", label: "All" },
];
const PIE_COLORS = ["#5ee2a0", "#ff7d8a", "#e8b862", "#7ea7ff", "#b98cff", "#61c8d6", "#ec8ccc", "#8dd174"];

function money(value: number | null | undefined, digits = 2) {
  if (value == null || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}$${Math.abs(value).toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits })}`;
}
function pct(value: number | null | undefined, digits = 2) {
  if (value == null || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${Math.abs(value).toFixed(digits)}%`;
}
function plainPct(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(1)}%`;
}
function profitFactor(item: { profitFactor: number | null; wins?: number; losses?: number; grossProfit?: number }) {
  if (item.profitFactor != null && Number.isFinite(item.profitFactor)) return item.profitFactor.toFixed(2);
  if ((item.wins ?? 0) > 0 && (item.losses ?? 0) === 0 && (item.grossProfit ?? 0) > 0) return "∞";
  return "—";
}
function duration(minutes: number | null | undefined) {
  if (minutes == null || !Number.isFinite(minutes)) return "—";
  if (minutes < 60) return `${Math.round(minutes)}m`;
  if (minutes < 1440) return `${(minutes / 60).toFixed(minutes < 600 ? 1 : 0)}h`;
  return `${(minutes / 1440).toFixed(1)}d`;
}
function relativeTime(value: string | null | undefined) {
  if (!value) return "—";
  const ms = Date.now() - Date.parse(value);
  if (!Number.isFinite(ms)) return "—";
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
function pnlClass(value: number | null | undefined) {
  return value != null && value > 0 ? styles.positive : value != null && value < 0 ? styles.negative : styles.neutral;
}
function buildLine(points: SeriesPoint[]) {
  const width = 920, height = 260, padX = 18, padTop = 16, padBottom = 24;
  if (!points.length) return { line: "", area: "", zeroY: height / 2, min: 0, max: 0 };
  const values = points.map((point) => point.cumulative);
  let min = Math.min(0, ...values), max = Math.max(0, ...values);
  if (Math.abs(max - min) < 0.000001) { max += 1; min -= 1; }
  const usableW = width - padX * 2, usableH = height - padTop - padBottom;
  const x = (index: number) => padX + (points.length === 1 ? usableW / 2 : index / (points.length - 1) * usableW);
  const y = (value: number) => padTop + (max - value) / (max - min) * usableH;
  const coords = points.map((point, index) => `${x(index).toFixed(2)},${y(point.cumulative).toFixed(2)}`);
  const line = coords.length ? `M${coords.join(" L")}` : "";
  const baseline = y(0);
  const area = coords.length ? `${line} L${x(points.length - 1).toFixed(2)},${baseline.toFixed(2)} L${x(0).toFixed(2)},${baseline.toFixed(2)} Z` : "";
  return { line, area, zeroY: baseline, min, max };
}
function pieGradient(parts: Array<{ value: number; color: string }>) {
  const total = parts.reduce((sum, part) => sum + Math.max(0, part.value), 0);
  if (!total) return "conic-gradient(#303030 0deg 360deg)";
  let cursor = 0;
  const stops: string[] = [];
  for (const part of parts) {
    const start = cursor / total * 360;
    cursor += Math.max(0, part.value);
    const end = cursor / total * 360;
    stops.push(`${part.color} ${start}deg ${end}deg`);
  }
  return `conic-gradient(${stops.join(",")})`;
}
function aggregatePairs(automations: AutomationStats[]) {
  const map = new Map<string, PairStat>();
  for (const automation of automations) for (const item of automation.pairs) {
    const current = map.get(item.pair) || { pair: item.pair, trades: 0, pnl: 0 };
    current.trades += item.trades; current.pnl += item.pnl; map.set(item.pair, current);
  }
  return Array.from(map.values()).sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl)).slice(0, 10);
}
function aggregateReasons(automations: AutomationStats[]) {
  const map = new Map<string, ExitStat>();
  for (const automation of automations) for (const item of automation.exitReasons) {
    const current = map.get(item.reason) || { reason: item.reason, trades: 0, pnl: 0 };
    current.trades += item.trades; current.pnl += item.pnl; map.set(item.reason, current);
  }
  return Array.from(map.values()).sort((a, b) => b.trades - a.trades).slice(0, 8);
}

export default function Analytics({ accountId, accountName }: Props) {
  const [range, setRange] = useState("30d");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [overallSeries, setOverallSeries] = useState<SeriesPoint[]>([]);
  const [automations, setAutomations] = useState<AutomationStats[]>([]);
  const [selectedId, setSelectedId] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState("all");
  const [type, setType] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("realizedPnl");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  const load = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    try {
      const { data, error: invokeError } = await browserSupabase.functions.invoke("trader-analytics", { body: { accountId, range } });
      if (invokeError) {
        let message = invokeError.message || "analytics_failed";
        const context = (invokeError as { context?: Response }).context;
        if (context) try {
          const payload = await context.clone().json() as { error?: string };
          if (payload.error) message = payload.error;
        } catch {}
        throw new Error(message);
      }
      const response = (data ?? {}) as AnalyticsResponse;
      if (response.ok !== true || !response.summary) throw new Error(response.error || "analytics_failed");
      setSummary(response.summary);
      setOverallSeries(response.series ?? []);
      setAutomations(response.automations ?? []);
      setError("");
      setSelectedId((current) => current === "all" || (response.automations ?? []).some((item) => item.id === current) ? current : "all");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load analytics.");
    } finally {
      setLoading(false);
    }
  }, [accountId, range]);

  useEffect(() => { void load(); }, [load]);

  const selected = useMemo(() => automations.find((item) => item.id === selectedId) || null, [automations, selectedId]);
  const chartSeries = selected?.series ?? overallSeries;
  const chart = useMemo(() => buildLine(chartSeries), [chartSeries]);
  const selectedName = selected?.name || "All automations";
  const selectedWins = selected?.wins ?? summary?.wins ?? 0;
  const selectedLosses = selected?.losses ?? summary?.losses ?? 0;
  const selectedBreakeven = selected?.breakeven ?? summary?.breakeven ?? 0;
  const selectedClosed = selected?.closedTrades ?? summary?.closedTrades ?? 0;
  const selectedPnl = selected?.realizedPnl ?? summary?.realizedPnl ?? 0;
  const selectedWinRate = selected?.winRate ?? summary?.winRate ?? null;
  const selectedRoi = selected?.realizedRoi ?? summary?.realizedRoi ?? null;
  const selectedPf = selected ? profitFactor(selected) : profitFactor({ profitFactor: summary?.profitFactor ?? null, wins: summary?.wins, losses: summary?.losses, grossProfit: 1 });
  const pairStats = selected?.pairs ?? aggregatePairs(automations);
  const exitStats = selected?.exitReasons ?? aggregateReasons(automations);
  const outcomeGradient = pieGradient([
    { value: selectedWins, color: "#5ee2a0" },
    { value: selectedLosses, color: "#ff7d8a" },
    { value: selectedBreakeven, color: "#757575" },
  ]);
  const exitGradient = pieGradient(exitStats.map((item, index) => ({ value: item.trades, color: PIE_COLORS[index % PIE_COLORS.length] })));

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rows = automations.filter((item) => {
      if (needle && !`${item.name} ${item.market} ${item.type}`.toLowerCase().includes(needle)) return false;
      if (scope === "running" && (item.archived || item.status !== "Running")) return false;
      if (scope === "archived" && !item.archived) return false;
      if (type !== "all" && item.type !== type) return false;
      return true;
    });
    return [...rows].sort((a, b) => {
      const av = sortKey === "name" ? a.name.toLowerCase() : sortKey === "lastActivityAt" ? Date.parse(a.lastActivityAt || "1970-01-01") : Number(a[sortKey] ?? Number.NEGATIVE_INFINITY);
      const bv = sortKey === "name" ? b.name.toLowerCase() : sortKey === "lastActivityAt" ? Date.parse(b.lastActivityAt || "1970-01-01") : Number(b[sortKey] ?? Number.NEGATIVE_INFINITY);
      if (av < bv) return sortDirection === "asc" ? -1 : 1;
      if (av > bv) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
  }, [automations, query, scope, type, sortKey, sortDirection]);

  const sort = (key: SortKey) => {
    if (sortKey === key) setSortDirection((current) => current === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDirection(key === "name" ? "asc" : "desc"); }
  };
  const sortArrow = (key: SortKey) => sortKey === key ? (sortDirection === "asc" ? " ↑" : " ↓") : "";
  const maxPairMagnitude = Math.max(0.000001, ...pairStats.map((item) => Math.abs(item.pnl)));
  const maxBotMagnitude = Math.max(0.000001, ...automations.map((item) => Math.abs(item.realizedPnl)));

  return <div className={styles.analytics}>
    <div className={styles.heading}>
      <div><small>PERFORMANCE INTELLIGENCE</small><h1>Analytics</h1><p>Compare automation quality, risk and realized performance from the same execution ledger.</p></div>
      <div className={styles.headingRight}><span>{accountName}</span><div className={styles.range}>{RANGE_OPTIONS.map((item) => <button key={item.value} type="button" className={range === item.value ? styles.rangeActive : ""} onClick={() => setRange(item.value)}>{item.label}</button>)}</div></div>
    </div>

    {error && <div className={styles.error}>Analytics could not refresh: {error}</div>}
    {loading && !summary ? <div className={styles.loading}>Building performance analytics…</div> : <>
      <section className={styles.metrics}>
        <article><span>Realized PnL</span><strong className={pnlClass(summary?.realizedPnl)}>{money(summary?.realizedPnl)}</strong><small>{summary?.closedTrades ?? 0} closed positions</small></article>
        <article><span>Realized ROI</span><strong className={pnlClass(summary?.realizedRoi)}>{pct(summary?.realizedRoi)}</strong><small>realized PnL ÷ capital used</small></article>
        <article><span>Win rate</span><strong>{plainPct(summary?.winRate)}</strong><small>{summary?.wins ?? 0} wins · {summary?.losses ?? 0} losses</small></article>
        <article><span>Max drawdown</span><strong className={styles.drawdown}>{money(summary ? -summary.maxDrawdown : null)}</strong><small>realized equity curve</small></article>
        <article><span>Automations</span><strong>{summary?.runningAutomations ?? 0}<em> / {summary?.automationCount ?? 0}</em></strong><small>running / total</small></article>
      </section>

      <section className={styles.performanceCard}>
        <div className={styles.cardHeader}>
          <div><small>CUMULATIVE REALIZED PNL</small><h2>{selectedName}</h2></div>
          <div className={styles.botPicker}><button type="button" className={selectedId === "all" ? styles.botActive : ""} onClick={() => setSelectedId("all")}>All</button>{automations.filter((item) => !item.archived).slice(0, 8).map((item) => <button type="button" key={item.id} title={item.name} className={selectedId === item.id ? styles.botActive : ""} onClick={() => setSelectedId(item.id)}>{item.name}</button>)}</div>
        </div>
        <div className={styles.chartMeta}><strong className={pnlClass(selectedPnl)}>{money(selectedPnl)}</strong><span>{selectedClosed} closed trades</span><span>{plainPct(selectedWinRate)} win rate</span><span>{selectedPf} profit factor</span></div>
        <div className={styles.lineChart}>
          {chartSeries.length ? <svg viewBox="0 0 920 260" role="img" aria-label={`${selectedName} cumulative realized PnL`} preserveAspectRatio="none">
            <defs><linearGradient id="analyticsArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="currentColor" stopOpacity=".22"/><stop offset="100%" stopColor="currentColor" stopOpacity="0"/></linearGradient></defs>
            <line x1="18" x2="902" y1={chart.zeroY} y2={chart.zeroY} className={styles.zeroLine}/>
            <path d={chart.area} className={pnlClass(selectedPnl)} fill="url(#analyticsArea)"/>
            <path d={chart.line} className={`${styles.line} ${pnlClass(selectedPnl)}`} fill="none" vectorEffect="non-scaling-stroke"/>
          </svg> : <div className={styles.noChart}>No closed trades in this period yet.</div>}
          <div className={styles.chartAxis}><span>{chartSeries[0] ? new Date(chartSeries[0].at).toLocaleDateString([], { month: "short", day: "numeric" }) : ""}</span><span>{chartSeries.at(-1) ? new Date(chartSeries.at(-1)!.at).toLocaleDateString([], { month: "short", day: "numeric" }) : ""}</span></div>
        </div>
      </section>

      <section className={styles.insightGrid}>
        <article className={styles.donutCard}>
          <div className={styles.miniHeader}><div><small>OUTCOME MIX</small><h3>{selectedName}</h3></div><strong>{plainPct(selectedWinRate)}</strong></div>
          <div className={styles.donutWrap}><div className={styles.donut} style={{ background: outcomeGradient }}><div><strong>{selectedClosed}</strong><span>closed</span></div></div><div className={styles.legend}><p><i style={{ background: "#5ee2a0" }}/><span>Wins</span><b>{selectedWins}</b></p><p><i style={{ background: "#ff7d8a" }}/><span>Losses</span><b>{selectedLosses}</b></p><p><i style={{ background: "#757575" }}/><span>Breakeven</span><b>{selectedBreakeven}</b></p><p className={styles.legendMetric}><span>Realized ROI</span><b className={pnlClass(selectedRoi)}>{pct(selectedRoi)}</b></p></div></div>
        </article>

        <article className={styles.donutCard}>
          <div className={styles.miniHeader}><div><small>EXIT DISTRIBUTION</small><h3>How positions ended</h3></div></div>
          <div className={styles.donutWrap}><div className={styles.donut} style={{ background: exitGradient }}><div><strong>{exitStats.reduce((sum, item) => sum + item.trades, 0)}</strong><span>exits</span></div></div><div className={styles.legend}>{exitStats.slice(0, 5).map((item, index) => <p key={item.reason} title={`${item.reason}: ${money(item.pnl)}`}><i style={{ background: PIE_COLORS[index % PIE_COLORS.length] }}/><span>{item.reason}</span><b>{item.trades}</b></p>)}{!exitStats.length && <p><span>No exits yet</span></p>}</div></div>
        </article>

        <article className={styles.pairCard}>
          <div className={styles.miniHeader}><div><small>MARKET CONTRIBUTION</small><h3>Where PnL came from</h3></div></div>
          <div className={styles.pairBars}>{pairStats.slice(0, 6).map((item) => <div className={styles.pairBar} key={item.pair}><div><strong>{item.pair}</strong><span>{item.trades} trades</span><b className={pnlClass(item.pnl)}>{money(item.pnl)}</b></div><div className={styles.track}><i className={pnlClass(item.pnl)} style={{ width: `${Math.max(3, Math.abs(item.pnl) / maxPairMagnitude * 100)}%` }}/></div></div>)}{!pairStats.length && <div className={styles.emptyMini}>No pair-level results yet.</div>}</div>
        </article>
      </section>

      <section className={styles.compareCard}>
        <div className={styles.compareHeader}><div><small>AUTOMATION COMPARISON</small><h2>Performance table</h2><p>One ledger, one definition for every automation.</p></div><div className={styles.compareControls}><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search automation" aria-label="Search automations"/><select value={scope} onChange={(event) => setScope(event.target.value)} aria-label="Automation state"><option value="all">All automations</option><option value="running">Running</option><option value="archived">Archived</option></select><select value={type} onChange={(event) => setType(event.target.value)} aria-label="Automation type"><option value="all">All types</option><option value="DCA">DCA</option><option value="Strategy Execution">Strategy Execution</option></select></div></div>

        <div className={styles.botBars}>{automations.filter((item) => item.closedTrades > 0).sort((a, b) => b.realizedPnl - a.realizedPnl).slice(0, 7).map((item) => <button type="button" key={item.id} onClick={() => setSelectedId(item.id)} title={`Select ${item.name}`}><span>{item.name}</span><div><i className={pnlClass(item.realizedPnl)} style={{ width: `${Math.max(4, Math.abs(item.realizedPnl) / maxBotMagnitude * 100)}%` }}/></div><b className={pnlClass(item.realizedPnl)}>{money(item.realizedPnl)}</b></button>)}</div>

        <div className={styles.tableScroll}><div className={styles.table}>
          <div className={styles.tableHead}>
            <button onClick={() => sort("name")}>Automation{sortArrow("name")}</button><span>Type / market</span><button onClick={() => sort("closedTrades")}>Trades{sortArrow("closedTrades")}</button><span>Positions</span><button onClick={() => sort("realizedPnl")}>Realized PnL{sortArrow("realizedPnl")}</button><button onClick={() => sort("realizedRoi")}>ROI{sortArrow("realizedRoi")}</button><button onClick={() => sort("winRate")}>Win rate{sortArrow("winRate")}</button><button onClick={() => sort("profitFactor")}>Profit factor{sortArrow("profitFactor")}</button><button onClick={() => sort("expectancy")}>Expectancy{sortArrow("expectancy")}</button><button onClick={() => sort("maxDrawdown")}>Max DD{sortArrow("maxDrawdown")}</button><button onClick={() => sort("avgHoldMinutes")}>Avg hold{sortArrow("avgHoldMinutes")}</button><span>Best / worst</span><button onClick={() => sort("lastActivityAt")}>Last activity{sortArrow("lastActivityAt")}</button><span>Status</span>
          </div>
          {filtered.map((item) => <button type="button" className={`${styles.tableRow} ${selectedId === item.id ? styles.rowSelected : ""}`} key={item.id} onClick={() => setSelectedId(item.id)}>
            <span className={styles.botName}><strong>{item.name}</strong><small>{item.executionMode || "automation"}</small></span>
            <span className={styles.botType}><strong>{item.type}</strong><small>{item.market}</small></span>
            <span>{item.closedTrades}<small>{item.wins}W · {item.losses}L</small></span>
            <span>{item.activePositions} / {item.maxActivePositions ?? "∞"}</span>
            <strong className={pnlClass(item.realizedPnl)}>{money(item.realizedPnl)}</strong>
            <span className={pnlClass(item.realizedRoi)}>{pct(item.realizedRoi)}</span>
            <span>{plainPct(item.winRate)}</span>
            <span>{profitFactor(item)}</span>
            <span className={pnlClass(item.expectancy)}>{money(item.expectancy)}</span>
            <span className={item.maxDrawdown > 0 ? styles.negative : styles.neutral}>{item.maxDrawdown > 0 ? money(-item.maxDrawdown) : "$0.00"}</span>
            <span>{duration(item.avgHoldMinutes)}</span>
            <span><b className={pnlClass(item.bestTrade)}>{money(item.bestTrade)}</b><small className={pnlClass(item.worstTrade)}>{money(item.worstTrade)}</small></span>
            <span>{relativeTime(item.lastActivityAt)}</span>
            <span className={`${styles.status} ${item.archived ? styles.archived : item.status === "Running" ? styles.running : ""}`}>{item.archived ? "ARCHIVED" : item.status.toUpperCase()}</span>
          </button>)}
          {!filtered.length && <div className={styles.emptyTable}>No automations match these filters.</div>}
        </div></div>
      </section>
    </>}
  </div>;
}
