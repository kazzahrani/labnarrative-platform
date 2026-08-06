import fs from "node:fs";

const pageUrl = new URL("../app/admin/automation/page.tsx", import.meta.url);
let source = fs.readFileSync(pageUrl, "utf8");

if (!source.includes("async function markPrivateOutreachSent(")) {
  const functionMarker = "  function updateMessage(id: string, patch: Partial<OutreachMessage>) {";
  if (!source.includes(functionMarker)) {
    throw new Error("The outreach message update marker was not found.");
  }

  const manualConfirmationFunction = `  async function markPrivateOutreachSent(
    run: ProductionRun,
    message?: OutreachMessage,
  ) {
    const piName = run.prospects?.pi_name || run.sites?.content?.piName || "This PI";

    setWorking(true);
    setNotice("");
    setNoticeError(false);

    try {
      const { data, error } = await supabase.rpc("mark_private_outreach_sent", {
        p_run_id: run.id,
      });
      if (error) throw error;

      const result = data as {
        ok?: boolean;
        sentAt?: string;
        alreadyCompleted?: boolean;
      } | null;
      if (result?.ok !== true) {
        throw new Error("The private outreach completion was not accepted.");
      }

      const sentAt = result.sentAt || new Date().toISOString();
      setRuns((current) => current.map((item) => item.id === run.id
        ? { ...item, status: "completed", current_step: "completed", completed_at: sentAt }
        : item));
      setProspects((current) => current.map((item) => item.id === run.prospect_id
        ? { ...item, status: "email_sent", updated_at: sentAt }
        : item));
      if (message) {
        setMessages((current) => current.map((item) => item.id === message.id
          ? { ...item, status: "sent", sent_at: sentAt, provider: "private" }
          : item));
      }

      setNotice(result.alreadyCompleted
        ? piName + " was already recorded as sent privately."
        : piName + " was marked as sent privately.");
      await loadData();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The private outreach could not be recorded.");
      setNoticeError(true);
    } finally {
      setWorking(false);
    }
  }

`;

  source = source.replace(functionMarker, manualConfirmationFunction + functionMarker);
}

if (!source.includes(">Mark as sent privately</button>")) {
  const sendButtonEnd = "}>Send email now</button>";
  if (!source.includes(sendButtonEnd)) {
    throw new Error("The Send email now button was not found.");
  }

  const manualButton = `${sendButtonEnd}\n                    <button className={styles.buttonSecondary} type="button" disabled={working} onClick={() => window.confirm(\`Confirm that \${run.prospects?.pi_name || "this PI"} was contacted privately? This will mark the outreach as sent and complete the production record.\`) && void markPrivateOutreachSent(run, message)}>Mark as sent privately</button>`;
  source = source.replace(sendButtonEnd, manualButton);
}

for (const required of [
  "async function markPrivateOutreachSent(",
  'supabase.rpc("mark_private_outreach_sent"',
  'status: "email_sent"',
  ">Mark as sent privately</button>",
  "complete the production record",
]) {
  if (!source.includes(required)) {
    throw new Error(`Private outreach confirmation marker missing: ${required}`);
  }
}

if (source.includes('.from("outreach_messages")\n          .update({\n            status: "sent"')) {
  throw new Error("The obsolete browser-side private outreach update sequence remains.");
}

fs.writeFileSync(pageUrl, source);
console.log("Private outreach completion now uses one atomic database action.");
