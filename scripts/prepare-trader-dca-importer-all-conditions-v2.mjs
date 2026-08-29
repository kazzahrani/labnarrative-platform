import fs from "node:fs";
import path from "node:path";

const target = path.join(process.cwd(), "app", "trader", "DcaConfigImporter.tsx");
if (!fs.existsSync(target)) throw new Error("DCA importer target missing for all-condition parser");
let source = fs.readFileSync(target, "utf8");

const marker = "DCA_IMPORT_ALL_CONDITIONS_V2";
if (!source.includes(marker)) {
  const start = source.indexOf("function comparatorFrom(line: string) {");
  const end = source.indexOf("function normalizePairToken", start);
  if (start < 0 || end < 0) throw new Error("DCA importer condition parser boundaries missing");

  const block = String.raw`// DCA_IMPORT_ALL_CONDITIONS_V2
function comparatorFrom(line: string) {
  if (/cross(?:ing|es)?\s*(?:\(\s*long\s*\)|long|up|above)/i.test(line)) return "Crossing Up";
  if (/cross(?:ing|es)?\s*(?:\(\s*short\s*\)|short|down|below)/i.test(line)) return "Crossing Down";
  if (/greater\s+than|above|over\b/i.test(line)) return "Greater Than";
  return "Less Than";
}
function signalFrom(line: string, fallback: number) {
  const match = line.match(/(?:less\s+than|below|under|greater\s+than|above|over)\s*[,;:]?\s*[:=]?\s*(-?\d+(?:\.\d+)?)/i);
  return match ? Number(match[1]) : fallback;
}
function conditionNumbers(line: string) {
  const withoutTimeframe = line
    .replace(/\b(?:1|3|5|15|30)\s*minutes?\b/gi, " ")
    .replace(/\b(?:1|2|4|6|8|12)\s*hours?\b/gi, " ")
    .replace(/\b(?:1|3)\s*days?\b/gi, " ")
    .replace(/\b1\s*week\b/gi, " ")
    .replace(/\b1\s*month\b/gi, " ")
    .replace(/(?:^|[\s,;(])(1m|3m|5m|15m|30m|1h|2h|4h|6h|8h|12h|1d|3d|1w)(?=$|[\s,;)])/gi, " ");
  const cleaned = withoutTimeframe
    .replace(/stochastic\s+rsi/gi, " ")
    .replace(/moving\s+average(?:\s*\(\s*ma\s*\))?/gi, " ")
    .replace(/average\s+directional\s+index/gi, " ")
    .replace(/bollinger\s+bands?\s*%?b/gi, " ")
    .replace(/money\s+flow\s+index/gi, " ")
    .replace(/commodity\s+channel\s+index/gi, " ")
    .replace(/ultimate\s+oscillator/gi, " ")
    .replace(/parabolic\s+sar|\bpsar\b/gi, " ")
    .replace(/heikin[\s-]+ashi/gi, " ")
    .replace(/\bstochastic\b|\bmacd\b|\brsi\b|\badx\b|\bmfi\b|\bcci\b/gi, " ")
    .replace(/\b(?:sma|ema|wma)\b/gi, " ")
    .replace(/cross(?:ing|es)?\s*(?:\(\s*(?:long|short)\s*\)|long|short|up|down|above|below)?/gi, " ")
    .replace(/\b(?:less\s+than|greater\s+than|below|under|above|over)\b/gi, " ");
  return (cleaned.match(/-?\d+(?:\.\d+)?/g) || []).map(Number).filter(Number.isFinite);
}
function sarInternalStep(raw: number) {
  const value = Math.abs(raw);
  return Number((value <= 1 ? value * 100 : value).toFixed(8));
}
function sarInternalMax(raw: number) {
  const value = Math.abs(raw);
  return Number((value <= 1 ? value * 5 : value).toFixed(8));
}
function parseConditions(lines: string[]) {
  const conditions: DcaImportedCondition[] = [];
  let unsupportedMentioned = false;
  lines.forEach((line, index) => {
    const id = (prefix: string) => "import-" + prefix + "-" + Date.now() + "-" + index;
    const timeframe = normalizeTimeframe(line);
    const numbers = conditionNumbers(line);

    if (/\bstochastic\s+rsi\b/i.test(line)) { unsupportedMentioned = true; return; }

    if (/heikin[\s-]+ashi/i.test(line)) {
      const candles = clampInt(numbers[0] ?? 2, 1, 100);
      conditions.push({id:id("heikin"),kind:"Heikin Ashi",timeframe,length:candles,comparator:"Greater Than",signal:0,aux1:0,aux2:0,aux3:0});
      return;
    }

    if (/parabolic\s+sar|\bpsar\b/i.test(line)) {
      const namedStep = firstNumber(line.match(/\bstep(?:\s+(?:factor|increment))?\s*[:=]?\s*(-?\d+(?:\.\d+)?)/i)?.[1] || "");
      const namedMax = firstNumber(line.match(/\b(?:max(?:imum)?(?:\s+step)?(?:\s+factor)?|acceleration\s+max)\s*[:=]?\s*(-?\d+(?:\.\d+)?)/i)?.[1] || "");
      const positive = numbers.map(Math.abs).filter(value => value > 0);
      const rawStep = namedStep ?? (positive.length >= 2 ? Math.min(...positive) : positive[0] ?? 0.02);
      const rawMax = namedMax ?? (positive.length >= 2 ? Math.max(...positive) : 0.2);
      conditions.push({id:id("psar"),kind:"Parabolic SAR",timeframe,length:0,comparator:"Crossing Up",signal:0,aux1:sarInternalStep(rawStep),aux2:sarInternalMax(rawMax),aux3:0});
      return;
    }

    if (/ultimate\s+oscillator/i.test(line)) {
      conditions.push({id:id("ultimate"),kind:"Ultimate Oscillator",timeframe,length:0,comparator:comparatorFrom(line),signal:numbers[3] ?? signalFrom(line,30),aux1:clampInt(numbers[0] ?? 7,1,500),aux2:clampInt(numbers[1] ?? 14,1,500),aux3:clampInt(numbers[2] ?? 28,1,500)});
      return;
    }

    if (/commodity\s+channel\s+index|\bcci\b/i.test(line)) {
      conditions.push({id:id("cci"),kind:"Commodity Channel Index",timeframe,length:clampInt(numbers[0] ?? 20,1,500),comparator:comparatorFrom(line),signal:numbers[1] ?? signalFrom(line,-100),aux1:0,aux2:0,aux3:0});
      return;
    }

    if (/money\s+flow\s+index|\bmfi\b/i.test(line)) {
      conditions.push({id:id("mfi"),kind:"Money Flow Index",timeframe,length:clampInt(numbers[0] ?? 14,1,500),comparator:comparatorFrom(line),signal:numbers[1] ?? signalFrom(line,20),aux1:0,aux2:0,aux3:0});
      return;
    }

    if (/bollinger\s+bands?\s*%?b|\bbollinger\s*%b/i.test(line)) {
      conditions.push({id:id("bb"),kind:"Bollinger Bands %B",timeframe,length:clampInt(numbers[0] ?? 20,1,500),comparator:comparatorFrom(line),signal:numbers[2] ?? signalFrom(line,0),aux1:Math.max(0.1,Math.abs(numbers[1] ?? 2)),aux2:0,aux3:0});
      return;
    }

    if (/average\s+directional\s+index|\badx\b/i.test(line)) {
      conditions.push({id:id("adx"),kind:"Average Directional Index",timeframe,length:clampInt(numbers[0] ?? 14,1,500),comparator:comparatorFrom(line),signal:numbers[1] ?? signalFrom(line,25),aux1:0,aux2:0,aux3:0});
      return;
    }

    if (/moving\s+average(?:\s*\(\s*ma\s*\))?|\b(?:sma|ema|wma)\b/i.test(line)) {
      const maType = /\bwma\b/i.test(line) ? 2 : /\bema\b/i.test(line) ? 1 : 0;
      conditions.push({id:id("ma"),kind:"Moving Average (MA)",timeframe,length:0,comparator:comparatorFrom(line),signal:0,aux1:maType,aux2:clampInt(numbers[0] ?? 9,1,1000),aux3:clampInt(numbers[1] ?? 26,1,1000)});
      return;
    }

    if (/\bmacd\b/i.test(line)) {
      conditions.push({id:id("macd"),kind:"MACD",timeframe,length:/below\s+zero/i.test(line)?2:1,comparator:comparatorFrom(line),signal:0,aux1:clampInt(numbers[0] ?? 12,1,500),aux2:clampInt(numbers[1] ?? 26,1,500),aux3:clampInt(numbers[2] ?? 9,1,500)});
      return;
    }

    if (/\bstochastic\b/i.test(line)) {
      const threshold = numbers.length >= 4 ? numbers[3] : signalFrom(line,20);
      conditions.push({id:id("stoch"),kind:"Stochastic",timeframe,length:/\(\s*short\s*\)|cross(?:ing|es)?\s*(?:down|short|below)/i.test(line)?1:2,comparator:/greater\s+than|above|over\b/i.test(line)?"Greater Than":"Less Than",signal:threshold,aux1:clampInt(numbers[0] ?? 14,1,500),aux2:clampInt(numbers[1] ?? 1,1,500),aux3:clampInt(numbers[2] ?? 3,1,500)});
      return;
    }

    if (/\brsi\b/i.test(line)) {
      conditions.push({id:id("rsi"),kind:"RSI",timeframe,length:clampInt(numbers[0] ?? 14,1,500),comparator:comparatorFrom(line),signal:numbers[1] ?? signalFrom(line,30),aux1:0,aux2:0,aux3:0});
      return;
    }

    if (/technical\s+analysis|tradingview\s+signal/i.test(line) && !/immediate|asap/i.test(line)) unsupportedMentioned = true;
  });
  return {conditions, unsupportedMentioned};
}
`;

  source = source.slice(0, start) + block + "\n" + source.slice(end);
}

for (const required of [
  marker,
  'kind:"Heikin Ashi"',
  'kind:"Parabolic SAR"',
  'kind:"Moving Average (MA)"',
  'kind:"Average Directional Index"',
  'kind:"Bollinger Bands %B"',
  'kind:"Money Flow Index"',
  'kind:"Commodity Channel Index"',
  'kind:"Ultimate Oscillator"',
  "Crossing Up",
  "Crossing Down",
  "sarInternalStep",
  "sarInternalMax",
]) if (!source.includes(required)) throw new Error(`DCA importer all-condition output missing ${required}`);

fs.writeFileSync(target, source);
console.log("Prepared DCA importer support for every configured entry-rule type, including Heikin Ashi and Parabolic SAR.");