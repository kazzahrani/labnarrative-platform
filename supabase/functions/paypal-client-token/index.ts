import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

type J = Record<string, unknown>;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function envMap(name: string): Record<string, string> {
  try {
    return JSON.parse(Deno.env.get(name) || "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

function serviceKey() {
  return envMap("SUPABASE_SECRET_KEYS").default || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
}

function text(value: unknown, max = 12000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function paypalBase() {
  return (Deno.env.get("PAYPAL_ENVIRONMENT") || "live").toLowerCase() === "sandbox"
    ? "https://api-m.sandbox.paypal.com"
    : "https://api-m.paypal.com";
}

async function accessToken() {
  const clientId = Deno.env.get("PAYPAL_CLIENT_ID") || "";
  const secret = Deno.env.get("PAYPAL_CLIENT_SECRET") || "";
  if (!clientId || !secret) throw new Error("PayPal is not connected yet.");

  const response = await fetch(`${paypalBase()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${clientId}:${secret}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      "Accept-Language": "en_US",
    },
    body: "grant_type=client_credentials",
  });
  const payload = await response.json().catch(() => ({})) as J;
  const token = text(payload.access_token, 5000);
  if (!response.ok || !token) {
    throw new Error(text(payload.error_description, 1000) || "PayPal authentication failed.");
  }
  return token;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const base = Deno.env.get("SUPABASE_URL") || "";
  const service = serviceKey();
  if (!base || !service) return json({ error: "Payment service configuration is incomplete." }, 500);

  const body = await req.json().catch(() => ({})) as J;
  const paymentToken = text(body.token, 100);
  if (!paymentToken) return json({ error: "Payment token is required." }, 400);

  const admin = createClient(base, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: payment, error: paymentError } = await admin
    .from("sales_payment_requests")
    .select("id,status,valid_until")
    .eq("token", paymentToken)
    .maybeSingle();

  if (paymentError || !payment) return json({ error: "Payment request not found." }, 404);
  if (["cancelled", "expired", "refunded"].includes(payment.status)) {
    return json({ error: "This payment request is closed." }, 409);
  }
  if (new Date(`${payment.valid_until}T23:59:59Z`).getTime() < Date.now()) {
    return json({ error: "This payment request has expired." }, 409);
  }

  try {
    const bearer = await accessToken();
    const response = await fetch(`${paypalBase()}/v1/identity/generate-token`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${bearer}`,
        "Content-Type": "application/json",
        "Accept-Language": "en_US",
      },
    });
    const payload = await response.json().catch(() => ({})) as J;
    const clientToken = text(payload.client_token, 12000);
    if (!response.ok || !clientToken) {
      return json({
        error: text(payload.message, 1000) || "PayPal could not create a card-fields client token.",
        code: "client_token_unavailable",
      }, 502);
    }
    return json({ ok: true, clientToken });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "PayPal client token failed." }, 500);
  }
});
