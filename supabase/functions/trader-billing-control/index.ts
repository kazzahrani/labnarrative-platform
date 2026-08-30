import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

type J = Record<string, unknown>;
const cors = {
  "Access-Control-Allow-Origin": "https://platform.labnarrative.com",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, paypal-auth-algo, paypal-cert-url, paypal-transmission-id, paypal-transmission-sig, paypal-transmission-time",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json", "cache-control": "no-store" } }); }
function text(v: unknown, max = 4000) { return typeof v === "string" ? v.trim().slice(0, max) : ""; }
function obj(v: unknown): J { return v && typeof v === "object" && !Array.isArray(v) ? v as J : {}; }
function arr(v: unknown): J[] { return Array.isArray(v) ? v.filter((x) => x && typeof x === "object") as J[] : []; }
function envMap(name: string): Record<string, string> { try { return JSON.parse(Deno.env.get(name) || "{}") as Record<string, string>; } catch { return {}; } }
function serviceKey() { return envMap("SUPABASE_SECRET_KEYS").default || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""; }
function paypalBase() { return (Deno.env.get("PAYPAL_ENVIRONMENT") || "live").toLowerCase() === "sandbox" ? "https://api-m.sandbox.paypal.com" : "https://api-m.paypal.com"; }
function environment() { return paypalBase().includes("sandbox") ? "sandbox" : "live"; }
function asIso(v: unknown) { const s = text(v, 100); return s && Number.isFinite(Date.parse(s)) ? s : null; }
function future(v: unknown) { const s = asIso(v); return Boolean(s && Date.parse(s) > Date.now()); }
function centsFromPayPal(v: unknown) { const n = Number(v); return Number.isFinite(n) ? Math.max(0, Math.round(n * 100)) : 0; }
function discounted(price: number, bps: number) { return Math.max(1, Math.round(price * Math.max(0, 10000 - bps) / 10000)); }
function link(payload: J, rels: string[]) { const x = arr(payload.links).find((v) => rels.includes(text(v.rel, 60))); return x ? text(x.href) : ""; }

async function accessToken() {
  const id = Deno.env.get("PAYPAL_CLIENT_ID") || "", secret = Deno.env.get("PAYPAL_CLIENT_SECRET") || "";
  if (!id || !secret) throw new Error("PayPal credentials are not configured.");
  const r = await fetch(`${paypalBase()}/v1/oauth2/token`, { method: "POST", headers: { Authorization: `Basic ${btoa(`${id}:${secret}`)}`, "Content-Type": "application/x-www-form-urlencoded" }, body: "grant_type=client_credentials" });
  const p = await r.json().catch(() => ({})) as J; const token = text(p.access_token, 6000);
  if (!r.ok || !token) throw new Error(text(p.error_description, 1000) || "PayPal authentication failed.");
  return token;
}
async function paypal(path: string, init: RequestInit = {}) {
  const token = await accessToken();
  const r = await fetch(`${paypalBase()}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "Prefer": "return=representation", ...(init.headers || {}) } });
  const p = await r.json().catch(() => ({})) as J;
  return { r, p };
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
  const q = await admin.from("trader_accounts").select("id,account_kind,status,created_at").eq("owner_user_id", owner).eq("status", "active").order("created_at", { ascending: true });
  if (q.error) throw q.error;
  return (q.data || []).find((x: any) => x.account_kind === "real") || (q.data || [])[0] || null;
}
async function billingConfig(admin: any) {
  const q = await admin.from("trader_billing_config").select("*").eq("id", 1).maybeSingle();
  if (q.error) throw q.error;
  return q.data || { checkout_enabled: false, checkout_mode: "disabled", provider: "paypal", currency: "USD", referral_discount_bps: 1000, payment_grace_days: 3 };
}
async function checkoutAccess(admin: any, cfg: any, owner: string) {
  const mode = text(cfg?.checkout_mode, 50) || (cfg?.checkout_enabled ? "public" : "disabled");
  if (!cfg?.checkout_enabled) return { enabled: false, mode, canary: false };
  if (mode === "public") return { enabled: true, mode, canary: false };
  if (mode !== "founder_canary") return { enabled: false, mode, canary: false };
  const q = await admin.from("trader_entitlement_overrides").select("reason,expires_at").eq("owner_user_id", owner).eq("is_active", true).eq("reason", "founder_tester").limit(1).maybeSingle();
  if (q.error) throw q.error;
  const row = q.data;
  const canary = Boolean(row && (!row.expires_at || future(row.expires_at)));
  return { enabled: canary, mode, canary };
}
async function activeAttribution(admin: any, owner: string) {
  const q = await admin.from("trader_referral_attributions").select("referral_code,referrer_account_id,referrer_owner_user_id").eq("referred_owner_user_id", owner).maybeSingle();
  if (q.error) throw q.error;
  return q.data || null;
}
async function ownerSubscriptions(admin: any, owner: string) {
  const q = await admin.from("trader_subscriptions").select("*,trader_subscription_plans!trader_subscriptions_plan_id_fkey(slug,name)").eq("owner_user_id", owner).order("created_at", { ascending: false }).limit(20);
  if (q.error) throw q.error;
  return q.data || [];
}
function pendingSubscription(rows: any[]) { return rows.find((s) => s.status === "approval_pending") || null; }
function currentSubscription(rows: any[]) {
  return rows.find((s) => s.status === "active")
    || rows.find((s) => s.status === "payment_failed" && future(s.access_ends_at))
    || rows.find((s) => s.status === "suspended")
    || rows.find((s) => s.status === "cancelled" && future(s.access_ends_at))
    || null;
}

async function ensureProvider(admin: any) {
  const stateQ = await admin.from("trader_billing_provider_state").select("*").eq("id", 1).maybeSingle();
  if (stateQ.error) throw stateQ.error;
  const state = stateQ.data || {};
  let productId = text(state.paypal_product_id, 200), webhookId = text(state.paypal_webhook_id, 200);
  if (!productId) {
    const made = await paypal("/v1/catalogs/products", { method: "POST", headers: { "PayPal-Request-Id": "labnarrative-trader-product-v1" }, body: JSON.stringify({ name: "LabNarrative Trading", description: "Crypto trading automation software subscription", type: "SERVICE", category: "SOFTWARE", home_url: "https://platform.labnarrative.com/trader" }) });
    if (!made.r.ok || !text(made.p.id, 200)) throw new Error(text(made.p.message, 1000) || "Could not create PayPal Trading product.");
    productId = text(made.p.id, 200);
  }
  const webhookUrl = `${(Deno.env.get("SUPABASE_URL") || "").replace(/\/$/, "")}/functions/v1/trader-billing-control`;
  if (!webhookId) {
    const listed = await paypal("/v1/notifications/webhooks", { method: "GET" });
    const existing = arr(listed.p.webhooks).find((w) => text(w.url, 4000) === webhookUrl);
    webhookId = existing ? text(existing.id, 200) : "";
    if (!webhookId) {
      const made = await paypal("/v1/notifications/webhooks", { method: "POST", headers: { "PayPal-Request-Id": "labnarrative-trader-webhook-v1" }, body: JSON.stringify({ url: webhookUrl, event_types: [
        { name: "BILLING.SUBSCRIPTION.ACTIVATED" }, { name: "BILLING.SUBSCRIPTION.CANCELLED" }, { name: "BILLING.SUBSCRIPTION.SUSPENDED" }, { name: "BILLING.SUBSCRIPTION.EXPIRED" }, { name: "BILLING.SUBSCRIPTION.UPDATED" }, { name: "BILLING.SUBSCRIPTION.PAYMENT.FAILED" }, { name: "PAYMENT.SALE.COMPLETED" }, { name: "PAYMENT.SALE.REFUNDED" }, { name: "PAYMENT.SALE.REVERSED" }
      ] }) });
      if (!made.r.ok || !text(made.p.id, 200)) throw new Error(text(made.p.message, 1000) || "Could not create PayPal Trading webhook.");
      webhookId = text(made.p.id, 200);
    }
  }
  await admin.from("trader_billing_provider_state").upsert({ id: 1, provider: "paypal", environment: environment(), paypal_product_id: productId, paypal_webhook_id: webhookId, webhook_status: "ready", last_verified_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() });
  return { productId, webhookId };
}

async function ensurePayPalPlan(admin: any, plan: any, interval: "monthly" | "annual", referred: boolean, discountBps: number) {
  const field = interval === "monthly" ? (referred ? "paypal_monthly_referral_plan_id" : "paypal_monthly_plan_id") : (referred ? "paypal_annual_referral_plan_id" : "paypal_annual_plan_id");
  const existing = text(plan[field], 200);
  if (existing) return existing;
  const listPrice = Number(interval === "monthly" ? plan.monthly_price_cents : plan.annual_price_cents);
  if (!Number.isFinite(listPrice) || listPrice <= 0) throw new Error("plan_price_not_configured");
  const price = referred ? discounted(listPrice, discountBps) : listPrice;
  const setup = await ensureProvider(admin);
  const made = await paypal("/v1/billing/plans", { method: "POST", headers: { "PayPal-Request-Id": `trader-${plan.slug}-${interval}-${referred ? "ref" : "std"}-v1` }, body: JSON.stringify({
    product_id: setup.productId,
    name: `${plan.name} · ${interval === "annual" ? "Annual" : "Monthly"}${referred ? " · Referral" : ""}`,
    description: plan.description || plan.name,
    status: "ACTIVE",
    billing_cycles: [{ frequency: { interval_unit: interval === "annual" ? "YEAR" : "MONTH", interval_count: 1 }, tenure_type: "REGULAR", sequence: 1, total_cycles: 0, pricing_scheme: { fixed_price: { value: (price / 100).toFixed(2), currency_code: String(plan.currency || "USD").toUpperCase() } } }],
    payment_preferences: { auto_bill_outstanding: true, payment_failure_threshold: 2 }
  }) });
  if (!made.r.ok || !text(made.p.id, 200)) throw new Error(text(made.p.message, 1000) || "Could not create PayPal Trading plan.");
  const providerId = text(made.p.id, 200);
  const update: J = { [field]: providerId, provider_status: "synced", provider_synced_at: new Date().toISOString(), provider_error: null, updated_at: new Date().toISOString() };
  const saved = await admin.from("trader_subscription_plans").update(update).eq("id", plan.id);
  if (saved.error) throw saved.error;
  return providerId;
}
async function providerPlanInfo(admin: any, providerPlanId: string, discountBps: number) {
  if (!providerPlanId) return null;
  const q = await admin.from("trader_subscription_plans").select("*").eq("is_active", true);
  if (q.error) throw q.error;
  for (const plan of q.data || []) {
    const variants: Array<{ field: string; interval: "monthly" | "annual"; referred: boolean }> = [
      { field: "paypal_monthly_plan_id", interval: "monthly", referred: false },
      { field: "paypal_monthly_referral_plan_id", interval: "monthly", referred: true },
      { field: "paypal_annual_plan_id", interval: "annual", referred: false },
      { field: "paypal_annual_referral_plan_id", interval: "annual", referred: true },
    ];
    const hit = variants.find((v) => text(plan[v.field], 200) === providerPlanId);
    if (!hit) continue;
    const listPrice = Number(hit.interval === "monthly" ? plan.monthly_price_cents : plan.annual_price_cents);
    return { plan, interval: hit.interval, referred: hit.referred, listPrice, price: hit.referred ? discounted(listPrice, discountBps) : listPrice };
  }
  return null;
}

async function referralUpline(admin: any, referredOwner: string) {
  const chain: Array<{ level: 1 | 2 | 3; accountId: string; ownerId: string }> = [];
  let cursor: string | null = referredOwner;
  for (let level = 1 as 1 | 2 | 3; level <= 3 && cursor; level = (level + 1) as 1 | 2 | 3) {
    const q = await admin.from("trader_referral_attributions").select("referrer_account_id,referrer_owner_user_id").eq("referred_owner_user_id", cursor).maybeSingle();
    if (q.error) throw q.error;
    if (!q.data?.referrer_account_id || !q.data?.referrer_owner_user_id) break;
    chain.push({ level, accountId: String(q.data.referrer_account_id), ownerId: String(q.data.referrer_owner_user_id) });
    cursor = String(q.data.referrer_owner_user_id);
  }
  return chain;
}
async function createCommissions(admin: any, subscription: any, providerPaymentId: string, amountCents: number, currency: string, paidAt: string) {
  const cfgQ = await admin.from("trader_referral_program_config").select("*").eq("id", 1).maybeSingle();
  if (cfgQ.error) throw cfgQ.error;
  const cfg = cfgQ.data; if (!cfg?.active) return;
  const chain = await referralUpline(admin, String(subscription.owner_user_id));
  const holdUntil = new Date(new Date(paidAt).getTime() + Number(cfg.commission_hold_days || 30) * 86400000).toISOString();
  const rows = chain.map(({ level, accountId, ownerId }) => {
    const rate = Number(cfg[`${subscription.billing_interval}_l${level}_bps`] || 0);
    return { beneficiary_account_id: accountId, beneficiary_owner_user_id: ownerId, referred_account_id: subscription.account_id, referred_owner_user_id: subscription.owner_user_id, provider: "paypal", external_payment_id: providerPaymentId, billing_interval: subscription.billing_interval, referral_level: level, gross_amount_cents: amountCents, rate_bps: rate, commission_amount_cents: Math.round(amountCents * rate / 10000), currency, status: "pending", hold_until: holdUntil, metadata: { subscription_id: subscription.id, referral_code: subscription.referral_code } };
  }).filter((r) => r.rate_bps > 0 && r.commission_amount_cents > 0);
  if (rows.length) {
    const saved = await admin.from("trader_referral_commissions").upsert(rows, { onConflict: "provider,external_payment_id,beneficiary_account_id,referral_level", ignoreDuplicates: true });
    if (saved.error) throw saved.error;
  }
}
async function reverseCommissions(admin: any, providerPaymentId: string) {
  const r = await admin.from("trader_referral_commissions").update({ status: "reversed", reversed_at: new Date().toISOString() }).eq("provider", "paypal").eq("external_payment_id", providerPaymentId).in("status", ["pending", "available"]);
  if (r.error) throw r.error;
}

async function syncSubscription(admin: any, providerId: string) {
  const cfg = await billingConfig(admin);
  const currentQ = await admin.from("trader_subscriptions").select("*").eq("provider_subscription_id", providerId).maybeSingle();
  if (currentQ.error) throw currentQ.error;
  const current = currentQ.data;
  if (!current) throw new Error("subscription_not_found");
  const got = await paypal(`/v1/billing/subscriptions/${encodeURIComponent(providerId)}`, { method: "GET" });
  if (!got.r.ok) throw new Error(text(got.p.message, 1000) || "Could not verify PayPal subscription.");
  const statusMap: Record<string, string> = { ACTIVE: "active", APPROVAL_PENDING: "approval_pending", APPROVED: "approval_pending", SUSPENDED: "suspended", CANCELLED: "cancelled", EXPIRED: "expired" };
  const providerStatus = text(got.p.status, 50);
  const status = statusMap[providerStatus] || current.status || "approval_pending";
  const billing = obj(got.p.billing_info);
  const nextBilling = asIso(billing.next_billing_time);
  const providerPlanId = text(got.p.plan_id, 200);
  const match = await providerPlanInfo(admin, providerPlanId, Number(cfg.referral_discount_bps || 1000));
  const now = new Date().toISOString();
  const pendingApplied = Boolean(match && current.pending_provider_plan_id && text(current.pending_provider_plan_id, 200) === providerPlanId);
  let accessEndsAt: string | null = current.access_ends_at || null;
  if (status === "active") accessEndsAt = null;
  if (status === "cancelled" && !accessEndsAt) accessEndsAt = future(nextBilling) ? nextBilling : now;
  if (status === "expired") accessEndsAt = now;
  const update: J = {
    status,
    started_at: asIso(got.p.start_time) || current.started_at || null,
    next_billing_at: nextBilling,
    cancelled_at: status === "cancelled" ? (current.cancelled_at || now) : current.cancelled_at || null,
    access_ends_at: accessEndsAt,
    provider_synced_at: now,
    provider_metadata: { ...obj(current.provider_metadata), paypal_status: providerStatus, paypal_plan_id: providerPlanId },
    updated_at: now,
  };
  if (match) {
    update.plan_id = match.plan.id;
    update.billing_interval = match.interval;
    update.list_price_cents = match.listPrice;
    update.subscription_price_cents = match.price;
    update.referral_discount_applied = match.referred;
  }
  if (pendingApplied) {
    update.pending_plan_id = null;
    update.pending_billing_interval = null;
    update.pending_provider_plan_id = null;
    update.plan_change_effective_at = now;
  }
  const saved = await admin.from("trader_subscriptions").update(update).eq("id", current.id).select("*").single();
  if (saved.error) throw saved.error;
  return saved.data;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const base = Deno.env.get("SUPABASE_URL") || "", key = serviceKey();
  if (!base || !key) return json({ error: "server_configuration_missing" }, 500);
  const admin = createClient(base, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const body = await req.json().catch(() => ({})) as J;
  const eventType = text(body.event_type, 100);

  if (eventType) {
    try {
      const stateQ = await admin.from("trader_billing_provider_state").select("paypal_webhook_id").eq("id", 1).maybeSingle();
      const webhookId = text(stateQ.data?.paypal_webhook_id, 200);
      if (!webhookId) return json({ error: "webhook_not_registered" }, 503);
      const verify = await paypal("/v1/notifications/verify-webhook-signature", { method: "POST", body: JSON.stringify({ auth_algo: req.headers.get("paypal-auth-algo"), cert_url: req.headers.get("paypal-cert-url"), transmission_id: req.headers.get("paypal-transmission-id"), transmission_sig: req.headers.get("paypal-transmission-sig"), transmission_time: req.headers.get("paypal-transmission-time"), webhook_id: webhookId, webhook_event: body }) });
      if (!verify.r.ok || text(verify.p.verification_status, 50) !== "SUCCESS") return json({ error: "invalid_webhook_signature" }, 400);
      const resource = obj(body.resource), resourceId = text(resource.id, 300);
      if (eventType.startsWith("BILLING.SUBSCRIPTION.")) {
        if (resourceId) {
          if (eventType === "BILLING.SUBSCRIPTION.PAYMENT.FAILED") {
            const cfg = await billingConfig(admin);
            const grace = new Date(Date.now() + Number(cfg.payment_grace_days || 3) * 86400000).toISOString();
            const failed = await admin.from("trader_subscriptions").update({ status: "payment_failed", access_ends_at: grace, provider_synced_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("provider_subscription_id", resourceId);
            if (failed.error) throw failed.error;
          } else await syncSubscription(admin, resourceId);
        }
      } else if (eventType === "PAYMENT.SALE.COMPLETED") {
        const providerSub = text(resource.billing_agreement_id, 300), paymentId = resourceId;
        const amount = obj(resource.amount); const amountCents = centsFromPayPal(amount.total || amount.value); const currency = text(amount.currency || amount.currency_code, 20).toUpperCase() || "USD";
        if (providerSub && paymentId && amountCents > 0) {
          let sub: any = null;
          try { sub = await syncSubscription(admin, providerSub); } catch {
            const subQ = await admin.from("trader_subscriptions").select("*").eq("provider_subscription_id", providerSub).maybeSingle();
            if (subQ.error) throw subQ.error;
            sub = subQ.data;
          }
          if (sub) {
            const paidAt = asIso(resource.create_time || body.create_time) || new Date().toISOString();
            const payment = await admin.from("trader_subscription_payments").upsert({ subscription_id: sub.id, owner_user_id: sub.owner_user_id, provider: "paypal", provider_payment_id: paymentId, billing_interval: sub.billing_interval, gross_amount_cents: amountCents, currency, status: "paid", paid_at: paidAt, provider_metadata: { event_id: text(body.id, 300) } }, { onConflict: "provider,provider_payment_id", ignoreDuplicates: true }).select("id").maybeSingle();
            if (payment.error) throw payment.error;
            if (payment.data) await createCommissions(admin, sub, paymentId, amountCents, currency, paidAt);
          }
        }
      } else if (eventType === "PAYMENT.SALE.REFUNDED" || eventType === "PAYMENT.SALE.REVERSED") {
        const target = text(resource.sale_id || resource.parent_payment, 300) || resourceId;
        if (target) {
          const status = eventType.endsWith("REFUNDED") ? "refunded" : "reversed";
          const updated = await admin.from("trader_subscription_payments").update({ status, reversed_at: new Date().toISOString(), provider_metadata: { event_id: text(body.id, 300), event_type: eventType } }).eq("provider", "paypal").eq("provider_payment_id", target);
          if (updated.error) throw updated.error;
          await reverseCommissions(admin, target);
        }
      }
      return json({ ok: true });
    } catch (error) { console.error("trader-billing-webhook", error); return json({ error: error instanceof Error ? error.message : "webhook_failed" }, 500); }
  }

  let user: any;
  try { user = await authenticate(admin, req); } catch { return json({ error: "unauthorized" }, 401); }
  const action = text(body.action, 60) || "status";
  try {
    const cfg = await billingConfig(admin);
    const account = await canonicalAccount(admin, user.id);
    if (!account) return json({ error: "trader_account_not_ready" }, 409);
    const checkout = await checkoutAccess(admin, cfg, user.id);

    if (action === "status") {
      let providerVerified = false, providerError = "";
      try { await accessToken(); providerVerified = true; } catch (e) { providerError = e instanceof Error ? e.message : "PayPal verification failed."; }
      const plansQ = await admin.from("trader_subscription_plans").select("id,slug,name,description,sort_order,monthly_price_cents,annual_price_cents,currency,is_active,provider_status").order("sort_order");
      if (plansQ.error) throw plansQ.error;
      const rows = await ownerSubscriptions(admin, user.id);
      return json({ ok: true, checkoutEnabled: checkout.enabled, checkoutMode: checkout.mode, checkoutCanary: checkout.canary, provider: "paypal", providerConfigured: Boolean(Deno.env.get("PAYPAL_CLIENT_ID") && Deno.env.get("PAYPAL_CLIENT_SECRET")), providerVerified, providerError: providerError || null, referralDiscountBps: Number(cfg.referral_discount_bps || 1000), paymentGraceDays: Number(cfg.payment_grace_days || 3), plans: plansQ.data || [], subscription: currentSubscription(rows) || pendingSubscription(rows), pendingSubscription: pendingSubscription(rows) });
    }

    if (action === "sync_subscription") {
      const rows = await ownerSubscriptions(admin, user.id);
      const sub = currentSubscription(rows) || pendingSubscription(rows) || rows.find((s: any) => s.provider_subscription_id) || null;
      if (!sub?.provider_subscription_id) return json({ ok: true, subscription: null });
      const synced = await syncSubscription(admin, String(sub.provider_subscription_id));
      return json({ ok: true, subscription: synced });
    }

    if (action === "create_subscription") {
      if (!checkout.enabled) return json({ error: "checkout_not_enabled" }, 409);
      const rows = await ownerSubscriptions(admin, user.id);
      const existing = currentSubscription(rows);
      if (existing) return json({ error: existing.status === "cancelled" ? "subscription_access_still_active" : "subscription_already_active", accessEndsAt: existing.access_ends_at || null }, 409);
      const pending = pendingSubscription(rows);
      if (pending?.provider_subscription_id) {
        const got = await paypal(`/v1/billing/subscriptions/${encodeURIComponent(String(pending.provider_subscription_id))}`, { method: "GET" });
        if (got.r.ok) {
          const providerStatus = text(got.p.status, 50);
          if (["APPROVAL_PENDING", "APPROVED"].includes(providerStatus)) {
            const approve = link(got.p, ["approve"]);
            if (approve) return json({ ok: true, reused: true, subscriptionId: pending.id, providerSubscriptionId: pending.provider_subscription_id, approvalUrl: approve });
          }
          if (["ACTIVE", "CANCELLED", "EXPIRED", "SUSPENDED"].includes(providerStatus)) await syncSubscription(admin, String(pending.provider_subscription_id));
        }
      }
      const slug = text(body.plan, 100), interval = text(body.interval, 20) as "monthly" | "annual";
      if (!slug || !["monthly", "annual"].includes(interval)) return json({ error: "invalid_plan_request" }, 400);
      const planQ = await admin.from("trader_subscription_plans").select("*").eq("slug", slug).eq("is_active", true).maybeSingle();
      if (planQ.error) throw planQ.error; if (!planQ.data) return json({ error: "plan_unavailable" }, 404);
      const plan = planQ.data; const listPrice = Number(interval === "monthly" ? plan.monthly_price_cents : plan.annual_price_cents);
      if (!Number.isFinite(listPrice) || listPrice <= 0) return json({ error: "plan_price_not_configured" }, 409);
      const attribution = await activeAttribution(admin, user.id); const referred = Boolean(attribution); const price = referred ? discounted(listPrice, Number(cfg.referral_discount_bps || 1000)) : listPrice;
      const providerPlanId = await ensurePayPalPlan(admin, plan, interval, referred, Number(cfg.referral_discount_bps || 1000));
      const made = await paypal("/v1/billing/subscriptions", { method: "POST", headers: { "PayPal-Request-Id": `trader-sub-${user.id}-${slug}-${interval}-${Date.now()}`.slice(0, 100) }, body: JSON.stringify({ plan_id: providerPlanId, custom_id: user.id, application_context: { brand_name: "LabNarrative Trading", shipping_preference: "NO_SHIPPING", user_action: "SUBSCRIBE_NOW", return_url: "https://platform.labnarrative.com/trader?billing=return", cancel_url: "https://platform.labnarrative.com/trader?billing=cancelled" } }) });
      const providerId = text(made.p.id, 300), approve = link(made.p, ["approve"]);
      if (!made.r.ok || !providerId || !approve) return json({ error: text(made.p.message, 1000) || "paypal_subscription_create_failed" }, 502);
      const saved = await admin.from("trader_subscriptions").insert({ owner_user_id: user.id, account_id: account.id, plan_id: plan.id, billing_interval: interval, provider: "paypal", provider_subscription_id: providerId, status: "approval_pending", referral_discount_applied: referred, referral_code: attribution?.referral_code || null, list_price_cents: listPrice, subscription_price_cents: price, currency: plan.currency || cfg.currency || "USD", provider_metadata: { paypal_plan_id: providerPlanId } }).select("id").single();
      if (saved.error) {
        if (saved.error.code === "23505") return json({ error: "subscription_checkout_already_exists" }, 409);
        throw saved.error;
      }
      return json({ ok: true, subscriptionId: saved.data.id, providerSubscriptionId: providerId, approvalUrl: approve, referralDiscountApplied: referred, listPriceCents: listPrice, priceCents: price });
    }

    if (action === "change_subscription") {
      if (!checkout.enabled) return json({ error: "checkout_not_enabled" }, 409);
      const rows = await ownerSubscriptions(admin, user.id);
      const sub = rows.find((s: any) => s.status === "active") || null;
      if (!sub?.provider_subscription_id) return json({ error: "active_subscription_required" }, 409);
      const slug = text(body.plan, 100), interval = text(body.interval, 20) as "monthly" | "annual";
      if (!slug || !["monthly", "annual"].includes(interval)) return json({ error: "invalid_plan_request" }, 400);
      const planQ = await admin.from("trader_subscription_plans").select("*").eq("slug", slug).eq("is_active", true).maybeSingle();
      if (planQ.error) throw planQ.error; if (!planQ.data) return json({ error: "plan_unavailable" }, 404);
      const plan = planQ.data;
      if (String(sub.plan_id) === String(plan.id) && sub.billing_interval === interval) return json({ ok: true, unchanged: true });
      const referred = Boolean(sub.referral_discount_applied);
      const providerPlanId = await ensurePayPalPlan(admin, plan, interval, referred, Number(cfg.referral_discount_bps || 1000));
      const revised = await paypal(`/v1/billing/subscriptions/${encodeURIComponent(String(sub.provider_subscription_id))}/revise`, { method: "POST", body: JSON.stringify({ plan_id: providerPlanId, application_context: { brand_name: "LabNarrative Trading", shipping_preference: "NO_SHIPPING", return_url: "https://platform.labnarrative.com/trader?billing=changed", cancel_url: "https://platform.labnarrative.com/trader?billing=change-cancelled" } }) });
      if (!revised.r.ok) return json({ error: text(revised.p.message, 1000) || "paypal_subscription_revise_failed" }, 502);
      const approvalUrl = link(revised.p, ["approve"]);
      const updated = await admin.from("trader_subscriptions").update({ pending_plan_id: plan.id, pending_billing_interval: interval, pending_provider_plan_id: providerPlanId, plan_change_requested_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", sub.id);
      if (updated.error) throw updated.error;
      if (!approvalUrl) {
        try { const synced = await syncSubscription(admin, String(sub.provider_subscription_id)); return json({ ok: true, approvalUrl: null, subscription: synced, effectiveAt: sub.next_billing_at || null, noProration: true }); } catch {}
      }
      return json({ ok: true, approvalUrl: approvalUrl || null, effectiveAt: sub.next_billing_at || null, noProration: true });
    }

    if (action === "cancel_subscription") {
      const rows = await ownerSubscriptions(admin, user.id);
      const sub = rows.find((s: any) => ["active", "suspended", "payment_failed"].includes(s.status)) || currentSubscription(rows);
      if (!sub?.provider_subscription_id) return json({ error: "active_subscription_required" }, 409);
      if (sub.status === "cancelled") return json({ ok: true, alreadyCancelled: true, accessEndsAt: sub.access_ends_at || null });
      const cancelled = await paypal(`/v1/billing/subscriptions/${encodeURIComponent(String(sub.provider_subscription_id))}/cancel`, { method: "POST", body: JSON.stringify({ reason: "Customer requested cancellation from LabNarrative Trading." }) });
      if (!cancelled.r.ok && cancelled.r.status !== 204) return json({ error: text(cancelled.p.message, 1000) || "paypal_subscription_cancel_failed" }, 502);
      const now = new Date().toISOString();
      const accessEndsAt = future(sub.next_billing_at) ? sub.next_billing_at : now;
      const saved = await admin.from("trader_subscriptions").update({ status: "cancelled", cancel_at_period_end: true, cancellation_requested_at: now, cancelled_at: now, access_ends_at: accessEndsAt, pending_plan_id: null, pending_billing_interval: null, pending_provider_plan_id: null, updated_at: now }).eq("id", sub.id).select("*").single();
      if (saved.error) throw saved.error;
      return json({ ok: true, subscription: saved.data, accessEndsAt });
    }

    return json({ error: "unsupported_action" }, 400);
  } catch (error) { console.error("trader-billing-control", error); return json({ error: error instanceof Error ? error.message : "trader_billing_control_failed" }, 500); }
});
