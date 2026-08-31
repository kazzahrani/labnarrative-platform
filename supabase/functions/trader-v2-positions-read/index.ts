import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

type Db = ReturnType<typeof createClient>;
type TradeIdRow = { id: string; client_id: string | null };

function cors(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowed = origin === "https://app.labnarrative.com" || origin === "https://platform.labnarrative.com" || /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin);
  return {
    "Access-Control-Allow-Origin": allowed ? origin : "https://app.labnarrative.com",
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}
function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors(req), "content-type": "application/json", "cache-control": "private, no-store" } });
}
function n(value: unknown) { const parsed = Number(value ?? 0); return Number.isFinite(parsed) ? parsed : 0; }
function clean(error: unknown) { return error instanceof Error ? error.message : String(error || "unknown_error"); }

async function realAccount(db: Db, userId: string) {
  const { data, error } = await db.from("trader_accounts").select("id").eq("owner_user_id", userId).eq("account_kind", "real").eq("status", "active").limit(1).maybeSingle();
  if (error) throw error;
  if (!data?.id) throw new Error("real_account_required");
  return String(data.id);
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
    const accountId = await realAccount(db, userData.user.id);
    const { data, error } = await db.from("trader_v2_positions_latest")
      .select("trade_id,public_trade_no,bot_id,bot_name,pair,provider,execution_mode,status,average_price,quantity,remaining_cost_basis,last_price,market_value,unrealized_pnl,unrealized_pct,realized_pnl,completed_dca_orders,max_dca_orders,active_dca_limit,active_dca_orders,stop_enabled,stop_pct,take_profit_targets,take_profit_filled,exit_strategy_v2,opened_at,updated_at")
      .eq("account_id", accountId)
      .order("opened_at", { ascending: false });
    if (error) throw error;

    const basePositions = data ?? [];
    const tradeIds = basePositions.map((row) => String(row.trade_id || "")).filter(Boolean);
    const clientIdByTrade = new Map<string, string>();
    if (tradeIds.length) {
      const { data: tradeRows, error: tradeError } = await db.from("trader_trades")
        .select("id,client_id")
        .eq("account_id", accountId)
        .in("id", tradeIds);
      if (tradeError) throw tradeError;
      for (const row of (tradeRows ?? []) as TradeIdRow[]) {
        if (row.client_id) clientIdByTrade.set(String(row.id), String(row.client_id));
      }
    }

    const positions = basePositions.map((row) => ({
      ...row,
      client_id: clientIdByTrade.get(String(row.trade_id || "")) ?? null,
    }));
    const summary = positions.reduce((acc, row) => {
      acc.costBasis += n(row.remaining_cost_basis);
      acc.marketValue += n(row.market_value);
      acc.unrealizedPnl += n(row.unrealized_pnl);
      return acc;
    }, { count: positions.length, costBasis: 0, marketValue: 0, unrealizedPnl: 0 });
    const providerCounts: Record<string, number> = {};
    for (const row of positions) {
      const provider = String(row.provider || "unknown");
      providerCounts[provider] = (providerCounts[provider] || 0) + 1;
    }
    const freshestAt = positions.reduce((latest, row) => {
      const value = String(row.updated_at || "");
      return value && (!latest || Date.parse(value) > Date.parse(latest)) ? value : latest;
    }, "");
    const ageMs = freshestAt ? Math.max(0, Date.now() - Date.parse(freshestAt)) : 0;
    return json(req, { ok: true, ready: true, accountId, ageMs, summary: { ...summary, providerCounts }, positions });
  } catch (error) {
    const message = clean(error);
    return json(req, { error: message === "real_account_required" ? message : "trader_v2_positions_read_failed" }, message === "real_account_required" ? 403 : 500);
  }
});
