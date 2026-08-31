import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { normalizeLaunchExchangeProvider } from "../_shared/trader-exchange.ts";
import { requireLiveExchangeConnection } from "../_shared/trader-exchange-live-guard.ts";

type Json = Record<string, unknown>;
type Db = ReturnType<typeof createClient>;
type Target = { profitPct: number; allocationPct: number };

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
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(req), "content-type": "application/json", "cache-control": "private, no-store" },
  });
}
function obj(value: unknown): Json {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Json : {};
}
function n(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
function clean(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = String((error as { message?: unknown }).message || "").trim();
    if (message) return message;
  }
  return String(error || "unknown_error");
}
function normalizeTargets(value: unknown): Target[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 8) throw new Error("invalid_take_profit_targets");
  if (value.length === 0) return [];
  let allocation = 0;
  const result = value.map((raw) => {
    const row = obj(raw);
    const profitPct = Math.round(n(row.profitPct, NaN) * 10000) / 10000;
    const allocationPct = Math.round(n(row.allocationPct, NaN) * 10000) / 10000;
    if (!(profitPct > 0) || !(allocationPct > 0) || allocationPct > 100) throw new Error("invalid_take_profit_targets");
    allocation += allocationPct;
    return { profitPct, allocationPct };
  }).sort((a, b) => a.profitPct - b.profitPct);
  if (Math.abs(allocation - 100) > 0.011) throw new Error("take_profit_allocation_must_equal_100");
  return result;
}
function sameTargets(a: unknown, b: unknown) {
  const left = Array.isArray(a) ? a : [];
  const right = Array.isArray(b) ? b : [];
  return JSON.stringify(left) === JSON.stringify(right);
}
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
  return data;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return json(req, { error: "method_not_allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !service) return json(req, { error: "server_configuration_missing" }, 500);
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json(req, { error: "unauthorized" }, 401);

  const db = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: userData, error: userError } = await db.auth.getUser(token);
  if (userError || !userData.user) return json(req, { error: "unauthorized" }, 401);

  try {
    const body = await req.json().catch(() => ({})) as Json;
    const positionId = String(body.positionId || "").trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(positionId)) {
      throw new Error("core_v2_position_uuid_required");
    }

    const account = await realAccount(db, userData.user.id);
    const [{ data: control, error: controlError }, { data: gate, error: gateError }, { data: trade, error: tradeError }] = await Promise.all([
      db.from("trader_execution_controls")
        .select("global_live_enabled,kill_switch,live_confirmed_at,live_generation")
        .eq("account_id", account.id)
        .maybeSingle(),
      db.from("trader_v2_command_gates")
        .select("enabled")
        .eq("account_id", account.id)
        .eq("command_type", "position.update_exit_plan")
        .maybeSingle(),
      db.from("trader_trades")
        .select("id,client_id,pair,status,execution_mode,exchange_provider,client_state,stop_enabled,stop_pct")
        .eq("account_id", account.id)
        .eq("id", positionId)
        .maybeSingle(),
    ]);
    if (controlError) throw controlError;
    if (gateError) throw gateError;
    if (tradeError) throw tradeError;
    if (!trade) throw new Error("position_not_found");
    if (trade.status !== "Active" || trade.execution_mode !== "live") throw new Error("position_not_active");

    const state = obj(trade.client_state);
    if (state.exitStrategyV2 !== true) throw new Error("exit_strategy_v2_required");

    const provider = normalizeLaunchExchangeProvider(
      String(trade.exchange_provider || state.exchangeProvider || state.exchange || "binance"),
      "binance",
    );
    const currentStopEnabled = typeof state.stopEnabled === "boolean" ? state.stopEnabled : trade.stop_enabled === true;
    const currentStopPct = n(state.stopPct, n(trade.stop_pct));
    const stopEnabled = body.stopEnabled === undefined ? currentStopEnabled : body.stopEnabled === true;
    const stopPct = body.stopPct === undefined ? currentStopPct : n(body.stopPct, NaN);
    if (stopEnabled && !(stopPct > 0)) throw new Error("invalid_stop_loss");

    const currentTargets = normalizeTargets(Array.isArray(state.takeProfitTargets) ? state.takeProfitTargets : []) ?? [];
    const requestedTargets = normalizeTargets(body.takeProfitTargets);
    const effectiveTargets = requestedTargets === undefined ? currentTargets : requestedTargets;

    let exchangeBlocker: string | null = null;
    try {
      await requireLiveExchangeConnection(db, String(account.id), provider);
    } catch (error) {
      exchangeBlocker = clean(error);
    }

    const liveExecutionReady = account.mode === "live" && control?.global_live_enabled === true && control?.kill_switch === false;
    const gateEnabled = gate?.enabled === true;
    const blockers: string[] = [];
    if (!liveExecutionReady) blockers.push("live_trading_not_enabled");
    if (!gateEnabled) blockers.push("core_v2_execute_disabled");
    if (exchangeBlocker) blockers.push(exchangeBlocker);

    const requested = {
      stopEnabled,
      stopPct,
      takeProfitTargets: effectiveTargets,
    };
    const current = {
      stopEnabled: currentStopEnabled,
      stopPct: currentStopPct,
      takeProfitTargets: currentTargets,
    };
    const changes = {
      stopEnabled: current.stopEnabled !== requested.stopEnabled,
      stopPct: current.stopPct !== requested.stopPct,
      takeProfitTargets: !sameTargets(current.takeProfitTargets, requested.takeProfitTargets),
    };

    return json(req, {
      ok: true,
      ready: true,
      preview: {
        accountId: account.id,
        target: {
          type: "position",
          id: trade.id,
          clientId: trade.client_id,
          pair: trade.pair,
          provider,
          executionMode: trade.execution_mode,
        },
        current,
        requested,
        changes,
        hasChanges: changes.stopEnabled || changes.stopPct || changes.takeProfitTargets,
        executeReady: blockers.length === 0,
        blockers,
        safeguards: {
          authenticatedOwner: true,
          activeLivePosition: true,
          exitStrategyV2: true,
          liveExecutionReady,
          gateEnabled,
          exchangeReady: exchangeBlocker === null,
          noCommandEnqueued: true,
          noOrderSent: true,
          noPositionMutation: true,
        },
      },
    });
  } catch (error) {
    const code = clean(error);
    const known = new Set([
      "real_account_required",
      "core_v2_position_uuid_required",
      "position_not_found",
      "position_not_active",
      "exit_strategy_v2_required",
      "invalid_stop_loss",
      "invalid_take_profit_targets",
      "take_profit_allocation_must_equal_100",
    ]);
    const safe = known.has(code) ? code : "exit_plan_preview_failed";
    const status = safe === "real_account_required" ? 403 : safe === "position_not_found" ? 404 : safe === "position_not_active" ? 409 : safe === "exit_plan_preview_failed" ? 500 : 400;
    if (safe === "exit_plan_preview_failed") console.error("trader-v2-exit-plan-preview", code);
    return json(req, { error: safe }, status);
  }
});
