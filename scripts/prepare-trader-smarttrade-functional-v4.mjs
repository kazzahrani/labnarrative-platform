import fs from "node:fs";
import path from "node:path";

const traderPath = path.join(process.cwd(), "app/trader/TradingAgent.tsx");
const cssPath = path.join(process.cwd(), "app/trader/trader.module.css");
let source = fs.readFileSync(traderPath, "utf8");
let css = fs.readFileSync(cssPath, "utf8");

// SMARTTRADE FUNCTIONAL V4
// Restore the approved simplified SmartTrade protection behavior after V3:
// - live percentage sizing from current free paper USDT stays intact
// - trailing TP has no user-facing deviation control and uses a fixed 0.20% retracement
// - trailing SL is visible, persisted, and ratchets upward without ever loosening
// - SL timeout remains a continuous-breach timer that resets on recovery
// - breakeven moves protection to average entry after TP1 or trailing-TP activation

const FIXED_TRAILING_TP_PCT = 0.2;
const trailingTpHelp = "Trailing Take Profit activates after the final configured Take Profit level is reached. The paper engine then follows the best price and exits after its fixed internal retracement. There is no extra deviation setting in this simplified version.";
const trailingSlHelp = "For a long trade, Trailing Stop Loss follows new favorable highs using the configured Stop Loss distance. The stop can only move upward and never moves back down.";
const breakevenHelp = "When Stop Loss is enabled, Move to Breakeven raises the stop to the weighted average entry after the first Take Profit fills or trailing Take Profit activates. Protection never moves lower afterward.";

// -----------------------------------------------------------------------------
// 1) Simplified trailing TP UI: no exposed retracement control.
// -----------------------------------------------------------------------------
{
  const mainTrailing = /<div className=\{styles\.inlineToggle\}><span>Trailing Take Profit for last target[\s\S]*?ariaLabel="Trailing take profit retracement percent"\/><b>%<\/b><\/div><\/label>\}/;
  if (!mainTrailing.test(source) && !source.includes("fixed internal 0.20% retracement")) {
    throw new Error("SmartTrade V4: main trailing TP control anchor missing.");
  }
  source = source.replace(mainTrailing, `<div className={styles.inlineToggle}><span>Trailing Take Profit <b className={styles.helpDot + " " + styles.smartHelpTooltip} data-tooltip="${trailingTpHelp}">?</b></span><Toggle checked={trailingTp} onChange={setTrailingTp}/></div>
        {trailingTp && <p className={styles.helperText}>After the final TP activation price is reached, the paper engine follows the best price and closes on its fixed internal 0.20% retracement.</p>}`);

  const editTrailing = /<div className=\{styles\.smartTradeToggleRow\}><span>Trailing Take Profit for last target[\s\S]*?<\/div>\s*\{smartEditDraft\.trailingTp && <label><span>Retracement, %<\/span>[\s\S]*?ariaLabel="Edit trailing take profit retracement percent"\/><\/label>\}/;
  source = source.replace(editTrailing, `<div className={styles.smartTradeToggleRow}><span>Trailing Take Profit <b className={styles.helpDot + " " + styles.smartHelpTooltip} data-tooltip="${trailingTpHelp}">?</b></span><Toggle checked={smartEditDraft.trailingTp} onChange={(value) => setSmartEditDraft((draft) => draft ? { ...draft, trailingTp: value, trailingTpDeviation: ${FIXED_TRAILING_TP_PCT} } : draft)}/></div>`);
}

// Always persist the simplified fixed trailing-TP value, including edits and legacy drafts.
source = source.replaceAll("trailingTp, trailingTpDeviation,", `trailingTp, trailingTpDeviation: ${FIXED_TRAILING_TP_PCT},`);
source = source.replaceAll("trailingTpDeviation: smartEditDraft.trailingTpDeviation", `trailingTpDeviation: ${FIXED_TRAILING_TP_PCT}`);
source = source.replaceAll("trailingTpDeviation: trade.trailingTpDeviation ?? 0.2", `trailingTpDeviation: ${FIXED_TRAILING_TP_PCT}`);

// -----------------------------------------------------------------------------
// 2) Restore functional Trailing Stop Loss controls and persistence.
// -----------------------------------------------------------------------------
const mainMovePrefix = '<div className={styles.inlineToggle}><span>Move to Breakeven <b className={styles.helpDot + " " + styles.smartHelpTooltip}';
if (!source.includes('Trailing Stop Loss <b className={styles.helpDot + " " + styles.smartHelpTooltip}')) {
  if (!source.includes(mainMovePrefix)) throw new Error("SmartTrade V4: main breakeven row anchor missing.");
  source = source.replace(mainMovePrefix, `<div className={styles.inlineToggle}><span>Trailing Stop Loss <b className={styles.helpDot + " " + styles.smartHelpTooltip} data-tooltip="${trailingSlHelp}">?</b></span><Toggle checked={trailingStop} onChange={setTrailingStop}/></div>\n        ${mainMovePrefix}`);
}

const editMovePrefix = '<div className={styles.smartTradeToggleRow}><span>Move to Breakeven <b className={styles.helpDot + " " + styles.smartHelpTooltip}';
if (!source.includes('<div className={styles.smartTradeToggleRow}><span>Trailing Stop Loss <b className={styles.helpDot + " " + styles.smartHelpTooltip}')) {
  if (!source.includes(editMovePrefix)) throw new Error("SmartTrade V4: edit breakeven row anchor missing.");
  source = source.replace(editMovePrefix, `<div className={styles.smartTradeToggleRow}><span>Trailing Stop Loss <b className={styles.helpDot + " " + styles.smartHelpTooltip} data-tooltip="${trailingSlHelp}">?</b></span><Toggle checked={smartEditDraft.trailingStop} onChange={(value) => setSmartEditDraft((draft) => draft ? { ...draft, trailingStop: value } : draft)}/></div>\n            ${editMovePrefix}`);
}

source = source.replace(
  "stopTimeout, stopTimeoutSec, trailingStop: false, breakeven, trailingTp,",
  "stopTimeout, stopTimeoutSec, trailingStop, breakeven, trailingTp,"
);
source = source.replace(
  "stopTimeoutSec: trade.stopTimeoutSec ?? 300, trailingStop: false, breakeven:",
  "stopTimeoutSec: trade.stopTimeoutSec ?? 300, trailingStop: Boolean(trade.trailingStop), breakeven:"
);
source = source.replace(
  "trailingStop: false, trailingStopPeak: undefined,",
  "trailingStop: smartEditDraft.trailingStop, trailingStopPeak: smartEditDraft.trailingStop ? (trade.trailingStopPeak ?? trade.lastPrice ?? trade.averagePrice ?? trade.entryPrice) : undefined,"
);

// Preserve existing saved trailing-SL settings instead of retiring them on load.
source = source.replace(
  "            trailingStop: false,\n            trailingStopPeak: undefined,",
  "            trailingStop: Boolean(trade.trailingStop),\n            trailingStopPeak: trade.trailingStop ? (trade.trailingStopPeak ?? trade.lastPrice ?? averagePrice) : undefined,"
);

// -----------------------------------------------------------------------------
// 3) Breakeven: Stop Loss is required, but a second TP is not.
// -----------------------------------------------------------------------------
source = source.replaceAll('if (breakeven && (!smartStopEnabled || smartTps.length < 2)) setBreakeven(false);', 'if (breakeven && !smartStopEnabled) setBreakeven(false);');
source = source.replaceAll('if (breakeven && smartTps.length < 2) { setNotice("Move to Breakeven requires at least two Take Profit targets."); return; }\\n    ', '');
source = source.replaceAll('if (smartEditDraft.breakeven && smartEditDraft.takeProfits.length < 2) { setNotice("Move to Breakeven requires at least two Take Profit targets."); return; }\\n    ', '');
source = source.replaceAll('if (value && smartTps.length < 2) { setNotice("Move to Breakeven requires at least two Take Profit targets."); return; } ', '');
source = source.replaceAll('if (value && draft.takeProfits.length < 2) { setNotice("Move to Breakeven requires at least two Take Profit targets."); return draft; } ', '');
source = source.replaceAll(
  "To activate, you need at least two separate Take Profit targets. When the first Take Profit target is reached, the Stop Loss price moves to the average entry price.",
  breakevenHelp
);
source = source.replaceAll(
  "After TP1 fills, the Stop Loss moves to the current weighted average entry price.",
  "After TP1 fills or trailing TP activates, the Stop Loss moves to the current weighted average entry price."
);

// -----------------------------------------------------------------------------
// 4) Stop-price helper: fixed SL + ratcheting trailing SL + breakeven floor.
// -----------------------------------------------------------------------------
{
  const start = source.indexOf("function smartTradeStopPrice(trade: SmartTrade) {");
  const end = start >= 0 ? source.indexOf("\nfunction smartTradeReached(", start) : -1;
  if (start < 0 || end < 0) throw new Error("SmartTrade V4: stop-price helper boundaries missing.");
  const helper = `function smartTradeStopPrice(trade: SmartTrade) {
  if (!trade.stopEnabled) return null;
  const average = smartTradeAveragePrice(trade);
  const direction = smartTradeDirection(trade);
  let level = average * (1 - direction * trade.stopPct / 100);
  if (trade.trailingStop && Number.isFinite(trade.trailingStopPeak) && (trade.trailingStopPeak ?? 0) > 0) {
    const trailingLevel = (trade.trailingStopPeak ?? average) * (1 - direction * trade.stopPct / 100);
    level = trade.side === "Buy" ? Math.max(level, trailingLevel) : Math.min(level, trailingLevel);
  }
  if (trade.breakeven && trade.breakevenActivated) {
    level = trade.side === "Buy" ? Math.max(level, average) : Math.min(level, average);
  }
  return level;
}
`;
  source = source.slice(0, start) + helper + source.slice(end);
}

// -----------------------------------------------------------------------------
// 5) Unified SmartTrade protection engine.
// -----------------------------------------------------------------------------
{
  const start = source.indexOf("function markSmartTradeAtPrice(trade: SmartTrade, currentPrice: number");
  if (start < 0) throw new Error("SmartTrade V4: protection engine start missing.");
  const candidates = [
    source.indexOf("function takeProfitAllocationTotal(", start),
    source.indexOf("function takeProfitValidationError(", start),
    source.indexOf("function boundedPercentError(", start),
    source.indexOf("function navGlyph(", start),
  ].filter((value) => value > start);
  const end = candidates.length ? Math.min(...candidates) : -1;
  if (end < 0) throw new Error("SmartTrade V4: protection engine end missing.");

  const engine = `function markSmartTradeAtPrice(trade: SmartTrade, currentPrice: number, nowMs = Date.now()): SmartTrade {
  if (trade.status !== "Active" || !Number.isFinite(currentPrice) || currentPrice <= 0) return trade;

  const average = smartTradeAveragePrice(trade);
  let quantity = smartTradeQuantity(trade);
  let amount = Number.isFinite(trade.amount) ? Math.max(0, trade.amount) : average * quantity;
  let realizedPnl = trade.realizedPnl ?? 0;
  let tpHits = trade.tpHits?.length === trade.takeProfits.length ? [...trade.tpHits] : trade.takeProfits.map(() => false);
  const direction = smartTradeDirection(trade);
  let breakevenActivated = Boolean(trade.breakevenActivated);

  // Trailing SL ratchets only in the favorable direction. For a long trade the peak
  // can only increase, so the resulting stop can never move downward.
  let trailingStopPeak = Number.isFinite(trade.trailingStopPeak) && (trade.trailingStopPeak ?? 0) > 0
    ? Number(trade.trailingStopPeak)
    : average;
  if (trade.trailingStop) {
    trailingStopPeak = trade.side === "Buy"
      ? Math.max(trailingStopPeak, currentPrice, average)
      : Math.min(trailingStopPeak, currentPrice, average);
  }

  let working: SmartTrade = {
    ...trade,
    averagePrice: average,
    quantity,
    amount,
    totalInvested: trade.totalInvested ?? trade.amount,
    lastPrice: currentPrice,
    tpHits,
    realizedPnl,
    trailingStopPeak: trade.trailingStop ? trailingStopPeak : undefined,
    breakevenActivated,
  };

  // Stop Loss timeout requires one continuous breach. Recovery clears the timer.
  const stopLevel = smartTradeStopPrice(working);
  const stopBreached = stopLevel != null && smartTradeStopReached(working, currentPrice, stopLevel);
  if (stopBreached) {
    if (working.stopTimeout) {
      const timeoutMs = Math.max(1, Number(working.stopTimeoutSec ?? 300)) * 1000;
      const startedMs = working.stopTriggeredAt ? new Date(working.stopTriggeredAt).getTime() : NaN;
      if (!Number.isFinite(startedMs)) return { ...working, stopTriggeredAt: new Date(nowMs).toISOString() };
      if (nowMs - startedMs < timeoutMs) return working;
    }
    const stopFillPrice = working.stopOrderType === "Cond. Limit" && stopLevel != null ? stopLevel : currentPrice;
    const exitPnl = (stopFillPrice - average) * quantity * direction;
    const fixedStop = average * (1 - direction * working.stopPct / 100);
    const trailingWasProtective = Boolean(working.trailingStop && stopLevel != null && (working.side === "Buy" ? stopLevel > fixedStop + 1e-12 : stopLevel < fixedStop - 1e-12));
    return {
      ...working,
      status: "Closed",
      quantity: 0,
      amount: 0,
      realizedPnl: realizedPnl + exitPnl,
      closedAt: new Date(nowMs).toISOString(),
      exitPrice: stopFillPrice,
      closeReason: trailingWasProtective ? "Trailing Stop Loss" : (working.breakevenActivated ? "Breakeven Stop" : "Stop Loss"),
    };
  }
  if (working.stopTriggeredAt) working = { ...working, stopTriggeredAt: null };

  // Never execute an invalid TP allocation, including legacy configurations >100%.
  const executionTpError = takeProfitValidationError(working.takeProfits, false, true);
  if (executionTpError) return working;

  const tpPrices = smartTradeTpPrices(working);
  const trailingIndex = working.trailingTp && tpPrices.length ? tpPrices.length - 1 : -1;
  const accumulatedQty = (working.fills ?? []).reduce(
    (sum, fill) => sum + ((fill.kind === "Base" || fill.kind === "Averaging" || fill.kind === "Add Funds") ? Math.max(0, fill.quantity) : 0),
    0
  ) || smartTradeQuantity(working);

  // Ordinary TPs fill first. Limit exits use the configured target; Market exits use live price.
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

  if (working.breakeven && tpHits.some(Boolean)) breakevenActivated = true;

  let trailingActivated = Boolean(working.trailingActivated);
  let trailingPeak = working.trailingPeak ?? currentPrice;

  // Trailing TP applies to the final TP target and uses the fixed internal 0.20% retracement.
  if (trailingIndex >= 0 && !tpHits[trailingIndex]) {
    const activation = tpPrices[trailingIndex];
    if (activation != null && smartTradeReached(working, currentPrice, activation)) trailingActivated = true;

    if (trailingActivated) {
      if (working.breakeven) breakevenActivated = true;
      trailingPeak = working.side === "Buy"
        ? Math.max(trailingPeak, currentPrice)
        : Math.min(trailingPeak, currentPrice);

      const absoluteDistance = Math.abs(activation) * ${FIXED_TRAILING_TP_PCT} / 100;
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
      trailingStopPeak: working.trailingStop ? trailingStopPeak : undefined,
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
    trailingStopPeak: working.trailingStop ? trailingStopPeak : undefined,
  };
}

`;
  source = source.slice(0, start) + engine + source.slice(end);
}

// -----------------------------------------------------------------------------
// 6) Final guards: do not ship cosmetic controls or regress the requested behavior.
// -----------------------------------------------------------------------------
const required = [
  "SMARTTRADE_SIZE_PCT_SYNC_V3",
  "SMARTTRADE_PROTECTION_CLOCK_V3",
  "Trailing Stop Loss",
  "fixed internal 0.20% retracement",
  "absoluteDistance = Math.abs(activation) * 0.2 / 100",
  "trailingStopPeak = trade.side === \"Buy\"",
  "stopTriggeredAt: new Date(nowMs).toISOString()",
  "tpHits.some(Boolean)",
  "takeProfitValidationError(working.takeProfits, false, true)",
];
for (const marker of required) {
  if (!source.includes(marker) && !css.includes(marker)) throw new Error(`SmartTrade V4: missing required marker: ${marker}`);
}
if (source.includes('ariaLabel="Trailing take profit retracement percent"')) throw new Error("SmartTrade V4: main trailing TP retracement input is still visible.");
if (source.includes('ariaLabel="Edit trailing take profit retracement percent"')) throw new Error("SmartTrade V4: edit trailing TP retracement input is still visible.");
if (source.includes("Follow max price with deviation (%)")) throw new Error("SmartTrade V4: obsolete trailing TP control resurfaced.");
if (source.includes('Use Existing Assets <b className={styles.helpDot}>?</b>')) throw new Error("SmartTrade V4: Use Existing Assets resurfaced.");
if (source.includes("<button>Cond.</button>")) throw new Error("SmartTrade V4: conditional buy control resurfaced.");

fs.writeFileSync(traderPath, source);
fs.writeFileSync(cssPath, css);
console.log("Prepared SmartTrade functional V4: fixed trailing TP, restored trailing SL, continuous timeout and breakeven protection.");