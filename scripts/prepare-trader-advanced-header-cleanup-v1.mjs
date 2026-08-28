import fs from "node:fs";
import path from "node:path";

const target = path.join(process.cwd(), "app", "trader", "AdvancedBotAnalytics.tsx");
if (!fs.existsSync(target)) throw new Error("Advanced Analytics header-cleanup target missing");
let source = fs.readFileSync(target, "utf8");

const header = '    <div className={styles.suiteHead}><div><small>ADVANCED ANALYTICS</small><h3>Risk, efficiency & behavioral edge</h3></div><span>{trades.length} closed trades sampled · {range.toUpperCase()}</span></div>\n';
if (source.includes(header)) source = source.replace(header, "");

if (source.includes('<small>ADVANCED ANALYTICS</small>') || source.includes('Risk, efficiency & behavioral edge')) {
  throw new Error("Advanced Analytics redundant suite header still present");
}

fs.writeFileSync(target, source);
console.log("Removed redundant Advanced Analytics suite heading.");
