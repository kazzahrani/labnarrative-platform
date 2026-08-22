import fs from "node:fs";
import path from "node:path";

const traderPath = path.join(process.cwd(), "app/trader/TradingAgent.tsx");
let source = fs.readFileSync(traderPath, "utf8");

source = source.replace(
  'type Market = { symbol: string; label: string; price: number | null };\ntype RadarResponse = { opportunities?: Array<{ symbol: string; label: string; kind: string; price: number }> };',
  `type Market = {\n  symbol: string;\n  exchangeSymbol: string;\n  label: string;\n  quoteAsset: string;\n  price: number | null;\n  bid: number | null;\n  ask: number | null;\n  change24h: number;\n  quoteVolume24h: number;\n  high24h: number | null;\n  low24h: number | null;\n  minQty: number;\n  maxQty: number;\n  stepSize: number;\n  minNotional: number;\n  tickSize: number;\n};\ntype MarketResponse = { live: boolean; source: string; markets: Market[]; generatedAt: string; error?: string };`
);

source = source.replace(
`const FALLBACK_MARKETS: Market[] = [\n  { symbol: "BTC", label: "Bitcoin", price: null },\n  { symbol: "ETH", label: "Ethereum", price: null },\n  { symbol: "SOL", label: "Solana", price: null },\n  { symbol: "BNB", label: "BNB", price: null },\n];`,
`const FALLBACK_MARKETS: Market[] = [\n  { symbol: "BTC", exchangeSymbol: "BTCUSDT", label: "Bitcoin", quoteAsset: "USDT", price: null, bid: null, ask: null, change24h: 0, quoteVolume24h: 0, high24h: null, low24h: null, minQty: 0, maxQty: 0, stepSize: 0, minNotional: 0, tickSize: 0 },\n  { symbol: "ETH", exchangeSymbol: "ETHUSDT", label: "Ethereum", quoteAsset: "USDT", price: null, bid: null, ask: null, change24h: 0, quoteVolume24h: 0, high24h: null, low24h: null, minQty: 0, maxQty: 0, stepSize: 0, minNotional: 0, tickSize: 0 },\n  { symbol: "SOL", exchangeSymbol: "SOLUSDT", label: "Solana", quoteAsset: "USDT", price: null, bid: null, ask: null, change24h: 0, quoteVolume24h: 0, high24h: null, low24h: null, minQty: 0, maxQty: 0, stepSize: 0, minNotional: 0, tickSize: 0 },\n  { symbol: "BNB", exchangeSymbol: "BNBUSDT", label: "BNB", quoteAsset: "USDT", price: null, bid: null, ask: null, change24h: 0, quoteVolume24h: 0, high24h: null, low24h: null, minQty: 0, maxQty: 0, stepSize: 0, minNotional: 0, tickSize: 0 },\n];`
);

if (!source.includes("function floorToStep")) {
  source = source.replace(
    'function pct(value: number) { return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`; }',
    'function pct(value: number) { return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`; }\nfunction floorToStep(value: number, step: number) {\n  if (!step || step <= 0) return value;\n  const precision = Math.max(0, Math.ceil(-Math.log10(step)) + 2);\n  const units = Math.floor((value + Number.EPSILON) / step);\n  return Number((units * step).toFixed(precision));\n}'
  );
}

const stateAnchor = '  const [positionsOn, setPositionsOn] = useState(true);';
if (!source.includes("marketDataLive")) {
  source = source.replace(stateAnchor, `${stateAnchor}\n  const [marketDataLive, setMarketDataLive] = useState(false);\n  const [marketDataSource, setMarketDataSource] = useState("Binance Spot");\n  const [lastMarketUpdate, setLastMarketUpdate] = useState<string | null>(null);`);
}

const oldLoader = `    const loadMarkets = async () => {\n      try {\n        const response = await fetch("/api/trader/radar", { cache: "no-store" });\n        if (!response.ok) return;\n        const data = await response.json() as RadarResponse;\n        const crypto = (data.opportunities ?? []).filter((item) => item.kind === "Crypto").map((item) => ({ symbol: item.symbol, label: item.label, price: item.price }));\n        if (crypto.length) setMarkets(crypto);\n      } catch {}\n    };\n    void loadMarkets();`;
const newLoader = `    const loadMarkets = async () => {\n      try {\n        const response = await fetch("/api/trader/markets", { cache: "no-store" });\n        const data = await response.json() as MarketResponse;\n        if (!response.ok || !data.live || !data.markets.length) { setMarketDataLive(false); return; }\n        setMarkets(data.markets);\n        setMarketDataLive(true);\n        setMarketDataSource(data.source);\n        setLastMarketUpdate(data.generatedAt);\n        setSelectedSymbol((current) => data.markets.some((item) => item.symbol === current) ? current : (data.markets[0]?.symbol ?? "BTC"));\n      } catch {\n        setMarketDataLive(false);\n      }\n    };\n    void loadMarkets();`;
source = source.replace(oldLoader, newLoader);

const persistenceAnchor = '  useEffect(() => { localStorage.setItem("labnarrative-smart-trades-v1", JSON.stringify(smartTrades)); }, [smartTrades]);';
if (!source.includes("Refresh the full Binance Spot universe")) {
  source = source.replace(persistenceAnchor, `  // Refresh the full Binance Spot universe for background portfolio/bot valuation.\n  useEffect(() => {\n    const refresh = window.setInterval(async () => {\n      try {\n        const response = await fetch("/api/trader/markets", { cache: "no-store" });\n        const data = await response.json() as MarketResponse;\n        if (!response.ok || !data.live || !data.markets.length) { setMarketDataLive(false); return; }\n        setMarkets(data.markets);\n        setMarketDataLive(true);\n        setMarketDataSource(data.source);\n        setLastMarketUpdate(data.generatedAt);\n      } catch { setMarketDataLive(false); }\n    }, 15000);\n    return () => window.clearInterval(refresh);\n  }, []);\n\n${persistenceAnchor}`);
}

const selectedAnchor = '  const selectedPrice = selectedMarket?.price ?? null;';
if (!source.includes("selected Binance book/ticker stream")) {
  source = source.replace(selectedAnchor, `${selectedAnchor}\n  // Keep the selected Binance pair genuinely live between REST refreshes.\n  useEffect(() => {\n    const exchangeSymbol = (selectedMarket?.exchangeSymbol || `${'${selectedSymbol}'}USDT`).toLowerCase();\n    let socket: WebSocket | null = null;\n    let retryTimer: number | null = null;\n    let stopped = false;\n\n    const connect = () => {\n      if (stopped) return;\n      socket = new WebSocket(`wss://data-stream.binance.vision:443/stream?streams=${'${exchangeSymbol}'}@miniTicker/${'${exchangeSymbol}'}@bookTicker`);\n      socket.onopen = () => setMarketDataLive(true);\n      socket.onmessage = (event) => {\n        try {\n          const message = JSON.parse(event.data) as { stream?: string; data?: Record<string, string> };\n          const data = message.data ?? {};\n          const stream = message.stream ?? "";\n          const price = stream.includes("miniTicker") ? Number(data.c) : undefined;\n          const bid = stream.includes("bookTicker") ? Number(data.b) : undefined;\n          const ask = stream.includes("bookTicker") ? Number(data.a) : undefined;\n          const open = stream.includes("miniTicker") ? Number(data.o) : undefined;\n          setMarkets((items) => items.map((item) => item.exchangeSymbol.toLowerCase() === exchangeSymbol ? {\n            ...item,\n            price: Number.isFinite(price) && price! > 0 ? price! : item.price,\n            bid: Number.isFinite(bid) && bid! > 0 ? bid! : item.bid,\n            ask: Number.isFinite(ask) && ask! > 0 ? ask! : item.ask,\n            change24h: Number.isFinite(price) && price! > 0 && Number.isFinite(open) && open! > 0 ? ((price! - open!) / open!) * 100 : item.change24h,\n          } : item));\n          setLastMarketUpdate(new Date().toISOString());\n        } catch {}\n      };\n      socket.onerror = () => setMarketDataLive(false);\n      socket.onclose = () => {\n        if (!stopped) {\n          setMarketDataLive(false);\n          retryTimer = window.setTimeout(connect, 2500);\n        }\n      };\n    };\n    connect();\n    return () => {\n      stopped = true;\n      if (retryTimer != null) window.clearTimeout(retryTimer);\n      socket?.close();\n    };\n  }, [selectedSymbol, selectedMarket?.exchangeSymbol]);`);
}

source = source.replace(
  '  const minUnits = selectedSymbol === "BTC" ? 0.00015 : selectedSymbol === "ETH" ? 0.0001 : 0.001;\n  const unitsTooSmall = smartUnits > 0 && smartUnits < minUnits;',
  '  const minUnits = selectedMarket?.minQty || 0;\n  const minNotional = selectedMarket?.minNotional || 0;\n  const unitsTooSmall = smartUnits > 0 && ((minUnits > 0 && smartUnits < minUnits) || (minNotional > 0 && orderTotal < minNotional));'
);

source = source.replace(
  '    if (price > 0) setSmartUnits((DEMO_BALANCE * value / 100) / price);',
  '    if (price > 0) setSmartUnits(floorToStep((DEMO_BALANCE * value / 100) / price, selectedMarket?.stepSize || 0));'
);

source = source.replace(
  '    if (smartUnits < minUnits) { setNotice(`Minimum paper order is ${minUnits} ${selectedSymbol}.`); return; }',
  '    if ((minUnits > 0 && smartUnits < minUnits) || (minNotional > 0 && total < minNotional)) { setNotice(`Binance minimum for ${selectedSymbol}/USDT is ${minUnits || "exchange-defined"} ${selectedSymbol} and ${minNotional || "exchange-defined"} USDT notional.`); return; }'
);

// Put live Binance bid/ask and status into the SmartTrade utility strip when the existing marker is present.
if (!source.includes("LIVE BINANCE")) {
  source = source.replace(
    '<div className={styles.smartUtilityToggles}>',
    '<div className={styles.smartUtilityToggles}><span style={{ color: marketDataLive ? "#20c7b7" : "#ff6b7a", fontSize: 11, fontWeight: 800 }}>{marketDataLive ? "● LIVE BINANCE" : "● MARKET DATA OFFLINE"}</span>'
  );
}

fs.writeFileSync(traderPath, source);
console.log("Prepared live Binance Spot market data integration for trader UI.");
