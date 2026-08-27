import fs from "node:fs";
import path from "node:path";

const traderPath = path.join(process.cwd(), "app", "trader", "TraderV2FullShell.tsx");
const configuratorPath = path.join(process.cwd(), "app", "trader", "DcaBotConfigurator.tsx");

for (const file of [traderPath, configuratorPath]) {
  if (!fs.existsSync(file)) throw new Error(`Trader structure target not found: ${file}`);
}

let source = fs.readFileSync(traderPath, "utf8");
let configurator = fs.readFileSync(configuratorPath, "utf8");
let changes = 0;
let configuratorChanges = 0;

const replaceAllTracked = (text, from, to, label, counter = "shell") => {
  if (!text.includes(from)) return text;
  const next = text.split(from).join(to);
  if (next !== text) {
    if (counter === "shell") changes += 1;
    else configuratorChanges += 1;
  }
  return next;
};

// Internal state names stay compatible while visible language becomes standard trading language.
const shellReplacements = [
  ['"Active Trades"', '"Active Positions"'],
  ['"Closed Trades"', '"Closed Positions"'],
  ['<span>Active trades</span>', '<span>Active positions</span>'],
  ['<span>Closed trades</span>', '<span>Closed positions</span>'],
  ['<span>Trades</span>', '<span>Positions</span>'],
  ['<small>Across active and closed bot trades</small>', '<small>Across active and closed bot positions</small>'],
  ['<small>Active + closed bot trades</small>', '<small>Active + closed bot positions</small>'],
  ['<small>DCA trade PnL</small>', '<small>DCA position PnL</small>'],
  ['<small>Permanent trade history</small>', '<small>Permanent position history</small>'],
  ['<span>{tradeState} trades</span>', '<span>{tradeState} positions</span>'],
  ['Closed bots remain here with their complete history.', 'Closed automations remain here with their complete strategy history.'],
  ['Create a DCA bot to start automating this account.', 'Create a DCA strategy to start automating this account.'],
  ['Create your first DCA bot to begin.', 'Create your first DCA strategy to begin.'],
  ['Open DCA positions will appear here with a live PnL bar.', 'Open DCA positions appear here with live performance and execution status.'],
  ['Completed DCA trades remain here and can still be opened on the chart.', 'Completed DCA positions remain here and can still be opened on the chart.'],
  ['Click any bot to open its full configuration.', 'Open any automation to inspect its strategy and capital plan.'],
  ['<span>Active trades</span><b>{bot.activeTradeCount} / {bot.maxActiveTrades}</b>', '<span>Active positions</span><b>{bot.activeTradeCount} / {bot.maxActiveTrades}</b>'],
  ['<h3>Main settings</h3>', '<h3>Market & Entry</h3>'],
  ['<h3>Averaging orders</h3>', '<h3>Capital Plan</h3>'],
  ['<h3>Exit settings</h3>', '<h3>Exit Plan</h3>'],
  ['<h3>Concurrency</h3>', '<h3>Position Limits</h3>'],
  ['<span>Start condition</span>', '<span>Entry rule</span>'],
  ['<span>Base order</span>', '<span>Initial order</span>'],
  ['<span>Safety order</span>', '<span>DCA order size</span>'],
  ['<span>Max safety orders</span>', '<span>Maximum DCA orders</span>'],
  ['<span>Active safety orders</span>', '<span>Active DCA orders</span>'],
  ['<span>Price deviation</span>', '<span>First DCA trigger</span>'],
  ['<span>Step scale</span>', '<span>Price step multiplier</span>'],
  ['<span>Volume scale</span>', '<span>Order size multiplier</span>'],
  ['<span>Max active trades</span>', '<span>Maximum active positions</span>'],
  ['<span>Capital plan</span>', '<span>Planned capital</span>'],
  ['<h3>Main settings</h3><p>Core pair and initial order configuration.</p>', '<h3>Market & Entry</h3><p>Choose the market and define how the position opens.</p>'],
  ['<h3>Averaging orders</h3><p>Control the DCA ladder, order count and capital scaling.</p>', '<h3>Capital Plan</h3><p>Define additional entries, spacing and capital progression.</p>'],
  ['<h3>Exit settings</h3><p>Take profit and optional stop loss.</p>', '<h3>Exit Plan</h3><p>Define how the position realizes profit or limits downside.</p>'],
  ['<h3>DCA ladder preview</h3><p>Capital requirements based on the configured volume and step scales.</p>', '<h3>Strategy Preview</h3><p>Review the DCA ladder and maximum capital exposure before launch.</p>'],
  ['<span>Total planned capital</span>', '<span>Maximum planned capital</span>'],
  [' safety orders</b>', ' DCA orders</b>'],
  ['Existing active trades keep their current trade levels; new trades use the updated bot settings.', 'Existing active positions keep their current execution levels; new positions use the updated strategy settings.'],
  ['Pair cannot be changed while this bot has an active trade. Other settings can still be edited.', 'Pair cannot be changed while this automation has an active position. Other settings can still be edited.'],
  ['Its bot and trade history will remain available.', 'Its automation and position history will remain available.'],
  [' active trade{selectedBot.activeTradeCount === 1 ? "" : "s"}. Its pair is locked until those trades close. Other saved settings apply to future trades; existing active trades retain their current trade-level DCA/TP/SL values.', ' active position{selectedBot.activeTradeCount === 1 ? "" : "s"}. Its pair is locked until those positions close. Other saved settings apply to future positions; existing active positions retain their current position-level DCA/TP/SL values.'],
  ['<span>Averaging <b>{trade.averagingFilled} / {trade.maxAveraging}</b></span>', '<span>DCA filled <b>{trade.averagingFilled} / {trade.maxAveraging}</b></span>'],
];
for (const [from, to] of shellReplacements) source = replaceAllTracked(source, from, to, from);

// Navigation is structurally different while preserving the existing section state and routing.
const oldNav = '<button className={section === "Dashboard" ? styles.navActive : ""} onClick={() => setSection("Dashboard")}><span>⌘</span>Dashboard</button><button className={section === "Portfolio" ? styles.navActive : ""} onClick={() => setSection("Portfolio")}><span>◔</span>Portfolio</button><button className={section === "Bots" ? styles.navActive : ""} onClick={() => setSection("Bots")}><span>▣</span>Bots</button><div className={dca.subnav}><button className={section === "Active Positions" ? dca.subnavActive : ""} onClick={() => setSection("Active Positions")}><span>•</span>Active Trades <em className={dca.subnavCount}>{activeTrades.length}</em></button><button className={section === "Closed Positions" ? dca.subnavActive : ""} onClick={() => setSection("Closed Positions")}><span>•</span>Closed Trades <em className={dca.subnavCount}>{closedTrades.length}</em></button></div>';
const newNav = '<button className={section === "Dashboard" ? styles.navActive : ""} onClick={() => setSection("Dashboard")}><span>⌘</span>Overview</button><button className={section === "Portfolio" ? styles.navActive : ""} onClick={() => setSection("Portfolio")}><span>◔</span>Portfolio</button><button className={section === "Bots" ? styles.navActive : ""} onClick={() => setSection("Bots")}><span>▣</span>Automations</button><button className={section === "Active Positions" || section === "Closed Positions" ? styles.navActive : ""} onClick={() => setSection("Active Positions")}><span>•</span>Positions</button>';
if (!source.includes(oldNav)) throw new Error("Trader structure refactor could not find the final navigation block");
source = source.replace(oldNav, newNav); changes += 1;

source = replaceAllTracked(source, '<small>{section.toUpperCase()}</small>', '<small>{section === "Dashboard" ? "OVERVIEW" : section === "Bots" ? "AUTOMATIONS" : section === "Active Positions" || section === "Closed Positions" ? "POSITIONS" : section.toUpperCase()}</small>', "topbar section identity");
source = replaceAllTracked(source, '<h1>Dashboard</h1>', '<h1>Overview</h1>', "overview heading");
source = replaceAllTracked(source, '<h2>Recent DCA bots</h2>', '<h2>Recent automations</h2>', "recent automations");
source = replaceAllTracked(source, '<h1>Trading Bots</h1>', '<h1>Automations</h1>', "automations heading");
source = replaceAllTracked(source, '<small>DCA BOTS</small>', '<small>AUTOMATIONS · DCA</small>', "automations eyebrow");
source = replaceAllTracked(source, '＋ Create DCA Bot', '＋ New DCA Strategy', "new strategy action");
source = replaceAllTracked(source, '<span>Total DCA PnL</span>', '<span>Automation PnL</span>', "automation pnl");
source = replaceAllTracked(source, '<span>Active bots</span>', '<span>Active automations</span>', "automation count");
source = replaceAllTracked(source, '>Active bots <span>{activeBots.length}</span>', '>Running / paused <span>{activeBots.length}</span>', "active automation tab");
source = replaceAllTracked(source, '>Closed bots <span>{closedBots.length}</span>', '>Archived <span>{closedBots.length}</span>', "closed automation tab");
source = replaceAllTracked(source, '<span>Bot</span><span>Pair</span><span>Trades</span><span>Capital</span><span>PnL</span><span>Status</span>', '<span>Automation</span><span>Market</span><span>Positions</span><span>Capital plan</span><span>PnL</span><span>Status</span>', "automation table headings");

const oldPositionsHeading = '<div className={styles.pageHeading}><div><small>DCA BOTS · POSITIONS</small><h1>{tradeState} Positions</h1></div></div>';
const newPositionsHeading = '<div className={styles.pageHeading}><div><small>POSITIONS</small><h1>Positions</h1></div></div><div className={dca.botToolbar}><div className={dca.botTabs}><button className={tradeState === "Active" ? dca.tabActive : ""} onClick={() => setSection("Active Positions")}>Open <span>{activeTrades.length}</span></button><button className={tradeState === "Closed" ? dca.tabActive : ""} onClick={() => setSection("Closed Positions")}>Closed <span>{closedTrades.length}</span></button></div></div>';
if (!source.includes(oldPositionsHeading)) throw new Error("Trader structure refactor could not find Positions heading");
source = source.replace(oldPositionsHeading, newPositionsHeading); changes += 1;

// The dedicated DCA configurator keeps all existing backend field names and API payloads.
// Only its information architecture and visible product language change.
const oldStrategyBlock = '<section className={cfg.card}><div className={cfg.cardHead}><div><h3>Main settings</h3><p>Name, order size and maximum number of positions the bot may run at the same time.</p></div></div><div className={cfg.grid}><label><span>Bot name</span><input value={form.name} onChange={e=>setForm(v=>({...v,name:e.target.value}))}/></label><label><span>Base order</span><div className={cfg.unit}><input type="number" min="1" step="0.01" value={form.baseOrder} onChange={e=>setForm(v=>({...v,baseOrder:Number(e.target.value)}))}/><b>USDT</b></div></label><label><span>Max simultaneous trades</span><input type="number" min="1" max="20" value={form.maxActiveTrades} onChange={e=>setForm(v=>({...v,maxActiveTrades:Math.max(1,Math.min(20,Number(e.target.value)))}))}/><small>Across the bot’s selected coin universe.</small></label><label><span>Direction</span><input value="Long" disabled/></label></div></section>';
const newStrategyBlock = '<section className={cfg.card}><div className={cfg.cardHead}><div><h3>Strategy</h3><p>Name this automation and define how many positions it may manage at once.</p></div></div><div className={cfg.grid}><label><span>Strategy name</span><input value={form.name} onChange={e=>setForm(v=>({...v,name:e.target.value}))}/></label><label><span>Maximum active positions</span><input type="number" min="1" max="20" value={form.maxActiveTrades} onChange={e=>setForm(v=>({...v,maxActiveTrades:Math.max(1,Math.min(20,Number(e.target.value)))}))}/><small>Across the selected market universe.</small></label><label><span>Direction</span><input value="Long" disabled/></label></div></section>';
if (!configurator.includes(oldStrategyBlock)) throw new Error("DCA structure refactor could not find Strategy block");
configurator = configurator.replace(oldStrategyBlock, newStrategyBlock); configuratorChanges += 1;

const oldCapitalBlock = '<section className={cfg.card}><div className={cfg.cardHead}><div><h3>Averaging orders</h3><p>Configure the safety-order ladder and how much of it stays active at once.</p></div></div><div className={cfg.grid}><label><span>Safety order</span><div className={cfg.unit}><input type="number" min="1" step="0.01" value={form.safetyOrder} onChange={e=>setForm(v=>({...v,safetyOrder:Number(e.target.value)}))}/><b>USDT</b></div></label><label><span>Max safety orders</span><input type="number" min="0" max="50" value={form.maxSafetyOrders} onChange={e=>{const max=Math.max(0,Math.min(50,Number(e.target.value)));setForm(v=>({...v,maxSafetyOrders:max,limitSafetyOrders:max===0?0:Math.min(max,Math.max(1,v.limitSafetyOrders))}));}}/></label><label><span>Active safety orders</span><input type="number" min="0" max={form.maxSafetyOrders} value={form.limitSafetyOrders} onChange={e=>setForm(v=>({...v,limitSafetyOrders:v.maxSafetyOrders===0?0:Math.min(v.maxSafetyOrders,Math.max(1,Number(e.target.value)))}))}/></label><label><span>Price deviation</span><div className={cfg.unit}><input type="number" min="0.1" step="0.1" value={form.deviation} onChange={e=>setForm(v=>({...v,deviation:Number(e.target.value)}))}/><b>%</b></div></label><label><span>Step scale</span><input type="number" min="0.1" step="0.1" value={form.stepScale} onChange={e=>setForm(v=>({...v,stepScale:Number(e.target.value)}))}/></label><label><span>Volume scale</span><input type="number" min="0.1" step="0.1" value={form.volumeScale} onChange={e=>setForm(v=>({...v,volumeScale:Number(e.target.value)}))}/></label></div></section>';
const newCapitalBlock = '<section className={cfg.card}><div className={cfg.cardHead}><div><h3>Capital Plan</h3><p>Build the complete entry ladder and see exactly how capital expands as price moves.</p></div></div><div className={cfg.grid}><label><span>Initial order</span><div className={cfg.unit}><input type="number" min="1" step="0.01" value={form.baseOrder} onChange={e=>setForm(v=>({...v,baseOrder:Number(e.target.value)}))}/><b>USDT</b></div></label><label><span>DCA order size</span><div className={cfg.unit}><input type="number" min="1" step="0.01" value={form.safetyOrder} onChange={e=>setForm(v=>({...v,safetyOrder:Number(e.target.value)}))}/><b>USDT</b></div></label><label><span>Maximum DCA orders</span><input type="number" min="0" max="50" value={form.maxSafetyOrders} onChange={e=>{const max=Math.max(0,Math.min(50,Number(e.target.value)));setForm(v=>({...v,maxSafetyOrders:max,limitSafetyOrders:max===0?0:Math.min(max,Math.max(1,v.limitSafetyOrders))}));}}/></label><label><span>Active DCA orders</span><input type="number" min="0" max={form.maxSafetyOrders} value={form.limitSafetyOrders} onChange={e=>setForm(v=>({...v,limitSafetyOrders:v.maxSafetyOrders===0?0:Math.min(v.maxSafetyOrders,Math.max(1,Number(e.target.value)))}))}/></label><label><span>First DCA trigger</span><div className={cfg.unit}><input type="number" min="0.1" step="0.1" value={form.deviation} onChange={e=>setForm(v=>({...v,deviation:Number(e.target.value)}))}/><b>%</b></div></label><label><span>Price step multiplier</span><input type="number" min="0.1" step="0.1" value={form.stepScale} onChange={e=>setForm(v=>({...v,stepScale:Number(e.target.value)}))}/></label><label><span>Order size multiplier</span><input type="number" min="0.1" step="0.1" value={form.volumeScale} onChange={e=>setForm(v=>({...v,volumeScale:Number(e.target.value)}))}/></label></div></section>';
if (!configurator.includes(oldCapitalBlock)) throw new Error("DCA structure refactor could not find Capital Plan block");
configurator = configurator.replace(oldCapitalBlock, newCapitalBlock); configuratorChanges += 1;

const configuratorReplacements = [
  ['<h3>Coins</h3>', '<h3>Market</h3>'],
  ['Use every Binance Spot USDT pair or build a custom market list.', 'Choose where this strategy is allowed to operate.'],
  ['<h3>Entry conditions</h3>', '<h3>Entry Rule</h3>'],
  ['3Commas-style indicator filters. Conditions are combined with AND and evaluated on closed Binance candles.', 'Define when a new position may open. Multiple rules are combined with AND and evaluated on closed Binance candles.'],
  ['＋ Add condition', '＋ Add rule'],
  ['Condition {index+1}', 'Rule {index+1}'],
  ['No conditions: the bot may enter immediately when capacity and capital are available.', 'No entry rules: the strategy may open immediately when capacity and capital are available.'],
  ['<h3>Exit settings</h3>', '<h3>Exit Plan</h3>'],
  ['Take profit and optional stop loss for each new trade.', 'Define how each position realizes profit or limits downside.'],
  ['<span>Planned capital / trade</span>', '<span>Capital per position</span>'],
  ['<span>Max simultaneous trades</span>', '<span>Position capacity</span>'],
  ['<span>Maximum planned bot capital</span>', '<span>Maximum capital</span>'],
  ['<div className={cfg.previewHead}><span>#</span><span>Cumulative drop</span><span>Order amount</span><span>Window</span></div>', '<div className={cfg.previewHead}><span>Level</span><span>Trigger</span><span>Order</span><span>Status</span></div>'],
  ['<section className={cfg.preview}><div className={cfg.previewSummary}>', '<section className={cfg.preview}><div className={cfg.cardHead}><div><h3>Strategy Preview</h3><p>Review capital exposure and DCA coverage before launch.</p></div></div><div className={cfg.previewSummary}>'],
  ['Create DCA Bot', 'Launch DCA Strategy'],
  ['Save DCA Bot', 'Save Strategy'],
  ['Loading full DCA configuration…', 'Loading strategy…'],
  ['<span>Coin universe</span>', '<span>Market universe</span>'],
  ['<span>Max simultaneous trades</span>', '<span>Position capacity</span>'],
  ['<span>Entry conditions</span>', '<span>Entry rules</span>'],
  ['<span>Capital / trade</span>', '<span>Capital / position</span>'],
  ['The bot scans only these selected markets.', 'The strategy scans only these selected markets.'],
  ['The worker scans the complete Binance Spot USDT universe.', 'The strategy can scan the complete Binance Spot USDT universe.'],
  ['All configured conditions must be true on closed candles before a new trade opens.', 'All configured entry rules must be true on closed candles before a new position opens.'],
  ['Immediately — no indicator filter.', 'Immediate entry — no indicator rule.'],
  ['<h3>DCA orders</h3>', '<h3>Capital Plan</h3>'],
  ['<span>Base order</span>', '<span>Initial order</span>'],
  ['<span>Safety order</span>', '<span>DCA order size</span>'],
  ['<span>Max safety orders</span>', '<span>Maximum DCA orders</span>'],
  ['<span>Active safety orders</span>', '<span>Active DCA orders</span>'],
  ['<span>Deviation</span>', '<span>First DCA trigger</span>'],
  ['<span>Step scale</span>', '<span>Price step multiplier</span>'],
  ['<span>Volume scale</span>', '<span>Order size multiplier</span>'],
  ['<h3>Exit & capacity</h3>', '<h3>Exit Plan</h3>'],
  ['<span>Max active trades</span>', '<span>Maximum active positions</span>'],
  ['<span>Maximum planned bot capital</span>', '<span>Maximum capital</span>'],
  ['Coin selection cannot be changed while this bot has active trades. Its strategy, DCA and exit settings can still be edited.', 'Market selection cannot be changed while this automation has active positions. Its entry, capital and exit settings can still be edited.'],
];
for (const [from, to] of configuratorReplacements) configurator = replaceAllTracked(configurator, from, to, from, "configurator");

// Guard against competitor-specific or legacy visible wording being reintroduced.
const shellForbidden = [">Base order<", ">Safety order<", ">Max safety orders<", ">Active safety orders<", ">Price deviation<", ">Step scale<", ">Volume scale<", ">Main settings<", ">Averaging orders<", ">Exit settings<", ">Concurrency<"];
const configForbidden = ["3Commas-style", ">Base order<", ">Safety order<", ">Max safety orders<", ">Active safety orders<", ">Step scale<", ">Volume scale<", ">Main settings<", ">Averaging orders<", ">Exit settings<"];
const remainingShell = shellForbidden.filter((fragment) => source.includes(fragment));
const remainingConfigurator = configForbidden.filter((fragment) => configurator.includes(fragment));
if (remainingShell.length) throw new Error(`Trader structure transform incomplete: ${remainingShell.join(", ")}`);
if (remainingConfigurator.length) throw new Error(`DCA structure transform incomplete: ${remainingConfigurator.join(", ")}`);

fs.writeFileSync(traderPath, source);
fs.writeFileSync(configuratorPath, configurator);
console.log(`LabNarrative Trader structure prepared (${changes} shell groups, ${configuratorChanges} configurator groups; theme untouched).`);