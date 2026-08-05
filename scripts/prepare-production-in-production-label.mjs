import fs from "node:fs";

const pageUrl = new URL("../app/admin/automation/page.tsx", import.meta.url);
let source = fs.readFileSync(pageUrl, "utf8");

const oldLabel = "<span>Active</span>";
const newLabel = "<span>In Production</span>";

if (!source.includes(oldLabel) && !source.includes(newLabel)) {
  throw new Error("The Production Active statistic label was not found.");
}

source = source.replaceAll(oldLabel, newLabel);

if (!source.includes(newLabel)) {
  throw new Error("The In Production label was not applied.");
}
if (source.includes(oldLabel)) {
  throw new Error("The old standalone Active label is still present.");
}

fs.writeFileSync(pageUrl, source);
console.log("Production Active label renamed to In Production.");
