import fs from "node:fs";
import path from "node:path";

const traderPath = path.join(process.cwd(), "app/trader/TradingAgent.tsx");
let source = fs.readFileSync(traderPath, "utf8");

// DCA-ONLY PRODUCT MODE
// SmartTrade is intentionally parked for now. Preserve its localStorage data/code so no
// historical paper data is destroyed, but remove every product entry point and exclude
// SmartTrade positions/PnL from the visible paper account ledger.

source = source.replace(
  'const NAV: Section[] = ["Dashboard", "My Portfolio", "DCA bots", "Smart Trades"];',
  'const NAV: Section[] = ["Dashboard", "My Portfolio", "DCA bots"];'
);

// Sidebar: remove the SmartTrade product entry point.
source = source.replace(
  '      <button className={section === "Smart Trades" ? styles.navActive : ""} onClick={() => openSection("Smart Trades")}><span>{navGlyph("Smart Trades")}</span>SmartTrade</button>\n',
  ''
);

// The paper account is DCA-only while SmartTrade is parked.
source = source.replace(
  '  const paperCapital = activeSmart.reduce((sum, trade) => sum + trade.amount, 0) + dcaFundsLocked;',
  '  const paperCapital = dcaFundsLocked;'
);
source = source.replace(
  '  const paperRealizedPnl = dcaRealized + smartRealized;',
  '  const paperRealizedPnl = dcaRealized;'
);
source = source.replace(
  '  const paperUnrealizedPnl = smartUnrealized + activeDcaUnrealized;',
  '  const paperUnrealizedPnl = activeDcaUnrealized;'
);

// Portfolio allocation: ignore parked SmartTrade positions without deleting their saved data.
source = source.replace(
  /  activeSmart\.forEach\(\(trade\) => \{[\s\S]*?\n  \}\);\n  activeDcaTrades\.forEach/,
  '  activeDcaTrades.forEach'
);

// Dashboard top-line metrics should describe DCA only.
source = source.replace(
  '<section className={styles.liveMetricCard}><span>Open positions</span><strong>{activeDcaTrades.length + activeSmart.length}</strong><small>{activeDcaTrades.length} DCA · {activeSmart.length} SmartTrade</small></section>',
  '<section className={styles.liveMetricCard}><span>Open positions</span><strong>{activeDcaTrades.length}</strong><small>DCA active trades</small></section>'
);

// Remove the dedicated SmartTrade dashboard panel while preserving the DCA and account panels.
source = source.replace(
  /\n        <section className=\{`\$\{styles\.card\} \$\{styles\.liveDashboardPanel\}`\}>\n          <div className=\{styles\.cardHeader\}><h2>SmartTrade<\/h2>[\s\S]*?\n        <\/section>\n/,
  '\n'
);

// Portfolio's primary trading action now opens DCA, never parked SmartTrade.
source = source.replace(
  '<button className={styles.tradeAccountButton} onClick={() => { setSection("Smart Trades"); setSmartView("create"); }}>Trade</button>',
  '<button className={styles.tradeAccountButton} onClick={() => { setSection("DCA bots"); setDcaView("list"); }}>Open DCA Bot</button>'
);

// Remove the SmartTrade render branch. State/data remains untouched for non-destructive parking.
source = source.replace('{section === "Smart Trades" && (smartView === "list" ? smartList : smartCreate)}', '');

// Visible copy must no longer advertise SmartTrade while the module is parked.
source = source.replaceAll('SmartTrades and DCA bots', 'DCA bots');
source = source.replaceAll('SmartTrade and DCA', 'DCA');
source = source.replaceAll('SmartTrade + DCA', 'DCA');

// Hard guards: if any of these survive, SmartTrade would still affect the DCA-only product.
const forbidden = [
  '>SmartTrade</button>',
  '<h2>SmartTrade</h2>',
  'activeDcaTrades.length + activeSmart.length',
  'activeSmart.forEach((trade) =>',
  'paperCapital = activeSmart.reduce',
  'paperRealizedPnl = dcaRealized + smartRealized',
  'paperUnrealizedPnl = smartUnrealized + activeDcaUnrealized',
  'section === "Smart Trades" && (smartView === "list" ? smartList : smartCreate)',
];
for (const token of forbidden) {
  if (source.includes(token)) throw new Error(`DCA-only cleanup failed; SmartTrade token remains: ${token}`);
}
if (!source.includes('const paperCapital = dcaFundsLocked;')) throw new Error('DCA-only reserved-capital ledger was not installed.');
if (!source.includes('const paperRealizedPnl = dcaRealized;')) throw new Error('DCA-only realized PnL ledger was not installed.');
if (!source.includes('const paperUnrealizedPnl = activeDcaUnrealized;')) throw new Error('DCA-only unrealized PnL ledger was not installed.');
if (!source.includes('Open DCA Bot')) throw new Error('Portfolio DCA entry point was not installed.');

fs.writeFileSync(traderPath, source);
console.log('Prepared DCA-only trading product: SmartTrade parked and excluded from navigation/accounting.');
