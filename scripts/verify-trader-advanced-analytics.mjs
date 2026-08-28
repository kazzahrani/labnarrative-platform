import fs from "node:fs";
import path from "node:path";

const component=fs.readFileSync(path.join(process.cwd(),"app","trader","AdvancedBotAnalytics.tsx"),"utf8");
const css=fs.readFileSync(path.join(process.cwd(),"app","trader","advanced-bot-analytics.module.css"),"utf8");
const required=[
  "CAPITAL UTILIZATION",
  "RISK / RETURN MAP",
  "TIME EDGE",
  "ROLLING STRATEGY HEALTH",
  "RETURN DISTRIBUTION",
  "CAPITAL TIME EFFICIENCY",
  "UNDERWATER RISK",
  "Max drawdown (%)",
  "Realized ROI (%)",
  "Capital (USD)",
  "Trade ROI (%)",
  "Holding time",
  "Drawdown (%)",
];
for(const marker of required)if(!component.includes(marker))throw new Error(`Advanced analytics missing ${marker}`);
for(const marker of ["gridLine","verticalGrid","axisTitle","tick","focusBubble","areaRed"])if(!css.includes(marker))throw new Error(`Advanced analytics CSS missing ${marker}`);
for(const forbidden of ["MFE / MAE TRADE MAP","Excursion quality","Historical excursion path was not recorded."])if(component.includes(forbidden))throw new Error(`Removed excursion analytics still present: ${forbidden}`);
console.log("Verified seven-chart Trader advanced analytics suite with explicit axes.");
