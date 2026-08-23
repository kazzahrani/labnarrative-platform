import fs from "node:fs";
import path from "node:path";

const traderPath = path.join(process.cwd(), "app/trader/TradingAgent.tsx");
let source = fs.readFileSync(traderPath, "utf8");

const oldBlock = [
  '            if (openBotTrade(bot, pair, fillPrice)) {',
  '              activeKeys.add(bot.id + "|" + pair); activeForBot += 1; availableCapital -= bot.baseOrder;',
  '              setDcaBots((items) => items.map((item) => {',
].join("\n");
const newBlock = [
  '            if (openBotTrade(bot, pair, fillPrice)) {',
  '              // The base order was already reserved while this Limit entry was pending.',
  '              // Filling it converts reserved cash into invested cash; it must not be subtracted twice.',
  '              activeKeys.add(bot.id + "|" + pair); activeForBot += 1;',
  '              setDcaBots((items) => items.map((item) => {',
].join("\n");

if (!source.includes(oldBlock)) throw new Error("DCA Limit accounting fix: pending-fill block not found.");
source = source.replace(oldBlock, newBlock);
fs.writeFileSync(traderPath, source);
console.log("Fixed DCA pending Limit fill reservation accounting.");
