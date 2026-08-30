import { createClient } from "jsr:@supabase/supabase-js@2";
import type { LaunchExchangeProvider } from "./trader-exchange.ts";
import { providerGatewayRequest } from "./trader-exchange-provider-transport.ts";

export type SpotMarket = { pair:string; baseAsset:string; quoteAsset:"USDT"; quoteVolume:number };
export type ClosedCandle = { close:number; closeTime:number };

const BINANCE = "https://data-api.binance.vision";
const BYBIT = "https://api.bybit.com";
const OKX = "https://www.okx.com";
const KUCOIN = "https://api.kucoin.com";

type ServiceDb = ReturnType<typeof createClient>;
let serviceDbCache:ServiceDb|null=null;

function n(value:unknown,fallback=0){const x=Number(value);return Number.isFinite(x)?x:fallback;}
function obj(value:unknown):Record<string,unknown>{return value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};}
function arr(value:unknown):unknown[]{return Array.isArray(value)?value:[];}
function text(value:unknown){return String(value??"");}
function pairValue(value:string){const pair=value.trim().toUpperCase();if(!/^[A-Z0-9]{1,20}\/USDT$/.test(pair)||pair==="USDT/USDT")throw new Error("unsupported_spot_pair");return pair;}
function symbol(provider:LaunchExchangeProvider,pairInput:string){const pair=pairValue(pairInput),base=pair.slice(0,-5);if(provider==="okx"||provider==="kucoin")return `${base}-USDT`;return `${base}USDT`;}
function serviceDb(){if(serviceDbCache)return serviceDbCache;const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");if(!url||!key)throw new Error("server_configuration_missing");serviceDbCache=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});return serviceDbCache;}
async function get(url:string){if(url.startsWith(`${BYBIT}/`)){const parsed=new URL(url),response=await providerGatewayRequest(serviceDb(),{upstream:parsed.origin,method:"GET",path:parsed.pathname,query:parsed.searchParams.toString(),headers:{accept:"application/json"}});if(response.status<200||response.status>=300)throw new Error(`market_data_${response.status}`);return response.body;}const response=await fetch(url,{headers:{accept:"application/json"},signal:AbortSignal.timeout(10000)});if(!response.ok)throw new Error(`market_data_${response.status}`);return await response.json();}

export function timeframeMs(tf:string){const value=({"1 minute":60000,"3 minutes":180000,"5 minutes":300000,"15 minutes":900000,"30 minutes":1800000,"1 hour":3600000,"2 hours":7200000,"4 hours":14400000,"6 hours":21600000,"8 hours":28800000,"12 hours":43200000,"1 day":86400000,"3 days":259200000,"1 week":604800000,"1 month":2592000000} as Record<string,number>)[tf];if(!value)throw new Error(`unsupported_timeframe:${tf}`);return value;}
function interval(map:Record<string,string>,tf:string,provider:LaunchExchangeProvider){const value=map[tf];if(!value)throw new Error(`unsupported_native_timeframe:${provider}:${tf}`);return value;}
function binanceInterval(tf:string){return interval({"1 minute":"1m","3 minutes":"3m","5 minutes":"5m","15 minutes":"15m","30 minutes":"30m","1 hour":"1h","2 hours":"2h","4 hours":"4h","6 hours":"6h","8 hours":"8h","12 hours":"12h","1 day":"1d","3 days":"3d","1 week":"1w","1 month":"1M"},tf,"binance");}
function bybitInterval(tf:string){return interval({"1 minute":"1","3 minutes":"3","5 minutes":"5","15 minutes":"15","30 minutes":"30","1 hour":"60","2 hours":"120","4 hours":"240","6 hours":"360","12 hours":"720","1 day":"D","1 week":"W","1 month":"M"},tf,"bybit");}
function okxInterval(tf:string){return interval({"1 minute":"1m","3 minutes":"3m","5 minutes":"5m","15 minutes":"15m","30 minutes":"30m","1 hour":"1H","2 hours":"2H","4 hours":"4H","6 hours":"6H","12 hours":"12H","1 day":"1D","3 days":"3D","1 week":"1W","1 month":"1M"},tf,"okx");}
function kucoinInterval(tf:string){return interval({"1 minute":"1min","3 minutes":"3min","5 minutes":"5min","15 minutes":"15min","30 minutes":"30min","1 hour":"1hour","2 hours":"2hour","4 hours":"4hour","6 hours":"6hour","8 hours":"8hour","12 hours":"12hour","1 day":"1day","1 week":"1week","1 month":"1month"},tf,"kucoin");}

type AggregatePlan={baseTimeframe:string;factor:number};
function aggregatePlan(provider:LaunchExchangeProvider,tf:string):AggregatePlan|null{
  if(tf==="8 hours"&&(provider==="bybit"||provider==="okx"))return{baseTimeframe:"4 hours",factor:2};
  if(tf==="3 days"&&(provider==="bybit"||provider==="kucoin"))return{baseTimeframe:"1 day",factor:3};
  return null;
}
function aggregateCandles(rows:ClosedCandle[],targetMs:number,limit:number){
  const buckets=new Map<number,ClosedCandle>();
  for(const row of rows){if(!(row.close>0&&row.closeTime>0))continue;const end=Math.floor((row.closeTime-1)/targetMs)*targetMs+targetMs;buckets.set(end,{close:row.close,closeTime:end});}
  const now=Date.now();
  return [...buckets.values()].filter(row=>row.closeTime<now).sort((a,b)=>a.closeTime-b.closeTime).slice(-Math.max(20,limit));
}

export async function listSpotMarkets(provider:LaunchExchangeProvider):Promise<SpotMarket[]>{
  if(provider==="binance"){
    const [info,tickers]=await Promise.all([get(`${BINANCE}/api/v3/exchangeInfo`),get(`${BINANCE}/api/v3/ticker/24hr`)]);
    const volumes=new Map(arr(tickers).map((v)=>{const x=obj(v);return[text(x.symbol),n(x.quoteVolume)] as const;}));
    return arr(obj(info).symbols).map(obj).filter((x)=>x.status==="TRADING"&&x.quoteAsset==="USDT"&&x.isSpotTradingAllowed!==false&&text(x.baseAsset)!=="USDT").map((x)=>({pair:`${text(x.baseAsset)}/USDT`,baseAsset:text(x.baseAsset),quoteAsset:"USDT" as const,quoteVolume:volumes.get(text(x.symbol))??0}));
  }
  if(provider==="bybit"){
    const markets:SpotMarket[]=[];let cursor="";for(let page=0;page<5;page++){
      const root=obj(await get(`${BYBIT}/v5/market/instruments-info?category=spot&limit=1000${cursor?`&cursor=${encodeURIComponent(cursor)}`:""}`));if(n(root.retCode)!==0)throw new Error(`bybit_${text(root.retCode)}:${text(root.retMsg)}`);const result=obj(root.result);
      for(const item of arr(result.list).map(obj)){if(item.status!=="Trading"||item.quoteCoin!=="USDT"||item.baseCoin==="USDT")continue;markets.push({pair:`${text(item.baseCoin)}/USDT`,baseAsset:text(item.baseCoin),quoteAsset:"USDT",quoteVolume:0});}
      cursor=text(result.nextPageCursor);if(!cursor)break;
    }
    const root=obj(await get(`${BYBIT}/v5/market/tickers?category=spot`)),result=obj(root.result),volumes=new Map(arr(result.list).map((v)=>{const x=obj(v);return[text(x.symbol),n(x.turnover24h)] as const;}));
    return markets.map((m)=>({...m,quoteVolume:volumes.get(symbol("bybit",m.pair))??0}));
  }
  if(provider==="okx"){
    const [instrumentRoot,tickerRoot]=await Promise.all([get(`${OKX}/api/v5/public/instruments?instType=SPOT`),get(`${OKX}/api/v5/market/tickers?instType=SPOT`)]),volumes=new Map(arr(obj(tickerRoot).data).map((v)=>{const x=obj(v);return[text(x.instId),n(x.volCcy24h)] as const;}));
    return arr(obj(instrumentRoot).data).map(obj).filter((x)=>x.state==="live"&&x.quoteCcy==="USDT"&&x.baseCcy!=="USDT").map((x)=>({pair:`${text(x.baseCcy)}/USDT`,baseAsset:text(x.baseCcy),quoteAsset:"USDT" as const,quoteVolume:volumes.get(text(x.instId))??0}));
  }
  const [symbolsRoot,tickersRoot]=await Promise.all([get(`${KUCOIN}/api/v2/symbols`),get(`${KUCOIN}/api/v1/market/allTickers`)]),tickerData=obj(obj(tickersRoot).data),volumes=new Map(arr(tickerData.ticker).map((v)=>{const x=obj(v);return[text(x.symbol),n(x.volValue)] as const;}));
  return arr(obj(symbolsRoot).data).map(obj).filter((x)=>x.enableTrading===true&&x.quoteCurrency==="USDT"&&x.baseCurrency!=="USDT").map((x)=>({pair:`${text(x.baseCurrency)}/USDT`,baseAsset:text(x.baseCurrency),quoteAsset:"USDT" as const,quoteVolume:volumes.get(text(x.symbol))??0}));
}

async function nativeClosedCandles(provider:LaunchExchangeProvider,pair:string,tf:string,limit:number):Promise<ClosedCandle[]>{
  const duration=timeframeMs(tf),now=Date.now();
  if(provider==="binance"){
    const rows=arr(await get(`${BINANCE}/api/v3/klines?symbol=${encodeURIComponent(symbol(provider,pair))}&interval=${encodeURIComponent(binanceInterval(tf))}&limit=${Math.min(1000,Math.max(20,limit))}`));
    return rows.map((r)=>arr(r)).map((r)=>({close:n(r[4]),closeTime:n(r[6])})).filter((x)=>x.close>0&&x.closeTime<now);
  }
  if(provider==="bybit"){
    const root=obj(await get(`${BYBIT}/v5/market/kline?category=spot&symbol=${encodeURIComponent(symbol(provider,pair))}&interval=${encodeURIComponent(bybitInterval(tf))}&limit=${Math.min(1000,Math.max(20,limit))}`));if(n(root.retCode)!==0)throw new Error(`bybit_${text(root.retCode)}:${text(root.retMsg)}`);const rows=arr(obj(root.result).list).map((r)=>arr(r)).map((r)=>({close:n(r[4]),closeTime:n(r[0])+duration})).filter((x)=>x.close>0&&x.closeTime<now);return rows.reverse();
  }
  if(provider==="okx"){
    const root=obj(await get(`${OKX}/api/v5/market/candles?instId=${encodeURIComponent(symbol(provider,pair))}&bar=${encodeURIComponent(okxInterval(tf))}&limit=${Math.min(300,Math.max(20,limit))}`));const rows=arr(root.data).map((r)=>arr(r)).filter((r)=>text(r[8])==="1").map((r)=>({close:n(r[4]),closeTime:n(r[0])+duration})).filter((x)=>x.close>0&&x.closeTime<=now);return rows.reverse();
  }
  const end=Math.floor(now/1000),start=end-Math.max(duration/1000*Math.max(40,limit+4),86400);const root=obj(await get(`${KUCOIN}/api/v1/market/candles?type=${encodeURIComponent(kucoinInterval(tf))}&symbol=${encodeURIComponent(symbol(provider,pair))}&startAt=${Math.floor(start)}&endAt=${end}`));if(text(root.code)!=="200000")throw new Error(`kucoin_${text(root.code)}:${text(root.msg)}`);const rows=arr(root.data).map((r)=>arr(r)).map((r)=>({close:n(r[2]),closeTime:n(r[0])*1000+duration})).filter((x)=>x.close>0&&x.closeTime<now).reverse();return rows.slice(Math.max(0,rows.length-limit));
}

export async function closedCandles(provider:LaunchExchangeProvider,pairInput:string,tf:string,limit=320):Promise<ClosedCandle[]>{
  const pair=pairValue(pairInput),plan=aggregatePlan(provider,tf);
  if(!plan)return await nativeClosedCandles(provider,pair,tf,limit);
  const raw=await nativeClosedCandles(provider,pair,plan.baseTimeframe,Math.min(1000,Math.max(40,limit*plan.factor+plan.factor*4)));
  return aggregateCandles(raw,timeframeMs(tf),limit);
}
