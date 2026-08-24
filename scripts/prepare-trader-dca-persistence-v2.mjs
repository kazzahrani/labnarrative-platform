import fs from "node:fs";
import path from "node:path";

const traderPath = path.join(process.cwd(), "app/trader/TradingAgent.tsx");
let source = fs.readFileSync(traderPath, "utf8");

if (source.includes("DCA_PERSISTENCE_V2")) {
  console.log("DCA persistence V2 already prepared.");
  process.exit(0);
}

if (!source.includes("useRef")) {
  source = source.replace("import { useEffect, useMemo, useState } from \"react\";", "import { useEffect, useMemo, useRef, useState } from \"react\";");
}

const tradeStateAnchor = '  const [dcaTrades, setDcaTrades] = useState<DcaTrade[]>([]);';
if (!source.includes(tradeStateAnchor)) throw new Error("DCA persistence V2: DCA trade state anchor missing.");
source = source.replace(tradeStateAnchor, tradeStateAnchor + '\n  // DCA_PERSISTENCE_V2 — block initial empty-state writes until browser storage hydration has completed.\n  const dcaStorageHydratedRef = useRef(false);');

const storageReadAnchor = '      const savedBots = localStorage.getItem("labnarrative-dca-bots-v1");\n      const savedDcaTrades = localStorage.getItem("labnarrative-dca-trades-v1");';
if (!source.includes(storageReadAnchor)) throw new Error("DCA persistence V2: browser storage read anchor missing.");
const storageReadReplacement = [
  '      const recoverTraderArray = (primaryKey: string, metaKey: string, kind: "bots" | "trades") => {',
  '        const direct = localStorage.getItem(primaryKey);',
  '        const meta = localStorage.getItem(metaKey);',
  '        const isExpectedArray = (raw: string | null) => {',
  '          if (!raw) return false;',
  '          try {',
  '            const parsed = JSON.parse(raw) as unknown;',
  '            if (!Array.isArray(parsed)) return false;',
  '            if (parsed.length === 0) return true;',
  '            const item = parsed[0] as Record<string, unknown>;',
  '            return kind === "bots"',
  '              ? typeof item?.id === "string" && typeof item?.name === "string" && typeof item?.baseOrder === "number"',
  '              : typeof item?.id === "string" && typeof item?.botId === "string" && typeof item?.entryPrice === "number";',
  '          } catch { return false; }',
  '        };',
  '        const count = (raw: string | null) => { try { const parsed = raw ? JSON.parse(raw) : []; return Array.isArray(parsed) ? parsed.length : -1; } catch { return -1; } };',
  '        // Once V2 has written metadata, an empty primary array is intentional and must stay empty.',
  '        if (meta && isExpectedArray(direct)) return direct;',
  '        if (isExpectedArray(direct) && count(direct) > 0) return direct;',
  '        const candidates: string[] = [];',
  '        const inspectStorage = (storage: Storage) => {',
  '          for (let index = 0; index < storage.length; index += 1) {',
  '            const key = storage.key(index);',
  '            if (!key || key === primaryKey || key === metaKey) continue;',
  '            if (kind === "bots" && !/(dca|trader).*(bot)|bot.*(dca|trader)/i.test(key)) continue;',
  '            if (kind === "trades" && !/(dca|trader).*(trade|deal)|(?:trade|deal).*(dca|trader)/i.test(key)) continue;',
  '            const raw = storage.getItem(key);',
  '            if (isExpectedArray(raw) && count(raw) > 0 && raw) candidates.push(raw);',
  '          }',
  '        };',
  '        inspectStorage(localStorage);',
  '        inspectStorage(sessionStorage);',
  '        candidates.sort((a, b) => count(b) - count(a));',
  '        const recovered = candidates[0] ?? direct;',
  '        if (recovered && count(recovered) > 0) localStorage.setItem(primaryKey, recovered);',
  '        return recovered;',
  '      };',
  '      const savedBots = recoverTraderArray("labnarrative-dca-bots-v1", "labnarrative-dca-bots-v2-meta", "bots");',
  '      const savedDcaTrades = recoverTraderArray("labnarrative-dca-trades-v1", "labnarrative-dca-trades-v2-meta", "trades");',
].join('\n');
source = source.replace(storageReadAnchor, storageReadReplacement);

const marketLoadAnchor = '    const loadMarkets = async () => {';
if (!source.includes(marketLoadAnchor)) throw new Error("DCA persistence V2: hydration completion anchor missing.");
source = source.replace(marketLoadAnchor, '    window.setTimeout(() => { dcaStorageHydratedRef.current = true; }, 0);\n' + marketLoadAnchor);

const botWrite = '  useEffect(() => { localStorage.setItem("labnarrative-dca-bots-v1", JSON.stringify(dcaBots)); }, [dcaBots]);';
if (!source.includes(botWrite)) throw new Error("DCA persistence V2: bot persistence effect missing.");
source = source.replace(botWrite, [
  '  useEffect(() => {',
  '    if (!dcaStorageHydratedRef.current) return;',
  '    const key = "labnarrative-dca-bots-v1";',
  '    const payload = JSON.stringify(dcaBots);',
  '    const previous = localStorage.getItem(key);',
  '    if (previous && previous !== payload) localStorage.setItem("labnarrative-dca-bots-v2-backup", previous);',
  '    localStorage.setItem(key, payload);',
  '    localStorage.setItem("labnarrative-dca-bots-v2-meta", JSON.stringify({ writtenAt: Date.now(), count: dcaBots.length }));',
  '  }, [dcaBots]);',
].join('\n'));

const tradeWrite = '  useEffect(() => { localStorage.setItem("labnarrative-dca-trades-v1", JSON.stringify(dcaTrades)); }, [dcaTrades]);';
if (!source.includes(tradeWrite)) throw new Error("DCA persistence V2: trade persistence effect missing.");
source = source.replace(tradeWrite, [
  '  useEffect(() => {',
  '    if (!dcaStorageHydratedRef.current) return;',
  '    const key = "labnarrative-dca-trades-v1";',
  '    const payload = JSON.stringify(dcaTrades);',
  '    const previous = localStorage.getItem(key);',
  '    if (previous && previous !== payload) localStorage.setItem("labnarrative-dca-trades-v2-backup", previous);',
  '    localStorage.setItem(key, payload);',
  '    localStorage.setItem("labnarrative-dca-trades-v2-meta", JSON.stringify({ writtenAt: Date.now(), count: dcaTrades.length }));',
  '  }, [dcaTrades]);',
].join('\n'));

fs.writeFileSync(traderPath, source);
console.log("Prepared DCA persistence V2: guarded hydration, legacy scan, backups and intentional-empty metadata.");
