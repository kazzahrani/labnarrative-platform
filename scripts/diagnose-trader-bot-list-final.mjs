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
const allAround = (label, needle, before = 250, after = 700, max = 20) => {
  let cursor = 0;
  let count = 0;
  while (count < max) {
    const i = source.indexOf(needle, cursor);
    if (i < 0) break;
    snippets.push(`${label}_${count + 1}:\n${source.slice(Math.max(0, i - before), Math.min(source.length, i + after))}`);
    cursor = i + needle.length;
    count += 1;
  }
  if (!count) snippets.push(`${label}: NOT FOUND`);
};

around("CREATOR", "const createConfiguredDcaBot = () =>", 0, 7000);
around("MY_BOTS", "My bots", 1000, 7000);
around("MAX_ACTIVE_FIELD", "Maximum active trades", 700, 2500);
around("BOT_PNL", "dcaBotLedgerPnl", 1000, 3500);
around("ACTIVE_TRADES_HEADER", ">Active trades<", 1200, 3500);
allAround("MAX_ACTIVE_CONFIG", "maxActiveTrades", 300, 900, 30);
allAround("LIMIT_SAFETY_CONFIG", "limitSafetyOrders", 300, 900, 30);
allAround("NEW_TRADE_AVERAGING", "averagingFilled: 0", 300, 1200, 30);

console.log("TRADER_FINAL_DIAGNOSTIC_START");
for (const text of snippets) console.log(text.replaceAll("\n", "\\n"));
console.log("TRADER_FINAL_DIAGNOSTIC_END");
