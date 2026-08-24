import fs from "node:fs";
import path from "node:path";

const traderPath = path.join(process.cwd(), "app/trader/TradingAgent.tsx");
let source = fs.readFileSync(traderPath, "utf8");

const requiredReplace = (before, after, label) => {
  if (!source.includes(before)) throw new Error(`DCA accuracy V2: missing ${label}`);
  source = source.replace(before, after);
};

// -----------------------------------------------------------------------------
// DCA ACCURACY V2
// Keep one authoritative path for opening deals, reserve every live/pending order,
// respect Binance Spot quantity/notional filters, use executable bid/ask prices,
// and remove controls that are not genuinely implemented yet.
// -----------------------------------------------------------------------------

// 1) New bots must NOT create immediate trades/pending entries inside the form handler.
// The scanner is the only entry engine, so capital checks, max-active rules, filters and
// re-arming apply identically to immediate and conditional entries.
{
  const start = source.indexOf('  const createConfiguredDcaBot = () => {');
  const end = source.indexOf('  const handleGlobalSearch = (value: string) => {', start);
  if (start < 0 || end <= start) throw new Error('DCA accuracy V2: configured bot creator not found.');
  let block = source.slice(start, end);
  const immediateStart = block.indexOf('    if (!savedConditions.length && dcaOrderType === "Market") {');
  const routeAnchor = block.indexOf('    setSelectedBotId(bot.id);', immediateStart);
  if (immediateStart < 0 || routeAnchor <= immediateStart) throw new Error('DCA accuracy V2: immediate entry blocks not found.');
  block = block.slice(0, immediateStart) + '    // Entry creation is intentionally centralized in the DCA scanner.\n' + block.slice(routeAnchor);
  source = source.slice(0, start) + block + source.slice(end);
}

// 2) Reserve base + the simultaneously active averaging window for every pending
// Limit entry. Previously only the base order was reflected in the visible account.
requiredReplace(
  '  const dcaPendingEntryReserved = dcaBots.reduce((sum, bot) => sum + Object.keys(bot.pendingLimitEntries ?? {}).length * bot.baseOrder, 0);\n  const dcaFundsLocked = activeDcaTrades.reduce((sum, trade) => sum + trade.invested, 0) + dcaPendingAveragingReserved + dcaPendingEntryReserved;',
  [
    '  const dcaPendingEntryReserved = dcaBots.reduce((sum, bot) => {',
    '    const pendingCount = Object.keys(bot.pendingLimitEntries ?? {}).length;',
    '    if (!pendingCount) return sum;',
    '    let perEntryReserve = bot.baseOrder;',
    '    if (bot.averagingEnabled !== false) {',
    '      const pendingAveragingCount = Math.max(0, Math.min(bot.maxSafetyOrders, bot.limitSafetyOrders ?? bot.maxSafetyOrders));',
    '      for (let index = 0; index < pendingAveragingCount; index += 1) perEntryReserve += dcaAveragingOrderAmount(bot, index);',
    '    }',
    '    return sum + pendingCount * perEntryReserve;',
    '  }, 0);',
    '  const dcaFundsLocked = activeDcaTrades.reduce((sum, trade) => sum + trade.invested, 0) + dcaPendingAveragingReserved + dcaPendingEntryReserved;',
  ].join('\n'),
  'pending Limit-entry full reservation'
);

// 3) Scanner budget must include realized PnL, active averaging reservations and full
// pending Limit-entry reservations. This prevents different bots from overbooking USDT.
requiredReplace(
  '        const activeInvested = activeTrades.reduce((sum, trade) => sum + trade.invested, 0);\n        const pendingEntryReserve = dcaBots.reduce((sum, bot) => sum + Object.keys(bot.pendingLimitEntries ?? {}).length * bot.baseOrder, 0);\n        let availableCapital = Math.max(0, DEMO_BALANCE - activeInvested - pendingEntryReserve);',
  [
    '        const activeInvested = activeTrades.reduce((sum, trade) => sum + trade.invested, 0);',
    '        const activeAveragingReserve = activeTrades.reduce((sum, trade) => sum + dcaPendingAveragingReserveForTrade(trade), 0);',
    '        const pendingEntryReserve = dcaBots.reduce((sum, bot) => {',
    '          const count = Object.keys(bot.pendingLimitEntries ?? {}).length;',
    '          if (!count) return sum;',
    '          let perEntry = bot.baseOrder;',
    '          if (bot.averagingEnabled !== false) {',
    '            const pendingCount = Math.max(0, Math.min(bot.maxSafetyOrders, bot.limitSafetyOrders ?? bot.maxSafetyOrders));',
    '            for (let index = 0; index < pendingCount; index += 1) perEntry += dcaAveragingOrderAmount(bot, index);',
    '          }',
    '          return sum + count * perEntry;',
    '        }, 0);',
    '        const realizedCapital = dcaTradesRef.current.filter((trade) => trade.status === "Closed").reduce((sum, trade) => sum + (trade.realizedPnl ?? 0), 0);',
    '        let availableCapital = Math.max(0, DEMO_BALANCE + realizedCapital - activeInvested - activeAveragingReserve - pendingEntryReserve);',
  ].join('\n'),
  'scanner capital budget'
);

// The global funding transform already calculates requiredCapitalForNewTrade. Every
// Market deal opened in that same scan cycle must debit the whole reservation, not only BO.
{
  const scanStart = source.indexOf('    const evaluateBots = async () => {');
  const scanEnd = source.indexOf('    void evaluateBots();', scanStart);
  if (scanStart < 0 || scanEnd <= scanStart) throw new Error('DCA accuracy V2: scanner block not found.');
  let scanner = source.slice(scanStart, scanEnd);
  scanner = scanner.replaceAll('availableCapital -= bot.baseOrder;', 'availableCapital -= requiredCapitalForNewTrade;');
  if (scanner.includes('availableCapital -= bot.baseOrder;')) throw new Error('DCA accuracy V2: scanner still debits base-only capital.');
  source = source.slice(0, scanStart) + scanner + source.slice(scanEnd);
}

// 4) Normalize actual Binance Spot execution. Quantity is floored to LOT_SIZE stepSize;
// minQty/maxQty/minNotional are enforced. Market buys use best ask. Resting Limit buys
// use a tick-size-valid price.
{
  const old = [
    '    const openBotTrade = (bot: DcaBot, pair: string, fillPrice: number) => {',
    '      if (!(fillPrice > 0)) return false;',
    '      const maxAveraging = bot.averagingEnabled === false ? 0 : bot.maxSafetyOrders;',
    '      const quantity = bot.baseOrder / fillPrice;',
    '      const now = new Date().toISOString();',
  ].join('\n');
  const replacement = [
    '    const normalizeDcaExecution = (pair: string, rawPrice: number, quoteAmount: number, limitOrder: boolean) => {',
    '      const market = dcaMarketsRef.current.find((item) => item.symbol === pair.split("/")[0]);',
    '      if (!market || !(rawPrice > 0) || !(quoteAmount > 0)) return null;',
    '      const price = limitOrder && market.tickSize > 0 ? floorToStep(rawPrice, market.tickSize) : rawPrice;',
    '      if (!(price > 0)) return null;',
    '      const quantity = floorToStep(quoteAmount / price, market.stepSize || 0);',
    '      const notional = quantity * price;',
    '      if (!(quantity > 0) || (market.minQty > 0 && quantity + 1e-15 < market.minQty) || (market.maxQty > 0 && quantity - 1e-15 > market.maxQty) || (market.minNotional > 0 && notional + 1e-9 < market.minNotional)) return null;',
    '      return { price, quantity, notional };',
    '    };',
    '    const openBotTrade = (bot: DcaBot, pair: string, fillPrice: number) => {',
    '      if (!(fillPrice > 0)) return false;',
    '      const market = dcaMarketsRef.current.find((item) => item.symbol === pair.split("/")[0]);',
    '      const isLimit = (bot.orderType ?? "Market") === "Limit";',
    '      const executableRawPrice = isLimit ? fillPrice : (market?.ask ?? market?.price ?? fillPrice);',
    '      const execution = normalizeDcaExecution(pair, executableRawPrice, bot.baseOrder, isLimit);',
    '      if (!execution) return false;',
    '      const { price: executionPrice, quantity, notional: actualBaseAmount } = execution;',
    '      const maxAveraging = bot.averagingEnabled === false ? 0 : bot.maxSafetyOrders;',
    '      const now = new Date().toISOString();',
  ].join('\n');
  requiredReplace(old, replacement, 'normalized base execution');

  source = source.replace(
    '        botId: bot.id, botName: bot.name, pair, entryPrice: fillPrice, averagePrice: fillPrice, quantity, invested: bot.baseOrder,',
    '        botId: bot.id, botName: bot.name, pair, entryPrice: executionPrice, averagePrice: executionPrice, quantity, invested: actualBaseAmount,'
  );
  source = source.replace(
    '        status: "Active", createdAt: now, lastPrice: fillPrice,\n        fills: [{ kind: "Base" as const, price: fillPrice, amount: bot.baseOrder, quantity, at: now }],',
    '        status: "Active", createdAt: now, lastPrice: executionPrice,\n        fills: [{ kind: "Base" as const, price: executionPrice, amount: actualBaseAmount, quantity, at: now }],'
  );
}

// Validate/round pending start Limit orders before reserving them.
{
  const old = [
    '            if ((bot.orderType ?? "Market") === "Limit") {',
    '              const createdAt = new Date().toISOString();',
    '              setDcaBots((items) => items.map((item) => item.id === bot.id ? { ...item, pendingLimitEntries: { ...(item.pendingLimitEntries ?? {}), [pair]: { price: triggerPrice, createdAt } } } : item));',
    '              availableCapital -= requiredCapitalForNewTrade;',
    '              break;',
    '            }',
  ].join('\n');
  const replacement = [
    '            if ((bot.orderType ?? "Market") === "Limit") {',
    '              const normalizedEntry = normalizeDcaExecution(pair, triggerPrice, bot.baseOrder, true);',
    '              if (!normalizedEntry) continue;',
    '              const createdAt = new Date().toISOString();',
    '              setDcaBots((items) => items.map((item) => item.id === bot.id ? { ...item, pendingLimitEntries: { ...(item.pendingLimitEntries ?? {}), [pair]: { price: normalizedEntry.price, createdAt } } } : item));',
    '              availableCapital -= requiredCapitalForNewTrade;',
    '              break;',
    '            }',
  ].join('\n');
  requiredReplace(old, replacement, 'normalized pending Limit entry');
}

// 5) Averaging fills also obey tick/lot/notional filters and record the actual quote spent.
{
  const old = [
    '                const limitPrice = dcaAveragingOrderPrice(bot, item.entryPrice, filled);',
    '                if (!(limitPrice > 0) || currentPrice > limitPrice) break;',
    '                const orderAmount = dcaAveragingOrderAmount(bot, filled);',
    '                const extraQty = orderAmount / limitPrice;',
    '                quantity += extraQty;',
    '                invested += orderAmount;',
    '                fills = [...fills, { kind: "Averaging" as const, price: limitPrice, amount: orderAmount, quantity: extraQty, at: new Date().toISOString() }];',
  ].join('\n');
  const replacement = [
    '                const plannedLimitPrice = dcaAveragingOrderPrice(bot, item.entryPrice, filled);',
    '                const orderAmount = dcaAveragingOrderAmount(bot, filled);',
    '                const marketRule = dcaMarketsRef.current.find((candidate) => candidate.symbol === item.pair.split("/")[0]);',
    '                const limitPrice = marketRule?.tickSize ? floorToStep(plannedLimitPrice, marketRule.tickSize) : plannedLimitPrice;',
    '                if (!(limitPrice > 0) || currentPrice > limitPrice) break;',
    '                const extraQty = floorToStep(orderAmount / limitPrice, marketRule?.stepSize || 0);',
    '                const actualOrderAmount = extraQty * limitPrice;',
    '                if (!(extraQty > 0) || (marketRule?.minQty && extraQty + 1e-15 < marketRule.minQty) || (marketRule?.maxQty && extraQty - 1e-15 > marketRule.maxQty) || (marketRule?.minNotional && actualOrderAmount + 1e-9 < marketRule.minNotional)) break;',
    '                quantity += extraQty;',
    '                invested += actualOrderAmount;',
    '                fills = [...fills, { kind: "Averaging" as const, price: limitPrice, amount: actualOrderAmount, quantity: extraQty, at: new Date().toISOString() }];',
  ].join('\n');
  requiredReplace(old, replacement, 'normalized averaging execution');
}

// 6) Exit checks for a long Spot position should use the executable best bid when it is
// available. This makes TP/SL/manual PnL conservative and closer to a real market sell.
requiredReplace(
  '    const priceChanged = trade.lastPrice !== currentPrice;\n    let managed: DcaTrade = priceChanged ? { ...trade, lastPrice: currentPrice } : trade;',
  [
    '    const exitMarket = markets.find((market) => market.symbol === trade.pair.split("/")[0]);',
    '    const executablePrice = exitMarket?.bid ?? currentPrice;',
    '    const priceChanged = trade.lastPrice !== executablePrice;',
    '    let managed: DcaTrade = priceChanged ? { ...trade, lastPrice: executablePrice } : trade;',
  ].join('\n'),
  'executable DCA exit price'
);
// All calculations inside the evaluator should use executablePrice after validation.
{
  const start = source.indexOf('  const enforceDcaExitAtPrice =');
  const end = source.indexOf('  // Re-check every active DCA deal', start);
  if (start < 0 || end <= start) throw new Error('DCA accuracy V2: exit evaluator not found.');
  let block = source.slice(start, end);
  block = block.replaceAll('currentPrice >= tpPrice', 'executablePrice >= tpPrice');
  block = block.replaceAll('Math.max(trailingPeakPrice ?? currentPrice, currentPrice)', 'Math.max(trailingPeakPrice ?? executablePrice, executablePrice)');
  block = block.replaceAll('currentPrice <= trailingPeakPrice', 'executablePrice <= trailingPeakPrice');
  block = block.replaceAll('currentPrice <= slPrice', 'executablePrice <= slPrice');
  block = block.replaceAll('exitPrice: currentPrice', 'exitPrice: executablePrice');
  block = block.replaceAll('(currentPrice - managed.averagePrice)', '(executablePrice - managed.averagePrice)');
  block = block.replaceAll('lastPrice: currentPrice', 'lastPrice: executablePrice');
  source = source.slice(0, start) + block + source.slice(end);
}

// Manual close uses the same best bid and records the exact exit price/reason.
{
  const old = '      return { ...trade, status: "Closed", closedAt: new Date().toISOString(), realizedPnl: dcaTradePnl(trade), closeReason: "Manual close" };';
  const replacement = '      const market = markets.find((item) => item.symbol === trade.pair.split("/")[0]); const exitPrice = market?.bid ?? dcaTradePrice(trade); return { ...trade, status: "Closed", closedAt: new Date().toISOString(), exitPrice, lastPrice: exitPrice, realizedPnl: (exitPrice - trade.averagePrice) * trade.quantity, closeReason: "Manual close" };';
  requiredReplace(old, replacement, 'manual close executable price');
}

// Deleting a bot closes its active deals at executable bid too, instead of a display mark.
source = source.replace(
  '      return { ...trade, status: "Closed", closedAt, realizedPnl: dcaTradePnl(trade), closeReason: "Bot deleted" };',
  '      const market = markets.find((item) => item.symbol === trade.pair.split("/")[0]); const exitPrice = market?.bid ?? dcaTradePrice(trade); return { ...trade, status: "Closed", closedAt, exitPrice, lastPrice: exitPrice, realizedPnl: (exitPrice - trade.averagePrice) * trade.quantity, closeReason: "Bot deleted" };'
);

// 7) Stream every active DCA pair from Binance so exits are not dependent on a 5s/15s
// REST sampling window while the paper app is open.
if (!source.includes('DCA_ACTIVE_PAIR_STREAMS_V2')) {
  const outerReturn = source.lastIndexOf('  return <main className={styles.appShell}>');
  if (outerReturn < 0) throw new Error('DCA accuracy V2: outer return not found.');
  const streamBlock = [
    '  // DCA_ACTIVE_PAIR_STREAMS_V2',
    '  const activeDcaStreamKey = Array.from(new Set(activeDcaTrades.map((trade) => trade.pair.replace("/", "").toLowerCase()))).sort().join(",");',
    '  useEffect(() => {',
    '    const symbols = activeDcaStreamKey ? activeDcaStreamKey.split(",").filter(Boolean) : [];',
    '    if (!symbols.length) return;',
    '    let socket: WebSocket | null = null;',
    '    let retryTimer: number | null = null;',
    '    let stopped = false;',
    '    const streams = symbols.flatMap((symbol) => [symbol + "@miniTicker", symbol + "@bookTicker"]).join("/");',
    '    const connect = () => {',
    '      if (stopped) return;',
    '      socket = new WebSocket("wss://data-stream.binance.vision:443/stream?streams=" + streams);',
    '      socket.onopen = () => setMarketDataLive(true);',
    '      socket.onmessage = (event) => {',
    '        try {',
    '          const message = JSON.parse(event.data) as { stream?: string; data?: Record<string, string> };',
    '          const stream = message.stream ?? "";',
    '          const data = message.data ?? {};',
    '          const exchangeSymbol = stream.split("@")[0]?.toUpperCase();',
    '          if (!exchangeSymbol) return;',
    '          const price = stream.includes("miniTicker") ? Number(data.c) : NaN;',
    '          const bid = stream.includes("bookTicker") ? Number(data.b) : NaN;',
    '          const ask = stream.includes("bookTicker") ? Number(data.a) : NaN;',
    '          setMarkets((items) => items.map((item) => item.exchangeSymbol === exchangeSymbol ? {',
    '            ...item,',
    '            price: Number.isFinite(price) && price > 0 ? price : item.price,',
    '            bid: Number.isFinite(bid) && bid > 0 ? bid : item.bid,',
    '            ask: Number.isFinite(ask) && ask > 0 ? ask : item.ask,',
    '          } : item));',
    '          setLastMarketUpdate(new Date().toISOString());',
    '        } catch {}',
    '      };',
    '      socket.onerror = () => setMarketDataLive(false);',
    '      socket.onclose = () => { if (!stopped) { setMarketDataLive(false); retryTimer = window.setTimeout(connect, 2500); } };',
    '    };',
    '    connect();',
    '    return () => { stopped = true; if (retryTimer != null) window.clearTimeout(retryTimer); socket?.close(); };',
    '  }, [activeDcaStreamKey]);',
    '',
  ].join('\n');
  source = source.slice(0, outerReturn) + streamBlock + source.slice(outerReturn);
}

// 8) Add Funds Limit was previously immediate-on-save, not a real resting Limit order.
// Until pending Add-Funds orders are implemented, expose only the working Market action.
source = source.replace(
  '<div className={styles.addFundsOrderTabs}><button type="button" className={addFundsOrderType === "Market" ? styles.addFundsOrderActive : ""} onClick={() => setAddFundsOrderType("Market")}>Market</button><button type="button" className={addFundsOrderType === "Limit" ? styles.addFundsOrderActive : ""} onClick={() => setAddFundsOrderType("Limit")}>Limit</button></div>',
  '<div className={styles.dcaFakeSelect}>Market order</div>'
);
source = source.replace(
  '<label className={styles.addFundsField}>\n              <span>Price</span>\n              <div className={styles.addFundsInputWrap}><input inputMode="decimal" disabled={addFundsOrderType === "Market"} value={addFundsOrderType === "Market" ? (addFundsMarketPrice > 0 ? String(addFundsMarketPrice) : "0") : addFundsLimitPrice} onChange={(event) => setAddFundsLimitPrice(event.target.value)}/><strong>USDT</strong></div>\n              {addFundsOrderType === "Limit" && <small>Paper mode applies the added funds at the selected limit price when you save.</small>}\n            </label>',
  '<label className={styles.addFundsField}><span>Execution</span><div className={styles.addFundsInputWrap}><input readOnly value={addFundsMarketPrice > 0 ? String(addFundsMarketPrice) : "0"}/><strong>USDT · market</strong></div></label>'
);

// Market Add Funds uses best ask and Binance step/minimum rules.
{
  const old = [
    '    const executionPrice = addFundsOrderType === "Market" ? dcaTradePrice(trade) : Number(addFundsLimitPrice);',
    '    if (!Number.isFinite(amount) || amount <= 0) { setNotice("Enter a valid amount to add."); return; }',
    '    if (amount > available + 0.000001) { setNotice("Add Funds amount is higher than the available paper USDT balance."); return; }',
    '    if (!Number.isFinite(executionPrice) || executionPrice <= 0) { setNotice("Enter a valid execution price."); return; }',
  ].join('\n');
  const replacement = [
    '    const addMarket = markets.find((market) => market.symbol === trade.pair.split("/")[0]);',
    '    const executionPrice = addMarket?.ask ?? dcaTradePrice(trade);',
    '    if (!Number.isFinite(amount) || amount <= 0) { setNotice("Enter a valid amount to add."); return; }',
    '    if (amount > available + 0.000001) { setNotice("Add Funds amount is higher than the available paper USDT balance."); return; }',
    '    if (!Number.isFinite(executionPrice) || executionPrice <= 0) { setNotice("A live Binance ask price is not available."); return; }',
    '    const executableQty = floorToStep(amount / executionPrice, addMarket?.stepSize || 0);',
    '    const executableAmount = executableQty * executionPrice;',
    '    if (!(executableQty > 0) || (addMarket?.minQty && executableQty + 1e-15 < addMarket.minQty) || (addMarket?.maxQty && executableQty - 1e-15 > addMarket.maxQty) || (addMarket?.minNotional && executableAmount + 1e-9 < addMarket.minNotional)) { setNotice("Add Funds does not meet the current Binance Spot quantity/notional rules for this pair."); return; }',
  ].join('\n');
  requiredReplace(old, replacement, 'market Add Funds execution');

  // The fill-history transform uses amount/amount-derived quantity. Make it record the
  // quantized Binance execution instead.
  source = source.replace('      const extraQty = amount / executionPrice;', '      const extraQty = executableQty;');
  source = source.replace('      const newInvested = item.invested + amount;', '      const newInvested = item.invested + executableAmount;');
  source = source.replace('fills: [...priorFills, { kind: "Add Funds" as const, price: executionPrice, amount, quantity: extraQty, at: addFundsFilledAt }],', 'fills: [...priorFills, { kind: "Add Funds" as const, price: executionPrice, amount: executableAmount, quantity: extraQty, at: addFundsFilledAt }],');
  source = source.replace('setNotice(`Added ${compactMoney(amount)} to ${trade.pair} in paper mode${addFundsOrderType === "Limit" ? " at the selected limit price" : " at market"}.`);', 'setNotice(`Added ${compactMoney(executableAmount)} to ${trade.pair} at the live Binance ask in paper mode.`);');
}

// 9) Distinct controls must have distinct semantics. "Cancel" on an already-open deal
// previously did the exact same market close as "Close at Market"; remove it for now.
source = source.replaceAll('<button className={styles.dealCancelButton} onClick={() => closeDcaTrade(trade.id)}>⊘ Cancel</button>', '');

// Remove temporary/fake DCA/product buttons until those features are genuinely wired.
source = source.replace(/<button[^>]*onClick=\{\(\) => setNotice\("DCA guide will open here\."\)\}[^>]*>▣ Guide<\/button>/g, '');
source = source.replace(/<button[^>]*onClick=\{\(\) => setNotice\("Strategy presets will be added after the core DCA workflow is validated\."\)\}[^>]*>Strategy presets<\/button>/g, '');
source = source.replace('<button className={styles.fullAccessButton} onClick={() => setNotice("Binance API connection will be enabled after paper-trading validation.")}>Connect Binance</button>', '<span className={styles.fullAccessButton}>Paper mode</span>');
source = source.replace('<button className={styles.fullAccessButton}>Connect Binance</button>', '<span className={styles.fullAccessButton}>Paper mode</span>');
source = source.replace('<div className={styles.demoBanner}><span>ⓘ</span> Now you\'re on Paper account <button onClick={() => setNotice("Real account trading will be enabled only after Binance API connection and execution safeguards are complete.")}>Switch to Real account</button></div>', '<div className={styles.demoBanner}><span>ⓘ</span> Paper account · live Binance market data · no real orders</div>');
source = source.replace('<div className={styles.demoBanner}><span>ⓘ</span> Now you\'re on Paper account <button>Switch to Real account</button></div>', '<div className={styles.demoBanner}><span>ⓘ</span> Paper account · live Binance market data · no real orders</div>');

// Final hard guards. Build must fail if a known unsafe/fake behavior reappears.
const forbidden = [
  'if (!savedConditions.length && dcaOrderType === "Market")',
  'availableCapital -= bot.baseOrder;',
  'applies the added funds at the selected limit price when you save',
  '>⊘ Cancel</button>',
  '>Connect Binance</button>',
  '>Switch to Real account</button>',
];
for (const token of forbidden) if (source.includes(token)) throw new Error(`DCA accuracy V2 guard failed: ${token}`);
const required = [
  'const activeAveragingReserve =',
  'const realizedCapital =',
  'normalizeDcaExecution',
  'actualBaseAmount',
  'actualOrderAmount',
  'DCA_ACTIVE_PAIR_STREAMS_V2',
  'const executablePrice = exitMarket?.bid ?? currentPrice;',
  'const executableQty = floorToStep(amount / executionPrice',
];
for (const token of required) if (!source.includes(token)) throw new Error(`DCA accuracy V2 required behavior missing: ${token}`);

fs.writeFileSync(traderPath, source);
console.log('Prepared DCA accuracy V2: single entry engine, full reservations, Binance filters, bid/ask execution and live active-pair streams.');
