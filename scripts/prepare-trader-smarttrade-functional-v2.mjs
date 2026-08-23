import fs from "node:fs";
import path from "node:path";

const traderPath = path.join(process.cwd(), "app/trader/TradingAgent.tsx");
const cssPath = path.join(process.cwd(), "app/trader/trader.module.css");
let source = fs.readFileSync(traderPath, "utf8");
let css = fs.readFileSync(cssPath, "utf8");

// SMARTTRADE FUNCTIONAL V2
// Keep the first SmartTrade version intentionally small: every visible control must have real paper-engine behavior.

// Persist real SmartTrade execution options on each trade.
if (!source.includes('  stopTimeout?: boolean;')) {
  const anchor = '  stopPct: number;\n  trailingTp?: boolean;';
  if (!source.includes(anchor)) throw new Error('SmartTrade V2: SmartTrade type stop anchor missing.');
  source = source.replace(anchor, [
    '  stopPct: number;',
    '  tpOrderType?: "Limit" | "Market";',
    '  stopOrderType?: "Cond. Limit" | "Cond. Market";',
    '  stopTimeout?: boolean;',
    '  stopTimeoutSec?: number;',
    '  stopTriggeredAt?: string | null;',
    '  trailingStop?: boolean;',
    '  trailingStopPeak?: number;',
    '  breakeven?: boolean;',
    '  breakevenActivated?: boolean;',
    '  trailingTp?: boolean;',
  ].join('\n'));
}

const oldDraftType = 'type SmartEditDraft = { takeProfits: TakeProfit[]; stopEnabled: boolean; stopPct: number; trailingTp: boolean; trailingTpDeviation: number };';
if (source.includes(oldDraftType)) {
  source = source.replace(oldDraftType, 'type SmartEditDraft = { takeProfits: TakeProfit[]; tpOrderType: "Limit" | "Market"; stopEnabled: boolean; stopPct: number; stopOrderType: "Cond. Limit" | "Cond. Market"; stopTimeout: boolean; stopTimeoutSec: number; trailingStop: boolean; breakeven: boolean; trailingTp: boolean; trailingTpDeviation: number };');
}
if (!source.includes('type SmartEditDraft = { takeProfits: TakeProfit[]; tpOrderType:')) throw new Error('SmartTrade V2: SmartEditDraft type was not upgraded.');

// Equal distribution keeps Split/Add target actions valid by default.
if (!source.includes('function equalizeTakeProfitShares(')) {
  const anchor = 'function takeProfitAllocationTotal(targets: TakeProfit[]) {';
  if (!source.includes(anchor)) throw new Error('SmartTrade V2: TP allocation helper anchor missing.');
  source = source.replace(anchor, [
    'function equalizeTakeProfitShares(targets: TakeProfit[]) {',
    '  if (!targets.length) return targets;',
    '  const even = Math.floor((100 / targets.length) * 100) / 100;',
    '  return targets.map((target, index) => ({ ...target, share: index === targets.length - 1 ? Number((100 - even * (targets.length - 1)).toFixed(2)) : even }));',
    '}',
    anchor,
  ].join('\n'));
}

// Internal trailing-TP retracement stays deterministic while the user-facing deviation control is removed.
source = source.replace('  const [trailingTpDeviation, setTrailingTpDeviation] = useState(5);', '  const [trailingTpDeviation, setTrailingTpDeviation] = useState(0.2);');
if (!source.includes('const [tpInputMode,')) {
  const anchor = '  const [trailingTpDeviation, setTrailingTpDeviation] = useState(0.2);';
  if (!source.includes(anchor)) throw new Error('SmartTrade V2: trailing TP state anchor missing.');
  source = source.replace(anchor, [
    anchor,
    '  const [tpInputMode, setTpInputMode] = useState<"Price" | "Percent">("Price");',
    '  const [stopInputMode, setStopInputMode] = useState<"Price" | "Percent">("Price");',
  ].join('\n'));
}

// Buying percentage shortcuts use actual available paper USDT, not the original demo balance constant.
{
  const start = source.indexOf('  const setPercentOfBalance = (value: number) => {');
  const end = start >= 0 ? source.indexOf('  const createSmartTrade =', start) : -1;
  if (start < 0 || end < 0) throw new Error('SmartTrade V2: percent-of-balance handler missing.');
  const replacement = [
    '  const setPercentOfBalance = (value: number) => {',
    '    const price = effectiveEntry || selectedPrice || 0;',
    '    const usable = Math.max(0, freeCapital);',
    '    if (price > 0 && value > 0) setSmartUnits(Number(((usable * Math.min(100, value) / 100) / price).toFixed(8)));',
    '  };',
    '',
  ].join('\n');
  source = source.slice(0, start) + replacement + source.slice(end);
}
source = source.replace('<button key={v} onClick={() => setPercentOfBalance(v)}>{v}%</button>', '<button type="button" key={v} onClick={() => setPercentOfBalance(v)}>{v}%</button>');

// Remove options that are intentionally out of V1 scope.
source = source.replace(/\n\s*<div className=\{styles\.assetToggle\}><span>Use Existing Assets[\s\S]*?<\/div>/, '');
source = source.replace('<button>Cond.</button>', '');
source = source.replace(/^\s*<div className=\{styles\.inlineToggle\}><span>Trailing \{smartMode === "Smart Cover" \? "sell" : "buy"\}[\s\S]*?<\/div>\s*$/m, '');
source = source.replace(/^\s*\{trailingBuy && <div className=\{styles\.smallStepper\}>[\s\S]*?<\/div>\}\s*$/m, '');

// Derived target helpers for reversible Price <-> Percent editing.
if (!source.includes('const smartTpPriceFor =')) {
  const anchor = '  const stopPrice = effectiveEntry ? effectiveEntry * (1 - smartStopPct / 100) : 0;';
  if (!source.includes(anchor)) throw new Error('SmartTrade V2: TP/SL derived price anchor missing.');
  source = source.replace(anchor, [
    anchor,
    '  const smartTpPriceFor = (target: number) => effectiveEntry > 0 ? effectiveEntry * (1 + target / 100) : 0;',
    '  const setSmartTpTargetFromPrice = (index: number, price: number) => { if (effectiveEntry > 0 && price > 0) setSmartTps((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, target: Math.max(0, (price / effectiveEntry - 1) * 100) } : item)); };',
    '  const splitSmartTpTargets = () => setSmartTps((items) => items.length > 1 ? items : equalizeTakeProfitShares([{ ...(items[0] ?? { target: 10, share: 100 }) }, { target: (items[0]?.target ?? 10) + 5, share: 0 }]));',
    '  const addSmartTpTarget = () => setSmartTps((items) => { if (items.length >= 10) return items; const nextTarget = (items[items.length - 1]?.target ?? 5) + 5; return equalizeTakeProfitShares([...items, { target: nextTarget, share: 0 }]); });',
  ].join('\n'));
}

// Replace the SmartTrade TP builder with a real 1-10 target editor and reversible price/percent input.
{
  const re = /      <div className=\{styles\.takeProfitBody\}>[\s\S]*?      <\/div>\n    <\/section>\n\n    <section className=\{styles\.smartPanel\}>\n      <div className=\{styles\.smartPanelHead\}><h2>Stop Loss<\/h2><Toggle checked=\{smartStopEnabled\} onChange=\{setSmartStopEnabled\}\/><\/div>/;
  if (!re.test(source)) throw new Error('SmartTrade V2: Take Profit builder block missing.');
  const replacement = `      <div className={styles.takeProfitBody}>
        <div className={styles.orderChoice}><button type="button" className={tpOrderType === "Limit" ? styles.choiceActive : ""} onClick={() => setTpOrderType("Limit")}>Limit Order</button><button type="button" className={tpOrderType === "Market" ? styles.choiceActive : ""} onClick={() => setTpOrderType("Market")}>Market Order</button></div>
        <p className={styles.helperText}>{tpOrderType === "Limit" ? "The target is filled at its configured TP price when reached" : "The target closes at the live market price when reached"}</p>
        {smartTps.length === 1 && <label className={styles.field}><span>{tpInputMode === "Price" ? "Price" : "Percent"}</span><div className={styles.inputUnit}>{tpInputMode === "Price" ? <NumericInput min={0} value={smartTpPriceFor(smartTps[0]?.target ?? 0)} onValueChange={(price) => setSmartTpTargetFromPrice(0, price)} ariaLabel="Take profit price"/> : <NumericInput min={0} value={smartTps[0]?.target ?? 0} onValueChange={(value) => setSmartTps((items) => items.map((item, index) => index === 0 ? { ...item, target: value } : item))} ariaLabel="Take profit percent"/>}<b>{tpInputMode === "Price" ? "USDT" : "%"}<button type="button" className={styles.smartValueModeToggle} onClick={() => setTpInputMode((mode) => mode === "Price" ? "Percent" : "Price")}>{tpInputMode === "Price" ? \`+\${(smartTps[0]?.target ?? 0).toFixed(2)}%\` : money(smartTpPriceFor(smartTps[0]?.target ?? 0))}</button></b></div></label>}
        {smartTps.length === 1 ? <button type="button" className={styles.splitTargetButton} onClick={splitSmartTpTargets}>Split Targets</button> : <div className={styles.smartTpBuilderRows}>{smartTps.map((tp, index) => <div className={styles.smartTpBuilderRow} key={index}><span>TP {index + 1}</span><div className={styles.inputUnit}>{tpInputMode === "Price" ? <NumericInput min={0} value={smartTpPriceFor(tp.target)} onValueChange={(price) => setSmartTpTargetFromPrice(index, price)} ariaLabel={\`TP \${index + 1} price\`}/> : <NumericInput min={0} value={tp.target} onValueChange={(value) => setSmartTps((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, target: value } : item))} ariaLabel={\`TP \${index + 1} percent\`}/>}<b>{tpInputMode === "Price" ? "USDT" : "%"}<button type="button" className={styles.smartValueModeToggle} onClick={() => setTpInputMode((mode) => mode === "Price" ? "Percent" : "Price")}>{tpInputMode === "Price" ? \`+\${tp.target.toFixed(2)}%\` : money(smartTpPriceFor(tp.target))}</button></b></div><div className={styles.inputUnit}><NumericInput min={0} max={100} value={tp.share} onValueChange={(value) => setSmartTps((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, share: value } : item))} ariaLabel={\`TP \${index + 1} position percent\`}/><b>% position</b></div><button type="button" className={styles.smartTpRemoveButton} onClick={() => setSmartTps((items) => items.filter((_, itemIndex) => itemIndex !== index))}>×</button></div>)}</div>}
        {smartTps.length > 1 && <button type="button" className={styles.splitTargetButton} onClick={addSmartTpTarget} disabled={smartTps.length >= 10}>＋ Add target ({smartTps.length}/10)</button>}
        <div className={takeProfitAllocationTotal(smartTps) > 100.000001 ? styles.smartTpAllocationStatus + " " + styles.smartTpAllocationInvalid : styles.smartTpAllocationStatus}><span>Allocated position</span><strong>{takeProfitAllocationTotal(smartTps).toFixed(2).replace(".00", "")}% / 100%</strong></div>
        {takeProfitAllocationTotal(smartTps) > 100.000001 && <div className={styles.smartTpValidationError}>Total TP position allocation cannot exceed 100%.</div>}
        <div className={styles.inlineToggle}><span>Trailing Take Profit <b className={styles.helpDot}>?</b></span><Toggle checked={trailingTp} onChange={(value) => { setTrailingTp(value); if (value) setSmartTps((items) => [{ ...(items[0] ?? { target: 10, share: 100 }), share: 100 }]); }}/></div>
        {trailingTp && <p className={styles.helperText}>After the TP activation price is reached, the paper engine follows the best price and closes on a 0.20% retracement.</p>}
      </div>
    </section>

    <section className={styles.smartPanel}>
      <div className={styles.smartPanelHead}><h2>Stop Loss</h2><Toggle checked={smartStopEnabled} onChange={setSmartStopEnabled}/></div>`;
  source = source.replace(re, replacement);
}

// Replace Stop Loss body: all remaining controls are wired to the execution engine.
{
  const re = /      <div className=\{styles\.stopLossBody\}>[\s\S]*?      <\/div>\n    <\/section>\n  <\/div>;\n\n  const smartCreate =/;
  if (!re.test(source)) throw new Error('SmartTrade V2: Stop Loss builder block missing.');
  const replacement = `      <div className={styles.stopLossBody}>
        <div className={styles.orderChoice}><button type="button" className={stopOrderType === "Cond. Limit" ? styles.choiceActive : ""} onClick={() => setStopOrderType("Cond. Limit")}>Cond. Limit Order</button><button type="button" className={stopOrderType === "Cond. Market" ? styles.choiceActive : ""} onClick={() => setStopOrderType("Cond. Market")}>Cond. Market Order</button></div>
        <p className={styles.helperText}>{stopOrderType === "Cond. Limit" ? "When triggered, the paper exit is filled at the configured stop level" : "When triggered, the paper exit is filled at the observed live market price"}</p>
        <label className={styles.field}><span>{stopInputMode === "Price" ? "Price" : "Percent"}</span><div className={styles.inputUnit}>{stopInputMode === "Price" ? <NumericInput min={0} value={stopPrice || 0} onValueChange={(price) => { if (effectiveEntry > 0 && price > 0) setSmartStopPct(Math.max(0, (1 - price / effectiveEntry) * 100)); }} ariaLabel="Stop loss price"/> : <NumericInput min={0} max={99.99} value={smartStopPct} onValueChange={setSmartStopPct} ariaLabel="Stop loss percent"/>}<b>{stopInputMode === "Price" ? "USDT" : "%"}<button type="button" className={styles.smartValueModeToggle} onClick={() => setStopInputMode((mode) => mode === "Price" ? "Percent" : "Price")}>{stopInputMode === "Price" ? \`-\${smartStopPct.toFixed(2)}%\` : money(stopPrice)}</button></b></div></label>
        <div className={styles.inlineToggle}><span>Stop Loss timeout <b className={styles.helpDot}>?</b></span><Toggle checked={stopTimeout} onChange={setStopTimeout}/></div>
        {stopTimeout && <div className={styles.smallStepper}><NumericInput min={1} value={stopTimeoutSec} onValueChange={setStopTimeoutSec} ariaLabel="Stop loss timeout seconds"/><span>Sec</span><button type="button" onClick={() => setStopTimeoutSec(Math.max(1, stopTimeoutSec - 30))}>−</button><button type="button" onClick={() => setStopTimeoutSec(stopTimeoutSec + 30)}>＋</button></div>}
        <div className={styles.inlineToggle}><span>Trailing Stop Loss <b className={styles.helpDot}>?</b></span><Toggle checked={trailingStop} onChange={setTrailingStop}/></div>
        <div className={styles.inlineToggle}><span>Move to Breakeven <b className={styles.helpDot}>?</b></span><Toggle checked={breakeven} onChange={setBreakeven}/></div>
        {breakeven && <p className={styles.helperText}>After the first TP executes, the Stop Loss is raised to the weighted average entry price.</p>}
      </div>
    </section>
  </div>;

  const smartCreate =`;
  source = source.replace(re, replacement);
}

// Store the real execution settings when a SmartTrade is created.
{
  const old = '      stopEnabled: smartStopEnabled, stopPct: smartStopPct, trailingTp, trailingTpDeviation,';
  const replacement = '      stopEnabled: smartStopEnabled, stopPct: smartStopPct, tpOrderType, stopOrderType, stopTimeout, stopTimeoutSec, trailingStop, breakeven, trailingTp, trailingTpDeviation,';
  if (!source.includes(old) && !source.includes('stopTimeout, stopTimeoutSec, trailingStop, breakeven')) throw new Error('SmartTrade V2: create trade settings anchor missing.');
  source = source.replace(old, replacement);
}

// Creation-time validation for timeout/breakeven and explicit TP allocation UI state.
if (!source.includes('SMARTTRADE_V2_CREATE_VALIDATION')) {
  const anchor = '    if (smartStopEnabled) { const stopError = boundedPercentError("Stop Loss", smartStopPct); if (stopError) { setNotice(stopError); return; } }';
  if (!source.includes(anchor)) throw new Error('SmartTrade V2: create stop validation anchor missing.');
  source = source.replace(anchor, [
    anchor,
    '    // SMARTTRADE_V2_CREATE_VALIDATION',
    '    if (stopTimeout && (!Number.isFinite(stopTimeoutSec) || stopTimeoutSec < 1)) { setNotice("Stop Loss timeout must be at least 1 second."); return; }',
    '    if (breakeven && !smartStopEnabled) { setNotice("Move to Breakeven requires Stop Loss to be enabled."); return; }',
  ].join('\n'));
}

// Active SmartTrade edit state must expose the same real controls.
{
  const old = '    setSmartEditDraft({ takeProfits: trade.takeProfits.map((target) => ({ ...target })), stopEnabled: trade.stopEnabled, stopPct: trade.stopPct, trailingTp: Boolean(trade.trailingTp), trailingTpDeviation: trade.trailingTpDeviation ?? 0.2 });';
  const replacement = '    setSmartEditDraft({ takeProfits: trade.takeProfits.map((target) => ({ ...target })), tpOrderType: trade.tpOrderType ?? "Limit", stopEnabled: trade.stopEnabled, stopPct: trade.stopPct, stopOrderType: trade.stopOrderType ?? "Cond. Market", stopTimeout: Boolean(trade.stopTimeout), stopTimeoutSec: trade.stopTimeoutSec ?? 300, trailingStop: Boolean(trade.trailingStop), breakeven: Boolean(trade.breakeven), trailingTp: Boolean(trade.trailingTp), trailingTpDeviation: trade.trailingTpDeviation ?? 0.2 });';
  if (!source.includes(old) && !source.includes('tpOrderType: trade.tpOrderType')) throw new Error('SmartTrade V2: open edit draft anchor missing.');
  source = source.replace(old, replacement);

  const oldSave = '    setSmartTrades((items) => items.map((trade) => trade.id === editingSmartTradeId ? { ...trade, takeProfits: smartEditDraft.takeProfits, tpHits: smartEditDraft.takeProfits.map((_, index) => trade.tpHits?.[index] ?? false), stopEnabled: smartEditDraft.stopEnabled, stopPct: smartEditDraft.stopPct, trailingTp: smartEditDraft.trailingTp, trailingTpDeviation: smartEditDraft.trailingTpDeviation } : trade));';
  const newSave = '    setSmartTrades((items) => items.map((trade) => trade.id === editingSmartTradeId ? { ...trade, takeProfits: smartEditDraft.takeProfits, tpHits: smartEditDraft.takeProfits.map((_, index) => trade.tpHits?.[index] ?? false), tpOrderType: smartEditDraft.tpOrderType, stopEnabled: smartEditDraft.stopEnabled, stopPct: smartEditDraft.stopPct, stopOrderType: smartEditDraft.stopOrderType, stopTimeout: smartEditDraft.stopTimeout, stopTimeoutSec: smartEditDraft.stopTimeoutSec, stopTriggeredAt: null, trailingStop: smartEditDraft.trailingStop, trailingStopPeak: trade.lastPrice ?? trade.averagePrice ?? trade.entryPrice, breakeven: smartEditDraft.breakeven, breakevenActivated: smartEditDraft.breakeven ? trade.breakevenActivated : false, trailingTp: smartEditDraft.trailingTp, trailingTpDeviation: smartEditDraft.trailingTpDeviation } : trade));';
  if (!source.includes(oldSave) && !source.includes('stopTimeout: smartEditDraft.stopTimeout')) throw new Error('SmartTrade V2: save edit settings anchor missing.');
  source = source.replace(oldSave, newSave);
}

if (!source.includes('SMARTTRADE_V2_EDIT_VALIDATION')) {
  const anchor = '    if (smartEditDraft.stopEnabled) { const stopError = boundedPercentError("Stop Loss", Number(smartEditDraft.stopPct)); if (stopError) { setNotice(stopError); return; } }';
  if (!source.includes(anchor)) throw new Error('SmartTrade V2: edit validation anchor missing.');
  source = source.replace(anchor, [
    anchor,
    '    // SMARTTRADE_V2_EDIT_VALIDATION',
    '    if (smartEditDraft.stopTimeout && (!Number.isFinite(Number(smartEditDraft.stopTimeoutSec)) || Number(smartEditDraft.stopTimeoutSec) < 1)) { setNotice("Stop Loss timeout must be at least 1 second."); return; }',
    '    if (smartEditDraft.breakeven && !smartEditDraft.stopEnabled) { setNotice("Move to Breakeven requires Stop Loss to be enabled."); return; }',
  ].join('\n'));
}

// Replace the stop-price helper so the row/chart display follows trailing SL and breakeven too.
{
  const start = source.indexOf('function smartTradeStopPrice(trade: SmartTrade) {');
  const end = start >= 0 ? source.indexOf('function smartTradeReached(', start) : -1;
  if (start < 0 || end < 0) throw new Error('SmartTrade V2: stop-price helper block missing.');
  const helper = [
    'function smartTradeStopPrice(trade: SmartTrade) {',
    '  if (!trade.stopEnabled) return null;',
    '  const average = smartTradeAveragePrice(trade);',
    '  const direction = smartTradeDirection(trade);',
    '  let level = average * (1 - direction * trade.stopPct / 100);',
    '  if (trade.trailingStop && Number.isFinite(trade.trailingStopPeak) && (trade.trailingStopPeak ?? 0) > 0) {',
    '    const trailingLevel = (trade.trailingStopPeak ?? average) * (1 - direction * trade.stopPct / 100);',
    '    level = trade.side === "Buy" ? Math.max(level, trailingLevel) : Math.min(level, trailingLevel);',
    '  }',
    '  if (trade.breakeven && trade.breakevenActivated) level = trade.side === "Buy" ? Math.max(level, average) : Math.min(level, average);',
    '  return level;',
    '}',
    '',
  ].join('\n');
  source = source.slice(0, start) + helper + source.slice(end);
}

// One deterministic SmartTrade manager: SL timeout, trailing SL, breakeven, TP limit/market fills and trailing TP.
{
  const start = source.indexOf('function markSmartTradeAtPrice(trade: SmartTrade, currentPrice: number): SmartTrade {');
  if (start < 0) throw new Error('SmartTrade V2: SmartTrade manager missing.');
  const candidates = [
    source.indexOf('function takeProfitAllocationTotal(', start),
    source.indexOf('function takeProfitValidationError(', start),
    source.indexOf('function boundedPercentError(', start),
    source.indexOf('function navGlyph(', start),
  ].filter((value) => value > start);
  const end = candidates.length ? Math.min(...candidates) : -1;
  if (end < 0) throw new Error('SmartTrade V2: SmartTrade manager end anchor missing.');
  const manager = `function markSmartTradeAtPrice(trade: SmartTrade, currentPrice: number): SmartTrade {
  if (trade.status !== "Active" || !Number.isFinite(currentPrice) || currentPrice <= 0) return trade;
  const average = smartTradeAveragePrice(trade);
  let quantity = smartTradeQuantity(trade);
  let amount = Number.isFinite(trade.amount) ? Math.max(0, trade.amount) : average * quantity;
  let realizedPnl = trade.realizedPnl ?? 0;
  let tpHits = trade.tpHits?.length === trade.takeProfits.length ? [...trade.tpHits] : trade.takeProfits.map(() => false);
  const direction = smartTradeDirection(trade);
  let trailingStopPeak = trade.trailingStopPeak ?? average;
  if (trade.trailingStop) trailingStopPeak = trade.side === "Buy" ? Math.max(trailingStopPeak, currentPrice, average) : Math.min(trailingStopPeak, currentPrice, average);
  let breakevenActivated = Boolean(trade.breakevenActivated);
  const base: SmartTrade = { ...trade, averagePrice: average, quantity, amount, totalInvested: trade.totalInvested ?? trade.amount, lastPrice: currentPrice, tpHits, realizedPnl, trailingStopPeak, breakevenActivated };

  const stopLevel = smartTradeStopPrice(base);
  const stopBreached = stopLevel != null && smartTradeStopReached(base, currentPrice, stopLevel);
  if (stopBreached) {
    if (base.stopTimeout) {
      const now = Date.now();
      const started = base.stopTriggeredAt ? new Date(base.stopTriggeredAt).getTime() : now;
      const timeoutMs = Math.max(1, base.stopTimeoutSec ?? 300) * 1000;
      if (!base.stopTriggeredAt) return { ...base, stopTriggeredAt: new Date(now).toISOString() };
      if (now - started < timeoutMs) return base;
    }
    const stopFillPrice = base.stopOrderType === "Cond. Limit" && stopLevel != null ? stopLevel : currentPrice;
    const exitPnl = (stopFillPrice - average) * quantity * direction;
    return { ...base, status: "Closed", quantity: 0, amount: 0, realizedPnl: realizedPnl + exitPnl, closedAt: new Date().toISOString(), exitPrice: stopFillPrice, closeReason: base.trailingStop ? "Trailing Stop Loss" : (base.breakevenActivated ? "Breakeven Stop" : "Stop Loss") };
  }
  const clearedBase: SmartTrade = base.stopTriggeredAt ? { ...base, stopTriggeredAt: null } : base;

  const executionTpError = takeProfitValidationError(clearedBase.takeProfits, Boolean(clearedBase.trailingTp), true);
  if (executionTpError) return clearedBase;
  const tpPrices = smartTradeTpPrices(clearedBase);
  if (clearedBase.trailingTp && tpPrices.length) {
    const activation = tpPrices[0];
    const reached = activation != null && smartTradeReached(clearedBase, currentPrice, activation);
    let trailingActivated = Boolean(clearedBase.trailingActivated) || reached;
    let trailingPeak = clearedBase.trailingPeak ?? currentPrice;
    if (trailingActivated) {
      breakevenActivated = Boolean(clearedBase.breakeven) || breakevenActivated;
      trailingPeak = clearedBase.side === "Buy" ? Math.max(trailingPeak, currentPrice) : Math.min(trailingPeak, currentPrice);
      const deviation = Math.max(0.01, clearedBase.trailingTpDeviation ?? 0.2) / 100;
      const trailingExit = clearedBase.side === "Buy" ? currentPrice <= trailingPeak * (1 - deviation) : currentPrice >= trailingPeak * (1 + deviation);
      if (trailingExit) {
        const exitPnl = (currentPrice - average) * quantity * direction;
        return { ...clearedBase, trailingActivated, trailingPeak, breakevenActivated, status: "Closed", quantity: 0, amount: 0, realizedPnl: realizedPnl + exitPnl, closedAt: new Date().toISOString(), exitPrice: currentPrice, closeReason: "Trailing Take Profit" };
      }
    }
    return { ...clearedBase, trailingActivated, trailingPeak, breakevenActivated };
  }

  let firstTpHitThisTick = false;
  for (let index = 0; index < tpPrices.length; index += 1) {
    if (tpHits[index] || !smartTradeReached(clearedBase, currentPrice, tpPrices[index])) continue;
    const targetWeight = Math.max(0, clearedBase.takeProfits[index]?.share ?? 0);
    const accumulatedQty = (clearedBase.fills ?? []).reduce((sum, fill) => sum + ((fill.kind === "Base" || fill.kind === "Averaging" || fill.kind === "Add Funds") ? Math.max(0, fill.quantity) : 0), 0) || smartTradeQuantity(clearedBase);
    const closeQty = Math.min(quantity, accumulatedQty * Math.min(100, targetWeight) / 100);
    const tpFillPrice = clearedBase.tpOrderType === "Market" ? currentPrice : tpPrices[index];
    realizedPnl += (tpFillPrice - average) * closeQty * direction;
    quantity = Math.max(0, quantity - closeQty);
    amount = Math.max(0, amount - average * closeQty);
    tpHits[index] = true;
    firstTpHitThisTick = true;
  }
  if (clearedBase.breakeven && (breakevenActivated || firstTpHitThisTick || tpHits.some(Boolean))) breakevenActivated = true;
  const totalAllocatedTpShare = clearedBase.takeProfits.reduce((sum, target) => sum + Math.max(0, target.share), 0);
  const allAllocatedTargetsDone = tpHits.length > 0 && tpHits.every(Boolean) && totalAllocatedTpShare >= 99.999999;
  if (allAllocatedTargetsDone || quantity <= 1e-12) {
    return { ...clearedBase, tpHits, quantity: 0, amount: 0, realizedPnl, breakevenActivated, status: "Closed", closedAt: new Date().toISOString(), exitPrice: currentPrice, closeReason: "Take Profit" };
  }
  return { ...clearedBase, tpHits, quantity, amount, realizedPnl, breakevenActivated };
}

`;
  source = source.slice(0, start) + manager + source.slice(end);
}

// Active-trade Edit modal: same settings, max 10 targets, no user-facing trailing deviation.
source = source.replace(
  '<section><div className={styles.smartTradeModalSectionHead}><strong>Take profit</strong><button type="button" onClick={() => setSmartEditDraft((draft) => draft ? { ...draft, takeProfits: [...draft.takeProfits, { target: 10, share: 0 }] } : draft)}>＋ Add target</button></div>',
  '<section><div className={styles.smartTradeModalSectionHead}><strong>Take profit</strong><button type="button" disabled={smartEditDraft.takeProfits.length >= 10} onClick={() => setSmartEditDraft((draft) => draft && draft.takeProfits.length < 10 ? { ...draft, takeProfits: equalizeTakeProfitShares([...draft.takeProfits, { target: (draft.takeProfits[draft.takeProfits.length - 1]?.target ?? 5) + 5, share: 0 }]) } : draft)}>＋ Add target ({smartEditDraft.takeProfits.length}/10)</button></div><div className={styles.orderChoice}><button type="button" className={smartEditDraft.tpOrderType === "Limit" ? styles.choiceActive : ""} onClick={() => setSmartEditDraft((draft) => draft ? { ...draft, tpOrderType: "Limit" } : draft)}>Limit Order</button><button type="button" className={smartEditDraft.tpOrderType === "Market" ? styles.choiceActive : ""} onClick={() => setSmartEditDraft((draft) => draft ? { ...draft, tpOrderType: "Market" } : draft)}>Market Order</button></div>'
);
source = source.replace(/^\s*\{smartEditDraft\.trailingTp && <label><span>Trailing deviation, %<\/span>[\s\S]*?<\/label>\}\s*$/m, '');

{
  const old = '<section><div className={styles.smartTradeToggleRow}><strong>Stop Loss</strong><Toggle checked={smartEditDraft.stopEnabled} onChange={(value) => setSmartEditDraft((draft) => draft ? { ...draft, stopEnabled: value } : draft)}/></div>{smartEditDraft.stopEnabled && <label><span>Stop loss, %</span><NumericInput min={0} value={smartEditDraft.stopPct} onValueChange={(value) => setSmartEditDraft((draft) => draft ? { ...draft, stopPct: value } : draft)}/></label>}</section>';
  const replacement = '<section><div className={styles.smartTradeToggleRow}><strong>Stop Loss</strong><Toggle checked={smartEditDraft.stopEnabled} onChange={(value) => setSmartEditDraft((draft) => draft ? { ...draft, stopEnabled: value } : draft)}/></div>{smartEditDraft.stopEnabled && <><div className={styles.orderChoice}><button type="button" className={smartEditDraft.stopOrderType === "Cond. Limit" ? styles.choiceActive : ""} onClick={() => setSmartEditDraft((draft) => draft ? { ...draft, stopOrderType: "Cond. Limit" } : draft)}>Cond. Limit Order</button><button type="button" className={smartEditDraft.stopOrderType === "Cond. Market" ? styles.choiceActive : ""} onClick={() => setSmartEditDraft((draft) => draft ? { ...draft, stopOrderType: "Cond. Market" } : draft)}>Cond. Market Order</button></div><label><span>Stop loss, %</span><NumericInput min={0.01} max={99.99} value={smartEditDraft.stopPct} onValueChange={(value) => setSmartEditDraft((draft) => draft ? { ...draft, stopPct: value } : draft)}/></label><div className={styles.smartTradeToggleRow}><span>Stop Loss timeout</span><Toggle checked={smartEditDraft.stopTimeout} onChange={(value) => setSmartEditDraft((draft) => draft ? { ...draft, stopTimeout: value } : draft)}/></div>{smartEditDraft.stopTimeout && <label><span>Timeout, seconds</span><NumericInput min={1} value={smartEditDraft.stopTimeoutSec} onValueChange={(value) => setSmartEditDraft((draft) => draft ? { ...draft, stopTimeoutSec: value } : draft)}/></label>}<div className={styles.smartTradeToggleRow}><span>Trailing Stop Loss</span><Toggle checked={smartEditDraft.trailingStop} onChange={(value) => setSmartEditDraft((draft) => draft ? { ...draft, trailingStop: value } : draft)}/></div><div className={styles.smartTradeToggleRow}><span>Move to Breakeven</span><Toggle checked={smartEditDraft.breakeven} onChange={(value) => setSmartEditDraft((draft) => draft ? { ...draft, breakeven: value } : draft)}/></div></>}</section>';
  if (!source.includes(old) && !source.includes('smartEditDraft.stopTimeout')) throw new Error('SmartTrade V2: active edit Stop Loss section anchor missing.');
  source = source.replace(old, replacement);
}

// Remove trailing-deviation requirement from active edit UI while keeping the internal fixed value valid.
source = source.replace('onChange={(value) => setSmartEditDraft((draft) => draft ? { ...draft, trailingTp: value } : draft)}', 'onChange={(value) => setSmartEditDraft((draft) => draft ? { ...draft, trailingTp: value, trailingTpDeviation: 0.2, takeProfits: value ? [{ ...(draft.takeProfits[0] ?? { target: 10, share: 100 }), share: 100 }] : draft.takeProfits } : draft)}');

// CSS for the reversible percentage/price controls and compact 10-target editor.
if (!css.includes('/* SmartTrade functional V2 */')) {
  css += `\n/* SmartTrade functional V2 */\n.smartValueModeToggle{border:0!important;background:transparent!important;color:#4ea9ff!important;padding:0 0 0 8px!important;font:inherit!important;cursor:pointer!important;white-space:nowrap}.smartValueModeToggle:hover{text-decoration:underline}.smartTpBuilderRows{display:grid;gap:8px;margin:10px 0}.smartTpBuilderRow{display:grid;grid-template-columns:56px minmax(0,1.5fr) minmax(0,1fr) 30px;gap:8px;align-items:center}.smartTpBuilderRow>span{font-size:11px;font-weight:800;color:#91a9b8}.smartTpRemoveButton{height:34px;border:1px solid #693c49;background:#34212a;color:#ff8fa2;border-radius:4px;cursor:pointer}.splitTargetButton:disabled,.smartTradeModalSectionHead button:disabled{opacity:.45;cursor:not-allowed}@media(max-width:900px){.smartTpBuilderRow{grid-template-columns:48px 1fr}.smartTpBuilderRow .inputUnit{grid-column:auto}.smartTpRemoveButton{grid-column:2;justify-self:end;width:30px}}\n`;
}

// Final guards: if any of these fail, do not ship a partially cosmetic version.
const required = [
  'Stop Loss timeout must be at least 1 second.',
  'stopTimeout, stopTimeoutSec, trailingStop, breakeven',
  'smartTps.length >= 10',
  'smartValueModeToggle',
  'const usable = Math.max(0, freeCapital);',
  'Trailing Stop Loss',
  'Move to Breakeven',
  'closeReason: "Trailing Take Profit"',
];
for (const marker of required) if (!source.includes(marker) && !css.includes(marker)) throw new Error(`SmartTrade V2: required marker missing: ${marker}`);
if (source.includes('Use Existing Assets <b className={styles.helpDot}>?</b>')) throw new Error('SmartTrade V2: Use Existing Assets is still visible.');
if (source.includes('<button>Cond.</button>')) throw new Error('SmartTrade V2: conditional buy button is still visible.');
if (source.includes('Follow max price with deviation (%)')) throw new Error('SmartTrade V2: trailing TP deviation control is still visible.');

fs.writeFileSync(traderPath, source);
fs.writeFileSync(cssPath, css);
console.log('Prepared functional SmartTrade V2: 10 TPs, live percent sizing, trailing/timeout/breakeven execution and simplified controls.');
