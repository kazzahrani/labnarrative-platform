import http from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash, verify as verifySignature } from "node:crypto";

const PORT = Number(process.env.PORT || 8080);
const OKX_RECOMMENDED_ORIGIN = "https://openapi.okx.com";
const ORIGINS = Object.freeze({
  binance: "https://api.binance.com",
  bybit: "https://api.bybit.com",
  okx: "https://www.okx.com",
  kucoin: "https://api.kucoin.com",
});
const MAX_BODY_BYTES = 64 * 1024;
const MAX_INNER_BODY_BYTES = 48 * 1024;
const MAX_UPSTREAM_RESPONSE_BYTES = 4 * 1024 * 1024;
const MAX_CLOCK_SKEW_MS = 30_000;
const NONCE_TTL_MS = 60_000;
const REQUEST_TIMEOUT_MS = 10_000;

// Public half only. The matching private key is generated and kept inside Supabase Vault.
const RELAY_SIGNING_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE/x13leNz65fns4Cnoh6vEyAbR8MB
xctNegKl/b1/1PYc1ENJ3ET0UuRXSkPwBWHpaDoioCV8hlJ7Dpu6JOr61w==
-----END PUBLIC KEY-----
`;

const EXACT_ROUTES = new Map([
  [ORIGINS.binance, new Set([
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
  ])],
  [ORIGINS.bybit, new Set([
    "GET /v5/market/instruments-info",
    "GET /v5/market/tickers",
    "GET /v5/market/kline",
    "GET /v5/user/query-api",
    "GET /v5/account/wallet-balance",
    "GET /v5/order/realtime",
    "GET /v5/order/history",
    "GET /v5/execution/list",
    "POST /v5/order/create",
    "POST /v5/order/cancel",
  ])],
  [ORIGINS.okx, new Set([
    "GET /api/v5/account/config",
    "GET /api/v5/account/balance",
    "GET /api/v5/trade/order",
    "GET /api/v5/trade/fills",
    "POST /api/v5/trade/order",
    "POST /api/v5/trade/cancel-order",
  ])],
  [ORIGINS.kucoin, new Set([
    "GET /api/v1/user/api-key",
    "GET /api/v1/accounts",
    "GET /api/v1/hf/fills",
    "POST /api/v1/hf/orders/sync",
  ])],
]);

const DYNAMIC_ROUTES = new Map([
  [ORIGINS.kucoin, [
    { method: "GET", pattern: /^\/api\/v1\/hf\/orders\/[A-Za-z0-9_-]{1,128}$/ },
    { method: "GET", pattern: /^\/api\/v1\/hf\/orders\/client-order\/[A-Za-z0-9_-]{1,64}$/ },
    { method: "DELETE", pattern: /^\/api\/v1\/hf\/orders\/sync\/[A-Za-z0-9_-]{1,128}$/ },
    { method: "DELETE", pattern: /^\/api\/v1\/hf\/orders\/sync\/client-order\/[A-Za-z0-9_-]{1,64}$/ },
  ]],
]);

const HEADER_ALLOWLIST = new Map([
  [ORIGINS.binance, new Set(["accept", "x-mbx-apikey", "content-type"])],
  [ORIGINS.bybit, new Set(["accept", "content-type", "x-bapi-api-key", "x-bapi-timestamp", "x-bapi-recv-window", "x-bapi-sign"])],
  [ORIGINS.okx, new Set(["accept", "content-type", "ok-access-key", "ok-access-sign", "ok-access-timestamp", "ok-access-passphrase"])],
  [ORIGINS.kucoin, new Set(["accept", "content-type", "kc-api-key", "kc-api-sign", "kc-api-timestamp", "kc-api-passphrase", "kc-api-key-version"])],
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

const curlRequestIpv4 = async (url, { method, headers, body, timeoutMs }) => {
  const workDir = await mkdtemp(join(tmpdir(), "labnarrative-gateway-"));
  const headerPath = join(workDir, "headers.txt");
  const bodyPath = join(workDir, "body.bin");
  try {
    const headerText = Object.entries(headers)
      .map(([name, value]) => `${name}: ${String(value)}\r\n`)
      .join("");
    await writeFile(headerPath, headerText, { mode: 0o600 });
    if (body != null) await writeFile(bodyPath, body, { mode: 0o600 });

    return await new Promise((resolve, reject) => {
      const args = [
        "--silent",
        "--show-error",
        "--ipv4",
        "--max-time", String(Math.max(1, Math.ceil(timeoutMs / 1000))),
        "--request", method,
        "--url", url,
        "--header", `@${headerPath}`,
        "--write-out", "\n%{http_code}",
      ];
      if (body != null) args.push("--data-binary", `@${bodyPath}`);

      const child = spawn("/usr/bin/curl", args, { stdio: ["ignore", "pipe", "pipe"] });
      const stdout = [];
      const stderr = [];
      let outputBytes = 0;
      let settled = false;
      const hardTimer = setTimeout(() => {
        if (settled) return;
        settled = true;
        try { child.kill("SIGKILL"); } catch {}
        reject(new Error("upstream_timeout"));
      }, timeoutMs + 2000);

      const finish = (fn) => {
        if (settled) return false;
        settled = true;
        clearTimeout(hardTimer);
        fn();
        return true;
      };

      child.stdout.on("data", (chunk) => {
        outputBytes += chunk.length;
        if (outputBytes > MAX_UPSTREAM_RESPONSE_BYTES) {
          finish(() => {
            try { child.kill("SIGKILL"); } catch {}
            reject(new Error("upstream_response_too_large"));
          });
          return;
        }
        stdout.push(chunk);
      });
      child.stderr.on("data", (chunk) => {
        const current = stderr.reduce((sum, item) => sum + item.length, 0);
        if (current < 16 * 1024) stderr.push(chunk);
      });
      child.on("error", (error) => finish(() => reject(error)));
      child.on("close", (code) => {
        finish(() => {
          const raw = Buffer.concat(stdout).toString("utf8");
          const split = raw.lastIndexOf("\n");
          const statusText = split >= 0 ? raw.slice(split + 1).trim() : "";
          const responseBody = split >= 0 ? raw.slice(0, split) : raw;
          const status = Number(statusText);
          if (code !== 0 || !Number.isInteger(status) || status < 100 || status > 599) {
            const diagnostic = Buffer.concat(stderr).toString("utf8").trim().slice(0, 300);
            reject(new Error(code === 28 ? "upstream_timeout" : `curl_upstream_${code ?? "error"}${diagnostic ? `:${diagnostic}` : ""}`));
            return;
          }
          resolve({ status, body: responseBody, headers: {} });
        });
      });
    });
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
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
    const response = await fetch("http://169.254.169.254/opc/v2/vnics/", {
      headers: { Authorization: "Bearer Oracle" },
      signal: AbortSignal.timeout(2000),
    });
    const vnics = await response.json();
    const value = Array.isArray(vnics)
      ? String(vnics.find((v) => typeof v?.publicIp === "string" && v.publicIp.trim())?.publicIp || "").trim()
      : "";
    if (response.ok && /^[0-9a-fA-F:.]+$/.test(value)) {
      egressIp = value;
      egressCheckedAt = Date.now();
      return egressIp;
    }
  } catch {}

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

const normalizeOrigin = (value) => {
  if (!value) return ORIGINS.binance; // Backwards compatibility with the existing Binance relay payload.
  let origin;
  try { origin = new URL(String(value)).origin; } catch { throw Object.assign(new Error("upstream_not_allowed"), { status: 403 }); }
  if (origin === OKX_RECOMMENDED_ORIGIN) return ORIGINS.okx;
  if (!Object.values(ORIGINS).includes(origin)) throw Object.assign(new Error("upstream_not_allowed"), { status: 403 });
  return origin;
};

const routeAllowed = (origin, method, path) => {
  if (EXACT_ROUTES.get(origin)?.has(`${method} ${path}`)) return true;
  return (DYNAMIC_ROUTES.get(origin) || []).some((route) => route.method === method && route.pattern.test(path));
};

const safeHeaders = (origin, supplied, legacyApiKey) => {
  const allowed = HEADER_ALLOWLIST.get(origin) || new Set();
  const headers = { accept: "application/json" };
  if (supplied != null && (typeof supplied !== "object" || Array.isArray(supplied))) {
    throw Object.assign(new Error("invalid_headers"), { status: 400 });
  }
  for (const [rawName, rawValue] of Object.entries(supplied || {})) {
    const name = String(rawName).toLowerCase();
    const value = String(rawValue ?? "");
    if (!allowed.has(name)) throw Object.assign(new Error("header_not_allowed"), { status: 403 });
    if (value.length > 4096 || /[\r\n]/.test(value)) throw Object.assign(new Error("invalid_header"), { status: 400 });
    headers[name] = value;
  }
  if (origin === ORIGINS.binance && legacyApiKey) headers["x-mbx-apikey"] = legacyApiKey;
  return headers;
};

const requestBody = (method, value) => {
  if (method === "GET" || method === "DELETE" || value == null) return undefined;
  const body = typeof value === "string" ? value : JSON.stringify(value);
  if (Buffer.byteLength(body) > MAX_INNER_BODY_BYTES) throw Object.assign(new Error("upstream_body_too_large"), { status: 400 });
  return body;
};

const parseJsonBody = (body) => {
  if (body == null || body === "") return {};
  try {
    const parsed = JSON.parse(body);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    return parsed;
  } catch {
    throw Object.assign(new Error("invalid_upstream_json"), { status: 400 });
  }
};

const usdtSymbol = (value, dashed = false) => {
  const text = String(value || "");
  const pattern = dashed ? /^[A-Z0-9]{1,20}-USDT$/ : /^[A-Z0-9]{1,20}USDT$/;
  return pattern.test(text) && text !== (dashed ? "USDT-USDT" : "USDTUSDT");
};

const enforceSpotOnly = (origin, method, path, query, body) => {
  const params = new URLSearchParams(query);
  if (origin === ORIGINS.bybit) {
    if (path.startsWith("/v5/market/")) {
      if (params.get("category") !== "spot") throw Object.assign(new Error("spot_only"), { status: 403 });
      const symbol = params.get("symbol");
      if (symbol && !usdtSymbol(symbol)) throw Object.assign(new Error("usdt_spot_only"), { status: 403 });
      return;
    }
    if (path === "/v5/account/wallet-balance") {
      if (params.get("accountType") !== "UNIFIED") throw Object.assign(new Error("spot_account_only"), { status: 403 });
      return;
    }
    if (["/v5/order/realtime", "/v5/order/history", "/v5/execution/list"].includes(path)) {
      if (params.get("category") !== "spot") throw Object.assign(new Error("spot_only"), { status: 403 });
      const symbol = params.get("symbol");
      if (symbol && !usdtSymbol(symbol)) throw Object.assign(new Error("usdt_spot_only"), { status: 403 });
      const filter = params.get("orderFilter");
      if (filter && filter !== "Order") throw Object.assign(new Error("spot_order_filter_only"), { status: 403 });
      return;
    }
    if (method === "POST" && ["/v5/order/create", "/v5/order/cancel"].includes(path)) {
      const value = parseJsonBody(body);
      if (value.category !== "spot" || !usdtSymbol(value.symbol)) throw Object.assign(new Error("spot_only"), { status: 403 });
      if (value.orderFilter != null && value.orderFilter !== "Order") throw Object.assign(new Error("spot_order_filter_only"), { status: 403 });
      if (value.isLeverage != null && Number(value.isLeverage) !== 0) throw Object.assign(new Error("leverage_forbidden"), { status: 403 });
      if (path === "/v5/order/create") {
        if (!["Buy", "Sell"].includes(value.side) || !["Market", "Limit"].includes(value.orderType)) throw Object.assign(new Error("spot_order_type_only"), { status: 403 });
      }
      return;
    }
    return;
  }

  if (origin === ORIGINS.okx) {
    if (path === "/api/v5/trade/fills") {
      if (params.get("instType") !== "SPOT") throw Object.assign(new Error("spot_only"), { status: 403 });
      return;
    }
    if (method === "GET" && path === "/api/v5/trade/order") {
      if (!usdtSymbol(params.get("instId"), true)) throw Object.assign(new Error("usdt_spot_only"), { status: 403 });
      return;
    }
    if (method === "POST" && ["/api/v5/trade/order", "/api/v5/trade/cancel-order"].includes(path)) {
      const value = parseJsonBody(body);
      if (!usdtSymbol(value.instId, true)) throw Object.assign(new Error("usdt_spot_only"), { status: 403 });
      if (path === "/api/v5/trade/order") {
        if (value.tdMode !== "cash") throw Object.assign(new Error("cash_spot_only"), { status: 403 });
        if (!["buy", "sell"].includes(value.side) || !["market", "limit"].includes(value.ordType)) throw Object.assign(new Error("spot_order_type_only"), { status: 403 });
        if (value.tgtCcy != null && !["quote_ccy", "base_ccy"].includes(value.tgtCcy)) throw Object.assign(new Error("spot_currency_mode_only"), { status: 403 });
      }
      return;
    }
    return;
  }

  if (origin === ORIGINS.kucoin) {
    if (path === "/api/v1/accounts") {
      if (params.get("type") !== "trade") throw Object.assign(new Error("spot_account_only"), { status: 403 });
      return;
    }
    if (method === "POST" && path === "/api/v1/hf/orders/sync") {
      const value = parseJsonBody(body);
      if (!usdtSymbol(value.symbol, true)) throw Object.assign(new Error("usdt_spot_only"), { status: 403 });
      if (!["buy", "sell"].includes(value.side) || !["market", "limit"].includes(value.type)) throw Object.assign(new Error("spot_order_type_only"), { status: 403 });
      return;
    }
    if (path === "/api/v1/hf/fills" || path.startsWith("/api/v1/hf/orders/")) {
      const symbol = params.get("symbol");
      if (!usdtSymbol(symbol, true)) throw Object.assign(new Error("usdt_spot_only"), { status: 403 });
      return;
    }
  }
};

const relay = async (payload) => {
  const method = String(payload?.method || "").toUpperCase();
  const path = String(payload?.path || "");
  const requestId = String(payload?.requestId || "").slice(0, 128);
  const origin = normalizeOrigin(payload?.upstream);
  if (!/^(GET|POST|DELETE)$/.test(method)) throw Object.assign(new Error("method_not_allowed"), { status: 405 });
  if (!/^\/[A-Za-z0-9._~!$&'()*+,;=:@%\/-]{1,512}$/.test(path) || path.includes("..")) throw Object.assign(new Error("invalid_path"), { status: 400 });
  if (!routeAllowed(origin, method, path)) throw Object.assign(new Error("route_not_allowed"), { status: 403 });

  const query = String(payload?.query || "");
  if (query.length > 16_384 || query.includes("#") || /[\r\n]/.test(query)) throw Object.assign(new Error("invalid_query"), { status: 400 });
  const apiKey = typeof payload?.apiKey === "string" ? payload.apiKey.trim() : "";
  if (apiKey && (apiKey.length > 256 || /[\r\n]/.test(apiKey))) throw Object.assign(new Error("invalid_api_key"), { status: 400 });

  const headers = safeHeaders(origin, payload?.headers, apiKey);
  const body = requestBody(method, payload?.body);
  enforceSpotOnly(origin, method, path, query, body);
  if (body != null && !headers["content-type"]) headers["content-type"] = "application/json";
  const url = `${origin}${path}${query ? `?${query}` : ""}`;

  let upstreamStatus;
  let text;
  let headerGet;
  if (origin === ORIGINS.kucoin || origin === ORIGINS.okx) {
    const upstream = await curlRequestIpv4(url, { method, headers, body, timeoutMs: REQUEST_TIMEOUT_MS });
    upstreamStatus = upstream.status;
    text = upstream.body;
    headerGet = () => null;
  } else {
    const upstream = await fetch(url, {
      method,
      headers,
      body,
      redirect: "error",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    upstreamStatus = upstream.status;
    text = await upstream.text();
    headerGet = (name) => upstream.headers.get(name);
  }

  const provider = Object.entries(ORIGINS).find(([, value]) => value === origin)?.[0] || "unknown";
  console.log(JSON.stringify({ event: "exchange_relay", provider, requestId, method, path, status: upstreamStatus }));
  return {
    status: upstreamStatus,
    body: text,
    headers: {
      usedWeight1m: headerGet("x-mbx-used-weight-1m"),
      orderCount10s: headerGet("x-mbx-order-count-10s"),
      orderCount1m: headerGet("x-mbx-order-count-1m"),
      retryAfter: headerGet("retry-after"),
    },
  };
};

const server = http.createServer(async (req, res) => {
  try {
    if (!rateAllowed()) return json(res, 429, { error: "gateway_rate_limited" });

    // GET is public health only; POST is signature-gated and origin/method/path/header allowlisted.
    if (req.method === "GET") {
      const ip = await refreshEgressIp();
      return json(res, 200, {
        ok: true,
        service: "labnarrative-trader-gateway",
        auth: "ecdsa-p256",
        egressIp: ip,
        providers: Object.keys(ORIGINS),
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
  console.log(JSON.stringify({ event: "gateway_started", port: PORT, auth: "ecdsa-p256", providers: Object.keys(ORIGINS) }));
  void refreshEgressIp();
});