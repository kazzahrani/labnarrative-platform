import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

type J = Record<string, unknown>;
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
function envMap(name: string): Record<string, string> { try { return JSON.parse(Deno.env.get(name) || "{}") as Record<string, string>; } catch { return {}; } }
function serviceKey() { return envMap("SUPABASE_SECRET_KEYS").default || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""; }
function text(v: unknown, max = 2000) { return typeof v === "string" ? v.trim().slice(0, max) : ""; }
function asObject(v: unknown): J { return v && typeof v === "object" && !Array.isArray(v) ? v as J : {}; }
function moneyValue(v: unknown) { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n.toFixed(2) : ""; }
function paypalBase() { return (Deno.env.get("PAYPAL_ENVIRONMENT") || "live").toLowerCase() === "sandbox" ? "https://api-m.sandbox.paypal.com" : "https://api-m.paypal.com"; }
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

function approvalLink(payload: J) {
  const links = Array.isArray(payload.links) ? payload.links as J[] : [];
  const match = links.find((link) => ["payer-action", "approve"].includes(text(link.rel, 50)));
  return match ? text(match.href, 4000) : "";
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
  const fullName = [text(name.given_name, 200), text(name.surname, 200)].filter(Boolean).join(" ");
  return { payer: { name: fullName, email: text(payer.email_address, 320) } };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const base = Deno.env.get("SUPABASE_URL") || "";
  const service = serviceKey();
  if (!base || !service) return json({ error: "Payment service configuration is incomplete." }, 500);
  const admin = createClient(base, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const body = await req.json().catch(() => ({})) as J;
  const action = text(body.action, 50) || "status";
  const paymentToken = text(body.token, 100);

  if (action === "status") {
    const isConfigured = configured();
    let verified = false;
    let authError = "";
    if (isConfigured) {
      try {
        await accessToken();
        verified = true;
      } catch (error) {
        authError = error instanceof Error ? error.message : "PayPal authentication failed.";
      }
    }
    return json({
      ok: true,
      configured: isConfigured,
      verified,
      environment: (Deno.env.get("PAYPAL_ENVIRONMENT") || "live").toLowerCase() === "sandbox" ? "sandbox" : "live",
      ...(authError ? { authError } : {}),
    });
  }
  if (!paymentToken) return json({ error: "Payment token is required." }, 400);

  const { data: payment, error: paymentError } = await admin.from("sales_payment_requests").select("*").eq("token", paymentToken).maybeSingle();
  if (paymentError || !payment) return json({ error: "Payment request not found." }, 404);
  if (["cancelled", "expired", "refunded"].includes(payment.status)) return json({ error: "This payment request is closed." }, 409);
  if (payment.status === "paid") return json({ ok: true, paid: true, status: "paid", captureId: payment.provider_capture_id || "", paidAt: payment.paid_at || null });
  if (new Date(`${payment.valid_until}T23:59:59Z`).getTime() < Date.now()) return json({ error: "This payment request has expired." }, 409);
  if (!configured()) return json({ error: "PayPal checkout is not connected yet. Please contact LabNarrative for payment assistance.", code: "paypal_not_configured" }, 503);

  try {
    if (action === "create_order") {
      if (payment.provider_order_id) {
        const existing = await paypal(`/v2/checkout/orders/${encodeURIComponent(payment.provider_order_id)}`, { method: "GET" });
        if (existing.response.ok) {
          if (text(existing.payload.status, 50) === "COMPLETED") return json({ ok: true, orderId: payment.provider_order_id, completed: true });
          const existingApproval = approvalLink(existing.payload);
          if (existingApproval) return json({ ok: true, orderId: payment.provider_order_id, approvalUrl: existingApproval, reused: true });
        }
        return json({ error: "The existing PayPal checkout could not be resumed. Please contact LabNarrative.", code: "paypal_order_unavailable" }, 409);
      }

      const amount = moneyValue(payment.amount);
      if (!amount) return json({ error: "The stored payment amount is invalid." }, 500);
      const origin = (Deno.env.get("PAYPAL_RETURN_BASE_URL") || "https://labnarrative.com").replace(/\/$/, "");
      const returnUrl = `${origin}/pay/${encodeURIComponent(paymentToken)}?paypal=return`;
      const cancelUrl = `${origin}/pay/${encodeURIComponent(paymentToken)}?paypal=cancelled`;
      const { data: prospect } = await admin.from("prospects").select("pi_name").eq("id", payment.prospect_id).maybeSingle();
      const description = `LabNarrative ${payment.kind} payment${prospect?.pi_name ? ` – ${prospect.pi_name}` : ""}`.slice(0, 127);
      const requestBody = {
        intent: "CAPTURE",
        purchase_units: [{ reference_id: payment.id, custom_id: payment.id, description, amount: { currency_code: String(payment.currency).toUpperCase(), value: amount } }],
        payment_source: { paypal: { payment_method_preference: "IMMEDIATE_PAYMENT_REQUIRED", experience_context: { brand_name: "LabNarrative", landing_page: "NO_PREFERENCE", user_action: "PAY_NOW", shipping_preference: "NO_SHIPPING", return_url: returnUrl, cancel_url: cancelUrl } } },
      };
      const created = await paypal("/v2/checkout/orders", { method: "POST", headers: { "PayPal-Request-Id": payment.id }, body: JSON.stringify(requestBody) });
      const orderId = text(created.payload.id, 300);
      const approve = approvalLink(created.payload);
      if (!created.response.ok || !orderId || !approve) {
        const message = text(created.payload.message, 1000) || `PayPal returned HTTP ${created.response.status}.`;
        await admin.rpc("sales_payment_provider_fail", { p_payment_id: payment.id, p_message: message, p_metadata: { paypal_create_status: created.response.status } });
        return json({ error: message, code: "paypal_create_failed" }, 502);
      }
      const { error: bindError } = await admin.rpc("sales_payment_provider_bind", { p_payment_id: payment.id, p_order_id: orderId, p_metadata: { paypal_create_status: text(created.payload.status, 50), paypal_environment: (Deno.env.get("PAYPAL_ENVIRONMENT") || "live").toLowerCase() } });
      if (bindError) return json({ error: bindError.message }, 500);
      return json({ ok: true, orderId, approvalUrl: approve });
    }

    if (action === "capture") {
      const orderId = text(body.orderId, 300);
      if (!orderId || !payment.provider_order_id || orderId !== payment.provider_order_id) return json({ error: "PayPal order does not match this payment request." }, 409);
      let order = await paypal(`/v2/checkout/orders/${encodeURIComponent(orderId)}`, { method: "GET" });
      if (!order.response.ok) return json({ error: text(order.payload.message, 1000) || "Could not verify the PayPal order." }, 502);
      if (text(order.payload.status, 50) !== "COMPLETED") {
        order = await paypal(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, { method: "POST", headers: { "PayPal-Request-Id": `${payment.id}-capture` }, body: "{}" });
      }
      const capture = captureFrom(order.payload);
      const captureId = text(capture.id, 300);
      const captureStatus = text(capture.status, 50);
      const captureAmount = asObject(capture.amount);
      const capturedValue = Number(captureAmount.value);
      const capturedCurrency = text(captureAmount.currency_code, 20).toUpperCase();
      if (!order.response.ok || text(order.payload.status, 50) !== "COMPLETED" || captureStatus !== "COMPLETED" || !captureId || !Number.isFinite(capturedValue)) {
        const message = text(order.payload.message, 1000) || "PayPal has not completed this payment.";
        await admin.rpc("sales_payment_provider_fail", { p_payment_id: payment.id, p_message: message, p_metadata: { paypal_capture_status: text(order.payload.status, 50) } });
        return json({ error: message, code: "paypal_capture_incomplete" }, 409);
      }
      if (Math.round(capturedValue * 100) !== Math.round(Number(payment.amount) * 100) || capturedCurrency !== String(payment.currency).toUpperCase()) {
        const message = "PayPal capture amount or currency did not match the LabNarrative payment request.";
        await admin.rpc("sales_payment_provider_fail", { p_payment_id: payment.id, p_message: message, p_metadata: { captured_value: capturedValue, captured_currency: capturedCurrency } });
        return json({ error: message, code: "paypal_amount_mismatch" }, 409);
      }
      const meta = { ...payerMeta(order.payload), paypal_order_status: text(order.payload.status, 50), paypal_capture_status: captureStatus };
      const { data: completed, error: completeError } = await admin.rpc("sales_payment_provider_complete", { p_payment_id: payment.id, p_order_id: orderId, p_capture_id: captureId, p_capture_status: captureStatus, p_capture_amount: capturedValue, p_capture_currency: capturedCurrency, p_metadata: meta });
      if (completeError) return json({ error: completeError.message }, 500);
      return json({ ok: true, paid: true, status: "paid", captureId, payment: completed });
    }

    return json({ error: "Unknown payment action." }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "PayPal checkout failed.";
    return json({ error: message }, 500);
  }
});
