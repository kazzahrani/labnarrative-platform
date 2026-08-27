import fs from "node:fs";
import path from "node:path";

const root=process.cwd();
const configuratorPath=path.join(root,"app","trader","DcaBotConfigurator.tsx");
if(!fs.existsSync(configuratorPath))throw new Error("TradingView Link configurator target missing");
let source=fs.readFileSync(configuratorPath,"utf8");
let changes=0;
const requiredReplace=(from,to,label)=>{if(!source.includes(from))throw new Error(`TradingView Link could not find ${label}`);source=source.replace(from,to);changes+=1;};

const cfgImport='import cfg from "./dca-bot-configurator.module.css";';
if(!source.includes('import DcaTradingViewLink from "./DcaTradingViewLink";')){
  if(!source.includes(cfgImport))throw new Error("TradingView Link could not find configurator imports");
  source=source.replace(cfgImport,`${cfgImport}\nimport DcaTradingViewLink from "./DcaTradingViewLink";`);changes+=1;
}

requiredReplace(
  '  "Heikin Ashi",\n];',
  '  "Heikin Ashi",\n  "TradingView Custom Signal",\n];',
  'indicator catalog',
);

requiredReplace(
  '  const base: Condition = { id:`condition-${Date.now()}-${index}-${Math.random().toString(16).slice(2)}`, kind, timeframe:"15 minutes", length:14, comparator:"Less Than", signal:30, aux1:0, aux2:0, aux3:0 };\n',
  '  const base: Condition = { id:`condition-${Date.now()}-${index}-${Math.random().toString(16).slice(2)}`, kind, timeframe:"15 minutes", length:14, comparator:"Less Than", signal:30, aux1:0, aux2:0, aux3:0 };\n  if (kind === "TradingView Custom Signal") return {...base,id:`tv-signal-${Date.now()}-${index}-${Math.random().toString(16).slice(2)}`,kind,timeframe:"1 minute",length:14,comparator:"Greater Than",signal:1000000,aux1:0,aux2:0,aux3:0};\n',
  'TradingView condition defaults',
);

requiredReplace(
  'function summary(c:Condition) {\n  const tf=c.timeframe;\n',
  'function summary(c:Condition) {\n  if(c.kind==="TradingView Custom Signal") return "TradingView Custom Signal · webhook entry";\n  const tf=c.timeframe;\n',
  'condition summary',
);

requiredReplace(
  'conditions:bot.conditions??[]',
  'conditions:(bot.conditions??[]).map(condition=>condition.id.startsWith("tv-signal-")?{...condition,kind:"TradingView Custom Signal"}:condition)',
  'saved-rule decoder',
);

const changeKindOld='  const changeKind=(id:string,kind:string)=>setForm(value=>({...value,conditions:value.conditions.map((item,index)=>item.id===id?{...conditionDefaults(kind,index),id}:item)}));';
const changeKindNew=`  const changeKind=(id:string,kind:string)=>{\n    const index=Math.max(0,form.conditions.findIndex(item=>item.id===id));\n    if(kind==="TradingView Custom Signal"){const next=conditionDefaults(kind,0);setForm(value=>({...value,conditions:[next]}));setEditingRuleId(next.id);setLocalError("");return;}\n    const next=conditionDefaults(kind,index),nextId=id.startsWith("tv-signal-")?next.id:id;\n    setForm(value=>({...value,conditions:value.conditions.map(item=>item.id===id?{...next,id:nextId}:item)}));\n    if(nextId!==id)setEditingRuleId(nextId);\n    setLocalError("");\n  };`;
requiredReplace(changeKindOld,changeKindNew,'entry-rule kind handler');

const addOld='  const addCondition=()=>{const condition=conditionDefaults("RSI",form.conditions.length);setForm(value=>({...value,conditions:[...value.conditions,condition]}));setEditingRuleId(condition.id);};';
const addNew='  const addCondition=()=>{if(form.conditions.some(condition=>condition.kind==="TradingView Custom Signal")){setLocalError("TradingView Custom Signal is a standalone entry rule in this version. Change or remove it before adding another rule.");return;}const condition=conditionDefaults("RSI",form.conditions.length);setLocalError("");setForm(value=>({...value,conditions:[...value.conditions,condition]}));setEditingRuleId(condition.id);};';
requiredReplace(addOld,addNew,'add-rule guard');

requiredReplace(
  '    if(!form.allPairs&&!form.pairs.length)return setLocalError("Choose at least one Binance Spot pair or select All USDT pairs.");\n',
  '    if(!form.allPairs&&!form.pairs.length)return setLocalError("Choose at least one Binance Spot pair or select All USDT pairs.");\n    if(form.conditions.some(condition=>condition.kind==="TradingView Custom Signal")&&form.conditions.length!==1)return setLocalError("TradingView Custom Signal must be the only entry rule in this version.");\n',
  'save validation',
);

requiredReplace(
  'conditions:form.conditions',
  'conditions:form.conditions.map(condition=>condition.kind==="TradingView Custom Signal"?{...condition,kind:"RSI",timeframe:"1 minute",length:14,comparator:"Greater Than",signal:1000000,aux1:0,aux2:0,aux3:0}:condition)',
  'safe condition encoding',
);

const editorOld='<div className={cfg.grid}><label><span>Indicator</span><select value={condition.kind} onChange={e=>changeKind(condition.id,e.target.value)}>{INDICATORS.map(item=><option key={item}>{item}</option>)}</select></label><label><span>Timeframe</span><select value={condition.timeframe} onChange={e=>updateCondition(condition.id,{timeframe:e.target.value})}>{TIMEFRAMES.map(item=><option key={item}>{item}</option>)}</select></label><ConditionFields condition={condition} update={patch=>updateCondition(condition.id,patch)}/></div><div className={cfg.conditionSummary}>{summary(condition)}</div>';
const editorNew='<div className={cfg.grid}><label><span>Indicator</span><select value={condition.kind} onChange={e=>changeKind(condition.id,e.target.value)}>{INDICATORS.map(item=><option key={item}>{item}</option>)}</select></label>{condition.kind==="TradingView Custom Signal"?<div className={cfg.liveNote} style={{gridColumn:"1/-1"}}>TradingView becomes the entry trigger. LabNarrative still manages the DCA ladder and exits. Save the strategy to connect its webhook.</div>:<><label><span>Timeframe</span><select value={condition.timeframe} onChange={e=>updateCondition(condition.id,{timeframe:e.target.value})}>{TIMEFRAMES.map(item=><option key={item}>{item}</option>)}</select></label><ConditionFields condition={condition} update={patch=>updateCondition(condition.id,patch)}/></>}</div><div className={cfg.conditionSummary}>{summary(condition)}</div>';
requiredReplace(editorOld,editorNew,'compact rule editor');

const viewClose='    <div className={cfg.readGrid}';
const viewStart=source.indexOf('  if(mode==="view")return <div className={cfg.body}>');
const formStart=source.indexOf('  return <form className={cfg.body}',viewStart);
if(viewStart<0||formStart<0)throw new Error("TradingView Link could not find view/edit boundary");
const viewEndNeedle='  </div>;\n\n';
const viewEnd=source.lastIndexOf(viewEndNeedle,formStart);
if(viewEnd<viewStart)throw new Error("TradingView Link could not find view-mode close");
const viewCall='    <DcaTradingViewLink accountId={accountId} botId={botId} entryRuleEnabled={form.conditions.some(condition=>condition.kind==="TradingView Custom Signal")}/>\n';
source=source.slice(0,viewEnd)+viewCall+source.slice(viewEnd);changes+=1;

const emptyRuleText='No entry rules: the strategy may open immediately when capacity and capital are available.';
const emptyRuleIndex=source.indexOf(emptyRuleText,formStart);
if(emptyRuleIndex<0)throw new Error("TradingView Link could not find final Entry Rule section");
const entrySectionEnd=source.indexOf('</section>',emptyRuleIndex);
if(entrySectionEnd<0)throw new Error("TradingView Link could not resolve Entry Rule section end");
const editCall='\n    <DcaTradingViewLink accountId={accountId} botId={botId} entryRuleEnabled={form.conditions.some(condition=>condition.kind==="TradingView Custom Signal")}/>';
source=source.slice(0,entrySectionEnd+'</section>'.length)+editCall+source.slice(entrySectionEnd+'</section>'.length);changes+=1;

for(const required of[
  'TradingView Custom Signal',
  'tv-signal-',
  'signal:1000000',
  'import DcaTradingViewLink from "./DcaTradingViewLink";',
  '<DcaTradingViewLink accountId={accountId}',
  'TradingView Custom Signal must be the only entry rule',
  'conditions:form.conditions.map(condition=>condition.kind==="TradingView Custom Signal"',
])if(!source.includes(required))throw new Error(`TradingView Link output missing: ${required}`);

if((source.match(/<DcaTradingViewLink /g)||[]).length!==2)throw new Error("TradingView Link must appear exactly once in view and once in edit");
fs.writeFileSync(configuratorPath,source);
console.log(`Prepared real DCA TradingView Link V1 (${changes} changes; one webhook, START/CLOSE/ADD_FUNDS, standalone custom-signal entry).`);
