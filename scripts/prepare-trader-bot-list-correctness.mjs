import fs from "node:fs";
import path from "node:path";

const traderPath = path.join(process.cwd(), "app/trader/TradingAgent.tsx");
let source = fs.readFileSync(traderPath, "utf8");

// TRADER_BOT_LIST_CORRECTNESS_V2
// Final post-transform correctness pass. New and edited bots must freeze both
// per-bot concurrency and simultaneous averaging-order limits before launch.

const creatorStart = source.indexOf("  const createConfiguredDcaBot = () => {");
const creatorEnd = source.indexOf("  const handleGlobalSearch = (value: string) => {", creatorStart);
if (creatorStart < 0 || creatorEnd <= creatorStart) throw new Error("Bot correctness: configured DCA creator not found.");
let creator = source.slice(creatorStart, creatorEnd);

// Normalize any shorthand properties already present.
creator = creator.replaceAll(
  "        maxActiveTrades,\n",
  "        maxActiveTrades: Math.max(1, Math.round(maxActiveTrades)),\n"
);
creator = creator.replaceAll(
  "        limitSafetyOrders,\n",
  "        limitSafetyOrders: Math.max(1, Math.min(maxSafetyOrders, Math.round(limitSafetyOrders))),\n"
);

// The edit branch already had these fields, but the new-bot branch could lose both after
// the legacy transform chain. Patch the actual new DcaBot object structurally and guard it.
const newBotAnchor = "    const bot: DcaBot = {";
const newBotStart = creator.indexOf(newBotAnchor);
if (newBotStart < 0) throw new Error("Bot correctness: new DcaBot object not found in configured creator.");
const newBotEnd = creator.indexOf("\n    };", newBotStart);
if (newBotEnd <= newBotStart) throw new Error("Bot correctness: new DcaBot object end not found.");
let newBotBlock = creator.slice(newBotStart, newBotEnd + "\n    };".length);

const maxLine = newBotBlock.match(/^(\s*)maxSafetyOrders,\s*$/m);
if (maxLine) {
  const indent = maxLine[1];
  const additions = [];
  if (!newBotBlock.includes("limitSafetyOrders:")) additions.push(`${indent}limitSafetyOrders: Math.max(1, Math.min(maxSafetyOrders, Math.round(limitSafetyOrders))),`);
  if (!newBotBlock.includes("maxActiveTrades:")) additions.push(`${indent}maxActiveTrades: Math.max(1, Math.round(maxActiveTrades)),`);
  if (additions.length) newBotBlock = newBotBlock.replace(maxLine[0], maxLine[0] + "\n" + additions.join("\n"));
} else {
  // Fallback for a compact generated object shape.
  if (!newBotBlock.includes("limitSafetyOrders:") || !newBotBlock.includes("maxActiveTrades:")) {
    newBotBlock = newBotBlock.replace(
      "maxSafetyOrders, deviation,",
      "maxSafetyOrders, limitSafetyOrders: Math.max(1, Math.min(maxSafetyOrders, Math.round(limitSafetyOrders))), maxActiveTrades: Math.max(1, Math.round(maxActiveTrades)), deviation,"
    );
  }
}

if (!newBotBlock.includes("limitSafetyOrders: Math.max(1, Math.min(maxSafetyOrders, Math.round(limitSafetyOrders)))")) {
  throw new Error("Bot correctness: NEW bot does not persist simultaneous averaging-order limit.");
}
if (!newBotBlock.includes("maxActiveTrades: Math.max(1, Math.round(maxActiveTrades))")) {
  throw new Error("Bot correctness: NEW bot does not persist Maximum active trades.");
}
creator = creator.slice(0, newBotStart) + newBotBlock + creator.slice(newBotEnd + "\n    };".length);
source = source.slice(0, creatorStart) + creator + source.slice(creatorEnd);

const dcaListAnchor = "  const dcaList = (";
if (!source.includes(dcaListAnchor)) throw new Error("Bot correctness: DCA list render not found.");
if (!source.includes("const dcaBotLedgerTrades = (botId: string) =>")) {
  const helpers = [
    "  // TRADER_BOT_LIST_CORRECTNESS_V2",
    "  const dcaBotLedgerTrades = (botId: string) => dcaTrades.filter((trade) => trade.botId === botId);",
    "  const dcaBotActiveTradeCount = (botId: string) => dcaBotLedgerTrades(botId).filter((trade) => trade.status === \"Active\").length;",
    "  const dcaBotTotalTradeCount = (botId: string) => dcaBotLedgerTrades(botId).length;",
    "  const dcaBotLedgerPnl = (botId: string) => dcaBotLedgerTrades(botId).reduce((sum, trade) => sum + (trade.status === \"Active\" ? dcaTradePnl(trade) : (trade.realizedPnl ?? 0)), 0);",
    "",
  ].join("\n");
  source = source.replace(dcaListAnchor, helpers + dcaListAnchor);
}

source = source.replaceAll(
  "<td>{bot.maxSafetyOrders}</td>",
  "<td>{dcaBotTotalTradeCount(bot.id)}</td>"
);

source = source.replaceAll(
  '<td className={styles.greenText}>$0.00</td>',
  '<td className={dcaBotLedgerPnl(bot.id) >= 0 ? styles.greenText : styles.redText}>{compactMoney(dcaBotLedgerPnl(bot.id))}</td>'
);

source = source.replaceAll(
  '<td>{dcaTrades.filter((trade) => trade.botId === bot.id && trade.status === "Active").length} / {Math.max(1, bot.maxActiveTrades ?? 1)}</td>',
  '<td>{dcaBotActiveTradeCount(bot.id)} / {Math.max(1, bot.maxActiveTrades ?? 1)}</td>'
);

const finalCreatorStart = source.indexOf("  const createConfiguredDcaBot = () => {");
const finalCreatorEnd = source.indexOf("  const handleGlobalSearch = (value: string) => {", finalCreatorStart);
const finalCreator = source.slice(finalCreatorStart, finalCreatorEnd);
const finalNewBotStart = finalCreator.indexOf(newBotAnchor);
const finalNewBotEnd = finalCreator.indexOf("\n    };", finalNewBotStart);
const finalNewBot = finalCreator.slice(finalNewBotStart, finalNewBotEnd + "\n    };".length);
const dcaListStart = source.indexOf(dcaListAnchor);
const dcaListEnd = source.indexOf("  const DcaConditionEditor", dcaListStart);
const dcaList = source.slice(dcaListStart, dcaListEnd > dcaListStart ? dcaListEnd : dcaListStart + 12000);

if (!finalNewBot.includes("maxActiveTrades: Math.max(1, Math.round(maxActiveTrades))")) throw new Error("Bot correctness: initial creator does not persist Maximum active trades explicitly.");
if (!finalNewBot.includes("limitSafetyOrders: Math.max(1, Math.min(maxSafetyOrders, Math.round(limitSafetyOrders)))")) throw new Error("Bot correctness: initial creator does not persist active averaging-order limit explicitly.");
if (!source.includes("activeOrdersLimit: maxAveraging ? Math.max(1, Math.min(maxAveraging, bot.limitSafetyOrders ?? maxAveraging)) : 0")) throw new Error("Bot correctness: new trades do not freeze bot simultaneous averaging limit.");
if (dcaList.includes("<td>{bot.maxSafetyOrders}</td>")) throw new Error("Bot correctness: Trades column still shows averaging-order count.");
if (dcaList.includes('<td className={styles.greenText}>$0.00</td>')) throw new Error("Bot correctness: bot PnL is still hardcoded.");
if (!dcaList.includes("dcaBotLedgerPnl(bot.id)")) throw new Error("Bot correctness: bot PnL is not ledger-derived.");
if (!dcaList.includes("dcaBotActiveTradeCount(bot.id)")) throw new Error("Bot correctness: Active trades is not ledger-derived.");

fs.writeFileSync(traderPath, source);
console.log("Fixed new-bot Maximum active trades and simultaneous averaging-order persistence at launch.");
