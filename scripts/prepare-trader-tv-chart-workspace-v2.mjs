import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const sourcePath = path.join(root, "app/trader/DcaTradeChartTVWorkspaceV2.tsx");
const targetPath = path.join(root, "app/trader/DcaTradeChartV2Workstation.tsx");
const cssSourcePath = path.join(root, "app/trader/dca-trade-workstation-tv-v2.module.css");
const cssTargetPath = path.join(root, "app/trader/dca-trade-workstation.module.css");

if (!fs.existsSync(sourcePath)) throw new Error("TV Chart V2 template is missing");
if (!fs.existsSync(cssSourcePath)) throw new Error("TV Chart V2 stylesheet is missing");

fs.writeFileSync(targetPath, fs.readFileSync(sourcePath, "utf8"));
fs.writeFileSync(cssTargetPath, fs.readFileSync(cssSourcePath, "utf8"));
console.log("TradingView-style timeframe dropdown, repeatable indicators and per-instance settings prepared");
