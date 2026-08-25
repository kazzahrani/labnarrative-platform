import fs from "node:fs";
import path from "node:path";

const traderPath = path.join(process.cwd(), "app/trader/TradingAgent.tsx");
let source = fs.readFileSync(traderPath, "utf8");

if (!source.includes("TRADER_SERVER_ENGINE_V1")) throw new Error("Supabase trader API: server engine cutover must run first.");
if (source.includes("TRADER_SUPABASE_EDGE_API_V1")) {
  console.log("Supabase trader Edge API V1 already prepared.");
  process.exit(0);
}

const commandAnchor = "  const runTraderServerCommand = async (payload: Record<string, unknown>) => {";
if (!source.includes(commandAnchor)) throw new Error("Supabase trader API: command bridge anchor missing.");

const helper = String.raw`  // TRADER_SUPABASE_EDGE_API_V1 — Supabase owns trading state/API/execution; Vercel is UI only.
  const traderEdgeUrl = "https://umhkpflyzlifiufvejwr.supabase.co/functions/v1/trader-paper-api";
  const traderSessionToken = () => {
    const key = "ln_trader_edge_session_v1";
    let token = window.localStorage.getItem(key);
    if (token && token.length >= 32) return token;
    const bytes = new Uint8Array(32);
    window.crypto.getRandomValues(bytes);
    token = Array.from(bytes).map((value) => value.toString(16).padStart(2, "0")).join("");
    window.localStorage.setItem(key, token);
    return token;
  };
  const traderEdgeRequest = (payload: Record<string, unknown>) => fetch(traderEdgeUrl, {
    method: "POST",
    headers: { "content-type": "application/json", "x-trader-session": traderSessionToken() },
    cache: "no-store",
    body: JSON.stringify(payload),
  });

`;
source = source.replace(commandAnchor, helper + commandAnchor);

source = source.replace(
  '      const response = await fetch("/api/trader/server/command", { method: "POST", headers: { "content-type": "application/json" }, cache: "no-store", body: JSON.stringify(payload) });',
  '      const response = await traderEdgeRequest(payload);'
);

source = source.replace(
  '        const response = await fetch("/api/trader/server/state", { method: "POST", headers: { "content-type": "application/json" }, cache: "no-store", body: JSON.stringify({ bots: serverDcaBotsRef.current, trades: serverDcaTradesRef.current }) });',
  '        const response = await traderEdgeRequest({ action: "bootstrap", bots: serverDcaBotsRef.current, trades: serverDcaTradesRef.current });'
);

source = source.replace(
  '        const response = await fetch("/api/trader/server/state", { cache: "no-store" });',
  '        const response = await traderEdgeRequest({ action: "state" });'
);

for (const token of [
  "TRADER_SUPABASE_EDGE_API_V1",
  "trader-paper-api",
  '"x-trader-session": traderSessionToken()',
  'action: "bootstrap"',
  'action: "state"',
  "const response = await traderEdgeRequest(payload);",
]) {
  if (!source.includes(token)) throw new Error(`Supabase trader API guard missing: ${token}`);
}
if (source.includes('/api/trader/server/state') || source.includes('/api/trader/server/command')) {
  throw new Error("Supabase trader API: obsolete Vercel trader API calls remain in TradingAgent.");
}

fs.writeFileSync(traderPath, source);
console.log("Routed durable trader UI directly through the Supabase Edge API.");
