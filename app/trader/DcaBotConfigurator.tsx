"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { browserSupabase } from "../../lib/supabase-browser";
import cfg from "./dca-bot-configurator.module.css";

type Mode = "create" | "view" | "edit";
type Condition = {
  id: string;
  kind: string;
  timeframe: string;
  length: number;
  comparator: string;
  signal: number;
  aux1: number;
  aux2: number;
  aux3: number;
};
type BotDetail = {
  id: string;
  name: string;
  status: string;
  lifecycle: string;
  pair: string;
  pairs: string[];
  allPairs: boolean;
  baseOrder: number;
  safetyOrder: number;
  maxSafetyOrders: number;
  limitSafetyOrders: number;
  maxActiveTrades: number;
  deviation: number;
  stepScale: number;
  volumeScale: number;
  takeProfit: number;
  stopEnabled: boolean;
  stopPct: number;
  conditions: Condition[];
  startCondition: string;
  executionMode: string;
};
type FormState = Omit<BotDetail, "id"|"status"|"lifecycle"|"startCondition"|"executionMode">;
type PairInfo = { pair:string; symbol:string; baseAsset:string };
type Props = {
  mode: Mode;
  accountId: string;
  accountKind: "paper" | "real";
  botId: string | null;
  onCancel: () => void;
  onSaved: (botId: string, action: "create" | "update") => void;
  onError: (message: string) => void;
};

const INDICATORS = [
  "RSI",
  "Stochastic",
  "MACD",
  "Moving Average (MA)",
  "Average Directional Index",
  "Bollinger Bands %B",
  "Money Flow Index",
  "Commodity Channel Index",
  "Ultimate Oscillator",
  "Parabolic SAR",
  "Heikin Ashi",
];
const TIMEFRAMES = ["1 minute","3 minutes","5 minutes","15 minutes","30 minutes","1 hour","2 hours","4 hours","6 hours","8 hours","12 hours","1 day","3 days","1 week","1 month"];
const FALLBACK_PAIRS = ["BTC/USDT","ETH/USDT","BNB/USDT","SOL/USDT","XRP/USDT","ADA/USDT","DOGE/USDT","TRX/USDT","AVAX/USDT","LINK/USDT"];

function conditionDefaults(kind = "RSI", index = 0): Condition {
  const base: Condition = { id:`condition-${Date.now()}-${index}-${Math.random().toString(16).slice(2)}`, kind, timeframe:"15 minutes", length:14, comparator:"Less Than", signal:30, aux1:0, aux2:0, aux3:0 };
  if (kind === "Stochastic") return {...base,length:2,signal:20,aux1:14,aux2:1,aux3:3};
  if (kind === "MACD") return {...base,length:1,comparator:"Crossing Up",signal:0,aux1:12,aux2:26,aux3:9};
  if (kind === "Moving Average (MA)") return {...base,length:0,comparator:"Crossing Up",signal:0,aux1:1,aux2:9,aux3:26};
  if (kind === "Average Directional Index") return {...base,length:14,comparator:"Greater Than",signal:25};
  if (kind === "Bollinger Bands %B") return {...base,length:20,comparator:"Less Than",signal:0,aux1:2};
  if (kind === "Money Flow Index") return {...base,length:14,comparator:"Less Than",signal:20};
  if (kind === "Commodity Channel Index") return {...base,length:20,comparator:"Less Than",signal:-100};
  if (kind === "Ultimate Oscillator") return {...base,length:0,comparator:"Less Than",signal:30,aux1:7,aux2:14,aux3:28};
  if (kind === "Parabolic SAR") return {...base,length:0,comparator:"Crossing Up",signal:0,aux1:2,aux2:1};
  if (kind === "Heikin Ashi") return {...base,length:2,comparator:"Greater Than",signal:0};
  return base;
}
const NEW_FORM: FormState = {
  name:"My DCA Bot", pair:"BTC/USDT", pairs:["BTC/USDT"], allPairs:false,
  baseOrder:25, safetyOrder:25, maxSafetyOrders:5, limitSafetyOrders:1, maxActiveTrades:1,
  deviation:1, stepScale:1, volumeScale:1, takeProfit:1.5, stopEnabled:false, stopPct:8, conditions:[],
};
function money(value:number) { return new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:2}).format(Number.isFinite(value)?value:0); }
function capital(form:FormState) {
  let total=Math.max(0,form.baseOrder);
  for(let i=0;i<Math.max(0,Math.round(form.maxSafetyOrders));i++) total+=Math.max(0,form.safetyOrder)*Math.pow(Math.max(.000001,form.volumeScale),i);
  return total;
}
function summary(c:Condition) {
  const tf=c.timeframe;
  if(c.kind==="RSI") return `RSI ${c.length} ${c.comparator.toLowerCase()} ${c.signal} · ${tf}`;
  if(c.kind==="Stochastic") return `Stochastic (${c.aux1}, ${c.aux2}, ${c.aux3}) ${c.comparator.toLowerCase()} ${c.signal} + %K crosses ${c.length===1?"down":"up"} %D · ${tf}`;
  if(c.kind==="MACD") return `MACD ${c.aux1}/${c.aux2}/${c.aux3} ${c.comparator.toLowerCase()} signal line · ${c.length===1?"above":"below"} zero · ${tf}`;
  if(c.kind==="Moving Average (MA)") return `${c.aux1===1?"EMA":c.aux1===2?"WMA":"SMA"} ${c.aux2} ${c.comparator.toLowerCase()} ${c.aux3} · ${tf}`;
  if(c.kind==="Parabolic SAR") return `Price crosses above Parabolic SAR · step ${(c.aux1/100).toFixed(2)} · max ${(c.aux2/5).toFixed(2)} · ${tf}`;
  if(c.kind==="Heikin Ashi") return `${c.length} consecutive bullish Heikin Ashi candles · ${tf}`;
  if(c.kind==="Ultimate Oscillator") return `Ultimate ${c.aux1}/${c.aux2}/${c.aux3} ${c.comparator.toLowerCase()} ${c.signal} · ${tf}`;
  if(c.kind==="Bollinger Bands %B") return `Bollinger %B ${c.length}, ${c.aux1}σ ${c.comparator.toLowerCase()} ${c.signal} · ${tf}`;
  return `${c.kind} ${c.length||""} ${c.comparator.toLowerCase()} ${c.signal} · ${tf}`.replace(/\s+/g," ");
}
async function invokeDca(body:Record<string,unknown>) {
  const {data,error}=await browserSupabase.functions.invoke("trader-dca-control",{body});
  if(error){
    let message=error.message||"trader_dca_control_failed";
    const context=(error as {context?:Response}).context;
    if(context){try{const payload=await context.clone().json() as {error?:string};if(payload.error)message=payload.error;}catch{}}
    throw new Error(message);
  }
  const result=(data??{}) as {ok?:boolean;bot?:BotDetail;botId?:string;error?:string};
  if(result.error||result.ok!==true)throw new Error(result.error||"trader_dca_control_failed");
  return result;
}

export default function DcaBotConfigurator({mode,accountId,accountKind,botId,onCancel,onSaved,onError}:Props){
  const [form,setForm]=useState<FormState>({...NEW_FORM});
  const [pairs,setPairs]=useState<PairInfo[]>(FALLBACK_PAIRS.map(pair=>({pair,symbol:pair.replace("/",""),baseAsset:pair.split("/")[0]})));
  const [pairQuery,setPairQuery]=useState("");
  const [loading,setLoading]=useState(mode!=="create");
  const [saving,setSaving]=useState(false);
  const [localError,setLocalError]=useState("");

  useEffect(()=>{let alive=true;void fetch("/api/trader/binance-pairs",{cache:"no-store"}).then(r=>r.json()).then((data:{pairs?:PairInfo[]})=>{if(alive&&data.pairs?.length)setPairs(data.pairs);}).catch(()=>{});return()=>{alive=false};},[]);
  useEffect(()=>{
    let alive=true;
    if(mode==="create"||!botId){setForm({...NEW_FORM,pairs:["BTC/USDT"]});setLoading(false);return()=>{alive=false};}
    setLoading(true);setLocalError("");
    void invokeDca({action:"bot_detail",accountId,botId}).then(result=>{if(!alive||!result.bot)return;const bot=result.bot;setForm({name:bot.name,pair:bot.pair,pairs:bot.pairs?.length?bot.pairs:[bot.pair],allPairs:bot.allPairs,baseOrder:bot.baseOrder,safetyOrder:bot.safetyOrder,maxSafetyOrders:bot.maxSafetyOrders,limitSafetyOrders:bot.limitSafetyOrders,maxActiveTrades:bot.maxActiveTrades,deviation:bot.deviation,stepScale:bot.stepScale,volumeScale:bot.volumeScale,takeProfit:bot.takeProfit,stopEnabled:bot.stopEnabled,stopPct:bot.stopPct,conditions:bot.conditions??[]});}).catch(err=>{if(alive)setLocalError(err instanceof Error?err.message:"Unable to load bot configuration.");}).finally(()=>{if(alive)setLoading(false);});
    return()=>{alive=false};
  },[accountId,botId,mode]);

  const visiblePairs=useMemo(()=>{const q=pairQuery.trim().toUpperCase();return pairs.filter(item=>!q||item.pair.includes(q)||item.baseAsset.includes(q));},[pairs,pairQuery]);
  const plannedPerTrade=capital(form);
  const ladder=useMemo(()=>{let cumulative=0,step=Math.max(.000001,form.deviation);return Array.from({length:Math.max(0,Math.min(50,Math.round(form.maxSafetyOrders)))},(_,index)=>{cumulative+=step;const order=form.safetyOrder*Math.pow(Math.max(.000001,form.volumeScale),index);step*=Math.max(.000001,form.stepScale);return{index:index+1,drop:cumulative,order};});},[form]);
  const updateCondition=(id:string,patch:Partial<Condition>)=>setForm(value=>({...value,conditions:value.conditions.map(item=>item.id===id?{...item,...patch}:item)}));
  const changeKind=(id:string,kind:string)=>setForm(value=>({...value,conditions:value.conditions.map((item,index)=>item.id===id?{...conditionDefaults(kind,index),id}:item)}));
  const togglePair=(pair:string)=>setForm(value=>{const exists=value.pairs.includes(pair);const next=exists?value.pairs.filter(item=>item!==pair):[...value.pairs,pair];return{...value,pairs:next,pair:next[0]||value.pair};});

  const save=async(event:FormEvent)=>{
    event.preventDefault();
    if(saving)return;
    if(!form.name.trim())return setLocalError("Add a bot name.");
    if(!form.allPairs&&!form.pairs.length)return setLocalError("Choose at least one Binance Spot pair or select All USDT pairs.");
    setSaving(true);setLocalError("");
    try{
      const action=mode==="create"?"create_bot":"update_bot";
      const result=await invokeDca({action,accountId,botId:mode==="create"?undefined:botId,name:form.name.trim(),pair:form.pairs[0]||form.pair,pairs:form.pairs,allPairs:form.allPairs,baseOrder:form.baseOrder,safetyOrder:form.safetyOrder,maxSafetyOrders:form.maxSafetyOrders,limitSafetyOrders:form.limitSafetyOrders,maxActiveTrades:form.maxActiveTrades,deviation:form.deviation,stepScale:form.stepScale,volumeScale:form.volumeScale,takeProfit:form.takeProfit,stopEnabled:form.stopEnabled,stopPct:form.stopPct,conditions:form.conditions});
      onSaved(String(result.botId||botId||""),mode==="create"?"create":"update");
    }catch(caught){
      const message=caught instanceof Error?caught.message:"Unable to save bot.";
      const friendly=message.includes("bot_pairs_locked_by_active_trade")?"Coin selection cannot be changed while this bot has active trades. Its strategy, DCA and exit settings can still be edited.":message.includes("exchange_connection_required")?"Connect Binance before creating a Real Account bot.":message;
      setLocalError(friendly);onError(friendly);
    }finally{setSaving(false);}
  };

  if(loading)return <div className={cfg.loading}>Loading full DCA configuration…</div>;
  if(mode==="view")return <div className={cfg.body}>
    {localError&&<div className={cfg.error}>{localError}</div>}
    <div className={cfg.summaryGrid}><div><span>Coin universe</span><b>{form.allPairs?"All USDT Spot pairs":`${form.pairs.length} selected pair${form.pairs.length===1?"":"s"}`}</b></div><div><span>Max simultaneous trades</span><b>{form.maxActiveTrades}</b></div><div><span>Entry conditions</span><b>{form.conditions.length||"Immediate"}</b></div><div><span>Capital / trade</span><b>{money(plannedPerTrade)}</b></div></div>
    <section className={cfg.card}><div className={cfg.cardHead}><div><h3>Coins</h3><p>{form.allPairs?"The worker scans the complete Binance Spot USDT universe.":"The bot scans only these selected markets."}</p></div></div>{form.allPairs?<div className={cfg.allBadge}>ALL BINANCE USDT SPOT PAIRS</div>:<div className={cfg.chips}>{form.pairs.map(pair=><span key={pair}>{pair}</span>)}</div>}</section>
    <section className={cfg.card}><div className={cfg.cardHead}><div><h3>Entry conditions</h3><p>All configured conditions must be true on closed candles before a new trade opens.</p></div></div>{form.conditions.length?<div className={cfg.conditionList}>{form.conditions.map((condition,index)=><div className={cfg.readCondition} key={condition.id}><span>{index+1}</span><div><strong>{condition.kind}</strong><small>{summary(condition)}</small></div></div>)}</div>:<div className={cfg.immediate}>Immediately — no indicator filter.</div>}</section>
    <div className={cfg.readGrid}><section className={cfg.card}><h3>DCA orders</h3><div className={cfg.rows}><div><span>Base order</span><b>{money(form.baseOrder)}</b></div><div><span>Safety order</span><b>{money(form.safetyOrder)}</b></div><div><span>Max safety orders</span><b>{form.maxSafetyOrders}</b></div><div><span>Active safety orders</span><b>{form.limitSafetyOrders}</b></div><div><span>Deviation</span><b>{form.deviation}%</b></div><div><span>Step scale</span><b>{form.stepScale}×</b></div><div><span>Volume scale</span><b>{form.volumeScale}×</b></div></div></section><section className={cfg.card}><h3>Exit & capacity</h3><div className={cfg.rows}><div><span>Take profit</span><b>{form.takeProfit}%</b></div><div><span>Stop loss</span><b>{form.stopEnabled?`${form.stopPct}%`:"Off"}</b></div><div><span>Max active trades</span><b>{form.maxActiveTrades}</b></div><div><span>Maximum planned bot capital</span><b>{money(plannedPerTrade*form.maxActiveTrades)}</b></div></div></section></div>
  </div>;

  return <form className={cfg.body} onSubmit={save}>
    {localError&&<div className={cfg.error}>{localError}</div>}
    <section className={cfg.card}><div className={cfg.cardHead}><div><h3>Main settings</h3><p>Name, order size and maximum number of positions the bot may run at the same time.</p></div></div><div className={cfg.grid}><label><span>Bot name</span><input value={form.name} onChange={e=>setForm(v=>({...v,name:e.target.value}))}/></label><label><span>Base order</span><div className={cfg.unit}><input type="number" min="1" step="0.01" value={form.baseOrder} onChange={e=>setForm(v=>({...v,baseOrder:Number(e.target.value)}))}/><b>USDT</b></div></label><label><span>Max simultaneous trades</span><input type="number" min="1" max="20" value={form.maxActiveTrades} onChange={e=>setForm(v=>({...v,maxActiveTrades:Math.max(1,Math.min(20,Number(e.target.value)))}))}/><small>Across the bot’s selected coin universe.</small></label><label><span>Direction</span><input value="Long" disabled/></label></div></section>

    <section className={cfg.card}><div className={cfg.cardHead}><div><h3>Coins</h3><p>Use every Binance Spot USDT pair or build a custom market list.</p></div><div className={cfg.modeButtons}><button type="button" className={form.allPairs?cfg.active:""} onClick={()=>setForm(v=>({...v,allPairs:true}))}>All coins</button><button type="button" className={!form.allPairs?cfg.active:""} onClick={()=>setForm(v=>({...v,allPairs:false}))}>Selected coins</button></div></div>{form.allPairs?<div className={cfg.allBox}><strong>All Binance USDT Spot pairs</strong><p>The server scans the live Binance Spot universe and ranks the scan by liquidity. Your max simultaneous trades limit still applies.</p></div>:<><div className={cfg.pairTools}><input placeholder="Search BTC, ETH, SOL…" value={pairQuery} onChange={e=>setPairQuery(e.target.value)}/><span>{form.pairs.length} selected</span><button type="button" onClick={()=>setForm(v=>({...v,pairs:pairs.map(item=>item.pair),pair:pairs[0]?.pair||v.pair}))}>Select all</button><button type="button" onClick={()=>setForm(v=>({...v,pairs:[]}))}>Clear</button></div><div className={cfg.pairList}>{visiblePairs.map(item=><label className={form.pairs.includes(item.pair)?cfg.pairSelected:""} key={item.pair}><input type="checkbox" checked={form.pairs.includes(item.pair)} onChange={()=>togglePair(item.pair)}/><span><b>{item.baseAsset}</b><small>{item.pair}</small></span></label>)}</div></>}</section>

    <section className={cfg.card}><div className={cfg.cardHead}><div><h3>Entry conditions</h3><p>3Commas-style indicator filters. Conditions are combined with AND and evaluated on closed Binance candles.</p></div><button type="button" className={cfg.addButton} onClick={()=>setForm(v=>({...v,conditions:[...v.conditions,conditionDefaults("RSI",v.conditions.length)]}))}>＋ Add condition</button></div>{form.conditions.length?<div className={cfg.conditions}>{form.conditions.map((condition,index)=><div className={cfg.condition} key={condition.id}><div className={cfg.conditionTop}><span>Condition {index+1}</span><button type="button" onClick={()=>setForm(v=>({...v,conditions:v.conditions.filter(item=>item.id!==condition.id)}))}>Remove</button></div><div className={cfg.grid}><label><span>Indicator</span><select value={condition.kind} onChange={e=>changeKind(condition.id,e.target.value)}>{INDICATORS.map(item=><option key={item}>{item}</option>)}</select></label><label><span>Timeframe</span><select value={condition.timeframe} onChange={e=>updateCondition(condition.id,{timeframe:e.target.value})}>{TIMEFRAMES.map(item=><option key={item}>{item}</option>)}</select></label><ConditionFields condition={condition} update={patch=>updateCondition(condition.id,patch)}/></div><div className={cfg.conditionSummary}>{summary(condition)}</div></div>)}</div>:<div className={cfg.immediate}>No conditions: the bot may enter immediately when capacity and capital are available.</div>}</section>

    <section className={cfg.card}><div className={cfg.cardHead}><div><h3>Averaging orders</h3><p>Configure the safety-order ladder and how much of it stays active at once.</p></div></div><div className={cfg.grid}><label><span>Safety order</span><div className={cfg.unit}><input type="number" min="1" step="0.01" value={form.safetyOrder} onChange={e=>setForm(v=>({...v,safetyOrder:Number(e.target.value)}))}/><b>USDT</b></div></label><label><span>Max safety orders</span><input type="number" min="0" max="50" value={form.maxSafetyOrders} onChange={e=>{const max=Math.max(0,Math.min(50,Number(e.target.value)));setForm(v=>({...v,maxSafetyOrders:max,limitSafetyOrders:max===0?0:Math.min(max,Math.max(1,v.limitSafetyOrders))}));}}/></label><label><span>Active safety orders</span><input type="number" min="0" max={form.maxSafetyOrders} value={form.limitSafetyOrders} onChange={e=>setForm(v=>({...v,limitSafetyOrders:v.maxSafetyOrders===0?0:Math.min(v.maxSafetyOrders,Math.max(1,Number(e.target.value)))}))}/></label><label><span>Price deviation</span><div className={cfg.unit}><input type="number" min="0.1" step="0.1" value={form.deviation} onChange={e=>setForm(v=>({...v,deviation:Number(e.target.value)}))}/><b>%</b></div></label><label><span>Step scale</span><input type="number" min="0.1" step="0.1" value={form.stepScale} onChange={e=>setForm(v=>({...v,stepScale:Number(e.target.value)}))}/></label><label><span>Volume scale</span><input type="number" min="0.1" step="0.1" value={form.volumeScale} onChange={e=>setForm(v=>({...v,volumeScale:Number(e.target.value)}))}/></label></div></section>

    <section className={cfg.card}><div className={cfg.cardHead}><div><h3>Exit settings</h3><p>Take profit and optional stop loss for each new trade.</p></div></div><div className={cfg.grid}><label><span>Take profit</span><div className={cfg.unit}><input type="number" min="0.1" step="0.1" value={form.takeProfit} onChange={e=>setForm(v=>({...v,takeProfit:Number(e.target.value)}))}/><b>%</b></div></label><label><span>Stop loss</span><select value={form.stopEnabled?"On":"Off"} onChange={e=>setForm(v=>({...v,stopEnabled:e.target.value==="On"}))}><option>Off</option><option>On</option></select></label>{form.stopEnabled&&<label><span>Stop loss distance</span><div className={cfg.unit}><input type="number" min="0.1" step="0.1" value={form.stopPct} onChange={e=>setForm(v=>({...v,stopPct:Number(e.target.value)}))}/><b>%</b></div></label>}</div></section>

    <section className={cfg.preview}><div className={cfg.previewSummary}><div><span>Planned capital / trade</span><b>{money(plannedPerTrade)}</b></div><div><span>Max simultaneous trades</span><b>{form.maxActiveTrades}</b></div><div><span>Maximum planned bot capital</span><b>{money(plannedPerTrade*form.maxActiveTrades)}</b></div></div><div className={cfg.previewHead}><span>#</span><span>Cumulative drop</span><span>Order amount</span><span>Window</span></div>{ladder.map(row=><div className={cfg.previewRow} key={row.index}><span>{row.index}</span><span>-{row.drop.toFixed(2)}%</span><span>{money(row.order)}</span><span>{row.index<=form.limitSafetyOrders?"Active":"Queued"}</span></div>)}</section>
    <div className={cfg.footer}><span>{accountKind==="real"?"Real Account · Shadow execution remains locked until Live is explicitly enabled.":"Paper Account · simulated execution."}</span><div><button type="button" onClick={onCancel}>Cancel</button><button className={cfg.save} disabled={saving}>{saving?"Saving…":mode==="create"?"Create DCA Bot":"Save changes"}</button></div></div>
  </form>;
}

function ConditionFields({condition,update}:{condition:Condition;update:(patch:Partial<Condition>)=>void}){
  const numeric=(label:string,key:"length"|"signal"|"aux1"|"aux2"|"aux3",min?:number,step?:number)=><label><span>{label}</span><input type="number" min={min} step={step??1} value={condition[key]} onChange={e=>update({[key]:Number(e.target.value)})}/></label>;
  const comparator=(options=["Less Than","Greater Than","Crossing Up","Crossing Down"])=><label><span>Condition</span><select value={condition.comparator} onChange={e=>update({comparator:e.target.value})}>{options.map(item=><option key={item}>{item}</option>)}</select></label>;
  if(condition.kind==="RSI")return <>{numeric("RSI length","length",1)}{comparator()}{numeric("Signal value","signal",0,.1)}</>;
  if(condition.kind==="Stochastic")return <>{numeric("%K length","aux1",1)}{numeric("%K smoothing","aux2",1)}{numeric("%D smoothing","aux3",1)}{comparator(["Less Than","Greater Than"])}{numeric("Threshold","signal",0,.1)}<label><span>%K / %D cross</span><select value={condition.length===1?"Down":"Up"} onChange={e=>update({length:e.target.value==="Down"?1:2})}><option>Up</option><option>Down</option></select></label></>;
  if(condition.kind==="MACD")return <>{numeric("Fast length","aux1",1)}{numeric("Slow length","aux2",1)}{numeric("Signal length","aux3",1)}{comparator(["Crossing Up","Crossing Down"])}<label><span>MACD zone</span><select value={condition.length===1?"Above zero":"Below zero"} onChange={e=>update({length:e.target.value==="Above zero"?1:2})}><option>Above zero</option><option>Below zero</option></select></label></>;
  if(condition.kind==="Moving Average (MA)")return <><label><span>MA type</span><select value={condition.aux1} onChange={e=>update({aux1:Number(e.target.value)})}><option value={0}>SMA</option><option value={1}>EMA</option><option value={2}>WMA</option></select></label>{numeric("Fast MA","aux2",1)}{numeric("Slow MA","aux3",1)}{comparator(["Crossing Up","Crossing Down"])}</>;
  if(condition.kind==="Average Directional Index")return <>{numeric("ADX length","length",1)}{comparator()}{numeric("ADX value","signal",0,.1)}</>;
  if(condition.kind==="Bollinger Bands %B")return <>{numeric("Length","length",1)}{numeric("Deviation σ","aux1",.1,.1)}{comparator()}{numeric("%B value","signal",undefined,.01)}</>;
  if(condition.kind==="Money Flow Index")return <>{numeric("MFI length","length",1)}{comparator()}{numeric("MFI value","signal",0,.1)}</>;
  if(condition.kind==="Commodity Channel Index")return <>{numeric("CCI length","length",1)}{comparator()}{numeric("CCI value","signal",undefined,.1)}</>;
  if(condition.kind==="Ultimate Oscillator")return <>{numeric("Fast period","aux1",1)}{numeric("Middle period","aux2",1)}{numeric("Slow period","aux3",1)}{comparator()}{numeric("Value","signal",0,.1)}</>;
  if(condition.kind==="Parabolic SAR")return <>{numeric("Step (%)","aux1",.1,.1)}{numeric("Max step factor","aux2",.1,.1)}<label><span>Long entry signal</span><input value="Price crosses above SAR" disabled/></label></>;
  if(condition.kind==="Heikin Ashi")return <>{numeric("Consecutive bullish candles","length",1)}<label><span>Long entry signal</span><input value="Bullish Heikin Ashi candles" disabled/></label></>;
  return null;
}
