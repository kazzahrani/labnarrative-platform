import fs from "node:fs";
import path from "node:path";

const traderPath = path.join(process.cwd(), "app/trader/TradingAgent.tsx");
let source = fs.readFileSync(traderPath, "utf8");

if (!source.includes("TRADER_SERVER_ENGINE_V1")) throw new Error("Supabase trader API: server engine cutover must run first.");
if (source.includes("TRADER_SUPABASE_EDGE_API_V3")) {
  console.log("Supabase trader Edge API V3 already prepared.");
  process.exit(0);
}

const commandAnchor = "  const runTraderServerCommand = async (payload: Record<string, unknown>) => {";
if (!source.includes(commandAnchor)) throw new Error("Supabase trader API: command bridge anchor missing.");

const helper = String.raw`  // TRADER_SUPABASE_EDGE_API_V3 — recovery-safe storage-first migration; Supabase owns execution after verified cutover.
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
  const traderLooksLikeMigrationItem = (kind: "bots" | "trades", item: unknown) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    const row = item as Record<string, unknown>;
    if (kind === "bots") {
      return typeof row.id === "string" && typeof row.name === "string" && typeof row.baseOrder === "number" && typeof row.safetyOrder === "number";
    }
    return typeof row.id === "string" && typeof row.botId === "string" && typeof row.entryPrice === "number" && typeof row.invested === "number";
  };
  const traderBestMigrationArray = <T extends { id?: string }>(kind: "bots" | "trades", current: T[]) => {
    const candidates: Array<{ source: string; items: T[] }> = [{ source: "react-memory", items: Array.isArray(current) ? current : [] }];
    const primaryKeys = kind === "bots"
      ? ["labnarrative-dca-bots-v1", "labnarrative-dca-bots-v2-backup"]
      : ["labnarrative-dca-trades-v1", "labnarrative-dca-trades-v2-backup"];
    for (const key of primaryKeys) {
      candidates.push({ source: "local:" + key, items: traderStoredArray(window.localStorage, key) as T[] });
      candidates.push({ source: "session:" + key, items: traderStoredArray(window.sessionStorage, key) as T[] });
    }
    const scan = (storage: Storage, prefix: string) => {
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (!key || primaryKeys.includes(key)) continue;
        const matches = kind === "bots"
          ? /(?:dca|trader).*(?:bot)|(?:bot).*(?:dca|trader)/i.test(key)
          : /(?:dca|trader).*(?:trade|deal)|(?:trade|deal).*(?:dca|trader)/i.test(key);
        if (!matches) continue;
        candidates.push({ source: prefix + ":" + key, items: traderStoredArray(storage, key) as T[] });
      }
    };
    scan(window.localStorage, "local-scan");
    scan(window.sessionStorage, "session-scan");
    const valid = candidates.filter((candidate) => candidate.items.length > 0 && candidate.items.every((item) => traderLooksLikeMigrationItem(kind, item)));
    valid.sort((a, b) => b.items.length - a.items.length);
    return valid[0] ?? { source: "none", items: [] as T[] };
  };
  const traderBrowserBootstrapSnapshot = () => {
    const bots = traderBestMigrationArray<DcaBot>("bots", serverDcaBotsRef.current);
    const trades = traderBestMigrationArray<DcaTrade>("trades", serverDcaTradesRef.current);
    const historyKeys = [
      "labnarrative-dca-bots-v2-meta", "labnarrative-dca-trades-v2-meta",
      "labnarrative-dca-bots-v2-backup", "labnarrative-dca-trades-v2-backup",
    ];
    const hasPersistenceHistory = historyKeys.some((key) => window.localStorage.getItem(key) != null || window.sessionStorage.getItem(key) != null);
    return { bots: bots.items, trades: trades.items, botSource: bots.source, tradeSource: trades.source, hasPersistenceHistory };
  };

`;
source = source.replace(commandAnchor, helper + commandAnchor);

source = source.replace(
  '      const response = await fetch("/api/trader/server/command", { method: "POST", headers: { "content-type": "application/json" }, cache: "no-store", body: JSON.stringify(payload) });',
  '      const response = await traderEdgeRequest(payload);'
);

source = source.replace(
  '        const response = await fetch("/api/trader/server/state", { method: "POST", headers: { "content-type": "application/json" }, cache: "no-store", body: JSON.stringify({ bots: serverDcaBotsRef.current, trades: serverDcaTradesRef.current }) });',
  `        const migration = traderBrowserBootstrapSnapshot();
        void fetch("/api/trader/audit", { method: "POST", headers: { "content-type": "application/json" }, keepalive: true, body: JSON.stringify({ event: "durable_migration_candidate", at: new Date().toISOString(), botCount: migration.bots.length, tradeCount: migration.trades.length, botSource: migration.botSource, tradeSource: migration.tradeSource, hasPersistenceHistory: migration.hasPersistenceHistory }) }).catch(() => undefined);
        if (!migration.bots.length && !migration.trades.length && migration.hasPersistenceHistory) {
          setNotice("Durable migration paused: saved DCA history exists but no verified recovery payload was found. Local state was not overwritten.");
          return;
        }
        const response = await traderEdgeRequest({ action: "bootstrap", bots: migration.bots, trades: migration.trades, confirmedEmpty: !migration.hasPersistenceHistory && migration.bots.length === 0 && migration.trades.length === 0 });`
);

source = source.replace(
  '        const snapshot = await response.json();\n        if (!cancelled && response.ok) applyTraderServerSnapshot(snapshot);\n        else if (!cancelled) setNotice(snapshot?.error ?? "Unable to initialize durable trading engine.");',
  `        const snapshot = await response.json();
        if (!cancelled && response.ok) {
          const durableBots = Array.isArray(snapshot?.bots) ? snapshot.bots.length : 0;
          const durableTrades = Array.isArray(snapshot?.trades) ? snapshot.trades.length : 0;
          if (migration.bots.length > durableBots || migration.trades.length > durableTrades) {
            setNotice("Durable migration verification failed: Supabase returned fewer DCA records than the browser recovery payload. Local state was not overwritten.");
            return;
          }
          applyTraderServerSnapshot(snapshot);
        } else if (!cancelled) setNotice(snapshot?.error ?? "Unable to initialize durable trading engine.");`
);

source = source.replace(
  '        const response = await fetch("/api/trader/server/state", { cache: "no-store" });',
  '        const response = await traderEdgeRequest({ action: "state" });'
);

for (const token of [
  "TRADER_SUPABASE_EDGE_API_V3",
  "trader-paper-api",
  '"x-trader-session": traderSessionToken()',
  "traderBrowserBootstrapSnapshot",
  "traderLooksLikeMigrationItem",
  "labnarrative-dca-bots-v2-backup",
  "labnarrative-dca-trades-v2-backup",
  "hasPersistenceHistory",
  'event: "durable_migration_candidate"',
  "Durable migration verification failed",
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
console.log("Routed durable trader UI through recovery-safe Supabase Edge API migration V3.");
