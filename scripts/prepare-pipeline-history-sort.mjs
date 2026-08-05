import fs from "node:fs";

const pageUrl = new URL("../app/admin/automation/page.tsx", import.meta.url);
let source = fs.readFileSync(pageUrl, "utf8");

const statusTextFunction = `function statusText(value: string): string {
  return value.replaceAll("_", " ");
}`;

const patchedStatusTextFunction = `function statusText(value: string): string {
  return value.replaceAll("_", " ");
}

const pipelineHistoryStatusOrder: Partial<Record<ProspectStatus, number>> = {
  awaiting_final_review: 0,
  in_production: 1,
  revision_requested: 2,
  approved_to_send: 3,
  needs_attention: 4,
  queued: 5,
  qualified: 6,
  discovered: 7,
  paused: 8,
  replied: 9,
  interested: 10,
  rejected: 90,
  email_sent: 100,
};

function sortPipelineHistoryProspects(items: Prospect[]): Prospect[] {
  return [...items].sort((left, right) => {
    const statusDifference = (pipelineHistoryStatusOrder[left.status] ?? 50)
      - (pipelineHistoryStatusOrder[right.status] ?? 50);
    if (statusDifference !== 0) return statusDifference;

    const priorityDifference = left.priority - right.priority;
    if (priorityDifference !== 0) return priorityDifference;

    return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
  });
}`;

if (!source.includes("function sortPipelineHistoryProspects")) {
  if (!source.includes(statusTextFunction)) {
    throw new Error("The pipeline history status helper insertion point was not found.");
  }
  source = source.replace(statusTextFunction, patchedStatusTextFunction);
}

source = source.replace(
  "prospects.map((prospect) => (",
  "sortPipelineHistoryProspects(prospects).map((prospect) => (",
);

if (!source.includes("sortPipelineHistoryProspects(prospects).map")) {
  throw new Error("The pipeline history table could not be connected to status sorting.");
}

fs.writeFileSync(pageUrl, source);
console.log("Pipeline history status order prepared before rendering.");
