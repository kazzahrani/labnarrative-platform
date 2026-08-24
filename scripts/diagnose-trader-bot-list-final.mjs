import fs from "node:fs";
import path from "node:path";

const p = path.join(process.cwd(), "app/trader/TradingAgent.tsx");
const source = fs.readFileSync(p, "utf8");

const snippets = [];
const around = (label, needle, before = 500, after = 1800) => {
  const i = source.indexOf(needle);
  if (i < 0) return snippets.push(`${label}: NOT FOUND`);
  snippets.push(`${label}:\n${source.slice(Math.max(0, i - before), Math.min(source.length, i + after))}`);
};

around("CREATOR", "const createConfiguredDcaBot = () =>", 0, 7000);
around("MY_BOTS", "My bots", 1000, 7000);
around("MAX_ACTIVE_FIELD", "Maximum active trades", 700, 2500);
around("BOT_PNL", "botPnl", 1000, 3500);
around("ACTIVE_TRADES_HEADER", ">Active trades<", 1200, 3500);

console.log("TRADER_FINAL_DIAGNOSTIC_START");
for (const text of snippets) console.log(text.replaceAll("\n", "\\n"));
console.log("TRADER_FINAL_DIAGNOSTIC_END");
