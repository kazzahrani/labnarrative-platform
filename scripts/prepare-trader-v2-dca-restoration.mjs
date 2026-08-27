import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const shellPath = path.join(root, "app/trader/TraderV2FullShell.tsx");
const dcaCssPath = path.join(root, "app/trader/trader-dca-v2.module.css");
const baseCssPath = path.join(root, "app/trader/trader-v2.module.css");
const workstationPath = path.join(root, "app/trader/DcaTradeChartV2Workstation.tsx");
const configuratorPath = path.join(root, "app/trader/DcaBotConfigurator.tsx");

let shell = fs.readFileSync(shellPath, "utf8");
if (!shell.includes('import CoinLogo from "./CoinLogo";')) {
  shell = shell.replace(
    'import BinanceConnectionLayer from "./BinanceConnectionLayer";',
    'import BinanceConnectionLayer from "./BinanceConnectionLayer";\nimport CoinLogo from "./CoinLogo";',
  );
}
// Re-apply logo surfaces after all legacy prebuild transforms. These replacements are
// intentionally idempotent, so committed modern JSX is left untouched.
const shellLogoReplacements = [
  [
    '<small>{bot.pair} · {bot.executionMode}</small>',
    '<small style={{display:"flex",alignItems:"center",gap:6}}><CoinLogo symbol={bot.pair} size={14}/><span>{bot.pair} · {bot.executionMode}</span></small>',
  ],
  [
    '<span className={styles.assetLogo}>{item.asset.slice(0,2)}</span>',
    '<CoinLogo symbol={item.asset} size={36}/>',
  ],
  [
    '<span className={styles.assetLogo}>US</span>',
    '<CoinLogo symbol="USDT" size={36}/>',
  ],
  [
    '<span className={dca.botCell}>{bot.pair}</span>',
    '<span className={dca.botCell} style={{display:"flex",alignItems:"center",gap:7}}><CoinLogo symbol={bot.pair} size={18}/>{bot.pair}</span>',
  ],
  [
    '<div className={dca.tradeIdentity}><strong>{trade.pair}</strong>',
    '<div className={dca.tradeIdentity}><strong style={{display:"flex",alignItems:"center",gap:8}}><CoinLogo symbol={trade.pair} size={22}/>{trade.pair}</strong>',
  ],
  [
    '<div className={dca.summaryItem}><span>Pair</span><b>{bot.pair}</b></div>',
    '<div className={dca.summaryItem}><span>Pair</span><b style={{display:"flex",alignItems:"center",gap:7}}><CoinLogo symbol={bot.pair} size={18}/>{bot.pair}</b></div>',
  ],
];
for (const [before, after] of shellLogoReplacements) {
  if (shell.includes(before)) shell = shell.replaceAll(before, after);
}

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
if (!workstation.includes('import CoinLogo from "./CoinLogo";')) {
  workstation = workstation.replace(
    'import { browserSupabase } from "../../lib/supabase-browser";',
    'import { browserSupabase } from "../../lib/supabase-browser";\nimport CoinLogo from "./CoinLogo";',
  );
}
const chartIdentityOld = '<div><span className={styles.eyebrow}>{trade.status} DCA TRADE</span><h2>Trade chart</h2><p>{trade.pair} · BINANCE · {snapshot?.bot?.name ?? "DCA Bot"}</p></div>';
const chartIdentityNew = '<div><span className={styles.eyebrow}>{trade.status} DCA TRADE</span><h2>Trade chart</h2><p style={{display:"flex",alignItems:"center",gap:7}}><CoinLogo symbol={trade.pair} size={17}/><span>{trade.pair} · BINANCE · {snapshot?.bot?.name ?? "DCA Bot"}</span></p></div>';
if (workstation.includes(chartIdentityOld)) workstation = workstation.replace(chartIdentityOld, chartIdentityNew);
workstation = workstation.replace(
  'return win.reduce((s, v) => s + (v ?? 0), 0) / length;',
  'return win.reduce<number>((s, v) => s + (v ?? 0), 0) / length;',
);
if (!workstation.includes('const conditionSignature = JSON.stringify')) {
  workstation = workstation.replace(
    '  const structureSignature = useMemo(() => JSON.stringify({',
    '  const conditionSignature = JSON.stringify(conditions.map(c => [c.kind,c.timeframe,c.length,c.comparator,c.signal,c.aux1,c.aux2,c.aux3]));\n\n  const structureSignature = useMemo(() => JSON.stringify({',
  );
}
workstation = workstation.replace(
  'autoY, conditions, structureSignature, canvasHeight',
  'autoY, conditionSignature, structureSignature, canvasHeight',
);
fs.writeFileSync(workstationPath, workstation);

// DcaBotConfigurator replaces the legacy pair editor during the same build. Add logos
// to its selected chips and searchable Binance pair list so the generated UI keeps them.
let configurator = fs.readFileSync(configuratorPath, "utf8");
if (!configurator.includes('import CoinLogo from "./CoinLogo";')) {
  configurator = configurator.replace(
    'import { browserSupabase } from "../../lib/supabase-browser";',
    'import { browserSupabase } from "../../lib/supabase-browser";\nimport CoinLogo from "./CoinLogo";',
  );
}
configurator = configurator.replace(
  'form.pairs.map(pair=><span key={pair}>{pair}</span>)',
  'form.pairs.map(pair=><span key={pair} style={{display:"inline-flex",alignItems:"center",gap:6}}><CoinLogo symbol={pair} size={16}/>{pair}</span>)',
);
configurator = configurator.replace(
  '<span><b>{item.baseAsset}</b><small>{item.pair}</small></span>',
  '<span style={{display:"flex",alignItems:"center",gap:8}}><CoinLogo symbol={item.baseAsset} size={22}/><span style={{display:"grid"}}><b>{item.baseAsset}</b><small>{item.pair}</small></span></span>',
);
fs.writeFileSync(configuratorPath, configurator);

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

console.log("Trader V2 full DCA restoration, coin logos, and chart workstation routing applied");
