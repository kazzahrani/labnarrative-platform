import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const configuratorPath = path.join(root, "app", "trader", "DcaBotConfigurator.tsx");
const shellPath = path.join(root, "app", "trader", "TraderV2FullShell.tsx");
const tableCssPath = path.join(root, "app", "trader", "trader-dca-v2.module.css");
const configuratorCssPath = path.join(root, "app", "trader", "dca-bot-configurator.module.css");

for (const file of [configuratorPath, shellPath, tableCssPath, configuratorCssPath]) {
  if (!fs.existsSync(file)) throw new Error(`Exchange-aware bot target missing: ${file}`);
}

let configurator = fs.readFileSync(configuratorPath, "utf8");
let shell = fs.readFileSync(shellPath, "utf8");
let tableCss = fs.readFileSync(tableCssPath, "utf8");
let configuratorCss = fs.readFileSync(configuratorCssPath, "utf8");
let changes = 0;

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`Exchange-aware bot transform could not find ${label}`);
  changes += 1;
  return source.replace(before, after);
}

// DCA configuration model. Existing bots remain Binance; non-Binance execution adapters are not enabled here.
if (!configurator.includes('type ExchangeProvider=')) {
  configurator = replaceOnce(
    configurator,
    'type Mode="percent"|"levels";',
    'type Mode="percent"|"levels";\ntype ExchangeProvider="binance"|"bybit"|"okx"|"kraken"|"kucoin"|"coinbase";',
    "ExchangeProvider type",
  );
}

if (!/exchangeProvider:ExchangeProvider/.test(configurator)) {
  const next = configurator.replace(
    /(type BotDetail=\{[\s\S]*?lifecycle:string;)(pair:string;)/,
    '$1exchangeProvider:ExchangeProvider;$2',
  );
  if (next === configurator) throw new Error("Exchange-aware bot transform could not add BotDetail.exchangeProvider");
  configurator = next;
  changes += 1;
}

if (!configurator.includes('exchangeProvider:"binance"')) {
  const next = configurator.replace(
    /const NEW_FORM:FormState=\{name:"My DCA Bot",/,
    'const NEW_FORM:FormState={name:"My DCA Bot",exchangeProvider:"binance",',
  );
  if (next === configurator) throw new Error("Exchange-aware bot transform could not default new bots to Binance");
  configurator = next;
  changes += 1;
}

if (!configurator.includes('const EXCHANGE_OPTIONS=')) {
  const match = configurator.match(/const FALLBACK_PAIRS=[^;]+;/);
  if (!match) throw new Error("Exchange-aware bot transform could not find FALLBACK_PAIRS");
  const block = `${match[0]}\nconst EXCHANGE_OPTIONS=[\n  {id:"binance" as ExchangeProvider,label:"Binance",enabled:true,note:"Execution adapter ready"},\n  {id:"bybit" as ExchangeProvider,label:"Bybit",enabled:false,note:"Execution adapter pending"},\n  {id:"okx" as ExchangeProvider,label:"OKX",enabled:false,note:"Execution adapter pending"},\n  {id:"kraken" as ExchangeProvider,label:"Kraken",enabled:false,note:"Execution adapter pending"},\n  {id:"kucoin" as ExchangeProvider,label:"KuCoin",enabled:false,note:"Execution adapter pending"},\n  {id:"coinbase" as ExchangeProvider,label:"Coinbase",enabled:false,note:"Verification / adapter pending"},\n];\nfunction exchangeLabel(value?:string){\n  const raw=String(value||"binance").toLowerCase();\n  return raw==="okx"?"OKX":raw==="bybit"?"Bybit":raw==="kraken"?"Kraken":raw==="kucoin"?"KuCoin":raw==="coinbase"?"Coinbase":"Binance";\n}`;
  configurator = configurator.replace(match[0], block);
  changes += 1;
}

if (!configurator.includes('exchangeProvider:bot.exchangeProvider??"binance"')) {
  const next = configurator.replace(/name:bot\.name,\s*pair:bot\.pair,/, 'name:bot.name,exchangeProvider:bot.exchangeProvider??"binance",pair:bot.pair,');
  if (next === configurator) throw new Error("Exchange-aware bot transform could not hydrate exchange selection");
  configurator = next;
  changes += 1;
}

if (!configurator.includes('exchangeProvider:form.exchangeProvider')) {
  const next = configurator.replace(/name:form\.name,\s*pair:form\.pair,/, 'name:form.name,exchangeProvider:form.exchangeProvider,pair:form.pair,');
  if (next === configurator) throw new Error("Exchange-aware bot transform could not include exchange in save payload");
  configurator = next;
  changes += 1;
}

if (!configurator.includes('<Summary label="Exchange" value={exchangeLabel(bot.exchangeProvider)}/>')) {
  const anchor = '<Summary label="Scope" value={bot.allPairs?"ALL BINANCE USDT SPOT PAIRS":bot.pairs.join(", ")}/>';
  if (!configurator.includes(anchor)) throw new Error("Exchange-aware bot transform could not find bot summary scope");
  configurator = configurator.replace(anchor, `<Summary label="Exchange" value={exchangeLabel(bot.exchangeProvider)}/>${anchor}`);
  changes += 1;
}

if (!configurator.includes('label="Exchange" hint="Execution venue assigned to this bot."')) {
  const botNameField = '<Field label="Bot name" hint="Internal name shown throughout Trader."><input value={form.name} onChange={e=>setForm(v=>({...v,name:e.target.value}))}/></Field>';
  if (!configurator.includes(botNameField)) throw new Error("Exchange-aware bot transform could not find Bot name field");
  const exchangeField = `${botNameField}<Field label="Exchange" hint="Execution venue assigned to this bot."><select value={form.exchangeProvider} onChange={e=>setForm(v=>({...v,exchangeProvider:e.target.value as ExchangeProvider}))}>{EXCHANGE_OPTIONS.map(option=><option key={option.id} value={option.id} disabled={!option.enabled}>{option.label}{option.enabled?"":" · "+option.note}</option>)}</select></Field>`;
  configurator = configurator.replace(botNameField, exchangeField);
  changes += 1;
}

// Automation workspace model and table. Legacy/missing values intentionally display as Binance.
if (!/exchangeProvider\?:string;/.test(shell)) {
  const next = shell.replace(/(type Bot=\{[\s\S]*?pair:string;)/, '$1exchangeProvider?:string;');
  if (next === shell) throw new Error("Exchange-aware bot transform could not add shell Bot.exchangeProvider");
  shell = next;
  changes += 1;
}

if (!shell.includes('function botExchangeLabel(')) {
  const anchor = 'export default function TraderV2FullShell';
  if (!shell.includes(anchor)) throw new Error("Exchange-aware bot transform could not find Trader shell export");
  const helper = `function botExchangeLabel(value?:string){const raw=String(value||"binance").toLowerCase();return raw==="okx"?"OKX":raw==="bybit"?"Bybit":raw==="kraken"?"Kraken":raw==="kucoin"?"KuCoin":raw==="coinbase"?"Coinbase":"Binance";}\n\n`;
  shell = shell.replace(anchor, helper + anchor);
  changes += 1;
}

if (!shell.includes('<span>Exchange</span>')) {
  const next = shell.replace('<span>Pair</span><span>Trades</span>', '<span>Pair</span><span>Exchange</span><span>Trades</span>');
  if (next === shell) throw new Error("Exchange-aware bot transform could not add Automation Exchange header");
  shell = next;
  changes += 1;
}

if (!shell.includes('className={dca.exchangeBadge}')) {
  const anchor = '<span className={dca.miniPill}>{bot.pair}</span>';
  if (!shell.includes(anchor)) throw new Error("Exchange-aware bot transform could not find bot pair pill");
  shell = shell.replace(anchor, `${anchor}<span className={dca.exchangeBadge}>{botExchangeLabel(bot.exchangeProvider)}</span>`);
  changes += 1;
}

// Table layout gains one explicit exchange column while preserving compact responsive behavior.
if (!tableCss.includes('/* exchange-aware-bots-v1 */')) {
  tableCss += `\n/* exchange-aware-bots-v1 */\n.botHead,.botRow{grid-template-columns:minmax(210px,1.35fr) .62fr .62fr .52fr .72fr .62fr .55fr .55fr!important}.exchangeBadge{display:inline-flex;width:max-content;align-items:center;justify-content:center;min-height:24px;padding:0 8px;border:1px solid #30343b;border-radius:999px;background:#14171b;color:#d8dde4;font-size:11px;font-weight:700;line-height:1}@media(max-width:1100px){.botHead,.botRow{grid-template-columns:minmax(190px,1.25fr) .62fr .62fr .55fr .62fr .55fr .55fr!important}.botHead>*:nth-child(5),.botRow>*:nth-child(5){display:none!important}.botHead>*:nth-child(4),.botRow>*:nth-child(4){display:initial!important}}@media(max-width:760px){.exchangeBadge{min-height:22px;font-size:10px}}\n`;
  changes += 1;
}

if (!configuratorCss.includes('/* exchange-aware-bots-v1 */')) {
  configuratorCss += `\n/* exchange-aware-bots-v1 */\n@media(min-width:1100px){.summaryGrid{grid-template-columns:repeat(5,minmax(0,1fr))}}\n`;
  changes += 1;
}

fs.writeFileSync(configuratorPath, configurator);
fs.writeFileSync(shellPath, shell);
fs.writeFileSync(tableCssPath, tableCss);
fs.writeFileSync(configuratorCssPath, configuratorCss);
console.log(`Prepared exchange-aware DCA bot configuration and Automation table (${changes} changes).`);
