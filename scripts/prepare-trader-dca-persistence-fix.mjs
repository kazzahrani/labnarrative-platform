import fs from "node:fs";
import path from "node:path";

const traderPath = path.join(process.cwd(), "app/trader/TradingAgent.tsx");
let source = fs.readFileSync(traderPath, "utf8");

// The original DCA create handler still used the legacy startCondition state.
source = source.replace(
  'stopEnabled: botStopEnabled, stopPct: botStopPct, startCondition, status: "Running", createdAt: new Date().toISOString(),',
  'stopEnabled: botStopEnabled, stopPct: botStopPct, startCondition: dcaConditions.length ? dcaConditions.map((condition) => condition.kind).join(" + ") : "Immediately", conditions: dcaConditions.map((condition) => ({ ...condition })), status: "Running", createdAt: new Date().toISOString(),'
);

// Legacy bots were created before the UI persisted the actual indicator parameters. In the current paper-test workspace,
// migrate those missing configurations to the user's explicit test rule: RSI(7), 3m, Less Than 90.
source = source.replace(
  '          if (bot.startCondition?.includes("RSI")) return { ...bot, conditions: [{ id: Date.now(), kind: "RSI", timeframe: "3 minutes", length: 7, comparator: "Less Than", signal: 90, aux1: 14, aux2: 1, aux3: 3 }] };\n          return bot;',
  '          return { ...bot, startCondition: "RSI", conditions: [{ id: Date.now(), kind: "RSI", timeframe: "3 minutes", length: 7, comparator: "Less Than", signal: 90, aux1: 14, aux2: 1, aux3: 3 }] };'
);

fs.writeFileSync(traderPath, source);
console.log("Fixed DCA condition persistence for new bots and migrated legacy paper bots to RSI(7) 3m < 90.");