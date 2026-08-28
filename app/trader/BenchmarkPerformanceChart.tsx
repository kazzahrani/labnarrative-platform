"use client";

import { useEffect, useMemo, useState } from "react";
import { browserSupabase } from "../../lib/supabase-browser";
import styles from "./benchmark-performance-chart.module.css";

type SeriesPoint = { at: string; pnl: number; cumulative: number };
type Mode = "Cumulative PnL" | "Trade PnL" | "Drawdown" | "Trade frequency";
type BenchmarkKey = "BTC" | "ETH" | "SPX";
type BenchmarkPoint = { at: string; price: number; returnPct: number };
type BenchmarkResponse = {
  ok?: boolean;
  source?: string;
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
};

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
  if (spanMs > 330 * 86_400_000) return date.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
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
function linePath(points: PlotPoint[], x: (value: number) => number, y: (value: number) => number) {
  return points.length ? `M${points.map((point) => `${x(point.at).toFixed(2)},${y(point.value).toFixed(2)}`).join(" L")}` : "";
}

export default function BenchmarkPerformanceChart({ series, capitalUsed = 0, mode = "Cumulative PnL", range, compact = false }: Props) {
  const [selected, setSelected] = useState<BenchmarkKey[]>([]);
  const [benchmarks, setBenchmarks] = useState<Partial<Record<BenchmarkKey, BenchmarkPoint[]>>>({});
  const [loading, setLoading] = useState(false);
  const [benchmarkError, setBenchmarkError] = useState("");

  const firstAt = series[0]?.at ?? null;
  const lastAt = series.at(-1)?.at ?? null;
  const benchmarkMode = mode === "Cumulative PnL" && selected.length > 0;

  useEffect(() => {
    if (!benchmarkMode || !firstAt || !lastAt) return;
    let cancelled = false;
    setLoading(true);
    setBenchmarkError("");
    void (async () => {
      const { data, error } = await browserSupabase.functions.invoke("trader-analytics-benchmarks", {
        body: { startAt: firstAt, endAt: lastAt, symbols: BENCHMARKS.map((item) => item.key) },
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
  }, [benchmarkMode, firstAt, lastAt, range]);

  const rawPoints = useMemo(() => buildModePoints(series, mode, finite(capitalUsed)), [series, mode, capitalUsed]);
  const strategyReturn = useMemo(() => series.map((point) => ({
    at: Date.parse(point.at),
    value: finite(capitalUsed) > 0 ? (finite(point.cumulative) / finite(capitalUsed)) * 100 : 0,
  })).filter((point) => Number.isFinite(point.at)), [series, capitalUsed]);

  const plotSeries = useMemo<PlotSeries[]>(() => {
    if (!benchmarkMode) return [{ key: "strategy", label: mode, points: rawPoints, className: styles.strategyLine }];
    const rows: PlotSeries[] = [{ key: "strategy", label: "Strategy", points: strategyReturn, className: styles.strategyLine }];
    selected.forEach((key) => {
      const points = (benchmarks[key] ?? []).map((point) => ({ at: Date.parse(point.at), value: finite(point.returnPct) })).filter((point) => Number.isFinite(point.at));
      rows.push({ key, label: key, points, className: key === "BTC" ? styles.btcLine : key === "ETH" ? styles.ethLine : styles.spxLine });
    });
    return rows;
  }, [benchmarkMode, rawPoints, strategyReturn, selected, benchmarks, mode]);

  const allPoints = plotSeries.flatMap((item) => item.points);
  const fallbackStart = Date.now() - 86_400_000;
  const minX = allPoints.length ? Math.min(...allPoints.map((point) => point.at)) : fallbackStart;
  const maxXRaw = allPoints.length ? Math.max(...allPoints.map((point) => point.at)) : Date.now();
  const maxX = maxXRaw <= minX ? minX + 86_400_000 : maxXRaw;
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

  const toggle = (key: BenchmarkKey) => setSelected((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);

  return <div className={styles.wrap}>
    {mode === "Cumulative PnL" && <div className={styles.benchmarkBar}>
      <span>Compare with</span>
      {BENCHMARKS.map((item) => <button key={item.key} type="button" className={selected.includes(item.key) ? styles.benchmarkActive : ""} onClick={() => toggle(item.key)}>{item.label}</button>)}
      {benchmarkMode && <small>Strategy and benchmarks normalized to return from the selected period start</small>}
      {loading && <small>Loading benchmarks…</small>}
      {benchmarkError && <small className={styles.error}>{benchmarkError}</small>}
    </div>}
    <div className={styles.chartShell}>
      {allPoints.length ? <svg key={`${range}-${mode}-${selected.join("-")}-${series.length}`} className={styles.svg} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`${mode} chart with explicit date and ${yTitle} axes`}>
        {yTicks.map((tick) => <g key={`y-${tick}`}><line x1={left} x2={W-right} y1={y(tick)} y2={y(tick)} className={styles.gridLine}/><text x={left-10} y={y(tick)+4} textAnchor="end" className={styles.tickText}>{yFormatter(tick)}</text></g>)}
        {xTicks.map((tick) => <g key={`x-${tick}`}><line x1={x(tick)} x2={x(tick)} y1={top} y2={H-bottom} className={styles.verticalGrid}/><text x={x(tick)} y={H-bottom+20} textAnchor="middle" className={styles.tickText}>{dateTick(tick, spanMs)}</text></g>)}
        <line x1={left} x2={W-right} y1={H-bottom} y2={H-bottom} className={styles.axisLine}/>
        <line x1={left} x2={left} y1={top} y2={H-bottom} className={styles.axisLine}/>
        {minY < 0 && maxY > 0 && <line x1={left} x2={W-right} y1={y(0)} y2={y(0)} className={styles.zeroLine}/>} 
        <text x={(left+W-right)/2} y={H-7} textAnchor="middle" className={styles.axisTitle}>Date</text>
        <text x="14" y={(top+H-bottom)/2} textAnchor="middle" transform={`rotate(-90 14 ${(top+H-bottom)/2})`} className={styles.axisTitle}>{yTitle}</text>
        {plotSeries.map((item) => <path key={item.key} d={linePath(item.points, x, y)} className={`${styles.line} ${item.className}`} vectorEffect="non-scaling-stroke" fill="none"/>)}
      </svg> : <div className={styles.empty}>No closed trades in this period.</div>}
    </div>
    {benchmarkMode && <div className={styles.legend}><span><i className={styles.strategySwatch}/>Strategy</span>{selected.map((key) => <span key={key}><i className={key === "BTC" ? styles.btcSwatch : key === "ETH" ? styles.ethSwatch : styles.spxSwatch}/>{key}</span>)}</div>}
  </div>;
}
