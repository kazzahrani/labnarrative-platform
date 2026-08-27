import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const configuratorPath = path.join(root, "app", "trader", "DcaBotConfigurator.tsx");
const cssPath = path.join(root, "app", "trader", "dca-bot-configurator.module.css");

if (!fs.existsSync(configuratorPath) || !fs.existsSync(cssPath)) {
  throw new Error("Compact plan layout targets are missing");
}

let source = fs.readFileSync(configuratorPath, "utf8");
let css = fs.readFileSync(cssPath, "utf8");

const sectionEnd = (text, start) => {
  let cursor = start;
  let depth = 0;
  while (cursor < text.length) {
    const open = text.indexOf("<section", cursor);
    const close = text.indexOf("</section>", cursor);
    if (close < 0) throw new Error("Compact plan layout found an unterminated section");
    if (open >= 0 && open < close) {
      depth += 1;
      cursor = open + 8;
      continue;
    }
    depth -= 1;
    cursor = close + "</section>".length;
    if (depth === 0) return cursor;
  }
  throw new Error("Compact plan layout could not resolve section boundary");
};

const capitalMarker = '<section className={cfg.card}><div className={cfg.cardHead}><div><h3>Capital Plan</h3>';
const exitMarker = '<section className={cfg.card}><div className={cfg.cardHead}><div><h3>Exit Plan</h3>';
const capitalStart = source.indexOf(capitalMarker);
const exitStart = source.indexOf(exitMarker);
if (capitalStart < 0 || exitStart < 0 || exitStart <= capitalStart) {
  throw new Error("Compact plan layout could not find final Capital Plan / Exit Plan sections");
}
const capitalEnd = sectionEnd(source, capitalStart);
const exitEnd = sectionEnd(source, exitStart);
if (capitalEnd > exitStart) throw new Error("Capital Plan unexpectedly overlaps Exit Plan");

let capital = source.slice(capitalStart, capitalEnd);
let exit = source.slice(exitStart, exitEnd);
const between = source.slice(capitalEnd, exitStart);

capital = capital.replace(
  "Build the complete entry ladder and see exactly how capital expands as price moves.",
  "Define order ladder and capital use.",
);
if (!capital.includes("Define order ladder and capital use.")) {
  throw new Error("Compact plan layout could not shorten Capital Plan helper text");
}

const capitalGrid = '<div className={cfg.grid}>';
if (!capital.includes(capitalGrid)) throw new Error("Compact plan layout could not find Capital Plan grid");
capital = capital.replace(capitalGrid, '<div className={`${cfg.grid} ${cfg.capitalGrid}`}>');

exit = exit.replace(
  "Split the position across multiple Take Profit targets and optionally delay Stop Loss execution.",
  "Set TP distribution and optional SL timing.",
);
if (!exit.includes("Set TP distribution and optional SL timing.")) {
  throw new Error("Compact plan layout could not shorten Exit Plan helper text");
}

const removeTp = '<button type="button" className={cfg.removeTp} onClick={()=>removeTp(index)}>Remove</button>';
if (exit.includes(removeTp)) {
  exit = exit.replace(
    removeTp,
    '<button type="button" className={cfg.removeTp} title="Remove TP" aria-label={"Remove TP "+(index+1)} onClick={()=>removeTp(index)}>×</button>',
  );
}

source =
  source.slice(0, capitalStart) +
  '<div className={cfg.planSplit}>' +
  capital +
  between +
  exit +
  "</div>" +
  source.slice(exitEnd);

const layoutCss = `
.planSplit{display:grid;grid-template-columns:minmax(0,.96fr) minmax(0,1.04fr);gap:10px;align-items:start}
.planSplit>.card{min-width:0;padding:12px 13px}
.planSplit .cardHead{margin-bottom:9px}
.planSplit .grid{gap:7px}
.planSplit .grid input,.planSplit .grid select{height:34px}
.capitalGrid{grid-template-columns:repeat(6,minmax(0,1fr))}
.capitalGrid>label:nth-child(-n+4){grid-column:span 3}
.capitalGrid>label:nth-child(n+5){grid-column:span 2}
.planSplit .tpList{gap:5px}
.planSplit .tpRow{grid-template-columns:34px minmax(0,1fr) minmax(0,1fr) 28px;gap:6px;align-items:end;padding:6px 8px}
.planSplit .tpRow input{height:32px;padding:0 8px}
.planSplit .removeTp{width:28px;height:32px;padding:0}
.planSplit .tpTotal{padding-top:5px}
.planSplit .exitDivider{margin:9px 0}
.planSplit .liveNote{margin-top:8px;padding:7px 9px}
@media(max-width:980px){.planSplit{grid-template-columns:1fr}}
@media(max-width:680px){.capitalGrid{grid-template-columns:1fr}.capitalGrid>label:nth-child(n){grid-column:auto}.planSplit .tpRow{grid-template-columns:34px 1fr 1fr}.planSplit .removeTp{grid-column:2/-1}}
`;

for (const forbidden of ["#", "rgb(", "rgba(", "hsl(", "hsla(", "color:", "background:", "font-family", "font:"]) {
  if (layoutCss.includes(forbidden)) throw new Error(`Theme-free layout CSS contains forbidden theme token: ${forbidden}`);
}

if (!css.includes(".planSplit{")) css += layoutCss;

for (const required of ["cfg.planSplit", "cfg.capitalGrid", "Define order ladder and capital use.", "Set TP distribution and optional SL timing."]) {
  if (!source.includes(required)) throw new Error(`Compact plan layout missing required output: ${required}`);
}

fs.writeFileSync(configuratorPath, source);
fs.writeFileSync(cssPath, css);
console.log("Prepared compact side-by-side Capital / Exit plans (layout only; theme and trading contracts unchanged).");

await import("./prepare-trader-strategy-map.mjs");
await import("./prepare-trader-automations-hub.mjs");
await import("./prepare-trader-tradingview-link-v1.mjs");
await import("./prepare-trader-tv-strategy-v1.mjs");
