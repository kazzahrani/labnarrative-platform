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

  const [configQ, plansQ, subscriptionQ, attributionQ] = await Promise.all([
    admin.from("trader_billing_config").select("checkout_enabled,provider,currency,referral_discount_bps").eq("id", 1).maybeSingle(),
    admin.from("trader_subscription_plans").select("id,slug,name,description,sort_order,monthly_price_cents,annual_price_cents,currency,is_active,max_single_pair_bots,max_multi_pair_bots,max_active_exchanges").eq("is_active", true).order("sort_order"),
    admin.from("trader_subscriptions").select("id,status,billing_interval,list_price_cents,subscription_price_cents,currency,started_at,next_billing_at,referral_discount_applied,trader_subscription_plans(slug,name,max_single_pair_bots,max_multi_pair_bots,max_active_exchanges)").eq("owner_user_id", owner).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    admin.from("trader_referral_attributions").select("referral_code").eq("referred_owner_user_id", owner).maybeSingle(),
  ]);

  const error = configQ.error || plansQ.error || subscriptionQ.error || attributionQ.error;
  if (error) return json({ error: error.message || "pricing_load_failed" }, 500);

  const config = configQ.data || { checkout_enabled: false, provider: "paypal", currency: "USD", referral_discount_bps: 1000 };
  return json({
    ok: true,
    checkoutEnabled: Boolean(config.checkout_enabled),
    provider: config.provider || "paypal",
    currency: config.currency || "USD",
    referralDiscountBps: Number(config.referral_discount_bps || 0),
    referralAttached: Boolean(attributionQ.data),
    plans: plansQ.data || [],
    subscription: subscriptionQ.data || null,
  });
});
