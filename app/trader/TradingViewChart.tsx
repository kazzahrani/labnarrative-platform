"use client";

import { useEffect, useRef } from "react";
import styles from "./trader.module.css";

type TradingViewChartProps = {
  symbol: string;
  interval: "W" | "M";
};

export default function TradingViewChart({ symbol, interval }: TradingViewChartProps) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    host.replaceChildren();

    const widget = document.createElement("div");
    widget.className = "tradingview-widget-container__widget";
    widget.style.height = "100%";
    widget.style.width = "100%";
    host.appendChild(widget);

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.type = "text/javascript";
    script.async = true;
    script.textContent = JSON.stringify({
      autosize: true,
      symbol,
      interval,
      timezone: "Etc/UTC",
      theme: "dark",
      style: "1",
      locale: "en",
      backgroundColor: "#0B1018",
      gridColor: "rgba(128, 140, 160, 0.08)",
      hide_top_toolbar: false,
      hide_side_toolbar: false,
      hide_legend: false,
      hide_volume: false,
      allow_symbol_change: false,
      save_image: false,
      calendar: false,
      details: false,
      hotlist: false,
      withdateranges: true,
      compareSymbols: [],
      studies: [],
      support_host: "https://www.tradingview.com",
    });
    host.appendChild(script);

    return () => {
      host.replaceChildren();
    };
  }, [symbol, interval]);

  return <div ref={hostRef} className={`tradingview-widget-container ${styles.tvChart}`} aria-label="TradingView live candlestick chart" />;
}
