import fs from "node:fs";
import path from "node:path";

const shellPath = path.join(process.cwd(), "app", "trader", "TraderV2FullShell.tsx");
if (!fs.existsSync(shellPath)) throw new Error("Overview command center shell target missing");
let source = fs.readFileSync(shellPath, "utf8");
const marker = "OVERVIEW_COMMAND_CENTER_V1";

if (!source.includes(marker)) {
  const analyticsImport = 'import Analytics from "./Analytics";';
  if (!source.includes(analyticsImport)) throw new Error("Overview command center requires final Analytics transform first");
  source = source.replace(analyticsImport, `${analyticsImport}\nimport OverviewCommandCenter from "./OverviewCommandCenter";\nimport ConnectionsSettings from "./ConnectionsSettings";\nimport overviewStyles from "./overview-command-center.module.css";\n// ${marker}`);

  const sectionBefore = 'type Section = "Dashboard" | "Portfolio" | "Bots" | "Signal Monitor" | "Active Positions" | "Closed Positions" | "Analytics";';
  const sectionAfter = 'type Section = "Dashboard" | "Portfolio" | "Bots" | "Signal Monitor" | "Active Positions" | "Closed Positions" | "Analytics" | "Connections";';
  if (!source.includes(sectionBefore)) throw new Error("Overview command center could not find final Section union");
  source = source.replace(sectionBefore, sectionAfter);

  const dashboardStart = source.indexOf("  const dashboard = <>");
  const portfolioStart = source.indexOf("  const portfolio = <>", dashboardStart);
  if (dashboardStart < 0 || portfolioStart <= dashboardStart) throw new Error("Overview command center could not isolate final dashboard block");
  const dashboard = `  const dashboard = <OverviewCommandCenter\n    account={currentAccount}\n    workspace={stateAccount ?? null}\n    controls={workspace?.controls ?? null}\n    worker={workspace?.worker ?? null}\n    bots={bots}\n    trades={trades}\n    displayedEquity={displayedEquity}\n    displayedAvailable={displayedAvailable}\n    hasConnectedExchange={accounts.some((account) => account.kind === \"real\" && account.exchangeStatus === \"connected\")}\n    onConnections={() => setSection(\"Connections\")}\n    onExplorePaper={() => chooseAccount(\"paper\")}\n    onPortfolio={() => setSection(\"Portfolio\")}\n    onAutomations={() => setSection(\"Bots\")}\n    onPositions={() => setSection(\"Active Positions\")}\n    onAnalytics={() => setSection(\"Analytics\")}\n    onSignals={() => setSection(\"Signal Monitor\")}\n    onOpenAutomation={(botId) => { const bot = bots.find((candidate) => candidate.id === botId); if (bot) openBot(bot); }}\n  />;\n\n`;
  source = source.slice(0, dashboardStart) + dashboard + source.slice(portfolioStart);

  const sidebarAnchor = '<div className={styles.sidebarBottom}><div><span className={currentAccount.kind === "real" ? styles.liveDot : styles.paperDot}/>';
  if (!source.includes(sidebarAnchor)) throw new Error("Overview command center could not find sidebar bottom anchor");
  const settingsButton = '<div className={styles.sidebarBottom}><button type="button" className={section === "Connections" ? `${overviewStyles.sidebarSettings} ${overviewStyles.sidebarSettingsActive}` : overviewStyles.sidebarSettings} onClick={() => setSection("Connections")}><span>⚙</span><span>Settings</span></button><div><span className={currentAccount.kind === "real" ? styles.liveDot : styles.paperDot}/>';
  source = source.replace(sidebarAnchor, settingsButton);

  const topbarTail = 'section === "Analytics" ? "ANALYTICS" : section.toUpperCase()';
  if (!source.includes(topbarTail)) throw new Error("Overview command center could not find topbar identity tail");
  source = source.replace(topbarTail, 'section === "Analytics" ? "ANALYTICS" : section === "Connections" ? "SETTINGS · CONNECTIONS" : section.toUpperCase()');

  const routerBefore = 'section === "Portfolio" ? portfolio : section === "Bots" ? botsPage : section === "Signal Monitor" ? <SignalMonitor accountId={currentAccount.id} accountName={currentAccount.name} /> : section === "Analytics" ? <Analytics accountId={currentAccount.id} accountName={currentAccount.name} /> : section === "Active Positions" ? tradesPage("Active") : tradesPage("Closed")';
  const routerAfter = 'section === "Portfolio" ? portfolio : section === "Bots" ? botsPage : section === "Signal Monitor" ? <SignalMonitor accountId={currentAccount.id} accountName={currentAccount.name} /> : section === "Analytics" ? <Analytics accountId={currentAccount.id} accountName={currentAccount.name} /> : section === "Connections" ? <ConnectionsSettings realAccount={accounts.find((account) => account.kind === "real") ?? null} onConnectBinance={openBinance} onBackOverview={() => setSection("Dashboard")} /> : section === "Active Positions" ? tradesPage("Active") : tradesPage("Closed")';
  if (!source.includes(routerBefore)) throw new Error("Overview command center could not find final content router");
  source = source.replace(routerBefore, routerAfter);
}

for (const required of [
  "OVERVIEW_COMMAND_CENTER_V1",
  "<OverviewCommandCenter",
  'setSection("Connections")',
  "<ConnectionsSettings",
  "overviewStyles.sidebarSettings",
  'section === "Connections" ? "SETTINGS · CONNECTIONS"',
]) if (!source.includes(required)) throw new Error(`Overview command center final shell missing ${required}`);

fs.writeFileSync(shellPath, source);
console.log("Prepared LabNarrative Overview command center with connection onboarding, settings, activity and signal snapshots.");
