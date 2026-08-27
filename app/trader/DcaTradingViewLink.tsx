"use client";

import { useEffect, useMemo, useState } from "react";
import { browserSupabase } from "../../lib/supabase-browser";
import cfg from "./dca-bot-configurator.module.css";
import tv from "./dca-tradingview-link.module.css";

type LinkState = { ok?:boolean; enabled:boolean; token:string; webhookUrl:string; entryRuleEnabled:boolean; accountKind?:"paper"|"real"; maxSingleOrder?:number|null; error?:string };
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
  const [funds, setFunds] = useState(10);

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

  const liveOrderCap = link?.accountKind === "real" && Number.isFinite(Number(link.maxSingleOrder)) && Number(link.maxSingleOrder) > 0 ? Number(link.maxSingleOrder) : null;
  const fundsAllowed = Number.isFinite(funds) && funds > 0;
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
    try { const result = await invokeLink({ action:"regenerate", accountId, botId }); setLink(result); setNotice("TradingView key reset. Update alerts that used the old message."); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Unable to reset TradingView key."); }
    finally { setWorking(false); }
  };

  const copy = async (value:string|undefined, label:string) => {
    if (!value) return;
    try { await navigator.clipboard.writeText(value); setNotice(`${label} copied.`); }
    catch { setNotice("Clipboard access was blocked by the browser."); }
  };

  if (!botId) return null;

  return <section className={`${cfg.card} ${tv.panel}`}>
    <div className={tv.header}>
      <div><h3 className={tv.title}>TradingView Link</h3><p className={tv.helper}>One webhook for external entry, exit and position funding.</p></div>
      {link?.enabled?<div className={tv.headerActions}><button type="button" className={tv.textButton} onClick={()=>void regenerate()} disabled={working}>Reset key</button><button type="button" className={tv.textButton} onClick={()=>void setEnabled(false)} disabled={working}>Disable</button></div>:<button type="button" className={tv.textButton} onClick={()=>void setEnabled(true)} disabled={working||loading}>{working?"Connecting…":"Connect TradingView"}</button>}
    </div>
    {notice&&<div className={tv.notice}>{notice}</div>}
    {loading?<div className={tv.loading}>Loading TradingView Link…</div>:link?.enabled&&messages?<>
      <div className={tv.webhook}><span className={tv.webhookLabel}>Webhook</span><p className={tv.webhookUrl}>{webhookUrl}</p><button type="button" className={tv.textButton} onClick={()=>void copy(webhookUrl,"Webhook URL")}>· Copy URL</button></div>
      <div className={tv.actions}>
        <div className={tv.action}><span className={tv.eyebrow}>Start trade</span><b className={tv.actionTitle}>TradingView entry</b><p className={tv.explanation}>{entryRuleEnabled?"Opens this DCA position from the alert.":"Choose TradingView Custom Signal as the entry rule first."}</p><div className={tv.copyLine}><button type="button" className={tv.textButton} disabled={!entryRuleEnabled} onClick={()=>void copy(messages.start,"Start message")}>· Copy message</button></div></div>
        <div className={tv.action}><span className={tv.eyebrow}>Close position</span><b className={tv.actionTitle}>Market exit</b><p className={tv.explanation}>Closes the active DCA position at market.</p><div className={tv.copyLine}><button type="button" className={tv.textButton} onClick={()=>void copy(messages.close,"Close message")}>· Copy message</button></div></div>
        <div className={tv.action}><span className={tv.eyebrow}>Add funds</span><b className={tv.actionTitle}>Quote currency</b><p className={tv.explanation}>Adds USDT and recalculates the position average.</p><div className={tv.amountRow}><span className={tv.amountLabel}>Amount</span><input className={tv.amountInput} type="number" min="0.01" step="0.01" value={funds} onChange={event=>setFunds(Number(event.target.value))}/><span className={tv.unit}>USDT</span></div>{liveOrderCap!=null&&<p className={tv.limit}>Per-order execution limit: {liveOrderCap.toLocaleString()} USDT. Larger requests are split automatically.</p>}<div className={tv.copyLine}><button type="button" className={tv.textButton} disabled={!fundsAllowed} onClick={()=>void copy(messages.add,"Add Funds message")}>· Copy message</button></div></div>
      </div>
      <p className={tv.footer}>The account’s live-capital limit and available USDT remain enforced. The TradingView key is scoped to this automation; never place a Binance API key in an alert.</p>
    </>:<div className={tv.off}>TradingView control is off. Connect it only when you want external START, CLOSE or ADD FUNDS commands for this automation.</div>}
  </section>;
}
