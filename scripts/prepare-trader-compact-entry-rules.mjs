import fs from "node:fs";
import path from "node:path";

const configuratorPath = path.join(process.cwd(), "app", "trader", "DcaBotConfigurator.tsx");
if (!fs.existsSync(configuratorPath)) throw new Error(`Trader configurator not found: ${configuratorPath}`);

let source = fs.readFileSync(configuratorPath, "utf8");
let changes = 0;

const replaceRequired = (from, to, label) => {
  if (!source.includes(from)) throw new Error(`Compact entry-rule UI could not find ${label}`);
  source = source.replace(from, to);
  changes += 1;
};

// LabNarrative is long-only for now, so there is no user-facing direction control.
replaceRequired(
  '<label><span>Direction</span><input value="Long" disabled/></label>',
  '',
  'legacy direction field',
);

// Rule editing is intentionally local UI state. The complete condition array is still saved only
// through the existing bot create/update payload, so execution contracts remain unchanged.
replaceRequired(
  '  const [localError,setLocalError]=useState("");',
  '  const [localError,setLocalError]=useState("");\n  const [editingRuleId,setEditingRuleId]=useState<string|null>(null);',
  'configurator local state',
);

replaceRequired(
  '  const changeKind=(id:string,kind:string)=>setForm(value=>({...value,conditions:value.conditions.map((item,index)=>item.id===id?{...conditionDefaults(kind,index),id}:item)}));\n  const togglePair=',
  '  const changeKind=(id:string,kind:string)=>setForm(value=>({...value,conditions:value.conditions.map((item,index)=>item.id===id?{...conditionDefaults(kind,index),id}:item)}));\n  const addCondition=()=>{const condition=conditionDefaults("RSI",form.conditions.length);setForm(value=>({...value,conditions:[...value.conditions,condition]}));setEditingRuleId(condition.id);};\n  const removeCondition=(id:string)=>{setForm(value=>({...value,conditions:value.conditions.filter(item=>item.id!==id)}));setEditingRuleId(current=>current===id?null:current);};\n  const togglePair=',
  'entry-rule helpers',
);

// Existing bot rules always open in their compact state; only a newly added or explicitly edited
// rule expands. This also prevents stale editor state when changing bot/mode.
replaceRequired(
  '  const save=async(event:FormEvent)=>{',
  '  useEffect(()=>{setEditingRuleId(null);},[accountId,botId,mode]);\n\n  const save=async(event:FormEvent)=>{',
  'rule editor reset',
);

replaceRequired(
  'onClick={()=>setForm(v=>({...v,conditions:[...v.conditions,conditionDefaults("RSI",v.conditions.length)]}))}>＋ Add rule</button>',
  'onClick={addCondition}>＋ Add rule</button>',
  'add-rule action',
);

const mapStart = '{form.conditions.map((condition,index)=><div className={cfg.condition} key={condition.id}>';
const mapEnd = '</div>)}</div>:<div className={cfg.immediate}>No entry rules: the strategy may open immediately when capacity and capital are available.</div>}';
const startIndex = source.indexOf(mapStart);
if (startIndex < 0) throw new Error('Compact entry-rule UI could not find expanded rule list start');
const endIndex = source.indexOf(mapEnd, startIndex);
if (endIndex < 0) throw new Error('Compact entry-rule UI could not find expanded rule list end');

const compactRuleList = `{form.conditions.map((condition,index)=>editingRuleId===condition.id?<div className={cfg.condition} key={condition.id}><div className={cfg.conditionTop}><span>Rule {index+1}</span><button type="button" onClick={()=>setEditingRuleId(null)}>Save rule</button></div><div className={cfg.grid}><label><span>Indicator</span><select value={condition.kind} onChange={e=>changeKind(condition.id,e.target.value)}>{INDICATORS.map(item=><option key={item}>{item}</option>)}</select></label><label><span>Timeframe</span><select value={condition.timeframe} onChange={e=>updateCondition(condition.id,{timeframe:e.target.value})}>{TIMEFRAMES.map(item=><option key={item}>{item}</option>)}</select></label><ConditionFields condition={condition} update={patch=>updateCondition(condition.id,patch)}/></div><div className={cfg.conditionSummary}>{summary(condition)}</div></div>:<div className={cfg.readCondition} style={{gridTemplateColumns:"24px minmax(0,1fr) auto"}} key={condition.id}><span>{index+1}</span><div><strong>{summary(condition)}</strong></div><div style={{display:"flex",alignItems:"center",gap:4}}><button type="button" aria-label={\`Edit rule ${index+1}\`} title="Edit rule" onClick={()=>setEditingRuleId(condition.id)} style={{width:28,height:28,padding:0,border:0,background:"transparent",color:"inherit",display:"grid",placeItems:"center",cursor:"pointer"}}><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/></svg></button><button type="button" aria-label={\`Delete rule ${index+1}\`} title="Delete rule" onClick={()=>removeCondition(condition.id)} style={{width:28,height:28,padding:0,border:0,background:"transparent",color:"inherit",display:"grid",placeItems:"center",cursor:"pointer"}}><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="m7 7 1 13h8l1-13"/><path d="M10 11v5M14 11v5"/></svg></button></div></div>)}</div>:<div className={cfg.immediate}>No entry rules: the strategy may open immediately when capacity and capital are available.</div>}`;

source = source.slice(0, startIndex) + compactRuleList + source.slice(endIndex + mapEnd.length);
changes += 1;

// Hard guards: this layer must remain structural only and must not alter trading persistence/contracts.
if (source.includes('<span>Direction</span>')) throw new Error('Direction control survived compact rule refactor');
for (const required of ['Save rule','Edit rule','Delete rule','setEditingRuleId(condition.id)','conditions:form.conditions']) {
  if (!source.includes(required)) throw new Error(`Compact entry-rule UI missing required behavior: ${required}`);
}

fs.writeFileSync(configuratorPath, source);
console.log(`Prepared compact LabNarrative entry-rule UX (${changes} structural changes; no theme or engine files touched).`);
