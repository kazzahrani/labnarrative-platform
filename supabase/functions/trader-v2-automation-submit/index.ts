import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

type Json = Record<string, unknown>;
type Db = ReturnType<typeof createClient>;
const SUPPORTED_PROVIDERS = new Set(["binance", "bybit", "okx", "kucoin"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTIONS: Record<string, string> = {
  create_bot: "automation.create",
  update_bot: "automation.update",
  set_bot_status: "automation.set_status",
  close_bot: "automation.archive",
};
function cors(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowed = origin === "https://platform.labnarrative.com" || origin === "https://app.labnarrative.com" || /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin);
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
function obj(value: unknown): Json { return value && typeof value === "object" && !Array.isArray(value) ? value as Json : {}; }
function n(value: unknown, fallback = 0) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; }
function bool(value: unknown, fallback = false) { return typeof value === "boolean" ? value : fallback; }
function cleanPair(value: unknown) {
  const pair = String(value ?? "BTC/USDT").trim().toUpperCase();
  if (/^[A-Z0-9]{2,16}\/USDT$/.test(pair)) return pair;
  const base = pair.replace(/[^A-Z0-9]/g, "").replace(/USDT$/, "");
  return `${base || "BTC"}/USDT`;
}
function providerValue(value: unknown, fallback = "binance") {
  const provider = String(value ?? fallback).trim().toLowerCase();
  if (!SUPPORTED_PROVIDERS.has(provider)) throw new Error("unsupported_provider");
  return provider;
}
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const row = value as Json;
  return `{${Object.keys(row).sort().map((key) => `${JSON.stringify(key)}:${canonical(row[key])}`).join(",")}}`;
}
async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function botPayload(body: Json, current?: Json, provider = "binance") {
  const baseOrder = Math.max(0, n(body.baseOrder, n(current?.base_order)));
  const safetyOrder = Math.max(0, n(body.safetyOrder, n(current?.safety_order)));
  if (!(baseOrder > 0) || !(safetyOrder > 0)) throw new Error("invalid_order_amount");
  const maxSafetyOrders = Math.max(0, Math.min(50, Math.round(n(body.maxSafetyOrders, n(current?.max_safety_orders, 5)))));
  const limitFallback = n(current?.limit_safety_orders, maxSafetyOrders > 0 ? 1 : 0);
  const limitSafetyOrders = maxSafetyOrders > 0 ? Math.min(maxSafetyOrders, Math.max(1, Math.round(n(body.limitSafetyOrders, limitFallback)))) : 0;
  const maxActiveTrades = Math.max(1, Math.min(20, Math.round(n(body.maxActiveTrades, n(current?.max_active_trades, 1)))));
  const name = String(body.name ?? current?.name ?? "").trim();
  if (!name) throw new Error("bot_name_required");
  return {
    provider,
    name,
    pair: cleanPair(body.pair ?? current?.pair),
    baseOrder,
    safetyOrder,
    maxSafetyOrders,
    limitSafetyOrders,
    maxActiveTrades,
    deviation: Math.max(0.000001, n(body.deviation, n(current?.deviation, 1))),
    stepScale: Math.max(0.000001, n(body.stepScale, n(current?.step_scale, 1))),
    volumeScale: Math.max(0.000001, n(body.volumeScale, n(current?.volume_scale, 1))),
    takeProfit: Math.max(0, n(body.takeProfit, n(current?.take_profit_pct, 1.5))),
    stopEnabled: body.stopEnabled === undefined ? current?.stop_enabled === true : bool(body.stopEnabled),
    stopPct: Math.max(0, n(body.stopPct, n(current?.stop_pct, 8))),
  };
}
async function realAccount(db: Db, userId: string, requestedId: string) {
  let query = db.from("trader_accounts").select("id,mode,status,account_kind").eq("owner_user_id", userId).eq("account_kind", "real").eq("status", "active");
  if (requestedId) query = query.eq("id", requestedId);
  const { data, error } = await query.limit(1).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("trader_account_not_owned");
  return data as Json;
}
async function providerConnected(db: Db, accountId: string, provider: string) {
  if (provider === "binance") {
    const { data, error } = await db.from("trader_binance_connections").select("status").eq("account_id", accountId).maybeSingle();
    if (error) throw error;
    return String(data?.status || "").toLowerCase() === "connected";
  }
  const { data, error } = await db.from("trader_exchange_connections").select("status").eq("account_id", accountId).eq("provider", provider).maybeSingle();
  if (error) throw error;
  return String(data?.status || "").toLowerCase() === "connected";
}
async function nudgeWorker(db: Db, url: string) {
  const { data } = await db.from("trader_worker_secrets").select("secret").eq("name", "paper_worker").maybeSingle();
  const secret = String(data?.secret || "");
  if (!secret) return;
  try {
    await fetch(`${url}/functions/v1/trader-v2-command-worker`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-trader-worker-secret": secret },
      body: "{}",
      signal: AbortSignal.timeout(9000),
    });
  } catch { /* durable queue remains for scheduled worker */ }
}
async function readCommand(db: Db, commandId: string, userId: string) {
  const { data, error } = await db.from("trader_v2_commands")
    .select("id,command_type,status,result,error_code,requested_at,started_at,finished_at")
    .eq("id", commandId).eq("owner_user_id", userId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("command_not_found");
  return data as Json;
}
async function waitForCommand(db: Db, commandId: string, userId: string) {
  let command = await readCommand(db, commandId, userId);
  const done = new Set(["succeeded", "failed", "rejected", "cancelled"]);
  for (let i = 0; i < 10 && !done.has(String(command.status || "")); i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 180));
    command = await readCommand(db, commandId, userId);
  }
  return command;
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
    const action = String(body.action || "");
    const commandType = ACTIONS[action];
    if (!commandType) return json(req, { error: "unsupported_automation_action" }, 400);
    const idempotencyKey = String(body.idempotencyKey || "").trim();
    if (idempotencyKey.length < 8 || idempotencyKey.length > 160) return json(req, { error: "invalid_idempotency_key" }, 400);
    const account = await realAccount(db, userData.user.id, String(body.accountId || "").trim());
    const accountId = String(account.id);

    let target: Json | null = null;
    let targetId: string | null = null;
    let provider = "binance";
    if (commandType === "automation.create") {
      provider = providerValue(body.provider, "binance");
      if (!await providerConnected(db, accountId, provider)) return json(req, { error: "exchange_connection_required" }, 409);
    } else {
      const automationId = String(body.automationId || "").trim();
      const clientId = String(body.botId || "").trim();
      if (!automationId && !clientId) return json(req, { error: "automation_id_required" }, 400);
      let query = db.from("trader_bots").select("*").eq("account_id", accountId);
      if (automationId) {
        if (!UUID_PATTERN.test(automationId)) return json(req, { error: "invalid_automation_id" }, 400);
        query = query.eq("id", automationId);
      } else query = query.eq("client_id", clientId);
      const { data, error } = await query.maybeSingle();
      if (error) throw error;
      if (!data) return json(req, { error: "bot_not_found" }, 404);
      target = data as Json;
      targetId = String(target.id);
      if (target.is_archived === true) return json(req, { error: "bot_closed" }, 409);
      provider = providerValue(target.exchange_provider, "binance");
      if (commandType === "automation.update" && body.provider !== undefined && providerValue(body.provider, provider) !== provider) {
        return json(req, { error: "automation_provider_locked" }, 409);
      }
    }

    let payload: Json;
    if (commandType === "automation.create" || commandType === "automation.update") payload = botPayload(body, target ?? undefined, provider);
    else if (commandType === "automation.set_status") payload = { provider, status: String(body.status || "Running") === "Stopped" ? "Stopped" : "Running" };
    else payload = { provider };

    const requestFingerprint = await sha256(canonical({ commandType, accountId, targetId, payload }));
    const validation = {
      requested: payload,
      targetClientId: target?.client_id ?? null,
      targetAutomationId: targetId,
      accountMode: account.mode,
      provider,
      noOrderSentOnApply: true,
      validatedAt: new Date().toISOString(),
    };
    const { data: enqueued, error: enqueueError } = await db.rpc("trader_v2_enqueue_automation_command", {
      p_owner_user_id: userData.user.id,
      p_account_id: accountId,
      p_idempotency_key: idempotencyKey,
      p_request_fingerprint: requestFingerprint,
      p_command_type: commandType,
      p_target_id: targetId,
      p_payload: payload,
      p_validation: validation,
    });
    if (enqueueError) throw enqueueError;
    const queued = Array.isArray(enqueued) ? obj(enqueued[0]) : obj(enqueued);
    const commandId = String(queued.command_id || "");
    if (!commandId) throw new Error("command_enqueue_failed");

    if (["queued", "running"].includes(String(queued.command_status || ""))) await nudgeWorker(db, url);
    const command = await waitForCommand(db, commandId, userData.user.id);
    if (command.status === "failed" || command.status === "rejected") return json(req, { error: command.error_code || "automation_command_failed", command }, 409);

    return json(req, {
      ok: true,
      command: {
        id: command.id, type: command.command_type, status: command.status,
        replayed: queued.replayed === true, result: command.result ?? null,
        requestedAt: command.requested_at, startedAt: command.started_at, finishedAt: command.finished_at,
      },
      pending: !["succeeded", "failed", "rejected", "cancelled"].includes(String(command.status || "")),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || "automation_command_failed");
    const safe = [
      "trader_account_not_owned","invalid_order_amount","bot_name_required","bot_not_found","bot_closed","bot_id_required","automation_id_required","invalid_automation_id",
      "bot_pair_locked_by_active_trade","bot_has_active_trades","bot_has_open_orders","exchange_connection_required","idempotency_key_reuse","unsupported_provider","automation_provider_locked","core_v2_execute_disabled",
    ].find((code) => message.includes(code));
    return json(req, { error: safe || "automation_command_failed" }, safe === "trader_account_not_owned" ? 403 : safe === "bot_not_found" ? 404 : safe === "exchange_connection_required" || safe === "automation_provider_locked" || safe === "core_v2_execute_disabled" ? 409 : 400);
  }
});