import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const configuratorPath = path.join(root, "app", "trader", "DcaBotConfigurator.tsx");
const cssPath = path.join(root, "app", "trader", "dca-bot-configurator.module.css");

if (!fs.existsSync(configuratorPath) || !fs.existsSync(cssPath)) {
  throw new Error("Strategy Map targets are missing");
}

let source = fs.readFileSync(configuratorPath, "utf8");
let css = fs.readFileSync(cssPath, "utf8");

const sectionEnd = (text, start) => {
  let cursor = start;
  let depth = 0;
  while (cursor < text.length) {
    const open = text.indexOf("<section", cursor);
    const close = text.indexOf("</section>", cursor);
    if (close < 0) throw new Error("Strategy Map found an unterminated section");
    if (open >= 0 && open < close) {
      depth += 1;
      cursor = open + 8;
      continue;
    }
    depth -= 1;
    cursor = close + "</section>".length;
    if (depth === 0) return cursor;
  }
  throw new Error("Strategy Map could not resolve section boundary");
};

const cfgImport = 'import cfg from "./dca-bot-configurator.module.css";';
if (!source.includes(cfgImport)) throw new Error("Strategy Map could not find configurator CSS import");
if (!source.includes('import DcaStrategyMap from "./DcaStrategyMap";')) {
  source = source.replace(cfgImport, `${cfgImport}\nimport DcaStrategyMap from "./DcaStrategyMap";`);
}

if (!source.includes("form.takeProfitTargets")) {
  throw new Error("Strategy Map requires the existing multi-TP form state");
}

const previewMarker = '<section className={cfg.preview}><div className={cfg.cardHead}><div><h3>Strategy Preview</h3>';
const previewStart = source.indexOf(previewMarker);
if (previewStart < 0) throw new Error("Strategy Map could not find the final Strategy Preview section");
const previewEnd = sectionEnd(source, previewStart);

const strategyMapCall = `<DcaStrategyMap
      baseOrder={form.baseOrder}
      ladder={ladder}
      activeDcaOrders={form.limitSafetyOrders}
      maxActivePositions={form.maxActiveTrades}
      plannedCapitalPerPosition={plannedPerTrade}
      takeProfit={form.takeProfit}
      takeProfitTargets={form.takeProfitTargets}
      stopEnabled={form.stopEnabled}
      stopPct={form.stopPct}
    />`;

source = source.slice(0, previewStart) + strategyMapCall + source.slice(previewEnd);

const layoutCss = `
.strategyMap{overflow:hidden}
.strategyMap>.cardHead{padding:14px 15px 0;margin-bottom:10px}
.strategyMap .previewSummary{grid-template-columns:repeat(4,minmax(0,1fr))}
.strategyMapBody{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(280px,.75fr);gap:12px;padding:12px 15px}
.strategyMapLadder,.strategyMapOutcomes{min-width:0}
.strategyMapOutcomes{display:grid;gap:12px;align-content:start}
.strategyMapSectionHead{display:flex;justify-content:space-between;gap:8px;align-items:flex-start;margin-bottom:8px}
.strategyMapSectionHead>div{display:grid;gap:3px}
.strategyMapLadder .previewHead,.strategyMapLadder .previewRow{grid-template-columns:1.25fr .75fr .9fr .9fr .9fr}
.strategyMapExitTags{display:grid;gap:7px;margin-top:10px}
.strategyMapMetrics{grid-template-columns:1fr 1fr}
.strategyChecks{display:grid;gap:6px}
.strategyCheck{display:grid;grid-template-columns:18px 1fr;gap:7px;align-items:start}
.strategyCheck>span{display:grid;place-items:center}
.strategyScenario{display:grid;gap:9px;padding:12px 15px 14px}
.strategyScenarioHead{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}
.strategyScenarioHead>div{display:grid;gap:3px}
.strategyScenario input[type=range]{width:100%}
.strategyScenarioMetrics{grid-template-columns:repeat(5,minmax(0,1fr))}
@media(max-width:980px){.strategyMapBody{grid-template-columns:1fr}.strategyScenarioMetrics{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media(max-width:680px){.strategyMap .previewSummary,.strategyScenarioMetrics,.strategyMapMetrics{grid-template-columns:1fr 1fr}.strategyMapBody{padding:10px}.strategyScenario{padding:10px}.strategyMapLadder .previewHead,.strategyMapLadder .previewRow{grid-template-columns:1fr .8fr .9fr}.strategyMapLadder .previewHead span:nth-child(4),.strategyMapLadder .previewHead span:nth-child(5),.strategyMapLadder .previewRow span:nth-child(4),.strategyMapLadder .previewRow span:nth-child(5){display:none}.strategyScenarioHead{flex-direction:column}}
`;

for (const forbidden of ["#", "rgb(", "rgba(", "hsl(", "hsla(", "color:", "background:", "font-family", "font:"]) {
  if (layoutCss.includes(forbidden)) throw new Error(`Theme-frozen Strategy Map CSS contains forbidden token: ${forbidden}`);
}

if (!css.includes(".strategyMap{")) css += layoutCss;

for (const required of [
  'import DcaStrategyMap from "./DcaStrategyMap";',
  "<DcaStrategyMap",
  "takeProfitTargets={form.takeProfitTargets}",
  ".strategyMapBody{",
  ".strategyScenarioMetrics{",
]) {
  if (!(source.includes(required) || css.includes(required))) throw new Error(`Strategy Map output missing: ${required}`);
}

if (source.includes("<h3>Strategy Preview</h3>")) throw new Error("Legacy Strategy Preview survived Strategy Map replacement");

fs.writeFileSync(configuratorPath, source);
fs.writeFileSync(cssPath, css);
console.log("Prepared advanced LabNarrative Strategy Map with DCA outcomes, live checks and scenario simulation; theme and execution contracts unchanged.");
