import fs from "node:fs";

const pageUrl = new URL("../app/admin/automation/page.tsx", import.meta.url);
let source = fs.readFileSync(pageUrl, "utf8");

const componentImport = 'import DailyLimitControl from "@/components/admin/ReviewBufferControl";';
if (!source.includes(componentImport)) {
  const marker = 'import Link from "next/link";';
  if (!source.includes(marker)) throw new Error("The Production page Link import was not found.");
  source = source.replace(marker, `${marker}\n${componentImport}`);
}

const legacyStatus = '<span className={styles.status} data-status="running">Automatic runner active · {counts.review}/10 awaiting review</span>';
const control = '<DailyLimitControl />';
if (source.includes(legacyStatus)) {
  source = source.replace(legacyStatus, control);
}

const legacyStat = '<div className={styles.stat}><span>Review buffer</span><strong>{counts.review}/10</strong></div>';
source = source.replace(legacyStat, "");

source = source.replaceAll("ten-concept review buffer", "daily production limit");
source = source.replaceAll("ten-concept live review buffer", "daily production limit");
source = source.replaceAll("configurable Review Buffer", "configurable Daily Limit");
source = source.replaceAll("configured Review Buffer", "configured Daily Limit");

if (!source.includes(componentImport)) throw new Error("The Daily Limit control import was not installed.");
if (!source.includes(control)) throw new Error("The persistent Daily Limit control was not installed.");
if (source.includes("Automatic runner active")) throw new Error("The hard-coded Active runner label is still present.");
if (source.includes("counts.review}/10")) throw new Error("A hard-coded Review Buffer target remains in the Production page.");

fs.writeFileSync(pageUrl, source);
console.log("Persistent Riyadh Daily Limit and Pause/Resume controls prepared.");
