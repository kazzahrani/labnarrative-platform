"use client";

import { useMemo, useState } from "react";
import CoinLogo from "./CoinLogo";
import styles from "./portfolio-value-snapshot.module.css";

type SeriesPoint = { at: string; pnl: number; cumulative: number };
type AllocationItem = { label: string; value: number; color: string };
type Props = {
  series: SeriesPoint[];
  base: number;
  currentValue: number;
  allocation: AllocationItem[];
};

const W = 820;
const H = 322;
const PAD = { left: 62, right: 18, top: 28, bottom: 42 };

function finite(value: number | null | undefined, fallback = 0) {
  return Number.isFinite(value) ? Number(value) : fallback;
}
function money(value: number) {
  return `$${Math.abs(value).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}
function compactMoney(value: number) {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}m`;
  if (abs >= 1_000) return `$${(value / 1_000).toFixed(1)}k`;
  return `$${value.toFixed(0)}`;
}
function dateLabel(at: number) {
  return new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function fullDate(at: number) {
  return new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function path(points: Array<{ x: number; y: number }>) {
  return points.length ? `M${points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" L")}` : "";
}
function donut(items: AllocationItem[]) {
  const total = items.reduce((sum, item) => sum + Math.max(0, item.value), 0);
  if (!total) return "conic-gradient(#303030 0 100%)";
  let cursor = 0;
  return `conic-gradient(${items.map((item) => {
    const start = cursor / total * 100;
    cursor += Math.max(0, item.value);
    const end = cursor / total * 100;
    return `${item.color} ${start.toFixed(2)}% ${end.toFixed(2)}%`;
  }).join(",")})`;
}

export default function PortfolioValueSnapshot({ series, base, currentValue, allocation }: Props) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const rows = useMemo(() => {
    const parsed = series.map((row) => ({ at: Date.parse(row.at), value: Math.max(0, finite(base) + finite(row.cumulative)) }))
      .filter((row) => Number.isFinite(row.at) && Number.isFinite(row.value))
      .sort((a, b) => a.at - b.at);
    if (!parsed.length) return [];
    const latest = parsed[parsed.length - 1];
    if (currentValue > 0 && (Date.now() - latest.at > 3_600_000 || Math.abs(latest.value - currentValue) > Math.max(1, currentValue * 0.001))) {
      parsed.push({ at: Date.now(), value: currentValue });
    }
    return parsed;
  }, [series, base, currentValue]);

  const values = rows.map((row) => row.value);
  const rawMin = values.length ? Math.min(...values) : 0;
  const rawMax = values.length ? Math.max(...values) : Math.max(1, currentValue);
  const span = Math.max(1, rawMax - rawMin);
  const min = Math.max(0, rawMin - span * 0.12);
  const max = rawMax + span * 0.12;
  const startAt = rows[0]?.at ?? Date.now();
  const endAt = rows.at(-1)?.at ?? startAt + 1;
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const points = rows.map((row) => ({
    x: PAD.left + ((row.at - startAt) / Math.max(1, endAt - startAt)) * plotW,
    y: PAD.top + ((max - row.value) / Math.max(1, max - min)) * plotH,
  }));
  const linePath = path(points);
  const areaPath = points.length ? `${linePath} L${points.at(-1)!.x.toFixed(1)},${(H - PAD.bottom).toFixed(1)} L${points[0].x.toFixed(1)},${(H - PAD.bottom).toFixed(1)} Z` : "";
  const highIndex = values.length ? values.indexOf(rawMax) : -1;
  const lowIndex = values.length ? values.indexOf(rawMin) : -1;
  const top = allocation[0];
  const allocationTotal = allocation.reduce((sum, item) => sum + Math.max(0, item.value), 0);
  const gradient = donut(allocation);
  const active = hoverIndex != null ? rows[hoverIndex] : null;
  const activePoint = hoverIndex != null ? points[hoverIndex] : null;

  const onMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (rows.length < 2) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / Math.max(1, rect.width) * W;
    let nearest = 0;
    let distance = Infinity;
    points.forEach((point, index) => {
      const next = Math.abs(point.x - x);
      if (next < distance) { distance = next; nearest = index; }
    });
    setHoverIndex(nearest);
  };

  return <div className={styles.snapshot}>
    <div className={styles.chartPane}>
      <header className={styles.chartHeader}>
        <div><small>PORTFOLIO VALUE</small><h2>{money(currentValue)}</h2><span>Historical marked-to-market value</span></div>
        {rows.length > 1 && <div className={styles.rangeStats}><span>Low <b>{money(rawMin)}</b></span><span>High <b>{money(rawMax)}</b></span></div>}
      </header>
      {rows.length >= 2 ? <div className={styles.chartWrap}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={styles.chart} onPointerMove={onMove} onPointerLeave={() => setHoverIndex(null)}>
          <defs><linearGradient id="portfolioValueFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#8da7ff" stopOpacity="0.28"/><stop offset="100%" stopColor="#8da7ff" stopOpacity="0.015"/></linearGradient></defs>
          {[0, .25, .5, .75, 1].map((ratio) => {
            const value = max - (max - min) * ratio;
            const y = PAD.top + plotH * ratio;
            return <g key={ratio}><line x1={PAD.left} x2={W - PAD.right} y1={y} y2={y} className={styles.grid}/><text x={PAD.left - 9} y={y + 4} textAnchor="end">{compactMoney(value)}</text></g>;
          })}
          {[0, .25, .5, .75, 1].map((ratio) => {
            const at = startAt + (endAt - startAt) * ratio;
            const x = PAD.left + plotW * ratio;
            return <text key={ratio} x={x} y={H - 12} textAnchor={ratio === 0 ? "start" : ratio === 1 ? "end" : "middle"}>{dateLabel(at)}</text>;
          })}
          <path d={areaPath} className={styles.area}/>
          <path d={linePath} className={styles.line}/>
          {highIndex >= 0 && points[highIndex] && <g><circle cx={points[highIndex].x} cy={points[highIndex].y} r="4" className={styles.highDot}/><text x={points[highIndex].x} y={Math.max(14, points[highIndex].y - 10)} textAnchor="middle" className={styles.markerText}>High {compactMoney(rawMax)}</text></g>}
          {lowIndex >= 0 && points[lowIndex] && lowIndex !== highIndex && <g><circle cx={points[lowIndex].x} cy={points[lowIndex].y} r="4" className={styles.lowDot}/><text x={points[lowIndex].x} y={Math.min(H - 44, points[lowIndex].y + 18)} textAnchor="middle" className={styles.markerText}>Low {compactMoney(rawMin)}</text></g>}
          {active && activePoint && <g><line x1={activePoint.x} x2={activePoint.x} y1={PAD.top} y2={H - PAD.bottom} className={styles.crosshair}/><circle cx={activePoint.x} cy={activePoint.y} r="5" className={styles.hoverDot}/></g>}
        </svg>
        {active && activePoint && <div className={styles.tooltip} style={{ left: `${Math.min(84, Math.max(14, activePoint.x / W * 100))}%`, top: `${Math.max(9, activePoint.y / H * 100 - 7)}%` }}><span>{fullDate(active.at)}</span><strong>{money(active.value)}</strong></div>}
      </div> : <div className={styles.empty}>Portfolio history will appear as recorded or reconstructed values become available.</div>}
    </div>

    <aside className={styles.allocationPane}>
      <header><small>ASSET ALLOCATION</small><h3>Current portfolio</h3></header>
      <div className={styles.donut} style={{ background: gradient }}><div>{top ? <><CoinLogo symbol={top.label} size={25}/><strong>{top.label}</strong><b>{allocationTotal > 0 ? `${(top.value / allocationTotal * 100).toFixed(1)}%` : "0%"}</b></> : <strong>—</strong>}</div></div>
      <div className={styles.legend}>{allocation.slice(0, 7).map((item) => <div key={item.label}><i style={{ background: item.color }}/><span>{item.label}</span><b>{allocationTotal > 0 ? `${(item.value / allocationTotal * 100).toFixed(1)}%` : "0%"}</b><small>{money(item.value)}</small></div>)}</div>
    </aside>
  </div>;
}
