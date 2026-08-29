"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { browserSupabase } from "../../lib/supabase-browser";
import ExchangeLogo, { ExchangeProvider, exchangeName } from "./ExchangeLogo";
import styles from "./exchange-portfolio-overview.module.css";

type Connection = { status?: string; apiKeyLast4?: string | null } | null;
type Props = { binanceConnected?: boolean; binanceLast4?: string | null; refreshKey?: string | number };
type Venue = { provider: ExchangeProvider; connected: boolean; last4?: string | null; totalUsd: number | null; assetCount: number | null; error?: boolean };
const GENERIC: Exclude<ExchangeProvider,"binance">[] = ["bybit","okx","kraken","kucoin","coinbase"];
const CONTROL: Record<Exclude<ExchangeProvider,"binance">,string> = { bybit:"trader-bybit-control",okx:"trader-okx-control",kraken:"trader-kraken-control",kucoin:"trader-kucoin-control",coinbase:"trader-coinbase-control" };

function money(value:number|null){return value==null?"—":new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:2}).format(value)}
async function invoke(name:string,body:Record<string,unknown>){const {data,error}=await browserSupabase.functions.invoke(name,{body});if(error)throw error;return (data??{}) as any;}

export default function ExchangePortfolioOverview({binanceConnected=false,binanceLast4=null,refreshKey}:Props){
  const [venues,setVenues]=useState<Venue[]>([]);
  const [loading,setLoading]=useState(true);
  const load=useCallback(async()=>{
    setLoading(true);
    try{
      const status=await invoke("trader-multiexchange-control",{action:"status_all"});
      const connectionMap=new Map<string,Connection>((status.connections??[]).map((item:any)=>[String(item.provider),item.connection as Connection]));
      const base:Venue[]=[];
      if(binanceConnected) base.push({provider:"binance",connected:true,last4:binanceLast4,totalUsd:null,assetCount:null});
      for(const provider of GENERIC){const connection=connectionMap.get(provider);if(connection?.status==="connected")base.push({provider,connected:true,last4:connection.apiKeyLast4,totalUsd:null,assetCount:null});}
      setVenues(base);
      await Promise.all(base.map(async venue=>{
        try{
          const result=venue.provider==="binance"?await invoke("trader-binance-control",{action:"balances"}):await invoke(CONTROL[venue.provider as Exclude<ExchangeProvider,"binance">],{action:"balances"});
          const balances=Array.isArray(result.balances)?result.balances:[];
          const total=Number(result.totalUsd??result.totalUSDT??result.totalValueUsd??NaN);
          setVenues(current=>current.map(v=>v.provider===venue.provider?{...v,totalUsd:Number.isFinite(total)?total:null,assetCount:balances.length,error:false}:v));
        }catch{setVenues(current=>current.map(v=>v.provider===venue.provider?{...v,error:true}:v));}
      }));
    }catch{setVenues(binanceConnected?[{provider:"binance",connected:true,last4:binanceLast4,totalUsd:null,assetCount:null,error:true}]:[]);}
    finally{setLoading(false);}
  },[binanceConnected,binanceLast4]);
  useEffect(()=>{void load();},[load,refreshKey]);
  const total=useMemo(()=>{const values=venues.map(v=>v.totalUsd).filter((v):v is number=>v!=null);return values.length?values.reduce((a,b)=>a+b,0):null},[venues]);
  return <section className={styles.wrap}>
    <div className={styles.head}><div><small>CONNECTED EXCHANGES</small><h2>Portfolio by exchange</h2><p>Every connected venue is part of this trading workspace.</p></div><div className={styles.total}><span>Connected exchange value</span><strong>{money(total)}</strong></div></div>
    {venues.length?<div className={styles.grid}>{venues.map(venue=><article key={venue.provider}><ExchangeLogo provider={venue.provider} size={31}/><div><strong>{exchangeName(venue.provider)}</strong><small>{venue.last4?`••••${venue.last4}`:"Connected"}</small></div><div className={styles.value}><b>{money(venue.totalUsd)}</b><small>{venue.error?"Balance refresh pending":venue.assetCount==null?"Refreshing…":`${venue.assetCount} assets`}</small></div></article>)}</div>:<div className={styles.empty}>{loading?"Loading connected exchanges…":"No exchange connected yet."}</div>}
  </section>;
}
