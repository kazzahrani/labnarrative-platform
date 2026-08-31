import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = new Set(["https://platform.labnarrative.com", "https://app.labnarrative.com"]);
type Db = ReturnType<typeof createClient>;

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
    const [{ data: latest, error: latestError }, { data: history, error: historyError }, { data: syncRuns, error: syncError }] = await Promise.all([
      db.from("trader_v2_portfolio_latest").select("*").eq("account_id", accountId).maybeSingle(),
      db.from("trader_v2_portfolio_snapshots").select("bucket_at,captured_at,total_usd,cash_usd,holdings_usd").eq("account_id", accountId).order("bucket_at", { ascending: false }).limit(1440),
      db.from("trader_v2_sync_runs").select("provider,status,started_at,completed_at,duration_ms,asset_count,error_code").eq("account_id", accountId).eq("sync_kind", "portfolio").order("started_at", { ascending: false }).limit(24),
    ]);
    if (latestError) throw latestError;
    if (historyError) throw historyError;
    if (syncError) throw syncError;
    if (!latest) return json(req, { ok: true, shadow: true, ready: false, accountId, message: "v2_snapshot_pending" });
    const ageMs = Math.max(0, Date.now() - Date.parse(String(latest.captured_at)));
    return json(req, { ok: true, shadow: true, ready: true, accountId, ageMs, portfolio: latest, history: (history ?? []).reverse(), syncRuns: syncRuns ?? [] });
  } catch (error) {
    const message = clean(error);
    return json(req, { error: message === "real_account_required" ? message : "trader_v2_portfolio_read_failed" }, message === "real_account_required" ? 403 : 500);
  }
});
