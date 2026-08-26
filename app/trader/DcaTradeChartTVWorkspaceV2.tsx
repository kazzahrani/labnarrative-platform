"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  HistogramSeries,
  LineSeries,
  LineStyle,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type SeriesMarker,
  type UTCTimestamp,
} from "lightweight-charts";
import { browserSupabase } from "../../lib/supabase-browser";
import styles from "./dca-trade-workstation.module.css";

type Fill = { kind:string; side?:string; price:number; amount:number; quantity:number; at:string };
type Condition = { id:string; kind:string; timeframe:string; length:number; comparator:string; signal:number; aux1:number; aux2:number; aux3:number };
type ActiveOrder = { id:string; kind:string; side:string; status:string; sequence:number; price:number|null; amount:number };
type ChartTrade = {
  id:string; pair:string; status:"Active"|"Closed"; entryPrice:number; averagePrice:number; quantity:number; invested:number;
  takeProfitPct:number; takeProfitPrice:number|null; stopEnabled:boolean; stopPct:number; stopLossPrice:number|null;
  lastPrice:number|null; exitPrice:number|null; openedAt:string; closedAt:string|null; closeReason:string|null;
};
type ChartSnapshot = { ok?:boolean; trade?:ChartTrade; bot?:{id:string;name:string;conditions:Condition[]}|null; fills?:Fill[]; activeOrders?:ActiveOrder[]; error?:string };
type Props = {
  accountId:string; tradeId:string; pair:string; status:"Active"|"Closed"; entryPrice:number; averagePrice:number; createdAt:string;
  closedAt?:string; exitPrice?:number; closeReason?:string; lastPrice?:number; fills?:Fill[]; takeProfitPrice?:number|null;
  stopLossPrice?:number|null; nextAveragingPrice?:number|null; onClose:()=>void;
};
type Candle = { openTime:number; open:number; high:number; low:number; close:number; volume:number };
type Interval = "3m"|"5m"|"15m"|"1h"|"4h"|"1d"|"1w"|"1M";
type IndicatorName =
  | "Volume" | "RSI" | "Stochastic" | "MACD" | "Moving Average (MA)" | "Average Directional Index"
  | "Bollinger Bands %B" | "Money Flow Index" | "Commodity Channel Index" | "Ultimate Oscillator" | "Parabolic SAR" | "Heikin Ashi";
type Point = { time:UTCTimestamp; value:number };
type SettingsTab = "Inputs"|"Style"|"Visibility";
type IndicatorStyle = {
  color1:string; color2:string; color3:string; upColor:string; downColor:string; thresholdColor:string;
  lineWidth:1|2|3|4; lineStyle:"Solid"|"Dashed"|"Dotted"; showUpper:boolean; showLower:boolean; upper:number; lower:number;
};
type IndicatorVisibility = { visible:boolean; priceScale:boolean; statusLine:boolean; paneHeight:number };
type IndicatorInstance = {
  id:string; name:IndicatorName; input:Condition|null; source:"bot"|"chart"; sourceTimeframe:string|null;
  style:IndicatorStyle; visibility:IndicatorVisibility;
};

const INTERVALS:Array<{value:Interval;label:string;long:string}> = [
  {value:"3m",label:"3m",long:"3 minutes"},{value:"5m",label:"5m",long:"5 minutes"},{value:"15m",label:"15m",long:"15 minutes"},
  {value:"1h",label:"1H",long:"1 hour"},{value:"4h",label:"4H",long:"4 hours"},{value:"1d",label:"D",long:"1 day"},
  {value:"1w",label:"W",long:"1 week"},{value:"1M",label:"M",long:"1 month"},
];
const HISTORY_BARS:Record<Interval,number>={"3m":6000,"5m":6000,"15m":6000,"1h":6000,"4h":6000,"1d":6000,"1w":2500,"1M":1200};
const INDICATORS:IndicatorName[]=[
  "Volume","RSI","Stochastic","MACD","Moving Average (MA)","Average Directional Index","Bollinger Bands %B","Money Flow Index",
  "Commodity Channel Index","Ultimate Oscillator","Parabolic SAR","Heikin Ashi",
];
const OVERLAYS=new Set<IndicatorName>(["Moving Average (MA)","Parabolic SAR","Heikin Ashi"]);
const DEFAULTS:Record<Exclude<IndicatorName,"Volume">,Condition>={
  RSI:{id:"chart-rsi",kind:"RSI",timeframe:"chart",length:14,comparator:"Less Than",signal:30,aux1:0,aux2:0,aux3:0},
  Stochastic:{id:"chart-stoch",kind:"Stochastic",timeframe:"chart",length:2,comparator:"Less Than",signal:20,aux1:14,aux2:1,aux3:3},
  MACD:{id:"chart-macd",kind:"MACD",timeframe:"chart",length:1,comparator:"Crossing Up",signal:0,aux1:12,aux2:26,aux3:9},
  "Moving Average (MA)":{id:"chart-ma",kind:"Moving Average (MA)",timeframe:"chart",length:0,comparator:"Crossing Up",signal:0,aux1:1,aux2:9,aux3:26},
  "Average Directional Index":{id:"chart-adx",kind:"Average Directional Index",timeframe:"chart",length:14,comparator:"Greater Than",signal:25,aux1:0,aux2:0,aux3:0},
  "Bollinger Bands %B":{id:"chart-bb",kind:"Bollinger Bands %B",timeframe:"chart",length:20,comparator:"Less Than",signal:0,aux1:2,aux2:0,aux3:0},
  "Money Flow Index":{id:"chart-mfi",kind:"Money Flow Index",timeframe:"chart",length:14,comparator:"Less Than",signal:20,aux1:0,aux2:0,aux3:0},
  "Commodity Channel Index":{id:"chart-cci",kind:"Commodity Channel Index",timeframe:"chart",length:20,comparator:"Less Than",signal:-100,aux1:0,aux2:0,aux3:0},
  "Ultimate Oscillator":{id:"chart-uo",kind:"Ultimate Oscillator",timeframe:"chart",length:0,comparator:"Less Than",signal:30,aux1:7,aux2:14,aux3:28},
  "Parabolic SAR":{id:"chart-psar",kind:"Parabolic SAR",timeframe:"chart",length:0,comparator:"Crossing Up",signal:0,aux1:2,aux2:1,aux3:0},
  "Heikin Ashi":{id:"chart-ha",kind:"Heikin Ashi",timeframe:"chart",length:2,comparator:"Greater Than",signal:0,aux1:0,aux2:0,aux3:0},
};
const DEFAULT_PANE_HEIGHT:Record<IndicatorName,number>={
  Volume:92,RSI:138,Stochastic:148,MACD:150,"Moving Average (MA)":0,"Average Directional Index":138,"Bollinger Bands %B":136,
  "Money Flow Index":136,"Commodity Channel Index":136,"Ultimate Oscillator":136,"Parabolic SAR":0,"Heikin Ashi":0,
};

function chooseInterval(createdAt:string,closedAt?:string):Interval{const start=new Date(createdAt).getTime(),end=closedAt?new Date(closedAt).getTime():Date.now(),hours=Math.max(0,(end-start)/3600000);if(hours<=6)return"3m";if(hours<=24)return"5m";if(hours<=72)return"15m";if(hours<=24*30)return"1h";if(hours<=24*180)return"4h";if(hours<=24*1000)return"1d";return"1w";}
function t(c:Candle):UTCTimestamp{return Math.floor(c.openTime/1000) as UTCTimestamp;}
function nearestCandleTime(candles:Candle[],timestamp:number):UTCTimestamp|null{if(!candles.length)return null;let candidate=candles[0];for(const candle of candles){if(candle.openTime<=timestamp)candidate=candle;else break;}return t(candidate);}
function precisionFor(value:number){const v=Math.abs(value);if(v>=1000)return 2;if(v>=100)return 3;if(v>=1)return 4;if(v>=.1)return 5;if(v>=.01)return 6;return 8;}
function normalizeLength(value:number,fallback:number){return Math.max(1,Math.round(Number.isFinite(value)&&value>0?value:fallback));}
function values(c:Candle[]){return c.map(x=>x.close);}
function sma(input:number[],length:number):Array<number|null>{const out:Array<number|null>=Array(input.length).fill(null);let sum=0;for(let i=0;i<input.length;i++){sum+=input[i];if(i>=length)sum-=input[i-length];if(i>=length-1)out[i]=sum/length;}return out;}
function ema(input:number[],length:number):Array<number|null>{const out:Array<number|null>=Array(input.length).fill(null);if(!input.length)return out;const k=2/(length+1);let seed=0;for(let i=0;i<input.length;i++){if(i<length)seed+=input[i];if(i===length-1)out[i]=seed/length;else if(i>=length&&out[i-1]!=null)out[i]=input[i]*k+(out[i-1] as number)*(1-k);}return out;}
function wma(input:number[],length:number):Array<number|null>{const out:Array<number|null>=Array(input.length).fill(null),div=length*(length+1)/2;for(let i=length-1;i<input.length;i++){let sum=0;for(let j=0;j<length;j++)sum+=input[i-length+1+j]*(j+1);out[i]=sum/div;}return out;}
function toPoints(c:Candle[],input:Array<number|null>):Point[]{return input.flatMap((v,i)=>v==null||!Number.isFinite(v)?[]:[{time:t(c[i]),value:v}]);}
function rsi(c:Candle[],length:number):Point[]{if(c.length<=length)return[];const out:Point[]=[];let gain=0,loss=0;for(let i=1;i<=length;i++){const d=c[i].close-c[i-1].close;gain+=Math.max(d,0);loss+=Math.max(-d,0);}gain/=length;loss/=length;for(let i=length;i<c.length;i++){if(i>length){const d=c[i].close-c[i-1].close;gain=(gain*(length-1)+Math.max(d,0))/length;loss=(loss*(length-1)+Math.max(-d,0))/length;}out.push({time:t(c[i]),value:loss===0?100:100-100/(1+gain/loss)});}return out;}
function stochastic(c:Candle[],kLength:number,kSmooth:number,dSmooth:number){const raw:Array<number|null>=c.map((x,i)=>{if(i<kLength-1)return null;const win=c.slice(i-kLength+1,i+1),hi=Math.max(...win.map(v=>v.high)),lo=Math.min(...win.map(v=>v.low));return hi===lo?50:(x.close-lo)/(hi-lo)*100;});const smooth=(input:Array<number|null>,length:number)=>input.map((_,i)=>{if(i<length-1)return null;const win=input.slice(i-length+1,i+1);if(win.some(v=>v==null))return null;return win.reduce((s,v)=>s+(v??0),0)/length;});const k=smooth(raw,kSmooth),d=smooth(k,dSmooth);return{k:toPoints(c,k),d:toPoints(c,d)};}
function macd(c:Candle[],fast:number,slow:number,signal:number){const close=values(c),f=ema(close,fast),s=ema(close,slow),mRaw=close.map((_,i)=>f[i]==null||s[i]==null?null:(f[i] as number)-(s[i] as number)),sig=ema(mRaw.map(v=>v??0),signal),sigValues=mRaw.map((v,i)=>v==null||sig[i]==null?null:sig[i]),hist=mRaw.map((v,i)=>v==null||sigValues[i]==null?null:v-(sigValues[i] as number));return{macd:toPoints(c,mRaw),signal:toPoints(c,sigValues),hist};}
function adx(c:Candle[],length:number){const count=c.length,tr=Array(count).fill(0),plusDM=Array(count).fill(0),minusDM=Array(count).fill(0);for(let i=1;i<count;i++){tr[i]=Math.max(c[i].high-c[i].low,Math.abs(c[i].high-c[i-1].close),Math.abs(c[i].low-c[i-1].close));const up=c[i].high-c[i-1].high,down=c[i-1].low-c[i].low;plusDM[i]=up>down&&up>0?up:0;minusDM[i]=down>up&&down>0?down:0;}const plus:Array<number|null>=Array(count).fill(null),minus:Array<number|null>=Array(count).fill(null),dx:Array<number|null>=Array(count).fill(null),ax:Array<number|null>=Array(count).fill(null);let trS=0,pS=0,mS=0;for(let i=1;i<=length&&i<count;i++){trS+=tr[i];pS+=plusDM[i];mS+=minusDM[i];}if(count>length){plus[length]=trS?pS/trS*100:0;minus[length]=trS?mS/trS*100:0;dx[length]=(plus[length]!+minus[length]!)?Math.abs(plus[length]!-minus[length]!)/(plus[length]!+minus[length]!)*100:0;for(let i=length+1;i<count;i++){trS=trS-trS/length+tr[i];pS=pS-pS/length+plusDM[i];mS=mS-mS/length+minusDM[i];plus[i]=trS?pS/trS*100:0;minus[i]=trS?mS/trS*100:0;dx[i]=(plus[i]!+minus[i]!)?Math.abs(plus[i]!-minus[i]!)/(plus[i]!+minus[i]!)*100:0;}const start=length*2-1;if(start<count){let sum=0;for(let i=length;i<=start;i++)sum+=dx[i]??0;ax[start]=sum/length;for(let i=start+1;i<count;i++)ax[i]=((ax[i-1]??0)*(length-1)+(dx[i]??0))/length;}}return{adx:toPoints(c,ax),plus:toPoints(c,plus),minus:toPoints(c,minus)};}
function bbPercent(c:Candle[],length:number,deviation:number){const close=values(c),avg=sma(close,length),out:Array<number|null>=Array(close.length).fill(null);for(let i=length-1;i<close.length;i++){const mean=avg[i] as number,win=close.slice(i-length+1,i+1),sd=Math.sqrt(win.reduce((s,v)=>s+(v-mean)**2,0)/length),upper=mean+deviation*sd,lower=mean-deviation*sd;out[i]=upper===lower?.5:(close[i]-lower)/(upper-lower);}return toPoints(c,out);}
function mfi(c:Candle[],length:number){const tp=c.map(x=>(x.high+x.low+x.close)/3),flow=c.map((x,i)=>tp[i]*x.volume),out:Array<number|null>=Array(c.length).fill(null);for(let i=length;i<c.length;i++){let pos=0,neg=0;for(let j=i-length+1;j<=i;j++){if(tp[j]>=tp[j-1])pos+=flow[j];else neg+=flow[j];}out[i]=neg===0?100:100-100/(1+pos/neg);}return toPoints(c,out);}
function cci(c:Candle[],length:number){const tp=c.map(x=>(x.high+x.low+x.close)/3),avg=sma(tp,length),out:Array<number|null>=Array(c.length).fill(null);for(let i=length-1;i<c.length;i++){const mean=avg[i] as number,win=tp.slice(i-length+1,i+1),dev=win.reduce((s,v)=>s+Math.abs(v-mean),0)/length;out[i]=dev===0?0:(tp[i]-mean)/(.015*dev);}return toPoints(c,out);}
function ultimate(c:Candle[],a:number,b:number,d:number){const bp=Array(c.length).fill(0),tr=Array(c.length).fill(0),out:Array<number|null>=Array(c.length).fill(null);for(let i=1;i<c.length;i++){const min=Math.min(c[i].low,c[i-1].close),max=Math.max(c[i].high,c[i-1].close);bp[i]=c[i].close-min;tr[i]=max-min;}const ratio=(end:number,len:number)=>{let bps=0,trs=0;for(let i=end-len+1;i<=end;i++){bps+=bp[i];trs+=tr[i];}return trs===0?0:bps/trs;};const maxLen=Math.max(a,b,d);for(let i=maxLen;i<c.length;i++)out[i]=100*(4*ratio(i,a)+2*ratio(i,b)+ratio(i,d))/7;return toPoints(c,out);}
function psar(c:Candle[],step:number,maximum:number){if(c.length<2)return[] as Point[];const out:Point[]=[];let bull=c[1].close>=c[0].close,sar=bull?c[0].low:c[0].high,ep=bull?c[0].high:c[0].low,af=step;for(let i=1;i<c.length;i++){sar=sar+af*(ep-sar);if(bull){sar=Math.min(sar,c[i-1].low,i>1?c[i-2].low:c[i-1].low);if(c[i].low<sar){bull=false;sar=ep;ep=c[i].low;af=step;}else if(c[i].high>ep){ep=c[i].high;af=Math.min(maximum,af+step);}}else{sar=Math.max(sar,c[i-1].high,i>1?c[i-2].high:c[i-1].high);if(c[i].high>sar){bull=true;sar=ep;ep=c[i].high;af=step;}else if(c[i].low<ep){ep=c[i].low;af=Math.min(maximum,af+step);}}out.push({time:t(c[i]),value:sar});}return out;}
function heikin(c:Candle[]){let po=c[0]?(c[0].open+c[0].close)/2:0,pc=c[0]?(c[0].open+c[0].high+c[0].low+c[0].close)/4:0;return c.map((x,i)=>{const close=(x.open+x.high+x.low+x.close)/4,open=i===0?po:(po+pc)/2,high=Math.max(x.high,open,close),low=Math.min(x.low,open,close);po=open;pc=close;return{time:t(x),open,high,low,close};});}
function lineStyleValue(value:IndicatorStyle["lineStyle"]){return value==="Dashed"?LineStyle.Dashed:value==="Dotted"?LineStyle.Dotted:LineStyle.Solid;}
function width(value:number){return Math.max(1,Math.min(4,Math.round(value))) as 1|2|3|4;}
function uid(name:IndicatorName){return `${name.replace(/[^A-Z0-9]+/gi,"-").toLowerCase()}-${Date.now()}-${Math.random().toString(16).slice(2)}`;}
function defaultStyle(name:IndicatorName):IndicatorStyle{
  const base:IndicatorStyle={color1:"#b78de3",color2:"#d6924e",color3:"#75b995",upColor:"#6aab91",downColor:"#b3676f",thresholdColor:"#626262",lineWidth:2,lineStyle:"Solid",showUpper:false,showLower:false,upper:70,lower:30};
  if(name==="Volume")return{...base,upColor:"#5b9b83",downColor:"#a85e67",lineWidth:1};
  if(name==="Stochastic")return{...base,color1:"#2e9df4",color2:"#ff7a00",showUpper:true,showLower:true,upper:80,lower:20};
  if(name==="MACD")return{...base,color1:"#5aa8ef",color2:"#f0a044",upColor:"#5d9f84",downColor:"#ad5e67"};
  if(name==="Moving Average (MA)")return{...base,color1:"#e0b15d",color2:"#9c78d8"};
  if(name==="Average Directional Index")return{...base,color1:"#dddddd",color2:"#75b995",color3:"#cf7d86",showUpper:true,upper:25};
  if(name==="Bollinger Bands %B")return{...base,color1:"#91a7ce",showUpper:true,showLower:true,upper:1,lower:0};
  if(name==="Money Flow Index")return{...base,color1:"#81ba9d",showUpper:true,showLower:true,upper:80,lower:20};
  if(name==="Commodity Channel Index")return{...base,color1:"#d3aa63",showUpper:true,showLower:true,upper:100,lower:-100};
  if(name==="Ultimate Oscillator")return{...base,color1:"#c29ad9",showUpper:true,showLower:true,upper:70,lower:30};
  if(name==="Parabolic SAR")return{...base,color1:"#d4d4d4",lineWidth:1,lineStyle:"Dotted"};
  if(name==="Heikin Ashi")return{...base,upColor:"#76bda0",downColor:"#b76570",lineWidth:1};
  return base;
}
function makeInstance(name:IndicatorName,input?:Condition|null,source:"bot"|"chart"="chart"):IndicatorInstance{
  const copy=name==="Volume"?null:{...(input??DEFAULTS[name as Exclude<IndicatorName,"Volume">]),id:uid(name),kind:name,timeframe:"chart"};
  return{id:uid(name),name,input:copy,source,sourceTimeframe:source==="bot"?input?.timeframe??null:null,style:defaultStyle(name),visibility:{visible:true,priceScale:true,statusLine:true,paneHeight:DEFAULT_PANE_HEIGHT[name]||130}};
}
function instanceSummary(instance:IndicatorInstance){const c=instance.input;if(instance.name==="Volume")return"Volume";if(!c)return instance.name;if(instance.name==="RSI")return`RSI ${normalizeLength(c.length,14)}`;if(instance.name==="Stochastic")return`Stoch ${normalizeLength(c.aux1,14)} ${normalizeLength(c.aux2,1)} ${normalizeLength(c.aux3,3)}`;if(instance.name==="MACD")return`MACD ${normalizeLength(c.aux1,12)} ${normalizeLength(c.aux2,26)} ${normalizeLength(c.aux3,9)}`;if(instance.name==="Moving Average (MA)")return`${c.aux1===2?"WMA":c.aux1===0?"SMA":"EMA"} ${normalizeLength(c.aux2,9)} / ${normalizeLength(c.aux3,26)}`;if(instance.name==="Average Directional Index")return`ADX ${normalizeLength(c.length,14)}`;if(instance.name==="Bollinger Bands %B")return`BB %B ${normalizeLength(c.length,20)} · ${c.aux1||2}σ`;if(instance.name==="Money Flow Index")return`MFI ${normalizeLength(c.length,14)}`;if(instance.name==="Commodity Channel Index")return`CCI ${normalizeLength(c.length,20)}`;if(instance.name==="Ultimate Oscillator")return`Ultimate ${normalizeLength(c.aux1,7)} ${normalizeLength(c.aux2,14)} ${normalizeLength(c.aux3,28)}`;if(instance.name==="Parabolic SAR")return`PSAR ${(c.aux1?c.aux1/100:.02).toFixed(2)} · ${(c.aux2?c.aux2/5:.2).toFixed(2)}`;return"Heikin Ashi";}
function addThreshold(series:ISeriesApi<"Line">,price:number,title:string,instance:IndicatorInstance){if(!Number.isFinite(price))return;series.createPriceLine({price,color:instance.style.thresholdColor,lineWidth:1,lineStyle:LineStyle.Dashed,axisLabelVisible:instance.visibility.priceScale,title});}
async function loadSnapshot(accountId:string,tradeId:string){const{data,error}=await browserSupabase.functions.invoke("trader-chart-control",{body:{accountId,tradeId}});if(error){let message=error.message||"trade_chart_failed";const context=(error as{context?:Response}).context;if(context){try{const payload=await context.clone().json() as{error?:string};if(payload.error)message=payload.error;}catch{}}throw new Error(message);}const result=(data??{}) as ChartSnapshot;if(result.error||result.ok!==true)throw new Error(result.error||"trade_chart_failed");return result;}

export default function DcaTradeChartV2Workstation(props:Props){
  const{accountId,tradeId,onClose}=props;
  const containerRef=useRef<HTMLDivElement|null>(null),chartRef=useRef<IChartApi|null>(null),marketLineRef=useRef<IPriceLine|null>(null),initializedForTrade=useRef<string|null>(null);
  const[interval,setInterval]=useState<Interval>(()=>chooseInterval(props.createdAt,props.closedAt));
  const[candles,setCandles]=useState<Candle[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(""),[snapshot,setSnapshot]=useState<ChartSnapshot|null>(null);
  const[showTimeframes,setShowTimeframes]=useState(false),[showIndicators,setShowIndicators]=useState(false),[indicatorSearch,setIndicatorSearch]=useState("");
  const[instances,setInstances]=useState<IndicatorInstance[]>(()=>[makeInstance("Volume"),makeInstance("RSI"),makeInstance("Stochastic")]);
  const[editingId,setEditingId]=useState<string|null>(null),[settingsTab,setSettingsTab]=useState<SettingsTab>("Inputs"),[draft,setDraft]=useState<IndicatorInstance|null>(null);
  const priceHeight=360;

  const trade=snapshot?.trade??({id:tradeId,pair:props.pair,status:props.status,entryPrice:props.entryPrice,averagePrice:props.averagePrice,quantity:0,invested:0,takeProfitPct:0,takeProfitPrice:props.takeProfitPrice??null,stopEnabled:Boolean(props.stopLossPrice),stopPct:0,stopLossPrice:props.stopLossPrice??null,lastPrice:props.lastPrice??null,exitPrice:props.exitPrice??null,openedAt:props.createdAt,closedAt:props.closedAt??null,closeReason:props.closeReason??null} satisfies ChartTrade);
  const fills=snapshot?.fills?.length?snapshot.fills:(props.fills??[]),conditions=snapshot?.bot?.conditions??[],activeOrders=snapshot?.activeOrders??[];
  const pendingDcas=activeOrders.filter(o=>o.side.toUpperCase()==="BUY"&&o.price!=null&&o.kind.toLowerCase().includes("averag")).sort((a,b)=>a.sequence-b.sequence);
  const pendingExits=activeOrders.filter(o=>o.side.toUpperCase()==="SELL"&&o.price!=null).sort((a,b)=>a.sequence-b.sequence),symbol=trade.pair.replace("/","");

  useEffect(()=>{let alive=true;const refresh=async(quiet=false)=>{if(!quiet)setLoading(true);try{const data=await loadSnapshot(accountId,tradeId);if(alive){setSnapshot(data);setError("");}}catch(caught){if(alive&&!quiet)setError(caught instanceof Error?caught.message:"Unable to load exact trade ledger.");}finally{if(alive&&!quiet)setLoading(false);}};void refresh(false);const timer=window.setInterval(()=>void refresh(true),5000);return()=>{alive=false;window.clearInterval(timer);};},[accountId,tradeId]);
  useEffect(()=>{if(initializedForTrade.current===tradeId||!snapshot)return;initializedForTrade.current=tradeId;if(conditions.length){setInstances([makeInstance("Volume"),...conditions.filter(c=>INDICATORS.includes(c.kind as IndicatorName)).map(c=>makeInstance(c.kind as IndicatorName,c,"bot"))]);}},[snapshot,tradeId,conditions]);
  useEffect(()=>{let cancelled=false;const run=async()=>{setLoading(true);setError("");try{const params=new URLSearchParams({symbol,interval,bars:String(HISTORY_BARS[interval]),endTime:String(Date.now())}),response=await fetch(`/api/trader/klines?${params.toString()}`,{cache:"no-store"}),data=await response.json();if(!response.ok)throw new Error(data?.error??"Unable to load Binance candles");if(!cancelled)setCandles(Array.isArray(data.candles)?data.candles:[]);}catch(caught){if(!cancelled)setError(caught instanceof Error?caught.message:"Unable to load chart");}finally{if(!cancelled)setLoading(false);}};void run();return()=>{cancelled=true;};},[symbol,interval]);

  const structureSignature=useMemo(()=>JSON.stringify({fills:fills.map(f=>[f.kind,f.side,f.price,f.at]),orders:activeOrders.map(o=>[o.id,o.kind,o.side,o.sequence,o.price]),avg:trade.averagePrice,tp:trade.takeProfitPrice,sl:trade.stopLossPrice,exit:trade.exitPrice}),[fills,activeOrders,trade.averagePrice,trade.takeProfitPrice,trade.stopLossPrice,trade.exitPrice]);
  const instanceSignature=JSON.stringify(instances);
  const separateInstances=instances.filter(i=>i.visibility.visible&&!OVERLAYS.has(i.name)),overlayInstances=instances.filter(i=>i.visibility.visible&&OVERLAYS.has(i.name));
  const canvasHeight=Math.max(440,priceHeight+separateInstances.reduce((sum,i)=>sum+Math.max(80,i.visibility.paneHeight),0));

  useEffect(()=>{
    const host=containerRef.current;if(!host||!candles.length)return;host.replaceChildren();
    const chart=createChart(host,{width:host.clientWidth,height:host.clientHeight,layout:{background:{type:ColorType.Solid,color:"#111820"},textColor:"#aab3bd",attributionLogo:true,panes:{separatorColor:"#28333f",separatorHoverColor:"#526273",enableResize:true}},grid:{vertLines:{color:"rgba(255,255,255,.035)"},horzLines:{color:"rgba(255,255,255,.035)"}},crosshair:{vertLine:{color:"#5c6a79",labelBackgroundColor:"#26313c"},horzLine:{color:"#5c6a79",labelBackgroundColor:"#26313c"}},rightPriceScale:{borderColor:"#2c3742",minimumWidth:76,autoScale:true},timeScale:{borderColor:"#2c3742",timeVisible:!["1d","1w","1M"].includes(interval),secondsVisible:false,rightOffset:8,barSpacing:interval==="1M"?8:interval==="1w"?7:5,minBarSpacing:.8},handleScroll:{mouseWheel:true,pressedMouseMove:true,horzTouchDrag:true,vertTouchDrag:true},handleScale:{axisPressedMouseMove:true,mouseWheel:true,pinch:true},kineticScroll:{mouse:true,touch:true}});
    chartRef.current=chart;const priceReference=trade.averagePrice||trade.entryPrice||candles.at(-1)?.close||1,precision=precisionFor(priceReference);
    const candleSeries=chart.addSeries(CandlestickSeries,{upColor:"#aeb7c0",downColor:"#515b65",borderUpColor:"#aeb7c0",borderDownColor:"#515b65",wickUpColor:"#7e8994",wickDownColor:"#515b65",priceLineVisible:false,lastValueVisible:true,priceFormat:{type:"price",precision,minMove:10**(-precision)}});
    candleSeries.setData(candles.map(c=>({time:t(c),open:c.open,high:c.high,low:c.low,close:c.close})));

    for(const instance of overlayInstances){const c=instance.input,s=instance.style,title=instance.visibility.statusLine?instanceSummary(instance):"";
      if(instance.name==="Moving Average (MA)"&&c){const fast=normalizeLength(c.aux2,9),slow=normalizeLength(c.aux3,26),close=values(candles),calc=c.aux1===2?wma:c.aux1===0?sma:ema,ls=lineStyleValue(s.lineStyle);const a=chart.addSeries(LineSeries,{color:s.color1,lineWidth:width(s.lineWidth),lineStyle:ls,priceLineVisible:false,lastValueVisible:instance.visibility.priceScale,title:`${title} fast`}),b=chart.addSeries(LineSeries,{color:s.color2,lineWidth:width(s.lineWidth),lineStyle:ls,priceLineVisible:false,lastValueVisible:instance.visibility.priceScale,title:`${title} slow`});a.setData(toPoints(candles,calc(close,fast)));b.setData(toPoints(candles,calc(close,slow)));}
      else if(instance.name==="Parabolic SAR"&&c){const step=Math.max(.001,c.aux1?c.aux1/100:.02),max=Math.max(step,c.aux2?c.aux2/5:.2),series=chart.addSeries(LineSeries,{color:s.color1,lineWidth:width(s.lineWidth),lineStyle:lineStyleValue(s.lineStyle),priceLineVisible:false,lastValueVisible:instance.visibility.priceScale,title});series.setData(psar(candles,step,max));}
      else if(instance.name==="Heikin Ashi"){const series=chart.addSeries(CandlestickSeries,{upColor:s.upColor,downColor:s.downColor,borderUpColor:s.upColor,borderDownColor:s.downColor,wickUpColor:s.upColor,wickDownColor:s.downColor,priceLineVisible:false,lastValueVisible:instance.visibility.priceScale,title});series.setData(heikin(candles));}
    }

    let nextPane=1;const paneMap=new Map<string,number>();
    for(const instance of separateInstances){const pane=nextPane++;paneMap.set(instance.id,pane);const c=instance.input,s=instance.style,title=instance.visibility.statusLine?instanceSummary(instance):"",ls=lineStyleValue(s.lineStyle);
      if(instance.name==="Volume"){const series=chart.addSeries(HistogramSeries,{priceFormat:{type:"volume"},priceLineVisible:false,lastValueVisible:instance.visibility.priceScale,title},pane);series.setData(candles.map(x=>({time:t(x),value:x.volume,color:x.close>=x.open?s.upColor:s.downColor})));}
      else if(instance.name==="RSI"&&c){const series=chart.addSeries(LineSeries,{color:s.color1,lineWidth:width(s.lineWidth),lineStyle:ls,priceLineVisible:false,lastValueVisible:instance.visibility.priceScale,title},pane);series.setData(rsi(candles,normalizeLength(c.length,14)));if(s.showUpper)addThreshold(series,s.upper,String(s.upper),instance);if(s.showLower)addThreshold(series,s.lower,String(s.lower),instance);}
      else if(instance.name==="Stochastic"&&c){const st=stochastic(candles,normalizeLength(c.aux1,14),normalizeLength(c.aux2,1),normalizeLength(c.aux3,3)),k=chart.addSeries(LineSeries,{color:s.color1,lineWidth:width(s.lineWidth),lineStyle:ls,priceLineVisible:false,lastValueVisible:instance.visibility.priceScale,title:title?`${title} %K`:""},pane),d=chart.addSeries(LineSeries,{color:s.color2,lineWidth:width(s.lineWidth),lineStyle:ls,priceLineVisible:false,lastValueVisible:instance.visibility.priceScale,title:title?`${title} %D`:""},pane);k.setData(st.k);d.setData(st.d);if(s.showUpper)addThreshold(k,s.upper,String(s.upper),instance);if(s.showLower)addThreshold(k,s.lower,String(s.lower),instance);}
      else if(instance.name==="MACD"&&c){const m=macd(candles,normalizeLength(c.aux1,12),normalizeLength(c.aux2,26),normalizeLength(c.aux3,9)),hist=chart.addSeries(HistogramSeries,{priceLineVisible:false,lastValueVisible:false,title:title?`${title} hist`:""},pane),ml=chart.addSeries(LineSeries,{color:s.color1,lineWidth:width(s.lineWidth),lineStyle:ls,priceLineVisible:false,lastValueVisible:instance.visibility.priceScale,title:title?`${title} MACD`:""},pane),sl=chart.addSeries(LineSeries,{color:s.color2,lineWidth:width(s.lineWidth),lineStyle:ls,priceLineVisible:false,lastValueVisible:instance.visibility.priceScale,title:title?`${title} Signal`:""},pane);hist.setData(m.hist.flatMap((v,i)=>v==null?[]:[{time:t(candles[i]),value:v,color:v>=0?s.upColor:s.downColor}]));ml.setData(m.macd);sl.setData(m.signal);addThreshold(ml,0,"0",instance);}
      else if(instance.name==="Average Directional Index"&&c){const data=adx(candles,normalizeLength(c.length,14)),ax=chart.addSeries(LineSeries,{color:s.color1,lineWidth:width(s.lineWidth),lineStyle:ls,priceLineVisible:false,lastValueVisible:instance.visibility.priceScale,title:title?`${title} ADX`:""},pane),plus=chart.addSeries(LineSeries,{color:s.color2,lineWidth:1,lineStyle:ls,priceLineVisible:false,lastValueVisible:false,title:title?`${title} +DI`:""},pane),minus=chart.addSeries(LineSeries,{color:s.color3,lineWidth:1,lineStyle:ls,priceLineVisible:false,lastValueVisible:false,title:title?`${title} -DI`:""},pane);ax.setData(data.adx);plus.setData(data.plus);minus.setData(data.minus);if(s.showUpper)addThreshold(ax,s.upper,String(s.upper),instance);}
      else if(instance.name==="Bollinger Bands %B"&&c){const series=chart.addSeries(LineSeries,{color:s.color1,lineWidth:width(s.lineWidth),lineStyle:ls,priceLineVisible:false,lastValueVisible:instance.visibility.priceScale,title},pane);series.setData(bbPercent(candles,normalizeLength(c.length,20),c.aux1||2));if(s.showUpper)addThreshold(series,s.upper,String(s.upper),instance);if(s.showLower)addThreshold(series,s.lower,String(s.lower),instance);}
      else if(instance.name==="Money Flow Index"&&c){const series=chart.addSeries(LineSeries,{color:s.color1,lineWidth:width(s.lineWidth),lineStyle:ls,priceLineVisible:false,lastValueVisible:instance.visibility.priceScale,title},pane);series.setData(mfi(candles,normalizeLength(c.length,14)));if(s.showUpper)addThreshold(series,s.upper,String(s.upper),instance);if(s.showLower)addThreshold(series,s.lower,String(s.lower),instance);}
      else if(instance.name==="Commodity Channel Index"&&c){const series=chart.addSeries(LineSeries,{color:s.color1,lineWidth:width(s.lineWidth),lineStyle:ls,priceLineVisible:false,lastValueVisible:instance.visibility.priceScale,title},pane);series.setData(cci(candles,normalizeLength(c.length,20)));if(s.showUpper)addThreshold(series,s.upper,String(s.upper),instance);if(s.showLower)addThreshold(series,s.lower,String(s.lower),instance);}
      else if(instance.name==="Ultimate Oscillator"&&c){const series=chart.addSeries(LineSeries,{color:s.color1,lineWidth:width(s.lineWidth),lineStyle:ls,priceLineVisible:false,lastValueVisible:instance.visibility.priceScale,title},pane);series.setData(ultimate(candles,normalizeLength(c.aux1,7),normalizeLength(c.aux2,14),normalizeLength(c.aux3,28)));if(s.showUpper)addThreshold(series,s.upper,String(s.upper),instance);if(s.showLower)addThreshold(series,s.lower,String(s.lower),instance);}
    }

    const markers:SeriesMarker<UTCTimestamp>[] = fills.flatMap((fill,index)=>{if((fill.side??"BUY").toUpperCase()!=="BUY")return[];const time=nearestCandleTime(candles,new Date(fill.at).getTime());if(!time)return[];return[{time,position:"belowBar",color:"#35e5bd",shape:"arrowUp",text:fill.kind.toLowerCase().includes("base")?"BUY":`DCA ${index}`}];});
    if(trade.status==="Closed"&&trade.closedAt){const time=nearestCandleTime(candles,new Date(trade.closedAt).getTime());if(time)markers.push({time,position:"aboveBar",color:"#f0808b",shape:"arrowDown",text:trade.closeReason==="Take Profit"?"TP":trade.closeReason==="Stop Loss"?"SL":"EXIT"});}
    createSeriesMarkers(candleSeries,markers);
    candleSeries.createPriceLine({price:trade.averagePrice,color:"#e3a91d",lineWidth:2,lineStyle:LineStyle.Solid,axisLabelVisible:true,title:"Avg. Buy Price"});
    const tpPrices=pendingExits.length?pendingExits:trade.takeProfitPrice?[{id:"derived-tp",kind:"take_profit",side:"SELL",status:"DERIVED",sequence:1,price:trade.takeProfitPrice,amount:trade.invested}]:[];
    tpPrices.forEach((order,index)=>order.price&&candleSeries.createPriceLine({price:order.price,color:"#4dd4a2",lineWidth:1,lineStyle:LineStyle.Dashed,axisLabelVisible:true,title:tpPrices.length>1?`TP ${index+1}`:"TP"}));
    if(trade.stopLossPrice&&trade.stopLossPrice>0)candleSeries.createPriceLine({price:trade.stopLossPrice,color:"#e46f7b",lineWidth:1,lineStyle:LineStyle.Dashed,axisLabelVisible:true,title:"SL"});
    pendingDcas.forEach((order,index)=>order.price&&candleSeries.createPriceLine({price:order.price,color:"#498dc9",lineWidth:1,lineStyle:LineStyle.Solid,axisLabelVisible:true,title:`DCA ${order.sequence||index+1}`}));
    if(!pendingDcas.length&&props.nextAveragingPrice)candleSeries.createPriceLine({price:props.nextAveragingPrice,color:"#498dc9",lineWidth:1,lineStyle:LineStyle.Solid,axisLabelVisible:true,title:"Next DCA"});
    if(trade.status==="Closed"&&trade.exitPrice&&trade.exitPrice>0)candleSeries.createPriceLine({price:trade.exitPrice,color:"#e27883",lineWidth:1,lineStyle:LineStyle.Dashed,axisLabelVisible:true,title:trade.closeReason??"Exit"});
    if(trade.status==="Active"&&trade.lastPrice&&trade.lastPrice>0)marketLineRef.current=candleSeries.createPriceLine({price:trade.lastPrice,color:"#d8dde2",lineWidth:1,lineStyle:LineStyle.Dotted,axisLabelVisible:true,title:""});else marketLineRef.current=null;
    const panes=chart.panes();if(panes[0])panes[0].setHeight(priceHeight);paneMap.forEach((paneIndex,id)=>{const instance=instances.find(i=>i.id===id);if(panes[paneIndex]&&instance)panes[paneIndex].setHeight(Math.max(80,instance.visibility.paneHeight));});
    const recentBars=interval==="1M"?120:interval==="1w"?180:interval==="1d"?320:420;chart.timeScale().setVisibleLogicalRange({from:Math.max(0,candles.length-recentBars),to:candles.length+8});
    const resize=new ResizeObserver(()=>chart.applyOptions({width:host.clientWidth,height:host.clientHeight}));resize.observe(host);return()=>{resize.disconnect();chart.remove();chartRef.current=null;marketLineRef.current=null;};
  },[candles,interval,instanceSignature,structureSignature,canvasHeight]);

  useEffect(()=>{if(marketLineRef.current&&trade.status==="Active"&&trade.lastPrice&&trade.lastPrice>0)marketLineRef.current.applyOptions({price:trade.lastPrice});},[trade.lastPrice,trade.status]);

  const filteredIndicators=INDICATORS.filter(name=>name.toLowerCase().includes(indicatorSearch.trim().toLowerCase()));
  const currentInterval=INTERVALS.find(i=>i.value===interval)??INTERVALS[0];
  const addIndicator=(name:IndicatorName)=>setInstances(current=>[...current,makeInstance(name)]);
  const removeInstance=(id:string)=>setInstances(current=>current.filter(i=>i.id!==id));
  const editInstance=(id:string)=>{const found=instances.find(i=>i.id===id);if(!found)return;setEditingId(id);setDraft(structuredClone(found));setSettingsTab("Inputs");setShowIndicators(false);};
  const updateDraft=(patch:Partial<IndicatorInstance>)=>setDraft(current=>current?{...current,...patch}:current);
  const updateInput=(patch:Partial<Condition>)=>setDraft(current=>current&&current.input?{...current,input:{...current.input,...patch}}:current);
  const updateStyle=(patch:Partial<IndicatorStyle>)=>setDraft(current=>current?{...current,style:{...current.style,...patch}}:current);
  const updateVisibility=(patch:Partial<IndicatorVisibility>)=>setDraft(current=>current?{...current,visibility:{...current.visibility,...patch}}:current);
  const applySettings=()=>{if(!editingId||!draft)return;setInstances(current=>current.map(i=>i.id===editingId?draft:i));setEditingId(null);setDraft(null);};
  const resetSettings=()=>{if(!draft)return;const sourceInput=draft.source==="bot"?conditions.find(c=>c.kind===draft.name&&c.timeframe===draft.sourceTimeframe):undefined;setDraft(makeInstance(draft.name,sourceInput??undefined,draft.source));};
  const movePane=(id:string,direction:-1|1)=>setInstances(current=>{const visible=current.filter(i=>i.visibility.visible&&!OVERLAYS.has(i.name)),at=visible.findIndex(i=>i.id===id),next=at+direction;if(at<0||next<0||next>=visible.length)return current;const a=current.findIndex(i=>i.id===visible[at].id),b=current.findIndex(i=>i.id===visible[next].id),copy=[...current];[copy[a],copy[b]]=[copy[b],copy[a]];return copy;});
  const paneTop=(id:string)=>{let top=priceHeight;for(const instance of separateInstances){if(instance.id===id)return top;top+=Math.max(80,instance.visibility.paneHeight);}return top;};

  return <div className={styles.overlay} role="dialog" aria-modal="true" aria-label={`${trade.pair} TV chart`} onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}>
    <section className={styles.modal}>
      <header className={styles.topbar}><div><h2>TV Chart</h2><p>{trade.pair} · BINANCE · {snapshot?.bot?.name??"DCA Bot"}</p></div><button className={styles.close} onClick={onClose}>×</button></header>
      <div className={styles.tvToolbar}>
        <div className={styles.dropdownWrap}>
          <button className={`${styles.tvToolButton} ${showTimeframes?styles.active:""}`} onClick={()=>{setShowTimeframes(v=>!v);setShowIndicators(false);}}><span className={styles.candleIcon}>⌁</span>{currentInterval.label}<b>⌄</b></button>
          {showTimeframes&&<div className={styles.timeframeMenu}>{INTERVALS.map(item=><button key={item.value} className={item.value===interval?styles.selectedMenuItem:""} onClick={()=>{setInterval(item.value);setShowTimeframes(false);}}><strong>{item.label}</strong><span>{item.long}</span>{item.value===interval&&<i>✓</i>}</button>)}</div>}
        </div>
        <div className={styles.dropdownWrap}>
          <button className={`${styles.tvToolButton} ${showIndicators?styles.active:""}`} onClick={()=>{setShowIndicators(v=>!v);setShowTimeframes(false);}}>ƒx&nbsp; Indicators<b>⌄</b></button>
          {showIndicators&&<div className={styles.indicatorLibrary}>
            <div className={styles.libraryTitle}><strong>Indicators</strong><button onClick={()=>setShowIndicators(false)}>×</button></div>
            <div className={styles.indicatorSearch}><span>⌕</span><input autoFocus value={indicatorSearch} onChange={e=>setIndicatorSearch(e.target.value)} placeholder="Search indicators"/></div>
            <small className={styles.scriptLabel}>INDICATOR NAME</small>
            <div className={styles.libraryList}>{filteredIndicators.map(name=>{const count=instances.filter(i=>i.name===name).length;return <button key={name} onClick={()=>addIndicator(name)}><span>{name}</span><em>＋</em>{count>0&&<b>{count}</b>}</button>;})}</div>
            <div className={styles.libraryHint}>Click an indicator again to add another independent copy.</div>
          </div>}
        </div>
        <div className={styles.toolbarDivider}/>
        <div className={styles.instanceStrip}>{instances.map((instance,index)=>{const same=instances.filter(i=>i.name===instance.name),ordinal=same.findIndex(i=>i.id===instance.id)+1;return <div className={`${styles.instanceChip} ${!instance.visibility.visible?styles.hiddenInstance:""}`} key={instance.id}>
          <button onClick={()=>editInstance(instance.id)}><span>{instanceSummary(instance)}{same.length>1?` #${ordinal}`:""}</span>{instance.source==="bot"&&<b>BOT</b>}</button>
          {!OVERLAYS.has(instance.name)&&<><button title="Move pane up" onClick={()=>movePane(instance.id,-1)}>↑</button><button title="Move pane down" onClick={()=>movePane(instance.id,1)}>↓</button></>}
          <button title="Remove indicator" onClick={()=>removeInstance(instance.id)}>×</button>
        </div>;})}</div>
      </div>
      <div className={styles.chartViewport}>
        {loading&&<div className={styles.state}>Loading chart…</div>}{error&&<div className={`${styles.state} ${styles.error}`}>{error}</div>}
        <div ref={containerRef} className={styles.canvas} style={{height:`${canvasHeight}px`}}/>
        <div className={styles.paneLabels} style={{height:`${canvasHeight}px`}}>
          <div className={styles.symbolLegend}><strong>{trade.pair}</strong><span>{currentInterval.label} · BINANCE</span></div>
          <div className={styles.overlayLegends}>{overlayInstances.map(instance=><button key={instance.id} onClick={()=>editInstance(instance.id)}>{instanceSummary(instance)} {instance.source==="bot"&&<b>BOT</b>}<span>⚙</span></button>)}</div>
          {separateInstances.map(instance=><button key={instance.id} className={styles.paneLegend} style={{top:`${paneTop(instance.id)+7}px`}} onClick={()=>editInstance(instance.id)}>{instanceSummary(instance)} {instance.source==="bot"&&<b>BOT</b>}<span>⚙</span></button>)}
        </div>
      </div>

      {draft&&editingId&&<div className={styles.settingsBackdrop} onMouseDown={event=>{if(event.target===event.currentTarget){setEditingId(null);setDraft(null);}}}>
        <section className={styles.settingsModal}>
          <header><div><h3>{draft.name}</h3><p>Chart settings only — the bot strategy is not changed.</p></div><button onClick={()=>{setEditingId(null);setDraft(null);}}>×</button></header>
          <nav>{(["Inputs","Style","Visibility"] as SettingsTab[]).map(tab=><button key={tab} className={settingsTab===tab?styles.settingsTabActive:""} onClick={()=>setSettingsTab(tab)}>{tab}</button>)}</nav>
          <div className={styles.settingsBody}>
            {settingsTab==="Inputs"&&<InputsPanel draft={draft} updateInput={updateInput}/>} 
            {settingsTab==="Style"&&<StylePanel draft={draft} updateStyle={updateStyle}/>} 
            {settingsTab==="Visibility"&&<div className={styles.visibilityPanel}>
              <Toggle label="Show indicator" checked={draft.visibility.visible} onChange={checked=>updateVisibility({visible:checked})}/>
              <Toggle label="Labels on price scale" checked={draft.visibility.priceScale} onChange={checked=>updateVisibility({priceScale:checked})}/>
              <Toggle label="Values in status line" checked={draft.visibility.statusLine} onChange={checked=>updateVisibility({statusLine:checked})}/>
              {!OVERLAYS.has(draft.name)&&<label className={styles.settingsField}><span>Pane height</span><div className={styles.numberUnit}><input type="number" min="80" max="360" step="10" value={draft.visibility.paneHeight} onChange={e=>updateVisibility({paneHeight:Math.max(80,Math.min(360,Number(e.target.value)))})}/><b>px</b></div></label>}
            </div>}
          </div>
          <footer><button className={styles.defaultsButton} onClick={resetSettings}>Defaults</button><div><button onClick={()=>{setEditingId(null);setDraft(null);}}>Cancel</button><button className={styles.okButton} onClick={applySettings}>OK</button></div></footer>
        </section>
      </div>}
    </section>
  </div>;
}

function InputsPanel({draft,updateInput}:{draft:IndicatorInstance;updateInput:(patch:Partial<Condition>)=>void}){
  const c=draft.input;if(draft.name==="Volume")return <div className={styles.noInputs}>Volume uses Binance candle volume and has no calculation inputs.</div>;
  if(!c)return null;
  const num=(label:string,key:"length"|"aux1"|"aux2"|"aux3",min=1,step=1)=><label className={styles.settingsField}><span>{label}</span><input type="number" min={min} step={step} value={c[key]} onChange={e=>updateInput({[key]:Number(e.target.value)})}/></label>;
  if(draft.name==="RSI")return <div className={styles.settingsGrid}>{num("RSI Length","length")}</div>;
  if(draft.name==="Stochastic")return <div className={styles.settingsGrid}>{num("%K Length","aux1")}{num("%K Smoothing","aux2")}{num("%D Smoothing","aux3")}</div>;
  if(draft.name==="MACD")return <div className={styles.settingsGrid}>{num("Fast Length","aux1")}{num("Slow Length","aux2")}{num("Signal Length","aux3")}</div>;
  if(draft.name==="Moving Average (MA)")return <div className={styles.settingsGrid}><label className={styles.settingsField}><span>MA Type</span><select value={c.aux1} onChange={e=>updateInput({aux1:Number(e.target.value)})}><option value={0}>SMA</option><option value={1}>EMA</option><option value={2}>WMA</option></select></label>{num("Fast Length","aux2")}{num("Slow Length","aux3")}</div>;
  if(draft.name==="Average Directional Index")return <div className={styles.settingsGrid}>{num("ADX / DI Length","length")}</div>;
  if(draft.name==="Bollinger Bands %B")return <div className={styles.settingsGrid}>{num("Period","length")}{num("Deviation σ","aux1",.1,.1)}</div>;
  if(draft.name==="Money Flow Index")return <div className={styles.settingsGrid}>{num("MFI Length","length")}</div>;
  if(draft.name==="Commodity Channel Index")return <div className={styles.settingsGrid}>{num("CCI Length","length")}</div>;
  if(draft.name==="Ultimate Oscillator")return <div className={styles.settingsGrid}>{num("Fast Period","aux1")}{num("Middle Period","aux2")}{num("Slow Period","aux3")}</div>;
  if(draft.name==="Parabolic SAR")return <div className={styles.settingsGrid}><label className={styles.settingsField}><span>Start / Step</span><input type="number" min="0.001" max="1" step="0.001" value={c.aux1?c.aux1/100:.02} onChange={e=>updateInput({aux1:Number(e.target.value)*100})}/></label><label className={styles.settingsField}><span>Maximum</span><input type="number" min="0.01" max="2" step="0.01" value={c.aux2?c.aux2/5:.2} onChange={e=>updateInput({aux2:Number(e.target.value)*5})}/></label></div>;
  return <div className={styles.noInputs}>Heikin Ashi is calculated directly from the selected chart candles.</div>;
}

function StylePanel({draft,updateStyle}:{draft:IndicatorInstance;updateStyle:(patch:Partial<IndicatorStyle>)=>void}){
  const s=draft.style;
  const color=(label:string,key:"color1"|"color2"|"color3"|"upColor"|"downColor"|"thresholdColor")=><label className={styles.styleRow}><span>{label}</span><input type="color" value={s[key]} onChange={e=>updateStyle({[key]:e.target.value})}/><code>{s[key]}</code></label>;
  const lineControls=<><label className={styles.settingsField}><span>Line width</span><select value={s.lineWidth} onChange={e=>updateStyle({lineWidth:Number(e.target.value) as 1|2|3|4})}><option value={1}>1 px</option><option value={2}>2 px</option><option value={3}>3 px</option><option value={4}>4 px</option></select></label><label className={styles.settingsField}><span>Line style</span><select value={s.lineStyle} onChange={e=>updateStyle({lineStyle:e.target.value as IndicatorStyle["lineStyle"]})}><option>Solid</option><option>Dashed</option><option>Dotted</option></select></label></>;
  const thresholds=(s.showUpper||s.showLower||["RSI","Stochastic","Average Directional Index","Bollinger Bands %B","Money Flow Index","Commodity Channel Index","Ultimate Oscillator"].includes(draft.name))?<div className={styles.thresholdBox}><h4>Limits</h4><Toggle label="Upper limit" checked={s.showUpper} onChange={checked=>updateStyle({showUpper:checked})}/>{s.showUpper&&<label className={styles.inlineValue}><span>Upper value</span><input type="number" step="0.1" value={s.upper} onChange={e=>updateStyle({upper:Number(e.target.value)})}/></label>}<Toggle label="Lower limit" checked={s.showLower} onChange={checked=>updateStyle({showLower:checked})}/>{s.showLower&&<label className={styles.inlineValue}><span>Lower value</span><input type="number" step="0.1" value={s.lower} onChange={e=>updateStyle({lower:Number(e.target.value)})}/></label>}{(s.showUpper||s.showLower)&&color("Limit line color","thresholdColor")}</div>:null;
  if(draft.name==="Volume")return <div className={styles.stylePanel}>{color("Up volume","upColor")}{color("Down volume","downColor")}</div>;
  if(draft.name==="Stochastic")return <div className={styles.stylePanel}>{color("%K","color1")}{color("%D","color2")}<div className={styles.styleGrid}>{lineControls}</div>{thresholds}</div>;
  if(draft.name==="MACD")return <div className={styles.stylePanel}>{color("MACD line","color1")}{color("Signal line","color2")}{color("Positive histogram","upColor")}{color("Negative histogram","downColor")}<div className={styles.styleGrid}>{lineControls}</div></div>;
  if(draft.name==="Moving Average (MA)")return <div className={styles.stylePanel}>{color("Fast MA","color1")}{color("Slow MA","color2")}<div className={styles.styleGrid}>{lineControls}</div></div>;
  if(draft.name==="Average Directional Index")return <div className={styles.stylePanel}>{color("ADX","color1")}{color("+DI","color2")}{color("−DI","color3")}<div className={styles.styleGrid}>{lineControls}</div>{thresholds}</div>;
  if(draft.name==="Heikin Ashi")return <div className={styles.stylePanel}>{color("Bullish candles","upColor")}{color("Bearish candles","downColor")}</div>;
  return <div className={styles.stylePanel}>{color(draft.name==="Parabolic SAR"?"PSAR":"Line","color1")}<div className={styles.styleGrid}>{lineControls}</div>{thresholds}</div>;
}

function Toggle({label,checked,onChange}:{label:string;checked:boolean;onChange:(checked:boolean)=>void}){return <label className={styles.toggleRow}><input type="checkbox" checked={checked} onChange={e=>onChange(e.target.checked)}/><i/><span>{label}</span></label>;}
