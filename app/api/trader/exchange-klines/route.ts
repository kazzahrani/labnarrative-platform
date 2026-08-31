import { NextRequest, NextResponse } from "next/server";

type Provider = "binance" | "bybit" | "okx" | "kucoin";
type Candle = { openTime:number; open:number; high:number; low:number; close:number; volume:number; closeTime:number; quoteVolume:number; trades:number };
type Json = Record<string,unknown>;

const BASE = {
  binance:"https://data-api.binance.vision",
  bybit:"https://api.bytick.com",
  okx:"https://www.okx.com",
  kucoin:"https://api.kucoin.com",
} as const;
const INTERVAL_MS:Record<string,number>={"3m":180000,"5m":300000,"15m":900000,"1h":3600000,"4h":14400000,"1d":86400000,"1w":604800000,"1M":2592000000};
const BYBIT_INTERVAL:Record<string,string>={"3m":"3","5m":"5","15m":"15","1h":"60","4h":"240","1d":"D","1w":"W","1M":"M"};
const OKX_INTERVAL:Record<string,string>={"3m":"3m","5m":"5m","15m":"15m","1h":"1H","4h":"4H","1d":"1D","1w":"1W","1M":"1M"};
const KUCOIN_INTERVAL:Record<string,string>={"3m":"3min","5m":"5min","15m":"15min","1h":"1hour","4h":"4hour","1d":"1day","1w":"1week","1M":"1month"};
const MAX_BARS=6000;

function n(v:unknown){const x=Number(v);return Number.isFinite(x)?x:0;}
function obj(v:unknown):Json{return v&&typeof v==="object"&&!Array.isArray(v)?v as Json:{};}
function arr(v:unknown):unknown[]{return Array.isArray(v)?v:[];}
function text(v:unknown){return String(v??"");}
function providerValue(v:string|null):Provider{return v==="bybit"||v==="okx"||v==="kucoin"?v:"binance";}
function normalizeSymbol(provider:Provider,input:string){const raw=input.toUpperCase().replace(/[^A-Z0-9]/g,"");if(!/^[A-Z0-9]{5,20}$/.test(raw)||!raw.endsWith("USDT"))throw new Error("invalid_symbol");const base=raw.slice(0,-4);return provider==="okx"||provider==="kucoin"?`${base}-USDT`:raw;}
async function get(url:string){const response=await fetch(url,{cache:"no-store",headers:{accept:"application/json"},redirect:"error",signal:AbortSignal.timeout(10000)});if(!response.ok)throw new Error(`market_data_${response.status}`);return await response.json();}
function dedupe(rows:Candle[],bars:number){const now=Date.now();return [...new Map(rows.filter(c=>c.openTime>0&&c.close>0&&c.closeTime<=now).map(c=>[c.openTime,c])).values()].sort((a,b)=>a.openTime-b.openTime).slice(-bars);}

async function binance(symbol:string,interval:string,bars:number,endTime:number){
  const pages:Candle[][]=[];let cursor=endTime;
  for(let page=0;page<Math.ceil(bars/1000)+1;page++){
    const already=pages.reduce((s,p)=>s+p.length,0);if(already>=bars)break;const limit=Math.min(1000,bars-already);
    const rows=arr(await get(`${BASE.binance}/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&limit=${limit}&endTime=${cursor}`)).map(r=>arr(r)).map(r=>({openTime:n(r[0]),open:n(r[1]),high:n(r[2]),low:n(r[3]),close:n(r[4]),volume:n(r[5]),closeTime:n(r[6]),quoteVolume:n(r[7]),trades:n(r[8])}));
    if(!rows.length)break;pages.unshift(rows);const first=rows[0]?.openTime;if(!first||rows.length<limit)break;cursor=first-1;
  }
  return dedupe(pages.flat(),bars);
}

async function bybit(symbol:string,interval:string,bars:number,endTime:number){
  const ms=INTERVAL_MS[interval];const apiInterval=BYBIT_INTERVAL[interval];if(!apiInterval)throw new Error("unsupported_interval");
  const pages:Candle[][]=[];let cursor=endTime;
  for(let page=0;page<Math.ceil(bars/1000)+1;page++){
    const already=pages.reduce((s,p)=>s+p.length,0);if(already>=bars)break;const limit=Math.min(1000,bars-already);
    const root=obj(await get(`${BASE.bybit}/v5/market/kline?category=spot&symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(apiInterval)}&limit=${limit}&end=${cursor}`));if(n(root.retCode)!==0)throw new Error(`bybit_${text(root.retCode)}:${text(root.retMsg)}`);
    const rows=arr(obj(root.result).list).map(r=>arr(r)).map(r=>({openTime:n(r[0]),open:n(r[1]),high:n(r[2]),low:n(r[3]),close:n(r[4]),volume:n(r[5]),closeTime:n(r[0])+ms-1,quoteVolume:n(r[6]),trades:0})).reverse();
    if(!rows.length)break;pages.unshift(rows);const first=rows[0]?.openTime;if(!first||rows.length<limit)break;cursor=first-1;
  }
  return dedupe(pages.flat(),bars);
}

async function okx(symbol:string,interval:string,bars:number,endTime:number){
  const ms=INTERVAL_MS[interval];const apiInterval=OKX_INTERVAL[interval];if(!apiInterval)throw new Error("unsupported_interval");
  const pages:Candle[][]=[];let cursor=endTime;
  for(let page=0;page<Math.ceil(bars/300)+2;page++){
    const already=pages.reduce((s,p)=>s+p.length,0);if(already>=bars)break;const limit=Math.min(300,bars-already);
    const root=obj(await get(`${BASE.okx}/api/v5/market/history-candles?instId=${encodeURIComponent(symbol)}&bar=${encodeURIComponent(apiInterval)}&limit=${limit}&after=${cursor}`));if(text(root.code)!=="0")throw new Error(`okx_${text(root.code)}:${text(root.msg)}`);
    const rows=arr(root.data).map(r=>arr(r)).filter(r=>r[8]==null||text(r[8])==="1").map(r=>({openTime:n(r[0]),open:n(r[1]),high:n(r[2]),low:n(r[3]),close:n(r[4]),volume:n(r[5]),closeTime:n(r[0])+ms-1,quoteVolume:n(r[7]),trades:0})).reverse();
    if(!rows.length)break;pages.unshift(rows);const first=rows[0]?.openTime;if(!first||rows.length<limit)break;cursor=first-1;
  }
  return dedupe(pages.flat(),bars);
}

async function kucoin(symbol:string,interval:string,bars:number,endTime:number){
  const ms=INTERVAL_MS[interval];const apiInterval=KUCOIN_INTERVAL[interval];if(!apiInterval)throw new Error("unsupported_interval");
  const pages:Candle[][]=[];let cursor=endTime;
  for(let page=0;page<Math.ceil(bars/1400)+2;page++){
    const already=pages.reduce((s,p)=>s+p.length,0);if(already>=bars)break;const limit=Math.min(1400,bars-already);const endSec=Math.floor(cursor/1000);const startSec=Math.max(0,endSec-Math.ceil(ms/1000)*(limit+4));
    const root=obj(await get(`${BASE.kucoin}/api/v1/market/candles?type=${encodeURIComponent(apiInterval)}&symbol=${encodeURIComponent(symbol)}&startAt=${startSec}&endAt=${endSec}`));if(text(root.code)!=="200000")throw new Error(`kucoin_${text(root.code)}:${text(root.msg)}`);
    const rows=arr(root.data).map(r=>arr(r)).map(r=>({openTime:n(r[0])*1000,open:n(r[1]),high:n(r[3]),low:n(r[4]),close:n(r[2]),volume:n(r[5]),closeTime:n(r[0])*1000+ms-1,quoteVolume:n(r[6]),trades:0})).sort((a,b)=>a.openTime-b.openTime).slice(-limit);
    if(!rows.length)break;pages.unshift(rows);const first=rows[0]?.openTime;if(!first||rows.length<Math.min(limit,10))break;cursor=first-1;
  }
  return dedupe(pages.flat(),bars);
}

export async function GET(request:NextRequest){
  const provider=providerValue(request.nextUrl.searchParams.get("provider"));
  const interval=request.nextUrl.searchParams.get("interval")??"5m";
  const rawBars=Number(request.nextUrl.searchParams.get("bars")??500);const bars=Math.max(1,Math.min(MAX_BARS,Number.isFinite(rawBars)?Math.round(rawBars):500));
  const rawEnd=request.nextUrl.searchParams.get("endTime");const endTime=rawEnd&&/^\d+$/.test(rawEnd)?Number(rawEnd):Date.now();
  if(!INTERVAL_MS[interval])return NextResponse.json({error:"Invalid interval."},{status:400});
  try{
    const symbol=normalizeSymbol(provider,request.nextUrl.searchParams.get("symbol")??"BTCUSDT");
    const candles=provider==="binance"?await binance(symbol,interval,bars,endTime):provider==="bybit"?await bybit(symbol,interval,bars,endTime):provider==="okx"?await okx(symbol,interval,bars,endTime):await kucoin(symbol,interval,bars,endTime);
    return NextResponse.json({ok:true,provider,source:provider==="binance"?"Binance Spot":provider==="bybit"?"Bybit Spot":provider==="okx"?"OKX Spot":"KuCoin Spot",symbol,interval,requestedBars:bars,loadedBars:candles.length,historyStart:candles[0]?.openTime??null,historyEnd:candles[candles.length-1]?.closeTime??null,candles},{headers:{"Cache-Control":"no-store"}});
  }catch(error){return NextResponse.json({ok:false,provider,error:error instanceof Error?error.message:"Kline data unavailable"},{status:503,headers:{"Cache-Control":"no-store"}});}
}
