"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { browserSupabase } from "../../lib/supabase-browser";
import ExchangeLogo, { ExchangeProvider, exchangeName } from "./ExchangeLogo";
import styles from "./exchange-connections-simple.module.css";

type RealAccount = { id:string; name:string; exchangeStatus?:string; apiKeyLast4?:string|null } | null;
type Props = { realAccount:RealAccount; onConnectBinance:()=>void; onBackOverview:()=>void };
type LaunchProvider = Extract<ExchangeProvider,"binance"|"bybit"|"okx"|"kucoin">;
type GenericProvider = Exclude<LaunchProvider,"binance">;
type Connection = { status?:string; apiKeyLast4?:string|null; permissionRead?:boolean; permissionTrade?:boolean; permissionWithdraw?:boolean; capabilities?:Record<string,unknown> } | null;
type MultiStatusResponse = { ok?:boolean; connections?:Array<{provider:ExchangeProvider;connection:Connection}>; connection?:Connection; error?:string };
type BinanceResponse = { ok?:boolean; connection?:Connection; error?:string };

const PROVIDERS: Array<{id:LaunchProvider; passphrase?:boolean}> = [
  {id:"binance"},
  {id:"bybit"},
  {id:"okx",passphrase:true},
  {id:"kucoin",passphrase:true},
];

function friendly(value:unknown){
  const raw=value instanceof Error?value.message:String(value||"Connection failed");
  if(raw.includes("unsafe_permissions")||raw.includes("withdraw_permission")||raw.includes("transfer_permission")||raw.includes("binance_key_unsafe_permissions"))return "Use a Spot-trading API key with withdrawals and transfers disabled.";
  if(raw.includes("spot_trade_permission_required")||raw.includes("binance_key_trading_disabled"))return "Enable Spot trading permission for this API key and try again.";
  if(raw.includes("binance_key_reading_disabled"))return "Enable reading permission for this Binance API key and try again.";
  if(raw.includes("binance_key_ip_restriction_required"))return "Restrict this Binance API key to LabNarrative's trading IP, then try again.";
  if(raw.includes("invalid_credentials")||raw.includes("Invalid key")||raw.includes("-2015")||raw.toLowerCase().includes("invalid api-key"))return "The exchange rejected these credentials. Check the API key and secret and try again.";
  if(raw.includes("Invalid signature")||raw.includes("invalid_signature"))return "The exchange rejected the signature. Check that the key and secret belong to the same API credential.";
  if(raw.includes("invalid_passphrase"))return "The exchange rejected the API passphrase.";
  if(raw.includes("gateway_"))return "The secure exchange connection is temporarily unavailable. Please try again.";
  return raw.replaceAll("_"," ").slice(0,220);
}

async function invokeMulti(action:string,extra:Record<string,unknown>={}){
  const {data,error}=await browserSupabase.functions.invoke("trader-multiexchange-control",{body:{action,...extra}});
  if(error){let message=error.message||"multiexchange_control_failed";const response=(error as {context?:Response}).context;if(response){try{const payload=await response.clone().json() as {error?:string};if(payload.error)message=payload.error}catch{}}throw new Error(message)}
  const result=(data??{}) as MultiStatusResponse;if(result.error||result.ok!==true)throw new Error(result.error||"multiexchange_control_failed");return result;
}

async function invokeBinance(action:string,extra:Record<string,unknown>={}){
  const {data,error}=await browserSupabase.functions.invoke("trader-binance-control",{body:{action,...extra}});
  if(error){let message=error.message||"binance_control_failed";const response=(error as {context?:Response}).context;if(response){try{const payload=await response.clone().json() as {error?:string};if(payload.error)message=payload.error}catch{}}throw new Error(message)}
  const result=(data??{}) as BinanceResponse;if(result.error||result.ok!==true)throw new Error(result.error||"binance_control_failed");return result;
}

export default function ExchangeConnectionsSimple({realAccount,onBackOverview}:Props){
  const [connections,setConnections]=useState<Record<LaunchProvider,Connection>>({binance:null,bybit:null,okx:null,kucoin:null});
  const [selected,setSelected]=useState<LaunchProvider|null>(null);
  const [apiKey,setApiKey]=useState("");
  const [apiSecret,setApiSecret]=useState("");
  const [passphrase,setPassphrase]=useState("");
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [success,setSuccess]=useState("");

  const load=useCallback(async()=>{
    if(!realAccount){setConnections({binance:null,bybit:null,okx:null,kucoin:null});setLoading(false);return}
    try{
      const [multi,binance]=await Promise.all([invokeMulti("status_all"),invokeBinance("status")]);
      const next:Record<LaunchProvider,Connection>={binance:binance.connection??null,bybit:null,okx:null,kucoin:null};
      for(const row of multi.connections??[]){if(row.provider==="bybit"||row.provider==="okx"||row.provider==="kucoin")next[row.provider as GenericProvider]=row.connection}
      setConnections(next);setError("");
    }catch(caught){setError(friendly(caught))}finally{setLoading(false)}
  },[realAccount]);

  useEffect(()=>{void load()},[load]);

  const current=selected?connections[selected]:null;
  const definition=selected?PROVIDERS.find(item=>item.id===selected):null;
  const open=(provider:LaunchProvider)=>{setError("");setSuccess("");setSelected(provider);setApiKey("");setApiSecret("");setPassphrase("")};
  const close=()=>{if(busy)return;setSelected(null);setError("");setSuccess("");setApiKey("");setApiSecret("");setPassphrase("")};

  const connect=async(event:FormEvent)=>{
    event.preventDefault();if(!selected||busy)return;setBusy(true);setError("");setSuccess("");
    try{
      if(selected==="binance")await invokeBinance("connect",{apiKey:apiKey.trim(),apiSecret:apiSecret.trim()});
      else await invokeMulti("upgrade",{provider:selected,apiKey:apiKey.trim(),apiSecret:apiSecret.trim(),...(definition?.passphrase?{passphrase:passphrase.trim()}:{})});
      await load();setSuccess(`${exchangeName(selected)} connected.`);setApiKey("");setApiSecret("");setPassphrase("");window.setTimeout(()=>setSelected(null),650);
    }catch(caught){setError(friendly(caught))}finally{setBusy(false)}
  };

  const disconnect=async()=>{
    if(!selected||busy||!window.confirm(`Disconnect ${exchangeName(selected)}? Existing trading history will stay intact.`))return;
    setBusy(true);setError("");setSuccess("");
    try{
      if(selected==="binance")await invokeBinance("disconnect");else await invokeMulti("disconnect",{provider:selected});
      await load();setSelected(null);
    }catch(caught){setError(friendly(caught))}finally{setBusy(false)}
  };

  return <div className={styles.page}>
    <div className={styles.head}>
      <div><small>SETTINGS</small><h1>Connections</h1><p>Connect an exchange once. It will be available everywhere in LabNarrative Trading.</p></div>
      <button type="button" onClick={onBackOverview}>← Overview</button>
    </div>

    {error&&!selected&&<div className={styles.error}>{error}</div>}

    <div className={styles.grid}>{PROVIDERS.map(item=>{
      const connection=connections[item.id];
      const connected=connection?.status==="connected";
      return <button type="button" className={styles.card} key={item.id} onClick={()=>open(item.id)} disabled={loading}>
        <div className={styles.logoWrap}><ExchangeLogo provider={item.id} size={52}/></div>
        <strong>{exchangeName(item.id)}</strong>
        <span className={connected?styles.connected:styles.offline}>{loading?"Checking…":connected?"Connected":"Connect"}</span>
      </button>
    })}</div>

    <p className={styles.security}>Use API credentials with reading and Spot trading only. Withdrawal permission is never required.</p>

    {selected&&<div className={styles.backdrop} onMouseDown={e=>{if(e.target===e.currentTarget)close()}}><section className={styles.modal} role="dialog" aria-modal="true" aria-label={`Connect ${exchangeName(selected)}`}>
      <div className={styles.modalHead}>
        <div><ExchangeLogo provider={selected} size={44}/><div><small>{current?.status==="connected"?"EXCHANGE CONNECTED":"CONNECT EXCHANGE"}</small><h2>{exchangeName(selected)}</h2></div></div>
        <button type="button" onClick={close} aria-label="Close">×</button>
      </div>

      {current?.status==="connected"&&<div className={styles.connectedBox}><span className={styles.dot}>✓</span><div><strong>Connected</strong><small>{current.apiKeyLast4?`API key ••••${current.apiKeyLast4}`:"Ready across your trading workspace"}</small></div></div>}
      {error&&<div className={styles.error}>{error}</div>}
      {success&&<div className={styles.success}>{success}</div>}

      <form className={styles.form} onSubmit={connect}>
        <label><span>API Key</span><input value={apiKey} onChange={e=>setApiKey(e.target.value)} autoComplete="off" spellCheck={false} placeholder="Paste API key" required /></label>
        <label><span>API Secret</span><input type="password" value={apiSecret} onChange={e=>setApiSecret(e.target.value)} autoComplete="new-password" spellCheck={false} placeholder="Paste API secret" required /></label>
        {definition?.passphrase&&<label><span>API Passphrase</span><input type="password" value={passphrase} onChange={e=>setPassphrase(e.target.value)} autoComplete="new-password" spellCheck={false} placeholder="Paste API passphrase" required /></label>}
        <div className={styles.actions}>
          {current?.status==="connected"&&<button type="button" className={styles.disconnect} onClick={()=>void disconnect()} disabled={busy}>Disconnect</button>}
          <button type="button" onClick={close} disabled={busy}>Cancel</button>
          <button className={styles.primary} disabled={busy}>{busy?"Connecting…":current?.status==="connected"?"Replace connection":"Connect"}</button>
        </div>
      </form>
    </section></div>}
  </div>;
}
