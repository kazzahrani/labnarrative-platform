"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { browserSupabase } from "../../lib/supabase-browser";
import styles from "./pnl-activity-chart.module.css";

type Bucket={at:string;pnl:number;capital:number;trades:number;wins:number;roi:number|null;winRate:number|null;expectancy:number|null};
type Payload={ok?:boolean;range?:string;daily?:Bucket[];weekly?:Bucket[];monthly?:Bucket[];error?:string};
type Resolution="daily"|"weekly"|"monthly";
type Measure="pnl"|"roi";
type Props={accountId:string;range:string;scope?:string;type?:string;botId?:string;embedded?:boolean};

const W=980,H=285,L=68,R=58,T=18,B=42;
function money(v:number,d=0){const s=v>0?"+":v<0?"−":"";return `${s}$${Math.abs(v).toLocaleString("en-US",{maximumFractionDigits:d,minimumFractionDigits:d})}`}
function pct(v:number|null|undefined,d=2){if(v==null||!Number.isFinite(v))return"—";const s=v>0?"+":v<0?"−":"";return`${s}${Math.abs(v).toFixed(d)}%`}
function short(v:number){const a=Math.abs(v);if(a>=1e6)return`${(v/1e6).toFixed(1)}m`;if(a>=1e3)return`${(v/1e3).toFixed(1)}k`;if(a>=100)return v.toFixed(0);return v.toFixed(1)}
function defaultResolution(range:string):Resolution{return range==="7d"||range==="30d"?"daily":range==="90d"?"weekly":"monthly"}
function label(at:string,resolution:Resolution){const d=new Date(at);return resolution==="monthly"?d.toLocaleDateString("en-US",{month:"short",year:"2-digit"}):d.toLocaleDateString("en-US",{month:"short",day:"numeric"})}
function ticks(min:number,max:number,n=5){return Array.from({length:n},(_,i)=>min+(max-min)*i/(n-1))}

export default function PnlActivityChart({accountId,range,scope="all",type="all",botId="",embedded=false}:Props){
  const [payload,setPayload]=useState<Payload|null>(null);const [loading,setLoading]=useState(true);const [error,setError]=useState("");
  const [resolution,setResolution]=useState<Resolution>(()=>defaultResolution(range));const [measure,setMeasure]=useState<Measure>("pnl");const [showTrades,setShowTrades]=useState(true);const [hover,setHover]=useState<number|null>(null);const svgRef=useRef<SVGSVGElement|null>(null);
  useEffect(()=>setResolution(defaultResolution(range)),[range]);
  useEffect(()=>{let cancelled=false;setLoading(true);setError("");void(async()=>{const {data,error:invokeError}=await browserSupabase.functions.invoke("trader-analytics-activity",{body:{accountId,range,scope,type,botId:botId||undefined}});if(cancelled)return;if(invokeError){setError(invokeError.message||"Unable to load activity analytics.");setPayload(null)}else{const next=(data??{}) as Payload;if(next.ok!==true){setError(next.error||"Unable to load activity analytics.");setPayload(null)}else setPayload(next)}setLoading(false)})();return()=>{cancelled=true}},[accountId,range,scope,type,botId]);
  const rows=(payload?.[resolution]??[]) as Bucket[];
  const values=rows.map(r=>measure==="pnl"?r.pnl:(r.roi??0));
  const valueMin=Math.min(0,...values),valueMax=Math.max(0,...values);const spread=Math.max(1e-9,valueMax-valueMin);const paddedMin=valueMin-spread*.08,paddedMax=valueMax+spread*.08;
  const maxTrades=Math.max(1,...rows.map(r=>r.trades));const usableW=W-L-R,usableH=H-T-B;const step=rows.length?usableW/rows.length:usableW;const barW=Math.max(3,Math.min(28,step*.58));
  const x=(i:number)=>L+step*(i+.5);const y=(v:number)=>T+(paddedMax-v)/(paddedMax-paddedMin||1)*usableH;const countY=(v:number)=>T+(maxTrades-v)/maxTrades*usableH;const zero=y(0);
  const countPath=rows.length?`M${rows.map((r,i)=>`${x(i).toFixed(1)},${countY(r.trades).toFixed(1)}`).join(" L")}`:"";
  const totals=useMemo(()=>{const pnl=rows.reduce((s,r)=>s+r.pnl,0),capital=rows.reduce((s,r)=>s+r.capital,0),trades=rows.reduce((s,r)=>s+r.trades,0),wins=rows.reduce((s,r)=>s+r.wins,0);return{pnl,roi:capital>0?pnl/capital*100:null,trades,winRate:trades?wins/trades*100:null,expectancy:trades?pnl/trades:null}},[rows]);
  const onMove=(event:React.MouseEvent<SVGSVGElement>)=>{if(!rows.length||!svgRef.current)return;const rect=svgRef.current.getBoundingClientRect();const local=(event.clientX-rect.left)/rect.width*W;const index=Math.max(0,Math.min(rows.length-1,Math.round((local-L)/step-.5)));setHover(index)};
  const active=hover==null?null:rows[hover];const tickEvery=Math.max(1,Math.ceil(rows.length/6));
  const body=<>
    <div className={styles.controls}><div className={styles.segment}>{(["pnl","roi"] as Measure[]).map(m=><button key={m} className={measure===m?styles.active:""} onClick={()=>setMeasure(m)}>{m==="pnl"?"PnL":"ROI"}</button>)}</div><div className={styles.rightControls}><button type="button" className={`${styles.tradeToggle} ${showTrades?styles.tradeToggleOn:""}`} aria-pressed={showTrades} aria-label="Toggle closed trade count overlay" onClick={()=>setShowTrades(v=>!v)}><i/><span>Trade count</span></button><div className={styles.segment}>{(["daily","weekly","monthly"] as Resolution[]).map(r=><button key={r} className={resolution===r?styles.active:""} onClick={()=>setResolution(r)}>{r[0].toUpperCase()+r.slice(1)}</button>)}</div></div></div>
    <div className={styles.summary}><strong className={totals.pnl>0?styles.positive:totals.pnl<0?styles.negative:""}>{measure==="pnl"?money(totals.pnl):pct(totals.roi)}</strong><span>{totals.trades} closed trades</span><span>{pct(totals.winRate,1)} win rate</span><span>{money(totals.expectancy??0,2)} expectancy</span></div>
    <div className={styles.chartWrap}>
      {loading?<div className={styles.empty}>Loading performance rhythm…</div>:error?<div className={styles.error}>{error}</div>:!rows.length?<div className={styles.empty}>No closed trades in this period.</div>:<>
        <svg ref={svgRef} className={styles.chart} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" onMouseMove={onMove} onMouseLeave={()=>setHover(null)}>
          {ticks(paddedMin,paddedMax,5).map(v=><g key={`y-${v}`}><line x1={L} x2={W-R} y1={y(v)} y2={y(v)} className={styles.grid}/><text x={L-10} y={y(v)+4} textAnchor="end" className={styles.tick}>{measure==="pnl"?`$${short(v)}`:`${short(v)}%`}</text></g>)}
          {showTrades&&ticks(0,maxTrades,5).map(v=><text key={`r-${v}`} x={W-R+10} y={countY(v)+4} className={`${styles.tick} ${styles.tradeTick}`}>{Math.round(v)}</text>)}
          <line x1={L} x2={W-R} y1={zero} y2={zero} className={styles.zero}/>
          {rows.map((r,i)=>{const v=measure==="pnl"?r.pnl:(r.roi??0),yy=y(v),top=Math.min(zero,yy),height=Math.max(1,Math.abs(zero-yy));return<rect key={r.at} x={x(i)-barW/2} y={top} width={barW} height={height} rx="3" className={v>0?styles.posBar:v<0?styles.negBar:styles.flatBar}/>})}
          {showTrades&&<><path d={countPath} className={styles.activityLine}/>{rows.map((r,i)=><circle key={`c-${r.at}`} cx={x(i)} cy={countY(r.trades)} r="2.6" className={styles.activityDot}/>)}</>}
          {rows.map((r,i)=>i%tickEvery===0||i===rows.length-1?<text key={`x-${r.at}`} x={x(i)} y={H-15} textAnchor="middle" className={styles.tick}>{label(r.at,resolution)}</text>:null)}
          <text x={(L+W-R)/2} y={H-2} textAnchor="middle" className={styles.axisTitle}>Time</text><text x="13" y={(T+H-B)/2} textAnchor="middle" transform={`rotate(-90 13 ${(T+H-B)/2})`} className={styles.axisTitle}>{measure==="pnl"?"Realized PnL (USD)":"Realized ROI (%)"}</text>{showTrades&&<text x={W-10} y={(T+H-B)/2} textAnchor="middle" transform={`rotate(90 ${W-10} ${(T+H-B)/2})`} className={`${styles.axisTitle} ${styles.tradeAxisTitle}`}>Trade count</text>}
          {hover!=null&&<line x1={x(hover)} x2={x(hover)} y1={T} y2={H-B} className={styles.hoverLine}/>} 
        </svg>
        {active&&<div className={styles.tooltip} style={{left:`${Math.max(9,Math.min(78,(x(hover!)/W)*100))}%`}}><b>{label(active.at,resolution)}</b><span className={active.pnl>=0?styles.positive:styles.negative}>{money(active.pnl,2)}</span><span>{pct(active.roi)} ROI</span><span>{active.trades} trades · {pct(active.winRate,1)} wins</span><span>{money(active.expectancy??0,2)} expectancy</span></div>}
      </>}
    </div><div className={styles.legend}><span><i className={styles.barKey}/>Period {measure==="pnl"?"PnL":"ROI"}</span>{showTrades&&<span className={styles.tradeLegend}><i className={styles.lineKey}/>Trade count</span>}</div>
  </>;
  if(embedded)return<div className={styles.embedded}>{body}</div>;
  return<section className={styles.card} data-analytics-motion><header><div><small>PNL & ACTIVITY</small><h3>Performance rhythm</h3></div><span>Profit quality and trading intensity on one timeline</span></header>{body}</section>;
}
