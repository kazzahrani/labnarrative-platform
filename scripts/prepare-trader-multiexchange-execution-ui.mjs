import fs from "node:fs";
import path from "node:path";

const filePath = path.join(process.cwd(), "app/trader/DcaBotConfigurator.tsx");
let source = fs.readFileSync(filePath, "utf8");

const replace = (before, after, label) => {
  if (source.includes(after)) return;
  if (!source.includes(before)) throw new Error(`Multi-exchange UI: missing ${label}`);
  source = source.replace(before, after);
};
const replaceRegex = (pattern, replacement, label, donePattern) => {
  if (donePattern?.test(source)) return;
  if (!pattern.test(source)) throw new Error(`Multi-exchange UI: missing ${label}`);
  source = source.replace(pattern, replacement);
};
const ensureTypeField = (typeName, fieldName, fieldType) => {
  const pattern = new RegExp(`(type\\s+${typeName}\\s*=\\s*\\{)([\\s\\S]*?)(\\n\\};)`);
  const match = source.match(pattern);
  if (!match) throw new Error(`Multi-exchange UI: missing ${typeName} type`);
  if (new RegExp(`\\b${fieldName}\\s*:`).test(match[2])) return;
  source = source.replace(pattern, `$1$2\n  ${fieldName}: ${fieldType};$3`);
};

if (source.includes('type PairInfo = { pair:string; symbol:string; baseAsset:string };')) {
  source = source.replace(
    'type PairInfo = { pair:string; symbol:string; baseAsset:string };',
    'type PairInfo = { pair:string; symbol:string; baseAsset:string; quoteVolume?:number };',
  );
}
if (!/type\s+ExchangeProvider\s*=/.test(source)) {
  const pairType = /type PairInfo = \{[^\n]+\};/;
  if (!pairType.test(source)) throw new Error("Multi-exchange UI: missing PairInfo type");
  source = source.replace(pairType, '$&\ntype ExchangeProvider = "binance" | "bybit" | "okx" | "kucoin";');
}
if (!source.includes('const PROVIDER_LABELS:')) {
  const providerType = /type ExchangeProvider = "binance" \| "bybit" \| "okx" \| "kucoin";/;
  if (!providerType.test(source)) throw new Error("Multi-exchange UI: missing exchange provider type");
  source = source.replace(providerType, '$&\nconst PROVIDER_LABELS: Record<ExchangeProvider,string> = { binance:"Binance", bybit:"Bybit", okx:"OKX", kucoin:"KuCoin" };');
}

ensureTypeField("BotDetail", "exchangeProvider", "ExchangeProvider");
ensureTypeField("FormState", "exchangeProvider", "ExchangeProvider");

replaceRegex(
  /(const NEW_FORM:\s*FormState\s*=\s*\{\s*\n\s*name:[^,\n]+,)(?!\s*exchangeProvider:)/,
  '$1 exchangeProvider:"binance",',
  "new form provider",
  /const NEW_FORM:[\s\S]{0,180}?exchangeProvider:"binance"/,
);

if (!source.includes('async function connectedLaunchProviders()')) {
  const helper = `async function connectedLaunchProviders():Promise<ExchangeProvider[]>{
  const providers:ExchangeProvider[]=[];
  const [binance,multi]=await Promise.allSettled([
    browserSupabase.functions.invoke("trader-binance-control",{body:{action:"status"}}),
    browserSupabase.functions.invoke("trader-multiexchange-control",{body:{action:"status_all"}}),
  ]);
  if(binance.status==="fulfilled"){
    const payload=(binance.value.data??{}) as {connection?:{status?:string;permissionTrade?:boolean}};
    if(!binance.value.error&&payload.connection?.status==="connected"&&payload.connection.permissionTrade!==false)providers.push("binance");
  }
  if(multi.status==="fulfilled"){
    const payload=(multi.value.data??{}) as {connections?:Array<{provider?:string;connection?:{status?:string;permissionTrade?:boolean;permissionWithdraw?:boolean}}>} ;
    if(!multi.value.error)for(const row of payload.connections??[]){
      if((row.provider==="bybit"||row.provider==="okx"||row.provider==="kucoin")&&row.connection?.status==="connected"&&row.connection.permissionTrade===true&&row.connection.permissionWithdraw!==true)providers.push(row.provider);
    }
  }
  return providers;
}

`;
  replaceRegex(/(export\s+default\s+function\s+DcaBotConfigurator\s*\()/,`${helper}$1`,"configurator function anchor",/async function connectedLaunchProviders\(\)/);
}

if (!source.includes('const [connectedProviders,setConnectedProviders]')) {
  replace(
    '  const [localError,setLocalError]=useState("");',
    `  const [localError,setLocalError]=useState("");
  const [connectedProviders,setConnectedProviders]=useState<ExchangeProvider[]>(accountKind==="paper"?["binance"]:[]);
  const [connectionLoading,setConnectionLoading]=useState(accountKind==="real");`,
    "connection state",
  );
}

const oldPairEffect = '  useEffect(()=>{let alive=true;void fetch("/api/trader/binance-pairs",{cache:"no-store"}).then(r=>r.json()).then((data:{pairs?:PairInfo[]})=>{if(alive&&data.pairs?.length)setPairs(data.pairs);}).catch(()=>{});return()=>{alive=false};},[]);';
const newPairEffect = `  useEffect(()=>{
    let alive=true;const provider=form.exchangeProvider;
    void fetch(\`/api/trader/exchange-pairs?provider=\${encodeURIComponent(provider)}\`,{cache:"no-store"}).then(r=>r.json()).then((data:{pairs?:PairInfo[]})=>{
      if(!alive||!data.pairs?.length)return;
      setPairs(data.pairs);
      const allowed=new Set(data.pairs.map(item=>item.pair));
      setForm(value=>{
        if(value.exchangeProvider!==provider)return value;
        const selected=value.pairs.filter(pair=>allowed.has(pair));
        const next=selected.length?selected:[data.pairs![0].pair];
        return {...value,pairs:next,pair:next[0]};
      });
    }).catch(()=>{});
    return()=>{alive=false};
  },[form.exchangeProvider]);`;
if (!source.includes('/api/trader/exchange-pairs?provider=')) replace(oldPairEffect,newPairEffect,"provider pair effect");

if (!source.includes('void connectedLaunchProviders().then')) {
  replace(
    newPairEffect,
    `${newPairEffect}
  useEffect(()=>{
    let alive=true;
    if(accountKind!=="real"){setConnectedProviders(["binance"]);setConnectionLoading(false);return()=>{alive=false};}
    setConnectionLoading(true);
    void connectedLaunchProviders().then(providers=>{
      if(!alive)return;
      setConnectedProviders(providers);
      if(mode==="create"&&providers.length)setForm(value=>providers.includes(value.exchangeProvider)?value:{...value,exchangeProvider:providers[0]});
    }).catch(()=>{if(alive)setConnectedProviders([])}).finally(()=>{if(alive)setConnectionLoading(false)});
    return()=>{alive=false};
  },[accountKind,mode]);`,
    "connected provider effect",
  );
}

replaceRegex(
  /(const\s+bot\s*=\s*result\.bot\s*;[\s\S]{0,350}?setForm\s*\(\s*\{)(?!\s*exchangeProvider\s*:)/,
  '$1exchangeProvider:bot.exchangeProvider||"binance",',
  "bot detail provider load",
  /const\s+bot\s*=\s*result\.bot[\s\S]{0,400}?exchangeProvider\s*:\s*bot\.exchangeProvider/,
);
replaceRegex(
  /\s*if\s*\(!form\.allPairs\s*&&\s*!form\.pairs\.length\)\s*return\s+setLocalError\("Choose at least one Binance Spot pair or select All USDT pairs\."\);/,
  '\n    if(accountKind==="real"&&!connectedProviders.includes(form.exchangeProvider))return setLocalError(`Connect ${PROVIDER_LABELS[form.exchangeProvider]} with Spot trading permission before saving this Real Account bot.`);\n    if(!form.allPairs&&!form.pairs.length)return setLocalError(`Choose at least one ${PROVIDER_LABELS[form.exchangeProvider]} Spot pair or select All USDT pairs.`);',
  "save connection validation",
  /connectedProviders\.includes\(form\.exchangeProvider\)[\s\S]{0,220}?Choose at least one/,
);
replaceRegex(
  /name\s*:\s*form\.name\.trim\(\)\s*,\s*(?!exchangeProvider\s*:)/,
  'name:form.name.trim(),exchangeProvider:form.exchangeProvider,',
  "save exchange provider",
  /name\s*:\s*form\.name\.trim\(\)\s*,\s*exchangeProvider\s*:/,
);
replaceRegex(
  /message\.includes\("exchange_connection_required"\)\s*\?\s*"Connect Binance before creating a Real Account bot\."\s*:\s*message/,
  'message.includes("exchange_connection_required")||message.includes("exchange_trade_permission_required")?`Connect ${PROVIDER_LABELS[form.exchangeProvider]} with Spot trading permission before creating this Real Account bot.`:message',
  "provider connection error copy",
  /exchange_trade_permission_required[\s\S]{0,180}?PROVIDER_LABELS/,
);

const summaryPattern=/<div className=\{cfg\.summaryGrid\}>\s*<div><span>Coin universe<\/span>/;
if(summaryPattern.test(source)) source=source.replace(summaryPattern,'<div className={cfg.summaryGrid}>{accountKind==="real"&&<div><span>Exchange</span><b>{PROVIDER_LABELS[form.exchangeProvider]}</b></div>}<div><span>Coin universe</span>');

replaceRegex(
  /(<label><span>Bot name<\/span><input value=\{form\.name\}[\s\S]*?<\/label>)\s*(<label><span>Base order<\/span>)/,
  '$1{accountKind==="real"&&<label><span>Exchange</span><select value={form.exchangeProvider} disabled={mode!=="create"||connectionLoading||!connectedProviders.length} onChange={e=>setForm(v=>({...v,exchangeProvider:e.target.value as ExchangeProvider,pairs:[],allPairs:false}))}>{connectedProviders.length?connectedProviders.map(provider=><option key={provider} value={provider}>{PROVIDER_LABELS[provider]}</option>):<option value={form.exchangeProvider}>No connected exchange</option>}</select><small>{mode==="create"?"This bot and every order it creates stay on this exchange.":"Exchange is locked after the bot is created."}</small></label>}$2',
  "exchange selector",
  /<span>Exchange<\/span><select value=\{form\.exchangeProvider\}/,
);

source = source
  .replaceAll('Use every Binance Spot USDT pair or build a custom market list.', 'Use every {PROVIDER_LABELS[form.exchangeProvider]} Spot USDT pair or build a custom market list.')
  .replaceAll('All Binance USDT Spot pairs', 'All {PROVIDER_LABELS[form.exchangeProvider]} USDT Spot pairs')
  .replaceAll('The server scans the live Binance Spot universe and ranks the scan by liquidity.', 'The server scans the live {PROVIDER_LABELS[form.exchangeProvider]} Spot universe and ranks the scan by liquidity.')
  .replaceAll('evaluated on closed Binance candles.', 'evaluated on closed {PROVIDER_LABELS[form.exchangeProvider]} candles.')
  .replaceAll('The worker scans the complete Binance Spot USDT universe.', 'The worker scans the complete {PROVIDER_LABELS[form.exchangeProvider]} Spot USDT universe.')
  .replaceAll('ALL BINANCE USDT SPOT PAIRS', 'ALL {PROVIDER_LABELS[form.exchangeProvider].toUpperCase()} USDT SPOT PAIRS');

fs.writeFileSync(filePath, source);
console.log("Trader multi-exchange DCA selection applied after legacy transforms");
