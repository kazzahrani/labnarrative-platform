"use client";

import { FormEvent, useEffect } from "react";
import styles from "./automation-detail-modal.module.css";

export type EntryCondition = {
  id?: string | number;
  kind?: string;
  length?: number;
  comparator?: string;
  signal?: number;
  timeframe?: string;
  aux1?: number;
  aux2?: number;
  aux3?: number;
};

type AutomationLike = {
  id: string;
  name: string;
  status: string;
  type: string;
  provider: string;
  executionMode: string;
  pair: string;
  market: string;
  conditionLabel: string;
  isArchived: boolean;
  executions: number;
  closedPositions: number;
  activePositions: number;
  maxActivePositions: number | null;
  maxCapital: number | null;
  realizedPnl: number;
  unrealizedPnl: number;
  pnl: number;
  baseOrder: number | null;
  safetyOrder: number | null;
  maxSafetyOrders: number;
  activeDcaLimit: number;
  deviation: number;
  stepScale: number;
  volumeScale: number;
  takeProfitPct: number | null;
  stopEnabled: boolean;
  stopPct: number | null;
  trailingPct: number | null;
  canManage: boolean;
  allPairs?: boolean;
  pairs?: string[];
  conditions?: EntryCondition[];
  wins?: number;
  losses?: number;
  breakeven?: number;
  realizedRoi?: number;
  stopLossTimeoutSeconds?: number | null;
};

export type BotFormLike = {
  name: string;
  provider: string;
  pair: string;
  pairs: string[];
  allPairs: boolean;
  conditions: EntryCondition[];
  baseOrder: number;
  safetyOrder: number;
  maxSafetyOrders: number;
  limitSafetyOrders: number;
  maxActiveTrades: number;
  deviation: number;
  stepScale: number;
  volumeScale: number;
  takeProfit: number;
  trailingPct: number;
  stopEnabled: boolean;
  stopPct: number;
  stopLossTimeoutSeconds: number;
};

type Props = {
  automation: AutomationLike;
  mode: "view" | "edit";
  form: BotFormLike;
  busy: boolean;
  onClose: () => void;
  onEdit: () => void;
  onToggle: () => void;
  onArchive: () => void;
  onFormChange: (patch: Partial<BotFormLike>) => void;
  onSave: (event: FormEvent) => void;
};

const INDICATORS = ["RSI","Stochastic","MACD","Moving Average (MA)","Average Directional Index","Bollinger Bands %B","Money Flow Index","Commodity Channel Index","Ultimate Oscillator","Parabolic SAR","Heikin Ashi"];
const COMPARATORS = ["Greater Than","Less Than","Crossing Up","Crossing Down"];
const TIMEFRAMES = ["3 minutes","5 minutes","15 minutes","30 minutes","1 hour","2 hours","4 hours","8 hours","12 hours","1 day","3 days","1 week","1 month"];

function providerLabel(value: string) {
  const p = String(value || "").toLowerCase();
  if (p === "okx") return "OKX";
  if (p === "kucoin") return "KuCoin";
  if (p === "bybit") return "Bybit";
  if (p === "binance") return "Binance";
  return value || "—";
}
function money(value: number | null | undefined) {
  const n = Number(value ?? 0);
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(Number.isFinite(n) ? n : 0);
}
function pct(value: number | null | undefined) {
  const n = Number(value ?? 0);
  return `${Number.isFinite(n) ? n.toFixed(2) : "0.00"}%`;
}
function conditionText(condition: EntryCondition, index: number) {
  const kind = condition.kind || `Rule ${index + 1}`;
  const length = condition.length != null ? ` ${condition.length}` : "";
  const comparator = String(condition.comparator || "").toLowerCase();
  const signal = condition.signal != null ? ` ${condition.signal}` : "";
  const timeframe = condition.timeframe ? ` · ${condition.timeframe}` : "";
  return `${kind}${length}${comparator ? ` ${comparator}` : ""}${signal}${timeframe}`.trim();
}
function normalizePairs(value: string) {
  return Array.from(new Set(value.split(/[\s,]+/).map((pair) => pair.trim().toUpperCase()).filter((pair) => /^[A-Z0-9]{2,16}\/USDT$/.test(pair))));
}

export default function AutomationDetailModal({ automation, mode, form, busy, onClose, onEdit, onToggle, onArchive, onFormChange, onSave }: Props) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = previous; };
  }, [onClose]);

  const running = automation.status.toLowerCase() === "running";
  const conditions = Array.isArray(automation.conditions) ? automation.conditions : [];
  const wins = Math.max(0, automation.wins ?? 0);
  const losses = Math.max(0, automation.losses ?? 0);
  const breakeven = Math.max(0, automation.breakeven ?? 0);
  const outcomes = Math.max(1, wins + losses + breakeven);
  const winPct = wins / outcomes * 100;
  const lossPct = losses / outcomes * 100;
  const bePct = breakeven / outcomes * 100;
  const donut = `conic-gradient(#58dca3 0 ${winPct}%, #ff7582 ${winPct}% ${winPct + lossPct}%, #777 ${winPct + lossPct}% 100%)`;
  const capitalPerPosition = Math.max(0, automation.baseOrder ?? form.baseOrder);
  const marketUniverse = automation.allPairs ? `All ${providerLabel(automation.provider)} USDT Spot pairs` : automation.market;

  const updateRule = (index: number, patch: Partial<EntryCondition>) => {
    onFormChange({ conditions: form.conditions.map((rule, ruleIndex) => ruleIndex === index ? { ...rule, ...patch } : rule) });
  };
  const addRule = () => {
    onFormChange({ conditions: [...form.conditions, { id: `condition-${Date.now()}`, kind: "RSI", length: 14, comparator: "Less Than", signal: 30, timeframe: "5 minutes", aux1: 0, aux2: 0, aux3: 0 }] });
  };
  const deleteRule = (index: number) => onFormChange({ conditions: form.conditions.filter((_, ruleIndex) => ruleIndex !== index) });

  return <div className={styles.backdrop} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className={styles.modal} role="dialog" aria-modal="true" aria-label={`${automation.name} automation`}>
      <header className={styles.header}>
        <div><span className={styles.kicker}>DCA BOT</span><h2>{automation.name}</h2><small>{automation.pair} · {automation.executionMode || "live"}</small></div>
        <div className={styles.headerActions}>
          {mode === "view" && automation.canManage && <button className={styles.primary} type="button" onClick={onEdit}>Edit bot</button>}
          {mode === "view" && automation.canManage && <button type="button" disabled={busy} onClick={onToggle}>{running ? "Pause" : "Resume"}</button>}
          {mode === "view" && automation.canManage && <button type="button" disabled={busy || automation.activePositions > 0} onClick={onArchive}>Close bot</button>}
          <button className={styles.close} type="button" aria-label="Close" onClick={onClose}>×</button>
        </div>
      </header>

      {mode === "view" ? <div className={styles.scroll}>
        <div className={styles.stats}>
          <article><span>Exchange</span><strong>{providerLabel(automation.provider)}</strong></article>
          <article><span>Market universe</span><strong>{marketUniverse}</strong></article>
          <article><span>Position capacity</span><strong>{automation.maxActivePositions ?? "∞"}</strong></article>
          <article><span>Entry rules</span><strong>{conditions.length || (automation.conditionLabel && automation.conditionLabel !== "Immediately" ? 1 : 0)}</strong></article>
          <article><span>Capital / position</span><strong>{money(capitalPerPosition)}</strong></article>
        </div>

        <div className={styles.twoColWide}>
          <section className={styles.card}><h3>Market</h3><p>The strategy can scan its configured market universe.</p><div className={styles.marketBadge}>{marketUniverse.toUpperCase()}</div></section>
          <section className={styles.card}><div className={styles.cardTitleRow}><h3>OUTCOME MIX</h3><small>{automation.closedPositions} closed</small></div><div className={styles.outcomeBody}><div className={styles.donut} style={{ background: donut }}><div><strong>{automation.closedPositions}</strong><span>closed</span></div></div><div className={styles.legend}><div><i className={styles.win}/><span>Wins</span><b>{wins} · {pct(winPct)}</b></div><div><i className={styles.loss}/><span>Losses</span><b>{losses} · {pct(lossPct)}</b></div><div><i className={styles.be}/><span>Breakeven</span><b>{breakeven} · {pct(bePct)}</b></div><div className={styles.roi}><span>Realized ROI</span><b className={(automation.realizedRoi ?? 0) >= 0 ? styles.positive : styles.negative}>{pct(automation.realizedRoi ?? 0)}</b></div></div></div></section>
        </div>

        <section className={styles.card}><h3>Entry Rule</h3><p>All configured entry rules must be true on closed candles before a new position opens.</p><div className={styles.rules}>{conditions.length ? conditions.map((condition, index) => <div key={String(condition.id ?? index)}><span>{index + 1}</span><div><strong>{condition.kind || "Rule"}</strong><small>{conditionText(condition, index)}</small></div></div>) : <div className={styles.noRules}>Immediately — no indicator entry rule is configured.</div>}</div></section>

        <div className={styles.twoCol}>
          <section className={styles.card}><h3>Capital Plan</h3><dl><div><dt>Initial order</dt><dd>{money(automation.baseOrder)}</dd></div><div><dt>DCA order size</dt><dd>{money(automation.safetyOrder)}</dd></div><div><dt>Maximum DCA orders</dt><dd>{automation.maxSafetyOrders}</dd></div><div><dt>Active DCA orders</dt><dd>{automation.activeDcaLimit}</dd></div><div><dt>First DCA trigger</dt><dd>{automation.deviation}%</dd></div><div><dt>Price step multiplier</dt><dd>{automation.stepScale}×</dd></div><div><dt>Order size multiplier</dt><dd>{automation.volumeScale}×</dd></div></dl></section>
          <section className={styles.card}><h3>Exit Plan</h3><dl><div><dt>Take profits</dt><dd>TP1 {automation.takeProfitPct ?? 0}% / 100%</dd></div><div><dt>Trailing TP</dt><dd>{automation.trailingPct && automation.trailingPct > 0 ? `${automation.trailingPct}%` : "Off"}</dd></div><div><dt>Stop loss</dt><dd>{automation.stopEnabled ? `${automation.stopPct ?? 0}%${automation.stopLossTimeoutSeconds ? ` · ${automation.stopLossTimeoutSeconds}s timeout` : ""}` : "Off"}</dd></div><div><dt>Maximum active positions</dt><dd>{automation.maxActivePositions ?? "∞"}</dd></div><div><dt>Maximum capital</dt><dd>{automation.maxCapital == null ? "Dynamic" : money(automation.maxCapital)}</dd></div></dl></section>
        </div>

        <section className={styles.card}><div className={styles.cardTitleRow}><div><h3>TradingView Link</h3><p>One webhook for external entry, exit and position funding.</p></div><span className={styles.mutedAction}>Connect TradingView</span></div><small className={styles.note}>TradingView control is shown only when it is configured for this automation.</small></section>
      </div> : <form className={styles.scroll} onSubmit={onSave}>
        <section className={styles.card}><h3>Exchange</h3><p>Choose where this bot and every order it creates will execute.</p><label>Exchange<select value={form.provider} disabled><option>{providerLabel(form.provider)}</option></select></label><small className={styles.note}>This bot stays on its original exchange.</small></section>

        <section className={styles.card}><h3>Strategy</h3><p>Name this automation and define how many positions it may manage at once.</p><div className={styles.formGrid}><label>Strategy name<input value={form.name} onChange={(event) => onFormChange({ name: event.target.value })}/></label><label>Maximum active positions<input type="number" min={1} max={20} value={form.maxActiveTrades} onChange={(event) => onFormChange({ maxActiveTrades: Number(event.target.value) })}/></label></div></section>

        <section className={styles.card}><div className={styles.cardTitleRow}><div><h3>Market</h3><p>Choose where this strategy is allowed to operate.</p></div><div className={styles.marketToggle}><button type="button" className={form.allPairs ? styles.toggleActive : ""} onClick={() => onFormChange({ allPairs: true, pairs: [] })}>All coins</button><button type="button" className={!form.allPairs ? styles.toggleActive : ""} onClick={() => onFormChange({ allPairs: false, pairs: form.pairs.length ? form.pairs : [form.pair] })}>Selected coins</button></div></div>{form.allPairs ? <div className={styles.marketNotice}>All {providerLabel(form.provider)} USDT Spot pairs<small>The strategy may scan the complete connected USDT Spot universe.</small></div> : <label>Selected USDT pairs<input value={form.pairs.join(", ")} onChange={(event) => { const pairs = normalizePairs(event.target.value); onFormChange({ pairs, pair: pairs[0] || form.pair }); }} placeholder="BTC/USDT, ETH/USDT"/></label>}</section>

        <section className={styles.card}><div className={styles.cardTitleRow}><div><h3>Entry Rule</h3><p>Multiple rules are combined with AND and evaluated on closed candles.</p></div><button type="button" className={styles.addRule} onClick={addRule}>＋ Add rule</button></div><div className={styles.ruleEditors}>{form.conditions.length ? form.conditions.map((condition, index) => <div className={styles.ruleEditor} key={String(condition.id ?? index)}><span>{index + 1}</span><div className={styles.ruleEditorGrid}><label>Indicator<select value={condition.kind || "RSI"} onChange={(event) => updateRule(index,{kind:event.target.value})}>{INDICATORS.map((item)=><option key={item}>{item}</option>)}</select></label><label>Length<input type="number" min={1} max={500} value={condition.length ?? 14} onChange={(event)=>updateRule(index,{length:Number(event.target.value)})}/></label><label>Condition<select value={condition.comparator || "Less Than"} onChange={(event)=>updateRule(index,{comparator:event.target.value})}>{COMPARATORS.map((item)=><option key={item}>{item}</option>)}</select></label><label>Signal<input type="number" step="0.01" value={condition.signal ?? 30} onChange={(event)=>updateRule(index,{signal:Number(event.target.value)})}/></label><label>Timeframe<select value={condition.timeframe || "5 minutes"} onChange={(event)=>updateRule(index,{timeframe:event.target.value})}>{TIMEFRAMES.map((item)=><option key={item}>{item}</option>)}</select></label></div><button type="button" className={styles.deleteRule} aria-label={`Delete rule ${index+1}`} onClick={()=>deleteRule(index)}>×</button></div>) : <div className={styles.noRules}>No entry rules: this automation starts immediately when capacity is available.</div>}</div></section>

        <section className={styles.card}><div className={styles.cardTitleRow}><div><h3>TradingView Link</h3><p>One webhook for external entry, exit and position funding.</p></div><span className={styles.mutedAction}>Connect TradingView</span></div><small className={styles.note}>This remains unchanged unless TradingView control is configured separately.</small></section>

        <div className={styles.twoCol}>
          <section className={styles.card}><h3>Capital Plan</h3><div className={styles.formGrid}><label>Initial order<div className={styles.unit}><input type="number" min="0.01" step="0.01" value={form.baseOrder} onChange={(event) => onFormChange({ baseOrder: Number(event.target.value) })}/><b>USDT</b></div></label><label>DCA order size<div className={styles.unit}><input type="number" min="0.01" step="0.01" value={form.safetyOrder} onChange={(event) => onFormChange({ safetyOrder: Number(event.target.value) })}/><b>USDT</b></div></label><label>Maximum DCA orders<input type="number" min="0" max="50" value={form.maxSafetyOrders} onChange={(event) => onFormChange({ maxSafetyOrders: Number(event.target.value) })}/></label><label>Active DCA orders<input type="number" min="0" max={Math.max(0, form.maxSafetyOrders)} value={form.limitSafetyOrders} onChange={(event) => onFormChange({ limitSafetyOrders: Number(event.target.value) })}/></label><label>First DCA trigger<div className={styles.unit}><input type="number" min="0.000001" step="0.01" value={form.deviation} onChange={(event) => onFormChange({ deviation: Number(event.target.value) })}/><b>%</b></div></label><label>Price step multiplier<input type="number" min="0.000001" step="0.01" value={form.stepScale} onChange={(event) => onFormChange({ stepScale: Number(event.target.value) })}/></label><label>Order size multiplier<input type="number" min="0.000001" step="0.01" value={form.volumeScale} onChange={(event) => onFormChange({ volumeScale: Number(event.target.value) })}/></label></div></section>
          <section className={styles.card}><h3>Exit Plan</h3><div className={styles.formGrid}><label>Target profit<div className={styles.unit}><input type="number" min="0" step="0.01" value={form.takeProfit} onChange={(event) => onFormChange({ takeProfit: Number(event.target.value) })}/><b>%</b></div></label><label>Sell allocation<input value="100%" disabled/></label><label>Trailing take profit<select value={form.trailingPct > 0 ? "On" : "Off"} onChange={(event)=>onFormChange({trailingPct:event.target.value==="On"?Math.max(.01,form.trailingPct||.2):0})}><option>Off</option><option>On</option></select></label><label>Trailing deviation<div className={styles.unit}><input type="number" min="0.01" step="0.01" disabled={form.trailingPct<=0} value={form.trailingPct || .2} onChange={(event)=>onFormChange({trailingPct:Number(event.target.value)})}/><b>%</b></div></label><label>Stop loss<select value={form.stopEnabled ? "On" : "Off"} onChange={(event) => onFormChange({ stopEnabled: event.target.value === "On" })}><option>Off</option><option>On</option></select></label><label>Stop loss distance<div className={styles.unit}><input type="number" min="0" step="0.01" disabled={!form.stopEnabled} value={form.stopPct} onChange={(event) => onFormChange({ stopPct: Number(event.target.value) })}/><b>%</b></div></label><label>Stop loss timeout<select value={form.stopLossTimeoutSeconds>0?"Timeout":"Immediate"} disabled={!form.stopEnabled} onChange={(event)=>onFormChange({stopLossTimeoutSeconds:event.target.value==="Timeout"?Math.max(1,form.stopLossTimeoutSeconds||300):0})}><option>Immediate</option><option>Timeout</option></select></label><label>Timeout duration<div className={styles.unit}><input type="number" min="1" step="1" disabled={!form.stopEnabled||form.stopLossTimeoutSeconds<=0} value={form.stopLossTimeoutSeconds || 300} onChange={(event)=>onFormChange({stopLossTimeoutSeconds:Number(event.target.value)})}/><b>sec</b></div></label></div></section>
        </div>

        <section className={styles.strategyMap}><h3>Strategy Map</h3><p>See how capital and recovery change across the full DCA path.</p><div><article><span>Capital / position</span><strong>{money(form.baseOrder)}</strong></article><article><span>Maximum bot capital</span><strong>{money((form.baseOrder + Array.from({length:Math.max(0,form.maxSafetyOrders)}).reduce((sum,_,i)=>sum+form.safetyOrder*Math.pow(Math.max(.000001,form.volumeScale),i),0))*Math.max(1,form.maxActiveTrades))}</strong></article><article><span>DCA coverage</span><strong>{form.maxSafetyOrders} orders</strong></article><article><span>Recovery target</span><strong>+{form.takeProfit.toFixed(2)}%</strong></article></div></section>

        <div className={styles.saveBar}><button type="button" onClick={onClose} disabled={busy}>Cancel</button><button className={styles.primary} disabled={busy}>{busy ? "Saving…" : "Save changes"}</button></div>
      </form>}
    </section>
  </div>;
}
