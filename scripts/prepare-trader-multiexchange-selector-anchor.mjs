import fs from "node:fs";
import path from "node:path";

const filePath=path.join(process.cwd(),"app/trader/DcaBotConfigurator.tsx");
let source=fs.readFileSync(filePath,"utf8");

if(!source.includes('<span>Exchange</span><select value={form.exchangeProvider}')){
  const formOpen=/(return\s*<form\b[^>]*onSubmit=\{save\}[^>]*>)/;
  if(!formOpen.test(source))throw new Error("Multi-exchange selector: DCA save form not found");
  const card='{accountKind==="real"&&<section className={cfg.card}><div className={cfg.cardHead}><div><h3>Exchange</h3><p>Choose where this bot and every order it creates will execute.</p></div></div><div className={cfg.grid}><label><span>Exchange</span><select value={form.exchangeProvider} disabled={mode!=="create"||connectionLoading||!connectedProviders.length} onChange={e=>setForm(v=>({...v,exchangeProvider:e.target.value as LaunchProvider,pairs:[],allPairs:false}))}>{connectedProviders.length?connectedProviders.map(provider=><option key={provider} value={provider}>{PROVIDER_LABELS[provider]}</option>):<option value={form.exchangeProvider}>No connected exchange</option>}</select><small>{mode==="create"?"Exchange is locked after the bot is created.":"This bot stays on its original exchange."}</small></label></div></section>}';
  source=source.replace(formOpen,`$1${card}`);
}

fs.writeFileSync(filePath,source);
console.log("Trader multi-exchange selector anchor applied");
