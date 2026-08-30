import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

type J = Record<string, unknown>;
const cors = {
  "Access-Control-Allow-Origin": "https://platform.labnarrative.com",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
function text(v: unknown, max = 8000) { return typeof v === "string" ? v.trim().slice(0, max) : ""; }
function envMap(name: string): Record<string, string> { try { return JSON.parse(Deno.env.get(name) || "{}") as Record<string, string>; } catch { return {}; } }
function serviceKey() { return envMap("SUPABASE_SECRET_KEYS").default || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""; }
function isMulti(bot: J) { return bot.all_pairs === true || (Array.isArray(bot.pairs) && bot.pairs.length > 1); }

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const base = Deno.env.get("SUPABASE_URL") || "";
  const key = serviceKey();
  if (!base || !key) return json({ error: "server_configuration_missing" }, 500);
  const admin = createClient(base, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const auth = text(req.headers.get("authorization"));
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
  if (!token) return json({ error: "unauthorized" }, 401);
  const userResult = await admin.auth.getUser(token);
  if (userResult.error || !userResult.data.user) return json({ error: "unauthorized" }, 401);
  const owner = userResult.data.user.id;

  const entQ = await admin.rpc("trader_effective_entitlements", { p_owner_user_id: owner });
  if (entQ.error) return json({ error: entQ.error.message || "entitlements_load_failed" }, 500);
  const ent = Array.isArray(entQ.data) ? (entQ.data[0] || null) : entQ.data;
  if (!ent) return json({ error: "entitlements_not_configured" }, 500);

  const accountsQ = await admin.from("trader_accounts").select("id").eq("owner_user_id", owner).eq("status", "active");
  if (accountsQ.error) return json({ error: accountsQ.error.message || "accounts_load_failed" }, 500);
  const accountIds = (accountsQ.data || []).map((row: { id: string }) => row.id);

  let singleBots = 0;
  let multiBots = 0;
  let exchanges = 0;
  if (accountIds.length) {
    const [botsQ, binanceQ, exchangeQ] = await Promise.all([
      admin.from("trader_bots").select("id,all_pairs,pairs").in("account_id", accountIds).eq("is_archived", false),
      admin.from("trader_binance_connections").select("id").in("account_id", accountIds).in("status", ["pending", "connected"]),
      admin.from("trader_exchange_connections").select("id").in("account_id", accountIds).in("status", ["pending", "connected"]),
    ]);
    const error = botsQ.error || binanceQ.error || exchangeQ.error;
    if (error) return json({ error: error.message || "entitlement_usage_load_failed" }, 500);
    for (const bot of (botsQ.data || []) as J[]) {
      if (isMulti(bot)) multiBots += 1;
      else singleBots += 1;
    }
    exchanges = (binanceQ.data || []).length + (exchangeQ.data || []).length;
  }

  const maxSingle = Number(ent.max_single_pair_bots || 0);
  const maxMulti = Number(ent.max_multi_pair_bots || 0);
  const maxExchanges = ent.max_active_exchanges == null ? null : Number(ent.max_active_exchanges);

  return json({
    ok: true,
    enforcementActive: Boolean(ent.enforcement_active),
    plan: String(ent.plan_slug || "free"),
    isPaid: Boolean(ent.is_paid),
    limits: {
      singlePairBots: maxSingle,
      multiPairBots: maxMulti,
      activeExchanges: maxExchanges,
    },
    usage: {
      singlePairBots: singleBots,
      multiPairBots: multiBots,
      activeExchanges: exchanges,
    },
    remaining: {
      singlePairBots: Math.max(0, maxSingle - singleBots),
      multiPairBots: Math.max(0, maxMulti - multiBots),
      activeExchanges: maxExchanges == null ? null : Math.max(0, maxExchanges - exchanges),
    },
    overLimit: {
      singlePairBots: singleBots > maxSingle,
      multiPairBots: multiBots > maxMulti,
      activeExchanges: maxExchanges == null ? false : exchanges > maxExchanges,
    },
  });
});
