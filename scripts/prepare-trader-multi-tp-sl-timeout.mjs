import fs from "node:fs";
import path from "node:path";

const root=process.cwd();
const file=path.join(root,"app/trader/DcaBotConfigurator.tsx");
const cssFile=path.join(root,"app/trader/dca-bot-configurator.module.css");
let source=fs.readFileSync(file,"utf8");
const replace=(before,after,label)=>{if(!source.includes(before))throw new Error(`multi TP config: missing ${label}`);source=source.replace(before,after);};

replace(
  'type BotDetail = {',
  'type TpTarget = { profitPct:number; allocationPct:number };\ntype BotDetail = {',
  'bot detail type',
);
replace(
  '  takeProfit: number;\n  stopEnabled: boolean;\n  stopPct: number;',
  '  takeProfit: number;\n  takeProfitTargets: TpTarget[];\n  trailingPct: number;\n  stopEnabled: boolean;\n  stopPct: number;\n  stopLossTimeoutSeconds: number;',
  'exit fields',
);
replace(
  '  deviation:1, stepScale:1, volumeScale:1, takeProfit:1.5, stopEnabled:false, stopPct:8, conditions:[],',
  '  deviation:1, stepScale:1, volumeScale:1, takeProfit:1.5, takeProfitTargets:[{profitPct:1.5,allocationPct:100}], trailingPct:0, stopEnabled:false, stopPct:8, stopLossTimeoutSeconds:0, conditions:[],',
  'new form defaults',
);
replace(
  'function money(value:number) {',
  `function equalizeTargets(targets:TpTarget[]){
  if(!targets.length)return [{profitPct:1.5,allocationPct:100}];
  const share=Math.floor((100/targets.length)*100)/100;
  return targets.map((target,index)=>({...target,allocationPct:index===targets.length-1?Number((100-share*(targets.length-1)).toFixed(2)):share}));
}
function money(value:number) {`,
  'target helper',
);
replace(
  'setForm({name:bot.name,pair:bot.pair,pairs:bot.pairs?.length?bot.pairs:[bot.pair],allPairs:bot.allPairs,baseOrder:bot.baseOrder,safetyOrder:bot.safetyOrder,maxSafetyOrders:bot.maxSafetyOrders,limitSafetyOrders:bot.limitSafetyOrders,maxActiveTrades:bot.maxActiveTrades,deviation:bot.deviation,stepScale:bot.stepScale,volumeScale:bot.volumeScale,takeProfit:bot.takeProfit,stopEnabled:bot.stopEnabled,stopPct:bot.stopPct,conditions:bot.conditions??[]});',
  'setForm({name:bot.name,pair:bot.pair,pairs:bot.pairs?.length?bot.pairs:[bot.pair],allPairs:bot.allPairs,baseOrder:bot.baseOrder,safetyOrder:bot.safetyOrder,maxSafetyOrders:bot.maxSafetyOrders,limitSafetyOrders:bot.limitSafetyOrders,maxActiveTrades:bot.maxActiveTrades,deviation:bot.deviation,stepScale:bot.stepScale,volumeScale:bot.volumeScale,takeProfit:bot.takeProfit,takeProfitTargets:bot.takeProfitTargets?.length?bot.takeProfitTargets:[{profitPct:bot.takeProfit,allocationPct:100}],trailingPct:bot.trailingPct??0,stopEnabled:bot.stopEnabled,stopPct:bot.stopPct,stopLossTimeoutSeconds:bot.stopLossTimeoutSeconds??0,conditions:bot.conditions??[]});',
  'bot form hydration',
);
replace(
  '  const togglePair=(pair:string)=>setForm(value=>{const exists=value.pairs.includes(pair);const next=exists?value.pairs.filter(item=>item!==pair):[...value.pairs,pair];return{...value,pairs:next,pair:next[0]||value.pair};});',
  `  const togglePair=(pair:string)=>setForm(value=>{const exists=value.pairs.includes(pair);const next=exists?value.pairs.filter(item=>item!==pair):[...value.pairs,pair];return{...value,pairs:next,pair:next[0]||value.pair};});
  const updateTp=(index:number,patch:Partial<TpTarget>)=>setForm(value=>{const targets=value.takeProfitTargets.map((target,i)=>i===index?{...target,...patch}:target);return{...value,takeProfitTargets:targets,takeProfit:targets[0]?.profitPct??value.takeProfit};});
  const addTp=()=>setForm(value=>{if(value.takeProfitTargets.length>=8||value.trailingPct>0)return value;const last=value.takeProfitTargets.at(-1)?.profitPct??value.takeProfit;const targets=equalizeTargets([...value.takeProfitTargets,{profitPct:Number((last+1).toFixed(2)),allocationPct:0}]);return{...value,takeProfitTargets:targets,takeProfit:targets[0].profitPct};});
  const removeTp=(index:number)=>setForm(value=>{if(value.takeProfitTargets.length<=1)return value;const targets=equalizeTargets(value.takeProfitTargets.filter((_,i)=>i!==index));return{...value,takeProfitTargets:targets,takeProfit:targets[0].profitPct};});`,
  'target actions',
);
replace(
  '    if(!form.allPairs&&!form.pairs.length)return setLocalError("Choose at least one Binance Spot pair or select All USDT pairs.");\n    setSaving(true);setLocalError("");',
  `    if(!form.allPairs&&!form.pairs.length)return setLocalError("Choose at least one Binance Spot pair or select All USDT pairs.");
    if(!form.takeProfitTargets.length||form.takeProfitTargets.some(target=>!(target.profitPct>0)||!(target.allocationPct>0)))return setLocalError("Every Take Profit target needs a positive target and allocation.");
    if(form.takeProfitTargets.some((target,index)=>index>0&&target.profitPct<=form.takeProfitTargets[index-1].profitPct))return setLocalError("Take Profit targets must increase from TP1 upward.");
    const tpAllocation=form.takeProfitTargets.reduce((sum,target)=>sum+target.allocationPct,0);
    if(Math.abs(tpAllocation-100)>.01)return setLocalError("Take Profit allocations must total 100%.");
    if(!(form.trailingPct>=0&&form.trailingPct<100))return setLocalError("Trailing Take Profit deviation must be between 0% and 100%.");
    if(form.trailingPct>0&&form.takeProfitTargets.length!==1)return setLocalError("Trailing Take Profit currently requires a single TP target.");
    setSaving(true);setLocalError("");`,
  'save target validation',
);
replace(
  'takeProfit:form.takeProfit,stopEnabled:form.stopEnabled,stopPct:form.stopPct,conditions:form.conditions',
  'takeProfit:form.takeProfitTargets[0]?.profitPct??form.takeProfit,takeProfitTargets:form.takeProfitTargets,trailingPct:form.trailingPct,stopEnabled:form.stopEnabled,stopPct:form.stopPct,stopLossTimeoutSeconds:form.stopLossTimeoutSeconds,conditions:form.conditions',
  'save payload',
);
replace(
  'const friendly=message.includes("bot_pairs_locked_by_active_trade")?"Coin selection cannot be changed while this bot has active trades. Its strategy, DCA and exit settings can still be edited.":message.includes("exchange_connection_required")?"Connect Binance before creating a Real Account bot.":message;',
  'const friendly=message.includes("bot_pairs_locked_by_active_trade")?"Coin selection cannot be changed while this bot has active trades. Its strategy, DCA and exit settings can still be edited.":message.includes("exchange_connection_required")?"Connect Binance before creating a Real Account bot.":message.includes("take_profit_allocations_must_total_100")?"Take Profit allocations must total 100%.":message.includes("take_profit_targets_must_ascend")?"Take Profit targets must increase from TP1 upward.":message.includes("trailing_take_profit_requires_single_target")?"Trailing Take Profit currently requires a single TP target.":message;',
  'friendly errors',
);
replace(
  '<div><span>Take profit</span><b>{form.takeProfit}%</b></div><div><span>Stop loss</span><b>{form.stopEnabled?`${form.stopPct}%`:"Off"}</b></div>',
  '<div><span>Take profits</span><b>{form.takeProfitTargets.map((target,index)=>`TP${index+1} ${target.profitPct}% / ${target.allocationPct}%`).join(" · ")}</b></div><div><span>Trailing TP</span><b>{form.trailingPct>0?`${form.trailingPct}% deviation`:"Off"}</b></div><div><span>Stop loss</span><b>{form.stopEnabled?`${form.stopPct}%${form.stopLossTimeoutSeconds>0?` · ${form.stopLossTimeoutSeconds}s timeout`:" · immediate"}`:"Off"}</b></div>',
  'view exit summary',
);
const oldExit='<section className={cfg.card}><div className={cfg.cardHead}><div><h3>Exit settings</h3><p>Take profit and optional stop loss for each new trade.</p></div></div><div className={cfg.grid}><label><span>Take profit</span><div className={cfg.unit}><input type="number" min="0.1" step="0.1" value={form.takeProfit} onChange={e=>setForm(v=>({...v,takeProfit:Number(e.target.value)}))}/><b>%</b></div></label><label><span>Stop loss</span><select value={form.stopEnabled?"On":"Off"} onChange={e=>setForm(v=>({...v,stopEnabled:e.target.value==="On"}))}><option>Off</option><option>On</option></select></label>{form.stopEnabled&&<label><span>Stop loss distance</span><div className={cfg.unit}><input type="number" min="0.1" step="0.1" value={form.stopPct} onChange={e=>setForm(v=>({...v,stopPct:Number(e.target.value)}))}/><b>%</b></div></label>}</div></section>';
const newExit=`<section className={cfg.card}><div className={cfg.cardHead}><div><h3>Exit settings</h3><p>Configure Take Profit, optional trailing after the TP threshold, and Stop Loss protection.</p></div><button type="button" className={cfg.addButton} disabled={form.takeProfitTargets.length>=8||form.trailingPct>0} onClick={addTp}>＋ Add TP</button></div>
      <div className={cfg.tpList}>{form.takeProfitTargets.map((target,index)=><div className={cfg.tpRow} key={index}><strong>TP{index+1}</strong><label><span>Target profit</span><div className={cfg.unit}><input type="number" min="0.1" step="0.1" value={target.profitPct} onChange={e=>updateTp(index,{profitPct:Number(e.target.value)})}/><b>%</b></div></label><label><span>Sell allocation</span><div className={cfg.unit}><input type="number" min="0.01" max="100" step="0.01" value={target.allocationPct} onChange={e=>updateTp(index,{allocationPct:Number(e.target.value)})}/><b>%</b></div></label>{form.takeProfitTargets.length>1?<button type="button" className={cfg.removeTp} onClick={()=>removeTp(index)}>Remove</button>:<span/>}</div>)}</div>
      <div className={cfg.tpTotal}><span>Total position allocation</span><b>{form.takeProfitTargets.reduce((sum,target)=>sum+target.allocationPct,0).toFixed(2)}%</b></div>
      <div className={cfg.exitDivider}/>
      <div className={cfg.grid}><label><span>Trailing take profit</span><select disabled={form.takeProfitTargets.length>1} value={form.trailingPct>0?"On":"Off"} onChange={e=>setForm(v=>({...v,trailingPct:e.target.value==="On"?Math.max(.1,v.trailingPct||.5):0}))}><option>Off</option><option>On</option></select><small>{form.takeProfitTargets.length>1?"Available with a single TP target.":"After the TP target is reached, follow the highest price instead of selling immediately."}</small></label>{form.trailingPct>0&&<label><span>Trailing deviation</span><div className={cfg.unit}><input type="number" min="0.1" max="99.9" step="0.1" value={form.trailingPct} onChange={e=>setForm(v=>({...v,trailingPct:Math.max(.1,Math.min(99.9,Number(e.target.value)))}))}/><b>%</b></div><small>Exit when price falls this far from the highest price reached after TP activation.</small></label>}</div>
      <div className={cfg.exitDivider}/>
      <div className={cfg.grid}><label><span>Stop loss</span><select value={form.stopEnabled?"On":"Off"} onChange={e=>setForm(v=>({...v,stopEnabled:e.target.value==="On"}))}><option>Off</option><option>On</option></select></label>{form.stopEnabled&&<><label><span>Stop loss distance</span><div className={cfg.unit}><input type="number" min="0.1" step="0.1" value={form.stopPct} onChange={e=>setForm(v=>({...v,stopPct:Number(e.target.value)}))}/><b>%</b></div></label><label><span>Stop loss timeout</span><select value={form.stopLossTimeoutSeconds>0?"Timeout":"Immediate"} onChange={e=>setForm(v=>({...v,stopLossTimeoutSeconds:e.target.value==="Timeout"?Math.max(1,v.stopLossTimeoutSeconds||30):0}))}><option>Immediate</option><option>Timeout</option></select><small>If price recovers above the stop before the timer finishes, the timer resets.</small></label>{form.stopLossTimeoutSeconds>0&&<label><span>Timeout duration</span><div className={cfg.unit}><input type="number" min="1" max="86400" step="1" value={form.stopLossTimeoutSeconds} onChange={e=>setForm(v=>({...v,stopLossTimeoutSeconds:Math.max(1,Math.min(86400,Number(e.target.value)))}))}/><b>sec</b></div></label>}</>}</div>
      {accountKind==="real"&&<div className={cfg.liveNote}>Each exit executes as a real Binance Spot sell. Small exits still have to satisfy Binance minimum-order rules.</div>}
    </section>`;
replace(oldExit,newExit,'exit settings UI');
source=source.replace('Real Account · Shadow execution remains locked until Live is explicitly enabled.','Real Account · Binance Spot execution follows the account Live state.');
fs.writeFileSync(file,source);

let css=fs.readFileSync(cssFile,"utf8");
if(!css.includes('.tpList{')) css += `.tpList{display:grid;gap:7px}.tpRow{display:grid;grid-template-columns:42px minmax(0,1fr) minmax(0,1fr) auto;gap:9px;align-items:end;border:1px solid #383838;background:#1f1f1f;border-radius:12px;padding:10px}.tpRow>strong{align-self:center;font-size:10px;color:#63dda7}.tpRow label{display:grid;gap:6px}.tpRow label>span{font-size:8px;color:#777}.tpRow input{width:100%;height:38px;border:1px solid #3c3c3c;background:#1d1d1d;color:#eee;border-radius:10px;padding:0 10px;font:10px Tahoma,Arial,sans-serif;outline:none}.removeTp{height:38px;border:0;background:transparent;color:#bd7d82;font:8px Tahoma,Arial,sans-serif;cursor:pointer}.tpTotal{display:flex;justify-content:flex-end;gap:10px;padding:9px 2px 0;font-size:8px;color:#777}.tpTotal b{color:#ddd}.exitDivider{height:1px;background:#343434;margin:14px 0}.liveNote{margin-top:12px;border:1px solid #3a473f;background:#202823;border-radius:10px;padding:9px 11px;color:#7f9487;font-size:8px;line-height:1.45}@media(max-width:680px){.tpRow{grid-template-columns:36px 1fr 1fr}.removeTp{grid-column:2/-1}}`;
fs.writeFileSync(cssFile,css);
console.log("Multi Take Profit, Trailing Take Profit and Stop Loss timeout configuration prepared");
