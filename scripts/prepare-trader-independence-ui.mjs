import fs from "node:fs";
import path from "node:path";

const traderPath = path.join(process.cwd(), "app", "trader", "TraderV2FullShell.tsx");

if (!fs.existsSync(traderPath)) {
  throw new Error(`Trader shell not found: ${traderPath}`);
}

let source = fs.readFileSync(traderPath, "utf8");
let changes = 0;

const replacements = [
  // Front-end navigation/state language only. Backend trade objects stay unchanged.
  ['"Active Trades"', '"Active Positions"'],
  ['"Closed Trades"', '"Closed Positions"'],

  // Dashboard, bot list and position pages.
  ['<span>Active trades</span>', '<span>Active positions</span>'],
  ['<span>Closed trades</span>', '<span>Closed positions</span>'],
  ['<span>Trades</span>', '<span>Positions</span>'],
  ['<small>Across active and closed bot trades</small>', '<small>Across active and closed bot positions</small>'],
  ['<small>Active + closed bot trades</small>', '<small>Active + closed bot positions</small>'],
  ['<small>DCA trade PnL</small>', '<small>DCA position PnL</small>'],
  ['<small>Permanent trade history</small>', '<small>Permanent position history</small>'],
  ['<h1>{tradeState} Trades</h1>', '<h1>{tradeState} Positions</h1>'],
  ['<span>{tradeState} trades</span>', '<span>{tradeState} positions</span>'],
  ['DCA BOTS · TRADES', 'DCA BOTS · POSITIONS'],
  ['Closed bots remain here with their complete history.', 'Closed bots remain here with their complete strategy history.'],
  ['Create a DCA bot to start automating this account.', 'Create a DCA strategy and test it on this account.'],
  ['Create your first DCA bot to begin.', 'Create your first DCA strategy to begin.'],
  ['Open DCA positions will appear here with a live PnL bar.', 'Open DCA positions appear here with live performance and execution status.'],
  ['Completed DCA trades remain here and can still be opened on the chart.', 'Completed DCA positions remain here and can still be opened on the chart.'],
  ['Click any bot to open its full configuration.', 'Open any bot to inspect its strategy and capital plan.'],

  // Bot read-only configuration vocabulary.
  ['<span>Active trades</span><b>{bot.activeTradeCount} / {bot.maxActiveTrades}</b>', '<span>Active positions</span><b>{bot.activeTradeCount} / {bot.maxActiveTrades}</b>'],
  ['<h3>Main settings</h3>', '<h3>Market & Entry</h3>'],
  ['<h3>Averaging orders</h3>', '<h3>DCA Plan</h3>'],
  ['<h3>Exit settings</h3>', '<h3>Exit</h3>'],
  ['<h3>Concurrency</h3>', '<h3>Position Limits</h3>'],
  ['<span>Start condition</span>', '<span>Entry condition</span>'],
  ['<span>Base order</span>', '<span>Initial order</span>'],
  ['<span>Safety order</span>', '<span>DCA order size</span>'],
  ['<span>Max safety orders</span>', '<span>Maximum DCA orders</span>'],
  ['<span>Active safety orders</span>', '<span>Active DCA orders</span>'],
  ['<span>Price deviation</span>', '<span>First DCA trigger</span>'],
  ['<span>Step scale</span>', '<span>Price step multiplier</span>'],
  ['<span>Volume scale</span>', '<span>Order size multiplier</span>'],
  ['<span>Max active trades</span>', '<span>Maximum active positions</span>'],
  ['<span>Capital plan</span>', '<span>Planned capital</span>'],

  // Bot editor grouping and language.
  ['<h3>Main settings</h3><p>Core pair and initial order configuration.</p>', '<h3>Market & Entry</h3><p>Choose the market and define how the position opens.</p>'],
  ['<h3>Averaging orders</h3><p>Control the DCA ladder, order count and capital scaling.</p>', '<h3>DCA Plan</h3><p>Define additional entries, order count, spacing and capital scaling.</p>'],
  ['<h3>Exit settings</h3><p>Take profit and optional stop loss.</p>', '<h3>Exit</h3><p>Define how the position realizes profit or limits downside.</p>'],
  ['<h3>DCA ladder preview</h3><p>Capital requirements based on the configured volume and step scales.</p>', '<h3>Capital Preview</h3><p>See the DCA ladder and maximum capital exposure before launch.</p>'],
  ['<span>Total planned capital</span>', '<span>Maximum planned capital</span>'],
  [' safety orders</b>', ' DCA orders</b>'],

  // Position-level messages and summaries.
  ['Existing active trades keep their current trade levels; new trades use the updated bot settings.', 'Existing active positions keep their current execution levels; new positions use the updated bot settings.'],
  ['Pair cannot be changed while this bot has an active trade. Other settings can still be edited.', 'Pair cannot be changed while this bot has an active position. Other settings can still be edited.'],
  ['Its bot and trade history will remain available.', 'Its bot and position history will remain available.'],
  [' active trade{selectedBot.activeTradeCount === 1 ? "" : "s"}. Its pair is locked until those trades close. Other saved settings apply to future trades; existing active trades retain their current trade-level DCA/TP/SL values.', ' active position{selectedBot.activeTradeCount === 1 ? "" : "s"}. Its pair is locked until those positions close. Other saved settings apply to future positions; existing active positions retain their current position-level DCA/TP/SL values.'],
  ['<span>Averaging <b>{trade.averagingFilled} / {trade.maxAveraging}</b></span>', '<span>DCA filled <b>{trade.averagingFilled} / {trade.maxAveraging}</b></span>'],
];

for (const [from, to] of replacements) {
  if (!source.includes(from)) continue;
  const before = source;
  source = source.split(from).join(to);
  if (source !== before) changes += 1;
}

// Guard against reintroducing competitor-specific visible wording in the final shell.
const forbiddenVisibleFragments = [
  ">Base order<",
  ">Safety order<",
  ">Max safety orders<",
  ">Active safety orders<",
  ">Price deviation<",
  ">Step scale<",
  ">Volume scale<",
  ">Main settings<",
  ">Averaging orders<",
  ">Exit settings<",
  ">Concurrency<",
];

const remaining = forbiddenVisibleFragments.filter((fragment) => source.includes(fragment));
if (remaining.length) {
  throw new Error(`Trader independence transform incomplete: ${remaining.join(", ")}`);
}

fs.writeFileSync(traderPath, source);
console.log(`LabNarrative Trader independence UI prepared (${changes} replacement groups applied).`);
