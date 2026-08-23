import fs from "node:fs";
import path from "node:path";

const scriptPath = path.join(process.cwd(), "scripts/prepare-trader-smarttrade-ledger-parity.mjs");
let source = fs.readFileSync(scriptPath, "utf8");
source = source.replace("const closeMain = source.lastIndexOf('    </main>');", "const closeMain = source.lastIndexOf('</main>');");
if (!source.includes("const closeMain = source.lastIndexOf('</main>');")) {
  throw new Error("SmartTrade parity modal anchor fix was not applied.");
}
fs.writeFileSync(scriptPath, source);
console.log("Fixed SmartTrade parity modal insertion anchor.");
