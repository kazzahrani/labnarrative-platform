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
  .replaceAll('label="Automatic queue"', 'label="Approved candidates"');

production = production
  .replaceAll('"Buildable prospects · score 75–100"', '"Build queue"')
  .replaceAll('label="Buildable prospects"', 'label="Build queue"');

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

fs.writeFileSync(discoveryUrl, discovery);
fs.writeFileSync(productionUrl, production);
console.log("Approved candidates and Build queue labels applied consistently.");
