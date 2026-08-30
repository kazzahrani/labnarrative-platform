import fs from "node:fs";
import path from "node:path";

const shellPath = path.join(process.cwd(), "app", "trader", "TraderV2FullShell.tsx");
if (!fs.existsSync(shellPath)) throw new Error("Referral dashboard shell target missing");
let source = fs.readFileSync(shellPath, "utf8");
const marker = "REFERRAL_DASHBOARD_V1";

if (!source.includes(marker)) {
  const importAnchor = 'import ConnectionsSettings from "./ConnectionsSettings";';
  if (!source.includes(importAnchor)) throw new Error("Referral dashboard requires Overview command center transform first");
  source = source.replace(importAnchor, `${importAnchor}\nimport ReferralDashboard from "./ReferralDashboard";\n// ${marker}`);

  const sectionBefore = 'type Section = "Dashboard" | "Portfolio" | "Bots" | "Signal Monitor" | "Active Positions" | "Closed Positions" | "Analytics" | "Connections";';
  const sectionAfter = 'type Section = "Dashboard" | "Portfolio" | "Bots" | "Signal Monitor" | "Active Positions" | "Closed Positions" | "Analytics" | "Connections" | "Referrals";';
  if (!source.includes(sectionBefore)) throw new Error("Referral dashboard could not find final Section union");
  source = source.replace(sectionBefore, sectionAfter);

  const settingsButton = '<button className={section === "Connections" ? styles.accountMenuActive : ""} onClick={() => { setAccountMenu(false); setSection("Connections"); }}><span>⚙</span><div><strong>Settings</strong><small>Connections</small></div></button>';
  if (!source.includes(settingsButton)) throw new Error("Referral dashboard could not find Settings account-menu item");
  const referralButton = '<button className={section === "Referrals" ? styles.accountMenuActive : ""} onClick={() => { setAccountMenu(false); setSection("Referrals"); }}><span>↗</span><div><strong>Referral program</strong><small>Links & earnings</small></div></button>';
  source = source.replace(settingsButton, `${settingsButton}${referralButton}`);

  const topbarBefore = 'section === "Connections" ? "SETTINGS · CONNECTIONS" : section.toUpperCase()';
  if (!source.includes(topbarBefore)) throw new Error("Referral dashboard could not find topbar section label");
  source = source.replace(topbarBefore, 'section === "Connections" ? "SETTINGS · CONNECTIONS" : section === "Referrals" ? "REFERRAL PROGRAM" : section.toUpperCase()');

  const routerNeedle = 'section === "Connections" ? <ConnectionsSettings realAccount={accounts.find((account) => account.kind === "real") ?? null} onConnectBinance={openBinance} onBackOverview={() => setSection("Dashboard")} /> : section === "Active Positions" ? tradesPage("Active") : tradesPage("Closed")';
  if (!source.includes(routerNeedle)) throw new Error("Referral dashboard could not find final content router");
  source = source.replace(routerNeedle, 'section === "Connections" ? <ConnectionsSettings realAccount={accounts.find((account) => account.kind === "real") ?? null} onConnectBinance={openBinance} onBackOverview={() => setSection("Dashboard")} /> : section === "Referrals" ? <ReferralDashboard /> : section === "Active Positions" ? tradesPage("Active") : tradesPage("Closed")');
}

for (const required of ["REFERRAL_DASHBOARD_V1", '<ReferralDashboard />', '<strong>Referral program</strong><small>Links & earnings</small>', 'section === "Referrals" ? "REFERRAL PROGRAM"']) {
  if (!source.includes(required)) throw new Error(`Referral dashboard final shell missing ${required}`);
}

fs.writeFileSync(shellPath, source);
console.log("Prepared LabNarrative Referral Dashboard in the signed-in account menu.");
