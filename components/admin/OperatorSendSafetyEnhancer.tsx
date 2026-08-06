"use client";

import { createClient } from "@supabase/supabase-js";
import { useEffect } from "react";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const LEGACY_LABEL = "Approve website & send email";
const SAFE_LABEL = "Send email now";

function prepareButtons() {
  for (const button of document.querySelectorAll<HTMLButtonElement>("button")) {
    const label = button.textContent?.trim();
    if (label !== LEGACY_LABEL && label !== SAFE_LABEL) continue;

    if (label === LEGACY_LABEL) button.textContent = SAFE_LABEL;
    if (button.dataset.labnarrativeSendButton === "true") continue;

    button.title = "Irreversible: you must type the exact recipient email before sending.";
    button.dataset.labnarrativeSendButton = "true";
  }
}

export default function OperatorSendSafetyEnhancer() {
  useEffect(() => {
    if (window.location.pathname !== "/admin/automation") return;

    let animationFrame = 0;
    const schedulePreparation = () => {
      if (animationFrame) return;
      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = 0;
        prepareButtons();
      });
    };

    prepareButtons();

    const root = document.querySelector("main") ?? document.body;
    const observer = new MutationObserver((mutations) => {
      const buttonAdded = mutations.some((mutation) =>
        Array.from(mutation.addedNodes).some((node) =>
          node instanceof Element && (node.matches("button") || Boolean(node.querySelector("button"))),
        ),
      );
      if (buttonAdded) schedulePreparation();
    });
    observer.observe(root, { childList: true, subtree: true });

    const interceptSend = async (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const button = target.closest<HTMLButtonElement>("button[data-labnarrative-send-button='true']");
      if (!button) return;

      if (button.dataset.labnarrativeSendBypass === "true") {
        delete button.dataset.labnarrativeSendBypass;
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      if (button.dataset.labnarrativeSendProcessing === "true") return;
      button.dataset.labnarrativeSendProcessing = "true";

      try {
        const card = button.closest("section");
        const recipientInput = card?.querySelector<HTMLInputElement>("input[type='email']");
        const subjectInput = card?.querySelector<HTMLInputElement>("input:not([type='email'])");
        const bodyTextarea = card?.querySelector<HTMLTextAreaElement>("textarea");
        const recipient = recipientInput?.value.trim().toLowerCase() || "";

        if (!recipient || !recipient.includes("@")) {
          window.alert("A valid recipient email is required before sending.");
          return;
        }

        const confirmation = window.prompt(
          `This action immediately sends the outreach email and cannot be recalled.\n\nType the exact recipient email to continue:\n${recipient}`,
          "",
        );
        if (confirmation?.trim().toLowerCase() !== recipient) {
          window.alert("The email was not sent. The confirmation did not exactly match the recipient.");
          return;
        }

        const { data: drafts, error: draftError } = await supabase
          .from("outreach_messages")
          .select("id,production_run_id,created_at")
          .eq("recipient_email", recipient)
          .eq("status", "draft")
          .order("created_at", { ascending: false })
          .limit(10);
        if (draftError) throw draftError;
        if (!drafts?.length) throw new Error("No unsent outreach draft was found for this recipient.");

        const runIds = drafts.map((draft) => draft.production_run_id);
        const { data: runs, error: runError } = await supabase
          .from("production_runs")
          .select("id,status")
          .in("id", runIds)
          .eq("status", "awaiting_final_review");
        if (runError) throw runError;

        const activeRunIds = new Set((runs || []).map((run) => run.id));
        const draft = drafts.find((item) => activeRunIds.has(item.production_run_id));
        if (!draft) throw new Error("This concept is no longer awaiting final review.");

        const draftPatch: Record<string, string> = { recipient_email: recipient };
        if (subjectInput?.value.trim()) draftPatch.subject = subjectInput.value.trim();
        if (bodyTextarea?.value) {
          draftPatch.body_text = bodyTextarea.value;
          draftPatch.body_html = "";
        }
        const { error: saveError } = await supabase
          .from("outreach_messages")
          .update(draftPatch)
          .eq("id", draft.id);
        if (saveError) throw saveError;

        const { data: authorized, error: authorizationError } = await supabase.rpc(
          "authorize_operator_send",
          { p_run_id: draft.production_run_id, p_recipient_email: recipient },
        );
        if (authorizationError) throw authorizationError;
        if (authorized !== true) throw new Error("The recipient authorization was not accepted.");

        button.dataset.labnarrativeSendBypass = "true";
        button.click();
      } catch (error) {
        window.alert(error instanceof Error ? error.message : "The email could not be authorized for sending.");
      } finally {
        delete button.dataset.labnarrativeSendProcessing;
      }
    };

    document.addEventListener("click", interceptSend, true);
    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(animationFrame);
      document.removeEventListener("click", interceptSend, true);
    };
  }, []);

  return null;
}
