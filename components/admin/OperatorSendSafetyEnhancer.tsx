"use client";

import { useEffect } from "react";
import { browserSupabase as supabase } from "@/lib/supabase-browser";

const LEGACY_LABEL = "Approve website & send email";
const SAFE_LABEL = "Send email now";
const SEND_FEEDBACK_STYLE_ID = "labnarrative-send-feedback-styles";

function ensureSendFeedbackStyles() {
  if (document.getElementById(SEND_FEEDBACK_STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = SEND_FEEDBACK_STYLE_ID;
  style.textContent = `
    button[data-labnarrative-send-button='true'][data-labnarrative-send-state='sending'] {
      filter: brightness(0.72);
      cursor: wait !important;
      transform: translateY(1px);
      opacity: 0.94;
    }

    button[data-labnarrative-send-button='true'][data-labnarrative-send-state='sending'] .labnarrativeSendSpinner {
      display: inline-block;
      width: 0.9em;
      height: 0.9em;
      margin-right: 0.5em;
      border: 2px solid currentColor;
      border-right-color: transparent;
      border-radius: 999px;
      vertical-align: -0.12em;
      animation: labnarrativeSendSpin 0.7s linear infinite;
    }

    button[data-labnarrative-send-button='true'][data-labnarrative-send-state='sent'] {
      filter: brightness(0.82);
      cursor: default !important;
    }

    @keyframes labnarrativeSendSpin {
      to { transform: rotate(360deg); }
    }
  `;
  document.head.append(style);
}

function setSendingState(button: HTMLButtonElement) {
  button.dataset.labnarrativeSendProcessing = "true";
  button.dataset.labnarrativeSendState = "sending";
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  button.innerHTML = '<span class="labnarrativeSendSpinner" aria-hidden="true"></span><span>Sending…</span>';
}

function resetSendState(button: HTMLButtonElement) {
  delete button.dataset.labnarrativeSendProcessing;
  delete button.dataset.labnarrativeSendState;
  button.disabled = false;
  button.removeAttribute("aria-busy");
  button.textContent = SAFE_LABEL;
}

function setSentState(button: HTMLButtonElement) {
  delete button.dataset.labnarrativeSendProcessing;
  button.dataset.labnarrativeSendState = "sent";
  button.disabled = true;
  button.removeAttribute("aria-busy");
  button.textContent = "✓ Sent";
}

function sendScope(button: HTMLButtonElement): HTMLElement | null {
  return (
    button.closest<HTMLElement>("section") ??
    button.closest<HTMLElement>("[role='dialog']") ??
    button.closest<HTMLElement>("main") ??
    button.parentElement
  );
}

function recipientInputFor(scope: HTMLElement): HTMLInputElement | null {
  return scope.querySelector<HTMLInputElement>(
    "input[type='email']:not([data-labnarrative-bcc-input='true'])",
  );
}

async function hydrateBcc(
  scope: HTMLElement,
  toggle: HTMLInputElement,
  input: HTMLInputElement,
) {
  const recipientInput = recipientInputFor(scope);
  const recipient = recipientInput?.value.trim().toLowerCase() || "";
  if (!recipient) return;

  const { data } = await supabase
    .from("outreach_messages")
    .select("bcc_email")
    .eq("recipient_email", recipient)
    .eq("status", "draft")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const bcc = typeof data?.bcc_email === "string" ? data.bcc_email.trim() : "";
  if (!bcc) return;

  toggle.checked = true;
  input.hidden = false;
  input.value = bcc;
}

function ensureBccField(button: HTMLButtonElement) {
  const scope = sendScope(button);
  if (!scope || scope.querySelector("[data-labnarrative-bcc-field='true']")) return;

  const recipientInput = recipientInputFor(scope);
  if (!recipientInput) return;

  const wrapper = document.createElement("div");
  wrapper.className = "bccTestCopyControl";
  wrapper.dataset.labnarrativeBccField = "true";

  const toggleLabel = document.createElement("label");
  toggleLabel.className = "bccTestCopyToggle";

  const toggle = document.createElement("input");
  toggle.type = "checkbox";
  toggle.dataset.labnarrativeBccToggle = "true";

  const toggleText = document.createElement("span");
  toggleText.textContent = "BCC test copy";

  toggleLabel.append(toggle, toggleText);

  const bccInput = document.createElement("input");
  bccInput.type = "email";
  bccInput.placeholder = "Test-copy email — hidden from the PI";
  bccInput.autocomplete = "off";
  bccInput.dataset.labnarrativeBccInput = "true";
  bccInput.setAttribute("aria-label", "BCC test copy email");
  bccInput.hidden = true;

  toggle.addEventListener("change", () => {
    bccInput.hidden = !toggle.checked;
    if (!toggle.checked) {
      bccInput.value = "";
      return;
    }
    window.requestAnimationFrame(() => bccInput.focus());
  });

  wrapper.append(toggleLabel, bccInput);

  const recipientContainer = recipientInput.closest<HTMLElement>("label") ?? recipientInput.parentElement;
  if (recipientContainer?.parentElement) {
    recipientContainer.insertAdjacentElement("afterend", wrapper);
  } else {
    const actions = button.parentElement;
    if (actions?.parentElement) actions.insertAdjacentElement("beforebegin", wrapper);
    else scope.append(wrapper);
  }

  void hydrateBcc(scope, toggle, bccInput);
}

function prepareButtons() {
  for (const button of document.querySelectorAll<HTMLButtonElement>("button")) {
    const label = button.textContent?.trim();
    if (label !== LEGACY_LABEL && label !== SAFE_LABEL) continue;

    if (label === LEGACY_LABEL) button.textContent = SAFE_LABEL;
    button.title = "Send the outreach email immediately.";
    button.dataset.labnarrativeSendButton = "true";
    ensureBccField(button);
  }
}

export default function OperatorSendSafetyEnhancer() {
  useEffect(() => {
    if (window.location.pathname !== "/admin/automation") return;

    ensureSendFeedbackStyles();

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
    const observer = new MutationObserver(() => schedulePreparation());
    observer.observe(root, { childList: true, subtree: true, characterData: true });

    const interceptSend = async (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const button = target.closest<HTMLButtonElement>("button[data-labnarrative-send-button='true']");
      if (!button) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      if (button.dataset.labnarrativeSendProcessing === "true") return;

      let sentSuccessfully = false;
      setSendingState(button);

      try {
        const scope = sendScope(button);
        const recipientInput = scope ? recipientInputFor(scope) : null;
        const bccToggle = scope?.querySelector<HTMLInputElement>(
          "input[data-labnarrative-bcc-toggle='true']",
        );
        const bccInput = scope?.querySelector<HTMLInputElement>(
          "input[data-labnarrative-bcc-input='true']",
        );
        const subjectInput = scope?.querySelector<HTMLInputElement>("input:not([type='email']):not([type='checkbox'])");
        const bodyTextarea = scope?.querySelector<HTMLTextAreaElement>("textarea");
        const recipient = recipientInput?.value.trim().toLowerCase() || "";
        const bcc = bccToggle?.checked ? bccInput?.value.trim().toLowerCase() || "" : "";

        if (!recipient || !recipient.includes("@")) {
          window.alert("A valid recipient email is required before sending.");
          return;
        }
        if (bccToggle?.checked && (!bcc || !bcc.includes("@"))) {
          window.alert("Enter a valid BCC test-copy email or turn the option off.");
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

        const draftPatch: Record<string, string> = {
          recipient_email: recipient,
          bcc_email: bcc,
        };
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

        const { data: sendResult, error: sendError } = await supabase.functions.invoke(
          "operator-send-outreach",
          { body: { runId: draft.production_run_id } },
        );
        if (sendError) {
          let detail = sendError.message;
          const context = (sendError as { context?: unknown }).context;
          if (
            context &&
            typeof context === "object" &&
            "json" in context &&
            typeof (context as { json?: unknown }).json === "function"
          ) {
            const parsed = await (context as { json: () => Promise<unknown> })
              .json()
              .catch(() => ({})) as { error?: string; message?: string };
            detail = parsed.error || parsed.message || detail;
          }
          throw new Error(detail);
        }
        if (sendResult?.error) throw new Error(sendResult.error);

        sentSuccessfully = true;
        setSentState(button);
        window.setTimeout(() => window.location.reload(), 850);
      } catch (error) {
        window.alert(error instanceof Error ? error.message : "The email could not be authorized for sending.");
      } finally {
        if (!sentSuccessfully) resetSendState(button);
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
