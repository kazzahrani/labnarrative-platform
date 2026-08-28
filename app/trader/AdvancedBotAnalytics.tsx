"use client";

import styles from "./advanced-bot-analytics.module.css";

type Trade = {
  id:string; pair:string; pnl:number; roi:number|null; capital:number; durationMinutes:number|null;
  openedAt:string|null; closedAt:string|null; averagePrice:number|null; trailingPeakPrice?:number|null;
  mfePct?:number|null; maePct?:number|null;
};
type SeriesPoint = { at:string; pnl:number; cumulative:number };
type Automation = {
  id:string; name:string; realizedRoi:number|null; winRate:number|null; maxDrawdown:number;
  capitalUsed?:number; maxCapital?:number|null; maxCapitalMode?:"fixed"|"dynamic"; series:SeriesPoint[];
};
type Detail = { recentTrades?:Trade[]; analyticsTrades?:Trade[]; capital?:{totalUsed?:number|null} } | null;
type Props = { range:string; automation:Automation; automations:Automation[]; detail:Detail };
type XY = { x:number; y:number };

const DAYS=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const GREEN="#55d99a", BLUE="#79a2ef", GOLD="#d6a956";

function finite(value:number|null|undefined,fallback=0){return value!=null&&Number.isFinite(value)?value:fallback;}
function pct(value:number|null|undefined,digits=1){if(value==null||!Number.isFinite(value))return"—";const s=value>0?"+":value<0?"−":"";return `${s}${Math.abs(value).toFixed(digits)}%`;}
function money(value:number|null|undefined){if(value==null||!Number.isFinite(value))return"—";const s=value>0?"+":value<0?"−":"";return `${s}$${Math.abs(value).toLocaleString("en-US",{maximumFractionDigits:0})}`;}
function scalePoints(values:number[],w=600,h=150,p=12){if(!values.length)return[] as XY[];let min=Math.min(...values),max=Math.max(...values);if(Math.abs(max-min)<1e-9){min-=1;max+=1;}return values.map((v,i)=>({x:p+(values.length===1?.5:i/(values.length-1))*(w-p*2),y:p+(max-v)/(max-min)*(h-p*2)}));}
function scaleFromZero(values:number[],max:number,w=600,h=150,p=10){if(!values.length)return[] as XY[];const top=Math.max(1,max);return values.map((v,i)=>({x:p+(values.length===1?.5:i/(values.length-1))*(w-p*2),y:h-p-Math.max(0,v)/top*(h-p*2)}));}
function path(points:XY[]){return points.length?`M${points.map(p=>`${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" L")}`:"";}
function areaPath(points:XY[],baseline:number){return points.length?`${path(points)} L${points.at(-1)!.x.toFixed(1)},${baseline.toFixed(1)} L${points[0].x.toFixed(1)},${baseline.toFixed(1)} Z`:"";}
function capitalUsed(a:Automation){return Math.max(0,finite(a.capitalUsed,0));}
function ddPct(a:Automation){const c=capitalUsed(a);return c>0?Math.max(0,finite(a.maxDrawdown))/c*100:0;}
function rangeStart(range:string){const now=new Date();if(range==="ytd")return Date.UTC(now.getUTCFullYear(),0,1);const days=range==="7d"?7:range==="30d"?30:range==="90d"?90:0;return days?Date.now()-days*86400000:null;}

function buildCapitalTimeline(trades:Trade[],range:string){
  const start=rangeStart(range),events=new Map<number,number>();
  trades.forEach(t=>{let open=t.openedAt?Date.parse(t.openedAt):NaN;const close=t.closedAt?Date.parse(t.closedAt):NaN,c=Math.max(0,finite(t.capital));if(!c||!Number.isFinite(open)||!Number.isFinite(close))return;if(start!=null){if(close<start)return;open=Math.max(open,start);}if(open>close)return;events.set(open,(events.get(open)||0)+c);events.set(close,(events.get(close)||0)-c);});
  let current=0;return [...events.entries()].sort((a,b)=>a[0]-b[0]).map(([at,delta])=>{current=Math.max(0,current+delta);return{at,value:current};});
}
function rolling(trades:Trade[],windowSize=20){
  const sorted=[...trades].filter(t=>t.closedAt).sort((a,b)=>Date.parse(a.closedAt!)-Date.parse(b.closedAt!));
  if(sorted.length<Math.min(5,windowSize))return[];
  return sorted.map((_,i)=>{const start=Math.max(0,i-windowSize+1),rows=sorted.slice(start,i+1),capital=rows.reduce((s,t)=>s+Math.max(0,finite(t.capital)),0),pnl=rows.reduce((s,t)=>s+finite(t.pnl),0),wins=rows.filter(t=>finite(t.pnl)>0).length,gp=rows.reduce((s,t)=>s+Math.max(0,finite(t.pnl)),0),gl=Math.abs(rows.reduce((s,t)=>s+Math.min(0,finite(t.pnl)),0));return{roi:capital>0?pnl/capital*100:0,win:rows.length?wins/rows.length*100:0,pf:gl>0?gp/gl:(gp>0?4:0)};});
}
function histogram(trades:Trade[],bins=12){
  const values=trades.map(t=>t.roi).filter((v):v is number=>v!=null&&Number.isFinite(v));if(!values.length)return[];
  let min=Math.min(...values),max=Math.max(...values);if(min===max){min-=.5;max+=.5;}const width=(max-min)/bins,out=Array.from({length:bins},(_,i)=>({from:min+i*width,to:min+(i+1)*width,count:0}));values.forEach(v=>{const i=Math.min(bins-1,Math.max(0,Math.floor((v-min)/width)));out[i].count++;});return out;
}
function heat(trades:Trade[]){
  const cells=Array.from({length:168},()=>({count:0,pnl:0,roi:0,capital:0}));
  trades.forEach(t=>{if(!t.closedAt)return;const d=new Date(t.closedAt),i=d.getDay()*24+d.getHours();cells[i].count++;cells[i].pnl+=finite(t.pnl);cells[i].capital+=Math.max(0,finite(t.capital));});cells.forEach(c=>{c.roi=c.capital>0?c.pnl/c.capital*100:0;});return cells;
}
function underwater(series:SeriesPoint[],denominator:number){let peak=0;return series.map(p=>{peak=Math.max(peak,finite(p.cumulative));return denominator>0?-(peak-finite(p.cumulative))/denominator*100:0;});}
function MiniLine({values,label,current,color,range}:{values:number[];label:string;current:string;color:string;range:string}){const pts=scalePoints(values,600,86,8);return <div className={styles.healthRow}><div><span>{label}</span><strong>{current}</strong></div><svg key={`${range}-${label}-${values.length}`} viewBox="0 0 600 86" preserveAspectRatio="none"><path d={path(pts)} style={{stroke:color}} className={styles.drawLine}/></svg></div>}

export default function AdvancedBotAnalytics({range,automation,automations,detail}:Props){
  const trades=(detail?.analyticsTrades?.length?detail.analyticsTrades:detail?.recentTrades)||[];
  const timeline=buildCapitalTimeline(trades,range),capitalValues=timeline.map(p=>p.value),peakCapital=Math.max(0,...capitalValues);
  const maxCapital=automation.maxCapitalMode==="fixed"?finite(automation.maxCapital,0):0,capitalScale=Math.max(1,maxCapital,peakCapital),capitalPoints=scaleFromZero(capitalValues,capitalScale),capitalLimitY=140-maxCapital/capitalScale*130;
  const utilization=maxCapital>0?peakCapital/maxCapital*100:null;
  const risk=automations.map(a=>({a,x:ddPct(a),y:finite(a.realizedRoi),size:Math.max(capitalUsed(a),finite(a.maxCapital,0))})).filter(x=>Number.isFinite(x.x)&&Number.isFinite(x.y));
  const maxRisk=Math.max(1,...risk.map(x=>x.x)),minRoi=Math.min(0,...risk.map(x=>x.y)),maxRoi=Math.max(1,...risk.map(x=>x.y)),maxBubble=Math.max(1,...risk.map(x=>x.size));
  const heatCells=heat(trades),maxHeat=Math.max(.0001,...heatCells.map(c=>Math.abs(c.roi)));
  const roll=rolling(trades),hist=histogram(trades),maxHist=Math.max(1,...hist.map(b=>b.count));
  const scatter=trades.filter(t=>t.durationMinutes!=null&&Number.isFinite(t.durationMinutes)&&t.roi!=null&&Number.isFinite(t.roi));
  const maxDur=Math.max(1,...scatter.map(t=>finite(t.durationMinutes))),minScatter=Math.min(0,...scatter.map(t=>finite(t.roi))),maxScatter=Math.max(1,...scatter.map(t=>finite(t.roi))),maxScatterCapital=Math.max(1,...scatter.map(t=>finite(t.capital)));
  const dd=underwater(automation.series,capitalUsed(automation)||finite(detail?.capital?.totalUsed,0)),ddPoints=scalePoints(dd,600,150,10),ddMin=Math.min(0,...dd);
  const excursions=trades.filter(t=>t.mfePct!=null&&Number.isFinite(t.mfePct)&&t.maePct!=null&&Number.isFinite(t.maePct)),maxMfe=Math.max(1,...excursions.map(t=>finite(t.mfePct))),maxMae=Math.max(1,...excursions.map(t=>Math.abs(finite(t.maePct))));

  return <section key={`${range}-${automation.id}-${trades.length}`} className={styles.suite}>
    <div className={styles.suiteHead}><div><small>ADVANCED ANALYTICS</small><h3>Risk, efficiency & behavioral edge</h3></div><span>{trades.length} closed trades sampled · {range.toUpperCase()}</span></div>
    <div className={styles.grid}>
      <article className={styles.card}>
        <header><div><small>CAPITAL UTILIZATION</small><h4>Capital footprint</h4></div><div className={styles.metrics}><b>{money(peakCapital)}</b><span>{utilization==null?"Dynamic ceiling":`${pct(utilization)} of max`}</span></div></header>
        {capitalValues.length?<svg key={`${range}-capital-${trades.length}`} className={styles.chart} viewBox="0 0 600 150" preserveAspectRatio="none"><path d={areaPath(capitalPoints,140)} className={styles.areaBlue}/><path d={path(capitalPoints)} className={styles.drawBlue}/>{maxCapital>0&&<line x1="10" x2="590" y1={capitalLimitY} y2={capitalLimitY} className={styles.limitLine}/>}</svg>:<div className={styles.empty}>No closed-trade capital timeline in this range.</div>}
        <footer><span>Peak simultaneous capital</span><b>{maxCapital>0?`Max configured ${money(maxCapital)}`:"No fixed ceiling"}</b></footer>
      </article>
      <article className={styles.card}>
        <header><div><small>RISK / RETURN MAP</small><h4>Automation quality</h4></div><span>Top-left is stronger</span></header>
        <svg key={`${range}-risk-${risk.length}`} className={styles.chart} viewBox="0 0 600 150" preserveAspectRatio="none"><line x1="42" x2="590" y1="128" y2="128" className={styles.axis}/><line x1="42" x2="42" y1="10" y2="128" className={styles.axis}/>{risk.map(({a,x,y,size})=>{const cx=42+x/maxRisk*535,cy=128-(y-minRoi)/(maxRoi-minRoi||1)*112,r=5+Math.sqrt(size/maxBubble)*9;return <circle key={a.id} cx={cx} cy={cy} r={r} className={a.id===automation.id?styles.focusBubble:styles.bubble}><title>{a.name} · ROI {pct(y)} · Max DD {pct(-x)} · capital {money(size)}</title></circle>})}</svg>
        <footer><span>← lower drawdown · ROI ↑</span><b>Bubble size = capital</b></footer>
      </article>
      <article className={`${styles.card} ${styles.wide}`}>
        <header><div><small>TIME EDGE</small><h4>Day × hour performance</h4></div><span>Close-time ROI · your local browser time</span></header>
        <div className={styles.heatWrap}><div className={styles.hourLabels}>{[0,3,6,9,12,15,18,21].map(h=><span key={h} style={{gridColumn:`${h+1}/span 3`}}>{String(h).padStart(2,"0")}:00</span>)}</div>{DAYS.map((day,d)=><div className={styles.heatRow} key={day}><b>{day}</b><div>{Array.from({length:24},(_,h)=>{const c=heatCells[d*24+h],strength=Math.min(1,Math.abs(c.roi)/maxHeat);return <i key={h} className={c.roi>0?styles.heatPos:c.roi<0?styles.heatNeg:styles.heatZero} style={{opacity:c.count?.18+.72*strength:.12}}><title>{day} {String(h).padStart(2,"0")}:00 · {c.count} trades · {pct(c.roi)} ROI · {money(c.pnl)}</title></i>})}</div></div>)}</div>
      </article>
      <article className={styles.card}>
        <header><div><small>ROLLING STRATEGY HEALTH</small><h4>Last 20 trades</h4></div><span>{roll.length?"Live regime view":"Need more trades"}</span></header>
        {roll.length?<div className={styles.health}><MiniLine range={range} values={roll.map(x=>x.roi)} label="Rolling ROI" current={pct(roll.at(-1)?.roi)} color={GREEN}/><MiniLine range={range} values={roll.map(x=>x.win)} label="Win rate" current={pct(roll.at(-1)?.win)} color={BLUE}/><MiniLine range={range} values={roll.map(x=>x.pf)} label="Profit factor" current={(roll.at(-1)?.pf??0).toFixed(2)} color={GOLD}/></div>:<div className={styles.empty}>At least five closed trades are needed.</div>}
      </article>
      <article className={styles.card}>
        <header><div><small>RETURN DISTRIBUTION</small><h4>Trade ROI shape</h4></div><span>{hist.reduce((s,b)=>s+b.count,0)} trades</span></header>
        {hist.length?<div className={styles.hist}>{hist.map((b,i)=><div key={i}><i className={b.to<=0?styles.histNeg:b.from>=0?styles.histPos:styles.histFlat} style={{height:`${Math.max(5,b.count/maxHist*100)}%`}}><title>{b.from.toFixed(2)}% to {b.to.toFixed(2)}% · {b.count} trades</title></i></div>)}</div>:<div className={styles.empty}>No ROI distribution available.</div>}
        {hist.length&&<footer><span>{pct(hist[0].from)} left tail</span><b>{pct(hist.at(-1)!.to)} right tail</b></footer>}
      </article>
      <article className={styles.card}>
        <header><div><small>CAPITAL TIME EFFICIENCY</small><h4>Holding time × ROI</h4></div><span>Dot size = capital</span></header>
        {scatter.length?<svg key={`${range}-scatter-${scatter.length}`} className={styles.chart} viewBox="0 0 600 150" preserveAspectRatio="none"><line x1="36" x2="590" y1={135-(0-minScatter)/(maxScatter-minScatter||1)*120} y2={135-(0-minScatter)/(maxScatter-minScatter||1)*120} className={styles.axis}/>{scatter.slice(-220).map(t=>{const x=36+Math.sqrt(finite(t.durationMinutes)/maxDur)*550,y=135-(finite(t.roi)-minScatter)/(maxScatter-minScatter||1)*120,r=2.5+Math.sqrt(finite(t.capital)/maxScatterCapital)*5;return <circle key={t.id} cx={x} cy={y} r={r} className={finite(t.roi)>=0?styles.scatterPos:styles.scatterNeg}><title>{t.pair} · {Math.round(finite(t.durationMinutes))}m · ROI {pct(t.roi)} · {money(t.capital)}</title></circle>})}</svg>:<div className={styles.empty}>No duration/ROI observations in this range.</div>}
        <footer><span>Shorter ← holding duration → Longer</span><b>ROI ↑</b></footer>
      </article>
      <article className={styles.card}>
        <header><div><small>UNDERWATER RISK</small><h4>Drawdown depth & recovery</h4></div><div className={styles.metrics}><b className={styles.loss}>{pct(ddMin)}</b><span>worst underwater</span></div></header>
        {ddPoints.length?<svg key={`${range}-underwater-${dd.length}`} className={styles.chart} viewBox="0 0 600 150" preserveAspectRatio="none"><line x1="10" x2="590" y1="10" y2="10" className={styles.axis}/><path d={areaPath(ddPoints,10)} className={styles.areaRed}/><path d={path(ddPoints)} className={styles.drawRed}/></svg>:<div className={styles.empty}>No equity curve in this range.</div>}
        <footer><span>0% = previous realized equity peak</span><b>Recovery returns to zero</b></footer>
      </article>
      <article className={styles.card}>
        <header><div><small>MFE / MAE TRADE MAP</small><h4>Excursion quality</h4></div><span>{excursions.length} recorded trades</span></header>
        {excursions.length?<svg key={`${range}-excursion-${excursions.length}`} className={styles.chart} viewBox="0 0 600 150" preserveAspectRatio="none"><line x1="36" x2="590" y1="135" y2="135" className={styles.axis}/><line x1="36" x2="36" y1="10" y2="135" className={styles.axis}/>{excursions.map(t=>{const x=36+Math.abs(finite(t.maePct))/maxMae*550,y=135-finite(t.mfePct)/maxMfe*120;return <circle key={t.id} cx={x} cy={y} r="4" className={styles.excursion}><title>{t.pair} · MAE {pct(t.maePct)} · MFE {pct(t.mfePct)} · close ROI {pct(t.roi)}</title></circle>})}</svg>:<div className={styles.emptyStrong}><b>Historical excursion path was not recorded.</b><span>MFE/MAE needs observed intratrade highs and lows. We do not estimate or fabricate them from entry/exit prices.</span></div>}
        <footer><span>MAE → adverse excursion</span><b>MFE ↑ favorable excursion</b></footer>
      </article>
    </div>
  </section>;
}
