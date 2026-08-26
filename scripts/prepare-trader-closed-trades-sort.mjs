import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const shellPath = path.join(root, "app/trader/TraderV2FullShell.tsx");
let source = fs.readFileSync(shellPath, "utf8");

const oldLine = '  const closedTrades = trades.filter((trade) => trade.status === "Closed");';
const newLine = '  const closedTrades = trades.filter((trade) => trade.status === "Closed").sort((a, b) => { const bTime = b.closedAt ? new Date(b.closedAt).getTime() : 0; const aTime = a.closedAt ? new Date(a.closedAt).getTime() : 0; return bTime - aTime; });';

if (source.includes(oldLine)) source = source.replace(oldLine, newLine);
else if (!source.includes(newLine)) throw new Error("Closed trade sort target not found");

fs.writeFileSync(shellPath, source);
console.log("Closed trades sorted by most recent close time");
