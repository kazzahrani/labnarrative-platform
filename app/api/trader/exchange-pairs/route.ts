import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type Provider = "binance" | "bybit" | "okx" | "kraken" | "kucoin" | "coinbase";
type Pair = { pair: string; symbol: string; baseAsset: string };
const PROVIDERS = new Set<Provider>(["binance", "bybit", "okx", "kraken", "kucoin", "coinbase"]);
const FALLBACK = ["BTC/USDT","ETH/USDT","SOL/USDT","XRP/USDT","ADA/USDT","DOGE/USDT","LINK/USDT","AVAX/USDT","TRX/USDT","LTC/USDT","BCH/USDT","DOT/USDT","UNI/USDT","ATOM/USDT"];

function cleanBase(value: unknown) {
  const raw = String(value ?? "").toUpperCase().replace(/^XBT$/, "BTC").replace(/^XXBT$/, "BTC").replace(/^XETH$/, "ETH");
  return /^[A-Z0-9]{1,20}$/.test(raw) ? raw : "";
}
function unique(items: Pair[]) {
  const seen = new Set<string>();
  return items.filter(item => item.baseAsset && item.baseAsset !== "USDT" && !seen.has(item.pair) && seen.add(item.pair)).sort((a,b) => a.baseAsset.localeCompare(b.baseAsset));
}
async function getJson(url: string) {
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8500), headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`pair_source_${response.status}`);
  return await response.json() as any;
}
async function discover(provider: Provider): Promise<Pair[]> {
  if (provider === "binance") {
    const data = await getJson("https://data-api.binance.vision/api/v3/exchangeInfo");
    return unique((data.symbols ?? []).filter((x:any) => x.status === "TRADING" && x.quoteAsset === "USDT" && x.isSpotTradingAllowed !== false).map((x:any) => { const baseAsset=cleanBase(x.baseAsset); return { pair:`${baseAsset}/USDT`,symbol:String(x.symbol||""),baseAsset }; }));
  }
  if (provider === "bybit") {
    const data = await getJson("https://api.bybit.com/v5/market/instruments-info?category=spot&limit=1000");
    if (Number(data.retCode ?? -1) !== 0) throw new Error("bybit_pair_source_failed");
    return unique((data.result?.list ?? []).filter((x:any) => x.status === "Trading" && String(x.quoteCoin).toUpperCase() === "USDT").map((x:any) => { const baseAsset=cleanBase(x.baseCoin); return { pair:`${baseAsset}/USDT`,symbol:String(x.symbol||""),baseAsset }; }));
  }
  if (provider === "okx") {
    const data = await getJson("https://www.okx.com/api/v5/public/instruments?instType=SPOT");
    if (String(data.code) !== "0") throw new Error("okx_pair_source_failed");
    return unique((data.data ?? []).filter((x:any) => String(x.state).toLowerCase() === "live" && String(x.quoteCcy).toUpperCase() === "USDT").map((x:any) => { const baseAsset=cleanBase(x.baseCcy); return { pair:`${baseAsset}/USDT`,symbol:String(x.instId||""),baseAsset }; }));
  }
  if (provider === "kucoin") {
    const data = await getJson("https://api.kucoin.com/api/v2/symbols");
    if (String(data.code) !== "200000") throw new Error("kucoin_pair_source_failed");
    return unique((data.data ?? []).filter((x:any) => x.enableTrading !== false && String(x.quoteCurrency).toUpperCase() === "USDT").map((x:any) => { const baseAsset=cleanBase(x.baseCurrency); return { pair:`${baseAsset}/USDT`,symbol:String(x.symbol||""),baseAsset }; }));
  }
  if (provider === "kraken") {
    const data = await getJson("https://api.kraken.com/0/public/AssetPairs");
    if (Array.isArray(data.error) && data.error.length) throw new Error("kraken_pair_source_failed");
    return unique(Object.entries(data.result ?? {}).flatMap(([symbol, raw]:[string,any]) => { const ws=String(raw?.wsname||""); const [base,quote]=ws.split("/"); if (String(quote).toUpperCase() !== "USDT") return []; const baseAsset=cleanBase(base); return baseAsset ? [{pair:`${baseAsset}/USDT`,symbol,baseAsset}] : []; }));
  }
  const data = await getJson("https://api.exchange.coinbase.com/products");
  return unique((Array.isArray(data) ? data : []).filter((x:any) => String(x.quote_currency).toUpperCase() === "USDT" && x.trading_disabled !== true && !["offline","delisted"].includes(String(x.status).toLowerCase())).map((x:any) => { const baseAsset=cleanBase(x.base_currency); return {pair:`${baseAsset}/USDT`,symbol:String(x.id||""),baseAsset}; }));
}

export async function GET(request: NextRequest) {
  const raw = String(request.nextUrl.searchParams.get("provider") || "binance").toLowerCase() as Provider;
  const provider = PROVIDERS.has(raw) ? raw : "binance";
  try {
    const pairs = await discover(provider);
    if (!pairs.length) throw new Error("empty_pair_universe");
    return NextResponse.json({ ok:true, provider, pairs, source:provider }, { headers:{ "Cache-Control":"no-store" } });
  } catch {
    return NextResponse.json({ ok:true, provider, pairs:FALLBACK.map(pair => ({pair,symbol:pair.replace("/",""),baseAsset:pair.split("/")[0]})), source:"fallback" }, { headers:{ "Cache-Control":"no-store" } });
  }
}
