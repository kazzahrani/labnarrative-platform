"use client";

import { useEffect, useMemo, useState } from "react";
import { browserSupabase } from "../../lib/supabase-browser";
import styles from "./trade-price-trace.module.css";

type ActiveOrder = { id:string; kind:string; side:string; status:string; sequence:number; price:number|null; amount:number };
type SnapshotFill = { sequence?:number; kind:string; side:string; price:number; amount:number; quantity:number; at:string };
type SnapshotTrade = {
  takeProfitPrice?: number | null;
  takeProfitTargets?: Array<{ index:number; profitPct:number; allocationPct:number; price:number; filled?:boolean }>;
  stopLossPrice?: number | null;
};
type Snapshot = { ok?:boolean; trade?:SnapshotTrade; activeOrders?:ActiveOrder[]; fills?:SnapshotFill[]; error?:string };
type Candle = { time:number; close:number };
type KlineResponse = { candles?:Array<{ closeTime:number; close:number }> };
type Level = { key:string; label:string; price:number; kind:"tp"|"avg"|"dca"|"sl" };

type Props = {
  accountId:string;
  tradeId:string;
  pair:string;
  averagePrice:number;
  livePrice:number|null;
  stopLossPrice:number|null;
  takeProfitPrice:number|null;
  openedAt:string;
  closedAt:string|null;
  active:boolean;
};

const GREEN = "#27b978";
const RED = "#b87378";
const GUIDE = "rgba(188,188,188,.23)";

function finitePositive(value:unknown){const n=Number(value);return Number.isFinite(n)&&n>0?n:null;}
function intervalFor(start:number,end:number){
  const hours=Math.max(.01,(end-start)/36e5);
  if(hours<=2)return "1m";
  if(hours<=12)return "5m";
  if(hours<=48)return "15m";
  if(hours<=24*10)return "1h";
  if(hours<=24*60)return "4h";
  return "1d";
}
function intervalMs(interval:string){return ({"1m":60e3,"5m":300e3,"15m":900e3,"1h":36e5,"4h":144e5,"1d":864e5} as Record<string,number>)[interval]??60e3;}
async function exactSnapshot(accountId:string,tradeId:string){
  const {data,error}=await browserSupabase.functions.invoke("trader-chart-control",{body:{accountId,tradeId}});
  if(error)throw error;
  const result=(data??{}) as Snapshot;
  if(result.ok!==true||result.error)throw new Error(result.error||"trade_levels_failed");
  return result;
}
async function candlesFor(pair:string,openedAt:string,closedAt:string|null){
  const start=new Date(openedAt).getTime();
  const end=closedAt?new Date(closedAt).getTime():Date.now();
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)return [] as Candle[];
  const interval=intervalFor(start,end);
  const ms=intervalMs(interval);
  const bars=Math.max(8,Math.min(500,Math.ceil((end-start)/ms)+3));
  const symbol=pair.replace(/[^A-Za-z0-9]/g,"").toUpperCase();
  const params=new URLSearchParams({symbol,interval,bars:String(bars),startTime:String(Math.max(0,Math.floor(start-ms))),endTime:String(Math.floor(end))});
  const response=await fetch(`/api/trader/klines?${params.toString()}`,{cache:"no-store"});
  if(!response.ok)throw new Error(`binance_chart_${response.status}`);
  const data=await response.json() as KlineResponse;
  return (data.candles??[]).flatMap((row)=>{
    const time=Number(row.closeTime),close=Number(row.close);
    return Number.isFinite(time)&&Number.isFinite(close)&&close>0?[{time,close}]:[];
  });
}

export default function TradePriceTrace({accountId,tradeId,pair,averagePrice,livePrice,stopLossPrice,takeProfitPrice,openedAt,closedAt,active}:Props){
  const [snapshot,setSnapshot]=useState<Snapshot>({});
  const [candles,setCandles]=useState<Candle[]>([]);

  useEffect(()=>{
    let alive=true;
    const refresh=async()=>{
      try{const next=await exactSnapshot(accountId,tradeId);if(alive)setSnapshot(next);}catch{}
      try{const next=await candlesFor(pair,openedAt,closedAt);if(alive)setCandles(next);}catch{}
    };
    void refresh();
    if(!active)return()=>{alive=false;};
    const timer=window.setInterval(()=>void refresh(),15000);
    return()=>{alive=false;window.clearInterval(timer);};
  },[accountId,tradeId,pair,openedAt,closedAt,active]);

  const model=useMemo(()=>{
    const exact=snapshot.trade;
    const levels:Level[]=[];
    const avg=finitePositive(averagePrice);
    const sl=finitePositive(exact?.stopLossPrice)??finitePositive(stopLossPrice);
    if(sl)levels.push({key:"sl",label:"SL",price:sl,kind:"sl"});

    const dcaBySequence=new Map<number,number>();
    for(const fill of snapshot.fills??[]){
      if(String(fill.side).toUpperCase()!=="BUY"||!String(fill.kind).toLowerCase().includes("averag"))continue;
      const price=finitePositive(fill.price);if(!price)continue;
      const seq=Math.max(1,Math.round(Number(fill.sequence)||dcaBySequence.size+1));
      dcaBySequence.set(seq,price);
    }
    for(const order of snapshot.activeOrders??[]){
      if(String(order.side).toUpperCase()!=="BUY"||!String(order.kind).toLowerCase().includes("averag"))continue;
      const price=finitePositive(order.price);if(!price)continue;
      const seq=Math.max(1,Math.round(Number(order.sequence)||dcaBySequence.size+1));
      dcaBySequence.set(seq,price);
    }
    [...dcaBySequence.entries()].sort((a,b)=>a[0]-b[0]).slice(0,6).forEach(([sequence,price])=>levels.push({key:`dca-${sequence}`,label:`DCA${sequence}`,price,kind:"dca"}));
    if(avg)levels.push({key:"avg",label:"AVG",price:avg,kind:"avg"});

    const targets=(exact?.takeProfitTargets??[]).filter((target)=>finitePositive(target.price)!=null).sort((a,b)=>a.index-b.index);
    if(targets.length)targets.forEach((target)=>levels.push({key:`tp-${target.index}`,label:`TP${target.index}`,price:Number(target.price),kind:"tp"}));
    else {const tp=finitePositive(exact?.takeProfitPrice)??finitePositive(takeProfitPrice);if(tp)levels.push({key:"tp",label:"TP",price:tp,kind:"tp"});}

    const series=[...candles];
    const live=finitePositive(livePrice);
    if(live){
      const t=closedAt?new Date(closedAt).getTime():Date.now();
      if(!series.length||Math.abs(series[series.length-1].time-t)>1000)series.push({time:t,close:live});
      else series[series.length-1]={...series[series.length-1],close:live};
    }
    if(!series.length&&avg){series.push({time:0,close:avg});if(live&&live!==avg)series.push({time:1,close:live});}
    const prices=[...series.map(c=>c.close),...levels.map(level=>level.price)].filter((v)=>Number.isFinite(v)&&v>0);
    const fallback=avg??live??1;
    let min=prices.length?Math.min(...prices):fallback*.98;
    let max=prices.length?Math.max(...prices):fallback*1.02;
    if(max<=min){min=fallback*.99;max=fallback*1.01;}
    const span=Math.max(max-min,fallback*.004,1e-12);min-=span*.07;max+=span*.07;
    return {levels,series,min,max,avg:avg??fallback};
  },[snapshot,candles,averagePrice,livePrice,stopLossPrice,takeProfitPrice,closedAt]);

  const width=520,height=118,labelWidth=50,padX=10,padY=8,plotW=width-labelWidth-padX*2,plotH=height-padY*2;
  const y=(price:number)=>padY+(model.max-price)/(model.max-model.min)*plotH;
  const x=(index:number)=>model.series.length<=1?padX:padX+index/(model.series.length-1)*plotW;
  const levelEnd=padX+plotW;
  const lastTime=model.series[model.series.length-1]?.time??Date.now();
  const firstTime=model.series[0]?.time??lastTime;
  const fillDots=(snapshot.fills??[]).filter(fill=>String(fill.side).toUpperCase()==="BUY"&&String(fill.kind).toLowerCase().includes("averag")&&finitePositive(fill.price)).map((fill,index)=>{
    const time=new Date(fill.at).getTime();
    const ratio=lastTime>firstTime?Math.max(0,Math.min(1,(time-firstTime)/(lastTime-firstTime))):0;
    return {key:`dot-${index}-${fill.at}`,cx:padX+ratio*plotW,cy:y(Number(fill.price))};
  });

  return <div className={styles.wrap} aria-label="Position price movement">
    <svg className={styles.chart} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img">
      <rect x=".5" y=".5" width={width-1} height={height-1} rx="14" className={styles.frame}/>
      {model.levels.map((level)=><g key={level.key}>
        <line x1={padX} x2={levelEnd} y1={y(level.price)} y2={y(level.price)} stroke={GUIDE} strokeWidth="1" strokeDasharray="4 5" vectorEffect="non-scaling-stroke"/>
        <text x={levelEnd+8} y={Math.max(10,Math.min(height-8,y(level.price)+3))} className={styles.levelLabel}>{level.label}</text>
      </g>)}
      {model.series.slice(1).map((point,index)=>{
        const previous=model.series[index];
        const positive=(point.close+previous.close)/2>=model.avg;
        return <line key={`${point.time}-${index}`} x1={x(index)} y1={y(previous.close)} x2={x(index+1)} y2={y(point.close)} stroke={positive?GREEN:RED} strokeWidth="1.8" strokeLinecap="round" vectorEffect="non-scaling-stroke"/>;
      })}
      {fillDots.map(dot=><circle key={dot.key} cx={dot.cx} cy={dot.cy} r="3.2" className={styles.dcaDot}/>)}
      {model.series.length>0&&<circle cx={x(model.series.length-1)} cy={y(model.series[model.series.length-1].close)} r="2.3" className={styles.nowDot}/>}
    </svg>
  </div>;
}
