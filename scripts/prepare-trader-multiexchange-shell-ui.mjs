import fs from "node:fs";
import path from "node:path";

const shellPath = path.join(process.cwd(), "app/trader/TraderV2FullShell.tsx");
let shell = fs.readFileSync(shellPath, "utf8");

// DCA exchange eligibility is resolved inside DcaBotConfigurator from all four launch
// connections. Do not block the configurator just because the legacy Binance status
// on the account row is disconnected.
const legacyGate = /\s*if\s*\(currentAccount\.kind\s*===\s*"real"\s*&&\s*!connected\)\s*\{\s*setExchangeModal\(true\);\s*return;\s*\}\s*/;
if (legacyGate.test(shell)) shell = shell.replace(legacyGate, "\n    ");
else if (!shell.includes('setBotModalMode("create")')) throw new Error("Multi-exchange shell: DCA create action not found");

fs.writeFileSync(shellPath, shell);
console.log("Trader multi-exchange shell gate applied");
