"use client";

import { useEffect, useMemo, useState } from "react";
import BenchmarkPerformanceChart from "./BenchmarkPerformanceChart";
import styles from "./portfolio-advanced-insights.module.css";

type SeriesPoint = { at: string; pnl: number; cumulative: number };
type Holding = {
  symbol: string;
  value: number;
  quantity: number;
  price: number | null;
  averageCost: number | null;
  unrealizedPnl: number | null;
};
type Props = {
  series: SeriesPoint[];
  base: number;
  range: string;
  holdings: Holding[];
  currentValue: number;
  cashValue: number;
  coreValue: number;
  botValue: number;
};
type Resolution = "daily" | "weekly" | "monthly";

type Bucket = { key: string; at: number; value: number };

const DAY = 86_400_000;
const COLORS = ["#60dca5", "#79a2ef", "#e8b862"];
const STABLES = new Set(["USDT", "USDC", "FDUSD", "DAI", "TUSD", "USDP"]);

function finite(value: number | null | undefined, fallback = 0) {
  return value != null && Number.isFinite(value) ? value : fallback;
}
function money(value: number) {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  const abs = Math.abs(value);
  const compact = abs >= 1_000_000 ? `${(abs / 1_000_000).toFixed(1)}m` : abs >= 1_000 ? `${(abs / 1_000).toFixed(1)}k` : abs.toFixed(0);
  return `${sign}$${compact}`;
}
function moneyFull(value: number) {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}$${Math.abs(value).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}
function pct(value: number, digits = 1) {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${Math.abs(value).toFixed(digits)}%`;
}
function nice(value: number) {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  if (abs >= 100) return value.toFixed(0);
  if (abs >= 10) return value.toFixed(1);
  return value.toFixed(2);
}
function dateLabel(ms: number, resolution: Resolution) {
  const date = new Date(ms);
  if (resolution === "monthly") return date.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function bucketKey(at: number, resolution: Resolution) {
  const date = new Date(at);
  if (resolution === "monthly") return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  if (resolution === "weekly") {
    const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    start.setUTCDate(start.getUTCDate() - start.getUTCDay());
    return start.toISOString().slice(0, 10);
  }
  return date.toISOString().slice(0, 10);
}
function bucketAt(key: string) {
  return key.length === 7 ? Date.parse(`${key}-01T12:00:00.000Z`) : Date.parse(`${key}T12:00:00.000Z`);
}
function groupPnl(series: SeriesPoint[], resolution: Resolution): Bucket[] {
  const map = new Map<string, number>();
  series.forEach((point) => {
    const at = Date.parse(point.at);
    if (!Number.isFinite(at)) return;
    const key = bucketKey(at, resolution);
    map.set(key, (map.get(key) ?? 0) + finite(point.pnl));
  });
  return Array.from(map.entries()).map(([key, value]) => ({ key, at: bucketAt(key), value })).sort((a, b) => a.at - b.at);
}
function linePath(points: Array<{ x: number; y: number }>) {
  return points.length ? `M${points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" L")}` : "";
}

function PeriodPnlChart({ series, range }: { series: SeriesPoint[]; range: string }) {
  const autoResolution: Resolution = range === "7d" || range === "30d" ? "daily" : range === "90d" ? "weekly" : "monthly";
  const [resolution, setResolution] = useState<Resolution>(autoResolution);
  useEffect(() => setResolution(autoResolution), [autoResolution]);
  const buckets = useMemo(() => groupPnl(series, resolution), [series, resolution]);
  const [hovered, setHovered] = useState<number | null>(null);
  const W = 920, H = 270, left = 62, right = 18, top = 24, bottom = 46;
  const maxAbs = Math.max(1, ...buckets.map((row) => Math.abs(row.value)));
  const zeroY = top + (H - top - bottom) / 2;
  const plotW = W - left - right;
  const barW = buckets.length ? Math.max(4, Math.min(48, plotW / buckets.length * .62)) : 10;
  const xFor = (index: number) => left + (index + .5) / Math.max(1, buckets.length) * plotW;
  const yFor = (value: number) => zeroY - value / maxAbs * ((H - top - bottom) / 2 - 8);
  const labelIndexes = new Set([0, Math.floor((buckets.length - 1) / 2), Math.max(0, buckets.length - 1)]);
  return <section className={styles.card}>
    <header><div><small>PERIOD PROFIT / LOSS</small><h2>Return rhythm</h2></div><div className={styles.tabs}>{(["daily", "weekly", "monthly"] as Resolution[]).map((item) => <button key={item} type="button" className={resolution === item ? styles.active : ""} onClick={() => setResolution(item)}>{item === "daily" ? "Daily" : item === "weekly" ? "Weekly" : "Monthly"}</button>)}</div></header>
    {buckets.length ? <div className={styles.chartWrap}><svg className={styles.svg} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      {[1,.5,0,-.5,-1].map((ratio) => { const y = zeroY - ratio * ((H - top - bottom) / 2 - 8); return <g key={ratio}><line x1={left} x2={W-right} y1={y} y2={y} className={ratio === 0 ? styles.zeroLine : styles.gridLine}/><text x={left-8} y={y+3} textAnchor="end">{money(ratio * maxAbs)}</text></g>; })}
      {buckets.map((row, index) => { const x = xFor(index), y = yFor(row.value), height = Math.max(2, Math.abs(y-zeroY)); return <g key={row.key} onMouseEnter={() => setHovered(index)} onMouseLeave={() => setHovered(null)} className={styles.barGroup}><rect x={x-barW/2} y={row.value >= 0 ? y : zeroY} width={barW} height={height} rx="4" className={row.value >= 0 ? styles.positiveBar : styles.negativeBar}/>{labelIndexes.has(index) && <text x={x} y={H-18} textAnchor="middle">{dateLabel(row.at,resolution)}</text>}</g>; })}
      <text x="14" y={H/2} transform={`rotate(-90 14 ${H/2})`} textAnchor="middle">P/L (USD)</text>
      <text x={W/2} y={H-3} textAnchor="middle">Period</text>
    </svg>{hovered != null && buckets[hovered] && <div className={styles.tooltip}><strong>{dateLabel(buckets[hovered].at,resolution)}</strong><span className={buckets[hovered].value >= 0 ? styles.good : styles.bad}>{moneyFull(buckets[hovered].value)}</span></div>}</div> : <div className={styles.empty}>Not enough portfolio history for period P/L yet.</div>}
  </section>;
}

function CumulativePnlChart({ series }: { series: SeriesPoint[] }) {
  const rows = series.map((point) => ({ at: Date.parse(point.at), value: finite(point.cumulative) })).filter((point) => Number.isFinite(point.at));
  const W = 920, H = 250, left = 64, right = 18, top = 18, bottom = 42;
  if (rows.length < 2) return <section className={styles.card}><header><div><small>CUMULATIVE P&amp;L</small><h2>Compounded portfolio progress</h2></div></header><div className={styles.empty}>More history is needed.</div></section>;
  const minX = rows[0].at, maxX = Math.max(minX + DAY, rows.at(-1)!.at);
  let minY = Math.min(0,...rows.map((row)=>row.value)), maxY = Math.max(0,...rows.map((row)=>row.value));
  if (maxY-minY < 1) { minY -= 1; maxY += 1; }
  const pad = (maxY-minY)*.08; minY -= pad; maxY += pad;
  const x = (value:number)=>left+(value-minX)/(maxX-minX)*(W-left-right);
  const y = (value:number)=>top+(maxY-value)/(maxY-minY)*(H-top-bottom);
  const pts = rows.map((row)=>({x:x(row.at),y:y(row.value)}));
  const zero = y(0);
  const yTicks = Array.from({length:5},(_,i)=>minY+(maxY-minY)*i/4);
  return <section className={styles.card}><header><div><small>CUMULATIVE P&amp;L</small><h2>Compounded portfolio progress</h2></div><strong className={rows.at(-1)!.value>=0?styles.good:styles.bad}>{moneyFull(rows.at(-1)!.value)}</strong></header><svg className={styles.svg} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
    <defs><linearGradient id="portfolioPnlFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#60dca5" stopOpacity=".28"/><stop offset="100%" stopColor="#60dca5" stopOpacity=".01"/></linearGradient></defs>
    {yTicks.map((value)=>{const yy=y(value);return <g key={value}><line x1={left} x2={W-right} y1={yy} y2={yy} className={Math.abs(value)<.0001?styles.zeroLine:styles.gridLine}/><text x={left-8} y={yy+3} textAnchor="end">{money(value)}</text></g>})}
    <path d={`${linePath(pts)} L${pts.at(-1)!.x},${zero} L${pts[0].x},${zero} Z`} fill="url(#portfolioPnlFill)" className={styles.area}/><path d={linePath(pts)} className={styles.pnlLine}/>
    <text x={left} y={H-14}>{new Date(minX).toLocaleDateString("en-US",{month:"short",day:"numeric"})}</text><text x={W-right} y={H-14} textAnchor="end">{new Date(maxX).toLocaleDateString("en-US",{month:"short",day:"numeric"})}</text><text x="14" y={H/2} transform={`rotate(-90 14 ${H/2})`} textAnchor="middle">Cumulative P/L (USD)</text>
  </svg></section>;
}

function ReturnMap({ holdings, currentValue }: { holdings: Holding[]; currentValue: number }) {
  const points = holdings.map((holding)=>{
    const averageCost = finite(holding.averageCost,0), price = finite(holding.price,0);
    if (averageCost<=0 || price<=0 || holding.value<=0) return null;
    return { symbol: holding.symbol, weight: currentValue>0?holding.value/currentValue*100:0, roi:(price/averageCost-1)*100, value:holding.value };
  }).filter((row): row is NonNullable<typeof row> => Boolean(row)).slice(0,12);
  const W=600,H=270,left=58,right=20,top=24,bottom=44;
  const maxX=Math.max(10,...points.map(p=>p.weight))*1.08;
  let minY=Math.min(-5,...points.map(p=>p.roi)),maxY=Math.max(5,...points.map(p=>p.roi));
  const yPad=(maxY-minY)*.12;minY-=yPad;maxY+=yPad;
  const x=(v:number)=>left+v/maxX*(W-left-right), y=(v:number)=>top+(maxY-v)/(maxY-minY)*(H-top-bottom);
  return <section className={styles.card}><header><div><small>ALLOCATION × RETURN</small><h2>Weight versus performance</h2></div><span>Bubble size = current value</span></header>{points.length?<svg className={styles.svg} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
    {[0,.25,.5,.75,1].map(r=>{const yy=top+r*(H-top-bottom),v=maxY-r*(maxY-minY);return <g key={r}><line x1={left} x2={W-right} y1={yy} y2={yy} className={Math.abs(v)<1?styles.zeroLine:styles.gridLine}/><text x={left-8} y={yy+3} textAnchor="end">{pct(v)}</text></g>})}
    {[0,.25,.5,.75,1].map(r=>{const xx=left+r*(W-left-right),v=maxX*r;return <g key={r}><line x1={xx} x2={xx} y1={top} y2={H-bottom} className={styles.gridLine}/><text x={xx} y={H-18} textAnchor="middle">{v.toFixed(0)}%</text></g>})}
    {points.map((p)=>{const r=6+Math.sqrt(Math.max(0,p.value/Math.max(1,currentValue)))*22;return <g key={p.symbol} className={styles.bubble}><circle cx={x(p.weight)} cy={y(p.roi)} r={r} className={p.roi>=0?styles.goodBubble:styles.badBubble}/><text x={x(p.weight)} y={y(p.roi)+3} textAnchor="middle" className={styles.bubbleLabel}>{p.symbol}</text></g>})}
    <text x="14" y={H/2} transform={`rotate(-90 14 ${H/2})`} textAnchor="middle">Return since cost basis (%)</text><text x={W/2} y={H-3} textAnchor="middle">Portfolio weight (%)</text>
  </svg>:<div className={styles.empty}>Cost basis is not available for enough holdings yet.</div>}</section>;
}

function CostBasisChart({ holdings }: { holdings: Holding[] }) {
  const rows = holdings.map((holding)=>{const cost=finite(holding.averageCost,0),price=finite(holding.price,0);if(cost<=0||price<=0||STABLES.has(holding.symbol))return null;return {...holding,cost,price,delta:(price/cost-1)*100};}).filter((row):row is NonNullable<typeof row>=>Boolean(row)).sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta)).slice(0,8);
  const maxAbs=Math.max(5,...rows.map(row=>Math.abs(row.delta)));
  return <section className={styles.card}><header><div><small>COST BASIS VS MARKET</small><h2>Distance from acquisition price</h2></div><span>Average entry → current mark</span></header>{rows.length?<div className={styles.costRows}>{rows.map((row)=><div key={row.symbol}><div className={styles.costMeta}><strong>{row.symbol}</strong><span>Avg ${nice(row.cost)}</span><span>Now ${nice(row.price)}</span><b className={row.delta>=0?styles.good:styles.bad}>{pct(row.delta)}</b></div><div className={styles.costTrack}><i className={styles.midLine}/><span className={row.delta>=0?styles.costPositive:styles.costNegative} style={{width:`${Math.max(2,Math.abs(row.delta)/maxAbs*48)}%`,left:row.delta>=0?"50%":`${50-Math.abs(row.delta)/maxAbs*48}%`}}/></div></div>)}</div>:<div className={styles.empty}>No non-stable holding has a recorded cost basis yet.</div>}</section>;
}

function DiversificationCard({ holdings, currentValue }: { holdings: Holding[]; currentValue: number }) {
  const weights=holdings.filter(row=>row.value>0).map(row=>row.value/Math.max(1,currentValue));
  const n=weights.length;
  const hhi=weights.reduce((sum,w)=>sum+w*w,0);
  const effective=hhi>0?1/hhi:0;
  const score=n<=1?0:Math.max(0,Math.min(100,(1-hhi)/(1-1/n)*100));
  const stable=holdings.filter(row=>STABLES.has(row.symbol)).reduce((sum,row)=>sum+row.value,0)/Math.max(1,currentValue)*100;
  const top3=holdings.slice().sort((a,b)=>b.value-a.value).slice(0,3).reduce((sum,row)=>sum+row.value,0)/Math.max(1,currentValue)*100;
  const label=score>=70?"Diversified":score>=40?"Balanced":"Concentrated";
  return <section className={styles.card}><header><div><small>DIVERSIFICATION</small><h2>Concentration profile</h2></div><span>Transparent HHI-based measure</span></header><div className={styles.gaugeBody}><div className={styles.gauge} style={{background:`conic-gradient(#60dca5 0 ${score}%,#303030 ${score}% 100%)`}}><div><strong>{score.toFixed(0)}</strong><span>{label}</span></div></div><div className={styles.gaugeStats}><div><span>Effective assets</span><b>{effective.toFixed(1)}</b></div><div><span>Top 3 concentration</span><b>{top3.toFixed(1)}%</b></div><div><span>Stable reserve</span><b>{stable.toFixed(1)}%</b></div><small>100 means capital is spread more evenly across the current holdings; 0 means one holding dominates.</small></div></div></section>;
}

function CapitalStructure({ cashValue, coreValue, botValue }: Pick<Props,"cashValue"|"coreValue"|"botValue">) {
  const items=[{label:"Cash & stablecoins",value:cashValue,color:COLORS[0]},{label:"Long-term holdings",value:coreValue,color:COLORS[1]},{label:"Included bot positions",value:botValue,color:COLORS[2]}].filter(item=>item.value>.005);
  const total=items.reduce((sum,item)=>sum+item.value,0);
  let cursor=0;
  const gradient=items.length?`conic-gradient(${items.map(item=>{const start=cursor/total*100;cursor+=item.value;const end=cursor/total*100;return `${item.color} ${start.toFixed(2)}% ${end.toFixed(2)}%`;}).join(",")})`:"conic-gradient(#303030 0 100%)";
  return <section className={styles.card}><header><div><small>CAPITAL STRUCTURE</small><h2>Where your capital sits</h2></div><span>Cash · long-term · automations</span></header><div className={styles.structureBody}><div className={styles.donut} style={{background:gradient}}><div><strong>{items.length}</strong><span>capital buckets</span></div></div><div className={styles.legend}>{items.map(item=><div key={item.label}><i style={{background:item.color}}/><span>{item.label}</span><b>{total>0?(item.value/total*100).toFixed(1):"0.0"}%</b><small>${item.value.toLocaleString("en-US",{maximumFractionDigits:0})}</small></div>)}</div></div></section>;
}

export default function PortfolioAdvancedInsights(props: Props) {
  const { series, base, range, holdings, currentValue, cashValue, coreValue, botValue } = props;
  return <div className={styles.stack}>
    <div className={styles.twoCol}><CapitalStructure cashValue={cashValue} coreValue={coreValue} botValue={botValue}/><DiversificationCard holdings={holdings} currentValue={currentValue}/></div>
    <PeriodPnlChart series={series} range={range}/>
    <section className={styles.card}><header><div><small>PORTFOLIO VS MARKET</small><h2>Did the portfolio beat simply holding the market?</h2></div><span>Same timeline and resolution</span></header><BenchmarkPerformanceChart series={series} capitalUsed={Math.max(1,base)} mode="Cumulative PnL" range={range} referenceLabel="Portfolio"/></section>
    <div className={styles.twoCol}><CumulativePnlChart series={series}/><ReturnMap holdings={holdings} currentValue={currentValue}/></div>
    <CostBasisChart holdings={holdings}/>
  </div>;
}
