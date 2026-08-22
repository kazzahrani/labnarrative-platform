import fs from "node:fs";
import path from "node:path";

const traderPath = path.join(process.cwd(), "app/trader/TradingAgent.tsx");
const cssPath = path.join(process.cwd(), "app/trader/trader.module.css");
const klinesPath = path.join(process.cwd(), "app/api/trader/klines/route.ts");
let source = fs.readFileSync(traderPath, "utf8");
let css = fs.readFileSync(cssPath, "utf8");
let klines = fs.readFileSync(klinesPath, "utf8");

// Import the programmable TradingView Lightweight Charts trade viewer.
if (!source.includes('import DcaTradeChart from "./DcaTradeChart";')) {
  source = source.replace(
    'import TradingViewChart from "./TradingViewChart";',
    'import TradingViewChart from "./TradingViewChart";\nimport DcaTradeChart from "./DcaTradeChart";'
  );
}

// Keep the exact execution history needed to draw base orders, averaging fills, and exits.
if (!source.includes('fills?: Array<{ kind: "Base" | "Averaging";')) {
  source = source.replace(
    '  closeReason?: string;\n};',
    '  closeReason?: string;\n  exitPrice?: number;\n  fills?: Array<{ kind: "Base" | "Averaging"; price: number; amount: number; quantity: number; at: string }>;\n};'
  );
}

if (!source.includes('const [selectedTradeChartId, setSelectedTradeChartId]')) {
  source = source.replace(
    '  const [selectedBotId, setSelectedBotId] = useState<string | null>(null);',
    '  const [selectedBotId, setSelectedBotId] = useState<string | null>(null);\n  const [selectedTradeChartId, setSelectedTradeChartId] = useState<string | null>(null);'
  );
}

// Migrate older paper deals. Old deals retain their base entry and average line; all new DCA fills are logged exactly.
source = source.replace(
  '      if (savedDcaTrades) setDcaTrades(JSON.parse(savedDcaTrades));',
  [
    '      if (savedDcaTrades) {',
    '        const parsedTrades = JSON.parse(savedDcaTrades) as DcaTrade[];',
    '        setDcaTrades(parsedTrades.map((trade) => trade.fills?.length ? trade : {',
    '          ...trade,',
    '          exitPrice: trade.exitPrice ?? (trade.status === "Closed" ? trade.lastPrice : undefined),',
    '          fills: [{ kind: "Base", price: trade.entryPrice, amount: trade.averagingFilled === 0 ? trade.invested : 0, quantity: trade.averagingFilled === 0 ? trade.quantity : 0, at: trade.createdAt }],',
    '        }));',
    '      }',
  ].join("\n")
);

// Seed a base-order execution event for every new DCA deal creation path.
source = source.replace(
  'averagingFilled: 0, maxAveraging: bot.maxSafetyOrders, status: "Active", createdAt: now, lastPrice: selectedPrice,',
  'averagingFilled: 0, maxAveraging: bot.maxSafetyOrders, status: "Active", createdAt: now, lastPrice: selectedPrice, fills: [{ kind: "Base", price: selectedPrice, amount: bot.baseOrder, quantity: bot.baseOrder / selectedPrice, at: now }],'
);
source = source.replace(
  'maxAveraging: bot.maxSafetyOrders, status: "Active", createdAt: new Date().toISOString(), lastPrice: triggerPrice,',
  'maxAveraging: bot.maxSafetyOrders, status: "Active", createdAt: new Date().toISOString(), lastPrice: triggerPrice, fills: [{ kind: "Base", price: triggerPrice, amount: bot.baseOrder, quantity, at: new Date().toISOString() }],'
);
source = source.replace(
  'status: "Active", createdAt: now, lastPrice: selectedPrice,\n      }, ...current]);',
  'status: "Active", createdAt: now, lastPrice: selectedPrice, fills: [{ kind: "Base", price: selectedPrice, amount: bot.baseOrder, quantity: bot.baseOrder / selectedPrice, at: now }],\n      }, ...current]);'
);

// Log averaging fills made automatically by the DCA engine.
source = source.replace(
  'return { ...marked, quantity: newQuantity, invested: newInvested, averagePrice: newInvested / newQuantity, averagingFilled: item.averagingFilled + 1 };',
  'return { ...marked, quantity: newQuantity, invested: newInvested, averagePrice: newInvested / newQuantity, averagingFilled: item.averagingFilled + 1, fills: [...(item.fills ?? [{ kind: "Base" as const, price: item.entryPrice, amount: 0, quantity: 0, at: item.createdAt }]), { kind: "Averaging" as const, price: currentPrice, amount: orderAmount, quantity: extraQty, at: new Date().toISOString() }] };'
);

// Log manual Add funds as an averaging fill too.
source = source.replace(
  'return { ...trade, quantity: newQty, invested: newInvested, averagePrice: newInvested / newQty, averagingFilled: Math.min(trade.maxAveraging, trade.averagingFilled + 1) };',
  'return { ...trade, quantity: newQty, invested: newInvested, averagePrice: newInvested / newQty, averagingFilled: Math.min(trade.maxAveraging, trade.averagingFilled + 1), fills: [...(trade.fills ?? [{ kind: "Base" as const, price: trade.entryPrice, amount: 0, quantity: 0, at: trade.createdAt }]), { kind: "Averaging" as const, price: current, amount: addition, quantity: extraQty, at: new Date().toISOString() }] };'
);

// Record exact exit prices for manual closes, TP/SL, and bot deletion.
source = source.replace(
  'return { ...trade, status: "Closed", closedAt: new Date().toISOString(), realizedPnl: dcaTradePnl(trade), closeReason: "Manual close" };',
  'return { ...trade, status: "Closed", closedAt: new Date().toISOString(), realizedPnl: dcaTradePnl(trade), closeReason: "Manual close", exitPrice: dcaTradePrice(trade) };'
);
source = source.replace(
  'if (stopHit || tpHit) return { ...marked, status: "Closed", closedAt: new Date().toISOString(), realizedPnl: (currentPrice - item.averagePrice) * item.quantity, closeReason: stopHit ? "Stop Loss" : "Take Profit" };',
  'if (stopHit || tpHit) return { ...marked, status: "Closed", closedAt: new Date().toISOString(), realizedPnl: (currentPrice - item.averagePrice) * item.quantity, closeReason: stopHit ? "Stop Loss" : "Take Profit", exitPrice: currentPrice };'
);
source = source.replace(
  'return { ...trade, status: "Closed", closedAt, realizedPnl: dcaTradePnl(trade), closeReason: "Bot deleted" };',
  'return { ...trade, status: "Closed", closedAt, realizedPnl: dcaTradePnl(trade), closeReason: "Bot deleted", exitPrice: dcaTradePrice(trade) };'
);

// Make the pair in Active/Closed trades open the trade chart.
source = source.replace(
  '<td><strong>{symbol}/USDT</strong><small>Paper Account 1001863</small></td>',
  '<td><button type="button" className={styles.dcaTradePairLink} onClick={() => setSelectedTradeChartId(trade.id)}>{symbol}/USDT</button><small>Paper Account 1001863</small></td>'
);

// Derive the next DCA level and exit levels for the selected trade chart.
if (!source.includes('const selectedDcaChartTrade =')) {
  const returnAnchor = '  return (\n    <main className={styles.appShell}>';
  const chartState = [
    '  const selectedDcaChartTrade = selectedTradeChartId ? dcaTrades.find((trade) => trade.id === selectedTradeChartId) ?? null : null;',
    '  const selectedDcaChartBot = selectedDcaChartTrade ? dcaBots.find((bot) => bot.id === selectedDcaChartTrade.botId) ?? null : null;',
    '  const selectedDcaNextAveragingPrice = (() => {',
    '    if (!selectedDcaChartTrade || !selectedDcaChartBot || selectedDcaChartTrade.status !== "Active" || selectedDcaChartTrade.averagingFilled >= selectedDcaChartTrade.maxAveraging) return null;',
    '    let cumulativeDeviation = 0;',
    '    let nextStep = selectedDcaChartBot.deviation;',
    '    for (let index = 0; index <= selectedDcaChartTrade.averagingFilled; index += 1) { cumulativeDeviation += nextStep; nextStep *= selectedDcaChartBot.stepScale; }',
    '    return selectedDcaChartTrade.entryPrice * (1 - cumulativeDeviation / 100);',
    '  })();',
    '  const selectedDcaTpPrice = selectedDcaChartTrade && selectedDcaChartBot?.takeProfit ? selectedDcaChartTrade.averagePrice * (1 + selectedDcaChartBot.takeProfit / 100) : null;',
    '  const selectedDcaSlPrice = selectedDcaChartTrade && selectedDcaChartBot?.stopEnabled ? selectedDcaChartTrade.averagePrice * (1 - selectedDcaChartBot.stopPct / 100) : null;',
    '',
  ].join("\n");
  source = source.replace(returnAnchor, chartState + returnAnchor);
}

// Render the chart as a full-screen modal above the trading workspace.
if (!source.includes('<DcaTradeChart pair={selectedDcaChartTrade.pair}')) {
  const endToken = '    </main>\n  );';
  const endIndex = source.lastIndexOf(endToken);
  if (endIndex >= 0) {
    const modal = [
      '      {selectedDcaChartTrade && <DcaTradeChart',
      '        pair={selectedDcaChartTrade.pair}',
      '        status={selectedDcaChartTrade.status}',
      '        entryPrice={selectedDcaChartTrade.entryPrice}',
      '        averagePrice={selectedDcaChartTrade.averagePrice}',
      '        createdAt={selectedDcaChartTrade.createdAt}',
      '        closedAt={selectedDcaChartTrade.closedAt}',
      '        exitPrice={selectedDcaChartTrade.exitPrice ?? (selectedDcaChartTrade.status === "Closed" ? selectedDcaChartTrade.lastPrice : undefined)}',
      '        closeReason={selectedDcaChartTrade.closeReason}',
      '        lastPrice={selectedDcaChartTrade.lastPrice}',
      '        fills={selectedDcaChartTrade.fills}',
      '        takeProfitPrice={selectedDcaTpPrice}',
      '        stopLossPrice={selectedDcaSlPrice}',
      '        nextAveragingPrice={selectedDcaNextAveragingPrice}',
      '        onClose={() => setSelectedTradeChartId(null)}',
      '      />}',
      '',
    ].join("\n");
    source = source.slice(0, endIndex) + modal + source.slice(endIndex);
  }
}

// Trade-chart styling based on the 3Commas modal screenshots.
if (!css.includes('/* DCA TradingView trade chart */')) {
  css += `
/* DCA TradingView trade chart */
.dcaTradePairLink{appearance:none;border:0;background:transparent;color:#48aefc;font:inherit;font-weight:800;padding:0;cursor:pointer;text-align:left}
.dcaTradePairLink:hover{text-decoration:underline;color:#71c3ff}
.tradeChartOverlay{position:fixed;inset:0;z-index:2000;background:rgba(3,9,14,.83);display:flex;align-items:stretch;justify-content:stretch;padding:14px}
.tradeChartModal{width:100%;height:100%;min-height:620px;background:#111d26;border:1px solid #263945;box-shadow:0 28px 90px rgba(0,0,0,.55);display:grid;grid-template-rows:auto auto 1fr;overflow:hidden}
.tradeChartTopbar{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid #243540;background:#14212a}
.tradeChartTopbar h2{margin:0;font-size:26px;color:#c8d2da}.tradeChartTopbar p{margin:3px 0 0;color:#8397a7;font-size:12px}.tradeChartTopbar>button{border:0;background:transparent;color:#b9c8d2;font-size:38px;line-height:1;cursor:pointer;padding:0 4px}
.tradeChartToolbar{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:8px 14px;background:#111a26;border-bottom:1px solid #263545}
.tradeChartIntervals{display:flex;gap:4px}.tradeChartIntervals button{border:0;background:transparent;color:#8f9eae;padding:7px 10px;cursor:pointer;border-bottom:2px solid transparent}.tradeChartIntervals button:hover{color:#d0d7df}.tradeChartIntervalActive{color:#fff!important;border-bottom-color:#14b8a6!important}
.tradeChartLegend{display:flex;align-items:center;gap:15px;flex-wrap:wrap;color:#9cacb9;font-size:12px}.tradeChartBuyDot{width:8px;height:8px;border-radius:50%;display:inline-block;background:#11d7c0;margin-right:4px}
.tradeChartBody{position:relative;min-height:0;background:#111a26}.tradeChartCanvas{position:absolute;inset:0}.tradeChartState{position:absolute;z-index:3;left:50%;top:50%;transform:translate(-50%,-50%);padding:10px 14px;border:1px solid #334654;background:#162631;color:#b7c5cf;border-radius:6px}
@media(max-width:900px){.tradeChartOverlay{padding:0}.tradeChartModal{min-height:100vh;border:0}.tradeChartToolbar{align-items:flex-start;flex-direction:column}.tradeChartLegend{font-size:11px}.tradeChartTopbar h2{font-size:22px}}
`;
}

// Let the existing Binance kline endpoint request a specific trade window instead of only the latest 1000 candles.
if (!klines.includes('TRADE_CHART_RANGE')) {
  klines = klines.replace(
    '  const limit = Math.max(1, Math.min(1000, Number.isFinite(rawLimit) ? Math.round(rawLimit) : 500));',
    '  const limit = Math.max(1, Math.min(1000, Number.isFinite(rawLimit) ? Math.round(rawLimit) : 500));\n  // TRADE_CHART_RANGE\n  const rawStartTime = request.nextUrl.searchParams.get("startTime");\n  const rawEndTime = request.nextUrl.searchParams.get("endTime");\n  const startTime = rawStartTime && /^\\d+$/.test(rawStartTime) ? Number(rawStartTime) : null;\n  const endTime = rawEndTime && /^\\d+$/.test(rawEndTime) ? Number(rawEndTime) : null;'
  );
  klines = klines.replace(
    '    const response = await fetch(`${BINANCE_DATA}/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&limit=${limit}`, {',
    '    const params = new URLSearchParams({ symbol, interval, limit: String(limit) });\n    if (startTime != null) params.set("startTime", String(startTime));\n    if (endTime != null) params.set("endTime", String(endTime));\n    const response = await fetch(`${BINANCE_DATA}/api/v3/klines?${params.toString()}`, {'
  );
}

fs.writeFileSync(traderPath, source);
fs.writeFileSync(cssPath, css);
fs.writeFileSync(klinesPath, klines);
console.log("Enabled clickable DCA trade charts with exact entry/DCA/exit logging and ranged Binance candles.");
