import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "https://platform.labnarrative.com",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "content-type": "application/json", "cache-control": "no-store" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !service) return json({ error: "server_configuration_missing" }, 500);

  const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!bearer) return json({ error: "unauthorized" }, 401);

  let body: { accountId?: string } = {};
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const accountId = String(body.accountId || "").trim();
  if (!accountId) return json({ error: "account_id_required" }, 400);

  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: userData, error: userError } = await admin.auth.getUser(bearer);
  const user = userData.user;
  if (userError || !user) return json({ error: "unauthorized" }, 401);

  const { data: account, error: accountError } = await admin.from("trader_accounts")
    .select("id,account_kind,mode,status")
    .eq("id", accountId)
    .eq("owner_user_id", user.id)
    .eq("status", "active")
    .maybeSingle();
  if (accountError) return json({ error: "account_lookup_failed" }, 500);
  if (!account) return json({ error: "account_not_owned" }, 403);
  if (!(account.account_kind === "paper" || account.mode === "paper")) return json({ error: "paper_account_required" }, 409);

  const { data: holdings, error: holdingsError } = await admin.from("trader_paper_core_holdings")
    .select("symbol,quantity,average_cost,acquired_at,metadata")
    .eq("account_id", accountId)
    .order("acquired_at", { ascending: true });
  if (holdingsError) return json({ error: "holdings_lookup_failed" }, 500);

  return json({ ok: true, holdings: holdings ?? [] });
});
