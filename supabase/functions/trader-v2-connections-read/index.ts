import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = new Set(["https://platform.labnarrative.com", "https://app.labnarrative.com"]);
const CORE_V2_PROVIDERS = new Set(["binance", "bybit", "okx", "kucoin"]);
type Db = ReturnType<typeof createClient>;
type Json = Record<string, unknown>;

function cors(req: Request) {
  const origin = req.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : "https://app.labnarrative.com",
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}
function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors(req), "content-type": "application/json", "cache-control": "private, no-store" } });
}
function clean(error: unknown) { return error instanceof Error ? error.message : String(error || "unknown_error"); }
function obj(value: unknown): Json { return value && typeof value === "object" && !Array.isArray(value) ? value as Json : {}; }
function num(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }

async function realAccount(db: Db, userId: string) {
  const { data, error } = await db.from("trader_accounts")
    .select("id,name,mode,status")
    .eq("owner_user_id", userId)
    .eq("account_kind", "real")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data?.id) throw new Error("real_account_required");
  return { id: String(data.id), name: String(data.name || "Real Account"), mode: String(data.mode || "shadow") };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return json(req, { error: "method_not_allowed" }, 405);
  const url = Deno.env.get("SUPABASE_URL"), service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !service) return json(req, { error: "server_configuration_missing" }, 500);
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json(req, { error: "unauthorized" }, 401);
  const db = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: userData, error: userError } = await db.auth.getUser(token);
  if (userError || !userData.user) return json(req, { error: "unauthorized" }, 401);

  try {
    const account = await realAccount(db, userData.user.id);
    const [binanceResult, exchangeResult, portfolioResult] = await Promise.all([
      db.from("trader_binance_connections")
        .select("provider,environment,status,api_key_last4,permission_read,permission_trade,permission_withdraw,permission_internal_transfer,ip_restricted,last_verified_at,last_error,updated_at")
        .eq("account_id", account.id)
        .limit(1)
        .maybeSingle(),
      db.from("trader_exchange_connections")
        .select("provider,environment,status,api_key_last4,permission_read,permission_trade,permission_withdraw,ip_restricted,last_verified_at,last_error,updated_at")
        .eq("account_id", account.id)
        .order("provider", { ascending: true }),
      db.from("trader_v2_portfolio_accounting_latest")
        .select("captured_at,provider_totals,sync_state")
        .eq("account_id", account.id)
        .maybeSingle(),
    ]);
    if (binanceResult.error) throw binanceResult.error;
    if (exchangeResult.error) throw exchangeResult.error;
    if (portfolioResult.error) throw portfolioResult.error;

    const portfolio = obj(portfolioResult.data);
    const providerTotals = Array.isArray(portfolio.provider_totals) ? portfolio.provider_totals.map(obj) : [];
    const portfolioByProvider = new Map(providerTotals.map((item) => [String(item.provider || "").toLowerCase(), item]));
    const rows: Json[] = [];
    if (binanceResult.data) rows.push({ ...binanceResult.data, provider: "binance" });
    for (const row of exchangeResult.data ?? []) rows.push(row as Json);

    const connections = rows.map((row) => {
      const provider = String(row.provider || "").toLowerCase();
      const sync = portfolioByProvider.get(provider);
      const lastVerifiedAt = row.last_verified_at ? String(row.last_verified_at) : null;
      return {
        provider,
        environment: String(row.environment || "mainnet"),
        status: String(row.status || "disconnected"),
        apiKeyLast4: row.api_key_last4 ? String(row.api_key_last4) : null,
        permissionRead: row.permission_read === true,
        permissionTrade: row.permission_trade === true,
        permissionWithdraw: row.permission_withdraw === true,
        permissionInternalTransfer: provider === "binance" ? row.permission_internal_transfer === true : null,
        ipRestricted: row.ip_restricted == null ? null : row.ip_restricted === true,
        lastVerifiedAt,
        verificationAgeMs: lastVerifiedAt ? Math.max(0, Date.now() - Date.parse(lastVerifiedAt)) : null,
        lastError: row.last_error ? String(row.last_error) : null,
        coreV2Supported: CORE_V2_PROVIDERS.has(provider),
        portfolioFresh: sync ? sync.fresh === true : null,
        portfolioTotalUsd: sync ? num(sync.totalUsd) : null,
        portfolioAssetCount: sync ? num(sync.assetCount) : null,
        portfolioSourceAt: sync?.sourceAt ? String(sync.sourceAt) : null,
      };
    });
    connections.sort((a, b) => {
      const order = ["binance", "bybit", "okx", "kucoin", "kraken", "coinbase"];
      return (order.indexOf(a.provider) < 0 ? 99 : order.indexOf(a.provider)) - (order.indexOf(b.provider) < 0 ? 99 : order.indexOf(b.provider));
    });

    return json(req, {
      ok: true,
      ready: true,
      account: { id: account.id, name: account.name, mode: account.mode },
      portfolioCapturedAt: portfolio.captured_at ?? null,
      summary: {
        connectedCount: connections.filter((item) => item.status === "connected").length,
        coreV2SupportedCount: connections.filter((item) => item.status === "connected" && item.coreV2Supported).length,
        freshPortfolioCount: connections.filter((item) => item.status === "connected" && item.coreV2Supported && item.portfolioFresh === true).length,
      },
      connections,
    });
  } catch (error) {
    const message = clean(error);
    return json(req, { error: message === "real_account_required" ? message : "trader_v2_connections_read_failed" }, message === "real_account_required" ? 403 : 500);
  }
});
