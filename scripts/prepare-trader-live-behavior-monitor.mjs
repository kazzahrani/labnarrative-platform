import fs from "node:fs";
import path from "node:path";

const traderPath = path.join(process.cwd(), "app/trader/TradingAgent.tsx");
const cssPath = path.join(process.cwd(), "app/trader/trader.module.css");
let source = fs.readFileSync(traderPath, "utf8");
let css = fs.readFileSync(cssPath, "utf8");

// TRADING V2 LIVE BEHAVIOR MONITOR
// Raw Binance ticks remain immediate for the execution cache. React/UI prices are
// deliberately batched so the interface does not repaint on every order-book tick.
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
    '    dcaMarketsRef.current = dcaMarketsRef.current.map((item) => item.exchangeSymbol.toUpperCase() === exchangeSymbol ? { ...item, ...clean } : item);',
    '    marketUiQueueRef.current.set(exchangeSymbol, { ...(marketUiQueueRef.current.get(exchangeSymbol) ?? {}), ...clean });',
    '    marketUiLastTickRef.current = new Date().toISOString();',
    '  };',
  ].join("\n"));

  // Selected-pair stream inserted by prepare-trader-live-binance-data.mjs.
  const selectedMarker = source.indexOf('// Keep the selected Binance pair genuinely live between REST refreshes.');
  if (selectedMarker < 0) throw new Error("Trader behavior monitor: selected-pair stream marker missing.");
  const selectedStart = source.indexOf('          setMarkets((items) =>', selectedMarker);
  const selectedLastUpdate = source.indexOf('          setLastMarketUpdate(new Date().toISOString());', selectedStart);
  if (selectedStart < 0 || selectedLastUpdate <= selectedStart) throw new Error("Trader behavior monitor: selected-pair update block missing.");
  const selectedEnd = selectedLastUpdate + '          setLastMarketUpdate(new Date().toISOString());'.length;
  source = source.slice(0, selectedStart) + [
    '          queueProfessionalMarketTick(exchangeSymbol, {',
    '            price: Number.isFinite(price) && price > 0 ? price : undefined,',
    '            bid: Number.isFinite(bid) && bid > 0 ? bid : undefined,',
    '            ask: Number.isFinite(ask) && ask > 0 ? ask : undefined,',
    '            change24h: Number.isFinite(price) && price > 0 && Number.isFinite(open) && open > 0 ? ((price - open) / open) * 100 : undefined,',
    '          });',
  ].join("\n") + source.slice(selectedEnd);

  // Active/pending DCA streams inserted by the final DCA accuracy passes.
  const activeMarker = source.indexOf('// DCA_ACTIVE_PAIR_STREAMS_V2');
  if (activeMarker < 0) throw new Error("Trader behavior monitor: active DCA stream marker missing.");
  const activeStart = source.indexOf('          setMarkets((items) =>', activeMarker);
  const activeCloseNeedle = '          } : item));';
  const activeClose = source.indexOf(activeCloseNeedle, activeStart);
  if (activeStart < 0 || activeClose <= activeStart) throw new Error("Trader behavior monitor: active DCA market update block missing.");
  const activeEnd = activeClose + activeCloseNeedle.length;
  source = source.slice(0, activeStart) + [
    '          queueProfessionalMarketTick(exchangeSymbol, {',
    '            price: Number.isFinite(price) && price > 0 ? price : undefined,',
    '            bid: Number.isFinite(bid) && bid > 0 ? bid : undefined,',
    '            ask: Number.isFinite(ask) && ask > 0 ? ask : undefined,',
    '          });',
  ].join("\n") + source.slice(activeEnd);

  const outerReturn = source.lastIndexOf('  return <main className={styles.appShell}>');
  if (outerReturn < 0) throw new Error("Trader behavior monitor: outer return anchor missing.");
  const effects = String.raw`
  const dcaAuditBotsRef = useRef(dcaBots);
  const dcaAuditTradesRef = useRef(dcaTrades);
  useEffect(() => { dcaAuditBotsRef.current = dcaBots; }, [dcaBots]);
  useEffect(() => { dcaAuditTradesRef.current = dcaTrades; }, [dcaTrades]);

  // Visible values update every two seconds. Execution still sees every raw tick above.
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

  // Production diagnostics for the newest/first validation bot. Read-only only.
  useEffect(() => {
    let cancelled = false;
    let busy = false;
    const postAudit = async () => {
      if (cancelled || busy) return;
      const bots = [...dcaAuditBotsRef.current];
      if (!bots.length) return;
      busy = true;
      try {
        const bot = bots[0];
        const botTrades = dcaAuditTradesRef.current.filter((trade) => trade.botId === bot.id);
        const activeTrade = botTrades.find((trade) => trade.status === "Active") ?? null;
        const pair = activeTrade?.pair ?? bot.pairs?.[0] ?? bot.pair;
        const symbol = pair.split("/")[0];
        const market = dcaMarketsRef.current.find((item) => item.symbol === symbol) ?? null;
        const conditionResults: Array<Record<string, unknown>> = [];
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
        // Diagnostics must never interfere with trade execution.
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
