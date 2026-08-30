import fs from "node:fs";
import path from "node:path";

const root=process.cwd();
const configuratorPath=path.join(root,"app","trader","DcaBotConfigurator.tsx");
const shellPath=path.join(root,"app","trader","TraderV2FullShell.tsx");
const tableCssPath=path.join(root,"app","trader","trader-dca-v2.module.css");
const configuratorCssPath=path.join(root,"app","trader","dca-bot-configurator.module.css");
for(const file of [configuratorPath,shellPath,tableCssPath,configuratorCssPath])if(!fs.existsSync(file))throw new Error(`Exchange-aware bot target missing: ${file}`);

let configurator=fs.readFileSync(configuratorPath,"utf8");
let shell=fs.readFileSync(shellPath,"utf8");
let tableCss=fs.readFileSync(tableCssPath,"utf8");
let configuratorCss=fs.readFileSync(configuratorCssPath,"utf8");
let changes=0;
function apply(source,replacement,label){const next=replacement(source);if(next===source)throw new Error(`Exchange-aware bot transform could not find ${label}`);changes++;return next;}

if(!configurator.includes("type ExchangeProvider")) configurator=apply(configurator,s=>s.replace(/(type Mode\s*=\s*[^;]+;)/,'$1\ntype ExchangeProvider = "binance" | "bybit" | "okx" | "kraken" | "kucoin" | "coinbase";'),"Mode type");
if(!/exchangeProvider\??\s*:\s*ExchangeProvider/.test(configurator)) configurator=apply(configurator,s=>s.replace(/(lifecycle:\s*string;\s*)(pair:\s*string;)/,'$1exchangeProvider?: ExchangeProvider;\n  $2'),"BotDetail exchange field");
if(!/exchangeProvider:\s*"binance"/.test(configurator)) configurator=apply(configurator,s=>s.replace(/(const NEW_FORM:\s*FormState\s*=\s*\{\s*)/,'$1exchangeProvider:"binance", '),"new bot exchange default");
if(!configurator.includes("const EXCHANGE_OPTIONS")) configurator=apply(configurator,s=>s.replace(/(const FALLBACK_PAIRS\s*=\s*\[[^;]+;)/,`$1
const EXCHANGE_OPTIONS = [
  {id:"binance" as ExchangeProvider,label:"Binance"},
  {id:"bybit" as ExchangeProvider,label:"Bybit"},
  {id:"okx" as ExchangeProvider,label:"OKX"},
  {id:"kraken" as ExchangeProvider,label:"Kraken"},
  {id:"kucoin" as ExchangeProvider,label:"KuCoin"},
  {id:"coinbase" as ExchangeProvider,label:"Coinbase"},
];
function exchangeLabel(value?:string){const raw=String(value||"binance").toLowerCase();return raw==="okx"?"OKX":raw==="bybit"?"Bybit":raw==="kraken"?"Kraken":raw==="kucoin"?"KuCoin":raw==="coinbase"?"Coinbase":"Binance";}`),"fallback pair list");

if(configurator.includes('fetch("/api/trader/binance-pairs",{cache:"no-store"})')){
  configurator=configurator.replace('useEffect(()=>{let alive=true;void fetch("/api/trader/binance-pairs",{cache:"no-store"}).then(r=>r.json()).then((data:{pairs?:PairInfo[]})=>{if(alive&&data.pairs?.length)setPairs(data.pairs);}).catch(()=>{});return()=>{alive=false};},[]);','useEffect(()=>{let alive=true;const provider=form.exchangeProvider??"binance";void fetch(`/api/trader/exchange-pairs?provider=${provider}`,{cache:"no-store"}).then(r=>r.json()).then((data:{pairs?:PairInfo[]})=>{if(alive&&data.pairs?.length)setPairs(data.pairs);}).catch(()=>{});return()=>{alive=false};},[form.exchangeProvider]);');changes++;
}
if(!configurator.includes('exchangeProvider:bot.exchangeProvider??"binance"')){
  const next=configurator.replace('setForm({name:bot.name,','setForm({exchangeProvider:bot.exchangeProvider??"binance",name:bot.name,');
  if(next!==configurator){configurator=next;changes++;}
}
if(!configurator.includes('exchangeProvider:form.exchangeProvider??"binance"')) configurator=apply(configurator,s=>s.replace(/name:form\.name\.trim\(\),\s*pair:/,'name:form.name.trim(),exchangeProvider:form.exchangeProvider??"binance",pair:'),"save payload");
configurator=configurator.replaceAll('Choose at least one Binance Spot pair or select All USDT pairs.','Choose at least one Spot pair or select All USDT pairs.').replaceAll('complete Binance Spot USDT universe','complete selected-exchange Spot USDT universe').replaceAll('ALL BINANCE USDT SPOT PAIRS','ALL USDT SPOT PAIRS').replaceAll('every Binance Spot USDT pair','every Spot USDT pair on this exchange').replaceAll('All Binance USDT Spot pairs','All USDT Spot pairs').replaceAll('live Binance Spot universe','live selected-exchange Spot universe').replaceAll('closed Binance candles','closed exchange candles');
if(!configurator.includes("<span>Exchange</span><b>{exchangeLabel(form.exchangeProvider)}</b>")) configurator=apply(configurator,s=>s.replace(/(<div className=\{cfg\.summaryGrid\}>)/,'$1<div><span>Exchange</span><b>{exchangeLabel(form.exchangeProvider)}</b></div>'),"view exchange summary");
if(!configurator.includes('value={form.exchangeProvider??"binance"} onChange={e=>setForm(v=>({...v,exchangeProvider:e.target.value as ExchangeProvider')){
  const exchangeSection='<section className={cfg.card}><div className={cfg.cardHead}><div><h3>Exchange</h3><p>Choose where this automation reads markets and executes.</p></div></div><div className={cfg.grid}><label><span>Exchange</span><select value={form.exchangeProvider??"binance"} onChange={e=>setForm(v=>({...v,exchangeProvider:e.target.value as ExchangeProvider,pairs:["BTC/USDT"],pair:"BTC/USDT",allPairs:false}))}>{EXCHANGE_OPTIONS.map(option=><option key={option.id} value={option.id}>{option.label}</option>)}</select><small>Only exchanges connected in Settings can be used on a Real Account.</small></label></div></section>';
  const formAnchor=/(return\s*<form[^>]*className=\{cfg\.body\}[^>]*>)/;
  if(!formAnchor.test(configurator))throw new Error("Exchange-aware bot transform could not find final DCA form");
  configurator=configurator.replace(formAnchor,`$1${exchangeSection}`);changes++;
}
if(!configurator.includes('execution_activation_pending')){
  const marker='if(message.includes("exchange_connection_required"))';
  if(configurator.includes(marker)) configurator=configurator.replace(marker,'if(message.includes("execution_activation_pending")) return "This exchange is connected, but protected live execution is not active yet.";\n  '+marker);
}

if(!/exchangeProvider\?:\s*string;/.test(shell)) shell=apply(shell,s=>s.replace(/(type Bot\s*=\s*\{[\s\S]*?pair:\s*string;)/,'$1\n  exchangeProvider?: string;'),"shell Bot exchange field");
if(!shell.includes("function botExchangeLabel(")) shell=apply(shell,s=>s.replace("export default function TraderV2FullShell",'function botExchangeLabel(value?:string){const raw=String(value||"binance").toLowerCase();return raw==="okx"?"OKX":raw==="bybit"?"Bybit":raw==="kraken"?"Kraken":raw==="kucoin"?"KuCoin":raw==="coinbase"?"Coinbase":"Binance";}\n\nexport default function TraderV2FullShell'),"Trader shell export");
if(!shell.includes("<span>Exchange</span>")){
  const automationHeader="<span>Automation</span><span>Market</span><span>Executions</span>";
  const legacyHeader="<span>Bot</span><span>Pair</span><span>Trades</span>";
  if(shell.includes(automationHeader)){shell=shell.replace(automationHeader,"<span>Automation</span><span>Market</span><span>Exchange</span><span>Executions</span>");changes++;}
  else if(shell.includes(legacyHeader)){shell=shell.replace(legacyHeader,"<span>Bot</span><span>Pair</span><span>Exchange</span><span>Trades</span>");changes++;}
  else {const next=shell.replace(/(<div className=\{dca\.botHead\}>[\s\S]{0,1000}?<span[^>]*>(?:Pair|Market)<\/span>)/,'$1<span>Exchange</span>');if(next===shell)throw new Error("Exchange-aware bot transform could not find Automation table header");shell=next;changes++;}
}
if(!shell.includes("className={dca.exchangeBadge}")){
  const executionsCell='<span className={dca.botCell}>{bot.executedCount ?? (bot.activeTradeCount + bot.closedTradeCount)}</span>';
  const exactPairCell='<span className={dca.botCell} style={{display:"flex",alignItems:"center",gap:7}}><CoinLogo symbol={bot.pair} size={18}/>{bot.pair}</span>';
  if(shell.includes(executionsCell)){shell=shell.replace(executionsCell,'<span className={dca.exchangeBadge}>{botExchangeLabel(bot.exchangeProvider)}</span>'+executionsCell);changes++;}
  else if(shell.includes(exactPairCell)){shell=shell.replace(exactPairCell,exactPairCell+'<span className={dca.exchangeBadge}>{botExchangeLabel(bot.exchangeProvider)}</span>');changes++;}
  else {const next=shell.replace(/(<span className=\{dca\.botCell\}[^>]*>[\s\S]{0,450}?<CoinLogo[^>]*symbol=\{(?:bot\.marketLabel\s*\?\?\s*)?bot\.pair\}[^>]*\/>[\s\S]{0,180}?\{(?:bot\.marketLabel\s*\?\?\s*)?bot\.pair\}<\/span>)/,'$1<span className={dca.exchangeBadge}>{botExchangeLabel(bot.exchangeProvider)}</span>');if(next===shell)throw new Error("Exchange-aware bot transform could not find Automation market cell");shell=next;changes++;}
}

if(!tableCss.includes("/* exchange-aware-bots-v2 */")){tableCss+='\n/* exchange-aware-bots-v2 */\n.botHead,.botRow{grid-template-columns:minmax(210px,1.35fr) .62fr .58fr .52fr .52fr .72fr .62fr .55fr .55fr!important}.exchangeBadge{display:inline-flex;width:max-content;align-items:center;justify-content:center;min-height:24px;padding:0 8px;border:1px solid #30343b;border-radius:999px;background:#14171b;color:#d8dde4;font-size:11px;font-weight:700;line-height:1}@media(max-width:1100px){.botHead,.botRow{grid-template-columns:minmax(190px,1.25fr) .62fr .58fr .52fr .72fr .62fr .55fr .55fr!important}.botHead>*:nth-child(5),.botRow>*:nth-child(5){display:none!important}}@media(max-width:760px){.exchangeBadge{min-height:22px;font-size:10px}}\n';changes++;}
if(!configuratorCss.includes("/* exchange-aware-bots-v2 */")){configuratorCss+='\n/* exchange-aware-bots-v2 */\n@media(min-width:1100px){.summaryGrid{grid-template-columns:repeat(5,minmax(0,1fr))}}\n';changes++;}

fs.writeFileSync(configuratorPath,configurator);
fs.writeFileSync(shellPath,shell);
fs.writeFileSync(tableCssPath,tableCss);
fs.writeFileSync(configuratorCssPath,configuratorCss);
console.log(`Prepared exchange-aware DCA bot configuration and Automation table (${changes} changes).`);
