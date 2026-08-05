import fs from "node:fs";

const pageUrl = new URL("../app/admin/automation/page.tsx", import.meta.url);
let source = fs.readFileSync(pageUrl, "utf8");

const desiredHero = "The automation builds one website at a time, automatically diagnoses and repairs QA failures in a separate recovery lane, and accumulates completed live concepts in a ten-concept review buffer. If automatic recovery cannot solve a concept after three different attempts, the concept is preserved in Waiting for manual fix rather than rejected or archived.";
source = source.replace(
  /<p className=\{styles\.heroCopy\}>[^<]*<\/p>/,
  `<p className={styles.heroCopy}>${desiredHero}</p>`,
);

source = source.replace(
  /function statusText\(value: string\): string \{\n  return value\.replaceAll\("_", " "\);\n\}/,
  `function statusText(value: string): string {\n  if (value === "paused") return "waiting for manual fix";\n  return value.replaceAll("_", " ");\n}`,
);

source = source.replace(
  /const activeRun = useMemo\(\s*\(\) => runs\.find\(\(run\) => \[[^\]]+\]\.includes\(run\.status\)\),\s*\[runs\],\s*\);/m,
  `const activeRun = useMemo(\n    () => runs.find((run) => run.status === "running") ?? runs.find((run) => run.status === "paused"),\n    [runs],\n  );`,
);
source = source.replace(
  /const activeRun = useMemo\(\s*\(\) => runs\.find\(\(run\) => run\.status === "running"\) \?\? runs\.find\(\(run\) => \["needs_attention", "paused"\]\.includes\(run\.status\)\),\s*\[runs\],\s*\);/m,
  `const activeRun = useMemo(\n    () => runs.find((run) => run.status === "running") ?? runs.find((run) => run.status === "paused"),\n    [runs],\n  );`,
);

if (!source.includes("review: runs.filter")) {
  source = source.replace(
    /    attention: prospects\.filter\(\(item\) => item\.status === "needs_attention"\)\.length,\n  \}\), \[prospects\]\);/,
    `    attention: prospects.filter((item) => item.status === "needs_attention").length,\n    review: runs.filter((run) => ["awaiting_final_review", "revision_requested", "approved_to_send"].includes(run.status)).length,\n  }), [prospects, runs]);`,
  );
}

source = source.replace(
  /<span className=\{styles\.status\} data-status="running">Automatic runner active(?: · \{counts\.review\}\/10 awaiting review)?<\/span>/,
  `<span className={styles.status} data-status="running">Automatic runner active · {counts.review}/10 awaiting review</span>`,
);

if (!source.includes("<span>Review buffer</span>")) {
  source = source.replace(
    /(<div className=\{styles\.stat\}><span>Queued[^<]*<\/span><strong>\{counts\.queued\}<\/strong><\/div>\n)/,
    `$1          <div className={styles.stat}><span>Review buffer</span><strong>{counts.review}/10</strong></div>\n`,
  );
}

source = source.replaceAll("<span>Needs attention</span>", "<span>Automatic recovery</span>");
source = source.replaceAll("Your single approval gate", "Awaiting final review");

if (!source.includes(desiredHero)) throw new Error("The review-buffer explanation could not be added.");
if (!source.includes('if (value === "paused") return "waiting for manual fix"')) throw new Error("The manual-fix status label could not be added.");
if (!source.includes("counts.review}/10")) throw new Error("The review-buffer counter could not be added.");
if (!source.includes("<span>Automatic recovery</span>")) throw new Error("The automatic-recovery dashboard label could not be added.");
if (source.includes("Build next queued PI")) throw new Error("The obsolete manual start control is still present after UI preparation.");

fs.writeFileSync(pageUrl, source);
console.log("Review buffer, automatic recovery and manual-fix interface prepared.");
