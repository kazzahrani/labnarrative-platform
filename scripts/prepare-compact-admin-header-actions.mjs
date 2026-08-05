import fs from "node:fs";

const automationUrl = new URL("../app/admin/automation/page.tsx", import.meta.url);
const discoveryUrl = new URL("../app/admin/discovery/page.tsx", import.meta.url);
const monitorUrl = new URL("../app/admin/sites/page.tsx", import.meta.url);

function addActionGroupClass(pageUrl, label, extraClass) {
  let source = fs.readFileSync(pageUrl, "utf8");

  const fullClass = `${extraClass} compactAdminHeaderActions`;
  const compactToken = '<div className={`${styles.heroActions} compactAdminHeaderActions`}>';
  const fullToken = `<div className={\`${styles.heroActions} ${fullClass}\`}>`;

  if (!source.includes(fullClass)) {
    if (source.includes(compactToken)) {
      source = source.replace(compactToken, fullToken);
    } else {
      const token = "<div className={styles.heroActions}>";
      if (!source.includes(token)) throw new Error(`${label} header action group was not found.`);
      source = source.replace(token, fullToken);
    }
  }

  if (!source.includes(fullClass)) {
    throw new Error(`${label} compact header actions were not prepared.`);
  }

  fs.writeFileSync(pageUrl, source);
}

addActionGroupClass(automationUrl, "Production Engine", "productionHeaderActions");
addActionGroupClass(discoveryUrl, "Prospects Discovery", "discoveryHeaderActions");

let automation = fs.readFileSync(automationUrl, "utf8");
if (!automation.includes("productionHeaderLayout")) {
  const heroToken = "<section className={styles.hero}>";
  if (!automation.includes(heroToken)) throw new Error("Production Engine hero was not found.");
  automation = automation.replace(
    heroToken,
    '<section className={`${styles.hero} productionHeaderLayout`}>',
  );
}
if (!automation.includes("productionHeaderLayout")) {
  throw new Error("Production Engine aligned hero layout was not prepared.");
}
fs.writeFileSync(automationUrl, automation);

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
