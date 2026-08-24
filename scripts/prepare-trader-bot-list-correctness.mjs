import fs from "node:fs";
import path from "node:path";

const traderPath = path.join(process.cwd(), "app/trader/TradingAgent.tsx");
let source = fs.readFileSync(traderPath, "utf8");

// TRADER_BOT_LIST_CORRECTNESS_V1
// Final post-transform correctness pass. The bot list must be derived from the ledger,
// and a newly created bot must freeze the Maximum active trades value immediately.

const creatorStart = source.indexOf("  const createConfiguredDcaBot = () => {");
const creatorEnd = source.indexOf("  const handleGlobalSearch = (value: string) => {", creatorStart);
if (creatorStart < 0 || creatorEnd <= creatorStart) throw new Error("Bot correctness: configured DCA creator not found.");
let creator = source.slice(creatorStart, creatorEnd);

// The final generated creator already contains maxActiveTrades. Normalize its shorthand
// into an explicit integer property without inserting a second property or changing order.
creator = creator.replaceAll(
  "        maxActiveTrades,\n",
  "        maxActiveTrades: Math.max(1, Math.round(maxActiveTrades)),\n"
);
source = source.slice(0, creatorStart) + creator + source.slice(creatorEnd);

const dcaListAnchor = "  const dcaList = (";
if (!source.includes(dcaListAnchor)) throw new Error("Bot correctness: DCA list render not found.");
if (!source.includes("const dcaBotLedgerTrades = (botId: string) =>")) {
  const helpers = [
    "  // TRADER_BOT_LIST_CORRECTNESS_V1",
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

const finalCreator = source.slice(source.indexOf("  const createConfiguredDcaBot = () => {"), source.indexOf("  const handleGlobalSearch = (value: string) => {", source.indexOf("  const createConfiguredDcaBot = () => {")));
const dcaListStart = source.indexOf(dcaListAnchor);
const dcaListEnd = source.indexOf("  const DcaConditionEditor", dcaListStart);
const dcaList = source.slice(dcaListStart, dcaListEnd > dcaListStart ? dcaListEnd : dcaListStart + 12000);

if (!finalCreator.includes("maxActiveTrades: Math.max(1, Math.round(maxActiveTrades))")) throw new Error("Bot correctness: initial creator does not persist Maximum active trades explicitly.");
if (dcaList.includes("<td>{bot.maxSafetyOrders}</td>")) throw new Error("Bot correctness: Trades column still shows averaging-order count.");
if (dcaList.includes('<td className={styles.greenText}>$0.00</td>')) throw new Error("Bot correctness: bot PnL is still hardcoded.");
if (!dcaList.includes("dcaBotLedgerPnl(bot.id)")) throw new Error("Bot correctness: bot PnL is not ledger-derived.");
if (!dcaList.includes("dcaBotActiveTradeCount(bot.id)")) throw new Error("Bot correctness: Active trades is not ledger-derived.");

fs.writeFileSync(traderPath, source);
console.log("Fixed bot list PnL/trade counts and normalized initial Maximum active trades persistence.");
