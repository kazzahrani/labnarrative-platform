import fs from "node:fs";
import path from "node:path";

const filePath=path.join(process.cwd(),"app/trader/DcaTradeChartV2Workstation.tsx");
let source=fs.readFileSync(filePath,"utf8");

const tradeType=/(type ChartTrade = \{)([\s\S]*?)(\n\};)/;
const match=source.match(tradeType);
if(!match)throw new Error("Multi-exchange chart: ChartTrade type not found");
if(!/\bexchangeProvider\s*:/.test(match[2]))source=source.replace(tradeType,`$1$2\n  exchangeProvider: "binance" | "bybit" | "okx" | "kucoin";$3`);

if(!source.includes('exchangeProvider: "binance",')){
  const fallback='id: tradeId, pair: props.pair, status: props.status, entryPrice: props.entryPrice, averagePrice: props.averagePrice,';
  if(!source.includes(fallback))throw new Error("Multi-exchange chart: fallback trade not found");
  source=source.replace(fallback,'id: tradeId, pair: props.pair, status: props.status, exchangeProvider: "binance", entryPrice: props.entryPrice, averagePrice: props.averagePrice,');
}

source=source.replace(
  'const params = new URLSearchParams({ symbol, interval, bars: String(HISTORY_BARS[interval]), endTime: String(Date.now()) });',
  'const params = new URLSearchParams({ provider: trade.exchangeProvider, symbol, interval, bars: String(HISTORY_BARS[interval]), endTime: String(Date.now()) });',
);
source=source.replaceAll('/api/trader/klines?${params.toString()}', '/api/trader/exchange-klines?${params.toString()}');
source=source.replaceAll('Unable to load Binance candles','Unable to load exchange candles');
source=source.replace('  }, [symbol, interval]);','  }, [symbol, interval, trade.exchangeProvider]);');
source=source.replaceAll('· BINANCE ·','· {trade.exchangeProvider.toUpperCase()} ·');
source=source.replaceAll('Loading Binance candles and exact trade ledger…','Loading exchange candles and exact trade ledger…');

if(!source.includes('provider: trade.exchangeProvider'))throw new Error("Multi-exchange chart: provider candle request not installed");
if(!source.includes('/api/trader/exchange-klines?'))throw new Error("Multi-exchange chart: exchange candle endpoint not installed");
if(source.includes('· BINANCE ·'))throw new Error("Multi-exchange chart: Binance-only chart label remains");

fs.writeFileSync(filePath,source);
console.log("Trader provider-aware chart UI applied");
