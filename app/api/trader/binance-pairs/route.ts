import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const FALLBACK = [
  "BTC/USDT","ETH/USDT","BNB/USDT","SOL/USDT","XRP/USDT","ADA/USDT","DOGE/USDT","TRX/USDT","AVAX/USDT","LINK/USDT",
  "DOT/USDT","POL/USDT","LTC/USDT","BCH/USDT","UNI/USDT","ATOM/USDT","ETC/USDT","APT/USDT","ARB/USDT","OP/USDT","NEAR/USDT","FIL/USDT",
];

type ExchangeSymbol = {
  symbol?: string;
  baseAsset?: string;
  quoteAsset?: string;
  status?: string;
  isSpotTradingAllowed?: boolean;
};

export async function GET() {
  try {
    const response = await fetch("https://data-api.binance.vision/api/v3/exchangeInfo", {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`binance_exchange_info_${response.status}`);
    const data = await response.json() as { symbols?: ExchangeSymbol[] };
    const pairs = (data.symbols ?? [])
      .filter((item) => {
        const base = String(item.baseAsset ?? "").toUpperCase();
        return item.status === "TRADING"
          && item.quoteAsset === "USDT"
          && item.isSpotTradingAllowed !== false
          && /^[A-Z0-9]{1,20}$/.test(base);
      })
      .map((item) => ({
        pair: `${String(item.baseAsset).toUpperCase()}/USDT`,
        symbol: String(item.symbol ?? ""),
        baseAsset: String(item.baseAsset).toUpperCase(),
      }))
      .sort((a, b) => a.baseAsset.localeCompare(b.baseAsset));
    if (!pairs.length) throw new Error("empty_binance_pair_universe");
    return NextResponse.json({ ok: true, pairs, source: "binance" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({
      ok: true,
      pairs: FALLBACK.map((pair) => ({ pair, symbol: pair.replace("/", ""), baseAsset: pair.split("/")[0] })),
      source: "fallback",
    }, { headers: { "Cache-Control": "no-store" } });
  }
}
