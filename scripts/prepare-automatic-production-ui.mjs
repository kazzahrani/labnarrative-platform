import fs from "node:fs";

const pageUrl = new URL("../app/admin/automation/page.tsx", import.meta.url);
let source = fs.readFileSync(pageUrl, "utf8");

const automaticCopy = "Qualified prospects enter production automatically. The scheduler checks the queue every minute, continues domain checks, and builds one PI website at a time. Your standard checkpoint remains the finished website and email.";
const automaticStatus = '            <span className={styles.status} data-status="running">Automatic runner active</span>\n';

source = source.replace(
  /Qualified prospects enter[^<]*finished website and email\./,
  automaticCopy,
);

source = source.replace(
  /^[ \t]*<button[^\n]*Build next queued PI<\/button>\n?/m,
  automaticStatus,
);

if (!source.includes(automaticStatus.trim())) {
  throw new Error("The manual production button could not be replaced.");
}

if (source.includes("Build next queued PI")) {
  throw new Error("The manual production button is still present.");
}

fs.writeFileSync(pageUrl, source);
console.log("Automatic PI production interface prepared.");
