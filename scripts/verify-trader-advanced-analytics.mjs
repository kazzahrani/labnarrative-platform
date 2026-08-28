import fs from "node:fs";
import path from "node:path";

const component = fs.readFileSync(path.join(process.cwd(),"app","trader","AdvancedBotAnalytics.tsx"),"utf8");
const css = fs.readFileSync(path.join(process.cwd(),"app","trader","advanced-bot-analytics.module.css"),"utf8");
const required = [
  "CAPITAL UTILIZATION",
  "RISK / RETURN MAP",
  "TIME EDGE",
  "ROLLING STRATEGY HEALTH",
  "RETURN DISTRIBUTION",
  "CAPITAL TIME EFFICIENCY",
  "UNDERWATER RISK",
  "MFE / MAE TRADE MAP",
  "Historical excursion path was not recorded.",
];
for (const marker of required) if (!component.includes(marker)) throw new Error(`Advanced analytics missing ${marker}`);
for (const marker of ["advancedLine","heatRow","focusBubble","areaRed"]) if (!css.includes(marker)) throw new Error(`Advanced analytics CSS missing ${marker}`);
console.log("Verified eight-chart Trader advanced analytics suite.");
