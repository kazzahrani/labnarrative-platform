import fs from "node:fs";

const pageUrl = new URL("../app/admin/automation/page.tsx", import.meta.url);
let source = fs.readFileSync(pageUrl, "utf8");

const oldCopy = "Qualified prospects enter the production queue automatically. The system researches, builds, checks and publishes one PI website at a time. Your only standard checkpoint is the finished website and email.";
const newCopy = "Qualified prospects enter production automatically. The scheduler checks the queue every minute, continues domain checks, and builds one PI website at a time. Your standard checkpoint remains the finished website and email.";

const oldButton = '            <button className={styles.button} type="button" disabled={working || Boolean(activeRun)} onClick={() => void invokeWorker("start_next")}>Build next queued PI</button>\n';
const automaticStatus = '            <span className={styles.status} data-status="running">Automatic runner active</span>\n';

if (source.includes(oldCopy)) {
  source = source.replace(oldCopy, newCopy);
}

if (source.includes(oldButton)) {
  source = source.replace(oldButton, automaticStatus);
}

if (!source.includes(newCopy)) {
  throw new Error("The automatic-production hero copy could not be prepared.");
}

if (!source.includes(automaticStatus.trim())) {
  throw new Error("The manual production button could not be replaced.");
}

if (source.includes("Build next queued PI")) {
  throw new Error("The manual production button is still present.");
}

fs.writeFileSync(pageUrl, source);
console.log("Automatic PI production interface prepared.");
