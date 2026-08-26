import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const actionsPath = path.join(root, "app/trader/TradeActionsV2.tsx");
const actionsCssPath = path.join(root, "app/trader/trade-actions-v2.module.css");
const barPath = path.join(root, "app/trader/TradeLevelBar.tsx");
const barCssPath = path.join(root, "app/trader/trade-level-bar.module.css");
const chartPath = path.join(root, "app/trader/DcaTradeChartV2Workstation.tsx");

function mustReplace(source, before, after, label) {
  if (!source.includes(before)) throw new Error("Filled TP/DCA cleanup v2: missing " + label);
  return source.replace(before, after);
}

let actions = fs.readFileSync(actionsPath, "utf8");
actions = mustReplace(actions,
  'type ExactTrade = {\n  takeProfitPct?: number;\n  takeProfitTargets?: TpTarget[];',
  'type ExactTrade = {\n  takeProfitPct?: number;\n  takeProfitTargets?: TpTarget[];\n  takeProfitFilled?: number[];',
  "ExactTrade filled targets");
actions = mustReplace(actions,
  '  if (message.includes("too_many_take_profit_targets")) return "A trade can have up to 8 TP targets.";',
  '  if (message.includes("too_many_take_profit_targets")) return "A trade can have up to 8 TP targets.";\n  if (message.includes("filled_take_profit_locked")) return "A take-profit target that already executed cannot be changed or removed.";\n  if (message.includes("future_take_profit_must_follow_filled")) return "Future TP targets must stay above the highest TP already filled.";\n  if (message.includes("dca_cancel_pending")) return "The DCA setting was reduced, but Binance has not yet confirmed cancellation of an old open DCA order. Retry the edit before placing any new DCA.";',
  "errors");
actions = mustReplace(actions,
  'function equalAllocations(targets: TpTarget[]) {\n  if (!targets.length) return targets;\n  const base = Math.floor((100 / targets.length) * 100) / 100;\n  let used = 0;\n  return targets.map((target, index) => {\n    const allocationPct = index === targets.length - 1 ? Math.round((100 - used) * 100) / 100 : base;\n    used += allocationPct;\n    return { ...target, allocationPct };\n  });\n}',
  'function equalAllocations(targets: TpTarget[], lockedIndexes = new Set<number>()) {\n  if (!targets.length) return targets;\n  const lockedTotal = targets.reduce((sum, target, index) => sum + (lockedIndexes.has(index) ? Number(target.allocationPct) || 0 : 0), 0);\n  const editable = targets.map((_, index) => index).filter((index) => !lockedIndexes.has(index));\n  if (!editable.length) return targets;\n  const remaining = Math.max(0, 100 - lockedTotal);\n  const base = Math.floor((remaining / editable.length) * 100) / 100;\n  let used = 0;\n  return targets.map((target, index) => {\n    if (lockedIndexes.has(index)) return target;\n    const editablePosition = editable.indexOf(index);\n    const allocationPct = editablePosition === editable.length - 1 ? Math.round((remaining - used) * 100) / 100 : base;\n    used += allocationPct;\n    return { ...target, allocationPct };\n  });\n}',
  "equal allocations");
actions = mustReplace(actions,
  '  const [originalTpTargets, setOriginalTpTargets] = useState<TpTarget[]>([]);\n  const [stopEnabled, setStopEnabled] = useState(trade.stopEnabled);',
  '  const [originalTpTargets, setOriginalTpTargets] = useState<TpTarget[]>([]);\n  const [filledTpIndexes, setFilledTpIndexes] = useState<number[]>([]);\n  const [originalEditSettings, setOriginalEditSettings] = useState({ maxAveraging: trade.maxAveraging, activeOrdersLimit: trade.activeOrdersLimit, stopEnabled: trade.stopEnabled, stopPct: trade.stopPct || 8 });\n  const [stopEnabled, setStopEnabled] = useState(trade.stopEnabled);',
  "state");
actions = mustReplace(actions,
  '  const remainingDcaSlots = Math.max(0, maxAveraging - completedDca);\n  const tpAllocation =',
  '  const remainingDcaSlots = Math.max(0, maxAveraging - completedDca);\n  const filledTpSet = new Set(filledTpIndexes);\n  const dcaChanged = accountMode !== "live" || maxAveraging !== originalEditSettings.maxAveraging || activeOrdersLimit !== originalEditSettings.activeOrdersLimit || stopEnabled !== originalEditSettings.stopEnabled || Math.abs(stopPct - originalEditSettings.stopPct) > 0.0001;\n  const tpAllocation =',
  "computed state");
actions = mustReplace(actions,
  '  const updateTp = (index: number, key: keyof TpTarget, value: number) => {\n    setTpTargets((current) => current.map((target, targetIndex) => targetIndex === index\n      ? { ...target, [key]: Math.max(0, Number(value) || 0) }\n      : target));\n  };',
  '  const updateTp = (index: number, key: keyof TpTarget, value: number) => {\n    if (filledTpSet.has(index)) return;\n    setTpTargets((current) => current.map((target, targetIndex) => targetIndex === index\n      ? { ...target, [key]: Math.max(0, Number(value) || 0) }\n      : target));\n  };',
  "lock update");
actions = mustReplace(actions,
  '  const removeTp = (index: number) => setTpTargets((current) => current.filter((_, targetIndex) => targetIndex !== index));',
  '  const removeTp = (index: number) => { if (filledTpSet.has(index)) return; setTpTargets((current) => current.filter((_, targetIndex) => targetIndex !== index)); };',
  "lock remove");
actions = mustReplace(actions,
  '    setTpTargets([]);\n    setOriginalTpTargets([]);\n    setStopEnabled(trade.stopEnabled);',
  '    setTpTargets([]);\n    setOriginalTpTargets([]);\n    setFilledTpIndexes([]);\n    setOriginalEditSettings({ maxAveraging: trade.maxAveraging, activeOrdersLimit: trade.activeOrdersLimit, stopEnabled: trade.stopEnabled, stopPct: trade.stopPct || 8 });\n    setStopEnabled(trade.stopEnabled);',
  "reset");
actions = mustReplace(actions,
  '      setTpTargets(exactTargets);\n      setOriginalTpTargets(exactTargets);\n      setStopEnabled(Boolean(exact.stopEnabled));',
  '      setTpTargets(exactTargets);\n      setOriginalTpTargets(exactTargets);\n      setFilledTpIndexes((Array.isArray(exact.takeProfitFilled) ? exact.takeProfitFilled : []).map((value) => Math.max(0, Math.round(Number(value) || 0) - 1)));\n      setOriginalEditSettings({ maxAveraging: trade.maxAveraging, activeOrdersLimit: Math.min(trade.activeOrdersLimit, Math.max(0, trade.maxAveraging - completedDca)), stopEnabled: Boolean(exact.stopEnabled), stopPct: Number(exact.stopPct ?? trade.stopPct ?? 8) });\n      setStopEnabled(Boolean(exact.stopEnabled));',
  "load exact");
actions = mustReplace(actions,
  '      await invokeTrade(accountMode, {\n        action: "update_trade",\n        accountId,\n        tradeId: trade.id,\n        maxAveraging,\n        activeOrdersLimit,\n        takeProfitPct,\n        stopEnabled,\n        stopPct,\n      });\n      if (accountMode === "live" && tpChanged) {',
  '      if (dcaChanged) {\n        await invokeTrade(accountMode, {\n          action: "update_trade",\n          accountId,\n          tradeId: trade.id,\n          maxAveraging,\n          activeOrdersLimit,\n          takeProfitPct,\n          stopEnabled,\n          stopPct,\n        });\n      }\n      if (accountMode === "live" && tpChanged) {',
  "skip DCA on TP-only edit");
actions = mustReplace(actions,
  'onClick={() => setTpTargets((current) => equalAllocations(current))}>Equal split</button>',
  'onClick={() => setTpTargets((current) => equalAllocations(current, filledTpSet))}>Equal split</button>',
  "equal split button");
const oldTpRow = [
  '{tpTargets.map((target, index) => <div className={styles.tpRow} key={index}>',
  '                <b>T{index + 1}</b>',
  '                <label><span>Profit %</span><div className={styles.unit}><input type="number" min="0.01" step="0.01" value={target.profitPct} onChange={(event) => updateTp(index,"profitPct",Number(event.target.value))}/><b>%</b></div></label>',
  '                <label><span>Sell %</span><div className={styles.unit}><input type="number" min="0.01" max="100" step="0.01" value={target.allocationPct} onChange={(event) => updateTp(index,"allocationPct",Number(event.target.value))}/><b>%</b></div></label>',
  '                <button type="button" className={styles.removeTp} disabled={busy} onClick={() => removeTp(index)}>Remove</button>',
  '              </div>)}'
].join("\n");
const newTpRow = [
  '{tpTargets.map((target, index) => { const filled = filledTpSet.has(index); return <div className={`${styles.tpRow} ${filled ? styles.tpFilled : ""}`} key={index}>',
  '                <b>T{index + 1}{filled ? " ✓" : ""}</b>',
  '                <label><span>Profit %</span><div className={styles.unit}><input disabled={busy || filled} type="number" min="0.01" step="0.01" value={target.profitPct} onChange={(event) => updateTp(index,"profitPct",Number(event.target.value))}/><b>%</b></div></label>',
  '                <label><span>Sell %</span><div className={styles.unit}><input disabled={busy || filled} type="number" min="0.01" max="100" step="0.01" value={target.allocationPct} onChange={(event) => updateTp(index,"allocationPct",Number(event.target.value))}/><b>%</b></div></label>',
  '                {filled ? <span className={styles.filledBadge}>Filled</span> : <button type="button" className={styles.removeTp} disabled={busy} onClick={() => removeTp(index)}>Remove</button>}',
  '              </div>; })}'
].join("\n");
actions = mustReplace(actions, oldTpRow, newTpRow, "filled rows");
actions = actions.replace('Saving a changed TP plan replaces future targets for the remaining position. Any TP fills already executed remain in the permanent trade ledger and will not be repeated.', 'Filled TP targets are locked. Saving changes only updates future targets for the remaining position.');
fs.writeFileSync(actionsPath, actions);

let actionsCss = fs.readFileSync(actionsCssPath, "utf8");
if (!actionsCss.includes("tp-filled-lock-v2")) actionsCss += '\n/* tp-filled-lock-v2 */\n.tpFilled{background:#191f1c!important;border-color:#2c4238!important}.tpFilled input{opacity:.58;color:#82958c!important;cursor:not-allowed}.tpFilled>b{color:#5f927a!important}.filledBadge{align-self:center;justify-self:end;border:1px solid #355246;background:#213329;color:#6eaa8c;border-radius:999px;padding:6px 9px;font:700 8px Tahoma,Arial,sans-serif}\n';
fs.writeFileSync(actionsCssPath, actionsCss);

let bar = fs.readFileSync(barPath, "utf8");
bar = mustReplace(bar,
  '  takeProfitTargets?: Array<{ index: number; price: number; profitPct: number; allocationPct: number }>;\n  stopLossPrice?: number | null;',
  '  takeProfitTargets?: Array<{ index: number; price: number; profitPct: number; allocationPct: number; filled?: boolean }>;\n  takeProfitFilled?: number[];\n  stopLossPrice?: number | null;',
  "bar type");
bar = mustReplace(bar,
  '  const tpMarkers = snapshot?.trade?.takeProfitTargets?.length\n    ? snapshot.trade.takeProfitTargets.map((target, index) => ({ key: `tp-${target.index || index + 1}`, label: `T${target.index || index + 1}`, value: target.price, kind: "tp" as const }))',
  '  const filledTpNumbers = new Set((snapshot?.trade?.takeProfitFilled ?? []).map((value) => Math.round(Number(value) || 0)));\n  const tpMarkers = snapshot?.trade?.takeProfitTargets?.length\n    ? snapshot.trade.takeProfitTargets.map((target, index) => ({ key: `tp-${target.index || index + 1}`, label: `T${target.index || index + 1}${target.filled || filledTpNumbers.has(target.index || index + 1) ? "✓" : ""}`, value: target.price, kind: "tp" as const, filled: Boolean(target.filled || filledTpNumbers.has(target.index || index + 1)) }))',
  "bar markers");
bar = bar.replace('className={`${styles.marker} ${styles[marker.kind]}`}', 'className={`${styles.marker} ${styles[marker.kind]} ${marker.filled ? styles.filledTp : ""}`}');
fs.writeFileSync(barPath, bar);
let barCss = fs.readFileSync(barCssPath, "utf8");
if (!barCss.includes("filled-tp-marker-v2")) barCss += '\n/* filled-tp-marker-v2 */\n.marker.filledTp:before{background:#2b6650!important}.marker.filledTp{color:#547766!important}.marker.filledTp b{color:#668978!important}.marker.filledTp span{opacity:.68}\n';
fs.writeFileSync(barCssPath, barCss);

let chart = fs.readFileSync(chartPath, "utf8");
chart = chart.replace(/\nimport ChartDrawingTools from "\.\/ChartDrawingTools";[^\n]*/g, "");
chart = chart.replace(/<ChartDrawingTools[^>]*\/>/g, "");
chart = chart.replace('  sequence?: number;\n  kind: string;', '  sequence?: number;\n  exitTargets?: number[];\n  kind: string;');
chart = chart.replace(
  '      if (isTp) {\n        if (sequence > 0) {',
  '      if (isTp) {\n        const exactTargets = Array.isArray(fill.exitTargets) ? fill.exitTargets.map((value) => Math.max(0, Math.round(Number(value) || 0))).filter((value) => value > 0) : [];\n        if (exactTargets.length) {\n          text = exactTargets.map((target) => `TP${target}`).join("+");\n          previousTpSequence = Math.max(previousTpSequence, ...exactTargets);\n        } else if (sequence > 0) {'
);
chart = chart.replace('  takeProfitTargets: Array<{ index: number; profitPct: number; allocationPct: number; price: number }>;\n  stopEnabled: boolean;', '  takeProfitTargets: Array<{ index: number; profitPct: number; allocationPct: number; price: number; filled?: boolean }>;\n  takeProfitFilled?: number[];\n  stopEnabled: boolean;');
const oldPriceLine = '    tpPrices.forEach((order, index) => order.price && candleSeries.createPriceLine({ price: order.price, color: "#57c99c", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: tpPrices.length > 1 ? `TP${order.sequence || index + 1}` : "TP" }));';
const newPriceLine = '    tpPrices.forEach((order, index) => { const target = trade.takeProfitTargets?.[index]; const filled = Boolean(target?.filled || (trade.takeProfitFilled ?? []).includes(index + 1)); if (order.price) candleSeries.createPriceLine({ price: order.price, color: filled ? "#2c6b53" : "#57c99c", lineWidth: 1, lineStyle: filled ? LineStyle.Dotted : LineStyle.Dashed, axisLabelVisible: true, title: tpPrices.length > 1 ? `TP${order.sequence || index + 1}${filled ? "✓" : ""}` : filled ? "TP✓" : "TP" }); });';
if (chart.includes(oldPriceLine)) chart = chart.replace(oldPriceLine, newPriceLine);
fs.writeFileSync(chartPath, chart);

console.log("Custom chart toolbar absent; filled TP locks/markers and DCA edit cleanup v2 prepared");
