"use client";

import { useEffect, useMemo, useState } from "react";
import { browserSupabase } from "../../lib/supabase-browser";
import cfg from "./dca-bot-configurator.module.css";

type LinkState = { ok?:boolean; enabled:boolean; token:string; webhookUrl:string; entryRuleEnabled:boolean; error?:string };
type Props = { accountId:string; botId:string|null; entryRuleEnabled:boolean };

async function invokeLink(body:Record<string,unknown>) {
  const { data, error } = await browserSupabase.functions.invoke("trader-tradingview-control", { body });
  if (error) {
    let message = error.message || "tradingview_link_failed";
    const context = (error as { context?: Response }).context;
    if (context) { try { const payload = await context.clone().json() as { error?:string }; if (payload.error) message = payload.error; } catch {} }
    throw new Error(message);
  }
  const result = (data ?? {}) as LinkState;
  if (result.error || result.ok !== true) throw new Error(result.error || "tradingview_link_failed");
  return result;
}

export default function DcaTradingViewLink({ accountId, botId, entryRuleEnabled }:Props) {
  const [link, setLink] = useState<LinkState|null>(null);
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState("");
  const [funds, setFunds] = useState(50);

  useEffect(() => {
    let alive = true;
    if (!botId) { setLink(null); return () => { alive = false; }; }
    setLoading(true); setNotice("");
    void invokeLink({ action:"get_link", accountId, botId })
      .then(result => { if (alive) setLink(result); })
      .catch(error => { if (alive) setNotice(error instanceof Error ? error.message : "Unable to load TradingView Link."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [accountId, botId]);

  const webhookUrl = link?.webhookUrl || "https://platform.labnarrative.com/api/trader/tradingview";
  const messages = useMemo(() => {
    if (!link?.token) return null;
    const base = { token:link.token, pair:"{{ticker}}", signal_id:"{{timenow}}" };
    return {
      start: JSON.stringify({ ...base, action:"START" }),
      close: JSON.stringify({ ...base, action:"CLOSE" }),
      add: JSON.stringify({ ...base, action:"ADD_FUNDS", amount:Math.max(0, Number(funds) || 0) }),
    };
  }, [link?.token, funds]);

  const setEnabled = async (enabled:boolean) => {
    if (!botId || working) return;
    setWorking(true); setNotice("");
    try { const result = await invokeLink({ action:"set_enabled", accountId, botId, enabled }); setLink(result); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Unable to update TradingView Link."); }
    finally { setWorking(false); }
  };

  const regenerate = async () => {
    if (!botId || working) return;
    setWorking(true); setNotice("");
    try { const result = await invokeLink({ action:"regenerate", accountId, botId }); setLink(result); setNotice("TradingView key reset. Update any alerts that used the old message."); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Unable to reset TradingView key."); }
    finally { setWorking(false); }
  };

  const copy = async (value:string|undefined, label:string) => {
    if (!value) return;
    try { await navigator.clipboard.writeText(value); setNotice(`${label} copied.`); }
    catch { setNotice("Clipboard access was blocked by the browser."); }
  };

  if (!botId) return null;

  return <section className={cfg.card}>
    <div className={cfg.cardHead}><div><h3>TradingView Link</h3><p>One webhook. Use only the actions you need.</p></div>{link?.enabled?<div className={cfg.modeButtons}><button type="button" onClick={()=>void regenerate()} disabled={working}>Reset key</button><button type="button" onClick={()=>void setEnabled(false)} disabled={working}>Disable</button></div>:<button type="button" className={cfg.addButton} onClick={()=>void setEnabled(true)} disabled={working||loading}>{working?"Connecting…":"Connect TradingView"}</button>}</div>
    {notice&&<div className={cfg.liveNote}>{notice}</div>}
    {loading?<div className={cfg.loading}>Loading TradingView Link…</div>:link?.enabled&&messages?<>
      <div className={cfg.allBox}><strong>Webhook URL</strong><p style={{overflowWrap:"anywhere"}}>{webhookUrl}</p><button type="button" className={cfg.addButton} onClick={()=>void copy(webhookUrl,"Webhook URL")}>Copy URL</button></div>
      <div className={cfg.summaryGrid} style={{gridTemplateColumns:"repeat(3,minmax(0,1fr))",marginTop:8}}>
        <div><span>START TRADE</span><b>TradingView entry</b><small>{entryRuleEnabled?"Opens this DCA position from your alert.":"Choose TradingView Custom Signal as the entry rule first."}</small><button type="button" className={cfg.addButton} disabled={!entryRuleEnabled} onClick={()=>void copy(messages.start,"Start message")}>Copy message</button></div>
        <div><span>CLOSE POSITION</span><b>Market exit</b><small>Closes the active DCA position at market.</small><button type="button" className={cfg.addButton} onClick={()=>void copy(messages.close,"Close message")}>Copy message</button></div>
        <div><span>ADD FUNDS</span><b>Quote currency</b><small>Adds USDT to the active position and updates average entry.</small><label><span>Amount</span><div className={cfg.unit}><input type="number" min="0" step="0.01" value={funds} onChange={event=>setFunds(Number(event.target.value))}/><b>USDT</b></div></label><button type="button" className={cfg.addButton} disabled={!(funds>0)} onClick={()=>void copy(messages.add,"Add Funds message")}>Copy message</button></div>
      </div>
      <div className={cfg.liveNote} style={{marginTop:8}}>Use the same webhook URL for all three actions. The message contains a revocable key scoped only to this automation; never use a Binance API key in TradingView.</div>
    </>:<div className={cfg.immediate}>TradingView control is off. Connect it only if you want external START, CLOSE or ADD FUNDS commands for this automation.</div>}
  </section>;
}
