import fs from "node:fs";
import path from "node:path";

const traderPath = path.join(process.cwd(), "app/trader/TradingAgent.tsx");
const cssPath = path.join(process.cwd(), "app/trader/trader.module.css");
let source = fs.readFileSync(traderPath, "utf8");
let css = fs.readFileSync(cssPath, "utf8");

if (!source.includes("smartLedgerSessionStartedAt")) {
  const stateAnchor = '  const [smartTrades, setSmartTrades] = useState<SmartTrade[]>([]);';
  if (!source.includes(stateAnchor)) throw new Error("Could not locate SmartTrade state.");
  source = source.replace(
    stateAnchor,
    stateAnchor + '\n  const [smartLedgerSessionStartedAt] = useState(() => Date.now());'
  );
}

if (!source.includes("recentlyClosedSmart")) {
  const realizedAnchor = '  const smartRealized = smartTrades.reduce((sum, trade) => sum + (trade.realizedPnl ?? 0), 0);';
  if (!source.includes(realizedAnchor)) throw new Error("Could not locate SmartTrade realized ledger.");
  source = source.replace(
    realizedAnchor,
    realizedAnchor + '\n  const recentlyClosedSmart = closedSmart.filter((trade) => trade.closedAt && new Date(trade.closedAt).getTime() >= smartLedgerSessionStartedAt);'
  );
}

source = source.replace(
  '    const source = smartTab === "Active" ? activeSmart : closedSmart;',
  '    const source = smartTab === "Active" ? [...activeSmart, ...recentlyClosedSmart].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) : closedSmart;'
);
source = source.replace(
  '  }, [smartTab, activeSmart, closedSmart, smartSearch, smartPairFilter]);',
  '  }, [smartTab, activeSmart, closedSmart, recentlyClosedSmart, smartSearch, smartPairFilter]);'
);

// SMARTTRADE ACTIONS FINAL V1
// Keep these controls independent from any row/pair click handler and make the UI compact.
// The actual trade functions were installed by the SmartTrade parity transform immediately
// before this script; this final pass makes the visible buttons call those functions directly.
const fullActionCell = '<td>{trade.status === "Active" ? <div className={styles.smartLedgerActions}><button type="button" onClick={() => closeSmartTradeAtMarket(trade.id)}>◉ Close at market price</button><button type="button" onClick={() => openSmartTradeEdit(trade)}>✎ Edit</button><button type="button" onClick={() => openSmartAddFunds(trade)}>＋$ Add funds</button><button type="button" onClick={() => { void refreshSmartTradeNow(trade.id); }}>↻ Refresh</button></div> : <button type="button" className={styles.smartHistoryChartButton} onClick={() => setSelectedSmartTradeChartId(trade.id)}>TV Chart</button>}</td>';
const compactActionCell = '<td>{trade.status === "Active" ? <div className={styles.smartLedgerActions}><button type="button" className={styles.smartActionIcon} data-smart-action="close" data-tooltip="Close at market price" title="Close at market price" aria-label="Close at market price" onMouseDown={(event) => event.stopPropagation()} onClick={(event) => { event.preventDefault(); event.stopPropagation(); closeSmartTradeAtMarket(trade.id); }}>◉</button><button type="button" className={styles.smartActionIcon} data-smart-action="edit" data-tooltip="Edit" title="Edit" aria-label="Edit SmartTrade" onMouseDown={(event) => event.stopPropagation()} onClick={(event) => { event.preventDefault(); event.stopPropagation(); openSmartTradeEdit(trade); }}>✎</button><button type="button" className={styles.smartActionIcon} data-smart-action="funds" data-tooltip="Add funds" title="Add funds" aria-label="Add funds" onMouseDown={(event) => event.stopPropagation()} onClick={(event) => { event.preventDefault(); event.stopPropagation(); openSmartAddFunds(trade); }}>＋$</button><button type="button" className={styles.smartActionIcon} data-smart-action="refresh" data-tooltip="Refresh" title="Refresh" aria-label="Refresh SmartTrade" onMouseDown={(event) => event.stopPropagation()} onClick={(event) => { event.preventDefault(); event.stopPropagation(); void refreshSmartTradeNow(trade.id); }}>↻</button></div> : <button type="button" className={styles.smartHistoryChartButton + " " + styles.smartActionIcon} data-smart-action="chart" data-tooltip="Open chart" title="Open chart" aria-label="Open SmartTrade chart" onMouseDown={(event) => event.stopPropagation()} onClick={(event) => { event.preventDefault(); event.stopPropagation(); setSelectedSmartTradeChartId(trade.id); }}>▥</button>}</td>';
if (source.includes(fullActionCell)) {
  source = source.replace(fullActionCell, compactActionCell);
} else if (!source.includes('data-smart-action="close"')) {
  throw new Error("Could not locate SmartTrade action cell for final wiring.");
}

if (!css.includes("/* SmartTrade compact working actions */")) {
  css += `\n/* SmartTrade compact working actions */\n.smartLedgerActions{position:relative;z-index:20;display:flex;align-items:center;gap:4px;overflow:visible!important;white-space:nowrap}.smartLedgerActions .smartActionIcon,.smartHistoryChartButton.smartActionIcon{position:relative;z-index:21;width:38px;min-width:38px;height:34px;padding:0!important;display:inline-grid;place-items:center;border:1px solid #36505e;border-radius:4px;background:#1a2b35;color:#c3d1d8;font-size:16px;font-weight:700;line-height:1;cursor:pointer;overflow:visible!important;pointer-events:auto!important;user-select:none}.smartLedgerActions .smartActionIcon:hover,.smartHistoryChartButton.smartActionIcon:hover{background:#253c48;color:#fff;border-color:#4a6574}.smartLedgerActions .smartActionIcon[data-smart-action="funds"]{color:#55b5ff}.smartLedgerActions .smartActionIcon[data-smart-action="refresh"]{color:#1dd0b7}.smartLedgerActions .smartActionIcon[data-smart-action="close"]{color:#d8e3e8}.smartActionIcon:after{content:attr(data-tooltip);position:absolute;left:50%;bottom:calc(100% + 8px);transform:translateX(-50%) translateY(3px);z-index:1000;padding:6px 8px;border:1px solid #405762;border-radius:4px;background:#0d1920;color:#e5eef2;font-size:11px;font-weight:600;line-height:1;white-space:nowrap;opacity:0;visibility:hidden;pointer-events:none;box-shadow:0 6px 18px rgba(0,0,0,.35);transition:opacity .12s ease,transform .12s ease}.smartActionIcon:hover:after,.smartActionIcon:focus-visible:after{opacity:1;visibility:visible;transform:translateX(-50%) translateY(0)}.smartLedgerTable td:last-child{overflow:visible!important}.smartLedgerTable tr{overflow:visible!important}@media(max-width:900px){.smartLedgerActions{gap:3px}.smartLedgerActions .smartActionIcon,.smartHistoryChartButton.smartActionIcon{width:34px;min-width:34px;height:32px;font-size:15px}}\n`;
}

if (!source.includes('smartTab === "Active" ? [...activeSmart, ...recentlyClosedSmart]')) throw new Error("SmartTrade Active tab does not retain just-closed rows.");
if (!source.includes('recentlyClosedSmart, smartSearch')) throw new Error("SmartTrade row memo dependencies were not updated.");
if (!source.includes('data-smart-action="close"')) throw new Error("SmartTrade close action was not compacted/wired.");
if (!source.includes('data-smart-action="edit"')) throw new Error("SmartTrade edit action was not compacted/wired.");
if (!source.includes('data-smart-action="funds"')) throw new Error("SmartTrade add-funds action was not compacted/wired.");
if (!source.includes('data-smart-action="refresh"')) throw new Error("SmartTrade refresh action was not compacted/wired.");
for (const token of ['const closeSmartTradeAtMarket =', 'const openSmartTradeEdit =', 'const openSmartAddFunds =', 'const refreshSmartTradeNow =']) {
  if (!source.includes(token)) throw new Error(`Missing SmartTrade action handler: ${token}`);
}

fs.writeFileSync(traderPath, source);
fs.writeFileSync(cssPath, css);
console.log("Fixed SmartTrade actions, blocked row-click interference, and converted controls to icon-only hover tooltips.");
