"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  HistogramSeries,
  LineStyle,
  type IChartApi,
  type SeriesMarker,
  type UTCTimestamp,
} from "lightweight-charts";
import styles from "./trader.module.css";

type Fill = {
  kind: "Base" | "Averaging";
  price: number;
  amount: number;
  quantity: number;
  at: string;
};

type Props = {
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

type Interval = "15m" | "1h" | "4h" | "1d" | "1w";

const INTERVALS: Array<{ value: Interval; label: string }> = [
  { value: "15m", label: "15m" },
  { value: "1h", label: "1H" },
  { value: "4h", label: "4H" },
  { value: "1d", label: "1D" },
  { value: "1w", label: "1W" },
];

function chooseInterval(createdAt: string, closedAt?: string): Interval {
  const start = new Date(createdAt).getTime();
  const end = closedAt ? new Date(closedAt).getTime() : Date.now();
  const days = Math.max(0, (end - start) / 86400000);
  if (days <= 2) return "15m";
  if (days <= 14) return "1h";
  if (days <= 90) return "4h";
  if (days <= 700) return "1d";
  return "1w";
}

function nearestCandleTime(candles: Candle[], timestamp: number): UTCTimestamp | null {
  if (!candles.length) return null;
  let candidate = candles[0];
  for (const candle of candles) {
    if (candle.openTime <= timestamp) candidate = candle;
    else break;
  }
  return Math.floor(candidate.openTime / 1000) as UTCTimestamp;
}

function formatPrice(value: number) {
  if (!Number.isFinite(value)) return "—";
  const digits = Math.abs(value) >= 1000 ? 2 : Math.abs(value) >= 1 ? 4 : 8;
  return value.toLocaleString("en-US", { maximumFractionDigits: digits });
}

export default function DcaTradeChart({
  pair,
  status,
  entryPrice,
  averagePrice,
  createdAt,
  closedAt,
  exitPrice,
  closeReason,
  lastPrice,
  fills,
  takeProfitPrice,
  stopLossPrice,
  nextAveragingPrice,
  onClose,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [interval, setInterval] = useState<Interval>(() => chooseInterval(createdAt, closedAt));
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const symbol = pair.replace("/", "");
  const chartFills = useMemo<Fill[]>(() => {
    if (fills?.length) return fills;
    return [{ kind: "Base", price: entryPrice, amount: 0, quantity: 0, at: createdAt }];
  }, [fills, entryPrice, createdAt]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError("");
      try {
        const start = new Date(createdAt).getTime();
        const end = closedAt ? new Date(closedAt).getTime() : Date.now();
        const span = Math.max(3600000, end - start);
        const pad = Math.max(6 * 3600000, span * 0.18);
        const params = new URLSearchParams({
          symbol,
          interval,
          limit: "1000",
          startTime: String(Math.max(0, Math.floor(start - pad))),
          endTime: String(Math.floor(end + pad)),
        });
        const response = await fetch(`/api/trader/klines?${params.toString()}`, { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error ?? "Unable to load Binance candles");
        if (!cancelled) setCandles(Array.isArray(data.candles) ? data.candles : []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unable to load chart");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => { cancelled = true; };
  }, [symbol, interval, createdAt, closedAt]);

  useEffect(() => {
    const host = containerRef.current;
    if (!host || !candles.length) return;
    host.replaceChildren();

    const chart = createChart(host, {
      width: host.clientWidth,
      height: host.clientHeight,
      layout: {
        background: { type: ColorType.Solid, color: "#111a26" },
        textColor: "#9aa7b6",
        attributionLogo: true,
      },
      grid: {
        vertLines: { color: "rgba(58, 71, 89, 0.20)" },
        horzLines: { color: "rgba(58, 71, 89, 0.20)" },
      },
      crosshair: { vertLine: { color: "#617084" }, horzLine: { color: "#617084" } },
      rightPriceScale: { borderColor: "#283545" },
      timeScale: { borderColor: "#283545", timeVisible: interval !== "1d" && interval !== "1w", secondsVisible: false },
    });
    chartRef.current = chart;

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#b8c1cc",
      downColor: "#596273",
      borderUpColor: "#b8c1cc",
      borderDownColor: "#596273",
      wickUpColor: "#7e8998",
      wickDownColor: "#596273",
      priceLineVisible: true,
      lastValueVisible: true,
    });
    candleSeries.setData(candles.map((candle) => ({
      time: Math.floor(candle.openTime / 1000) as UTCTimestamp,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
    })));

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
    });
    chart.priceScale("volume").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    volumeSeries.setData(candles.map((candle) => ({
      time: Math.floor(candle.openTime / 1000) as UTCTimestamp,
      value: candle.volume,
      color: candle.close >= candle.open ? "rgba(25, 181, 161, 0.55)" : "rgba(218, 87, 104, 0.48)",
    })));

    const markers: SeriesMarker<UTCTimestamp>[] = chartFills.flatMap((fill, index) => {
      const time = nearestCandleTime(candles, new Date(fill.at).getTime());
      if (!time) return [];
      return [{
        time,
        position: "belowBar",
        color: "#11d7c0",
        shape: "arrowUp",
        text: fill.kind === "Base" ? "B" : `DCA ${index}`,
      }];
    });
    if (status === "Closed" && closedAt) {
      const time = nearestCandleTime(candles, new Date(closedAt).getTime());
      if (time) markers.push({
        time,
        position: "aboveBar",
        color: "#ff7e91",
        shape: "arrowDown",
        text: closeReason === "Take Profit" ? "TP" : closeReason === "Stop Loss" ? "SL" : "EXIT",
      });
    }
    createSeriesMarkers(candleSeries, markers);

    candleSeries.createPriceLine({
      price: averagePrice,
      color: "#f5a000",
      lineWidth: 2,
      lineStyle: LineStyle.Solid,
      axisLabelVisible: true,
      title: "Avg. Buy Price",
    });
    if (takeProfitPrice && takeProfitPrice > 0) candleSeries.createPriceLine({
      price: takeProfitPrice,
      color: "#19c8a8",
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: "Take Profit",
    });
    if (stopLossPrice && stopLossPrice > 0) candleSeries.createPriceLine({
      price: stopLossPrice,
      color: "#ff667c",
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: "Stop Loss",
    });
    if (status === "Active" && nextAveragingPrice && nextAveragingPrice > 0) candleSeries.createPriceLine({
      price: nextAveragingPrice,
      color: "#2f87ff",
      lineWidth: 1,
      lineStyle: LineStyle.Solid,
      axisLabelVisible: true,
      title: "Next Averaging",
    });
    if (status === "Closed" && exitPrice && exitPrice > 0) candleSeries.createPriceLine({
      price: exitPrice,
      color: "#ff7e91",
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: closeReason ?? "Exit",
    });

    chart.timeScale().fitContent();
    const resize = new ResizeObserver(() => chart.applyOptions({ width: host.clientWidth, height: host.clientHeight }));
    resize.observe(host);
    return () => {
      resize.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [candles, interval, chartFills, status, averagePrice, takeProfitPrice, stopLossPrice, nextAveragingPrice, exitPrice, closedAt, closeReason]);

  return <div className={styles.tradeChartOverlay} role="dialog" aria-modal="true" aria-label={`${pair} DCA trade chart`}>
    <div className={styles.tradeChartModal}>
      <div className={styles.tradeChartTopbar}>
        <div>
          <h2>TV Chart</h2>
          <p>{pair} · BINANCE · {status} trade</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close trade chart">×</button>
      </div>
      <div className={styles.tradeChartToolbar}>
        <div className={styles.tradeChartIntervals}>{INTERVALS.map((item) => <button key={item.value} className={interval === item.value ? styles.tradeChartIntervalActive : ""} onClick={() => setInterval(item.value)}>{item.label}</button>)}</div>
        <div className={styles.tradeChartLegend}>
          <span><i className={styles.tradeChartBuyDot}/> Entry {formatPrice(entryPrice)}</span>
          <span>Avg {formatPrice(averagePrice)}</span>
          {status === "Active" && lastPrice ? <span>Market {formatPrice(lastPrice)}</span> : null}
          {status === "Closed" && exitPrice ? <span>Exit {formatPrice(exitPrice)}</span> : null}
        </div>
      </div>
      <div className={styles.tradeChartBody}>
        {loading && <div className={styles.tradeChartState}>Loading Binance candles…</div>}
        {error && <div className={styles.tradeChartState}>{error}</div>}
        <div ref={containerRef} className={styles.tradeChartCanvas}/>
      </div>
    </div>
  </div>;
}
