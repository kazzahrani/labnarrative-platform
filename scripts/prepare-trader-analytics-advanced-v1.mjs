import fs from "node:fs";
import path from "node:path";

const target = path.join(process.cwd(), "app", "trader", "BotAnalyticsWorkspace.tsx");
if (!fs.existsSync(target)) throw new Error("Advanced Analytics workspace target missing");
let source = fs.readFileSync(target, "utf8");

if (!source.includes('import AdvancedBotAnalytics from "./AdvancedBotAnalytics";')) {
  const anchor = 'import styles from "./bot-analytics-workspace.module.css";';
  if (!source.includes(anchor)) throw new Error("Advanced Analytics import anchor missing");
  source = source.replace(anchor, `${anchor}\nimport AdvancedBotAnalytics from "./AdvancedBotAnalytics";`);
}

if (!source.includes("<AdvancedBotAnalytics range={range}")) {
  const transformedAnchor = '<section className={styles.card} data-analytics-motion><div className={styles.sectionHead}><div><small>TRADE LEDGER</small><h3>Latest closed trades</h3></div>';
  const rawAnchor = '<section className={styles.card}><div className={styles.sectionHead}><div><small>TRADE LEDGER</small><h3>Latest closed trades</h3></div>';
  const anchor = source.includes(transformedAnchor) ? transformedAnchor : rawAnchor;
  if (!source.includes(anchor)) throw new Error("Advanced Analytics Trade Ledger anchor missing");
  source = source.replace(anchor, `<AdvancedBotAnalytics range={range} automation={automation} automations={automations} detail={detail} />\n\n        ${anchor}`);
}

for (const marker of [
  'import AdvancedBotAnalytics from "./AdvancedBotAnalytics";',
  '<AdvancedBotAnalytics range={range} automation={automation} automations={automations} detail={detail} />',
]) if (!source.includes(marker)) throw new Error(`Advanced Analytics output missing ${marker}`);

fs.writeFileSync(target, source);
console.log("Prepared advanced bot analytics suite.");
