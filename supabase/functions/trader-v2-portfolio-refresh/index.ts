import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import type { ExchangeExecutionAdapter, LaunchExchangeProvider } from "../_shared/trader-exchange.ts";
import { createLaunchExchangeExecutionAdapter } from "../_shared/trader-exchange-router.ts";

const SUPPORTED: LaunchExchangeProvider[] = ["binance", "bybit", "okx", "kucoin"];
const USD_STABLES = new Set(["USDT", "USDC", "FDUSD", "BUSD", "TUSD", "USDP", "DAI"]);
type Db = ReturnType<typeof createClient>;
type Json = Record<string, unknown>;
type Balance = { asset: string; free: number; locked: number; total: number };
type ProviderState = { provider: string; supported: boolean; connected: boolean; ok: boolean; durationMs?: number; assetCount?: number; error?: string };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}
function n(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
function clean(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "unknown_error");
  return message.slice(0, 240);
}
function unique<T>(values: T[]) { return Array.from(new Set(values)); }
async function verify(db: Db, value: string) {
  if (!value) return false;
  const { data, error } = await db.from("trader_worker_secrets").select("secret").eq("name", "paper_worker").maybeSingle();
  return !error && data?.secret === value;
}
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  async function runner() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await fn(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), items.length || 1) }, () => runner()));
  return results;
}

async function connectedProviders(db: Db, accountId: string) {
  const supported = new Set<LaunchExchangeProvider>();
  const unsupported = new Set<string>();
  const [{ data: binance, error: binanceError }, { data: rows, error: otherError }] = await Promise.all([
    db.from("trader_binance_connections").select("status,environment,permission_read").eq("account_id", accountId).maybeSingle(),
    db.from("trader_exchange_connections").select("provider,status,environment,permission_read").eq("account_id", accountId),
  ]);
  if (binanceError) throw binanceError;
  if (otherError) throw otherError;
  if (binance?.status === "connected" && binance.environment === "mainnet" && binance.permission_read === true) supported.add("binance");
  for (const row of rows ?? []) {
    if (row.status !== "connected" || row.environment !== "mainnet" || row.permission_read !== true) continue;
    const provider = String(row.provider || "").trim().toLowerCase();
    if ((SUPPORTED as string[]).includes(provider)) supported.add(provider as LaunchExchangeProvider);
    else if (provider) unsupported.add(provider);
  }
  return { supported: SUPPORTED.filter((provider) => supported.has(provider)), unsupported: Array.from(unsupported).sort() };
}

async function syncProvider(db: Db, accountId: string, provider: LaunchExchangeProvider, adapter: ExchangeExecutionAdapter): Promise<ProviderState> {
  const started = Date.now();
  const { data: run, error: runError } = await db.from("trader_v2_sync_runs").insert({ account_id: accountId, provider, sync_kind: "portfolio", status: "running" }).select("id").single();
  if (runError || !run) return { provider, supported: true, connected: true, ok: false, error: clean(runError || "sync_run_insert_failed") };
  try {
    const raw = await adapter.fetchBalances();
    const balances: Balance[] = raw.map((row) => {
      const free = Math.max(0, n(row.free));
      const locked = Math.max(0, n(row.locked));
      const total = Math.max(0, n(row.total, free + locked));
      return { asset: String(row.asset || "").trim().toUpperCase(), free, locked, total };
    }).filter((row) => row.asset && row.total > 0);
    const sourceAt = new Date().toISOString();
    const { data: count, error: replaceError } = await db.rpc("trader_v2_replace_provider_balances", {
      p_account_id: accountId,
      p_provider: provider,
      p_sync_run_id: run.id,
      p_source_at: sourceAt,
      p_balances: balances,
    });
    if (replaceError) throw replaceError;
    const durationMs = Date.now() - started;
    await db.from("trader_v2_sync_runs").update({ status: "succeeded", completed_at: new Date().toISOString(), duration_ms: durationMs, asset_count: n(count, balances.length), error_code: null }).eq("id", run.id);
    return { provider, supported: true, connected: true, ok: true, durationMs, assetCount: balances.length };
  } catch (error) {
    const durationMs = Date.now() - started;
    const message = clean(error);
    await db.from("trader_v2_sync_runs").update({ status: "failed", completed_at: new Date().toISOString(), duration_ms: durationMs, error_code: message }).eq("id", run.id);
    return { provider, supported: true, connected: true, ok: false, durationMs, error: message };
  }
}

async function refreshPrices(
  db: Db,
  balances: Array<{ provider: string; asset: string }>,
  providers: LaunchExchangeProvider[],
  adapters: Map<LaunchExchangeProvider, ExchangeExecutionAdapter>,
) {
  const heldBy = new Map<string, LaunchExchangeProvider[]>();
  for (const row of balances) {
    const asset = String(row.asset).toUpperCase();
    const provider = row.provider as LaunchExchangeProvider;
    if (!SUPPORTED.includes(provider) || USD_STABLES.has(asset)) continue;
    heldBy.set(asset, unique([...(heldBy.get(asset) ?? []), provider]));
  }
  const assets = Array.from(heldBy.keys()).sort();
  const outcomes = await mapLimit(assets, 6, async (asset) => {
    const candidates = unique([...(heldBy.get(asset) ?? []), ...providers]);
    for (const provider of candidates) {
      const adapter = adapters.get(provider);
      if (!adapter) continue;
      try {
        const quote = await adapter.getQuote(`${asset}/USDT`);
        const price = n(quote.last || quote.bid || quote.ask);
        if (!(price > 0)) continue;
        await db.from("trader_v2_asset_price_latest").upsert({
          asset,
          quote_asset: "USDT",
          price_usd: price,
          source_provider: provider,
          source_pair: `${asset}/USDT`,
          source_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          metadata: { shadowCore: "v2" },
        }, { onConflict: "asset,quote_asset" });
        return { asset, ok: true, provider, price };
      } catch {}
    }
    return { asset, ok: false };
  });
  return outcomes;
}

async function buildPortfolio(db: Db, accountId: string, connected: LaunchExchangeProvider[], unsupported: string[], providerStates: ProviderState[]) {
  const { data: balances, error: balanceError } = await db.from("trader_v2_balance_latest")
    .select("provider,asset,free,locked,total,source_at,updated_at")
    .eq("account_id", accountId)
    .in("provider", connected.length ? connected : ["__none__"]);
  if (balanceError) throw balanceError;

  const assets = unique((balances ?? []).map((row) => String(row.asset).toUpperCase()));
  const { data: prices, error: priceError } = assets.length
    ? await db.from("trader_v2_asset_price_latest").select("asset,price_usd,source_provider,source_at").in("asset", assets).eq("quote_asset", "USDT")
    : { data: [], error: null };
  if (priceError) throw priceError;
  const priceMap = new Map<string, { price: number; sourceAt: string; provider: string }>();
  for (const row of prices ?? []) priceMap.set(String(row.asset).toUpperCase(), { price: n(row.price_usd), sourceAt: String(row.source_at), provider: String(row.source_provider) });
  for (const asset of USD_STABLES) priceMap.set(asset, { price: 1, sourceAt: new Date().toISOString(), provider: "stablecoin" });

  const providerMap = new Map<string, { provider: string; totalUsd: number; cashUsd: number; assetCount: number; sourceAt: string | null }>();
  const assetMap = new Map<string, { asset: string; total: number; usdValue: number; priceUsd: number | null; providers: Json[]; priced: boolean }>();
  let totalUsd = 0, cashUsd = 0, unpricedAssetCount = 0;
  const unpriced = new Set<string>();
  const stalePriceAssets = new Set<string>();
  const nowMs = Date.now();

  for (const row of balances ?? []) {
    const provider = String(row.provider), asset = String(row.asset).toUpperCase(), total = n(row.total);
    const priceRow = priceMap.get(asset), price = priceRow?.price && priceRow.price > 0 ? priceRow.price : null;
    const usdValue = price == null ? 0 : total * price;
    if (price == null && total > 0) unpriced.add(asset);
    if (priceRow?.sourceAt && nowMs - Date.parse(priceRow.sourceAt) > 10 * 60_000) stalePriceAssets.add(asset);
    totalUsd += usdValue;
    if (USD_STABLES.has(asset)) cashUsd += usdValue;

    const currentProvider = providerMap.get(provider) ?? { provider, totalUsd: 0, cashUsd: 0, assetCount: 0, sourceAt: null };
    currentProvider.totalUsd += usdValue;
    if (USD_STABLES.has(asset)) currentProvider.cashUsd += usdValue;
    currentProvider.assetCount += 1;
    const sourceAt = String(row.source_at || "");
    if (sourceAt && (!currentProvider.sourceAt || Date.parse(sourceAt) > Date.parse(currentProvider.sourceAt))) currentProvider.sourceAt = sourceAt;
    providerMap.set(provider, currentProvider);

    const currentAsset = assetMap.get(asset) ?? { asset, total: 0, usdValue: 0, priceUsd: price, providers: [], priced: price != null };
    currentAsset.total += total;
    currentAsset.usdValue += usdValue;
    if (currentAsset.priceUsd == null && price != null) currentAsset.priceUsd = price;
    currentAsset.priced = currentAsset.priced || price != null;
    currentAsset.providers.push({ provider, total, free: n(row.free), locked: n(row.locked), usdValue });
    assetMap.set(asset, currentAsset);
  }
  unpricedAssetCount = unpriced.size;

  const stateByProvider = new Map(providerStates.map((row) => [row.provider, row]));
  const providerTotals = connected.map((provider) => {
    const row = providerMap.get(provider) ?? { provider, totalUsd: 0, cashUsd: 0, assetCount: 0, sourceAt: null };
    const state = stateByProvider.get(provider);
    return { ...row, fresh: state?.ok === true, syncDurationMs: state?.durationMs ?? null, syncError: state?.error ?? null };
  }).sort((a, b) => b.totalUsd - a.totalUsd);
  const assetTotals = Array.from(assetMap.values()).sort((a, b) => b.usdValue - a.usdValue);
  const freshProviderCount = providerStates.filter((row) => row.ok).length;
  const capturedAt = new Date().toISOString();
  const portfolio = {
    account_id: accountId,
    captured_at: capturedAt,
    total_usd: totalUsd,
    cash_usd: cashUsd,
    holdings_usd: Math.max(0, totalUsd - cashUsd),
    connected_provider_count: connected.length,
    fresh_provider_count: freshProviderCount,
    stale_provider_count: Math.max(0, connected.length - freshProviderCount),
    unsupported_provider_count: unsupported.length,
    unpriced_asset_count: unpricedAssetCount,
    provider_totals: providerTotals,
    asset_totals: assetTotals,
    sync_state: { providers: providerStates, unsupportedProviders: unsupported, stalePriceAssets: Array.from(stalePriceAssets), unpricedAssets: Array.from(unpriced), shadow: true },
    updated_at: capturedAt,
  };
  const { error: latestError } = await db.from("trader_v2_portfolio_latest").upsert(portfolio, { onConflict: "account_id" });
  if (latestError) throw latestError;

  const bucketAt = new Date(Math.floor(Date.now() / 60_000) * 60_000).toISOString();
  await db.from("trader_v2_portfolio_snapshots").upsert({
    account_id: accountId,
    bucket_at: bucketAt,
    captured_at: capturedAt,
    total_usd: totalUsd,
    cash_usd: cashUsd,
    holdings_usd: Math.max(0, totalUsd - cashUsd),
    provider_totals: providerTotals,
    asset_totals: assetTotals,
    metadata: { shadow: true, freshProviderCount, unsupportedProviders: unsupported, unpricedAssets: Array.from(unpriced) },
  }, { onConflict: "account_id,bucket_at" });
  return portfolio;
}

async function refreshAccount(db: Db, accountId: string) {
  const { supported, unsupported } = await connectedProviders(db, accountId);
  const adapters = new Map<LaunchExchangeProvider, ExchangeExecutionAdapter>();
  for (const provider of supported) adapters.set(provider, createLaunchExchangeExecutionAdapter(db, accountId, provider));
  const providerStates = await Promise.all(supported.map((provider) => syncProvider(db, accountId, provider, adapters.get(provider)!)));
  const { data: latestBalances, error: balanceError } = await db.from("trader_v2_balance_latest").select("provider,asset").eq("account_id", accountId).in("provider", supported.length ? supported : ["__none__"]);
  if (balanceError) throw balanceError;
  const priceOutcomes = await refreshPrices(db, latestBalances ?? [], supported, adapters);
  const portfolio = await buildPortfolio(db, accountId, supported, unsupported, providerStates);
  return { accountId, supportedProviders: supported, unsupportedProviders: unsupported, providerStates, priceOutcomes, totalUsd: portfolio.total_usd };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const url = Deno.env.get("SUPABASE_URL"), key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return json({ error: "server_configuration_missing" }, 500);
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const secret = (req.headers.get("x-trader-worker-secret") || "").trim();
  if (!await verify(db, secret)) return json({ error: "unauthorized" }, 401);
  const { data: accounts, error } = await db.from("trader_accounts").select("id").eq("account_kind", "real").eq("status", "active").eq("mode", "live");
  if (error) return json({ error: clean(error) }, 500);
  const results = [];
  for (const row of accounts ?? []) {
    try { results.push({ ok: true, ...(await refreshAccount(db, String(row.id))) }); }
    catch (error) { results.push({ ok: false, accountId: String(row.id), error: clean(error) }); }
  }
  return json({ ok: true, shadow: true, results });
});
