import fs from "node:fs";
import path from "node:path";

const target = path.join(process.cwd(), "app", "trader", "BotAnalyticsWorkspace.tsx");
if (!fs.existsSync(target)) throw new Error("Bot Performance Workspace target missing");
let source = fs.readFileSync(target, "utf8");

if (!source.includes('import AdvancedBotAnalytics from "./AdvancedBotAnalytics";')) {
  throw new Error("Advanced analytics suite must be prepared before workspace tabs");
}

if (!source.includes("BOT WORKSPACE TABS V1")) {
  const stateAnchor = '  const [compareId,setCompareId]=useState("");';
  if (!source.includes(stateAnchor)) throw new Error("Bot workspace tab state anchor missing");
  source = source.replace(stateAnchor, `${stateAnchor}\n  const [workspaceTab,setWorkspaceTab]=useState<"overview"|"advanced">("overview");\n  // BOT WORKSPACE TABS V1 — core performance by default, deeper analytics on demand.`);

  const scrollAnchor = '<div className={styles.scroll}>';
  if (!source.includes(scrollAnchor)) throw new Error("Bot workspace scroll anchor missing");
  source = source.replace(scrollAnchor, `<div className={\`${'${styles.scroll}'} ${'${workspaceTab==="advanced"?styles.advancedMode:styles.overviewMode}'}\`}>\n        <nav className={styles.workspaceTabs} aria-label="Bot analytics views">\n          <button type="button" className={workspaceTab==="overview"?styles.workspaceTabActive:""} onClick={()=>setWorkspaceTab("overview")}>Overview</button>\n          <button type="button" className={workspaceTab==="advanced"?styles.workspaceTabActive:""} onClick={()=>setWorkspaceTab("advanced")}>Advanced Analytics</button>\n        </nav>`);

  const advanced = '<AdvancedBotAnalytics range={range} automation={automation} automations={automations} detail={detail} />';
  if (!source.includes(advanced)) throw new Error("Advanced analytics component anchor missing");
  source = source.replace(advanced, `<div className={styles.advancedTabSection}>${advanced}</div>`);
}

for (const marker of [
  "BOT WORKSPACE TABS V1",
  'setWorkspaceTab("overview")',
  'setWorkspaceTab("advanced")',
  'className={styles.advancedTabSection}',
]) if (!source.includes(marker)) throw new Error(`Bot workspace tabs missing ${marker}`);

fs.writeFileSync(target, source);
console.log("Prepared Bot Performance Workspace Overview / Advanced Analytics tabs.");
