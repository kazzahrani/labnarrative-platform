import fs from "node:fs";
import path from "node:path";

const roots = [path.join(process.cwd(), "app"), path.join(process.cwd(), "components")];
const files = [];
function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) walk(full);
    else if (/\.(tsx|ts)$/.test(name)) files.push(full);
  }
}
roots.forEach(walk);

const KEY = "pste_balanced_8h_psar_state_v1";
let patchedFiles = 0;
let optionPatched = false;

for (const file of files) {
  let source = fs.readFileSync(file, "utf8");
  if (!source.includes("LabNarrative Strategy Scanner") && !source.includes("SMA Trend Long")) continue;
  const before = source;

  // 10H support in the UI.
  source = source.replace(
    '"4 hours","6 hours","8 hours","12 hours","20 hours"',
    '"4 hours","6 hours","8 hours","10 hours","12 hours","20 hours"'
  );
  source = source.replace(
    '"4 hours","6 hours","8 hours","12 hours","1 day"',
    '"4 hours","6 hours","8 hours","10 hours","12 hours","1 day"'
  );

  // Scanner constant, when the final generated editor uses named constants.
  if (!source.includes('PSTE_PSAR_STATE_SCANNER_KEY')) {
    source = source.replace(
      /(export\s+)?const\s+PSTE_RSI60_EVENT_SCANNER_KEY\s*=\s*"pste_balanced_8h_rsi60_event_v1";/,
      (m) => m + '\nconst PSTE_PSAR_STATE_SCANNER_KEY="' + KEY + '";'
    );
  }

  // Add the scanner to object-based scanner option arrays.
  if (!source.includes('label:"PSTE Balanced · 8H + PSAR State"')) {
    const patterns = [
      /(const\s+SCANNER_OPTIONS[^=]*=\s*\[)/,
      /(SCANNER_OPTIONS\s*=\s*\[)/
    ];
    for (const re of patterns) {
      if (re.test(source)) {
        source = source.replace(re, '$1\n {key:"' + KEY + '",label:"PSTE Balanced · 8H + PSAR State",timeframe:"8 hours",entryOnly:false,event:false},');
        optionPatched = true;
        break;
      }
    }
  } else {
    optionPatched = true;
  }

  // Add to simple string/value scanner lists if present.
  if (!source.includes('value="' + KEY + '"') && source.includes('SMA Trend Long')) {
    source = source.replace(
      /(<option[^>]*value=["']sma_trend_long_v1["'][^>]*>[^<]*SMA Trend Long[^<]*<\/option>)/,
      '$1<option value="' + KEY + '">PSTE Balanced · 8H + PSAR State</option>'
    );
  }

  // Preserve/reference PSAR timeframe and parameters when this scanner is selected.
  source = source.replace(
    /if\(kind===SCANNER_INDICATOR\)return\{\.\.\.base,timeframe:"1 day",length:50,comparator:purpose==="exit"\?"OUT":"LONG",signal:0,aux1:6,scannerKey:SMA_SCANNER_KEY\};/,
    'if(kind===SCANNER_INDICATOR)return{...base,timeframe:"1 day",length:50,comparator:purpose==="exit"?"OUT":"LONG",signal:0,aux1:6,scannerKey:SMA_SCANNER_KEY};'
  );

  // Make the summary truthful for stored PSTE+PSAR bots.
  if (!source.includes('PSTE 8H GREEN AND PSAR BULLISH')) {
    source = source.replace(
      /if\(scanner\.key===PSTE_RSI60_EVENT_SCANNER_KEY\)return conditionPurpose\(c\)==="exit"\?([^;]+);return([^;]+);/,
      (m, a, b) => 'if(scanner.key===PSTE_RSI60_EVENT_SCANNER_KEY)return conditionPurpose(c)==="exit"?' + a + ';if(scanner.key===PSTE_PSAR_STATE_SCANNER_KEY){const psarTf=c.referenceTimeframe||"4 hours";return conditionPurpose(c)==="exit"?\`\${prefix} · PSTE 8H RED OR PSAR BEARISH · \${psarTf}\`:\`\${prefix} · PSTE 8H GREEN AND PSAR BULLISH · \${psarTf}\`;}return' + b + ';'
    );
  }

  // Patch the generated scanner editor branch used in the current Paper UI.
  const oldBranch = 'if(condition.kind===SCANNER_INDICATOR)return<>{save}{purpose}<label><span>Scanner</span><select value={condition.scannerKey||SMA_SCANNER_KEY} onChange={e=>{const scanner=scannerOption(e.target.value);update({scannerKey:scanner.key,timeframe:scanner.timeframe,...(scanner.entryOnly?{purpose:"entry",comparator:"LONG"}:{})})}}>{SCANNER_OPTIONS.map(scanner=><option key={scanner.key} value={scanner.key}>{scanner.label}</option>)}</select><small>{selectedScanner?.entryOnly?"Internal LabNarrative entry scanner. The underlying private rules remain hidden; exits are handled by the DCA bot TP/SL settings.":selectedScanner?.event?"Event scanner: Entry fires only on a fresh qualifying transition. Exit fires when PSTE turns red. It does not buy merely because the conditions are already true.":"State scanner: Entry requires LONG state; Exit requires OUT state."}</small></label></>;';
  const newBranch = 'if(condition.kind===SCANNER_INDICATOR)return<>{save}{purpose}<label><span>Scanner</span><select value={condition.scannerKey||SMA_SCANNER_KEY} onChange={e=>{const scanner=scannerOption(e.target.value);const psar=scanner.key===PSTE_PSAR_STATE_SCANNER_KEY;update({scannerKey:scanner.key,timeframe:scanner.timeframe,...(scanner.entryOnly?{purpose:"entry",comparator:"LONG"}:{}),...(psar?{referenceTimeframe:condition.referenceTimeframe||"4 hours",aux1:condition.aux1||2,aux2:condition.aux2||1}:{})})}}>{SCANNER_OPTIONS.map(scanner=><option key={scanner.key} value={scanner.key}>{scanner.label}</option>)}</select><small>{selectedScanner?.entryOnly?"Internal LabNarrative entry scanner. The underlying private rules remain hidden; exits are handled by the DCA bot TP/SL settings.":selectedScanner?.key===PSTE_PSAR_STATE_SCANNER_KEY?"State scanner: Entry = PSTE 8H GREEN AND PSAR BULLISH. Exit = PSTE 8H RED OR PSAR BEARISH.":selectedScanner?.event?"Event scanner: Entry fires only on a fresh qualifying transition. Exit fires when PSTE turns red. It does not buy merely because the conditions are already true.":"State scanner: Entry requires LONG state; Exit requires OUT state."}</small></label>{selectedScanner?.key===PSTE_PSAR_STATE_SCANNER_KEY&&<><label><span>PSAR timeframe</span><select value={condition.referenceTimeframe||"4 hours"} onChange={e=>update({referenceTimeframe:e.target.value})}>{TIMEFRAMES.map(item=><option key={item}>{item}</option>)}</select></label><label><span>PSAR start / increment</span><input type="number" min="0.001" max="1" step="0.001" value={(condition.aux1||2)/100} onChange={e=>update({aux1:Number(e.target.value)*100})}/></label><label><span>PSAR maximum</span><input type="number" min="0.01" max="1" step="0.01" value={(condition.aux2||1)/5} onChange={e=>update({aux2:Number(e.target.value)*5})}/></>}</>;';
  if (source.includes(oldBranch)) source = source.replace(oldBranch, newBranch);

  if (source !== before) {
    fs.writeFileSync(file, source);
    patchedFiles += 1;
    console.log("PSTE+PSAR scanner UI patched:", path.relative(process.cwd(), file));
  }
}

if (!optionPatched) {
  const debug = [];
  for (const file of files) {
    const c = fs.readFileSync(file, "utf8");
    for (const needle of ["SMA Trend Long", "LabNarrative Strategy Scanner", "scannerKey", "SCANNER_OPTIONS"]) {
      const i = c.indexOf(needle);
      if (i >= 0) debug.push("FILE " + path.relative(process.cwd(), file) + "\nNEEDLE " + needle + "\n" + c.slice(Math.max(0, i - 3500), i + 12000));
    }
  }
  fs.mkdirSync(path.join(process.cwd(), "public"), { recursive: true });
  fs.writeFileSync(path.join(process.cwd(), "public/pste-scanner-debug.txt"), debug.join("\n\n====================\n\n") || "NO MATCHING SCANNER UI SOURCE FOUND");
  console.warn("PSTE+PSAR scanner UI: scanner options not patched; wrote public/pste-scanner-debug.txt");
}
console.log("Prepared PSTE+PSAR scanner UI. Patched files:", patchedFiles);
