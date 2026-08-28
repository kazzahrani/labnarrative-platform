import fs from "node:fs";
import path from "node:path";

const shellPath = path.join(process.cwd(), "app", "trader", "TraderV2FullShell.tsx");
if (!fs.existsSync(shellPath)) throw new Error("Signal Monitor shell target missing");
let source = fs.readFileSync(shellPath, "utf8");

function replaceOnce(from, to, label) {
  if (!source.includes(from)) throw new Error(`Signal Monitor final transform missing ${label}`);
  source = source.replace(from, to);
}

if (!source.includes('import SignalMonitor from "./SignalMonitor";')) {
  const importAnchor = 'import CoinLogo from "./CoinLogo";';
  if (!source.includes(importAnchor)) throw new Error("Signal Monitor import anchor missing");
  source = source.replace(importAnchor, `${importAnchor}\nimport SignalMonitor from "./SignalMonitor";`);
}

replaceOnce(
  'type Section = "Dashboard" | "Portfolio" | "Bots" | "Active Positions" | "Closed Positions";',
  'type Section = "Dashboard" | "Portfolio" | "Bots" | "Signal Monitor" | "Active Positions" | "Closed Positions";',
  "Section union",
);

const oldNav = '<button className={section === "Dashboard" ? styles.navActive : ""} onClick={() => setSection("Dashboard")}><span>⌘</span>Overview</button><button className={section === "Portfolio" ? styles.navActive : ""} onClick={() => setSection("Portfolio")}><span>◔</span>Portfolio</button><button className={section === "Bots" ? styles.navActive : ""} onClick={() => setSection("Bots")}><span>▣</span>Automations</button><button className={section === "Active Positions" || section === "Closed Positions" ? styles.navActive : ""} onClick={() => setSection("Active Positions")}><span>•</span>Positions</button>';
const newNav = '<button className={section === "Dashboard" ? styles.navActive : ""} onClick={() => setSection("Dashboard")}><span>⌘</span>Overview</button><button className={section === "Portfolio" ? styles.navActive : ""} onClick={() => setSection("Portfolio")}><span>◔</span>Portfolio</button><button className={section === "Bots" ? styles.navActive : ""} onClick={() => setSection("Bots")}><span>▣</span>Automations</button><button className={section === "Signal Monitor" ? styles.navActive : ""} onClick={() => setSection("Signal Monitor")}><span>⌁</span>Signal Monitor</button><button className={section === "Active Positions" || section === "Closed Positions" ? styles.navActive : ""} onClick={() => setSection("Active Positions")}><span>•</span>Positions</button>';
replaceOnce(oldNav, newNav, "navigation block");

replaceOnce(
  '<small>{section === "Dashboard" ? "OVERVIEW" : section === "Bots" ? "AUTOMATIONS" : section === "Active Positions" || section === "Closed Positions" ? "POSITIONS" : section.toUpperCase()}</small>',
  '<small>{section === "Dashboard" ? "OVERVIEW" : section === "Bots" ? "AUTOMATIONS" : section === "Signal Monitor" ? "SIGNAL MONITOR" : section === "Active Positions" || section === "Closed Positions" ? "POSITIONS" : section.toUpperCase()}</small>',
  "topbar identity",
);

replaceOnce(
  'section === "Portfolio" ? portfolio : section === "Bots" ? botsPage : section === "Active Positions" ? tradesPage("Active") : tradesPage("Closed")',
  'section === "Portfolio" ? portfolio : section === "Bots" ? botsPage : section === "Signal Monitor" ? <SignalMonitor accountId={currentAccount.id} accountName={currentAccount.name} /> : section === "Active Positions" ? tradesPage("Active") : tradesPage("Closed")',
  "content router",
);

for (const marker of [
  'import SignalMonitor from "./SignalMonitor";',
  '| "Signal Monitor" |',
  '>Signal Monitor</button>',
  'section === "Signal Monitor" ? "SIGNAL MONITOR"',
  '<SignalMonitor accountId={currentAccount.id} accountName={currentAccount.name} />',
]) if (!source.includes(marker)) throw new Error(`Signal Monitor final shell missing ${marker}`);

fs.writeFileSync(shellPath, source);
console.log("Prepared final Trader Signal Monitor navigation and page routing.");

await import("./prepare-trader-chart-opening-density-v1.mjs");
await import("./prepare-trader-automations-table-v2.mjs");
await import("./prepare-trader-analytics.mjs");
await import("./prepare-trader-bot-analytics-workspace.mjs");
await import("./prepare-trader-analytics-motion-ytd.mjs");
await import("./prepare-trader-analytics-max-capital.mjs");
await import("./prepare-trader-analytics-dd-contrast.mjs");
await import("./prepare-trader-analytics-advanced-v1.mjs");
await import("./verify-trader-advanced-analytics.mjs");
await import("./prepare-trader-analytics-global-filters.mjs");
await import("./prepare-trader-analytics-layout-cleanup.mjs");
await import("./prepare-trader-analytics-benchmarks-axes.mjs");
await import("./prepare-trader-portfolio-intelligence.mjs");
await import("./prepare-trader-paper-demo-holdings-v2.mjs");
await import("./prepare-trader-paper-portfolio-time-machine-v1.mjs");
