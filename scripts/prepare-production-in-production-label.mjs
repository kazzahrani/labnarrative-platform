import fs from "node:fs";

const pageUrl = new URL("../app/admin/automation/page.tsx", import.meta.url);
let source = fs.readFileSync(pageUrl, "utf8");

const oldActiveLabel = "<span>Active</span>";
const newActiveLabel = "<span>In Production</span>";
const oldProspectMetric = '<div className={styles.stat}><span>Prospects</span><strong>{counts.total}</strong></div>';
const newProspectMetric = '<div className={styles.stat}><span>Approved candidates</span><strong>{counts.approved}</strong></div>';
const approvedCountLine = '    approved: prospects.filter((item) => !["held", "rejected"].includes(item.status)).length,\n';

if (!source.includes(oldActiveLabel) && !source.includes(newActiveLabel)) {
  throw new Error("The Production Active statistic label was not found.");
}
if (!source.includes(oldProspectMetric) && !source.includes(newProspectMetric)) {
  throw new Error("The Production Prospects statistic was not found.");
}

source = source.replaceAll(oldActiveLabel, newActiveLabel);

if (!source.includes(approvedCountLine)) {
  const totalCountLine = "    total: prospects.length,\n";
  if (!source.includes(totalCountLine)) {
    throw new Error("The Production prospect total count was not found.");
  }
  source = source.replace(totalCountLine, totalCountLine + approvedCountLine);
}

source = source.replaceAll(oldProspectMetric, newProspectMetric);

if (!source.includes(newActiveLabel)) {
  throw new Error("The In Production label was not applied.");
}
if (!source.includes(newProspectMetric)) {
  throw new Error("The Approved candidates metric was not applied.");
}
if (!source.includes(approvedCountLine)) {
  throw new Error("The approved-candidate count was not prepared.");
}
if (source.includes(oldActiveLabel)) {
  throw new Error("The old standalone Active label is still present.");
}
if (source.includes(oldProspectMetric)) {
  throw new Error("The old Prospects metric is still present.");
}

fs.writeFileSync(pageUrl, source);
console.log("Production metrics renamed to Approved candidates and In Production.");
