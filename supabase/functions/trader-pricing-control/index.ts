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
function future(v: unknown) { const s = text(v, 100); return Boolean(s && Number.isFinite(Date.parse(s)) && Date.parse(s) > Date.now()); }
function currentSubscription(rows: any[]) {
  return rows.find((s) => s.status === "active")
    || rows.find((s) => s.status === "payment_failed" && future(s.access_ends_at))
    || rows.find((s) => s.status === "suspended")
    || rows.find((s) => s.status === "cancelled" && future(s.access_ends_at))
    || rows.find((s) => s.status === "approval_pending")
    || null;
}

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

  const [configQ, plansQ, subscriptionsQ, attributionQ, overrideQ, entitlementsQ] = await Promise.all([
    admin.from("trader_billing_config").select("checkout_enabled,checkout_mode,provider,currency,referral_discount_bps,payment_grace_days,entitlements_enforced").eq("id", 1).maybeSingle(),
    admin.from("trader_subscription_plans").select("id,slug,name,description,sort_order,monthly_price_cents,annual_price_cents,currency,is_active,max_single_pair_bots,max_multi_pair_bots,max_active_exchanges").eq("is_active", true).order("sort_order"),
    admin.from("trader_subscriptions").select("id,plan_id,status,billing_interval,list_price_cents,subscription_price_cents,currency,started_at,next_billing_at,referral_discount_applied,cancel_at_period_end,cancellation_requested_at,access_ends_at,pending_plan_id,pending_billing_interval,plan_change_requested_at,plan_change_effective_at,provider_synced_at,trader_subscription_plans:trader_subscription_plans!trader_subscriptions_plan_id_fkey(slug,name,max_single_pair_bots,max_multi_pair_bots,max_active_exchanges)").eq("owner_user_id", owner).order("created_at", { ascending: false }).limit(20),
    admin.from("trader_referral_attributions").select("referral_code").eq("referred_owner_user_id", owner).maybeSingle(),
    admin.from("trader_entitlement_overrides").select("reason,is_active,expires_at,plan_id").eq("owner_user_id", owner).eq("is_active", true).maybeSingle(),
    admin.rpc("trader_effective_entitlements", { p_owner_user_id: owner }),
  ]);

  const error = configQ.error || plansQ.error || subscriptionsQ.error || attributionQ.error || overrideQ.error || entitlementsQ.error;
  if (error) return json({ error: error.message || "pricing_load_failed" }, 500);

  const config = configQ.data || { checkout_enabled: false, checkout_mode: "disabled", provider: "paypal", currency: "USD", referral_discount_bps: 1000, payment_grace_days: 3, entitlements_enforced: false };
  const rows = subscriptionsQ.data || [];
  const current = currentSubscription(rows);
  const pending = rows.find((s: any) => s.status === "approval_pending") || null;
  const ent = Array.isArray(entitlementsQ.data) ? (entitlementsQ.data[0] || null) : entitlementsQ.data;
  const override = overrideQ.data && (!overrideQ.data.expires_at || future(overrideQ.data.expires_at)) ? overrideQ.data : null;
  const checkoutMode = String(config.checkout_mode || (config.checkout_enabled ? "public" : "disabled"));
  const founderCanaryEligible = checkoutMode === "founder_canary" && override?.reason === "founder_tester";
  const checkoutCanary = Boolean(config.checkout_enabled) && founderCanaryEligible;
  const checkoutEnabled = Boolean(config.checkout_enabled) && (checkoutMode === "public" || checkoutCanary);

  return json({
    ok: true,
    checkoutEnabled,
    checkoutMode,
    checkoutCanary,
    entitlementsEnforced: Boolean(config.entitlements_enforced),
    provider: config.provider || "paypal",
    currency: config.currency || "USD",
    referralDiscountBps: Number(config.referral_discount_bps || 0),
    paymentGraceDays: Number(config.payment_grace_days || 3),
    referralAttached: Boolean(attributionQ.data),
    accessOverride: override ? { reason: override.reason || "manual", expiresAt: override.expires_at || null } : null,
    entitlements: ent ? {
      plan: String(ent.plan_slug || "free"),
      isPaid: Boolean(ent.is_paid),
      singlePairBots: Number(ent.max_single_pair_bots || 0),
      multiPairBots: Number(ent.max_multi_pair_bots || 0),
      activeExchanges: ent.max_active_exchanges == null ? null : Number(ent.max_active_exchanges),
    } : null,
    plans: plansQ.data || [],
    subscription: current,
    pendingSubscription: pending,
  });
});
