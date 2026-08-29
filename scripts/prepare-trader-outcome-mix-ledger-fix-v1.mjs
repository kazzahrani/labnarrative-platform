import fs from "node:fs";
import path from "node:path";

const target = path.join(process.cwd(), "app", "trader", "AutomationBotInsightPies.tsx");
if (!fs.existsSync(target)) throw new Error(`Outcome Mix component not found: ${target}`);

let source = fs.readFileSync(target, "utf8");

const statsTypeFrom = `  realizedRoi: number | null;\n  exitReasons: ExitReason[];`;
const statsTypeTo = `  realizedRoi: number | null;\n  avgWinPnl: number | null;\n  avgLossPnl: number | null;\n  exitReasons: ExitReason[];`;
if (!source.includes(statsTypeTo)) {
  if (!source.includes(statsTypeFrom)) throw new Error("Outcome Mix ledger fix could not find BotStats type");
  source = source.replace(statsTypeFrom, statsTypeTo);
}

const oldTypes = `type AnalyticsPayload = { ok?: boolean; automations?: BotStats[]; error?: string };`;
const newTypes = `type WorkspaceTrade = { botId?: string | null; status?: string; invested?: number | null; realizedPnl?: number | null; closeReason?: string | null };\ntype WorkspacePayload = { ok?: boolean; trades?: WorkspaceTrade[]; error?: string };`;
if (!source.includes(oldTypes)) throw new Error("Outcome Mix ledger fix could not find analytics payload type");
source = source.replace(oldTypes, newTypes);

const oldLoad = `      const { data, error: invokeError } = await browserSupabase.functions.invoke("trader-analytics", { body: { accountId, range: "all" } });\n      if (cancelled) return;\n      if (invokeError) {\n        setError(invokeError.message || "Unable to load bot analytics.");\n        setStats(null);\n      } else {\n        const payload = (data ?? {}) as AnalyticsPayload;\n        const found = (payload.automations ?? []).find((item) => item.id === botId) ?? null;\n        if (payload.ok !== true) setError(payload.error || "Unable to load bot analytics.");\n        setStats(found);\n      }`;
const newLoad = `      const { data, error: invokeError } = await browserSupabase.functions.invoke("trader-account-control", { body: { action: "workspace_state", accountId } });\n      if (cancelled) return;\n      if (invokeError) {\n        setError(invokeError.message || "Unable to load bot performance.");\n        setStats(null);\n      } else {\n        const payload = (data ?? {}) as WorkspacePayload;\n        if (payload.ok !== true) {\n          setError(payload.error || "Unable to load bot performance.");\n          setStats(null);\n        } else {\n          const closed = (payload.trades ?? []).filter((trade) => String(trade.botId || "") === botId && String(trade.status || "").toLowerCase() === "closed");\n          let wins = 0, losses = 0, breakeven = 0, realized = 0, invested = 0, winPnl = 0, lossPnl = 0;\n          const reasons = new Map<string, { trades: number; pnl: number }>();\n          for (const trade of closed) {\n            const pnl = Number(trade.realizedPnl ?? 0);\n            const capital = Math.max(0, Number(trade.invested ?? 0));\n            const safePnl = Number.isFinite(pnl) ? pnl : 0;\n            const safeCapital = Number.isFinite(capital) ? capital : 0;\n            realized += safePnl; invested += safeCapital;\n            if (safePnl > 0) { wins += 1; winPnl += safePnl; }\n            else if (safePnl < 0) { losses += 1; lossPnl += safePnl; }\n            else breakeven += 1;\n            const reason = String(trade.closeReason || "Other");\n            const current = reasons.get(reason) ?? { trades: 0, pnl: 0 };\n            current.trades += 1; current.pnl += safePnl; reasons.set(reason, current);\n          }\n          const closedTrades = closed.length;\n          setStats({\n            id: botId, closedTrades, wins, losses, breakeven,\n            winRate: closedTrades ? wins / closedTrades * 100 : null,\n            realizedRoi: invested > 0 ? realized / invested * 100 : null,\n            avgWinPnl: wins ? winPnl / wins : null,\n            avgLossPnl: losses ? lossPnl / losses : null,\n            exitReasons: Array.from(reasons, ([reason, value]) => ({ reason, ...value })),\n          });\n        }\n      }`;
if (!source.includes(oldLoad)) throw new Error("Outcome Mix ledger fix could not find analytics loader");
source = source.replace(oldLoad, newLoad);

for (const marker of [
  'functions.invoke("trader-account-control"',
  'action: "workspace_state"',
  'String(trade.botId || "") === botId',
  'closedTrades ? wins / closedTrades * 100',
  'avgWinPnl: wins ? winPnl / wins : null',
  'avgLossPnl: losses ? lossPnl / losses : null',
]) if (!source.includes(marker)) throw new Error(`Outcome Mix ledger fix missing ${marker}`);
if (source.includes('functions.invoke("trader-analytics"')) throw new Error("Outcome Mix still uses mismatched analytics bot IDs");

fs.writeFileSync(target, source);
console.log("Outcome Mix now derives bot history and realized winner/loss magnitudes from the authoritative workspace trade ledger.");

await import("./prepare-trader-outcome-break-even-winrate-v1.mjs");
