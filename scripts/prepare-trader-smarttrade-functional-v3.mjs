import fs from "node:fs";
import path from "node:path";

const traderPath = path.join(process.cwd(), "app/trader/TradingAgent.tsx");
const cssPath = path.join(process.cwd(), "app/trader/trader.module.css");
let source = fs.readFileSync(traderPath, "utf8");
let css = fs.readFileSync(cssPath, "utf8");

// SMARTTRADE FUNCTIONAL V3
// Final execution pass: percentage sizing must update the visible amount immediately,
// and SmartTrade protection logic must continue running even when the market price is flat.

// 1) Percentage sizing: always size from the same unified free-capital ledger used by
// Dashboard/Portfolio. Blur draft inputs first, then commit on the next frame so an old
// NumericInput blur cannot overwrite the percentage selection.
{
  const start = source.indexOf('  const setPercentOfBalance = (value: number) => {');
  const end = start >= 0 ? source.indexOf('  const createSmartTrade =', start) : -1;
  if (start < 0 || end < 0) throw new Error('SmartTrade V3: percent sizing handler missing.');
  const replacement = [
    '  const setPercentOfBalance = (value: number) => {',
    '    const price = effectiveEntry || selectedPrice || 0;',
    '    const available = Math.max(0, freeCapital);',
    '    if (!(price > 0)) { setNotice("Live market price is required before using a balance percentage."); return; }',
    '    if (!(available > 0)) { setNotice("No available USDT is currently free for a new SmartTrade."); return; }',
    '    const requestedQuote = available * Math.min(100, Math.max(0, value)) / 100;',
    '    const rawUnits = requestedQuote / price;',
    '    const steppedUnits = floorToStep(rawUnits, selectedMarket?.stepSize || 0);',
    '    const nextUnits = steppedUnits > 0 ? steppedUnits : rawUnits;',
    '    const active = document.activeElement as HTMLElement | null;',
    '    if (active && (active.tagName === "INPUT" || active.tagName === "SELECT" || active.tagName === "TEXTAREA")) active.blur();',
    '    window.requestAnimationFrame(() => {',
    '      setSmartUnits(Number(nextUnits.toFixed(8)));',
    '      setNotice(`${value}% selected · ${compactMoney(requestedQuote)} of available USDT.`);',
    '    });',
    '  };',
    '',
  ].join('\n');
  source = source.slice(0, start) + replacement + source.slice(end);
}

// Ensure every 5/10/25/50/100 button is a real non-submit button and uses the handler.
source = source.replace(
  /const PercentButtons = \(\) => <div className=\{styles\.percentButtons\}>\{\[5,10,25,50,100\]\.map\(\(v\) => <button[^>]*>\{v\}%<\/button>\)\}<\/div>;/,
  'const PercentButtons = () => <div className={styles.percentButtons}>{[5,10,25,50,100].map((v) => <button type="button" key={v} onClick={() => setPercentOfBalance(v)}>{v}%</button>)}</div>;'
);
if (!source.includes('setNotice(`${value}% selected · ${compactMoney(requestedQuote)} of available USDT.`)')) throw new Error('SmartTrade V3: percentage sizing was not installed.');

// 2) Replace the protection engine with a deterministic version. It supports:
// - fixed or trailing SL
// - continuous SL timeout
// - TP limit/market semantics
// - trailing TP activation + retracement
// - breakeven after the first TP (or trailing-TP activation)
{
  const start = source.indexOf('function markSmartTradeAtPrice(trade: SmartTrade, currentPrice: number): SmartTrade {');
  if (start < 0) throw new Error('SmartTrade V3: protection engine start missing.');
  const candidates = [
    source.indexOf('function takeProfitAllocationTotal(', start),
    source.indexOf('function takeProfitValidationError(', start),
    source.indexOf('function boundedPercentError(', start),
    source.indexOf('function navGlyph(', start),
  ].filter((value) => value > start);
  const end = candidates.length ? Math.min(...candidates) : -1;
  if (end < 0) throw new Error('SmartTrade V3: protection engine end missing.');

  const engine = `function markSmartTradeAtPrice(trade: SmartTrade, currentPrice: number, nowMs = Date.now()): SmartTrade {
  if (trade.status !== "Active" || !Number.isFinite(currentPrice) || currentPrice <= 0) return trade;

  const average = smartTradeAveragePrice(trade);
  let quantity = smartTradeQuantity(trade);
  let amount = Number.isFinite(trade.amount) ? Math.max(0, trade.amount) : average * quantity;
  let realizedPnl = trade.realizedPnl ?? 0;
  let tpHits = trade.tpHits?.length === trade.takeProfits.length ? [...trade.tpHits] : trade.takeProfits.map(() => false);
  const direction = smartTradeDirection(trade);

  // Trailing SL only moves in the favorable direction.
  let trailingStopPeak = trade.trailingStopPeak ?? average;
  if (trade.trailingStop) {
    trailingStopPeak = trade.side === "Buy"
      ? Math.max(average, trailingStopPeak, currentPrice)
      : Math.min(average, trailingStopPeak, currentPrice);
  }

  let breakevenActivated = Boolean(trade.breakevenActivated);
  let working: SmartTrade = {
    ...trade,
    averagePrice: average,
    quantity,
    amount,
    totalInvested: trade.totalInvested ?? trade.amount,
    lastPrice: currentPrice,
    tpHits,
    realizedPnl,
    trailingStopPeak,
    breakevenActivated,
  };

  // SL / trailing SL / breakeven stop. A timeout means the level must remain breached
  // continuously for the full configured duration. Recovery resets the timer.
  const stopLevel = smartTradeStopPrice(working);
  const stopBreached = stopLevel != null && smartTradeStopReached(working, currentPrice, stopLevel);
  if (stopBreached) {
    if (working.stopTimeout) {
      const timeoutMs = Math.max(1, Number(working.stopTimeoutSec ?? 300)) * 1000;
      const startedMs = working.stopTriggeredAt ? new Date(working.stopTriggeredAt).getTime() : NaN;
      if (!Number.isFinite(startedMs)) {
        return { ...working, stopTriggeredAt: new Date(nowMs).toISOString() };
      }
      if (nowMs - startedMs < timeoutMs) return working;
    }
    const stopFillPrice = working.stopOrderType === "Cond. Limit" && stopLevel != null ? stopLevel : currentPrice;
    const exitPnl = (stopFillPrice - average) * quantity * direction;
    return {
      ...working,
      status: "Closed",
      quantity: 0,
      amount: 0,
      realizedPnl: realizedPnl + exitPnl,
      closedAt: new Date(nowMs).toISOString(),
      exitPrice: stopFillPrice,
      closeReason: working.breakevenActivated ? "Breakeven Stop" : (working.trailingStop ? "Trailing Stop Loss" : "Stop Loss"),
    };
  }
  if (working.stopTriggeredAt) working = { ...working, stopTriggeredAt: null };

  const executionTpError = takeProfitValidationError(working.takeProfits, Boolean(working.trailingTp), true);
  if (executionTpError) return working;
  const tpPrices = smartTradeTpPrices(working);

  // Trailing TP: first TP is the activation line. After activation the trade follows the
  // best price and exits on the fixed 0.20% retracement retained by the simplified UI.
  if (working.trailingTp && tpPrices.length) {
    const activation = tpPrices[0];
    const activationReached = activation != null && smartTradeReached(working, currentPrice, activation);
    let trailingActivated = Boolean(working.trailingActivated) || activationReached;
    let trailingPeak = working.trailingPeak ?? currentPrice;
    if (trailingActivated) {
      if (working.breakeven) breakevenActivated = true;
      trailingPeak = working.side === "Buy" ? Math.max(trailingPeak, currentPrice) : Math.min(trailingPeak, currentPrice);
      const deviation = Math.max(0.01, Number(working.trailingTpDeviation ?? 0.2)) / 100;
      const trailingExit = working.side === "Buy"
        ? currentPrice <= trailingPeak * (1 - deviation)
        : currentPrice >= trailingPeak * (1 + deviation);
      if (trailingExit) {
        const exitPnl = (currentPrice - average) * quantity * direction;
        return {
          ...working,
          trailingActivated,
          trailingPeak,
          breakevenActivated,
          status: "Closed",
          quantity: 0,
          amount: 0,
          realizedPnl: realizedPnl + exitPnl,
          closedAt: new Date(nowMs).toISOString(),
          exitPrice: currentPrice,
          closeReason: "Trailing Take Profit",
        };
      }
    }
    return { ...working, trailingActivated, trailingPeak, breakevenActivated };
  }

  let firstTpHitThisTick = false;
  for (let index = 0; index < tpPrices.length; index += 1) {
    if (tpHits[index] || !smartTradeReached(working, currentPrice, tpPrices[index])) continue;
    const targetWeight = Math.max(0, working.takeProfits[index]?.share ?? 0);
    const accumulatedQty = (working.fills ?? []).reduce((sum, fill) => sum + ((fill.kind === "Base" || fill.kind === "Averaging" || fill.kind === "Add Funds") ? Math.max(0, fill.quantity) : 0), 0) || smartTradeQuantity(working);
    const closeQty = Math.min(quantity, accumulatedQty * Math.min(100, targetWeight) / 100);
    const fillPrice = working.tpOrderType === "Market" ? currentPrice : tpPrices[index];
    realizedPnl += (fillPrice - average) * closeQty * direction;
    quantity = Math.max(0, quantity - closeQty);
    amount = Math.max(0, amount - average * closeQty);
    tpHits[index] = true;
    firstTpHitThisTick = true;
  }

  // Move the remaining position SL to average entry after the first TP is filled.
  if (working.breakeven && (breakevenActivated || firstTpHitThisTick || tpHits.some(Boolean))) breakevenActivated = true;

  const totalAllocatedTpShare = working.takeProfits.reduce((sum, target) => sum + Math.max(0, target.share), 0);
  const allAllocatedTargetsDone = tpHits.length > 0 && tpHits.every(Boolean) && totalAllocatedTpShare >= 99.999999;
  if (allAllocatedTargetsDone || quantity <= 1e-12) {
    return {
      ...working,
      tpHits,
      quantity: 0,
      amount: 0,
      realizedPnl,
      breakevenActivated,
      status: "Closed",
      closedAt: new Date(nowMs).toISOString(),
      exitPrice: currentPrice,
      closeReason: "Take Profit",
    };
  }

  return { ...working, tpHits, quantity, amount, realizedPnl, breakevenActivated };
}

`;
  source = source.slice(0, start) + engine + source.slice(end);
}

// 3) Protection clock. This is what makes Stop Loss timeout real even when the last
// traded price does not change. It also keeps trailing/breakeven state synchronized.
if (!source.includes('SMARTTRADE_PROTECTION_CLOCK_V3')) {
  const anchor = '  const selectedSmartChartTrade = selectedSmartTradeChartId ? smartTrades.find((trade) => trade.id === selectedSmartTradeChartId) ?? null : null;';
  if (!source.includes(anchor)) throw new Error('SmartTrade V3: SmartTrade helper anchor missing.');
  const clock = [
    '  // SMARTTRADE_PROTECTION_CLOCK_V3',
    '  useEffect(() => {',
    '    const timer = window.setInterval(() => {',
    '      const nowMs = Date.now();',
    '      setSmartTrades((items) => {',
    '        let changed = false;',
    '        const next = items.map((trade) => {',
    '          if (trade.status !== "Active") return trade;',
    '          const symbol = trade.pair.split("/")[0];',
    '          const live = markets.find((market) => market.symbol === symbol)?.price ?? trade.lastPrice ?? smartTradeAveragePrice(trade);',
    '          if (!(live > 0)) return trade;',
    '          const marked = markSmartTradeAtPrice(trade, live, nowMs);',
    '          const stateChanged = marked.status !== trade.status',
    '            || marked.amount !== trade.amount',
    '            || marked.realizedPnl !== trade.realizedPnl',
    '            || marked.stopTriggeredAt !== trade.stopTriggeredAt',
    '            || marked.trailingStopPeak !== trade.trailingStopPeak',
    '            || marked.trailingActivated !== trade.trailingActivated',
    '            || marked.trailingPeak !== trade.trailingPeak',
    '            || marked.breakevenActivated !== trade.breakevenActivated',
    '            || JSON.stringify(marked.tpHits ?? []) !== JSON.stringify(trade.tpHits ?? []);',
    '          if (stateChanged) changed = true;',
    '          return marked;',
    '        });',
    '        return changed ? next : items;',
    '      });',
    '    }, 500);',
    '    return () => window.clearInterval(timer);',
    '  }, [markets]);',
    '',
  ].join('\n');
  source = source.replace(anchor, clock + anchor);
}

// 4) Old saved SmartTrades should receive sane defaults so editing/execution behaves
// consistently after this deployment.
source = source.replace(
  '            realizedPnl: trade.realizedPnl ?? 0,',
  [
    '            realizedPnl: trade.realizedPnl ?? 0,',
    '            tpOrderType: trade.tpOrderType ?? "Limit",',
    '            stopOrderType: trade.stopOrderType ?? "Cond. Market",',
    '            stopTimeout: Boolean(trade.stopTimeout),',
    '            stopTimeoutSec: trade.stopTimeoutSec ?? 300,',
    '            trailingStop: Boolean(trade.trailingStop),',
    '            trailingStopPeak: trade.trailingStopPeak ?? trade.lastPrice ?? averagePrice,',
    '            breakeven: Boolean(trade.breakeven),',
    '            breakevenActivated: Boolean(trade.breakevenActivated),',
  ].join('\n')
);

// 5) Visual feedback for percentage controls.
if (!css.includes('/* SmartTrade functional V3 */')) {
  css += `\n/* SmartTrade functional V3 */\n.percentButtons button{cursor:pointer;transition:border-color .12s ease,background .12s ease,color .12s ease}.percentButtons button:hover{border-color:#29c7be!important;color:#d9fffc!important;background:#173039!important}\n`;
}

// Hard guards: fail deployment if any execution link is missing.
const required = [
  'SMARTTRADE_PROTECTION_CLOCK_V3',
  'requestedQuote = available *',
  'stopTriggeredAt: new Date(nowMs).toISOString()',
  'closeReason: "Trailing Take Profit"',
  'closeReason: working.breakevenActivated ? "Breakeven Stop"',
  'trailingStopPeak = working.side === "Buy"',
  'if (working.breakeven) breakevenActivated = true;',
  'tpOrderType, stopOrderType, stopTimeout, stopTimeoutSec, trailingStop, breakeven',
];
for (const marker of required) if (!source.includes(marker)) throw new Error(`SmartTrade V3: missing required runtime marker: ${marker}`);

fs.writeFileSync(traderPath, source);
fs.writeFileSync(cssPath, css);
console.log('Prepared SmartTrade functional V3: live percentage sizing and continuously evaluated TP/SL/trailing/breakeven protections.');