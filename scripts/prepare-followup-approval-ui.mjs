import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = path.join(root, "app/admin/automation/page.tsx");
let source = fs.readFileSync(target, "utf8");

const activeBefore = `  const activeRun = useMemo(\n    () => runs.find((run) => ["running", "awaiting_final_review", "revision_requested", "approved_to_send", "needs_attention", "paused"].includes(run.status)),\n    [runs],\n  );`;
const activeAfter = `  const activeRun = useMemo(\n    () => runs.find((run) => run.source_pack?.auto_sequence !== true && ["running", "awaiting_final_review", "revision_requested", "approved_to_send", "needs_attention", "paused"].includes(run.status)),\n    [runs],\n  );`;
if (source.includes(activeBefore)) {
  source = source.replace(activeBefore, activeAfter);
} else if (!source.includes("run.source_pack?.auto_sequence !== true")) {
  throw new Error("Could not separate follow-up approval runs from active website production.");
}

const reviewBefore = `            {reviewRuns.map((run) => {\n              const message = messages.find((item) => item.production_run_id === run.id);\n              const qaIssues = stringArray(run.qa_results?.issues);`;
const reviewAfter = `            {reviewRuns.map((run) => {\n              const message = messages.find((item) => item.production_run_id === run.id);\n              const isFollowUp = run.source_pack?.auto_sequence === true;\n              const followUpLabel = run.source_pack?.message_kind === "followup_2" ? "Follow-up 2" : "Follow-up 1";\n              const qaIssues = stringArray(run.qa_results?.issues);`;
if (source.includes(reviewBefore)) {
  source = source.replace(reviewBefore, reviewAfter);
} else if (!source.includes("const isFollowUp = run.source_pack?.auto_sequence === true")) {
  throw new Error("Could not add follow-up approval context to review cards.");
}

const kickerBefore = `<div className={styles.cardHeader}><div><p className={styles.kicker}>Your single approval gate</p><h2>{run.prospects?.pi_name}</h2>`;
const kickerAfter = `<div className={styles.cardHeader}><div><p className={styles.kicker}>{isFollowUp ? \`${"${followUpLabel}"} · awaiting confirmation\` : "Your single approval gate"}</p><h2>{run.prospects?.pi_name}</h2>`;
if (source.includes(kickerBefore)) {
  source = source.replace(kickerBefore, kickerAfter);
} else if (!source.includes("followUpLabel} · awaiting confirmation")) {
  throw new Error("Could not label follow-up approval cards.");
}

fs.writeFileSync(target, source);
console.log("Follow-up approval review UI prepared without blocking website production.");
