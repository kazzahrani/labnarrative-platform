import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

type Db = ReturnType<typeof createClient>;

type GateRow = {
  command_type: string;
  enabled: boolean;
};

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

function clean(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = String((error as { message?: unknown }).message || "").trim();
    if (message) return message;
  }
  return String(error || "unknown_error");
}

async function realAccount(db: Db, userId: string) {
  const { data, error } = await db.from("trader_accounts")
    .select("id,name,mode,status,account_kind")
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
    const account = await realAccount(db, userData.user.id);
    const [{ data: control, error: controlError }, { data: gates, error: gateError }] = await Promise.all([
      db.from("trader_execution_controls")
        .select("global_live_enabled,kill_switch,live_confirmed_at,live_generation")
        .eq("account_id", account.id)
        .maybeSingle(),
      db.from("trader_v2_command_gates")
        .select("command_type,enabled")
        .eq("account_id", account.id),
    ]);
    if (controlError) throw controlError;
    if (gateError) throw gateError;

    const gateMap = new Map<string, boolean>((gates || []).map((row: GateRow) => [String(row.command_type), row.enabled === true]));
    const liveExecutionReady = account.mode === "live" && control?.global_live_enabled === true && control?.kill_switch === false;
    const exitPlanGateEnabled = gateMap.get("position.update_exit_plan") === true;
    const exitPlanAvailable = liveExecutionReady && exitPlanGateEnabled;

    return json(req, {
      ok: true,
      ready: true,
      account: {
        id: account.id,
        name: account.name || "Real Account",
        mode: account.mode,
        status: account.status,
      },
      execution: {
        liveExecutionReady,
        globalLiveEnabled: control?.global_live_enabled === true,
        killSwitch: control?.kill_switch === true,
        liveConfirmedAt: control?.live_confirmed_at || null,
        liveGeneration: control?.live_generation ?? null,
      },
      commands: {
        "position.update_exit_plan": {
          gateEnabled: exitPlanGateEnabled,
          available: exitPlanAvailable,
          reason: exitPlanAvailable
            ? null
            : !liveExecutionReady
              ? "live_trading_not_enabled"
              : "core_v2_execute_disabled",
          sendsOrder: false,
        },
      },
    });
  } catch (error) {
    const code = clean(error);
    if (code === "real_account_required") return json(req, { error: code }, 403);
    console.error("trader-v2-command-capabilities", code);
    return json(req, { error: "trader_v2_command_capabilities_failed" }, 500);
  }
});
