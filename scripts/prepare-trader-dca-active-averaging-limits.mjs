import fs from "node:fs";
import path from "node:path";

const traderPath = path.join(process.cwd(), "app/trader/TradingAgent.tsx");
let source = fs.readFileSync(traderPath, "utf8");

// ACTIVE DCA TRADE AVERAGING LIMITS V1
// An open deal can override both its lifetime averaging-order count and its simultaneous
// pending-order limit. These values must drive the paper engine, reservations and fills.

// When opening the Active Trade editor, inherit the deal override first, then the bot's
// configured simultaneous exchange-order limit.
source = source.replace(
  '      activeOrdersLimit: String(trade.activeOrdersLimit ?? Math.min(1, trade.maxAveraging || 1)),',
  '      activeOrdersLimit: String(trade.activeOrdersLimit ?? Math.max(1, Math.min(trade.maxAveraging || 1, bot?.limitSafetyOrders ?? bot?.maxSafetyOrders ?? 1))),'
);

// Save clean, bounded per-deal values. Filled averaging orders can never be removed.
source = source.replace(
  '      const maxAveraging = Math.max(trade.averagingFilled, Number.isFinite(maxAveragingRaw) ? Math.max(0, Math.round(maxAveragingRaw)) : trade.maxAveraging);\n      const activeLimitRaw = Number(dcaTradeEditDraft.activeOrdersLimit);\n      const activeOrdersLimit = Math.max(0, Math.min(maxAveraging, Number.isFinite(activeLimitRaw) ? Math.round(activeLimitRaw) : (trade.activeOrdersLimit ?? 1)));',
  '      const maxAveraging = Math.min(20, Math.max(trade.averagingFilled, Number.isFinite(maxAveragingRaw) ? Math.max(0, Math.round(maxAveragingRaw)) : trade.maxAveraging));\n      const activeLimitRaw = Number(dcaTradeEditDraft.activeOrdersLimit);\n      const fallbackActiveLimit = trade.activeOrdersLimit ?? dcaBots.find((candidate) => candidate.id === trade.botId)?.limitSafetyOrders ?? 1;\n      const activeOrdersLimit = maxAveraging <= 0 ? 0 : Math.max(1, Math.min(maxAveraging, Number.isFinite(activeLimitRaw) ? Math.round(activeLimitRaw) : fallbackActiveLimit));'
);

// Rename the two Active Trade fields to exactly match the DCA bot builder and add the
// same hover explanations. Keep the draft values independent.
source = source.replace(
  '<label><span>Orders</span><input inputMode="numeric" value={dcaTradeEditDraft.maxAveraging} onChange={(event) => setDcaTradeEditDraft((current) => ({ ...current, maxAveraging: event.target.value }))}/></label>',
  '<label><span className={styles.dcaTooltipLabel}>Averaging orders per trade <i className={styles.dcaInfoIcon}>ⓘ<span className={styles.dcaInfoTooltip}><strong>Averaging orders per trade</strong><span>This is the total number of averaging orders this active trade is allowed to use.</span><span>Already filled averaging orders cannot be removed. Once the total is filled, no additional automatic averaging order is used for this deal.</span></span></i></span><input inputMode="numeric" type="number" min={editingDcaTrade.averagingFilled} max={20} value={dcaTradeEditDraft.maxAveraging} onChange={(event) => setDcaTradeEditDraft((current) => ({ ...current, maxAveraging: event.target.value }))}/></label>'
);
source = source.replace(
  '<label><span>Active orders limit</span><input inputMode="numeric" value={dcaTradeEditDraft.activeOrdersLimit} onChange={(event) => setDcaTradeEditDraft((current) => ({ ...current, activeOrdersLimit: event.target.value }))}/></label>',
  '<label><span className={styles.dcaTooltipLabel}>Limit averaging orders placed on exchange <i className={styles.dcaInfoIcon}>ⓘ<span className={styles.dcaInfoTooltip + " " + styles.dcaInfoTooltipWide}><strong>Limit averaging orders placed on exchange</strong><span>Defines how many averaging limit orders this active trade may keep pending simultaneously.</span><span>A lower number keeps more USDT free. A higher number reserves more funds and keeps more DCA levels ready to fill immediately.</span><span><b>Example:</b> If this trade allows 7 averaging orders and the limit is 3, only 3 are active at once. When one fills, the next planned order becomes active until all 7 are used.</span></span></i></span><input inputMode="numeric" type="number" min={1} max={Math.max(1, Number(dcaTradeEditDraft.maxAveraging) || 1)} value={dcaTradeEditDraft.activeOrdersLimit} onChange={(event) => setDcaTradeEditDraft((current) => ({ ...current, activeOrdersLimit: event.target.value }))}/></label>'
);
source = source.replace(
  '<small>Already filled averaging orders cannot be removed from this trade.</small>',
  '<small>Changes apply immediately to this active paper trade, including pending-order reservation and which DCA levels are eligible to fill.</small>'
);

// The per-trade simultaneous limit is authoritative. The bot setting is only the fallback
// for trades that pre-date this override.
source = source.replace(
  '    const remaining = Math.max(0, Math.min(trade.maxAveraging, bot.maxSafetyOrders) - trade.averagingFilled);\n    const configured = Math.max(1, Math.min(bot.maxSafetyOrders, bot.limitSafetyOrders ?? bot.maxSafetyOrders));\n    return Math.min(remaining, configured);',
  '    const remaining = Math.max(0, trade.maxAveraging - trade.averagingFilled);\n    const fallbackLimit = bot.limitSafetyOrders ?? bot.maxSafetyOrders;\n    const configured = Math.max(1, Math.min(Math.max(1, trade.maxAveraging), trade.activeOrdersLimit ?? fallbackLimit));\n    return Math.min(remaining, configured);'
);

// The Active Trade total-order override is also authoritative. This is what makes raising
// or lowering "Averaging orders per trade" on an open deal affect the engine immediately.
source = source.replace(
  '              const totalAllowed = Math.max(0, Math.min(item.maxAveraging, bot.maxSafetyOrders));',
  '              const totalAllowed = Math.max(0, item.maxAveraging);'
);

// Make the active row expose the actual live configuration where the existing OS summary exists.
source = source.replace(
  'OS: {trade.averagingFilled}, Max: {trade.maxAveraging}',
  'OS: {trade.averagingFilled}, Max: {trade.maxAveraging}, Active: {dcaAveragingOrderLimit(tradeBot!, trade)}'
);

if (!source.includes('Limit averaging orders placed on exchange <i className={styles.dcaInfoIcon}>')) throw new Error('Active-trade simultaneous-order field was not upgraded.');
if (!source.includes('trade.activeOrdersLimit ?? fallbackLimit')) throw new Error('Per-trade active averaging-order limit is not authoritative in the paper engine.');
if (!source.includes('const totalAllowed = Math.max(0, item.maxAveraging);')) throw new Error('Per-trade total averaging-order override is not authoritative in the paper engine.');
if (!source.includes('Changes apply immediately to this active paper trade')) throw new Error('Active-trade execution explanation was not installed.');

fs.writeFileSync(traderPath, source);
console.log('Applied real per-trade averaging-order total and simultaneous limits to DCA Active trades.');
