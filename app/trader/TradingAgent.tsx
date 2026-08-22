"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./trader.module.css";

type Candle = { time: number; open: number; high: number; low: number; close: number; volume: number };
type Zone = {
  low: number; high: number; center: number; distancePct: number; score: number;
  type: "Historical bottom" | "Historical top retest" | "Multi-touch support";
  touches: number; reactionPct: number;
};
type Breakout = {
  type: "Downtrend line" | "Horizontal resistance" | "None";
  status: "Confirmed" | "First close" | "Watching";
  score: number;
  level: number | null;
  firstClose: number | null;
  confirmationClose: number | null;
  resistanceTouches: number;
  lineStartTime: number | null;
  lineStartPrice: number | null;
  lineEndTime: number | null;
  lineEndPrice: number | null;
};
type Opportunity = {
  symbol: string;
  label: string;
  kind: "Crypto" | "US Stock" | "ETF" | "Commodity";
  price: number;
  sourceStatus: "live" | "fallback";
  weeklyCandles: Candle[];
  monthlyCandles: Candle[];
  weekly: Zone;
  monthly: Zone;
  accumulationScore: number;
  accumulationStatus: "In buying zone" | "Approaching" | "Watch";
  preferredZoneLow: number;
  preferredZoneHigh: number;
  confluence: "Overlap" | "Near" | "Separate";
  breakout: Breakout;
};
type RadarResponse = { generatedAt: string; universe: number; fxIncluded: boolean; opportunities: Opportunity[] };
type Tab = "Radar" | "Plan" | "Portfolio" | "Strategy" | "Brokers";
type SignalMode = "accumulation" | "breakout";
type ChartFrame = "weekly" | "monthly";
type StrategySettings = {
  dcaLevels: number;
  dcaDropPct: number;
  maxAllocation: number;
  allocationMode: "equal" | "deep";
  tpTargets: number[];
  tpSellPcts: number[];
  actionScore: number;
};
type PaperPlan = {
  id: string;
  symbol: string;
  label: string;
  strategy: string;
  createdAt: string;
  entry: number;
  allocation: number;
  dcaLevels: { level: number; price: number; allocation: number }[];
  tpLevels: { level: number; targetPct: number; price: number; sellPct: number }[];
};

const DEFAULT_SETTINGS: StrategySettings = {
  dcaLevels: 10,
  dcaDropPct: 3,
  maxAllocation: 10000,
  allocationMode: "deep",
  tpTargets: [10, 20, 35, 50, 80],
  tpSellPcts: [10, 15, 20, 25, 30],
  actionScore: 70,
};

function money(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  const digits = Math.abs(value) >= 1000 ? 0 : Math.abs(value) >= 100 ? 2 : Math.abs(value) >= 1 ? 2 : 4;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: digits }).format(value);
}

function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)); }

function buildDca(entry: number, settings: StrategySettings) {
  const count = clamp(Math.round(settings.dcaLevels), 2, 20);
  const drop = clamp(settings.dcaDropPct, 0.1, 25) / 100;
  let weights = Array.from({ length: count }, () => 1);
  if (settings.allocationMode === "deep") weights = weights.map((_, i) => 0.65 + (i / Math.max(1, count - 1)) * 0.9);
  const total = weights.reduce((a, b) => a + b, 0);
  return weights.map((weight, i) => ({
    level: i + 1,
    price: entry * Math.pow(1 - drop, i),
    allocation: settings.maxAllocation * weight / total,
  }));
}

function buildTps(avgEntry: number, settings: StrategySettings) {
  return settings.tpTargets.map((targetPct, i) => ({
    level: i + 1,
    targetPct,
    price: avgEntry * (1 + targetPct / 100),
    sellPct: settings.tpSellPcts[i] ?? 0,
  }));
}

function nearestIndex(candles: Candle[], time: number) {
  let best = 0; let bestDiff = Number.POSITIVE_INFINITY;
  candles.forEach((c, i) => { const diff = Math.abs(c.time - time); if (diff < bestDiff) { best = i; bestDiff = diff; } });
  return best;
}

function PriceChart({ candles, zone, breakout, frame }: { candles: Candle[]; zone?: Zone; breakout?: Breakout; frame: ChartFrame }) {
  const width = 760; const height = 270; const pad = 18;
  if (!candles.length) return <div className={styles.empty}>No chart data.</div>;
  const extras = [zone?.low, zone?.high, breakout?.level, breakout?.lineStartPrice, breakout?.lineEndPrice].filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  const values = [...candles.flatMap((c) => [c.low, c.high, c.close]), ...extras];
  const min = Math.min(...values) * 0.975; const max = Math.max(...values) * 1.025;
  const x = (i: number) => pad + (i / Math.max(1, candles.length - 1)) * (width - pad * 2);
  const y = (v: number) => height - pad - ((v - min) / Math.max(0.0001, max - min)) * (height - pad * 2);
  const points = candles.map((c, i) => `${x(i)},${y(c.close)}`).join(" ");
  const zoneY1 = zone ? y(zone.high) : 0; const zoneY2 = zone ? y(zone.low) : 0;
  let trend: { x1: number; y1: number; x2: number; y2: number } | null = null;
  if (frame === "weekly" && breakout?.type === "Downtrend line" && breakout.lineStartTime && breakout.lineStartPrice && breakout.lineEndTime && breakout.lineEndPrice) {
    const i1 = nearestIndex(candles, breakout.lineStartTime); const i2 = nearestIndex(candles, breakout.lineEndTime);
    trend = { x1: x(i1), y1: y(breakout.lineStartPrice), x2: x(i2), y2: y(breakout.lineEndPrice) };
  }
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={styles.chart} role="img" aria-label={`${frame} price chart`}>
      <defs><linearGradient id={`chartFill-${frame}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="currentColor" stopOpacity=".16"/><stop offset="100%" stopColor="currentColor" stopOpacity="0"/></linearGradient></defs>
      {zone && <rect x="0" y={zoneY1} width={width} height={Math.max(2, zoneY2 - zoneY1)} className={styles.zoneBand}/>} 
      {frame === "weekly" && breakout?.type === "Horizontal resistance" && breakout.level && <line x1={0} y1={y(breakout.level)} x2={width} y2={y(breakout.level)} className={styles.breakoutLine}/>} 
      {trend && <line {...trend} className={styles.breakoutLine}/>} 
      <polygon points={`${points} ${x(candles.length - 1)},${height - pad} ${pad},${height - pad}`} fill={`url(#chartFill-${frame})`} className={styles.chartFill}/>
      <polyline points={points} fill="none" vectorEffect="non-scaling-stroke" className={styles.priceLine}/>
    </svg>
  );
}

export default function TradingAgent() {
  const [tab, setTab] = useState<Tab>("Radar");
  const [mode, setMode] = useState<SignalMode>("accumulation");
  const [chartFrame, setChartFrame] = useState<ChartFrame>("weekly");
  const [radar, setRadar] = useState<RadarResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedSymbol, setSelectedSymbol] = useState("BTC");
  const [kind, setKind] = useState<"All" | Opportunity["kind"]>("All");
  const [settings, setSettings] = useState<StrategySettings>(DEFAULT_SETTINGS);
  const [paperPlans, setPaperPlans] = useState<PaperPlan[]>([]);
  const [notice, setNotice] = useState("");

  const loadRadar = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/trader/radar", { cache: "no-store" });
      if (!res.ok) throw new Error("Radar request failed");
      const data = await res.json() as RadarResponse;
      setRadar(data);
      if (data.opportunities.length && !data.opportunities.some((o) => o.symbol === selectedSymbol)) setSelectedSymbol(data.opportunities[0].symbol);
    } catch {
      setNotice("Market data could not refresh. The previous scan is preserved if available.");
    } finally { setLoading(false); }
  };

  useEffect(() => {
    const savedSettings = localStorage.getItem("trading-agent-settings-v2");
    const savedPlans = localStorage.getItem("trading-agent-paper-plans-v2");
    if (savedSettings) { try { setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(savedSettings) }); } catch {} }
    if (savedPlans) { try { setPaperPlans(JSON.parse(savedPlans)); } catch {} }
    void loadRadar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { localStorage.setItem("trading-agent-settings-v2", JSON.stringify(settings)); }, [settings]);
  useEffect(() => { localStorage.setItem("trading-agent-paper-plans-v2", JSON.stringify(paperPlans)); }, [paperPlans]);

  const visible = useMemo(() => {
    const list = (radar?.opportunities ?? []).filter((o) => kind === "All" || o.kind === kind);
    return [...list].sort((a, b) => {
      if (mode === "accumulation") {
        const w = (s: Opportunity["accumulationStatus"]) => s === "In buying zone" ? 100 : s === "Approaching" ? 50 : 0;
        return (b.accumulationScore + w(b.accumulationStatus)) - (a.accumulationScore + w(a.accumulationStatus));
      }
      const w = (s: Breakout["status"]) => s === "Confirmed" ? 200 : s === "First close" ? 100 : 0;
      return (b.breakout.score + w(b.breakout.status)) - (a.breakout.score + w(a.breakout.status));
    });
  }, [radar, kind, mode]);

  const selected = (radar?.opportunities ?? []).find((o) => o.symbol === selectedSymbol) ?? visible[0] ?? radar?.opportunities?.[0];
  const entryAnchor = selected ? (mode === "accumulation" ? selected.preferredZoneHigh : selected.breakout.confirmationClose ?? selected.breakout.level ?? selected.price) : 0;
  const dca = selected ? buildDca(entryAnchor, settings) : [];
  const weightedAvg = dca.length ? dca.reduce((sum, l) => sum + l.price * l.allocation, 0) / dca.reduce((sum, l) => sum + l.allocation, 0) : 0;
  const tps = buildTps(weightedAvg, settings);
  const tpSellTotal = settings.tpSellPcts.reduce((a, b) => a + b, 0);
  const nav: Tab[] = ["Radar", "Plan", "Portfolio", "Strategy", "Brokers"];
  const inZoneCount = (radar?.opportunities ?? []).filter((o) => o.accumulationStatus === "In buying zone").length;
  const confirmedBreakouts = (radar?.opportunities ?? []).filter((o) => o.breakout.status === "Confirmed").length;
  const liveCount = (radar?.opportunities ?? []).filter((o) => o.sourceStatus === "live").length;

  const updateTp = (index: number, field: "target" | "sell", value: number) => {
    setSettings((prev) => {
      const next = { ...prev, tpTargets: [...prev.tpTargets], tpSellPcts: [...prev.tpSellPcts] };
      if (field === "target") next.tpTargets[index] = clamp(value, 0.1, 1000); else next.tpSellPcts[index] = clamp(value, 0, 100);
      return next;
    });
  };
  const addTp = () => setSettings((prev) => ({ ...prev, tpTargets: [...prev.tpTargets, (prev.tpTargets.at(-1) ?? 0) + 20], tpSellPcts: [...prev.tpSellPcts, 0] }));
  const removeTp = () => setSettings((prev) => prev.tpTargets.length <= 1 ? prev : ({ ...prev, tpTargets: prev.tpTargets.slice(0, -1), tpSellPcts: prev.tpSellPcts.slice(0, -1) }));

  const savePaperPlan = () => {
    if (!selected || !dca.length) return;
    const plan: PaperPlan = {
      id: `${selected.symbol}-${Date.now()}`,
      symbol: selected.symbol,
      label: selected.label,
      strategy: mode === "accumulation" ? "Strategy 1 · Weekly + monthly accumulation" : "Strategy 2 · Confirmed breakout",
      createdAt: new Date().toISOString(),
      entry: entryAnchor,
      allocation: settings.maxAllocation,
      dcaLevels: dca,
      tpLevels: tps,
    };
    setPaperPlans((prev) => [plan, ...prev].slice(0, 50));
    setNotice(`${selected.symbol} paper plan saved — no real order was sent.`);
    setTab("Portfolio");
  };

  const selectedScore = selected ? (mode === "accumulation" ? selected.accumulationScore : selected.breakout.score) : 0;
  const selectedSignal = selected ? (mode === "accumulation" ? selected.accumulationStatus !== "Watch" : selected.breakout.status === "Confirmed") : false;
  const actionable = selectedSignal && selectedScore >= settings.actionScore;

  return (
    <main className={styles.shell} data-trader-app>
      <aside className={styles.sidebar}>
        <div className={styles.brand}><span className={styles.logoMark}>M</span><div><strong>Market Agent</strong><small>Multi-strategy radar</small></div></div>
        <nav className={styles.nav}>{nav.map((item) => <button key={item} className={tab === item ? styles.navActive : ""} onClick={() => setTab(item)}>{item}</button>)}</nav>
        <div className={styles.sidebarFoot}><span className={styles.paperDot}/> Paper mode active<br/><small>Real broker orders remain disabled.</small></div>
      </aside>

      <section className={styles.main}>
        <header className={styles.topbar}>
          <div><p className={styles.eyebrow}>PERSONAL TRADING SYSTEM · V2</p><h1>{tab === "Radar" ? "Market Radar" : tab}</h1></div>
          <div className={styles.topActions}><span className={styles.noFx}>FX excluded</span><button className={styles.secondaryButton} onClick={() => void loadRadar()} disabled={loading}>{loading ? "Scanning…" : "Refresh scan"}</button></div>
        </header>

        {notice && <div className={styles.notice} onClick={() => setNotice("")}>{notice}<span>×</span></div>}

        {tab === "Radar" && <>
          <div className={styles.strategySwitch}>
            <button className={mode === "accumulation" ? styles.strategyActive : ""} onClick={() => setMode("accumulation")}><b>Strategy 1</b><span>Weekly + monthly accumulation zones</span></button>
            <button className={mode === "breakout" ? styles.strategyActive : ""} onClick={() => setMode("breakout")}><b>Strategy 2</b><span>Confirmed trendline / horizontal breakout</span></button>
          </div>

          <div className={styles.stats}>
            <div><span>Scanned universe</span><strong>{radar?.opportunities.length ?? "—"}</strong><small>All assets stay visible</small></div>
            <div><span>In accumulation zone</span><strong>{inZoneCount}</strong><small>Weekly or monthly support</small></div>
            <div><span>Confirmed breakouts</span><strong>{confirmedBreakouts}</strong><small>Two consecutive closes</small></div>
            <div><span>Live feeds</span><strong>{radar ? `${liveCount}/${radar.opportunities.length}` : "—"}</strong><small>Fallback is explicitly labeled</small></div>
          </div>

          <div className={styles.filterRow}>{(["All", "Crypto", "US Stock", "ETF", "Commodity"] as const).map((k) => <button key={k} onClick={() => setKind(k)} className={kind === k ? styles.filterActive : ""}>{k}</button>)}</div>

          <div className={styles.radarGrid}>
            <div className={styles.tableCard}>
              {mode === "accumulation" ? <>
                <div className={`${styles.tableHead} ${styles.accumulationColumns}`}><span>Asset</span><span>Price</span><span>Weekly zone</span><span>Monthly zone</span><span>Score</span><span>Status</span></div>
                <div className={styles.tableBody}>{loading && !radar ? <div className={styles.empty}>Scanning weekly and monthly charts…</div> : visible.map((o) => (
                  <button key={o.symbol} className={`${styles.assetRow} ${styles.accumulationColumns} ${selected?.symbol === o.symbol ? styles.assetSelected : ""}`} onClick={() => setSelectedSymbol(o.symbol)}>
                    <span className={styles.assetName}><b>{o.symbol}</b><small>{o.kind} · {o.sourceStatus}</small></span>
                    <span>{money(o.price)}</span><span>{money(o.weekly.low)}–{money(o.weekly.high)}</span><span>{money(o.monthly.low)}–{money(o.monthly.high)}</span>
                    <span><b className={`${styles.score} ${o.accumulationScore >= settings.actionScore ? styles.scoreHot : ""}`}>{o.accumulationScore}</b></span>
                    <span><i className={`${styles.statusDot} ${o.accumulationStatus === "In buying zone" ? styles.green : o.accumulationStatus === "Approaching" ? styles.amber : styles.grey}`}/>{o.accumulationStatus}</span>
                  </button>
                ))}</div>
              </> : <>
                <div className={`${styles.tableHead} ${styles.breakoutColumns}`}><span>Asset</span><span>Price</span><span>Breakout</span><span>Level</span><span>Score</span><span>Confirmation</span></div>
                <div className={styles.tableBody}>{loading && !radar ? <div className={styles.empty}>Scanning breakout structures…</div> : visible.map((o) => (
                  <button key={o.symbol} className={`${styles.assetRow} ${styles.breakoutColumns} ${selected?.symbol === o.symbol ? styles.assetSelected : ""}`} onClick={() => setSelectedSymbol(o.symbol)}>
                    <span className={styles.assetName}><b>{o.symbol}</b><small>{o.kind} · {o.sourceStatus}</small></span>
                    <span>{money(o.price)}</span><span>{o.breakout.type}</span><span>{money(o.breakout.level)}</span>
                    <span><b className={`${styles.score} ${o.breakout.status === "Confirmed" && o.breakout.score >= settings.actionScore ? styles.scoreHot : ""}`}>{o.breakout.score}</b></span>
                    <span><i className={`${styles.statusDot} ${o.breakout.status === "Confirmed" ? styles.green : o.breakout.status === "First close" ? styles.amber : styles.grey}`}/>{o.breakout.status}</span>
                  </button>
                ))}</div>
              </>}
            </div>

            {selected && <article className={styles.detailCard}>
              <div className={styles.detailTop}><div><span className={styles.symbolPill}>{selected.kind}</span><h2>{selected.symbol} <small>{selected.label}</small></h2></div><div className={styles.bigPrice}>{money(selected.price)}<small>{selected.sourceStatus === "live" ? "LIVE DATA" : "FALLBACK DATA · DO NOT TRADE"}</small></div></div>
              <div className={styles.chartTabs}><button className={chartFrame === "weekly" ? styles.filterActive : ""} onClick={() => setChartFrame("weekly")}>Weekly</button><button className={chartFrame === "monthly" ? styles.filterActive : ""} onClick={() => setChartFrame("monthly")}>Monthly</button></div>
              <PriceChart candles={chartFrame === "weekly" ? selected.weeklyCandles : selected.monthlyCandles} zone={mode === "accumulation" ? (chartFrame === "weekly" ? selected.weekly : selected.monthly) : undefined} breakout={mode === "breakout" ? selected.breakout : undefined} frame={chartFrame}/>

              {mode === "accumulation" ? <>
                <div className={styles.dualZones}>
                  <div><span>Weekly zone</span><strong>{money(selected.weekly.low)} – {money(selected.weekly.high)}</strong><small>{selected.weekly.type} · score {selected.weekly.score}</small></div>
                  <div><span>Monthly zone</span><strong>{money(selected.monthly.low)} – {money(selected.monthly.high)}</strong><small>{selected.monthly.type} · score {selected.monthly.score}</small></div>
                </div>
                <div className={styles.zoneSummary}><div><span>Preferred / confluence zone</span><strong>{money(selected.preferredZoneLow)} – {money(selected.preferredZoneHigh)}</strong></div><div><span>Composite score</span><strong>{selected.accumulationScore}/100</strong></div></div>
                <div className={styles.reasonGrid}><div><span>Weekly weight</span><b>55%</b></div><div><span>Monthly weight</span><b>45%</b></div><div><span>Confluence</span><b>{selected.confluence}</b></div><div><span>Signal</span><b>{selected.accumulationStatus}</b></div></div>
              </> : <>
                <div className={styles.zoneSummary}><div><span>Detected breakout</span><strong>{selected.breakout.type}</strong></div><div><span>Breakout score</span><strong>{selected.breakout.score}/100</strong></div></div>
                <div className={styles.reasonGrid}><div><span>Breakout level</span><b>{money(selected.breakout.level)}</b></div><div><span>First close above</span><b>{money(selected.breakout.firstClose)}</b></div><div><span>Second close / confirmation</span><b>{money(selected.breakout.confirmationClose)}</b></div><div><span>Status</span><b>{selected.breakout.status}</b></div></div>
                <p className={styles.helpText}>A breakout is marked <b>Confirmed</b> only when the first weekly close finishes above the detected falling trendline or horizontal resistance and the following weekly close also finishes above it. A single close is shown as <b>First close</b>, not as a confirmed signal.</p>
              </>}

              <div className={`${styles.actionBar} ${actionable ? styles.actionable : styles.notActionable}`}><b>{actionable ? "ACTIONABLE SIGNAL" : "WATCH / NOT YET ACTIONABLE"}</b><span>Threshold: {settings.actionScore}/100. The threshold ranks readiness but never hides assets.</span></div>
              <div className={styles.detailActions}><button className={styles.primaryButton} onClick={() => setTab("Plan")}>Build DCA + TP plan</button><button className={styles.secondaryButton} onClick={() => setTab("Strategy")}>Edit execution settings</button></div>
            </article>}
          </div>
        </>}

        {tab === "Plan" && selected && <div className={styles.planLayout}>
          <article className={styles.planCard}>
            <div className={styles.cardTitle}><div><p>ENTRY PLAN</p><h2>{selected.symbol} · {mode === "accumulation" ? "Strategy 1" : "Strategy 2"}</h2></div><span>{settings.dcaLevels} buys</span></div>
            {mode === "breakout" && selected.breakout.status !== "Confirmed" && <div className={styles.warningBox}>Breakout is not confirmed by a second close. This plan is paper-only and should not be treated as an active breakout entry.</div>}
            <div className={styles.planMetrics}><div><span>Entry anchor</span><b>{money(entryAnchor)}</b></div><div><span>Projected avg cost</span><b>{money(weightedAvg)}</b></div><div><span>Total allocation</span><b>{money(settings.maxAllocation)}</b></div></div>
            <div className={styles.ladderHeader}><span>Buy</span><span>Price</span><span>Allocation</span><span>From prior</span></div>
            <div className={styles.ladder}>{dca.map((l, i) => <div key={l.level}><b>DCA {l.level}</b><span>{money(l.price)}</span><span>{money(l.allocation)}</span><span>{i === 0 ? "Anchor" : `-${settings.dcaDropPct}%`}</span></div>)}</div>
          </article>
          <article className={styles.planCard}>
            <div className={styles.cardTitle}><div><p>EXIT PLAN</p><h2>Multi-take-profit ladder</h2></div><span>{tps.length} targets</span></div>
            <div className={styles.ladderHeader}><span>TP</span><span>Gain</span><span>Price</span><span>Sell</span></div>
            <div className={styles.ladder}>{tps.map((tp) => <div key={tp.level}><b>TP {tp.level}</b><span>+{tp.targetPct}%</span><span>{money(tp.price)}</span><span>{tp.sellPct}%</span></div>)}</div>
            <div className={`${styles.tpTotal} ${Math.abs(tpSellTotal - 100) < .01 ? styles.tpOk : styles.tpWarn}`}><span>Total position assigned</span><b>{tpSellTotal}%</b></div>
            <div className={styles.executionBox}><div><b>Paper execution only</b><span>Save this strategy snapshot to the paper portfolio. No broker order is created.</span></div><button className={styles.primaryButton} onClick={savePaperPlan}>Save paper plan</button></div>
          </article>
        </div>}

        {tab === "Portfolio" && <article className={styles.portfolioCard}>
          <div className={styles.cardTitle}><div><p>PAPER PORTFOLIO</p><h2>Saved strategy plans</h2></div><span>{paperPlans.length} plans</span></div>
          {!paperPlans.length ? <div className={styles.emptyLarge}><b>No paper plans yet</b><span>Choose an asset in Radar, build the entry/exit plan, then save it here.</span><button className={styles.primaryButton} onClick={() => setTab("Radar")}>Open Radar</button></div> : <div className={styles.paperList}>{paperPlans.map((p) => <div key={p.id}><span><small>Asset</small><b>{p.symbol} · {p.label}</b></span><span><small>Strategy</small><b>{p.strategy}</b></span><span><small>Entry anchor</small><b>{money(p.entry)}</b></span><span><small>Capital</small><b>{money(p.allocation)}</b></span><button onClick={() => setPaperPlans((prev) => prev.filter((x) => x.id !== p.id))}>Remove</button></div>)}</div>}
        </article>}

        {tab === "Strategy" && <div className={styles.settingsLayout}>
          <article className={styles.settingsCard}>
            <div className={styles.cardTitle}><div><p>SIGNAL LOGIC</p><h2>Two active strategies</h2></div></div>
            <div className={styles.strategyDefinition}><b>Strategy 1 · Accumulation</b><p>Detect structural support on both weekly and monthly charts. Composite score = 55% weekly + 45% monthly, with an extra confluence bonus when the zones overlap or sit close together.</p></div>
            <div className={styles.strategyDefinition}><b>Strategy 2 · Breakout</b><p>Detect either a descending trendline or horizontal resistance. A signal becomes confirmed only after two consecutive weekly closes above the detected line/level.</p></div>
            <label><span>Actionable score threshold<small>Used for the readiness badge only. It never removes assets from Radar.</small></span><div className={styles.inputSuffix}><input type="number" min="30" max="95" value={settings.actionScore} onChange={(e) => setSettings((p) => ({ ...p, actionScore: clamp(Number(e.target.value), 30, 95) }))}/><i>/100</i></div></label>
          </article>

          <article className={styles.settingsCard}>
            <div className={styles.cardTitle}><div><p>ENTRY ENGINE</p><h2>DCA settings</h2></div></div>
            <label><span>Number of buys<small>2–20 entries.</small></span><input type="number" min="2" max="20" value={settings.dcaLevels} onChange={(e) => setSettings((p) => ({ ...p, dcaLevels: clamp(Number(e.target.value), 2, 20) }))}/></label>
            <label><span>Drop between buys<small>Percentage below each previous DCA.</small></span><div className={styles.inputSuffix}><input type="number" step="0.1" min="0.1" max="25" value={settings.dcaDropPct} onChange={(e) => setSettings((p) => ({ ...p, dcaDropPct: clamp(Number(e.target.value), .1, 25) }))}/><i>%</i></div></label>
            <label><span>Maximum allocation<small>Total capital assigned to one plan.</small></span><div className={styles.inputPrefix}><i>$</i><input type="number" min="100" step="100" value={settings.maxAllocation} onChange={(e) => setSettings((p) => ({ ...p, maxAllocation: Math.max(100, Number(e.target.value)) }))}/></div></label>
            <label><span>Allocation curve<small>Deep mode puts more capital into lower DCA levels.</small></span><select value={settings.allocationMode} onChange={(e) => setSettings((p) => ({ ...p, allocationMode: e.target.value as "equal" | "deep" }))}><option value="deep">Increase allocation lower</option><option value="equal">Equal allocation</option></select></label>
          </article>

          <article className={styles.settingsCard}>
            <div className={styles.cardTitle}><div><p>EXIT ENGINE</p><h2>Take-profit levels</h2></div><div className={styles.inlineButtons}><button onClick={removeTp}>−</button><button onClick={addTp}>+</button></div></div>
            <div className={styles.tpEditorHead}><span>Level</span><span>Profit target</span><span>Position sold</span></div>
            <div className={styles.tpEditor}>{settings.tpTargets.map((target, i) => <div key={i}><b>TP {i + 1}</b><div className={styles.inputSuffix}><input type="number" step="1" value={target} onChange={(e) => updateTp(i, "target", Number(e.target.value))}/><i>%</i></div><div className={styles.inputSuffix}><input type="number" step="1" value={settings.tpSellPcts[i] ?? 0} onChange={(e) => updateTp(i, "sell", Number(e.target.value))}/><i>%</i></div></div>)}</div>
            <div className={`${styles.tpTotal} ${Math.abs(tpSellTotal - 100) < .01 ? styles.tpOk : styles.tpWarn}`}><span>Assigned across TP levels</span><b>{tpSellTotal}%</b></div>
          </article>
        </div>}

        {tab === "Brokers" && <div className={styles.brokerGrid}>
          <article className={styles.brokerCard}><div className={styles.brokerIcon}>B</div><div><p>CRYPTO EXECUTION</p><h2>Binance</h2><span>Adapter planned. Real credentials and orders are disabled in V2.</span></div><button disabled>Not connected</button></article>
          <article className={styles.brokerCard}><div className={styles.brokerIcon}>IB</div><div><p>MULTI-ASSET EXECUTION</p><h2>Interactive Brokers</h2><span>Adapter planned for equities, ETFs and additional markets after paper validation.</span></div><button disabled>Not connected</button></article>
          <article className={styles.safetyCard}><b>Execution safety gate remains locked.</b><p>The engine currently scans and creates paper plans only. Fallback-data assets are shown so the universe never disappears, but they are clearly labeled and should never be used for actual orders. Real execution should be enabled only after dependable live market feeds and backtesting are in place.</p></article>
        </div>}

        <footer className={styles.footer}>Market Agent V2 · Strategy 1 weekly + monthly accumulation · Strategy 2 two-close confirmed breakout · FX excluded · Paper mode</footer>
      </section>
    </main>
  );
}
