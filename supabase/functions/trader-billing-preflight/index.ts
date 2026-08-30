import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

type J = Record<string, unknown>;
const cors = {
  "Access-Control-Allow-Origin": "https://platform.labnarrative.com",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json", "cache-control": "no-store" } }); }
function text(v: unknown, max = 4000) { return typeof v === "string" ? v.trim().slice(0, max) : ""; }
function arr(v: unknown): J[] { return Array.isArray(v) ? v.filter((x) => x && typeof x === "object") as J[] : []; }
function obj(v: unknown): J { return v && typeof v === "object" && !Array.isArray(v) ? v as J : {}; }
function envMap(name: string): Record<string, string> { try { return JSON.parse(Deno.env.get(name) || "{}") as Record<string, string>; } catch { return {}; } }
function serviceKey() { return envMap("SUPABASE_SECRET_KEYS").default || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""; }
function paypalBase() { return (Deno.env.get("PAYPAL_ENVIRONMENT") || "live").toLowerCase() === "sandbox" ? "https://api-m.sandbox.paypal.com" : "https://api-m.paypal.com"; }
function environment() { return paypalBase().includes("sandbox") ? "sandbox" : "live"; }
function discounted(price: number, bps: number) { return Math.max(1, Math.round(price * Math.max(0, 10000 - bps) / 10000)); }
function fixedPrice(payload: J) {
  const cycle = arr(payload.billing_cycles).find((x) => text(x.tenure_type, 40) === "REGULAR") || arr(payload.billing_cycles)[0] || {};
  const fixed = obj(obj(cycle.pricing_scheme).fixed_price);
  return { cents: Math.round(Number(fixed.value || 0) * 100), currency: text(fixed.currency_code, 20).toUpperCase() };
}
async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function accessToken() {
  const id = Deno.env.get("PAYPAL_CLIENT_ID") || "", secret = Deno.env.get("PAYPAL_CLIENT_SECRET") || "";
  if (!id || !secret) throw new Error("PayPal credentials are not configured.");
  const r = await fetch(`${paypalBase()}/v1/oauth2/token`, { method: "POST", headers: { Authorization: `Basic ${btoa(`${id}:${secret}`)}`, "Content-Type": "application/x-www-form-urlencoded" }, body: "grant_type=client_credentials" });
  const p = await r.json().catch(() => ({})) as J;
  const token = text(p.access_token, 6000);
  if (!r.ok || !token) throw new Error(text(p.error_description, 1000) || "PayPal authentication failed.");
  return token;
}
async function paypal(path: string, init: RequestInit = {}) {
  const token = await accessToken();
  const r = await fetch(`${paypalBase()}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "Prefer": "return=representation", ...(init.headers || {}) } });
  const p = await r.json().catch(() => ({})) as J;
  return { r, p };
}
async function authenticateFounder(admin: any, req: Request) {
  const auth = text(req.headers.get("authorization"), 8000);
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
  if (!token) throw new Error("unauthorized");
  const result = await admin.auth.getUser(token);
  if (result.error || !result.data.user) throw new Error("unauthorized");
  const override = await admin.from("trader_entitlement_overrides").select("reason,is_active,expires_at").eq("owner_user_id", result.data.user.id).eq("is_active", true).maybeSingle();
  if (override.error) throw override.error;
  const active = override.data && (!override.data.expires_at || Date.parse(String(override.data.expires_at)) > Date.now());
  if (!active || override.data?.reason !== "founder_tester") throw new Error("founder_access_required");
  return result.data.user;
}
async function authenticateOperatorToken(admin: any, req: Request) {
  const url = new URL(req.url);
  let supplied = text(url.searchParams.get("preflight_token"), 1000);
  if (!supplied && req.method === "POST") {
    const body = await req.clone().json().catch(() => ({})) as J;
    supplied = text(body.preflight_token, 1000);
  }
  if (!supplied) throw new Error("unauthorized");
  const stateQ = await admin.from("trader_billing_provider_state").select("preflight_status,preflight_details").eq("id", 1).maybeSingle();
  if (stateQ.error) throw stateQ.error;
  const details = obj(stateQ.data?.preflight_details);
  const expected = text(details.operator_token_hash, 200);
  const expiresAt = text(details.operator_token_expires_at, 100);
  if (stateQ.data?.preflight_status !== "armed" || !expected || !expiresAt || Date.parse(expiresAt) <= Date.now()) throw new Error("operator_token_expired");
  const actual = await sha256Hex(supplied);
  if (actual !== expected) throw new Error("unauthorized");
  const nextDetails = { ...details } as J;
  delete nextDetails.operator_token_hash;
  delete nextDetails.operator_token_expires_at;
  const claimed = await admin.from("trader_billing_provider_state").update({ preflight_status: "authorized", preflight_details: nextDetails, updated_at: new Date().toISOString() }).eq("id", 1).eq("preflight_status", "armed").select("id").maybeSingle();
  if (claimed.error) throw claimed.error;
  if (!claimed.data) throw new Error("operator_token_already_used");
  return true;
}

async function ensureProduct(admin: any, state: any) {
  let id = text(state?.paypal_product_id, 200);
  if (id) {
    const existing = await paypal(`/v1/catalogs/products/${encodeURIComponent(id)}`, { method: "GET" });
    if (existing.r.ok && text(existing.p.id, 200) === id) return { id, status: "verified" };
    id = "";
  }
  const made = await paypal("/v1/catalogs/products", { method: "POST", headers: { "PayPal-Request-Id": "labnarrative-trader-product-v1" }, body: JSON.stringify({ name: "LabNarrative Trading", description: "Crypto trading automation software subscription", type: "SERVICE", category: "SOFTWARE", home_url: "https://platform.labnarrative.com/trader" }) });
  if (!made.r.ok || !text(made.p.id, 200)) throw new Error(text(made.p.message, 1000) || "Could not create PayPal Trading product.");
  id = text(made.p.id, 200);
  const saved = await admin.from("trader_billing_provider_state").update({ paypal_product_id: id, updated_at: new Date().toISOString() }).eq("id", 1);
  if (saved.error) throw saved.error;
  return { id, status: "created" };
}

const webhookEvents = [
  "BILLING.SUBSCRIPTION.ACTIVATED",
  "BILLING.SUBSCRIPTION.CANCELLED",
  "BILLING.SUBSCRIPTION.SUSPENDED",
  "BILLING.SUBSCRIPTION.EXPIRED",
  "BILLING.SUBSCRIPTION.UPDATED",
  "BILLING.SUBSCRIPTION.PAYMENT.FAILED",
  "PAYMENT.SALE.COMPLETED",
  "PAYMENT.SALE.REFUNDED",
  "PAYMENT.SALE.REVERSED",
];
async function ensureWebhook(admin: any, state: any) {
  const webhookUrl = `${(Deno.env.get("SUPABASE_URL") || "").replace(/\/$/, "")}/functions/v1/trader-billing-control`;
  let id = text(state?.paypal_webhook_id, 200);
  if (id) {
    const existing = await paypal(`/v1/notifications/webhooks/${encodeURIComponent(id)}`, { method: "GET" });
    if (existing.r.ok && text(existing.p.url, 4000) === webhookUrl) {
      const names = arr(existing.p.event_types).map((x) => text(x.name, 100));
      if (webhookEvents.every((name) => names.includes(name))) return { id, status: "verified", url: webhookUrl };
    }
    id = "";
  }
  if (!id) {
    const listed = await paypal("/v1/notifications/webhooks", { method: "GET" });
    const match = arr(listed.p.webhooks).find((w) => text(w.url, 4000) === webhookUrl);
    if (match) id = text(match.id, 200);
  }
  if (!id) {
    const made = await paypal("/v1/notifications/webhooks", { method: "POST", headers: { "PayPal-Request-Id": "labnarrative-trader-webhook-v1" }, body: JSON.stringify({ url: webhookUrl, event_types: webhookEvents.map((name) => ({ name })) }) });
    if (!made.r.ok || !text(made.p.id, 200)) throw new Error(text(made.p.message, 1000) || "Could not create PayPal Trading webhook.");
    id = text(made.p.id, 200);
  }
  const verified = await paypal(`/v1/notifications/webhooks/${encodeURIComponent(id)}`, { method: "GET" });
  if (!verified.r.ok || text(verified.p.url, 4000) !== webhookUrl) throw new Error("PayPal Trading webhook verification failed.");
  const names = arr(verified.p.event_types).map((x) => text(x.name, 100));
  if (!webhookEvents.every((name) => names.includes(name))) throw new Error("PayPal Trading webhook is missing required event types.");
  const saved = await admin.from("trader_billing_provider_state").update({ paypal_webhook_id: id, webhook_status: "ready", updated_at: new Date().toISOString() }).eq("id", 1);
  if (saved.error) throw saved.error;
  return { id, status: "ready", url: webhookUrl };
}

type Variant = { field: string; interval: "monthly" | "annual"; referred: boolean; label: string };
const variants: Variant[] = [
  { field: "paypal_monthly_plan_id", interval: "monthly", referred: false, label: "monthly" },
  { field: "paypal_monthly_referral_plan_id", interval: "monthly", referred: true, label: "monthly_referral" },
  { field: "paypal_annual_plan_id", interval: "annual", referred: false, label: "annual" },
  { field: "paypal_annual_referral_plan_id", interval: "annual", referred: true, label: "annual_referral" },
];
async function createPlan(productId: string, plan: any, variant: Variant, expectedCents: number) {
  const made = await paypal("/v1/billing/plans", { method: "POST", headers: { "PayPal-Request-Id": `trader-${plan.slug}-${variant.label}-v2` }, body: JSON.stringify({
    product_id: productId,
    name: `${plan.name} · ${variant.interval === "annual" ? "Annual" : "Monthly"}${variant.referred ? " · Referral" : ""}`,
    description: plan.description || plan.name,
    status: "ACTIVE",
    billing_cycles: [{ frequency: { interval_unit: variant.interval === "annual" ? "YEAR" : "MONTH", interval_count: 1 }, tenure_type: "REGULAR", sequence: 1, total_cycles: 0, pricing_scheme: { fixed_price: { value: (expectedCents / 100).toFixed(2), currency_code: String(plan.currency || "USD").toUpperCase() } } }],
    payment_preferences: { auto_bill_outstanding: true, payment_failure_threshold: 2 }
  }) });
  if (!made.r.ok || !text(made.p.id, 200)) throw new Error(text(made.p.message, 1000) || `Could not create ${plan.slug} ${variant.label} PayPal plan.`);
  return text(made.p.id, 200);
}
async function ensurePlanVariant(admin: any, productId: string, plan: any, variant: Variant, discountBps: number) {
  const listPrice = Number(variant.interval === "monthly" ? plan.monthly_price_cents : plan.annual_price_cents);
  if (!Number.isInteger(listPrice) || listPrice <= 0) throw new Error(`${plan.slug} ${variant.interval} price is invalid.`);
  const expectedCents = variant.referred ? discounted(listPrice, discountBps) : listPrice;
  const expectedCurrency = String(plan.currency || "USD").toUpperCase();
  let id = text(plan[variant.field], 200);
  let status = "verified";
  if (id) {
    const got = await paypal(`/v1/billing/plans/${encodeURIComponent(id)}`, { method: "GET" });
    const price = fixedPrice(got.p);
    if (!got.r.ok || text(got.p.status, 40) !== "ACTIVE" || text(got.p.product_id, 200) !== productId || price.cents !== expectedCents || price.currency !== expectedCurrency) id = "";
  }
  if (!id) {
    id = await createPlan(productId, plan, variant, expectedCents);
    status = "created";
    const saved = await admin.from("trader_subscription_plans").update({ [variant.field]: id, provider_status: "synced", provider_synced_at: new Date().toISOString(), provider_error: null, updated_at: new Date().toISOString() }).eq("id", plan.id);
    if (saved.error) throw saved.error;
  }
  const verify = await paypal(`/v1/billing/plans/${encodeURIComponent(id)}`, { method: "GET" });
  const price = fixedPrice(verify.p);
  if (!verify.r.ok || text(verify.p.status, 40) !== "ACTIVE" || text(verify.p.product_id, 200) !== productId || price.cents !== expectedCents || price.currency !== expectedCurrency) throw new Error(`${plan.slug} ${variant.label} PayPal plan verification failed.`);
  return { id, status, expectedCents, currency: expectedCurrency };
}

async function runPreflight(admin: any) {
  const startedAt = new Date().toISOString();
  await admin.from("trader_billing_provider_state").update({ preflight_status: "running", launch_ready: false, last_error: null, updated_at: startedAt }).eq("id", 1);
  try {
    await accessToken();
    const stateQ = await admin.from("trader_billing_provider_state").select("*").eq("id", 1).maybeSingle();
    if (stateQ.error) throw stateQ.error;
    const cfgQ = await admin.from("trader_billing_config").select("checkout_enabled,entitlements_enforced,referral_discount_bps").eq("id", 1).maybeSingle();
    if (cfgQ.error) throw cfgQ.error;
    if (cfgQ.data?.checkout_enabled || cfgQ.data?.entitlements_enforced) throw new Error("Preflight requires checkout and entitlement enforcement to remain disabled.");
    const plansQ = await admin.from("trader_subscription_plans").select("*").eq("is_active", true).order("sort_order");
    if (plansQ.error) throw plansQ.error;
    if ((plansQ.data || []).length !== 3) throw new Error("Expected exactly three active Trader subscription plans.");

    const product = await ensureProduct(admin, stateQ.data || {});
    const webhook = await ensureWebhook(admin, stateQ.data || {});
    const discountBps = Number(cfgQ.data?.referral_discount_bps || 1000);
    const verified: J[] = [];
    for (const plan of plansQ.data || []) {
      for (const variant of variants) {
        const result = await ensurePlanVariant(admin, product.id, plan, variant, discountBps);
        verified.push({ plan: plan.slug, variant: variant.label, providerPlanId: result.id, expectedCents: result.expectedCents, currency: result.currency, status: result.status });
      }
    }
    const env = environment();
    const allObjectsReady = verified.length === 12;
    const launchReady = env === "live" && allObjectsReady && Boolean(product.id && webhook.id);
    const details = {
      environment: env,
      product: { id: product.id, status: product.status },
      webhook: { id: webhook.id, status: webhook.status, requiredEventCount: webhookEvents.length },
      planVariantCount: verified.length,
      planVariants: verified,
      checkoutEnabled: false,
      entitlementsEnforced: false,
      launchReady,
    };
    const finishedAt = new Date().toISOString();
    const saved = await admin.from("trader_billing_provider_state").update({ environment: env, paypal_product_id: product.id, paypal_webhook_id: webhook.id, webhook_status: "ready", preflight_status: "ready", preflight_details: details, preflight_completed_at: finishedAt, launch_ready: launchReady, last_verified_at: finishedAt, last_error: launchReady ? null : (env === "live" ? null : "PayPal environment is sandbox; production launch remains gated."), updated_at: finishedAt }).eq("id", 1);
    if (saved.error) throw saved.error;
    return details;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await admin.from("trader_billing_provider_state").update({ preflight_status: "failed", launch_ready: false, last_error: message.slice(0, 2000), updated_at: new Date().toISOString() }).eq("id", 1);
    throw error;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "GET" && req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const base = Deno.env.get("SUPABASE_URL") || "", key = serviceKey();
  if (!base || !key) return json({ error: "server_configuration_missing" }, 500);
  const admin = createClient(base, key, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const auth = text(req.headers.get("authorization"), 8000);
    if (auth.toLowerCase().startsWith("bearer ")) await authenticateFounder(admin, req);
    else await authenticateOperatorToken(admin, req);
    const details = await runPreflight(admin);
    return json({ ok: true, ...details });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = ["unauthorized", "operator_token_expired", "operator_token_already_used"].includes(message) ? 401 : message === "founder_access_required" ? 403 : 500;
    console.error("trader-billing-preflight", message);
    return json({ error: message }, status);
  }
});
