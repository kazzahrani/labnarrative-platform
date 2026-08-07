import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const discoveryPath = path.join(root, "app/admin/discovery/page.tsx");
const automationPath = path.join(root, "app/admin/automation/page.tsx");
const thresholdToken = "__LABNARRATIVE_DISCOVERY_THRESHOLD__";
const markerStart = "/* DISCOVERY_PATCH_COMPAT_START";
const markerEnd = "DISCOVERY_PATCH_COMPAT_END */";

const currentAutomation = fs.readFileSync(automationPath, "utf8");
if (currentAutomation.includes("Engine v2 · evidence first")) {
  console.log("Engine v2 automation page detected; legacy admin-auth and production scoring transforms skipped.");
  process.exit(0);
}

function replaceRequired(source, oldText, newText, label) {
  if (source.includes(newText)) return source;
  if (!source.includes(oldText)) {
    throw new Error(`Could not prepare ${label}: expected pattern was not found.`);
  }
  return source.replace(oldText, newText);
}

// The legacy preparer still contains one-time discovery transforms. Give it harmless
// compatibility markers so it can finish patching the automation page and shared CSS.
let discovery = fs.readFileSync(discoveryPath, "utf8");
discovery = discovery.replace(
  '<input value="75 / 100" readOnly />',
  `<input value="${thresholdToken}" readOnly />`,
);
discovery += `\n\n${markerStart}\n    queued: prospects.filter((item) => item.status === "queued").length,\n    held: prospects.filter((item) => item.status === "qualified" || item.status === "discovered").length,\n            <p className={styles.heroCopy}>The discovery engine searches current academic sources, verifies independent PI status, evaluates website opportunity, removes duplicates and automatically queues prospects scoring 75 or higher.</p>\n          <div className={styles.stat}><span>Queued ≥75</span><strong>{totals.queued}</strong></div>\n          <div className={styles.stat}><span>Held below 75</span><strong>{totals.held}</strong></div>\n                  <input value="75 / 100" readOnly />\n${markerEnd}\n`;
fs.writeFileSync(discoveryPath, discovery);

await import("./prepare-admin-auth.mjs");

// Remove compatibility text and restore the real review-dashboard threshold.
discovery = fs.readFileSync(discoveryPath, "utf8")
  .replace(new RegExp(`/\\* DISCOVERY_PATCH_COMPAT_START[\\s\\S]*?DISCOVERY_PATCH_COMPAT_END \\*/\\s*`, "m"), "")
  .replace(thresholdToken, "75 / 100");
fs.writeFileSync(discoveryPath, discovery);

// Align the production-control interface with the real database gate:
// 75–100 queued, 50–74 held, and 0–49 rejected.
let automation = fs.readFileSync(automationPath, "utf8");
automation = replaceRequired(
  automation,
  '        qualification_reason: form.score >= 50 ? "Meets the automatic production threshold." : form.score >= 20 ? "Held below the automatic production threshold." : "Rejected below the minimum prospect threshold.",\n',
  '        qualification_reason: form.score >= 75 ? "Meets the automatic production threshold." : form.score >= 50 ? "Held below the automatic production threshold." : "Rejected below the minimum prospect threshold.",\n',
  "manual prospect scoring",
);
automation = replaceRequired(
  automation,
  '      setNotice(payload.qualification_score >= 50 ? "Prospect added and queued automatically." : payload.qualification_score >= 20 ? "Prospect added to the held list." : "Prospect added to the rejected list.");\n',
  '      setNotice(payload.qualification_score >= 75 ? "Prospect added and queued automatically." : payload.qualification_score >= 50 ? "Prospect added to the held list." : "Prospect added to the rejected list.");\n',
  "manual intake notice",
);
automation = replaceRequired(
  automation,
  '            <p className={styles.heroCopy}>Prospects scoring 50–100 enter the production queue automatically. Scores 20–49 are held, and scores 0–19 are rejected. The system researches, builds, checks and publishes one PI website at a time.</p>\n',
  '            <p className={styles.heroCopy}>Approved prospects scoring 75–100 enter production. Scores 50–74 are held, and scores 0–49 are rejected. The system researches, builds, checks and publishes one PI website at a time.</p>\n',
  "production hero thresholds",
);
automation = replaceRequired(
  automation,
  '          <div className={styles.stat}><span>Queued 50–100</span><strong>{counts.queued}</strong></div>\n          <div className={styles.stat}><span>Held 20–49</span><strong>{counts.held}</strong></div>\n          <div className={styles.stat}><span>Rejected 0–19</span><strong>{counts.rejected}</strong></div>\n',
  '          <div className={styles.stat}><span>Queued 75–100</span><strong>{counts.queued}</strong></div>\n          <div className={styles.stat}><span>Held 50–74</span><strong>{counts.held}</strong></div>\n          <div className={styles.stat}><span>Rejected 0–49</span><strong>{counts.rejected}</strong></div>\n',
  "production statistics",
);
automation = replaceRequired(
  automation,
  '              <div className={styles.cardHeader}><div><p className={styles.kicker}>Prospect intake</p><h2>Add one PI</h2></div><span className={styles.status} data-status={form.score >= 50 ? "queued" : form.score >= 20 ? "held" : "rejected"}>{form.score >= 50 ? "Auto-queue" : form.score >= 20 ? "Hold" : "Reject"}</span></div>\n',
  '              <div className={styles.cardHeader}><div><p className={styles.kicker}>Prospect intake</p><h2>Add one PI</h2></div><span className={styles.status} data-status={form.score >= 75 ? "queued" : form.score >= 50 ? "held" : "rejected"}>{form.score >= 75 ? "Auto-queue" : form.score >= 50 ? "Hold" : "Reject"}</span></div>\n',
  "manual intake badge",
);
automation = automation
  .replace('Buildable prospects · score 50–100', 'Buildable prospects · score 75–100')
  .replace('Held prospects · score 20–49', 'Held prospects · score 50–74')
  .replace('Rejected prospects · score 0–19', 'Rejected prospects · score 0–49');
fs.writeFileSync(automationPath, automation);

console.log("Admin authentication, discovery review and 75-point production scoring prepared.");
