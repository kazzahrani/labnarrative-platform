import fs from "node:fs";

const pageUrl = new URL("../app/admin/automation/page.tsx", import.meta.url);
let source = fs.readFileSync(pageUrl, "utf8");

if (!source.includes("function isValidEmail(value: string): boolean")) {
  source = source.replace(
    'function statusText(value: string): string {\n  return value.replaceAll("_", " ");\n}\n',
    'function statusText(value: string): string {\n  return value.replaceAll("_", " ");\n}\n\nfunction isValidEmail(value: string): boolean {\n  const candidate = value.trim();\n  return /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(candidate)\n    && !candidate.toLowerCase().includes("available via")\n    && !candidate.toLowerCase().includes("email protected");\n}\n',
  );
}

source = source.replace(
  '<button className={styles.button} type="button" disabled={working || !message} onClick={() => void invokeWorker("approve_send", { runId: run.id })}>Approve website & send email</button>',
  '{message && !isValidEmail(message.recipient_email) ? <p className={`${styles.notice} ${styles.error}`}>A verified recipient email is required before sending.</p> : null}\n                    <button className={styles.button} type="button" disabled={working || !message || !isValidEmail(message.recipient_email)} onClick={() => message && window.confirm(`Send this email now to ${message.recipient_email}? This action cannot be undone.`) && void invokeWorker("approve_send", { runId: run.id })}>Send email now</button>',
);

if (!source.includes("This action cannot be undone.")) {
  throw new Error("The irreversible-send confirmation could not be installed.");
}
if (!source.includes("A verified recipient email is required before sending.")) {
  throw new Error("The verified-email warning could not be installed.");
}

fs.writeFileSync(pageUrl, source);
console.log("Email approval safety interface prepared.");
