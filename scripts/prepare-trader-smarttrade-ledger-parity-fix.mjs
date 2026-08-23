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

if (!source.includes("const closeMain = source.lastIndexOf('</main>');")) {
  throw new Error("SmartTrade parity modal anchor fix was not applied.");
}
if (!source.includes("const smartLedgerPnl = smartPnl + '  const paperRealizedPnl = dcaRealized + smartRealized;")) {
  throw new Error("SmartTrade parity unified-account PnL fix was not applied.");
}

fs.writeFileSync(scriptPath, source);
console.log("Fixed SmartTrade parity modal anchor and unified account PnL preservation.");
