import "jsr:@supabase/functions-js/edge-runtime.d.ts";

type Json = Record<string, unknown>;
type LaunchProvider = "binance" | "bybit" | "okx" | "kucoin";

const LAUNCH_PROVIDERS = new Set<LaunchProvider>(["binance", "bybit", "okx", "kucoin"]);
const PASSPHRASE_PROVIDERS = new Set<LaunchProvider>(["okx", "kucoin"]);

function allowedOrigin(origin: string) {
  return origin === "https://platform.labnarrative.com"
    || origin === "https://app.labnarrative.com"
    || /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin);
}
function cors(req: Request) {
  const origin = req.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": allowedOrigin(origin) ? origin : "https://app.labnarrative.com",
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}
function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(req), "content-type": "application/json", "cache-control": "private, no-store" },
  });
}
function text(value: unknown) { return String(value ?? "").trim(); }
function obj(value: unknown): Json { return value && typeof value === "object" && !Array.isArray(value) ? value as Json : {}; }

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return json(req, { error: "method_not_allowed" }, 405);

  const origin = req.headers.get("origin") || "";
  if (origin && !allowedOrigin(origin)) return json(req, { error: "origin_not_allowed" }, 403);

  const authorization = req.headers.get("authorization") || "";
  if (!/^Bearer\s+\S+/i.test(authorization)) return json(req, { error: "unauthorized" }, 401);

  const url = Deno.env.get("SUPABASE_URL") || "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  if (!url || !anonKey) return json(req, { error: "server_configuration_missing" }, 500);

  try {
    const raw = await req.text();
    if (new TextEncoder().encode(raw).byteLength > 32_768) return json(req, { error: "request_too_large" }, 413);
    const body = obj(raw ? JSON.parse(raw) : {});
    const provider = text(body.provider).toLowerCase() as LaunchProvider;
    const action = text(body.action).toLowerCase();

    if (!LAUNCH_PROVIDERS.has(provider)) return json(req, { error: "unsupported_exchange_provider" }, 400);
    if (action !== "connect" && action !== "disconnect") return json(req, { error: "unsupported_connection_action" }, 400);

    let targetFunction: string;
    let downstreamBody: Json;

    if (action === "disconnect") {
      targetFunction = provider === "binance" ? "trader-binance-control" : "trader-multiexchange-control";
      downstreamBody = provider === "binance" ? { action: "disconnect" } : { action: "disconnect", provider };
    } else {
      const apiKey = text(body.apiKey);
      const apiSecret = text(body.apiSecret);
      const passphrase = text(body.passphrase);
      if (!apiKey || !apiSecret) return json(req, { error: "credentials_required" }, 400);
      if (apiKey.length > 512 || apiSecret.length > 4096 || passphrase.length > 1024) return json(req, { error: "credentials_too_large" }, 400);
      if (PASSPHRASE_PROVIDERS.has(provider) && !passphrase) return json(req, { error: "passphrase_required" }, 400);

      targetFunction = provider === "binance" ? "trader-binance-control" : "trader-multiexchange-control";
      downstreamBody = provider === "binance"
        ? { action: "connect", apiKey, apiSecret }
        : { action: "upgrade", provider, apiKey, apiSecret, ...(PASSPHRASE_PROVIDERS.has(provider) ? { passphrase } : {}) };
    }

    const response = await fetch(`${url}/functions/v1/${targetFunction}`, {
      method: "POST",
      headers: {
        "authorization": authorization,
        "apikey": anonKey,
        "content-type": "application/json",
      },
      body: JSON.stringify(downstreamBody),
      signal: AbortSignal.timeout(25_000),
    });

    const payload = obj(await response.json().catch(() => ({})));
    if (!response.ok) return json(req, payload.error ? payload : { error: "connection_control_failed" }, response.status);
    return json(req, payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || "connection_control_failed");
    if (message.includes("AbortError") || message.includes("TimeoutError")) return json(req, { error: "connection_control_timeout" }, 504);
    return json(req, { error: "connection_control_failed" }, 500);
  }
});
