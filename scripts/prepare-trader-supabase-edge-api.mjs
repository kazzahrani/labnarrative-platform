import fs from "node:fs";
import path from "node:path";

const traderPath = path.join(process.cwd(), "app/trader/TradingAgent.tsx");
let source = fs.readFileSync(traderPath, "utf8");

if (!source.includes("TRADER_SERVER_ENGINE_V1")) throw new Error("Supabase trader API: server engine cutover must run first.");
if (source.includes("TRADER_SUPABASE_EDGE_API_V2")) {
  console.log("Supabase trader Edge API V2 already prepared.");
  process.exit(0);
}

const commandAnchor = "  const runTraderServerCommand = async (payload: Record<string, unknown>) => {";
if (!source.includes(commandAnchor)) throw new Error("Supabase trader API: command bridge anchor missing.");

const helper = String.raw`  // TRADER_SUPABASE_EDGE_API_V2 — Supabase owns trading state/API/execution; Vercel is UI only.
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
  const traderStoredArray = (storage: Storage, key: string) => {
    try {
      const raw = storage.getItem(key);
      if (!raw) return [] as unknown[];
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? parsed : [] as unknown[];
    } catch { return [] as unknown[]; }
  };
  const traderBestMigrationArray = <T extends { id?: string }>(kind: "bots" | "trades", current: T[]) => {
    const candidates: T[][] = [Array.isArray(current) ? current : []];
    const primaryKeys = kind === "bots"
      ? ["labnarrative-dca-bots-v1", "labnarrative-dca-bots-v2-backup"]
      : ["labnarrative-dca-trades-v1", "labnarrative-dca-trades-v2-backup"];
    for (const key of primaryKeys) {
      candidates.push(traderStoredArray(window.localStorage, key) as T[]);
      candidates.push(traderStoredArray(window.sessionStorage, key) as T[]);
    }
    const scan = (storage: Storage) => {
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (!key) continue;
        const matches = kind === "bots"
          ? /(?:dca|trader).*(?:bot)|(?:bot).*(?:dca|trader)/i.test(key)
          : /(?:dca|trader).*(?:trade|deal)|(?:trade|deal).*(?:dca|trader)/i.test(key);
        if (!matches) continue;
        candidates.push(traderStoredArray(storage, key) as T[]);
      }
    };
    scan(window.localStorage);
    scan(window.sessionStorage);
    const valid = candidates.filter((items) => items.some((item) => item && typeof item === "object" && typeof item.id === "string"));
    valid.sort((a, b) => b.length - a.length);
    return valid[0] ?? [];
  };
  const traderBrowserBootstrapSnapshot = () => ({
    bots: traderBestMigrationArray<DcaBot>("bots", serverDcaBotsRef.current),
    trades: traderBestMigrationArray<DcaTrade>("trades", serverDcaTradesRef.current),
  });

`;
source = source.replace(commandAnchor, helper + commandAnchor);

source = source.replace(
  '      const response = await fetch("/api/trader/server/command", { method: "POST", headers: { "content-type": "application/json" }, cache: "no-store", body: JSON.stringify(payload) });',
  '      const response = await traderEdgeRequest(payload);'
);

source = source.replace(
  '        const response = await fetch("/api/trader/server/state", { method: "POST", headers: { "content-type": "application/json" }, cache: "no-store", body: JSON.stringify({ bots: serverDcaBotsRef.current, trades: serverDcaTradesRef.current }) });',
  '        const migration = traderBrowserBootstrapSnapshot();\n        if (!migration.bots.length && !migration.trades.length) { setNotice("Waiting for saved DCA state before durable migration…"); return; }\n        const response = await traderEdgeRequest({ action: "bootstrap", bots: migration.bots, trades: migration.trades });'
);

source = source.replace(
  '        const response = await fetch("/api/trader/server/state", { cache: "no-store" });',
  '        const response = await traderEdgeRequest({ action: "state" });'
);

for (const token of [
  "TRADER_SUPABASE_EDGE_API_V2",
  "trader-paper-api",
  '"x-trader-session": traderSessionToken()',
  "traderBrowserBootstrapSnapshot",
  "labnarrative-dca-bots-v2-backup",
  "labnarrative-dca-trades-v2-backup",
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
console.log("Routed durable trader UI through Supabase Edge API with guarded local-state migration.");
