import type { Db, LaunchExchangeProvider } from "./trader-exchange.ts";
import { bybitPrivateRequest } from "./trader-exchange-provider-transport.ts";
import { okxPrivateRequest } from "./trader-exchange-okx-transport.ts";
import { kucoinPrivateRequest } from "./trader-exchange-kucoin-transport.ts";

export type TransferDirection = "deposit" | "withdrawal";
export type NormalizedTransferMovement = {
  provider: LaunchExchangeProvider;
  direction: TransferDirection;
  asset: string;
  amount: number;
  fee: number;
  feeAsset: string | null;
  sourceDebit: number;
  txId: string | null;
  network: string | null;
  externalId: string;
  occurredAt: string;
  completedAt: string | null;
  eventKey: string;
  metadata: Record<string, unknown>;
};

const GATEWAY_ORIGIN = "https://trader-gateway.labnarrative.com";
let cachedGatewaySigningKey: CryptoKey | null = null;

function text(value: unknown) { return String(value ?? "").trim(); }
function n(value: unknown, fallback = 0) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; }
function object(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function array(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function cleanAsset(value: unknown) { return text(value).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 30); }
function cleanNetwork(value: unknown) { const v = text(value); return v ? v.slice(0, 80) : null; }
function nonceHex() { const bytes = crypto.getRandomValues(new Uint8Array(24)); return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join(""); }
function base64(bytes: Uint8Array) { let out = ""; for (const b of bytes) out += String.fromCharCode(b); return btoa(out); }
function pemBytes(pem: string) {
  const normalized = pem.replace(/\\n/g, "\n");
  const b64 = normalized.replace(/-----BEGIN [^-]+-----/g, "").replace(/-----END [^-]+-----/g, "").replace(/\s+/g, "");
  const raw = atob(b64);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}
async function hmacHex(secret: string, message: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)));
  return Array.from(sig).map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function sha256(value: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function parseTime(value: unknown, fallbackMs = Date.now()) {
  const raw = text(value);
  if (!raw) return fallbackMs;
  if (/^\d{10,16}$/.test(raw)) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) return raw.length <= 10 ? parsed * 1000 : parsed;
  }
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw) ? `${raw.replace(" ", "T")}Z` : raw;
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : fallbackMs;
}
function iso(ms: number) { return new Date(ms).toISOString(); }
function withinWindow(ms: number, startMs: number, endMs: number) { return ms >= startMs && ms <= endMs + 60_000; }

async function eventKey(provider: LaunchExchangeProvider, direction: TransferDirection, externalId: string, fallback: string) {
  const stable = externalId || await sha256(fallback);
  return `${provider}:${direction}:${stable}`;
}

async function gatewaySigningKey(db: Db) {
  if (cachedGatewaySigningKey) return cachedGatewaySigningKey;
  const { data, error } = await db.rpc("trader_gateway_read_signing_private_key");
  if (error || !data) throw new Error("gateway_signing_key_not_configured");
  cachedGatewaySigningKey = await crypto.subtle.importKey("pkcs8", pemBytes(String(data)), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  return cachedGatewaySigningKey;
}

async function binanceGatewayRaw(db: Db, payload: Record<string, unknown>) {
  const { data, error } = await db.from("trader_gateway_config").select("base_url,status").eq("name", "binance").single();
  if (error || !data || data.status !== "ready" || !data.base_url) throw new Error("gateway_not_ready");
  const origin = new URL(String(data.base_url)).origin;
  if (origin !== GATEWAY_ORIGIN) throw new Error("gateway_origin_not_allowed");
  const raw = JSON.stringify(payload);
  const timestamp = Date.now();
  const nonce = nonceHex();
  const key = await gatewaySigningKey(db);
  const signature = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(`${timestamp}\n${nonce}\n${raw}`)));
  const response = await fetch(`${origin}/relay`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-ln-timestamp": String(timestamp),
      "x-ln-nonce": nonce,
      "x-ln-signature": base64(signature),
    },
    body: raw,
    signal: AbortSignal.timeout(12000),
  });
  const envelope = object(await response.json().catch(() => ({})));
  if (!response.ok) throw new Error(`gateway_${response.status}:${text(envelope.error) || "relay_failed"}`);
  const upstreamStatus = n(envelope.upstreamStatus);
  const upstreamBody = text(envelope.upstreamBody);
  let parsed: unknown = null;
  try { parsed = upstreamBody ? JSON.parse(upstreamBody) : null; } catch { throw new Error("binance_invalid_json"); }
  if (upstreamStatus < 200 || upstreamStatus >= 300) {
    const root = object(parsed);
    throw new Error(`binance_${text(root.code || upstreamStatus)}:${text(root.msg) || "request_failed"}`);
  }
  return parsed;
}

async function binanceCredentials(db: Db, accountId: string) {
  const { data, error } = await db.rpc("trader_binance_read_secret", { p_account_id: accountId });
  if (error || !data) throw new Error("credential_not_found");
  let parsed: Record<string, unknown> = {};
  try { parsed = object(JSON.parse(String(data))); } catch { throw new Error("credential_not_found"); }
  const apiKey = text(parsed.apiKey), apiSecret = text(parsed.apiSecret);
  if (!apiKey || !apiSecret) throw new Error("credential_not_found");
  return { apiKey, apiSecret };
}

async function binanceSignedGet(db: Db, accountId: string, path: string, params: Record<string, string | number> = {}) {
  const creds = await binanceCredentials(db, accountId);
  const time = object(await binanceGatewayRaw(db, { requestId: crypto.randomUUID(), method: "GET", path: "/api/v3/time", query: "" }));
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) query.set(key, String(value));
  query.set("timestamp", String(n(time.serverTime)));
  query.set("recvWindow", "5000");
  query.set("signature", await hmacHex(creds.apiSecret, query.toString()));
  return await binanceGatewayRaw(db, { requestId: crypto.randomUUID(), method: "GET", path, query: query.toString(), apiKey: creds.apiKey });
}

async function binanceHistory(db: Db, accountId: string, startMs: number, endMs: number) {
  const movements: NormalizedTransferMovement[] = [];
  for (const direction of ["deposit", "withdrawal"] as const) {
    const path = direction === "deposit" ? "/sapi/v1/capital/deposit/hisrec" : "/sapi/v1/capital/withdraw/history";
    for (let offset = 0; offset < 5000; offset += 1000) {
      const rawRows = await binanceSignedGet(db, accountId, path, { startTime: startMs, endTime: endMs, offset, limit: 1000 });
      const rows = array(rawRows);
      for (const value of rows) {
        const row = object(value);
        const successful = direction === "deposit" ? n(row.status) === 1 : n(row.status) === 6;
        if (!successful) continue;
        const asset = cleanAsset(row.coin);
        const amount = Math.max(0, n(row.amount));
        const fee = direction === "withdrawal" ? Math.max(0, n(row.transactionFee)) : 0;
        const occurredMs = parseTime(direction === "deposit" ? (row.completeTime || row.insertTime) : (row.completeTime || row.applyTime));
        if (!asset || !(amount > 0) || !withinWindow(occurredMs, startMs, endMs)) continue;
        const txId = text(row.txId) || null;
        const externalId = text(row.id) || txId || "";
        const network = cleanNetwork(row.network);
        const key = await eventKey("binance", direction, externalId, `${asset}|${amount}|${fee}|${occurredMs}|${txId || ""}|${network || ""}`);
        movements.push({
          provider: "binance", direction, asset, amount, fee, feeAsset: fee > 0 ? asset : null,
          sourceDebit: direction === "withdrawal" ? amount + fee : amount,
          txId, network, externalId: externalId || key.split(":").at(-1)!, occurredAt: iso(occurredMs), completedAt: iso(occurredMs), eventKey: key,
          metadata: { status: row.status, transferType: row.transferType ?? null, address: text(row.address).slice(0, 160) || null },
        });
      }
      if (rows.length < 1000) break;
    }
  }
  return movements;
}

async function bybitRows(db: Db, accountId: string, path: string, params: Record<string, string | number>) {
  const rows: Record<string, unknown>[] = [];
  let cursor = "";
  for (let page = 0; page < 10; page++) {
    const root = await bybitPrivateRequest(db, accountId, "GET", path, { ...params, limit: 50, ...(cursor ? { cursor } : {}) });
    const result = object(root.result);
    rows.push(...array(result.rows).map(object));
    const next = text(result.nextPageCursor);
    if (!next || next === cursor) break;
    cursor = next;
  }
  return rows;
}

async function bybitHistory(db: Db, accountId: string, startMs: number, endMs: number) {
  const movements: NormalizedTransferMovement[] = [];
  const deposits = await bybitRows(db, accountId, "/v5/asset/deposit/query-record", { startTime: startMs, endTime: endMs });
  const withdrawals = await bybitRows(db, accountId, "/v5/asset/withdraw/query-record", { startTime: startMs, endTime: endMs, withdrawType: 2 });
  for (const [direction, rows] of [["deposit", deposits], ["withdrawal", withdrawals]] as const) {
    for (const row of rows) {
      const status = direction === "deposit" ? n(row.status) : text(row.status).toLowerCase();
      const successful = direction === "deposit" ? [3, 70012, 10012].includes(status as number) : status === "success";
      if (!successful) continue;
      const asset = cleanAsset(row.coin), amount = Math.max(0, n(row.amount));
      const fee = direction === "withdrawal" ? Math.max(0, n(row.withdrawFee)) : Math.max(0, n(row.depositFee));
      const occurredMs = parseTime(direction === "deposit" ? row.successAt : (row.updateTime || row.createTime));
      if (!asset || !(amount > 0) || !withinWindow(occurredMs, startMs, endMs)) continue;
      const txId = text(row.txID) || null;
      const externalId = text(direction === "deposit" ? row.id : row.withdrawId) || txId || "";
      const network = cleanNetwork(row.chain);
      const key = await eventKey("bybit", direction, externalId, `${asset}|${amount}|${fee}|${occurredMs}|${txId || ""}|${network || ""}`);
      movements.push({
        provider: "bybit", direction, asset, amount, fee, feeAsset: fee > 0 ? asset : null,
        sourceDebit: direction === "withdrawal" ? amount + fee : amount,
        txId, network, externalId: externalId || key.split(":").at(-1)!, occurredAt: iso(occurredMs), completedAt: iso(occurredMs), eventKey: key,
        metadata: { status: row.status, withdrawType: row.withdrawType ?? null, depositType: row.depositType ?? null, address: text(row.toAddress).slice(0, 160) || null },
      });
    }
  }
  return movements;
}

async function okxPaged(db: Db, accountId: string, path: string, startMs: number) {
  const rows: Record<string, unknown>[] = [];
  let after = "";
  for (let page = 0; page < 10; page++) {
    const root = await okxPrivateRequest(db, accountId, "GET", path, { limit: 100, ...(after ? { after } : {}) });
    const pageRows = array(root.data).map(object);
    rows.push(...pageRows);
    if (!pageRows.length) break;
    const times = pageRows.map((row) => n(row.ts)).filter((value) => value > 0);
    const earliest = times.length ? Math.min(...times) : 0;
    if (!earliest || earliest <= startMs || pageRows.length < 100) break;
    after = String(earliest - 1);
  }
  return rows;
}

async function okxHistory(db: Db, accountId: string, startMs: number, endMs: number) {
  const movements: NormalizedTransferMovement[] = [];
  const deposits = await okxPaged(db, accountId, "/api/v5/asset/deposit-history", startMs);
  const withdrawals = await okxPaged(db, accountId, "/api/v5/asset/withdrawal-history", startMs);
  for (const [direction, rows] of [["deposit", deposits], ["withdrawal", withdrawals]] as const) {
    for (const row of rows) {
      if (text(row.state) !== "2") continue;
      const asset = cleanAsset(row.ccy), amount = Math.max(0, n(row.amt));
      const fee = direction === "withdrawal" ? Math.max(0, n(row.fee)) : 0;
      const occurredMs = parseTime(row.ts);
      if (!asset || !(amount > 0) || !withinWindow(occurredMs, startMs, endMs)) continue;
      const txId = text(row.txId) || null;
      const externalId = text(direction === "deposit" ? row.depId : row.wdId) || txId || "";
      const network = cleanNetwork(row.chain);
      const feeAsset = direction === "withdrawal" && fee > 0 ? (cleanAsset(row.feeCcy) || asset) : null;
      const key = await eventKey("okx", direction, externalId, `${asset}|${amount}|${fee}|${occurredMs}|${txId || ""}|${network || ""}`);
      movements.push({
        provider: "okx", direction, asset, amount, fee, feeAsset,
        sourceDebit: direction === "withdrawal" ? amount + (feeAsset === asset ? fee : 0) : amount,
        txId, network, externalId: externalId || key.split(":").at(-1)!, occurredAt: iso(occurredMs), completedAt: iso(occurredMs), eventKey: key,
        metadata: { status: row.state, fromWdId: text(row.fromWdId) || null, address: text(row.to).slice(0, 160) || null },
      });
    }
  }
  return movements;
}

async function kucoinPaged(db: Db, accountId: string, path: string, startMs: number, endMs: number) {
  const rows: Record<string, unknown>[] = [];
  for (let page = 1; page <= 10; page++) {
    const root = await kucoinPrivateRequest(db, accountId, "GET", path, { status: "SUCCESS", startAt: startMs, endAt: endMs, currentPage: page, pageSize: 50 });
    const data = object(root.data);
    const pageRows = array(data.items).map(object);
    rows.push(...pageRows);
    const totalPage = Math.max(1, n(data.totalPage, 1));
    if (page >= totalPage || pageRows.length < 50) break;
  }
  return rows;
}

async function kucoinHistory(db: Db, accountId: string, startMs: number, endMs: number) {
  const movements: NormalizedTransferMovement[] = [];
  const deposits = await kucoinPaged(db, accountId, "/api/v1/deposits", startMs, endMs);
  const withdrawals = await kucoinPaged(db, accountId, "/api/v1/withdrawals", startMs, endMs);
  for (const [direction, rows] of [["deposit", deposits], ["withdrawal", withdrawals]] as const) {
    for (const row of rows) {
      if (text(row.status).toUpperCase() !== "SUCCESS") continue;
      const asset = cleanAsset(row.currency), amount = Math.max(0, n(row.amount));
      const fee = direction === "withdrawal" ? Math.max(0, n(row.fee)) : Math.max(0, n(row.fee));
      const occurredMs = parseTime(row.updatedAt || row.createdAt);
      if (!asset || !(amount > 0) || !withinWindow(occurredMs, startMs, endMs)) continue;
      const txId = text(row.walletTxId) || null;
      const externalId = text(row.id) || txId || "";
      const network = cleanNetwork(row.chain);
      const key = await eventKey("kucoin", direction, externalId, `${asset}|${amount}|${fee}|${occurredMs}|${txId || ""}|${network || ""}|${text(row.address)}`);
      movements.push({
        provider: "kucoin", direction, asset, amount, fee, feeAsset: fee > 0 ? asset : null,
        sourceDebit: direction === "withdrawal" ? amount + fee : amount,
        txId, network, externalId: externalId || key.split(":").at(-1)!, occurredAt: iso(occurredMs), completedAt: iso(occurredMs), eventKey: key,
        metadata: { status: row.status, isInner: row.isInner === true, address: text(row.address).slice(0, 160) || null },
      });
    }
  }
  return movements;
}

export async function fetchExchangeTransferHistory(
  db: Db,
  accountId: string,
  provider: LaunchExchangeProvider,
  startMs: number,
  endMs: number,
): Promise<NormalizedTransferMovement[]> {
  if (!(startMs > 0) || !(endMs > startMs)) throw new Error("invalid_transfer_history_window");
  if (provider === "binance") return await binanceHistory(db, accountId, startMs, endMs);
  if (provider === "bybit") return await bybitHistory(db, accountId, startMs, endMs);
  if (provider === "okx") return await okxHistory(db, accountId, startMs, endMs);
  return await kucoinHistory(db, accountId, startMs, endMs);
}
