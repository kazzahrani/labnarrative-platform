import type { Db } from "./trader-exchange.ts";
import { loadExchangeCredentials, providerGatewayRequest } from "./trader-exchange-provider-transport.ts";

function text(value: unknown) { return String(value ?? ""); }
function object(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function base64(bytes: Uint8Array) { let out = ""; for (const b of bytes) out += String.fromCharCode(b); return btoa(out); }
async function hmac(secret: string, message: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)));
}
function retryableKucoinReadError(error: unknown) {
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : String(error ?? "");
  return name === "TimeoutError" || /timed out/i.test(message) || /^gateway_5\d\d:/.test(message) || /^kucoin_400002:/.test(message);
}

export async function kucoinPrivateRequest(
  db: Db,
  accountId: string,
  method: "GET" | "POST" | "DELETE",
  path: string,
  queryValues: Record<string, string | number> = {},
  bodyValue: Record<string, unknown> | null = null,
) {
  const credentials = await loadExchangeCredentials(db, accountId, "kucoin");
  const apiKey = text(credentials.apiKey);
  const apiSecret = text(credentials.apiSecret);
  const passphrase = text(credentials.passphrase);
  const apiVersion = text(credentials.apiVersion || "3");
  if (!apiKey || !apiSecret || !passphrase) throw new Error("credential_not_found");

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(queryValues)) query.set(key, String(value));
  const queryText = query.toString();
  const endpoint = `${path}${queryText ? `?${queryText}` : ""}`;
  const body = bodyValue ? JSON.stringify(bodyValue) : "";
  const encryptedPassphrase = base64(await hmac(apiSecret, passphrase));

  const execute = async () => {
    const timestamp = Date.now().toString();
    const signature = base64(await hmac(apiSecret, `${timestamp}${method}${endpoint}${body}`));
    const response = await providerGatewayRequest(db, {
      upstream: "https://api.kucoin.com",
      method,
      path,
      query: queryText,
      headers: {
        "KC-API-KEY": apiKey,
        "KC-API-SIGN": signature,
        "KC-API-TIMESTAMP": timestamp,
        "KC-API-PASSPHRASE": encryptedPassphrase,
        "KC-API-KEY-VERSION": apiVersion,
        "content-type": "application/json",
      },
      body: method === "POST" ? body : null,
    });
    const root = object(response.body);
    if (response.status < 200 || response.status >= 300) throw new Error(`kucoin_http_${response.status}`);
    if (text(root.code) !== "200000") throw new Error(`kucoin_${text(root.code)}:${text(root.msg) || "request_failed"}`);
    return root;
  };

  if (method !== "GET") return await execute();
  try {
    return await execute();
  } catch (error) {
    if (!retryableKucoinReadError(error)) throw error;
    return await execute();
  }
}
