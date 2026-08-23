"use client";

import { browserSupabase } from "@/lib/supabase-browser";

export type SaudiMarketHolding = {
  id: string;
  asset_type: string | null;
  symbol: string | null;
  quantity: number | string | null;
  market_value: number | string | null;
};

export type SaudiQuote = {
  symbol: string;
  price: number;
  previousClose: number | null;
  changePercent: number | null;
  currency: string;
  source: string;
  isDelayed: boolean;
  observedAt: string;
};

export type SaudiMarketRefreshResult = {
  updated: number;
  provider: string;
  temporaryFallback: boolean;
  quotes: SaudiQuote[];
  refreshedAt: string;
};

function numeric(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizeSaudiSymbol(value: string | null | undefined) {
  if (!value) return "";
  return value
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .trim()
    .toUpperCase()
    .replace(/\.SR$/, "")
    .replace(/[^0-9A-Z.-]/g, "");
}

function isSaudiListedHolding(holding: SaudiMarketHolding) {
  return (holding.asset_type === "saudi_stock" || holding.asset_type === "reit") && Boolean(normalizeSaudiSymbol(holding.symbol));
}

export async function refreshSaudiMarketPrices(
  userId: string,
  holdings: SaudiMarketHolding[],
): Promise<SaudiMarketRefreshResult> {
  const candidates = holdings.filter(isSaudiListedHolding);
  const symbols = Array.from(new Set(candidates.map((holding) => normalizeSaudiSymbol(holding.symbol)).filter(Boolean)));

  if (!symbols.length) {
    return { updated: 0, provider: "none", temporaryFallback: false, quotes: [], refreshedAt: new Date().toISOString() };
  }

  const response = await fetch("/api/wealth/market/saudi", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ symbols }),
    cache: "no-store",
  });

  if (!response.ok) throw new Error("تعذر جلب أسعار السوق السعودي.");
  const payload = await response.json() as {
    quotes?: SaudiQuote[];
    provider?: string;
    temporaryFallback?: boolean;
  };
  const quotes = Array.isArray(payload.quotes) ? payload.quotes : [];
  const quoteMap = new Map(quotes.map((quote) => [normalizeSaudiSymbol(quote.symbol), quote]));

  let updated = 0;
  for (const holding of candidates) {
    const symbol = normalizeSaudiSymbol(holding.symbol);
    const quote = quoteMap.get(symbol);
    if (!quote || !Number.isFinite(Number(quote.price)) || Number(quote.price) <= 0) continue;

    const price = Number(quote.price);
    const quantity = numeric(holding.quantity);
    const marketValue = quantity > 0 ? quantity * price : numeric(holding.market_value);
    const priceDate = new Date(quote.observedAt || Date.now()).toISOString().slice(0, 10);

    const { error: updateError } = await browserSupabase
      .from("wealth_holdings")
      .update({
        unit_price: price,
        market_value: marketValue,
        as_of_date: priceDate,
      })
      .eq("id", holding.id)
      .eq("user_id", userId);
    if (updateError) throw updateError;

    const { error: historyError } = await browserSupabase
      .from("wealth_price_history")
      .upsert({
        user_id: userId,
        holding_id: holding.id,
        symbol,
        price,
        currency: quote.currency || "SAR",
        source: quote.source,
        is_delayed: Boolean(quote.isDelayed),
        price_date: priceDate,
        observed_at: quote.observedAt || new Date().toISOString(),
        metadata: {
          previous_close: quote.previousClose,
          change_percent: quote.changePercent,
        },
      }, { onConflict: "user_id,holding_id,price_date" });
    if (historyError) throw historyError;

    updated += 1;
  }

  if (updated > 0) {
    const { data: freshHoldings, error: freshError } = await browserSupabase
      .from("wealth_holdings")
      .select("market_value,asset_type")
      .eq("user_id", userId);
    if (freshError) throw freshError;

    const rows = freshHoldings ?? [];
    const netWorth = rows.reduce((sum, row) => sum + numeric(row.market_value), 0);
    const liquidAssets = rows
      .filter((row) => row.asset_type === "cash")
      .reduce((sum, row) => sum + numeric(row.market_value), 0);
    const allocation: Record<string, number> = {};
    for (const row of rows) {
      const key = row.asset_type || "other";
      allocation[key] = (allocation[key] ?? 0) + numeric(row.market_value);
    }

    const today = new Date().toISOString().slice(0, 10);
    const { error: snapshotError } = await browserSupabase
      .from("wealth_snapshots")
      .upsert({
        user_id: userId,
        snapshot_date: today,
        net_worth: netWorth,
        liquid_assets: liquidAssets,
        currency: "SAR",
        allocation,
      }, { onConflict: "user_id,snapshot_date" });
    if (snapshotError) throw snapshotError;
  }

  return {
    updated,
    provider: payload.provider || "unknown",
    temporaryFallback: Boolean(payload.temporaryFallback),
    quotes,
    refreshedAt: new Date().toISOString(),
  };
}
