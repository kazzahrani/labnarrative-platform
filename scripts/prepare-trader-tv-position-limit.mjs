import fs from "node:fs";
import path from "node:path";

const shellPath=path.join(process.cwd(),"app","trader","TraderV2FullShell.tsx");
const configuratorPath=path.join(process.cwd(),"app","trader","TradingViewStrategyConfigurator.tsx");
for(const target of[shellPath,configuratorPath])if(!fs.existsSync(target))throw new Error(`TradingView position-limit target missing: ${target}`);
let source=fs.readFileSync(shellPath,"utf8");
let configurator=fs.readFileSync(configuratorPath,"utf8");

function replaceConfig(from,to,label){if(!configurator.includes(from))throw new Error(`TradingView position-limit configurator missing ${label}`);configurator=configurator.replace(from,to)}
function replaceShell(from,to,label){if(!source.includes(from))throw new Error(`TradingView position-limit shell missing ${label}`);source=source.replace(from,to)}

replaceConfig(
  'type Strategy={id:string;name:string;orderAmount:number|null;sizingMode:SizingMode;status:string;lifecycle:string;executionMode:string;automationType:string;tradingViewEnabled:boolean;maxSingleOrder:number|null;takeProfitEnabled:boolean;takeProfitTargets:TpTarget[];stopEnabled:boolean;stopPct:number};',
  'type Strategy={id:string;name:string;orderAmount:number|null;sizingMode:SizingMode;status:string;lifecycle:string;executionMode:string;automationType:string;tradingViewEnabled:boolean;maxSingleOrder:number|null;maxOpenPositions:number|null;takeProfitEnabled:boolean;takeProfitTargets:TpTarget[];stopEnabled:boolean;stopPct:number};',
  'Strategy type',
);
configurator=configurator.replaceAll('trader-tradingview-strategy-control','trader-tradingview-strategy-config');
replaceConfig(
  '[orderAmount,setOrderAmount]=useState(10),[takeProfitEnabled,setTakeProfitEnabled]=useState(false)',
  '[orderAmount,setOrderAmount]=useState(10),[maxOpenPositions,setMaxOpenPositions]=useState<number|null>(5),[takeProfitEnabled,setTakeProfitEnabled]=useState(false)',
  'position-limit state',
);
replaceConfig(
  'if(r.strategy.orderAmount&&r.strategy.orderAmount>0)setOrderAmount(r.strategy.orderAmount);setTakeProfitEnabled(r.strategy.takeProfitEnabled===true);',
  'if(r.strategy.orderAmount&&r.strategy.orderAmount>0)setOrderAmount(r.strategy.orderAmount);setMaxOpenPositions(r.strategy.maxOpenPositions);setTakeProfitEnabled(r.strategy.takeProfitEnabled===true);',
  'position-limit load',
);
replaceConfig(
  'if(stopEnabled&&(!(stopPct>0)||stopPct>=100))return setLocalError("Stop Loss must be greater than 0% and below 100%.");setSaving(true);',
  'if(stopEnabled&&(!(stopPct>0)||stopPct>=100))return setLocalError("Stop Loss must be greater than 0% and below 100%.");if(maxOpenPositions!==null&&(!Number.isInteger(maxOpenPositions)||maxOpenPositions<1||maxOpenPositions>100))return setLocalError("Maximum open positions must be between 1 and 100, or Unlimited.");setSaving(true);',
  'position-limit validation',
);
replaceConfig(
  'name:name.trim(),sizingMode,orderAmount,takeProfitEnabled,takeProfitTargets,stopEnabled,stopPct',
  'name:name.trim(),sizingMode,orderAmount,maxOpenPositions:maxOpenPositions===null?"unlimited":maxOpenPositions,takeProfitEnabled,takeProfitTargets,stopEnabled,stopPct',
  'position-limit save payload',
);
replaceConfig(
  'raw.includes("invalid_stop_loss")?"Stop Loss must be greater than 0% and below 100%.":raw;',
  'raw.includes("invalid_stop_loss")?"Stop Loss must be greater than 0% and below 100%.":raw.includes("invalid_max_open_positions")?"Maximum open positions must be between 1 and 100, or Unlimited.":raw;',
  'position-limit error copy',
);
replaceConfig(
  '<div><span>Position sizing</span><b>{sizingLabel(sizingMode,strategy?.orderAmount??orderAmount)}</b></div><div><span>Exit Protection</span>',
  '<div><span>Position sizing</span><b>{sizingLabel(sizingMode,strategy?.orderAmount??orderAmount)}</b></div><div><span>Maximum open positions</span><b>{maxOpenPositions===null?"Unlimited":maxOpenPositions}</b></div><div><span>Exit Protection</span>',
  'view summary',
);
replaceConfig(
  '{sizingMode==="fixed_quote"&&<label><span>Fixed BUY amount</span><div className={cfg.unit}><input type="number" min="0.01" step="0.01" value={orderAmount} onChange={e=>setOrderAmount(Number(e.target.value))}/><b>USDT</b></div></label>}</div></section><section className={cfg.card}><div className={cfg.cardHead}><div><h3>Execution</h3>',
  '{sizingMode==="fixed_quote"&&<label><span>Fixed BUY amount</span><div className={cfg.unit}><input type="number" min="0.01" step="0.01" value={orderAmount} onChange={e=>setOrderAmount(Number(e.target.value))}/><b>USDT</b></div></label>}<label><span>Maximum open positions</span><select value={maxOpenPositions===null?"unlimited":String(maxOpenPositions)} onChange={e=>setMaxOpenPositions(e.target.value==="unlimited"?null:Number(e.target.value))}><option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="5">5</option><option value="10">10</option><option value="25">25</option><option value="50">50</option><option value="100">100</option><option value="unlimited">Unlimited</option></select><small>Counts distinct open symbols. Additional BUYs on an already-open symbol do not consume another position slot.</small></label></div></section><section className={cfg.card}><div className={cfg.cardHead}><div><h3>Execution</h3>',
  'position-limit editor',
);
replaceConfig(
  '<div><span>Direction</span><b>Long Spot only · shorts ignored</b></div></div></section>',
  '<div><span>Direction</span><b>Long Spot only · shorts ignored</b></div><div><span>Position safety</span><b>Strategy limit · account limit uses the stricter cap</b></div></div></section>',
  'execution safety copy',
);
replaceConfig(
  'One Strategy Message carries symbol, BUY/SELL, sizing and position-state context for the complete TradingView order stream.',
  'One Strategy Message carries symbol, BUY/SELL, sizing and position-state context for the complete TradingView order stream. Maximum open positions is strategy-specific; the Real Account safety cap can only make it stricter.',
  'footer safety copy',
);

replaceShell(
  '<span className={dca.botCell}>{bot.activeTradeCount} / {bot.maxActiveTrades}</span>',
  '{bot.automationType === "tradingview_strategy" ? <span className={dca.botCell}>{bot.activeTradeCount} / {bot.maxActiveTrades >= 1000000 ? "Unlimited" : bot.maxActiveTrades}</span> : <span className={dca.botCell}>{bot.activeTradeCount} / {bot.maxActiveTrades}</span>}',
  'automation position capacity cell',
);
source=source.replaceAll('Close the active position before archiving this strategy.','Close all active positions before archiving this strategy.');

for(const marker of[
  'trader-tradingview-strategy-config',
  'maxOpenPositions:number|null',
  'Maximum open positions',
  'option value="unlimited">Unlimited</option>',
  'distinct open symbols',
  'account limit uses the stricter cap',
])if(!configurator.includes(marker))throw new Error(`TradingView position-limit final configurator missing ${marker}`);
if(!source.includes('bot.maxActiveTrades >= 1000000 ? "Unlimited" : bot.maxActiveTrades'))throw new Error('TradingView position-limit final Automations row missing Unlimited rendering');

fs.writeFileSync(shellPath,source);
fs.writeFileSync(configuratorPath,configurator);
console.log('Prepared configurable TradingView Strategy maximum-open-position limit with strategy/account safety hierarchy.');
