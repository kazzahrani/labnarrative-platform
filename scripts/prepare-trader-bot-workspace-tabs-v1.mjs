import fs from "node:fs";
import path from "node:path";

const target = path.join(process.cwd(), "app", "trader", "BotAnalyticsWorkspace.tsx");
const cssTarget = path.join(process.cwd(), "app", "trader", "bot-analytics-workspace.module.css");
if (!fs.existsSync(target) || !fs.existsSync(cssTarget)) throw new Error("Bot Performance Workspace targets missing");
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

let css = fs.readFileSync(cssTarget, "utf8");
if (!css.includes("BOT WORKSPACE TABS V1")) {
  css += `\n/* BOT WORKSPACE TABS V1 */\n.workspaceTabs{position:sticky;top:-16px;z-index:3;display:flex;align-items:center;gap:5px;margin:-16px -18px 2px;padding:11px 18px 9px;background:rgba(29,29,29,.96);border-bottom:1px solid #303030;backdrop-filter:blur(12px)}\n.workspaceTabs button{height:30px;border:1px solid #353535;border-radius:8px;background:#232323;color:#777;padding:0 13px;font:inherit;font-size:9px;font-weight:700;cursor:pointer;transition:background .16s ease,color .16s ease,border-color .16s ease,transform .16s ease}\n.workspaceTabs button:hover{color:#d3d3d3;border-color:#484848;transform:translateY(-1px)}\n.workspaceTabs .workspaceTabActive{background:#ececec;color:#1e1e1e;border-color:#ececec}\n.advancedTabSection{display:block}\n.overviewMode>.advancedTabSection{display:none}\n.advancedMode>:not(.workspaceTabs):not(.advancedTabSection){display:none!important}\n`;
}
for (const marker of ["workspaceTabs","workspaceTabActive","advancedTabSection","advancedMode","overviewMode"]) if (!css.includes(`.${marker}`)) throw new Error(`Bot workspace tab CSS missing ${marker}`);
fs.writeFileSync(cssTarget, css);

console.log("Prepared Bot Performance Workspace Overview / Advanced Analytics tabs.");
