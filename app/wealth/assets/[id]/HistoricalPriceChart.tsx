"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./history.module.css";

type Point = { date: string; timestamp: number; price: number; nativePrice: number };
type RangeKey = "1m" | "3m" | "1y" | "5y";

type Payload = {
  points?: Point[];
  source?: string;
  isDelayed?: boolean;
  displayCurrency?: string;
};

function fmt(value: number, digits = 2) {
  return new Intl.NumberFormat("ar-SA-u-nu-arab", { maximumFractionDigits: digits }).format(value);
}
function sar(value: number) { return `${fmt(value)} ر.س`; }
function pct(value: number) { return `${value > 0 ? "+" : ""}${fmt(value, 1)}٪`; }

export default function HistoricalPriceChart({ symbol, assetType }: { symbol: string | null; assetType: string }) {
  const [range, setRange] = useState<RangeKey>("1y");
  const [points, setPoints] = useState<Point[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const [source, setSource] = useState("");

  useEffect(() => {
    if (!symbol) return;
    let active = true;
    setLoading(true); setError(""); setSelected(null);
    fetch(`/api/wealth/market/history?symbol=${encodeURIComponent(symbol)}&assetType=${encodeURIComponent(assetType)}&range=${range}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as Payload & { error?: string };
        if (!response.ok) throw new Error(payload.error || "تعذر تحميل التاريخ السعري");
        if (!active) return;
        setPoints(Array.isArray(payload.points) ? payload.points : []);
        setSource(payload.source || "");
      })
      .catch((reason) => active && setError(reason instanceof Error ? reason.message : "تعذر تحميل التاريخ السعري"))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [symbol, assetType, range]);

  const chart = useMemo(() => {
    if (points.length < 2) return null;
    const width = 720, height = 250, padX = 12, padTop = 22, padBottom = 26;
    const prices = points.map((p) => p.price);
    const minRaw = Math.min(...prices), maxRaw = Math.max(...prices);
    const margin = Math.max((maxRaw - minRaw) * 0.12, maxRaw * 0.015, 0.1);
    const min = minRaw - margin, max = maxRaw + margin;
    const x = (index: number) => padX + (index / Math.max(points.length - 1, 1)) * (width - padX * 2);
    const y = (price: number) => padTop + ((max - price) / Math.max(max - min, 0.0001)) * (height - padTop - padBottom);
    const path = points.map((point, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(2)},${y(point.price).toFixed(2)}`).join(" ");
    const first = points[0].price, last = points.at(-1)!.price;
    const change = last - first, changePct = first > 0 ? (change / first) * 100 : 0;
    return { width, height, path, x, y, minRaw, maxRaw, first, last, change, changePct };
  }, [points]);

  if (!symbol) return <section className={styles.card}><div className={styles.empty}>لا يوجد رمز سوقي لهذا الأصل، لذلك لا يتوفر تاريخ سعري تلقائي.</div></section>;

  const activeIndex = selected ?? (points.length ? points.length - 1 : 0);
  const activePoint = points[activeIndex];
  const positive = (chart?.change ?? 0) >= 0;

  return <section className={styles.card}>
    <div className={styles.head}>
      <div><small>التاريخ السعري الحقيقي</small><h2>{symbol}</h2></div>
      <div className={styles.ranges}>{(["1m","3m","1y","5y"] as RangeKey[]).map((item) => <button key={item} className={range === item ? styles.active : ""} onClick={() => setRange(item)}>{item === "1m" ? "شهر" : item === "3m" ? "3 أشهر" : item === "1y" ? "سنة" : "5 سنوات"}</button>)}</div>
    </div>

    {loading ? <div className={styles.state}>جاري تحميل الأسعار الفعلية…</div> : error ? <div className={styles.state}>{error}</div> : !chart ? <div className={styles.state}>لا توجد نقاط سعرية كافية لهذا الأصل.</div> : <>
      <div className={styles.summary}>
        <div><small>{activePoint ? new Intl.DateTimeFormat("ar-SA-u-nu-arab", { day:"numeric", month:"short", year:"numeric" }).format(new Date(`${activePoint.date}T12:00:00`)) : "آخر سعر"}</small><strong>{activePoint ? sar(activePoint.price) : sar(chart.last)}</strong></div>
        <div className={positive ? styles.profit : styles.loss}><small>أداء الفترة</small><strong>{pct(chart.changePct)}</strong><span>{chart.change >= 0 ? "+" : ""}{sar(chart.change)}</span></div>
        <div><small>نطاق الفترة</small><strong>{sar(chart.minRaw)} — {sar(chart.maxRaw)}</strong></div>
      </div>
      <div className={styles.chartWrap}>
        <svg viewBox={`0 0 ${chart.width} ${chart.height}`} className={styles.chart}
          onMouseMove={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            const px = ((event.clientX - rect.left) / rect.width) * chart.width;
            const index = Math.round(((px - 12) / (chart.width - 24)) * Math.max(points.length - 1, 1));
            setSelected(Math.max(0, Math.min(points.length - 1, index)));
          }}
          onMouseLeave={() => setSelected(null)}>
          {[0.25,0.5,0.75].map((ratio) => <line key={ratio} x1="12" x2="708" y1={22 + ratio * 202} y2={22 + ratio * 202} className={styles.gridLine}/>) }
          <path d={chart.path} className={positive ? styles.lineProfit : styles.lineLoss}/>
          {activePoint && <><line x1={chart.x(activeIndex)} x2={chart.x(activeIndex)} y1="22" y2="224" className={styles.cursor}/><circle cx={chart.x(activeIndex)} cy={chart.y(activePoint.price)} r="4" className={positive ? styles.pointProfit : styles.pointLoss}/></>}
        </svg>
      </div>
      <div className={styles.foot}><span>المصدر: {source || "بيانات سوق تاريخية"}</span><span>الأسعار العالمية محولة إلى الريال عند 3.75 ر.س/دولار</span></div>
    </>}
  </section>;
}
