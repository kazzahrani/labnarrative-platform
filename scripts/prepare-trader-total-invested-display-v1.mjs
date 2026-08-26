import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const shellPath = path.join(root, "app/trader/TraderV2FullShell.tsx");
let source = fs.readFileSync(shellPath, "utf8");
const marker = "TRADER_TOTAL_INVESTED_DISPLAY_V1";

if (!source.includes(marker)) {
  const importAnchor = 'import { browserSupabase } from "../../lib/supabase-browser";';
  if (!source.includes(importAnchor)) throw new Error("Total invested display: import anchor missing");
  source = source.replace(
    importAnchor,
    `${importAnchor}\nimport TradeInvestedValue from "./TradeInvestedValue"; // ${marker}`,
  );

  const investedAnchor = '<div className={dca.tradeValue}><span>Invested</span><b>{money(trade.invested)}</b></div>';
  if (!source.includes(investedAnchor)) throw new Error("Total invested display: trade value anchor missing");
  source = source.replaceAll(
    investedAnchor,
    '<div className={dca.tradeValue}><span>Invested</span><b><TradeInvestedValue tradeId={trade.id} fallback={trade.invested}/></b></div>',
  );

  fs.writeFileSync(shellPath, source);
}

const actionsPath = path.join(root, "app/trader/TradeActionsV2.tsx");
let actions = fs.readFileSync(actionsPath, "utf8");
const closeMarker = "TRADER_RECONCILED_CLOSE_V1";
if (!actions.includes(closeMarker)) {
  actions = actions.replace(
    '  lastPrice: number | null;\n};',
    '  lastPrice: number | null;\n  closeReason?: string | null;\n};',
  );

  const guard = '  if (trade.status !== "Active") return null;';
  if (!actions.includes(guard)) throw new Error("Reconciled close: active trade guard missing");
  const replacement = `  const finishClose = async (event: React.MouseEvent) => {\n    event.stopPropagation();\n    if (busy || !window.confirm(\`Finish closing \\${trade.pair}? This checks the Binance fills that belong to this trade and sends a real MARKET SELL only for the remaining trade-owned quantity.\`)) return;\n    setBusy(true); setError(\"\");\n    try {\n      await invokeFunction(\"trader-live-close-control\", { action: \"finish_close\", accountId, tradeId: trade.id });\n      await onChanged();\n    } catch (caught) {\n      window.alert(errorText(caught instanceof Error ? caught.message : \"Unable to finish closing the trade.\"));\n    } finally { setBusy(false); }\n  };\n\n  if (trade.status !== \"Active\") {\n    if (accountMode !== \"live\" || !String(trade.closeReason || \"\").includes(\"residual pending\")) return null;\n    return <div className={styles.actions} onClick={(event) => event.stopPropagation()}>\n      <button className={styles.closeTrade} disabled={busy} onClick={finishClose}>Finish close</button>\n      <span style={{display:\"none\"}}>${closeMarker}</span>\n    </div>;\n  }`;
  actions = actions.replace(guard, replacement);

  const oldClose = '      await invokeTrade(accountMode, { action: "close_trade", accountId, tradeId: trade.id });';
  if (!actions.includes(oldClose)) throw new Error("Reconciled close: close invocation missing");
  actions = actions.replace(
    oldClose,
    '      if (accountMode === "live") await invokeFunction("trader-live-close-control", { action: "close_trade", accountId, tradeId: trade.id });\n      else await invokeTrade(accountMode, { action: "close_trade", accountId, tradeId: trade.id });',
  );

  fs.writeFileSync(actionsPath, actions);
}

console.log("Permanent total invested display and reconciled live close prepared");
