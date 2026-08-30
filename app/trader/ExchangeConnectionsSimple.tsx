"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { browserSupabase } from "../../lib/supabase-browser";
import ExchangeLogo, { ExchangeProvider, exchangeName } from "./ExchangeLogo";
import styles from "./exchange-connections-simple.module.css";

type RealAccount = { id:string; name:string; exchangeStatus?:string; apiKeyLast4?:string|null } | null;
type Props = { realAccount:RealAccount; onConnectBinance:()=>void; onBackOverview:()=>void };
type GenericProvider = Exclude<ExchangeProvider,"binance">;
type Connection = { status?:string; apiKeyLast4?:string|null; permissionTrade?:boolean; permissionWithdraw?:boolean; capabilities?:Record<string,unknown> } | null;
type StatusResponse = { ok?:boolean; connections?:Array<{provider:GenericProvider;connection:Connection}>; error?:string };

const PROVIDERS: Array<{id:ExchangeProvider; subtitle:string; passphrase?:boolean; coinbase?:boolean}> = [
  {id:"binance",subtitle:"Spot"},
  {id:"bybit",subtitle:"Unified Spot"},
  {id:"okx",subtitle:"Spot",passphrase:true},
  {id:"kraken",subtitle:"Spot"},
  {id:"kucoin",subtitle:"Spot",passphrase:true},
  {id:"coinbase",subtitle:"Advanced Trade",coinbase:true},
];

function friendly(value:unknown){
  const raw=value instanceof Error?value.message:String(value||"Connection failed");
  if(raw.includes("unsafe_permissions")||raw.includes("withdraw_permission")||raw.includes("transfer_permission"))return "Use a Spot-trading key with withdrawal and transfer permissions disabled.";
  if(raw.includes("spot_trade_permission_required"))return "Enable Spot trading permission for this API key.";
  if(raw.includes("query_funds_required"))return "Enable Query Funds for this Kraken API key.";
  if(raw.includes("trade_permissions_must_include"))return "Enable both create/modify and cancel/close order permissions.";
  if(raw.includes("invalid_credentials")||raw.includes("Invalid key"))return "The exchange rejected these credentials. Check the key and secret and try again.";
  if(raw.includes("Invalid signature")||raw.includes("invalid_signature"))return "The exchange rejected the signature. Check that the key and secret belong to the same API credential.";
  if(raw.includes("invalid_passphrase"))return "The exchange rejected the API passphrase.";
  if(raw.includes("gateway_"))return "The account is connected, but protected execution activation is still pending.";
  return raw.replaceAll("_"," ").slice(0,220);
}
async function invokeMulti(action:string,extra:Record<string,unknown>={}){
  const {data,error}=await browserSupabase.functions.invoke("trader-multiexchange-control",{body:{action,...extra}});
  if(error){let message=error.message||"multiexchange_control_failed";const response=(error as {context?:Response}).context;if(response){try{const payload=await response.clone().json() as {error?:string};if(payload.error)message=payload.error}catch{}}throw new Error(message)}
  const result=(data??{}) as StatusResponse & {connection?:Connection};if(result.error||result.ok!==true)throw new Error(result.error||"multiexchange_control_failed");return result;
}
async function invokeKraken(action:string,extra:Record<string,unknown>={}){
  const {data,error}=await browserSupabase.functions.invoke("trader-kraken-trade-control",{body:{action,...extra}});
  if(error){let message=error.message||"kraken_control_failed";const response=(error as {context?:Response}).context;if(response){try{const payload=await response.clone().json() as {error?:string};if(payload.error)message=payload.error}catch{}}throw new Error(message)}
  const result=(data??{}) as {ok?:boolean;connection?:Connection;error?:string};if(result.error||result.ok!==true)throw new Error(result.error||"kraken_control_failed");return result;
}

export default function ExchangeConnectionsSimple({realAccount,onConnectBinance,onBackOverview}:Props){
  const [connections,setConnections]=useState<Record<GenericProvider,Connection>>({bybit:null,okx:null,kraken:null,kucoin:null,coinbase:null});
  const [selected,setSelected]=useState<GenericProvider|null>(null);
  const [apiKey,setApiKey]=useState("");
  const [apiSecret,setApiSecret]=useState("");
  const [passphrase,setPassphrase]=useState("");
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [success,setSuccess]=useState("");
  const binanceConnected=realAccount?.exchangeStatus==="connected";

  const load=useCallback(async()=>{
    if(!realAccount){setLoading(false);return}
    try{const result=await invokeMulti("status_all");const next={bybit:null,okx:null,kraken:null,kucoin:null,coinbase:null} as Record<GenericProvider,Connection>;for(const row of result.connections??[])next[row.provider]=row.connection;setConnections(next);setError("")}catch(caught){setError(friendly(caught))}finally{setLoading(false)}
  },[realAccount]);
  useEffect(()=>{void load()},[load]);
  const connectedCount=useMemo(()=>Number(binanceConnected)+Object.values(connections).filter(item=>item?.status==="connected").length,[binanceConnected,connections]);
  const current=selected?connections[selected]:null;
  const definition=selected?PROVIDERS.find(item=>item.id===selected):null;
  const open=(provider:ExchangeProvider)=>{setError("");setSuccess("");if(provider==="binance"){onConnectBinance();return}setSelected(provider);setApiKey("");setApiSecret("");setPassphrase("")};
  const close=()=>{if(busy)return;setSelected(null);setError("");setSuccess("")};
  const connect=async(event:FormEvent)=>{
    event.preventDefault();if(!selected||busy)return;setBusy(true);setError("");setSuccess("");
    try{
      const payload=definition?.coinbase?{provider:selected,keyName:apiKey.trim(),keySecret:apiSecret.trim()}:{provider:selected,apiKey:apiKey.trim(),apiSecret:apiSecret.trim(),...(definition?.passphrase?{passphrase:passphrase.trim()}:{})};
      if(selected==="kraken")await invokeKraken("upgrade",payload);else await invokeMulti("upgrade",payload);
      await load();setSuccess(`${exchangeName(selected)} connected.`);setApiKey("");setApiSecret("");setPassphrase("");window.setTimeout(()=>setSelected(null),550);
    }catch(caught){setError(friendly(caught))}finally{setBusy(false)}
  };
  const disconnect=async()=>{if(!selected||busy||!window.confirm(`Disconnect ${exchangeName(selected)}? Existing history is preserved.`))return;setBusy(true);setError("");try{await invokeMulti("disconnect",{provider:selected});await load();setSelected(null)}catch(caught){setError(friendly(caught))}finally{setBusy(false)}};

  return <div className={styles.page}>
    <div className={styles.head}><div><small>SETTINGS</small><h1>Connections</h1><p>Connect an exchange once. It then becomes available across your trading workspace.</p></div><button type="button" onClick={onBackOverview}>← Overview</button></div>
    <div className={styles.summary}><div><span>Connected exchanges</span><strong>{loading?"—":connectedCount}</strong></div><p>Use Spot-trading API credentials only. LabNarrative never requires withdrawal permission.</p></div>
    {error&&!selected&&<div className={styles.error}>{error}</div>}
    <div className={styles.grid}>{PROVIDERS.map(item=>{
      const connection=item.id==="binance"?null:connections[item.id as GenericProvider];
      const connected=item.id==="binance"?binanceConnected:connection?.status==="connected";
      const trade=item.id==="binance"?binanceConnected:connection?.permissionTrade===true;
      const live=item.id==="binance"?binanceConnected:connection?.capabilities?.liveExecution===true;
      const last4=item.id==="binance"?realAccount?.apiKeyLast4:connection?.apiKeyLast4;
      return <button type="button" className={styles.card} key={item.id} onClick={()=>open(item.id)}>
        <ExchangeLogo provider={item.id} size={42}/><div className={styles.cardText}><strong>{exchangeName(item.id)}</strong><span>{item.subtitle}</span></div>
        <div className={styles.cardState}><b className={connected?styles.connected:styles.offline}>{connected?"Connected":"Connect"}</b>{connected&&<small>{last4?`••••${last4} · `:""}{live?"Ready to trade":trade?"Spot trading · activation pending":"Read only"}</small>}</div><span className={styles.arrow}>›</span>
      </button>})}</div>
    <div className={styles.note}>Withdrawal permission is never required. Live order routing is enabled only after the protected execution path for that venue is active.</div>

    {selected&&<div className={styles.backdrop} onMouseDown={e=>{if(e.target===e.currentTarget)close()}}><section className={styles.modal}>
      <div className={styles.modalHead}><div><ExchangeLogo provider={selected} size={38}/><div><small>CONNECT EXCHANGE</small><h2>{exchangeName(selected)}</h2></div></div><button type="button" onClick={close}>×</button></div>
      {current?.status==="connected"&&<div className={styles.connectedBox}><strong>Connected</strong><span>{current.permissionTrade?"Spot trading permission verified":"Read-only permission"}</span></div>}
      {error&&<div className={styles.error}>{error}</div>}{success&&<div className={styles.success}>{success}</div>}
      <form className={styles.form} onSubmit={connect}>
        <label><span>{definition?.coinbase?"API Key Name":"API Key"}</span><input value={apiKey} onChange={e=>setApiKey(e.target.value)} autoComplete="off" required /></label>
        <label><span>{definition?.coinbase?"EC Private Key":selected==="kraken"?"Private Key":"API Secret"}</span>{definition?.coinbase?<textarea rows={7} value={apiSecret} onChange={e=>setApiSecret(e.target.value)} autoComplete="off" required />:<input type="password" value={apiSecret} onChange={e=>setApiSecret(e.target.value)} autoComplete="new-password" required />}</label>
        {definition?.passphrase&&<label><span>API Passphrase</span><input type="password" value={passphrase} onChange={e=>setPassphrase(e.target.value)} autoComplete="new-password" required /></label>}
        <p>Enable reading and Spot trading only. Keep withdrawals, transfers, futures, margin and unrelated permissions disabled.</p>
        <div className={styles.actions}>{current?.status==="connected"&&<button type="button" className={styles.disconnect} onClick={()=>void disconnect()} disabled={busy}>Disconnect</button>}<button type="button" onClick={close} disabled={busy}>Cancel</button><button className={styles.primary} disabled={busy}>{busy?"Connecting…":current?.status==="connected"?"Replace connection":"Connect"}</button></div>
      </form>
    </section></div>}
  </div>;
}
