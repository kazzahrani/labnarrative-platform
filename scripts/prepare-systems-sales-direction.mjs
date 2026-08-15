import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const pagePath = path.resolve(here, "../app/admin/systems-outreach/page.tsx");

let page = fs.readFileSync(pagePath, "utf8");

const replacements = [
  [
    'const filters:Array<{id:Filter;label:string}>=[{id:"all",label:"All"},{id:"ready_to_send",label:"Ready to send"},{id:"contacted",label:"Contacted"},{id:"replied",label:"Replied"},{id:"interested",label:"Interested"},{id:"won",label:"Won"}];',
    'const filters:Array<{id:Filter;label:string}>=[{id:"all",label:"All"},{id:"ready_to_send",label:"Ready to send"},{id:"contacted",label:"Contacted"},{id:"replied",label:"Discovery"},{id:"interested",label:"Demo V2"},{id:"won",label:"Pilot won"}];',
  ],
  [
    'const stageButtons:Array<{value:ProspectStatus;label:string}>=[{value:"ready_to_send",label:"Ready to send"},{value:"contacted",label:"Contacted"},{value:"connected",label:"Connected"},{value:"replied",label:"Replied"},{value:"interested",label:"Interested"},{value:"meeting",label:"Meeting"},{value:"proposal",label:"Proposal"},{value:"won",label:"Won"},{value:"not_fit",label:"Not fit"}];',
    'const stageButtons:Array<{value:ProspectStatus;label:string}>=[{value:"ready_to_send",label:"Teaser ready"},{value:"contacted",label:"Contacted"},{value:"connected",label:"Connected"},{value:"replied",label:"Discovery"},{value:"interested",label:"Demo V2"},{value:"meeting",label:"Internal review"},{value:"proposal",label:"Pilot proposed"},{value:"won",label:"Pilot won"},{value:"not_fit",label:"Not fit"}];',
  ],
  [
    'function prospectStatusLabel(status:ProspectStatus){if(status==="qualified"||status==="concept_ready")return"Preparing";return status.replaceAll("_"," ")}',
    'function prospectStatusLabel(status:ProspectStatus){if(status==="qualified"||status==="concept_ready")return"Preparing teaser";const labels:Partial<Record<ProspectStatus,string>>={ready_to_send:"Teaser ready",replied:"Discovery",interested:"Demo V2",meeting:"Internal review",proposal:"Pilot proposed",won:"Pilot won"};return labels[status]??status.replaceAll("_"," ")}',
  ],
  [
    'Automated research and drafting, human-approved initial email, coordinated LinkedIn outreach, tracked delivery, reply classification and automatic follow-up control.',
    'Discovery-led acquisition: tailored teaser → conversation → workflow discovery → Demo V2 → internal review → paid pilot. Outreach stays human-controlled.',
  ],
  [
    '<article className={styles.metric}><span>Interested</span><strong>{metrics.interested}</strong><small>Positive sales signal</small></article>',
    '<article className={styles.metric}><span>Demo V2</span><strong>{metrics.interested}</strong><small>Discovery progressed</small></article>',
  ],
  [
    '<div><h2>Prospect queue</h2><p>Research and drafts are prepared automatically; outreach remains human-approved.</p></div>',
    '<div><h2>Prospect queue</h2><p>Prepare a useful teaser, earn the conversation, then let discovery shape Demo V2 and the paid pilot.</p></div>',
  ],
  [
    '<div className={styles.modalIntro}>Move the prospect only when the real sales situation changes.</div>',
    '<div className={styles.modalIntro}>Move the prospect only when the real sales situation changes. After a reply, the goal is discovery — not more generic selling.</div>',
  ],
  [
    '<small>Private company-specific concept</small>',
    '<small>Teaser designed to start discovery</small>',
  ],
];

let applied = 0;
for (const [from, to] of replacements) {
  if (page.includes(from)) {
    page = page.replace(from, to);
    applied += 1;
  }
}

fs.writeFileSync(pagePath, page, "utf8");
console.log(`Systems discovery-led sales direction prepared (${applied}/${replacements.length} transforms applied).`);
