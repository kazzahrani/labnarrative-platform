import fs from "node:fs";

const productionUrl = new URL("../app/admin/automation/page.tsx", import.meta.url);
const liveQueueUrl = new URL("../components/admin/LiveProductionQueue.tsx", import.meta.url);

let production = fs.readFileSync(productionUrl, "utf8");
let liveQueue = fs.readFileSync(liveQueueUrl, "utf8");

const oldStatusText = `function statusText(value: string): string {
  return value.replaceAll("_", " ");
}`;
const newStatusText = `function statusText(value: string): string {
  if (value === "needs_attention" || value === "paused") return "Auto-recovering";
  if (value === "awaiting_final_review" || value === "approved_to_send") return "Awaiting confirmation";
  return value.replaceAll("_", " ");
}`;

if (production.includes(oldStatusText)) {
  production = production.replace(oldStatusText, newStatusText);
} else if (!production.includes(newStatusText)) {
  throw new Error("Production statusText helper was not found for autonomous recovery labels.");
}

const oldManualState = `  if (run.recovery_status === "waiting_manual_fix" || run.status === "paused") return { key: "manual", label: "Waiting Manual Fix" };`;
const newManualState = `  if (run.recovery_status === "waiting_manual_fix" || run.status === "paused") return { key: "recovering", label: "Auto-recovering" };`;
if (liveQueue.includes(oldManualState)) {
  liveQueue = liveQueue.replace(oldManualState, newManualState);
} else if (!liveQueue.includes(newManualState)) {
  throw new Error("Live queue manual-fix state marker was not found.");
}

const oldRecoveringState = `  if (run.status === "needs_attention") return { key: "recovering", label: "Recovering" };`;
const newRecoveringState = `  if (run.status === "needs_attention") return { key: "recovering", label: "Auto-recovering" };`;
if (liveQueue.includes(oldRecoveringState)) {
  liveQueue = liveQueue.replace(oldRecoveringState, newRecoveringState);
} else if (!liveQueue.includes(newRecoveringState)) {
  throw new Error("Live queue recovery-state marker was not found.");
}

liveQueue = liveQueue.replaceAll("Waiting Manual Fix", "Auto-recovering");

fs.writeFileSync(productionUrl, production);
fs.writeFileSync(liveQueueUrl, liveQueue);
console.log("Autonomous recovery labels prepared; no manual-fix state is shown to the operator.");
