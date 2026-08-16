import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

type J = Record<string, unknown>;
type PackageKey = "starter" | "portfolio" | "portfolio_plus";
const PORTFOLIO_BRIDGE_URL = "https://pryezqkkildppjxbdrsj.supabase.co/functions/v1/client-portfolio-bridge";
const PACKAGES: Record<PackageKey, { name: string; products: number; amount: number }> = {
  starter: { name: "Starter", products: 5, amount: 399 },
  portfolio: { name: "Portfolio", products: 10, amount: 699 },
  portfolio_plus: { name: "Portfolio Plus", products: 20, amount: 1190 },
};

function allowedOrigin(origin: string | null) {
  if (!origin) return "*";
  try {
    const u = new URL(origin);
    if (u.protocol === "https:" && (u.hostname === "labnarrative.com" || u.hostname === "www.labnarrative.com" || /^labnarrative-platform(?:-[a-z0-9-]+)?\.vercel\.app$/i.test(u.hostname))) return origin;
    if (u.protocol === "http:" && ["localhost", "127.0.0.1"].includes(u.hostname)) return origin;
  } catch {}
  return "";
}
function cors(origin: string | null) {
  const allowed = allowedOrigin(origin);
  return {
    ...(allowed ? { "Access-Control-Allow-Origin": allowed } : {}),
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}
function json(body: unknown, status = 200, origin: string | null = null) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors(origin), "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
function text(v: unknown, max = 2000) { return typeof v === "string" ? v.trim().slice(0, max) : ""; }
function asObject(v: unknown): J { return v && typeof v === "object" && !Array.isArray(v) ? v as J : {}; }
function isUuid(v: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v); }
function serviceKey() {
  try {
    const mapped = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}") as Record<string, string>;
    if (mapped.default) return mapped.default;
  } catch {}
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
}
function paypalBase() { return (Deno.env.get("PAYPAL_ENVIRONMENT") || "live").toLowerCase() === "sandbox" ? "https://api-m.sandbox.paypal.com" : "https://api-m.paypal.com"; }
function paypalEnvironment() { return (Deno.env.get("PAYPAL_ENVIRONMENT") || "live").toLowerCase() === "sandbox" ? "sandbox" : "live"; }
function configured() { return Boolean(Deno.env.get("PAYPAL_CLIENT_ID") && Deno.env.get("PAYPAL_CLIENT_SECRET")); }

async function accessToken() {
  const clientId = Deno.env.get("PAYPAL_CLIENT_ID") || "";
  const secret = Deno.env.get("PAYPAL_CLIENT_SECRET") || "";
  if (!clientId || !secret) throw new Error("PayPal is not connected yet.");
  const response = await fetch(`${paypalBase()}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${btoa(`${clientId}:${secret}`)}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  const payload = await response.json().catch(() => ({})) as J;
  const token = text(payload.access_token, 5000);
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
function captureFrom(payload: J) {
  const units = Array.isArray(payload.purchase_units) ? payload.purchase_units as J[] : [];
  const payments = asObject(units[0]?.payments);
  const captures = Array.isArray(payments.captures) ? payments.captures as J[] : [];
  return captures[0] || {};
}
function payerMeta(payload: J) {
  const payer = asObject(payload.payer);
  const name = asObject(payer.name);
  return { name: [text(name.given_name, 200), text(name.surname, 200)].filter(Boolean).join(" "), email: text(payer.email_address, 320) };
}
async function registerWorkspace(accessToken: string) {
  if (!isUuid(accessToken)) return;
  try {
    const r = await fetch(PORTFOLIO_BRIDGE_URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "register", token: accessToken }), cache: "no-store" });
    if (!r.ok) console.error("client portfolio registration failed", r.status, await r.text());
  } catch (e) { console.error("client portfolio registration failed", e); }
}
async function ensureWorkspace(admin: any, purchase: any) {
  let { data: workspace, error } = await admin.from("intelligence_client_workspaces").select("*").eq("purchase_id", purchase.id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!workspace) {
    const created = await admin.from("intelligence_client_workspaces").insert({
      purchase_id: purchase.id,
      contact_name: purchase.payer_name || null,
      contact_email: purchase.payer_email || null,
      onboarding_status: "awaiting_details",
    }).select("*").single();
    if (created.error || !created.data) throw new Error(created.error?.message || "Client workspace could not be created.");
    workspace = created.data;
  } else if ((!workspace.contact_email && purchase.payer_email) || (!workspace.contact_name && purchase.payer_name)) {
    const updated = await admin.from("intelligence_client_workspaces").update({
      contact_name: workspace.contact_name || purchase.payer_name || null,
      contact_email: workspace.contact_email || purchase.payer_email || null,
      updated_at: new Date().toISOString(),
    }).eq("id", workspace.id).select("*").single();
    if (!updated.error && updated.data) workspace = updated.data;
  }
  const slots = [];
  for (let i = 1; i <= Number(purchase.product_count || 0); i++) slots.push({ workspace_id: workspace.id, position: i, status: "awaiting_product", priority: "normal" });
  if (slots.length) {
    const upsert = await admin.from("intelligence_product_requests").upsert(slots, { onConflict: "workspace_id,position", ignoreDuplicates: true });
    if (upsert.error) throw new Error(upsert.error.message);
  }
  await registerWorkspace(workspace.access_token);
  return workspace;
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (origin && !allowedOrigin(origin)) return json({ error: "Origin not allowed." }, 403, origin);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405, origin);

  const base = Deno.env.get("SUPABASE_URL") || "";
  const service = serviceKey();
  if (!base || !service) return json({ error: "Payment service configuration is incomplete." }, 500, origin);
  const admin = createClient(base, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const body = await req.json().catch(() => ({})) as J;
  const action = text(body.action, 50) || "status";

  if (action === "status") {
    const isConfigured = configured();
    let verified = false;
    let authError = "";
    if (isConfigured) {
      try { await accessToken(); verified = true; }
      catch (error) { authError = error instanceof Error ? error.message : "PayPal authentication failed."; }
    }
    return json({ ok: true, configured: isConfigured, verified, clientId: isConfigured ? (Deno.env.get("PAYPAL_CLIENT_ID") || "") : "", environment: paypalEnvironment(), currency: "USD", packages: Object.entries(PACKAGES).map(([key, value]) => ({ key, ...value })), ...(authError ? { authError } : {}) }, 200, origin);
  }

  if (!configured()) return json({ error: "PayPal checkout is not connected yet.", code: "paypal_not_configured" }, 503, origin);

  try {
    if (action === "create_order") {
      const packageKey = text(body.packageKey, 50) as PackageKey;
      const selected = PACKAGES[packageKey];
      if (!selected) return json({ error: "Please choose a valid Intelligence package." }, 400, origin);
      const sourceReportCandidate = text(body.sourceReportId, 100);
      const sourceReportId = isUuid(sourceReportCandidate) ? sourceReportCandidate : null;

      const { data: purchase, error: insertError } = await admin.from("intelligence_package_purchases").insert({
        package_key: packageKey,
        package_name: selected.name,
        product_count: selected.products,
        amount: selected.amount,
        currency: "USD",
        status: "pending",
        provider: "paypal",
        source_report_id: sourceReportId,
        provider_metadata: { source: "labnarrative.com/intelligence/buy", source_report_id: sourceReportId, paypal_environment: paypalEnvironment() },
      }).select("*").single();
      if (insertError || !purchase) throw new Error(insertError?.message || "Purchase record could not be created.");

      const amount = Number(selected.amount).toFixed(2);
      const created = await paypal("/v2/checkout/orders", {
        method: "POST",
        headers: { "PayPal-Request-Id": `intelligence-${purchase.id}-v2` },
        body: JSON.stringify({
          intent: "CAPTURE",
          purchase_units: [{ reference_id: purchase.id, custom_id: purchase.id, description: `LabNarrative Intelligence - ${selected.name} - ${selected.products} product analyses`.slice(0, 127), amount: { currency_code: "USD", value: amount } }],
          application_context: { brand_name: "LabNarrative Intelligence", shipping_preference: "NO_SHIPPING", user_action: "PAY_NOW" },
        }),
      });
      const orderId = text(created.payload.id, 300);
      if (!created.response.ok || !orderId) {
        const message = text(created.payload.message, 1000) || `PayPal returned HTTP ${created.response.status}.`;
        await admin.from("intelligence_package_purchases").update({ status: "failed", failure_message: message, updated_at: new Date().toISOString() }).eq("id", purchase.id);
        return json({ error: message, code: "paypal_create_failed" }, 502, origin);
      }
      const { error: bindError } = await admin.from("intelligence_package_purchases").update({ provider_order_id: orderId, status: "processing", updated_at: new Date().toISOString(), provider_metadata: { ...asObject(purchase.provider_metadata), paypal_create_status: text(created.payload.status, 50), paypal_environment: paypalEnvironment() } }).eq("id", purchase.id);
      if (bindError) throw new Error(bindError.message);
      return json({ ok: true, orderId, purchaseId: purchase.id }, 200, origin);
    }

    if (action === "capture") {
      const orderId = text(body.orderId, 300);
      if (!orderId) return json({ error: "Payment order is missing." }, 400, origin);
      const { data: purchase, error: lookupError } = await admin.from("intelligence_package_purchases").select("*").eq("provider_order_id", orderId).maybeSingle();
      if (lookupError || !purchase) return json({ error: "Purchase record not found." }, 404, origin);
      if (purchase.status === "paid") {
        const workspace = await ensureWorkspace(admin, purchase);
        return json({ ok: true, paid: true, captureId: purchase.provider_capture_id || "", purchaseId: purchase.id, packageName: purchase.package_name, productCount: purchase.product_count, payerEmail: purchase.payer_email || "", workspaceUrl: `https://labnarrative.com/intelligence/workspace?token=${workspace.access_token}` }, 200, origin);
      }

      let order = await paypal(`/v2/checkout/orders/${encodeURIComponent(orderId)}`, { method: "GET" });
      if (!order.response.ok) return json({ error: text(order.payload.message, 1000) || "Could not verify the PayPal order." }, 502, origin);
      const units = Array.isArray(order.payload.purchase_units) ? order.payload.purchase_units as J[] : [];
      const unit = units[0] || {};
      const unitAmount = asObject(unit.amount);
      const orderValue = Number(unitAmount.value);
      const orderCurrency = text(unitAmount.currency_code, 20).toUpperCase();
      if (text(unit.custom_id, 100) !== purchase.id || Math.round(orderValue * 100) !== Math.round(Number(purchase.amount) * 100) || orderCurrency !== String(purchase.currency).toUpperCase()) return json({ error: "Payment order does not match this Intelligence purchase." }, 409, origin);

      if (text(order.payload.status, 50) !== "COMPLETED") {
        order = await paypal(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, { method: "POST", headers: { "PayPal-Request-Id": `intelligence-${purchase.id}-capture-v2` }, body: "{}" });
      }
      const capture = captureFrom(order.payload);
      const captureId = text(capture.id, 300);
      const captureStatus = text(capture.status, 50);
      const captureAmount = asObject(capture.amount);
      const capturedValue = Number(captureAmount.value);
      const capturedCurrency = text(captureAmount.currency_code, 20).toUpperCase();
      if (!order.response.ok || text(order.payload.status, 50) !== "COMPLETED" || captureStatus !== "COMPLETED" || !captureId || !Number.isFinite(capturedValue)) {
        const message = text(order.payload.message, 1000) || "PayPal has not completed this payment.";
        await admin.from("intelligence_package_purchases").update({ status: "failed", failure_message: message, updated_at: new Date().toISOString() }).eq("id", purchase.id).neq("status", "paid");
        return json({ error: message }, 409, origin);
      }
      if (Math.round(capturedValue * 100) !== Math.round(Number(purchase.amount) * 100) || capturedCurrency !== String(purchase.currency).toUpperCase()) return json({ error: "Captured payment amount does not match this Intelligence purchase." }, 409, origin);

      const payer = payerMeta(order.payload);
      const now = new Date().toISOString();
      const paidPurchase = { ...purchase, status: "paid", provider_capture_id: captureId, payer_name: payer.name || null, payer_email: payer.email || null, paid_at: now, updated_at: now };
      const { error: completeError } = await admin.from("intelligence_package_purchases").update({ status: "paid", provider_capture_id: captureId, payer_name: payer.name || null, payer_email: payer.email || null, paid_at: now, updated_at: now, failure_message: null, provider_metadata: { ...asObject(purchase.provider_metadata), paypal_order_status: text(order.payload.status, 50), paypal_capture_status: captureStatus, paypal_environment: paypalEnvironment() } }).eq("id", purchase.id).neq("status", "paid");
      if (completeError) throw new Error(completeError.message);
      const workspace = await ensureWorkspace(admin, paidPurchase);
      return json({ ok: true, paid: true, captureId, purchaseId: purchase.id, packageName: purchase.package_name, productCount: purchase.product_count, payerEmail: payer.email, workspaceUrl: `https://labnarrative.com/intelligence/workspace?token=${workspace.access_token}` }, 200, origin);
    }

    return json({ error: "Unknown payment action." }, 400, origin);
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : "Intelligence checkout failed." }, 500, origin);
  }
});
