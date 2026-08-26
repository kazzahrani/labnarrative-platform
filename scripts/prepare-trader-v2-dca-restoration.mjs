import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const shellPath = path.join(root, "app/trader/TraderV2FullShell.tsx");
const dcaCssPath = path.join(root, "app/trader/trader-dca-v2.module.css");
const baseCssPath = path.join(root, "app/trader/trader-v2.module.css");
const workstationPath = path.join(root, "app/trader/DcaTradeChartV2Workstation.tsx");

let shell = fs.readFileSync(shellPath, "utf8");
if (!shell.includes('import DcaBotConfigurator from "./DcaBotConfigurator";')) {
  shell = shell.replace(
    'import DcaTradeChart from "./DcaTradeChart";',
    'import DcaTradeChart from "./DcaTradeChart";\nimport DcaBotConfigurator from "./DcaBotConfigurator";',
  );
}
// The V2 workstation is deliberately routed after all legacy trader build transforms,
// so the older full-screen DcaTradeChart generator cannot overwrite this chart.
shell = shell.replace(
  'import DcaTradeChart from "./DcaTradeChart";',
  'import DcaTradeChart from "./DcaTradeChartV2Workstation";',
);
const legacyModalBody = '{botModalMode === "view" && selectedBot ? renderBotReadOnly(selectedBot) : renderBotEditor()}';
const restoredModalBody = `{<DcaBotConfigurator
  mode={botModalMode}
  accountId={currentAccount.id}
  accountKind={currentAccount.kind}
  botId={selectedBotId}
  onCancel={() => botModalMode === "edit" && selectedBot ? setBotModalMode("view") : setBotModalMode(null)}
  onSaved={(savedBotId, action) => {
    if (savedBotId) setSelectedBotId(savedBotId);
    setBotModalMode("view");
    setBotTab("Active");
    setNotice(action === "create"
      ? (currentAccount.kind === "real" ? "DCA bot created in the Real Account. Execution remains Shadow until Live is explicitly enabled." : "Paper DCA bot created and started.")
      : "Bot settings saved. New trades use the updated coin universe, entry conditions and DCA settings.");
    void loadWorkspace(true);
  }}
  onError={(message) => setError(message)}
/>}`;
if (shell.includes(legacyModalBody)) shell = shell.replace(legacyModalBody, restoredModalBody);

const oldChartPattern = /\{selectedTrade && <DcaTradeChart pair=\{selectedTrade\.pair\}[\s\S]*?onClose=\{\(\) => setSelectedTradeId\(null\)\}\/ >\}/;
const oldChartPatternCompact = /\{selectedTrade && <DcaTradeChart pair=\{selectedTrade\.pair\}[\s\S]*?onClose=\{\(\) => setSelectedTradeId\(null\)\}\/\>\}/;
const restoredChart = `{selectedTrade && <DcaTradeChart accountId={currentAccount.id} tradeId={selectedTrade.id} pair={selectedTrade.pair} status={selectedTrade.status} entryPrice={selectedTrade.entryPrice} averagePrice={selectedTrade.averagePrice} createdAt={selectedTrade.openedAt} closedAt={selectedTrade.closedAt ?? undefined} exitPrice={selectedTrade.exitPrice ?? undefined} closeReason={selectedTrade.closeReason ?? undefined} lastPrice={selectedTrade.lastPrice ?? undefined} fills={selectedTrade.fills} takeProfitPrice={selectedTrade.takeProfitPrice} stopLossPrice={selectedTrade.stopLossPrice} nextAveragingPrice={selectedTrade.nextAveragingPrice} onClose={() => setSelectedTradeId(null)}/ >}`.replace('/ >','/>');
if (oldChartPattern.test(shell)) shell = shell.replace(oldChartPattern, restoredChart);
else if (oldChartPatternCompact.test(shell)) shell = shell.replace(oldChartPatternCompact, restoredChart);
else if (!shell.includes('tradeId={selectedTrade.id}')) throw new Error("Could not route selected DCA trade to V2 chart workstation");
fs.writeFileSync(shellPath, shell);

// Keep the workstation strict-TypeScript clean after all legacy source transforms.
let workstation = fs.readFileSync(workstationPath, "utf8");
workstation = workstation.replace(
  'return win.reduce((s, v) => s + (v ?? 0), 0) / length;',
  'return win.reduce<number>((s, v) => s + (v ?? 0), 0) / length;',
);
fs.writeFileSync(workstationPath, workstation);

let dcaCss = fs.readFileSync(dcaCssPath, "utf8");
dcaCss = dcaCss
  .replace(/\.green\{color:#a9c2b0!important\}/g, ".green{color:#2ee88f!important}")
  .replace(/background:#9db7a4/g, "background:#2ee88f")
  .replace(/rgba\(157,183,164,\.07\)/g, "rgba(46,232,143,.10)")
  .replace(/background:#8fa99a/g, "background:#29df88");
const compactMarker = "/* trader-v2-compact-active-trades */";
if (!dcaCss.includes(compactMarker)) {
  dcaCss += `\n${compactMarker}\n.tradeCard{padding:10px 12px!important;border-radius:12px!important}.tradeTop{grid-template-columns:minmax(150px,1.25fr) repeat(4,minmax(72px,.58fr)) auto!important;gap:8px!important}.tradeIdentity{gap:2px!important}.tradeIdentity strong{font-size:11px!important}.tradeIdentity small{font-size:8px!important}.tradeValue{gap:2px!important}.tradeValue span{font-size:7px!important}.tradeValue b{font-size:9px!important}.chartButton{padding:5px 8px!important;font-size:8px!important}.liveStrip{margin-top:7px!important;padding-top:7px!important;gap:8px!important}.liveTrack{height:5px!important}.livePct{font-size:9px!important;min-width:52px!important}.tradeMeta{display:none!important}@media(max-width:760px){.tradeTop{grid-template-columns:1fr auto!important}.tradeTop>.tradeValue{display:none!important}}\n`;
}
fs.writeFileSync(dcaCssPath, dcaCss);

let baseCss = fs.readFileSync(baseCssPath, "utf8");
baseCss = baseCss
  .replace(/\.positive\{color:#b8c9bd!important\}/g, ".positive{color:#2ee88f!important}")
  .replace(/\.connected\{color:#a9c2b0!important\}/g, ".connected{color:#2ee88f!important}");
fs.writeFileSync(baseCssPath, baseCss);

console.log("Trader V2 full DCA restoration and chart workstation routing applied");
