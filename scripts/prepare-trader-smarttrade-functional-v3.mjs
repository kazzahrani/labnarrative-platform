import fs from "node:fs";
import path from "node:path";

const traderPath = path.join(process.cwd(), "app/trader/TradingAgent.tsx");
const cssPath = path.join(process.cwd(), "app/trader/trader.module.css");
let source = fs.readFileSync(traderPath, "utf8");
let css = fs.readFileSync(cssPath, "utf8");

// SMARTTRADE FUNCTIONAL V3
// Execution/UI parity pass based on the SmartTrade behavior the user approved:
// - percentage sizing is persistent and reflects the live free balance
// - trailing TP uses a user-configured retracement and trails ONLY the final TP target
// - SL timeout is a true continuous re-check
// - trailing SL is removed from SmartTrade
// - breakeven requires >=2 TP targets and moves SL to average entry after TP1 fills

// -----------------------------------------------------------------------------
// 1) Percentage-of-available sizing
// -----------------------------------------------------------------------------
if (!source.includes('const [smartSizePct,')) {
  const anchor = '  const [stopInputMode, setStopInputMode] = useState<"Price" | "Percent">("Price");';
  if (!source.includes(anchor)) throw new Error("SmartTrade V3: percent sizing state anchor missing.");
  source = source.replace(anchor, [
    anchor,
    '  const [smartSizePct, setSmartSizePct] = useState<number | null>(null);',
  ].join("\n"));
}

{
  const start = source.indexOf('  const setPercentOfBalance = (value: number) => {');
  const end = start >= 0 ? source.indexOf('  const createSmartTrade =', start) : -1;
  if (start < 0 || end < 0) throw new Error("SmartTrade V3: percent sizing handler missing.");
  const replacement = [
    '  const setPercentOfBalance = (value: number) => {',
    '    const price = effectiveEntry || selectedPrice || 0;',
    '    const available = Math.max(0, freeCapital);',
    '    if (!(price > 0)) { setNotice("Live market price is required before using a balance percentage."); return; }',
    '    if (!(available > 0)) { setNotice("No available USDT is currently free for a new SmartTrade."); return; }',
    '    const boundedPct = Math.min(100, Math.max(0, value));',
    '    const requestedQuote = available * boundedPct / 100;',
    '    const rawUnits = requestedQuote / price;',
    '    const steppedUnits = floorToStep(rawUnits, selectedMarket?.stepSize || 0);',
    '    const nextUnits = steppedUnits > 0 ? steppedUnits : rawUnits;',
    '    const active = document.activeElement as HTMLElement | null;',
    '    if (active && (active.tagName === "INPUT" || active.tagName === "SELECT" || active.tagName === "TEXTAREA")) active.blur();',
    '    setSmartSizePct(boundedPct);',
    '    window.requestAnimationFrame(() => {',
    '      setSmartUnits(Number(nextUnits.toFixed(8)));',
    '      setNotice(`${boundedPct}% selected · ${compactMoney(requestedQuote)} of available USDT.`);',
    '    });',
    '  };',
    '',
  ].join("\n");
  source = source.slice(0, start) + replacement + source.slice(end);
}

source = source.replace(
  /const PercentButtons = \(\) => <div className=\{styles\.percentButtons\}>\{\[5,10,25,50,100\]\.map\(\(v\) => <button[^>]*>\{v\}%<\/button>\)\}<\/div>;/,
  'const PercentButtons = () => <div className={styles.percentButtons}>{[5,10,25,50,100].map((v) => <button type="button" key={v} className={smartSizePct === v ? styles.percentButtonActive : ""} onClick={() => setPercentOfBalance(v)}>{v}%</button>)}</div>;'
);

source = source.replaceAll(
  'onValueChange={setSmartUnits}',
  'onValueChange={(value) => { setSmartSizePct(null); setSmartUnits(value); }}'
);

if (!source.includes('SMARTTRADE_SIZE_PCT_SYNC_V3')) {
  const freeCapitalMatch = source.match(/^  const freeCapital = .*;$/m);
  const found = freeCapitalMatch?.[0] ?? null;
  if (!found) throw new Error("SmartTrade V3: free capital anchor missing.");
  source = source.replace(found, [
    found,
    '  // SMARTTRADE_SIZE_PCT_SYNC_V3',
    '  useEffect(() => {',
    '    if (smartSizePct == null) return;',
    '    const price = effectiveEntry || selectedPrice || 0;',
    '    const available = Math.max(0, freeCapital);',
    '    if (!(price > 0) || !(available >= 0)) return;',
    '    const requestedQuote = available * Math.min(100, Math.max(0, smartSizePct)) / 100;',
    '    const rawUnits = requestedQuote / price;',
    '    const steppedUnits = floorToStep(rawUnits, selectedMarket?.stepSize || 0);',
    '    const nextUnits = steppedUnits > 0 ? steppedUnits : rawUnits;',
    '    setSmartUnits(Number(nextUnits.toFixed(8)));',
    '  }, [smartSizePct, freeCapital, effectiveEntry, selectedPrice, selectedMarket?.stepSize]);',
  ].join("\n"));
}

// -----------------------------------------------------------------------------
// 2) Tooltip explanations and simplified SmartTrade controls
// -----------------------------------------------------------------------------
const trailingTpHelp = "Trailing Take Profit activates after reaching the selected Take Profit level and starts following favorable price movement. The trailing distance is fixed in absolute price points from the activation level. Example: if TP is 10,000 USDT and retracement is 2%, the distance is 200 USDT. If price rises to 15,000, the trailing exit is 14,800.";
const stopTimeoutHelp = "A double check before triggering Stop Loss. When price reaches the Stop Loss, the system starts the timer and checks the condition again after the selected number of seconds. If the Stop Loss condition is no longer true, it will not trigger. A longer delay may allow a larger loss.";
const breakevenHelp = "To activate, you need at least two separate Take Profit targets. When the first Take Profit target is reached, the Stop Loss price moves to the average entry price.";

const oldTrailingMain = '<div className={styles.inlineToggle}><span>Trailing Take Profit <b className={styles.helpDot}>?</b></span><Toggle checked={trailingTp} onChange={(value) => { setTrailingTp(value); if (value) setSmartTps((items) => [{ ...(items[0] ?? { target: 10, share: 100 }), share: 100 }]); }}/></div>\n        {trailingTp && <p className={styles.helperText}>After the TP activation price is reached, the paper engine follows the best price and closes on a 0.20% retracement.</p>}';
const newTrailingMain = `<div className={styles.inlineToggle}><span>Trailing Take Profit for last target <b className={styles.helpDot + " " + styles.smartHelpTooltip} data-tooltip="${trailingTpHelp}">?</b></span><Toggle checked={trailingTp} onChange={setTrailingTp}/></div>
        {trailingTp && <label className={styles.field}><span>Retracement, %</span><div className={styles.inputUnit}><NumericInput min={0.01} max={99.99} step="0.01" value={trailingTpDeviation} onValueChange={setTrailingTpDeviation} ariaLabel="Trailing take profit retracement percent"/><b>%</b></div></label>}`;
if (!source.includes(oldTrailingMain) && !source.includes('Trailing Take Profit for last target')) {
  throw new Error("SmartTrade V3: main trailing TP UI anchor missing.");
}
source = source.replace(oldTrailingMain, newTrailingMain);

source = source.replace(
  '<div className={styles.inlineToggle}><span>Stop Loss timeout <b className={styles.helpDot}>?</b></span><Toggle checked={stopTimeout} onChange={setStopTimeout}/></div>',
  `<div className={styles.inlineToggle}><span>Stop Loss timeout <b className={styles.helpDot + " " + styles.smartHelpTooltip} data-tooltip="${stopTimeoutHelp}">?</b></span><Toggle checked={stopTimeout} onChange={setStopTimeout}/></div>`
);

source = source.replace(
  '<div className={styles.inlineToggle}><span>Trailing Stop Loss <b className={styles.helpDot}>?</b></span><Toggle checked={trailingStop} onChange={setTrailingStop}/></div>',
  ''
);

source = source.replace(
  '<div className={styles.inlineToggle}><span>Move to Breakeven <b className={styles.helpDot}>?</b></span><Toggle checked={breakeven} onChange={setBreakeven}/></div>',
  `<div className={styles.inlineToggle}><span>Move to Breakeven <b className={styles.helpDot + " " + styles.smartHelpTooltip} data-tooltip="${breakevenHelp}">?</b></span><Toggle checked={breakeven} onChange={(value) => { if (value && !smartStopEnabled) { setNotice("Move to Breakeven requires Stop Loss to be enabled."); return; } if (value && smartTps.length < 2) { setNotice("Move to Breakeven requires at least two Take Profit targets."); return; } setBreakeven(value); }}/></div>`
);
source = source.replace(
  '{breakeven && <p className={styles.helperText}>After the first TP executes, the Stop Loss is raised to the weighted average entry price.</p>}',
  '{breakeven && <p className={styles.helperText}>After TP1 fills, the Stop Loss moves to the current weighted average entry price.</p>}'
);

if (!source.includes("SMARTTRADE_BREAKEVEN_ELIGIBILITY_V3")) {
  const anchor = '  const [breakeven, setBreakeven] = useState(false);';
  if (!source.includes(anchor)) throw new Error("SmartTrade V3: breakeven state anchor missing.");
  source = source.replace(anchor, [
    anchor,
    '  // SMARTTRADE_BREAKEVEN_ELIGIBILITY_V3',
    '  useEffect(() => {',
    '    if (breakeven && (!smartStopEnabled || smartTps.length < 2)) setBreakeven(false);',
    '  }, [breakeven, smartStopEnabled, smartTps.length]);',
  ].join("\n"));
}

// Trailing TP may be used with multiple TP targets; it applies only to the LAST target.
source = source.replace(
  /^\s*if \(trailingEnabled && \(targets\.length !== 1 \|\| Math\.abs\(totalShare - 100\) > 0\.000001\)\) return "Trailing Take Profit currently requires one target using 100% of the position\.";\n/m,
  ''
);

// -----------------------------------------------------------------------------
// 3) Creation/edit persistence and validation
// -----------------------------------------------------------------------------
source = source.replace(
  '      stopEnabled: smartStopEnabled, stopPct: smartStopPct, tpOrderType, stopOrderType, stopTimeout, stopTimeoutSec, trailingStop, breakeven, trailingTp, trailingTpDeviation,',
  '      stopEnabled: smartStopEnabled, stopPct: smartStopPct, tpOrderType, stopOrderType, stopTimeout, stopTimeoutSec, trailingStop: false, breakeven, trailingTp, trailingTpDeviation,'
);

source = source.replace(
  '    if (breakeven && !smartStopEnabled) { setNotice("Move to Breakeven requires Stop Loss to be enabled."); return; }',
  '    if (breakeven && !smartStopEnabled) { setNotice("Move to Breakeven requires Stop Loss to be enabled."); return; }\n    if (breakeven && smartTps.length < 2) { setNotice("Move to Breakeven requires at least two Take Profit targets."); return; }\n    if (stopTimeout && !smartStopEnabled) { setNotice("Stop Loss timeout requires Stop Loss to be enabled."); return; }'
);

source = source.replace(
  '    setSmartEditDraft({ takeProfits: trade.takeProfits.map((target) => ({ ...target })), tpOrderType: trade.tpOrderType ?? "Limit", stopEnabled: trade.stopEnabled, stopPct: trade.stopPct, stopOrderType: trade.stopOrderType ?? "Cond. Market", stopTimeout: Boolean(trade.stopTimeout), stopTimeoutSec: trade.stopTimeoutSec ?? 300, trailingStop: Boolean(trade.trailingStop), breakeven: Boolean(trade.breakeven), trailingTp: Boolean(trade.trailingTp), trailingTpDeviation: trade.trailingTpDeviation ?? 0.2 });',
  '    setSmartEditDraft({ takeProfits: trade.takeProfits.map((target) => ({ ...target })), tpOrderType: trade.tpOrderType ?? "Limit", stopEnabled: trade.stopEnabled, stopPct: trade.stopPct, stopOrderType: trade.stopOrderType ?? "Cond. Market", stopTimeout: Boolean(trade.stopTimeout), stopTimeoutSec: trade.stopTimeoutSec ?? 300, trailingStop: false, breakeven: Boolean(trade.breakeven), trailingTp: Boolean(trade.trailingTp), trailingTpDeviation: trade.trailingTpDeviation ?? 0.2 });'
);

source = source.replace(
  'trailingStop: smartEditDraft.trailingStop, trailingStopPeak: trade.lastPrice ?? trade.averagePrice ?? trade.entryPrice,',
  'trailingStop: false, trailingStopPeak: undefined,'
);

source = source.replace(
  '    if (smartEditDraft.breakeven && !smartEditDraft.stopEnabled) { setNotice("Move to Breakeven requires Stop Loss to be enabled."); return; }',
  '    if (smartEditDraft.breakeven && !smartEditDraft.stopEnabled) { setNotice("Move to Breakeven requires Stop Loss to be enabled."); return; }\n    if (smartEditDraft.breakeven && smartEditDraft.takeProfits.length < 2) { setNotice("Move to Breakeven requires at least two Take Profit targets."); return; }\n    if (smartEditDraft.stopTimeout && !smartEditDraft.stopEnabled) { setNotice("Stop Loss timeout requires Stop Loss to be enabled."); return; }'
);

// Edit modal: trailing TP no longer collapses the target list. The user controls retracement.
source = source.replace(
  'onChange={(value) => setSmartEditDraft((draft) => draft ? { ...draft, trailingTp: value, trailingTpDeviation: 0.2, takeProfits: value ? [{ ...(draft.takeProfits[0] ?? { target: 10, share: 100 }), share: 100 }] : draft.takeProfits } : draft)}',
  'onChange={(value) => setSmartEditDraft((draft) => draft ? { ...draft, trailingTp: value } : draft)}'
);

const editTrailingRow = '<div className={styles.smartTradeToggleRow}><span>Trailing Take Profit</span><Toggle checked={smartEditDraft.trailingTp} onChange={(value) => setSmartEditDraft((draft) => draft ? { ...draft, trailingTp: value } : draft)}/></div>';
if (source.includes(editTrailingRow) && !source.includes('Edit trailing take profit retracement percent')) {
  source = source.replace(editTrailingRow, `${editTrailingRow.replace('<span>Trailing Take Profit</span>', `<span>Trailing Take Profit for last target <b className={styles.helpDot + " " + styles.smartHelpTooltip} data-tooltip="${trailingTpHelp}">?</b></span>`)}
            {smartEditDraft.trailingTp && <label><span>Retracement, %</span><NumericInput min={0.01} max={99.99} step="0.01" value={smartEditDraft.trailingTpDeviation} onValueChange={(value) => setSmartEditDraft((draft) => draft ? { ...draft, trailingTpDeviation: value } : draft)} ariaLabel="Edit trailing take profit retracement percent"/></label>}`);
}

// Edit modal Stop Loss rows.
source = source.replace(
  '<div className={styles.smartTradeToggleRow}><span>Stop Loss timeout</span><Toggle checked={smartEditDraft.stopTimeout} onChange={(value) => setSmartEditDraft((draft) => draft ? { ...draft, stopTimeout: value } : draft)}/></div>',
  `<div className={styles.smartTradeToggleRow}><span>Stop Loss timeout <b className={styles.helpDot + " " + styles.smartHelpTooltip} data-tooltip="${stopTimeoutHelp}">?</b></span><Toggle checked={smartEditDraft.stopTimeout} onChange={(value) => setSmartEditDraft((draft) => draft ? { ...draft, stopTimeout: value } : draft)}/></div>`
);

source = source.replace(
  '<div className={styles.smartTradeToggleRow}><span>Trailing Stop Loss</span><Toggle checked={smartEditDraft.trailingStop} onChange={(value) => setSmartEditDraft((draft) => draft ? { ...draft, trailingStop: value } : draft)}/></div>',
  ''
);

source = source.replace(
  '<div className={styles.smartTradeToggleRow}><span>Move to Breakeven</span><Toggle checked={smartEditDraft.breakeven} onChange={(value) => setSmartEditDraft((draft) => draft ? { ...draft, breakeven: value } : draft)}/></div>',
  `<div className={styles.smartTradeToggleRow}><span>Move to Breakeven <b className={styles.helpDot + " " + styles.smartHelpTooltip} data-tooltip="${breakevenHelp}">?</b></span><Toggle checked={smartEditDraft.breakeven} onChange={(value) => setSmartEditDraft((draft) => { if (!draft) return draft; if (value && !draft.stopEnabled) { setNotice("Move to Breakeven requires Stop Loss to be enabled."); return draft; } if (value && draft.takeProfits.length < 2) { setNotice("Move to Breakeven requires at least two Take Profit targets."); return draft; } return { ...draft, breakeven: value }; })}/></div>`
);

// -----------------------------------------------------------------------------
// 4) Stop-price helper: fixed SL + breakeven only. Trailing SL is removed.
// -----------------------------------------------------------------------------
{
  const start = source.indexOf('function smartTradeStopPrice(trade: SmartTrade) {');
  const end = start >= 0 ? source.indexOf('\nfunction smartTradeReached(', start) : -1;
  if (start < 0 || end < 0) throw new Error("SmartTrade V3: stop-price helper boundaries missing.");
  const replacement = `function smartTradeStopPrice(trade: SmartTrade) {
  if (!trade.stopEnabled) return null;
  const average = smartTradeAveragePrice(trade);
  const direction = smartTradeDirection(trade);
  if (trade.breakeven && trade.breakevenActivated) return average;
  return average * (1 - direction * trade.stopPct / 100);
}
`;
  source = source.slice(0, start) + replacement + source.slice(end);
}

// -----------------------------------------------------------------------------
// 5) Deterministic SmartTrade protection engine
// -----------------------------------------------------------------------------
{
  const start = source.indexOf('function markSmartTradeAtPrice(trade: SmartTrade, currentPrice: number');
  if (start < 0) throw new Error("SmartTrade V3: protection engine start missing.");
  const candidates = [
    source.indexOf('function takeProfitAllocationTotal(', start),
    source.indexOf('function takeProfitValidationError(', start),
    source.indexOf('function boundedPercentError(', start),
    source.indexOf('function navGlyph(', start),
  ].filter((value) => value > start);
  const end = candidates.length ? Math.min(...candidates) : -1;
  if (end < 0) throw new Error("SmartTrade V3: protection engine end missing.");

  const engine = `function markSmartTradeAtPrice(trade: SmartTrade, currentPrice: number, nowMs = Date.now()): SmartTrade {
  if (trade.status !== "Active" || !Number.isFinite(currentPrice) || currentPrice <= 0) return trade;

  const average = smartTradeAveragePrice(trade);
  let quantity = smartTradeQuantity(trade);
  let amount = Number.isFinite(trade.amount) ? Math.max(0, trade.amount) : average * quantity;
  let realizedPnl = trade.realizedPnl ?? 0;
  let tpHits = trade.tpHits?.length === trade.takeProfits.length ? [...trade.tpHits] : trade.takeProfits.map(() => false);
  const direction = smartTradeDirection(trade);
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
    trailingStop: false,
    trailingStopPeak: undefined,
    breakevenActivated,
  };

  // Stop Loss timeout = continuous breach for the full delay. If price recovers before
  // the timer expires, the pending stop is cancelled and a future breach starts a new timer.
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
      closeReason: working.breakevenActivated ? "Breakeven Stop" : "Stop Loss",
    };
  }
  if (working.stopTriggeredAt) working = { ...working, stopTriggeredAt: null };

  // Trailing TP is allowed with split targets. It applies ONLY to the last target.
  // The retracement distance is fixed in absolute price points from that target's
  // activation price (matching the 3Commas explanation).
  const executionTpError = takeProfitValidationError(working.takeProfits, false, true);
  if (executionTpError) return working;
  const tpPrices = smartTradeTpPrices(working);
  const trailingIndex = working.trailingTp && tpPrices.length ? tpPrices.length - 1 : -1;
  const accumulatedQty = (working.fills ?? []).reduce(
    (sum, fill) => sum + ((fill.kind === "Base" || fill.kind === "Averaging" || fill.kind === "Add Funds") ? Math.max(0, fill.quantity) : 0),
    0
  ) || smartTradeQuantity(working);

  // Fill all ordinary TP targets first. The final target is skipped when trailing TP is on.
  for (let index = 0; index < tpPrices.length; index += 1) {
    if (index === trailingIndex) continue;
    if (tpHits[index] || !smartTradeReached(working, currentPrice, tpPrices[index])) continue;
    const targetWeight = Math.max(0, working.takeProfits[index]?.share ?? 0);
    const closeQty = Math.min(quantity, accumulatedQty * Math.min(100, targetWeight) / 100);
    const fillPrice = working.tpOrderType === "Market" ? currentPrice : tpPrices[index];
    realizedPnl += (fillPrice - average) * closeQty * direction;
    quantity = Math.max(0, quantity - closeQty);
    amount = Math.max(0, amount - average * closeQty);
    tpHits[index] = true;
  }

  // Move to Breakeven is valid only with 2+ TPs and activates specifically after TP1 fills.
  if (working.breakeven && working.takeProfits.length >= 2 && tpHits[0]) {
    breakevenActivated = true;
  }

  let trailingActivated = Boolean(working.trailingActivated);
  let trailingPeak = working.trailingPeak ?? currentPrice;

  if (trailingIndex >= 0 && !tpHits[trailingIndex]) {
    const activation = tpPrices[trailingIndex];
    if (activation != null && smartTradeReached(working, currentPrice, activation)) trailingActivated = true;

    if (trailingActivated) {
      trailingPeak = working.side === "Buy"
        ? Math.max(trailingPeak, currentPrice)
        : Math.min(trailingPeak, currentPrice);

      const deviationPct = Math.max(0.01, Math.min(99.99, Number(working.trailingTpDeviation ?? 0.2)));
      const absoluteDistance = Math.abs(activation) * deviationPct / 100;
      const trailingExit = working.side === "Buy"
        ? currentPrice <= trailingPeak - absoluteDistance
        : currentPrice >= trailingPeak + absoluteDistance;

      if (trailingExit) {
        const targetWeight = Math.max(0, working.takeProfits[trailingIndex]?.share ?? 0);
        const closeQty = Math.min(quantity, accumulatedQty * Math.min(100, targetWeight) / 100);
        realizedPnl += (currentPrice - average) * closeQty * direction;
        quantity = Math.max(0, quantity - closeQty);
        amount = Math.max(0, amount - average * closeQty);
        tpHits[trailingIndex] = true;
      }
    }
  }

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
      trailingActivated,
      trailingPeak,
      status: "Closed",
      closedAt: new Date(nowMs).toISOString(),
      exitPrice: currentPrice,
      closeReason: trailingIndex >= 0 && tpHits[trailingIndex] ? "Trailing Take Profit" : "Take Profit",
    };
  }

  return {
    ...working,
    tpHits,
    quantity,
    amount,
    realizedPnl,
    breakevenActivated,
    trailingActivated,
    trailingPeak,
  };
}

`;
  source = source.slice(0, start) + engine + source.slice(end);
}

// -----------------------------------------------------------------------------
// 6) Protection clock: evaluate timeout/trailing/breakeven even if no new tick arrives
// -----------------------------------------------------------------------------
if (!source.includes('SMARTTRADE_PROTECTION_CLOCK_V3')) {
  const anchor = '  const selectedSmartChartTrade = selectedSmartTradeChartId ? smartTrades.find((trade) => trade.id === selectedSmartTradeChartId) ?? null : null;';
  if (!source.includes(anchor)) throw new Error("SmartTrade V3: SmartTrade helper anchor missing.");
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
  ].join("\n");
  source = source.replace(anchor, clock + anchor);
}

// Old saved SmartTrades: retire trailing SL while preserving the other live protections.
source = source.replace(
  '            trailingStop: Boolean(trade.trailingStop),\n            trailingStopPeak: trade.trailingStopPeak ?? trade.lastPrice ?? averagePrice,',
  '            trailingStop: false,\n            trailingStopPeak: undefined,'
);

// -----------------------------------------------------------------------------
// 7) Styling: active size buttons + 3Commas-style hover explanations
// -----------------------------------------------------------------------------
if (!css.includes('/* SmartTrade functional V3 */')) {
  css += `
/* SmartTrade functional V3 */
.percentButtons button{cursor:pointer;transition:border-color .12s ease,background .12s ease,color .12s ease}
.percentButtons button:hover{border-color:#29c7be!important;color:#d9fffc!important;background:#173039!important}
.percentButtonActive{background:#365064!important;border-color:#4c687b!important;color:#e7f0f5!important}
.smartHelpTooltip{position:relative;cursor:help;overflow:visible!important}
.smartHelpTooltip::after{content:attr(data-tooltip);position:absolute;z-index:250;left:50%;bottom:calc(100% + 12px);transform:translateX(-50%) translateY(4px);width:360px;max-width:min(360px,72vw);padding:12px 14px;border-radius:5px;background:#7898b4;color:#fff;font-size:12px;font-weight:500;line-height:1.45;text-align:left;white-space:normal;box-shadow:0 12px 28px rgba(0,0,0,.32);opacity:0;visibility:hidden;pointer-events:none;transition:opacity .12s ease,transform .12s ease}
.smartHelpTooltip::before{content:"";position:absolute;z-index:251;left:50%;bottom:calc(100% + 6px);transform:translateX(-50%);border:6px solid transparent;border-top-color:#7898b4;opacity:0;visibility:hidden;pointer-events:none}
.smartHelpTooltip:hover::after,.smartHelpTooltip:hover::before{opacity:1;visibility:visible}
.smartHelpTooltip:hover::after{transform:translateX(-50%) translateY(0)}
`;
}

// Hard guards: fail deployment if anything is only cosmetic.
const required = [
  'SMARTTRADE_SIZE_PCT_SYNC_V3',
  'SMARTTRADE_PROTECTION_CLOCK_V3',
  'Trailing Take Profit for last target',
  'Retracement, %',
  'Move to Breakeven requires at least two Take Profit targets.',
  'absoluteDistance = Math.abs(activation) * deviationPct / 100',
  'stopTriggeredAt: new Date(nowMs).toISOString()',
  'working.takeProfits.length >= 2 && tpHits[0]',
  'trailingStop: false',
  'smartHelpTooltip',
  'percentButtonActive',
];
for (const marker of required) {
  if (!source.includes(marker) && !css.includes(marker)) throw new Error(`SmartTrade V3: missing required marker: ${marker}`);
}

if (source.includes('Trailing Stop Loss <b className={styles.helpDot}>')) throw new Error("SmartTrade V3: trailing Stop Loss still visible.");
if (source.includes('Follow max price with deviation')) throw new Error("SmartTrade V3: obsolete trailing TP deviation UI still visible.");

fs.writeFileSync(traderPath, source);
fs.writeFileSync(cssPath, css);
console.log("Prepared SmartTrade functional V3: live percent sizing, user trailing TP retracement, real SL timeout, and TP1 breakeven.");