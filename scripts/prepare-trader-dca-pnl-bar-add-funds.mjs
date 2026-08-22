import fs from "node:fs";
import path from "node:path";

const traderPath = path.join(process.cwd(), "app/trader/TradingAgent.tsx");
const cssPath = path.join(process.cwd(), "app/trader/trader.module.css");
let source = fs.readFileSync(traderPath, "utf8");
let css = fs.readFileSync(cssPath, "utf8");

// 3Commas behavior: a trade bar has ONE state color. Losing = red, winning = green.
const splitTrack = `      <div className={styles.dealPriceTrack}>
        <i className={styles.dealLossBand} style={{ width: buyLeft }}/>
        <i className={styles.dealProfitBand} style={{ left: buyLeft }}/>
      </div>`;
const stateTrack = `      <div className={current >= trade.averagePrice ? styles.dealPriceTrack + " " + styles.dealPriceTrackWin : styles.dealPriceTrack + " " + styles.dealPriceTrackLoss}/>`;
source = source.replace(splitTrack, stateTrack);

// Add Funds modal state.
if (!source.includes("addFundsTradeId")) {
  source = source.replace(
    '  const [editingDcaTradeId, setEditingDcaTradeId] = useState<string | null>(null);',
    '  const [editingDcaTradeId, setEditingDcaTradeId] = useState<string | null>(null);\n  const [addFundsTradeId, setAddFundsTradeId] = useState<string | null>(null);\n  const [addFundsOrderType, setAddFundsOrderType] = useState<"Market" | "Limit">("Market");\n  const [addFundsAmount, setAddFundsAmount] = useState("0");\n  const [addFundsPercent, setAddFundsPercent] = useState(10);\n  const [addFundsLimitPrice, setAddFundsLimitPrice] = useState("0");'
  );
}

// Replace the old one-click fund addition with an explicit 3Commas-style modal workflow.
const oldHandlerStart = source.indexOf('  const addFundsToDcaTrade = (tradeId: string) => {');
const oldHandlerEnd = oldHandlerStart >= 0 ? source.indexOf('  const handleGlobalSearch = (value: string) => {', oldHandlerStart) : -1;
if (oldHandlerStart >= 0 && oldHandlerEnd > oldHandlerStart) {
  const handlers = [
    '  const openAddFundsModal = (tradeId: string) => {',
    '    const trade = dcaTrades.find((item) => item.id === tradeId);',
    '    if (!trade || trade.status !== "Active") return;',
    '    const current = dcaTradePrice(trade);',
    '    const available = Math.max(0, DEMO_BALANCE - dcaFundsLocked);',
    '    const initialAmount = Math.min(available, Math.max(0, available * 0.1));',
    '    setAddFundsTradeId(trade.id);',
    '    setAddFundsOrderType("Market");',
    '    setAddFundsPercent(10);',
    '    setAddFundsAmount(initialAmount.toFixed(2));',
    '    setAddFundsLimitPrice(current > 0 ? String(current) : "0");',
    '  };',
    '',
    '  const updateAddFundsPercent = (nextPercent: number) => {',
    '    const clamped = Math.max(0, Math.min(100, nextPercent));',
    '    const available = Math.max(0, DEMO_BALANCE - dcaFundsLocked);',
    '    setAddFundsPercent(clamped);',
    '    setAddFundsAmount((available * clamped / 100).toFixed(2));',
    '  };',
    '',
    '  const saveAddFunds = () => {',
    '    if (!addFundsTradeId) return;',
    '    const trade = dcaTrades.find((item) => item.id === addFundsTradeId);',
    '    if (!trade || trade.status !== "Active") { setAddFundsTradeId(null); return; }',
    '    const available = Math.max(0, DEMO_BALANCE - dcaFundsLocked);',
    '    const amount = Number(addFundsAmount);',
    '    const executionPrice = addFundsOrderType === "Market" ? dcaTradePrice(trade) : Number(addFundsLimitPrice);',
    '    if (!Number.isFinite(amount) || amount <= 0) { setNotice("Enter a valid amount to add."); return; }',
    '    if (amount > available + 0.000001) { setNotice("Add Funds amount is higher than the available paper USDT balance."); return; }',
    '    if (!Number.isFinite(executionPrice) || executionPrice <= 0) { setNotice("Enter a valid execution price."); return; }',
    '    setDcaTrades((items) => items.map((item) => {',
    '      if (item.id !== trade.id || item.status !== "Active") return item;',
    '      const extraQty = amount / executionPrice;',
    '      const newQty = item.quantity + extraQty;',
    '      const newInvested = item.invested + amount;',
    '      return { ...item, quantity: newQty, invested: newInvested, averagePrice: newInvested / newQty, lastPrice: dcaTradePrice(item) };',
    '    }));',
    '    setAddFundsTradeId(null);',
    '    setNotice(`Added ${compactMoney(amount)} to ${trade.pair} in paper mode${addFundsOrderType === "Limit" ? " at the selected limit price" : " at market"}.`);',
    '  };',
    '',
  ].join("\n");
  source = source.slice(0, oldHandlerStart) + handlers + source.slice(oldHandlerEnd);
}

// Add Funds button opens the modal instead of immediately modifying the position.
source = source.replace(
  'onClick={() => addFundsToDcaTrade(trade.id)}>＋$ Add funds</button>',
  'onClick={() => openAddFundsModal(trade.id)}>＋$ Add funds</button>'
);

// Derived modal values live in outer component scope so the popup stays reactive to live market price.
if (!source.includes("const addFundsTrade = addFundsTradeId")) {
  const anchor = '  const editingDcaTrade = editingDcaTradeId ? dcaTrades.find((trade) => trade.id === editingDcaTradeId) ?? null : null;';
  const derived = [
    '  const addFundsTrade = addFundsTradeId ? dcaTrades.find((trade) => trade.id === addFundsTradeId) ?? null : null;',
    '  const addFundsBot = addFundsTrade ? dcaBots.find((bot) => bot.id === addFundsTrade.botId) ?? null : null;',
    '  const addFundsAvailable = Math.max(0, DEMO_BALANCE - dcaFundsLocked);',
    '  const addFundsMarketPrice = addFundsTrade ? dcaTradePrice(addFundsTrade) : 0;',
    '  const addFundsExecutionPrice = addFundsOrderType === "Market" ? addFundsMarketPrice : Number(addFundsLimitPrice);',
    '  const addFundsQuoteAmount = Math.max(0, Number(addFundsAmount) || 0);',
    '  const addFundsBaseAmount = addFundsExecutionPrice > 0 ? addFundsQuoteAmount / addFundsExecutionPrice : 0;',
    '  const addFundsProjectedQty = addFundsTrade ? addFundsTrade.quantity + addFundsBaseAmount : 0;',
    '  const addFundsProjectedInvested = addFundsTrade ? addFundsTrade.invested + addFundsQuoteAmount : 0;',
    '  const addFundsProjectedAverage = addFundsProjectedQty > 0 ? addFundsProjectedInvested / addFundsProjectedQty : 0;',
    '  const addFundsStopEnabled = addFundsTrade ? (addFundsTrade.stopEnabledOverride ?? addFundsBot?.stopEnabled ?? false) : false;',
    '  const addFundsStopPct = addFundsTrade ? (addFundsTrade.stopPctOverride ?? addFundsBot?.stopPct ?? 0) : 0;',
    '  const addFundsProjectedStop = addFundsStopEnabled && addFundsProjectedAverage > 0 ? addFundsProjectedAverage * (1 - addFundsStopPct / 100) : null;',
    '',
    anchor,
  ].join("\n");
  source = source.replace(anchor, derived);
}

// Insert the popup before the existing Edit Trade popup.
if (!source.includes('className={styles.addFundsOverlay}')) {
  const anchor = '      {editingDcaTrade && <div className={styles.dcaTradeEditOverlay}';
  const modal = `      {addFundsTrade && <div className={styles.addFundsOverlay} onMouseDown={(event) => { if (event.target === event.currentTarget) setAddFundsTradeId(null); }}>
        <section className={styles.addFundsModal} role="dialog" aria-modal="true" aria-label="Add funds to active DCA trade">
          <header className={styles.addFundsHeader}>
            <div><h2>Add funds</h2><p>{addFundsTrade.pair} · {addFundsTrade.botName}</p></div>
            <button type="button" aria-label="Close" onClick={() => setAddFundsTradeId(null)}>×</button>
          </header>
          <div className={styles.addFundsBody}>
            <label className={styles.addFundsField}>
              <span>Volume <b>{compactMoney(addFundsAvailable)} USDT available</b></span>
              <div className={styles.addFundsInputWrap}><input inputMode="decimal" value={addFundsAmount} onChange={(event) => { const value = event.target.value; setAddFundsAmount(value); const amount = Number(value); setAddFundsPercent(addFundsAvailable > 0 && Number.isFinite(amount) ? Math.max(0, Math.min(100, amount / addFundsAvailable * 100)) : 0); }}/><strong>USDT</strong></div>
            </label>
            <div className={styles.addFundsPercentBox}>
              <div className={styles.addFundsInputWrap}><input inputMode="decimal" value={addFundsPercent.toFixed(1).replace(".0", "")} onChange={(event) => updateAddFundsPercent(Number(event.target.value) || 0)}/><strong>%</strong></div>
              <input className={styles.addFundsRange} type="range" min="0" max="100" step="1" value={addFundsPercent} onChange={(event) => updateAddFundsPercent(Number(event.target.value))}/>
            </div>
            <div className={styles.addFundsOrderTabs}><button type="button" className={addFundsOrderType === "Market" ? styles.addFundsOrderActive : ""} onClick={() => setAddFundsOrderType("Market")}>Market</button><button type="button" className={addFundsOrderType === "Limit" ? styles.addFundsOrderActive : ""} onClick={() => setAddFundsOrderType("Limit")}>Limit</button></div>
            <label className={styles.addFundsField}>
              <span>Price</span>
              <div className={styles.addFundsInputWrap}><input inputMode="decimal" disabled={addFundsOrderType === "Market"} value={addFundsOrderType === "Market" ? (addFundsMarketPrice > 0 ? String(addFundsMarketPrice) : "0") : addFundsLimitPrice} onChange={(event) => setAddFundsLimitPrice(event.target.value)}/><strong>USDT</strong></div>
              {addFundsOrderType === "Limit" && <small>Paper mode applies the added funds at the selected limit price when you save.</small>}
            </label>
            <div className={styles.addFundsSummary}>
              <p><span>Total quote currency</span><b>{addFundsQuoteAmount.toFixed(8)} USDT</b></p>
              <p><span>Total base currency</span><b>{addFundsBaseAmount.toFixed(8)} {addFundsTrade.pair.split("/")[0]}</b></p>
              <p><span>New average price</span><b>{addFundsProjectedAverage > 0 ? money(addFundsProjectedAverage) : "—"}</b></p>
              <p><span>Stop loss price</span><b>{addFundsProjectedStop ? money(addFundsProjectedStop) : "Off"}</b></p>
            </div>
          </div>
          <footer className={styles.addFundsFooter}><button type="button" onClick={() => setAddFundsTradeId(null)}>Discard</button><button type="button" className={styles.addFundsSave} onClick={saveAddFunds} disabled={addFundsQuoteAmount <= 0 || addFundsQuoteAmount > addFundsAvailable || addFundsExecutionPrice <= 0}>Save</button></footer>
        </section>
      </div>}
`;
  source = source.replace(anchor, modal + anchor);
}

if (!source.includes('styles.dealPriceTrackWin')) throw new Error('Single-color DCA PnL bar patch failed.');
if (!source.includes('openAddFundsModal(trade.id)')) throw new Error('Add Funds button was not rewired.');
if (!source.includes('className={styles.addFundsOverlay}')) throw new Error('Add Funds modal insertion failed.');

if (!css.includes('/* DCA single-state PnL bar + Add Funds modal */')) {
  css += `
/* DCA single-state PnL bar + Add Funds modal */
.dealPriceTrackWin{background:#16b89f!important}.dealPriceTrackLoss{background:#f26680!important}
.dealPriceTrackWin>i,.dealPriceTrackLoss>i{display:none!important}
.addFundsOverlay{position:fixed;inset:0;z-index:180;background:rgba(4,11,16,.72);display:grid;place-items:center;padding:24px;backdrop-filter:blur(2px)}
.addFundsModal{width:min(540px,calc(100vw - 32px));max-height:calc(100vh - 36px);overflow:auto;background:#18242e;border:1px solid #283844;border-radius:10px;box-shadow:0 24px 70px rgba(0,0,0,.5);color:#d7e0e6}
.addFundsHeader{display:flex;align-items:flex-start;justify-content:space-between;padding:22px 28px 16px;border-bottom:1px solid #24333e}.addFundsHeader h2{margin:0;font-size:25px;line-height:1.1;color:#e6ebee}.addFundsHeader p{margin:6px 0 0;font-size:11px;color:#8195a4}.addFundsHeader>button{border:0;background:transparent;color:#9baab5;font-size:32px;line-height:24px;cursor:pointer;padding:0 2px}
.addFundsBody{padding:18px 28px 8px}.addFundsField{display:grid;gap:8px;margin-bottom:16px}.addFundsField>span{display:flex;align-items:center;justify-content:space-between;font-size:12px;color:#c2ccd3}.addFundsField>span b{font-size:11px;font-weight:650;color:#58aef2}.addFundsField>small{margin-top:-2px;color:#778b99;font-size:10px}
.addFundsInputWrap{height:42px;border:1px solid #344858;border-radius:7px;background:#16232c;display:flex;align-items:center;overflow:hidden}.addFundsInputWrap:focus-within{border-color:#4aa9ef;box-shadow:0 0 0 1px rgba(74,169,239,.18)}.addFundsInputWrap input{min-width:0;flex:1;height:100%;border:0;outline:0;background:transparent;color:#dce4e9;padding:0 13px;font-size:13px;font-weight:650}.addFundsInputWrap input:disabled{color:#738a9b;background:#1d2b36}.addFundsInputWrap strong{padding:0 12px;color:#aebbc4;font-size:11px;white-space:nowrap}
.addFundsPercentBox{display:grid;grid-template-columns:1fr;gap:10px;margin-bottom:18px}.addFundsPercentBox>.addFundsInputWrap{width:100%}.addFundsRange{width:100%;accent-color:#23b6ac;cursor:pointer}
.addFundsOrderTabs{display:grid;grid-template-columns:1fr 1fr;border:1px solid #334754;border-radius:7px;overflow:hidden;margin:4px 0 16px}.addFundsOrderTabs button{height:38px;border:0;background:#263846;color:#a9b7c0;font-weight:750;cursor:pointer}.addFundsOrderTabs button+button{border-left:1px solid #334754}.addFundsOrderTabs .addFundsOrderActive{background:#14222c;color:#e4eaee}
.addFundsSummary{margin-top:8px;padding:9px 0 4px;border-top:1px solid #2a3a45}.addFundsSummary p{display:flex;align-items:center;justify-content:space-between;gap:18px;margin:0;padding:8px 0;font-size:11px}.addFundsSummary span{color:#8799a6}.addFundsSummary b{font-size:12px;color:#d2dbe1;text-align:right}
.addFundsFooter{display:grid;grid-template-columns:1fr 1fr;gap:14px;padding:18px 28px 26px}.addFundsFooter button{height:49px;border-radius:7px;border:1px solid #344653;background:#253643;color:#e0e6e9;font-size:15px;font-weight:800;cursor:pointer}.addFundsFooter .addFundsSave{background:#1bada8;border-color:#1bada8;color:#fff}.addFundsFooter .addFundsSave:disabled{opacity:.45;cursor:not-allowed}
@media(max-width:620px){.addFundsOverlay{padding:10px}.addFundsModal{width:100%;max-height:calc(100vh - 20px)}.addFundsHeader,.addFundsBody,.addFundsFooter{padding-left:18px;padding-right:18px}.addFundsHeader h2{font-size:22px}}
`;
}

fs.writeFileSync(traderPath, source);
fs.writeFileSync(cssPath, css);
console.log("Applied single-color DCA PnL bars and 3Commas-style Add Funds modal.");
