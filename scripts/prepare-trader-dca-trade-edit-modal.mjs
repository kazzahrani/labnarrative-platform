import fs from "node:fs";
import path from "node:path";

const traderPath = path.join(process.cwd(), "app/trader/TradingAgent.tsx");
const cssPath = path.join(process.cwd(), "app/trader/trader.module.css");
let source = fs.readFileSync(traderPath, "utf8");
let css = fs.readFileSync(cssPath, "utf8");

// Store active-deal overrides independently from the parent bot configuration.
if (!source.includes("takeProfitPct?: number;")) {
  source = source.replace(
    '  fills?: Array<{ kind: "Base" | "Averaging"; price: number; amount: number; quantity: number; at: string }>;\n};',
    '  fills?: Array<{ kind: "Base" | "Averaging"; price: number; amount: number; quantity: number; at: string }>;\n  activeOrdersLimit?: number;\n  takeProfitPct?: number;\n  trailingEnabled?: boolean;\n  trailingDeviationPct?: number;\n  trailingPeakPrice?: number;\n  stopEnabledOverride?: boolean;\n  stopPctOverride?: number;\n  maxHoldEnabled?: boolean;\n  maxHoldHours?: number;\n};'
  );
}

// Modal state. Use text drafts so users can delete/retype values without controlled-number input fighting them.
if (!source.includes("editingDcaTradeId")) {
  source = source.replace(
    '  const [selectedTradeChartId, setSelectedTradeChartId] = useState<string | null>(null);',
    '  const [selectedTradeChartId, setSelectedTradeChartId] = useState<string | null>(null);\n  const [editingDcaTradeId, setEditingDcaTradeId] = useState<string | null>(null);\n  const [dcaTradeEditDraft, setDcaTradeEditDraft] = useState({ maxAveraging: "1", activeOrdersLimit: "1", takeProfitPct: "2", trailingEnabled: false, trailingDeviationPct: "0.2", stopEnabled: false, stopPct: "5", maxHoldEnabled: false, maxHoldHours: "24" });'
  );
}

// Active deal editor actions.
if (!source.includes("const openDcaTradeEditor =")) {
  const anchor = '  const closeDcaTrade = (tradeId: string) => {';
  const handlers = [
    '  const openDcaTradeEditor = (tradeId: string) => {',
    '    const trade = dcaTrades.find((item) => item.id === tradeId);',
    '    if (!trade || trade.status !== "Active") return;',
    '    const bot = dcaBots.find((item) => item.id === trade.botId);',
    '    setEditingDcaTradeId(trade.id);',
    '    setDcaTradeEditDraft({',
    '      maxAveraging: String(trade.maxAveraging),',
    '      activeOrdersLimit: String(trade.activeOrdersLimit ?? Math.min(1, trade.maxAveraging || 1)),',
    '      takeProfitPct: String(trade.takeProfitPct ?? bot?.takeProfit ?? 0),',
    '      trailingEnabled: trade.trailingEnabled ?? false,',
    '      trailingDeviationPct: String(trade.trailingDeviationPct ?? 0.2),',
    '      stopEnabled: trade.stopEnabledOverride ?? bot?.stopEnabled ?? false,',
    '      stopPct: String(trade.stopPctOverride ?? bot?.stopPct ?? 5),',
    '      maxHoldEnabled: trade.maxHoldEnabled ?? false,',
    '      maxHoldHours: String(trade.maxHoldHours ?? 24),',
    '    });',
    '  };',
    '',
    '  const saveDcaTradeEdits = () => {',
    '    if (!editingDcaTradeId) return;',
    '    setDcaTrades((items) => items.map((trade) => {',
    '      if (trade.id !== editingDcaTradeId || trade.status !== "Active") return trade;',
    '      const maxAveragingRaw = Number(dcaTradeEditDraft.maxAveraging);',
    '      const maxAveraging = Math.max(trade.averagingFilled, Number.isFinite(maxAveragingRaw) ? Math.max(0, Math.round(maxAveragingRaw)) : trade.maxAveraging);',
    '      const activeLimitRaw = Number(dcaTradeEditDraft.activeOrdersLimit);',
    '      const activeOrdersLimit = Math.max(0, Math.min(maxAveraging, Number.isFinite(activeLimitRaw) ? Math.round(activeLimitRaw) : (trade.activeOrdersLimit ?? 1)));',
    '      const takeProfitRaw = Number(dcaTradeEditDraft.takeProfitPct);',
    '      const stopRaw = Number(dcaTradeEditDraft.stopPct);',
    '      const trailRaw = Number(dcaTradeEditDraft.trailingDeviationPct);',
    '      const holdRaw = Number(dcaTradeEditDraft.maxHoldHours);',
    '      return {',
    '        ...trade,',
    '        maxAveraging,',
    '        activeOrdersLimit,',
    '        takeProfitPct: Number.isFinite(takeProfitRaw) ? Math.max(0, takeProfitRaw) : (trade.takeProfitPct ?? 0),',
    '        trailingEnabled: dcaTradeEditDraft.trailingEnabled,',
    '        trailingDeviationPct: Number.isFinite(trailRaw) ? Math.max(0, trailRaw) : (trade.trailingDeviationPct ?? 0.2),',
    '        stopEnabledOverride: dcaTradeEditDraft.stopEnabled,',
    '        stopPctOverride: Number.isFinite(stopRaw) ? Math.max(0, stopRaw) : (trade.stopPctOverride ?? 0),',
    '        maxHoldEnabled: dcaTradeEditDraft.maxHoldEnabled,',
    '        maxHoldHours: Number.isFinite(holdRaw) ? Math.max(0.01, holdRaw) : (trade.maxHoldHours ?? 24),',
    '      };',
    '    }));',
    '    setEditingDcaTradeId(null);',
    '    setNotice("Active DCA trade settings updated.");',
    '  };',
    '',
  ].join("\n");
  source = source.replace(anchor, handlers + anchor);
}

// The Active trades Edit button edits this deal only, rather than reopening the parent bot configuration.
source = source.replace(
  '<button onClick={() => loadDcaBotIntoEditor(trade.botId)}>✎ Edit</button>',
  '<button onClick={() => openDcaTradeEditor(trade.id)}>✎ Edit</button>'
);

// Use active-deal overrides for the row TP/SL values.
source = source.replace(
  'const tpLevel = tradeBot?.takeProfit ? trade.averagePrice * (1 + tradeBot.takeProfit / 100) : null;',
  'const effectiveTpPct = trade.takeProfitPct ?? tradeBot?.takeProfit ?? 0;\n  const tpLevel = effectiveTpPct > 0 ? trade.averagePrice * (1 + effectiveTpPct / 100) : null;'
);
source = source.replace(
  'const slLevel = tradeBot?.stopEnabled ? trade.averagePrice * (1 - tradeBot.stopPct / 100) : null;',
  'const effectiveStopEnabled = trade.stopEnabledOverride ?? tradeBot?.stopEnabled ?? false;\n  const effectiveStopPct = trade.stopPctOverride ?? tradeBot?.stopPct ?? 0;\n  const slLevel = effectiveStopEnabled ? trade.averagePrice * (1 - effectiveStopPct / 100) : null;'
);

// Use active-deal overrides in the full-screen trade chart too.
source = source.replace(
  '  const selectedDcaTpPrice = selectedDcaChartTrade && selectedDcaChartBot?.takeProfit ? selectedDcaChartTrade.averagePrice * (1 + selectedDcaChartBot.takeProfit / 100) : null;',
  '  const selectedDcaTpPct = selectedDcaChartTrade ? (selectedDcaChartTrade.takeProfitPct ?? selectedDcaChartBot?.takeProfit ?? 0) : 0;\n  const selectedDcaTpPrice = selectedDcaChartTrade && selectedDcaTpPct > 0 ? selectedDcaChartTrade.averagePrice * (1 + selectedDcaTpPct / 100) : null;'
);
source = source.replace(
  '  const selectedDcaSlPrice = selectedDcaChartTrade && selectedDcaChartBot?.stopEnabled ? selectedDcaChartTrade.averagePrice * (1 - selectedDcaChartBot.stopPct / 100) : null;',
  '  const selectedDcaStopEnabled = selectedDcaChartTrade ? (selectedDcaChartTrade.stopEnabledOverride ?? selectedDcaChartBot?.stopEnabled ?? false) : false;\n  const selectedDcaStopPct = selectedDcaChartTrade ? (selectedDcaChartTrade.stopPctOverride ?? selectedDcaChartBot?.stopPct ?? 0) : 0;\n  const selectedDcaSlPrice = selectedDcaChartTrade && selectedDcaStopEnabled ? selectedDcaChartTrade.averagePrice * (1 - selectedDcaStopPct / 100) : null;'
);

// Make the paper trade manager honor per-trade TP, SL, trailing TP, and maximum-hold edits.
source = source.replace(
  '            const stopHit = bot.stopEnabled && currentPrice <= item.averagePrice * (1 - bot.stopPct / 100);\n            const tpHit = bot.takeProfit > 0 && currentPrice >= item.averagePrice * (1 + bot.takeProfit / 100);\n            if (stopHit || tpHit) return { ...marked, status: "Closed", closedAt: new Date().toISOString(), realizedPnl: (currentPrice - item.averagePrice) * item.quantity, closeReason: stopHit ? "Stop Loss" : "Take Profit", exitPrice: currentPrice };',
  [
    '            const effectiveStopEnabled = item.stopEnabledOverride ?? bot.stopEnabled;',
    '            const effectiveStopPct = item.stopPctOverride ?? bot.stopPct;',
    '            const effectiveTakeProfitPct = item.takeProfitPct ?? bot.takeProfit;',
    '            const stopHit = effectiveStopEnabled && currentPrice <= item.averagePrice * (1 - effectiveStopPct / 100);',
    '            const targetPrice = effectiveTakeProfitPct > 0 ? item.averagePrice * (1 + effectiveTakeProfitPct / 100) : 0;',
    '            const holdExpired = Boolean(item.maxHoldEnabled && item.maxHoldHours && (Date.now() - new Date(item.createdAt).getTime()) >= item.maxHoldHours * 3600000);',
    '            let trailingPeakPrice = item.trailingPeakPrice;',
    '            if (item.trailingEnabled && targetPrice > 0 && currentPrice >= targetPrice) trailingPeakPrice = Math.max(trailingPeakPrice ?? currentPrice, currentPrice);',
    '            const trailingDeviation = item.trailingDeviationPct ?? 0.2;',
    '            const trailingTpHit = Boolean(item.trailingEnabled && trailingPeakPrice && currentPrice <= trailingPeakPrice * (1 - trailingDeviation / 100));',
    '            const directTpHit = !item.trailingEnabled && targetPrice > 0 && currentPrice >= targetPrice;',
    '            const managed = trailingPeakPrice ? { ...marked, trailingPeakPrice } : marked;',
    '            if (stopHit || trailingTpHit || directTpHit || holdExpired) return { ...managed, status: "Closed", closedAt: new Date().toISOString(), realizedPnl: (currentPrice - item.averagePrice) * item.quantity, closeReason: stopHit ? "Stop Loss" : holdExpired ? "Maximum hold period" : item.trailingEnabled ? "Trailing Take Profit" : "Take Profit", exitPrice: currentPrice };'
  ].join("\n")
);
// The downstream averaging and return branches need the possibly updated trailing-peak mark.
source = source.replace('return { ...marked, quantity: newQuantity, invested: newInvested, averagePrice: newInvested / newQuantity, averagingFilled: item.averagingFilled + 1, fills:', 'return { ...managed, quantity: newQuantity, invested: newInvested, averagePrice: newInvested / newQuantity, averagingFilled: item.averagingFilled + 1, fills:');
source = source.replace('            return marked;\n          }));', '            return managed;\n          }));');

// Derived active trade for the edit modal.
if (!source.includes("const editingDcaTrade =")) {
  const anchor = '  const selectedDcaChartTrade = selectedTradeChartId ? dcaTrades.find((trade) => trade.id === selectedTradeChartId) ?? null : null;';
  source = source.replace(anchor, '  const editingDcaTrade = editingDcaTradeId ? dcaTrades.find((trade) => trade.id === editingDcaTradeId) ?? null : null;\n  const editingDcaTradeBot = editingDcaTrade ? dcaBots.find((bot) => bot.id === editingDcaTrade.botId) ?? null : null;\n' + anchor);
}

// Render a 3Commas-style centered deal-edit modal before the trade-chart overlay.
if (!source.includes('className={styles.dcaTradeEditOverlay}')) {
  const modalAnchor = '      {selectedDcaChartTrade && <DcaTradeChart';
  const modal = `      {editingDcaTrade && <div className={styles.dcaTradeEditOverlay} onMouseDown={(event) => { if (event.target === event.currentTarget) setEditingDcaTradeId(null); }}>
        <section className={styles.dcaTradeEditModal} role="dialog" aria-modal="true" aria-label="Edit active DCA trade">
          <header className={styles.dcaTradeEditHeader}>
            <div><h2>{editingDcaTrade.botName}</h2><p>{editingDcaTrade.pair} · #{editingDcaTrade.id.replace("deal-", "")}</p></div>
            <button type="button" onClick={() => setEditingDcaTradeId(null)}>×</button>
          </header>
          <div className={styles.dcaTradeEditScroll}>
            <section className={styles.dcaTradeEditSection}>
              <h3>Averaging orders</h3>
              <label><span>Orders</span><input inputMode="numeric" value={dcaTradeEditDraft.maxAveraging} onChange={(event) => setDcaTradeEditDraft((current) => ({ ...current, maxAveraging: event.target.value }))}/></label>
              <label><span>Active orders limit</span><input inputMode="numeric" value={dcaTradeEditDraft.activeOrdersLimit} onChange={(event) => setDcaTradeEditDraft((current) => ({ ...current, activeOrdersLimit: event.target.value }))}/></label>
              <small>Already filled averaging orders cannot be removed from this trade.</small>
            </section>
            <section className={styles.dcaTradeEditSection}>
              <h3>Take profit</h3>
              <span className={styles.dcaTradeEditLabel}>Profit currency</span>
              <div className={styles.dcaTradeCurrencyTabs}><button type="button" className={styles.dcaTradeCurrencyActive}>● USDT</button><button type="button">{editingDcaTrade.pair.split("/")[0]}</button></div>
              <label><span>Calculation from</span><select value="average"><option value="average">Percentage from average price</option></select></label>
              <label><span>Take profit, %</span><input inputMode="decimal" value={dcaTradeEditDraft.takeProfitPct} onChange={(event) => setDcaTradeEditDraft((current) => ({ ...current, takeProfitPct: event.target.value }))}/></label>
              <button type="button" className={styles.dcaTradeAddTarget}>＋ Add target profit 2/4</button>
              <div className={styles.dcaTradeToggleRow}><strong>Trailing</strong><button type="button" className={`${styles.toggle} ${dcaTradeEditDraft.trailingEnabled ? styles.toggleOn : ""}`} onClick={() => setDcaTradeEditDraft((current) => ({ ...current, trailingEnabled: !current.trailingEnabled }))}><i/></button></div>
              {dcaTradeEditDraft.trailingEnabled && <label><span>Trailing deviation, %</span><input inputMode="decimal" value={dcaTradeEditDraft.trailingDeviationPct} onChange={(event) => setDcaTradeEditDraft((current) => ({ ...current, trailingDeviationPct: event.target.value }))}/></label>}
            </section>
            <section className={styles.dcaTradeEditSectionCompact}>
              <div className={styles.dcaTradeToggleRow}><strong>Stop Loss</strong><button type="button" className={`${styles.toggle} ${dcaTradeEditDraft.stopEnabled ? styles.toggleOn : ""}`} onClick={() => setDcaTradeEditDraft((current) => ({ ...current, stopEnabled: !current.stopEnabled }))}><i/></button></div>
              {dcaTradeEditDraft.stopEnabled && <label><span>Stop loss, %</span><input inputMode="decimal" value={dcaTradeEditDraft.stopPct} onChange={(event) => setDcaTradeEditDraft((current) => ({ ...current, stopPct: event.target.value }))}/></label>}
            </section>
            <section className={styles.dcaTradeEditSectionCompact}>
              <div className={styles.dcaTradeToggleRow}><strong>Maximum hold period</strong><button type="button" className={`${styles.toggle} ${dcaTradeEditDraft.maxHoldEnabled ? styles.toggleOn : ""}`} onClick={() => setDcaTradeEditDraft((current) => ({ ...current, maxHoldEnabled: !current.maxHoldEnabled }))}><i/></button></div>
              {dcaTradeEditDraft.maxHoldEnabled && <label><span>Maximum hold, hours</span><input inputMode="decimal" value={dcaTradeEditDraft.maxHoldHours} onChange={(event) => setDcaTradeEditDraft((current) => ({ ...current, maxHoldHours: event.target.value }))}/></label>}
            </section>
          </div>
          <footer className={styles.dcaTradeEditFooter}><button type="button" onClick={() => setEditingDcaTradeId(null)}>Cancel</button><button type="button" className={styles.primaryButton} onClick={saveDcaTradeEdits}>Save changes</button></footer>
        </section>
      </div>}
`;
  source = source.replace(modalAnchor, modal + modalAnchor);
}

if (!css.includes("/* DCA active trade edit modal */")) {
  css += `
/* DCA active trade edit modal */
.dcaTradeEditOverlay{position:fixed;inset:0;z-index:2100;background:rgba(3,9,14,.78);display:flex;align-items:flex-start;justify-content:center;padding:34px 18px;overflow:auto;backdrop-filter:blur(1px)}
.dcaTradeEditModal{width:min(620px,100%);max-height:calc(100vh - 68px);background:#17242d;border:1px solid #263944;border-radius:14px;box-shadow:0 28px 80px rgba(0,0,0,.55);display:grid;grid-template-rows:auto minmax(0,1fr) auto;overflow:hidden}
.dcaTradeEditHeader{display:flex;align-items:flex-start;justify-content:space-between;padding:25px 26px 15px;gap:20px}.dcaTradeEditHeader h2{margin:0;color:#edf4f7;font-size:20px;line-height:1.24}.dcaTradeEditHeader p{margin:5px 0 0;color:#7892a2;font-size:11px}.dcaTradeEditHeader>button{border:0;background:transparent;color:#9fb0bb;font-size:28px;line-height:1;cursor:pointer}
.dcaTradeEditScroll{overflow:auto;padding:0 26px 16px;display:flex;flex-direction:column;gap:13px}.dcaTradeEditSection,.dcaTradeEditSectionCompact{border:1px solid #2b404d;background:#15232c;border-radius:7px;padding:13px}.dcaTradeEditSection h3{margin:0 0 15px;color:#dce5ea;font-size:13px}.dcaTradeEditSection label,.dcaTradeEditSectionCompact label{display:flex;flex-direction:column;gap:6px;margin-top:11px}.dcaTradeEditSection label>span,.dcaTradeEditSectionCompact label>span,.dcaTradeEditLabel{color:#b9c5cc;font-size:11px}.dcaTradeEditSection input,.dcaTradeEditSection select,.dcaTradeEditSectionCompact input{height:34px;border:1px solid #334b5a;background:#102029;border-radius:5px;color:#d3dde2;padding:0 10px;outline:none}.dcaTradeEditSection input:focus,.dcaTradeEditSection select:focus,.dcaTradeEditSectionCompact input:focus{border-color:#3f7187}.dcaTradeEditSection small{display:block;margin-top:8px;color:#718a99;font-size:10px}
.dcaTradeCurrencyTabs{display:grid;grid-template-columns:1fr 1fr;margin-top:6px}.dcaTradeCurrencyTabs button{height:32px;border:1px solid #344b59;background:#3a4d5c;color:#c2cdd3;cursor:pointer}.dcaTradeCurrencyTabs button:first-child{border-radius:5px 0 0 5px}.dcaTradeCurrencyTabs button:last-child{border-radius:0 5px 5px 0}.dcaTradeCurrencyTabs .dcaTradeCurrencyActive{background:#102029;color:#dce5e9}.dcaTradeAddTarget{border:0;background:transparent;color:#4da7f2;padding:12px 0 2px;text-align:left;font-weight:700;cursor:pointer}.dcaTradeToggleRow{display:flex;align-items:center;justify-content:space-between;min-height:31px}.dcaTradeToggleRow strong{color:#d3dce1;font-size:11px}.dcaTradeEditSection .dcaTradeToggleRow{margin-top:9px;padding-top:10px;border-top:1px solid #253944}
.dcaTradeEditFooter{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:14px 26px 24px;background:#17242d}.dcaTradeEditFooter>button{height:38px;border:1px solid #354a57;border-radius:5px;background:#263844;color:#d0dae0;font-weight:750;cursor:pointer}.dcaTradeEditFooter .primaryButton{border-color:#10b7ae;background:#13b9b0;color:#fff}
@media(max-width:680px){.dcaTradeEditOverlay{padding:0}.dcaTradeEditModal{max-height:100vh;min-height:100vh;border-radius:0;border:0}.dcaTradeEditHeader,.dcaTradeEditScroll,.dcaTradeEditFooter{padding-left:16px;padding-right:16px}}
`;
}

fs.writeFileSync(traderPath, source);
fs.writeFileSync(cssPath, css);
console.log("Added 3Commas-style active DCA trade edit modal with per-deal TP, SL, trailing and averaging overrides.");
