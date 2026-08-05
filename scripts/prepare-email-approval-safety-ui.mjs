import fs from "node:fs";

const pageUrl = new URL("../app/admin/automation/page.tsx", import.meta.url);
let source = fs.readFileSync(pageUrl, "utf8");

if (!source.includes("function isValidEmail(value: string): boolean")) {
  const statusTextPattern = /function statusText\(value: string\): string \{[\s\S]*?\n\}/;
  const match = source.match(statusTextPattern);
  if (!match) throw new Error("The generated statusText helper was not found.");

  const emailHelper = `

function isValidEmail(value: string): boolean {
  const candidate = value.trim();
  return /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(candidate)
    && !candidate.toLowerCase().includes("available via")
    && !candidate.toLowerCase().includes("email protected");
}`;

  source = source.replace(statusTextPattern, `${match[0]}${emailHelper}`);
}

source = source.replace(
  '<button className={styles.button} type="button" disabled={working || !message} onClick={() => void invokeWorker("approve_send", { runId: run.id })}>Approve website & send email</button>',
  '{message && !isValidEmail(message.recipient_email) ? <p className={`${styles.notice} ${styles.error}`}>A verified recipient email is required before sending.</p> : null}\n                    <button className={styles.button} type="button" disabled={working || !message || !isValidEmail(message.recipient_email)} onClick={() => message && window.confirm(`Send this email now to ${message.recipient_email}? This action cannot be undone.`) && void invokeWorker("approve_send", { runId: run.id })}>Send email now</button>',
);

if (!source.includes("function isValidEmail(value: string): boolean")) {
  throw new Error("The verified-email helper could not be installed.");
}
if (!source.includes("This action cannot be undone.")) {
  throw new Error("The irreversible-send confirmation could not be installed.");
}
if (!source.includes("A verified recipient email is required before sending.")) {
  throw new Error("The verified-email warning could not be installed.");
}

fs.writeFileSync(pageUrl, source);
console.log("Email approval safety interface prepared.");
