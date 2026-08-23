import fs from "node:fs";
import path from "node:path";

const scriptPath = path.join(process.cwd(), "scripts/prepare-trader-smarttrade-ledger-parity.mjs");
let source = fs.readFileSync(scriptPath, "utf8");

source = source.replace(
  "const closeMain = source.lastIndexOf('    </main>');",
  "const closeMain = source.lastIndexOf('</main>');"
);

source = source.replace(
  "  source = source.slice(0, smartPnlStart) + smartPnl + source.slice(accountStart);",
  "  const smartLedgerPnl = smartPnl + '  const paperRealizedPnl = dcaRealized + smartRealized;\\n  const paperUnrealizedPnl = smartUnrealized + activeDcaUnrealized;\\n';\n  source = source.slice(0, smartPnlStart) + smartLedgerPnl + source.slice(accountStart);"
);

source = source.replace(
  "const ordersEnd = ordersStart >= 0 ? source.indexOf('  const ModeTabs =', ordersStart) : -1;",
  "const ordersEndCandidates = ['  const dashboard = (', '  const portfolio = (', '  const smartList = (', '  const ModeTabs ='].map((token) => source.indexOf(token, ordersStart + 1)).filter((index) => index > ordersStart);\nconst ordersEnd = ordersEndCandidates.length ? Math.min(...ordersEndCandidates) : -1;"
);

source = source.replace(
  "fs.writeFileSync(traderPath, source);",
  "const dashboardAny = source.indexOf('const dashboard = ('); const portfolioAny = source.indexOf('const portfolio = ('); console.log('SMARTTRADE_STRUCTURE', JSON.stringify({ dashboard: source.indexOf('  const dashboard = ('), dashboardAny, portfolio: source.indexOf('  const portfolio = ('), portfolioAny, orders: source.indexOf('  const OrdersTable ='), modeTabs: source.indexOf('  const ModeTabs ='), outerReturn: source.lastIndexOf('  return <main className={styles.appShell}>'), closeMain: source.lastIndexOf('</main>') }));\nfs.writeFileSync(traderPath, source);"
);

if (!source.includes("const closeMain = source.lastIndexOf('</main>');")) {
  throw new Error("SmartTrade parity modal anchor fix was not applied.");
}
if (!source.includes("const smartLedgerPnl = smartPnl + '  const paperRealizedPnl = dcaRealized + smartRealized;")) {
  throw new Error("SmartTrade parity unified-account PnL fix was not applied.");
}
if (!source.includes("const ordersEndCandidates =")) {
  throw new Error("SmartTrade OrdersTable boundary fix was not applied.");
}

fs.writeFileSync(scriptPath, source);
console.log("Fixed SmartTrade parity boundaries while preserving Dashboard and Portfolio.");
