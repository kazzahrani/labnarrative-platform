import fs from "node:fs";
import path from "node:path";

const traderPath = path.join(process.cwd(), "app/trader/TradingAgent.tsx");
let source = fs.readFileSync(traderPath, "utf8");

const outerReturnToken = '  return <main className={styles.appShell}>';

if (!source.includes('const refreshDcaMarketsNow =')) {
  const outerReturnIndex = source.lastIndexOf(outerReturnToken);
  if (outerReturnIndex < 0) throw new Error('Could not locate TradingAgent outer return for DCA refresh actions.');

  const helper = [
    '  const refreshDcaMarketsNow = async (tradeId?: string) => {',
    '    const targetTrade = tradeId ? dcaTrades.find((trade) => trade.id === tradeId) ?? null : null;',
    '    if (tradeId && !targetTrade) { setNotice("DCA trade not found."); return; }',
    '    setNotice(targetTrade ? `Refreshing ${targetTrade.pair} from Binance...` : "Refreshing all active DCA trades from Binance...");',
    '    try {',
    '      const response = await fetch("/api/trader/markets?refresh=" + Date.now(), { cache: "no-store" });',
    '      const data = await response.json() as MarketResponse;',
    '      if (!response.ok || !data.live || !Array.isArray(data.markets) || !data.markets.length) throw new Error(data.error || "Market refresh failed");',
    '      const prices = new Map<string, number>();',
    '      for (const market of data.markets) {',
    '        if (typeof market.price === "number" && Number.isFinite(market.price) && market.price > 0) prices.set(market.symbol, market.price);',
    '      }',
    '      setMarkets(data.markets);',
    '      setMarketDataLive(true);',
    '      setMarketDataSource(data.source || "Binance Spot");',
    '      setLastMarketUpdate(data.generatedAt || new Date().toISOString());',
    '      setDcaTrades((items) => items.map((trade) => {',
    '        if (trade.status !== "Active" || (tradeId && trade.id !== tradeId)) return trade;',
    '        const symbol = trade.pair.split("/")[0];',
    '        const refreshedPrice = prices.get(symbol);',
    '        return refreshedPrice ? { ...trade, lastPrice: refreshedPrice } : trade;',
    '      }));',
    '      setNotice(targetTrade ? `${targetTrade.pair} refreshed from live Binance market data.` : "All active DCA trades and balances refreshed from live Binance market data.");',
    '    } catch {',
    '      setMarketDataLive(false);',
    '      setNotice("Could not refresh Binance market data. Please try again.");',
    '    }',
    '  };',
    '',
  ].join("\n");

  source = source.slice(0, outerReturnIndex) + helper + source.slice(outerReturnIndex);
}

source = source.replaceAll(
  'onClick={() => setNotice("DCA trade refreshed from live Binance market data.")}',
  'onClick={() => { void refreshDcaMarketsNow(trade.id); }}'
);

source = source.replaceAll(
  '<button>↻ Refresh</button>',
  '<button onClick={() => { void refreshDcaMarketsNow(); }}>↻ Refresh</button>'
);

if (!source.includes('void refreshDcaMarketsNow(trade.id)')) throw new Error('Row-level DCA Refresh handler was not wired.');
if (!source.includes('void refreshDcaMarketsNow();')) throw new Error('DCA Balances Refresh handler was not wired.');

fs.writeFileSync(traderPath, source);
console.log('Wired DCA Refresh buttons to live Binance market refreshes.');
