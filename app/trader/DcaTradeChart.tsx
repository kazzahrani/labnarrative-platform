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

type Interval = "3m" | "5m" | "15m" | "1h" | "4h" | "1d" | "1w" | "1M";

const INTERVALS: Array<{ value: Interval; label: string }> = [
  { value: "3m", label: "3m" },
  { value: "5m", label: "5m" },
  { value: "15m", label: "15m" },
  { value: "1h", label: "1H" },
  { value: "4h", label: "4H" },
  { value: "1d", label: "D" },
  { value: "1w", label: "W" },
  { value: "1M", label: "M" },
];

const HISTORY_BARS: Record<Interval, number> = {
  "3m": 6000,
  "5m": 6000,
  "15m": 6000,
  "1h": 6000,
  "4h": 6000,
  "1d": 6000,
  "1w": 2500,
  "1M": 1200,
};

function chooseInterval(createdAt: string, closedAt?: string): Interval {
  const start = new Date(createdAt).getTime();
  const end = closedAt ? new Date(closedAt).getTime() : Date.now();
  const hours = Math.max(0, (end - start) / 3600000);
  if (hours <= 6) return "3m";
  if (hours <= 24) return "5m";
  if (hours <= 72) return "15m";
  if (hours <= 24 * 30) return "1h";
  if (hours <= 24 * 180) return "4h";
  if (hours <= 24 * 1000) return "1d";
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

function calculateRsi(candles: Candle[], length = 14) {
  const result: Array<{ time: UTCTimestamp; value: number }> = [];
  if (candles.length <= length) return result;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= length; i += 1) {
    const change = candles[i].close - candles[i - 1].close;
    gain += Math.max(change, 0);
    loss += Math.max(-change, 0);
  }
  gain /= length;
  loss /= length;
  for (let i = length; i < candles.length; i += 1) {
    if (i > length) {
      const change = candles[i].close - candles[i - 1].close;
      gain = (gain * (length - 1) + Math.max(change, 0)) / length;
      loss = (loss * (length - 1) + Math.max(-change, 0)) / length;
    }
    const value = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
    result.push({ time: Math.floor(candles[i].openTime / 1000) as UTCTimestamp, value });
  }
  return result;
}

function calculateStochastic(candles: Candle[], length = 14, smooth = 3) {
  const kRaw: Array<number | null> = candles.map((candle, index) => {
    if (index < length - 1) return null;
    const window = candles.slice(index - length + 1, index + 1);
    const high = Math.max(...window.map((item) => item.high));
    const low = Math.min(...window.map((item) => item.low));
    if (high === low) return 50;
    return ((candle.close - low) / (high - low)) * 100;
  });
  const smoothValues = (values: Array<number | null>) => values.map((_, index) => {
    if (index < smooth - 1) return null;
    const window = values.slice(index - smooth + 1, index + 1);
    if (window.some((value) => value == null)) return null;
    return window.reduce<number>((sum, value) => sum + (value ?? 0), 0) / smooth;
  });
  const k = smoothValues(kRaw);
  const d = smoothValues(k);
  return {
    k: k.flatMap((value, index) => value == null ? [] : [{ time: Math.floor(candles[index].openTime / 1000) as UTCTimestamp, value }]),
    d: d.flatMap((value, index) => value == null ? [] : [{ time: Math.floor(candles[index].openTime / 1000) as UTCTimestamp, value }]),
  };
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
  const [showVolume, setShowVolume] = useState(true);
  const [showRsi, setShowRsi] = useState(true);
  const [showStoch, setShowStoch] = useState(true);

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
        const params = new URLSearchParams({
          symbol,
          interval,
          bars: String(HISTORY_BARS[interval]),
          endTime: String(Date.now()),
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
  }, [symbol, interval]);

  useEffect(() => {
    const host = containerRef.current;
    if (!host || !candles.length) return;
    host.replaceChildren();

    const chart = createChart(host, {
      width: host.clientWidth,
      height: host.clientHeight,
      layout: {
        background: { type: ColorType.Solid, color: "#111923" },
        textColor: "#9aa7b6",
        attributionLogo: true,
        panes: {
          separatorColor: "#293745",
          separatorHoverColor: "#3c5060",
          enableResize: true,
        },
      },
      grid: {
        vertLines: { color: "rgba(58, 71, 89, 0.19)" },
        horzLines: { color: "rgba(58, 71, 89, 0.19)" },
      },
      crosshair: {
        vertLine: { color: "#617084", labelBackgroundColor: "#344555" },
        horzLine: { color: "#617084", labelBackgroundColor: "#344555" },
      },
      rightPriceScale: { borderColor: "#283545", minimumWidth: 70 },
      timeScale: {
        borderColor: "#283545",
        timeVisible: interval !== "1d" && interval !== "1w" && interval !== "1M",
        secondsVisible: false,
        rightOffset: 8,
        barSpacing: interval === "1M" ? 8 : interval === "1w" ? 7 : 5,
        minBarSpacing: 0.8,
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: true },
      handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
    });
    chartRef.current = chart;

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#aeb8c3",
      downColor: "#596273",
      borderUpColor: "#aeb8c3",
      borderDownColor: "#596273",
      wickUpColor: "#818c99",
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

    if (showVolume) {
      const volumeSeries = chart.addSeries(HistogramSeries, {
        priceFormat: { type: "volume" },
        priceScaleId: "volume",
        lastValueVisible: false,
        priceLineVisible: false,
      });
      chart.priceScale("volume").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
      volumeSeries.setData(candles.map((candle) => ({
        time: Math.floor(candle.openTime / 1000) as UTCTimestamp,
        value: candle.volume,
        color: candle.close >= candle.open ? "rgba(25, 181, 161, 0.52)" : "rgba(218, 87, 104, 0.48)",
      })));
    }

    if (showRsi) {
      const rsiSeries = chart.addSeries(LineSeries, {
        color: "#8f5bd4",
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: true,
        title: "RSI 14",
      }, 1);
      rsiSeries.setData(calculateRsi(candles));
      rsiSeries.createPriceLine({ price: 70, color: "#46525f", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: "70" });
      rsiSeries.createPriceLine({ price: 30, color: "#46525f", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: "30" });
    }

    if (showStoch) {
      const paneIndex = showRsi ? 2 : 1;
      const stoch = calculateStochastic(candles);
      const kSeries = chart.addSeries(LineSeries, {
        color: "#1688d8",
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: true,
        title: "%K",
      }, paneIndex);
      const dSeries = chart.addSeries(LineSeries, {
        color: "#e97b18",
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: true,
        title: "%D",
      }, paneIndex);
      kSeries.setData(stoch.k);
      dSeries.setData(stoch.d);
      kSeries.createPriceLine({ price: 80, color: "#46525f", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: "80" });
      kSeries.createPriceLine({ price: 20, color: "#46525f", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: "20" });
    }

    const markers: SeriesMarker<UTCTimestamp>[] = chartFills.flatMap((fill, index) => {
      const time = nearestCandleTime(candles, new Date(fill.at).getTime());
      if (!time) return [];
      return [{
        time,
        position: "belowBar",
        color: "#11d7c0",
        shape: "arrowUp",
        text: fill.kind === "Base" ? "BUY" : `DCA ${index}`,
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
      title: "Next DCA",
    });
    if (status === "Closed" && exitPrice && exitPrice > 0) candleSeries.createPriceLine({
      price: exitPrice,
      color: "#ff7e91",
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: closeReason ?? "Exit",
    });

    const panes = chart.panes();
    if (showRsi && panes[1]) panes[1].setHeight(115);
    if (showStoch && panes[showRsi ? 2 : 1]) panes[showRsi ? 2 : 1].setHeight(125);

    const recentBars = interval === "1M" ? 120 : interval === "1w" ? 180 : interval === "1d" ? 320 : 420;
    chart.timeScale().setVisibleLogicalRange({
      from: Math.max(0, candles.length - recentBars),
      to: candles.length + 8,
    });

    const resize = new ResizeObserver(() => chart.applyOptions({ width: host.clientWidth, height: host.clientHeight }));
    resize.observe(host);
    return () => {
      resize.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [candles, interval, chartFills, status, averagePrice, takeProfitPrice, stopLossPrice, nextAveragingPrice, exitPrice, closedAt, closeReason, showVolume, showRsi, showStoch]);

  const showFullHistory = () => chartRef.current?.timeScale().fitContent();
  const showTradeWindow = () => {
    if (!chartRef.current || !candles.length) return;
    const tradeTime = new Date(createdAt).getTime();
    let index = candles.findIndex((candle) => candle.openTime >= tradeTime);
    if (index < 0) index = candles.length - 1;
    chartRef.current.timeScale().setVisibleLogicalRange({
      from: Math.max(0, index - 90),
      to: Math.min(candles.length + 8, index + 170),
    });
  };

  return <div className={styles.tradeChartOverlay} role="dialog" aria-modal="true" aria-label={`${pair} DCA trade chart`}>
    <div className={styles.tradeChartModal}>
      <div className={styles.tradeChartTopbar}>
        <div>
          <h2>TV Chart</h2>
          <p>{pair} · BINANCE · {status} DCA trade</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close trade chart">×</button>
      </div>
      <div className={styles.tradeChartToolbar}>
        <div className={styles.tradeChartToolbarLeft}>
          <div className={styles.tradeChartIntervals}>{INTERVALS.map((item) => <button key={item.value} className={interval === item.value ? styles.tradeChartIntervalActive : ""} onClick={() => setInterval(item.value)}>{item.label}</button>)}</div>
          <div className={styles.tradeChartTools}>
            <button type="button" data-active={showVolume} onClick={() => setShowVolume((value) => !value)}>Volume</button>
            <button type="button" data-active={showRsi} onClick={() => setShowRsi((value) => !value)}>RSI</button>
            <button type="button" data-active={showStoch} onClick={() => setShowStoch((value) => !value)}>Stoch</button>
            <button type="button" onClick={showTradeWindow}>Trade</button>
            <button type="button" onClick={showFullHistory}>Full history</button>
          </div>
        </div>
        <div className={styles.tradeChartLegend}>
          <span><i className={styles.tradeChartBuyDot}/> Entry {formatPrice(entryPrice)}</span>
          <span>Avg {formatPrice(averagePrice)}</span>
          {status === "Active" && lastPrice ? <span>Market {formatPrice(lastPrice)}</span> : null}
          {status === "Closed" && exitPrice ? <span>Exit {formatPrice(exitPrice)}</span> : null}
          <span className={styles.tradeChartHistoryBadge}>{candles.length.toLocaleString()} candles loaded</span>
        </div>
      </div>
      <div className={styles.tradeChartBody}>
        {loading && <div className={styles.tradeChartState}>Loading deep Binance history…</div>}
        {error && <div className={styles.tradeChartState}>{error}</div>}
        <div className={styles.tradeChartStatusStrip}>
          <span>Mouse wheel: zoom</span><span>Drag: pan history</span><span>Pane borders: resize indicators</span>
        </div>
        <div ref={containerRef} className={styles.tradeChartCanvas}/>
      </div>
    </div>
  </div>;
}
