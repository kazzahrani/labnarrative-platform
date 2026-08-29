import fs from "node:fs";
import path from "node:path";

const target = path.join(process.cwd(), "app", "trader", "DcaConfigImporter.tsx");
if (!fs.existsSync(target)) throw new Error("DCA importer target missing for condition-scope guard");
let source = fs.readFileSync(target, "utf8");

const marker = "DCA_IMPORT_CONDITION_SCOPE_V4";
if (!source.includes(marker)) {
  const parserAnchor = `function parseConditions(lines: string[]) {\n  const conditions: DcaImportedCondition[] = [];\n  let unsupportedMentioned = false;\n  lines.forEach((line, index) => {`;
  const parserReplacement = `function parseConditions(lines: string[]) {\n  const conditions: DcaImportedCondition[] = [];\n  let unsupportedMentioned = false;\n  lines.forEach((line, index) => {\n    // ${marker}: market symbols such as ADX/USDT are never indicator rules.\n    const marketPairTokens = line.match(/\\b[A-Z0-9]{1,15}\\/(?:USDT|USDC|BTC|ETH)\\b/gi) || [];\n    if (marketPairTokens.length && !/(?:trade|deal)\\s+start\\s+condition|entry\\s+conditions?|start\\s+condition/i.test(line)) return;`;
  if (!source.includes(parserAnchor)) throw new Error("DCA importer condition parser anchor missing");
  source = source.replace(parserAnchor, parserReplacement);

  const helperAnchor = `function normalizePairToken(token: string, availableSet: Set<string>) {`;
  if (!source.includes(helperAnchor)) throw new Error("DCA importer condition-scope helper anchor missing");
  const helper = String.raw`
function conditionLinesForImport(text: string, lines: string[]) {
  const indicatorPattern = /\b(?:RSI|Stochastic|MACD|ADX|MFI|CCI|PSAR)\b|Moving\s+Average(?:\s*\(\s*MA\s*\))?|Average\s+Directional\s+Index|Bollinger\s+Bands?\s*%?B|Money\s+Flow\s+Index|Commodity\s+Channel\s+Index|Ultimate\s+Oscillator|Parabolic\s+SAR|Heikin[\s-]+Ashi/gi;
  const labelPattern = /(?:trade|deal)\s+start\s+condition|entry\s+conditions?|start\s+condition/i;
  const splitBlob = (blob: string) => {
    const clean = blob.replace(/^\s*[|:=–—-]+\s*/, "").replace(/\s*\|\s*$/, "").trim();
    const matches = Array.from(clean.matchAll(new RegExp(indicatorPattern.source, "gi")));
    if (!matches.length) return [] as string[];
    return matches.map((match, index) => {
      const start = match.index ?? 0;
      const end = index + 1 < matches.length ? (matches[index + 1].index ?? clean.length) : clean.length;
      return clean.slice(start, end).replace(/^[\s|,;]+|[\s|,;]+$/g, "").trim();
    }).filter(Boolean);
  };

  const explicit: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const label = line.match(labelPattern);
    if (!label) continue;
    const after = line.slice((label.index ?? 0) + label[0].length).replace(/^\s*[|:=–—-]+\s*/, "").replace(/\s*\|\s*$/, "").trim();
    if (after) explicit.push(after);
    else if (lines[index + 1] && !/^\s*\|?\s*(?:Base order|Averaging order|Safety order|Take profit|Target profit|Stop loss|Pairs?|Exchange|Direction)\b/i.test(lines[index + 1])) explicit.push(lines[index + 1]);
  }
  if (explicit.length) return explicit.flatMap(splitBlob);

  // Generic fallback: only lines that actually look like indicator rules; never pair/universe rows.
  const fallback: string[] = [];
  for (const line of lines) {
    const pairTokens = line.match(/\b[A-Z0-9]{1,15}\/(?:USDT|USDC|BTC|ETH)\b/gi) || [];
    if (pairTokens.length) continue;
    if (!new RegExp(indicatorPattern.source, "i").test(line)) continue;
    fallback.push(...splitBlob(line));
  }
  return fallback;
}
`;
  source = source.replace(helperAnchor, helper + "\n" + helperAnchor);

  const callAnchor = `const parsedConditions=parseConditions(lines);`;
  const callReplacement = `const parsedConditions=parseConditions(conditionLinesForImport(text, lines));`;
  if (!source.includes(callAnchor)) throw new Error("DCA importer condition parse-call anchor missing");
  source = source.replace(callAnchor, callReplacement);
}

for (const required of [
  marker,
  "conditionLinesForImport(text, lines)",
  "marketPairTokens",
  "ADX|MFI|CCI|PSAR",
]) if (!source.includes(required)) throw new Error(`DCA importer condition-scope output missing ${required}`);

fs.writeFileSync(target, source);
console.log("Prepared DCA entry-condition scope guard so pair tickers cannot become indicators.");
