"use client";

import { useEffect, useMemo, useState } from "react";
import TradingViewChart from "./TradingViewChart";
import styles from "./trader.module.css";

type Section = "Dashboard" | "My Portfolio" | "Smart Trades" | "DCA bots";
type SmartView = "list" | "create";
type DcaView = "list" | "create";
type SmartTab = "Active" | "History";
type SmartMode = "Buy/Sell" | "SmartTrade" | "Smart Cover";
type ChartInterval = "1" | "5" | "15" | "60" | "240" | "D" | "W" | "M";
type Market = { symbol: string; label: string; price: number | null };
type RadarResponse = { opportunities?: Array<{ symbol: string; label: string; kind: string; price: number }> };
type TakeProfit = { target: number; share: number };
type SmartTrade = {
  id: string;
  pair: string;
  side: "Buy" | "Sell";
  orderType: "Market" | "Limit";
  entryPrice: number;
  amount: number;
  takeProfits: TakeProfit[];
  stopEnabled: boolean;
  stopPct: number;
  status: "Active" | "Closed";
  createdAt: string;
};
type DcaBot = {
  id: string;
  name: string;
  pair: string;
  baseOrder: number;
  safetyOrder: number;
  maxSafetyOrders: number;
  deviation: number;
  stepScale: number;
  volumeScale: number;
  takeProfit: number;
  stopEnabled: boolean;
  stopPct: number;
  startCondition: string;
  status: "Running" | "Stopped";
  createdAt: string;
};

const NAV: Section[] = ["Dashboard", "My Portfolio", "DCA bots", "Smart Trades"];
const FALLBACK_MARKETS: Market[] = [
  { symbol: "BTC", label: "Bitcoin", price: null },
  { symbol: "ETH", label: "Ethereum", price: null },
  { symbol: "SOL", label: "Solana", price: null },
  { symbol: "BNB", label: "BNB", price: null },
];
const INTERVALS: ChartInterval[] = ["1", "5", "15", "60", "240", "D", "W", "M"];
const DEMO_BALANCE = 100000;

function money(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  const digits = Math.abs(value) >= 1000 ? 0 : Math.abs(value) >= 1 ? 2 : 5;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: digits }).format(value);
}
function compactMoney(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
}
function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)); }
function tvSymbol(symbol: string) { return `BINANCE:${symbol}USDT`; }
function pct(value: number) { return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`; }
function navGlyph(section: Section) {
  if (section === "Dashboard") return "⌘";
  if (section === "My Portfolio") return "◔";
  if (section === "DCA bots") return "▣";
  return "↕";
}

export default function TradingAgent() {
  const [section, setSection] = useState<Section>("Dashboard");
  const [smartView, setSmartView] = useState<SmartView>("list");
  const [dcaView, setDcaView] = useState<DcaView>("list");
  const [smartTab, setSmartTab] = useState<SmartTab>("Active");
  const [smartMode, setSmartMode] = useState<SmartMode>("SmartTrade");
  const [markets, setMarkets] = useState<Market[]>(FALLBACK_MARKETS);
  const [selectedSymbol, setSelectedSymbol] = useState("BTC");
  const [interval, setInterval] = useState<ChartInterval>("D");
  const [smartTrades, setSmartTrades] = useState<SmartTrade[]>([]);
  const [dcaBots, setDcaBots] = useState<DcaBot[]>([]);
  const [notice, setNotice] = useState("");
  const [globalSearch, setGlobalSearch] = useState("");
  const [smartSearch, setSmartSearch] = useState("");
  const [smartPairFilter, setSmartPairFilter] = useState("All");
  const [showSmartChart, setShowSmartChart] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [signalsOn, setSignalsOn] = useState(false);
  const [terminalOn, setTerminalOn] = useState(true);
  const [positionsOn, setPositionsOn] = useState(true);

  const [smartSide, setSmartSide] = useState<"Buy" | "Sell">("Buy");
  const [smartOrderType, setSmartOrderType] = useState<"Market" | "Limit">("Market");
  const [smartUnits, setSmartUnits] = useState(0);
  const [smartPrice, setSmartPrice] = useState(0);
  const [smartTps, setSmartTps] = useState<TakeProfit[]>([{ target: 10, share: 100 }]);
  const [tpEnabled, setTpEnabled] = useState(true);
  const [tpOrderType, setTpOrderType] = useState<"Limit" | "Market">("Limit");
  const [trailingTp, setTrailingTp] = useState(false);
  const [trailingTpDeviation, setTrailingTpDeviation] = useState(5);
  const [smartStopEnabled, setSmartStopEnabled] = useState(true);
  const [smartStopPct, setSmartStopPct] = useState(5);
  const [stopOrderType, setStopOrderType] = useState<"Cond. Limit" | "Cond. Market">("Cond. Market");
  const [stopTimeout, setStopTimeout] = useState(false);
  const [stopTimeoutSec, setStopTimeoutSec] = useState(300);
  const [trailingStop, setTrailingStop] = useState(false);
  const [breakeven, setBreakeven] = useState(false);
  const [trailingBuy, setTrailingBuy] = useState(false);
  const [trailingBuyPct, setTrailingBuyPct] = useState(1);

  const [botName, setBotName] = useState("My DCA Bot");
  const [baseOrder, setBaseOrder] = useState(100);
  const [safetyOrder, setSafetyOrder] = useState(100);
  const [maxSafetyOrders, setMaxSafetyOrders] = useState(5);
  const [deviation, setDeviation] = useState(1);
  const [stepScale, setStepScale] = useState(1);
  const [volumeScale, setVolumeScale] = useState(1);
  const [botTakeProfit, setBotTakeProfit] = useState(1.5);
  const [botStopEnabled, setBotStopEnabled] = useState(false);
  const [botStopPct, setBotStopPct] = useState(8);
  const [startCondition, setStartCondition] = useState("Immediately");

  useEffect(() => {
    try {
      const savedSmart = localStorage.getItem("labnarrative-smart-trades-v1");
      const savedBots = localStorage.getItem("labnarrative-dca-bots-v1");
      if (savedSmart) setSmartTrades(JSON.parse(savedSmart));
      if (savedBots) setDcaBots(JSON.parse(savedBots));
    } catch {}
    const loadMarkets = async () => {
      try {
        const response = await fetch("/api/trader/radar", { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json() as RadarResponse;
        const crypto = (data.opportunities ?? []).filter((item) => item.kind === "Crypto").map((item) => ({ symbol: item.symbol, label: item.label, price: item.price }));
        if (crypto.length) setMarkets(crypto);
      } catch {}
    };
    void loadMarkets();
  }, []);
  useEffect(() => { localStorage.setItem("labnarrative-smart-trades-v1", JSON.stringify(smartTrades)); }, [smartTrades]);
  useEffect(() => { localStorage.setItem("labnarrative-dca-bots-v1", JSON.stringify(dcaBots)); }, [dcaBots]);

  const selectedMarket = markets.find((item) => item.symbol === selectedSymbol) ?? markets[0] ?? FALLBACK_MARKETS[0];
  const selectedPrice = selectedMarket?.price ?? null;
  useEffect(() => {
    if (selectedPrice && (smartOrderType === "Market" || smartPrice === 0)) setSmartPrice(selectedPrice);
  }, [selectedPrice, smartOrderType, selectedSymbol, smartPrice]);

  const activeSmart = smartTrades.filter((trade) => trade.status === "Active");
  const closedSmart = smartTrades.filter((trade) => trade.status === "Closed");
  const runningBots = dcaBots.filter((bot) => bot.status === "Running");
  const effectiveEntry = smartOrderType === "Market" ? (selectedPrice ?? smartPrice) : (smartPrice || selectedPrice || 0);
  const orderTotal = smartUnits * Math.max(effectiveEntry || 0, 0);
  const minUnits = selectedSymbol === "BTC" ? 0.00015 : selectedSymbol === "ETH" ? 0.0001 : 0.001;
  const unitsTooSmall = smartUnits > 0 && smartUnits < minUnits;
  const tpPrice = effectiveEntry ? effectiveEntry * (1 + (smartTps[0]?.target ?? 0) / 100) : 0;
  const stopPrice = effectiveEntry ? effectiveEntry * (1 - smartStopPct / 100) : 0;

  const dcaPreview = useMemo(() => {
    const anchor = selectedPrice ?? 0;
    let cumulativeDeviation = 0;
    let nextStep = deviation;
    return Array.from({ length: clamp(Math.round(maxSafetyOrders), 1, 20) }, (_, index) => {
      cumulativeDeviation += nextStep;
      const orderAmount = safetyOrder * Math.pow(volumeScale, index);
      const price = anchor > 0 ? anchor * (1 - cumulativeDeviation / 100) : 0;
      const row = { index: index + 1, deviation: cumulativeDeviation, price, amount: orderAmount };
      nextStep *= stepScale;
      return row;
    });
  }, [selectedPrice, deviation, maxSafetyOrders, safetyOrder, stepScale, volumeScale]);
  const dcaTotal = baseOrder + dcaPreview.reduce((sum, row) => sum + row.amount, 0);

  const paperCapital = activeSmart.reduce((sum, trade) => sum + trade.amount, 0) + runningBots.reduce((sum, bot) => {
    const safetyTotal = Array.from({ length: bot.maxSafetyOrders }, (_, index) => bot.safetyOrder * Math.pow(bot.volumeScale, index)).reduce((a, b) => a + b, 0);
    return sum + bot.baseOrder + safetyTotal;
  }, 0);
  const smartUnrealized = activeSmart.reduce((sum, trade) => {
    const symbol = trade.pair.split("/")[0];
    const current = markets.find((market) => market.symbol === symbol)?.price;
    if (!current || !trade.entryPrice) return sum;
    const move = (current - trade.entryPrice) / trade.entryPrice;
    return sum + move * trade.amount * (trade.side === "Buy" ? 1 : -1);
  }, 0);
  const accountValue = DEMO_BALANCE + smartUnrealized;
  const dayChangePct = smartUnrealized / DEMO_BALANCE * 100;
  const freeCapital = Math.max(0, DEMO_BALANCE - paperCapital);

  const smartRows = useMemo(() => {
    const source = smartTab === "Active" ? activeSmart : closedSmart;
    const query = smartSearch.trim().toLowerCase();
    return source.filter((trade) => {
      const pairMatch = smartPairFilter === "All" || trade.pair === smartPairFilter;
      return pairMatch && (!query || trade.pair.toLowerCase().includes(query) || trade.id.toLowerCase().includes(query));
    });
  }, [smartTab, activeSmart, closedSmart, smartSearch, smartPairFilter]);

  const openSection = (next: Section) => {
    setSection(next);
    if (next !== "Smart Trades") setSmartView("list");
    if (next !== "DCA bots") setDcaView("list");
  };
  const setMode = (mode: SmartMode) => {
    setSmartMode(mode);
    if (mode === "Smart Cover") setSmartSide("Sell");
    if (mode === "SmartTrade") setSmartSide("Buy");
  };
  const setPercentOfBalance = (value: number) => {
    const price = effectiveEntry || selectedPrice || 0;
    if (price > 0) setSmartUnits((DEMO_BALANCE * value / 100) / price);
  };
  const createSmartTrade = (forcedSide?: "Buy" | "Sell") => {
    const entry = effectiveEntry;
    const side = forcedSide ?? smartSide;
    const total = smartUnits * entry;
    if (!entry || smartUnits <= 0 || total <= 0) { setNotice("Add a valid unit amount and price before creating the paper order."); return; }
    if (smartUnits < minUnits) { setNotice(`Minimum paper order is ${minUnits} ${selectedSymbol}.`); return; }
    if (tpEnabled) {
      const totalShares = smartTps.reduce((sum, tp) => sum + tp.share, 0);
      if (Math.abs(totalShares - 100) > 0.01) { setNotice("Take-profit target shares must total 100%."); return; }
    }
    const trade: SmartTrade = {
      id: `st-${Date.now()}`,
      pair: `${selectedSymbol}/USDT`, side, orderType: smartOrderType, entryPrice: entry, amount: total,
      takeProfits: tpEnabled ? smartTps : [], stopEnabled: smartStopEnabled, stopPct: smartStopPct,
      status: "Active", createdAt: new Date().toISOString(),
    };
    setSmartTrades((current) => [trade, ...current]);
    setSmartTab("Active");
    setNotice(`${trade.pair} ${side} order created in paper mode.`);
  };
  const createDcaBot = () => {
    if (!botName.trim() || baseOrder <= 0 || safetyOrder <= 0) { setNotice("Add a bot name and valid order amounts."); return; }
    const bot: DcaBot = {
      id: `bot-${Date.now()}`, name: botName.trim(), pair: `${selectedSymbol}/USDT`, baseOrder, safetyOrder,
      maxSafetyOrders, deviation, stepScale, volumeScale, takeProfit: botTakeProfit, stopEnabled: botStopEnabled,
      stopPct: botStopPct, startCondition, status: "Running", createdAt: new Date().toISOString(),
    };
    setDcaBots((current) => [bot, ...current]);
    setDcaView("list");
    setNotice(`${bot.name} created and running in paper mode.`);
  };
  const handleGlobalSearch = (value: string) => {
    setGlobalSearch(value);
    const normalized = value.trim().toLowerCase();
    const sectionMatch = NAV.find((item) => item.toLowerCase().includes(normalized));
    if (normalized.length >= 3 && sectionMatch) setSection(sectionMatch);
    const marketMatch = markets.find((item) => item.symbol.toLowerCase() === normalized || item.label.toLowerCase().includes(normalized));
    if (marketMatch) setSelectedSymbol(marketMatch.symbol);
  };

  const Toggle = ({ checked, onChange }: { checked: boolean; onChange: (next: boolean) => void }) => (
    <button type="button" aria-pressed={checked} className={`${styles.toggle} ${checked ? styles.toggleOn : ""}`} onClick={() => onChange(!checked)}><i/></button>
  );
  const BalanceChart = () => (
    <svg viewBox="0 0 720 230" className={styles.balanceChart} aria-label="Paper account balance chart">
      <line x1="42" y1="36" x2="700" y2="36"/><line x1="42" y1="92" x2="700" y2="92"/><line x1="42" y1="148" x2="700" y2="148"/><line x1="42" y1="204" x2="700" y2="204"/>
      <path className={styles.balanceArea} d="M42 178 C100 176 135 175 185 172 S260 178 315 164 S385 137 425 118 S493 100 545 80 S620 67 700 58 L700 204 L42 204 Z"/>
      <path className={styles.balanceLine} d="M42 178 C100 176 135 175 185 172 S260 178 315 164 S385 137 425 118 S493 100 545 80 S620 67 700 58"/>
    </svg>
  );

  const OrdersTable = ({ compact = false }: { compact?: boolean }) => (
    <section className={`${styles.ordersArea} ${compact ? styles.ordersAreaCompact : ""}`}>
      <button className={styles.openOrdersBar}><strong>You have {activeSmart.length} open {activeSmart.length === 1 ? "order" : "orders"}</strong><span>⌄</span></button>
      <div className={styles.ordersTabs}><button className={smartTab === "Active" ? styles.ordersTabActive : ""} onClick={() => setSmartTab("Active")}>Active</button><button className={smartTab === "History" ? styles.ordersTabActive : ""} onClick={() => setSmartTab("History")}>History</button><button>Presets <span className={styles.helpDot}>?</span></button></div>
      <div className={styles.filterHeader}><strong>Filters</strong><div><button onClick={() => { setSmartSearch(""); setSmartPairFilter("All"); }}>⚑ Clear filters</button><button onClick={() => setShowFilters((v) => !v)}>{showFilters ? "⌃" : "⌄"}</button></div></div>
      {showFilters && <div className={styles.filtersGrid}>
        <label><span>Pair</span><select value={smartPairFilter} onChange={(e) => setSmartPairFilter(e.target.value)}><option>All</option>{markets.map((market) => <option key={market.symbol}>{market.symbol}/USDT</option>)}</select></label>
        <label><span>Search</span><input value={smartSearch} onChange={(e) => setSmartSearch(e.target.value)} placeholder="Pair or trade ID"/></label>
        <label><span>Account</span><div className={styles.fakeSelect}>Paper Account 1001863 <i>⌄</i></div></label>
      </div>}
      <div className={styles.smartTableWrap}><table><thead><tr><th>Pair ↕</th><th>Creation date ↓</th><th>Volume</th><th>Status ↕</th><th>Profit/Loss ↕</th><th>Source</th><th>Actions</th></tr></thead><tbody>
        {smartRows.length ? smartRows.map((trade) => {
          const symbol = trade.pair.split("/")[0];
          const current = markets.find((m) => m.symbol === symbol)?.price ?? trade.entryPrice;
          const move = trade.entryPrice ? (current - trade.entryPrice) / trade.entryPrice : 0;
          const pnl = move * trade.amount * (trade.side === "Buy" ? 1 : -1);
          return <tr key={trade.id}>
            <td><div className={styles.pairCell}><span className={styles.coinMini}>{symbol.slice(0,1)}</span><div><strong>{trade.pair}</strong><small>◆ Paper Account 1001863</small><em>▧ Note for SmartTrade</em></div></div></td>
            <td>{new Date(trade.createdAt).toLocaleDateString()}<small>{new Date(trade.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small><small>ID: {trade.id.replace("st-", "")}</small></td>
            <td><small>Current Position:</small><strong>{(trade.amount / Math.max(current, 1)).toFixed(6)} {symbol}</strong><small>{compactMoney(trade.amount)}</small></td>
            <td><div className={styles.progressLine}><i style={{ width: trade.status === "Active" ? "82%" : "100%" }}/></div><small>{trade.side} {money(trade.entryPrice)}</small></td>
            <td><strong className={pnl >= 0 ? styles.greenText : styles.redText}>{compactMoney(pnl)}</strong><small className={pnl >= 0 ? styles.greenText : styles.redText}>{pct(move * 100)}</small></td>
            <td>—</td>
            <td><div className={styles.rowActions}>{trade.status === "Active" && <button onClick={() => setSmartTrades((items) => items.map((item) => item.id === trade.id ? { ...item, status: "Closed" } : item))}>↻</button>}<button>✎</button><button>⋮</button></div></td>
          </tr>;
        }) : <tr className={styles.emptyRow}><td colSpan={7}>No {smartTab.toLowerCase()} SmartTrades yet.</td></tr>}
      </tbody></table></div>
    </section>
  );

  const dashboard = (
    <div className={styles.pageContent}>
      <div className={styles.pageHeading}><h1>Dashboard</h1></div>
      <div className={styles.moduleCards}>
        <section className={styles.moduleCard}><div className={styles.moduleTitle}><h3>DCA Bots</h3><button onClick={() => { setSection("DCA bots"); setDcaView("create"); }}>Create</button></div><div className={styles.moduleLine}><span>Active Bots</span><b>{runningBots.length}</b></div><div className={styles.moduleLine}><span>Today PnL</span><b>$0.00</b></div><div className={styles.moduleLine}><span>PnL</span><b className={styles.greenText}>$0.00</b></div></section>
        <section className={styles.moduleCard}><div className={styles.moduleTitle}><h3>SmartTrades</h3><button onClick={() => { setSection("Smart Trades"); setSmartView("create"); }}>Create</button></div><div className={styles.moduleLine}><span>Active ST</span><b>{activeSmart.length}</b></div><div className={styles.moduleLine}><span>Today PnL</span><b>{compactMoney(smartUnrealized)}</b></div><div className={styles.moduleLine}><span>PnL</span><b className={smartUnrealized >= 0 ? styles.greenText : styles.redText}>{compactMoney(smartUnrealized)}</b></div></section>
        <section className={styles.moduleCard}><div className={styles.moduleTitle}><h3>My Portfolio</h3><button onClick={() => setSection("My Portfolio")}>Open</button></div><div className={styles.moduleLine}><span>Balance</span><b>{compactMoney(accountValue)}</b></div><div className={styles.moduleLine}><span>In strategies</span><b>{compactMoney(paperCapital)}</b></div><div className={styles.moduleLine}><span>Free</span><b>{compactMoney(freeCapital)}</b></div></section>
        <section className={styles.moduleCard}><div className={styles.moduleTitle}><h3>Exchange</h3><button onClick={() => setNotice("Binance API connection comes after the paper-trading build is complete.")}>Connect</button></div><p className={styles.moduleDescription}>Paper Binance Spot account. Live execution remains disabled until API credentials are connected.</p></section>
      </div>
      <section className={styles.accountBanner}><span>ⓘ</span><div><strong>Paper account is active</strong><p>Build and test SmartTrades and DCA bots without sending real orders.</p></div><button onClick={() => setNotice("Binance API connection is the next integration layer.")}>Connect Binance</button></section>
      <section className={`${styles.card} ${styles.totalBalanceCard}`}><div className={styles.cardHeader}><h2>Total balance</h2><span>↻</span></div><div className={styles.totalBalanceBody}><div className={styles.balanceDonut}><div><span>Assets</span><b>{Math.max(1, new Set(activeSmart.map((t) => t.pair)).size + 1)}</b></div></div><div className={styles.balanceNumbers}><span>Total / Change 24 hr</span><strong>{compactMoney(accountValue)}</strong><em className={dayChangePct >= 0 ? styles.greenText : styles.redText}>{pct(dayChangePct)}</em></div><BalanceChart/></div></section>
    </div>
  );

  const portfolio = (
    <div className={styles.pageContent}>
      <div className={styles.pageHeading}><div><span className={styles.eyebrow}>MY PORTFOLIO</span><h1>My Demo account</h1></div><button className={styles.primaryButton} onClick={() => setNotice("Real exchange connection will be enabled after paper mode validation.")}>Connect a new account</button></div>
      <section className={`${styles.card} ${styles.statisticsCard}`}><div className={styles.cardHeader}><h2>Statistics</h2><span>↻</span></div><div className={styles.statisticsBody}><div className={styles.portfolioRing}><div><span>Demo</span><b>1</b></div></div><div className={styles.balanceNumbers}><span>Total / Change 24 hr</span><strong>{compactMoney(accountValue)}</strong><em className={dayChangePct >= 0 ? styles.greenText : styles.redText}>{pct(dayChangePct)}</em><small>Capital in strategies: {compactMoney(paperCapital)}</small></div><BalanceChart/></div></section>
      <div className={styles.exchangeDivider}>EXCHANGES</div>
      <section className={styles.exchangeCard}><div className={styles.exchangeCardHead}><span className={styles.exchangeIcon}>◆</span><div><h3>Paper Account 1001863</h3><p>Binance Spot account simulator</p></div><button>↻</button></div><div className={styles.allocationBar}><i style={{ width: `${Math.min(100, freeCapital / DEMO_BALANCE * 100)}%` }}/></div><div className={styles.exchangeStats}><div><span>Total</span><b>{compactMoney(accountValue)}</b></div><div><span>24 hr change</span><b className={dayChangePct >= 0 ? styles.greenText : styles.redText}>{pct(dayChangePct)}</b></div><div><span>Available</span><b>{compactMoney(freeCapital)}</b></div></div><button className={styles.tradeAccountButton} onClick={() => { setSection("Smart Trades"); setSmartView("create"); }}>Trade</button></section>
    </div>
  );

  const smartList = (
    <div className={styles.pageContent}>
      <div className={styles.pageHeading}><div><span className={styles.eyebrow}>SMARTTRADE</span><h1>SmartTrades</h1></div><button className={styles.primaryButton} onClick={() => setSmartView("create")}>＋ Create SmartTrade</button></div>
      <OrdersTable/>
    </div>
  );

  const ModeTabs = () => <div className={styles.smartModeTabs}><button className={smartMode === "Buy/Sell" ? styles.smartModeActive : ""} onClick={() => setMode("Buy/Sell")}>Buy/Sell</button><button className={smartMode === "SmartTrade" ? styles.smartModeActive : ""} onClick={() => setMode("SmartTrade")}>SmartTrade ↑</button><button className={smartMode === "Smart Cover" ? styles.smartCoverActive : ""} onClick={() => setMode("Smart Cover")}>Smart Cover ↓</button></div>;

  const UtilityBar = () => <div className={styles.smartToggleBar}><div><label>TradingView <Toggle checked={showSmartChart} onChange={setShowSmartChart}/></label><label>Signals <Toggle checked={signalsOn} onChange={setSignalsOn}/></label><label>Trade terminal <Toggle checked={terminalOn} onChange={setTerminalOn}/></label><label>Orders and positions <Toggle checked={positionsOn} onChange={setPositionsOn}/></label></div><button>Tutorial</button></div>;

  const Selectors = () => <div className={styles.marketSelectors}><label><span>Exchange</span><div className={styles.fakeSelect}><b>◆</b> Paper Account 1001863 | Binance Spot account <small>{compactMoney(accountValue)}</small><i>⌄</i></div></label><label><span>Market</span><div className={styles.fakeSelect}><b className={styles.coinOrange}>●</b> USDT <small>0 USDT</small><i>⌄</i></div></label><label><span>Trading Pair</span><select value={selectedSymbol} onChange={(e) => { setSelectedSymbol(e.target.value); setSmartUnits(0); }}>{markets.map((market) => <option key={market.symbol} value={market.symbol}>☆ {market.symbol}/USDT</option>)}</select></label></div>;

  const Validation = ({ text }: { text?: string }) => <p className={styles.validation}>⊗ {text ?? `Trade does not meet minimum requirements: ${minUnits} ${selectedSymbol}`}</p>;
  const PercentButtons = () => <div className={styles.percentButtons}>{[5,10,25,50,100].map((v) => <button key={v} onClick={() => setPercentOfBalance(v)}>{v}%</button>)}</div>;

  const BuySellPanel = ({ side }: { side: "Buy" | "Sell" }) => {
    const isBuy = side === "Buy";
    return <section className={styles.quickTradePanel}>
      <div className={styles.smartPanelHead}><h2>{side}</h2><span>▱ {isBuy ? `0.00000000 ${selectedSymbol}` : `${(DEMO_BALANCE / Math.max(selectedPrice ?? 1, 1)).toFixed(8)} ${selectedSymbol}`}</span></div>
      <label className={styles.field}><span>Units</span><div className={`${styles.inputUnit} ${smartUnits < minUnits ? styles.inputError : ""}`}><input type="number" min="0" step="0.000001" value={smartUnits} onChange={(e) => setSmartUnits(Math.max(0, Number(e.target.value)))}/><b>{selectedSymbol}</b></div></label>
      {smartUnits < minUnits && <Validation/>}
      <div className={styles.orderChoice}><button className={smartOrderType === "Limit" ? styles.choiceActive : ""} onClick={() => setSmartOrderType("Limit")}>Limit</button><button className={smartOrderType === "Market" ? styles.choiceActive : ""} onClick={() => setSmartOrderType("Market")}>Market</button></div>
      <label className={styles.field}><span>Price</span><div className={styles.inputUnit}><input type="number" disabled={smartOrderType === "Market"} value={effectiveEntry || 0} onChange={(e) => setSmartPrice(Number(e.target.value))}/><b>USDT</b></div></label>
      <div className={`${styles.inputUnit} ${smartUnits < minUnits ? styles.inputError : ""}`}><input readOnly value={orderTotal.toFixed(8)}/><b>USDT</b></div>
      {smartUnits < minUnits && <Validation text={`Trade does not meet minimum requirements: ${money((selectedPrice ?? 0) * minUnits)}`}/>}<PercentButtons/>
      <button className={styles.quickTradeAction} onClick={() => createSmartTrade(side)}>Create paper {side.toLowerCase()} order</button>
    </section>;
  };

  const SmartBuilder = () => <div className={styles.smartBuilderColumns}>
    <div className={styles.builderStack}>
      <section className={styles.smartPanel}>
        <div className={styles.smartPanelHead}><h2>Units</h2><span>▱ 0.00000000 {selectedSymbol} <b className={styles.helpDot}>?</b></span></div>
        <div className={styles.assetToggle}><span>Use Existing Assets <b className={styles.helpDot}>?</b></span><Toggle checked={false} onChange={() => setNotice("Existing-asset mode will activate with a connected exchange balance.")}/></div>
        <div className={`${styles.inputUnit} ${smartUnits < minUnits ? styles.inputError : ""}`}><input type="number" min="0" step="0.000001" value={smartUnits} onChange={(e) => setSmartUnits(Math.max(0, Number(e.target.value)))}/><b>{selectedSymbol}</b></div>
        {smartUnits < minUnits && <Validation/>}
      </section>
      <section className={styles.smartPanel}>
        <div className={styles.smartPanelHead}><h2>{smartMode === "Smart Cover" ? "Sell Price" : "Buy Price"}</h2></div>
        <div className={styles.orderChoice}><button className={smartOrderType === "Limit" ? styles.choiceActive : ""} onClick={() => setSmartOrderType("Limit")}>Limit</button><button className={smartOrderType === "Market" ? styles.choiceActive : ""} onClick={() => setSmartOrderType("Market")}>Market</button><button>Cond.</button></div>
        <p className={styles.helperText}>{smartOrderType === "Market" ? `Will ${smartSide.toLowerCase()} at actual rates after the trade is created` : "The order waits at the specified limit price"}</p>
        <div className={styles.inputUnit}><input type="number" step="0.01" disabled={smartOrderType === "Market"} value={effectiveEntry || 0} onChange={(e) => setSmartPrice(Number(e.target.value))}/><b>USDT</b></div>
        <p className={styles.bidAsk}><b>Bid:</b> {money(selectedPrice)} <b>Ask:</b> {money(selectedPrice)}</p>
        <div className={styles.inlineToggle}><span>Trailing {smartMode === "Smart Cover" ? "sell" : "buy"} <b className={styles.helpDot}>?</b></span><Toggle checked={trailingBuy} onChange={setTrailingBuy}/></div>
        {trailingBuy && <div className={styles.smallStepper}><input type="number" value={trailingBuyPct} onChange={(e) => setTrailingBuyPct(Number(e.target.value))}/><span>%</span><button>−</button><button>＋</button></div>}
      </section>
      <section className={styles.smartPanel}><div className={styles.smartPanelHead}><h2>Total</h2></div><div className={styles.inputUnit}><input readOnly value={orderTotal.toFixed(8)}/><b>USDT</b></div>{smartUnits < minUnits && <Validation/>}<PercentButtons/></section>
    </div>

    <section className={styles.smartPanel}>
      <div className={styles.smartPanelHead}><h2>Take Profit</h2><Toggle checked={tpEnabled} onChange={setTpEnabled}/></div>
      <div className={styles.takeProfitBody}>
        <div className={styles.orderChoice}><button className={tpOrderType === "Limit" ? styles.choiceActive : ""} onClick={() => setTpOrderType("Limit")}>Limit Order</button><button className={tpOrderType === "Market" ? styles.choiceActive : ""} onClick={() => setTpOrderType("Market")}>Market Order</button></div>
        <p className={styles.helperText}>{tpOrderType === "Limit" ? "The order will be placed on the exchange order book beforehand" : "The target will execute at market when reached"}</p>
        <label className={styles.field}><span>Price</span><div className={`${styles.inputUnit} ${smartUnits < minUnits ? styles.inputError : ""}`}><input value={tpPrice ? tpPrice.toFixed(5) : "0"} onChange={(e) => { const price = Number(e.target.value); if (effectiveEntry) setSmartTps((items) => items.map((tp, i) => i === 0 ? { ...tp, target: (price / effectiveEntry - 1) * 100 } : tp)); }}/><b>USDT <em>+{(smartTps[0]?.target ?? 0).toFixed(2)}%</em></b></div></label>
        {smartUnits < minUnits && <Validation text="Amount is too small to make an order"/>}
        <button className={styles.splitTargetButton} onClick={() => setSmartTps((items) => items.length > 1 ? [{ ...items[0], share: 100 }] : [{ ...items[0], share: 50 }, { target: (items[0]?.target ?? 10) + 5, share: 50 }])}>Split Targets</button>
        {smartTps.length > 1 && <div className={styles.tpRows}>{smartTps.map((tp,index) => <div key={index}><span>TP {index + 1}</span><div className={styles.inputUnit}><input type="number" value={tp.target} onChange={(e) => setSmartTps((items) => items.map((item,i) => i === index ? { ...item, target: Number(e.target.value) } : item))}/><b>%</b></div><div className={styles.inputUnit}><input type="number" value={tp.share} onChange={(e) => setSmartTps((items) => items.map((item,i) => i === index ? { ...item, share: Number(e.target.value) } : item))}/><b>% share</b></div></div>)}</div>}
        <div className={styles.inlineToggle}><span>Trailing Take Profit <b className={styles.helpDot}>?</b></span><Toggle checked={trailingTp} onChange={setTrailingTp}/></div>
        <span className={styles.featureLabel}>Follow max price with deviation (%)</span>
        <div className={styles.sliderRow}><input type="range" min="0.1" max="10" step="0.1" value={trailingTpDeviation} onChange={(e) => setTrailingTpDeviation(Number(e.target.value))}/><div className={styles.inputUnit}><input type="number" value={-trailingTpDeviation} onChange={(e) => setTrailingTpDeviation(Math.abs(Number(e.target.value)))}/><b>%</b></div></div>
      </div>
    </section>

    <section className={styles.smartPanel}>
      <div className={styles.smartPanelHead}><h2>Stop Loss</h2><Toggle checked={smartStopEnabled} onChange={setSmartStopEnabled}/></div>
      <div className={styles.stopLossBody}>
        <div className={styles.orderChoice}><button className={stopOrderType === "Cond. Limit" ? styles.choiceActive : ""} onClick={() => setStopOrderType("Cond. Limit")}>Cond. Limit Order</button><button className={stopOrderType === "Cond. Market" ? styles.choiceActive : ""} onClick={() => setStopOrderType("Cond. Market")}>Cond. Market Order</button></div>
        <p className={styles.helperText}>The order will be executed when the price meets Stop Loss conditions</p>
        <label className={styles.field}><span>Price</span><div className={`${styles.stopPriceGrid} ${smartUnits < minUnits ? styles.inputError : ""}`}><select><option>Last</option><option>Bid</option><option>Ask</option></select><input value={stopPrice ? stopPrice.toFixed(5) : "0"} onChange={(e) => { const price = Number(e.target.value); if (effectiveEntry) setSmartStopPct(Math.max(0, (1 - price / effectiveEntry) * 100)); }}/><b>USDT</b><em>-{smartStopPct.toFixed(2)}%</em></div></label>
        {smartUnits < minUnits && <Validation text="Amount is too small to make an order"/>}
        <div className={styles.inlineToggle}><span>Stop Loss timeout <b className={styles.helpDot}>?</b></span><Toggle checked={stopTimeout} onChange={setStopTimeout}/></div>
        <div className={`${styles.smallStepper} ${!stopTimeout ? styles.disabledControl : ""}`}><input disabled={!stopTimeout} value={stopTimeoutSec} onChange={(e) => setStopTimeoutSec(Math.max(0, Number(e.target.value)))}/><span>Sec</span><button onClick={() => setStopTimeoutSec(Math.max(0, stopTimeoutSec - 30))}>−</button><button onClick={() => setStopTimeoutSec(stopTimeoutSec + 30)}>＋</button></div>
        <div className={styles.inlineToggle}><span>Trailing Stop Loss <b className={styles.helpDot}>?</b></span><Toggle checked={trailingStop} onChange={setTrailingStop}/></div>
        <div className={styles.inlineToggle}><span>Move to Breakeven <b className={styles.helpDot}>?</b></span><Toggle checked={breakeven} onChange={setBreakeven}/></div>
      </div>
    </section>
  </div>;

  const smartCreate = (
    <div className={styles.smartCreatePage}>
      <div className={styles.actionRequired}><span>!</span><strong>PAPER MODE:</strong> orders on this screen are simulated and are not sent to Binance.</div>
      <UtilityBar/>
      <Selectors/>
      <ModeTabs/>
      {smartMode === "Buy/Sell" ? <div className={styles.buySellGrid}><BuySellPanel side="Buy"/><BuySellPanel side="Sell"/></div> : <><div className={styles.smartHelp}>ⓘ <button>How does SmartTrade work?</button></div><SmartBuilder/></>}
      <div className={styles.createActionRow}>{smartMode !== "Buy/Sell" && <button className={smartSide === "Buy" ? styles.buyButton : styles.sellButton} onClick={() => createSmartTrade()}>{smartMode === "Smart Cover" ? "Create Smart Cover" : "Create SmartTrade"}</button>}<button className={styles.backLink} onClick={() => setSmartView("list")}>View all SmartTrades</button></div>
      {showSmartChart && <section className={styles.chartTerminalCard}><div className={styles.chartTerminalHead}><div className={styles.intervalBar}>{INTERVALS.map((item) => <button key={item} className={interval === item ? styles.intervalActive : ""} onClick={() => setInterval(item)}>{item === "60" ? "1h" : item === "240" ? "4h" : item === "D" ? "1D" : item === "W" ? "1W" : item === "M" ? "1M" : `${item}m`}</button>)}</div><span>{selectedSymbol}/USDT · BINANCE</span></div><div className={styles.chartHost}><TradingViewChart symbol={tvSymbol(selectedSymbol)} interval={interval}/></div></section>}
      {positionsOn && <OrdersTable compact/>}
    </div>
  );

  const dcaList = (
    <div className={styles.pageContent}>
      <div className={styles.pageHeading}><div><span className={styles.eyebrow}>DCA BOT</span><h1>My bots</h1></div><button className={styles.primaryButton} onClick={() => setDcaView("create")}>＋ Create DCA Bot</button></div>
      <div className={styles.rangePills}>{["All","7 days","30 days","3 months","6 months","Custom"].map((item,index) => <button key={item} className={index === 0 ? styles.rangeActive : ""}>{item}</button>)}</div>
      <div className={styles.botAnalytics}><div className={styles.botStatsColumn}><section><span>PnL</span><strong className={styles.greenText}>$0.00</strong><small>Paper mode</small></section><section><span>Closed trades</span><strong>{closedSmart.length}</strong><small>Active bots: {runningBots.length}</small></section></div><section className={styles.botChartCard}><div><button className={styles.choiceActive}>Summary PnL</button><button>PnL by day</button><button>PnL by pair</button></div><svg viewBox="0 0 900 250"><line x1="45" y1="200" x2="860" y2="200"/><path d="M45 200 C120 190 180 165 235 174 S315 210 385 140 S480 80 545 100 S650 112 710 93 S790 105 860 65"/></svg></section></div>
      <section className={styles.card}><div className={styles.listToolbar}><h2>Bots</h2><button>Filters</button></div><div className={styles.tableWrap}><table><thead><tr><th>Name</th><th>Trades</th><th>PnL</th><th>Exchange</th><th>Pair</th><th>Active trades</th><th>Status</th></tr></thead><tbody>{dcaBots.length ? dcaBots.map((bot) => <tr key={bot.id}><td><strong>{bot.name}</strong><small>Long · {bot.startCondition}</small></td><td>{bot.maxSafetyOrders}</td><td className={styles.greenText}>$0.00</td><td>Paper Account 1001863</td><td>{bot.pair}</td><td>1 / 1</td><td><button className={`${styles.statusSwitch} ${bot.status === "Running" ? styles.switchOn : ""}`} onClick={() => setDcaBots((items) => items.map((item) => item.id === bot.id ? { ...item, status: item.status === "Running" ? "Stopped" : "Running" } : item))}><i/></button></td></tr>) : <tr className={styles.emptyRow}><td colSpan={7}>No DCA bots yet.</td></tr>}</tbody></table></div></section>
    </div>
  );

  const dcaCreate = (
    <div className={styles.builderPage}>
      <div className={styles.pageHeading}><div><span className={styles.eyebrow}>DCA BOT</span><h1>Create DCA Bot</h1><p>Binance Spot · Paper account</p></div><button className={styles.backLink} onClick={() => setDcaView("list")}>Back to bots</button></div>
      <div className={styles.builderGrid}><div className={styles.builderForm}>
        <section className={styles.builderCard}><h2>Main settings</h2><div className={styles.formGrid}><label><span>Bot name</span><input value={botName} onChange={(e) => setBotName(e.target.value)}/></label><label><span>Pair</span><select value={selectedSymbol} onChange={(e) => setSelectedSymbol(e.target.value)}>{markets.map((market) => <option key={market.symbol}>{market.symbol}</option>)}</select></label><label><span>Base order</span><div className={styles.inputUnit}><input type="number" value={baseOrder} onChange={(e) => setBaseOrder(Math.max(1, Number(e.target.value)))}/><b>USDT</b></div></label><label><span>Safety order</span><div className={styles.inputUnit}><input type="number" value={safetyOrder} onChange={(e) => setSafetyOrder(Math.max(1, Number(e.target.value)))}/><b>USDT</b></div></label></div></section>
        <section className={styles.builderCard}><h2>Averaging orders</h2><div className={styles.formGrid}><label><span>Max safety orders</span><input type="number" value={maxSafetyOrders} onChange={(e) => setMaxSafetyOrders(clamp(Number(e.target.value),1,20))}/></label><label><span>Price deviation</span><div className={styles.inputUnit}><input type="number" step="0.1" value={deviation} onChange={(e) => setDeviation(Math.max(.1, Number(e.target.value)))}/><b>%</b></div></label><label><span>Step scale</span><input type="number" step="0.1" value={stepScale} onChange={(e) => setStepScale(Math.max(.1, Number(e.target.value)))}/></label><label><span>Volume scale</span><input type="number" step="0.1" value={volumeScale} onChange={(e) => setVolumeScale(Math.max(.1, Number(e.target.value)))}/></label></div></section>
        <section className={styles.builderCard}><h2>Exit settings</h2><div className={styles.formGrid}><label><span>Start condition</span><select value={startCondition} onChange={(e) => setStartCondition(e.target.value)}><option>Immediately</option><option>TradingView custom signal</option><option>RSI signal</option><option>Manual only</option></select></label><label><span>Take profit</span><div className={styles.inputUnit}><input type="number" value={botTakeProfit} onChange={(e) => setBotTakeProfit(Number(e.target.value))}/><b>%</b></div></label><label><span>Stop loss</span><Toggle checked={botStopEnabled} onChange={setBotStopEnabled}/></label>{botStopEnabled && <label><span>Stop loss</span><div className={styles.inputUnit}><input type="number" value={botStopPct} onChange={(e) => setBotStopPct(Number(e.target.value))}/><b>%</b></div></label>}</div></section>
      </div><aside className={styles.botPreview}><div className={styles.previewHeader}><div><span className={styles.coinAvatar}>{selectedSymbol.slice(0,2)}</span><div><strong>{botName}</strong><small>{selectedSymbol}/USDT · Binance Spot</small></div></div><span>Paper</span></div><div className={styles.previewSummary}><div><span>Base order</span><strong>{compactMoney(baseOrder)}</strong></div><div><span>Max capital</span><strong>{compactMoney(dcaTotal)}</strong></div><div><span>Safety orders</span><strong>{maxSafetyOrders}</strong></div><div><span>Take profit</span><strong>{botTakeProfit}%</strong></div></div><div className={styles.previewTable}>{dcaPreview.slice(0,8).map((row) => <div key={row.index}><span>#{row.index}</span><span>-{row.deviation.toFixed(2)}%</span><span>{money(row.price)}</span><span>{compactMoney(row.amount)}</span></div>)}</div><button className={styles.primaryButton} onClick={createDcaBot}>Create DCA bot</button></aside></div>
    </div>
  );

  return <main className={styles.appShell}>
    <header className={styles.topHeader}><button className={styles.wordmark} onClick={() => openSection("Dashboard")}><span>LN</span><strong>LabNarrative</strong></button><button className={styles.sidebarCollapse}>▯</button><div className={styles.accountSummary}><span>PAPER ACCOUNT</span><strong>{compactMoney(accountValue)}</strong><small className={dayChangePct >= 0 ? styles.greenText : styles.redText}>{pct(dayChangePct)}</small></div><div className={styles.headerSpacer}/><button className={styles.fullAccessButton} onClick={() => setNotice("Binance API connection will be enabled after paper-mode validation.")}>Connect Binance</button><button className={styles.profileButton}>K</button><span className={styles.headerChevron}>⌄</span></header>
    <aside className={styles.sidebar}><nav className={styles.nav}>
      <button onClick={() => setNotice("AI Assistant will be connected after the trading workflow is complete.")}><span>✦</span>AI Assistant<em>BETA</em></button>
      <button className={section === "Dashboard" ? styles.navActive : ""} onClick={() => openSection("Dashboard")}><span>{navGlyph("Dashboard")}</span>Dashboard</button>
      <button className={section === "My Portfolio" ? styles.navActive : ""} onClick={() => openSection("My Portfolio")}><span>{navGlyph("My Portfolio")}</span>My Portfolio</button>
      <button onClick={() => setNotice("Strategy gallery is planned after SmartTrade and DCA are complete.")}><span>☆</span>Strategy gallery<em className={styles.hotBadge}>HOT</em></button>
      <button onClick={() => setNotice("Control Panel is planned for the automation phase.")}><span>✓</span>Control Panel<em>BETA</em></button>
      <button className={section === "DCA bots" ? styles.navActive : ""} onClick={() => openSection("DCA bots")}><span>{navGlyph("DCA bots")}</span>DCA Bot<small>⌄</small></button>
      <button onClick={() => setNotice("Signal Bot is a later module.")}><span>◉</span>Signal Bot</button>
      <button onClick={() => setNotice("GRID Bot is a later module.")}><span>▧</span>GRID Bot</button>
      <button className={section === "Smart Trades" ? styles.navActive : ""} onClick={() => openSection("Smart Trades")}><span>{navGlyph("Smart Trades")}</span>SmartTrade<small>⌄</small></button>
      <button onClick={() => setNotice("Terminal is a later module.")}><span>◉</span>Terminal</button>
      <div className={styles.navDivider}/><button onClick={() => setNotice("Subscriptions will be added when the product becomes SaaS.")}><span>▣</span>Subscriptions</button>
    </nav><div className={styles.sidebarPromo}><strong>✣ Trading Agent</strong><p>Historical-zone, breakout and DCA intelligence</p></div><div className={styles.sidebarFooter}><span>Paper mode</span><span>Support</span></div></aside>
    <section className={styles.main}><div className={styles.demoBanner}><span>ⓘ</span> Now you&apos;re on Paper account <button onClick={() => setNotice("Real mode requires a Binance API connection.")}>Switch to Real account</button></div>{section !== "Smart Trades" && <div className={styles.searchStrip}><label className={styles.globalSearch}><span>⌕</span><input placeholder="Search pair or section" value={globalSearch} onChange={(e) => handleGlobalSearch(e.target.value)}/><kbd>⌘ K</kbd></label></div>}{notice && <button className={styles.notice} onClick={() => setNotice("")}>{notice}<span>×</span></button>}{section === "Dashboard" && dashboard}{section === "My Portfolio" && portfolio}{section === "Smart Trades" && (smartView === "list" ? smartList : smartCreate)}{section === "DCA bots" && (dcaView === "list" ? dcaList : dcaCreate)}</section>
  </main>;
}
