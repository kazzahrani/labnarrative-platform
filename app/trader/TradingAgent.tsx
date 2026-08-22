"use client";

import { useEffect, useMemo, useState } from "react";
import TradingViewChart from "./TradingViewChart";
import styles from "./trader.module.css";

type Candle = { time: number; open: number; high: number; low: number; close: number; volume: number };
type Zone = {
  low: number;
  high: number;
  center: number;
  distancePct: number;
  score: number;
  type: "Historical bottom" | "Historical top retest" | "Multi-touch support";
  touches: number;
  reactionPct: number;
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
type DeskTab = "Terminal" | "Radar" | "Plans" | "Strategy" | "Brokers";
type SignalMode = "accumulation" | "breakout";
type MarketFilter = "All" | Opportunity["kind"];
type Settings = {
  dcaLevels: number;
  dcaDropPct: number;
  maxAllocation: number;
  allocationMode: "equal" | "deep";
  actionScore: number;
  tpTargets: number[];
  tpSellPcts: number[];
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

const DEFAULT_SETTINGS: Settings = {
  dcaLevels: 10,
  dcaDropPct: 3,
  maxAllocation: 10000,
  allocationMode: "deep",
  actionScore: 70,
  tpTargets: [10, 20, 35, 50, 80],
  tpSellPcts: [10, 15, 20, 25, 30],
};

const MARKET_FILTERS: MarketFilter[] = ["All", "Crypto", "US Stock", "ETF", "Commodity"];
const NAV: DeskTab[] = ["Terminal", "Radar", "Plans", "Strategy", "Brokers"];

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function money(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  const digits = Math.abs(value) >= 1000 ? 0 : Math.abs(value) >= 1 ? 2 : 4;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: digits }).format(value);
}

function pct(value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function tradingViewSymbol(item: Opportunity) {
  if (item.kind === "Crypto") return `BINANCE:${item.symbol}USDT`;
  const mapped: Record<string, string> = {
    AAPL: "NASDAQ:AAPL",
    MSFT: "NASDAQ:MSFT",
    NVDA: "NASDAQ:NVDA",
    AMZN: "NASDAQ:AMZN",
    META: "NASDAQ:META",
    SPY: "AMEX:SPY",
    QQQ: "NASDAQ:QQQ",
    IWM: "AMEX:IWM",
    GOLD: "AMEX:GLD",
    SILVER: "AMEX:SLV",
    OIL: "AMEX:USO",
  };
  return mapped[item.symbol] ?? `NASDAQ:${item.symbol}`;
}

function buildDca(entry: number, settings: Settings) {
  const count = clamp(Math.round(settings.dcaLevels), 2, 20);
  const drop = clamp(settings.dcaDropPct, 0.1, 25) / 100;
  let weights = Array.from({ length: count }, () => 1);
  if (settings.allocationMode === "deep") {
    weights = weights.map((_, index) => 0.65 + (index / Math.max(1, count - 1)) * 0.9);
  }
  const total = weights.reduce((sum, value) => sum + value, 0);
  return weights.map((weight, index) => ({
    level: index + 1,
    price: entry * Math.pow(1 - drop, index),
    allocation: settings.maxAllocation * weight / total,
  }));
}

function buildTps(avgEntry: number, settings: Settings) {
  return settings.tpTargets.map((targetPct, index) => ({
    level: index + 1,
    targetPct,
    price: avgEntry * (1 + targetPct / 100),
    sellPct: settings.tpSellPcts[index] ?? 0,
  }));
}

function statusTone(item: Opportunity, mode: SignalMode) {
  if (mode === "accumulation") {
    if (item.accumulationStatus === "In buying zone") return "good";
    if (item.accumulationStatus === "Approaching") return "warn";
    return "quiet";
  }
  if (item.breakout.status === "Confirmed") return "good";
  if (item.breakout.status === "First close") return "warn";
  return "quiet";
}

function statusText(item: Opportunity, mode: SignalMode) {
  return mode === "accumulation" ? item.accumulationStatus : item.breakout.status;
}

export default function TradingAgent() {
  const [tab, setTab] = useState<DeskTab>("Terminal");
  const [mode, setMode] = useState<SignalMode>("accumulation");
  const [interval, setInterval] = useState<"W" | "M">("W");
  const [marketFilter, setMarketFilter] = useState<MarketFilter>("All");
  const [search, setSearch] = useState("");
  const [selectedSymbol, setSelectedSymbol] = useState("BTC");
  const [radar, setRadar] = useState<RadarResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [paperPlans, setPaperPlans] = useState<PaperPlan[]>([]);
  const [bottomTab, setBottomTab] = useState<"DCA Ladder" | "Take Profit" | "Paper Plans">("DCA Ladder");
  const [notice, setNotice] = useState("");

  const loadRadar = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/trader/radar", { cache: "no-store" });
      if (!response.ok) throw new Error("Radar request failed");
      const data = await response.json() as RadarResponse;
      setRadar(data);
      if (data.opportunities.length && !data.opportunities.some((item) => item.symbol === selectedSymbol)) {
        setSelectedSymbol(data.opportunities[0].symbol);
      }
    } catch {
      setNotice("Market scan could not refresh. Existing data is preserved if available.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const savedSettings = localStorage.getItem("trading-agent-settings-v3");
    const savedPlans = localStorage.getItem("trading-agent-paper-plans-v3");
    if (savedSettings) {
      try { setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(savedSettings) }); } catch {}
    }
    if (savedPlans) {
      try { setPaperPlans(JSON.parse(savedPlans)); } catch {}
    }
    void loadRadar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    localStorage.setItem("trading-agent-settings-v3", JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    localStorage.setItem("trading-agent-paper-plans-v3", JSON.stringify(paperPlans));
  }, [paperPlans]);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    const list = (radar?.opportunities ?? []).filter((item) => {
      const matchesMarket = marketFilter === "All" || item.kind === marketFilter;
      const matchesSearch = !query || item.symbol.toLowerCase().includes(query) || item.label.toLowerCase().includes(query);
      return matchesMarket && matchesSearch;
    });
    return [...list].sort((a, b) => {
      if (mode === "accumulation") {
        const priority = (status: Opportunity["accumulationStatus"]) => status === "In buying zone" ? 200 : status === "Approaching" ? 100 : 0;
        return (b.accumulationScore + priority(b.accumulationStatus)) - (a.accumulationScore + priority(a.accumulationStatus));
      }
      const priority = (status: Breakout["status"]) => status === "Confirmed" ? 200 : status === "First close" ? 100 : 0;
      return (b.breakout.score + priority(b.breakout.status)) - (a.breakout.score + priority(a.breakout.status));
    });
  }, [radar, marketFilter, search, mode]);

  const selected = (radar?.opportunities ?? []).find((item) => item.symbol === selectedSymbol) ?? visible[0] ?? radar?.opportunities?.[0];
  const weekly = selected?.weeklyCandles ?? [];
  const weeklyChange = weekly.length > 1 ? ((weekly.at(-1)!.close - weekly.at(-2)!.close) / weekly.at(-2)!.close) * 100 : 0;
  const selectedScore = selected ? (mode === "accumulation" ? selected.accumulationScore : selected.breakout.score) : 0;
  const selectedStatus = selected ? statusText(selected, mode) : "—";
  const signalReady = selected ? (mode === "accumulation" ? selected.accumulationStatus !== "Watch" : selected.breakout.status === "Confirmed") : false;
  const actionable = Boolean(selected && signalReady && selectedScore >= settings.actionScore);
  const entryAnchor = selected ? (mode === "accumulation"
    ? selected.preferredZoneHigh
    : selected.breakout.confirmationClose ?? selected.breakout.level ?? selected.price) : 0;
  const dca = selected ? buildDca(entryAnchor, settings) : [];
  const weightedAvg = dca.length
    ? dca.reduce((sum, row) => sum + row.price * row.allocation, 0) / dca.reduce((sum, row) => sum + row.allocation, 0)
    : 0;
  const tps = buildTps(weightedAvg, settings);

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
    setPaperPlans((current) => [plan, ...current].slice(0, 50));
    setNotice(`${selected.symbol} paper plan created. No broker order was sent.`);
    setBottomTab("Paper Plans");
  };

  return (
    <main className={styles.appShell}>
      <aside className={styles.rail}>
        <div className={styles.brandMark}>MA</div>
        <nav className={styles.railNav} aria-label="Trading workspace navigation">
          {NAV.map((item) => (
            <button key={item} type="button" className={tab === item ? styles.railActive : ""} onClick={() => setTab(item)}>
              <span>{item === "Terminal" ? "⌁" : item === "Radar" ? "◫" : item === "Plans" ? "≡" : item === "Strategy" ? "◇" : "⛓"}</span>
              <small>{item}</small>
            </button>
          ))}
        </nav>
        <div className={styles.railFooter}><span className={styles.statusDot} />Paper</div>
      </aside>

      <section className={styles.desk}>
        <header className={styles.topbar}>
          <div className={styles.topbarTitle}>
            <strong>Market Agent</strong>
            <span>Personal trading terminal</span>
          </div>
          <div className={styles.topbarActions}>
            <div className={styles.connectionPill}><span className={styles.statusDot} />Market data online</div>
            <div className={styles.modePill}>PAPER MODE</div>
            <button type="button" className={styles.refreshButton} onClick={() => void loadRadar()} disabled={loading}>{loading ? "Scanning…" : "Refresh radar"}</button>
          </div>
        </header>

        {notice && <button type="button" className={styles.notice} onClick={() => setNotice("")}>{notice}<span>×</span></button>}

        {tab === "Terminal" && selected && (
          <>
            <div className={styles.workspace}>
              <aside className={styles.marketPanel}>
                <div className={styles.panelHeader}>
                  <div><strong>Markets</strong><span>{radar?.opportunities.length ?? 0} scanned</span></div>
                  <span className={styles.liveBadge}>LIVE</span>
                </div>
                <label className={styles.searchBox}>
                  <span>⌕</span>
                  <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search symbol" />
                </label>
                <div className={styles.marketFilters}>
                  {MARKET_FILTERS.map((filter) => <button key={filter} type="button" className={marketFilter === filter ? styles.filterActive : ""} onClick={() => setMarketFilter(filter)}>{filter === "US Stock" ? "Stocks" : filter}</button>)}
                </div>
                <div className={styles.marketList}>
                  {visible.map((item) => {
                    const tone = statusTone(item, mode);
                    const score = mode === "accumulation" ? item.accumulationScore : item.breakout.score;
                    return (
                      <button key={item.symbol} type="button" className={`${styles.marketRow} ${selected.symbol === item.symbol ? styles.marketRowActive : ""}`} onClick={() => setSelectedSymbol(item.symbol)}>
                        <div className={styles.marketIdentity}><strong>{item.symbol}</strong><span>{item.label}</span></div>
                        <div className={styles.marketNumbers}><strong>{money(item.price)}</strong><span className={styles[`tone_${tone}`]}>{score}</span></div>
                      </button>
                    );
                  })}
                  {!visible.length && <div className={styles.emptyState}>No markets match this filter.</div>}
                </div>
              </aside>

              <section className={styles.chartPanel}>
                <div className={styles.instrumentBar}>
                  <div className={styles.instrumentIdentity}>
                    <div className={styles.symbolAvatar}>{selected.symbol.slice(0, 2)}</div>
                    <div><div className={styles.symbolLine}><strong>{selected.symbol}</strong><span>{selected.kind}</span></div><small>{selected.label}</small></div>
                  </div>
                  <div className={styles.quoteBlock}><strong>{money(selected.price)}</strong><span className={weeklyChange >= 0 ? styles.positive : styles.negative}>{pct(weeklyChange)} weekly</span></div>
                  <div className={styles.chartTools}>
                    <button type="button" className={interval === "W" ? styles.toolActive : ""} onClick={() => setInterval("W")}>1W</button>
                    <button type="button" className={interval === "M" ? styles.toolActive : ""} onClick={() => setInterval("M")}>1M</button>
                    <span>TradingView</span>
                  </div>
                </div>

                <div className={styles.chartWrap}>
                  <TradingViewChart symbol={tradingViewSymbol(selected)} interval={interval} />
                </div>

                <div className={styles.signalStrip}>
                  <button type="button" className={`${styles.strategyCard} ${mode === "accumulation" ? styles.strategyActive : ""}`} onClick={() => setMode("accumulation")}>
                    <span>STRATEGY 1</span><strong>Accumulation zone</strong><small>Weekly + monthly structure</small>
                    <div><b>{selected.accumulationScore}</b><em>{selected.accumulationStatus}</em></div>
                  </button>
                  <button type="button" className={`${styles.strategyCard} ${mode === "breakout" ? styles.strategyActive : ""}`} onClick={() => setMode("breakout")}>
                    <span>STRATEGY 2</span><strong>Confirmed breakout</strong><small>Trendline / horizontal + second close</small>
                    <div><b>{selected.breakout.score}</b><em>{selected.breakout.status}</em></div>
                  </button>
                  <div className={styles.structureCard}>
                    <span>STRUCTURE</span>
                    {mode === "accumulation" ? (
                      <><strong>{money(selected.preferredZoneLow)} – {money(selected.preferredZoneHigh)}</strong><small>{selected.confluence} weekly/monthly confluence</small></>
                    ) : (
                      <><strong>{selected.breakout.type}</strong><small>Break level {money(selected.breakout.level)}</small></>
                    )}
                  </div>
                </div>
              </section>

              <aside className={styles.tradePanel}>
                <div className={styles.tradeTabs}>
                  <button type="button" className={mode === "accumulation" ? styles.tradeTabActive : ""} onClick={() => setMode("accumulation")}>Accumulation</button>
                  <button type="button" className={mode === "breakout" ? styles.tradeTabActive : ""} onClick={() => setMode("breakout")}>Breakout</button>
                </div>

                <div className={styles.tradeTitle}>
                  <div><span>Signal status</span><strong>{selectedStatus}</strong></div>
                  <div className={`${styles.scoreRing} ${actionable ? styles.scoreReady : ""}`}>{selectedScore}</div>
                </div>

                {mode === "accumulation" ? (
                  <div className={styles.signalFacts}>
                    <div><span>Weekly zone</span><b>{money(selected.weekly.low)} – {money(selected.weekly.high)}</b></div>
                    <div><span>Monthly zone</span><b>{money(selected.monthly.low)} – {money(selected.monthly.high)}</b></div>
                    <div><span>Preferred entry</span><b>{money(entryAnchor)}</b></div>
                    <div><span>Confluence</span><b>{selected.confluence}</b></div>
                  </div>
                ) : (
                  <div className={styles.signalFacts}>
                    <div><span>Break type</span><b>{selected.breakout.type}</b></div>
                    <div><span>Break level</span><b>{money(selected.breakout.level)}</b></div>
                    <div><span>First close</span><b>{money(selected.breakout.firstClose)}</b></div>
                    <div><span>Second close</span><b>{money(selected.breakout.confirmationClose)}</b></div>
                  </div>
                )}

                <div className={styles.formSection}>
                  <div className={styles.sectionLabel}><span>DCA order</span><small>No leverage</small></div>
                  <label><span>Maximum allocation</span><div className={styles.inputAffix}><span>$</span><input type="number" min="100" step="100" value={settings.maxAllocation} onChange={(event) => setSettings((current) => ({ ...current, maxAllocation: clamp(Number(event.target.value) || 0, 100, 10000000) }))} /></div></label>
                  <div className={styles.formGrid}>
                    <label><span>DCA lines</span><input type="number" min="2" max="20" value={settings.dcaLevels} onChange={(event) => setSettings((current) => ({ ...current, dcaLevels: clamp(Number(event.target.value) || 2, 2, 20) }))} /></label>
                    <label><span>Step %</span><input type="number" min="0.1" max="25" step="0.1" value={settings.dcaDropPct} onChange={(event) => setSettings((current) => ({ ...current, dcaDropPct: clamp(Number(event.target.value) || 0.1, 0.1, 25) }))} /></label>
                  </div>
                  <div className={styles.allocationToggle}>
                    <button type="button" className={settings.allocationMode === "equal" ? styles.toggleActive : ""} onClick={() => setSettings((current) => ({ ...current, allocationMode: "equal" }))}>Equal</button>
                    <button type="button" className={settings.allocationMode === "deep" ? styles.toggleActive : ""} onClick={() => setSettings((current) => ({ ...current, allocationMode: "deep" }))}>Deep weighted</button>
                  </div>
                </div>

                <div className={styles.orderSummary}>
                  <div><span>Entry anchor</span><strong>{money(entryAnchor)}</strong></div>
                  <div><span>Projected avg.</span><strong>{money(weightedAvg)}</strong></div>
                  <div><span>Capital</span><strong>{money(settings.maxAllocation)}</strong></div>
                </div>

                {!actionable && <div className={styles.gateWarning}>Signal is below your action gate. You can still create a paper plan for review.</div>}
                <button type="button" className={styles.primaryAction} onClick={savePaperPlan}>Create paper DCA plan</button>
                <button type="button" className={styles.disabledAction} disabled title="Broker execution will be enabled after paper validation">Execute on broker <span>LOCKED</span></button>
              </aside>
            </div>

            <section className={styles.bottomDock}>
              <div className={styles.bottomTabs}>
                {(["DCA Ladder", "Take Profit", "Paper Plans"] as const).map((item) => <button key={item} type="button" className={bottomTab === item ? styles.bottomTabActive : ""} onClick={() => setBottomTab(item)}>{item}{item === "Paper Plans" && paperPlans.length ? <span>{paperPlans.length}</span> : null}</button>)}
              </div>
              {bottomTab === "DCA Ladder" && (
                <div className={styles.tableWrap}><table><thead><tr><th>Line</th><th>Limit price</th><th>Distance</th><th>Allocation</th><th>Status</th></tr></thead><tbody>{dca.map((row) => <tr key={row.level}><td>DCA {row.level}</td><td>{money(row.price)}</td><td>{row.level === 1 ? "Anchor" : `-${((1 - row.price / entryAnchor) * 100).toFixed(1)}%`}</td><td>{money(row.allocation)}</td><td><span className={styles.pendingTag}>Planned</span></td></tr>)}</tbody></table></div>
              )}
              {bottomTab === "Take Profit" && (
                <div className={styles.tableWrap}><table><thead><tr><th>Target</th><th>Gain</th><th>Price</th><th>Sell share</th></tr></thead><tbody>{tps.map((row) => <tr key={row.level}><td>TP {row.level}</td><td>+{row.targetPct}%</td><td>{money(row.price)}</td><td>{row.sellPct}%</td></tr>)}</tbody></table></div>
              )}
              {bottomTab === "Paper Plans" && (
                <div className={styles.tableWrap}>{paperPlans.length ? <table><thead><tr><th>Asset</th><th>Strategy</th><th>Entry</th><th>Allocation</th><th>Created</th></tr></thead><tbody>{paperPlans.map((plan) => <tr key={plan.id}><td><strong>{plan.symbol}</strong> · {plan.label}</td><td>{plan.strategy}</td><td>{money(plan.entry)}</td><td>{money(plan.allocation)}</td><td>{new Date(plan.createdAt).toLocaleString()}</td></tr>)}</tbody></table> : <div className={styles.emptyState}>No paper plans yet.</div>}</div>
              )}
            </section>
          </>
        )}

        {tab === "Radar" && (
          <section className={styles.pagePanel}>
            <div className={styles.pageHeading}><div><span>ALL MARKETS</span><h1>Opportunity Radar</h1><p>Every scanned asset remains visible. Scores rank signals; they do not hide the universe.</p></div><button type="button" className={styles.refreshButton} onClick={() => void loadRadar()}>Refresh</button></div>
            <div className={styles.tableWrap}><table><thead><tr><th>Asset</th><th>Market</th><th>Price</th><th>Accumulation</th><th>Weekly zone</th><th>Monthly zone</th><th>Breakout</th><th>Break score</th></tr></thead><tbody>{(radar?.opportunities ?? []).map((item) => <tr key={item.symbol} onClick={() => { setSelectedSymbol(item.symbol); setTab("Terminal"); }} className={styles.clickRow}><td><strong>{item.symbol}</strong><br/><small>{item.label}</small></td><td>{item.kind}</td><td>{money(item.price)}</td><td>{item.accumulationScore} · {item.accumulationStatus}</td><td>{money(item.weekly.low)} – {money(item.weekly.high)}</td><td>{money(item.monthly.low)} – {money(item.monthly.high)}</td><td>{item.breakout.type} · {item.breakout.status}</td><td>{item.breakout.score}</td></tr>)}</tbody></table></div>
          </section>
        )}

        {tab === "Plans" && (
          <section className={styles.pagePanel}>
            <div className={styles.pageHeading}><div><span>PAPER EXECUTION</span><h1>DCA Plans</h1><p>Saved plans remain local to this browser while broker execution is disabled.</p></div></div>
            <div className={styles.tableWrap}>{paperPlans.length ? <table><thead><tr><th>Asset</th><th>Strategy</th><th>Entry</th><th>Allocation</th><th>DCA lines</th><th>Created</th></tr></thead><tbody>{paperPlans.map((plan) => <tr key={plan.id}><td><strong>{plan.symbol}</strong> · {plan.label}</td><td>{plan.strategy}</td><td>{money(plan.entry)}</td><td>{money(plan.allocation)}</td><td>{plan.dcaLevels.length}</td><td>{new Date(plan.createdAt).toLocaleString()}</td></tr>)}</tbody></table> : <div className={styles.emptyState}>Create a plan from the Terminal.</div>}</div>
          </section>
        )}

        {tab === "Strategy" && (
          <section className={styles.pagePanel}>
            <div className={styles.pageHeading}><div><span>RISK & EXECUTION</span><h1>Strategy settings</h1><p>These settings control the DCA ladder and the minimum score used by the action gate.</p></div></div>
            <div className={styles.settingsGrid}>
              <label><span>Action score</span><input type="number" min="1" max="100" value={settings.actionScore} onChange={(event) => setSettings((current) => ({ ...current, actionScore: clamp(Number(event.target.value) || 1, 1, 100) }))} /><small>Signals below this score stay review-only.</small></label>
              <label><span>DCA lines</span><input type="number" min="2" max="20" value={settings.dcaLevels} onChange={(event) => setSettings((current) => ({ ...current, dcaLevels: clamp(Number(event.target.value) || 2, 2, 20) }))} /><small>Default is your preferred 10-line ladder.</small></label>
              <label><span>DCA step</span><input type="number" min="0.1" max="25" step="0.1" value={settings.dcaDropPct} onChange={(event) => setSettings((current) => ({ ...current, dcaDropPct: clamp(Number(event.target.value) || 0.1, 0.1, 25) }))} /><small>Percentage spacing between successive buys.</small></label>
              <label><span>Maximum allocation</span><input type="number" min="100" step="100" value={settings.maxAllocation} onChange={(event) => setSettings((current) => ({ ...current, maxAllocation: clamp(Number(event.target.value) || 100, 100, 10000000) }))} /><small>Per-plan capital ceiling.</small></label>
            </div>
          </section>
        )}

        {tab === "Brokers" && (
          <section className={styles.pagePanel}>
            <div className={styles.pageHeading}><div><span>CONNECTIONS</span><h1>Brokers & exchanges</h1><p>Connection UX is prepared, but real order execution stays locked during strategy validation.</p></div></div>
            <div className={styles.brokerGrid}>
              <div><span>CRYPTO</span><strong>Binance</strong><p>Market data available. Trading permission not connected.</p><button type="button" disabled>Connect after paper validation</button></div>
              <div><span>MULTI-ASSET</span><strong>Interactive Brokers</strong><p>Planned for stocks, ETFs, futures and FX execution.</p><button type="button" disabled>Connect after paper validation</button></div>
            </div>
          </section>
        )}
      </section>
    </main>
  );
}
