"use client";

import { useEffect, useMemo, useState } from "react";
import TradingViewChart from "./TradingViewChart";
import styles from "./trader.module.css";

type Section = "Dashboard" | "My Portfolio" | "Smart Trades" | "DCA bots";
type SmartView = "list" | "create";
type DcaView = "list" | "create";
type ChartInterval = "1" | "5" | "15" | "60" | "240" | "D" | "W" | "M";
type Market = { symbol: string; label: string; price: number | null };
type RadarResponse = {
  opportunities?: Array<{ symbol: string; label: string; kind: string; price: number }>;
};
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

function money(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  const digits = Math.abs(value) >= 1000 ? 0 : Math.abs(value) >= 1 ? 2 : 4;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: digits,
  }).format(value);
}

function compactMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function tvSymbol(symbol: string) {
  return `BINANCE:${symbol}USDT`;
}

function navGlyph(section: Section) {
  if (section === "Dashboard") return "▦";
  if (section === "My Portfolio") return "◫";
  if (section === "Smart Trades") return "↗";
  return "◉";
}

export default function TradingAgent() {
  const [section, setSection] = useState<Section>("Dashboard");
  const [smartView, setSmartView] = useState<SmartView>("list");
  const [dcaView, setDcaView] = useState<DcaView>("list");
  const [markets, setMarkets] = useState<Market[]>(FALLBACK_MARKETS);
  const [selectedSymbol, setSelectedSymbol] = useState("BTC");
  const [interval, setInterval] = useState<ChartInterval>("60");
  const [smartTrades, setSmartTrades] = useState<SmartTrade[]>([]);
  const [dcaBots, setDcaBots] = useState<DcaBot[]>([]);
  const [notice, setNotice] = useState("");
  const [globalSearch, setGlobalSearch] = useState("");

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

  useEffect(() => {
    localStorage.setItem("labnarrative-smart-trades-v1", JSON.stringify(smartTrades));
  }, [smartTrades]);

  useEffect(() => {
    localStorage.setItem("labnarrative-dca-bots-v1", JSON.stringify(dcaBots));
  }, [dcaBots]);

  const selectedMarket = markets.find((item) => item.symbol === selectedSymbol) ?? markets[0] ?? FALLBACK_MARKETS[0];
  const selectedPrice = selectedMarket?.price ?? null;

  useEffect(() => {
    if (selectedPrice && smartOrderType === "Market") setSmartPrice(selectedPrice);
  }, [selectedPrice, smartOrderType, selectedSymbol]);

  const activeSmart = smartTrades.filter((trade) => trade.status === "Active");
  const runningBots = dcaBots.filter((bot) => bot.status === "Running");
  const paperCapital = smartTrades
    .filter((trade) => trade.status === "Active")
    .reduce((sum, trade) => sum + trade.amount, 0) + dcaBots
    .filter((bot) => bot.status === "Running")
    .reduce((sum, bot) => {
      const safetyTotal = Array.from({ length: bot.maxSafetyOrders }, (_, index) => bot.safetyOrder * Math.pow(bot.volumeScale, index))
        .reduce((a, b) => a + b, 0);
      return sum + bot.baseOrder + safetyTotal;
    }, 0);

  const dcaPreview = useMemo(() => {
    const anchor = selectedPrice ?? 0;
    let cumulativeDeviation = 0;
    let nextStep = deviation;
    return Array.from({ length: clamp(Math.round(maxSafetyOrders), 1, 20) }, (_, index) => {
      cumulativeDeviation += nextStep;
      const orderAmount = safetyOrder * Math.pow(volumeScale, index);
      const price = anchor > 0 ? anchor * (1 - cumulativeDeviation / 100) : 0;
      const row = {
        index: index + 1,
        deviation: cumulativeDeviation,
        price,
        amount: orderAmount,
      };
      nextStep *= stepScale;
      return row;
    });
  }, [selectedPrice, deviation, maxSafetyOrders, safetyOrder, stepScale, volumeScale]);

  const dcaTotal = baseOrder + dcaPreview.reduce((sum, row) => sum + row.amount, 0);

  const openSection = (next: Section) => {
    setSection(next);
    if (next !== "Smart Trades") setSmartView("list");
    if (next !== "DCA bots") setDcaView("list");
  };

  const createSmartTrade = () => {
    const entry = smartOrderType === "Market" ? (selectedPrice ?? smartPrice) : smartPrice;
    if (!entry || smartAmount <= 0) {
      setNotice("Add a valid amount and price before creating the SmartTrade.");
      return;
    }
    const totalShares = smartTps.reduce((sum, tp) => sum + tp.share, 0);
    if (Math.abs(totalShares - 100) > 0.01) {
      setNotice("Take-profit shares must total 100%.");
      return;
    }
    const trade: SmartTrade = {
      id: `st-${Date.now()}`,
      pair: `${selectedSymbol}/USDT`,
      side: smartSide,
      orderType: smartOrderType,
      entryPrice: entry,
      amount: smartAmount,
      takeProfits: smartTps,
      stopEnabled: smartStopEnabled,
      stopPct: smartStopPct,
      status: "Active",
      createdAt: new Date().toISOString(),
    };
    setSmartTrades((current) => [trade, ...current]);
    setSmartView("list");
    setNotice(`${trade.pair} SmartTrade created in paper mode.`);
  };

  const createDcaBot = () => {
    if (!botName.trim() || baseOrder <= 0 || safetyOrder <= 0) {
      setNotice("Add a bot name and valid order amounts.");
      return;
    }
    const bot: DcaBot = {
      id: `bot-${Date.now()}`,
      name: botName.trim(),
      pair: `${selectedSymbol}/USDT`,
      baseOrder,
      safetyOrder,
      maxSafetyOrders,
      deviation,
      stepScale,
      volumeScale,
      takeProfit: botTakeProfit,
      stopEnabled: botStopEnabled,
      stopPct: botStopPct,
      startCondition,
      status: "Running",
      createdAt: new Date().toISOString(),
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

  const dashboard = (
    <div className={styles.pageContent}>
      <div className={styles.pageHeading}>
        <div><h1>Dashboard</h1><p>Your trading overview</p></div>
      </div>

      <div className={styles.heroGrid}>
        <button className={styles.heroCard} onClick={() => { setSection("Smart Trades"); setSmartView("create"); }}>
          <div className={styles.heroArt}><span>↗</span><i>+</i></div>
          <div><small>SMART TRADE</small><h3>Create a SmartTrade</h3><p>Build one trade with entry, multiple take profits and stop loss.</p></div>
          <b>New SmartTrade →</b>
        </button>
        <button className={styles.heroCard} onClick={() => { setSection("DCA bots"); setDcaView("create"); }}>
          <div className={styles.heroArt}><span>◎</span><i>∞</i></div>
          <div><small>DCA BOT</small><h3>Automate a DCA strategy</h3><p>Configure base orders, safety orders and profit targets once.</p></div>
          <b>Create DCA bot →</b>
        </button>
      </div>

      <div className={styles.dashboardGrid}>
        <section className={`${styles.card} ${styles.portfolioOverview}`}>
          <div className={styles.cardHeader}><div><h2>My portfolio</h2><p>Connected exchange balance</p></div><button onClick={() => setSection("My Portfolio")}>View portfolio</button></div>
          <div className={styles.balanceRow}>
            <div><span>Total balance</span><strong>$0.00</strong><small>Connect Binance to see your real portfolio.</small></div>
            <div><span>Paper capital planned</span><strong>{compactMoney(paperCapital)}</strong><small>SmartTrades + active DCA bots</small></div>
          </div>
          <div className={styles.emptyChart}>
            <svg viewBox="0 0 900 160" aria-hidden="true"><path d="M0 118 C90 110 115 122 170 100 S270 66 330 82 S430 130 500 96 S620 48 690 72 S790 114 900 54"/><line x1="0" y1="138" x2="900" y2="138"/></svg>
          </div>
        </section>
        <div className={styles.sideSummary}>
          <section className={styles.card}>
            <div className={styles.summaryTitle}><span className={styles.roundIcon}>↗</span><div><h3>SmartTrades</h3><p>Manual strategy automation</p></div></div>
            <div className={styles.summaryStats}><div><span>Active</span><strong>{activeSmart.length}</strong></div><div><span>Closed</span><strong>{smartTrades.length - activeSmart.length}</strong></div></div>
            <button className={styles.linkButton} onClick={() => setSection("Smart Trades")}>Open SmartTrades →</button>
          </section>
          <section className={styles.card}>
            <div className={styles.summaryTitle}><span className={styles.roundIcon}>◎</span><div><h3>DCA bots</h3><p>Automated averaging bots</p></div></div>
            <div className={styles.summaryStats}><div><span>Running</span><strong>{runningBots.length}</strong></div><div><span>Total</span><strong>{dcaBots.length}</strong></div></div>
            <button className={styles.linkButton} onClick={() => setSection("DCA bots")}>Open DCA bots →</button>
          </section>
        </div>
      </div>

      <section className={styles.card}>
        <div className={styles.cardHeader}><div><h2>Recent activity</h2><p>Your latest paper actions</p></div></div>
        {smartTrades.length || dcaBots.length ? (
          <div className={styles.activityList}>
            {[...smartTrades.map((trade) => ({ id: trade.id, title: `${trade.side} ${trade.pair}`, type: "SmartTrade", date: trade.createdAt })), ...dcaBots.map((bot) => ({ id: bot.id, title: bot.name, type: "DCA bot", date: bot.createdAt }))]
              .sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6).map((item) => (
                <div key={item.id}><span className={styles.activityDot}/><div><strong>{item.title}</strong><small>{item.type} · {new Date(item.date).toLocaleString()}</small></div><span>Paper</span></div>
              ))}
          </div>
        ) : <div className={styles.emptyBlock}><strong>No activity yet</strong><p>Create your first SmartTrade or DCA bot.</p></div>}
      </section>
    </div>
  );

  const portfolio = (
    <div className={styles.pageContent}>
      <div className={styles.pageHeading}>
        <div><h1>My Portfolio</h1><p>Track balances and account performance across connected exchanges.</p></div>
        <button className={styles.primaryButton} onClick={() => setNotice("Exchange connection will be enabled in the next integration step.")}>+ Connect account</button>
      </div>
      <div className={styles.metricGrid}>
        <section className={styles.metricCard}><span>Total balance</span><strong>$0.00</strong><small>0 connected accounts</small></section>
        <section className={styles.metricCard}><span>24h change</span><strong>—</strong><small>Connect an exchange to calculate</small></section>
        <section className={styles.metricCard}><span>Paper capital</span><strong>{compactMoney(paperCapital)}</strong><small>Planned across active strategies</small></section>
      </div>
      <div className={styles.portfolioGrid}>
        <section className={`${styles.card} ${styles.performanceCard}`}>
          <div className={styles.cardHeader}><div><h2>Portfolio balance</h2><p>Last 30 days</p></div><div className={styles.segmented}><button className={styles.activeSegment}>30D</button><button>90D</button><button>1Y</button></div></div>
          <div className={styles.emptyPortfolioChart}>
            <div className={styles.axisLabels}><span>$0</span><span>$0</span><span>$0</span></div>
            <svg viewBox="0 0 900 260"><line x1="20" y1="215" x2="880" y2="215"/><line x1="20" y1="145" x2="880" y2="145"/><line x1="20" y1="75" x2="880" y2="75"/></svg>
            <div><strong>No portfolio data yet</strong><p>Connect Binance to begin tracking balances and P&amp;L.</p></div>
          </div>
        </section>
        <section className={`${styles.card} ${styles.allocationCard}`}>
          <div className={styles.cardHeader}><div><h2>Allocation</h2><p>By asset</p></div></div>
          <div className={styles.donutEmpty}><div><strong>$0</strong><span>Total</span></div></div>
          <div className={styles.emptyBlock}><p>No assets to display.</p></div>
        </section>
      </div>
      <section className={styles.card}>
        <div className={styles.cardHeader}><div><h2>Accounts</h2><p>Exchange API connections</p></div></div>
        <div className={styles.tableWrap}><table><thead><tr><th>Exchange</th><th>Account</th><th>Balance</th><th>24h P&amp;L</th><th>Status</th></tr></thead><tbody><tr className={styles.emptyRow}><td colSpan={5}>No exchange accounts connected yet.</td></tr></tbody></table></div>
      </section>
    </div>
  );

  const smartList = (
    <div className={styles.pageContent}>
      <div className={styles.pageHeading}>
        <div><h1>SmartTrades</h1><p>Create and manage trades with automated exits.</p></div>
        <button className={styles.primaryButton} onClick={() => setSmartView("create")}>+ New SmartTrade</button>
      </div>
      <div className={styles.metricGrid}>
        <section className={styles.metricCard}><span>Active trades</span><strong>{activeSmart.length}</strong><small>Currently open</small></section>
        <section className={styles.metricCard}><span>Total created</span><strong>{smartTrades.length}</strong><small>Paper-mode trades</small></section>
        <section className={styles.metricCard}><span>Capital in active trades</span><strong>{compactMoney(activeSmart.reduce((sum, trade) => sum + trade.amount, 0))}</strong><small>Paper capital</small></section>
      </div>
      <section className={styles.card}>
        <div className={styles.listToolbar}><div className={styles.tabs}><button className={styles.tabActive}>Active</button><button>History</button></div><div className={styles.toolbarSearch}>⌕ <input placeholder="Search SmartTrades"/></div></div>
        <div className={styles.tableWrap}><table><thead><tr><th>Pair</th><th>Side</th><th>Entry</th><th>Volume</th><th>Take profit</th><th>Stop loss</th><th>Status</th><th></th></tr></thead><tbody>
          {activeSmart.length ? activeSmart.map((trade) => <tr key={trade.id}><td><strong>{trade.pair}</strong><small>Binance Spot</small></td><td><span className={trade.side === "Buy" ? styles.greenTag : styles.redTag}>{trade.side}</span></td><td>{money(trade.entryPrice)}</td><td>{compactMoney(trade.amount)}</td><td>{trade.takeProfits.length} target{trade.takeProfits.length > 1 ? "s" : ""}</td><td>{trade.stopEnabled ? `${trade.stopPct}%` : "Off"}</td><td><span className={styles.statusTag}>Active</span></td><td><button className={styles.textAction} onClick={() => setSmartTrades((items) => items.map((item) => item.id === trade.id ? { ...item, status: "Closed" } : item))}>Close</button></td></tr>) : <tr className={styles.emptyRow}><td colSpan={8}>No active SmartTrades. Create your first trade.</td></tr>}
        </tbody></table></div>
      </section>
    </div>
  );

  const smartCreate = (
    <div className={styles.terminalPage}>
      <div className={styles.terminalHeader}>
        <div><button className={styles.backButton} onClick={() => setSmartView("list")}>←</button><div><h1>SmartTrade</h1><p>Binance Spot · Paper mode</p></div></div>
        <div className={styles.pairSelector}>{markets.map((market) => <button key={market.symbol} className={selectedSymbol === market.symbol ? styles.pairActive : ""} onClick={() => setSelectedSymbol(market.symbol)}>{market.symbol}/USDT</button>)}</div>
      </div>
      <div className={styles.tradeTerminal}>
        <section className={styles.chartArea}>
          <div className={styles.chartTopbar}>
            <div className={styles.instrument}><span className={styles.coinAvatar}>{selectedSymbol.slice(0,2)}</span><div><strong>{selectedSymbol}/USDT</strong><small>BINANCE · Spot</small></div></div>
            <div className={styles.liveQuote}><strong>{money(selectedPrice)}</strong><span>Live chart by TradingView</span></div>
            <div className={styles.intervalBar}>{INTERVALS.map((item) => <button key={item} className={interval === item ? styles.intervalActive : ""} onClick={() => setInterval(item)}>{item === "60" ? "1h" : item === "240" ? "4h" : item === "D" ? "1D" : item === "W" ? "1W" : item === "M" ? "1M" : `${item}m`}</button>)}</div>
          </div>
          <div className={styles.chartHost}><TradingViewChart symbol={tvSymbol(selectedSymbol)} interval={interval}/></div>
          <div className={styles.orderTabs}><button className={styles.tabActive}>Open orders</button><button>Trade history</button><button>Notes</button></div>
          <div className={styles.chartBottomEmpty}>No open exchange orders in paper mode.</div>
        </section>
        <aside className={styles.orderPanel}>
          <div className={styles.sideToggle}><button className={smartSide === "Buy" ? styles.buyActive : ""} onClick={() => setSmartSide("Buy")}>Buy</button><button className={smartSide === "Sell" ? styles.sellActive : ""} onClick={() => setSmartSide("Sell")}>Sell</button></div>
          <div className={styles.orderTypeTabs}><button className={smartOrderType === "Market" ? styles.tabActive : ""} onClick={() => setSmartOrderType("Market")}>Market</button><button className={smartOrderType === "Limit" ? styles.tabActive : ""} onClick={() => setSmartOrderType("Limit")}>Limit</button></div>
          <div className={styles.formSection}><h3>Entry order</h3><label><span>Volume</span><div className={styles.inputUnit}><input type="number" min="1" value={smartAmount} onChange={(e) => setSmartAmount(Math.max(1, Number(e.target.value)))}/><b>USDT</b></div></label><label><span>Price</span><div className={styles.inputUnit}><input type="number" step="0.01" disabled={smartOrderType === "Market"} value={smartOrderType === "Market" ? (selectedPrice ?? 0) : smartPrice} onChange={(e) => setSmartPrice(Number(e.target.value))}/><b>USDT</b></div></label></div>
          <div className={styles.formSection}><div className={styles.sectionTitle}><h3>Take profit</h3><button onClick={() => setSmartTps((items) => [...items, { target: (items.at(-1)?.target ?? 0) + 3, share: 0 }])}>+ Add target</button></div>{smartTps.map((tp, index) => <div key={index} className={styles.tpRow}><span>TP {index + 1}</span><div className={styles.inputUnit}><input type="number" value={tp.target} onChange={(e) => setSmartTps((items) => items.map((item, i) => i === index ? { ...item, target: Number(e.target.value) } : item))}/><b>%</b></div><div className={styles.inputUnit}><input type="number" value={tp.share} onChange={(e) => setSmartTps((items) => items.map((item, i) => i === index ? { ...item, share: Number(e.target.value) } : item))}/><b>% sell</b></div>{smartTps.length > 1 && <button className={styles.removeButton} onClick={() => setSmartTps((items) => items.filter((_, i) => i !== index))}>×</button>}</div>)}</div>
          <div className={styles.formSection}><label className={styles.switchRow}><div><span>Stop loss</span><small>Close the trade if price moves against you.</small></div><input type="checkbox" checked={smartStopEnabled} onChange={(e) => setSmartStopEnabled(e.target.checked)}/></label>{smartStopEnabled && <label><span>Stop loss deviation</span><div className={styles.inputUnit}><input type="number" value={smartStopPct} onChange={(e) => setSmartStopPct(Number(e.target.value))}/><b>%</b></div></label>}</div>
          <div className={styles.orderSummary}><div><span>Trade volume</span><strong>{compactMoney(smartAmount)}</strong></div><div><span>Entry</span><strong>{smartOrderType}</strong></div><div><span>Take profits</span><strong>{smartTps.length}</strong></div></div>
          <button className={smartSide === "Buy" ? styles.buyButton : styles.sellButton} onClick={createSmartTrade}>Create {smartSide} SmartTrade</button>
          <p className={styles.paperNote}>Paper mode only. No exchange order will be sent.</p>
        </aside>
      </div>
    </div>
  );

  const dcaList = (
    <div className={styles.pageContent}>
      <div className={styles.pageHeading}>
        <div><h1>DCA bots</h1><p>Create automated averaging strategies for Binance Spot.</p></div>
        <button className={styles.primaryButton} onClick={() => setDcaView("create")}>+ Create DCA bot</button>
      </div>
      <div className={styles.metricGrid}>
        <section className={styles.metricCard}><span>Running bots</span><strong>{runningBots.length}</strong><small>Paper mode</small></section>
        <section className={styles.metricCard}><span>Total bots</span><strong>{dcaBots.length}</strong><small>Created strategies</small></section>
        <section className={styles.metricCard}><span>Planned bot capital</span><strong>{compactMoney(dcaBots.filter((bot) => bot.status === "Running").reduce((sum, bot) => sum + bot.baseOrder + Array.from({length: bot.maxSafetyOrders}, (_, i) => bot.safetyOrder * Math.pow(bot.volumeScale, i)).reduce((a,b) => a+b,0),0))}</strong><small>Maximum configured capital</small></section>
      </div>
      <section className={styles.card}>
        <div className={styles.listToolbar}><div className={styles.tabs}><button className={styles.tabActive}>My bots</button><button>History</button></div><div className={styles.toolbarSearch}>⌕ <input placeholder="Search bots"/></div></div>
        <div className={styles.tableWrap}><table><thead><tr><th>Bot</th><th>Pair</th><th>Profit target</th><th>Safety orders</th><th>Max capital</th><th>Status</th><th></th></tr></thead><tbody>
          {dcaBots.length ? dcaBots.map((bot) => {
            const total = bot.baseOrder + Array.from({length: bot.maxSafetyOrders}, (_, i) => bot.safetyOrder * Math.pow(bot.volumeScale, i)).reduce((a,b) => a+b,0);
            return <tr key={bot.id}><td><strong>{bot.name}</strong><small>{bot.startCondition}</small></td><td>{bot.pair}<small>Binance Spot</small></td><td>+{bot.takeProfit}%</td><td>{bot.maxSafetyOrders}</td><td>{compactMoney(total)}</td><td><span className={bot.status === "Running" ? styles.statusTag : styles.mutedTag}>{bot.status}</span></td><td><button className={styles.textAction} onClick={() => setDcaBots((items) => items.map((item) => item.id === bot.id ? {...item, status: item.status === "Running" ? "Stopped" : "Running"} : item))}>{bot.status === "Running" ? "Stop" : "Start"}</button></td></tr>;
          }) : <tr className={styles.emptyRow}><td colSpan={7}>No DCA bots yet. Create your first bot.</td></tr>}
        </tbody></table></div>
      </section>
    </div>
  );

  const dcaCreate = (
    <div className={styles.builderPage}>
      <div className={styles.pageHeading}>
        <div className={styles.headingWithBack}><button className={styles.backButton} onClick={() => setDcaView("list")}>←</button><div><h1>Create DCA bot</h1><p>Build a long DCA strategy for Binance Spot.</p></div></div>
        <button className={styles.primaryButton} onClick={createDcaBot}>Create bot</button>
      </div>
      <div className={styles.builderGrid}>
        <section className={styles.builderForm}>
          <div className={styles.builderSteps}><button className={styles.stepActive}>1 Main settings</button><button>2 Entry order</button><button>3 DCA orders</button><button>4 Take profit</button></div>
          <div className={styles.builderCard}>
            <h2>Main settings</h2>
            <div className={styles.formGrid}><label><span>Bot name</span><input value={botName} onChange={(e) => setBotName(e.target.value)}/></label><label><span>Pair</span><select value={selectedSymbol} onChange={(e) => setSelectedSymbol(e.target.value)}>{markets.map((market) => <option key={market.symbol} value={market.symbol}>{market.symbol}/USDT</option>)}</select></label><label><span>Exchange</span><select><option>Binance Spot</option></select></label><label><span>Strategy</span><select><option>Long</option></select></label></div>
          </div>
          <div className={styles.builderCard}>
            <h2>Entry order</h2>
            <div className={styles.formGrid}><label><span>Base order size</span><div className={styles.inputUnit}><input type="number" min="1" value={baseOrder} onChange={(e) => setBaseOrder(Math.max(1,Number(e.target.value)))}/><b>USDT</b></div></label><label><span>Start condition</span><select value={startCondition} onChange={(e) => setStartCondition(e.target.value)}><option>Immediately</option><option>TradingView signal</option><option>Manual</option></select></label></div>
          </div>
          <div className={styles.builderCard}>
            <h2>DCA orders</h2>
            <div className={styles.formGrid}><label><span>Safety order size</span><div className={styles.inputUnit}><input type="number" min="1" value={safetyOrder} onChange={(e) => setSafetyOrder(Math.max(1,Number(e.target.value)))}/><b>USDT</b></div></label><label><span>Max safety orders</span><input type="number" min="1" max="20" value={maxSafetyOrders} onChange={(e) => setMaxSafetyOrders(clamp(Number(e.target.value),1,20))}/></label><label><span>Price deviation</span><div className={styles.inputUnit}><input type="number" min="0.1" step="0.1" value={deviation} onChange={(e) => setDeviation(Math.max(.1,Number(e.target.value)))}/><b>%</b></div></label><label><span>Safety order step scale</span><input type="number" min="0.1" step="0.1" value={stepScale} onChange={(e) => setStepScale(Math.max(.1,Number(e.target.value)))}/></label><label><span>Safety order volume scale</span><input type="number" min="0.1" step="0.1" value={volumeScale} onChange={(e) => setVolumeScale(Math.max(.1,Number(e.target.value)))}/></label></div>
          </div>
          <div className={styles.builderCard}>
            <h2>Take profit &amp; stop loss</h2>
            <div className={styles.formGrid}><label><span>Take profit</span><div className={styles.inputUnit}><input type="number" min="0.1" step="0.1" value={botTakeProfit} onChange={(e) => setBotTakeProfit(Math.max(.1,Number(e.target.value)))}/><b>%</b></div></label><label className={styles.switchRow}><div><span>Stop loss</span><small>Optional downside protection</small></div><input type="checkbox" checked={botStopEnabled} onChange={(e) => setBotStopEnabled(e.target.checked)}/></label>{botStopEnabled && <label><span>Stop loss</span><div className={styles.inputUnit}><input type="number" min="0.1" value={botStopPct} onChange={(e) => setBotStopPct(Math.max(.1,Number(e.target.value)))}/><b>%</b></div></label>}</div>
          </div>
        </section>
        <aside className={styles.botPreview}>
          <div className={styles.previewHeader}><div><span className={styles.coinAvatar}>{selectedSymbol.slice(0,2)}</span><div><strong>{selectedSymbol}/USDT</strong><small>Binance Spot</small></div></div><span>Paper</span></div>
          <div className={styles.previewPrice}><span>Current price</span><strong>{money(selectedPrice)}</strong></div>
          <div className={styles.previewSummary}><div><span>Base order</span><strong>{compactMoney(baseOrder)}</strong></div><div><span>Safety orders</span><strong>{maxSafetyOrders}</strong></div><div><span>Maximum capital</span><strong>{compactMoney(dcaTotal)}</strong></div><div><span>Take profit</span><strong>+{botTakeProfit}%</strong></div></div>
          <div className={styles.previewTable}><div className={styles.previewTableHead}><span>Order</span><span>Deviation</span><span>Price</span><span>Volume</span></div><div className={styles.previewRow}><span>Base</span><span>0%</span><span>{money(selectedPrice)}</span><span>{compactMoney(baseOrder)}</span></div>{dcaPreview.map((row) => <div key={row.index} className={styles.previewRow}><span>SO {row.index}</span><span>-{row.deviation.toFixed(2)}%</span><span>{money(row.price)}</span><span>{compactMoney(row.amount)}</span></div>)}</div>
          <button className={styles.primaryButton} onClick={createDcaBot}>Create DCA bot</button>
          <p className={styles.paperNote}>The bot will run in paper mode until a Binance API connection is enabled.</p>
        </aside>
      </div>
    </div>
  );

  return (
    <main className={styles.appShell}>
      <aside className={styles.sidebar}>
        <button className={styles.wordmark} onClick={() => openSection("Dashboard")}><span>LN</span><strong>LABNARRATIVE</strong></button>
        <nav className={styles.nav} aria-label="Main navigation">{NAV.map((item) => <button key={item} className={section === item ? styles.navActive : ""} onClick={() => openSection(item)}><span>{navGlyph(item)}</span>{item}</button>)}</nav>
        <div className={styles.sidebarBottom}><button onClick={() => setNotice("Binance API connection is the next integration step.")}><span>⊕</span>Connect exchange</button><div><span className={styles.paperDot}/>Paper trading</div></div>
      </aside>
      <section className={styles.main}>
        <header className={styles.topbar}>
          <label className={styles.globalSearch}><span>⌕</span><input value={globalSearch} onChange={(e) => handleGlobalSearch(e.target.value)} placeholder="Search"/><kbd>⌘ K</kbd></label>
          <div className={styles.topbarRight}><button className={styles.iconButton}>?</button><button className={styles.iconButton}>♢</button><button className={styles.avatarButton}>K</button></div>
        </header>
        {notice && <button className={styles.notice} onClick={() => setNotice("")}>{notice}<span>×</span></button>}
        {section === "Dashboard" && dashboard}
        {section === "My Portfolio" && portfolio}
        {section === "Smart Trades" && (smartView === "list" ? smartList : smartCreate)}
        {section === "DCA bots" && (dcaView === "list" ? dcaList : dcaCreate)}
      </section>
    </main>
  );
}
