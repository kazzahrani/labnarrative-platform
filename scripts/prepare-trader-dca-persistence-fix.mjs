import fs from "node:fs";
import path from "node:path";

const traderPath = path.join(process.cwd(), "app/trader/TradingAgent.tsx");
let source = fs.readFileSync(traderPath, "utf8");

// Legacy bots were created before the UI persisted the actual indicator parameters. In the current paper-test workspace,
// migrate those missing configurations to the user's explicit test rule: RSI(7), 3m, Less Than 90.
source = source.replace(
  '          if (bot.startCondition?.includes("RSI")) return { ...bot, conditions: [{ id: Date.now(), kind: "RSI", timeframe: "3 minutes", length: 7, comparator: "Less Than", signal: 90, aux1: 14, aux2: 1, aux3: 3 }] };\n          return bot;',
  '          return { ...bot, startCondition: "RSI", conditions: [{ id: Date.now(), kind: "RSI", timeframe: "3 minutes", length: 7, comparator: "Less Than", signal: 90, aux1: 14, aux2: 1, aux3: 3 }] };'
);

// Add a durable creator that stores the exact DCA condition objects. The older createDcaBot helper remains for backwards
// compatibility, but the visible Start bot button is routed through this configured creator.
if (!source.includes("const createConfiguredDcaBot = () =>")) {
  const anchor = "  const handleGlobalSearch = (value: string) => {";
  const creator = `  const createConfiguredDcaBot = () => {
    if (!botName.trim() || baseOrder <= 0 || safetyOrder <= 0) {
      setNotice("Add a bot name and valid order amounts.");
      return;
    }
    const savedConditions = dcaConditions.map((condition) => ({ ...condition }));
    const bot: DcaBot = {
      id: \`bot-\${Date.now()}\`,
      name: botName.trim(),
      pair: \`\${selectedSymbol}/USDT\`,
      baseOrder,
      safetyOrder,
      maxSafetyOrders,
      deviation,
      stepScale,
      volumeScale,
      takeProfit: botTakeProfit,
      stopEnabled: botStopEnabled,
      stopPct: botStopPct,
      startCondition: savedConditions.length ? savedConditions.map((condition) => condition.kind).join(" + ") : "Immediately",
      conditions: savedConditions,
      status: "Running",
      createdAt: new Date().toISOString(),
    };
    setDcaBots((current) => [bot, ...current]);
    // Immediate bots can open at once. Technical-condition bots are opened only by the live paper engine.
    if (!savedConditions.length && selectedPrice && selectedPrice > 0) {
      const now = new Date().toISOString();
      setDcaTrades((current) => [{
        id: \`deal-\${Date.now()}-\${bot.id}\`, botId: bot.id, botName: bot.name, pair: bot.pair,
        entryPrice: selectedPrice, averagePrice: selectedPrice, quantity: bot.baseOrder / selectedPrice,
        invested: bot.baseOrder, averagingFilled: 0, maxAveraging: bot.maxSafetyOrders,
        status: "Active", createdAt: now, lastPrice: selectedPrice,
      }, ...current]);
    }
    setDcaView("list");
    setNotice(\`\${bot.name} created and running in paper mode.\`);
  };

`;
  source = source.replace(anchor, creator + anchor);
}

source = source.replace(
  'className={styles.dcaStartButton} onClick={createDcaBot}>Start bot</button>',
  'className={styles.dcaStartButton} onClick={createConfiguredDcaBot}>Start bot</button>'
);

fs.writeFileSync(traderPath, source);
console.log("Fixed DCA condition persistence and routed Start bot through the configured paper-bot creator.");