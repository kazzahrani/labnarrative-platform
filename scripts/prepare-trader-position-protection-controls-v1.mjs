import fs from "node:fs";
import path from "node:path";

const root=process.cwd();
const actionFile=path.join(root,"app/trader/TradeActionsV2.tsx");
const cutoverFile=path.join(root,"app/trader/TraderV2FullShellCutover.tsx");
const shellFile=path.join(root,"app/trader/TraderV2FullShell.tsx");

const actions=String.raw`"use client";

import { useState } from "react";
import type { CSSProperties, FormEvent, MouseEvent } from "react";
import { browserSupabase } from "../../lib/supabase-browser";

type TradeActionsProps = {
  accountId: string;
  accountMode: "paper" | "live";
  trade: {
    id: string;
    pair: string;
    invested: number;
    maxAveraging: number;
    activeOrdersLimit: number;
    takeProfitPct: number;
    stopEnabled: boolean;
    stopPct: number;
  };
  onRefresh: () => Promise<void> | void;
};

type Protection = "sl" | "tp";
type Json = Record<string, unknown>;
const ui:Record<string,CSSProperties>={
  wrap:{display:"flex",gap:6,alignItems:"center",justifyContent:"flex-end"},
  chip:{height:28,minWidth:34,padding:"0 9px",border:"1px solid #3a3a3a",borderRadius:9,background:"#232323",color:"#bdbdbd",font:"700 10px Tahoma,Arial,sans-serif",cursor:"pointer"},
  chipOn:{borderColor:"#426151",color:"#72c39a",background:"#202b25"},
  overlay:{position:"fixed",inset:0,zIndex:10000,display:"grid",placeItems:"center",background:"rgba(0,0,0,.68)",padding:20},
  modal:{width:"min(430px,calc(100vw - 32px))",background:"#212121",border:"1px solid #414141",borderRadius:20,boxShadow:"0 24px 70px rgba(0,0,0,.55)",overflow:"hidden",color:"#f2f2f2"},
  head:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"20px 22px",borderBottom:"1px solid #383838"},
  eyebrow:{display:"block",font:"700 9px Tahoma,Arial,sans-serif",letterSpacing:"1.4px",color:"#858585",marginBottom:6},
  title:{margin:0,font:"700 20px Tahoma,Arial,sans-serif"},
  close:{border:0,background:"transparent",color:"#999",fontSize:24,cursor:"pointer",lineHeight:1},
  body:{padding:"20px 22px"},
  label:{display:"block",font:"11px Tahoma,Arial,sans-serif",color:"#9a9a9a",marginBottom:8},
  segment:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:18},
  seg:{height:40,border:"1px solid #414141",borderRadius:11,background:"#282828",color:"#aaa",font:"700 11px Tahoma,Arial,sans-serif",cursor:"pointer"},
  segActive:{background:"#f1f1f1",color:"#161616",borderColor:"#f1f1f1"},
  inputWrap:{display:"flex",alignItems:"center",border:"1px solid #414141",borderRadius:11,background:"#242424",height:44,padding:"0 13px"},
  input:{flex:1,minWidth:0,border:0,outline:0,background:"transparent",color:"#f2f2f2",font:"700 13px Tahoma,Arial,sans-serif"},
  unit:{color:"#888",font:"700 11px Tahoma,Arial,sans-serif"},
  note:{margin:"10px 0 0",font:"10px/1.45 Tahoma,Arial,sans-serif",color:"#777"},
  error:{marginTop:14,padding:"10px 12px",border:"1px solid #673f43",borderRadius:10,background:"#382326",color:"#d98f96",font:"10px/1.4 Tahoma,Arial,sans-serif"},
  foot:{display:"flex",justifyContent:"flex-end",gap:9,padding:"16px 22px 20px",borderTop:"1px solid #383838"},
  cancel:{height:36,padding:"0 15px",border:"1px solid #414141",borderRadius:12,background:"#292929",color:"#bbb",font:"700 10px Tahoma,Arial,sans-serif",cursor:"pointer"},
  save:{height:36,padding:"0 17px",border:0,borderRadius:12,background:"#f1f1f1",color:"#171717",font:"700 10px Tahoma,Arial,sans-serif",cursor:"pointer"},
};
function asJson(value:unknown):Json{return value&&typeof value==="object"&&!Array.isArray(value)?value as Json:{};}
function errorText(code:string){
  if(code==="position_protection_busy")return "Position protection is being checked right now. Retry in a second.";
  if(code==="live_trading_not_enabled")return "Live trading is not enabled for this account.";
  if(code==="position_not_active")return "This position is no longer active.";
  if(code==="invalid_stop_loss")return "Enter a valid stop-loss distance.";
  if(code==="invalid_take_profit")return "Enter a valid take-profit distance.";
  if(code==="exit_strategy_v2_required")return "This position has not finished its Core V2 protection migration.";
  if(code==="position_protection_timeout")return "The protection service did not respond quickly. Retry once.";
  return code||"Unable to save this protection setting.";
}

export default function TradeActionsV2(props:TradeActionsProps){
  const {trade,onRefresh}=props;
  const [open,setOpen]=useState<Protection|null>(null);
  const [enabled,setEnabled]=useState(true);
  const [value,setValue]=useState(0);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");

  const openProtection=(kind:Protection)=>{
    setOpen(kind);setError("");
    if(kind==="sl"){setEnabled(trade.stopEnabled);setValue(Number(trade.stopPct||0));}
    else{setEnabled(Number(trade.takeProfitPct||0)>0);setValue(Number(trade.takeProfitPct||0));}
  };
  const stop=(event:MouseEvent)=>event.stopPropagation();
  const close=()=>{if(!busy){setOpen(null);setError("");}};
  const save=async(event:FormEvent)=>{
    event.preventDefault();
    if(!open||busy)return;
    if(enabled&&!(Number(value)>0)){setError(open==="sl"?"Enter a valid stop-loss distance.":"Enter a valid take-profit distance.");return;}
    setBusy(true);setError("");
    try{
      const {data,error:sessionError}=await browserSupabase.auth.getSession();
      const token=data.session?.access_token||"";
      if(sessionError||!token)throw new Error("unauthorized");
      const response=await fetch("/api/trader/position-protection",{method:"POST",headers:{authorization:\`Bearer \${token}\`,"content-type":"application/json"},body:JSON.stringify({tradeId:trade.id,kind:open,enabled,pct:Number(value)||0}),cache:"no-store",signal:AbortSignal.timeout(10000)});
      const text=await response.text();let payload:unknown=null;try{payload=text?JSON.parse(text):null;}catch{payload=text||null;}
      const result=asJson(payload);
      if(!response.ok||result.ok!==true)throw new Error(String(result.error||\`protection_http_\${response.status}\`));
      setOpen(null);
      void Promise.resolve(onRefresh()).catch(()=>undefined);
    }catch(caught){setError(errorText(caught instanceof Error?caught.message:"position_protection_failed"));}
    finally{setBusy(false);}
  };
  return <>
    <div style={ui.wrap} onClick={stop}>
      <button type="button" aria-label="Stop loss" title="Stop loss" style={{...ui.chip,...(trade.stopEnabled?ui.chipOn:{})}} onClick={(event)=>{event.stopPropagation();openProtection("sl");}}>SL</button>
      <button type="button" aria-label="Take profit" title="Take profit" style={{...ui.chip,...(Number(trade.takeProfitPct||0)>0?ui.chipOn:{})}} onClick={(event)=>{event.stopPropagation();openProtection("tp");}}>TP</button>
    </div>
    {open&&<div style={ui.overlay} onMouseDown={(event)=>{event.stopPropagation();if(event.target===event.currentTarget)close();}} onClick={stop}>
      <form style={ui.modal} onSubmit={save} onClick={stop}>
        <header style={ui.head}><div><span style={ui.eyebrow}>{open==="sl"?"STOP LOSS":"TAKE PROFIT"}</span><h3 style={ui.title}>{trade.pair}</h3></div><button type="button" style={ui.close} onClick={close}>×</button></header>
        <div style={ui.body}>
          <span style={ui.label}>Status</span>
          <div style={ui.segment}><button type="button" style={{...ui.seg,...(enabled?ui.segActive:{})}} onClick={()=>setEnabled(true)}>On</button><button type="button" style={{...ui.seg,...(!enabled?ui.segActive:{})}} onClick={()=>setEnabled(false)}>Off</button></div>
          <span style={ui.label}>{open==="sl"?"Stop loss distance":"Take profit target"}</span>
          <div style={{...ui.inputWrap,opacity:enabled?1:.45}}><input style={ui.input} type="number" min="0.01" max="1000" step="0.01" disabled={!enabled||busy} value={value} onChange={(event)=>setValue(Number(event.target.value))}/><b style={ui.unit}>%</b></div>
          <p style={ui.note}>Saved immediately to Core V2. No exchange order is sent when you change this setting; the existing exit worker enforces it when price reaches the level.</p>
          {error&&<div style={ui.error}>{error}</div>}
        </div>
        <footer style={ui.foot}><button type="button" style={ui.cancel} disabled={busy} onClick={close}>Cancel</button><button type="submit" style={{...ui.save,opacity:busy ? .65 : 1}} disabled={busy}>{busy?"Saving…":"Save"}</button></footer>
      </form>
    </div>}
  </>;
}
`;
fs.writeFileSync(actionFile,actions);

let cutover=fs.readFileSync(cutoverFile,"utf8");
const blocking='      const v2 = await readV2();\n      if (!v2.error) updateRealConnectionState(v2.data);\n      return { data: { ...accountData, accounts: cachedAccounts, defaultAccount }, error: null };';
const nonblocking='      void readV2().then((v2) => { if (!v2.error) updateRealConnectionState(v2.data); }).catch(() => undefined);\n      return { data: { ...accountData, accounts: cachedAccounts, defaultAccount }, error: null };';
if(cutover.includes(blocking))cutover=cutover.replace(blocking,nonblocking);
fs.writeFileSync(cutoverFile,cutover);

let shell=fs.readFileSync(shellFile,"utf8");
const accountCall='      const result = await invokeAccount({ action: bootstrap ? "bootstrap" : "list" });';
const timedCall='      const result = await Promise.race([\n        invokeAccount({ action: bootstrap ? "bootstrap" : "list" }),\n        new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error("Trading accounts took too long to load. Retry the page.")), 12000)),\n      ]);';
if(shell.includes(accountCall))shell=shell.replace(accountCall,timedCall);
fs.writeFileSync(shellFile,shell);
console.log("Prepared clean SL/TP-only position controls and non-blocking workspace bootstrap");
