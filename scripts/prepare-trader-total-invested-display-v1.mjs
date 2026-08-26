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

console.log("Permanent total invested trade display prepared");
