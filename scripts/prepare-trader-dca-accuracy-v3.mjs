import fs from "node:fs";
import path from "node:path";

const traderPath = path.join(process.cwd(), "app/trader/TradingAgent.tsx");
let source = fs.readFileSync(traderPath, "utf8");

const scannerStart = source.indexOf('    const evaluateBots = async () => {');
const scannerEnd = source.indexOf('    void evaluateBots();', scannerStart);
if (scannerStart < 0 || scannerEnd <= scannerStart) throw new Error('DCA accuracy V3: scanner not found.');
let scanner = source.slice(scannerStart, scannerEnd);

// A pending base Limit order was fully reserved when it was placed. Filling it converts
// reserved cash into an active position; it must not require/subtract that cash again.
const pendingFundingCheck = 'if (!(livePrice > 0) || !(limitPrice > 0) || livePrice > limitPrice || availableCapital < bot.baseOrder) continue;';
if (!scanner.includes(pendingFundingCheck)) throw new Error('DCA accuracy V3: pending Limit funding check anchor missing.');
scanner = scanner.replace(pendingFundingCheck, 'if (!(livePrice > 0) || !(limitPrice > 0) || livePrice > limitPrice) continue;');

const pendingFillStart = scanner.indexOf('          for (const pair of pendingPairs) {');
const pendingFillEnd = scanner.indexOf('          if (activeForBot >= botMaxActiveTrades) continue;', pendingFillStart);
if (pendingFillStart < 0 || pendingFillEnd <= pendingFillStart) throw new Error('DCA accuracy V3: pending Limit fill block missing.');
let pendingBlock = scanner.slice(pendingFillStart, pendingFillEnd);
pendingBlock = pendingBlock.replace(' activeForBot += 1; availableCapital -= dcaRequiredCapitalForBot(bot);', ' activeForBot += 1;');
if (pendingBlock.includes('availableCapital -=')) throw new Error('DCA accuracy V3: pending Limit fill still double-debits capital.');
scanner = scanner.slice(0, pendingFillStart) + pendingBlock + scanner.slice(pendingFillEnd);

source = source.slice(0, scannerStart) + scanner + source.slice(scannerEnd);

// Use the best available ask for resting buy-Limit trigger/fill checks. The kline request
// remains a fallback only if there is no current Binance quote in the market cache.
const livePriceAnchor = [
  '    const livePriceForPair = async (pair: string) => {',
  '      const symbol = pair.replace("/", "");',
].join('\n');
if (!source.includes(livePriceAnchor)) throw new Error('DCA accuracy V3: live pair price helper missing.');
source = source.replace(
  livePriceAnchor,
  [
    '    const livePriceForPair = async (pair: string) => {',
    '      const quotedMarket = dcaMarketsRef.current.find((market) => market.symbol === pair.split("/")[0]);',
    '      if (quotedMarket?.ask && quotedMarket.ask > 0) return quotedMarket.ask;',
    '      const symbol = pair.replace("/", "");',
  ].join('\n')
);

// Stream both active-position pairs and resting base Limit-entry pairs. This lets a
// pending order react to the live Binance ask rather than waiting for a REST refresh.
const oldStreamKey = '  const activeDcaStreamKey = Array.from(new Set(activeDcaTrades.map((trade) => trade.pair.replace("/", "").toLowerCase()))).sort().join(",");';
const newStreamKey = [
  '  const activeDcaStreamKey = Array.from(new Set([',
  '    ...activeDcaTrades.map((trade) => trade.pair.replace("/", "").toLowerCase()),',
  '    ...dcaBots.flatMap((bot) => Object.keys(bot.pendingLimitEntries ?? {}).map((pair) => pair.replace("/", "").toLowerCase())),',
  '  ])).sort().join(",");',
].join('\n');
if (!source.includes(oldStreamKey)) throw new Error('DCA accuracy V3: active pair stream key missing.');
source = source.replace(oldStreamKey, newStreamKey);

if (source.includes('livePrice > limitPrice || availableCapital < bot.baseOrder')) throw new Error('DCA accuracy V3 guard: reserved Limit fill still depends on free capital.');
if (!source.includes('...dcaBots.flatMap((bot) => Object.keys(bot.pendingLimitEntries ?? {})')) throw new Error('DCA accuracy V3 guard: pending Limit pairs are not streamed.');

fs.writeFileSync(traderPath, source);
console.log('Prepared DCA accuracy V3: pending Limit fills convert reservations once and pending pairs use live Binance asks.');
