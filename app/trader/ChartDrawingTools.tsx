"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { IChartApi, ISeriesApi, UTCTimestamp } from "lightweight-charts";
import styles from "./chart-drawing-tools.module.css";

type Candle = { openTime: number; open: number; high: number; low: number; close: number };
type Tool = "cursor" | "trend" | "hline" | "vline" | "fib" | "rect" | "brush" | "text" | "measure";
type Anchor = { time: number; price: number };
type Drawing = { id: string; type: Exclude<Tool, "cursor">; points: Anchor[]; text?: string };

type Props = {
  chartRef: RefObject<IChartApi | null>;
  seriesRef: RefObject<ISeriesApi<"Candlestick"> | null>;
  candles: Candle[];
  memoryKey: string;
};

const FIB_LEVELS = [0, .236, .382, .5, .618, .786, 1];
const twoPointTools = new Set<Tool>(["trend", "fib", "rect", "measure"]);

function uid() { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }
function timeNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value && typeof value === "object" && "year" in value && "month" in value && "day" in value) {
    const v = value as { year: number; month: number; day: number };
    return Math.floor(Date.UTC(v.year, v.month - 1, v.day) / 1000);
  }
  return null;
}

function Icon({ name }: { name: string }) {
  const common = { width: 21, height: 21, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.55, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (name === "cursor") return <svg {...common}><path d="M12 3v18M3 12h18"/><path d="M12 7l-2 2m2-2 2 2m-2 8-2-2m2 2 2-2"/></svg>;
  if (name === "trend") return <svg {...common}><circle cx="5" cy="18" r="2"/><circle cx="19" cy="6" r="2"/><path d="M6.5 16.5 17.5 7.5"/></svg>;
  if (name === "hline") return <svg {...common}><path d="M4 8h16M4 12h13M4 16h16"/><circle cx="5" cy="16" r="1.7"/></svg>;
  if (name === "vline") return <svg {...common}><path d="M12 3v18M7 6h10M7 18h10"/></svg>;
  if (name === "fib") return <svg {...common}><path d="M5 5h14M5 9h10M5 13h14M5 17h8M5 21h14"/><circle cx="5" cy="5" r="1.2"/><circle cx="19" cy="21" r="1.2"/></svg>;
  if (name === "rect") return <svg {...common}><rect x="5" y="6" width="14" height="12" rx="1"/><circle cx="5" cy="6" r="1.2"/><circle cx="19" cy="18" r="1.2"/></svg>;
  if (name === "brush") return <svg {...common}><path d="M4 17c5 0 5-8 10-8 3 0 4 2 6 1"/><path d="M5 18c-1 2-2 3-3 3 2 0 4 0 5-2"/></svg>;
  if (name === "text") return <svg {...common}><path d="M5 5h14M12 5v14M8 19h8"/></svg>;
  if (name === "measure") return <svg {...common}><path d="m5 18 13-13 2 2L7 20z"/><path d="m9 15 2 2m1-5 2 2m1-5 2 2"/></svg>;
  if (name === "undo") return <svg {...common}><path d="M9 7 4 12l5 5"/><path d="M5 12h8a6 6 0 0 1 6 6"/></svg>;
  if (name === "magnet") return <svg {...common}><path d="M7 5v7a5 5 0 0 0 10 0V5"/><path d="M7 8h4m2 0h4"/></svg>;
  if (name === "lock") return <svg {...common}><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>;
  if (name === "eye") return <svg {...common}><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/></svg>;
  if (name === "clear") return <svg {...common}><path d="M5 7h14M9 7V4h6v3m-8 0 1 13h8l1-13M10 10v7m4-7v7"/></svg>;
  return null;
}

export default function ChartDrawingTools({ chartRef, seriesRef, candles, memoryKey }: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const loadedKey = useRef("");
  const brushActive = useRef(false);
  const [tool, setTool] = useState<Tool>("cursor");
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [draft, setDraft] = useState<Anchor[]>([]);
  const [brushDraft, setBrushDraft] = useState<Anchor[]>([]);
  const [magnet, setMagnet] = useState(true);
  const [locked, setLocked] = useState(false);
  const [visible, setVisible] = useState(true);
  const [, setFrame] = useState(0);

  useEffect(() => {
    let next: Drawing[] = [];
    try {
      const raw = window.localStorage.getItem(`ln-chart-drawings:${memoryKey}`);
      if (raw) next = JSON.parse(raw) as Drawing[];
    } catch {}
    loadedKey.current = memoryKey;
    setDrawings(Array.isArray(next) ? next : []);
    setDraft([]);
    setBrushDraft([]);
  }, [memoryKey]);

  useEffect(() => {
    if (loadedKey.current !== memoryKey) return;
    try { window.localStorage.setItem(`ln-chart-drawings:${memoryKey}`, JSON.stringify(drawings)); } catch {}
  }, [drawings, memoryKey]);

  useEffect(() => {
    if (!visible || (!drawings.length && !draft.length && !brushDraft.length)) return;
    const timer = window.setInterval(() => setFrame(v => (v + 1) % 100000), 120);
    return () => window.clearInterval(timer);
  }, [visible, drawings.length, draft.length, brushDraft.length]);

  const pointFromEvent = (clientX: number, clientY: number): Anchor | null => {
    const svg = svgRef.current, chart = chartRef.current, series = seriesRef.current;
    if (!svg || !chart || !series) return null;
    const rect = svg.getBoundingClientRect();
    const x = clientX - rect.left, y = clientY - rect.top;
    const time = timeNumber(chart.timeScale().coordinateToTime(x));
    const price = series.coordinateToPrice(y);
    if (time == null || price == null || !Number.isFinite(price)) return null;
    if (!magnet || !candles.length) return { time, price };
    let nearest = candles[0], distance = Math.abs(candles[0].openTime / 1000 - time);
    for (const candle of candles) {
      const d = Math.abs(candle.openTime / 1000 - time);
      if (d < distance) { nearest = candle; distance = d; } else if (candle.openTime / 1000 > time && d > distance) break;
    }
    const prices = [nearest.open, nearest.high, nearest.low, nearest.close];
    const snappedPrice = prices.reduce((best, candidate) => Math.abs(candidate - price) < Math.abs(best - price) ? candidate : best, prices[0]);
    return { time: Math.floor(nearest.openTime / 1000), price: snappedPrice };
  };

  const commit = (type: Exclude<Tool, "cursor">, points: Anchor[], text?: string) => {
    setDrawings(current => [...current, { id: uid(), type, points, text }]);
    setDraft([]);
  };

  const handleClick = (event: React.MouseEvent<SVGSVGElement>) => {
    if (locked || tool === "cursor" || tool === "brush") return;
    const point = pointFromEvent(event.clientX, event.clientY); if (!point) return;
    if (tool === "hline" || tool === "vline") { commit(tool, [point]); return; }
    if (tool === "text") {
      const text = window.prompt("Chart note");
      if (text?.trim()) commit("text", [point], text.trim());
      return;
    }
    if (twoPointTools.has(tool)) {
      if (!draft.length) setDraft([point]);
      else commit(tool as Exclude<Tool, "cursor">, [draft[0], point]);
    }
  };

  const handlePointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (locked || tool !== "brush") return;
    const point = pointFromEvent(event.clientX, event.clientY); if (!point) return;
    brushActive.current = true; setBrushDraft([point]); event.currentTarget.setPointerCapture(event.pointerId);
  };
  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!brushActive.current || tool !== "brush") return;
    const point = pointFromEvent(event.clientX, event.clientY); if (!point) return;
    setBrushDraft(current => current.length >= 220 ? current : [...current, point]);
  };
  const finishBrush = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!brushActive.current) return;
    brushActive.current = false;
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch {}
    if (brushDraft.length > 1) commit("brush", brushDraft);
    else setBrushDraft([]);
  };

  const xy = (point: Anchor) => {
    const chart = chartRef.current, series = seriesRef.current;
    if (!chart || !series) return null;
    const x = chart.timeScale().timeToCoordinate(point.time as UTCTimestamp);
    const y = series.priceToCoordinate(point.price);
    return x == null || y == null ? null : { x, y };
  };

  const renderDrawing = (drawing: Drawing, draftMode = false) => {
    const coords = drawing.points.map(xy).filter((p): p is { x: number; y: number } => Boolean(p));
    if (!coords.length) return null;
    const cls = draftMode ? `${styles.drawing} ${styles.draft}` : styles.drawing;
    if (drawing.type === "hline") return <line key={drawing.id} className={cls} x1="0" x2="100%" y1={coords[0].y} y2={coords[0].y}/>;
    if (drawing.type === "vline") return <line key={drawing.id} className={cls} x1={coords[0].x} x2={coords[0].x} y1="0" y2="100%"/>;
    if (drawing.type === "trend" && coords[1]) return <line key={drawing.id} className={cls} x1={coords[0].x} y1={coords[0].y} x2={coords[1].x} y2={coords[1].y}/>;
    if (drawing.type === "rect" && coords[1]) return <rect key={drawing.id} className={`${cls} ${styles.shape}`} x={Math.min(coords[0].x, coords[1].x)} y={Math.min(coords[0].y, coords[1].y)} width={Math.abs(coords[1].x - coords[0].x)} height={Math.abs(coords[1].y - coords[0].y)}/>;
    if (drawing.type === "brush") return <polyline key={drawing.id} className={cls} points={coords.map(p => `${p.x},${p.y}`).join(" ")}/>;
    if (drawing.type === "text") return <text key={drawing.id} className={styles.note} x={coords[0].x + 5} y={coords[0].y - 6}>{drawing.text}</text>;
    if (drawing.type === "measure" && coords[1]) {
      const change = drawing.points[0].price ? (drawing.points[1].price / drawing.points[0].price - 1) * 100 : 0;
      return <g key={drawing.id}><line className={`${cls} ${styles.measure}`} x1={coords[0].x} y1={coords[0].y} x2={coords[1].x} y2={coords[1].y}/><text className={styles.measureText} x={(coords[0].x + coords[1].x) / 2 + 5} y={(coords[0].y + coords[1].y) / 2 - 6}>{change >= 0 ? "+" : ""}{change.toFixed(2)}%</text></g>;
    }
    if (drawing.type === "fib" && coords[1]) {
      const p0 = drawing.points[0].price, p1 = drawing.points[1].price;
      return <g key={drawing.id}>{FIB_LEVELS.map(level => {
        const price = p0 + (p1 - p0) * level; const y = seriesRef.current?.priceToCoordinate(price); if (y == null) return null;
        return <g key={level}><line className={`${cls} ${styles.fib}`} x1={Math.min(coords[0].x, coords[1].x)} x2="100%" y1={y} y2={y}/><text className={styles.fibText} x={Math.min(coords[0].x, coords[1].x) + 5} y={y - 3}>{(level * 100).toFixed(level === 0 || level === 1 ? 0 : 1)}%</text></g>;
      })}</g>;
    }
    return null;
  };

  const temporary = useMemo<Drawing[]>(() => {
    const out: Drawing[] = [];
    if (draft.length && twoPointTools.has(tool)) out.push({ id: "draft", type: tool as Drawing["type"], points: draft.length === 1 ? [draft[0], draft[0]] : draft });
    if (brushDraft.length) out.push({ id: "brush-draft", type: "brush", points: brushDraft });
    return out;
  }, [draft, brushDraft, tool]);

  const chooseTool = (next: Tool) => { if (locked) return; setTool(next); setDraft([]); setBrushDraft([]); };
  const buttons: Array<{ tool: Tool; label: string }> = [
    { tool: "cursor", label: "Crosshair / pan" }, { tool: "trend", label: "Trend line" }, { tool: "hline", label: "Horizontal line" },
    { tool: "vline", label: "Vertical line" }, { tool: "fib", label: "Fibonacci retracement" }, { tool: "rect", label: "Rectangle" },
    { tool: "brush", label: "Brush" }, { tool: "text", label: "Text" }, { tool: "measure", label: "Measure" },
  ];

  return <div className={styles.layer}>
    <nav className={styles.toolbar} aria-label="Chart drawing tools">
      {buttons.map(item => <button key={item.tool} type="button" title={item.label} aria-label={item.label} className={tool === item.tool ? styles.active : ""} onClick={() => chooseTool(item.tool)}><Icon name={item.tool}/></button>)}
      <i/>
      <button type="button" title="Undo last drawing" aria-label="Undo last drawing" disabled={!drawings.length || locked} onClick={() => setDrawings(current => current.slice(0, -1))}><Icon name="undo"/></button>
      <button type="button" title={magnet ? "Magnet snapping on" : "Magnet snapping off"} aria-label="Toggle magnet snapping" className={magnet ? styles.activeSoft : ""} onClick={() => setMagnet(v => !v)}><Icon name="magnet"/></button>
      <i/>
      <button type="button" title={locked ? "Unlock drawings" : "Lock drawings"} aria-label="Lock drawings" className={locked ? styles.activeSoft : ""} onClick={() => { setLocked(v => !v); setTool("cursor"); setDraft([]); }}><Icon name="lock"/></button>
      <button type="button" title={visible ? "Hide drawings" : "Show drawings"} aria-label="Toggle drawings visibility" className={!visible ? styles.activeSoft : ""} onClick={() => setVisible(v => !v)}><Icon name="eye"/></button>
      <button type="button" title="Clear all drawings" aria-label="Clear all drawings" disabled={!drawings.length || locked} onClick={() => { if (window.confirm("Clear all drawings on this timeframe?")) setDrawings([]); }}><Icon name="clear"/></button>
    </nav>
    <svg ref={svgRef} className={`${styles.svg} ${tool !== "cursor" && !locked ? styles.capture : ""}`} onClick={handleClick} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={finishBrush} onPointerCancel={finishBrush}>
      {visible && drawings.map(drawing => renderDrawing(drawing))}
      {visible && temporary.map(drawing => renderDrawing(drawing, true))}
    </svg>
  </div>;
}
