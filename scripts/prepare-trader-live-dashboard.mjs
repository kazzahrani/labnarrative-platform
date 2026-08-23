import fs from "node:fs";
import path from "node:path";

const traderPath = path.join(process.cwd(), "app/trader/TradingAgent.tsx");
const cssPath = path.join(process.cwd(), "app/trader/trader.module.css");
let source = fs.readFileSync(traderPath, "utf8");
let css = fs.readFileSync(cssPath, "utf8");

// Replace the legacy/demo dashboard with a live overview driven by the same
// unified paper-account ledger used by My Portfolio, DCA and SmartTrade.
const dashboardStart = source.indexOf('  const dashboard = (');
const dashboardEnd = source.indexOf('  const portfolio = (', dashboardStart);
if (dashboardStart >= 0 && dashboardEnd > dashboardStart) {
  const dashboard = [
    '  const dashboard = (',
    '    <div className={styles.pageContent}>',
    '      <div className={styles.pageHeading}><div><span className={styles.eyebrow}>TRADING OVERVIEW</span><h1>Dashboard</h1></div><button className={styles.primaryButton} type="button" onClick={() => { void refreshDcaMarketsNow(); }}>↻ Refresh live data</button></div>',
    '',
    '      <div className={styles.liveDashboardMetrics}>',
    '        <section className={styles.liveMetricCard}><span>Total equity</span><strong>{compactMoney(accountValue)}</strong><small className={dayChangePct >= 0 ? styles.greenText : styles.redText}>{pct(dayChangePct)} live PnL</small></section>',
    '        <section className={styles.liveMetricCard}><span>Available USDT</span><strong>{compactMoney(freeCapital)}</strong><small>{compactMoney(paperCapital)} reserved</small></section>',
    '        <section className={styles.liveMetricCard}><span>Live PnL</span><strong className={portfolioLivePnl >= 0 ? styles.greenText : styles.redText}>{compactMoney(portfolioLivePnl)}</strong><small>Realized {compactMoney(paperRealizedPnl)} · uPnL {compactMoney(paperUnrealizedPnl)}</small></section>',
    '        <section className={styles.liveMetricCard}><span>Open positions</span><strong>{activeDcaTrades.length + activeSmart.length}</strong><small>{activeDcaTrades.length} DCA · {activeSmart.length} SmartTrade</small></section>',
    '      </div>',
    '',
    '      <div className={styles.liveDashboardMainGrid}>',
    '        <section className={`${styles.card} ${styles.liveDashboardPanel}`}>',
    '          <div className={styles.cardHeader}><h2>Portfolio allocation</h2><button type="button" onClick={() => setSection("My Portfolio")}>Open portfolio</button></div>',
    '          <div className={styles.liveDashboardAllocation}>',
    '            <div className={styles.liveDashboardDonut} style={{ background: portfolioGradient }}><div><span>Equity</span><strong>{compactMoney(accountValue)}</strong><small>{portfolioAssetCount} assets</small></div></div>',
    '            <div className={styles.liveDashboardLegend}>{portfolioHoldings.slice(0, 7).map((holding, index) => <div key={holding.symbol}><i style={{ backgroundColor: portfolioPalette[index % portfolioPalette.length] }}/><span>{holding.symbol}</span><b>{compactMoney(holding.value)}</b><small>{holding.percent.toFixed(2)}%</small></div>)}</div>',
    '          </div>',
    '        </section>',
    '',
    '        <section className={`${styles.card} ${styles.liveDashboardPanel}`}>',
    '          <div className={styles.cardHeader}><h2>DCA Bot</h2><button type="button" onClick={() => { setSection("DCA bots"); setDcaView("list"); }}>Open DCA</button></div>',
    '          <div className={styles.liveDashboardRows}>',
    '            <div><span>Running bots</span><b>{runningBots.length}</b></div>',
    '            <div><span>Active trades</span><b>{activeDcaTrades.length}</b></div>',
    '            <div><span>Closed trades</span><b>{closedDcaTrades.length}</b></div>',
    '            <div><span>Funds locked</span><b>{compactMoney(dcaFundsLocked)}</b></div>',
    '            <div><span>Live uPnL</span><b className={activeDcaUnrealized >= 0 ? styles.greenText : styles.redText}>{compactMoney(activeDcaUnrealized)}</b></div>',
    '            <div><span>Total DCA PnL</span><b className={(dcaRealized + activeDcaUnrealized) >= 0 ? styles.greenText : styles.redText}>{compactMoney(dcaRealized + activeDcaUnrealized)}</b></div>',
    '          </div>',
    '        </section>',
    '',
    '        <section className={`${styles.card} ${styles.liveDashboardPanel}`}>',
    '          <div className={styles.cardHeader}><h2>SmartTrade</h2><button type="button" onClick={() => { setSection("Smart Trades"); setSmartView("list"); }}>Open SmartTrade</button></div>',
    '          <div className={styles.liveDashboardRows}>',
    '            <div><span>Active trades</span><b>{activeSmart.length}</b></div>',
    '            <div><span>Closed trades</span><b>{closedSmart.length}</b></div>',
    '            <div><span>Capital in trades</span><b>{compactMoney(activeSmart.reduce((sum, trade) => sum + trade.amount, 0))}</b></div>',
    '            <div><span>Live uPnL</span><b className={smartUnrealized >= 0 ? styles.greenText : styles.redText}>{compactMoney(smartUnrealized)}</b></div>',
    '          </div>',
    '        </section>',
    '',
    '        <section className={`${styles.card} ${styles.liveDashboardPanel}`}>',
    '          <div className={styles.cardHeader}><h2>Paper account</h2><button type="button" onClick={() => { void refreshDcaMarketsNow(); }}>↻ Refresh</button></div>',
    '          <div className={styles.liveDashboardRows}>',
    '            <div><span>Account</span><b>1001863</b></div>',
    '            <div><span>Mode</span><b>Paper</b></div>',
    '            <div><span>Total equity</span><b>{compactMoney(accountValue)}</b></div>',
    '            <div><span>Available</span><b>{compactMoney(freeCapital)}</b></div>',
    '            <div><span>Reserved</span><b>{compactMoney(paperCapital)}</b></div>',
    '            <div><span>Assets held</span><b>{portfolioAssetCount}</b></div>',
    '          </div>',
    '        </section>',
    '      </div>',
    '    </div>',
    '  );',
    '',
  ].join("\n");
  source = source.slice(0, dashboardStart) + dashboard + source.slice(dashboardEnd);
}

if (!css.includes('.liveDashboardMetrics')) {
  css += `\n\n/* Live Dashboard */\n.liveDashboardMetrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-bottom:16px}.liveMetricCard{background:#142630;border:1px solid #29404c;border-radius:8px;padding:18px;display:flex;flex-direction:column;gap:7px;min-height:112px}.liveMetricCard>span{color:#8fa7b5;font-size:12px;font-weight:650}.liveMetricCard>strong{color:#edf5f7;font-size:24px;line-height:1.15}.liveMetricCard>small{color:#91a8b5;font-size:12px;line-height:1.45}.liveDashboardMainGrid{display:grid;grid-template-columns:1.35fr 1fr;gap:16px}.liveDashboardPanel{min-height:250px}.liveDashboardAllocation{display:grid;grid-template-columns:220px 1fr;gap:26px;padding:24px;align-items:center}.liveDashboardDonut{width:200px;height:200px;border-radius:50%;display:grid;place-items:center}.liveDashboardDonut>div{width:138px;height:138px;border-radius:50%;background:#14232c;border:1px solid rgba(255,255,255,.08);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}.liveDashboardDonut span,.liveDashboardDonut small{color:#8fa7b5;font-size:11px}.liveDashboardDonut strong{font-size:18px;color:#eef4f6;margin:4px 0}.liveDashboardLegend{display:flex;flex-direction:column;gap:10px}.liveDashboardLegend>div{display:grid;grid-template-columns:10px .7fr 1fr auto;gap:9px;align-items:center}.liveDashboardLegend i{width:9px;height:9px;border-radius:50%}.liveDashboardLegend span{color:#bfd0d8;font-size:13px}.liveDashboardLegend b{color:#edf4f6;font-size:13px;text-align:right}.liveDashboardLegend small{color:#829aaa;font-size:11px;min-width:52px;text-align:right}.liveDashboardRows{padding:8px 18px 18px}.liveDashboardRows>div{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 2px;border-bottom:1px solid #243943}.liveDashboardRows>div:last-child{border-bottom:0}.liveDashboardRows span{color:#8da5b3;font-size:13px}.liveDashboardRows b{color:#e6eff3;font-size:14px;text-align:right}@media(max-width:1120px){.liveDashboardMetrics{grid-template-columns:repeat(2,minmax(0,1fr))}.liveDashboardMainGrid{grid-template-columns:1fr}.liveDashboardAllocation{grid-template-columns:190px 1fr}.liveDashboardDonut{width:170px;height:170px}.liveDashboardDonut>div{width:116px;height:116px}}@media(max-width:680px){.liveDashboardMetrics{grid-template-columns:1fr}.liveDashboardAllocation{grid-template-columns:1fr;justify-items:center}.liveDashboardLegend{width:100%}}\n`;
}

if (!source.includes('TRADING OVERVIEW')) throw new Error('Live dashboard was not installed.');
if (!source.includes('Portfolio allocation')) throw new Error('Dashboard allocation panel is missing.');
if (!source.includes('Total DCA PnL')) throw new Error('Dashboard DCA live statistics are missing.');

fs.writeFileSync(traderPath, source);
fs.writeFileSync(cssPath, css);
console.log('Prepared live Dashboard from the unified paper-account ledger.');
