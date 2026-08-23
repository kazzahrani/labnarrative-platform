import { NextRequest, NextResponse } from "next/server";

type Quote = {
  symbol: string;
  price: number;
  previousClose: number | null;
  changePercent: number | null;
  currency: string;
  source: string;
  isDelayed: boolean;
  observedAt: string;
};

function normalizeDigits(value: string) {
  return value
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)));
}

function normalizeSymbol(value: unknown) {
  if (typeof value !== "string") return "";
  return normalizeDigits(value).trim().toUpperCase().replace(/\.SR$/, "").replace(/[^0-9A-Z.-]/g, "");
}

function normalizeSymbols(values: unknown[]) {
  return Array.from(new Set(values.map(normalizeSymbol).filter(Boolean))).slice(0, 30);
}

async function fetchSahmk(symbol: string, apiKey: string): Promise<Quote | null> {
  try {
    const response = await fetch(`https://api.sahmk.sa/api/v1/quote/${encodeURIComponent(symbol)}/`, {
      headers: { "X-API-Key": apiKey, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return null;
    const body = await response.json();
    const price = Number(body?.price);
    if (!Number.isFinite(price) || price <= 0) return null;
    const changePercent = Number(body?.change_percent);
    return {
      symbol,
      price,
      previousClose: null,
      changePercent: Number.isFinite(changePercent) ? changePercent : null,
      currency: "SAR",
      source: "SAHMK",
      isDelayed: Boolean(body?.is_delayed),
      observedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

async function fetchYahooDelayed(symbol: string): Promise<Quote | null> {
  try {
    const ticker = `${symbol}.SR`;
    const endpoint = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=5d&includePrePost=false`;
    const response = await fetch(endpoint, {
      headers: { Accept: "application/json", "User-Agent": "LabNarrative-Wealth-MVP/0.1" },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return null;
    const body = await response.json();
    const result = body?.chart?.result?.[0];
    if (!result) return null;
    const meta = result?.meta ?? {};
    const price = Number(meta?.regularMarketPrice);
    if (!Number.isFinite(price) || price <= 0) return null;
    const previousCloseRaw = Number(meta?.previousClose ?? meta?.chartPreviousClose);
    const previousClose = Number.isFinite(previousCloseRaw) && previousCloseRaw > 0 ? previousCloseRaw : null;
    const changePercent = previousClose ? ((price - previousClose) / previousClose) * 100 : null;
    const marketTime = Number(meta?.regularMarketTime);
    return {
      symbol,
      price,
      previousClose,
      changePercent,
      currency: typeof meta?.currency === "string" ? meta.currency : "SAR",
      source: "Yahoo Finance delayed fallback",
      isDelayed: true,
      observedAt: Number.isFinite(marketTime) && marketTime > 0 ? new Date(marketTime * 1000).toISOString() : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

async function quoteResponse(symbols: string[]) {
  if (!symbols.length) return NextResponse.json({ quotes: [], provider: "none" }, { headers: { "Cache-Control": "no-store" } });
  const sahmkKey = process.env.SAHMK_API_KEY?.trim();
  const quotes = await Promise.all(symbols.map(async (symbol) => {
    if (sahmkKey) {
      const quote = await fetchSahmk(symbol, sahmkKey);
      if (quote) return quote;
    }
    return fetchYahooDelayed(symbol);
  }));
  const validQuotes = quotes.filter((quote): quote is Quote => Boolean(quote));
  return NextResponse.json({
    quotes: validQuotes,
    requested: symbols.length,
    returned: validQuotes.length,
    provider: sahmkKey ? "sahmk-with-yahoo-fallback" : "yahoo-delayed-fallback",
    temporaryFallback: !sahmkKey,
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: NextRequest) {
  const symbols = normalizeSymbols((request.nextUrl.searchParams.get("symbols") || "").split(","));
  return quoteResponse(symbols);
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const rawSymbols = Array.isArray((body as { symbols?: unknown[] })?.symbols) ? (body as { symbols: unknown[] }).symbols : [];
  return quoteResponse(normalizeSymbols(rawSymbols));
}
