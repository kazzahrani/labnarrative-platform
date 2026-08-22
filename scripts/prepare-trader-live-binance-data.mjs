import fs from "node:fs";
import path from "node:path";

const traderPath = path.join(process.cwd(), "app/trader/TradingAgent.tsx");
let source = fs.readFileSync(traderPath, "utf8");

source = source.replace(
  'type Market = { symbol: string; label: string; price: number | null };\ntype RadarResponse = { opportunities?: Array<{ symbol: string; label: string; kind: string; price: number }> };',
  [
    'type Market = {',
    '  symbol: string;',
    '  exchangeSymbol: string;',
    '  label: string;',
    '  quoteAsset: string;',
    '  price: number | null;',
    '  bid: number | null;',
    '  ask: number | null;',
    '  change24h: number;',
    '  quoteVolume24h: number;',
    '  high24h: number | null;',
    '  low24h: number | null;',
    '  minQty: number;',
    '  maxQty: number;',
    '  stepSize: number;',
    '  minNotional: number;',
    '  tickSize: number;',
    '};',
    'type MarketResponse = { live: boolean; source: string; markets: Market[]; generatedAt: string; error?: string };',
  ].join('\n')
);

source = source.replace(
  [
    'const FALLBACK_MARKETS: Market[] = [',
    '  { symbol: "BTC", label: "Bitcoin", price: null },',
    '  { symbol: "ETH", label: "Ethereum", price: null },',
    '  { symbol: "SOL", label: "Solana", price: null },',
    '  { symbol: "BNB", label: "BNB", price: null },',
    '];',
  ].join('\n'),
  [
    'const FALLBACK_MARKETS: Market[] = [',
    '  { symbol: "BTC", exchangeSymbol: "BTCUSDT", label: "Bitcoin", quoteAsset: "USDT", price: null, bid: null, ask: null, change24h: 0, quoteVolume24h: 0, high24h: null, low24h: null, minQty: 0, maxQty: 0, stepSize: 0, minNotional: 0, tickSize: 0 },',
    '  { symbol: "ETH", exchangeSymbol: "ETHUSDT", label: "Ethereum", quoteAsset: "USDT", price: null, bid: null, ask: null, change24h: 0, quoteVolume24h: 0, high24h: null, low24h: null, minQty: 0, maxQty: 0, stepSize: 0, minNotional: 0, tickSize: 0 },',
    '  { symbol: "SOL", exchangeSymbol: "SOLUSDT", label: "Solana", quoteAsset: "USDT", price: null, bid: null, ask: null, change24h: 0, quoteVolume24h: 0, high24h: null, low24h: null, minQty: 0, maxQty: 0, stepSize: 0, minNotional: 0, tickSize: 0 },',
    '  { symbol: "BNB", exchangeSymbol: "BNBUSDT", label: "BNB", quoteAsset: "USDT", price: null, bid: null, ask: null, change24h: 0, quoteVolume24h: 0, high24h: null, low24h: null, minQty: 0, maxQty: 0, stepSize: 0, minNotional: 0, tickSize: 0 },',
    '];',
  ].join('\n')
);

if (!source.includes("function floorToStep")) {
  source = source.replace(
    'function pct(value: number) { return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`; }',
    [
      'function pct(value: number) { return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`; }',
      'function floorToStep(value: number, step: number) {',
      '  if (!step || step <= 0) return value;',
      '  const precision = Math.max(0, Math.ceil(-Math.log10(step)) + 2);',
      '  const units = Math.floor((value + Number.EPSILON) / step);',
      '  return Number((units * step).toFixed(precision));',
      '}',
    ].join('\n')
  );
}

const stateAnchor = '  const [positionsOn, setPositionsOn] = useState(true);';
if (!source.includes("marketDataLive")) {
  source = source.replace(stateAnchor, [
    stateAnchor,
    '  const [marketDataLive, setMarketDataLive] = useState(false);',
    '  const [marketDataSource, setMarketDataSource] = useState("Binance Spot");',
    '  const [lastMarketUpdate, setLastMarketUpdate] = useState<string | null>(null);',
  ].join('\n'));
}

const oldLoader = [
  '    const loadMarkets = async () => {',
  '      try {',
  '        const response = await fetch("/api/trader/radar", { cache: "no-store" });',
  '        if (!response.ok) return;',
  '        const data = await response.json() as RadarResponse;',
  '        const crypto = (data.opportunities ?? []).filter((item) => item.kind === "Crypto").map((item) => ({ symbol: item.symbol, label: item.label, price: item.price }));',
  '        if (crypto.length) setMarkets(crypto);',
  '      } catch {}',
  '    };',
  '    void loadMarkets();',
].join('\n');
const newLoader = [
  '    const loadMarkets = async () => {',
  '      try {',
  '        const response = await fetch("/api/trader/markets", { cache: "no-store" });',
  '        const data = await response.json() as MarketResponse;',
  '        if (!response.ok || !data.live || !data.markets.length) { setMarketDataLive(false); return; }',
  '        setMarkets(data.markets);',
  '        setMarketDataLive(true);',
  '        setMarketDataSource(data.source);',
  '        setLastMarketUpdate(data.generatedAt);',
  '        setSelectedSymbol((current) => data.markets.some((item) => item.symbol === current) ? current : (data.markets[0]?.symbol ?? "BTC"));',
  '      } catch {',
  '        setMarketDataLive(false);',
  '      }',
  '    };',
  '    void loadMarkets();',
].join('\n');
source = source.replace(oldLoader, newLoader);

const persistenceAnchor = '  useEffect(() => { localStorage.setItem("labnarrative-smart-trades-v1", JSON.stringify(smartTrades)); }, [smartTrades]);';
if (!source.includes("Refresh the full Binance Spot universe")) {
  source = source.replace(persistenceAnchor, [
    '  // Refresh the full Binance Spot universe for background portfolio/bot valuation.',
    '  useEffect(() => {',
    '    const refresh = window.setInterval(async () => {',
    '      try {',
    '        const response = await fetch("/api/trader/markets", { cache: "no-store" });',
    '        const data = await response.json() as MarketResponse;',
    '        if (!response.ok || !data.live || !data.markets.length) { setMarketDataLive(false); return; }',
    '        setMarkets(data.markets);',
    '        setMarketDataLive(true);',
    '        setMarketDataSource(data.source);',
    '        setLastMarketUpdate(data.generatedAt);',
    '      } catch { setMarketDataLive(false); }',
    '    }, 15000);',
    '    return () => window.clearInterval(refresh);',
    '  }, []);',
    '',
    persistenceAnchor,
  ].join('\n'));
}

const selectedAnchor = '  const selectedPrice = selectedMarket?.price ?? null;';
if (!source.includes("selected Binance book/ticker stream")) {
  const liveBlock = [
    selectedAnchor,
    '  // Keep the selected Binance pair genuinely live between REST refreshes.',
    '  useEffect(() => {',
    '    const exchangeSymbol = (selectedMarket?.exchangeSymbol || (selectedSymbol + "USDT")).toLowerCase();',
    '    let socket: WebSocket | null = null;',
    '    let retryTimer: number | null = null;',
    '    let stopped = false;',
    '',
    '    const connect = () => {',
    '      if (stopped) return;',
    '      const streamUrl = "wss://data-stream.binance.vision:443/stream?streams=" + exchangeSymbol + "@miniTicker/" + exchangeSymbol + "@bookTicker";',
    '      socket = new WebSocket(streamUrl);',
    '      socket.onopen = () => setMarketDataLive(true);',
    '      socket.onmessage = (event) => {',
    '        try {',
    '          const message = JSON.parse(event.data) as { stream?: string; data?: Record<string, string> };',
    '          const data = message.data ?? {};',
    '          const stream = message.stream ?? "";',
    '          const price = stream.includes("miniTicker") ? Number(data.c) : NaN;',
    '          const bid = stream.includes("bookTicker") ? Number(data.b) : NaN;',
    '          const ask = stream.includes("bookTicker") ? Number(data.a) : NaN;',
    '          const open = stream.includes("miniTicker") ? Number(data.o) : NaN;',
    '          setMarkets((items) => items.map((item) => item.exchangeSymbol.toLowerCase() === exchangeSymbol ? {',
    '            ...item,',
    '            price: Number.isFinite(price) && price > 0 ? price : item.price,',
    '            bid: Number.isFinite(bid) && bid > 0 ? bid : item.bid,',
    '            ask: Number.isFinite(ask) && ask > 0 ? ask : item.ask,',
    '            change24h: Number.isFinite(price) && price > 0 && Number.isFinite(open) && open > 0 ? ((price - open) / open) * 100 : item.change24h,',
    '          } : item));',
    '          setLastMarketUpdate(new Date().toISOString());',
    '        } catch {}',
    '      };',
    '      socket.onerror = () => setMarketDataLive(false);',
    '      socket.onclose = () => {',
    '        if (!stopped) {',
    '          setMarketDataLive(false);',
    '          retryTimer = window.setTimeout(connect, 2500);',
    '        }',
    '      };',
    '    };',
    '    connect();',
    '    return () => {',
    '      stopped = true;',
    '      if (retryTimer != null) window.clearTimeout(retryTimer);',
    '      socket?.close();',
    '    };',
    '  }, [selectedSymbol, selectedMarket?.exchangeSymbol]);',
  ].join('\n');
  source = source.replace(selectedAnchor, liveBlock);
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

// Use the full Binance order rules for visual validation too, not only quantity minimums.
source = source.replaceAll('smartUnits < minUnits', 'unitsTooSmall');

// Use live best bid/ask rather than echoing last trade price for both sides.
source = source.replace(
  '<p className={styles.bidAsk}><b>Bid:</b> {money(selectedPrice)} <b>Ask:</b> {money(selectedPrice)}</p>',
  '<p className={styles.bidAsk}><b>Bid:</b> {money(selectedMarket?.bid ?? selectedPrice)} <b>Ask:</b> {money(selectedMarket?.ask ?? selectedPrice)}</p>'
);

// Make TradingView use the exact Binance exchange symbol returned by exchangeInfo.
source = source.replace(
  'symbol={tvSymbol(selectedSymbol)}',
  'symbol={"BINANCE:" + (selectedMarket?.exchangeSymbol ?? selectedSymbol + "USDT")}'
);

// Visible live-data state in the SmartTrade utility bar.
source = source.replace(
  'const UtilityBar = () => <div className={styles.smartToggleBar}><div>',
  'const UtilityBar = () => <div className={styles.smartToggleBar}><span title={lastMarketUpdate ? `Last update: ${lastMarketUpdate}` : marketDataSource} style={{ color: marketDataLive ? "#20c7b7" : "#ff6b7a", fontSize: 11, fontWeight: 800, whiteSpace: "nowrap" }}>{marketDataLive ? "● LIVE BINANCE" : "● MARKET DATA OFFLINE"}</span><div>'
);

fs.writeFileSync(traderPath, source);
console.log("Prepared live Binance Spot market data integration for trader UI.");
