"use client";

import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./trading-automations.module.css";

type Area = "dashboard" | "portfolio" | "bots";
type BotView = "all" | "active" | "closed";
type PerformanceRange = "1D" | "1W" | "1M" | "1Y";

type Market = {
  symbol: string;
  exchangeSymbol: string;
  label: string;
  price: number | null;
  bid: number | null;
  ask: number | null;
  change24h: number;
  quoteVolume24h: number;
};

type LegacyBot = {
  id: string;
  name: string;
  pair: string;
  pairs?: string[];
  allPairs?: boolean;
  baseOrder: number;
  safetyOrder: number;
  maxSafetyOrders: number;
  limitSafetyOrders?: number;
  maxActiveTrades?: number;
  deviation: number;
  stepScale: number;
  volumeScale: number;
  takeProfit: number;
  stopEnabled: boolean;
  stopPct: number;
  startCondition: string;
  pendingLimitEntries?: Record<string, { price: number; createdAt: string }>;
  status: "Running" | "Stopped";
  createdAt: string;
};

type DcaTrade = {
  id: string;
  botId: string;
  botName: string;
  pair: string;
  entryPrice: number;
  averagePrice: number;
  quantity: number;
  invested: number;
  averagingFilled: number;
  maxAveraging: number;
  activeOrdersLimit?: number;
  status: "Active" | "Closed";
  createdAt: string;
  closedAt?: string;
  realizedPnl?: number;
  lastPrice?: number;
  closeReason?: string;
  exitPrice?: number;
};

type V1BotDraft = LegacyBot & { origin: "v1" };
type DisplayBot = LegacyBot & { origin: "legacy" | "v1" };

type Allocation = {
  symbol: string;
  label: string;
  value: number;
  color: string;
  kind: "asset" | "cash" | "reserved";
};

type DraftForm = {
  name: string;
  symbol: string;
  baseOrder: number;
  safetyOrder: number;
  maxSafetyOrders: number;
  deviation: number;
  stepScale: number;
  volumeScale: number;
  takeProfit: number;
  stopEnabled: boolean;
  stopPct: number;
};

const INITIAL_BALANCE = 100_000;
const LEGACY_BOTS_KEY = "labnarrative-dca-bots-v1";
const LEGACY_TRADES_KEY = "labnarrative-dca-trades-v1";
const V1_BOTS_KEY = "labnarrative-trading-automations-v1-bots";
const COLORS = ["#b8f64a", "#7dd3fc", "#c4b5fd", "#f6c177", "#67e8a5", "#fb7185", "#8ea0ad"];
const FALLBACK_MARKETS: Market[] = [
  { symbol: "BTC", exchangeSymbol: "BTCUSDT", label: "Bitcoin", price: null, bid: null, ask: null, change24h: 0, quoteVolume24h: 0 },
  { symbol: "ETH", exchangeSymbol: "ETHUSDT", label: "Ethereum", price: null, bid: null, ask: null, change24h: 0, quoteVolume24h: 0 },
  { symbol: "SOL", exchangeSymbol: "SOLUSDT", label: "Solana", price: null, bid: null, ask: null, change24h: 0, quoteVolume24h: 0 },
  { symbol: "BNB", exchangeSymbol: "BNBUSDT", label: "BNB", price: null, bid: null, ask: null, change24h: 0, quoteVolume24h: 0 },
];

const DEFAULT_DRAFT: DraftForm = {
  name: "Core DCA",
  symbol: "BTC",
  baseOrder: 100,
  safetyOrder: 100,
  maxSafetyOrders: 5,
  deviation: 1,
  stepScale: 1.2,
  volumeScale: 1.25,
  takeProfit: 1.5,
  stopEnabled: false,
  stopPct: 8,
};

function parseStored<T>(key: string, fallback: T): T {
  try {
    const value = window.localStorage.getItem(key);
    return value ? JSON.parse(value) as T : fallback;
  } catch {
    return fallback;
  }
}

function formatMoney(value: number, compact = false) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: compact ? "compact" : "standard",
    maximumFractionDigits: compact ? 1 : 2,
  }).format(Number.isFinite(value) ? value : 0);
}

function formatPrice(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  const digits = value >= 1_000 ? 0 : value >= 1 ? 2 : 5;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: digits }).format(value);
}

function signedPercent(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function dateLabel(value: string | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function pairSymbol(pair: string) {
  return pair.split("/")[0] || pair.replace(/USDT$/i, "");
}

function botPairs(bot: LegacyBot) {
  if (bot.allPairs) return "All Binance USDT pairs";
  const pairs = bot.pairs?.length ? bot.pairs : [bot.pair];
  return pairs.map((pair) => pair.includes("/") ? pair : `${pair}/USDT`).join(", ");
}

function plannedCapital(bot: LegacyBot) {
  let total = Math.max(0, Number(bot.baseOrder) || 0);
  for (let index = 0; index < Math.max(0, Number(bot.maxSafetyOrders) || 0); index += 1) {
    total += Math.max(0, Number(bot.safetyOrder) || 0) * Math.pow(Math.max(0, Number(bot.volumeScale) || 1), index);
  }
  return total;
}

function pendingReserveForTrade(trade: DcaTrade, bot: LegacyBot | undefined) {
  if (!bot || trade.status !== "Active") return 0;
  const remaining = Math.max(0, (trade.maxAveraging || bot.maxSafetyOrders || 0) - (trade.averagingFilled || 0));
  const activeLimit = Math.min(remaining, Math.max(1, trade.activeOrdersLimit ?? bot.limitSafetyOrders ?? 1));
  let reserve = 0;
  for (let offset = 0; offset < activeLimit; offset += 1) {
    reserve += bot.safetyOrder * Math.pow(bot.volumeScale || 1, (trade.averagingFilled || 0) + offset);
  }
  return reserve;
}

function marketForPair(markets: Market[], pair: string) {
  return markets.find((market) => market.symbol === pairSymbol(pair));
}

function MiniSpark({ value }: { value: number }) {
  const bars = useMemo(() => Array.from({ length: 14 }, (_, index) => {
    const wave = Math.sin(index * 1.17 + value) * 18;
    const drift = value * (index / 13) * 1.25;
    return Math.max(16, Math.min(88, 48 + wave + drift));
  }), [value]);
  return <div className={`${styles.miniSpark} ${value < 0 ? styles.negativeSpark : ""}`} aria-hidden="true">
    {bars.map((height, index) => <i key={index} style={{ height: `${height}%` }} />)}
  </div>;
}

function PerformanceChart({ points, accent = "#b8f64a" }: { points: number[]; accent?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const host = hostRef.current;
    if (!canvas || !host || points.length < 2) return;
    const ratio = window.devicePixelRatio || 1;
    const width = host.clientWidth;
    const height = host.clientHeight;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.scale(ratio, ratio);
    context.clearRect(0, 0, width, height);

    const padding = { top: 18, right: 12, bottom: 22, left: 12 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;
    const minimum = Math.min(...points);
    const maximum = Math.max(...points);
    const span = Math.max(maximum - minimum, Math.max(1, maximum * 0.004));
    const coordinates = points.map((point, index) => ({
      x: padding.left + (index / (points.length - 1)) * chartWidth,
      y: padding.top + (1 - (point - minimum) / span) * chartHeight,
    }));

    context.strokeStyle = "rgba(255,255,255,.07)";
    context.lineWidth = 1;
    for (let row = 0; row < 4; row += 1) {
      const y = padding.top + row * chartHeight / 3;
      context.beginPath();
      context.moveTo(padding.left, y);
      context.lineTo(width - padding.right, y);
      context.stroke();
    }

    const gradient = context.createLinearGradient(0, padding.top, 0, height);
    gradient.addColorStop(0, `${accent}38`);
    gradient.addColorStop(1, `${accent}00`);
    context.beginPath();
    coordinates.forEach((point, index) => index === 0 ? context.moveTo(point.x, point.y) : context.lineTo(point.x, point.y));
    context.lineTo(coordinates[coordinates.length - 1].x, height - padding.bottom);
    context.lineTo(coordinates[0].x, height - padding.bottom);
    context.closePath();
    context.fillStyle = gradient;
    context.fill();

    context.beginPath();
    coordinates.forEach((point, index) => index === 0 ? context.moveTo(point.x, point.y) : context.lineTo(point.x, point.y));
    context.strokeStyle = accent;
    context.lineWidth = 2.2;
    context.lineJoin = "round";
    context.lineCap = "round";
    context.stroke();

    if (hoverIndex != null) {
      const point = coordinates[hoverIndex];
      context.strokeStyle = "rgba(255,255,255,.22)";
      context.beginPath();
      context.moveTo(point.x, padding.top);
      context.lineTo(point.x, height - padding.bottom);
      context.stroke();
      context.fillStyle = "#111513";
      context.beginPath();
      context.arc(point.x, point.y, 5, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = accent;
      context.lineWidth = 2;
      context.stroke();
    }
  }, [accent, hoverIndex, points]);

  useEffect(() => {
    draw();
    const observer = new ResizeObserver(draw);
    if (hostRef.current) observer.observe(hostRef.current);
    return () => observer.disconnect();
  }, [draw]);

  const handlePointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
    setHoverIndex(Math.round(ratio * (points.length - 1)));
  };

  return <div ref={hostRef} className={styles.performanceChart} onPointerMove={handlePointer} onPointerLeave={() => setHoverIndex(null)}>
    <canvas ref={canvasRef} aria-label="Account performance chart" />
    {hoverIndex != null ? <span className={styles.chartTooltip} style={{ left: `${hoverIndex / (points.length - 1) * 100}%` }}>{formatMoney(points[hoverIndex])}</span> : null}
    <div className={styles.chartAxis}><span>Start</span><span>Now</span></div>
  </div>;
}

function AllocationDonut({ allocations, total }: { allocations: Allocation[]; total: number }) {
  const [focused, setFocused] = useState<Allocation | null>(null);
  let cursor = 0;
  const stops = allocations.map((allocation) => {
    const start = cursor;
    cursor += total > 0 ? allocation.value / total * 100 : 0;
    return `${allocation.color} ${start}% ${cursor}%`;
  });
  const gradient = stops.length ? `conic-gradient(${stops.join(",")})` : "conic-gradient(#29302c 0 100%)";
  const focusValue = focused?.value ?? total;
  return <div className={styles.allocationBlock}>
    <div className={styles.donut} style={{ "--donut": gradient } as CSSProperties}>
      <div><span>{focused?.symbol ?? "Net value"}</span><strong>{formatMoney(focusValue, true)}</strong><small>{focused && total > 0 ? `${(focused.value / total * 100).toFixed(1)}%` : `${allocations.length} components`}</small></div>
    </div>
    <div className={styles.allocationLegend}>
      {allocations.map((allocation) => <button key={`${allocation.kind}-${allocation.symbol}`} onPointerEnter={() => setFocused(allocation)} onPointerLeave={() => setFocused(null)} onFocus={() => setFocused(allocation)} onBlur={() => setFocused(null)}>
        <i style={{ background: allocation.color }} />
        <span>{allocation.label}<small>{total > 0 ? `${(allocation.value / total * 100).toFixed(1)}%` : "0%"}</small></span>
        <strong>{formatMoney(allocation.value)}</strong>
      </button>)}
    </div>
  </div>;
}

export default function TradingAutomationsV1() {
  const [area, setArea] = useState<Area>("dashboard");
  const [botView, setBotView] = useState<BotView>("all");
  const [range, setRange] = useState<PerformanceRange>("1M");
  const [markets, setMarkets] = useState<Market[]>(FALLBACK_MARKETS);
  const [marketLive, setMarketLive] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [legacyBots, setLegacyBots] = useState<LegacyBot[]>([]);
  const [v1Bots, setV1Bots] = useState<V1BotDraft[]>([]);
  const [trades, setTrades] = useState<DcaTrade[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedBotId, setSelectedBotId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftForm>(DEFAULT_DRAFT);
  const [notice, setNotice] = useState("");

  const loadMarkets = useCallback(async () => {
    try {
      const response = await fetch("/api/trader/markets", { cache: "no-store" });
      if (!response.ok) throw new Error("Market feed unavailable");
      const payload = await response.json() as { markets?: Market[]; live?: boolean; generatedAt?: string };
      if (payload.markets?.length) setMarkets(payload.markets);
      setMarketLive(Boolean(payload.live));
      setUpdatedAt(payload.generatedAt ?? new Date().toISOString());
    } catch {
      setMarketLive(false);
      setUpdatedAt(new Date().toISOString());
    }
  }, []);

  useEffect(() => {
    setLegacyBots(parseStored<LegacyBot[]>(LEGACY_BOTS_KEY, []));
    setTrades(parseStored<DcaTrade[]>(LEGACY_TRADES_KEY, []));
    setV1Bots(parseStored<V1BotDraft[]>(V1_BOTS_KEY, []));
    void loadMarkets();
    const timer = window.setInterval(() => void loadMarkets(), 30_000);
    return () => window.clearInterval(timer);
  }, [loadMarkets]);

  const bots = useMemo<DisplayBot[]>(() => [
    ...v1Bots.map((bot) => ({ ...bot, origin: "v1" as const })),
    ...legacyBots.map((bot) => ({ ...bot, origin: "legacy" as const })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()), [legacyBots, v1Bots]);

  const activeTrades = useMemo(() => trades.filter((trade) => trade.status === "Active"), [trades]);
  const closedTrades = useMemo(() => trades.filter((trade) => trade.status === "Closed").sort((a, b) => new Date(b.closedAt ?? b.createdAt).getTime() - new Date(a.closedAt ?? a.createdAt).getTime()), [trades]);
  const marketMap = useMemo(() => new Map(markets.map((market) => [market.symbol, market])), [markets]);

  const account = useMemo(() => {
    const realized = closedTrades.reduce((sum, trade) => sum + (Number(trade.realizedPnl) || 0), 0);
    const invested = activeTrades.reduce((sum, trade) => sum + (Number(trade.invested) || 0), 0);
    const unrealized = activeTrades.reduce((sum, trade) => {
      const price = marketMap.get(pairSymbol(trade.pair))?.price ?? trade.lastPrice ?? trade.averagePrice;
      return sum + (price - trade.averagePrice) * trade.quantity;
    }, 0);
    const averagingReserve = activeTrades.reduce((sum, trade) => sum + pendingReserveForTrade(trade, bots.find((bot) => bot.id === trade.botId)), 0);
    const entryReserve = bots.reduce((sum, bot) => sum + Object.keys(bot.pendingLimitEntries ?? {}).length * Math.max(0, bot.baseOrder || 0), 0);
    const reserved = averagingReserve + entryReserve;
    const available = Math.max(0, INITIAL_BALANCE + realized - invested - reserved);
    const assets = activeTrades.reduce((sum, trade) => {
      const price = marketMap.get(pairSymbol(trade.pair))?.price ?? trade.lastPrice ?? trade.averagePrice;
      return sum + price * trade.quantity;
    }, 0);
    return { realized, unrealized, invested, reserved, available, assets, equity: available + reserved + assets };
  }, [activeTrades, bots, closedTrades, marketMap]);

  const allocations = useMemo<Allocation[]>(() => {
    const grouped = new Map<string, number>();
    activeTrades.forEach((trade) => {
      const symbol = pairSymbol(trade.pair);
      const price = marketMap.get(symbol)?.price ?? trade.lastPrice ?? trade.averagePrice;
      grouped.set(symbol, (grouped.get(symbol) ?? 0) + price * trade.quantity);
    });
    const assetRows = Array.from(grouped.entries()).sort((a, b) => b[1] - a[1]).map(([symbol, value], index) => ({
      symbol,
      label: marketMap.get(symbol)?.label ?? symbol,
      value,
      color: COLORS[index % COLORS.length],
      kind: "asset" as const,
    }));
    const rows: Allocation[] = [...assetRows];
    if (account.reserved > 0) rows.push({ symbol: "RSV", label: "Reserved", value: account.reserved, color: "#4d5b53", kind: "reserved" });
    rows.push({ symbol: "USDT", label: "Available cash", value: account.available, color: assetRows.length ? "#27332b" : "#b8f64a", kind: "cash" });
    return rows;
  }, [account.available, account.reserved, activeTrades, marketMap]);

  const performancePoints = useMemo(() => {
    const windows: Record<PerformanceRange, number> = { "1D": 1, "1W": 7, "1M": 30, "1Y": 365 };
    const now = Date.now();
    const start = now - windows[range] * 86_400_000;
    const ordered = [...closedTrades].sort((a, b) => new Date(a.closedAt ?? a.createdAt).getTime() - new Date(b.closedAt ?? b.createdAt).getTime());
    const baseline = ordered.filter((trade) => new Date(trade.closedAt ?? trade.createdAt).getTime() < start).reduce((sum, trade) => sum + (trade.realizedPnl ?? 0), 0);
    return Array.from({ length: 41 }, (_, index) => {
      const cutoff = start + (now - start) * (index / 40);
      const periodPnl = ordered.filter((trade) => {
        const time = new Date(trade.closedAt ?? trade.createdAt).getTime();
        return time >= start && time <= cutoff;
      }).reduce((sum, trade) => sum + (trade.realizedPnl ?? 0), 0);
      return INITIAL_BALANCE + baseline + periodPnl + (index === 40 ? account.unrealized : 0);
    });
  }, [account.unrealized, closedTrades, range]);

  const holdings = useMemo(() => {
    const grouped = new Map<string, { quantity: number; cost: number; value: number; change24h: number }>();
    activeTrades.forEach((trade) => {
      const symbol = pairSymbol(trade.pair);
      const market = marketMap.get(symbol);
      const price = market?.price ?? trade.lastPrice ?? trade.averagePrice;
      const current = grouped.get(symbol) ?? { quantity: 0, cost: 0, value: 0, change24h: market?.change24h ?? 0 };
      current.quantity += trade.quantity;
      current.cost += trade.invested;
      current.value += price * trade.quantity;
      grouped.set(symbol, current);
    });
    return Array.from(grouped.entries()).map(([symbol, row]) => ({ symbol, ...row, pnl: row.value - row.cost })).sort((a, b) => b.value - a.value);
  }, [activeTrades, marketMap]);

  const saveDraft = () => {
    if (!draft.name.trim() || draft.baseOrder <= 0 || draft.safetyOrder <= 0 || draft.maxSafetyOrders < 1) {
      setNotice("Complete the name and order values before saving this bot draft.");
      return;
    }
    const bot: V1BotDraft = {
      id: `v1-bot-${Date.now()}`,
      name: draft.name.trim(),
      pair: `${draft.symbol}/USDT`,
      baseOrder: draft.baseOrder,
      safetyOrder: draft.safetyOrder,
      maxSafetyOrders: Math.round(draft.maxSafetyOrders),
      limitSafetyOrders: 1,
      maxActiveTrades: 1,
      deviation: draft.deviation,
      stepScale: draft.stepScale,
      volumeScale: draft.volumeScale,
      takeProfit: draft.takeProfit,
      stopEnabled: draft.stopEnabled,
      stopPct: draft.stopPct,
      startCondition: "Manual approval",
      status: "Stopped",
      createdAt: new Date().toISOString(),
      origin: "v1",
    };
    const next = [bot, ...v1Bots];
    setV1Bots(next);
    window.localStorage.setItem(V1_BOTS_KEY, JSON.stringify(next));
    setShowCreate(false);
    setSelectedBotId(bot.id);
    setDraft(DEFAULT_DRAFT);
    setNotice("Bot draft saved. Activation stays unavailable until the durable execution engine is ready.");
  };

  const deleteDraft = (id: string) => {
    const next = v1Bots.filter((bot) => bot.id !== id);
    setV1Bots(next);
    window.localStorage.setItem(V1_BOTS_KEY, JSON.stringify(next));
    if (selectedBotId === id) setSelectedBotId(null);
  };

  const selectedBot = bots.find((bot) => bot.id === selectedBotId) ?? null;
  const topMarkets = markets.slice(0, 6);
  const totalPnl = account.realized + account.unrealized;
  const totalPnlPct = totalPnl / INITIAL_BALANCE * 100;

  const navigate = (next: Area) => {
    setArea(next);
    setSelectedBotId(null);
  };

  const pageTitle = area === "dashboard" ? "Good morning" : area === "portfolio" ? "Portfolio" : "Bots";

  const dashboard = <main className={styles.page}>
    <section className={styles.heroGrid}>
      <article className={`${styles.card} ${styles.balanceHero}`}>
        <div className={styles.cardHeading}><div><span>Portfolio value</span><small>Paper ledger · live prices</small></div><span className={marketLive ? styles.livePill : styles.offlinePill}>{marketLive ? "Live" : "Delayed"}</span></div>
        <strong>{formatMoney(account.equity)}</strong>
        <div className={styles.balanceDelta}><b className={totalPnl >= 0 ? styles.positive : styles.negative}>{formatMoney(totalPnl)} · {signedPercent(totalPnlPct)}</b><span>All-time paper return</span></div>
        <div className={styles.heroComposition}>
          <div style={{ flex: Math.max(1, account.available) }}><span>Available</span><b>{formatMoney(account.available, true)}</b></div>
          {account.assets > 0 ? <div style={{ flex: account.assets }}><span>Assets</span><b>{formatMoney(account.assets, true)}</b></div> : null}
          {account.reserved > 0 ? <div style={{ flex: account.reserved }}><span>Reserved</span><b>{formatMoney(account.reserved, true)}</b></div> : null}
        </div>
      </article>
      <article className={`${styles.card} ${styles.engineCard}`}>
        <span className={styles.kicker}>Execution layer</span>
        <div className={styles.engineState}><i /> <strong>Not connected</strong></div>
        <p>v1 is read-only for live markets and preserves your paper history. Exchange credentials and bot activation will arrive with the durable server engine.</p>
        <div className={styles.engineRoadmap}><span className={styles.doneStep}>Interface</span><i /><span>Engine</span><i /><span>Binance</span></div>
      </article>
    </section>

    <section className={styles.metricGrid}>
      <article className={styles.metric}><span>Available balance</span><strong>{formatMoney(account.available)}</strong><small>USDT</small></article>
      <article className={styles.metric}><span>Capital deployed</span><strong>{formatMoney(account.invested)}</strong><small>{activeTrades.length} open {activeTrades.length === 1 ? "position" : "positions"}</small></article>
      <article className={styles.metric}><span>Unrealized P&amp;L</span><strong className={account.unrealized >= 0 ? styles.positive : styles.negative}>{formatMoney(account.unrealized)}</strong><small>Marked to Binance</small></article>
      <article className={styles.metric}><span>Realized P&amp;L</span><strong className={account.realized >= 0 ? styles.positive : styles.negative}>{formatMoney(account.realized)}</strong><small>{closedTrades.length} closed trades</small></article>
    </section>

    <section className={styles.dashboardSplit}>
      <article className={`${styles.card} ${styles.performanceCard}`}>
        <div className={styles.cardHeading}><div><span>Performance</span><small>Realized equity with the current live mark</small></div><div className={styles.rangeTabs}>{(["1D", "1W", "1M", "1Y"] as PerformanceRange[]).map((item) => <button key={item} className={range === item ? styles.activeRange : ""} onClick={() => setRange(item)}>{item}</button>)}</div></div>
        <PerformanceChart points={performancePoints} accent={totalPnl >= 0 ? "#b8f64a" : "#fb7185"} />
      </article>
      <article className={`${styles.card} ${styles.allocationCard}`}>
        <div className={styles.cardHeading}><div><span>Allocation</span><small>Cash, reserves and active positions</small></div><button className={styles.textButton} onClick={() => navigate("portfolio")}>Explore</button></div>
        <AllocationDonut allocations={allocations} total={account.equity} />
      </article>
    </section>

    <section className={styles.sectionBlock}>
      <div className={styles.sectionHeading}><div><span className={styles.kicker}>Market pulse</span><h2>Binance Spot</h2></div><button className={styles.textButton} onClick={() => void loadMarkets()}>Refresh prices</button></div>
      <div className={styles.marketGrid}>{topMarkets.map((market) => <article className={styles.marketCard} key={market.symbol}>
        <div><span className={styles.assetMark}>{market.symbol.slice(0, 1)}</span><span><strong>{market.symbol}</strong><small>{market.label}</small></span></div>
        <MiniSpark value={market.change24h} />
        <div><strong>{formatPrice(market.price)}</strong><span className={market.change24h >= 0 ? styles.positive : styles.negative}>{signedPercent(market.change24h)}</span></div>
      </article>)}</div>
    </section>

    <section className={styles.sectionBlock}>
      <div className={styles.sectionHeading}><div><span className={styles.kicker}>Automations</span><h2>Bot overview</h2></div><button className={styles.textButton} onClick={() => navigate("bots")}>View bots</button></div>
      <div className={`${styles.card} ${styles.compactTable}`}>
        <div className={styles.tableHeader}><span>Bot</span><span>Market</span><span>Capital plan</span><span>Trades</span><span>State</span></div>
        {bots.slice(0, 4).map((bot) => <button className={styles.tableRow} key={bot.id} onClick={() => { setArea("bots"); setSelectedBotId(bot.id); }}>
          <span><strong>{bot.name}</strong><small>{bot.origin === "legacy" ? "v0.1 configuration" : "v1 draft"}</small></span>
          <span>{botPairs(bot)}</span><span>{formatMoney(plannedCapital(bot))}</span><span>{trades.filter((trade) => trade.botId === bot.id).length}</span><span className={styles.pausedBadge}>Paused</span>
        </button>)}
        {!bots.length ? <div className={styles.emptyState}><strong>No bots yet</strong><span>Create a configuration draft when you are ready.</span></div> : null}
      </div>
    </section>
  </main>;

  const portfolio = <main className={styles.page}>
    <section className={styles.portfolioIntro}>
      <div><span className={styles.kicker}>Paper portfolio</span><h2>{formatMoney(account.equity)}</h2><p>Live Binance valuation of the preserved v0.1 ledger.</p></div>
      <div className={styles.portfolioChange}><span>Total return</span><strong className={totalPnl >= 0 ? styles.positive : styles.negative}>{signedPercent(totalPnlPct)}</strong><small>{formatMoney(totalPnl)}</small></div>
    </section>
    <section className={styles.portfolioMainGrid}>
      <article className={`${styles.card} ${styles.performanceCard}`}>
        <div className={styles.cardHeading}><div><span>Portfolio performance</span><small>Hover the chart for exact equity</small></div><div className={styles.rangeTabs}>{(["1D", "1W", "1M", "1Y"] as PerformanceRange[]).map((item) => <button key={item} className={range === item ? styles.activeRange : ""} onClick={() => setRange(item)}>{item}</button>)}</div></div>
        <PerformanceChart points={performancePoints} accent={totalPnl >= 0 ? "#b8f64a" : "#fb7185"} />
      </article>
      <article className={`${styles.card} ${styles.allocationCard}`}>
        <div className={styles.cardHeading}><div><span>Balance composition</span><small>Interactive allocation</small></div></div>
        <AllocationDonut allocations={allocations} total={account.equity} />
      </article>
    </section>
    <section className={styles.metricGrid}>
      <article className={styles.metric}><span>Cash</span><strong>{formatMoney(account.available)}</strong><div className={styles.metricTrack}><i style={{ width: `${account.equity ? account.available / account.equity * 100 : 0}%` }} /></div></article>
      <article className={styles.metric}><span>Digital assets</span><strong>{formatMoney(account.assets)}</strong><div className={styles.metricTrack}><i style={{ width: `${account.equity ? account.assets / account.equity * 100 : 0}%` }} /></div></article>
      <article className={styles.metric}><span>Reserved orders</span><strong>{formatMoney(account.reserved)}</strong><div className={styles.metricTrack}><i style={{ width: `${account.equity ? account.reserved / account.equity * 100 : 0}%` }} /></div></article>
      <article className={styles.metric}><span>Net P&amp;L</span><strong className={totalPnl >= 0 ? styles.positive : styles.negative}>{formatMoney(totalPnl)}</strong><small>Realized + unrealized</small></article>
    </section>
    <section className={styles.sectionBlock}>
      <div className={styles.sectionHeading}><div><span className={styles.kicker}>Holdings</span><h2>Asset breakdown</h2></div><span className={styles.subtleText}>{holdings.length} assets</span></div>
      <div className={`${styles.card} ${styles.holdingsTable}`}>
        <div className={styles.holdingsHeader}><span>Asset</span><span>Quantity</span><span>Avg. cost</span><span>Market value</span><span>24h</span><span>P&amp;L</span></div>
        {holdings.map((holding) => <div className={styles.holdingsRow} key={holding.symbol}>
          <span><i className={styles.assetMark}>{holding.symbol.slice(0, 1)}</i><b>{holding.symbol}<small>{marketMap.get(holding.symbol)?.label ?? holding.symbol}</small></b></span>
          <span>{holding.quantity.toLocaleString("en-US", { maximumFractionDigits: 8 })}</span><span>{formatMoney(holding.cost / Math.max(holding.quantity, 0.00000001))}</span><span>{formatMoney(holding.value)}</span><span className={holding.change24h >= 0 ? styles.positive : styles.negative}>{signedPercent(holding.change24h)}</span><span className={holding.pnl >= 0 ? styles.positive : styles.negative}>{formatMoney(holding.pnl)}</span>
        </div>)}
        {!holdings.length ? <div className={styles.emptyState}><strong>Your portfolio is fully in USDT</strong><span>Active paper positions will appear here with live valuation.</span></div> : null}
      </div>
    </section>
    <section className={styles.sectionBlock}>
      <div className={styles.sectionHeading}><div><span className={styles.kicker}>Context</span><h2>Live market watch</h2></div><span className={styles.subtleText}>Not portfolio holdings</span></div>
      <div className={styles.watchGrid}>{topMarkets.map((market) => <article className={styles.watchCard} key={market.symbol}><span>{market.symbol}/USDT</span><strong>{formatPrice(market.price)}</strong><small className={market.change24h >= 0 ? styles.positive : styles.negative}>{signedPercent(market.change24h)} today</small></article>)}</div>
    </section>
  </main>;

  const tradePnl = (trade: DcaTrade) => {
    const price = marketForPair(markets, trade.pair)?.price ?? trade.lastPrice ?? trade.exitPrice ?? trade.averagePrice;
    return trade.status === "Closed" ? trade.realizedPnl ?? 0 : (price - trade.averagePrice) * trade.quantity;
  };

  const botDetails = selectedBot ? <main className={styles.page}>
    <button className={styles.backButton} onClick={() => setSelectedBotId(null)}>← Back to bots</button>
    <section className={styles.botDetailHero}>
      <div><span className={styles.kicker}>{selectedBot.origin === "legacy" ? "Recovered v0.1 bot" : "v1 configuration draft"}</span><h2>{selectedBot.name}</h2><p>{botPairs(selectedBot)} · Long-only DCA</p></div>
      <div><span className={styles.pausedBadge}>Activation unavailable</span>{selectedBot.origin === "v1" ? <button className={styles.dangerText} onClick={() => deleteDraft(selectedBot.id)}>Delete draft</button> : null}</div>
    </section>
    <section className={styles.botDetailGrid}>
      <article className={`${styles.card} ${styles.botSettings}`}>
        <div className={styles.cardHeading}><div><span>Capital plan</span><small>Configuration preview</small></div><strong>{formatMoney(plannedCapital(selectedBot))}</strong></div>
        <div className={styles.orderPlan}>
          <div><span>Base</span><i /><b>{formatMoney(selectedBot.baseOrder)}</b><small>Entry</small></div>
          {Array.from({ length: Math.min(10, selectedBot.maxSafetyOrders) }, (_, index) => {
            const amount = selectedBot.safetyOrder * Math.pow(selectedBot.volumeScale || 1, index);
            const cumulativeDeviation = Array.from({ length: index + 1 }, (__, step) => selectedBot.deviation * Math.pow(selectedBot.stepScale || 1, step)).reduce((sum, value) => sum + value, 0);
            return <div key={index}><span>SO {index + 1}</span><i /><b>{formatMoney(amount)}</b><small>−{cumulativeDeviation.toFixed(2)}%</small></div>;
          })}
        </div>
      </article>
      <article className={`${styles.card} ${styles.botFacts}`}>
        <div className={styles.cardHeading}><div><span>Strategy</span><small>Saved parameters</small></div></div>
        <dl><div><dt>Base order</dt><dd>{formatMoney(selectedBot.baseOrder)}</dd></div><div><dt>Safety order</dt><dd>{formatMoney(selectedBot.safetyOrder)}</dd></div><div><dt>Safety orders</dt><dd>{selectedBot.maxSafetyOrders}</dd></div><div><dt>Price deviation</dt><dd>{selectedBot.deviation}%</dd></div><div><dt>Step scale</dt><dd>{selectedBot.stepScale}×</dd></div><div><dt>Volume scale</dt><dd>{selectedBot.volumeScale}×</dd></div><div><dt>Take profit</dt><dd>{selectedBot.takeProfit}%</dd></div><div><dt>Stop loss</dt><dd>{selectedBot.stopEnabled ? `${selectedBot.stopPct}%` : "Off"}</dd></div></dl>
      </article>
    </section>
    <section className={styles.readinessNote}><i>1</i><div><strong>Configuration is preserved, execution is intentionally paused.</strong><p>The next engine will validate this strategy server-side before any Binance order can be enabled. No credentials or execution state live in this browser.</p></div></section>
  </main> : null;

  const botsPage = botDetails ?? <main className={styles.page}>
    <section className={styles.botsIntro}><div><span className={styles.kicker}>DCA automations</span><h2>Build calmly. Execute deliberately.</h2><p>Your proven DCA structure, redesigned for the durable engine that comes next.</p></div><button className={styles.primaryButton} onClick={() => setShowCreate(true)}>New bot draft</button></section>
    <nav className={styles.botTabs} aria-label="Bot views">
      <button className={botView === "all" ? styles.activeBotTab : ""} onClick={() => setBotView("all")}>My Bots <span>{bots.length}</span></button>
      <button className={botView === "active" ? styles.activeBotTab : ""} onClick={() => setBotView("active")}>Active <span>{activeTrades.length}</span></button>
      <button className={botView === "closed" ? styles.activeBotTab : ""} onClick={() => setBotView("closed")}>Closed <span>{closedTrades.length}</span></button>
    </nav>
    {botView === "all" ? <>
      <section className={styles.botMetricGrid}><article><span>Configurations</span><strong>{bots.length}</strong><small>{v1Bots.length} v1 drafts</small></article><article><span>Open paper trades</span><strong>{activeTrades.length}</strong><small>Historical ledger</small></article><article><span>Realized P&amp;L</span><strong className={account.realized >= 0 ? styles.positive : styles.negative}>{formatMoney(account.realized)}</strong><small>{closedTrades.length} closed trades</small></article></section>
      <div className={styles.botCards}>{bots.map((bot) => {
        const botTradeCount = trades.filter((trade) => trade.botId === bot.id).length;
        const botPnl = trades.filter((trade) => trade.botId === bot.id).reduce((sum, trade) => sum + tradePnl(trade), 0);
        return <button className={styles.botCard} key={bot.id} onClick={() => setSelectedBotId(bot.id)}>
          <div className={styles.botCardTop}><span className={styles.botIcon}>D</span><span><strong>{bot.name}</strong><small>{botPairs(bot)}</small></span><i>↗</i></div>
          <div className={styles.botCardNumbers}><span><small>Capital plan</small><b>{formatMoney(plannedCapital(bot), true)}</b></span><span><small>Trades</small><b>{botTradeCount}</b></span><span><small>P&amp;L</small><b className={botPnl >= 0 ? styles.positive : styles.negative}>{formatMoney(botPnl)}</b></span></div>
          <div className={styles.botCardFooter}><span className={styles.pausedBadge}>Paused for v1</span><span>{bot.origin === "legacy" ? "Legacy" : "Draft"}</span></div>
        </button>;
      })}</div>
      {!bots.length ? <section className={`${styles.card} ${styles.largeEmpty}`}><span className={styles.botIcon}>D</span><h3>No DCA bot configurations</h3><p>Save a clean v1 draft now. Activation remains locked until the server engine is ready.</p><button className={styles.primaryButton} onClick={() => setShowCreate(true)}>Create first draft</button></section> : null}
    </> : null}
    {botView === "active" ? <section className={`${styles.card} ${styles.tradeList}`}>
      <div className={styles.tradeListHeader}><span>Position</span><span>Average price</span><span>Market price</span><span>Invested</span><span>P&amp;L</span></div>
      {activeTrades.map((trade) => { const market = marketForPair(markets, trade.pair); const pnl = tradePnl(trade); return <div className={styles.tradeRow} key={trade.id}><span><i className={styles.assetMark}>{pairSymbol(trade.pair).slice(0, 1)}</i><b>{trade.pair}<small>{trade.botName}</small></b></span><span>{formatPrice(trade.averagePrice)}</span><span>{formatPrice(market?.price ?? trade.lastPrice)}</span><span>{formatMoney(trade.invested)}</span><span className={pnl >= 0 ? styles.positive : styles.negative}>{formatMoney(pnl)}</span></div>; })}
      {!activeTrades.length ? <div className={styles.emptyState}><strong>No active positions</strong><span>The durable v1 engine is not enabled yet.</span></div> : null}
    </section> : null}
    {botView === "closed" ? <section className={`${styles.card} ${styles.tradeList}`}>
      <div className={styles.tradeListHeader}><span>Position</span><span>Entry</span><span>Exit</span><span>Closed</span><span>P&amp;L</span></div>
      {closedTrades.map((trade) => <div className={styles.tradeRow} key={trade.id}><span><i className={styles.assetMark}>{pairSymbol(trade.pair).slice(0, 1)}</i><b>{trade.pair}<small>{trade.closeReason ?? "Closed"}</small></b></span><span>{formatPrice(trade.averagePrice)}</span><span>{formatPrice(trade.exitPrice)}</span><span>{dateLabel(trade.closedAt)}</span><span className={(trade.realizedPnl ?? 0) >= 0 ? styles.positive : styles.negative}>{formatMoney(trade.realizedPnl ?? 0)}</span></div>)}
      {!closedTrades.length ? <div className={styles.emptyState}><strong>No closed positions</strong><span>Completed paper trades from v0.1 will appear here.</span></div> : null}
    </section> : null}
  </main>;

  return <div className={styles.shell}>
    <aside className={styles.sidebar}>
      <button className={styles.brand} onClick={() => navigate("dashboard")} aria-label="LabNarrative Trading Automations home"><span>LN</span><strong>LabNarrative<small>Trading Automations</small></strong></button>
      <nav>{(["dashboard", "portfolio", "bots"] as Area[]).map((item) => <button key={item} className={area === item ? styles.activeNav : ""} onClick={() => navigate(item)}><span>{item === "dashboard" ? "D" : item === "portfolio" ? "P" : "B"}</span>{item[0].toUpperCase() + item.slice(1)}{item === "bots" ? <small>{bots.length}</small> : null}</button>)}</nav>
      <div className={styles.sidebarStatus}><div><i className={marketLive ? styles.statusLive : ""} /><span><strong>Market data</strong><small>{marketLive ? "Binance live" : "Last known prices"}</small></span></div><div><i /><span><strong>Execution</strong><small>Not connected</small></span></div></div>
      <p className={styles.version}>v1.0 · Paper ledger</p>
    </aside>
    <section className={styles.workspace}>
      <header className={styles.topbar}><div><span>{area === "dashboard" ? new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric" }).format(new Date()) : "Trading Automations"}</span><h1>{pageTitle}</h1></div><div className={styles.topbarMeta}><span><i className={marketLive ? styles.statusLive : ""} />{marketLive ? "Live market" : "Market delayed"}</span><small>{updatedAt ? `Updated ${new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(new Date(updatedAt))}` : "Loading market"}</small><button aria-label="Refresh live market data" onClick={() => void loadMarkets()}>↻</button><span className={styles.avatar}>K</span></div></header>
      {notice ? <button className={styles.notice} onClick={() => setNotice("")}>{notice}<span>×</span></button> : null}
      {area === "dashboard" ? dashboard : area === "portfolio" ? portfolio : botsPage}
    </section>
    <nav className={styles.mobileNav}>{(["dashboard", "portfolio", "bots"] as Area[]).map((item) => <button key={item} className={area === item ? styles.mobileActive : ""} onClick={() => navigate(item)}><span>{item === "dashboard" ? "D" : item === "portfolio" ? "P" : "B"}</span>{item[0].toUpperCase() + item.slice(1)}</button>)}</nav>
    {showCreate ? <div className={styles.modalLayer} onPointerDown={(event) => { if (event.target === event.currentTarget) setShowCreate(false); }}>
      <section className={styles.createModal} role="dialog" aria-modal="true" aria-labelledby="new-bot-title">
        <header><div><span className={styles.kicker}>Configuration only</span><h2 id="new-bot-title">New DCA bot draft</h2><p>Design the capital ladder now. Activation will come from the durable engine later.</p></div><button aria-label="Close bot draft" onClick={() => setShowCreate(false)}>×</button></header>
        <div className={styles.modalBody}>
          <div className={styles.formPanel}>
            <label><span>Bot name</span><input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /></label>
            <label><span>Binance pair</span><select value={draft.symbol} onChange={(event) => setDraft((current) => ({ ...current, symbol: event.target.value }))}>{markets.slice(0, 100).map((market) => <option key={market.symbol} value={market.symbol}>{market.symbol}/USDT · {market.label}</option>)}</select></label>
            <div className={styles.formGrid}><label><span>Base order</span><div><input type="number" min="1" value={draft.baseOrder} onChange={(event) => setDraft((current) => ({ ...current, baseOrder: Number(event.target.value) }))} /><b>USDT</b></div></label><label><span>Safety order</span><div><input type="number" min="1" value={draft.safetyOrder} onChange={(event) => setDraft((current) => ({ ...current, safetyOrder: Number(event.target.value) }))} /><b>USDT</b></div></label></div>
            <div className={styles.formGrid}><label><span>Safety orders</span><input type="number" min="1" max="20" value={draft.maxSafetyOrders} onChange={(event) => setDraft((current) => ({ ...current, maxSafetyOrders: Number(event.target.value) }))} /></label><label><span>Price deviation</span><div><input type="number" min="0.1" step="0.1" value={draft.deviation} onChange={(event) => setDraft((current) => ({ ...current, deviation: Number(event.target.value) }))} /><b>%</b></div></label></div>
            <div className={styles.formGrid}><label><span>Step scale</span><div><input type="number" min="1" step="0.05" value={draft.stepScale} onChange={(event) => setDraft((current) => ({ ...current, stepScale: Number(event.target.value) }))} /><b>×</b></div></label><label><span>Volume scale</span><div><input type="number" min="1" step="0.05" value={draft.volumeScale} onChange={(event) => setDraft((current) => ({ ...current, volumeScale: Number(event.target.value) }))} /><b>×</b></div></label></div>
            <div className={styles.formGrid}><label><span>Take profit</span><div><input type="number" min="0.1" step="0.1" value={draft.takeProfit} onChange={(event) => setDraft((current) => ({ ...current, takeProfit: Number(event.target.value) }))} /><b>%</b></div></label><label className={styles.switchLabel}><span>Stop loss</span><button type="button" aria-pressed={draft.stopEnabled} className={draft.stopEnabled ? styles.switchOn : ""} onClick={() => setDraft((current) => ({ ...current, stopEnabled: !current.stopEnabled }))}><i /></button></label></div>
            {draft.stopEnabled ? <label><span>Stop loss distance</span><div><input type="number" min="0.1" step="0.1" value={draft.stopPct} onChange={(event) => setDraft((current) => ({ ...current, stopPct: Number(event.target.value) }))} /><b>%</b></div></label> : null}
          </div>
          <aside className={styles.draftPreview}><div><span className={styles.botIcon}>D</span><span><strong>{draft.name || "Untitled bot"}</strong><small>{draft.symbol}/USDT · Long</small></span></div><strong>{formatMoney(plannedCapital({ ...draft, id: "preview", pair: `${draft.symbol}/USDT`, stopPct: draft.stopPct, startCondition: "Manual approval", status: "Stopped", createdAt: "" }))}</strong><span>Maximum planned capital</span><div className={styles.previewSteps}>{Array.from({ length: Math.min(8, Math.max(0, Math.round(draft.maxSafetyOrders))) }, (_, index) => <i key={index} style={{ width: `${Math.min(100, 22 + index * 10)}%` }} />)}</div><p>Saved as a paused configuration. This screen never accepts API keys or sends orders.</p></aside>
        </div>
        <footer><button onClick={() => setShowCreate(false)}>Cancel</button><button className={styles.primaryButton} onClick={saveDraft}>Save bot draft</button></footer>
      </section>
    </div> : null}
  </div>;
}
