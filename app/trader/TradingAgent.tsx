"use client";

import { useEffect, useMemo, useState } from "react";
import TradingViewChart from "./TradingViewChart";
import styles from "./trader.module.css";

type Section = "Dashboard" | "My Portfolio" | "Smart Trades" | "DCA bots";
type SmartView = "list" | "create";
type DcaView = "list" | "create";
type SmartTab = "Active" | "History";
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

const NAV: Section[] = ["Dashboard", "My Portfolio", "Smart Trades", "DCA bots"];
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
  const digits = Math.abs(value) >= 1000 ? 0 : Math.abs(value) >= 1 ? 2 : 4;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: digits }).format(value);
}

function compactMoney(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
}

function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)); }
function tvSymbol(symbol: string) { return `BINANCE:${symbol}USDT`; }
function navGlyph(section: Section) {
  if (section === "Dashboard") return "⌘";
  if (section === "My Portfolio") return "◔";
  if (section === "Smart Trades") return "↕";
  return "◉";
}
function pct(value: number) { return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`; }

export default function TradingAgent() {
  const [section, setSection] = useState<Section>("Dashboard");
  const [smartView, setSmartView] = useState<SmartView>("list");
  const [dcaView, setDcaView] = useState<DcaView>("list");
  const [smartTab, setSmartTab] = useState<SmartTab>("Active");
  const [markets, setMarkets] = useState<Market[]>(FALLBACK_MARKETS);
  const [selectedSymbol, setSelectedSymbol] = useState("BTC");
  const [interval, setInterval] = useState<ChartInterval>("D");
  const [smartTrades, setSmartTrades] = useState<SmartTrade[]>([]);
  const [dcaBots, setDcaBots] = useState<DcaBot[]>([]);
  const [notice, setNotice] = useState("");
  const [globalSearch, setGlobalSearch] = useState("");
  const [smartSearch, setSmartSearch] = useState("");
  const [smartPairFilter, setSmartPairFilter] = useState("All");
  const [showSmartChart, setShowSmartChart] = useState(true);

  const [smartSide, setSmartSide] = useState<"Buy" | "Sell">("Buy");
  const [smartOrderType, setSmartOrderType] = useState<"Market" | "Limit">("Market");
  const [smartAmount, setSmartAmount] = useState(100);
  const [smartPrice, setSmartPrice] = useState(0);
  const [smartTps, setSmartTps] = useState<TakeProfit[]>([{ target: 3, share: 100 }]);
  const [smartStopEnabled, setSmartStopEnabled] = useState(false);
  const [smartStopPct, setSmartStopPct] = useState(5);

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
        const crypto = (data.opportunities ?? [])
          .filter((item) => item.kind === "Crypto")
          .map((item) => ({ symbol: item.symbol, label: item.label, price: item.price }));
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
    if (selectedPrice && smartOrderType === "Market") setSmartPrice(selectedPrice);
  }, [selectedPrice, smartOrderType, selectedSymbol]);

  const activeSmart = smartTrades.filter((trade) => trade.status === "Active");
  const closedSmart = smartTrades.filter((trade) => trade.status === "Closed");
  const runningBots = dcaBots.filter((bot) => bot.status === "Running");

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
  const dayChangePct = DEMO_BALANCE ? smartUnrealized / DEMO_BALANCE * 100 : 0;
  const freeCapital = Math.max(0, DEMO_BALANCE - paperCapital);
  const uniqueAssets = new Set(activeSmart.map((trade) => trade.pair.split("/")[0]));
  const assetCount = uniqueAssets.size + 1;

  const smartRows = useMemo(() => {
    const source = smartTab === "Active" ? activeSmart : closedSmart;
    const query = smartSearch.trim().toLowerCase();
    return source.filter((trade) => {
      const pairMatch = smartPairFilter === "All" || trade.pair === smartPairFilter;
      const searchMatch = !query || trade.pair.toLowerCase().includes(query) || trade.id.toLowerCase().includes(query);
      return pairMatch && searchMatch;
    });
  }, [smartTab, activeSmart, closedSmart, smartSearch, smartPairFilter]);

  const openSection = (next: Section) => {
    setSection(next);
    if (next !== "Smart Trades") setSmartView("list");
    if (next !== "DCA bots") setDcaView("list");
  };

  const createSmartTrade = () => {
    const entry = smartOrderType === "Market" ? (selectedPrice ?? smartPrice) : smartPrice;
    if (!entry || smartAmount <= 0) { setNotice("Add a valid amount and price before creating the SmartTrade."); return; }
    const totalShares = smartTps.reduce((sum, tp) => sum + tp.share, 0);
    if (Math.abs(totalShares - 100) > 0.01) { setNotice("Take-profit shares must total 100%."); return; }
    const trade: SmartTrade = {
      id: `st-${Date.now()}`,
      pair: `${selectedSymbol}/USDT`, side: smartSide, orderType: smartOrderType,
      entryPrice: entry, amount: smartAmount, takeProfits: smartTps,
      stopEnabled: smartStopEnabled, stopPct: smartStopPct, status: "Active", createdAt: new Date().toISOString(),
    };
    setSmartTrades((current) => [trade, ...current]);
    setSmartView("list");
    setSmartTab("Active");
    setNotice(`${trade.pair} SmartTrade created in paper mode.`);
  };

  const createDcaBot = () => {
    if (!botName.trim() || baseOrder <= 0 || safetyOrder <= 0) { setNotice("Add a bot name and valid order amounts."); return; }
    const bot: DcaBot = {
      id: `bot-${Date.now()}`, name: botName.trim(), pair: `${selectedSymbol}/USDT`, baseOrder, safetyOrder,
      maxSafetyOrders, deviation, stepScale, volumeScale, takeProfit: botTakeProfit,
      stopEnabled: botStopEnabled, stopPct: botStopPct, startCondition, status: "Running", createdAt: new Date().toISOString(),
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

  const BalanceChart = () => (
    <svg viewBox="0 0 720 230" className={styles.balanceChart} aria-label="Paper account balance chart">
      <line x1="42" y1="36" x2="700" y2="36"/><line x1="42" y1="92" x2="700" y2="92"/><line x1="42" y1="148" x2="700" y2="148"/><line x1="42" y1="204" x2="700" y2="204"/>
      <path className={styles.balanceArea} d="M42 178 C100 176 135 175 185 172 S260 178 315 164 S385 137 425 118 S493 100 545 80 S620 67 700 58 L700 204 L42 204 Z"/>
      <path className={styles.balanceLine} d="M42 178 C100 176 135 175 185 172 S260 178 315 164 S385 137 425 118 S493 100 545 80 S620 67 700 58"/>
      <path className={styles.btcLine} d="M42 72 C120 74 170 79 225 82 S320 88 382 108 S470 139 520 154 S620 166 700 168"/>
    </svg>
  );

  const dashboard = (
    <div className={styles.pageContent}>
      <div className={styles.pageHeading}><div><h1>Dashboard</h1></div></div>
      <div className={styles.pageTabs}><button className={styles.pageTabActive}>Main</button><button>Beginner&apos;s Guide</button></div>

      <div className={styles.moduleCards}>
        <section className={styles.moduleCard}>
          <div className={styles.moduleTitle}><h3>DCA Bots</h3><button onClick={() => { setSection("DCA bots"); setDcaView("create"); }}>Create</button></div>
          <div className={styles.moduleLine}><span>Active Bots</span><b>{runningBots.length}</b></div>
          <div className={styles.moduleLine}><span>Today PnL</span><b>$0</b></div>
          <div className={styles.moduleLine}><span>PnL</span><b className={styles.greenText}>$0</b></div>
        </section>
        <section className={styles.moduleCard}>
          <div className={styles.moduleTitle}><h3>SmartTrades</h3><button onClick={() => { setSection("Smart Trades"); setSmartView("create"); }}>Create</button></div>
          <div className={styles.moduleLine}><span>Active ST</span><b>{activeSmart.length}</b></div>
          <div className={styles.moduleLine}><span>Today PnL</span><b>{compactMoney(smartUnrealized)}</b></div>
          <div className={styles.moduleLine}><span>PnL</span><b className={smartUnrealized >= 0 ? styles.greenText : styles.redText}>{compactMoney(smartUnrealized)}</b></div>
        </section>
        <section className={styles.moduleCard}>
          <div className={styles.moduleTitle}><h3>My Portfolio</h3><button onClick={() => setSection("My Portfolio")}>Open</button></div>
          <div className={styles.moduleLine}><span>Demo balance</span><b>{compactMoney(accountValue)}</b></div>
          <div className={styles.moduleLine}><span>Capital planned</span><b>{compactMoney(paperCapital)}</b></div>
          <div className={styles.moduleLine}><span>Free capital</span><b>{compactMoney(freeCapital)}</b></div>
        </section>
        <section className={styles.moduleCard}>
          <div className={styles.moduleTitle}><h3>Exchange</h3><button onClick={() => setNotice("Binance API connection is the next integration layer.")}>Connect</button></div>
          <p className={styles.moduleDescription}>Binance Spot connection will provide live balances, order routing and execution while funds remain on the exchange.</p>
        </section>
      </div>

      <section className={styles.accountBanner}>
        <span className={styles.bannerIcon}>i</span><div><strong>Paper account is active</strong><p>Build and test SmartTrades and DCA bots before connecting your real Binance account.</p></div><button onClick={() => setNotice("Binance API connection is coming next.")}>Connect Binance</button>
      </section>

      <section className={`${styles.card} ${styles.totalBalanceCard}`}>
        <div className={styles.cardHeader}><h2>Total balance</h2><div className={styles.cardTools}><button>◉</button><button>↻</button></div></div>
        <div className={styles.totalBalanceBody}>
          <div className={styles.balanceDonut} style={{ background: `conic-gradient(#12b7ae 0 82%, #fa9b2a 82% 90%, #4967d8 90% 96%, #8349ba 96% 100%)` }}><div><span>Number of assets</span><b>{assetCount}</b></div></div>
          <div className={styles.balanceNumbers}><span>Total / Change 24 hr</span><strong>{compactMoney(accountValue)} <em className={dayChangePct >= 0 ? styles.greenText : styles.redText}>{pct(dayChangePct)}</em></strong><small>≈ {(accountValue / Math.max(markets.find((m) => m.symbol === "BTC")?.price ?? 1, 1)).toFixed(6)} BTC</small></div>
          <div className={styles.chartColumn}><div className={styles.chartLegend}><span><i className={styles.usdLegend}/>USD</span><span><i className={styles.btcLegend}/>BTC</span></div><BalanceChart/></div>
        </div>
      </section>
    </div>
  );

  const portfolio = (
    <div className={styles.pageContent}>
      <div className={styles.pageHeading}><div><h1>My Demo account</h1></div><button className={styles.primaryButton} onClick={() => setNotice("Binance connection will be enabled after the paper-trading baseline is complete.")}>Connect a new account</button></div>
      <section className={`${styles.card} ${styles.statisticsCard}`}>
        <div className={styles.cardHeader}><h2>Statistics</h2><div className={styles.cardTools}><button>◉</button><button>↻</button></div></div>
        <div className={styles.statisticsBody}>
          <div className={styles.portfolioRing}><div><span>Demo account</span><b>1</b></div></div>
          <div className={styles.balanceNumbers}><span>Total / Change 24 hr</span><strong>{compactMoney(accountValue)} <em className={dayChangePct >= 0 ? styles.greenText : styles.redText}>{pct(dayChangePct)}</em></strong><small>Paper allocation: {compactMoney(paperCapital)}</small></div>
          <div className={styles.chartColumn}><div className={styles.chartLegend}><span><i className={styles.usdLegend}/>USD</span><span><i className={styles.btcLegend}/>BTC</span></div><BalanceChart/></div>
        </div>
      </section>

      <div className={styles.exchangeDivider}><span>EXCHANGES</span></div>
      <section className={styles.exchangeCard}>
        <div className={styles.exchangeCardHead}><div className={styles.exchangeIcon}>◆</div><div><h3>Paper Account 1001863</h3><p>Binance Spot account simulator</p></div><button>↻</button></div>
        <div className={styles.allocationBar}><i style={{width:`${Math.min(100, freeCapital / DEMO_BALANCE * 100)}%`}}/><b style={{width:`${Math.min(100, paperCapital / DEMO_BALANCE * 100)}%`}}/></div>
        <div className={styles.allocationLegend}><span><i className={styles.usdtDot}/>USDT {(freeCapital / DEMO_BALANCE * 100).toFixed(1)}%</span><span><i className={styles.tradingDot}/>Strategies {(paperCapital / DEMO_BALANCE * 100).toFixed(1)}%</span></div>
        <div className={styles.exchangeStats}><div><span>Total:</span><b>{compactMoney(accountValue)}</b></div><div><span>24hr changes:</span><b className={dayChangePct >= 0 ? styles.greenText : styles.redText}>{pct(dayChangePct)}</b></div></div>
        <button className={styles.tradeAccountButton} onClick={() => { setSection("Smart Trades"); setSmartView("create"); }}>Trade</button>
      </section>
    </div>
  );

  const smartList = (
    <div className={styles.pageContent}>
      <div className={styles.pageHeading}><div><h1>SmartTrades</h1></div><button className={styles.primaryButton} onClick={() => setSmartView("create")}>+ Create SmartTrade</button></div>
      <div className={styles.pageTabs}><button className={smartTab === "Active" ? styles.pageTabActive : ""} onClick={() => setSmartTab("Active")}>Active</button><button className={smartTab === "History" ? styles.pageTabActive : ""} onClick={() => setSmartTab("History")}>History</button><button>Presets</button></div>
      <section className={`${styles.card} ${styles.filtersCard}`}>
        <div className={styles.filtersHead}><h2>Filters</h2><button onClick={() => { setSmartSearch(""); setSmartPairFilter("All"); }}>Clear filters</button></div>
        <div className={styles.filtersGrid}>
          <label><span>Created on</span><div className={styles.fakeSelect}>All dates <i>⌄</i></div></label>
          <label><span>Source</span><div className={styles.fakeSelect}>All <i>⌄</i></div></label>
          <label><span>Account</span><div className={styles.fakeSelect}>Paper Account 1001863 <i>⌄</i></div></label>
          <label><span>Pair</span><select value={smartPairFilter} onChange={(e) => setSmartPairFilter(e.target.value)}><option>All</option>{markets.map((market) => <option key={market.symbol}>{market.symbol}/USDT</option>)}</select></label>
          <label><span>Search by token</span><input value={smartSearch} onChange={(e) => setSmartSearch(e.target.value)} placeholder="Pair or trade ID"/></label>
        </div>
      </section>
      <section className={styles.card}>
        <div className={styles.tableWrap}><table><thead><tr><th>Pair</th><th>Creation date</th><th>Volume</th><th>Status</th><th>Profit/Loss</th><th>Source</th><th>Actions</th></tr></thead><tbody>
          {smartRows.length ? smartRows.map((trade) => {
            const symbol = trade.pair.split("/")[0];
            const current = markets.find((m) => m.symbol === symbol)?.price ?? trade.entryPrice;
            const move = trade.entryPrice ? (current - trade.entryPrice) / trade.entryPrice : 0;
            const pnl = move * trade.amount * (trade.side === "Buy" ? 1 : -1);
            return <tr key={trade.id}><td><strong>{trade.pair}</strong><small>Paper Account 1001863</small></td><td>{new Date(trade.createdAt).toLocaleDateString()}<small>{new Date(trade.createdAt).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}</small></td><td><span>Current Position:</span><strong>{compactMoney(trade.amount)}</strong></td><td><span className={trade.status === "Active" ? styles.statusTag : styles.mutedTag}>{trade.status}</span><small>{trade.side} {money(trade.entryPrice)}</small></td><td><strong className={pnl >= 0 ? styles.greenText : styles.redText}>{compactMoney(pnl)}</strong><small>{pct(move * 100)}</small></td><td>SmartTrade</td><td>{trade.status === "Active" ? <button className={styles.actionSquare} onClick={() => setSmartTrades((items) => items.map((item) => item.id === trade.id ? {...item,status:"Closed"} : item))}>✓</button> : <button className={styles.actionSquare}>⋮</button>}</td></tr>;
          }) : <tr className={styles.emptyRow}><td colSpan={7}>No {smartTab.toLowerCase()} SmartTrades yet.</td></tr>}
        </tbody></table></div>
      </section>
    </div>
  );

  const smartCreate = (
    <div className={styles.smartCreatePage}>
      <div className={styles.smartModeTabs}><button>Buy/Sell</button><button className={styles.smartModeActive}>SmartTrade ↑</button><button>Smart Cover ↓</button></div>
      <div className={styles.smartToggleBar}><label>TradingView <input type="checkbox" checked={showSmartChart} onChange={(e) => setShowSmartChart(e.target.checked)}/></label><label>Signals <input type="checkbox"/></label><label>Trade terminal <input type="checkbox" checked readOnly/></label><label>Orders and positions <input type="checkbox" checked readOnly/></label></div>
      <div className={styles.marketSelectors}><label><span>Exchange</span><div className={styles.fakeSelect}>◆ Paper Account 1001863 | Binance Spot simulator <i>⌄</i></div></label><label><span>Market</span><div className={styles.fakeSelect}>USDT <i>⌄</i></div></label><label><span>Trading Pair</span><select value={selectedSymbol} onChange={(e) => setSelectedSymbol(e.target.value)}>{markets.map((market) => <option key={market.symbol} value={market.symbol}>{market.symbol}/USDT</option>)}</select></label></div>

      <div className={styles.smartBuilderColumns}>
        <div className={styles.builderStack}>
          <section className={styles.smartPanel}><div className={styles.smartPanelHead}><h2>Units</h2><label>Use Existing Assets <input type="checkbox"/></label></div><div className={styles.inputUnit}><input type="number" min="1" value={smartAmount} onChange={(e) => setSmartAmount(Math.max(1, Number(e.target.value)))}/><b>USDT</b></div></section>
          <section className={styles.smartPanel}><div className={styles.smartPanelHead}><h2>Buy Price</h2></div><div className={styles.orderChoice}><button className={smartOrderType === "Limit" ? styles.choiceActive : ""} onClick={() => setSmartOrderType("Limit")}>Limit</button><button className={smartOrderType === "Market" ? styles.choiceActive : ""} onClick={() => setSmartOrderType("Market")}>Market</button><button>Cond.</button></div><p className={styles.helperText}>{smartOrderType === "Market" ? "Will buy at actual rates after the trade is created" : "Order will wait at the specified limit price"}</p><div className={styles.inputUnit}><input type="number" step="0.01" disabled={smartOrderType === "Market"} value={smartOrderType === "Market" ? (selectedPrice ?? 0) : smartPrice} onChange={(e) => setSmartPrice(Number(e.target.value))}/><b>USDT</b></div><small className={styles.bidAsk}>Bid: {money(selectedPrice)} &nbsp; Ask: {money(selectedPrice)}</small></section>
          <section className={styles.smartPanel}><div className={styles.smartPanelHead}><h2>Total</h2></div><div className={styles.inputUnit}><input readOnly value={smartAmount.toFixed(2)}/><b>USDT</b></div><p className={styles.helperText}>Size from available amount</p><div className={styles.percentButtons}>{[5,10,25,50,100].map((v) => <button key={v} onClick={() => setSmartAmount(DEMO_BALANCE * v / 100)}>{v}%</button>)}</div></section>
        </div>

        <section className={styles.smartPanel}><div className={styles.smartPanelHead}><h2>Take Profit</h2></div><div className={styles.takeProfitBody}>{smartTps.map((tp,index) => <div className={styles.tpEditor} key={index}><span>TP {index+1}</span><div className={styles.inputUnit}><input type="number" value={tp.target} onChange={(e) => setSmartTps((items) => items.map((item,i) => i===index ? {...item,target:Number(e.target.value)} : item))}/><b>%</b></div><div className={styles.inputUnit}><input type="number" value={tp.share} onChange={(e) => setSmartTps((items) => items.map((item,i) => i===index ? {...item,share:Number(e.target.value)} : item))}/><b>% sell</b></div>{smartTps.length > 1 && <button onClick={() => setSmartTps((items) => items.filter((_,i) => i!==index))}>×</button>}</div>)}<button className={styles.secondaryAction} onClick={() => setSmartTps((items) => [...items,{target:(items.at(-1)?.target ?? 0)+3,share:0}])}>+ Multiple Take Profit</button><button className={styles.tealAction} onClick={() => setNotice("Take profit settings saved for this SmartTrade.")}>Set Take Profit</button></div></section>

        <section className={styles.smartPanel}><div className={styles.smartPanelHead}><h2>Stop Loss</h2><label><input type="checkbox" checked={smartStopEnabled} onChange={(e) => setSmartStopEnabled(e.target.checked)}/></label></div><div className={styles.stopLossBody}><div className={styles.orderChoice}><button className={styles.choiceActive}>Cond. Market Order</button><button>Cond. Limit Order</button></div><label><span>Stop Loss deviation</span><div className={styles.inputUnit}><input type="number" disabled={!smartStopEnabled} value={smartStopPct} onChange={(e) => setSmartStopPct(Number(e.target.value))}/><b>%</b></div></label><button className={styles.tealAction} onClick={() => setSmartStopEnabled(true)}>Set Stop Loss</button><div className={styles.featureTags}><span>STOP LOSS BREAKEVEN</span><span>TRAILING STOP LOSS</span></div></div></section>
      </div>

      {showSmartChart && <section className={styles.chartTerminalCard}><div className={styles.chartTerminalHead}><div className={styles.intervalBar}>{INTERVALS.map((item) => <button key={item} className={interval === item ? styles.intervalActive : ""} onClick={() => setInterval(item)}>{item === "60" ? "1h" : item === "240" ? "4h" : item === "D" ? "1D" : item === "W" ? "1W" : item === "M" ? "1M" : `${item}m`}</button>)}</div><span>{selectedSymbol}/USDT · BINANCE</span></div><div className={styles.chartHost}><TradingViewChart symbol={tvSymbol(selectedSymbol)} interval={interval}/></div></section>}
      <div className={styles.smartCreateFooter}><button className={smartSide === "Buy" ? styles.buyButton : styles.sellButton} onClick={createSmartTrade}>Create {smartSide} SmartTrade</button><button className={styles.sideSwitch} onClick={() => setSmartSide((s) => s === "Buy" ? "Sell" : "Buy")}>Side: {smartSide}</button><button className={styles.backLink} onClick={() => setSmartView("list")}>Back to SmartTrades</button></div>
    </div>
  );

  const dcaList = (
    <div className={styles.pageContent}>
      <div className={styles.pageHeading}><div><span className={styles.subtleBadge}>▣ My Bots</span><h1>My bots</h1></div><button className={styles.primaryButton} onClick={() => setDcaView("create")}>＋ Create DCA Bot</button></div>
      <div className={styles.rangePills}>{["All","7 days","30 days","3 months","6 months","Custom"].map((item,index) => <button key={item} className={index===0 ? styles.rangeActive : ""}>{item}</button>)}</div>
      <div className={styles.botAnalytics}>
        <div className={styles.botStatsColumn}><section className={styles.botMetric}><span>PnL</span><strong className={styles.greenText}>$0.00</strong><small>Paper mode</small></section><section className={styles.botMetric}><span>Closed trades</span><strong>0</strong><small>Active trades: {runningBots.length}</small></section><section className={styles.botMetric}><span>Most profitable bot</span><strong className={styles.greenText}>{dcaBots[0]?.name ?? "—"}</strong></section></div>
        <section className={`${styles.card} ${styles.botChartCard}`}><div className={styles.botChartTabs}><button className={styles.choiceActive}>Summary PnL</button><button>PnL by day</button><button>PnL by pair</button></div><svg viewBox="0 0 900 330" className={styles.botChart}><line x1="50" y1="45" x2="865" y2="45"/><line x1="50" y1="125" x2="865" y2="125"/><line x1="50" y1="205" x2="865" y2="205"/><line x1="50" y1="285" x2="865" y2="285"/><path d="M50 285 C110 278 150 250 200 232 S260 204 315 220 S370 262 430 190 S500 110 555 125 S620 145 675 128 S745 130 805 126 S840 108 865 92"/></svg></section>
      </div>
      <section className={styles.card}>
        <div className={styles.listToolbar}><h2>Bots</h2><div><button className={styles.actionSquare}>⌕</button><button className={styles.filterButton}>Filters</button></div></div>
        <div className={styles.tableWrap}><table><thead><tr><th>Name</th><th>Trades</th><th>PnL</th><th>Avg. daily PnL</th><th>Reinvested</th><th>Exchange</th><th>Pair</th><th>Active trades</th><th>Status</th></tr></thead><tbody>{dcaBots.length ? dcaBots.map((bot) => <tr key={bot.id}><td><strong>{bot.name}</strong><small>Long · {bot.startCondition}</small></td><td>{bot.maxSafetyOrders}</td><td className={styles.greenText}>$0.00</td><td className={styles.greenText}>$0.00</td><td>$0.00</td><td><strong>Paper Account 1001863</strong><small>Binance Spot simulator</small></td><td><strong>{bot.pair}</strong></td><td>1 / 1</td><td><button className={`${styles.statusSwitch} ${bot.status === "Running" ? styles.switchOn : ""}`} onClick={() => setDcaBots((items) => items.map((item) => item.id===bot.id ? {...item,status:item.status === "Running" ? "Stopped" : "Running"} : item))}><i/></button></td></tr>) : <tr className={styles.emptyRow}><td colSpan={9}>No DCA bots yet. Create your first bot.</td></tr>}</tbody></table></div>
      </section>
    </div>
  );

  const dcaCreate = (
    <div className={styles.builderPage}>
      <div className={styles.pageHeading}><div className={styles.headingWithBack}><button className={styles.backButton} onClick={() => setDcaView("list")}>←</button><div><h1>Create DCA Bot</h1><p>Binance Spot · Paper account</p></div></div></div>
      <div className={styles.builderGrid}>
        <div className={styles.builderForm}>
          <div className={styles.builderSteps}><button className={styles.stepActive}>Main settings</button><button>Entry condition</button><button>Averaging orders</button><button>Take profit</button><button>Stop loss</button></div>
          <section className={styles.builderCard}><h2>Main settings</h2><div className={styles.formGrid}><label><span>Bot name</span><input value={botName} onChange={(e) => setBotName(e.target.value)}/></label><label><span>Pair</span><select value={selectedSymbol} onChange={(e) => setSelectedSymbol(e.target.value)}>{markets.map((market) => <option key={market.symbol} value={market.symbol}>{market.symbol}/USDT</option>)}</select></label><label><span>Base order</span><div className={styles.inputUnit}><input type="number" value={baseOrder} onChange={(e) => setBaseOrder(Math.max(1, Number(e.target.value)))}/><b>USDT</b></div></label><label><span>Safety order</span><div className={styles.inputUnit}><input type="number" value={safetyOrder} onChange={(e) => setSafetyOrder(Math.max(1, Number(e.target.value)))}/><b>USDT</b></div></label></div></section>
          <section className={styles.builderCard}><h2>Averaging orders</h2><div className={styles.formGrid}><label><span>Max safety orders</span><input type="number" min="1" max="20" value={maxSafetyOrders} onChange={(e) => setMaxSafetyOrders(clamp(Number(e.target.value),1,20))}/></label><label><span>Price deviation to open safety orders</span><div className={styles.inputUnit}><input type="number" step="0.1" value={deviation} onChange={(e) => setDeviation(Math.max(.1,Number(e.target.value)))}/><b>%</b></div></label><label><span>Safety order step scale</span><input type="number" min=".1" step=".1" value={stepScale} onChange={(e) => setStepScale(Math.max(.1,Number(e.target.value)))}/></label><label><span>Safety order volume scale</span><input type="number" min=".1" step=".1" value={volumeScale} onChange={(e) => setVolumeScale(Math.max(.1,Number(e.target.value)))}/></label></div></section>
          <section className={styles.builderCard}><h2>Deal start condition</h2><div className={styles.formGrid}><label><span>Start condition</span><select value={startCondition} onChange={(e) => setStartCondition(e.target.value)}><option>Immediately</option><option>TradingView custom signal</option><option>RSI signal</option><option>Manual only</option></select></label><label><span>Take profit</span><div className={styles.inputUnit}><input type="number" step=".1" value={botTakeProfit} onChange={(e) => setBotTakeProfit(Number(e.target.value))}/><b>%</b></div></label><label className={styles.switchRow}><div><span>Stop loss</span><small>Close the bot deal after a defined loss.</small></div><input type="checkbox" checked={botStopEnabled} onChange={(e) => setBotStopEnabled(e.target.checked)}/></label>{botStopEnabled && <label><span>Stop loss</span><div className={styles.inputUnit}><input type="number" value={botStopPct} onChange={(e) => setBotStopPct(Number(e.target.value))}/><b>%</b></div></label>}</div></section>
        </div>
        <aside className={styles.botPreview}><div className={styles.previewHeader}><div><span className={styles.coinAvatar}>{selectedSymbol.slice(0,2)}</span><div><strong>{botName || "DCA Bot"}</strong><small>{selectedSymbol}/USDT · Binance Spot</small></div></div><span>Paper</span></div><div className={styles.previewPrice}><span>Current price</span><strong>{money(selectedPrice)}</strong></div><div className={styles.previewSummary}><div><span>Base order</span><strong>{compactMoney(baseOrder)}</strong></div><div><span>Max capital</span><strong>{compactMoney(dcaTotal)}</strong></div><div><span>Safety orders</span><strong>{maxSafetyOrders}</strong></div><div><span>Take profit</span><strong>{botTakeProfit}%</strong></div></div><div className={styles.previewTable}><div className={styles.previewTableHead}><span>#</span><span>Deviation</span><span>Price</span><span>Amount</span></div>{dcaPreview.slice(0,8).map((row) => <div key={row.index} className={styles.previewRow}><span>{row.index}</span><span>-{row.deviation.toFixed(2)}%</span><span>{money(row.price)}</span><span>{compactMoney(row.amount)}</span></div>)}</div><button className={styles.primaryButton} onClick={createDcaBot}>Create DCA bot</button></aside>
      </div>
    </div>
  );

  return (
    <main className={styles.appShell}>
      <header className={styles.topHeader}>
        <button className={styles.wordmark} onClick={() => openSection("Dashboard")}><span>LN</span><strong>LABNARRATIVE</strong></button>
        <div className={styles.accountSummary}><span>PAPER ACCOUNT</span><strong>{compactMoney(accountValue)}</strong><small className={dayChangePct >= 0 ? styles.greenText : styles.redText}>{pct(dayChangePct)}</small></div>
        <div className={styles.headerSpacer}/>
        <button className={styles.fullAccessButton} onClick={() => setNotice("Binance connection will be enabled after the paper-trading clone is complete.")}>Connect Binance</button>
        <button className={styles.profileButton}>K</button>
      </header>

      <aside className={styles.sidebar}>
        <nav className={styles.nav}>{NAV.map((item) => <button key={item} className={section===item ? styles.navActive : ""} onClick={() => openSection(item)}><span>{navGlyph(item)}</span>{item}</button>)}</nav>
        <div className={styles.navDivider}/>
        <div className={styles.sidebarBottom}><button onClick={() => setNotice("Binance API connection is the next integration step.")}>▣ Connect account</button><div><span className={styles.paperDot}/>Paper trading</div></div>
      </aside>

      <section className={styles.main}>
        <div className={styles.demoBanner}><span>ⓘ</span> Now you&apos;re on Paper account <button onClick={() => setNotice("Real account mode will unlock when Binance API integration is enabled.")}>Switch to Real account</button></div>
        <div className={styles.searchStrip}><label className={styles.globalSearch}><span>⌕</span><input placeholder="Search pair or section" value={globalSearch} onChange={(e) => handleGlobalSearch(e.target.value)}/><kbd>⌘ K</kbd></label></div>
        {notice && <button className={styles.notice} onClick={() => setNotice("")}>{notice}<span>×</span></button>}
        {section === "Dashboard" && dashboard}
        {section === "My Portfolio" && portfolio}
        {section === "Smart Trades" && (smartView === "list" ? smartList : smartCreate)}
        {section === "DCA bots" && (dcaView === "list" ? dcaList : dcaCreate)}
      </section>
    </main>
  );
}
