"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./trader.module.css";

type Candle = { time: number; open: number; high: number; low: number; close: number; volume: number };
type Opportunity = {
  symbol: string; label: string; kind: "Crypto" | "US Stock" | "ETF" | "Commodity"; price: number;
  zoneLow: number; zoneHigh: number; distancePct: number; score: number;
  zoneType: "Historical bottom" | "Historical top retest" | "Multi-touch support";
  touches: number; reactionPct: number; status: "In buying zone" | "Approaching" | "Watch";
  candles: Candle[]; sourceStatus: "live" | "fallback";
};
type RadarResponse = { generatedAt: string; universe: number; fxIncluded: boolean; opportunities: Opportunity[] };
type Tab = "Radar" | "Plan" | "Portfolio" | "Strategy" | "Brokers";
type Strategy = {
  dcaLevels: number;
  dcaDropPct: number;
  maxAllocation: number;
  allocationMode: "equal" | "deep";
  tpTargets: number[];
  tpSellPcts: number[];
  minScore: number;
};
type PaperPlan = {
  id: string; symbol: string; label: string; createdAt: string; entry: number; allocation: number;
  dcaLevels: { level: number; price: number; allocation: number }[];
  tpLevels: { level: number; targetPct: number; price: number; sellPct: number }[];
};

const DEFAULT_STRATEGY: Strategy = {
  dcaLevels: 10,
  dcaDropPct: 3,
  maxAllocation: 10000,
  allocationMode: "deep",
  tpTargets: [10, 20, 35, 50, 80],
  tpSellPcts: [10, 15, 20, 25, 30],
  minScore: 70,
};

function money(value: number) {
  if (!Number.isFinite(value)) return "—";
  const digits = Math.abs(value) >= 1000 ? 0 : Math.abs(value) >= 100 ? 2 : Math.abs(value) >= 1 ? 2 : 4;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: digits }).format(value);
}

function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)); }

function buildDca(entry: number, strategy: Strategy) {
  const count = clamp(Math.round(strategy.dcaLevels), 2, 20);
  const drop = clamp(strategy.dcaDropPct, 0.1, 25) / 100;
  let weights = Array.from({ length: count }, () => 1);
  if (strategy.allocationMode === "deep") weights = weights.map((_, i) => 0.65 + (i / Math.max(1, count - 1)) * 0.9);
  const weightTotal = weights.reduce((a, b) => a + b, 0);
  return weights.map((weight, i) => ({
    level: i + 1,
    price: entry * Math.pow(1 - drop, i),
    allocation: strategy.maxAllocation * (weight / weightTotal),
  }));
}

function buildTps(avgEntry: number, strategy: Strategy) {
  return strategy.tpTargets.map((targetPct, i) => ({
    level: i + 1,
    targetPct,
    price: avgEntry * (1 + targetPct / 100),
    sellPct: strategy.tpSellPcts[i] ?? 0,
  }));
}

function Sparkline({ candles, zoneLow, zoneHigh }: { candles: Candle[]; zoneLow: number; zoneHigh: number }) {
  const width = 760; const height = 260; const pad = 16;
  const values = candles.map((c) => c.close);
  const min = Math.min(...values, zoneLow) * 0.98; const max = Math.max(...values, zoneHigh) * 1.02;
  const x = (i: number) => pad + (i / Math.max(1, candles.length - 1)) * (width - pad * 2);
  const y = (v: number) => height - pad - ((v - min) / Math.max(0.0001, max - min)) * (height - pad * 2);
  const points = candles.map((c, i) => `${x(i)},${y(c.close)}`).join(" ");
  const zoneY1 = y(zoneHigh); const zoneY2 = y(zoneLow);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={styles.chart} role="img" aria-label="Weekly price chart and detected buying zone">
      <defs><linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="currentColor" stopOpacity=".16"/><stop offset="100%" stopColor="currentColor" stopOpacity="0"/></linearGradient></defs>
      <rect x="0" y={zoneY1} width={width} height={Math.max(2, zoneY2-zoneY1)} className={styles.zoneBand} />
      <polyline points={points} fill="none" vectorEffect="non-scaling-stroke" className={styles.priceLine} />
      <polygon points={`${points} ${x(candles.length-1)},${height-pad} ${pad},${height-pad}`} fill="url(#chartFill)" className={styles.chartFill} />
    </svg>
  );
}

export default function TradingAgent() {
  const [tab, setTab] = useState<Tab>("Radar");
  const [radar, setRadar] = useState<RadarResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedSymbol, setSelectedSymbol] = useState<string>("BTC");
  const [kind, setKind] = useState<"All" | Opportunity["kind"]>("All");
  const [strategy, setStrategy] = useState<Strategy>(DEFAULT_STRATEGY);
  const [paperPlans, setPaperPlans] = useState<PaperPlan[]>([]);
  const [notice, setNotice] = useState("");

  const loadRadar = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/trader/radar", { cache: "no-store" });
      const data = await res.json() as RadarResponse;
      setRadar(data);
      if (data.opportunities.length && !data.opportunities.some((o) => o.symbol === selectedSymbol)) setSelectedSymbol(data.opportunities[0].symbol);
    } catch {
      setNotice("Market data could not refresh. Try again shortly.");
    } finally { setLoading(false); }
  };

  useEffect(() => {
    const savedStrategy = localStorage.getItem("trading-agent-strategy-v1");
    const savedPlans = localStorage.getItem("trading-agent-paper-plans-v1");
    if (savedStrategy) { try { setStrategy({ ...DEFAULT_STRATEGY, ...JSON.parse(savedStrategy) }); } catch {} }
    if (savedPlans) { try { setPaperPlans(JSON.parse(savedPlans)); } catch {} }
    void loadRadar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { localStorage.setItem("trading-agent-strategy-v1", JSON.stringify(strategy)); }, [strategy]);
  useEffect(() => { localStorage.setItem("trading-agent-paper-plans-v1", JSON.stringify(paperPlans)); }, [paperPlans]);

  const visible = useMemo(() => (radar?.opportunities ?? []).filter((o) => (kind === "All" || o.kind === kind) && o.score >= strategy.minScore), [radar, kind, strategy.minScore]);
  const selected = (radar?.opportunities ?? []).find((o) => o.symbol === selectedSymbol) ?? visible[0] ?? radar?.opportunities?.[0];
  const dca = selected ? buildDca(selected.zoneHigh, strategy) : [];
  const weightedAvg = dca.length ? dca.reduce((sum, l) => sum + l.price * l.allocation, 0) / dca.reduce((sum, l) => sum + l.allocation, 0) : 0;
  const tps = buildTps(weightedAvg, strategy);

  const updateTp = (index: number, field: "target" | "sell", value: number) => {
    setStrategy((prev) => {
      const next = { ...prev, tpTargets: [...prev.tpTargets], tpSellPcts: [...prev.tpSellPcts] };
      if (field === "target") next.tpTargets[index] = clamp(value, 0.1, 1000); else next.tpSellPcts[index] = clamp(value, 0, 100);
      return next;
    });
  };

  const addTp = () => setStrategy((prev) => ({ ...prev, tpTargets: [...prev.tpTargets, (prev.tpTargets.at(-1) ?? 0) + 20], tpSellPcts: [...prev.tpSellPcts, 0] }));
  const removeTp = () => setStrategy((prev) => prev.tpTargets.length <= 1 ? prev : ({ ...prev, tpTargets: prev.tpTargets.slice(0, -1), tpSellPcts: prev.tpSellPcts.slice(0, -1) }));

  const savePaperPlan = () => {
    if (!selected || !dca.length) return;
    const plan: PaperPlan = {
      id: `${selected.symbol}-${Date.now()}`,
      symbol: selected.symbol,
      label: selected.label,
      createdAt: new Date().toISOString(),
      entry: selected.zoneHigh,
      allocation: strategy.maxAllocation,
      dcaLevels: dca,
      tpLevels: tps,
    };
    setPaperPlans((prev) => [plan, ...prev].slice(0, 50));
    setNotice(`${selected.symbol} paper DCA plan created — no real order was sent.`);
    setTab("Portfolio");
  };

  const nav: Tab[] = ["Radar", "Plan", "Portfolio", "Strategy", "Brokers"];
  const inZoneCount = (radar?.opportunities ?? []).filter((o) => o.status === "In buying zone").length;
  const approachingCount = (radar?.opportunities ?? []).filter((o) => o.status === "Approaching").length;
  const liveCount = (radar?.opportunities ?? []).filter((o) => o.sourceStatus === "live").length;
  const tpSellTotal = strategy.tpSellPcts.reduce((a, b) => a + b, 0);

  return (
    <main className={styles.shell} data-trader-app>
      <aside className={styles.sidebar}>
        <div className={styles.brand}><span className={styles.logoMark}>M</span><div><strong>Market Agent</strong><small>Weekly accumulation radar</small></div></div>
        <nav className={styles.nav}>{nav.map((item) => <button key={item} className={tab === item ? styles.navActive : ""} onClick={() => setTab(item)}>{item}</button>)}</nav>
        <div className={styles.sidebarFoot}><span className={styles.paperDot}/> Paper mode active<br/><small>Real broker orders are disabled.</small></div>
      </aside>

      <section className={styles.main}>
        <header className={styles.topbar}>
          <div><p className={styles.eyebrow}>PERSONAL TRADING SYSTEM · V1</p><h1>{tab === "Radar" ? "Market Radar" : tab}</h1></div>
          <div className={styles.topActions}><span className={styles.noFx}>FX excluded</span><button className={styles.secondaryButton} onClick={() => void loadRadar()} disabled={loading}>{loading ? "Scanning…" : "Refresh scan"}</button></div>
        </header>

        {notice && <div className={styles.notice} onClick={() => setNotice("")}>{notice}<span>×</span></div>}

        {tab === "Radar" && <>
          <div className={styles.stats}>
            <div><span>Universe</span><strong>{radar?.universe ?? "—"}</strong><small>Crypto · stocks · ETFs · commodities</small></div>
            <div><span>In buying zone</span><strong>{inZoneCount}</strong><small>Weekly structure</small></div>
            <div><span>Approaching</span><strong>{approachingCount}</strong><small>Within 5% of zone</small></div>
            <div><span>Live feeds</span><strong>{radar ? `${liveCount}/${radar.opportunities.length}` : "—"}</strong><small>Fallback used when unavailable</small></div>
          </div>

          <div className={styles.filterRow}>{(["All","Crypto","US Stock","ETF","Commodity"] as const).map((k) => <button key={k} onClick={() => setKind(k)} className={kind === k ? styles.filterActive : ""}>{k}</button>)}</div>

          <div className={styles.radarGrid}>
            <div className={styles.tableCard}>
              <div className={styles.tableHead}><span>Asset</span><span>Price</span><span>Buying zone</span><span>Distance</span><span>Score</span><span>Status</span></div>
              <div className={styles.tableBody}>
                {loading && !radar ? <div className={styles.empty}>Scanning weekly charts…</div> : visible.map((o) => (
                  <button key={o.symbol} className={`${styles.assetRow} ${selected?.symbol === o.symbol ? styles.assetSelected : ""}`} onClick={() => setSelectedSymbol(o.symbol)}>
                    <span className={styles.assetName}><b>{o.symbol}</b><small>{o.kind}</small></span>
                    <span>{money(o.price)}</span>
                    <span>{money(o.zoneLow)}–{money(o.zoneHigh)}</span>
                    <span>{o.distancePct === 0 ? "IN ZONE" : `${o.distancePct.toFixed(1)}%`}</span>
                    <span><b className={styles.score}>{o.score}</b></span>
                    <span><i className={`${styles.statusDot} ${o.status === "In buying zone" ? styles.green : o.status === "Approaching" ? styles.amber : styles.grey}`}/>{o.status}</span>
                  </button>
                ))}
                {!loading && visible.length === 0 && <div className={styles.empty}>No assets meet the current minimum score. Lower the score in Strategy or refresh.</div>}
              </div>
            </div>

            {selected && <article className={styles.detailCard}>
              <div className={styles.detailTop}><div><span className={styles.symbolPill}>{selected.kind}</span><h2>{selected.symbol} <small>{selected.label}</small></h2></div><div className={styles.bigPrice}>{money(selected.price)}<small>{selected.sourceStatus === "live" ? "LIVE DATA" : "FALLBACK DATA"}</small></div></div>
              <Sparkline candles={selected.candles} zoneLow={selected.zoneLow} zoneHigh={selected.zoneHigh}/>
              <div className={styles.zoneSummary}><div><span>Weekly buying zone</span><strong>{money(selected.zoneLow)} – {money(selected.zoneHigh)}</strong></div><div><span>Zone score</span><strong>{selected.score}/100</strong></div></div>
              <div className={styles.reasonGrid}>
                <div><span>Structure</span><b>{selected.zoneType}</b></div><div><span>Historical touches</span><b>{selected.touches}</b></div><div><span>Prior reaction</span><b>+{selected.reactionPct.toFixed(1)}%</b></div><div><span>Distance</span><b>{selected.distancePct === 0 ? "Inside zone" : `${selected.distancePct.toFixed(1)}% away`}</b></div>
              </div>
              <div className={styles.detailActions}><button className={styles.primaryButton} onClick={() => setTab("Plan")}>Build DCA + TP plan</button><button className={styles.secondaryButton} onClick={() => setTab("Strategy")}>Edit strategy</button></div>
            </article>}
          </div>
        </>}

        {tab === "Plan" && selected && <div className={styles.planLayout}>
          <article className={styles.planCard}>
            <div className={styles.cardTitle}><div><p>ENTRY PLAN</p><h2>{selected.symbol} accumulation ladder</h2></div><span>{strategy.dcaLevels} buys · {strategy.dcaDropPct}% drop</span></div>
            <div className={styles.planMetrics}><div><span>First buy</span><b>{money(selected.zoneHigh)}</b></div><div><span>Projected weighted average</span><b>{money(weightedAvg)}</b></div><div><span>Maximum allocation</span><b>{money(strategy.maxAllocation)}</b></div></div>
            <div className={styles.ladderHeader}><span>Level</span><span>Limit price</span><span>Drop from first</span><span>Allocation</span></div>
            <div className={styles.ladder}>{dca.map((line) => <div key={line.level}><span>DCA {String(line.level).padStart(2,"0")}</span><b>{money(line.price)}</b><span>-{((1-line.price/dca[0].price)*100).toFixed(1)}%</span><span>{money(line.allocation)}</span></div>)}</div>
          </article>

          <article className={styles.planCard}>
            <div className={styles.cardTitle}><div><p>EXIT PLAN</p><h2>Multiple take profits</h2></div><span>From projected average entry</span></div>
            <div className={styles.ladderHeader}><span>Level</span><span>Target</span><span>Target price</span><span>Sell position</span></div>
            <div className={styles.ladder}>{tps.map((tp) => <div key={tp.level}><span>TP {tp.level}</span><b>+{tp.targetPct}%</b><span>{money(tp.price)}</span><span>{tp.sellPct}%</span></div>)}</div>
            <div className={`${styles.tpTotal} ${Math.abs(tpSellTotal-100) < .01 ? styles.tpOk : styles.tpWarn}`}><span>Total planned sale</span><b>{tpSellTotal.toFixed(0)}%</b></div>
            <div className={styles.executionBox}><div><b>Paper execution only</b><span>This records the plan locally. It does not transmit an order to Binance or Interactive Brokers.</span></div><button className={styles.primaryButton} onClick={savePaperPlan}>Create paper plan</button></div>
          </article>
        </div>}

        {tab === "Strategy" && <div className={styles.settingsLayout}>
          <article className={styles.settingsCard}><div className={styles.cardTitle}><div><p>ACCUMULATION</p><h2>DCA settings</h2></div></div>
            <label><span>Number of DCA buys <small>2–20</small></span><input type="number" min="2" max="20" value={strategy.dcaLevels} onChange={(e) => setStrategy((s) => ({...s,dcaLevels: clamp(Number(e.target.value),2,20)}))}/></label>
            <label><span>Drop between each DCA line <small>% from previous line</small></span><div className={styles.inputSuffix}><input type="number" min="0.1" step="0.1" value={strategy.dcaDropPct} onChange={(e) => setStrategy((s) => ({...s,dcaDropPct: clamp(Number(e.target.value),.1,25)}))}/><i>%</i></div></label>
            <label><span>Maximum allocation <small>per selected asset plan</small></span><div className={styles.inputPrefix}><i>$</i><input type="number" min="100" step="100" value={strategy.maxAllocation} onChange={(e) => setStrategy((s) => ({...s,maxAllocation: Math.max(100,Number(e.target.value))}))}/></div></label>
            <label><span>Allocation model</span><select value={strategy.allocationMode} onChange={(e) => setStrategy((s) => ({...s,allocationMode: e.target.value as Strategy["allocationMode"]}))}><option value="deep">Increase allocation lower</option><option value="equal">Equal allocation</option></select></label>
            <label><span>Minimum buying-zone score</span><div className={styles.inputSuffix}><input type="number" min="35" max="98" value={strategy.minScore} onChange={(e) => setStrategy((s) => ({...s,minScore: clamp(Number(e.target.value),35,98)}))}/><i>/100</i></div></label>
          </article>

          <article className={styles.settingsCard}><div className={styles.cardTitle}><div><p>EXIT LADDER</p><h2>Take-profit settings</h2></div><div className={styles.inlineButtons}><button onClick={removeTp}>−</button><button onClick={addTp}>+</button></div></div>
            <div className={styles.tpEditorHead}><span>TP</span><span>Profit target %</span><span>Sell % of position</span></div>
            <div className={styles.tpEditor}>{strategy.tpTargets.map((target,i) => <div key={i}><b>TP {i+1}</b><div className={styles.inputSuffix}><input type="number" step="0.5" value={target} onChange={(e) => updateTp(i,"target",Number(e.target.value))}/><i>%</i></div><div className={styles.inputSuffix}><input type="number" step="1" value={strategy.tpSellPcts[i] ?? 0} onChange={(e) => updateTp(i,"sell",Number(e.target.value))}/><i>%</i></div></div>)}</div>
            <div className={`${styles.tpTotal} ${Math.abs(tpSellTotal-100) < .01 ? styles.tpOk : styles.tpWarn}`}><span>Total planned sale</span><b>{tpSellTotal.toFixed(0)}%</b></div>
            <p className={styles.helpText}>TP prices are calculated from the projected weighted-average DCA entry. When broker execution is added, the average will update from actual fills.</p>
          </article>
        </div>}

        {tab === "Portfolio" && <article className={styles.portfolioCard}><div className={styles.cardTitle}><div><p>PAPER PORTFOLIO</p><h2>Saved DCA plans</h2></div><span>{paperPlans.length} plans</span></div>
          {paperPlans.length === 0 ? <div className={styles.emptyLarge}><b>No paper positions yet</b><span>Open an opportunity, build its DCA + TP ladder, and create a paper plan.</span><button className={styles.primaryButton} onClick={() => setTab("Radar")}>Open Market Radar</button></div> : <div className={styles.paperList}>{paperPlans.map((p) => <div key={p.id}><span className={styles.assetName}><b>{p.symbol}</b><small>{new Date(p.createdAt).toLocaleString()}</small></span><span><small>Allocation</small><b>{money(p.allocation)}</b></span><span><small>DCA lines</small><b>{p.dcaLevels.length}</b></span><span><small>TP lines</small><b>{p.tpLevels.length}</b></span><button onClick={() => setPaperPlans((prev) => prev.filter((x) => x.id !== p.id))}>Remove</button></div>)}</div>}
        </article>}

        {tab === "Brokers" && <div className={styles.brokerGrid}>
          <article className={styles.brokerCard}><div className={styles.brokerIcon}>B</div><div><p>CRYPTO EXECUTION</p><h2>Binance</h2><span>Spot orders · DCA limit ladder · multi-TP exits</span></div><button disabled>Connect after paper validation</button></article>
          <article className={styles.brokerCard}><div className={styles.brokerIcon}>IB</div><div><p>MULTI-ASSET EXECUTION</p><h2>Interactive Brokers</h2><span>US stocks · ETFs · commodity instruments</span></div><button disabled>Connect after paper validation</button></article>
          <article className={styles.safetyCard}><b>Execution safety gate</b><p>Broker credentials will never be stored in the browser. Live execution will require server-side encrypted credentials, explicit trade permissions, per-asset allocation caps, no-withdrawal API permissions where supported, and a kill switch. Autopilot remains off by default.</p></article>
        </div>}

        <footer className={styles.footer}>Market Agent V1 · Weekly timeframe · FX excluded · Paper trading by default · Not investment advice</footer>
      </section>
    </main>
  );
}
