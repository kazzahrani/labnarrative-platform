"use client";

import { useEffect, useMemo, useState } from "react";
import { browserSupabase } from "../../lib/supabase-browser";
import styles from "./trade-level-bar.module.css";

type ActiveOrder = {
  id: string;
  kind: string;
  side: string;
  status: string;
  sequence: number;
  price: number | null;
  amount: number;
};
type SnapshotTrade = {
  takeProfitPrice?: number | null;
  takeProfitTargets?: Array<{ index: number; profitPct: number; allocationPct: number; price: number }>;
  stopLossPrice?: number | null;
  stopLossTimeoutSeconds?: number;
};
type Snapshot = {
  ok?: boolean;
  trade?: SnapshotTrade;
  activeOrders?: ActiveOrder[];
  error?: string;
};
type Candle = {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  closeTime: number;
};
type CandleResponse = { candles?: Candle[] };
type Props = {
  accountId: string;
  tradeId: string;
  averagePrice: number;
  livePrice: number | null;
  stopLossPrice: number | null;
  takeProfitPrice: number | null;
  active: boolean;
  pair?: string;
  openedAt?: string;
  closedAt?: string | null;
};
type LevelKind = "sl" | "dca" | "avg" | "tp";
type Level = { key: string; kind: LevelKind; label: string; price: number };

const MAX_POINTS = 190;
const INTERVALS: Array<[string, number]> = [
  ["1m", 60_000], ["3m", 180_000], ["5m", 300_000], ["15m", 900_000], ["30m", 1_800_000],
  ["1h", 3_600_000], ["2h", 7_200_000], ["4h", 14_400_000], ["6h", 21_600_000], ["12h", 43_200_000],
  ["1d", 86_400_000], ["3d", 259_200_000], ["1w", 604_800_000],
];

function finitePositive(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}
function intervalForRange(start: number, end: number) {
  const duration = Math.max(60_000, end - start);
  return INTERVALS.find(([, ms]) => duration / ms <= MAX_POINTS)?.[0] ?? "1w";
}
function intervalMs(interval: string) {
  return INTERVALS.find(([key]) => key === interval)?.[1] ?? 60_000;
}
async function exactSnapshot(accountId: string, tradeId: string) {
  const { data, error } = await browserSupabase.functions.invoke("trader-chart-control", { body: { accountId, tradeId } });
  if (error) throw error;
  const result = (data ?? {}) as Snapshot;
  if (result.ok !== true || result.error) throw new Error(result.error || "trade_levels_failed");
  return result;
}

export default function TradeLevelBar({ accountId, tradeId, averagePrice, livePrice, stopLossPrice, takeProfitPrice, active, pair, openedAt, closedAt }: Props) {
  const [snapshot, setSnapshot] = useState<Snapshot>({});
  const [candles, setCandles] = useState<Candle[]>([]);

  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      try {
        const next = await exactSnapshot(accountId, tradeId);
        if (alive) setSnapshot(next);
      } catch {
        // Keep the last exact ledger snapshot. Market movement refreshes independently.
      }
    };
    void refresh();
    if (!active) return () => { alive = false; };
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [accountId, tradeId, active]);

  useEffect(() => {
    let alive = true;
    if (!pair || !openedAt) { setCandles([]); return () => { alive = false; }; }
    const refresh = async () => {
      const start = new Date(openedAt).getTime();
      const end = active ? Date.now() : closedAt ? new Date(closedAt).getTime() : Date.now();
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= 0) return;
      const interval = intervalForRange(start, end);
      const ms = intervalMs(interval);
      const paddedStart = Math.max(0, start - ms * 2);
      const bars = Math.max(8, Math.min(MAX_POINTS, Math.ceil((end - paddedStart) / ms) + 3));
      const symbol = pair.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
      if (!symbol) return;
      try {
        const params = new URLSearchParams({
          symbol,
          interval,
          bars: String(bars),
          startTime: String(paddedStart),
          endTime: String(end),
        });
        const response = await fetch(`/api/trader/klines?${params.toString()}`, { cache: "no-store" });
        if (!response.ok) throw new Error("mini_chart_unavailable");
        const data = await response.json() as CandleResponse;
        if (alive) setCandles((data.candles ?? []).filter((candle) => finitePositive(candle.close) != null));
      } catch {
        // A compact fallback is rendered from average/live prices when public candles are temporarily unavailable.
      }
    };
    void refresh();
    if (!active) return () => { alive = false; };
    const timer = window.setInterval(() => void refresh(), 15000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [pair, openedAt, closedAt, active]);

  const chart = useMemo(() => {
    const orders = snapshot.activeOrders ?? [];
    const exactTrade = snapshot.trade;
    const activeDcas = orders
      .filter((order) => order.side.toUpperCase() === "BUY" && order.kind.toLowerCase().includes("averag") && finitePositive(order.price) != null)
      .sort((a, b) => a.sequence - b.sequence);
    const activeTps = orders
      .filter((order) => order.side.toUpperCase() === "SELL" && finitePositive(order.price) != null && (order.kind.toLowerCase().includes("take") || order.kind.toLowerCase().includes("profit")))
      .sort((a, b) => a.sequence - b.sequence);
    const configuredTps = (exactTrade?.takeProfitTargets ?? [])
      .filter((target) => finitePositive(target.price) != null)
      .sort((a, b) => a.index - b.index);

    const levels: Level[] = [];
    const sl = finitePositive(exactTrade?.stopLossPrice) ?? finitePositive(stopLossPrice);
    const avg = finitePositive(averagePrice);
    if (sl) levels.push({ key: "sl", kind: "sl", label: "SL", price: sl });
    activeDcas.forEach((order, index) => levels.push({ key: `dca-${order.id}`, kind: "dca", label: `DCA${order.sequence || index + 1}`, price: Number(order.price) }));
    if (avg) levels.push({ key: "avg", kind: "avg", label: "AVG", price: avg });

    if (configuredTps.length) {
      configuredTps.forEach((target) => levels.push({ key: `tp-config-${target.index}`, kind: "tp", label: configuredTps.length > 1 ? `TP${target.index}` : "TP", price: target.price }));
    } else if (activeTps.length) {
      activeTps.forEach((order, index) => levels.push({ key: `tp-${order.id}`, kind: "tp", label: activeTps.length > 1 ? `TP${index + 1}` : "TP", price: Number(order.price) }));
    } else {
      const tp = finitePositive(exactTrade?.takeProfitPrice) ?? finitePositive(takeProfitPrice);
      if (tp) levels.push({ key: "tp-derived", kind: "tp", label: "TP", price: tp });
    }

    const pointRows = candles.map((candle) => ({ time: candle.closeTime, price: Number(candle.close), high: Number(candle.high), low: Number(candle.low) }));
    const live = finitePositive(livePrice);
    if (live) {
      const lastTime = pointRows[pointRows.length - 1]?.time ?? 0;
      const end = active ? Date.now() : closedAt ? new Date(closedAt).getTime() : Date.now();
      if (!pointRows.length || end > lastTime) pointRows.push({ time: end, price: live, high: live, low: live });
      else pointRows[pointRows.length - 1] = { ...pointRows[pointRows.length - 1], price: live };
    }
    if (!pointRows.length && avg) {
      pointRows.push({ time: 0, price: avg, high: avg, low: avg });
      if (live && live !== avg) pointRows.push({ time: 1, price: live, high: live, low: live });
    }

    const allPrices = [
      ...pointRows.flatMap((point) => [point.price, point.high, point.low]).filter((value) => Number.isFinite(value) && value > 0),
      ...levels.map((level) => level.price),
    ];
    const fallback = avg ?? live ?? 1;
    let min = allPrices.length ? Math.min(...allPrices) : fallback * .98;
    let max = allPrices.length ? Math.max(...allPrices) : fallback * 1.02;
    if (!(max > min)) { min = fallback * .99; max = fallback * 1.01; }
    const span = Math.max(max - min, fallback * .003, 1e-12);
    min -= span * .10;
    max += span * .10;

    const width = 560;
    const height = 112;
    const left = 9;
    const right = 515;
    const top = 8;
    const bottom = 104;
    const y = (price: number) => top + (max - price) / (max - min) * (bottom - top);
    const x = (index: number) => pointRows.length <= 1 ? left : left + index / (pointRows.length - 1) * (right - left);
    const plotted = pointRows.map((point, index) => ({ ...point, x: x(index), y: y(point.price) }));
    const segments = plotted.slice(1).map((point, index) => {
      const previous = plotted[index];
      const midpoint = (previous.price + point.price) / 2;
      return { key: `${index}-${point.time}`, x1: previous.x, y1: previous.y, x2: point.x, y2: point.y, positive: avg ? midpoint >= avg : midpoint >= plotted[0]?.price };
    });
    const plottedLevels = levels
      .map((level) => ({ ...level, y: y(level.price) }))
      .sort((a, b) => a.y - b.y);

    return { width, height, left, right, plotted, segments, levels: plottedLevels };
  }, [snapshot, candles, averagePrice, livePrice, stopLossPrice, takeProfitPrice, active, closedAt]);

  return <div className={styles.wrap} aria-label="Live price movement with trade levels">
    <svg className={styles.chart} viewBox={`0 0 ${chart.width} ${chart.height}`} preserveAspectRatio="none" role="img">
      <rect x="0" y="0" width={chart.width} height={chart.height} rx="16" className={styles.background}/>
      {chart.levels.map((level) => <g key={level.key}>
        <line x1={chart.left} x2={chart.right} y1={level.y} y2={level.y} className={`${styles.levelLine} ${level.kind === "avg" ? styles.averageLine : ""}`}/>
        <text x={523} y={Math.max(10, Math.min(106, level.y + 3))} className={`${styles.levelLabel} ${level.kind === "avg" ? styles.averageLabel : ""}`}>{level.label}</text>
      </g>)}
      {chart.segments.map((segment) => <line key={segment.key} x1={segment.x1} y1={segment.y1} x2={segment.x2} y2={segment.y2} className={segment.positive ? styles.profitLine : styles.lossLine}/>) }
      {chart.plotted.length > 0 && <circle cx={chart.plotted[chart.plotted.length - 1].x} cy={chart.plotted[chart.plotted.length - 1].y} r="2.3" className={styles.currentDot}/>} 
    </svg>
  </div>;
}
