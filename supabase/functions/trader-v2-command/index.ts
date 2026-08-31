import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

type Json = Record<string, unknown>;
type Db = ReturnType<typeof createClient>;

type CommandRow = {
  id: string;
  owner_user_id: string;
  account_id: string;
  idempotency_key: string;
  request_fingerprint: string;
  command_type: string;
  target_type: string;
  target_id: string | null;
  payload: Json;
  mode: string;
  status: string;
  validation: Json | null;
  result: Json | null;
  error_code: string | null;
  requested_at: string;
  validated_at: string | null;
  started_at: string | null;
  finished_at: string | null;
};

const COMMAND_TARGET: Record<string, string> = {
  "system.preflight": "system",
  "automation.set_status": "automation",
  "position.update_exit_plan": "position",
  "position.close": "position",
  "position.add_funds": "position",
};

const SENSITIVE_KEY = /(api.?key|secret|password|passphrase|private.?key|access.?token|refresh.?token|tradingview.?token|webhook.?secret)/i;

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
function obj(value: unknown): Json { return value && typeof value === "object" && !Array.isArray(value) ? value as Json : {}; }
function n(value: unknown, fallback = 0) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; }
function clean(error: unknown) { return error instanceof Error ? error.message : String(error || "unknown_error"); }
function statusCode(error: string) {
  if (error === "unauthorized") return 401;
  if (error === "real_account_required") return 403;
  if (error === "idempotency_key_reuse") return 409;
  if (error === "execute_mode_disabled") return 409;
  if (error.endsWith("_not_found")) return 404;
  if (error.endsWith("_not_active")) return 409;
  return 400;
}
function hasSensitiveKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasSensitiveKey);
  if (!value || typeof value !== "object") return false;
  for (const [key, nested] of Object.entries(value as Json)) {
    if (SENSITIVE_KEY.test(key)) return true;
    if (hasSensitiveKey(nested)) return true;
  }
  return false;
}
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
  return { id: String(data.id), name: String(data.name || "Real Account"), mode: String(data.mode || "shadow"), status: String(data.status || "active") };
}
async function controls(db: Db, accountId: string) {
  const { data, error } = await db.from("trader_execution_controls")
    .select("global_live_enabled,kill_switch,max_live_capital,max_single_order,max_concurrent_live_trades,daily_loss_limit,live_confirmed_at,live_generation")
    .eq("account_id", accountId)
    .maybeSingle();
  if (error) throw error;
  return data ? {
    globalLiveEnabled: data.global_live_enabled === true,
    killSwitch: data.kill_switch === true,
    maxLiveCapital: n(data.max_live_capital),
    maxSingleOrder: n(data.max_single_order),
    maxConcurrentLiveTrades: Math.max(0, Math.round(n(data.max_concurrent_live_trades))),
    dailyLossLimit: n(data.daily_loss_limit),
    liveConfirmedAt: data.live_confirmed_at ? String(data.live_confirmed_at) : null,
    liveGeneration: data.live_generation == null ? null : n(data.live_generation),
  } : null;
}
async function recordEvent(db: Db, commandId: string, userId: string, eventType: string, details: Json = {}) {
  const { error } = await db.from("trader_v2_command_events").insert({ command_id: commandId, owner_user_id: userId, event_type: eventType, details });
  if (error) throw error;
}
function validateExitTargets(value: unknown) {
  if (value === undefined) return null;
  if (!Array.isArray(value) || value.length < 1 || value.length > 8) throw new Error("invalid_take_profit_targets");
  let allocation = 0;
  const targets = value.map((raw) => {
    const row = obj(raw);
    const profitPct = n(row.profitPct, NaN);
    const allocationPct = n(row.allocationPct, NaN);
    if (!(profitPct > 0) || !(allocationPct > 0) || allocationPct > 100) throw new Error("invalid_take_profit_targets");
    allocation += allocationPct;
    return { profitPct, allocationPct };
  });
  if (Math.abs(allocation - 100) > 0.01) throw new Error("take_profit_allocation_must_equal_100");
  return targets;
}
async function validateCommand(db: Db, account: { id: string; name: string; mode: string; status: string }, commandType: string, targetId: string | null, payload: Json) {
  const executionControls = await controls(db, account.id);
  const base: Json = {
    shadow: true,
    noMutationPerformed: true,
    account: { name: account.name, mode: account.mode, status: account.status },
    executionControls,
  };

  if (commandType === "system.preflight") {
    return { ...base, target: { type: "system" }, wouldExecute: false, reason: "shadow_preflight_only" };
  }

  if (!targetId) throw new Error("target_id_required");

  if (commandType === "automation.set_status") {
    const desiredRaw = String(payload.status || "").trim().toLowerCase();
    if (desiredRaw !== "running" && desiredRaw !== "stopped") throw new Error("invalid_automation_status");
    const desiredStatus = desiredRaw === "running" ? "Running" : "Stopped";
    const { data: bot, error } = await db.from("trader_bots")
      .select("id,name,status,is_archived,exchange_provider,execution_mode,tradingview_enabled")
      .eq("account_id", account.id)
      .eq("id", targetId)
      .maybeSingle();
    if (error) throw error;
    if (!bot || bot.is_archived === true) throw new Error("automation_not_found");
    const { count: activePositions, error: countError } = await db.from("trader_trades")
      .select("id", { count: "exact", head: true })
      .eq("account_id", account.id)
      .eq("bot_id", targetId)
      .eq("status", "Active");
    if (countError) throw countError;
    const currentStatus = String(bot.status || "Stopped");
    return {
      ...base,
      target: { type: "automation", id: String(bot.id), name: String(bot.name || "Automation"), provider: String(bot.exchange_provider || "unknown").toLowerCase(), executionMode: String(bot.execution_mode || ""), tradingView: bot.tradingview_enabled === true },
      current: { status: currentStatus, activePositions: activePositions || 0 },
      requested: { status: desiredStatus },
      wouldMutate: currentStatus.toLowerCase() !== desiredStatus.toLowerCase(),
      legacyControl: "trader-account-control-v2",
    };
  }

  const { data: trade, error: tradeError } = await db.from("trader_trades")
    .select("id,client_id,bot_id,pair,status,execution_mode,exchange_provider,client_state,stop_enabled,stop_pct,averaging_filled,max_averaging,active_orders_limit")
    .eq("account_id", account.id)
    .eq("id", targetId)
    .maybeSingle();
  if (tradeError) throw tradeError;
  if (!trade) throw new Error("position_not_found");
  if (String(trade.status) !== "Active") throw new Error("position_not_active");
  if (String(trade.execution_mode) !== "live") throw new Error("position_not_live");
  const state = obj(trade.client_state);
  const provider = String(trade.exchange_provider || state.exchangeProvider || state.exchange || "binance").toLowerCase();
  const positionBase: Json = {
    ...base,
    target: { type: "position", id: String(trade.id), clientId: String(trade.client_id || ""), pair: String(trade.pair || ""), provider, executionMode: String(trade.execution_mode || "") },
    current: {
      exitStrategyV2: state.exitStrategyV2 === true,
      stopEnabled: typeof state.stopEnabled === "boolean" ? state.stopEnabled : trade.stop_enabled === true,
      stopPct: n(state.stopPct, n(trade.stop_pct)),
      completedDcaOrders: Math.max(0, Math.round(n(trade.averaging_filled))),
      maxDcaOrders: Math.max(0, Math.round(n(trade.max_averaging))),
      activeDcaLimit: Math.max(0, Math.round(n(trade.active_orders_limit))),
    },
  };

  if (commandType === "position.update_exit_plan") {
    const current = obj(positionBase.current);
    const stopEnabled = payload.stopEnabled === undefined ? current.stopEnabled === true : payload.stopEnabled === true;
    const stopPct = payload.stopPct === undefined ? n(current.stopPct) : n(payload.stopPct, NaN);
    if (stopEnabled && !(stopPct > 0)) throw new Error("invalid_stop_loss");
    const takeProfitTargets = validateExitTargets(payload.takeProfitTargets);
    return {
      ...positionBase,
      requested: { stopEnabled, stopPct, ...(takeProfitTargets ? { takeProfitTargets } : {}) },
      legacyControl: takeProfitTargets ? "trader-live-trade-control + trader-live-tp-control" : "trader-live-trade-control",
      wouldMutate: true,
    };
  }

  if (commandType === "position.close") {
    if (Object.keys(payload).length > 0) throw new Error("position_close_payload_not_allowed");
    return { ...positionBase, requested: { close: true }, legacyControl: "trader-live-trade-control", wouldMutate: true };
  }

  if (commandType === "position.add_funds") {
    const quoteAmount = n(payload.quoteAmount, NaN);
    if (!(quoteAmount > 0) || quoteAmount > 1_000_000) throw new Error("invalid_add_funds_amount");
    return { ...positionBase, requested: { quoteAmount }, legacyControl: "trader-live-trade-control", wouldMutate: true };
  }

  throw new Error("unsupported_command_type");
}
function publicCommand(row: CommandRow, replayed = false) {
  return {
    id: row.id,
    commandType: row.command_type,
    targetType: row.target_type,
    targetId: row.target_id,
    mode: row.mode,
    status: row.status,
    validation: row.validation,
    result: row.result,
    errorCode: row.error_code,
    requestedAt: row.requested_at,
    validatedAt: row.validated_at,
    finishedAt: row.finished_at,
    replayed,
  };
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

  const raw = await req.text();
  if (raw.length > 32_000) return json(req, { error: "payload_too_large" }, 413);
  const body = (() => { try { return JSON.parse(raw || "{}") as Json; } catch { return {}; } })();
  const action = String(body.action || "submit").trim().toLowerCase();

  try {
    const account = await realAccount(db, userData.user.id);

    if (action === "get") {
      const commandId = String(body.commandId || "").trim();
      if (!commandId) throw new Error("command_id_required");
      const [{ data: command, error }, { data: events, error: eventsError }] = await Promise.all([
        db.from("trader_v2_commands").select("*").eq("id", commandId).eq("owner_user_id", userData.user.id).eq("account_id", account.id).maybeSingle(),
        db.from("trader_v2_command_events").select("event_type,details,created_at").eq("command_id", commandId).eq("owner_user_id", userData.user.id).order("created_at", { ascending: true }),
      ]);
      if (error) throw error;
      if (eventsError) throw eventsError;
      if (!command) throw new Error("command_not_found");
      return json(req, { ok: true, command: publicCommand(command as CommandRow), events: events || [] });
    }

    if (action === "list") {
      const limit = Math.min(100, Math.max(1, Math.round(n(body.limit, 25))));
      const { data, error } = await db.from("trader_v2_commands")
        .select("id,owner_user_id,account_id,idempotency_key,request_fingerprint,command_type,target_type,target_id,payload,mode,status,validation,result,error_code,requested_at,validated_at,started_at,finished_at")
        .eq("owner_user_id", userData.user.id)
        .eq("account_id", account.id)
        .order("requested_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return json(req, { ok: true, commands: (data || []).map((row) => publicCommand(row as CommandRow)) });
    }

    if (action !== "submit") throw new Error("unsupported_action");
    if (String(body.mode || "shadow").toLowerCase() !== "shadow") throw new Error("execute_mode_disabled");

    const commandType = String(body.commandType || "").trim();
    const targetType = COMMAND_TARGET[commandType];
    if (!targetType) throw new Error("unsupported_command_type");
    const targetId = targetType === "system" ? null : String(body.targetId || "").trim() || null;
    const payload = obj(body.payload);
    if (hasSensitiveKey(payload)) throw new Error("sensitive_payload_forbidden");
    const idempotencyKey = String(body.idempotencyKey || "").trim();
    if (idempotencyKey.length < 8 || idempotencyKey.length > 160) throw new Error("invalid_idempotency_key");
    const fingerprint = await sha256(canonical({ commandType, targetType, targetId, payload }));

    const now = new Date().toISOString();
    const insertRow = {
      owner_user_id: userData.user.id,
      account_id: account.id,
      idempotency_key: idempotencyKey,
      request_fingerprint: fingerprint,
      command_type: commandType,
      target_type: targetType,
      target_id: targetId,
      payload,
      mode: "shadow",
      status: "validating",
      requested_at: now,
    };
    const { data: inserted, error: insertError } = await db.from("trader_v2_commands").insert(insertRow).select("*").maybeSingle();
    if (insertError) {
      if (insertError.code !== "23505") throw insertError;
      const { data: existing, error: existingError } = await db.from("trader_v2_commands")
        .select("*")
        .eq("owner_user_id", userData.user.id)
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();
      if (existingError) throw existingError;
      if (!existing) throw insertError;
      const row = existing as CommandRow;
      if (row.request_fingerprint !== fingerprint) throw new Error("idempotency_key_reuse");
      return json(req, { ok: true, command: publicCommand(row, true) });
    }
    if (!inserted) throw new Error("command_insert_failed");
    const command = inserted as CommandRow;
    await recordEvent(db, command.id, userData.user.id, "received", { commandType, targetType, targetId, mode: "shadow" });

    try {
      const validation = await validateCommand(db, account, commandType, targetId, payload);
      const finishedAt = new Date().toISOString();
      const result: Json = { shadow: true, executed: false, message: "Validated only. No live mutation was performed." };
      const { data: updated, error: updateError } = await db.from("trader_v2_commands").update({ status: "shadow_validated", validation, result, validated_at: finishedAt, finished_at: finishedAt }).eq("id", command.id).select("*").single();
      if (updateError) throw updateError;
      await recordEvent(db, command.id, userData.user.id, "shadow_validated", { commandType, targetType, targetId, noMutationPerformed: true });
      return json(req, { ok: true, command: publicCommand(updated as CommandRow) });
    } catch (validationError) {
      const code = clean(validationError);
      const finishedAt = new Date().toISOString();
      const { data: updated } = await db.from("trader_v2_commands").update({ status: "rejected", error_code: code, validated_at: finishedAt, finished_at: finishedAt, result: { shadow: true, executed: false } }).eq("id", command.id).select("*").maybeSingle();
      await recordEvent(db, command.id, userData.user.id, "rejected", { commandType, targetType, targetId, errorCode: code, noMutationPerformed: true }).catch(() => undefined);
      return json(req, { error: code, command: updated ? publicCommand(updated as CommandRow) : undefined }, statusCode(code));
    }
  } catch (error) {
    const code = clean(error);
    console.error("trader-v2-command", code);
    const publicErrors = new Set([
      "real_account_required", "command_id_required", "command_not_found", "unsupported_action", "execute_mode_disabled",
      "unsupported_command_type", "target_id_required", "sensitive_payload_forbidden", "invalid_idempotency_key",
      "idempotency_key_reuse", "invalid_automation_status", "automation_not_found", "position_not_found", "position_not_active",
      "position_not_live", "invalid_stop_loss", "invalid_take_profit_targets", "take_profit_allocation_must_equal_100",
      "position_close_payload_not_allowed", "invalid_add_funds_amount", "payload_too_large",
    ]);
    return json(req, { error: publicErrors.has(code) ? code : "trader_v2_command_failed" }, statusCode(publicErrors.has(code) ? code : "trader_v2_command_failed"));
  }
});
