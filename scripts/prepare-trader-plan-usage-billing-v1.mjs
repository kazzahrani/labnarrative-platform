import fs from "node:fs";
import path from "node:path";

const file = path.join(process.cwd(), "app/trader/BillingDashboard.tsx");
let source = fs.readFileSync(file, "utf8");

if (!source.includes('import PlanUsagePanel from "./PlanUsagePanel";')) {
  const anchor = 'import styles from "./billing-dashboard.module.css";';
  if (!source.includes(anchor)) throw new Error("Trader billing usage import anchor not found");
  source = source.replace(anchor, `${anchor}\nimport PlanUsagePanel from "./PlanUsagePanel";`);
}

if (!source.includes("<PlanUsagePanel refreshKey=")) {
  const anchor = '    {sub && <section className={styles.current}>';
  if (!source.includes(anchor)) throw new Error("Trader billing usage panel anchor not found");
  const panel = '    <PlanUsagePanel refreshKey={`${data?.entitlements?.plan || "free"}:${sub?.status || "none"}:${sub?.plan_id || ""}`} />\n\n';
  source = source.replace(anchor, panel + anchor);
}

fs.writeFileSync(file, source);
console.log("Prepared owner-level Trader plan usage and remaining-capacity panel.");
