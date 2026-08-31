import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import type { LaunchExchangeProvider } from "../_shared/trader-exchange.ts";
import { createLaunchExchangeExecutionAdapter } from "../_shared/trader-exchange-router.ts";

const cors = {
  "Access-Control-Allow-Origin": "https://platform.labnarrative.com",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const PROVIDERS: LaunchExchangeProvider[] = ["binance", "bybit", "okx", "kucoin"];
type Json = Record<string, unknown>;
type AssetRow = { asset: string; free: number; locked: number; total: number; usdPrice: number | null; usdValue: number | null };
type ProviderRow = { provider: LaunchExchangeProvider; totalUsd: number; quoteFree: number; quoteLocked: number; balances: AssetRow[] };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json", "cache-control": "no-store" } });
}
function n(value: unknown, fallback = 0) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; }
function clean(error: unknown) { return error instanceof Error ? error.message : String(error || "unknown_error"); }

async function realAccount(db: ReturnType<typeof createClient>, userId: string) {
  const { data, error } = await db.from("trader_accounts").select("id").eq("owner_user_id", userId).eq("account_kind", "real").eq("status", "active").limit(1).maybeSingle();
  if (error) throw error;
  if (!data?.id) throw new Error("real_account_required");
  return String(data.id);
}

async function connectedProviders(db: ReturnType<typeof createClient>, accountId: string) {
  const connected = new Set<LaunchExchangeProvider>();
  const [{ data: binance }, { data: others, error }] = await Promise.all([
    db.from("trader_binance_connections").select("status,environment,permission_read").eq("account_id", accountId).maybeSingle(),
    db.from("trader_exchange_connections").select("provider,status,environment,permission_read").eq("account_id", accountId).in("provider", ["bybit", "okx", "kucoin"]),
  ]);
  if (binance?.status === "connected" && binance.environment === "mainnet" && binance.permission_read === true) connected.add("binance");
  if (error) throw error;
  for (const row of others ?? []) {
    const provider = String(row.provider) as LaunchExchangeProvider;
    if (PROVIDERS.includes(provider) && row.status === "connected" && row.environment === "mainnet" && row.permission_read === true) connected.add(provider);
  }
  return PROVIDERS.filter((provider) => connected.has(provider));
}

async function valueProvider(db: ReturnType<typeof createClient>, accountId: string, provider: LaunchExchangeProvider): Promise<ProviderRow> {
  const adapter = createLaunchExchangeExecutionAdapter(db, accountId, provider);
  const raw = (await adapter.fetchBalances()).filter((row) => row.total > 0);
  const balances: AssetRow[] = [];
  for (const row of raw) {
    const asset = String(row.asset || "").toUpperCase();
    if (!asset) continue;
    const free = n(row.free), locked = n(row.locked), total = n(row.total, free + locked);
    let usdPrice: number | null = null;
    if (asset === "USDT") usdPrice = 1;
    else {
      try {
        const quote = await adapter.getQuote(`${asset}/USDT`);
        const price = n(quote.last || quote.bid || quote.ask);
        if (price > 0) usdPrice = price;
      } catch {}
    }
    balances.push({ asset, free, locked, total, usdPrice, usdValue: usdPrice == null ? null : total * usdPrice });
  }
  balances.sort((a, b) => (b.usdValue ?? -1) - (a.usdValue ?? -1));
  const usdt = balances.find((row) => row.asset === "USDT");
  return {
    provider,
    totalUsd: balances.reduce((sum, row) => sum + (row.usdValue ?? 0), 0),
    quoteFree: usdt?.free ?? 0,
    quoteLocked: usdt?.locked ?? 0,
    balances,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const url = Deno.env.get("SUPABASE_URL"), service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !service) return json({ error: "server_configuration_missing" }, 500);
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "unauthorized" }, 401);
  const db = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: userData, error: userError } = await db.auth.getUser(token);
  if (userError || !userData.user) return json({ error: "unauthorized" }, 401);
  try {
    const accountId = await realAccount(db, userData.user.id);
    const providers = await connectedProviders(db, accountId);
    const settled = await Promise.all(providers.map(async (provider) => {
      try { return { ok: true as const, row: await valueProvider(db, accountId, provider) }; }
      catch (error) { return { ok: false as const, provider, error: clean(error) }; }
    }));
    const rows = settled.filter((item): item is { ok: true; row: ProviderRow } => item.ok).map((item) => item.row);
    const errors = settled.filter((item): item is { ok: false; provider: LaunchExchangeProvider; error: string } => !item.ok).map((item) => ({ provider: item.provider, error: item.error }));
    const aggregate = new Map<string, AssetRow>();
    for (const provider of rows) for (const item of provider.balances) {
      const current = aggregate.get(item.asset) ?? { asset: item.asset, free: 0, locked: 0, total: 0, usdPrice: item.usdPrice, usdValue: 0 };
      current.free += item.free; current.locked += item.locked; current.total += item.total;
      if (item.usdValue != null) current.usdValue = n(current.usdValue) + item.usdValue;
      if (current.usdPrice == null && item.usdPrice != null) current.usdPrice = item.usdPrice;
      aggregate.set(item.asset, current);
    }
    const balances = Array.from(aggregate.values()).sort((a, b) => (b.usdValue ?? -1) - (a.usdValue ?? -1));
    const totalUsd = rows.reduce((sum, row) => sum + row.totalUsd, 0);
    const quoteBalance = rows.reduce((sum, row) => sum + row.quoteFree, 0);
    const quoteLocked = rows.reduce((sum, row) => sum + row.quoteLocked, 0);
    return json({ ok: true, accountId, connectedProviders: providers, providers: rows, balances, quoteBalance, quoteLocked, totalUsd, errors });
  } catch (error) {
    console.error("trader-live-portfolio", clean(error));
    return json({ error: clean(error).includes("real_account") ? clean(error) : "trader_live_portfolio_failed" }, 400);
  }
});
