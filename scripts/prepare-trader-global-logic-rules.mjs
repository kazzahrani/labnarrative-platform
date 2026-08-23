import fs from "node:fs";
import path from "node:path";

const traderPath = path.join(process.cwd(), "app/trader/TradingAgent.tsx");
let source = fs.readFileSync(traderPath, "utf8");

// GLOBAL TRADING LOGIC RULES V1
// Central integrity constraints shared by SmartTrade and DCA paper execution.
if (!source.includes("function takeProfitValidationError(")) {
  const anchor = 'function navGlyph(section: Section) {';
  const helpers = [
    'function takeProfitValidationError(targets: TakeProfit[], trailingEnabled = false, allowEmpty = false) {',
    '  if (!targets.length) return allowEmpty ? null : "Add at least one take-profit target.";',
    '  let totalShare = 0;',
    '  let previousTarget = -Infinity;',
    '  for (let index = 0; index < targets.length; index += 1) {',
    '    const target = Number(targets[index]?.target);',
    '    const share = Number(targets[index]?.share);',
    '    if (!Number.isFinite(target) || target <= 0) return `TP${index + 1} target must be greater than 0%.`;',
    '    if (!Number.isFinite(share) || share <= 0) return `TP${index + 1} position percentage must be greater than 0%.`;',
    '    if (target <= previousTarget) return "Take-profit targets must be strictly increasing (TP1 < TP2 < TP3...).";',
    '    previousTarget = target;',
    '    totalShare += share;',
    '  }',
    '  if (totalShare > 100.000001) return `Take-profit position percentages cannot exceed 100% (currently ${totalShare.toFixed(2)}%).`;',
    '  if (trailingEnabled && (targets.length !== 1 || Math.abs(totalShare - 100) > 0.000001)) return "Trailing Take Profit currently requires one target using 100% of the position.";',
    '  return null;',
    '}',
    'function boundedPercentError(label: string, value: number) {',
    '  if (!Number.isFinite(value) || value <= 0 || value >= 100) return `${label} must be greater than 0% and lower than 100%.`;',
    '  return null;',
    '}',
    '',
  ].join("\n");
  if (!source.includes(anchor)) throw new Error("Global logic: nav helper anchor missing.");
  source = source.replace(anchor, helpers + anchor);
}

// SmartTrade creation: validate TP allocation, risk controls, and available buy-side capital.
{
  const start = source.indexOf('  const createSmartTrade = (forcedSide?: "Buy" | "Sell") => {');
  const endCandidates = [
    source.indexOf('  const createConfiguredDcaBot =', start),
    source.indexOf('  const createDcaBot =', start),
  ].filter((value) => value > start);
  const end = endCandidates.length ? Math.min(...endCandidates) : -1;
  if (start < 0 || end < 0) throw new Error("Global logic: SmartTrade creator block missing.");
  let block = source.slice(start, end);
  const oldTp = /    if \(tpEnabled\) \{[\s\S]*?\n    \}\n(?=    const smartCreatedAt|    const trade: SmartTrade)/;
  if (!oldTp.test(block)) throw new Error("Global logic: SmartTrade TP validation anchor missing.");
  block = block.replace(oldTp, [
    '    if (tpEnabled) {',
    '      const tpError = takeProfitValidationError(smartTps, trailingTp, false);',
    '      if (tpError) { setNotice(tpError); return; }',
    '    }',
    '    if (smartStopEnabled) { const stopError = boundedPercentError("Stop Loss", smartStopPct); if (stopError) { setNotice(stopError); return; } }',
    '    if (trailingTp) { const trailingError = boundedPercentError("Trailing TP deviation", trailingTpDeviation); if (trailingError) { setNotice(trailingError); return; } }',
    '    if (side === "Buy" && total > freeCapital + 0.000001) { setNotice(`Order requires ${compactMoney(total)}, but only ${compactMoney(freeCapital)} USDT is available.`); return; }',
    '',
  ].join("\n"));
  source = source.slice(0, start) + block + source.slice(end);
}

// SmartTrade TP execution: each TP share is a percentage of the actual accumulated position,
// not a normalized fraction of the remaining TP weights. If allocated shares total <100%, the runner remains open.
{
  const old = [
    '    const remainingShareWeight = base.takeProfits.reduce((sum, target, targetIndex) => sum + (tpHits[targetIndex] ? 0 : Math.max(0, target.share)), 0);',
    '    const targetWeight = Math.max(0, base.takeProfits[index]?.share ?? 0);',
    '    const closeFraction = remainingShareWeight > 0 ? Math.min(1, targetWeight / remainingShareWeight) : 1;',
    '    const closeQty = Math.min(quantity, quantity * closeFraction);',
  ].join("\n");
  const replacement = [
    '    const targetWeight = Math.max(0, base.takeProfits[index]?.share ?? 0);',
    '    const accumulatedQty = (base.fills ?? []).reduce((sum, fill) => sum + ((fill.kind === "Base" || fill.kind === "Averaging" || fill.kind === "Add Funds") ? Math.max(0, fill.quantity) : 0), 0) || smartTradeQuantity(base);',
    '    const closeQty = Math.min(quantity, accumulatedQty * Math.min(100, targetWeight) / 100);',
  ].join("\n");
  if (!source.includes(old)) throw new Error("Global logic: SmartTrade partial TP execution anchor missing.");
  source = source.replace(old, replacement);

  const oldClose = [
    '  const allTargetsDone = tpHits.length > 0 && tpHits.every(Boolean);',
    '  if (allTargetsDone || quantity <= 1e-12) {',
  ].join("\n");
  const newClose = [
    '  const totalAllocatedTpShare = base.takeProfits.reduce((sum, target) => sum + Math.max(0, target.share), 0);',
    '  const allAllocatedTargetsDone = tpHits.length > 0 && tpHits.every(Boolean) && totalAllocatedTpShare >= 99.999999;',
    '  if (allAllocatedTargetsDone || quantity <= 1e-12) {',
  ].join("\n");
  if (!source.includes(oldClose)) throw new Error("Global logic: SmartTrade final TP close anchor missing.");
  source = source.replace(oldClose, newClose);
}

// Active SmartTrade edit rules.
{
  const anchor = [
    '  const saveSmartTradeEdit = () => {',
    '    if (!editingSmartTradeId || !smartEditDraft) return;',
  ].join("\n");
  if (!source.includes(anchor)) throw new Error("Global logic: SmartTrade edit handler missing.");
  const replacement = [
    anchor,
    '    const tpError = takeProfitValidationError(smartEditDraft.takeProfits, smartEditDraft.trailingTp, true);',
    '    if (tpError) { setNotice(tpError); return; }',
    '    if (smartEditDraft.stopEnabled) { const stopError = boundedPercentError("Stop Loss", Number(smartEditDraft.stopPct)); if (stopError) { setNotice(stopError); return; } }',
    '    if (smartEditDraft.trailingTp) { const trailingError = boundedPercentError("Trailing TP deviation", Number(smartEditDraft.trailingTpDeviation)); if (trailingError) { setNotice(trailingError); return; } }',
  ].join("\n");
  source = source.replace(anchor, replacement);
}

// SmartTrade Add Funds: never silently clamp an invalid amount; reject it explicitly.
{
  const old = '    const amount = Math.max(0, Math.min(freeCapital, draft.amount));\n    if (amount <= 0) { setNotice("Enter a valid Add Funds amount."); return; }';
  const replacement = [
    '    const amount = Number(draft.amount);',
    '    if (!Number.isFinite(amount) || amount <= 0) { setNotice("Enter a valid Add Funds amount."); return; }',
    '    if (amount > freeCapital + 0.000001) { setNotice(`Add Funds requires ${compactMoney(amount)}, but only ${compactMoney(freeCapital)} USDT is available.`); return; }',
    '    if (draft.orderType === "Limit" && (!Number.isFinite(draft.price) || draft.price <= 0)) { setNotice("Enter a valid Limit price greater than 0."); return; }',
  ].join("\n");
  if (!source.includes(old)) throw new Error("Global logic: SmartTrade Add Funds anchor missing.");
  source = source.replace(old, replacement);
}

// DCA bot creation rules.
{
  const anchor = '  const createConfiguredDcaBot = () => {';
  if (!source.includes(anchor)) throw new Error("Global logic: configured DCA creator missing.");
  const validation = [
    anchor,
    '    // GLOBAL_LOGIC_RULES_DCA_CREATE',
    '    if (dcaDirection === "Short") { setNotice("Short DCA requires a margin/futures account. Binance Spot paper mode currently supports Long DCA only."); return; }',
    '    if (!Number.isFinite(baseOrder) || baseOrder <= 0 || !Number.isFinite(safetyOrder) || safetyOrder <= 0) { setNotice("Base order and averaging order sizes must be greater than 0."); return; }',
    '    if (!Number.isInteger(maxActiveTrades) || maxActiveTrades < 1) { setNotice("Maximum active trades must be a whole number of at least 1."); return; }',
    '    const selectedPairCapacity = Math.max(1, effectiveDcaPairSymbols.length);',
    '    if (maxActiveTrades > selectedPairCapacity) { setNotice(`Maximum active trades cannot exceed the selected pair universe (${selectedPairCapacity}).`); return; }',
    '    if (averagingEnabled) {',
    '      if (!Number.isInteger(maxSafetyOrders) || maxSafetyOrders < 1) { setNotice("Averaging orders per trade must be a whole number of at least 1."); return; }',
    '      if (!Number.isInteger(limitSafetyOrders) || limitSafetyOrders < 1 || limitSafetyOrders > maxSafetyOrders) { setNotice("Limit averaging orders placed on exchange must be between 1 and the total averaging orders per trade."); return; }',
    '      if (!Number.isFinite(deviation) || deviation <= 0) { setNotice("First averaging-order deviation must be greater than 0%."); return; }',
    '      if (!Number.isFinite(stepScale) || stepScale <= 0 || !Number.isFinite(volumeScale) || volumeScale <= 0) { setNotice("DCA step and order-size multipliers must be greater than 0."); return; }',
    '      let cumulativeDeviation = 0; let logicalStep = deviation;',
    '      for (let index = 0; index < maxSafetyOrders; index += 1) { cumulativeDeviation += logicalStep; logicalStep *= stepScale; }',
    '      if (cumulativeDeviation >= 100) { setNotice(`The DCA ladder reaches ${cumulativeDeviation.toFixed(2)}% below entry, which would create a zero/negative buy price. Reduce the deviation, multiplier, or number of averaging orders.`); return; }',
    '    }',
    '    if (!Number.isFinite(botTakeProfit) || botTakeProfit <= 0) { setNotice("Take Profit must be greater than 0%."); return; }',
    '    if (botStopEnabled) { const stopError = boundedPercentError("Stop Loss", botStopPct); if (stopError) { setNotice(stopError); return; } }',
    '    if (dcaTrailing > 0) { const trailingError = boundedPercentError("Trailing deviation", dcaTrailing); if (trailingError) { setNotice(trailingError); return; } }',
    '    if (dcaConditions.some((condition) => !condition.kind || !condition.timeframe || !Number.isFinite(Number(condition.signal)))) { setNotice("Every enabled trade-start condition must have a valid indicator, timeframe, and signal value."); return; }',
  ].join("\n");
  source = source.replace(anchor, validation);
}

// DCA active-trade edit validation, including extra pending-order funding.
{
  const anchor = [
    '  const saveDcaTradeEdits = () => {',
    '    if (!editingDcaTradeId) return;',
  ].join("\n");
  if (!source.includes(anchor)) throw new Error("Global logic: DCA active edit handler missing.");
  const validation = [
    anchor,
    '    const editingTradeForValidation = dcaTrades.find((trade) => trade.id === editingDcaTradeId);',
    '    if (!editingTradeForValidation || editingTradeForValidation.status !== "Active") return;',
    '    const editingBotForValidation = dcaBots.find((bot) => bot.id === editingTradeForValidation.botId);',
    '    const maxAveragingForValidation = Number(dcaTradeEditDraft.maxAveraging);',
    '    const activeLimitForValidation = Number(dcaTradeEditDraft.activeOrdersLimit);',
    '    if (!Number.isInteger(maxAveragingForValidation) || maxAveragingForValidation < editingTradeForValidation.averagingFilled) { setNotice(`Averaging orders per trade cannot be lower than the ${editingTradeForValidation.averagingFilled} already filled orders.`); return; }',
    '    if (maxAveragingForValidation > 0 && (!Number.isInteger(activeLimitForValidation) || activeLimitForValidation < 1 || activeLimitForValidation > maxAveragingForValidation)) { setNotice("Active averaging-order limit must be a whole number between 1 and the total averaging orders per trade."); return; }',
    '    const editTp = Number(dcaTradeEditDraft.takeProfitPct);',
    '    if (!Number.isFinite(editTp) || editTp <= 0) { setNotice("Take Profit must be greater than 0%."); return; }',
    '    if (dcaTradeEditDraft.stopEnabled) { const stopError = boundedPercentError("Stop Loss", Number(dcaTradeEditDraft.stopPct)); if (stopError) { setNotice(stopError); return; } }',
    '    if (dcaTradeEditDraft.trailingEnabled) { const trailingError = boundedPercentError("Trailing deviation", Number(dcaTradeEditDraft.trailingDeviationPct)); if (trailingError) { setNotice(trailingError); return; } }',
    '    if (dcaTradeEditDraft.maxHoldEnabled && (!Number.isFinite(Number(dcaTradeEditDraft.maxHoldHours)) || Number(dcaTradeEditDraft.maxHoldHours) <= 0)) { setNotice("Maximum hold period must be greater than 0 hours."); return; }',
    '    if (editingBotForValidation && maxAveragingForValidation > 0) {',
    '      const remaining = Math.max(0, Math.min(maxAveragingForValidation, editingBotForValidation.maxSafetyOrders) - editingTradeForValidation.averagingFilled);',
    '      const pendingCount = Math.min(remaining, activeLimitForValidation);',
    '      let nextReserve = 0;',
    '      for (let offset = 0; offset < pendingCount; offset += 1) nextReserve += dcaAveragingOrderAmount(editingBotForValidation, editingTradeForValidation.averagingFilled + offset);',
    '      const currentReserve = dcaPendingAveragingReserveForTrade(editingTradeForValidation);',
    '      const extraReserve = Math.max(0, nextReserve - currentReserve);',
    '      if (extraReserve > freeCapital + 0.000001) { setNotice(`This edit needs ${compactMoney(extraReserve)} more reserved USDT, but only ${compactMoney(freeCapital)} is available.`); return; }',
    '    }',
  ].join("\n");
  source = source.replace(anchor, validation);
}

// DCA Add Funds should use the unified live account free-capital figure everywhere.
source = source.replaceAll('const available = Math.max(0, DEMO_BALANCE - dcaFundsLocked);', 'const available = Math.max(0, freeCapital);');
source = source.replaceAll('const addFundsAvailable = Math.max(0, DEMO_BALANCE - dcaFundsLocked);', 'const addFundsAvailable = Math.max(0, freeCapital);');

// DCA scanner funding: a new deal consumes its base order plus the averaging orders that are actually active/pending.
{
  const old = '            if (cancelled || availableCapital < bot.baseOrder) break;';
  const replacement = [
    '            const pendingOrdersForNewTrade = Math.max(0, Math.min(bot.maxSafetyOrders, bot.limitSafetyOrders ?? bot.maxSafetyOrders));',
    '            let requiredCapitalForNewTrade = bot.baseOrder;',
    '            for (let reserveIndex = 0; reserveIndex < pendingOrdersForNewTrade; reserveIndex += 1) requiredCapitalForNewTrade += dcaAveragingOrderAmount(bot, reserveIndex);',
    '            if (cancelled || availableCapital + 0.000001 < requiredCapitalForNewTrade) break;',
  ].join("\n");
  if (!source.includes(old)) throw new Error("Global logic: DCA scanner capital anchor missing.");
  source = source.replace(old, replacement);
  const debit = '            availableCapital -= bot.baseOrder;';
  if (!source.includes(debit)) throw new Error("Global logic: DCA scanner debit anchor missing.");
  source = source.replace(debit, '            availableCapital -= requiredCapitalForNewTrade;');
}

// Ensure the key rules actually reached the final transformed source.
const requiredMarkers = [
  'takeProfitValidationError(smartTps, trailingTp, false)',
  'totalAllocatedTpShare',
  'GLOBAL_LOGIC_RULES_DCA_CREATE',
  'editingTradeForValidation',
  'requiredCapitalForNewTrade',
];
for (const marker of requiredMarkers) if (!source.includes(marker)) throw new Error(`Global logic rule missing after transform: ${marker}`);

fs.writeFileSync(traderPath, source);
console.log("Applied platform-wide SmartTrade/DCA validation, partial-TP allocation, funding, and risk logic rules.");
