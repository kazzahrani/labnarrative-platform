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
    const sentAt = new Date().toISOString();

    setWorking(true);
    setNotice("");
    setNoticeError(false);

    try {
      if (message) {
        const { error: messageError } = await supabase
          .from("outreach_messages")
          .update({
            status: "sent",
            sent_at: sentAt,
            error_message: "",
          })
          .eq("id", message.id);
        if (messageError) throw messageError;
      }

      const { error: runError } = await supabase
        .from("production_runs")
        .update({
          status: "completed",
          current_step: "completed",
          completed_at: sentAt,
          error_message: "",
        })
        .eq("id", run.id);
      if (runError) throw runError;

      const { error: prospectError } = await supabase
        .from("prospects")
        .update({ status: "email_sent" })
        .eq("id", run.prospect_id);
      if (prospectError) throw prospectError;

      const { error: eventError } = await supabase
        .from("pipeline_events")
        .insert({
          prospect_id: run.prospect_id,
          production_run_id: run.id,
          event_type: "private_outreach_confirmed",
          step: "send",
          message: piName + " was marked as sent privately by the administrator.",
        });
      if (eventError) throw eventError;

      setNotice(piName + " was marked as sent privately.");
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
  'status: "email_sent"',
  'event_type: "private_outreach_confirmed"',
  ">Mark as sent privately</button>",
  "complete the production record",
]) {
  if (!source.includes(required)) {
    throw new Error(`Private outreach confirmation marker missing: ${required}`);
  }
}

fs.writeFileSync(pageUrl, source);
console.log("Private outreach confirmation action added to Production review cards.");
