"use client";

import { useEffect, useMemo, useState } from "react";
import { browserSupabase } from "../../lib/supabase-browser";
import styles from "./benchmark-performance-chart.module.css";

type SeriesPoint = { at: string; pnl: number; cumulative: number };
type Mode = "Cumulative PnL" | "Trade PnL" | "Drawdown" | "Trade frequency";
type BenchmarkKey = "BTC" | "ETH" | "SPX";
type BenchmarkPoint = { at: string; price: number; returnPct?: number };
type BenchmarkResponse = {
  ok?: boolean;
  source?: string;
  interval?: string;
  series?: Partial<Record<BenchmarkKey, BenchmarkPoint[]>>;
  errors?: Partial<Record<BenchmarkKey, string>>;
  error?: string;
};
type PlotPoint = { at: number; value: number };
type PlotSeries = { key: string; label: string; points: PlotPoint[]; className: string };

type Props = {
  series: SeriesPoint[];
  capitalUsed?: number | null;
  mode?: Mode;
  range: string;
  compact?: boolean;
  referenceLabel?: string;
};

const DAY = 86_400_000;
const HOUR = 3_600_000;
const BENCHMARKS: Array<{ key: BenchmarkKey; label: string }> = [
  { key: "BTC", label: "BTC" },
  { key: "ETH", label: "ETH" },
  { key: "SPX", label: "SPX" },
];

function finite(value: number | null | undefined, fallback = 0) {
  return value != null && Number.isFinite(value) ? value : fallback;
}
function niceNumber(value: number) {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  if (abs >= 100) return value.toFixed(0);
  if (abs >= 10) return value.toFixed(1);
  return value.toFixed(2);
}
function moneyTick(value: number) {
  const sign = value < 0 ? "−" : "";
  return `${sign}$${niceNumber(Math.abs(value))}`;
}
function pctTick(value: number) {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${niceNumber(Math.abs(value))}%`;
}
function dateTick(ms: number, spanMs: number) {
  const date = new Date(ms);
  if (spanMs > 330 * DAY) return date.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
  if (spanMs <= 8 * DAY) return date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric" });
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function rangeBounds(range: string, series: SeriesPoint[]) {
  const now = Date.now();
  if (range === "7d") return { start: now - 7 * DAY, end: now };
  if (range === "30d") return { start: now - 30 * DAY, end: now };
  if (range === "90d") return { start: now - 90 * DAY, end: now };
  if (range === "ytd") return { start: Date.UTC(new Date(now).getUTCFullYear(), 0, 1), end: now };
  const valid = series.map((point) => Date.parse(point.at)).filter(Number.isFinite);
  return { start: valid.length ? Math.min(...valid) : now - 90 * DAY, end: now };
}
function gridStep(range: string, start: number, end: number) {
  if (range === "7d") return HOUR;
  if (range === "30d") return 4 * HOUR;
  if (range === "90d") return 12 * HOUR;
  if (range === "ytd") return DAY;
  const span = end - start;
  if (span <= 14 * DAY) return HOUR;
  if (span <= 60 * DAY) return 4 * HOUR;
  if (span <= 180 * DAY) return 12 * HOUR;
  if (span <= 730 * DAY) return DAY;
  return 7 * DAY;
}
function benchmarkInterval(step: number) {
  return step < DAY ? "60m" : "1d";
}
function buildTimeline(start: number, end: number, step: number) {
  const out: number[] = [];
  const safeStep = Math.max(HOUR, step);
  for (let at = start; at < end && out.length < 800; at += safeStep) out.push(at);
  if (!out.length || out.at(-1)! < end) out.push(end);
  return out;
}
function buildModePoints(series: SeriesPoint[], mode: Mode, capitalUsed: number) {
  if (mode === "Trade frequency") {
    const grouped = new Map<string, { at: number; value: number }>();
    series.forEach((point) => {
      const date = new Date(point.at);
      if (!Number.isFinite(date.getTime())) return;
      const key = date.toISOString().slice(0, 10);
      const at = Date.parse(`${key}T12:00:00.000Z`);
      grouped.set(key, { at, value: (grouped.get(key)?.value ?? 0) + 1 });
    });
    return Array.from(grouped.values()).sort((a, b) => a.at - b.at);
  }
  if (mode === "Drawdown") {
    let peak = 0;
    return series.map((point) => {
      peak = Math.max(peak, finite(point.cumulative));
      const value = capitalUsed > 0 ? -((peak - finite(point.cumulative)) / capitalUsed) * 100 : 0;
      return { at: Date.parse(point.at), value };
    }).filter((point) => Number.isFinite(point.at));
  }
  return series.map((point) => ({
    at: Date.parse(point.at),
    value: mode === "Trade PnL" ? finite(point.pnl) : finite(point.cumulative),
  })).filter((point) => Number.isFinite(point.at));
}
function synchronizedStrategy(series: SeriesPoint[], timeline: number[], start: number, step: number, capitalUsed: number) {
  const pnlByBucket = new Array(Math.max(1, timeline.length)).fill(0) as number[];
  series.forEach((point) => {
    const at = Date.parse(point.at);
    if (!Number.isFinite(at) || at < start || at > timeline.at(-1)!) return;
    const index = Math.min(pnlByBucket.length - 1, Math.max(0, Math.ceil((at - start) / step)));
    pnlByBucket[index] += finite(point.pnl);
  });
  let cumulative = 0;
  return timeline.map((at, index) => {
    cumulative += pnlByBucket[index] ?? 0;
    return { at, value: capitalUsed > 0 ? (cumulative / capitalUsed) * 100 : 0 };
  });
}
function sortedPrices(points: BenchmarkPoint[]) {
  return points.map((point) => ({ at: Date.parse(point.at), price: finite(point.price, NaN) }))
    .filter((point) => Number.isFinite(point.at) && Number.isFinite(point.price) && point.price > 0)
    .sort((a, b) => a.at - b.at);
}
function priceAt(points: Array<{ at: number; price: number }>, at: number, stepwise: boolean) {
  if (!points.length) return null;
  let lo = 0, hi = points.length - 1;
  if (at <= points[0].at) return points[0].price;
  if (at >= points[hi].at) return points[hi].price;
  while (lo + 1 < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (points[mid].at <= at) lo = mid; else hi = mid;
  }
  if (stepwise) return points[lo].price;
  const left = points[lo], right = points[hi];
  const ratio = (at - left.at) / Math.max(1, right.at - left.at);
  return left.price + (right.price - left.price) * ratio;
}
function synchronizedBenchmark(points: BenchmarkPoint[], timeline: number[], key: BenchmarkKey) {
  const prices = sortedPrices(points);
  if (!prices.length || !timeline.length) return [] as PlotPoint[];
  const sampled = timeline.map((at) => ({ at, price: priceAt(prices, at, key === "SPX") })).filter((point): point is { at: number; price: number } => point.price != null && Number.isFinite(point.price));
  if (!sampled.length) return [] as PlotPoint[];
  const base = sampled[0].price;
  return sampled.map((point) => ({ at: point.at, value: (point.price / base - 1) * 100 }));
}
function linePath(points: PlotPoint[], x: (value: number) => number, y: (value: number) => number) {
  return points.length ? `M${points.map((point) => `${x(point.at).toFixed(2)},${y(point.value).toFixed(2)}`).join(" L")}` : "";
}

export default function BenchmarkPerformanceChart({ series, capitalUsed = 0, mode = "Cumulative PnL", range, compact = false, referenceLabel = "Strategy" }: Props) {
  const [selected, setSelected] = useState<BenchmarkKey[]>([]);
  const [benchmarks, setBenchmarks] = useState<Partial<Record<BenchmarkKey, BenchmarkPoint[]>>>({});
  const [loading, setLoading] = useState(false);
  const [benchmarkError, setBenchmarkError] = useState("");

  const bounds = useMemo(() => rangeBounds(range, series), [range, series]);
  const step = useMemo(() => gridStep(range, bounds.start, bounds.end), [range, bounds]);
  const timeline = useMemo(() => buildTimeline(bounds.start, bounds.end, step), [bounds, step]);
  const interval = benchmarkInterval(step);
  const benchmarkMode = mode === "Cumulative PnL" && selected.length > 0;

  useEffect(() => {
    if (!benchmarkMode) return;
    let cancelled = false;
    setLoading(true);
    setBenchmarkError("");
    void (async () => {
      const { data, error } = await browserSupabase.functions.invoke("trader-analytics-benchmarks", {
        body: {
          startAt: new Date(bounds.start).toISOString(),
          endAt: new Date(bounds.end).toISOString(),
          interval,
          symbols: BENCHMARKS.map((item) => item.key),
        },
      });
      if (cancelled) return;
      if (error) {
        setBenchmarkError(error.message || "Benchmark data unavailable.");
        setBenchmarks({});
      } else {
        const response = (data ?? {}) as BenchmarkResponse;
        setBenchmarks(response.series ?? {});
        if (response.ok !== true) setBenchmarkError(response.error || "Benchmark data unavailable.");
        else {
          const failed = Object.entries(response.errors ?? {}).map(([key]) => key);
          if (failed.length) setBenchmarkError(`${failed.join(", ")} temporarily unavailable`);
        }
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [benchmarkMode, bounds.start, bounds.end, interval]);

  const rawPoints = useMemo(() => buildModePoints(series, mode, finite(capitalUsed)), [series, mode, capitalUsed]);
  const referenceReturn = useMemo(() => synchronizedStrategy(series, timeline, bounds.start, step, finite(capitalUsed)), [series, timeline, bounds.start, step, capitalUsed]);

  const plotSeries = useMemo<PlotSeries[]>(() => {
    if (!benchmarkMode) return [{ key: "strategy", label: referenceLabel, points: mode === "Cumulative PnL" ? timeline.map((at, index) => ({ at, value: referenceReturn[index]?.value != null ? referenceReturn[index].value / 100 * finite(capitalUsed) : 0 })) : rawPoints, className: styles.strategyLine }];
    const rows: PlotSeries[] = [{ key: "strategy", label: referenceLabel, points: referenceReturn, className: styles.strategyLine }];
    selected.forEach((key) => {
      const points = synchronizedBenchmark(benchmarks[key] ?? [], timeline, key);
      rows.push({ key, label: key, points, className: key === "BTC" ? styles.btcLine : key === "ETH" ? styles.ethLine : styles.spxLine });
    });
    return rows;
  }, [benchmarkMode, referenceLabel, referenceReturn, selected, benchmarks, timeline, rawPoints, mode, capitalUsed]);

  const allPoints = plotSeries.flatMap((item) => item.points);
  const minX = bounds.start;
  const maxX = Math.max(bounds.start + HOUR, bounds.end);
  let minY = allPoints.length ? Math.min(0, ...allPoints.map((point) => point.value)) : 0;
  let maxY = allPoints.length ? Math.max(0, ...allPoints.map((point) => point.value)) : 1;
  if (Math.abs(maxY - minY) < 1e-9) { minY -= 1; maxY += 1; }
  if (!benchmarkMode && mode === "Trade frequency") {
    minY = 0;
    maxY = Math.max(1, maxY * 1.08);
  } else if (!benchmarkMode && mode === "Drawdown") {
    maxY = 0;
    minY = Math.min(-0.01, minY * 1.08);
  } else {
    const padding = (maxY - minY) * 0.08;
    minY -= padding;
    maxY += padding;
  }

  const W = 1000, H = compact ? 250 : 290;
  const left = 76, right = 22, top = 16, bottom = 52;
  const plotW = W - left - right, plotH = H - top - bottom;
  const x = (value: number) => left + ((value - minX) / (maxX - minX)) * plotW;
  const y = (value: number) => top + ((maxY - value) / (maxY - minY)) * plotH;
  const yTicks = Array.from({ length: 5 }, (_, index) => minY + ((maxY - minY) * index) / 4);
  const xTicks = Array.from({ length: 5 }, (_, index) => minX + ((maxX - minX) * index) / 4);
  const spanMs = maxX - minX;
  const yFormatter = benchmarkMode || mode === "Drawdown" ? pctTick : mode === "Trade frequency" ? (value: number) => `${Math.max(0, Math.round(value))}` : moneyTick;
  const yTitle = benchmarkMode ? "Return (%)" : mode === "Drawdown" ? "Drawdown (%)" : mode === "Trade frequency" ? "Trades" : "Realized PnL (USD)";
  const resolutionLabel = step < DAY ? `${Math.round(step / HOUR)}h` : step === DAY ? "1D" : `${Math.round(step / DAY)}D`;

  const toggle = (key: BenchmarkKey) => setSelected((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);

  return <div className={styles.wrap}>
    {mode === "Cumulative PnL" && <div className={styles.benchmarkBar}>
      <span>Compare with</span>
      {BENCHMARKS.map((item) => <button key={item.key} type="button" className={selected.includes(item.key) ? styles.benchmarkActive : ""} onClick={() => toggle(item.key)}>{item.label}</button>)}
      {benchmarkMode && <small>Same {resolutionLabel} timeline · all curves rebased to 0.00% at period start</small>}
      {loading && <small>Loading benchmarks…</small>}
      {benchmarkError && <small className={styles.error}>{benchmarkError}</small>}
    </div>}
    <div className={styles.chartShell}>
      {allPoints.length ? <svg key={`${range}-${mode}-${selected.join("-")}-${series.length}`} className={styles.svg} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`${mode} chart with synchronized benchmark timeline and explicit date and ${yTitle} axes`}>
        {yTicks.map((tick) => <g key={`y-${tick}`}><line x1={left} x2={W-right} y1={y(tick)} y2={y(tick)} className={styles.gridLine}/><text x={left-10} y={y(tick)+4} textAnchor="end" className={styles.tickText}>{yFormatter(tick)}</text></g>)}
        {xTicks.map((tick) => <g key={`x-${tick}`}><line x1={x(tick)} x2={x(tick)} y1={top} y2={H-bottom} className={styles.verticalGrid}/><text x={x(tick)} y={H-bottom+20} textAnchor="middle" className={styles.tickText}>{dateTick(tick, spanMs)}</text></g>)}
        <line x1={left} x2={W-right} y1={H-bottom} y2={H-bottom} className={styles.axisLine}/>
        <line x1={left} x2={left} y1={top} y2={H-bottom} className={styles.axisLine}/>
        {minY < 0 && maxY > 0 && <line x1={left} x2={W-right} y1={y(0)} y2={y(0)} className={styles.zeroLine}/>} 
        <text x={(left+W-right)/2} y={H-7} textAnchor="middle" className={styles.axisTitle}>Date</text>
        <text x="14" y={(top+H-bottom)/2} textAnchor="middle" transform={`rotate(-90 14 ${(top+H-bottom)/2})`} className={styles.axisTitle}>{yTitle}</text>
        {plotSeries.map((item) => <path key={item.key} d={linePath(item.points, x, y)} className={`${styles.line} ${item.className}`} vectorEffect="non-scaling-stroke" fill="none"><title>{item.label}</title></path>)}
      </svg> : <div className={styles.empty}>No closed trades in this period.</div>}
    </div>
    {benchmarkMode && <div className={styles.legend}><span><i className={styles.strategySwatch}/>{referenceLabel}</span>{selected.map((key) => <span key={key}><i className={key === "BTC" ? styles.btcSwatch : key === "ETH" ? styles.ethSwatch : styles.spxSwatch}/>{key}</span>)}</div>}
  </div>;
}
