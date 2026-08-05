import fs from "node:fs";

const automationUrl = new URL("../app/admin/automation/page.tsx", import.meta.url);
const discoveryUrl = new URL("../app/admin/discovery/page.tsx", import.meta.url);
const monitorUrl = new URL("../app/admin/sites/page.tsx", import.meta.url);

function addActionGroupClass(pageUrl, label) {
  let source = fs.readFileSync(pageUrl, "utf8");

  if (!source.includes("compactAdminHeaderActions")) {
    const token = "<div className={styles.heroActions}>";
    if (!source.includes(token)) throw new Error(`${label} header action group was not found.`);
    source = source.replace(
      token,
      '<div className={`${styles.heroActions} compactAdminHeaderActions`}>',
    );
  }

  if (!source.includes("compactAdminHeaderActions")) {
    throw new Error(`${label} compact header actions were not prepared.`);
  }

  fs.writeFileSync(pageUrl, source);
}

addActionGroupClass(automationUrl, "Production Engine");
addActionGroupClass(discoveryUrl, "Prospects Discovery");

let monitor = fs.readFileSync(monitorUrl, "utf8");
if (!monitor.includes("compactAdminMonitorHeading")) {
  const headingToken = "<div className={styles.heading}>";
  if (!monitor.includes(headingToken)) throw new Error("Websites Monitor heading was not found.");
  monitor = monitor.replace(
    headingToken,
    '<div className={`${styles.heading} compactAdminMonitorHeading`}>',
  );
}

if (!monitor.includes("compactAdminHeaderButton")) {
  const buttonToken = "className={styles.refreshButton}";
  if (!monitor.includes(buttonToken)) throw new Error("Websites Monitor refresh button was not found.");
  monitor = monitor.replace(
    buttonToken,
    'className={`${styles.refreshButton} compactAdminHeaderButton`}',
  );
}

if (!monitor.includes("compactAdminMonitorHeading") || !monitor.includes("compactAdminHeaderButton")) {
  throw new Error("Websites Monitor compact refresh action was not prepared.");
}

fs.writeFileSync(monitorUrl, monitor);
console.log("Admin page header actions compacted and aligned consistently.");
