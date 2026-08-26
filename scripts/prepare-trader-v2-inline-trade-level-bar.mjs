import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const shellPath = path.join(root, "app/trader/TraderV2FullShell.tsx");
const cssPath = path.join(root, "app/trader/trader-dca-v2.module.css");

let shell = fs.readFileSync(shellPath, "utf8");

if (!shell.includes('import TradeLevelBar from "./TradeLevelBar";')) {
  const importMatch = shell.match(/import DcaTradeChart from "\.\/DcaTradeChart(?:V2Workstation)?";/);
  if (!importMatch) throw new Error("Could not find DCA chart import for inline trade bar");
  shell = shell.replace(importMatch[0], `${importMatch[0]}\nimport TradeLevelBar from "./TradeLevelBar";`);
}

const identity = '<div className={dca.tradeTop}><div className={dca.tradeIdentity}><strong>{trade.pair}</strong><small>{trade.botName} · {trade.executionMode}</small></div>';
if (!shell.includes('<TradeLevelBar accountId={currentAccount.id} tradeId={trade.id}')) {
  if (!shell.includes(identity)) throw new Error("Could not find V2 trade identity row");
  shell = shell.replace(identity, `${identity}<TradeLevelBar accountId={currentAccount.id} tradeId={trade.id} averagePrice={trade.averagePrice} livePrice={tradeState === "Active" ? trade.lastPrice : trade.exitPrice} stopLossPrice={trade.stopLossPrice} takeProfitPrice={trade.takeProfitPrice} active={tradeState === "Active"}/>`);
}

shell = shell.replace('rows.map((trade) => { const bar = liveBarPosition(trade); return', 'rows.map((trade) => { return');

const liveStart = shell.indexOf('{tradeState === "Active" && <div className={dca.liveStrip}>');
if (liveStart >= 0) {
  const metaStart = shell.indexOf('<div className={dca.tradeMeta}>', liveStart);
  if (metaStart < 0) throw new Error("Could not find trade meta after legacy live strip");
  shell = shell.slice(0, liveStart) + shell.slice(metaStart);
}

fs.writeFileSync(shellPath, shell);

let css = fs.readFileSync(cssPath, "utf8");
const marker = "/* trader-v2-inline-exact-level-bar */";
if (!css.includes(marker)) {
  css += `\n${marker}\n.tradeTop{grid-template-columns:minmax(180px,1.18fr) minmax(190px,.9fr) repeat(4,minmax(72px,.52fr)) auto!important;gap:10px!important;align-items:center!important}.tradeCard{padding:11px 13px!important}.tradeIdentity{min-width:0}.tradeIdentity strong,.tradeIdentity small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}@media(max-width:1180px){.tradeTop{grid-template-columns:minmax(170px,1.1fr) minmax(160px,.82fr) repeat(3,minmax(68px,.5fr)) auto!important}.tradeTop>.tradeValue:nth-child(5){display:none!important}}@media(max-width:900px){.tradeTop{grid-template-columns:minmax(160px,1fr) minmax(150px,.9fr) minmax(70px,.55fr) minmax(80px,.6fr) auto!important}.tradeTop>.tradeValue:nth-child(4),.tradeTop>.tradeValue:nth-child(5){display:none!important}}@media(max-width:760px){.tradeTop{grid-template-columns:1fr auto!important}.tradeTop>.tradeValue{display:none!important}.tradeTop>div:nth-child(2){grid-column:1/-1}.chartButton{grid-column:2;grid-row:1}}\n`;
}
fs.writeFileSync(cssPath, css);
console.log("Trader V2 inline exact trade level bar prepared");
