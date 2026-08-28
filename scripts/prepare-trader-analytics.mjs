import fs from "node:fs";
import path from "node:path";

const shellPath = path.join(process.cwd(), "app", "trader", "TraderV2FullShell.tsx");
if (!fs.existsSync(shellPath)) throw new Error("Analytics shell target missing");
let source = fs.readFileSync(shellPath, "utf8");

function replaceOnce(from, to, label) {
  if (!source.includes(from)) throw new Error(`Analytics transform missing ${label}`);
  source = source.replace(from, to);
}

if (!source.includes('import Analytics from "./Analytics";')) {
  const anchor = 'import SignalMonitor from "./SignalMonitor";';
  if (!source.includes(anchor)) throw new Error("Analytics import anchor missing");
  source = source.replace(anchor, `${anchor}\nimport Analytics from "./Analytics";`);
}

replaceOnce(
  'type Section = "Dashboard" | "Portfolio" | "Bots" | "Signal Monitor" | "Active Positions" | "Closed Positions";',
  'type Section = "Dashboard" | "Portfolio" | "Bots" | "Signal Monitor" | "Active Positions" | "Closed Positions" | "Analytics";',
  "Section union",
);

const positionsNav = '<button className={section === "Active Positions" || section === "Closed Positions" ? styles.navActive : ""} onClick={() => setSection("Active Positions")}><span>•</span>Positions</button>';
if (!source.includes(positionsNav)) throw new Error("Analytics navigation anchor missing");
source = source.replace(positionsNav, `${positionsNav}<button className={section === "Analytics" ? styles.navActive : ""} onClick={() => setSection("Analytics")}><span>◫</span>Analytics</button>`);

replaceOnce(
  '<small>{section === "Dashboard" ? "OVERVIEW" : section === "Bots" ? "AUTOMATIONS" : section === "Signal Monitor" ? "SIGNAL MONITOR" : section === "Active Positions" || section === "Closed Positions" ? "POSITIONS" : section.toUpperCase()}</small>',
  '<small>{section === "Dashboard" ? "OVERVIEW" : section === "Bots" ? "AUTOMATIONS" : section === "Signal Monitor" ? "SIGNAL MONITOR" : section === "Active Positions" || section === "Closed Positions" ? "POSITIONS" : section === "Analytics" ? "ANALYTICS" : section.toUpperCase()}</small>',
  "topbar identity",
);

replaceOnce(
  'section === "Portfolio" ? portfolio : section === "Bots" ? botsPage : section === "Signal Monitor" ? <SignalMonitor accountId={currentAccount.id} accountName={currentAccount.name} /> : section === "Active Positions" ? tradesPage("Active") : tradesPage("Closed")',
  'section === "Portfolio" ? portfolio : section === "Bots" ? botsPage : section === "Signal Monitor" ? <SignalMonitor accountId={currentAccount.id} accountName={currentAccount.name} /> : section === "Analytics" ? <Analytics accountId={currentAccount.id} accountName={currentAccount.name} /> : section === "Active Positions" ? tradesPage("Active") : tradesPage("Closed")',
  "content router",
);

for (const marker of [
  'import Analytics from "./Analytics";',
  '| "Analytics";',
  '>Analytics</button>',
  'section === "Analytics" ? "ANALYTICS"',
  '<Analytics accountId={currentAccount.id} accountName={currentAccount.name} />',
]) if (!source.includes(marker)) throw new Error(`Analytics output missing ${marker}`);

fs.writeFileSync(shellPath, source);
console.log("Prepared final Trader Analytics navigation and routing.");
