import fs from "node:fs";
import path from "node:path";

const shellPath = path.join(process.cwd(), "app", "trader", "TraderV2FullShell.tsx");
if (!fs.existsSync(shellPath)) throw new Error("Billing dashboard shell target missing");
let source = fs.readFileSync(shellPath, "utf8");
const marker = "TRADER_BILLING_DASHBOARD_V1";

if (!source.includes(marker)) {
  const importAnchor = 'import ReferralDashboard from "./ReferralDashboard";';
  if (!source.includes(importAnchor)) throw new Error("Billing dashboard requires Referral dashboard transform first");
  source = source.replace(importAnchor, `${importAnchor}\nimport BillingDashboard from "./BillingDashboard";\n// ${marker}`);

  const sectionBefore = 'type Section = "Dashboard" | "Portfolio" | "Bots" | "Signal Monitor" | "Active Positions" | "Closed Positions" | "Analytics" | "Connections" | "Referrals";';
  const sectionAfter = 'type Section = "Dashboard" | "Portfolio" | "Bots" | "Signal Monitor" | "Active Positions" | "Closed Positions" | "Analytics" | "Connections" | "Referrals" | "Billing";';
  if (!source.includes(sectionBefore)) throw new Error("Billing dashboard could not find final Section union");
  source = source.replace(sectionBefore, sectionAfter);

  const referralButton = '<button className={section === "Referrals" ? styles.accountMenuActive : ""} onClick={() => { setAccountMenu(false); setSection("Referrals"); }}><span>↗</span><div><strong>Referral program</strong><small>Links & earnings</small></div></button>';
  if (!source.includes(referralButton)) throw new Error("Billing dashboard could not find Referral account-menu item");
  const billingButton = '<button className={section === "Billing" ? styles.accountMenuActive : ""} onClick={() => { setAccountMenu(false); setSection("Billing"); }}><span>◇</span><div><strong>Plans & billing</strong><small>Pricing & subscription</small></div></button>';
  source = source.replace(referralButton, `${referralButton}${billingButton}`);

  const topbarBefore = 'section === "Connections" ? "SETTINGS · CONNECTIONS" : section === "Referrals" ? "REFERRAL PROGRAM" : section.toUpperCase()';
  if (!source.includes(topbarBefore)) throw new Error("Billing dashboard could not find topbar section label");
  source = source.replace(topbarBefore, 'section === "Connections" ? "SETTINGS · CONNECTIONS" : section === "Referrals" ? "REFERRAL PROGRAM" : section === "Billing" ? "PLANS & BILLING" : section.toUpperCase()');

  const routerNeedle = 'section === "Connections" ? <ConnectionsSettings realAccount={accounts.find((account) => account.kind === "real") ?? null} onConnectBinance={openBinance} onBackOverview={() => setSection("Dashboard")} /> : section === "Referrals" ? <ReferralDashboard /> : section === "Active Positions" ? tradesPage("Active") : tradesPage("Closed")';
  if (!source.includes(routerNeedle)) throw new Error("Billing dashboard could not find final content router");
  source = source.replace(routerNeedle, 'section === "Connections" ? <ConnectionsSettings realAccount={accounts.find((account) => account.kind === "real") ?? null} onConnectBinance={openBinance} onBackOverview={() => setSection("Dashboard")} /> : section === "Referrals" ? <ReferralDashboard /> : section === "Billing" ? <BillingDashboard /> : section === "Active Positions" ? tradesPage("Active") : tradesPage("Closed")');
}

for (const required of [
  "TRADER_BILLING_DASHBOARD_V1",
  '<BillingDashboard />',
  '<strong>Plans & billing</strong><small>Pricing & subscription</small>',
  'section === "Billing" ? "PLANS & BILLING"',
]) {
  if (!source.includes(required)) throw new Error(`Billing dashboard final shell missing ${required}`);
}

fs.writeFileSync(shellPath, source);
console.log("Prepared LabNarrative Plans & Billing workspace in the signed-in Trader shell.");
await import("./prepare-trader-multiexchange-final-v1.mjs");
