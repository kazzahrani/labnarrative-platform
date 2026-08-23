import fs from "node:fs";
import path from "node:path";

const traderPath = path.join(process.cwd(), "app/trader/TradingAgent.tsx");
let source = fs.readFileSync(traderPath, "utf8");

const required = (before, after, label) => {
  if (!source.includes(before)) throw new Error(`DCA functional V1: missing ${label}`);
  source = source.replace(before, after);
};

// -----------------------------------------------------------------------------
// DCA FUNCTIONAL V1
// Long-only first version. Every visible configuration choice below has execution
// semantics in the paper engine; decorative/unsupported choices are removed.
// -----------------------------------------------------------------------------

// Persist bot-level execution settings that were previously only visible in the UI.
if (!source.includes("  averagingEnabled?: boolean;")) {
  required(
    '  orderType?: "Market" | "Limit";\n  status: "Running" | "Stopped";',
    '  orderType?: "Market" | "Limit";\n  averagingEnabled?: boolean;\n  trailingPct?: number;\n  maxHoldEnabled?: boolean;\n  maxHoldHours?: number;\n  pendingLimitEntries?: Record<string, { price: number; createdAt: string }>;\n  status: "Running" | "Stopped";',
    "DcaBot execution fields anchor"
  );
}

// Builder state for a real maximum-hold setting. dcaTrailing=0 means disabled.
if (!source.includes("const [maxHoldValue, setMaxHoldValue]")) {
  required(
    '  const [maxHoldEnabled, setMaxHoldEnabled] = useState(false);',
    '  const [maxHoldEnabled, setMaxHoldEnabled] = useState(false);\n  const [maxHoldValue, setMaxHoldValue] = useState(7);\n  const [maxHoldUnit, setMaxHoldUnit] = useState<"Hours" | "Days">("Days");',
    "maximum hold state"
  );
}

// Long-only product: keep the internal state for compatibility with older transforms,
// but remove the Long/Short selector and always save Long.
source = source.replace(
  /\s*<label><span>Direction ⓘ<\/span><div className=\{styles\.dcaSegment\}><button className=\{dcaDirection === "Long" \? styles\.dcaSegmentActive : ""\} onClick=\{\(\) => setDcaDirection\("Long"\)\}>Long<\/button><button className=\{dcaDirection === "Short" \? styles\.dcaSegmentActive : ""\} onClick=\{\(\) => setDcaDirection\("Short"\)\}>Short<\/button><\/div><\/label>/,
  ""
);
source = source.replaceAll('setDcaDirection(bot.direction ?? "Long");', 'setDcaDirection("Long");');
source = source.replaceAll('direction: dcaDirection,', 'direction: "Long",');

// The old condition editor was declared inside TradingAgent and then mounted as a
// component. Every keystroke recreated its component identity and remounted the input.
// Call it as a render helper instead so controlled fields retain focus and selection.
const oldConditionMount = '{dcaConditions.map((condition, index) => <DcaConditionEditor key={condition.id} condition={condition} index={index}/>)}';
const stableConditionMount = '{dcaConditions.map((condition, index) => <div key={condition.id}>{DcaConditionEditor({ condition, index })}</div>)}';
if (source.includes(oldConditionMount)) source = source.replace(oldConditionMount, stableConditionMount);
if (!source.includes(stableConditionMount)) throw new Error("DCA functional V1: stable condition rendering was not installed.");

// Only show indicators the local paper engine can calculate from Binance OHLCV.
source = source.replace(
  '    const indicators = ["QFL (only long signals)", "CQS Scalping", "TradingView custom signal", "TradingView Crypto Screener", "Ultimate Oscillator", "Bollinger Bands %B", "Moving Average (MA)", "Average Directional Index", "Stochastic", "MACD", "Parabolic SAR", "Money Flow Index", "Commodity Channel Index", "Heikin Ashi", "RSI"];',
  '    const indicators = ["RSI", "Stochastic", "MACD", "Moving Average (MA)", "Average Directional Index", "Bollinger Bands %B", "Money Flow Index", "Commodity Channel Index", "Ultimate Oscillator", "Parabolic SAR", "Heikin Ashi"];'
);

// Parabolic SAR is long-entry only in this long-only product.
source = source.replace('<option>Crossing (Long)</option><option>Crossing (Short)</option>', '<option>Crossing (Long)</option>');

// Remove non-executable/fake configuration choices from the first version.
source = source.replace(
  '<div className={styles.dcaSegment}><button className={averagingMode === "Dollar-cost averaging" ? styles.dcaSegmentActive : ""} onClick={() => setAveragingMode("Dollar-cost averaging")}>Dollar-cost averaging</button><button className={averagingMode === "Price ladder" ? styles.dcaSegmentActive : ""} onClick={() => setAveragingMode("Price ladder")}>Price ladder</button></div>',
  '<div className={styles.dcaFakeSelect}>Dollar-cost averaging</div>'
);
source = source.replace(/\s*<div className=\{styles\.dcaToggleHead\}><strong>⌁ Averaging orders condition ⓘ<\/strong><Toggle checked=\{averagingConditionEnabled\} onChange=\{setAveragingConditionEnabled\}\/><span>RSI, QFL, MACD, etc\.<\/span><\/div>/, "");
source = source.replace(
  '<div className={styles.dcaSegment}><button className={styles.dcaSegmentActive}>Price change, %</button><button>⌁ Conditions</button></div>',
  ''
);
source = source.replace(
  '<label className={styles.dcaFullLabel}><span>Take profit type ⓘ</span><select><option>Percentage from average price</option><option>Percentage from base order</option></select></label>',
  '<label className={styles.dcaFullLabel}><span>Take profit type</span><div className={styles.dcaFakeSelect}>Percentage from average price</div></label>'
);
source = source.replace(/\s*<button className=\{styles\.dcaAddTarget\}>＋ Add additional target profit step \(1\/4\)<\/button>/, "");
source = source.replace(
  '<div className={styles.dcaTwoCol}><label><span>Reinvest Profit ⓘ</span><div className={styles.inputUnit}><input type="number" value={reinvestProfit} onChange={(e) => setReinvestProfit(clamp(Number(e.target.value), 0, 100))}/><b>%</b></div></label><label><span>Trailing ⓘ</span><div className={styles.inputUnit}><input type="number" value={dcaTrailing} onChange={(e) => setDcaTrailing(Math.max(0, Number(e.target.value)))}/><b>%</b></div></label></div>',
  '<label className={styles.dcaFullLabel}><span>Trailing Take Profit deviation, % <small>0 = off</small></span><div className={styles.inputUnit}><input type="number" min={0} max={99.99} step="0.1" value={dcaTrailing} onChange={(e) => setDcaTrailing(Math.max(0, Number(e.target.value)))}/><b>%</b></div></label>'
);
source = source.replace(
  '{botStopEnabled && <div className={styles.dcaTwoCol}><label><span>Stop loss</span><div className={styles.inputUnit}><input type="number" value={botStopPct} onChange={(e) => setBotStopPct(Math.max(0, Number(e.target.value)))}/><b>%</b></div></label><label><span>Action</span><select><option>Close deal</option><option>Close and stop bot</option></select></label></div>}',
  '{botStopEnabled && <div className={styles.dcaTwoCol}><label><span>Stop loss</span><div className={styles.inputUnit}><input type="number" min={0.01} max={99.99} step="0.1" value={botStopPct} onChange={(e) => setBotStopPct(Math.max(0, Number(e.target.value)))}/><b>%</b></div></label><label><span>Action</span><div className={styles.dcaFakeSelect}>Close deal</div></label></div>}'
);
source = source.replace(
  '{maxHoldEnabled && <div className={styles.dcaTwoCol}><label><span>Maximum hold period</span><input type="number" defaultValue={7}/></label><label><span>Unit</span><select><option>Days</option><option>Hours</option></select></label></div>}',
  '{maxHoldEnabled && <div className={styles.dcaTwoCol}><label><span>Maximum hold period</span><input type="number" min={0.01} step="0.25" value={maxHoldValue} onChange={(e) => setMaxHoldValue(Math.max(0.01, Number(e.target.value) || 0.01))}/></label><label><span>Unit</span><select value={maxHoldUnit} onChange={(e) => setMaxHoldUnit(e.target.value as "Hours" | "Days")}><option>Hours</option><option>Days</option></select></label></div>}'
);

// Remove the old duplicate Advanced section; max-active-trades is already a real field
// in Main and cooldown was decorative.
source = source.replace(/\n\s*<section className=\{styles\.dcaSection\}>\n\s*<button className=\{styles\.dcaAdvancedToggle\}[\s\S]*?\n\s*<\/section>\n\s*<\/div>\n\n\s*<aside className=\{styles\.dcaSummaryCard\}>/, '\n        </div>\n\n        <aside className={styles.dcaSummaryCard}>');

// Remove the fake backtest accordion from the summary for now.
source = source.replace(/\s*<button className=\{styles\.dcaBacktest\}[\s\S]*?<\/button>/, "");

// Restore real settings when editing/copying a bot.
const loadAnchor = '    setBotStopPct(bot.stopPct);';
if (source.includes(loadAnchor) && !source.includes('setAveragingEnabled(bot.averagingEnabled !== false);')) {
  source = source.replace(loadAnchor, [
    loadAnchor,
    '    setAveragingEnabled(bot.averagingEnabled !== false);',
    '    setDcaTrailing(Math.max(0, bot.trailingPct ?? 0));',
    '    setMaxHoldEnabled(Boolean(bot.maxHoldEnabled));',
    '    const storedHoldHours = Math.max(0.01, bot.maxHoldHours ?? 24);',
    '    const useDays = storedHoldHours >= 24 && Math.abs(storedHoldHours / 24 - Math.round(storedHoldHours / 24)) < 1e-9;',
    '    setMaxHoldUnit(useDays ? "Days" : "Hours");',
    '    setMaxHoldValue(useDays ? storedHoldHours / 24 : storedHoldHours);',
  ].join("\n"));
}

// Persist the now-functional builder settings on both new and edited bots.
const creatorStart = source.indexOf('  const createConfiguredDcaBot = () => {');
const creatorEnd = source.indexOf('  const handleGlobalSearch = (value: string) => {', creatorStart);
if (creatorStart < 0 || creatorEnd <= creatorStart) throw new Error("DCA functional V1: configured bot creator not found.");
let creator = source.slice(creatorStart, creatorEnd);
if (!creator.includes('DCA_FUNCTIONAL_V1_VALIDATION')) {
  creator = creator.replace('  const createConfiguredDcaBot = () => {', [
    '  const createConfiguredDcaBot = () => {',
    '    // DCA_FUNCTIONAL_V1_VALIDATION',
    '    if (dcaTrailing < 0 || dcaTrailing >= 100) { setNotice("Trailing Take Profit deviation must be between 0% and 100%."); return; }',
    '    if (maxHoldEnabled && (!Number.isFinite(maxHoldValue) || maxHoldValue <= 0)) { setNotice("Maximum hold period must be greater than 0."); return; }',
    '    const supportedDcaKinds = new Set(["RSI", "Stochastic", "MACD", "Moving Average (MA)", "Average Directional Index", "Bollinger Bands %B", "Money Flow Index", "Commodity Channel Index", "Ultimate Oscillator", "Parabolic SAR", "Heikin Ashi"]);',
    '    const unsupportedCondition = dcaConditions.find((condition) => !supportedDcaKinds.has(condition.kind));',
    '    if (unsupportedCondition) { setNotice(`${unsupportedCondition.kind} is not enabled in the real paper engine yet. Choose a supported condition.`); return; }',
  ].join("\n"));
}
creator = creator.replaceAll(
  '        stopPct: botStopPct,\n        startCondition:',
  '        stopPct: botStopPct,\n        averagingEnabled,\n        trailingPct: dcaTrailing,\n        maxHoldEnabled,\n        maxHoldHours: maxHoldEnabled ? maxHoldValue * (maxHoldUnit === "Days" ? 24 : 1) : undefined,\n        pendingLimitEntries: {},\n        startCondition:'
);
creator = creator.replaceAll('direction: dcaDirection,', 'direction: "Long",');
creator = creator.replaceAll('direction: "Long",\n        orderType: dcaOrderType,', 'direction: "Long",\n        orderType: dcaOrderType,');

// Immediate Market bots open now. Immediate Limit bots place real pending buy-limit
// entries at the current live mark and wait for market <= limit before becoming trades.
const immediateStart = creator.indexOf('    if (!savedConditions.length) {');
const immediateEnd = immediateStart >= 0 ? creator.indexOf('    setSelectedBotId(bot.id);', immediateStart) : -1;
if (immediateStart >= 0 && immediateEnd > immediateStart) {
  const immediateBlock = [
    '    if (!savedConditions.length && dcaOrderType === "Market") {',
    '      const now = new Date().toISOString();',
    '      const immediateTrades: DcaTrade[] = chosenPairs.slice(0, maxActiveTrades).flatMap((pair, index) => {',
    '        const symbol = pair.split("/")[0];',
    '        const price = markets.find((market) => market.symbol === symbol)?.price ?? 0;',
    '        if (!price || price <= 0) return [];',
    '        const maxAveraging = averagingEnabled ? bot.maxSafetyOrders : 0;',
    '        const quantity = bot.baseOrder / price;',
    '        return [{',
    '          id: "deal-" + Date.now() + "-" + index + "-" + bot.id, botId: bot.id, botName: bot.name, pair,',
    '          entryPrice: price, averagePrice: price, quantity, invested: bot.baseOrder, averagingFilled: 0,',
    '          maxAveraging, activeOrdersLimit: maxAveraging ? Math.max(1, Math.min(maxAveraging, bot.limitSafetyOrders ?? maxAveraging)) : 0,',
    '          takeProfitPct: bot.takeProfit, trailingEnabled: (bot.trailingPct ?? 0) > 0, trailingDeviationPct: bot.trailingPct ?? 0.2,',
    '          stopEnabledOverride: bot.stopEnabled, stopPctOverride: bot.stopPct, maxHoldEnabled: bot.maxHoldEnabled, maxHoldHours: bot.maxHoldHours,',
    '          status: "Active", createdAt: now, lastPrice: price, fills: [{ kind: "Base" as const, price, amount: bot.baseOrder, quantity, at: now }],',
    '        }];',
    '      });',
    '      if (immediateTrades.length) setDcaTrades((current) => [...immediateTrades, ...current]);',
    '    }',
    '    if (!savedConditions.length && dcaOrderType === "Limit") {',
    '      const now = new Date().toISOString();',
    '      const pendingLimitEntries = Object.fromEntries(chosenPairs.slice(0, maxActiveTrades).map((pair) => {',
    '        const symbol = pair.split("/")[0];',
    '        const price = markets.find((market) => market.symbol === symbol)?.price ?? 0;',
    '        return [pair, { price, createdAt: now }];',
    '      }).filter(([, order]) => order.price > 0));',
    '      setDcaBots((items) => items.map((item) => item.id === bot.id ? { ...item, pendingLimitEntries } : item));',
    '    }',
    '',
  ].join("\n");
  creator = creator.slice(0, immediateStart) + immediateBlock + creator.slice(immediateEnd);
}
source = source.slice(0, creatorStart) + creator + source.slice(creatorEnd);

// Stopping a bot cancels pending base-entry limit orders while leaving live deals managed.
source = source.replace(
  'setDcaBots((items) => items.map((bot) => bot.id === botId ? { ...bot, status } : bot));',
  'setDcaBots((items) => items.map((bot) => bot.id === botId ? { ...bot, status, pendingLimitEntries: status === "Stopped" ? {} : bot.pendingLimitEntries } : bot));'
);

// Fully-functional technical-condition evaluator using closed Binance candles.
const evaluatorStart = source.indexOf('  const evaluateDcaCondition = async (bot: DcaBot, pair: string, condition: NonNullable<DcaBot["conditions"]>[number]) => {');
const evaluatorEnd = evaluatorStart >= 0 ? source.indexOf('\n  useEffect(() => {', evaluatorStart) : -1;
if (evaluatorStart < 0 || evaluatorEnd <= evaluatorStart) throw new Error("DCA functional V1: multi-pair condition evaluator not found.");
const evaluator = String.raw`  const evaluateDcaCondition = async (bot: DcaBot, pair: string, condition: NonNullable<DcaBot["conditions"]>[number]) => {
    const symbol = pair.replace("/", "");
    const interval = dcaTimeframeInterval(condition.timeframe);
    const response = await fetch("/api/trader/klines?symbol=" + encodeURIComponent(symbol) + "&interval=" + encodeURIComponent(interval) + "&limit=260", { cache: "no-store" });
    if (!response.ok) return { ok: false, price: 0, value: null as number | null };
    const data = await response.json() as { candles?: Array<{ open: number; high: number; low: number; close: number; volume: number; closeTime: number }> };
    const candles = (data.candles ?? []).filter((candle) => candle.closeTime < Date.now() && [candle.open, candle.high, candle.low, candle.close].every(Number.isFinite));
    const livePrice = data.candles?.at(-1)?.close ?? candles.at(-1)?.close ?? 0;
    if (candles.length < 4) return { ok: false, price: livePrice, value: null as number | null };
    const closes = candles.map((candle) => candle.close);
    const highs = candles.map((candle) => candle.high);
    const lows = candles.map((candle) => candle.low);
    const volumes = candles.map((candle) => Math.max(0, candle.volume));
    const lastTwo = (values: Array<number | null>) => {
      const valid = values.filter((value): value is number => value != null && Number.isFinite(value));
      return { current: valid.at(-1) ?? null, previous: valid.length > 1 ? valid.at(-2) ?? null : null };
    };
    const smaSeries = (values: number[], period: number) => {
      const p = Math.max(1, Math.round(period));
      return values.map((_, index) => index + 1 < p ? null : values.slice(index - p + 1, index + 1).reduce((sum, value) => sum + value, 0) / p);
    };
    const emaSeries = (values: number[], period: number) => {
      const p = Math.max(1, Math.round(period));
      const alpha = 2 / (p + 1);
      let ema: number | null = null;
      return values.map((value, index) => {
        if (ema == null) {
          if (index + 1 < p) return null;
          ema = values.slice(index - p + 1, index + 1).reduce((sum, item) => sum + item, 0) / p;
          return ema;
        }
        ema = value * alpha + ema * (1 - alpha);
        return ema;
      });
    };
    const wmaSeries = (values: number[], period: number) => {
      const p = Math.max(1, Math.round(period));
      const denominator = p * (p + 1) / 2;
      return values.map((_, index) => {
        if (index + 1 < p) return null;
        let sum = 0;
        for (let offset = 0; offset < p; offset += 1) sum += values[index - p + 1 + offset] * (offset + 1);
        return sum / denominator;
      });
    };
    const compare = (previous: number | null, current: number, comparator: string, signal: number) => compareSignal(previous, current, comparator, signal);

    if (condition.kind === "RSI") {
      const values = calculateRsiSeries(closes, condition.length);
      const current = values.at(-1) ?? null;
      const previous = values.length > 1 ? values.at(-2) ?? null : null;
      return { ok: current != null && compare(previous, current, condition.comparator, condition.signal), price: livePrice, value: current };
    }

    if (condition.kind === "Moving Average (MA)") {
      const ma = condition.aux1 === 1 ? emaSeries : condition.aux1 === 2 ? wmaSeries : smaSeries;
      const fast = ma(closes, condition.aux2);
      const slow = ma(closes, condition.aux3);
      const currentFast = fast.at(-1); const previousFast = fast.at(-2);
      const currentSlow = slow.at(-1); const previousSlow = slow.at(-2);
      if (currentFast == null || previousFast == null || currentSlow == null || previousSlow == null) return { ok: false, price: livePrice, value: null };
      const ok = condition.comparator === "Crossing Down" ? previousFast >= previousSlow && currentFast < currentSlow : previousFast <= previousSlow && currentFast > currentSlow;
      return { ok, price: livePrice, value: currentFast - currentSlow };
    }

    if (condition.kind === "Stochastic") {
      const kLength = Math.max(1, Math.round(condition.aux1));
      const rawK = closes.map((close, index) => {
        if (index + 1 < kLength) return null;
        const windowHigh = Math.max(...highs.slice(index - kLength + 1, index + 1));
        const windowLow = Math.min(...lows.slice(index - kLength + 1, index + 1));
        return windowHigh === windowLow ? 50 : (close - windowLow) / (windowHigh - windowLow) * 100;
      });
      const smooth = (values: Array<number | null>, period: number) => {
        const p = Math.max(1, Math.round(period));
        return values.map((_, index) => {
          const window = values.slice(Math.max(0, index - p + 1), index + 1).filter((value): value is number => value != null);
          return window.length === p ? window.reduce((sum, value) => sum + value, 0) / p : null;
        });
      };
      const k = smooth(rawK, condition.aux2);
      const d = smooth(k, condition.aux3);
      const currentK = k.at(-1); const previousK = k.at(-2); const currentD = d.at(-1); const previousD = d.at(-2);
      if (currentK == null || previousK == null || currentD == null || previousD == null) return { ok: false, price: livePrice, value: null };
      const thresholdOk = compare(previousK, currentK, condition.comparator, condition.signal);
      const crossDown = condition.length === 1;
      const crossOk = crossDown ? previousK >= previousD && currentK < currentD : previousK <= previousD && currentK > currentD;
      return { ok: thresholdOk && crossOk, price: livePrice, value: currentK };
    }

    if (condition.kind === "MACD") {
      const fast = emaSeries(closes, condition.aux1);
      const slow = emaSeries(closes, condition.aux2);
      const macd = closes.map((_, index) => fast[index] == null || slow[index] == null ? null : (fast[index] as number) - (slow[index] as number));
      const compactMacd = macd.filter((value): value is number => value != null);
      const signalCompact = emaSeries(compactMacd, condition.aux3);
      const signal: Array<number | null> = Array(Math.max(0, macd.length - compactMacd.length)).fill(null).concat(signalCompact);
      const m0 = macd.at(-1), m1 = macd.at(-2), s0 = signal.at(-1), s1 = signal.at(-2);
      if (m0 == null || m1 == null || s0 == null || s1 == null) return { ok: false, price: livePrice, value: null };
      const crossOk = condition.comparator === "Crossing Down" ? m1 >= s1 && m0 < s0 : m1 <= s1 && m0 > s0;
      const lineOk = condition.length === 1 ? m0 > 0 : m0 < 0;
      return { ok: crossOk && lineOk, price: livePrice, value: m0 };
    }

    if (condition.kind === "Bollinger Bands %B") {
      const period = Math.max(2, Math.round(condition.length));
      const values = closes.map((close, index) => {
        if (index + 1 < period) return null;
        const window = closes.slice(index - period + 1, index + 1);
        const mean = window.reduce((sum, value) => sum + value, 0) / period;
        const variance = window.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / period;
        const sd = Math.sqrt(variance);
        const upper = mean + Math.max(0.000001, condition.aux1) * sd;
        const lower = mean - Math.max(0.000001, condition.aux1) * sd;
        return upper === lower ? 0.5 : (close - lower) / (upper - lower);
      });
      const { current, previous } = lastTwo(values);
      return { ok: current != null && compare(previous, current, condition.comparator, condition.signal), price: livePrice, value: current };
    }

    if (condition.kind === "Money Flow Index") {
      const period = Math.max(1, Math.round(condition.length));
      const typical = candles.map((candle) => (candle.high + candle.low + candle.close) / 3);
      const values = typical.map((tp, index) => {
        if (index < period) return null;
        let positive = 0; let negative = 0;
        for (let i = index - period + 1; i <= index; i += 1) {
          const flow = typical[i] * volumes[i];
          if (typical[i] >= typical[i - 1]) positive += flow; else negative += flow;
        }
        if (negative === 0) return 100;
        return 100 - (100 / (1 + positive / negative));
      });
      const { current, previous } = lastTwo(values);
      return { ok: current != null && compare(previous, current, condition.comparator, condition.signal), price: livePrice, value: current };
    }

    if (condition.kind === "Commodity Channel Index") {
      const period = Math.max(2, Math.round(condition.length));
      const typical = candles.map((candle) => (candle.high + candle.low + candle.close) / 3);
      const values = typical.map((tp, index) => {
        if (index + 1 < period) return null;
        const window = typical.slice(index - period + 1, index + 1);
        const mean = window.reduce((sum, value) => sum + value, 0) / period;
        const deviation = window.reduce((sum, value) => sum + Math.abs(value - mean), 0) / period;
        return deviation === 0 ? 0 : (tp - mean) / (0.015 * deviation);
      });
      const { current, previous } = lastTwo(values);
      return { ok: current != null && compare(previous, current, condition.comparator, condition.signal), price: livePrice, value: current };
    }

    if (condition.kind === "Ultimate Oscillator") {
      const periods = [condition.aux1, condition.aux2, condition.aux3].map((value) => Math.max(1, Math.round(value)));
      const bp = candles.map((candle, index) => index === 0 ? 0 : candle.close - Math.min(candle.low, candles[index - 1].close));
      const tr = candles.map((candle, index) => index === 0 ? Math.max(0.000001, candle.high - candle.low) : Math.max(candle.high, candles[index - 1].close) - Math.min(candle.low, candles[index - 1].close));
      const values = candles.map((_, index) => {
        if (index + 1 < Math.max(...periods)) return null;
        const average = (period: number) => {
          const bpSum = bp.slice(index - period + 1, index + 1).reduce((sum, value) => sum + value, 0);
          const trSum = tr.slice(index - period + 1, index + 1).reduce((sum, value) => sum + value, 0);
          return trSum === 0 ? 0 : bpSum / trSum;
        };
        return 100 * (4 * average(periods[0]) + 2 * average(periods[1]) + average(periods[2])) / 7;
      });
      const { current, previous } = lastTwo(values);
      return { ok: current != null && compare(previous, current, condition.comparator, condition.signal), price: livePrice, value: current };
    }

    if (condition.kind === "Average Directional Index") {
      const period = Math.max(2, Math.round(condition.length));
      const tr: number[] = [0]; const plusDm: number[] = [0]; const minusDm: number[] = [0];
      for (let i = 1; i < candles.length; i += 1) {
        const up = highs[i] - highs[i - 1]; const down = lows[i - 1] - lows[i];
        plusDm.push(up > down && up > 0 ? up : 0); minusDm.push(down > up && down > 0 ? down : 0);
        tr.push(Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1])));
      }
      const dx: Array<number | null> = Array(candles.length).fill(null);
      let smTr = 0, smPlus = 0, smMinus = 0;
      for (let i = 1; i < candles.length; i += 1) {
        if (i <= period) { smTr += tr[i]; smPlus += plusDm[i]; smMinus += minusDm[i]; if (i < period) continue; }
        else { smTr = smTr - smTr / period + tr[i]; smPlus = smPlus - smPlus / period + plusDm[i]; smMinus = smMinus - smMinus / period + minusDm[i]; }
        const plusDi = smTr === 0 ? 0 : 100 * smPlus / smTr; const minusDi = smTr === 0 ? 0 : 100 * smMinus / smTr;
        dx[i] = plusDi + minusDi === 0 ? 0 : 100 * Math.abs(plusDi - minusDi) / (plusDi + minusDi);
      }
      const dxValues = dx.filter((value): value is number => value != null);
      if (dxValues.length < period) return { ok: false, price: livePrice, value: null };
      const adxCompact: number[] = [];
      let adx = dxValues.slice(0, period).reduce((sum, value) => sum + value, 0) / period; adxCompact.push(adx);
      for (let i = period; i < dxValues.length; i += 1) { adx = ((adx * (period - 1)) + dxValues[i]) / period; adxCompact.push(adx); }
      const current = adxCompact.at(-1) ?? null; const previous = adxCompact.at(-2) ?? null;
      return { ok: current != null && compare(previous, current, condition.comparator, condition.signal), price: livePrice, value: current };
    }

    if (condition.kind === "Parabolic SAR") {
      const step = Math.max(0.0001, condition.aux1 / 100);
      const maxStep = Math.max(step, condition.aux2 / 5);
      const psar: number[] = Array(candles.length).fill(0);
      let bullish = closes[1] >= closes[0];
      let sar = bullish ? Math.min(lows[0], lows[1]) : Math.max(highs[0], highs[1]);
      let ep = bullish ? Math.max(highs[0], highs[1]) : Math.min(lows[0], lows[1]);
      let af = step; psar[1] = sar;
      for (let i = 2; i < candles.length; i += 1) {
        sar = sar + af * (ep - sar);
        if (bullish) {
          sar = Math.min(sar, lows[i - 1], lows[i - 2]);
          if (lows[i] < sar) { bullish = false; sar = ep; ep = lows[i]; af = step; }
          else if (highs[i] > ep) { ep = highs[i]; af = Math.min(maxStep, af + step); }
        } else {
          sar = Math.max(sar, highs[i - 1], highs[i - 2]);
          if (highs[i] > sar) { bullish = true; sar = ep; ep = highs[i]; af = step; }
          else if (lows[i] < ep) { ep = lows[i]; af = Math.min(maxStep, af + step); }
        }
        psar[i] = sar;
      }
      const currentSar = psar.at(-1) ?? 0; const previousSar = psar.at(-2) ?? 0;
      const ok = closes.at(-2)! <= previousSar && closes.at(-1)! > currentSar;
      return { ok, price: livePrice, value: currentSar };
    }

    if (condition.kind === "Heikin Ashi") {
      const ha = candles.map((candle, index) => {
        const close = (candle.open + candle.high + candle.low + candle.close) / 4;
        const open = index === 0 ? (candle.open + candle.close) / 2 : 0;
        return { open, close };
      });
      for (let i = 1; i < ha.length; i += 1) ha[i].open = (ha[i - 1].open + ha[i - 1].close) / 2;
      const count = Math.max(1, Math.round(condition.length));
      const recent = ha.slice(-count);
      return { ok: recent.length === count && recent.every((candle) => candle.close > candle.open), price: livePrice, value: recent.at(-1)?.close ?? null };
    }

    return { ok: false, price: livePrice, value: null as number | null };
  };`;
source = source.slice(0, evaluatorStart) + evaluator + source.slice(evaluatorEnd);

// Replace the entry scanner so Market and Limit are genuinely different order types.
const engineMarker = source.indexOf('  // DCA PAPER ENGINE V1');
const scanStart = source.indexOf('  useEffect(() => {', engineMarker);
const manageStart = source.indexOf('  useEffect(() => {\n    let cancelled = false;\n    let busy = false;\n    const manageTrades = async () => {', scanStart);
if (engineMarker < 0 || scanStart < 0 || manageStart <= scanStart) throw new Error("DCA functional V1: scanner boundaries not found.");
const scanner = String.raw`  useEffect(() => {
    let cancelled = false;
    let busy = false;
    const livePriceForPair = async (pair: string) => {
      const symbol = pair.replace("/", "");
      const response = await fetch("/api/trader/klines?symbol=" + encodeURIComponent(symbol) + "&interval=1m&limit=2", { cache: "no-store" });
      if (!response.ok) return dcaMarketsRef.current.find((market) => market.symbol === pair.split("/")[0])?.price ?? 0;
      const data = await response.json() as { candles?: Array<{ close: number }> };
      return data.candles?.at(-1)?.close ?? dcaMarketsRef.current.find((market) => market.symbol === pair.split("/")[0])?.price ?? 0;
    };
    const openBotTrade = (bot: DcaBot, pair: string, fillPrice: number) => {
      if (!(fillPrice > 0)) return false;
      const maxAveraging = bot.averagingEnabled === false ? 0 : bot.maxSafetyOrders;
      const quantity = bot.baseOrder / fillPrice;
      const now = new Date().toISOString();
      const trade: DcaTrade = {
        id: "deal-" + Date.now() + "-" + pair.replace("/", "") + "-" + bot.id,
        botId: bot.id, botName: bot.name, pair, entryPrice: fillPrice, averagePrice: fillPrice, quantity, invested: bot.baseOrder,
        averagingFilled: 0, maxAveraging, activeOrdersLimit: maxAveraging ? Math.max(1, Math.min(maxAveraging, bot.limitSafetyOrders ?? maxAveraging)) : 0,
        takeProfitPct: bot.takeProfit, trailingEnabled: (bot.trailingPct ?? 0) > 0, trailingDeviationPct: bot.trailingPct ?? 0.2,
        stopEnabledOverride: bot.stopEnabled, stopPctOverride: bot.stopPct, maxHoldEnabled: bot.maxHoldEnabled, maxHoldHours: bot.maxHoldHours,
        status: "Active", createdAt: now, lastPrice: fillPrice,
        fills: [{ kind: "Base" as const, price: fillPrice, amount: bot.baseOrder, quantity, at: now }],
      };
      setDcaTrades((items) => items.some((item) => item.botId === bot.id && item.pair === pair && item.status === "Active") ? items : [trade, ...items]);
      return true;
    };
    const evaluateBots = async () => {
      if (busy || cancelled) return;
      busy = true;
      try {
        const activeTrades = dcaTradesRef.current.filter((trade) => trade.status === "Active");
        const activeKeys = new Set(activeTrades.map((trade) => trade.botId + "|" + trade.pair));
        const activeInvested = activeTrades.reduce((sum, trade) => sum + trade.invested, 0);
        const pendingEntryReserve = dcaBots.reduce((sum, bot) => sum + Object.keys(bot.pendingLimitEntries ?? {}).length * bot.baseOrder, 0);
        let availableCapital = Math.max(0, DEMO_BALANCE - activeInvested - pendingEntryReserve);
        for (const bot of dcaBots) {
          if (cancelled || bot.status !== "Running") continue;
          const botMaxActiveTrades = Math.max(1, bot.maxActiveTrades ?? 1);
          let activeForBot = activeTrades.filter((trade) => trade.botId === bot.id).length;
          const pairUniverse = bot.allPairs
            ? dcaMarketsRef.current.map((market) => market.symbol + "/USDT")
            : Array.from(new Set((bot.pairs?.length ? bot.pairs : [bot.pair]).map((pair) => pair.includes("/") ? pair : pair + "/USDT")));
          if (!pairUniverse.length) continue;
          const pending = bot.pendingLimitEntries ?? {};
          const pendingPairs = Object.keys(pending);
          for (const pair of pendingPairs) {
            if (cancelled || activeForBot >= botMaxActiveTrades) break;
            if (activeKeys.has(bot.id + "|" + pair)) continue;
            const livePrice = await livePriceForPair(pair);
            const limitPrice = pending[pair]?.price ?? 0;
            if (!(livePrice > 0) || !(limitPrice > 0) || livePrice > limitPrice || availableCapital < bot.baseOrder) continue;
            const fillPrice = Math.min(livePrice, limitPrice);
            if (openBotTrade(bot, pair, fillPrice)) {
              activeKeys.add(bot.id + "|" + pair); activeForBot += 1; availableCapital -= bot.baseOrder;
              setDcaBots((items) => items.map((item) => {
                if (item.id !== bot.id) return item;
                const nextPending = { ...(item.pendingLimitEntries ?? {}) }; delete nextPending[pair];
                return { ...item, pendingLimitEntries: nextPending };
              }));
            }
          }
          if (activeForBot >= botMaxActiveTrades) continue;
          const pendingCount = Object.keys(bot.pendingLimitEntries ?? {}).length;
          if (activeForBot + pendingCount >= botMaxActiveTrades) continue;
          const batchSize = Math.min(pairUniverse.length, 35);
          const startIndex = pairUniverse.length > batchSize ? dcaScanCursorRef.current % pairUniverse.length : 0;
          const scanPairs = pairUniverse.length <= batchSize ? pairUniverse : Array.from({ length: batchSize }, (_, index) => pairUniverse[(startIndex + index) % pairUniverse.length]);
          if (pairUniverse.length > batchSize) dcaScanCursorRef.current = (startIndex + batchSize) % pairUniverse.length;
          for (const pair of scanPairs) {
            if (activeForBot + Object.keys(bot.pendingLimitEntries ?? {}).length >= botMaxActiveTrades) break;
            if (cancelled || availableCapital < bot.baseOrder) break;
            const key = bot.id + "|" + pair;
            if (activeKeys.has(key) || bot.pendingLimitEntries?.[pair]) continue;
            const conditions = bot.conditions ?? [];
            let shouldOpen = conditions.length === 0 && (!bot.startCondition || bot.startCondition === "Immediately");
            let triggerPrice = dcaMarketsRef.current.find((market) => market.symbol === pair.split("/")[0])?.price ?? 0;
            if (conditions.length > 0) {
              shouldOpen = true;
              for (const condition of conditions) {
                const result = await evaluateDcaCondition(bot, pair, condition);
                if (result.price > 0) triggerPrice = result.price;
                if (!result.ok) { shouldOpen = false; break; }
              }
            }
            if (!shouldOpen || triggerPrice <= 0 || cancelled) continue;
            if ((bot.orderType ?? "Market") === "Limit") {
              const createdAt = new Date().toISOString();
              setDcaBots((items) => items.map((item) => item.id === bot.id ? { ...item, pendingLimitEntries: { ...(item.pendingLimitEntries ?? {}), [pair]: { price: triggerPrice, createdAt } } } : item));
              availableCapital -= bot.baseOrder;
              break;
            }
            if (openBotTrade(bot, pair, triggerPrice)) {
              activeKeys.add(key); activeForBot += 1; availableCapital -= bot.baseOrder;
            }
          }
        }
      } finally { busy = false; }
    };
    void evaluateBots();
    const timer = window.setInterval(() => { void evaluateBots(); }, 4000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [dcaBots]);

`;
source = source.slice(0, scanStart) + scanner + source.slice(manageStart);

// Averaging toggle must change real trade behavior. The manager and reservation helpers
// already respect maxAveraging; newly-created deals now initialize maxAveraging to zero
// when averaging is disabled.
source = source.replaceAll('maxAveraging: bot.maxSafetyOrders, status: "Active"', 'maxAveraging: bot.averagingEnabled === false ? 0 : bot.maxSafetyOrders, status: "Active"');

// Add pending base-order reservation to the unified DCA locked-funds figure if present.
source = source.replace(
  '  const dcaFundsLocked = activeDcaTrades.reduce((sum, trade) => sum + trade.invested, 0) + dcaPendingAveragingReserved;',
  '  const dcaPendingEntryReserved = dcaBots.reduce((sum, bot) => sum + Object.keys(bot.pendingLimitEntries ?? {}).length * bot.baseOrder, 0);\n  const dcaFundsLocked = activeDcaTrades.reduce((sum, trade) => sum + trade.invested, 0) + dcaPendingAveragingReserved + dcaPendingEntryReserved;'
);

// Assertions: do not silently deploy a partially-real configuration UI.
if (source.includes('>Short</button>')) throw new Error("DCA functional V1: Short direction is still visible.");
if (source.includes('⌁ Conditions</button>')) throw new Error("DCA functional V1: Exit Conditions is still visible.");
if (source.includes('>Price ladder</button>')) throw new Error("DCA functional V1: fake Price ladder is still visible.");
if (source.includes('Averaging orders condition ⓘ')) throw new Error("DCA functional V1: fake averaging condition is still visible.");
if (source.includes('Reinvest Profit ⓘ')) throw new Error("DCA functional V1: fake reinvest control is still visible.");
if (!source.includes('pendingLimitEntries?: Record')) throw new Error("DCA functional V1: Limit entry persistence missing.");
if (!source.includes('Trailing Take Profit deviation')) throw new Error("DCA functional V1: real trailing builder control missing.");
if (!source.includes('value={maxHoldValue}')) throw new Error("DCA functional V1: real maximum hold control missing.");
if (!source.includes('condition.kind === "MACD"') || !source.includes('condition.kind === "Parabolic SAR"')) throw new Error("DCA functional V1: real indicator evaluation missing.");

fs.writeFileSync(traderPath, source);
console.log("Prepared long-only, lag-free, executable DCA bot configuration V1.");
