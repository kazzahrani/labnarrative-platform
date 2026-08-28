import fs from "node:fs";
import path from "node:path";

const shellPath=path.join(process.cwd(),"app","trader","TraderV2FullShell.tsx");
const cssPath=path.join(process.cwd(),"app","trader","trader-dca-v2.module.css");
const tvConfigPath=path.join(process.cwd(),"app","trader","TradingViewStrategyConfigurator.tsx");
for(const target of[shellPath,cssPath,tvConfigPath])if(!fs.existsSync(target))throw new Error(`Automations table V2 target missing: ${target}`);

let source=fs.readFileSync(shellPath,"utf8");
let css=fs.readFileSync(cssPath,"utf8");
let tvConfig=fs.readFileSync(tvConfigPath,"utf8");

function replaceShell(from,to,label){if(!source.includes(from))throw new Error(`Automations table V2 missing ${label}`);source=source.replace(from,to)}
function replaceCss(from,to,label){if(!css.includes(from))throw new Error(`Automations table V2 CSS missing ${label}`);css=css.replace(from,to)}

replaceShell(
  '  automationType?: "dca" | "tradingview_strategy";\n};\ntype Fill = {',
  '  automationType?: "dca" | "tradingview_strategy";\n  marketLabel?: string;\n  marketScope?: "single" | "multi" | "all" | "dynamic";\n  maxCapital?: number | null;\n  executedCount?: number;\n};\ntype Fill = {',
  'Bot presentation fields',
);

const headStart=source.indexOf('<div className={dca.botHead}>');
const headEnd=headStart>=0?source.indexOf('</div>',headStart):-1;
if(headStart<0||headEnd<0)throw new Error('Automations table V2 missing automation table header');
source=source.slice(0,headStart)+'<div className={dca.botHead}><span>Automation</span><span>Market</span><span>Executions</span><span>Positions</span><span>Max capital</span><span>PnL</span><span>Status</span><span/></div>'+source.slice(headEnd+'</div>'.length);

const marketAnchor='{bot.automationType === "tradingview_strategy" ? <span className={dca.botCell}>From TradingView</span>';
const marketStart=source.indexOf(marketAnchor);
const marketEndToken='</span>}';
const marketEnd=marketStart>=0?source.indexOf(marketEndToken,marketStart):-1;
if(marketStart<0||marketEnd<0)throw new Error('Automations table V2 missing market cell');
const marketCell='{bot.automationType === "tradingview_strategy" ? <span className={dca.botCell}>From TradingView</span> : bot.marketScope === "all" || bot.marketScope === "multi" ? <span className={dca.botCell}>{bot.marketLabel ?? bot.pair}</span> : <span className={dca.botCell} style={{display:"flex",alignItems:"center",gap:7}}><CoinLogo symbol={bot.marketLabel ?? bot.pair} size={18}/>{bot.marketLabel ?? bot.pair}</span>}<span className={dca.botCell}>{bot.executedCount ?? (bot.activeTradeCount + bot.closedTradeCount)}</span>';
source=source.slice(0,marketStart)+marketCell+source.slice(marketEnd+marketEndToken.length);

const capitalNeedle='TradingView sizing';
const capitalNeedleAt=source.indexOf(capitalNeedle);
if(capitalNeedleAt<0)throw new Error('Automations table V2 missing capital cell');
const capitalStart=source.lastIndexOf('<span className={dca.botCell}>',capitalNeedleAt);
const capitalEnd=source.indexOf('</span>',capitalNeedleAt);
if(capitalStart<0||capitalEnd<0)throw new Error('Automations table V2 could not resolve capital cell');
const capitalCell='<span className={dca.botCell}>{bot.automationType === "tradingview_strategy" ? "Dynamic" : money(bot.maxCapital ?? botCapital(bot) * Math.max(1, bot.maxActiveTrades))}</span>';
source=source.slice(0,capitalStart)+capitalCell+source.slice(capitalEnd+'</span>'.length);

source=source.replace(
  '<span>Planned capital</span><b>{money(botCapital(bot))}</b>',
  '<span>Max capital</span><b>{money(bot.maxCapital ?? botCapital(bot) * Math.max(1, bot.maxActiveTrades))}</b>',
);
source=source.replace(
  '<span>Capital plan</span><b>{money(botCapital(bot))}</b>',
  '<span>Max capital</span><b>{money(bot.maxCapital ?? botCapital(bot) * Math.max(1, bot.maxActiveTrades))}</b>',
);

const gridFilter='<button type="button" disabled title="Grid Automation is coming soon"><span>Grid</span><small>Soon</small></button>';
if(source.includes(gridFilter))source=source.replace(gridFilter,'');
const gridPicker='<button className={styles.exchangeChoice} style={{marginTop:8}} disabled><span className={styles.exchangeChoiceLogo}>G</span><div><strong>Grid Automation</strong><small>Trade repeated moves inside a configured price range.</small></div><span>SOON</span></button>';
if(source.includes(gridPicker))source=source.replace(gridPicker,'');
source=source.replace('<div className={styles.comingSoon}>Grid Automation remains on the roadmap and cannot be launched yet.</div>','');

// Product wording only. Backend automationType remains "tradingview_strategy".
source=source.replaceAll('TradingView Strategy','TradingView Automation');
tvConfig=tvConfig.replaceAll('TradingView Strategy','TradingView Automation');

replaceCss(
  'grid-template-columns:minmax(220px,1.45fr) .65fr .55fr .75fr .65fr .55fr .55fr;',
  'grid-template-columns:minmax(220px,1.4fr) .65fr .5fr .55fr .75fr .65fr .55fr .55fr;',
  'desktop automation columns',
);
replaceCss(
  '@media(max-width:1100px){.dcaIntro{grid-template-columns:1fr 1fr}.botHead,.botRow{grid-template-columns:minmax(190px,1.4fr) .65fr .6fr .65fr .55fr .55fr}.botHead>*:nth-child(4),.botRow>*:nth-child(4){display:none}',
  '@media(max-width:1100px){.dcaIntro{grid-template-columns:1fr 1fr}.botHead,.botRow{grid-template-columns:minmax(190px,1.4fr) .7fr .5fr .72fr .6fr .55fr .55fr}.botHead>*:nth-child(4),.botRow>*:nth-child(4){display:none}',
  'responsive automation columns',
);

for(const required of[
  '<span>Executions</span>',
  '<span>Max capital</span>',
  'bot.executedCount ?? (bot.activeTradeCount + bot.closedTradeCount)',
  'bot.marketScope === "all" || bot.marketScope === "multi"',
  'money(bot.maxCapital ?? botCapital(bot) * Math.max(1, bot.maxActiveTrades))',
  'TradingView Automation',
])if(!source.includes(required))throw new Error(`Automations table V2 output missing ${required}`);
if(source.includes('Grid Automation remains on the roadmap')||source.includes('title="Grid Automation is coming soon"')||source.includes('<strong>Grid Automation</strong>'))throw new Error('Grid Automation is still exposed in Automations UI');
if(!tvConfig.includes('TradingView Automation'))throw new Error('TradingView Automation configurator wording missing');

fs.writeFileSync(shellPath,source);
fs.writeFileSync(cssPath,css);
fs.writeFileSync(tvConfigPath,tvConfig);
console.log('Prepared Automations V2: market scope labels, executions, maximum capital, no Grid option, and TradingView Automation naming.');
