import fs from "node:fs";
import path from "node:path";

const traderPath = path.join(process.cwd(), "app/trader/TradingAgent.tsx");
const cssPath = path.join(process.cwd(), "app/trader/trader.module.css");
let source = fs.readFileSync(traderPath, "utf8");
let css = fs.readFileSync(cssPath, "utf8");

// Persist the exact technical-condition configuration with every DCA bot.
if (!source.includes("conditions?: Array<{ id: number; kind: string; timeframe: string; length: number; comparator: string; signal: number; aux1: number; aux2: number; aux3: number }>;")) {
  source = source.replace(
    "  startCondition: string;\n  status: \"Running\" | \"Stopped\";",
    "  startCondition: string;\n  conditions?: Array<{ id: number; kind: string; timeframe: string; length: number; comparator: string; signal: number; aux1: number; aux2: number; aux3: number }>;\n  status: \"Running\" | \"Stopped\";"
  );
}

// Keep a live paper-market mark on DCA trades so the Active Trades page updates independently of the selected SmartTrade pair.
if (!source.includes("  lastPrice?: number;")) {
  source = source.replace("  realizedPnl?: number;\n};", "  realizedPnl?: number;\n  lastPrice?: number;\n  closeReason?: string;\n};");
}

// Store full condition objects when creating a new bot.
if (!source.includes("conditions: dcaConditions.map((condition) => ({ ...condition }))")) {
  source = source.replace(
    "stopEnabled: botStopEnabled, stopPct: botStopPct, startCondition: dcaConditions.length ? dcaConditions.map((condition) => condition.kind).join(\" + \") : \"Immediately\", status: \"Running\", createdAt: new Date().toISOString(),",
    "stopEnabled: botStopEnabled, stopPct: botStopPct, startCondition: dcaConditions.length ? dcaConditions.map((condition) => condition.kind).join(\" + \") : \"Immediately\", conditions: dcaConditions.map((condition) => ({ ...condition })), status: \"Running\", createdAt: new Date().toISOString(),"
  );
}

// Migrate old paper RSI bots that pre-date condition persistence. The current test bot described by the user is RSI(7), 3m, Less Than 90.
source = source.replace(
  "      if (savedBots) setDcaBots(JSON.parse(savedBots));",
  [
    "      if (savedBots) {",
    "        const parsedBots = JSON.parse(savedBots) as DcaBot[];",
    "        const migratedBots = parsedBots.map((bot) => {",
    "          if (bot.conditions?.length) return bot;",
    "          if (bot.startCondition?.includes(\"RSI\")) return { ...bot, conditions: [{ id: Date.now(), kind: \"RSI\", timeframe: \"3 minutes\", length: 7, comparator: \"Less Than\", signal: 90, aux1: 14, aux2: 1, aux3: 3 }] };",
    "          return bot;",
    "        });",
    "        setDcaBots(migratedBots);",
    "      }",
  ].join("\n")
);

// Prefer the engine's most recent live mark for DCA P/L.
source = source.replace(
  '  const dcaTradePrice = (trade: DcaTrade) => markets.find((market) => market.symbol === trade.pair.split("/")[0])?.price ?? trade.averagePrice;',
  '  const dcaTradePrice = (trade: DcaTrade) => trade.lastPrice ?? markets.find((market) => market.symbol === trade.pair.split("/")[0])?.price ?? trade.averagePrice;'
);

// Seed lastPrice when an immediate bot creates a trade.
source = source.replace(
  '        averagingFilled: 0, maxAveraging: bot.maxSafetyOrders, status: "Active", createdAt: now,',
  '        averagingFilled: 0, maxAveraging: bot.maxSafetyOrders, status: "Active", createdAt: now, lastPrice: selectedPrice,'
);

if (!source.includes("DCA PAPER ENGINE V1")) {
  const anchor = '  const dcaFundsLocked = activeDcaTrades.reduce((sum, trade) => sum + trade.invested, 0);';
  const engine = [
    anchor,
    '',
    '  // DCA PAPER ENGINE V1 — evaluates saved bot conditions against real Binance candles while the app is open.',
    '  const dcaTimeframeInterval = (timeframe: string) => ({',
    '    "3 minutes": "3m", "5 minutes": "5m", "15 minutes": "15m", "30 minutes": "30m",',
    '    "1 hour": "1h", "2 hours": "2h", "4 hours": "4h", "8 hours": "8h", "12 hours": "12h",',
    '    "1 day": "1d", "3 days": "3d", "1 week": "1w", "1 month": "1M",',
    '  } as Record<string, string>)[timeframe] ?? "3m";',
    '',
    '  const calculateRsiSeries = (closes: number[], period: number) => {',
    '    const p = Math.max(1, Math.round(period));',
    '    if (closes.length < p + 2) return [] as number[];',
    '    let gains = 0;',
    '    let losses = 0;',
    '    for (let i = 1; i <= p; i += 1) {',
    '      const change = closes[i] - closes[i - 1];',
    '      if (change >= 0) gains += change; else losses -= change;',
    '    }',
    '    let avgGain = gains / p;',
    '    let avgLoss = losses / p;',
    '    const values: number[] = [];',
    '    const toRsi = () => avgLoss === 0 ? 100 : avgGain === 0 ? 0 : 100 - (100 / (1 + avgGain / avgLoss));',
    '    values.push(toRsi());',
    '    for (let i = p + 1; i < closes.length; i += 1) {',
    '      const change = closes[i] - closes[i - 1];',
    '      const gain = Math.max(0, change);',
    '      const loss = Math.max(0, -change);',
    '      avgGain = ((avgGain * (p - 1)) + gain) / p;',
    '      avgLoss = ((avgLoss * (p - 1)) + loss) / p;',
    '      values.push(toRsi());',
    '    }',
    '    return values;',
    '  };',
    '',
    '  const compareSignal = (previous: number | null, current: number, comparator: string, signal: number) => {',
    '    if (comparator === "Less Than") return current < signal;',
    '    if (comparator === "Greater Than") return current > signal;',
    '    if (comparator === "Crossing Up") return previous != null && previous <= signal && current > signal;',
    '    if (comparator === "Crossing Down") return previous != null && previous >= signal && current < signal;',
    '    return false;',
    '  };',
    '',
    '  const evaluateDcaCondition = async (bot: DcaBot, condition: NonNullable<DcaBot["conditions"]>[number]) => {',
    '    const symbol = bot.pair.replace("/", "");',
    '    const interval = dcaTimeframeInterval(condition.timeframe);',
    '    const response = await fetch("/api/trader/klines?symbol=" + encodeURIComponent(symbol) + "&interval=" + encodeURIComponent(interval) + "&limit=220", { cache: "no-store" });',
    '    if (!response.ok) return { ok: false, price: 0, value: null as number | null };',
    '    const data = await response.json() as { candles?: Array<{ close: number; closeTime: number }> };',
    '    const candles = data.candles ?? [];',
    '    const livePrice = candles.at(-1)?.close ?? 0;',
    '    const closedCandles = candles.filter((candle) => candle.closeTime < Date.now());',
    '    const closes = closedCandles.map((candle) => candle.close).filter((value) => Number.isFinite(value) && value > 0);',
    '    if (condition.kind === "RSI") {',
    '      const values = calculateRsiSeries(closes, condition.length);',
    '      const current = values.at(-1);',
    '      const previous = values.length > 1 ? values.at(-2) ?? null : null;',
    '      if (current == null) return { ok: false, price: livePrice, value: null as number | null };',
    '      return { ok: compareSignal(previous, current, condition.comparator, condition.signal), price: livePrice, value: current };',
    '    }',
    '    return { ok: false, price: livePrice, value: null as number | null };',
    '  };',
    '',
    '  useEffect(() => {',
    '    let cancelled = false;',
    '    let busy = false;',
    '    const evaluateBots = async () => {',
    '      if (busy || cancelled) return;',
    '      busy = true;',
    '      try {',
    '        const activeBotIds = new Set(dcaTrades.filter((trade) => trade.status === "Active").map((trade) => trade.botId));',
    '        for (const bot of dcaBots) {',
    '          if (cancelled || bot.status !== "Running" || activeBotIds.has(bot.id)) continue;',
    '          const conditions = bot.conditions ?? [];',
    '          let shouldOpen = conditions.length === 0 && (!bot.startCondition || bot.startCondition === "Immediately");',
    '          let triggerPrice = 0;',
    '          if (conditions.length > 0) {',
    '            shouldOpen = true;',
    '            for (const condition of conditions) {',
    '              const result = await evaluateDcaCondition(bot, condition);',
    '              if (result.price > 0) triggerPrice = result.price;',
    '              if (!result.ok) { shouldOpen = false; break; }',
    '            }',
    '          }',
    '          if (!shouldOpen || triggerPrice <= 0 || cancelled) continue;',
    '          setDcaTrades((items) => {',
    '            if (items.some((trade) => trade.botId === bot.id && trade.status === "Active")) return items;',
    '            const quantity = bot.baseOrder / triggerPrice;',
    '            const trade: DcaTrade = {',
    '              id: "deal-" + Date.now() + "-" + bot.id, botId: bot.id, botName: bot.name, pair: bot.pair,',
    '              entryPrice: triggerPrice, averagePrice: triggerPrice, quantity, invested: bot.baseOrder, averagingFilled: 0,',
    '              maxAveraging: bot.maxSafetyOrders, status: "Active", createdAt: new Date().toISOString(), lastPrice: triggerPrice,',
    '            };',
    '            return [trade, ...items];',
    '          });',
    '          activeBotIds.add(bot.id);',
    '        }',
    '      } finally { busy = false; }',
    '    };',
    '    void evaluateBots();',
    '    const timer = window.setInterval(() => { void evaluateBots(); }, 8000);',
    '    return () => { cancelled = true; window.clearInterval(timer); };',
    '  }, [dcaBots, dcaTrades]);',
    '',
    '  useEffect(() => {',
    '    let cancelled = false;',
    '    let busy = false;',
    '    const manageTrades = async () => {',
    '      if (busy || cancelled) return;',
    '      busy = true;',
    '      try {',
    '        for (const trade of dcaTrades.filter((item) => item.status === "Active")) {',
    '          const bot = dcaBots.find((item) => item.id === trade.botId);',
    '          if (!bot || cancelled) continue;',
    '          const symbol = trade.pair.replace("/", "");',
    '          const response = await fetch("/api/trader/klines?symbol=" + encodeURIComponent(symbol) + "&interval=1m&limit=2", { cache: "no-store" });',
    '          if (!response.ok) continue;',
    '          const data = await response.json() as { candles?: Array<{ close: number }> };',
    '          const currentPrice = data.candles?.at(-1)?.close ?? 0;',
    '          if (!currentPrice) continue;',
    '          setDcaTrades((items) => items.map((item) => {',
    '            if (item.id !== trade.id || item.status !== "Active") return item;',
    '            const marked = { ...item, lastPrice: currentPrice };',
    '            const stopHit = bot.stopEnabled && currentPrice <= item.averagePrice * (1 - bot.stopPct / 100);',
    '            const tpHit = bot.takeProfit > 0 && currentPrice >= item.averagePrice * (1 + bot.takeProfit / 100);',
    '            if (stopHit || tpHit) return { ...marked, status: "Closed", closedAt: new Date().toISOString(), realizedPnl: (currentPrice - item.averagePrice) * item.quantity, closeReason: stopHit ? "Stop Loss" : "Take Profit" };',
    '            if (item.averagingFilled < item.maxAveraging) {',
    '              let cumulativeDeviation = 0;',
    '              let step = bot.deviation;',
    '              for (let i = 0; i <= item.averagingFilled; i += 1) { cumulativeDeviation += step; step *= bot.stepScale; }',
    '              const threshold = item.entryPrice * (1 - cumulativeDeviation / 100);',
    '              if (currentPrice <= threshold) {',
    '                const orderAmount = bot.safetyOrder * Math.pow(bot.volumeScale, item.averagingFilled);',
    '                const extraQty = orderAmount / currentPrice;',
    '                const newQuantity = item.quantity + extraQty;',
    '                const newInvested = item.invested + orderAmount;',
    '                return { ...marked, quantity: newQuantity, invested: newInvested, averagePrice: newInvested / newQuantity, averagingFilled: item.averagingFilled + 1 };',
    '              }',
    '            }',
    '            return marked;',
    '          }));',
    '        }',
    '      } finally { busy = false; }',
    '    };',
    '    void manageTrades();',
    '    const timer = window.setInterval(() => { void manageTrades(); }, 5000);',
    '    return () => { cancelled = true; window.clearInterval(timer); };',
    '  }, [dcaBots, dcaTrades]);',
  ].join("\n");
  source = source.replace(anchor, engine);
}

// DCA pages should align like 3Commas: no global search strip above bot/deal pages.
source = source.replace(
  '{section !== "Smart Trades" && <div className={styles.searchStrip}>',
  '{section !== "Smart Trades" && section !== "DCA bots" && <div className={styles.searchStrip}>'
);

// Make manual close record a reason as well.
source = source.replace(
  'return { ...trade, status: "Closed", closedAt: new Date().toISOString(), realizedPnl: dcaTradePnl(trade) };',
  'return { ...trade, status: "Closed", closedAt: new Date().toISOString(), realizedPnl: dcaTradePnl(trade), closeReason: "Manual close" };'
);

// Show closure reason on history rows when available.
source = source.replace(
  '<td>{trade.status}</td>',
  '<td>{trade.status}{mode === "Closed" && trade.closeReason && <small>{trade.closeReason}</small>}</td>'
);

// Alignment overrides: submenu active background spans the sidebar width and labels line up with the 3Commas reference.
css += `\n/* DCA navigation + deal-page alignment v2 */\n.dcaSubnav{padding:0!important;margin:0!important;border-bottom:1px solid rgba(91,117,132,.18)!important;width:100%!important}\n.dcaSubnav button{width:100%!important;height:38px!important;border-radius:0!important;padding:0 16px 0 62px!important;box-sizing:border-box!important;font-size:14px!important;justify-content:space-between!important}\n.dcaSubnav button:hover,.dcaSubnavActive{background:#223945!important;color:#dce7ec!important}\n.dcaSubnav button span{margin-left:auto!important;color:#8aa0ae!important;font-size:12px!important}\n.dcaTradesPage{padding:16px 24px 60px!important}\n.dcaTradesTop{min-height:44px!important;margin:0 0 14px!important;align-items:center!important}\n.myBotsButton{margin:0!important;min-width:108px!important}\n.dcaDealsFilters{margin-top:0!important}\n.dcaDealsStats>section{box-sizing:border-box!important}\n.dcaDealsTableCard th,.dcaDealsTableCard td{box-sizing:border-box!important}\n@media(max-width:900px){.dcaSubnav button{padding-left:44px!important}.dcaTradesPage{padding:12px!important}}\n`;

fs.writeFileSync(traderPath, source);
fs.writeFileSync(cssPath, css);
console.log("Prepared live DCA paper execution engine, condition persistence, and alignment fixes.");