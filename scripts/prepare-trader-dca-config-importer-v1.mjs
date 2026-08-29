import fs from "node:fs";
import path from "node:path";

const target=path.join(process.cwd(),"app","trader","DcaBotConfigurator.tsx");
if(!fs.existsSync(target))throw new Error("DCA configurator target missing for configuration importer");
let source=fs.readFileSync(target,"utf8");

if(!source.includes('import DcaConfigImporter from "./DcaConfigImporter";')){
  const anchor='import cfg from "./dca-bot-configurator.module.css";';
  if(!source.includes(anchor))throw new Error("DCA importer could not find configurator import anchor");
  source=source.replace(anchor,`${anchor}\nimport DcaConfigImporter from "./DcaConfigImporter";`);
}

const formAnchor='  return <form className={cfg.body} onSubmit={save}>\n    {localError&&<div className={cfg.error}>{localError}</div>}';
if(!source.includes('availablePairs={pairs.map(item=>item.pair)}')){
  if(!source.includes(formAnchor))throw new Error("DCA importer could not find editable form anchor");
  const importer=`  return <form className={cfg.body} onSubmit={save}>\n    {localError&&<div className={cfg.error}>{localError}</div>}\n    <DcaConfigImporter availablePairs={pairs.map(item=>item.pair)} onApply={patch=>setForm(value=>{\n      const nextMax=patch.maxSafetyOrders??value.maxSafetyOrders;\n      const requestedLimit=patch.limitSafetyOrders??value.limitSafetyOrders;\n      const nextLimit=nextMax===0?0:Math.min(nextMax,Math.max(1,requestedLimit));\n      const nextPairs=patch.pairs?.length?patch.pairs:value.pairs;\n      return {...value,...patch,pairs:nextPairs,pair:patch.pair??nextPairs[0]??value.pair,limitSafetyOrders:nextLimit,conditions:patch.conditions??value.conditions};\n    })}/>`;
  source=source.replace(formAnchor,importer);
}

for(const required of[
  'import DcaConfigImporter from "./DcaConfigImporter";',
  'availablePairs={pairs.map(item=>item.pair)}',
  'conditions:patch.conditions??value.conditions',
])if(!source.includes(required))throw new Error(`DCA importer output missing ${required}`);

fs.writeFileSync(target,source);
console.log("Prepared browser-only DCA configuration importer with preview and safe apply.");
