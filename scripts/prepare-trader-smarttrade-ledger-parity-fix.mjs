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
  "fs.writeFileSync(traderPath, source);",
  "const dashboardAny = source.indexOf('const dashboard = ('); const portfolioAny = source.indexOf('const portfolio = ('); console.log('SMARTTRADE_STRUCTURE', JSON.stringify({ dashboard: source.indexOf('  const dashboard = ('), dashboardAny, dashboardContext: dashboardAny >= 0 ? source.slice(Math.max(0, dashboardAny - 220), dashboardAny + 80) : '', portfolio: source.indexOf('  const portfolio = ('), portfolioAny, portfolioContext: portfolioAny >= 0 ? source.slice(Math.max(0, portfolioAny - 220), portfolioAny + 80) : '', orders: source.indexOf('  const OrdersTable ='), modeTabs: source.indexOf('  const ModeTabs ='), outerReturn: source.lastIndexOf('  return <main className={styles.appShell}>'), closeMain: source.lastIndexOf('</main>') }));\nfs.writeFileSync(traderPath, source);"
);

if (!source.includes("const closeMain = source.lastIndexOf('</main>');")) {
  throw new Error("SmartTrade parity modal anchor fix was not applied.");
}
if (!source.includes("const smartLedgerPnl = smartPnl + '  const paperRealizedPnl = dcaRealized + smartRealized;")) {
  throw new Error("SmartTrade parity unified-account PnL fix was not applied.");
}
if (!source.includes("dashboardContext")) {
  throw new Error("SmartTrade structural diagnostics were not installed.");
}

fs.writeFileSync(scriptPath, source);
console.log("Fixed SmartTrade parity modal anchor/account PnL and enabled nested-scope diagnostics.");
