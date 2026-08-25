import http from "node:http";
import { createHash, verify as verifySignature } from "node:crypto";

const PORT = Number(process.env.PORT || 8080);
const BINANCE_ORIGIN = "https://api.binance.com";
const MAX_BODY_BYTES = 64 * 1024;
const MAX_CLOCK_SKEW_MS = 30_000;
const NONCE_TTL_MS = 60_000;
const REQUEST_TIMEOUT_MS = 10_000;

// Public half only. The matching private key is generated and kept inside Supabase Vault.
const RELAY_SIGNING_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE/x13leNz65fns4Cnoh6vEyAbR8MB
xctNegKl/b1/1PYc1ENJ3ET0UuRXSkPwBWHpaDoioCV8hlJ7Dpu6JOr61w==
-----END PUBLIC KEY-----
`;

const allowed = new Set([
  "GET /api/v3/time",
  "GET /api/v3/account",
  "GET /api/v3/openOrders",
  "GET /api/v3/order",
  "POST /api/v3/order",
  "DELETE /api/v3/order",
  "POST /api/v3/order/test",
  "GET /api/v3/allOrders",
  "GET /api/v3/myTrades",
  "GET /api/v3/account/commission",
  "GET /sapi/v1/account/apiRestrictions",
]);

const seenNonces = new Map();
let egressIp = null;
let egressCheckedAt = 0;
let windowStartedAt = Date.now();
let windowRequests = 0;

const json = (res, status, body) => {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(data),
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  res.end(data);
};

const cleanupNonces = () => {
  const cutoff = Date.now() - NONCE_TTL_MS;
  for (const [nonce, at] of seenNonces) if (at < cutoff) seenNonces.delete(nonce);
};

const rateAllowed = () => {
  const now = Date.now();
  if (now - windowStartedAt >= 1000) {
    windowStartedAt = now;
    windowRequests = 0;
  }
  windowRequests += 1;
  return windowRequests <= 40;
};

const readBody = async (req) => {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error("body_too_large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
};

const verifyRelayAuth = (req, rawBody) => {
  const timestamp = Number(req.headers["x-ln-timestamp"] || 0);
  const nonce = String(req.headers["x-ln-nonce"] || "");
  const supplied = String(req.headers["x-ln-signature"] || "");
  if (!Number.isFinite(timestamp) || Math.abs(Date.now() - timestamp) > MAX_CLOCK_SKEW_MS) return false;
  if (!/^[a-zA-Z0-9_-]{16,128}$/.test(nonce)) return false;
  if (!/^[A-Za-z0-9+/=]{80,100}$/.test(supplied)) return false;
  cleanupNonces();
  if (seenNonces.has(nonce)) return false;

  let signature;
  try {
    signature = Buffer.from(supplied, "base64");
  } catch {
    return false;
  }
  if (signature.length !== 64) return false;

  const message = `${timestamp}\n${nonce}\n${rawBody}`;
  const verified = verifySignature(
    "sha256",
    Buffer.from(message, "utf8"),
    { key: RELAY_SIGNING_PUBLIC_KEY, dsaEncoding: "ieee-p1363" },
    signature,
  );
  if (!verified) return false;
  seenNonces.set(nonce, Date.now());
  return true;
};

const refreshEgressIp = async () => {
  if (egressIp && Date.now() - egressCheckedAt < 10 * 60_000) return egressIp;
  try {
    const response = await fetch("https://checkip.amazonaws.com", { signal: AbortSignal.timeout(4000) });
    const value = (await response.text()).trim();
    if (response.ok && /^[0-9a-fA-F:.]+$/.test(value)) {
      egressIp = value;
      egressCheckedAt = Date.now();
    }
  } catch {}
  return egressIp;
};

const relay = async (payload) => {
  const method = String(payload?.method || "").toUpperCase();
  const path = String(payload?.path || "");
  const requestId = String(payload?.requestId || "").slice(0, 128);
  if (!allowed.has(`${method} ${path}`)) throw Object.assign(new Error("route_not_allowed"), { status: 403 });
  if (!path.startsWith("/api/v3/") && path !== "/sapi/v1/account/apiRestrictions") throw Object.assign(new Error("route_not_allowed"), { status: 403 });

  const query = String(payload?.query || "");
  if (query.length > 16_384 || query.includes("#")) throw Object.assign(new Error("invalid_query"), { status: 400 });
  const url = `${BINANCE_ORIGIN}${path}${query ? `?${query}` : ""}`;
  const apiKey = typeof payload?.apiKey === "string" ? payload.apiKey.trim() : "";
  if (apiKey && apiKey.length > 256) throw Object.assign(new Error("invalid_api_key"), { status: 400 });

  const headers = { accept: "application/json" };
  if (apiKey) headers["x-mbx-apikey"] = apiKey;
  if (payload?.body != null) headers["content-type"] = "application/json";

  const upstream = await fetch(url, {
    method,
    headers,
    body: method === "GET" || method === "DELETE" || payload?.body == null ? undefined : JSON.stringify(payload.body),
    redirect: "error",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const text = await upstream.text();
  console.log(JSON.stringify({ event: "binance_relay", requestId, method, path, status: upstream.status }));
  return {
    status: upstream.status,
    body: text,
    headers: {
      usedWeight1m: upstream.headers.get("x-mbx-used-weight-1m"),
      orderCount10s: upstream.headers.get("x-mbx-order-count-10s"),
      orderCount1m: upstream.headers.get("x-mbx-order-count-1m"),
      retryAfter: upstream.headers.get("retry-after"),
    },
  };
};

const server = http.createServer(async (req, res) => {
  try {
    if (!rateAllowed()) return json(res, 429, { error: "gateway_rate_limited" });

    // Vercel external rewrites can alter the request-target form. Route by method instead:
    // GET is public health only; POST is always signature-gated and payload allowlisted.
    if (req.method === "GET") {
      const ip = await refreshEgressIp();
      return json(res, 200, {
        ok: true,
        service: "labnarrative-binance-gateway",
        auth: "ecdsa-p256",
        egressIp: ip,
        binanceOrigin: BINANCE_ORIGIN,
      });
    }

    if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" });
    const rawBody = await readBody(req);
    if (!verifyRelayAuth(req, rawBody)) return json(res, 401, { error: "unauthorized" });
    let payload;
    try { payload = JSON.parse(rawBody); } catch { return json(res, 400, { error: "invalid_json" }); }
    const result = await relay(payload);
    const bodyHash = createHash("sha256").update(result.body).digest("hex");
    return json(res, 200, { ok: true, upstreamStatus: result.status, upstreamBody: result.body, upstreamHeaders: result.headers, bodySha256: bodyHash });
  } catch (error) {
    const status = Number(error?.status || 500);
    const message = error instanceof Error ? error.message : "gateway_error";
    console.error(JSON.stringify({ event: "gateway_error", message }));
    return json(res, status >= 400 && status < 600 ? status : 500, { error: message });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(JSON.stringify({ event: "gateway_started", port: PORT, auth: "ecdsa-p256" }));
  void refreshEgressIp();
});
