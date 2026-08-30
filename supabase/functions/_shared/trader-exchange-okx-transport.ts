import type { Db } from "./trader-exchange.ts";
import { loadExchangeCredentials, providerGatewayRequest } from "./trader-exchange-provider-transport.ts";

function text(value: unknown) { return String(value ?? ""); }
function object(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function base64(bytes: Uint8Array) { let out = ""; for (const b of bytes) out += String.fromCharCode(b); return btoa(out); }
async function hmac(secret: string, message: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)));
}
function retryableOkxReadError(error: unknown) {
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : String(error ?? "");
  return name === "TimeoutError" || /timed out/i.test(message) || /^gateway_5\d\d:/.test(message) || /^okx_50102:/.test(message);
}

export async function okxPrivateRequest(
  db: Db,
  accountId: string,
  method: "GET" | "POST",
  path: string,
  queryValues: Record<string, string | number> = {},
  bodyValue: Record<string, unknown> | null = null,
) {
  const credentials = await loadExchangeCredentials(db, accountId, "okx");
  const apiKey = text(credentials.apiKey);
  const apiSecret = text(credentials.apiSecret);
  const passphrase = text(credentials.passphrase);
  if (!apiKey || !apiSecret || !passphrase) throw new Error("credential_not_found");

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(queryValues)) query.set(key, String(value));
  const queryText = query.toString();
  const requestPath = `${path}${queryText ? `?${queryText}` : ""}`;
  const body = bodyValue ? JSON.stringify(bodyValue) : "";

  const execute = async () => {
    const timestamp = new Date().toISOString();
    const signature = base64(await hmac(apiSecret, `${timestamp}${method}${requestPath}${body}`));
    const response = await providerGatewayRequest(db, {
      upstream: "https://www.okx.com",
      method,
      path,
      query: queryText,
      headers: {
        "OK-ACCESS-KEY": apiKey,
        "OK-ACCESS-SIGN": signature,
        "OK-ACCESS-TIMESTAMP": timestamp,
        "OK-ACCESS-PASSPHRASE": passphrase,
        "content-type": "application/json",
      },
      body: method === "POST" ? body : null,
    });
    const root = object(response.body);
    if (response.status < 200 || response.status >= 300) throw new Error(`okx_http_${response.status}`);
    if (text(root.code) !== "0") throw new Error(`okx_${text(root.code)}:${text(root.msg)}`);
    return root;
  };

  if (method !== "GET") return await execute();
  try {
    return await execute();
  } catch (error) {
    if (!retryableOkxReadError(error)) throw error;
    return await execute();
  }
}

export function requireOkxItemSuccess(value: unknown) {
  const row = object(value);
  const code = text(row.sCode);
  if (code && code !== "0") throw new Error(`okx_${code}:${text(row.sMsg) || "request_failed"}`);
  return row;
}
