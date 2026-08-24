import fs from "node:fs";
import path from "node:path";

const traderPath = path.join(process.cwd(), "app/trader/TradingAgent.tsx");
const cssPath = path.join(process.cwd(), "app/trader/trader.module.css");
let source = fs.readFileSync(traderPath, "utf8");
let css = fs.readFileSync(cssPath, "utf8");

// TRADING V2 LIVE BEHAVIOR MONITOR
// Keep raw Binance ticks available to the DCA engine immediately, but batch visible
// React-state updates. Professional automation UIs should not repaint on every book tick.
if (!source.includes("PROFESSIONAL_MARKET_UI_BUFFER_V1")) {
  const stateAnchor = '  const [lastMarketUpdate, setLastMarketUpdate] = useState<string | null>(null);';
  if (!source.includes(stateAnchor)) throw new Error("Trader behavior monitor: market update state anchor missing.");
  source = source.replace(stateAnchor, [
    stateAnchor,
    '  // PROFESSIONAL_MARKET_UI_BUFFER_V1',
    '  const marketUiQueueRef = useRef<Map<string, Partial<Market>>>(new Map());',
    '  const marketUiLastTickRef = useRef<string | null>(null);',
    '  const queueProfessionalMarketTick = (rawExchangeSymbol: string, patch: { price?: number; bid?: number; ask?: number; change24h?: number }) => {',
    '    const exchangeSymbol = rawExchangeSymbol.toUpperCase();',
    '    const clean: Partial<Market> = {};',
    '    if (typeof patch.price === "number" && Number.isFinite(patch.price) && patch.price > 0) clean.price = patch.price;',
    '    if (typeof patch.bid === "number" && Number.isFinite(patch.bid) && patch.bid > 0) clean.bid = patch.bid;',
    '    if (typeof patch.ask === "number" && Number.isFinite(patch.ask) && patch.ask > 0) clean.ask = patch.ask;',
    '    if (typeof patch.change24h === "number" && Number.isFinite(patch.change24h)) clean.change24h = patch.change24h;',
    '    if (!Object.keys(clean).length) return;',
    '    // Raw execution cache: update on every Binance tick, independently of UI cadence.',
    '    dcaMarketsRef.current = dcaMarketsRef.current.map((item) => item.exchangeSymbol.toUpperCase() === exchangeSymbol ? { ...item, ...clean } : item);',
    '    marketUiQueueRef.current.set(exchangeSymbol, { ...(marketUiQueueRef.current.get(exchangeSymbol) ?? {}), ...clean });',
    '    marketUiLastTickRef.current = new Date().toISOString();',
    '  };',
  ].join("\n"));

  const selectedSocketPattern = /          setMarkets\(\(items\) => items\.map\(\(item\) => item\.exchangeSymbol\.toLowerCase\(\) === exchangeSymbol \? \{\n            \.\.\.item,\n            price: Number\.isFinite\(price\) && price > 0 \? price : item\.price,\n            bid: Number\.isFinite\(bid\) && bid > 0 \? bid : item\.bid,\n            ask: Number\.isFinite\(ask\) && ask > 0 \? ask : item\.ask,\n            change24h: Number\.isFinite\(price\) && price > 0 && Number\.isFinite\(open\) && open > 0 \? \(\(price - open\) \/ open\) \* 100 : item\.change24h,\n          \} : item\)\)\);\n          setLastMarketUpdate\(new Date\(\)\.toISOString\(\)\);/g;
  let selectedReplacements = 0;
  source = source.replace(selectedSocketPattern, () => {
    selectedReplacements += 1;
    return [
      '          queueProfessionalMarketTick(exchangeSymbol, {',
      '            price: Number.isFinite(price) && price > 0 ? price : undefined,',
      '            bid: Number.isFinite(bid) && bid > 0 ? bid : undefined,',
      '            ask: Number.isFinite(ask) && ask > 0 ? ask : undefined,',
      '            change24h: Number.isFinite(price) && price > 0 && Number.isFinite(open) && open > 0 ? ((price - open) / open) * 100 : undefined,',
      '          });',
    ].join("\n");
  });
  if (selectedReplacements < 1) throw new Error("Trader behavior monitor: selected-pair WebSocket renderer anchor missing.");

  const activeSocketPattern = /          setMarkets\(\(items\) => items\.map\(\(item\) => item\.exchangeSymbol === exchangeSymbol \? \{\n            \.\.\.item,\n            price: Number\.isFinite\(price\) && price > 0 \? price : item\.price,\n            bid: Number\.isFinite\(bid\) && bid > 0 \? bid : item\.bid,\n            ask: Number\.isFinite\(ask\) && ask > 0 \? ask : item\.ask,\n          \} : item\)\)\);/g;
  let activeReplacements = 0;
  source = source.replace(activeSocketPattern, () => {
    activeReplacements += 1;
    return [
      '          queueProfessionalMarketTick(exchangeSymbol, {',
      '            price: Number.isFinite(price) && price > 0 ? price : undefined,',
      '            bid: Number.isFinite(bid) && bid > 0 ? bid : undefined,',
      '            ask: Number.isFinite(ask) && ask > 0 ? ask : undefined,',
      '          });',
    ].join("\n");
  });
  if (activeReplacements < 1) throw new Error("Trader behavior monitor: active-DCA WebSocket renderer anchor missing.");

  const outerReturn = source.lastIndexOf('  return <main className={styles.appShell}>');
  if (outerReturn < 0) throw new Error("Trader behavior monitor: outer return anchor missing.");
  const effects = String.raw`
  // Flush visible prices at a calm cadence while raw ticks continue updating dcaMarketsRef.
  useEffect(() => {
    const flushVisibleMarkets = () => {
      if (!marketUiQueueRef.current.size) return;
      const updates = new Map(marketUiQueueRef.current);
      marketUiQueueRef.current.clear();
      setMarkets((items) => items.map((item) => {
        const patch = updates.get(item.exchangeSymbol.toUpperCase());
        return patch ? { ...item, ...patch } : item;
      }));
      if (marketUiLastTickRef.current) setLastMarketUpdate(marketUiLastTickRef.current);
    };
    const timer = window.setInterval(flushVisibleMarkets, 2000);
    return () => window.clearInterval(timer);
  }, []);

  // First-bot validation telemetry. This is diagnostic only: it never opens, edits or closes a trade.
  useEffect(() => {
    let cancelled = false;
    let busy = false;
    const postAudit = async () => {
      if (cancelled || busy) return;
      const bots = [...dcaBotsRef.current];
      if (!bots.length) return;
      busy = true;
      try {
        const bot = bots.sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")))[0];
        const botTrades = dcaTradesRef.current.filter((trade) => trade.botId === bot.id);
        const activeTrade = botTrades.find((trade) => trade.status === "Active") ?? null;
        const pair = activeTrade?.pair ?? bot.pairs?.[0] ?? bot.pair;
        const symbol = pair.split("/")[0];
        const market = dcaMarketsRef.current.find((item) => item.symbol === symbol) ?? null;
        const conditionResults = [];
        for (const condition of bot.conditions ?? []) {
          try {
            const result = await evaluateDcaCondition(bot, pair, condition);
            conditionResults.push({ kind: condition.kind, timeframe: condition.timeframe, comparator: condition.comparator, signal: condition.signal, value: result.value, passed: result.ok });
          } catch (error) {
            conditionResults.push({ kind: condition.kind, timeframe: condition.timeframe, comparator: condition.comparator, signal: condition.signal, value: null, passed: false, error: error instanceof Error ? error.message : "condition evaluation failed" });
          }
        }
        const nextAveragingPrice = activeTrade && bot.averagingEnabled !== false && activeTrade.averagingFilled < activeTrade.maxAveraging
          ? dcaAveragingOrderPrice(bot, activeTrade.entryPrice, activeTrade.averagingFilled)
          : null;
        const tpPct = activeTrade?.takeProfitPct ?? bot.takeProfit;
        const stopEnabled = activeTrade?.stopEnabledOverride ?? bot.stopEnabled;
        const stopPct = activeTrade?.stopPctOverride ?? bot.stopPct;
        const payload = {
          event: "first_bot_snapshot",
          at: new Date().toISOString(),
          bot: {
            id: bot.id, name: bot.name, status: bot.status, pair, orderType: bot.orderType ?? "Market",
            maxActiveTrades: bot.maxActiveTrades, averagingEnabled: bot.averagingEnabled !== false,
            maxSafetyOrders: bot.maxSafetyOrders, activeSafetyOrders: bot.limitSafetyOrders,
            takeProfitPct: tpPct, trailingPct: activeTrade?.trailingDeviationPct ?? bot.trailingPct ?? 0,
            stopEnabled, stopPct, maxHoldEnabled: activeTrade?.maxHoldEnabled ?? bot.maxHoldEnabled ?? false,
            maxHoldHours: activeTrade?.maxHoldHours ?? bot.maxHoldHours ?? null,
            pendingLimitEntries: Object.keys(bot.pendingLimitEntries ?? {}).length,
          },
          market: market ? { symbol: market.symbol, price: market.price, bid: market.bid, ask: market.ask, change24h: market.change24h } : null,
          conditions: conditionResults,
          trade: activeTrade ? {
            id: activeTrade.id, status: activeTrade.status, entryPrice: activeTrade.entryPrice, averagePrice: activeTrade.averagePrice,
            lastPrice: activeTrade.lastPrice, invested: activeTrade.invested, quantity: activeTrade.quantity,
            averagingFilled: activeTrade.averagingFilled, maxAveraging: activeTrade.maxAveraging,
            nextAveragingPrice,
            takeProfitPrice: activeTrade.averagePrice * (1 + tpPct / 100),
            stopLossPrice: stopEnabled ? activeTrade.averagePrice * (1 - stopPct / 100) : null,
            trailingPeakPrice: activeTrade.trailingPeakPrice ?? null,
            createdAt: activeTrade.createdAt,
            fills: (activeTrade.fills ?? []).map((fill) => ({ kind: fill.kind, price: fill.price, amount: fill.amount, quantity: fill.quantity, at: fill.at })),
          } : null,
          closedTrades: botTrades.filter((trade) => trade.status === "Closed").slice(0, 5).map((trade) => ({ id: trade.id, pair: trade.pair, realizedPnl: trade.realizedPnl ?? 0, closeReason: trade.closeReason ?? null, exitPrice: trade.exitPrice ?? null, closedAt: trade.closedAt ?? null })),
        };
        await fetch("/api/trader/audit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload), keepalive: true });
      } catch {
        // Telemetry must never interfere with trading behavior.
      } finally {
        busy = false;
      }
    };
    void postAudit();
    const timer = window.setInterval(() => { void postAudit(); }, 15000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);

`;
  source = source.slice(0, outerReturn) + effects + source.slice(outerReturn);
}

if (!css.includes("TRADER PROFESSIONAL NUMERIC STABILITY V1")) {
  css += `\n\n/* TRADER PROFESSIONAL NUMERIC STABILITY V1 */\n.appShell,.appShell button,.appShell input,.appShell select{font-variant-numeric:tabular-nums;font-feature-settings:"tnum" 1}\n`;
}

const guards = [
  "PROFESSIONAL_MARKET_UI_BUFFER_V1",
  "queueProfessionalMarketTick",
  "flushVisibleMarkets",
  'event: "first_bot_snapshot"',
  'fetch("/api/trader/audit"',
  "dcaAveragingOrderPrice(bot, activeTrade.entryPrice, activeTrade.averagingFilled)",
];
for (const token of guards) if (!source.includes(token)) throw new Error(`Trader behavior monitor guard missing: ${token}`);

fs.writeFileSync(traderPath, source);
fs.writeFileSync(cssPath, css);
console.log("Prepared professional market UI cadence and first-bot production telemetry.");
