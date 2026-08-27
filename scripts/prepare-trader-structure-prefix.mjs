import fs from "node:fs";
import path from "node:path";

const traderPath = path.join(process.cwd(), "app", "trader", "TraderV2FullShell.tsx");
if (!fs.existsSync(traderPath)) throw new Error(`Trader shell not found: ${traderPath}`);

let source = fs.readFileSync(traderPath, "utf8");
source = source.replaceAll("DCA BOTS · TRADES", "DCA BOTS · POSITIONS");
source = source.replaceAll("<h1>{tradeState} Trades</h1>", "<h1>{tradeState} Positions</h1>");
fs.writeFileSync(traderPath, source);
console.log("Trader position headings normalized for final structure refactor; theme untouched.");