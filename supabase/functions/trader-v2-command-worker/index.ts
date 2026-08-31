import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { normalizeLaunchExchangeProvider } from "../_shared/trader-exchange.ts";
import { requireLiveExchangeConnection } from "../_shared/trader-exchange-live-guard.ts";

type Json = Record<string, unknown>;
type Db = ReturnType<typeof createClient>;
type Command = {
  id: string;
  owner_user_id: string;
  account_id: string;
  command_type: string;
  target_id: string | null;
  validation: Json | null;
  attempt_count: number;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}
function obj(value: unknown): Json { return value && typeof value === "object" && !Array.isArray(value) ? value as Json : {}; }
function n(value: unknown, fallback = 0) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; }
function clean(error: unknown) { return (error instanceof Error ? error.message : String(error || "unknown_error")).slice(0, 160); }
async function verify(db: Db, value: string) {
  if (!value) return false;
  const { data, error } = await db.from("trader_worker_secrets").select("secret").eq("name", "paper_worker").maybeSingle();
  return !error && data?.secret === value;
}
function retryDelay(attempt: number) { return Math.min(20, Math.max(1, Math.pow(2, Math.min(4, Math.max(0, attempt - 1))))); }

async function processCommand(db: Db, command: Command, workerId: string) {
  const validation = obj(command.validation);
  const requested = obj(validation.requested);
  let exitLockHeld = false;
  try {
    if (command.command_type !== "position.update_exit_plan") throw new Error("unsupported_worker_command");
    if (!command.target_id) throw new Error("position_not_found");

    const [{ data: account, error: accountError }, { data: control, error: controlError }, { data: trade, error: tradeError }] = await Promise.all([
      db.from("trader_accounts").select("id,mode,status,account_kind").eq("id", command.account_id).maybeSingle(),
      db.from("trader_execution_controls").select("global_live_enabled,kill_switch").eq("account_id", command.account_id).maybeSingle(),
      db.from("trader_trades").select("id,status,execution_mode,exchange_provider,client_state").eq("id", command.target_id).eq("account_id", command.account_id).maybeSingle(),
    ]);
    if (accountError) throw accountError;
    if (controlError) throw controlError;
    if (tradeError) throw tradeError;
    if (!account || account.account_kind !== "real" || account.status !== "active") throw new Error("real_account_required");
    if (account.mode !== "live" || !control || control.global_live_enabled !== true || control.kill_switch !== false) throw new Error("live_trading_not_enabled");
    if (!trade) throw new Error("position_not_found");
    if (trade.status !== "Active") throw new Error("position_not_active");
    if (trade.execution_mode !== "live") throw new Error("position_not_live");

    const state = obj(trade.client_state);
    if (state.exitStrategyV2 !== true) throw new Error("exit_strategy_v2_required");
    const provider = normalizeLaunchExchangeProvider(String(trade.exchange_provider || state.exchangeProvider || state.exchange || "binance"), "binance");
    await requireLiveExchangeConnection(db, command.account_id, provider);

    const stopEnabled = requested.stopEnabled === true;
    const stopPct = n(requested.stopPct, NaN);
    if (stopEnabled && !(stopPct > 0)) throw new Error("invalid_stop_loss");
    const hasTargets = Object.prototype.hasOwnProperty.call(requested, "takeProfitTargets");
    const targets = hasTargets ? requested.takeProfitTargets : null;
    if (hasTargets && !Array.isArray(targets)) throw new Error("invalid_take_profit_targets");

    const { data: locked, error: lockError } = await db.rpc("trader_begin_exit_command", {
      p_account_id: command.account_id,
      p_lock_id: workerId,
      p_lease_seconds: 31,
    });
    if (lockError) throw lockError;
    if (locked !== true) throw new Error("account_busy");
    exitLockHeld = true;

    const { data: result, error: applyError } = await db.rpc("trader_v2_apply_exit_plan_command", {
      p_command_id: command.id,
      p_worker_id: workerId,
      p_stop_enabled: stopEnabled,
      p_stop_pct: Number.isFinite(stopPct) ? stopPct : 0,
      p_take_profit_targets: hasTargets ? targets : null,
    });
    if (applyError) throw applyError;
    return { id: command.id, ok: true, result };
  } catch (error) {
    const code = clean(error);
    const attempt = Math.max(1, Math.round(n(command.attempt_count, 1)));
    if (code === "account_busy" && attempt < 8) {
      const delay = retryDelay(attempt);
      await db.rpc("trader_v2_requeue_command", { p_command_id: command.id, p_worker_id: workerId, p_error_code: code, p_delay_seconds: delay });
      return { id: command.id, ok: false, retrying: true, error: code, delaySeconds: delay };
    }
    await db.rpc("trader_v2_fail_command", { p_command_id: command.id, p_worker_id: workerId, p_error_code: code });
    return { id: command.id, ok: false, retrying: false, error: code };
  } finally {
    if (exitLockHeld) {
      await db.rpc("trader_release_exit_account", { p_account_id: command.account_id, p_worker_id: workerId }).catch(() => undefined);
    }
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const url = Deno.env.get("SUPABASE_URL"), key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return json({ error: "server_configuration_missing" }, 500);
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  if (!await verify(db, req.headers.get("x-trader-worker-secret") || "")) return json({ error: "unauthorized" }, 401);

  const workerId = crypto.randomUUID();
  const { data, error } = await db.rpc("trader_v2_claim_exit_plan_commands", { p_worker_id: workerId, p_limit: 4, p_lease_seconds: 45 });
  if (error) return json({ error: clean(error) }, 500);
  const commands = (data || []) as Command[];
  const results = [];
  for (const command of commands) results.push(await processCommand(db, command, workerId));
  return json({ ok: true, workerId, claimed: commands.length, results });
});
