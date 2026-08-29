"use client";

import { useMemo, useState } from "react";
import styles from "./dca-config-importer.module.css";

export type DcaImportedCondition = {
  id: string;
  kind: string;
  timeframe: string;
  length: number;
  comparator: string;
  signal: number;
  aux1: number;
  aux2: number;
  aux3: number;
};

export type DcaImportPatch = {
  name?: string;
  pair?: string;
  pairs?: string[];
  allPairs?: boolean;
  baseOrder?: number;
  safetyOrder?: number;
  maxSafetyOrders?: number;
  limitSafetyOrders?: number;
  maxActiveTrades?: number;
  deviation?: number;
  stepScale?: number;
  volumeScale?: number;
  takeProfit?: number;
  stopEnabled?: boolean;
  stopPct?: number;
  conditions?: DcaImportedCondition[];
};

type Props = {
  availablePairs: string[];
  onApply: (patch: DcaImportPatch) => void;
};

type PreviewRow = { label: string; value: string };
type ParseResult = { source: string; patch: DcaImportPatch; rows: PreviewRow[]; warnings: string[] };

const LABELS = {
  baseOrder: [/^base\s+order(?:\s+(?:size|volume|amount))?\b/i, /^initial\s+order(?:\s+(?:size|volume|amount))?\b/i],
  safetyOrder: [/^safety\s+order(?:\s+(?:size|volume|amount))?\b/i, /^averaging\s+order(?:\s+(?:size|volume|amount))?\b/i],
  maxSafetyOrders: [/^max(?:imum)?\s+safety\s+(?:trades\s+count|orders?)\b/i, /^max(?:imum)?\s+averaging\s+orders?\b/i, /^averaging\s+orders?\s+per\s+(?:deal|trade)\b/i],
  limitSafetyOrders: [/^max(?:imum)?\s+active\s+safety\s+(?:trades\s+count|orders?)\b/i, /^active\s+safety\s+orders?\b/i, /^simultaneous\s+safety\s+orders?\b/i, /^active\s+averaging\s+orders?\b/i],
  maxActiveTrades: [/^max(?:imum)?\s+active\s+deals?\b/i, /^max(?:imum)?\s+active\s+trades?\b/i, /^max(?:imum)?\s+simultaneous\s+(?:deals?|trades?)\b/i],
  deviation: [/^price\s+deviation(?:\s+to\s+open\s+safety\s+orders?)?\b/i, /^first\s+(?:safety|averaging)[ -]order\s+deviation\b/i, /^initial\s+price\s+deviation\b/i],
  stepScale: [/^safety\s+order\s+step\s+scale\b/i, /^step\s+scale\b/i, /^averaging\s+order\s+step\s+(?:scale|multiplier)\b/i],
  volumeScale: [/^safety\s+order\s+volume\s+scale\b/i, /^volume\s+scale\b/i, /^averaging\s+order\s+(?:size|volume)\s+(?:scale|multiplier)\b/i],
  takeProfit: [/^take\s+profit(?:\s+(?:percentage|target))?\b/i, /^target\s+profit\b/i],
  stopLoss: [/^stop\s+loss(?:\s+(?:percentage|distance))?\b/i],
};

function cleanedLines(text: string) {
  return text
    .replace(/\r/g, "")
    .split("\n")
    .map(line => line.replace(/["']/g, "").replace(/_/g, " ").trim())
    .filter(Boolean);
}
function firstNumber(value: string) {
  const match = value.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const number = Number(match[0]);
  return Number.isFinite(number) ? number : null;
}
function valueAfterLabel(lines: string[], patterns: RegExp[]) {
  for (let index = 0; index < lines.length; index += 1) {
    for (const pattern of patterns) {
      const match = lines[index].match(pattern);
      if (!match) continue;
      const sameLine = lines[index].slice(match[0].length).replace(/^[\s:=–—-]+/, "").trim();
      if (sameLine) return sameLine;
      if (lines[index + 1]) return lines[index + 1].trim();
    }
  }
  return "";
}
function numberAfterLabel(lines: string[], patterns: RegExp[]) {
  const raw = valueAfterLabel(lines, patterns);
  return raw ? firstNumber(raw) : null;
}
function amountAfterLabel(lines: string[], patterns: RegExp[]) {
  const raw = valueAfterLabel(lines, patterns);
  if (!raw || /%/.test(raw)) return null;
  return firstNumber(raw);
}
function clampInt(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(value)));
}
function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
function normalizeTimeframe(line: string) {
  const explicit = [
    [/\b1\s*minute\b/i, "1 minute"], [/\b3\s*minutes?\b/i, "3 minutes"], [/\b5\s*minutes?\b/i, "5 minutes"],
    [/\b15\s*minutes?\b/i, "15 minutes"], [/\b30\s*minutes?\b/i, "30 minutes"], [/\b1\s*hour\b/i, "1 hour"],
    [/\b2\s*hours?\b/i, "2 hours"], [/\b4\s*hours?\b/i, "4 hours"], [/\b6\s*hours?\b/i, "6 hours"],
    [/\b8\s*hours?\b/i, "8 hours"], [/\b12\s*hours?\b/i, "12 hours"], [/\b1\s*day\b/i, "1 day"],
    [/\b3\s*days?\b/i, "3 days"], [/\b1\s*week\b/i, "1 week"], [/\b1\s*month\b/i, "1 month"],
  ] as const;
  for (const [pattern, value] of explicit) if (pattern.test(line)) return value;
  const compact = line.match(/(?:^|[\s,;(])(1m|3m|5m|15m|30m|1h|2h|4h|6h|8h|12h|1d|3d|1w)(?:$|[\s,;)])/i)?.[1]?.toLowerCase();
  return ({"1m":"1 minute","3m":"3 minutes","5m":"5 minutes","15m":"15 minutes","30m":"30 minutes","1h":"1 hour","2h":"2 hours","4h":"4 hours","6h":"6 hours","8h":"8 hours","12h":"12 hours","1d":"1 day","3d":"3 days","1w":"1 week"} as Record<string,string>)[compact || ""] || "15 minutes";
}
function comparatorFrom(line: string) {
  if (/cross(?:ing|es)?\s+(?:up|above)/i.test(line)) return "Crossing Up";
  if (/cross(?:ing|es)?\s+(?:down|below)/i.test(line)) return "Crossing Down";
  if (/greater\s+than|above|over\b/i.test(line)) return "Greater Than";
  return "Less Than";
}
function signalFrom(line: string, fallback: number) {
  const match = line.match(/(?:less\s+than|below|under|greater\s+than|above|over)\s*[:=]?\s*(-?\d+(?:\.\d+)?)/i);
  return match ? Number(match[1]) : fallback;
}
function parseConditions(lines: string[]) {
  const conditions: DcaImportedCondition[] = [];
  let unsupportedMentioned = false;
  lines.forEach((line, index) => {
    if (/\bstochastic\s+rsi\b/i.test(line)) { unsupportedMentioned = true; return; }
    if (/\brsi\b/i.test(line)) {
      const period = Number(line.match(/\brsi\s*[-(:]?\s*(\d{1,3})/i)?.[1] || 14);
      conditions.push({id:`import-rsi-${Date.now()}-${index}`,kind:"RSI",timeframe:normalizeTimeframe(line),length:clampInt(period,1,100),comparator:comparatorFrom(line),signal:signalFrom(line,30),aux1:0,aux2:0,aux3:0});
      return;
    }
    if (/\bstochastic\b/i.test(line)) {
      const params = line.match(/\((\d+)\s*[,/]\s*(\d+)\s*[,/]\s*(\d+)\)/);
      conditions.push({id:`import-stoch-${Date.now()}-${index}`,kind:"Stochastic",timeframe:normalizeTimeframe(line),length:2,comparator:comparatorFrom(line),signal:signalFrom(line,20),aux1:Number(params?.[1]||14),aux2:Number(params?.[2]||1),aux3:Number(params?.[3]||3)});
      return;
    }
    if (/\bmacd\b/i.test(line)) {
      const params = line.match(/(\d+)\s*[/,]\s*(\d+)\s*[/,]\s*(\d+)/);
      conditions.push({id:`import-macd-${Date.now()}-${index}`,kind:"MACD",timeframe:normalizeTimeframe(line),length:/below\s+zero/i.test(line)?2:1,comparator:comparatorFrom(line),signal:0,aux1:Number(params?.[1]||12),aux2:Number(params?.[2]||26),aux3:Number(params?.[3]||9)});
      return;
    }
    if (/deal\s+start\s+condition|start\s+condition|technical\s+analysis|tradingview\s+signal/i.test(line) && !/immediate|asap/i.test(line)) unsupportedMentioned = true;
  });
  return {conditions, unsupportedMentioned};
}
function normalizePairToken(token: string, availableSet: Set<string>) {
  const raw = token.toUpperCase().replace(/[^A-Z0-9/_-]/g, "");
  const candidates: string[] = [];
  if (raw.includes("/")) candidates.push(raw);
  if (raw.includes("_")) {
    const [a,b] = raw.split("_");
    if (a && b) { candidates.push(`${a}/${b}`); candidates.push(`${b}/${a}`); }
  }
  if (raw.includes("-")) {
    const [a,b] = raw.split("-");
    if (a && b) { candidates.push(`${a}/${b}`); candidates.push(`${b}/${a}`); }
  }
  if (raw.endsWith("USDT") && raw.length > 4) candidates.push(`${raw.slice(0,-4)}/USDT`);
  if (raw.startsWith("USDT") && raw.length > 4) candidates.push(`${raw.slice(4)}/USDT`);
  return candidates.find(pair => availableSet.has(pair)) || null;
}
function extractPairs(text: string, lines: string[], availablePairs: string[]) {
  const availableSet = new Set(availablePairs.map(pair => pair.toUpperCase()));
  const allPairs = /\ball\s+(?:coins|pairs|usdt\s+(?:spot\s+)?pairs)\b/i.test(text);
  if (allPairs) return { allPairs: true, pairs: [] as string[] };
  const pairLines: string[] = [];
  lines.forEach((line, index) => {
    if (/^(?:pair|pairs|trading\s+pair|coin\s+universe|markets?)\b/i.test(line)) {
      pairLines.push(line);
      if (lines[index + 1] && !/:/.test(lines[index + 1])) pairLines.push(lines[index + 1]);
    }
  });
  const haystack = pairLines.length ? pairLines.join(" ") : text;
  const tokens = haystack.match(/[A-Z0-9]{2,15}(?:\/|_|-)[A-Z0-9]{2,10}|[A-Z0-9]{2,15}USDT|USDT[A-Z0-9]{2,15}/gi) || [];
  const normalized = Array.from(new Set(tokens.map(token => normalizePairToken(token, availableSet)).filter((pair):pair is string => Boolean(pair))));
  return { allPairs: false, pairs: normalized };
}
function extractName(lines: string[]) {
  for (let index=0; index<lines.length; index+=1) {
    const match=lines[index].match(/^(?:bot\s+name|name)\b/i);
    if (!match) continue;
    const same=lines[index].slice(match[0].length).replace(/^[\s:=–—-]+/,"").trim();
    const value=same || lines[index+1] || "";
    if (value && value.length<=120 && !/^\d+(?:\.\d+)?$/.test(value)) return value.replace(/[,}]$/g,"").trim();
  }
  return "";
}

function parse(text: string, availablePairs: string[]): ParseResult {
  const lines = cleanedLines(text);
  const patch: DcaImportPatch = {};
  const rows: PreviewRow[] = [];
  const warnings: string[] = [];
  const source = /3\s*commas|max\s+active\s+deals|safety\s+trades\s+count/i.test(text) ? "3Commas" : "Generic DCA configuration";
  const add=(key:keyof DcaImportPatch,label:string,value:unknown,display?:string)=>{if(value===undefined||value===null||value==="")return;(patch as Record<string,unknown>)[key]=value;rows.push({label,value:display??String(value)});};

  const name=extractName(lines); if(name)add("name","Bot name",name);
  const pairResult=extractPairs(text,lines,availablePairs);
  if(pairResult.allPairs){add("allPairs","Coin universe",true,"All coins");}
  else if(pairResult.pairs.length){patch.allPairs=false;patch.pairs=pairResult.pairs;patch.pair=pairResult.pairs[0];rows.push({label:"Pair(s)",value:pairResult.pairs.join(", ")});}

  const baseOrder=amountAfterLabel(lines,LABELS.baseOrder); if(baseOrder!==null&&baseOrder>0)add("baseOrder","Base order",baseOrder,`${baseOrder} USDT`);
  else if(/base\s+order/i.test(text)&&/%/.test(valueAfterLabel(lines,LABELS.baseOrder)))warnings.push("Base order appears to use percentage sizing. LabNarrative currently expects a fixed USDT amount, so it was not imported.");
  const safetyOrder=amountAfterLabel(lines,LABELS.safetyOrder); if(safetyOrder!==null&&safetyOrder>0)add("safetyOrder","Safety order",safetyOrder,`${safetyOrder} USDT`);
  else if(/safety\s+order|averaging\s+order/i.test(text)&&/%/.test(valueAfterLabel(lines,LABELS.safetyOrder)))warnings.push("Safety/averaging order appears to use percentage sizing, so its amount was not imported.");

  const maxSafety=numberAfterLabel(lines,LABELS.maxSafetyOrders); if(maxSafety!==null)add("maxSafetyOrders","Max safety orders",clampInt(maxSafety,0,50));
  const limitSafety=numberAfterLabel(lines,LABELS.limitSafetyOrders); if(limitSafety!==null)add("limitSafetyOrders","Active safety orders",clampInt(limitSafety,0,50));
  const maxActive=numberAfterLabel(lines,LABELS.maxActiveTrades); if(maxActive!==null)add("maxActiveTrades","Max simultaneous trades",clampInt(maxActive,1,20));
  const deviation=numberAfterLabel(lines,LABELS.deviation); if(deviation!==null&&deviation>0)add("deviation","Price deviation",clampNumber(Math.abs(deviation),.1,99),`${Math.abs(deviation)}%`);
  const stepScale=numberAfterLabel(lines,LABELS.stepScale); if(stepScale!==null&&stepScale>0)add("stepScale","Step scale",clampNumber(stepScale,.1,100));
  const volumeScale=numberAfterLabel(lines,LABELS.volumeScale); if(volumeScale!==null&&volumeScale>0)add("volumeScale","Volume scale",clampNumber(volumeScale,.1,100));
  const takeProfit=numberAfterLabel(lines,LABELS.takeProfit); if(takeProfit!==null&&takeProfit>0)add("takeProfit","Take profit",clampNumber(Math.abs(takeProfit),.1,99),`${Math.abs(takeProfit)}%`);
  const stopRaw=valueAfterLabel(lines,LABELS.stopLoss);
  if(stopRaw){
    if(/off|disabled|none|false/i.test(stopRaw)){patch.stopEnabled=false;rows.push({label:"Stop loss",value:"Off"});}
    else {const stop=firstNumber(stopRaw);if(stop!==null&&Math.abs(stop)>0){patch.stopEnabled=true;patch.stopPct=clampNumber(Math.abs(stop),.1,99);rows.push({label:"Stop loss",value:`${Math.abs(stop)}%`});}}
  }

  const parsedConditions=parseConditions(lines);
  if(parsedConditions.conditions.length){patch.conditions=parsedConditions.conditions;rows.push({label:"Entry conditions",value:`${parsedConditions.conditions.length} detected`});}
  if(parsedConditions.unsupportedMentioned)warnings.push("Some entry-condition text could not be mapped safely. Verify the Entry conditions section manually after importing.");
  if(/trailing\s+take\s+profit|trailing\s+stop/i.test(text))warnings.push("Trailing settings are not part of this DCA configuration screen and were left unchanged.");
  if(/short\b/i.test(text))warnings.push("Short direction was detected. LabNarrative Binance Spot DCA is long-only, so direction was not imported.");
  if(!rows.length&&text.trim())warnings.push("No supported DCA settings were detected. Paste the configuration as text with labels and values, such as ‘Base order: 25 USDT’.");
  return {source,patch,rows,warnings};
}

export default function DcaConfigImporter({availablePairs,onApply}:Props){
  const [open,setOpen]=useState(false);
  const [text,setText]=useState("");
  const result=useMemo(()=>parse(text,availablePairs),[text,availablePairs]);
  const apply=()=>{if(!result.rows.length)return;onApply(result.patch);setOpen(false);setText("");};
  return <>
    <div className={styles.toolbar}>
      <div><span>Moving an existing bot?</span><small>Paste its settings and fill this form automatically.</small></div>
      <button type="button" onClick={()=>setOpen(true)}>Import configuration</button>
    </div>
    {open&&<div className={styles.backdrop} role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setOpen(false)}}>
      <section className={styles.modal} role="dialog" aria-modal="true" aria-label="Import DCA configuration">
        <header><div><span>IMPORT DCA CONFIGURATION</span><h3>Paste settings from another platform</h3><p>Optimized for 3Commas-style DCA settings. Parsing happens entirely in your browser — no AI, credits, or external API calls.</p></div><button type="button" className={styles.close} onClick={()=>setOpen(false)} aria-label="Close">×</button></header>
        <div className={styles.content}>
          <label className={styles.paste}><span>Configuration text</span><textarea autoFocus value={text} onChange={event=>setText(event.target.value)} placeholder={'Example:\nBot name: BTC Dip Bot\nPair: BTC/USDT\nBase order: 25 USDT\nSafety order: 25 USDT\nMax safety trades count: 5\nMax active safety trades count: 2\nPrice deviation to open safety orders: 1.5%\nSafety order step scale: 1.2\nSafety order volume scale: 1.5\nTake profit: 2%\nStop loss: 8%'}/><small>Tip: copying the text directly from the old bot settings page works better than screenshots.</small></label>
          <div className={styles.preview}>
            <div className={styles.previewHead}><div><span>Detected settings</span><small>{text.trim()?result.source:"Waiting for configuration text"}</small></div><b>{result.rows.length}</b></div>
            {result.rows.length?<div className={styles.rows}>{result.rows.map((row,index)=><div key={`${row.label}-${index}`}><span>{row.label}</span><b>{row.value}</b></div>)}</div>:<div className={styles.empty}>Paste the old bot configuration to preview what will be imported.</div>}
            {result.warnings.length>0&&<div className={styles.warnings}>{result.warnings.map((warning,index)=><p key={index}>{warning}</p>)}</div>}
          </div>
        </div>
        <footer><span>Only detected fields will change. Everything else stays as currently configured.</span><div><button type="button" onClick={()=>setOpen(false)}>Cancel</button><button type="button" className={styles.apply} disabled={!result.rows.length} onClick={apply}>Apply configuration</button></div></footer>
      </section>
    </div>}
  </>;
}
