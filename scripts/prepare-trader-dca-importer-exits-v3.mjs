import fs from "node:fs";
import path from "node:path";

const target = path.join(process.cwd(), "app", "trader", "DcaConfigImporter.tsx");
if (!fs.existsSync(target)) throw new Error("DCA importer target missing for exit parser");
let source = fs.readFileSync(target, "utf8");

const marker = "DCA_IMPORT_EXITS_V3";
if (!source.includes(marker)) {
  const typeBefore = `  takeProfit?: number;\n  stopEnabled?: boolean;\n  stopPct?: number;`;
  const typeAfter = `  takeProfit?: number;\n  takeProfitTargets?: Array<{ profitPct: number; allocationPct: number }>;\n  stopEnabled?: boolean;\n  stopPct?: number;\n  stopLossTimeoutSeconds?: number;`;
  if (!source.includes(typeBefore)) throw new Error("DCA importer exit patch type anchor missing");
  source = source.replace(typeBefore, typeAfter);

  const labelsBefore = `  takeProfit: [/^take\\s+profit(?:\\s+(?:percentage|target))?\\b/i, /^target\\s+profit\\b/i],\n  stopLoss: [/^stop\\s+loss(?:\\s+(?:percentage|distance))?\\b/i],`;
  const labelsAfter = `  takeProfit: [\n    /^take\\s+profit(?:\\s*(?:\\(\\s*%\\s*\\)|%|percentage|target))?\\s*(?=[:=,–—-]|\\d|$)/i,\n    /^target\\s+profit(?:\\s*(?:\\(\\s*%\\s*\\)|%|percentage))?\\s*(?=[:=,–—-]|\\d|$)/i,\n    /^tp(?:\\s*1)?(?:\\s*(?:\\(\\s*%\\s*\\)|%|target))?\\s*(?=[:=,–—-]|\\d|$)/i,\n  ],\n  stopLoss: [\n    /^stop\\s+loss(?:\\s*(?:\\(\\s*%\\s*\\)|%|percentage|distance))?\\s*(?=[:=,–—-]|\\d|off|disabled|none|false|on|enabled|$)/i,\n    /^sl(?:\\s*(?:\\(\\s*%\\s*\\)|%|distance))?\\s*(?=[:=,–—-]|\\d|off|disabled|none|false|on|enabled|$)/i,\n  ],\n  stopLossTimeout: [\n    /^stop\\s+loss\\s+timeout(?:\\s*(?:duration|in\\s+seconds?|seconds?|secs?|sec))?\\s*(?=[:=,–—-]|\\d|on|off|enabled|disabled|true|false|immediate|$)/i,\n    /^sl\\s+timeout(?:\\s*(?:duration|in\\s+seconds?|seconds?|secs?|sec))?\\s*(?=[:=,–—-]|\\d|on|off|enabled|disabled|true|false|immediate|$)/i,\n    /^timeout\\s+duration\\s*(?=[:=,–—-]|\\d|$)/i,\n  ],`;
  if (!source.includes(labelsBefore)) throw new Error("DCA importer exit label anchor missing");
  source = source.replace(labelsBefore, labelsAfter);

  const helperAnchor = `function clampInt(value: number, min: number, max: number) {`;
  if (!source.includes(helperAnchor)) throw new Error("DCA importer exit helper anchor missing");
  const helpers = `// ${marker}\nfunction durationSeconds(raw: string) {\n  const value = firstNumber(raw);\n  if (value === null) return null;\n  const magnitude = Math.abs(value);\n  const factor = /\\b(?:hours?|hrs?)\\b/i.test(raw) ? 3600 : /\\b(?:minutes?|mins?)\\b/i.test(raw) ? 60 : 1;\n  return Math.max(0, Math.min(86400, Math.round(magnitude * factor)));\n}\nfunction stopLossTimeoutFrom(lines: string[], patterns: RegExp[]) {\n  let enabledSeen = false;\n  for (let index = 0; index < lines.length; index += 1) {\n    for (const pattern of patterns) {\n      const match = lines[index].match(pattern);\n      if (!match) continue;\n      const sameLine = lines[index].slice(match[0].length).replace(/^[\\s:=,–—-]+/, \"\").trim();\n      const candidates = [sameLine, lines[index + 1] || \"\", lines[index + 2] || \"\"].filter(Boolean);\n      for (const candidate of candidates) {\n        if (/\\b(?:off|disabled|false|none|immediate|no)\\b/i.test(candidate)) return 0;\n        if (/\\b(?:on|enabled|true|yes)\\b/i.test(candidate)) { enabledSeen = true; continue; }\n        const seconds = durationSeconds(candidate);\n        if (seconds !== null) return seconds;\n      }\n    }\n  }\n  return enabledSeen ? 30 : null;\n}\n`;
  source = source.replace(helperAnchor, helpers + helperAnchor);

  const parseBefore = `  const takeProfit=numberAfterLabel(lines,LABELS.takeProfit); if(takeProfit!==null&&takeProfit>0)add("takeProfit","Take profit",clampNumber(Math.abs(takeProfit),.1,99),\`${'${Math.abs(takeProfit)}'}%\`);\n  const stopRaw=valueAfterLabel(lines,LABELS.stopLoss);\n  if(stopRaw){\n    if(/off|disabled|none|false/i.test(stopRaw)){patch.stopEnabled=false;rows.push({label:"Stop loss",value:"Off"});}\n    else {const stop=firstNumber(stopRaw);if(stop!==null&&Math.abs(stop)>0){patch.stopEnabled=true;patch.stopPct=clampNumber(Math.abs(stop),.1,99);rows.push({label:"Stop loss",value:\`${'${Math.abs(stop)}'}%\`});}}\n  }`;
  const parseAfter = `  const takeProfit=numberAfterLabel(lines,LABELS.takeProfit);\n  if(takeProfit!==null&&takeProfit>0){\n    const normalizedTp=clampNumber(Math.abs(takeProfit),.1,99);\n    patch.takeProfit=normalizedTp;\n    patch.takeProfitTargets=[{profitPct:normalizedTp,allocationPct:100}];\n    rows.push({label:"Take profit",value:normalizedTp+"%"});\n  }\n  const stopRaw=valueAfterLabel(lines,LABELS.stopLoss);\n  if(stopRaw){\n    if(/off|disabled|none|false/i.test(stopRaw)){patch.stopEnabled=false;rows.push({label:"Stop loss",value:"Off"});}\n    else {const stop=firstNumber(stopRaw);if(stop!==null&&Math.abs(stop)>0){patch.stopEnabled=true;patch.stopPct=clampNumber(Math.abs(stop),.1,99);rows.push({label:"Stop loss",value:Math.abs(stop)+"%"});}}\n  }\n  const stopLossTimeout=stopLossTimeoutFrom(lines,LABELS.stopLossTimeout);\n  if(stopLossTimeout!==null){\n    patch.stopLossTimeoutSeconds=stopLossTimeout;\n    rows.push({label:"Stop loss timeout",value:stopLossTimeout>0?stopLossTimeout+" sec":"Immediate"});\n  }`;
  if (!source.includes(parseBefore)) throw new Error("DCA importer exit parse anchor missing");
  source = source.replace(parseBefore, parseAfter);
}

for (const required of [
  marker,
  "takeProfitTargets?:",
  "stopLossTimeoutSeconds?:",
  "stopLossTimeoutFrom",
  "LABELS.stopLossTimeout",
  'patch.takeProfitTargets=[{profitPct:normalizedTp,allocationPct:100}]',
]) if (!source.includes(required)) throw new Error(`DCA importer exit output missing ${required}`);

fs.writeFileSync(target, source);
console.log("Prepared reliable Take Profit and Stop Loss timeout import parsing.");
