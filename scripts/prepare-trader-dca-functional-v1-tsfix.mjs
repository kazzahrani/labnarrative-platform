import fs from "node:fs";
import path from "node:path";

const traderPath = path.join(process.cwd(), "app/trader/TradingAgent.tsx");
let source = fs.readFileSync(traderPath, "utf8");

const oldBlock = [
  '      const pendingLimitEntries = Object.fromEntries(chosenPairs.slice(0, maxActiveTrades).map((pair) => {',
  '        const symbol = pair.split("/")[0];',
  '        const price = markets.find((market) => market.symbol === symbol)?.price ?? 0;',
  '        return [pair, { price, createdAt: now }];',
  '      }).filter(([, order]) => order.price > 0));',
].join("\n");

const newBlock = [
  '      const pendingLimitEntries: Record<string, { price: number; createdAt: string }> = Object.fromEntries(chosenPairs.slice(0, maxActiveTrades)',
  '        .filter((pair) => (markets.find((market) => market.symbol === pair.split("/")[0])?.price ?? 0) > 0)',
  '        .map((pair) => {',
  '          const symbol = pair.split("/")[0];',
  '          const price = markets.find((market) => market.symbol === symbol)?.price ?? 0;',
  '          return [pair, { price, createdAt: now }] as const;',
  '        }));',
].join("\n");

if (!source.includes(oldBlock)) throw new Error("DCA functional TS fix: pending Limit-entry block not found.");
source = source.replace(oldBlock, newBlock);
fs.writeFileSync(traderPath, source);
console.log("Fixed DCA pending Limit-entry typing.");
