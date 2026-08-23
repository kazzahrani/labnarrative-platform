import fs from "node:fs";
import path from "node:path";

const traderPath = path.join(process.cwd(), "app/trader/TradingAgent.tsx");
const cssPath = path.join(process.cwd(), "app/trader/trader.module.css");
let source = fs.readFileSync(traderPath, "utf8");
let css = fs.readFileSync(cssPath, "utf8");

// Build a reconciled live allocation from actual paper cash + open SmartTrade + open DCA positions.
const allocationAnchor = '  const dcaFundsLocked = activeDcaTrades.reduce((sum, trade) => sum + trade.invested, 0);';
if (source.includes(allocationAnchor) && !source.includes('LIVE PORTFOLIO ALLOCATION V1')) {
  const allocationLines = [
    allocationAnchor,
    '',
    '  // LIVE PORTFOLIO ALLOCATION V1 — one source of truth for My Portfolio and its donut.',
    '  const portfolioHoldingMap = new Map<string, { symbol: string; value: number; quantity: number }>();',
    '  const addPortfolioHolding = (symbol: string, value: number, quantity: number) => {',
    '    if (!Number.isFinite(value) || value <= 0) return;',
    '    const current = portfolioHoldingMap.get(symbol) ?? { symbol, value: 0, quantity: 0 };',
    '    portfolioHoldingMap.set(symbol, { symbol, value: current.value + value, quantity: current.quantity + (Number.isFinite(quantity) ? quantity : 0) });',
    '  };',
    '  addPortfolioHolding("USDT", freeCapital, freeCapital);',
    '  activeSmart.forEach((trade) => {',
    '    const symbol = trade.pair.split("/")[0];',
    '    const currentPrice = markets.find((market) => market.symbol === symbol)?.price ?? trade.entryPrice;',
    '    if (!currentPrice || !trade.entryPrice) return;',
    '    const direction = trade.side === "Buy" ? 1 : -1;',
    '    const pnl = ((currentPrice - trade.entryPrice) / trade.entryPrice) * trade.amount * direction;',
    '    const markedValue = Math.max(0, trade.amount + pnl);',
    '    const quantity = currentPrice > 0 ? markedValue / currentPrice : 0;',
    '    addPortfolioHolding(symbol, markedValue, quantity);',
    '  });',
    '  activeDcaTrades.forEach((trade) => {',
    '    const symbol = trade.pair.split("/")[0];',
    '    const currentPrice = dcaTradePrice(trade);',
    '    addPortfolioHolding(symbol, Math.max(0, currentPrice * trade.quantity), trade.quantity);',
    '  });',
    '  const portfolioHoldingsRaw = Array.from(portfolioHoldingMap.values()).filter((holding) => holding.value > 0.005);',
    '  const portfolioAllocationTotal = portfolioHoldingsRaw.reduce((sum, holding) => sum + holding.value, 0);',
    '  const portfolioHoldings = portfolioHoldingsRaw',
    '    .map((holding) => ({ ...holding, percent: portfolioAllocationTotal > 0 ? holding.value / portfolioAllocationTotal * 100 : 0 }))',
    '    .sort((a, b) => a.symbol === "USDT" ? -1 : b.symbol === "USDT" ? 1 : b.value - a.value);',
    '  const portfolioPalette = ["#20c7bd", "#4da3ff", "#f7a63b", "#a782ff", "#ef6f91", "#62d26f", "#d8c55a", "#6ec8e8", "#c87be8", "#9da9b5"];',
    '  let portfolioCursor = 0;',
    '  const portfolioGradientParts = portfolioHoldings.map((holding, index) => {',
    '    const start = portfolioCursor;',
    '    const end = portfolioCursor + holding.percent;',
    '    portfolioCursor = end;',
    '    return `${portfolioPalette[index % portfolioPalette.length]} ${start.toFixed(3)}% ${end.toFixed(3)}%`;',
    '  });',
    '  const portfolioGradient = portfolioGradientParts.length ? `conic-gradient(${portfolioGradientParts.join(", ")})` : "conic-gradient(#2a3944 0 100%)";',
    '  const portfolioLivePnl = paperRealizedPnl + paperUnrealizedPnl;',
    '  const portfolioAssetCount = portfolioHoldings.filter((holding) => holding.symbol !== "USDT").length;',
  ];
  source = source.replace(allocationAnchor, allocationLines.join("\n"));
}

// Replace the decorative portfolio page with a live, reconciled account/allocation view.
const portfolioStart = source.indexOf('  const portfolio = (');
const portfolioEnd = source.indexOf('  const smartList = (', portfolioStart);
if (portfolioStart >= 0 && portfolioEnd > portfolioStart) {
  const portfolio = [
    '  const portfolio = (',
    '    <div className={styles.pageContent}>',
    '      <div className={styles.pageHeading}><div><span className={styles.eyebrow}>MY PORTFOLIO</span><h1>My Paper account</h1></div><button className={styles.primaryButton} type="button" onClick={() => { void refreshDcaMarketsNow(); }}>↻ Refresh live data</button></div>',
    '      <section className={`${styles.card} ${styles.statisticsCard}`}>',
    '        <div className={styles.cardHeader}><h2>Live account statistics</h2><button type="button" onClick={() => { void refreshDcaMarketsNow(); }}>↻ Refresh</button></div>',
    '        <div className={styles.livePortfolioGrid}>',
    '          <div className={styles.livePortfolioDonutColumn}>',
    '            <div className={styles.livePortfolioDonut} style={{ background: portfolioGradient }}><div className={styles.livePortfolioDonutInner}><span>Assets</span><strong>{portfolioAssetCount}</strong><small>{portfolioHoldings.length} incl. cash</small></div></div>',
    '            <div className={styles.livePortfolioLegend}>{portfolioHoldings.map((holding, index) => <div key={holding.symbol}><i style={{ backgroundColor: portfolioPalette[index % portfolioPalette.length] }}/><span>{holding.symbol}</span><b>{holding.percent.toFixed(2)}%</b></div>)}</div>',
    '          </div>',
    '          <div className={styles.livePortfolioNumbers}>',
    '            <div><span>Total equity</span><strong>{compactMoney(accountValue)}</strong></div>',
    '            <div><span>Live PnL</span><strong className={portfolioLivePnl >= 0 ? styles.greenText : styles.redText}>{compactMoney(portfolioLivePnl)}</strong><small className={dayChangePct >= 0 ? styles.greenText : styles.redText}>{pct(dayChangePct)}</small></div>',
    '            <div><span>Reserved in open trades</span><strong>{compactMoney(paperCapital)}</strong></div>',
    '            <div><span>Available USDT</span><strong>{compactMoney(freeCapital)}</strong></div>',
    '          </div>',
    '        </div>',
    '      </section>',
    '      <div className={styles.exchangeDivider}>LIVE HOLDINGS</div>',
    '      <section className={styles.exchangeCard}>',
    '        <div className={styles.exchangeCardHead}><span className={styles.exchangeIcon}>◆</span><div><h3>Paper Account 1001863</h3><p>Binance Spot paper account · marked to live Binance prices</p></div><button type="button" onClick={() => { void refreshDcaMarketsNow(); }}>↻</button></div>',
    '        <div className={styles.livePortfolioTable}>',
    '          <div className={styles.livePortfolioTableHead}><span>Asset</span><span>Quantity</span><span>Live value</span><span>Allocation</span></div>',
    '          {portfolioHoldings.map((holding) => <div className={styles.livePortfolioTableRow} key={holding.symbol}><strong>{holding.symbol}</strong><span>{holding.symbol === "USDT" ? holding.quantity.toFixed(2) : holding.quantity.toLocaleString("en-US", { maximumFractionDigits: 8 })}</span><span>{compactMoney(holding.value)}</span><b>{holding.percent.toFixed(2)}%</b></div>)}',
    '        </div>',
    '        <div className={styles.exchangeStats}><div><span>Total</span><b>{compactMoney(accountValue)}</b></div><div><span>Reserved</span><b>{compactMoney(paperCapital)}</b></div><div><span>Available</span><b>{compactMoney(freeCapital)}</b></div></div>',
    '        <button className={styles.tradeAccountButton} onClick={() => { setSection("Smart Trades"); setSmartView("create"); }}>Trade</button>',
    '      </section>',
    '    </div>',
    '  );',
    '',
  ].join("\n");
  source = source.slice(0, portfolioStart) + portfolio + source.slice(portfolioEnd);
}

if (!css.includes('.livePortfolioGrid')) {
  css += `\n\n/* Live My Portfolio */\n.livePortfolioGrid{display:grid;grid-template-columns:minmax(260px,420px) 1fr;gap:34px;padding:28px;align-items:center}.livePortfolioDonutColumn{display:grid;grid-template-columns:190px 1fr;gap:24px;align-items:center}.livePortfolioDonut{width:180px;height:180px;border-radius:50%;display:grid;place-items:center;box-shadow:inset 0 0 0 1px rgba(255,255,255,.08)}.livePortfolioDonutInner{width:122px;height:122px;border-radius:50%;background:#14232c;display:flex;flex-direction:column;align-items:center;justify-content:center;border:1px solid rgba(255,255,255,.08)}.livePortfolioDonutInner span,.livePortfolioDonutInner small{color:#8fa8b8;font-size:12px}.livePortfolioDonutInner strong{font-size:28px;color:#edf4f7;margin:2px 0}.livePortfolioLegend{display:flex;flex-direction:column;gap:9px;max-height:190px;overflow:auto;padding-right:6px}.livePortfolioLegend div{display:grid;grid-template-columns:10px 1fr auto;gap:9px;align-items:center;font-size:13px}.livePortfolioLegend i{width:9px;height:9px;border-radius:50%}.livePortfolioLegend span{color:#b7c8d2}.livePortfolioLegend b{color:#e7f0f4}.livePortfolioNumbers{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.livePortfolioNumbers>div{background:#12212a;border:1px solid #263a46;border-radius:8px;padding:18px;display:flex;flex-direction:column;gap:6px}.livePortfolioNumbers span{font-size:12px;color:#88a1b1}.livePortfolioNumbers strong{font-size:21px;color:#e8f0f4}.livePortfolioNumbers small{font-size:12px}.livePortfolioTable{border:1px solid #263a46;border-radius:8px;overflow:hidden;margin:18px 0}.livePortfolioTableHead,.livePortfolioTableRow{display:grid;grid-template-columns:1.1fr 1.4fr 1.2fr .8fr;gap:16px;align-items:center;padding:12px 14px}.livePortfolioTableHead{background:#142630;color:#87a1b1;font-size:12px;font-weight:700}.livePortfolioTableRow{border-top:1px solid #243742;color:#a9bfcc;font-size:13px}.livePortfolioTableRow strong{color:#61b9ff}.livePortfolioTableRow b{text-align:right;color:#dce8ed}.livePortfolioTableHead span:last-child{text-align:right}@media(max-width:900px){.livePortfolioGrid{grid-template-columns:1fr}.livePortfolioDonutColumn{grid-template-columns:160px 1fr}.livePortfolioDonut{width:150px;height:150px}.livePortfolioDonutInner{width:98px;height:98px}.livePortfolioNumbers{grid-template-columns:1fr 1fr}.livePortfolioTableHead,.livePortfolioTableRow{grid-template-columns:1fr 1fr}.livePortfolioTableHead span:nth-child(2),.livePortfolioTableRow span:nth-child(2){display:none}}\n`;
}

if (!source.includes('LIVE PORTFOLIO ALLOCATION V1')) throw new Error('Live portfolio allocation model was not installed.');
if (!source.includes('style={{ background: portfolioGradient }}')) throw new Error('Live portfolio donut was not installed.');
if (!source.includes('LIVE HOLDINGS')) throw new Error('Live portfolio holdings table was not installed.');

fs.writeFileSync(traderPath, source);
fs.writeFileSync(cssPath, css);
console.log('Prepared live My Portfolio statistics, holdings, and allocation donut.');
