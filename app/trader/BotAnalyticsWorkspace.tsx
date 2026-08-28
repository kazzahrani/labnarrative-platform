"use client";

import { useEffect, useMemo, useState } from "react";
import { browserSupabase } from "../../lib/supabase-browser";
import styles from "./bot-analytics-workspace.module.css";

type SeriesPoint = { at: string; pnl: number; cumulative: number };
type PairStat = { pair: string; trades: number; pnl: number };
type ExitStat = { reason: string; trades: number; pnl: number };
type Automation = {
  id: string; name: string; type: string; status: string; executionMode: string; archived: boolean; market: string;
  activePositions: number; maxActivePositions: number | null; closedTrades: number; wins: number; losses: number; breakeven: number;
  realizedPnl: number; realizedRoi: number | null; winRate: number | null; profitFactor: number | null; grossProfit: number; grossLoss: number;
  expectancy: number | null; bestTrade: number | null; worstTrade: number | null; maxDrawdown: number; avgHoldMinutes: number | null;
  firstTradeAt: string | null; lastActivityAt: string | null; series: SeriesPoint[]; pairs: PairStat[]; exitReasons: ExitStat[];
};
type TradeDetail = { id:string; pair:string; pnl:number; roi:number|null; capital:number; averagingFilled:number; durationMinutes:number|null; closeReason:string; openedAt:string|null; closedAt:string|null; entryPrice:number|null; averagePrice:number|null; exitPrice:number|null };
type Depth = { depth:number; trades:number; wins:number; winRate:number|null; pnl:number; avgPnl:number; avgDurationMinutes:number|null };
type Month = { key:string; label:string; trades:number; wins:number; winRate:number|null; pnl:number };
type Weekday = { day:string; trades:number; wins:number; winRate:number|null; pnl:number };
type Detail = {
  recentTrades: TradeDetail[];
  dcaDepth: Depth[];
  monthly: Month[];
  weekdays: Weekday[];
  capital: { averagePerTrade:number|null; totalUsed:number; capitalDays:number; pnlPer1000:number|null; pnlPerCapitalDay:number|null };
  signals: { received:number; executed:number; ignored:number; failed:number; processing:number; executionRate:number|null; avgLatencyMs:number|null } | null;
};
type Props = { accountId:string; accountName:string; range:string; automation:Automation; automations:Automation[]; onClose:()=>void; onRangeChange:(value:string)=>void };
type Filter = { kind:"outcome"|"exit"|"pair"|"depth"; value:string } | null;
type ChartMode = "Cumulative PnL" | "Trade PnL" | "Drawdown" | "Trade frequency";

const COLORS = ["#57d99a","#e57b84","#d6a956","#79a2ef","#a98be8","#5fc3cf","#d889bd"];
const RANGE_OPTIONS = [{value:"7d",label:"7D"},{value:"30d",label:"30D"},{value:"90d",label:"90D"},{value:"all",label:"All"}];

function money(value:number|null|undefined, digits=2){ if(value==null||!Number.isFinite(value)) return "—"; const s=value>0?"+":value<0?"−":""; return `${s}$${Math.abs(value).toLocaleString("en-US",{minimumFractionDigits:digits,maximumFractionDigits:digits})}`; }
function pct(value:number|null|undefined,digits=1){ if(value==null||!Number.isFinite(value)) return "—"; const s=value>0?"+":value<0?"−":""; return `${s}${Math.abs(value).toFixed(digits)}%`; }
function duration(value:number|null|undefined){ if(value==null||!Number.isFinite(value))return"—"; if(value<60)return`${Math.round(value)}m`; if(value<1440)return`${(value/60).toFixed(value<600?1:0)}h`; return`${(value/1440).toFixed(1)}d`; }
function price(value:number|null|undefined){ if(value==null||!Number.isFinite(value))return"—"; return value>=1000?value.toLocaleString("en-US",{maximumFractionDigits:2}):value>=1?value.toLocaleString("en-US",{maximumFractionDigits:5}):value.toLocaleString("en-US",{maximumFractionDigits:8}); }
function tone(value:number|null|undefined){ return value!=null&&value>0?styles.positive:value!=null&&value<0?styles.negative:styles.neutral; }
function pf(a:Automation){ if(a.profitFactor!=null&&Number.isFinite(a.profitFactor)) return a.profitFactor.toFixed(2); if(a.wins>0&&a.losses===0&&a.grossProfit>0)return"∞"; return"—"; }
function since(range:string){ const days=range==="7d"?7:range==="30d"?30:range==="90d"?90:0; return days?new Date(Date.now()-days*86400000).toISOString():null; }
function relative(value:string|null){ if(!value)return"—"; const m=Math.max(0,Math.floor((Date.now()-Date.parse(value))/60000)); if(m<1)return"now"; if(m<60)return`${m}m ago`; if(m<1440)return`${Math.floor(m/60)}h ago`; return`${Math.floor(m/1440)}d ago`; }
function pie(parts:Array<{value:number;color:string}>){ const total=parts.reduce((s,p)=>s+Math.max(0,p.value),0); if(!total)return"conic-gradient(#303030 0deg 360deg)"; let c=0; return `conic-gradient(${parts.map(p=>{const a=c/total*360;c+=Math.max(0,p.value);return`${p.color} ${a}deg ${c/total*360}deg`;}).join(",")})`; }
function lineFor(values:number[]){ const w=900,h=230,px=16,py=16; if(!values.length)return{path:"",zero:h/2}; let min=Math.min(0,...values),max=Math.max(0,...values); if(Math.abs(max-min)<1e-9){min-=1;max+=1;} const x=(i:number)=>px+(values.length===1?(w-px*2)/2:i/(values.length-1)*(w-px*2)); const y=(v:number)=>py+(max-v)/(max-min)*(h-py*2); return{path:`M${values.map((v,i)=>`${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" L")}`,zero:y(0)}; }
function chartValues(series:SeriesPoint[],mode:ChartMode){
  if(mode==="Cumulative PnL")return series.map(p=>p.cumulative);
  if(mode==="Trade PnL")return series.map(p=>p.pnl);
  if(mode==="Drawdown"){let peak=0;return series.map(p=>{peak=Math.max(peak,p.cumulative);return -(peak-p.cumulative);});}
  const byDay=new Map<string,number>(); series.forEach(p=>{const k=new Date(p.at).toISOString().slice(0,10);byDay.set(k,(byDay.get(k)||0)+1);}); return Array.from(byDay.values());
}

export default function BotAnalyticsWorkspace({accountId,accountName,range,automation,automations,onClose,onRangeChange}:Props){
  const [detail,setDetail]=useState<Detail|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [chartMode,setChartMode]=useState<ChartMode>("Cumulative PnL");
  const [filter,setFilter]=useState<Filter>(null);
  const [compareId,setCompareId]=useState("");

  useEffect(()=>{ let cancelled=false; setLoading(true); setError(""); void (async()=>{
    const {data,error:rpcError}=await browserSupabase.rpc("trader_bot_analytics_detail",{p_account_id:accountId,p_bot_id:automation.id,p_since:since(range)});
    if(cancelled)return;
    if(rpcError){setError(rpcError.message||"Unable to load bot detail analytics.");setDetail(null);} else setDetail((data||{}) as Detail);
    setLoading(false);
  })(); return()=>{cancelled=true;}; },[accountId,automation.id,range]);

  useEffect(()=>{ const fn=(e:KeyboardEvent)=>{if(e.key==="Escape")onClose();}; window.addEventListener("keydown",fn); document.body.style.overflow="hidden"; return()=>{window.removeEventListener("keydown",fn);document.body.style.overflow="";}; },[onClose]);

  const compare=automations.find(a=>a.id===compareId)||null;
  const values=chartValues(automation.series,chartMode);
  const chart=lineFor(values);
  const selectedTone=chartMode==="Drawdown"?styles.negative:tone(values.at(-1));
  const maxPair=Math.max(.000001,...automation.pairs.map(p=>Math.abs(p.pnl)));
  const maxMonth=Math.max(.000001,...(detail?.monthly||[]).map(m=>Math.abs(m.pnl)));
  const outcomePie=pie([{value:automation.wins,color:COLORS[0]},{value:automation.losses,color:COLORS[1]},{value:automation.breakeven,color:"#747474"}]);
  const exitPie=pie(automation.exitReasons.map((r,i)=>({value:r.trades,color:COLORS[i%COLORS.length]})));

  const filteredTrades=useMemo(()=>{ const rows=detail?.recentTrades||[]; if(!filter)return rows; return rows.filter(t=>{
    if(filter.kind==="pair")return t.pair===filter.value;
    if(filter.kind==="exit")return t.closeReason===filter.value;
    if(filter.kind==="depth")return t.averagingFilled===Number(filter.value);
    if(filter.value==="win")return t.pnl>0; if(filter.value==="loss")return t.pnl<0; return t.pnl===0;
  }); },[detail,filter]);

  const filteredPnl=filteredTrades.reduce((s,t)=>s+t.pnl,0);
  const avgCapital=detail?.capital?.averagePerTrade??null;

  return <div className={styles.backdrop} onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}>
    <section className={styles.workspace}>
      <header className={styles.stickyHeader}>
        <div className={styles.identity}><small>BOT PERFORMANCE WORKSPACE</small><h2>{automation.name}</h2><div><span>{automation.type}</span><span>{automation.market}</span><span>{accountName}</span><b className={automation.status==="Running"?styles.running:""}>{automation.archived?"ARCHIVED":automation.status.toUpperCase()}</b></div></div>
        <div className={styles.headerActions}><div className={styles.ranges}>{RANGE_OPTIONS.map(r=><button key={r.value} className={range===r.value?styles.activeRange:""} onClick={()=>onRangeChange(r.value)}>{r.label}</button>)}</div><select value={compareId} onChange={e=>setCompareId(e.target.value)}><option value="">Compare with…</option>{automations.filter(a=>a.id!==automation.id).map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select><button className={styles.close} onClick={onClose}>×</button></div>
      </header>

      <div className={styles.scroll}>
        <section className={styles.kpis}>
          <article><span>Realized PnL</span><strong className={tone(automation.realizedPnl)}>{money(automation.realizedPnl)}</strong></article>
          <article><span>ROI</span><strong className={tone(automation.realizedRoi)}>{pct(automation.realizedRoi)}</strong></article>
          <article><span>Trades</span><strong>{automation.closedTrades}</strong><small>{automation.activePositions} active</small></article>
          <article><span>Win rate</span><strong>{pct(automation.winRate)}</strong><small>{automation.wins}W · {automation.losses}L</small></article>
          <article><span>Profit factor</span><strong>{pf(automation)}</strong></article>
          <article><span>Max drawdown</span><strong className={styles.negative}>{money(-automation.maxDrawdown)}</strong></article>
          <article><span>Expectancy</span><strong className={tone(automation.expectancy)}>{money(automation.expectancy)}</strong></article>
          <article><span>Avg hold</span><strong>{duration(automation.avgHoldMinutes)}</strong></article>
        </section>

        {compare&&<section className={styles.compareStrip}><div><span>COMPARISON</span><strong>{automation.name}</strong><b>{compare.name}</b></div>{[["PnL",money(automation.realizedPnl),money(compare.realizedPnl)],["ROI",pct(automation.realizedRoi),pct(compare.realizedRoi)],["Win rate",pct(automation.winRate),pct(compare.winRate)],["Max DD",money(-automation.maxDrawdown),money(-compare.maxDrawdown)],["PF",pf(automation),pf(compare)]].map(([label,a,b])=><div key={label}><span>{label}</span><strong>{a}</strong><b>{b}</b></div>)}</section>}

        <section className={styles.chartCard}>
          <div className={styles.sectionHead}><div><small>PERFORMANCE EXPLORER</small><h3>{chartMode}</h3></div><div className={styles.tabs}>{(["Cumulative PnL","Trade PnL","Drawdown","Trade frequency"] as ChartMode[]).map(m=><button key={m} className={chartMode===m?styles.tabActive:""} onClick={()=>setChartMode(m)}>{m}</button>)}</div></div>
          <div className={styles.chartMeta}><strong className={selectedTone}>{chartMode==="Trade frequency"?`${values.reduce((s,v)=>s+v,0)} trades`:money(values.at(-1))}</strong><span>{automation.series.length} recorded closes</span><span>Last activity {relative(automation.lastActivityAt)}</span></div>
          <div className={styles.chart}><svg viewBox="0 0 900 230" preserveAspectRatio="none"><line x1="16" x2="884" y1={chart.zero} y2={chart.zero}/><path d={chart.path} className={selectedTone} vectorEffect="non-scaling-stroke"/></svg>{!values.length&&<div>No closed trades in this period.</div>}</div>
        </section>

        <section className={styles.threeGrid}>
          <article className={styles.card}><div className={styles.sectionHead}><div><small>OUTCOME MIX</small><h3>Trade quality</h3></div><strong>{pct(automation.winRate)}</strong></div><div className={styles.donutRow}><div className={styles.donut} style={{background:outcomePie}}><i><b>{automation.closedTrades}</b><span>closed</span></i></div><div className={styles.legend}>{[["win","Wins",automation.wins,COLORS[0]],["loss","Losses",automation.losses,COLORS[1]],["flat","Breakeven",automation.breakeven,"#747474"]].map(([value,label,count,color])=><button key={String(value)} className={filter?.kind==="outcome"&&filter.value===value?styles.filterActive:""} onClick={()=>setFilter({kind:"outcome",value:String(value)})}><i style={{background:String(color)}}/><span>{label}</span><b>{count}</b></button>)}</div></div></article>
          <article className={styles.card}><div className={styles.sectionHead}><div><small>EXIT DISTRIBUTION</small><h3>How positions ended</h3></div></div><div className={styles.donutRow}><div className={styles.donut} style={{background:exitPie}}><i><b>{automation.exitReasons.reduce((s,r)=>s+r.trades,0)}</b><span>exits</span></i></div><div className={styles.legend}>{automation.exitReasons.slice(0,6).map((r,i)=><button key={r.reason} className={filter?.kind==="exit"&&filter.value===r.reason?styles.filterActive:""} onClick={()=>setFilter({kind:"exit",value:r.reason})}><i style={{background:COLORS[i%COLORS.length]}}/><span>{r.reason}</span><b>{r.trades}</b></button>)}</div></div></article>
          <article className={styles.card}><div className={styles.sectionHead}><div><small>MARKET CONTRIBUTION</small><h3>Pairs by realized PnL</h3></div></div><div className={styles.marketBars}>{automation.pairs.slice(0,7).map(p=><button key={p.pair} className={filter?.kind==="pair"&&filter.value===p.pair?styles.filterActive:""} onClick={()=>setFilter({kind:"pair",value:p.pair})}><div><strong>{p.pair}</strong><span>{p.trades} trades</span><b className={tone(p.pnl)}>{money(p.pnl)}</b></div><i><em className={tone(p.pnl)} style={{width:`${Math.max(4,Math.abs(p.pnl)/maxPair*100)}%`}}/></i></button>)}</div></article>
        </section>

        {automation.type==="DCA"&&<section className={styles.splitGrid}>
          <article className={styles.card}><div className={styles.sectionHead}><div><small>DCA DEPTH</small><h3>How deep trades averaged</h3></div><span>Click a row to filter trades</span></div><div className={styles.depthTable}><div><b>Depth</b><b>Trades</b><b>Win rate</b><b>Avg PnL</b><b>Avg hold</b></div>{(detail?.dcaDepth||[]).map(d=><button key={d.depth} className={filter?.kind==="depth"&&filter.value===String(d.depth)?styles.filterActive:""} onClick={()=>setFilter({kind:"depth",value:String(d.depth)})}><strong>{d.depth===0?"No averaging":`${d.depth} order${d.depth>1?"s":""}`}</strong><span>{d.trades}</span><span>{pct(d.winRate)}</span><span className={tone(d.avgPnl)}>{money(d.avgPnl)}</span><span>{duration(d.avgDurationMinutes)}</span></button>)}</div></article>
          <article className={styles.card}><div className={styles.sectionHead}><div><small>CAPITAL EFFICIENCY</small><h3>Profit versus capital commitment</h3></div></div><div className={styles.capitalGrid}><div><span>Average capital / trade</span><strong>{money(avgCapital)}</strong></div><div><span>Capital processed</span><strong>{money(detail?.capital?.totalUsed)}</strong></div><div><span>Profit / $1,000 deployed</span><strong className={tone(detail?.capital?.pnlPer1000)}>{money(detail?.capital?.pnlPer1000)}</strong></div><div><span>Capital-days</span><strong>{detail?.capital?.capitalDays==null?"—":detail.capital.capitalDays.toFixed(2)}</strong></div><div><span>PnL / capital-day</span><strong className={tone(detail?.capital?.pnlPerCapitalDay)}>{money(detail?.capital?.pnlPerCapitalDay)}</strong></div><div><span>Active capacity</span><strong>{automation.activePositions} / {automation.maxActivePositions??"∞"}</strong></div></div></article>
        </section>}

        {automation.type==="Strategy Execution"&&<section className={styles.card}><div className={styles.sectionHead}><div><small>EXECUTION INTELLIGENCE</small><h3>TradingView signal health</h3></div><span>Read-only signal ledger</span></div><div className={styles.signalGrid}><div><span>Received</span><strong>{detail?.signals?.received??0}</strong></div><div><span>Executed</span><strong className={styles.positive}>{detail?.signals?.executed??0}</strong></div><div><span>Ignored</span><strong>{detail?.signals?.ignored??0}</strong></div><div><span>Failed</span><strong className={styles.negative}>{detail?.signals?.failed??0}</strong></div><div><span>Execution rate</span><strong>{pct(detail?.signals?.executionRate)}</strong></div><div><span>Avg processing latency</span><strong>{detail?.signals?.avgLatencyMs==null?"—":`${(detail.signals.avgLatencyMs/1000).toFixed(2)}s`}</strong></div></div></section>}

        <section className={styles.splitGrid}>
          <article className={styles.card}><div className={styles.sectionHead}><div><small>TIME INTELLIGENCE</small><h3>Monthly result map</h3></div></div><div className={styles.monthGrid}>{(detail?.monthly||[]).map(m=><div key={m.key} title={`${m.trades} trades · ${pct(m.winRate)} win rate`}><span>{m.label}</span><i className={tone(m.pnl)} style={{opacity:.25+.75*Math.min(1,Math.abs(m.pnl)/maxMonth)}}/><strong className={tone(m.pnl)}>{money(m.pnl)}</strong><small>{m.trades} trades</small></div>)}</div></article>
          <article className={styles.card}><div className={styles.sectionHead}><div><small>WEEKDAY EDGE</small><h3>When the bot performs</h3></div></div><div className={styles.weekdays}>{(detail?.weekdays||[]).map(d=><div key={d.day}><span>{d.day}</span><strong className={tone(d.pnl)}>{money(d.pnl)}</strong><small>{d.trades} trades · {pct(d.winRate)}</small></div>)}</div></article>
        </section>

        <section className={styles.card}><div className={styles.sectionHead}><div><small>TRADE LEDGER</small><h3>Latest closed trades</h3></div><div>{filter&&<button className={styles.clearFilter} onClick={()=>setFilter(null)}>Clear filter · {filteredTrades.length} trades · {money(filteredPnl)}</button>}</div></div>{loading?<div className={styles.loading}>Loading bot analytics…</div>:error?<div className={styles.error}>{error}</div>:<div className={styles.tradeScroll}><div className={styles.tradeTable}><div className={styles.tradeHead}><span>Pair</span><span>PnL</span><span>ROI</span><span>Capital</span><span>DCA depth</span><span>Duration</span><span>Exit</span><span>Average / Exit</span><span>Closed</span></div>{filteredTrades.slice(0,80).map(t=><div className={styles.tradeRow} key={t.id}><strong>{t.pair}</strong><span className={tone(t.pnl)}>{money(t.pnl)}</span><span className={tone(t.roi)}>{pct(t.roi)}</span><span>{money(t.capital)}</span><span>{t.averagingFilled}</span><span>{duration(t.durationMinutes)}</span><span>{t.closeReason}</span><span>{price(t.averagePrice)} / {price(t.exitPrice)}</span><span>{t.closedAt?new Date(t.closedAt).toLocaleString([], {month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"}):"—"}</span></div>)}</div></div>}</section>
      </div>
    </section>
  </div>;
}
