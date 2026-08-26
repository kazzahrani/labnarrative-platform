import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "https://platform.labnarrative.com",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Json = Record<string, unknown>;
type Db = ReturnType<typeof createClient>;
type TpTarget = { profitPct: number; allocationPct: number };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "content-type": "application/json", "cache-control": "no-store" },
  });
}
function n(value: unknown, fallback = 0) {
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
}
function obj(value: unknown): Json {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Json : {};
}
function clean(error: unknown) {
  return error instanceof Error ? error.message : String(error || "unknown_error");
}
function targets(value: unknown): TpTarget[] {
  if (!Array.isArray(value)) throw new Error("invalid_take_profit_targets");
  if (value.length > 8) throw new Error("too_many_take_profit_targets");
  const result = value.map((raw) => {
    const row = obj(raw);
    return {
      profitPct: Math.round(n(row.profitPct) * 10000) / 10000,
      allocationPct: Math.round(n(row.allocationPct) * 10000) / 10000,
    };
  });
  if (result.some((row) => !(row.profitPct > 0) || !(row.allocationPct > 0) || row.allocationPct > 100)) {
    throw new Error("invalid_take_profit_targets");
  }
  if (result.length) {
    const total = result.reduce((sum, row) => sum + row.allocationPct, 0);
    if (Math.abs(total - 100) > 0.011) throw new Error("take_profit_allocation_must_equal_100");
  }
  return result.sort((a, b) => a.profitPct - b.profitPct);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ error: "server_configuration_missing" }, 500);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "unauthorized" }, 401);
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) return json({ error: "unauthorized" }, 401);

  let lockId = "";
  let accountId = "";
  try {
    const body = await req.json().catch(() => ({})) as Json;
    if (String(body.action || "") !== "update_take_profit") throw new Error("unsupported_action");
    accountId = String(body.accountId || "").trim();
    const tradeId = String(body.tradeId || "").trim();
    if (!accountId) throw new Error("account_id_required");
    if (!tradeId) throw new Error("trade_id_required");

    const { data: account, error: accountError } = await admin.from("trader_accounts")
      .select("id,owner_user_id,account_kind,mode,status")
      .eq("id", accountId)
      .eq("owner_user_id", userData.user.id)
      .eq("account_kind", "real")
      .eq("status", "active")
      .maybeSingle();
    if (accountError) throw accountError;
    if (!account) throw new Error("real_account_required");
    if (account.mode !== "live") throw new Error("live_trading_not_enabled");

    const { data: control, error: controlError } = await admin.from("trader_execution_controls")
      .select("global_live_enabled,kill_switch")
      .eq("account_id", accountId)
      .single();
    if (controlError || !control) throw new Error("execution_controls_missing");
    if (control.global_live_enabled !== true || control.kill_switch !== false) throw new Error("live_trading_not_enabled");

    lockId = crypto.randomUUID();
    const { data: locked, error: lockError } = await admin.rpc("trader_begin_command", {
      p_account_id: accountId,
      p_lock_id: lockId,
      p_lease_seconds: 20,
    });
    if (lockError) throw lockError;
    if (!locked) throw new Error("account_busy");

    const { data: trade, error: tradeError } = await admin.from("trader_trades")
      .select("id,account_id,bot_id,client_id,pair,status,take_profit_pct,client_state,execution_mode")
      .eq("account_id", accountId)
      .eq("client_id", tradeId)
      .maybeSingle();
    if (tradeError) throw tradeError;
    if (!trade) throw new Error("trade_not_found");
    if (trade.status !== "Active" || trade.execution_mode !== "live") throw new Error("trade_not_active");

    const nextTargets = targets(body.targets);
    const now = new Date().toISOString();
    const state = {
      ...obj(trade.client_state),
      exitStrategyV2: true,
      takeProfitTargets: nextTargets,
      takeProfitFilled: [],
      takeProfitPlanUpdatedAt: now,
    };
    const singlePct = nextTargets.length === 1 ? nextTargets[0].profitPct : 0;

    const { error: updateError } = await admin.from("trader_trades").update({
      take_profit_pct: singlePct,
      client_state: state,
      updated_at: now,
    }).eq("id", trade.id).eq("status", "Active").eq("execution_mode", "live");
    if (updateError) throw updateError;

    await admin.from("trader_broker_events").insert({
      account_id: accountId,
      bot_id: trade.bot_id,
      trade_id: trade.id,
      mode: "live",
      event_type: "manual_take_profit_plan_updated",
      pair: trade.pair,
      payload: { targets: nextTargets, appliesTo: "remaining_position", noOrderSent: true },
    });

    return json({ ok: true, targets: nextTargets, appliesTo: "remaining_position" });
  } catch (error) {
    return json({ error: clean(error) }, 400);
  } finally {
    if (lockId && accountId) {
      await admin.rpc("trader_release_account", { p_account_id: accountId, p_worker_id: lockId }).catch(() => undefined);
    }
  }
});
