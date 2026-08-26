import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const shellPath = path.join(root, "app/trader/TraderV2FullShell.tsx");
const metaPath = path.join(root, "app/trader/TradeRowMetaV2.tsx");
const dcaCssPath = path.join(root, "app/trader/trader-dca-v2.module.css");

// Human-readable public trade IDs. Internal trade IDs remain unchanged and continue to power actions/charts.
let meta = fs.readFileSync(metaPath, "utf8");
if (!meta.includes("TRADER_PUBLIC_HUMAN_ID_V1")) {
  meta = meta.replace('import styles from "./trade-row-meta-v2.module.css";', 'import { useEffect, useState } from "react";\nimport { browserSupabase } from "../../lib/supabase-browser";\nimport styles from "./trade-row-meta-v2.module.css";');
  meta = meta.replace('  const completed = Math.max(0, Math.round(averagingFilled || 0));', '  const [publicTradeId, setPublicTradeId] = useState("—"); // TRADER_PUBLIC_HUMAN_ID_V1\n  const completed = Math.max(0, Math.round(averagingFilled || 0));');
  meta = meta.replace('  return <div className={styles.meta}>', `  useEffect(() => {\n    let alive = true;\n    void browserSupabase.rpc("trader_public_trade_id", { p_trade_client_id: tradeId }).then(({ data, error }) => {\n      if (!alive || error) return;\n      if (typeof data === "string" && /^\\d+-\\d+-\\d+$/.test(data)) setPublicTradeId(data);\n    });\n    return () => { alive = false; };\n  }, [tradeId]);\n\n  return <div className={styles.meta}>`);
  meta = meta.replace('<span>ID: <b>{tradeId}</b></span>', '<span>ID: <b>{publicTradeId}</b></span>');
  fs.writeFileSync(metaPath, meta);
}

// Replace Active Trades' Execution metric with actual Binance USDT Reserved / Available balances.
let shell = fs.readFileSync(shellPath, "utf8");
if (!shell.includes("TRADER_ACTIVE_BALANCES_CARD_V1")) {
  const tradesAnchor = shell.indexOf('const tradesPage = (tradeState: "Active" | "Closed") =>');
  if (tradesAnchor < 0) throw new Error("Active balances: trades page not found");
  const pnlAnchor = '    const totalPnl = rows.reduce((sum, trade) => sum + trade.pnl, 0);';
  const pnlAt = shell.indexOf(pnlAnchor, tradesAnchor);
  if (pnlAt < 0) throw new Error("Active balances: PnL anchor not found");
  shell = shell.slice(0, pnlAt) + pnlAnchor + `\n    const usdtBalance = balances.find((item) => item.asset === "USDT"); // TRADER_ACTIVE_BALANCES_CARD_V1\n    const balanceReserved = currentAccount.kind === "real" && connected ? (usdtBalance?.locked ?? 0) : (stateAccount?.reserved ?? 0);\n    const balanceAvailable = currentAccount.kind === "real" && connected ? (usdtBalance?.free ?? 0) : (stateAccount?.available ?? currentAccount.startingBalance ?? 0);` + shell.slice(pnlAt + pnlAnchor.length);

  const executionStart = shell.indexOf('<section className={dca.metric}><span>Execution</span>', tradesAnchor);
  if (executionStart < 0) throw new Error("Active balances: Execution card not found");
  const executionEnd = shell.indexOf('</section>', executionStart);
  if (executionEnd < 0) throw new Error("Active balances: Execution card end not found");
  const legacyExecution = shell.slice(executionStart, executionEnd + '</section>'.length);
  const balancesCard = `{tradeState === "Active" ? <section className={\`${'${dca.metric} ${dca.balanceMetric}'}\`}><div className={dca.balanceMetricHead}><span>Balances</span><button type="button" className={dca.balanceRefresh} onClick={() => { if (currentAccount.kind === "real") { if (connected) void loadBalances(false); else setExchangeModal(true); } else { void loadWorkspace(true); } }} aria-label="Refresh balances"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6v5h-5M4 18v-5h5M18.4 9A7 7 0 0 0 6.3 6.3L4 9m16 6-2.3 2.7A7 7 0 0 1 5.6 15"/></svg><b>Refresh</b></button></div><div className={dca.balanceGrid}><span></span><span>Reserved</span><span>Available</span><strong>USDT</strong><b>{amount(balanceReserved)}</b><b>{amount(balanceAvailable)}</b></div></section> : ${legacyExecution}}`;
  shell = shell.slice(0, executionStart) + balancesCard + shell.slice(executionEnd + '</section>'.length);
  fs.writeFileSync(shellPath, shell);
}

let dcaCss = fs.readFileSync(dcaCssPath, "utf8");
if (!dcaCss.includes("trader-active-balances-card-v1")) {
  dcaCss += `\n/* trader-active-balances-card-v1 */\n.balanceMetric{gap:9px!important;padding:14px 16px!important}.balanceMetricHead{display:flex;align-items:center;justify-content:space-between;gap:10px}.balanceMetricHead>span{font-size:9px;color:#747474}.balanceRefresh{display:inline-flex;align-items:center;gap:5px;border:0;background:transparent;color:#858585;padding:0;cursor:pointer;font:600 8px Tahoma,Arial,sans-serif}.balanceRefresh:hover{color:#c4c4c4}.balanceRefresh svg{width:11px;height:11px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}.balanceRefresh b{font:inherit}.balanceGrid{display:grid;grid-template-columns:minmax(45px,.55fr) 1fr 1.2fr;gap:3px 10px;align-items:end}.balanceGrid>span{font-size:7px;color:#666;text-align:right}.balanceGrid>span:first-child{text-align:left}.balanceGrid>strong{font-size:10px!important;letter-spacing:0!important;color:#d4d4d4}.balanceGrid>b{font-size:10px;color:#d4d4d4;text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}@media(max-width:760px){.balanceGrid{grid-template-columns:.6fr 1fr 1fr}}\n`;
  fs.writeFileSync(dcaCssPath, dcaCss);
}

// Slightly darker, calmer semantic profit/loss colors throughout the Trader UI and chart.
const colorMap = new Map([
  ["#2ee88f", "#27b978"], ["#29df88", "#24ad71"], ["#46d7a2", "#38af86"], ["#57c99c", "#42aa82"],
  ["#48cf96", "#3dac7f"], ["#66dda9", "#4bb78d"], ["#a9c2b0", "#82a28f"], ["#b8c9bd", "#8ba796"],
  ["#9db7a4", "#789687"], ["#8fa99a", "#708d7e"], ["#d1a0a0", "#b87378"], ["#d56f78", "#b95d66"],
  ["#df6f79", "#bd5d67"], ["#e58a92", "#c7777f"], ["#dc6d78", "#ba5a65"], ["#e27883", "#c1616b"],
  ["#b88888", "#9e6666"], ["rgba(46,232,143,.10)", "rgba(39,185,120,.10)"],
]);
for (const name of fs.readdirSync(path.join(root, "app/trader"))) {
  if (!/\.(css|tsx)$/.test(name)) continue;
  const file = path.join(root, "app/trader", name);
  let text = fs.readFileSync(file, "utf8");
  const original = text;
  for (const [from, to] of colorMap) text = text.split(from).join(to);
  if (text !== original) fs.writeFileSync(file, text);
}

console.log("Trader human IDs, balances card and darker semantic colors prepared");
