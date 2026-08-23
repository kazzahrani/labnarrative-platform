import fs from "node:fs";
import path from "node:path";

const traderPath = path.join(process.cwd(), "app/trader/TradingAgent.tsx");
let source = fs.readFileSync(traderPath, "utf8");

const outerReturnToken = '  return <main className={styles.appShell}>';
const outerReturnIndex = source.lastIndexOf(outerReturnToken);
if (outerReturnIndex < 0) throw new Error("Could not locate TradingAgent outer return for DCA exit enforcement.");

if (!source.includes("const enforceDcaExitAtPrice =")) {
  const block = [
    '  // DCA EXIT ENFORCEMENT — one source of truth for every paper TP / SL check.',
    '  const enforceDcaExitAtPrice = (trade: DcaTrade, bot: DcaBot | undefined, currentPrice: number, checkedAt = Date.now()): DcaTrade => {',
    '    if (!bot || trade.status !== "Active" || !Number.isFinite(currentPrice) || currentPrice <= 0) return trade;',
    '    const priceChanged = trade.lastPrice !== currentPrice;',
    '    let managed: DcaTrade = priceChanged ? { ...trade, lastPrice: currentPrice } : trade;',
    '',
    '    const effectiveTpPct = managed.takeProfitPct ?? bot.takeProfit ?? 0;',
    '    const effectiveStopEnabled = managed.stopEnabledOverride ?? bot.stopEnabled ?? false;',
    '    const effectiveStopPct = managed.stopPctOverride ?? bot.stopPct ?? 0;',
    '    const tpPrice = effectiveTpPct > 0 ? managed.averagePrice * (1 + effectiveTpPct / 100) : 0;',
    '    const slPrice = effectiveStopEnabled && effectiveStopPct > 0 ? managed.averagePrice * (1 - effectiveStopPct / 100) : 0;',
    '',
    '    const stopHit = slPrice > 0 && currentPrice <= slPrice;',
    '    const holdExpired = Boolean(managed.maxHoldEnabled && managed.maxHoldHours && checkedAt - new Date(managed.createdAt).getTime() >= managed.maxHoldHours * 3600000);',
    '',
    '    let trailingPeakPrice = managed.trailingPeakPrice;',
    '    if (managed.trailingEnabled && tpPrice > 0 && currentPrice >= tpPrice) {',
    '      trailingPeakPrice = Math.max(trailingPeakPrice ?? currentPrice, currentPrice);',
    '      if (trailingPeakPrice !== managed.trailingPeakPrice) managed = { ...managed, trailingPeakPrice };',
    '    }',
    '    const trailingDeviationPct = managed.trailingDeviationPct ?? 0.2;',
    '    const trailingTpHit = Boolean(managed.trailingEnabled && trailingPeakPrice && currentPrice <= trailingPeakPrice * (1 - trailingDeviationPct / 100));',
    '    const directTpHit = Boolean(!managed.trailingEnabled && tpPrice > 0 && currentPrice >= tpPrice);',
    '',
    '    if (!stopHit && !directTpHit && !trailingTpHit && !holdExpired) return managed;',
    '',
    '    const closeReason = stopHit ? "Stop Loss" : holdExpired ? "Maximum hold period" : managed.trailingEnabled ? "Trailing Take Profit" : "Take Profit";',
    '    return {',
    '      ...managed,',
    '      status: "Closed",',
    '      closedAt: new Date(checkedAt).toISOString(),',
    '      exitPrice: currentPrice,',
    '      realizedPnl: (currentPrice - managed.averagePrice) * managed.quantity,',
    '      closeReason,',
    '      lastPrice: currentPrice,',
    '    };',
    '  };',
    '',
    '  // Re-check every active DCA deal whenever the live Binance universe changes.',
    '  // This is deliberately separate from the older 5-second manager so an exit',
    '  // cannot be missed because of a stale bot setting or a single failed request.',
    '  useEffect(() => {',
    '    if (!markets.length) return;',
    '    const prices = new Map(markets.filter((market) => market.price != null && Number.isFinite(market.price) && (market.price ?? 0) > 0).map((market) => [market.symbol, market.price as number]));',
    '    setDcaTrades((items) => {',
    '      let changed = false;',
    '      const next = items.map((trade) => {',
    '        if (trade.status !== "Active") return trade;',
    '        const price = prices.get(trade.pair.split("/")[0]);',
    '        if (!price) return trade;',
    '        const bot = dcaBots.find((candidate) => candidate.id === trade.botId);',
    '        const updated = enforceDcaExitAtPrice(trade, bot, price);',
    '        if (updated !== trade) changed = true;',
    '        return updated;',
    '      });',
    '      return changed ? next : items;',
    '    });',
    '  }, [markets, dcaBots]);',
    '',
  ].join("\n");
  source = source.slice(0, outerReturnIndex) + block + source.slice(outerReturnIndex);
}

// Manual Refresh must execute exits, not merely repaint the displayed last price.
source = source.replace(
  'return refreshedPrice ? { ...trade, lastPrice: refreshedPrice } : trade;',
  'return refreshedPrice ? enforceDcaExitAtPrice(trade, dcaBots.find((candidate) => candidate.id === trade.botId), refreshedPrice) : trade;'
);

// Add a final safety gate inside the legacy 5-second DCA manager before any new
// averaging order can be placed. This catches per-trade TP/SL overrides even if an
// earlier transform left the manager comparing against the parent bot settings.
if (!source.includes("DCA_EXIT_SAFETY_GATE")) {
  const averagingAnchor = '            if (item.averagingFilled < item.maxAveraging) {';
  if (source.includes(averagingAnchor)) {
    source = source.replace(
      averagingAnchor,
      [
        '            // DCA_EXIT_SAFETY_GATE',
        '            const exitChecked = enforceDcaExitAtPrice(item, bot, currentPrice);',
        '            if (exitChecked.status === "Closed") return exitChecked;',
        averagingAnchor,
      ].join("\n")
    );
  }
}

if (!source.includes("const enforceDcaExitAtPrice =")) throw new Error("DCA exit evaluator was not installed.");
if (!source.includes("DCA_EXIT_SAFETY_GATE")) throw new Error("DCA manager safety exit gate was not installed.");
if (!source.includes("enforceDcaExitAtPrice(trade, dcaBots.find")) throw new Error("Manual DCA Refresh does not execute exits.");

fs.writeFileSync(traderPath, source);
console.log("Enforced DCA TP/SL exits on every live market tick, manager cycle and manual refresh.");
