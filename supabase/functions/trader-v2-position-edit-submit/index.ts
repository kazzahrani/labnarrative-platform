import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { normalizeLaunchExchangeProvider } from "https://raw.githubusercontent.com/kazzahrani/labnarrative-platform/a1470a7a3f934c86303aab0abade107843de35ce/supabase/functions/_shared/trader-exchange.ts";

type Json = Record<string, unknown>;

function cors(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowed = origin === "https://app.labnarrative.com" || origin === "https://platform.labnarrative.com" || /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin);
  return {
    "Access-Control-Allow-Origin": allowed ? origin : "https://platform.labnarrative.com",
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}
function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors(req), "content-type": "application/json", "cache-control": "private, no-store" } });
}
function obj(value: unknown): Json { return value && typeof value === "object" && !Array.isArray(value) ? value as Json : {}; }
function n(value: unknown, fallback = 0) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; }
function clean(error: unknown) { return (error instanceof Error ? error.message : String(error || "unknown_error")).slice(0, 160); }
function canonical(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "number") return Number.isFinite(value) ? JSON.stringify(value) : "null";
  if (typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Json).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, nested]) => `${JSON.stringify(key)}:${canonical(nested)}`).join(",")}}`;
  }
  return JSON.stringify(String(value));
}
async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
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
    const body = await req.json().catch(() => ({})) as Json;
    const positionId = String(body.positionId || "").trim();
    const idempotencyKey = String(body.idempotencyKey || "").trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(positionId)) throw new Error("position_not_found");
    if (idempotencyKey.length < 8 || idempotencyKey.length > 160) throw new Error("invalid_idempotency_key");

    const { data: trade, error: tradeError } = await db.from("trader_trades")
      .select("id,account_id,client_id,pair,status,execution_mode,exchange_provider,averaging_filled,max_averaging,active_orders_limit,take_profit_pct,stop_pct,client_state")
      .eq("id", positionId).maybeSingle();
    if (tradeError) throw tradeError;
    if (!trade) throw new Error("position_not_found");

    const [{ data: account, error: accountError }, { data: controls, error: controlsError }, { data: gate, error: gateError }] = await Promise.all([
      db.from("trader_accounts").select("id,owner_user_id,account_kind,mode,status").eq("id", trade.account_id).eq("owner_user_id", userData.user.id).maybeSingle(),
      db.from("trader_execution_controls").select("global_live_enabled,kill_switch").eq("account_id", trade.account_id).maybeSingle(),
      db.from("trader_v2_command_gates").select("enabled").eq("account_id", trade.account_id).eq("command_type", "position.update_trade").maybeSingle(),
    ]);
    if (accountError) throw accountError;
    if (controlsError) throw controlsError;
    if (gateError) throw gateError;
    if (!account || account.account_kind !== "real" || account.status !== "active") throw new Error("real_account_required");
    if (account.mode !== "live" || !controls || controls.global_live_enabled !== true || controls.kill_switch !== false) throw new Error("live_trading_not_enabled");
    if (gate?.enabled !== true) throw new Error("core_v2_execute_disabled");
    if (trade.status !== "Active") throw new Error("position_not_active");
    if (trade.execution_mode !== "live") throw new Error("position_not_live");

    const state = obj(trade.client_state);
    if (state.exitStrategyV2 !== true) throw new Error("exit_strategy_v2_required");
    const completed = Math.max(0, Math.round(n(trade.averaging_filled)));
    let maxAveraging = Math.max(completed, Math.min(100, Math.round(n(body.maxAveraging, trade.max_averaging))));
    const requestedActive = Math.max(0, Math.min(100 - completed, Math.round(n(body.activeOrdersLimit, trade.active_orders_limit))));
    if (requestedActive > Math.max(0, maxAveraging - completed)) maxAveraging = Math.min(100, completed + requestedActive);
    const activeOrdersLimit = Math.min(Math.max(0, maxAveraging - completed), requestedActive);
    const takeProfitPct = Math.round(Math.max(0, Math.min(1000, n(body.takeProfitPct, trade.take_profit_pct))) * 10000) / 10000;
    const stopEnabled = body.stopEnabled === undefined ? state.stopEnabled === true : body.stopEnabled === true;
    const stopPct = Math.round(Math.max(0, Math.min(1000, n(body.stopPct, n(state.stopPct, trade.stop_pct)))) * 10000) / 10000;
    if (stopEnabled && !(stopPct > 0)) throw new Error("invalid_stop_loss");
    const provider = normalizeLaunchExchangeProvider(String(trade.exchange_provider || state.exchangeProvider || state.exchange || "binance"), "binance");

    const payload = { maxAveraging, activeOrdersLimit, takeProfitPct, stopEnabled, stopPct };
    const fingerprint = await sha256(canonical({ commandType: "position.update_trade", targetType: "position", targetId: positionId, payload }));
    const { data: existing, error: existingError } = await db.from("trader_v2_commands")
      .select("id,status,request_fingerprint,result,error_code").eq("owner_user_id", userData.user.id).eq("idempotency_key", idempotencyKey).maybeSingle();
    if (existingError) throw existingError;
    if (existing) {
      if (existing.request_fingerprint !== fingerprint) throw new Error("idempotency_key_reuse");
      return json(req, { ok: true, pending: existing.status === "queued" || existing.status === "running", command: existing, replayed: true });
    }

    const validation = {
      target: { type: "position", id: positionId, clientId: trade.client_id, pair: trade.pair, provider, executionMode: trade.execution_mode },
      current: { completedDca: completed, maxAveraging: trade.max_averaging, activeOrdersLimit: trade.active_orders_limit, takeProfitPct: n(trade.take_profit_pct), stopEnabled: state.stopEnabled === true, stopPct: n(state.stopPct, trade.stop_pct) },
      requested: payload,
      coreV2: true,
    };
    const inserted = await db.from("trader_v2_commands").insert({
      owner_user_id: userData.user.id,
      account_id: trade.account_id,
      idempotency_key: idempotencyKey,
      request_fingerprint: fingerprint,
      command_type: "position.update_trade",
      target_type: "position",
      target_id: positionId,
      payload,
      mode: "execute",
      status: "queued",
      validation,
      validated_at: new Date().toISOString(),
      attempt_count: 0,
      next_attempt_at: new Date().toISOString(),
    }).select("id,status,requested_at").single();
    if (inserted.error || !inserted.data) throw inserted.error || new Error("command_insert_failed");

    await db.from("trader_v2_command_events").insert([
      { command_id: inserted.data.id, owner_user_id: userData.user.id, event_type: "received", details: { commandType: "position.update_trade", targetType: "position", targetId: positionId, mode: "execute" } },
      { command_id: inserted.data.id, owner_user_id: userData.user.id, event_type: "queued", details: { provider, coreV2: true } },
    ]);
    return json(req, { ok: true, pending: true, command: inserted.data, replayed: false }, 202);
  } catch (error) {
    const code = clean(error);
    const known = code === "real_account_required" || code === "live_trading_not_enabled" || code === "core_v2_execute_disabled" || code === "position_not_found" || code === "position_not_active" || code === "position_not_live" || code === "exit_strategy_v2_required" || code === "invalid_idempotency_key" || code === "idempotency_key_reuse" || code === "invalid_stop_loss";
    return json(req, { error: known ? code : "position_edit_failed" }, code === "real_account_required" ? 403 : code === "position_not_found" ? 404 : code === "core_v2_execute_disabled" ? 409 : 400);
  }
});
