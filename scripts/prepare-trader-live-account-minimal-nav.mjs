import fs from "node:fs";
import path from "node:path";

const traderPath = path.join(process.cwd(), "app/trader/TradingAgent.tsx");
let source = fs.readFileSync(traderPath, "utf8");

// Use actual open positions as reserved capital. A running bot's theoretical maximum allocation
// is NOT an account balance reservation until a paper order is actually filled.
const capitalStart = source.indexOf('  const paperCapital = activeSmart.reduce');
const smartPnlStart = source.indexOf('  const smartUnrealized =', capitalStart);
if (capitalStart >= 0 && smartPnlStart > capitalStart) {
  source = source.slice(0, capitalStart)
    + '  const paperCapital = activeSmart.reduce((sum, trade) => sum + trade.amount, 0) + dcaFundsLocked;\n'
    + source.slice(smartPnlStart);
}

// Equity and availability must include the actual DCA ledger as well as SmartTrade live P/L.
source = source.replace(
  '  const accountValue = DEMO_BALANCE + smartUnrealized;\n  const dayChangePct = smartUnrealized / DEMO_BALANCE * 100;\n  const freeCapital = Math.max(0, DEMO_BALANCE - paperCapital);',
  [
    '  const paperRealizedPnl = dcaRealized;',
    '  const paperUnrealizedPnl = smartUnrealized + activeDcaUnrealized;',
    '  const accountValue = DEMO_BALANCE + paperRealizedPnl + paperUnrealizedPnl;',
    '  const dayChangePct = DEMO_BALANCE > 0 ? (paperRealizedPnl + paperUnrealizedPnl) / DEMO_BALANCE * 100 : 0;',
    '  const freeCapital = Math.max(0, DEMO_BALANCE + paperRealizedPnl - paperCapital);',
  ].join('\n')
);

// SmartTrade percentage shortcuts should use actual free paper cash, not the original fixed balance.
source = source.replace(
  '    if (price > 0) setSmartUnits(floorToStep((DEMO_BALANCE * value / 100) / price, selectedMarket?.stepSize || 0));',
  '    if (price > 0) setSmartUnits(floorToStep((freeCapital * value / 100) / price, selectedMarket?.stepSize || 0));'
);

// DCA balances: use the unified account ledger instead of theoretical bot capacity.
source = source.replaceAll('    const available = Math.max(0, DEMO_BALANCE - paperCapital);', '    const available = freeCapital;');
source = source.replaceAll('<td>{compactMoney(dcaFundsLocked)}</td><td>{compactMoney(available)}</td>', '<td>{compactMoney(paperCapital)}</td><td>{compactMoney(available)}</td>');

// Dashboard DCA card should be live rather than hard-coded zeroes.
source = source.replace(
  '<div className={styles.moduleLine}><span>Today PnL</span><b>$0.00</b></div><div className={styles.moduleLine}><span>PnL</span><b className={styles.greenText}>$0.00</b></div>',
  '<div className={styles.moduleLine}><span>Live uPnL</span><b className={activeDcaUnrealized >= 0 ? styles.greenText : styles.redText}>{compactMoney(activeDcaUnrealized)}</b></div><div className={styles.moduleLine}><span>Total PnL</span><b className={(dcaRealized + activeDcaUnrealized) >= 0 ? styles.greenText : styles.redText}>{compactMoney(dcaRealized + activeDcaUnrealized)}</b></div>'
);

// DCA bot overview analytics should reflect the real DCA ledger.
source = source.replace(
  '<section><span>PnL</span><strong className={styles.greenText}>$0.00</strong><small>Paper mode</small></section>',
  '<section><span>PnL</span><strong className={(dcaRealized + activeDcaUnrealized) >= 0 ? styles.greenText : styles.redText}>{compactMoney(dcaRealized + activeDcaUnrealized)}</strong><small>Live paper ledger</small></section>'
);

// Keep the full Binance universe fresh enough that account statistics throughout the UI react promptly.
const marketRefreshMarker = '// Refresh the full Binance Spot universe for background portfolio/bot valuation.';
const marketRefreshIndex = source.indexOf(marketRefreshMarker);
if (marketRefreshIndex >= 0) {
  const refreshEnd = source.indexOf('  }, []);', marketRefreshIndex);
  if (refreshEnd > marketRefreshIndex) {
    const block = source.slice(marketRefreshIndex, refreshEnd);
    const faster = block.replace('}, 15000);', '}, 5000);');
    source = source.slice(0, marketRefreshIndex) + faster + source.slice(refreshEnd);
  }
}

// Make all visible account refresh controls perform an immediate live Binance refresh.
source = source.replaceAll('<div className={styles.cardHeader}><h2>Total balance</h2><span>↻</span></div>', '<div className={styles.cardHeader}><h2>Total balance</h2><button type="button" onClick={() => { void refreshDcaMarketsNow(); }}>↻ Refresh</button></div>');
source = source.replaceAll('<div className={styles.cardHeader}><h2>Statistics</h2><span>↻</span></div>', '<div className={styles.cardHeader}><h2>Statistics</h2><button type="button" onClick={() => { void refreshDcaMarketsNow(); }}>↻ Refresh</button></div>');
source = source.replaceAll('<div className={styles.exchangeCardHead}><span className={styles.exchangeIcon}>◆</span><div><h3>Paper Account 1001863</h3><p>Binance Spot account simulator</p></div><button>↻</button></div>', '<div className={styles.exchangeCardHead}><span className={styles.exchangeIcon}>◆</span><div><h3>Paper Account 1001863</h3><p>Binance Spot account simulator</p></div><button type="button" onClick={() => { void refreshDcaMarketsNow(); }}>↻</button></div>');

// Keep only the four product areas requested by the user in the sidebar.
const sidebarStart = source.indexOf('    <aside className={styles.sidebar}><nav className={styles.nav}>');
const sidebarEndToken = '</nav><div className={styles.sidebarPromo}>';
const promoStart = source.indexOf(sidebarEndToken, sidebarStart);
const asideEnd = source.indexOf('</aside>', promoStart);
if (sidebarStart >= 0 && promoStart > sidebarStart && asideEnd > promoStart) {
  const minimalSidebar = [
    '    <aside className={styles.sidebar}><nav className={styles.nav}>',
    '      <button className={section === "Dashboard" ? styles.navActive : ""} onClick={() => openSection("Dashboard")}><span>{navGlyph("Dashboard")}</span>Dashboard</button>',
    '      <button className={section === "My Portfolio" ? styles.navActive : ""} onClick={() => openSection("My Portfolio")}><span>{navGlyph("My Portfolio")}</span>My Portfolio</button>',
    '      <button className={section === "Smart Trades" ? styles.navActive : ""} onClick={() => openSection("Smart Trades")}><span>{navGlyph("Smart Trades")}</span>SmartTrade</button>',
    '      <button className={section === "DCA bots" ? styles.navActive : ""} onClick={() => openSection("DCA bots")}><span>{navGlyph("DCA bots")}</span>DCA Bot<small>⌄</small></button>',
    '      {section === "DCA bots" && <div className={styles.dcaSubnav}><button className={dcaView === "active" ? styles.dcaSubnavActive : ""} onClick={() => setDcaView("active")}>Active trades <span>{activeDcaTrades.length}</span></button><button className={dcaView === "closed" ? styles.dcaSubnavActive : ""} onClick={() => setDcaView("closed")}>Closed trades <span>{closedDcaTrades.length}</span></button></div>}',
    '    </nav></aside>',
  ].join('\n');
  source = source.slice(0, sidebarStart) + minimalSidebar + source.slice(asideEnd + '</aside>'.length);
}

// Safety checks: this is a final product cleanup and should fail loudly if transforms drift.
if (source.includes('>AI Assistant<') || source.includes('>Strategy gallery<') || source.includes('>Control Panel<') || source.includes('>Signal Bot<') || source.includes('>GRID Bot<') || source.includes('>Terminal<') || source.includes('>Subscriptions<')) {
  throw new Error('Trader sidebar cleanup did not remove all deprecated navigation items.');
}
if (!source.includes('const paperRealizedPnl = dcaRealized;')) throw new Error('Unified live paper account metrics were not installed.');
if (!source.includes('void refreshDcaMarketsNow();')) throw new Error('Live account refresh handlers are missing.');

fs.writeFileSync(traderPath, source);
console.log('Unified live paper account statistics and reduced trader sidebar to Dashboard, Portfolio, SmartTrade and DCA Bot.');
