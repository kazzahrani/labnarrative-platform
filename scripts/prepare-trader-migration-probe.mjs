import fs from "node:fs";
import path from "node:path";

const traderPath = path.join(process.cwd(), "app/trader/TradingAgent.tsx");
let source = fs.readFileSync(traderPath, "utf8");

if (source.includes("TRADER_MIGRATION_PROBE_V1")) {
  console.log("Trader migration probe V1 already prepared.");
  process.exit(0);
}
if (!source.includes("TRADER_SUPABASE_EDGE_API_V3")) throw new Error("Migration probe requires Supabase Edge API V3.");
if (!source.includes("traderSessionToken")) throw new Error("Migration probe session helper missing.");

const returnAnchor = '  return <main className={styles.appShell}>';
const returnIndex = source.lastIndexOf(returnAnchor);
if (returnIndex < 0) throw new Error("Migration probe component return anchor missing.");

const effect = String.raw`
  // TRADER_MIGRATION_PROBE_V1 — temporary, recovery-only. Captures only LabNarrative DCA bot/trade persistence keys.
  useEffect(() => {
    let cancelled = false;
    const parseStored = (storage: Storage, key: string) => {
      const raw = storage.getItem(key);
      if (raw == null) return { present: false, length: 0, value: null as unknown };
      try { return { present: true, length: raw.length, value: JSON.parse(raw) as unknown }; }
      catch { return { present: true, length: raw.length, value: { parseError: true, prefix: raw.slice(0, 1000) } as unknown }; }
    };
    const capture = async (phase: string) => {
      if (cancelled) return;
      const keyNames = new Set<string>();
      for (let i = 0; i < window.localStorage.length; i += 1) {
        const key = window.localStorage.key(i);
        if (key && /^labnarrative-dca-(?:bots|trades)/i.test(key)) keyNames.add(key);
      }
      for (let i = 0; i < window.sessionStorage.length; i += 1) {
        const key = window.sessionStorage.key(i);
        if (key && /^labnarrative-dca-(?:bots|trades)/i.test(key)) keyNames.add(key);
      }
      for (const key of [
        "labnarrative-dca-bots-v1",
        "labnarrative-dca-trades-v1",
        "labnarrative-dca-bots-v2-backup",
        "labnarrative-dca-trades-v2-backup",
        "labnarrative-dca-bots-v2-meta",
        "labnarrative-dca-trades-v2-meta",
      ]) keyNames.add(key);
      const storage: Record<string, unknown> = {};
      for (const key of [...keyNames].sort()) {
        storage[key] = {
          local: parseStored(window.localStorage, key),
          session: parseStored(window.sessionStorage, key),
        };
      }
      const payload = {
        event: "trader_migration_capsule",
        phase,
        at: new Date().toISOString(),
        href: window.location.href,
        storage,
        memory: {
          bots: Array.isArray(serverDcaBotsRef.current) ? serverDcaBotsRef.current : [],
          trades: Array.isArray(serverDcaTradesRef.current) ? serverDcaTradesRef.current : [],
        },
      };
      try {
        await fetch("https://umhkpflyzlifiufvejwr.supabase.co/functions/v1/trader-migration-probe", {
          method: "POST",
          headers: { "content-type": "application/json", "x-trader-session": traderSessionToken() },
          cache: "no-store",
          keepalive: true,
          body: JSON.stringify(payload),
        });
      } catch { /* recovery diagnostics must never affect trading UI */ }
    };
    const first = window.setTimeout(() => { void capture("mount+1.5s"); }, 1500);
    const second = window.setTimeout(() => { void capture("mount+6s"); }, 6000);
    return () => { cancelled = true; window.clearTimeout(first); window.clearTimeout(second); };
  }, []);

`;
source = source.slice(0, returnIndex) + effect + source.slice(returnIndex);

for (const token of [
  "TRADER_MIGRATION_PROBE_V1",
  "trader_migration_capsule",
  "trader-migration-probe",
  "labnarrative-dca-bots-v2-backup",
  "labnarrative-dca-trades-v2-backup",
  "serverDcaBotsRef.current",
  "serverDcaTradesRef.current",
]) {
  if (!source.includes(token)) throw new Error(`Migration probe guard missing: ${token}`);
}

fs.writeFileSync(traderPath, source);
console.log("Prepared deterministic browser DCA migration recovery capsule.");
