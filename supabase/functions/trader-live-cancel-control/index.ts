import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const EXPECTED_GATEWAY_ORIGIN = "https://trader-gateway.labnarrative.com";
const cors = {
  "Access-Control-Allow-Origin": "https://platform.labnarrative.com",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Json = Record<string, unknown>;
type Db = ReturnType<typeof createClient>;
type Creds = { apiKey: string; apiSecret: string };
let signingKeyCache: CryptoKey | null = null;

const n = (value: unknown, fallback = 0) => { const x = Number(value); return Number.isFinite(x) ? x : fallback; };
const clean = (error: unknown) => error instanceof Error ? error.message : String(error || "unknown_error");
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json", "cache-control": "no-store" } }); }
function nonce() { const a = new Uint8Array(24); crypto.getRandomValues(a); return Array.from(a).map(x => x.toString(16).padStart(2, "0")).join(""); }
function pemBytes(pem: string) { const b = pem.replace(/-----BEGIN [^-]+-----/g, "").replace(/-----END [^-]+-----/g, "").replace(/\s+/g, ""); const s = atob(b), a = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a; }
function b64(buffer: ArrayBuffer) { let s = ""; for (const x of new Uint8Array(buffer)) s += String.fromCharCode(x); return btoa(s); }
async function hmac(secret: string, message: string) { const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]); const r = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(message)); return Array.from(new Uint8Array(r)).map(x => x.toString(16).padStart(2, "0")).join(""); }

async function gatewayConfig(db: Db) { const { data, error } = await db.from("trader_gateway_config").select("base_url,status").eq("name", "binance").single(); if (error || !data) throw new Error("gateway_not_configured"); return data as { base_url: string | null; status: string }; }
async function signingKey(db: Db) { if (signingKeyCache) return signingKeyCache; const { data, error } = await db.rpc("trader_gateway_read_signing_private_key"); if (error || !data) throw new Error("gateway_signing_key_not_configured"); signingKeyCache = await crypto.subtle.importKey("pkcs8", pemBytes(String(data)), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]); return signingKeyCache; }
async function relay(db: Db, payload: Json) {
  const cfg = await gatewayConfig(db);
  if (cfg.status !== "ready" || !cfg.base_url) throw new Error("gateway_not_ready");
  const origin = new URL(cfg.base_url).origin;
  if (origin !== EXPECTED_GATEWAY_ORIGIN) throw new Error("gateway_origin_not_allowed");
  const raw = JSON.stringify(payload), timestamp = Date.now(), nn = nonce(), key = await signingKey(db);
  const sig = b64(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(`${timestamp}\n${nn}\n${raw}`)));
  const response = await fetch(`${origin}/relay`, { method: "POST", headers: { "content-type": "application/json", "x-ln-timestamp": String(timestamp), "x-ln-nonce": nn, "x-ln-signature": sig }, body: raw, signal: AbortSignal.timeout(12000) });
  const envelope = await response.json().catch(() => ({})) as Json;
  if (!response.ok) throw new Error(`gateway_${response.status}:${String(envelope.error || "relay_failed")}`);
  const upstream = n(envelope.upstreamStatus), rawBody = String(envelope.upstreamBody || "");
  let body: Json = {};
  try { body = rawBody ? JSON.parse(rawBody) : {}; } catch { throw new Error("binance_invalid_json"); }
  if (upstream < 200 || upstream >= 300) throw new Error(`binance_${String(body.code ?? upstream)}:${String(body.msg ?? "request_failed")}`);
  return body;
}
async function credentials(db: Db, accountId: string) { const { data, error } = await db.rpc("trader_binance_read_secret", { p_account_id: accountId }); if (error || !data) throw new Error("credential_not_found"); const c = JSON.parse(String(data)) as { apiKey?: string; apiSecret?: string }; if (!c.apiKey || !c.apiSecret) throw new Error("credential_not_found"); return { apiKey: c.apiKey, apiSecret: c.apiSecret }; }
async function signedAt(db: Db, c: Creds, method: "GET" | "DELETE", path: string, params: Record<string, string | number>, timestamp: number) { const q = new URLSearchParams(); for (const [k, v] of Object.entries(params)) q.set(k, String(v)); q.set("timestamp", String(timestamp)); q.set("recvWindow", "10000"); q.set("signature", await hmac(c.apiSecret, q.toString())); return relay(db, { requestId: crypto.randomUUID(), method, path, query: q.toString(), apiKey: c.apiKey }); }
async function signed(db: Db, c: Creds, method: "GET" | "DELETE", path: string, params: Record<string, string | number> = {}) { try { return await signedAt(db, c, method, path, params, Date.now()); } catch (error) { if (!clean(error).includes("-1021")) throw error; const t = await relay(db, { requestId: crypto.randomUUID(), method: "GET", path: "/api/v3/time", query: "" }); return signedAt(db, c, method, path, params, n(t.serverTime, Date.now())); } }
async function acquire(db: Db, accountId: string) { const id = crypto.randomUUID(); for (let i = 0; i < 45; i++) { const { data, error } = await db.rpc("trader_begin_command", { p_account_id: accountId, p_lock_id: id, p_lease_seconds: 45 }); if (error) throw error; if (data === true) return id; await new Promise(r => setTimeout(r, 350)); } throw new Error("account_busy"); }
async function release(db: Db, accountId: string, id: string) { try { await db.rpc("trader_release_account", { p_account_id: accountId, p_worker_id: id }); } catch {} }

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const url = Deno.env.get("SUPABASE_URL"), service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !service) return json({ error: "server_configuration_missing" }, 500);
  const db = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!bearer) return json({ error: "unauthorized" }, 401);
  const { data: userData, error: userError } = await db.auth.getUser(bearer);
  if (userError || !userData.user) return json({ error: "unauthorized" }, 401);
  const body = await req.json().catch(() => ({})) as Json;
  const accountId = String(body.accountId || "").trim(), tradeId = String(body.tradeId || "").trim();
  if (!accountId || !tradeId) return json({ error: "invalid_request" }, 400);

  let lockId = "";
  try {
    const { data: account, error: accountError } = await db.from("trader_accounts").select("id,mode").eq("id", accountId).eq("owner_user_id", userData.user.id).eq("account_kind", "real").eq("status", "active").maybeSingle();
    if (accountError) throw accountError;
    if (!account) throw new Error("real_account_required");
    const { data: controls, error: controlsError } = await db.from("trader_execution_controls").select("global_live_enabled,kill_switch").eq("account_id", accountId).single();
    if (controlsError || !controls) throw new Error("execution_controls_missing");
    if (account.mode !== "live" || controls.global_live_enabled !== true || controls.kill_switch !== false) throw new Error("live_trading_not_enabled");
    const { data: connection, error: connectionError } = await db.from("trader_binance_connections").select("status,environment,permission_read,permission_trade,permission_withdraw,permission_internal_transfer,ip_restricted").eq("account_id", accountId).single();
    if (connectionError || !connection) throw new Error("binance_not_connected");
    if (connection.status !== "connected" || connection.environment !== "mainnet" || !connection.permission_read || !connection.permission_trade) throw new Error("binance_trade_permission_required");
    if (connection.permission_withdraw || connection.permission_internal_transfer || connection.ip_restricted !== true) throw new Error("binance_connection_not_safe");
    const { data: trade, error: tradeError } = await db.from("trader_trades").select("id,account_id,bot_id,client_id,pair,status,execution_mode,client_state").eq("account_id", accountId).eq("client_id", tradeId).maybeSingle();
    if (tradeError) throw tradeError;
    if (!trade) throw new Error("trade_not_found");
    if (trade.execution_mode !== "live") throw new Error("trade_not_live");
    if (trade.status !== "Active") throw new Error("trade_not_active");

    lockId = await acquire(db, accountId);
    const creds = await credentials(db, accountId);
    const symbol = String(trade.pair).replace("/", "").toUpperCase();
    const { data: orders, error: ordersError } = await db.from("trader_orders").select("id,exchange_order_id,status,side,kind").eq("trade_id", trade.id).eq("exchange", "binance").in("status", ["OPEN", "PENDING", "NEW", "PARTIALLY_FILLED"]);
    if (ordersError) throw ordersError;
    const now = new Date().toISOString();

    for (const order of orders ?? []) {
      const exchangeOrderId = String(order.exchange_order_id || "").trim();
      if (!exchangeOrderId) {
        const { error } = await db.from("trader_orders").update({ status: "CANCELLED", reserved_quote: 0, cancelled_at: now, updated_at: now }).eq("id", order.id);
        if (error) throw error;
        continue;
      }
      const remote = await signed(db, creds, "GET", "/api/v3/order", { symbol, orderId: exchangeOrderId });
      const remoteStatus = String(remote.status || "").toUpperCase();
      if (remoteStatus === "FILLED") throw new Error("cancel_requires_reconciliation");
      if (remoteStatus === "PARTIALLY_FILLED") {
        await signed(db, creds, "DELETE", "/api/v3/order", { symbol, orderId: exchangeOrderId });
        const { error } = await db.from("trader_orders").update({ status: "CANCELLED", reserved_quote: 0, cancelled_at: now, updated_at: now }).eq("id", order.id);
        if (error) throw error;
        throw new Error("cancel_requires_reconciliation");
      }
      if (remoteStatus === "NEW" || remoteStatus === "PENDING_NEW") {
        const canceled = await signed(db, creds, "DELETE", "/api/v3/order", { symbol, orderId: exchangeOrderId });
        const finalStatus = String(canceled.status || "").toUpperCase();
        if (!["CANCELED", "CANCELLED", "EXPIRED", "REJECTED"].includes(finalStatus)) throw new Error("cancel_order_unconfirmed");
      } else if (!["CANCELED", "CANCELLED", "EXPIRED", "REJECTED"].includes(remoteStatus)) {
        throw new Error(`cancel_order_unexpected_status:${remoteStatus || "unknown"}`);
      }
      const { error } = await db.from("trader_orders").update({ status: "CANCELLED", reserved_quote: 0, cancelled_at: now, updated_at: now }).eq("id", order.id);
      if (error) throw error;
    }

    const clientState = trade.client_state && typeof trade.client_state === "object" && !Array.isArray(trade.client_state) ? trade.client_state as Json : {};
    const { error: updateError } = await db.from("trader_trades").update({
      status: "Cancelled",
      close_reason: "Cancelled · asset retained",
      closed_at: now,
      exit_price: null,
      realized_pnl: null,
      client_state: { ...clientState, cancelledAt: now, cancelMode: "no_sell", assetRetained: true },
      updated_at: now,
    }).eq("id", trade.id).eq("status", "Active");
    if (updateError) throw updateError;

    await db.from("trader_broker_events").insert({
      account_id: accountId,
      bot_id: trade.bot_id,
      trade_id: trade.id,
      mode: "live",
      event_type: "TRADE_CANCELLED_NO_SELL",
      pair: trade.pair,
      payload: { clientTradeId: trade.client_id, assetRetained: true, sellSubmitted: false, cancelledAt: now },
    });
    return json({ ok: true, status: "Cancelled", assetRetained: true, sellSubmitted: false });
  } catch (error) {
    const message = clean(error);
    console.error("trader-live-cancel-control", message);
    const status = message.includes("unauthorized") ? 401 : message.includes("not_active") || message.includes("reconciliation") || message.includes("unconfirmed") ? 409 : 400;
    return json({ error: message }, status);
  } finally {
    if (lockId) await release(db, accountId, lockId);
  }
});
