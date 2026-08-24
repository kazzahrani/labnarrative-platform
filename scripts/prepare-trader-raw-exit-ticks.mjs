import fs from "node:fs";
import path from "node:path";

const traderPath = path.join(process.cwd(), "app/trader/TradingAgent.tsx");
let source = fs.readFileSync(traderPath, "utf8");

if (!source.includes("DCA_RAW_EXIT_TICKS_V1")) {
  // Exit evaluator must consult the raw execution cache, not the throttled display array.
  const exitMarketOld = '    const exitMarket = markets.find((market) => market.symbol === trade.pair.split("/")[0]);';
  const exitMarketNew = '    const exitMarket = dcaMarketsRef.current.find((market) => market.symbol === trade.pair.split("/")[0]);';
  if (!source.includes(exitMarketOld)) throw new Error("Raw DCA exits: executable exit-market anchor missing.");
  source = source.replace(exitMarketOld, exitMarketNew);

  const queueRefAnchor = '  const marketUiLastTickRef = useRef<string | null>(null);';
  if (!source.includes(queueRefAnchor)) throw new Error("Raw DCA exits: professional market queue anchor missing.");
  source = source.replace(queueRefAnchor, [
    queueRefAnchor,
    '  // DCA_RAW_EXIT_TICKS_V1 — execution state is independent from display cadence.',
    '  const dcaRawTrailingPeakRef = useRef<Map<string, number>>(new Map());',
  ].join("\n"));

  const rawCacheAnchor = '    dcaMarketsRef.current = dcaMarketsRef.current.map((item) => item.exchangeSymbol.toUpperCase() === exchangeSymbol ? { ...item, ...clean } : item);';
  if (!source.includes(rawCacheAnchor)) throw new Error("Raw DCA exits: raw market cache update anchor missing.");
  const rawExecution = [
    rawCacheAnchor,
    '    const rawExitPrice = (clean.bid ?? clean.price) as number | undefined;',
    '    if (rawExitPrice && Number.isFinite(rawExitPrice) && rawExitPrice > 0) {',
    '      const rawSymbol = exchangeSymbol.endsWith("USDT") ? exchangeSymbol.slice(0, -4) : exchangeSymbol;',
    '      setDcaTrades((items) => {',
    '        let changed = false;',
    '        const next = items.map((trade) => {',
    '          if (trade.status !== "Active" || trade.pair.split("/")[0] !== rawSymbol) return trade;',
    '          const bot = dcaAuditBotsRef.current.find((candidate) => candidate.id === trade.botId);',
    '          if (!bot) return trade;',
    '          const rawPeak = dcaRawTrailingPeakRef.current.get(trade.id) ?? trade.trailingPeakPrice;',
    '          const candidate = rawPeak && rawPeak !== trade.trailingPeakPrice ? { ...trade, trailingPeakPrice: rawPeak } : trade;',
    '          const evaluated = enforceDcaExitAtPrice(candidate, bot, rawExitPrice);',
    '          if (evaluated.status === "Closed") {',
    '            dcaRawTrailingPeakRef.current.delete(trade.id);',
    '            changed = true;',
    '            return evaluated;',
    '          }',
    '          if (evaluated.trailingPeakPrice && evaluated.trailingPeakPrice !== rawPeak) {',
    '            dcaRawTrailingPeakRef.current.set(trade.id, evaluated.trailingPeakPrice);',
    '          }',
    '          // Do not write ordinary raw lastPrice/peak ticks into React state: display',
    '          // state is intentionally updated by the professional 2-second UI flush.',
    '          return trade;',
    '        });',
    '        return changed ? next : items;',
    '      });',
    '    }',
  ].join("\n");
  source = source.replace(rawCacheAnchor, rawExecution);
}

for (const token of [
  "DCA_RAW_EXIT_TICKS_V1",
  "dcaRawTrailingPeakRef",
  "const rawExitPrice = (clean.bid ?? clean.price)",
  "enforceDcaExitAtPrice(candidate, bot, rawExitPrice)",
  'const exitMarket = dcaMarketsRef.current.find',
]) {
  if (!source.includes(token)) throw new Error(`Raw DCA exits guard missing: ${token}`);
}

fs.writeFileSync(traderPath, source);
console.log("Prepared raw-tick DCA TP/SL/trailing/max-hold enforcement without UI jitter.");
