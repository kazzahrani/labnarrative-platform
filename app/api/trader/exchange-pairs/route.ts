import { NextRequest, NextResponse } from "next/server";

type Provider = "binance" | "bybit" | "okx" | "kucoin";
type Pair = { pair:string; symbol:string; baseAsset:string; quoteVolume:number };
type Json = Record<string,unknown>;

const ENDPOINTS = {
  binance:"https://data-api.binance.vision",
  bybit:"https://api.bybit.com",
  okx:"https://www.okx.com",
  kucoin:"https://api.kucoin.com",
} as const;

function n(value:unknown){const result=Number(value);return Number.isFinite(result)?result:0;}
function obj(value:unknown):Json{return value&&typeof value==="object"&&!Array.isArray(value)?value as Json:{};}
function arr(value:unknown):unknown[]{return Array.isArray(value)?value:[];}
function text(value:unknown){return String(value??"");}
async function get(url:string){const response=await fetch(url,{cache:"no-store",headers:{accept:"application/json"},signal:AbortSignal.timeout(9000)});if(!response.ok)throw new Error(`exchange_pairs_${response.status}`);return await response.json();}
function providerValue(value:string|null):Provider{return value==="bybit"||value==="okx"||value==="kucoin"?value:"binance";}

async function pairsFor(provider:Provider):Promise<Pair[]>{
  if(provider==="binance"){
    const [info,tickers]=await Promise.all([get(`${ENDPOINTS.binance}/api/v3/exchangeInfo`),get(`${ENDPOINTS.binance}/api/v3/ticker/24hr`)]),volumes=new Map(arr(tickers).map(row=>{const item=obj(row);return[text(item.symbol),n(item.quoteVolume)] as const;}));
    return arr(obj(info).symbols).map(obj).filter(item=>item.status==="TRADING"&&item.quoteAsset==="USDT"&&item.isSpotTradingAllowed!==false&&item.baseAsset!=="USDT").map(item=>({pair:`${text(item.baseAsset)}/USDT`,symbol:text(item.symbol),baseAsset:text(item.baseAsset),quoteVolume:volumes.get(text(item.symbol))??0}));
  }
  if(provider==="bybit"){
    const result:Pair[]=[];let cursor="";
    for(let page=0;page<5;page++){
      const root=obj(await get(`${ENDPOINTS.bybit}/v5/market/instruments-info?category=spot&limit=1000${cursor?`&cursor=${encodeURIComponent(cursor)}`:""}`));if(n(root.retCode)!==0)throw new Error(`bybit_${text(root.retCode)}`);const body=obj(root.result);
      for(const item of arr(body.list).map(obj)){if(item.status!=="Trading"||item.quoteCoin!=="USDT"||item.baseCoin==="USDT")continue;result.push({pair:`${text(item.baseCoin)}/USDT`,symbol:text(item.symbol),baseAsset:text(item.baseCoin),quoteVolume:0});}
      cursor=text(body.nextPageCursor);if(!cursor)break;
    }
    const tickerRoot=obj(await get(`${ENDPOINTS.bybit}/v5/market/tickers?category=spot`)),volumes=new Map(arr(obj(tickerRoot.result).list).map(row=>{const item=obj(row);return[text(item.symbol),n(item.turnover24h)] as const;}));
    return result.map(item=>({...item,quoteVolume:volumes.get(item.symbol)??0}));
  }
  if(provider==="okx"){
    const [instrumentRoot,tickerRoot]=await Promise.all([get(`${ENDPOINTS.okx}/api/v5/public/instruments?instType=SPOT`),get(`${ENDPOINTS.okx}/api/v5/market/tickers?instType=SPOT`)]),volumes=new Map(arr(obj(tickerRoot).data).map(row=>{const item=obj(row);return[text(item.instId),n(item.volCcy24h)] as const;}));
    return arr(obj(instrumentRoot).data).map(obj).filter(item=>item.state==="live"&&item.quoteCcy==="USDT"&&item.baseCcy!=="USDT").map(item=>({pair:`${text(item.baseCcy)}/USDT`,symbol:text(item.instId),baseAsset:text(item.baseCcy),quoteVolume:volumes.get(text(item.instId))??0}));
  }
  const [symbolRoot,tickerRoot]=await Promise.all([get(`${ENDPOINTS.kucoin}/api/v2/symbols`),get(`${ENDPOINTS.kucoin}/api/v1/market/allTickers`)]),volumes=new Map(arr(obj(obj(tickerRoot).data).ticker).map(row=>{const item=obj(row);return[text(item.symbol),n(item.volValue)] as const;}));
  return arr(obj(symbolRoot).data).map(obj).filter(item=>item.enableTrading===true&&item.quoteCurrency==="USDT"&&item.baseCurrency!=="USDT").map(item=>({pair:`${text(item.baseCurrency)}/USDT`,symbol:text(item.symbol),baseAsset:text(item.baseCurrency),quoteVolume:volumes.get(text(item.symbol))??0}));
}

export async function GET(request:NextRequest){
  const provider=providerValue(request.nextUrl.searchParams.get("provider"));
  try{
    const pairs=(await pairsFor(provider)).sort((a,b)=>b.quoteVolume-a.quoteVolume||a.pair.localeCompare(b.pair));
    return NextResponse.json({ok:true,provider,pairs},{headers:{"Cache-Control":"public, s-maxage=30, stale-while-revalidate=60"}});
  }catch(error){
    return NextResponse.json({ok:false,provider,pairs:[],error:error instanceof Error?error.message:"exchange_pairs_unavailable"},{status:503,headers:{"Cache-Control":"no-store"}});
  }
}
