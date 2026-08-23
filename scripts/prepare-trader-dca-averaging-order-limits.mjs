import fs from "node:fs";
import path from "node:path";

const traderPath = path.join(process.cwd(), "app/trader/TradingAgent.tsx");
const cssPath = path.join(process.cwd(), "app/trader/trader.module.css");
let source = fs.readFileSync(traderPath, "utf8");
let css = fs.readFileSync(cssPath, "utf8");

// AVERAGING ORDER LIMITS V1
// maxSafetyOrders = total/lifetime averaging orders a deal may consume.
// limitSafetyOrders = maximum averaging limit orders simultaneously active/reserving funds.
if (!source.includes("  limitSafetyOrders?: number;")) {
  source = source.replace(
    "  maxSafetyOrders: number;\n  maxActiveTrades?: number;",
    "  maxSafetyOrders: number;\n  limitSafetyOrders?: number;\n  maxActiveTrades?: number;"
  );
}

if (!source.includes("const [limitSafetyOrders, setLimitSafetyOrders]")) {
  source = source.replace(
    '  const [maxSafetyOrders, setMaxSafetyOrders] = useState(5);',
    '  const [maxSafetyOrders, setMaxSafetyOrders] = useState(5);\n  const [limitSafetyOrders, setLimitSafetyOrders] = useState(5);'
  );
}

if (!source.includes("setLimitSafetyOrders(Math.max(1, Math.min(bot.maxSafetyOrders")) {
  source = source.replace(
    '    setMaxSafetyOrders(bot.maxSafetyOrders);\n    setMaxActiveTrades(Math.max(1, bot.maxActiveTrades ?? 1));',
    '    setMaxSafetyOrders(bot.maxSafetyOrders);\n    setLimitSafetyOrders(Math.max(1, Math.min(bot.maxSafetyOrders, bot.limitSafetyOrders ?? bot.maxSafetyOrders)));\n    setMaxActiveTrades(Math.max(1, bot.maxActiveTrades ?? 1));'
  );
}

const creatorStart = source.indexOf('  const createConfiguredDcaBot = () => {');
const creatorEnd = source.indexOf('  const handleGlobalSearch = (value: string) => {', creatorStart);
if (creatorStart >= 0 && creatorEnd > creatorStart) {
  let creator = source.slice(creatorStart, creatorEnd);
  creator = creator.replaceAll(
    '        maxSafetyOrders,\n        maxActiveTrades,',
    '        maxSafetyOrders,\n        limitSafetyOrders: Math.max(1, Math.min(maxSafetyOrders, limitSafetyOrders)),\n        maxActiveTrades,'
  );
  source = source.slice(0, creatorStart) + creator + source.slice(creatorEnd);
}

const oldFields = [
  '                <label><span>Averaging orders per trade ⓘ</span><input type="number" value={maxSafetyOrders} onChange={(e) => setMaxSafetyOrders(clamp(Number(e.target.value), 1, 20))}/></label>',
  '                <label><span>Limit averaging orders placed on exchange ⓘ</span><input type="number" value={maxSafetyOrders} onChange={(e) => setMaxSafetyOrders(clamp(Number(e.target.value), 1, 20))}/></label>',
].join('\n');
const newFields = [
  '                <label><span className={styles.dcaTooltipLabel}>Averaging orders per trade <i className={styles.dcaInfoIcon}>ⓘ<span className={styles.dcaInfoTooltip}><strong>Averaging orders per trade</strong><span>This is the total number of averaging orders the bot is allowed to use during one trade.</span><span>Every averaging order is created as a limit order. Once this total has been filled, no additional automatic averaging order can be used for that deal.</span></span></i></span><input type="number" min={1} max={20} value={maxSafetyOrders} onChange={(e) => { const next = clamp(Math.round(Number(e.target.value) || 1), 1, 20); setMaxSafetyOrders(next); setLimitSafetyOrders((current) => Math.min(current, next)); }}/></label>',
  '                <label><span className={styles.dcaTooltipLabel}>Limit averaging orders placed on exchange <i className={styles.dcaInfoIcon}>ⓘ<span className={styles.dcaInfoTooltip + " " + styles.dcaInfoTooltipWide}><strong>Limit averaging orders placed on exchange</strong><span>Defines how many averaging limit orders the bot may keep active simultaneously on the exchange order book.</span><span>A lower number keeps more USDT free. A higher number reserves more funds but keeps more DCA levels ready to fill immediately when price moves.</span><span><b>Example:</b> If a trade allows 7 averaging orders and this limit is 3, only 3 are active at once. When one fills, the next planned averaging order is activated so the bot keeps up to 3 open until all 7 are used.</span></span></i></span><input type="number" min={1} max={maxSafetyOrders} value={limitSafetyOrders} onChange={(e) => setLimitSafetyOrders(clamp(Math.round(Number(e.target.value) || 1), 1, maxSafetyOrders))}/></label>',
].join('\n');
if (source.includes(oldFields)) source = source.replace(oldFields, newFields);
source = source.replace(
  '<label><span>Averaging orders per trade ⓘ</span><input type="number" value={maxSafetyOrders} onChange={(e) => setMaxSafetyOrders(clamp(Number(e.target.value), 1, 20))}/></label>',
  newFields.split('\n')[0]
);
source = source.replace(
  '<label><span>Limit averaging orders placed on exchange ⓘ</span><input type="number" value={maxSafetyOrders} onChange={(e) => setMaxSafetyOrders(clamp(Number(e.target.value), 1, 20))}/></label>',
  newFields.split('\n')[1]
);

const fundsAnchor = '  const dcaFundsLocked = activeDcaTrades.reduce((sum, trade) => sum + trade.invested, 0);';
if (source.includes(fundsAnchor) && !source.includes('const dcaAveragingOrderPrice =')) {
  const block = [
    '  const dcaAveragingOrderDeviation = (bot: DcaBot, orderIndex: number) => {',
    '    let cumulative = 0;',
    '    let step = Math.max(0.000001, bot.deviation);',
    '    for (let index = 0; index <= orderIndex; index += 1) { cumulative += step; step *= Math.max(0.000001, bot.stepScale); }',
    '    return cumulative;',
    '  };',
    '  const dcaAveragingOrderPrice = (bot: DcaBot, entryPrice: number, orderIndex: number) => entryPrice * (1 - dcaAveragingOrderDeviation(bot, orderIndex) / 100);',
    '  const dcaAveragingOrderAmount = (bot: DcaBot, orderIndex: number) => bot.safetyOrder * Math.pow(Math.max(0.000001, bot.volumeScale), orderIndex);',
    '  const dcaAveragingOrderLimit = (bot: DcaBot, trade: DcaTrade) => {',
    '    const remaining = Math.max(0, Math.min(trade.maxAveraging, bot.maxSafetyOrders) - trade.averagingFilled);',
    '    const configured = Math.max(1, Math.min(bot.maxSafetyOrders, bot.limitSafetyOrders ?? bot.maxSafetyOrders));',
    '    return Math.min(remaining, configured);',
    '  };',
    '  const dcaPendingAveragingReserveForTrade = (trade: DcaTrade) => {',
    '    const bot = dcaBots.find((candidate) => candidate.id === trade.botId);',
    '    if (!bot || trade.status !== "Active") return 0;',
    '    const activePending = dcaAveragingOrderLimit(bot, trade);',
    '    let reserved = 0;',
    '    for (let offset = 0; offset < activePending; offset += 1) reserved += dcaAveragingOrderAmount(bot, trade.averagingFilled + offset);',
    '    return reserved;',
    '  };',
    '  const dcaPendingAveragingReserved = activeDcaTrades.reduce((sum, trade) => sum + dcaPendingAveragingReserveForTrade(trade), 0);',
    '  const dcaFundsLocked = activeDcaTrades.reduce((sum, trade) => sum + trade.invested, 0) + dcaPendingAveragingReserved;',
  ].join('\n');
  source = source.replace(fundsAnchor, block);
}

// Inject exchange-style active limit-order execution before the legacy single-order branch,
// then disable that legacy branch. This preserves surrounding TP/SL safety logic.
const managerAnchor = '            if (item.averagingFilled < item.maxAveraging) {';
if (source.includes(managerAnchor) && !source.includes('DCA_ACTIVE_AVERAGING_WINDOW_V1')) {
  const managerLogic = [
    '            // DCA_ACTIVE_AVERAGING_WINDOW_V1',
    '            if (item.averagingFilled < item.maxAveraging) {',
    '              const totalAllowed = Math.max(0, Math.min(item.maxAveraging, bot.maxSafetyOrders));',
    '              const activePendingAtCycleStart = dcaAveragingOrderLimit(bot, item);',
    '              let filled = item.averagingFilled;',
    '              let quantity = item.quantity;',
    '              let invested = item.invested;',
    '              let fills = item.fills ?? [];',
    '              let fillsThisCycle = 0;',
    '              while (filled < totalAllowed && fillsThisCycle < activePendingAtCycleStart) {',
    '                const limitPrice = dcaAveragingOrderPrice(bot, item.entryPrice, filled);',
    '                if (!(limitPrice > 0) || currentPrice > limitPrice) break;',
    '                const orderAmount = dcaAveragingOrderAmount(bot, filled);',
    '                const extraQty = orderAmount / limitPrice;',
    '                quantity += extraQty;',
    '                invested += orderAmount;',
    '                fills = [...fills, { kind: "Averaging" as const, price: limitPrice, amount: orderAmount, quantity: extraQty, at: new Date().toISOString() }];',
    '                filled += 1;',
    '                fillsThisCycle += 1;',
    '              }',
    '              if (filled !== item.averagingFilled) return { ...marked, quantity, invested, averagePrice: invested / quantity, averagingFilled: filled, fills };',
    '            }',
    '            // Legacy one-at-a-time averaging is intentionally disabled; the active order window above is authoritative.',
    '            if (false && item.averagingFilled < item.maxAveraging) {',
  ].join('\n');
  source = source.replace(managerAnchor, managerLogic);
}

source = source.replace(
  '<div><span>Max averaging orders</span><strong>{bot.maxSafetyOrders}</strong></div>',
  '<div><span>Max averaging orders</span><strong>{bot.maxSafetyOrders}</strong></div><div><span>Active averaging order limit</span><strong>{Math.max(1, Math.min(bot.maxSafetyOrders, bot.limitSafetyOrders ?? bot.maxSafetyOrders))}</strong></div>'
);

if (!css.includes('/* DCA averaging-order tooltips */')) {
  css += `\n/* DCA averaging-order tooltips */\n.dcaTooltipLabel{display:inline-flex;align-items:center;gap:5px;overflow:visible}.dcaInfoIcon{position:relative;display:inline-grid;place-items:center;font-style:normal;color:#8ea4b1;font-size:12px;cursor:help;line-height:1}.dcaInfoTooltip{position:absolute;z-index:500;left:50%;bottom:calc(100% + 12px);transform:translateX(-50%);width:420px;max-width:min(420px,calc(100vw - 48px));display:flex;flex-direction:column;gap:9px;padding:14px 16px;border:1px solid #c7cdd1;border-radius:7px;background:#f1f2f3;color:#2c3236;box-shadow:0 14px 38px rgba(0,0,0,.38);font-size:13px;font-weight:400;line-height:1.45;white-space:normal;opacity:0;visibility:hidden;pointer-events:none;text-align:left}.dcaInfoTooltip:after{content:"";position:absolute;left:50%;bottom:-7px;width:12px;height:12px;background:#f1f2f3;border-right:1px solid #c7cdd1;border-bottom:1px solid #c7cdd1;transform:translateX(-50%) rotate(45deg)}.dcaInfoTooltip strong{color:#24292d;font-size:13px}.dcaInfoTooltip b{color:#24292d}.dcaInfoTooltipWide{width:455px;max-width:min(455px,calc(100vw - 48px))}.dcaInfoIcon:hover .dcaInfoTooltip,.dcaInfoIcon:focus-within .dcaInfoTooltip{opacity:1;visibility:visible}.dcaSection,.dcaSectionBody,.dcaTwoCol{overflow:visible!important}@media(max-width:760px){.dcaInfoTooltip,.dcaInfoTooltipWide{left:0;transform:translateX(-18px);width:min(360px,calc(100vw - 36px))}.dcaInfoTooltip:after{left:28px}}\n`;
}

if (!source.includes('limitSafetyOrders?: number;')) throw new Error('DCA simultaneous averaging-order limit was not added to the bot type.');
if (!source.includes('value={limitSafetyOrders}')) throw new Error('Separate Limit averaging orders field was not installed.');
if (!source.includes('DCA_ACTIVE_AVERAGING_WINDOW_V1')) throw new Error('Averaging-order execution window was not installed.');
if (!source.includes('dcaPendingAveragingReserved')) throw new Error('Pending averaging-order capital reservation was not installed.');
if (!source.includes('dcaAveragingOrderPrice')) throw new Error('Averaging limit-price planner was not installed.');

fs.writeFileSync(traderPath, source);
fs.writeFileSync(cssPath, css);
console.log('Added DCA averaging-order hover help and enforced total-vs-simultaneous order limits with live paper reservations.');
