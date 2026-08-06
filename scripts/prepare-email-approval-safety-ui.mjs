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

if (!source.includes("async function authorizeAndSend(runId: string, message: OutreachMessage)")) {
  const saveMessageMarker = "  async function saveMessage(message: OutreachMessage) {";
  if (!source.includes(saveMessageMarker)) {
    throw new Error("The email-draft save handler was not found.");
  }

  const sendHandler = `  async function authorizeAndSend(runId: string, message: OutreachMessage) {
    const recipient = message.recipient_email.trim().toLowerCase();
    if (!isValidEmail(recipient)) {
      setNotice("A verified recipient email is required before sending.");
      setNoticeError(true);
      return;
    }

    const confirmation = window.prompt(
      \`This action immediately sends the outreach email and cannot be recalled.\\n\\nType the exact recipient email to continue:\\n\${recipient}\`,
      "",
    );
    if (confirmation?.trim().toLowerCase() !== recipient) {
      setNotice("The email was not sent because the recipient confirmation did not match.");
      setNoticeError(true);
      return;
    }

    setWorking(true);
    setNotice("");
    setNoticeError(false);

    try {
      const { error: saveError } = await supabase
        .from("outreach_messages")
        .update({
          recipient_email: recipient,
          subject: message.subject.trim(),
          body_text: message.body_text,
          body_html: "",
        })
        .eq("id", message.id);
      if (saveError) throw saveError;

      const { data: authorized, error: authorizationError } = await supabase.rpc(
        "authorize_operator_send",
        { p_run_id: runId, p_recipient_email: recipient },
      );
      if (authorizationError) throw authorizationError;
      if (authorized !== true) throw new Error("The recipient authorization was not accepted.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The email could not be authorized for sending.");
      setNoticeError(true);
      setWorking(false);
      return;
    }

    setWorking(false);
    const result = await invokeWorker("approve_send", { runId });
    if (result.status === "email_sent") {
      const completedAt = new Date().toISOString();
      setRuns((current) => current.map((item) => item.id === runId
        ? { ...item, status: "completed", current_step: "completed", completed_at: completedAt }
        : item));
      setProspects((current) => current.map((item) => item.id === message.prospect_id
        ? { ...item, status: "email_sent", updated_at: completedAt }
        : item));
      setMessages((current) => current.map((item) => item.id === message.id
        ? { ...item, status: "sent", sent_at: completedAt }
        : item));
    }
  }

`;

  source = source.replace(saveMessageMarker, `${sendHandler}${saveMessageMarker}`);
}

source = source.replace(
  '<button className={styles.button} type="button" disabled={working || !message} onClick={() => void invokeWorker("approve_send", { runId: run.id })}>Approve website & send email</button>',
  '{message && !isValidEmail(message.recipient_email) ? <p className={`${styles.notice} ${styles.error}`}>A verified recipient email is required before sending.</p> : null}\n                    <button className={styles.button} type="button" disabled={working || !message || !isValidEmail(message.recipient_email)} onClick={() => message && void authorizeAndSend(run.id, message)}>Send email now</button>',
);

if (!source.includes("function isValidEmail(value: string): boolean")) {
  throw new Error("The verified-email helper could not be installed.");
}
if (!source.includes("async function authorizeAndSend(runId: string, message: OutreachMessage)")) {
  throw new Error("The atomic recipient authorization handler could not be installed.");
}
if (!source.includes("onClick={() => message && void authorizeAndSend(run.id, message)}>Send email now</button>")) {
  throw new Error("The guarded send-email action could not be installed.");
}
if (!source.includes('supabase.rpc(\n        "authorize_operator_send"')) {
  throw new Error("The database recipient authorization call is missing.");
}
if (!source.includes("A verified recipient email is required before sending.")) {
  throw new Error("The verified-email warning could not be installed.");
}

fs.writeFileSync(pageUrl, source);
console.log("Recipient confirmation and send authorization moved into the React outreach action.");
