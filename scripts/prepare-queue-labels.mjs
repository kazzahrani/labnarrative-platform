import fs from "node:fs";

const discoveryUrl = new URL("../app/admin/discovery/page.tsx", import.meta.url);
const productionUrl = new URL("../app/admin/automation/page.tsx", import.meta.url);

let discovery = fs.readFileSync(discoveryUrl, "utf8");
let production = fs.readFileSync(productionUrl, "utf8");

const oldDiscoveryKicker = '<p className={styles.kicker}>Automatic queue</p>';
const newDiscoveryKicker = '<p className={styles.kicker}>Approved candidates</p>';

if (!discovery.includes(oldDiscoveryKicker) && !discovery.includes(newDiscoveryKicker)) {
  throw new Error("The Discovery approved-candidates window was not found.");
}

discovery = discovery
  .replace(oldDiscoveryKicker, newDiscoveryKicker)
  .replaceAll('label="Automatic queue"', 'label="Approved candidates"')
  .replaceAll("Automatically queued", "Approved candidates")
  .replaceAll("automatically queued", "approved")
  .replaceAll("Auto-queued", "Approved")
  .replaceAll("auto-queued", "approved")
  .replaceAll("queued automatically", "approved")
  .replaceAll("Automatic queueing enabled", "Candidate approval enabled")
  .replaceAll("automatic queueing enabled", "candidate approval enabled")
  .replaceAll("Automatic queue threshold", "Approval threshold")
  .replaceAll("automatic queue threshold", "approval threshold")
  .replaceAll("Discover and auto-queue prospects", "Discover and approve candidates")
  .replaceAll("Searching, verifying and queueing…", "Searching, verifying and approving…")
  .replaceAll("Automatically admitted to production.", "Approved for production.")
  .replaceAll(
    "automatically sends every verified production-quality prospect into the automation queue.",
    "approves every verified production-quality candidate and sends it to the build queue.",
  );

production = production
  .replaceAll('"Buildable prospects · score 75–100"', '"Build queue"')
  .replaceAll('label="Buildable prospects"', 'label="Build queue"')
  .replaceAll("Automatically queued", "Approved candidates")
  .replaceAll("automatically queued", "approved")
  .replaceAll("Auto-queued", "Approved")
  .replaceAll("auto-queued", "approved")
  .replaceAll("queued automatically", "approved")
  .replaceAll("Automatically admitted to production.", "Approved for production.");

if (!discovery.includes(newDiscoveryKicker)) {
  throw new Error("Approved candidates was not applied to the Discovery window.");
}
if (!discovery.includes('label="Approved candidates"')) {
  throw new Error("Approved candidates was not applied to Discovery pagination.");
}
if (discovery.includes(oldDiscoveryKicker) || discovery.includes('label="Automatic queue"')) {
  throw new Error("The old Automatic queue window label is still present.");
}
if (!production.includes('"Build queue"')) {
  throw new Error("Build queue was not applied to the Production window.");
}
if (!production.includes('label="Build queue"')) {
  throw new Error("Build queue was not applied to Production pagination.");
}
if (production.includes('"Buildable prospects · score 75–100"')) {
  throw new Error("The old Buildable prospects window label is still present.");
}

const outdatedVisiblePhrases = [
  "Automatically queued",
  "automatically queued",
  "Auto-queued",
  "auto-queued",
  "queued automatically",
  "Automatic queueing enabled",
  "automatic queueing enabled",
  "Automatic queue threshold",
  "automatic queue threshold",
  "Discover and auto-queue prospects",
  "Searching, verifying and queueing…",
  "Automatically admitted to production.",
];

for (const phrase of outdatedVisiblePhrases) {
  if (discovery.includes(phrase) || production.includes(phrase)) {
    throw new Error(`Outdated visible queue wording is still present: ${phrase}`);
  }
}

fs.writeFileSync(discoveryUrl, discovery);
fs.writeFileSync(productionUrl, production);
console.log("Approved candidate and Build queue terminology standardized across visible platform labels.");
