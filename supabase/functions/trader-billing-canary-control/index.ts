import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

type J = Record<string, unknown>;
const cors = {
  "Access-Control-Allow-Origin": "https://platform.labnarrative.com",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json", "cache-control": "no-store" } });
}
function text(v: unknown, max = 4000) { return typeof v === "string" ? v.trim().slice(0, max) : ""; }
function arr(v: unknown): J[] { return Array.isArray(v) ? v.filter((x) => x && typeof x === "object") as J[] : []; }
function envMap(name: string): Record<string, string> { try { return JSON.parse(Deno.env.get(name) || "{}") as Record<string, string>; } catch { return {}; } }
function serviceKey() { return envMap("SUPABASE_SECRET_KEYS").default || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""; }
function paypalBase() { return (Deno.env.get("PAYPAL_ENVIRONMENT") || "live").toLowerCase() === "sandbox" ? "https://api-m.sandbox.paypal.com" : "https://api-m.paypal.com"; }
function environment() { return paypalBase().includes("sandbox") ? "sandbox" : "live"; }
function future(v: unknown) { const s = text(v, 100); return Boolean(s && Number.isFinite(Date.parse(s)) && Date.parse(s) > Date.now()); }
function discounted(price: number, bps: number) { return Math.max(1, Math.round(price * Math.max(0, 10000 - bps) / 10000)); }
function link(payload: J, rels: string[]) { const x = arr(payload.links).find((v) => rels.includes(text(v.rel, 60))); return x ? text(x.href) : ""; }

async function accessToken() {
  const id = Deno.env.get("PAYPAL_CLIENT_ID") || "";
  const secret = Deno.env.get("PAYPAL_CLIENT_SECRET") || "";
  if (!id || !secret) throw new Error("PayPal credentials are not configured.");
  const response = await fetch(`${paypalBase()}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${btoa(`${id}:${secret}`)}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  const payload = await response.json().catch(() => ({})) as J;
  const token = text(payload.access_token, 6000);
  if (!response.ok || !token) throw new Error(text(payload.error_description, 1000) || "PayPal authentication failed.");
  return token;
}
async function paypal(path: string, init: RequestInit = {}) {
  const token = await accessToken();
  const response = await fetch(`${paypalBase()}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "Prefer": "return=representation", ...(init.headers || {}) },
  });
  const payload = await response.json().catch(() => ({})) as J;
  return { response, payload };
}
async function authenticate(admin: any, req: Request) {
  const auth = text(req.headers.get("authorization"), 8000);
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
  if (!token) throw new Error("unauthorized");
  const result = await admin.auth.getUser(token);
  if (result.error || !result.data.user) throw new Error("unauthorized");
  return result.data.user;
}
async function canonicalAccount(admin: any, owner: string) {
  const query = await admin.from("trader_accounts")
    .select("id,account_kind,status,created_at")
    .eq("owner_user_id", owner)
    .eq("status", "active")
    .order("created_at", { ascending: true });
  if (query.error) throw query.error;
  return (query.data || []).find((row: any) => row.account_kind === "real") || (query.data || [])[0] || null;
}
async function founderEligible(admin: any, owner: string) {
  const query = await admin.from("trader_entitlement_overrides")
    .select("reason,is_active,expires_at")
    .eq("owner_user_id", owner)
    .eq("is_active", true)
    .maybeSingle();
  if (query.error) throw query.error;
  return Boolean(query.data?.reason === "founder_tester" && (!query.data.expires_at || future(query.data.expires_at)));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const base = Deno.env.get("SUPABASE_URL") || "";
  const key = serviceKey();
  if (!base || !key) return json({ error: "server_configuration_missing" }, 500);
  const admin = createClient(base, key, { auth: { persistSession: false, autoRefreshToken: false } });

  let user: any;
  try { user = await authenticate(admin, req); }
  catch { return json({ error: "unauthorized" }, 401); }

  const body = await req.json().catch(() => ({})) as J;
  const action = text(body.action, 60) || "create_subscription";
  if (action !== "create_subscription") return json({ error: "unsupported_canary_action" }, 400);

  try {
    const [configQ, providerQ, eligible] = await Promise.all([
      admin.from("trader_billing_config").select("checkout_enabled,checkout_mode,currency,referral_discount_bps,entitlements_enforced").eq("id", 1).maybeSingle(),
      admin.from("trader_billing_provider_state").select("environment,launch_ready,preflight_status,webhook_status").eq("id", 1).maybeSingle(),
      founderEligible(admin, user.id),
    ]);
    if (configQ.error) throw configQ.error;
    if (providerQ.error) throw providerQ.error;
    const cfg = configQ.data || {};
    const provider = providerQ.data || {};

    if (!eligible) return json({ error: "founder_canary_required" }, 403);
    if (cfg.checkout_mode !== "founder_canary") return json({ error: "founder_canary_not_enabled" }, 409);
    if (cfg.checkout_enabled) return json({ error: "public_checkout_must_remain_disabled_during_canary" }, 409);
    if (cfg.entitlements_enforced) return json({ error: "entitlement_enforcement_must_remain_disabled_during_canary" }, 409);
    if (!provider.launch_ready || provider.environment !== "live" || provider.preflight_status !== "ready" || provider.webhook_status !== "ready") {
      return json({ error: "billing_provider_not_launch_ready" }, 409);
    }
    if (environment() !== "live") return json({ error: "paypal_live_environment_required" }, 409);

    const account = await canonicalAccount(admin, user.id);
    if (!account) return json({ error: "trader_account_not_ready" }, 409);

    const subscriptionsQ = await admin.from("trader_subscriptions")
      .select("id,status,provider_subscription_id,access_ends_at")
      .eq("owner_user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);
    if (subscriptionsQ.error) throw subscriptionsQ.error;
    const rows = subscriptionsQ.data || [];
    const current = rows.find((row: any) => row.status === "active")
      || rows.find((row: any) => row.status === "payment_failed" && future(row.access_ends_at))
      || rows.find((row: any) => row.status === "suspended")
      || rows.find((row: any) => row.status === "cancelled" && future(row.access_ends_at));
    if (current) return json({ error: "subscription_already_active", accessEndsAt: current.access_ends_at || null }, 409);

    const pending = rows.find((row: any) => row.status === "approval_pending" && row.provider_subscription_id);
    if (pending) {
      const existing = await paypal(`/v1/billing/subscriptions/${encodeURIComponent(String(pending.provider_subscription_id))}`, { method: "GET" });
      if (existing.response.ok) {
        const status = text(existing.payload.status, 50);
        const approve = link(existing.payload, ["approve"]);
        if (["APPROVAL_PENDING", "APPROVED"].includes(status) && approve) {
          return json({ ok: true, canary: true, reused: true, subscriptionId: pending.id, providerSubscriptionId: pending.provider_subscription_id, approvalUrl: approve });
        }
      }
      return json({ error: "pending_subscription_requires_sync" }, 409);
    }

    const slug = text(body.plan, 100);
    const interval = text(body.interval, 20) as "monthly" | "annual";
    if (!slug || !["monthly", "annual"].includes(interval)) return json({ error: "invalid_plan_request" }, 400);

    const planQ = await admin.from("trader_subscription_plans").select("*").eq("slug", slug).eq("is_active", true).maybeSingle();
    if (planQ.error) throw planQ.error;
    if (!planQ.data) return json({ error: "plan_unavailable" }, 404);
    const plan = planQ.data;
    const listPrice = Number(interval === "monthly" ? plan.monthly_price_cents : plan.annual_price_cents);
    if (!Number.isInteger(listPrice) || listPrice <= 0) return json({ error: "plan_price_not_configured" }, 409);

    const attributionQ = await admin.from("trader_referral_attributions")
      .select("referral_code")
      .eq("referred_owner_user_id", user.id)
      .maybeSingle();
    if (attributionQ.error) throw attributionQ.error;
    const referred = Boolean(attributionQ.data);
    const discountBps = Number(cfg.referral_discount_bps || 1000);
    const price = referred ? discounted(listPrice, discountBps) : listPrice;
    const providerField = interval === "monthly"
      ? (referred ? "paypal_monthly_referral_plan_id" : "paypal_monthly_plan_id")
      : (referred ? "paypal_annual_referral_plan_id" : "paypal_annual_plan_id");
    const providerPlanId = text(plan[providerField], 200);
    if (!providerPlanId) return json({ error: "verified_provider_plan_missing" }, 409);

    const made = await paypal("/v1/billing/subscriptions", {
      method: "POST",
      headers: { "PayPal-Request-Id": `trader-canary-${user.id}-${slug}-${interval}-${Date.now()}`.slice(0, 100) },
      body: JSON.stringify({
        plan_id: providerPlanId,
        custom_id: user.id,
        application_context: {
          brand_name: "LabNarrative Trading",
          shipping_preference: "NO_SHIPPING",
          user_action: "SUBSCRIBE_NOW",
          return_url: "https://platform.labnarrative.com/trader?billing=return",
          cancel_url: "https://platform.labnarrative.com/trader?billing=cancelled",
        },
      }),
    });
    const providerId = text(made.payload.id, 300);
    const approve = link(made.payload, ["approve"]);
    if (!made.response.ok || !providerId || !approve) {
      return json({ error: text(made.payload.message, 1000) || "paypal_subscription_create_failed" }, 502);
    }

    const saved = await admin.from("trader_subscriptions").insert({
      owner_user_id: user.id,
      account_id: account.id,
      plan_id: plan.id,
      billing_interval: interval,
      provider: "paypal",
      provider_subscription_id: providerId,
      status: "approval_pending",
      referral_discount_applied: referred,
      referral_code: attributionQ.data?.referral_code || null,
      list_price_cents: listPrice,
      subscription_price_cents: price,
      currency: plan.currency || cfg.currency || "USD",
      provider_metadata: { paypal_plan_id: providerPlanId, checkout_source: "founder_canary" },
    }).select("id").single();
    if (saved.error) {
      if (saved.error.code === "23505") return json({ error: "subscription_checkout_already_exists" }, 409);
      throw saved.error;
    }

    return json({
      ok: true,
      canary: true,
      subscriptionId: saved.data.id,
      providerSubscriptionId: providerId,
      approvalUrl: approve,
      referralDiscountApplied: referred,
      listPriceCents: listPrice,
      priceCents: price,
    });
  } catch (error) {
    console.error("trader-billing-canary-control", error);
    return json({ error: error instanceof Error ? error.message : "trader_billing_canary_failed" }, 500);
  }
});
