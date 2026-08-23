import fs from "node:fs";
import path from "node:path";

const traderPath = path.join(process.cwd(), "app/trader/TradingAgent.tsx");
const cssPath = path.join(process.cwd(), "app/trader/trader.module.css");
let source = fs.readFileSync(traderPath, "utf8");
let css = fs.readFileSync(cssPath, "utf8");

// TP ALLOCATION HARD GUARD V1
// This is deliberately redundant with the general validator: no TP editor or execution path
// may accept/execute a position allocation above 100%, even if a future UI bypasses one guard.
if (!source.includes("function takeProfitAllocationTotal(")) {
  const anchor = 'function takeProfitValidationError(targets: TakeProfit[], trailingEnabled = false, allowEmpty = false) {';
  if (!source.includes(anchor)) throw new Error("TP hard guard: shared TP validator missing.");
  source = source.replace(anchor, [
    'function takeProfitAllocationTotal(targets: TakeProfit[]) {',
    '  return targets.reduce((sum, target) => sum + (Number.isFinite(Number(target.share)) ? Number(target.share) : 0), 0);',
    '}',
    anchor,
  ].join("\n"));
}

// SmartTrade creation: independent hard stop for >100% allocation.
{
  const anchor = [
    '    const total = smartUnits * entry;',
    '    if (!entry || smartUnits <= 0 || total <= 0) { setNotice("Add a valid unit amount and price before creating the paper order."); return; }',
  ].join("\n");
  if (!source.includes(anchor)) throw new Error("TP hard guard: SmartTrade create anchor missing.");
  if (!source.includes("SMART_TP_CREATE_HARD_GUARD")) {
    source = source.replace(anchor, [
      anchor,
      '    // SMART_TP_CREATE_HARD_GUARD',
      '    const smartTpAllocationTotal = takeProfitAllocationTotal(smartTps);',
      '    if (tpEnabled && smartTpAllocationTotal > 100.000001) { setNotice(`Take-profit position percentages cannot exceed 100% (currently ${smartTpAllocationTotal.toFixed(2)}%).`); return; }',
    ].join("\n"));
  }
}

// Active SmartTrade editor: independent hard stop before any state mutation.
{
  const anchor = [
    '  const saveSmartTradeEdit = () => {',
    '    if (!editingSmartTradeId || !smartEditDraft) return;',
  ].join("\n");
  if (!source.includes(anchor)) throw new Error("TP hard guard: SmartTrade edit handler missing.");
  if (!source.includes("SMART_TP_EDIT_HARD_GUARD")) {
    source = source.replace(anchor, [
      anchor,
      '    // SMART_TP_EDIT_HARD_GUARD',
      '    const editTpAllocationTotal = takeProfitAllocationTotal(smartEditDraft.takeProfits);',
      '    if (editTpAllocationTotal > 100.000001) { setNotice(`Take-profit position percentages cannot exceed 100% (currently ${editTpAllocationTotal.toFixed(2)}%).`); return; }',
    ].join("\n"));
  }
}

// Invalid legacy TP configurations are quarantined from TP execution until corrected.
// SL evaluation stays above this guard and therefore continues to protect the position.
{
  const anchor = '  const tpPrices = smartTradeTpPrices(base);';
  if (!source.includes(anchor)) throw new Error("TP hard guard: SmartTrade execution TP anchor missing.");
  if (!source.includes("SMART_TP_EXECUTION_HARD_GUARD")) {
    source = source.replace(anchor, [
      '  // SMART_TP_EXECUTION_HARD_GUARD',
      '  const executionTpError = takeProfitValidationError(base.takeProfits, Boolean(base.trailingTp), true);',
      '  if (executionTpError) return base;',
      anchor,
    ].join("\n"));
  }
}

// Derived editor validity state for immediate visual feedback and disabled Save.
{
  const anchor = '  const editingSmartTrade = editingSmartTradeId ? smartTrades.find((trade) => trade.id === editingSmartTradeId) ?? null : null;';
  if (!source.includes(anchor)) throw new Error("TP hard guard: editingSmartTrade derived anchor missing.");
  if (!source.includes("smartEditTpAllocationTotal")) {
    source = source.replace(anchor, [
      anchor,
      '  const smartEditTpAllocationTotal = smartEditDraft ? takeProfitAllocationTotal(smartEditDraft.takeProfits) : 0;',
      '  const smartEditTpAllocationInvalid = Boolean(smartEditDraft && smartEditTpAllocationTotal > 100.000001);',
    ].join("\n"));
  }
}

// Make the invalid sum obvious in the popup itself.
{
  const anchor = '            <div className={styles.smartTradeToggleRow}><span>Trailing Take Profit</span><Toggle checked={smartEditDraft.trailingTp} onChange={(value) => setSmartEditDraft((draft) => draft ? { ...draft, trailingTp: value } : draft)}/></div>';
  if (!source.includes(anchor)) throw new Error("TP hard guard: edit modal TP section anchor missing.");
  if (!source.includes("smartTpAllocationStatus")) {
    source = source.replace(anchor, [
      '            <div className={smartEditTpAllocationInvalid ? styles.smartTpAllocationStatus + " " + styles.smartTpAllocationInvalid : styles.smartTpAllocationStatus}><span>Allocated position</span><strong>{smartEditTpAllocationTotal.toFixed(2).replace(".00", "")}% / 100%</strong></div>',
      '            {smartEditTpAllocationInvalid && <div className={styles.smartTpValidationError}>Total TP position allocation is above 100%. Reduce one or more Position % values before saving.</div>}',
      anchor,
    ].join("\n"));
  }
}

// Save must be physically disabled while the TP allocation is invalid.
{
  const old = '<button type="button" className={styles.primaryButton} onClick={saveSmartTradeEdit}>Save changes</button>';
  const replacement = '<button type="button" className={styles.primaryButton} onClick={saveSmartTradeEdit} disabled={smartEditTpAllocationInvalid} aria-disabled={smartEditTpAllocationInvalid}>Save changes</button>';
  if (!source.includes(old) && !source.includes('disabled={smartEditTpAllocationInvalid}')) throw new Error("TP hard guard: Save changes button anchor missing.");
  source = source.replace(old, replacement);
}

// Also guard direct TP share changes in the main SmartTrade builder at submission level.
// Existing main-create UI may allow temporary >100% while typing, but it can never create the trade.
if (!source.includes('SMART_TP_CREATE_HARD_GUARD')) throw new Error("TP hard guard: create guard not installed.");
if (!source.includes('SMART_TP_EDIT_HARD_GUARD')) throw new Error("TP hard guard: edit guard not installed.");
if (!source.includes('SMART_TP_EXECUTION_HARD_GUARD')) throw new Error("TP hard guard: execution guard not installed.");
if (!source.includes('disabled={smartEditTpAllocationInvalid}')) throw new Error("TP hard guard: editor Save was not disabled.");

if (!css.includes('/* SmartTrade TP allocation hard guard */')) {
  css += `\n/* SmartTrade TP allocation hard guard */\n.smartTpAllocationStatus{display:flex;align-items:center;justify-content:space-between;margin:10px 0 6px;padding:9px 11px;border:1px solid #314755;border-radius:6px;background:#14232d;color:#9db0bc;font-size:12px}.smartTpAllocationStatus strong{color:#d8e1e6}.smartTpAllocationInvalid{border-color:#8d4150;background:#291c24;color:#f093a3}.smartTpAllocationInvalid strong{color:#ff8298}.smartTpValidationError{margin:0 0 11px;padding:9px 11px;border-radius:6px;background:#3b2029;border:1px solid #934152;color:#ff9aad;font-size:11px;line-height:1.4}.smartTradeModalFooter .primaryButton:disabled{opacity:.42;cursor:not-allowed;filter:saturate(.55)}\n`;
}

fs.writeFileSync(traderPath, source);
fs.writeFileSync(cssPath, css);
console.log("Installed hard TP allocation guards for SmartTrade create, edit, and execution.");
