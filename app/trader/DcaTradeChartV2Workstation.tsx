"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  HistogramSeries,
  LineSeries,
  LineStyle,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type SeriesMarker,
  type UTCTimestamp,
} from "lightweight-charts";
import { browserSupabase } from "../../lib/supabase-browser";
import styles from "./dca-trade-workstation.module.css";

type Fill = {
  kind: string;
  side?: string;
  price: number;
  amount: number;
  quantity: number;
  at: string;
};
type Condition = {
  id: string;
  kind: string;
  timeframe: string;
  length: number;
  comparator: string;
  signal: number;
  aux1: number;
  aux2: number;
  aux3: number;
};
type ActiveOrder = {
  id: string;
  kind: string;
  side: string;
  status: string;
  sequence: number;
  price: number | null;
  amount: number;
};
type ChartTrade = {
  id: string;
  pair: string;
  status: "Active" | "Closed";
  entryPrice: number;
  averagePrice: number;
  quantity: number;
  invested: number;
  takeProfitPct: number;
  takeProfitPrice: number | null;
  stopEnabled: boolean;
  stopPct: number;
  stopLossPrice: number | null;
  lastPrice: number | null;
  exitPrice: number | null;
  openedAt: string;
  closedAt: string | null;
  closeReason: string | null;
};
type ChartSnapshot = {
  ok?: boolean;
  trade?: ChartTrade;
  bot?: { id: string; name: string; conditions: Condition[] } | null;
  fills?: Fill[];
  activeOrders?: ActiveOrder[];
  error?: string;
};
type Props = {
  accountId: string;
  tradeId: string;
  pair: string;
  status: "Active" | "Closed";
  entryPrice: number;
  averagePrice: number;
  createdAt: string;
  closedAt?: string;
  exitPrice?: number;
  closeReason?: string;
  lastPrice?: number;
  fills?: Fill[];
  takeProfitPrice?: number | null;
  stopLossPrice?: number | null;
  nextAveragingPrice?: number | null;
  onClose: () => void;
};
type Candle = {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};
type Interval = "3m" | "5m" | "15m" | "1h" | "4h" | "1d" | "1w" | "1M";
type IndicatorName =
  | "Volume"
  | "RSI"
  | "Stochastic"
  | "MACD"
  | "Moving Average (MA)"
  | "Average Directional Index"
  | "Bollinger Bands %B"
  | "Money Flow Index"
  | "Commodity Channel Index"
  | "Ultimate Oscillator"
  | "Parabolic SAR"
  | "Heikin Ashi";

type Point = { time: UTCTimestamp; value: number };

const INTERVALS: Array<{ value: Interval; label: string }> = [
  { value: "3m", label: "3m" }, { value: "5m", label: "5m" }, { value: "15m", label: "15m" },
  { value: "1h", label: "1H" }, { value: "4h", label: "4H" }, { value: "1d", label: "D" },
  { value: "1w", label: "W" }, { value: "1M", label: "M" },
];
const HISTORY_BARS: Record<Interval, number> = { "3m": 6000, "5m": 6000, "15m": 6000, "1h": 6000, "4h": 6000, "1d": 6000, "1w": 2500, "1M": 1200 };
const INDICATORS: IndicatorName[] = [
  "Volume", "RSI", "Stochastic", "MACD", "Moving Average (MA)", "Average Directional Index",
  "Bollinger Bands %B", "Money Flow Index", "Commodity Channel Index", "Ultimate Oscillator", "Parabolic SAR", "Heikin Ashi",
];
const OVERLAYS = new Set<IndicatorName>(["Moving Average (MA)", "Parabolic SAR", "Heikin Ashi"]);
const DEFAULT_PANE_HEIGHTS: Record<string, number> = {
  Volume: 90, RSI: 135, Stochastic: 145, MACD: 145, "Average Directional Index": 135,
  "Bollinger Bands %B": 130, "Money Flow Index": 130, "Commodity Channel Index": 130, "Ultimate Oscillator": 130,
};
const DEFAULTS: Record<Exclude<IndicatorName, "Volume">, Condition> = {
  RSI: { id: "chart-rsi", kind: "RSI", timeframe: "chart", length: 14, comparator: "Less Than", signal: 30, aux1: 0, aux2: 0, aux3: 0 },
  Stochastic: { id: "chart-stoch", kind: "Stochastic", timeframe: "chart", length: 2, comparator: "Less Than", signal: 20, aux1: 14, aux2: 1, aux3: 3 },
  MACD: { id: "chart-macd", kind: "MACD", timeframe: "chart", length: 1, comparator: "Crossing Up", signal: 0, aux1: 12, aux2: 26, aux3: 9 },
  "Moving Average (MA)": { id: "chart-ma", kind: "Moving Average (MA)", timeframe: "chart", length: 0, comparator: "Crossing Up", signal: 0, aux1: 1, aux2: 9, aux3: 26 },
  "Average Directional Index": { id: "chart-adx", kind: "Average Directional Index", timeframe: "chart", length: 14, comparator: "Greater Than", signal: 25, aux1: 0, aux2: 0, aux3: 0 },
  "Bollinger Bands %B": { id: "chart-bb", kind: "Bollinger Bands %B", timeframe: "chart", length: 20, comparator: "Less Than", signal: 0, aux1: 2, aux2: 0, aux3: 0 },
  "Money Flow Index": { id: "chart-mfi", kind: "Money Flow Index", timeframe: "chart", length: 14, comparator: "Less Than", signal: 20, aux1: 0, aux2: 0, aux3: 0 },
  "Commodity Channel Index": { id: "chart-cci", kind: "Commodity Channel Index", timeframe: "chart", length: 20, comparator: "Less Than", signal: -100, aux1: 0, aux2: 0, aux3: 0 },
  "Ultimate Oscillator": { id: "chart-uo", kind: "Ultimate Oscillator", timeframe: "chart", length: 0, comparator: "Less Than", signal: 30, aux1: 7, aux2: 14, aux3: 28 },
  "Parabolic SAR": { id: "chart-psar", kind: "Parabolic SAR", timeframe: "chart", length: 0, comparator: "Crossing Up", signal: 0, aux1: 2, aux2: 1, aux3: 0 },
  "Heikin Ashi": { id: "chart-ha", kind: "Heikin Ashi", timeframe: "chart", length: 2, comparator: "Greater Than", signal: 0, aux1: 0, aux2: 0, aux3: 0 },
};

function chooseInterval(createdAt: string, closedAt?: string): Interval {
  const start = new Date(createdAt).getTime();
  const end = closedAt ? new Date(closedAt).getTime() : Date.now();
  const hours = Math.max(0, (end - start) / 3600000);
  if (hours <= 6) return "3m"; if (hours <= 24) return "5m"; if (hours <= 72) return "15m";
  if (hours <= 24 * 30) return "1h"; if (hours <= 24 * 180) return "4h"; if (hours <= 24 * 1000) return "1d"; return "1w";
}
function t(candle: Candle): UTCTimestamp { return Math.floor(candle.openTime / 1000) as UTCTimestamp; }
function nearestCandleTime(candles: Candle[], timestamp: number): UTCTimestamp | null {
  if (!candles.length) return null; let candidate = candles[0];
  for (const candle of candles) { if (candle.openTime <= timestamp) candidate = candle; else break; }
  return t(candidate);
}
function precisionFor(value: number) {
  const v = Math.abs(value); if (v >= 1000) return 2; if (v >= 100) return 3; if (v >= 1) return 4; if (v >= .1) return 5; if (v >= .01) return 6; return 8;
}
function formatPrice(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: precisionFor(value) });
}
function normalizeLength(value: number, fallback: number) { return Math.max(1, Math.round(Number.isFinite(value) && value > 0 ? value : fallback)); }
function values(candles: Candle[]) { return candles.map((c) => c.close); }
function sma(input: number[], length: number): Array<number | null> {
  const out: Array<number | null> = Array(input.length).fill(null); let sum = 0;
  for (let i = 0; i < input.length; i += 1) { sum += input[i]; if (i >= length) sum -= input[i - length]; if (i >= length - 1) out[i] = sum / length; }
  return out;
}
function ema(input: number[], length: number): Array<number | null> {
  const out: Array<number | null> = Array(input.length).fill(null); if (!input.length) return out;
  const k = 2 / (length + 1); let seed = 0;
  for (let i = 0; i < input.length; i += 1) {
    if (i < length) seed += input[i];
    if (i === length - 1) out[i] = seed / length;
    else if (i >= length && out[i - 1] != null) out[i] = input[i] * k + (out[i - 1] as number) * (1 - k);
  }
  return out;
}
function wma(input: number[], length: number): Array<number | null> {
  const out: Array<number | null> = Array(input.length).fill(null); const divisor = length * (length + 1) / 2;
  for (let i = length - 1; i < input.length; i += 1) { let sum = 0; for (let j = 0; j < length; j += 1) sum += input[i - length + 1 + j] * (j + 1); out[i] = sum / divisor; }
  return out;
}
function toPoints(candles: Candle[], input: Array<number | null>): Point[] { return input.flatMap((v, i) => v == null || !Number.isFinite(v) ? [] : [{ time: t(candles[i]), value: v }]); }
function rsi(candles: Candle[], length: number): Point[] {
  if (candles.length <= length) return []; const out: Point[] = []; let gain = 0, loss = 0;
  for (let i = 1; i <= length; i += 1) { const change = candles[i].close - candles[i - 1].close; gain += Math.max(change, 0); loss += Math.max(-change, 0); }
  gain /= length; loss /= length;
  for (let i = length; i < candles.length; i += 1) {
    if (i > length) { const change = candles[i].close - candles[i - 1].close; gain = (gain * (length - 1) + Math.max(change, 0)) / length; loss = (loss * (length - 1) + Math.max(-change, 0)) / length; }
    out.push({ time: t(candles[i]), value: loss === 0 ? 100 : 100 - 100 / (1 + gain / loss) });
  }
  return out;
}
function stochastic(candles: Candle[], kLength: number, kSmooth: number, dSmooth: number) {
  const raw: Array<number | null> = candles.map((c, i) => {
    if (i < kLength - 1) return null; const win = candles.slice(i - kLength + 1, i + 1); const high = Math.max(...win.map(x => x.high)); const low = Math.min(...win.map(x => x.low));
    return high === low ? 50 : (c.close - low) / (high - low) * 100;
  });
  const smoothNullable = (input: Array<number | null>, length: number) => input.map((_, i) => {
    if (i < length - 1) return null; const win = input.slice(i - length + 1, i + 1); if (win.some(v => v == null)) return null; return win.reduce((s, v) => s + (v ?? 0), 0) / length;
  });
  const k = smoothNullable(raw, kSmooth); const d = smoothNullable(k, dSmooth); return { k: toPoints(candles, k), d: toPoints(candles, d) };
}
function macd(candles: Candle[], fast: number, slow: number, signal: number) {
  const close = values(candles); const f = ema(close, fast); const s = ema(close, slow);
  const mRaw = close.map((_, i) => f[i] == null || s[i] == null ? null : (f[i] as number) - (s[i] as number));
  const compact = mRaw.map(v => v ?? 0); const sigFull = ema(compact, signal);
  const macdPoints = toPoints(candles, mRaw); const signalValues = mRaw.map((v, i) => v == null || sigFull[i] == null ? null : sigFull[i]);
  const hist = mRaw.map((v, i) => v == null || signalValues[i] == null ? null : v - (signalValues[i] as number));
  return { macd: macdPoints, signal: toPoints(candles, signalValues), hist };
}
function adx(candles: Candle[], length: number) {
  const count = candles.length; const tr = Array(count).fill(0), plusDM = Array(count).fill(0), minusDM = Array(count).fill(0);
  for (let i = 1; i < count; i += 1) {
    tr[i] = Math.max(candles[i].high - candles[i].low, Math.abs(candles[i].high - candles[i - 1].close), Math.abs(candles[i].low - candles[i - 1].close));
    const up = candles[i].high - candles[i - 1].high, down = candles[i - 1].low - candles[i].low;
    plusDM[i] = up > down && up > 0 ? up : 0; minusDM[i] = down > up && down > 0 ? down : 0;
  }
  const plus: Array<number | null> = Array(count).fill(null), minus: Array<number | null> = Array(count).fill(null), dx: Array<number | null> = Array(count).fill(null), ax: Array<number | null> = Array(count).fill(null);
  let trS = 0, pS = 0, mS = 0;
  for (let i = 1; i <= length && i < count; i += 1) { trS += tr[i]; pS += plusDM[i]; mS += minusDM[i]; }
  if (count > length) {
    plus[length] = trS ? pS / trS * 100 : 0; minus[length] = trS ? mS / trS * 100 : 0; dx[length] = (plus[length]! + minus[length]!) ? Math.abs(plus[length]! - minus[length]!) / (plus[length]! + minus[length]!) * 100 : 0;
    for (let i = length + 1; i < count; i += 1) {
      trS = trS - trS / length + tr[i]; pS = pS - pS / length + plusDM[i]; mS = mS - mS / length + minusDM[i];
      plus[i] = trS ? pS / trS * 100 : 0; minus[i] = trS ? mS / trS * 100 : 0; dx[i] = (plus[i]! + minus[i]!) ? Math.abs(plus[i]! - minus[i]!) / (plus[i]! + minus[i]!) * 100 : 0;
    }
    const start = length * 2 - 1; if (start < count) { let sum = 0; for (let i = length; i <= start; i += 1) sum += dx[i] ?? 0; ax[start] = sum / length; for (let i = start + 1; i < count; i += 1) ax[i] = ((ax[i - 1] ?? 0) * (length - 1) + (dx[i] ?? 0)) / length; }
  }
  return { adx: toPoints(candles, ax), plus: toPoints(candles, plus), minus: toPoints(candles, minus) };
}
function bbPercent(candles: Candle[], length: number, deviation: number) {
  const close = values(candles), avg = sma(close, length); const out: Array<number | null> = Array(close.length).fill(null);
  for (let i = length - 1; i < close.length; i += 1) { const mean = avg[i] as number; const win = close.slice(i - length + 1, i + 1); const sd = Math.sqrt(win.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / length); const upper = mean + deviation * sd, lower = mean - deviation * sd; out[i] = upper === lower ? .5 : (close[i] - lower) / (upper - lower); }
  return toPoints(candles, out);
}
function mfi(candles: Candle[], length: number) {
  const tp = candles.map(c => (c.high + c.low + c.close) / 3); const flow = candles.map((c, i) => tp[i] * c.volume); const out: Array<number | null> = Array(candles.length).fill(null);
  for (let i = length; i < candles.length; i += 1) { let pos = 0, neg = 0; for (let j = i - length + 1; j <= i; j += 1) { if (tp[j] >= tp[j - 1]) pos += flow[j]; else neg += flow[j]; } out[i] = neg === 0 ? 100 : 100 - 100 / (1 + pos / neg); }
  return toPoints(candles, out);
}
function cci(candles: Candle[], length: number) {
  const tp = candles.map(c => (c.high + c.low + c.close) / 3), avg = sma(tp, length), out: Array<number | null> = Array(candles.length).fill(null);
  for (let i = length - 1; i < candles.length; i += 1) { const mean = avg[i] as number; const win = tp.slice(i - length + 1, i + 1); const dev = win.reduce((s, v) => s + Math.abs(v - mean), 0) / length; out[i] = dev === 0 ? 0 : (tp[i] - mean) / (.015 * dev); }
  return toPoints(candles, out);
}
function ultimate(candles: Candle[], a: number, b: number, c: number) {
  const bp = Array(candles.length).fill(0), tr = Array(candles.length).fill(0), out: Array<number | null> = Array(candles.length).fill(null);
  for (let i = 1; i < candles.length; i += 1) { const min = Math.min(candles[i].low, candles[i - 1].close), max = Math.max(candles[i].high, candles[i - 1].close); bp[i] = candles[i].close - min; tr[i] = max - min; }
  const ratio = (end: number, len: number) => { let bps = 0, trs = 0; for (let i = end - len + 1; i <= end; i += 1) { bps += bp[i]; trs += tr[i]; } return trs === 0 ? 0 : bps / trs; };
  const maxLen = Math.max(a, b, c); for (let i = maxLen; i < candles.length; i += 1) out[i] = 100 * (4 * ratio(i, a) + 2 * ratio(i, b) + ratio(i, c)) / 7;
  return toPoints(candles, out);
}
function psar(candles: Candle[], step: number, maximum: number) {
  if (candles.length < 2) return [] as Point[]; const out: Point[] = []; let bull = candles[1].close >= candles[0].close; let sar = bull ? candles[0].low : candles[0].high; let ep = bull ? candles[0].high : candles[0].low; let af = step;
  for (let i = 1; i < candles.length; i += 1) {
    sar = sar + af * (ep - sar);
    if (bull) {
      sar = Math.min(sar, candles[i - 1].low, i > 1 ? candles[i - 2].low : candles[i - 1].low);
      if (candles[i].low < sar) { bull = false; sar = ep; ep = candles[i].low; af = step; } else if (candles[i].high > ep) { ep = candles[i].high; af = Math.min(maximum, af + step); }
    } else {
      sar = Math.max(sar, candles[i - 1].high, i > 1 ? candles[i - 2].high : candles[i - 1].high);
      if (candles[i].high > sar) { bull = true; sar = ep; ep = candles[i].high; af = step; } else if (candles[i].low < ep) { ep = candles[i].low; af = Math.min(maximum, af + step); }
    }
    out.push({ time: t(candles[i]), value: sar });
  }
  return out;
}
function heikin(candles: Candle[]) {
  let previousOpen = candles[0] ? (candles[0].open + candles[0].close) / 2 : 0; let previousClose = candles[0] ? (candles[0].open + candles[0].high + candles[0].low + candles[0].close) / 4 : 0;
  return candles.map((c, i) => { const close = (c.open + c.high + c.low + c.close) / 4; const open = i === 0 ? previousOpen : (previousOpen + previousClose) / 2; const high = Math.max(c.high, open, close); const low = Math.min(c.low, open, close); previousOpen = open; previousClose = close; return { time: t(c), open, high, low, close }; });
}
function conditionFor(name: Exclude<IndicatorName, "Volume">, conditions: Condition[]) { return conditions.find(c => c.kind === name) ?? DEFAULTS[name]; }
function addThreshold(series: ISeriesApi<"Line">, price: number, title: string) {
  if (!Number.isFinite(price)) return; series.createPriceLine({ price, color: "#555", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title });
}

async function loadSnapshot(accountId: string, tradeId: string) {
  const { data, error } = await browserSupabase.functions.invoke("trader-chart-control", { body: { accountId, tradeId } });
  if (error) {
    let message = error.message || "trade_chart_failed"; const context = (error as { context?: Response }).context;
    if (context) { try { const payload = await context.clone().json() as { error?: string }; if (payload.error) message = payload.error; } catch {} }
    throw new Error(message);
  }
  const result = (data ?? {}) as ChartSnapshot; if (result.error || result.ok !== true) throw new Error(result.error || "trade_chart_failed"); return result;
}

export default function DcaTradeChartV2Workstation(props: Props) {
  const { accountId, tradeId, onClose } = props;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const marketLineRef = useRef<IPriceLine | null>(null);
  const [interval, setInterval] = useState<Interval>(() => chooseInterval(props.createdAt, props.closedAt));
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [snapshot, setSnapshot] = useState<ChartSnapshot | null>(null);
  const [showIndicators, setShowIndicators] = useState(false);
  const [enabled, setEnabled] = useState<IndicatorName[]>(["Volume", "RSI", "Stochastic"]);
  const [paneOrder, setPaneOrder] = useState<IndicatorName[]>(["Volume", "RSI", "Stochastic", "MACD", "Average Directional Index", "Bollinger Bands %B", "Money Flow Index", "Commodity Channel Index", "Ultimate Oscillator"]);
  const [paneHeights, setPaneHeights] = useState<Record<string, number>>({ ...DEFAULT_PANE_HEIGHTS });
  const [priceHeight, setPriceHeight] = useState(340);
  const [autoY, setAutoY] = useState(true);
  const initializedForTrade = useRef<string | null>(null);

  const trade = snapshot?.trade ?? {
    id: tradeId, pair: props.pair, status: props.status, entryPrice: props.entryPrice, averagePrice: props.averagePrice,
    quantity: 0, invested: 0, takeProfitPct: 0, takeProfitPrice: props.takeProfitPrice ?? null,
    stopEnabled: Boolean(props.stopLossPrice), stopPct: 0, stopLossPrice: props.stopLossPrice ?? null,
    lastPrice: props.lastPrice ?? null, exitPrice: props.exitPrice ?? null, openedAt: props.createdAt,
    closedAt: props.closedAt ?? null, closeReason: props.closeReason ?? null,
  } satisfies ChartTrade;
  const fills = snapshot?.fills?.length ? snapshot.fills : (props.fills ?? []);
  const conditions = snapshot?.bot?.conditions ?? [];
  const activeOrders = snapshot?.activeOrders ?? [];
  const pendingDcas = activeOrders.filter(o => o.side.toUpperCase() === "BUY" && o.price != null && o.kind.toLowerCase().includes("averag")).sort((a, b) => a.sequence - b.sequence);
  const pendingExits = activeOrders.filter(o => o.side.toUpperCase() === "SELL" && o.price != null).sort((a, b) => a.sequence - b.sequence);
  const symbol = trade.pair.replace("/", "");

  useEffect(() => {
    let alive = true;
    const refresh = async (quiet = false) => {
      if (!quiet) setLoading(true);
      try { const data = await loadSnapshot(accountId, tradeId); if (alive) { setSnapshot(data); setError(""); } }
      catch (caught) { if (alive && !quiet) setError(caught instanceof Error ? caught.message : "Unable to load exact trade ledger."); }
      finally { if (alive && !quiet) setLoading(false); }
    };
    void refresh(false); const timer = window.setInterval(() => void refresh(true), 5000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [accountId, tradeId]);

  useEffect(() => {
    if (initializedForTrade.current === tradeId || !snapshot) return;
    initializedForTrade.current = tradeId;
    const strategy = Array.from(new Set(conditions.map(c => c.kind).filter((name): name is IndicatorName => INDICATORS.includes(name as IndicatorName))));
    if (strategy.length) setEnabled(Array.from(new Set<IndicatorName>(["Volume", ...strategy])));
  }, [snapshot, tradeId, conditions]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true); setError("");
      try {
        const params = new URLSearchParams({ symbol, interval, bars: String(HISTORY_BARS[interval]), endTime: String(Date.now()) });
        const response = await fetch(`/api/trader/klines?${params.toString()}`, { cache: "no-store" }); const data = await response.json();
        if (!response.ok) throw new Error(data?.error ?? "Unable to load Binance candles");
        if (!cancelled) setCandles(Array.isArray(data.candles) ? data.candles : []);
      } catch (caught) { if (!cancelled) setError(caught instanceof Error ? caught.message : "Unable to load chart"); }
      finally { if (!cancelled) setLoading(false); }
    };
    void run(); return () => { cancelled = true; };
  }, [symbol, interval]);

  const structureSignature = useMemo(() => JSON.stringify({
    fills: fills.map(f => [f.kind, f.side, f.price, f.at]),
    orders: activeOrders.map(o => [o.id, o.kind, o.side, o.sequence, o.price]),
    avg: trade.averagePrice, tp: trade.takeProfitPrice, sl: trade.stopLossPrice, exit: trade.exitPrice,
  }), [fills, activeOrders, trade.averagePrice, trade.takeProfitPrice, trade.stopLossPrice, trade.exitPrice]);

  const separateEnabled = paneOrder.filter(name => enabled.includes(name) && !OVERLAYS.has(name));
  const canvasHeight = Math.max(420, priceHeight + separateEnabled.reduce((sum, name) => sum + (paneHeights[name] ?? 130), 0));

  useEffect(() => {
    const host = containerRef.current; if (!host || !candles.length) return;
    host.replaceChildren();
    const chart = createChart(host, {
      width: host.clientWidth, height: host.clientHeight,
      layout: { background: { type: ColorType.Solid, color: "#121212" }, textColor: "#a9a9a9", attributionLogo: true, panes: { separatorColor: "#343434", separatorHoverColor: "#5d5d5d", enableResize: true } },
      grid: { vertLines: { color: "rgba(255,255,255,.045)" }, horzLines: { color: "rgba(255,255,255,.045)" } },
      crosshair: { vertLine: { color: "#626262", labelBackgroundColor: "#303030" }, horzLine: { color: "#626262", labelBackgroundColor: "#303030" } },
      rightPriceScale: { borderColor: "#343434", minimumWidth: 76, autoScale: autoY },
      timeScale: { borderColor: "#343434", timeVisible: !["1d", "1w", "1M"].includes(interval), secondsVisible: false, rightOffset: 8, barSpacing: interval === "1M" ? 8 : interval === "1w" ? 7 : 5, minBarSpacing: .8 },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: true },
      handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
      kineticScroll: { mouse: true, touch: true },
    });
    chartRef.current = chart;
    const priceReference = trade.averagePrice || trade.entryPrice || candles[candles.length - 1]?.close || 1; const precision = precisionFor(priceReference);
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#b8c0c7", downColor: "#535960", borderUpColor: "#b8c0c7", borderDownColor: "#535960", wickUpColor: "#858d94", wickDownColor: "#535960",
      priceLineVisible: false, lastValueVisible: true, priceFormat: { type: "price", precision, minMove: Math.pow(10, -precision) },
    });
    const useHeikin = enabled.includes("Heikin Ashi");
    candleSeries.setData(useHeikin ? heikin(candles) : candles.map(c => ({ time: t(c), open: c.open, high: c.high, low: c.low, close: c.close })));

    if (enabled.includes("Moving Average (MA)")) {
      const c = conditionFor("Moving Average (MA)", conditions); const fast = normalizeLength(c.aux2, 9), slow = normalizeLength(c.aux3, 26); const close = values(candles);
      const calc = c.aux1 === 2 ? wma : c.aux1 === 0 ? sma : ema;
      const fastSeries = chart.addSeries(LineSeries, { color: "#e0b15d", lineWidth: 2, priceLineVisible: false, lastValueVisible: true, title: `${c.aux1 === 2 ? "WMA" : c.aux1 === 0 ? "SMA" : "EMA"} ${fast}` });
      const slowSeries = chart.addSeries(LineSeries, { color: "#9c78d8", lineWidth: 2, priceLineVisible: false, lastValueVisible: true, title: `${c.aux1 === 2 ? "WMA" : c.aux1 === 0 ? "SMA" : "EMA"} ${slow}` });
      fastSeries.setData(toPoints(candles, calc(close, fast))); slowSeries.setData(toPoints(candles, calc(close, slow)));
    }
    if (enabled.includes("Parabolic SAR")) {
      const c = conditionFor("Parabolic SAR", conditions); const step = Math.max(.001, c.aux1 ? c.aux1 / 100 : .02), max = Math.max(step, c.aux2 ? c.aux2 / 5 : .2);
      const series = chart.addSeries(LineSeries, { color: "#d4d4d4", lineWidth: 1, lineStyle: LineStyle.Dotted, priceLineVisible: false, lastValueVisible: false, title: "PSAR" }); series.setData(psar(candles, step, max));
    }

    let nextPane = 1; const paneMap = new Map<IndicatorName, number>();
    for (const name of separateEnabled) {
      const pane = nextPane++; paneMap.set(name, pane);
      if (name === "Volume") {
        const series = chart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceLineVisible: false, lastValueVisible: false, title: "Volume" }, pane);
        series.setData(candles.map(c => ({ time: t(c), value: c.volume, color: c.close >= c.open ? "rgba(106,171,145,.52)" : "rgba(179,103,111,.48)" })));
      } else if (name === "RSI") {
        const c = conditionFor("RSI", conditions); const series = chart.addSeries(LineSeries, { color: "#b78de3", lineWidth: 2, priceLineVisible: false, lastValueVisible: true, title: `RSI ${normalizeLength(c.length, 14)}` }, pane); series.setData(rsi(candles, normalizeLength(c.length, 14))); addThreshold(series, 70, "70"); addThreshold(series, 30, "30"); if (c.signal !== 30 && c.signal !== 70) addThreshold(series, c.signal, "Bot trigger");
      } else if (name === "Stochastic") {
        const c = conditionFor("Stochastic", conditions); const st = stochastic(candles, normalizeLength(c.aux1, 14), normalizeLength(c.aux2, 1), normalizeLength(c.aux3, 3));
        const k = chart.addSeries(LineSeries, { color: "#6ca6d9", lineWidth: 2, priceLineVisible: false, lastValueVisible: true, title: "%K" }, pane); const d = chart.addSeries(LineSeries, { color: "#d6924e", lineWidth: 2, priceLineVisible: false, lastValueVisible: true, title: "%D" }, pane); k.setData(st.k); d.setData(st.d); addThreshold(k, 80, "80"); addThreshold(k, 20, "20"); if (c.signal !== 20 && c.signal !== 80) addThreshold(k, c.signal, "Bot trigger");
      } else if (name === "MACD") {
        const c = conditionFor("MACD", conditions); const m = macd(candles, normalizeLength(c.aux1, 12), normalizeLength(c.aux2, 26), normalizeLength(c.aux3, 9));
        const hist = chart.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false, title: "MACD hist" }, pane); hist.setData(m.hist.flatMap((v, i) => v == null ? [] : [{ time: t(candles[i]), value: v, color: v >= 0 ? "rgba(97,165,137,.46)" : "rgba(184,96,106,.44)" }]));
        const ml = chart.addSeries(LineSeries, { color: "#86a9dc", lineWidth: 2, priceLineVisible: false, lastValueVisible: true, title: "MACD" }, pane); const sl = chart.addSeries(LineSeries, { color: "#d29a58", lineWidth: 2, priceLineVisible: false, lastValueVisible: true, title: "Signal" }, pane); ml.setData(m.macd); sl.setData(m.signal); addThreshold(ml, 0, "0");
      } else if (name === "Average Directional Index") {
        const c = conditionFor("Average Directional Index", conditions); const data = adx(candles, normalizeLength(c.length, 14));
        const ax = chart.addSeries(LineSeries, { color: "#ddd", lineWidth: 2, priceLineVisible: false, lastValueVisible: true, title: "ADX" }, pane); const plus = chart.addSeries(LineSeries, { color: "#75b995", lineWidth: 1, priceLineVisible: false, lastValueVisible: false, title: "+DI" }, pane); const minus = chart.addSeries(LineSeries, { color: "#cf7d86", lineWidth: 1, priceLineVisible: false, lastValueVisible: false, title: "−DI" }, pane); ax.setData(data.adx); plus.setData(data.plus); minus.setData(data.minus); addThreshold(ax, c.signal || 25, "Bot trigger");
      } else if (name === "Bollinger Bands %B") {
        const c = conditionFor("Bollinger Bands %B", conditions); const series = chart.addSeries(LineSeries, { color: "#91a7ce", lineWidth: 2, priceLineVisible: false, lastValueVisible: true, title: "%B" }, pane); series.setData(bbPercent(candles, normalizeLength(c.length, 20), c.aux1 || 2)); addThreshold(series, 1, "1"); addThreshold(series, 0, "0"); if (c.signal !== 0 && c.signal !== 1) addThreshold(series, c.signal, "Bot trigger");
      } else if (name === "Money Flow Index") {
        const c = conditionFor("Money Flow Index", conditions); const series = chart.addSeries(LineSeries, { color: "#81ba9d", lineWidth: 2, priceLineVisible: false, lastValueVisible: true, title: `MFI ${normalizeLength(c.length, 14)}` }, pane); series.setData(mfi(candles, normalizeLength(c.length, 14))); addThreshold(series, 80, "80"); addThreshold(series, 20, "20"); if (c.signal !== 20 && c.signal !== 80) addThreshold(series, c.signal, "Bot trigger");
      } else if (name === "Commodity Channel Index") {
        const c = conditionFor("Commodity Channel Index", conditions); const series = chart.addSeries(LineSeries, { color: "#d3aa63", lineWidth: 2, priceLineVisible: false, lastValueVisible: true, title: `CCI ${normalizeLength(c.length, 20)}` }, pane); series.setData(cci(candles, normalizeLength(c.length, 20))); addThreshold(series, 100, "+100"); addThreshold(series, -100, "−100"); if (c.signal !== 100 && c.signal !== -100) addThreshold(series, c.signal, "Bot trigger");
      } else if (name === "Ultimate Oscillator") {
        const c = conditionFor("Ultimate Oscillator", conditions); const series = chart.addSeries(LineSeries, { color: "#c29ad9", lineWidth: 2, priceLineVisible: false, lastValueVisible: true, title: "Ultimate" }, pane); series.setData(ultimate(candles, normalizeLength(c.aux1, 7), normalizeLength(c.aux2, 14), normalizeLength(c.aux3, 28))); addThreshold(series, 70, "70"); addThreshold(series, 30, "30"); if (c.signal !== 30 && c.signal !== 70) addThreshold(series, c.signal, "Bot trigger");
      }
    }

    const markers: SeriesMarker<UTCTimestamp>[] = fills.flatMap((fill, index) => {
      if ((fill.side ?? "BUY").toUpperCase() !== "BUY") return []; const time = nearestCandleTime(candles, new Date(fill.at).getTime()); if (!time) return [];
      return [{ time, position: "belowBar", color: "#46d7a2", shape: "arrowUp", text: fill.kind.toLowerCase().includes("base") ? "BUY" : `DCA ${index}` }];
    });
    if (trade.status === "Closed" && trade.closedAt) { const time = nearestCandleTime(candles, new Date(trade.closedAt).getTime()); if (time) markers.push({ time, position: "aboveBar", color: "#e27883", shape: "arrowDown", text: trade.closeReason === "Take Profit" ? "TP" : trade.closeReason === "Stop Loss" ? "SL" : "EXIT" }); }
    createSeriesMarkers(candleSeries, markers);

    candleSeries.createPriceLine({ price: trade.averagePrice, color: "#d2a347", lineWidth: 2, lineStyle: LineStyle.Solid, axisLabelVisible: true, title: "AVG" });
    const tpPrices = pendingExits.length ? pendingExits : trade.takeProfitPrice ? [{ id: "derived-tp", kind: "take_profit", side: "SELL", status: "DERIVED", sequence: 1, price: trade.takeProfitPrice, amount: trade.invested }] : [];
    tpPrices.forEach((order, index) => order.price && candleSeries.createPriceLine({ price: order.price, color: "#57c99c", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: tpPrices.length > 1 ? `TP ${index + 1}` : "TP" }));
    if (trade.stopLossPrice && trade.stopLossPrice > 0) candleSeries.createPriceLine({ price: trade.stopLossPrice, color: "#dc6d78", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "SL" });
    pendingDcas.forEach((order, index) => order.price && candleSeries.createPriceLine({ price: order.price, color: "#7a9bc6", lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: `DCA ${order.sequence || index + 1}` }));
    if (!pendingDcas.length && props.nextAveragingPrice) candleSeries.createPriceLine({ price: props.nextAveragingPrice, color: "#7a9bc6", lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: "Next DCA" });
    if (trade.status === "Closed" && trade.exitPrice && trade.exitPrice > 0) candleSeries.createPriceLine({ price: trade.exitPrice, color: "#e27883", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: trade.closeReason ?? "Exit" });
    if (trade.status === "Active" && trade.lastPrice && trade.lastPrice > 0) marketLineRef.current = candleSeries.createPriceLine({ price: trade.lastPrice, color: "#d7d7d7", lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: "MARK" }); else marketLineRef.current = null;

    const panes = chart.panes(); if (panes[0]) panes[0].setHeight(priceHeight);
    paneMap.forEach((index, name) => { if (panes[index]) panes[index].setHeight(paneHeights[name] ?? 130); });
    const recentBars = interval === "1M" ? 120 : interval === "1w" ? 180 : interval === "1d" ? 320 : 420;
    chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, candles.length - recentBars), to: candles.length + 8 });
    const resize = new ResizeObserver(() => chart.applyOptions({ width: host.clientWidth, height: host.clientHeight })); resize.observe(host);
    return () => { resize.disconnect(); chart.remove(); chartRef.current = null; marketLineRef.current = null; };
  }, [candles, interval, enabled, paneOrder, paneHeights, priceHeight, autoY, conditions, structureSignature, canvasHeight]);

  useEffect(() => {
    if (marketLineRef.current && trade.status === "Active" && trade.lastPrice && trade.lastPrice > 0) marketLineRef.current.applyOptions({ price: trade.lastPrice });
  }, [trade.lastPrice, trade.status]);

  const toggle = (name: IndicatorName) => setEnabled(current => current.includes(name) ? current.filter(item => item !== name) : [...current, name]);
  const adjustPane = (name: IndicatorName, delta: number) => setPaneHeights(current => ({ ...current, [name]: Math.max(80, Math.min(320, (current[name] ?? 130) + delta)) }));
  const movePane = (name: IndicatorName, direction: -1 | 1) => setPaneOrder(current => {
    const index = current.indexOf(name); if (index < 0) return current; const next = index + direction; if (next < 0 || next >= current.length) return current; const copy = [...current]; [copy[index], copy[next]] = [copy[next], copy[index]]; return copy;
  });
  const showTradeWindow = () => { if (!chartRef.current || !candles.length) return; const stamp = new Date(trade.openedAt).getTime(); let index = candles.findIndex(c => c.openTime >= stamp); if (index < 0) index = candles.length - 1; chartRef.current.timeScale().setVisibleLogicalRange({ from: Math.max(0, index - 90), to: Math.min(candles.length + 8, index + 170) }); };
  const showFullHistory = () => chartRef.current?.timeScale().fitContent();
  const resetLayout = () => { setPriceHeight(340); setPaneHeights({ ...DEFAULT_PANE_HEIGHTS }); setAutoY(true); };
  const strategyKinds = new Set(conditions.map(c => c.kind));

  return <div className={styles.overlay} role="dialog" aria-modal="true" aria-label={`${trade.pair} trade chart`} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className={styles.modal}>
      <header className={styles.topbar}>
        <div><span className={styles.eyebrow}>{trade.status} DCA TRADE</span><h2>Trade chart</h2><p>{trade.pair} · BINANCE · {snapshot?.bot?.name ?? "DCA Bot"}</p></div>
        <div className={styles.topMetrics}><span>Entry <b>{formatPrice(trade.entryPrice)}</b></span><span>Avg <b>{formatPrice(trade.averagePrice)}</b></span>{trade.status === "Active" && <span>Market <b>{formatPrice(trade.lastPrice)}</b></span>}<button className={styles.close} onClick={onClose}>×</button></div>
      </header>
      <div className={styles.toolbar}>
        <div className={styles.intervals}>{INTERVALS.map(item => <button key={item.value} className={interval === item.value ? styles.active : ""} onClick={() => setInterval(item.value)}>{item.label}</button>)}</div>
        <div className={styles.tools}>
          <div className={styles.indicatorWrap}><button className={showIndicators ? styles.active : ""} onClick={() => setShowIndicators(v => !v)}>Indicators <span>{enabled.length}</span>⌄</button>{showIndicators && <div className={styles.indicatorMenu}><div className={styles.menuHead}><div><strong>Indicators</strong><small>Executable DCA entry indicators</small></div><button onClick={() => setShowIndicators(false)}>×</button></div>{INDICATORS.map(name => { const active = enabled.includes(name), strategy = strategyKinds.has(name), separate = !OVERLAYS.has(name); const condition = name === "Volume" ? null : conditionFor(name as Exclude<IndicatorName,"Volume">, conditions); return <div className={styles.indicatorRow} key={name}><button className={`${styles.check} ${active ? styles.checked : ""}`} onClick={() => toggle(name)}><i/>{name}</button><div className={styles.indicatorMeta}>{strategy && <b>BOT</b>}{condition?.timeframe && condition.timeframe !== "chart" && <small>{condition.timeframe}</small>}</div>{active && separate && <div className={styles.paneControls}><button title="Move pane up" onClick={() => movePane(name,-1)}>↑</button><button title="Move pane down" onClick={() => movePane(name,1)}>↓</button><button title="Smaller pane" onClick={() => adjustPane(name,-20)}>−</button><button title="Larger pane" onClick={() => adjustPane(name,20)}>＋</button></div>}</div>; })}<div className={styles.menuFoot}>BOT marks indicators used by this bot. Saved parameters are used; panes are plotted on the selected chart timeframe. Other toggles use standard defaults.</div></div>}</div>
          <button onClick={() => setPriceHeight(v => Math.max(220, v - 30))}>Price −</button><button onClick={() => setPriceHeight(v => Math.min(620, v + 30))}>Price ＋</button>
          <button className={autoY ? styles.active : ""} onClick={() => setAutoY(v => !v)}>{autoY ? "Auto Y" : "Free Y"}</button>
          <button onClick={showTradeWindow}>Trade</button><button onClick={showFullHistory}>Full history</button><button onClick={resetLayout}>Reset layout</button>
        </div>
      </div>
      <div className={styles.levelStrip}>
        <span className={styles.buy}>● Entry {formatPrice(trade.entryPrice)}</span><span className={styles.avg}>— Avg {formatPrice(trade.averagePrice)}</span>
        {pendingDcas.map((order, i) => <span className={styles.dca} key={order.id}>DCA {order.sequence || i + 1} {formatPrice(order.price)}{order.amount > 0 ? ` · $${order.amount.toFixed(2)}` : ""}</span>)}
        {(pendingExits.length ? pendingExits : trade.takeProfitPrice ? [{id:"tp",price:trade.takeProfitPrice,sequence:1,amount:0,kind:"",side:"",status:""}] : []).map((order, i) => <span className={styles.tp} key={order.id}>TP{pendingExits.length > 1 ? ` ${i+1}` : ""} {formatPrice(order.price)}</span>)}
        {trade.stopLossPrice && <span className={styles.sl}>SL {formatPrice(trade.stopLossPrice)}</span>}
      </div>
      <div className={styles.help}><span>Drag chart: pan time</span><span>Mouse wheel: zoom</span><span>Drag right price scale: move/scale Y</span><span>Drag pane dividers: resize</span><span>Indicators menu: reorder + resize panes</span></div>
      <div className={styles.chartViewport}>
        {loading && <div className={styles.state}>Loading Binance candles and exact trade ledger…</div>}
        {error && <div className={`${styles.state} ${styles.error}`}>{error}</div>}
        <div ref={containerRef} className={styles.canvas} style={{ height: `${canvasHeight}px` }}/>
      </div>
      <footer className={styles.footer}><span>{candles.length.toLocaleString()} candles</span><span>{fills.filter(f => (f.side ?? "BUY").toUpperCase() === "BUY").length} filled entries</span><span>{pendingDcas.length} active DCA orders</span><span>{autoY ? "Y autoscale on" : "Free Y mode"}</span><i>Resize window from the lower-right corner</i></footer>
    </section>
  </div>;
}
