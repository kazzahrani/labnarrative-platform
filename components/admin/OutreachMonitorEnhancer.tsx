"use client";

import { createClient } from "@supabase/supabase-js";
import { useEffect } from "react";

type OutreachStatus =
  | "no_response_yet"
  | "not_contacted"
  | "email_1_sent"
  | "email_2_sent"
  | "email_3_sent"
  | "replied"
  | "interested"
  | "meeting_scheduled"
  | "proposal_sent"
  | "client"
  | "not_pursuing";

type OutreachRecord = {
  id: string;
  slug: string;
  status: string;
  outreach_status: OutreachStatus;
};

type OutreachDraft = {
  runId: string;
  piName: string;
  slug: string;
  recipientEmail: string;
  subject: string;
  bodyText: string;
  status: "draft" | "sending" | "failed";
  sentAt?: string | null;
  providerMessageId?: string;
  errorMessage?: string;
};

type OutreachSentDetail = {
  runId: string;
  slug: string;
  piName: string;
  kind: "sent" | "personal";
};

const outreachOptions: Array<{ value: OutreachStatus; label: string }> = [
  { value: "no_response_yet", label: "No response yet" },
  { value: "replied", label: "Replied" },
  { value: "interested", label: "Interested" },
  { value: "meeting_scheduled", label: "Meeting scheduled" },
  { value: "proposal_sent", label: "Proposal sent" },
  { value: "client", label: "Client" },
  { value: "not_pursuing", label: "Closed / not pursuing" },
];

const EMAIL_PROGRESS_STATUSES = new Set<OutreachStatus>([
  "email_1_sent",
  "email_2_sent",
  "email_3_sent",
]);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

function styleSelect(select: HTMLSelectElement) {
  Object.assign(select.style, {
    width: "116px",
    maxWidth: "100%",
    minWidth: "0",
    minHeight: "26px",
    height: "26px",
    padding: "2px 5px",
    border: "1px solid #bac6bf",
    borderRadius: "6px",
    background: "transparent",
    color: "inherit",
    font: "inherit",
    fontSize: "0.49rem",
    fontWeight: "650",
    cursor: "pointer",
  });
}

function styleSendButton(button: HTMLButtonElement) {
  Object.assign(button.style, {
    marginTop: "4px",
    minHeight: "25px",
    padding: "3px 7px",
    border: "1px solid rgba(34,193,181,.55)",
    borderRadius: "6px",
    background: "rgba(34,193,181,.12)",
    color: "#74d8cf",
    font: "inherit",
    fontSize: "0.56rem",
    fontWeight: "800",
    cursor: "pointer",
    whiteSpace: "nowrap",
    transition: "background .16s ease, opacity .16s ease, transform .16s ease",
  });
}

export default function OutreachMonitorEnhancer() {
  useEffect(() => {
    if (window.location.pathname !== "/admin/sites") return;

    let cancelled = false;
    let observer: MutationObserver | null = null;
    let animationFrame = 0;
    const records = new Map<string, OutreachRecord>();

    const scheduleEnhancement = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(enhanceTable);
    };

    const removeOverviewBlocks = () => {
      document.querySelectorAll<HTMLElement>("main section[aria-label='Status definitions'], main section[aria-label='Website totals and status filters']")
        .forEach((section) => section.remove());
    };

    const showFeedback = (element: HTMLElement, message: string, isError = false) => {
      element.textContent = message;
      element.style.color = isError ? "#e58b75" : "#8ba4b8";
      window.setTimeout(() => {
        if (element.textContent === message) element.textContent = "";
      }, 2200);
    };

    const displayStatus = (status: OutreachStatus): OutreachStatus =>
      status === "not_contacted" || EMAIL_PROGRESS_STATUSES.has(status) ? "no_response_yet" : status;

    const saveStatus = async (
      record: OutreachRecord,
      select: HTMLSelectElement,
      feedback: HTMLElement,
      nextStatus: OutreachStatus,
    ) => {
      const previousStatus = record.outreach_status;
      if (
        nextStatus === previousStatus
        || (nextStatus === "no_response_yet" && (previousStatus === "not_contacted" || EMAIL_PROGRESS_STATUSES.has(previousStatus)))
      ) return;

      record.outreach_status = nextStatus;
      select.disabled = true;
      select.style.cursor = "wait";
      select.style.opacity = "0.65";
      feedback.textContent = "Saving…";

      const { error } = await supabase
        .from("sites")
        .update({ outreach_status: nextStatus })
        .eq("id", record.id);

      select.disabled = false;
      select.style.cursor = "pointer";
      select.style.opacity = "1";

      if (error) {
        record.outreach_status = previousStatus;
        select.value = displayStatus(previousStatus);
        showFeedback(feedback, "Could not save", true);
        return;
      }

      showFeedback(feedback, "Saved");
    };

    const prepareAndOpen = async (
      record: OutreachRecord,
      button: HTMLButtonElement,
      feedback: HTMLElement,
    ) => {
      if (record.status !== "concept" || record.outreach_status !== "not_contacted") return;
      const originalLabel = "Send concept";
      button.disabled = true;
      button.textContent = "Preparing…";
      button.style.opacity = "0.56";
      button.style.background = "rgba(34,193,181,.26)";
      button.style.transform = "translateY(1px)";
      feedback.textContent = "";
      let prepared = false;

      try {
        const { data, error } = await supabase.rpc("engine_v2_admin_prepare_site_outreach", {
          p_site_id: record.id,
        });
        if (error) throw error;
        const draft = data as OutreachDraft | null;
        if (!draft?.runId) throw new Error("The outreach draft could not be prepared.");

        prepared = true;
        button.dataset.outreachRunId = draft.runId;
        button.textContent = "Ready to send";
        button.disabled = false;
        button.style.cursor = "pointer";
        button.style.opacity = "0.7";
        button.style.background = "rgba(34,193,181,.24)";
        button.style.transform = "none";

        window.dispatchEvent(new CustomEvent<OutreachDraft>("labnarrative:open-outreach-draft", {
          detail: draft,
        }));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not prepare email";
        showFeedback(feedback, message.replaceAll("_", " "), true);
      } finally {
        if (!prepared) {
          button.disabled = false;
          button.textContent = originalLabel;
          button.style.cursor = "pointer";
          button.style.opacity = "1";
          button.style.background = "rgba(34,193,181,.12)";
          button.style.transform = "none";
        }
      }
    };

    const handleOutreachSent = (event: Event) => {
      const detail = (event as CustomEvent<OutreachSentDetail>).detail;
      if (!detail?.slug) return;

      const record = records.get(detail.slug);
      if (record) record.outreach_status = "email_1_sent";

      const cell = Array.from(document.querySelectorAll<HTMLElement>("[data-outreach-slug]"))
        .find((candidate) => candidate.dataset.outreachSlug === detail.slug);
      if (!cell) return;

      const select = cell.querySelector<HTMLSelectElement>("select[data-outreach-select]");
      if (select) select.value = "no_response_yet";

      const send = cell.querySelector<HTMLButtonElement>("button[data-send-concept]");
      if (send) {
        send.disabled = true;
        send.textContent = "Sent";
        send.style.opacity = "0.42";
        send.style.background = "rgba(34,193,181,.3)";
        window.setTimeout(() => send.remove(), 260);
      }

      const feedback = cell.querySelector<HTMLElement>("small");
      if (feedback) showFeedback(feedback, detail.kind === "personal" ? "Marked sent" : "Sent");
    };

    function enhanceTable() {
      if (cancelled) return;

      removeOverviewBlocks();

      const table = document.querySelector<HTMLTableElement>("main table");
      if (!table) return;

      const headers = Array.from(table.querySelectorAll<HTMLTableCellElement>("thead th"));
      let outreachColumnIndex = headers.findIndex((header) => header.dataset.outreachColumn === "true");

      if (outreachColumnIndex < 0) {
        outreachColumnIndex = headers.findIndex((header) => header.textContent?.trim().startsWith("Updated"));
      }

      if (outreachColumnIndex < 0) return;

      const outreachHeader = headers[outreachColumnIndex];
      outreachHeader.textContent = "Outreach status";
      outreachHeader.dataset.outreachColumn = "true";

      table.querySelectorAll<HTMLTableRowElement>("tbody tr").forEach((row) => {
        const cells = Array.from(row.querySelectorAll<HTMLTableCellElement>(":scope > td"));
        const slug = cells[0]?.querySelector("button")?.textContent?.trim();
        if (!slug) return;

        const record = records.get(slug);
        const cell = cells[outreachColumnIndex];
        if (!record || !cell) return;

        if (cell.dataset.outreachSlug === slug && cell.querySelector("select[data-outreach-select]")) return;

        cell.replaceChildren();
        cell.dataset.label = "Outreach status";
        cell.dataset.outreachSlug = slug;
        cell.style.minWidth = "124px";
        cell.style.width = "124px";

        const select = document.createElement("select");
        select.dataset.outreachSelect = "true";
        select.setAttribute("aria-label", `Outreach status for ${slug}`);
        styleSelect(select);

        outreachOptions.forEach(({ value, label }) => {
          const option = document.createElement("option");
          option.value = value;
          option.textContent = label;
          option.style.fontSize = "0.49rem";
          option.style.fontWeight = "650";
          select.append(option);
        });

        select.value = displayStatus(record.outreach_status || "not_contacted");

        const feedback = document.createElement("small");
        feedback.style.display = "block";
        feedback.style.maxWidth = "116px";
        feedback.style.minHeight = "8px";
        feedback.style.marginTop = "2px";
        feedback.style.fontSize = "0.49rem";
        feedback.style.lineHeight = "1.15";

        select.addEventListener("change", () => {
          void saveStatus(record, select, feedback, select.value as OutreachStatus);
        });

        cell.append(select);

        if (record.status === "concept" && record.outreach_status === "not_contacted") {
          const send = document.createElement("button");
          send.type = "button";
          send.textContent = "Send concept";
          send.dataset.sendConcept = "true";
          styleSendButton(send);
          send.addEventListener("click", () => void prepareAndOpen(record, send, feedback));
          cell.append(send);
        }

        cell.append(feedback);
      });
    }

    const initialize = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session || cancelled) return;

      const { data, error } = await supabase
        .from("sites")
        .select("id,slug,status,outreach_status");

      if (error || cancelled) return;

      (data as OutreachRecord[] | null)?.forEach((record) => {
        records.set(record.slug, {
          ...record,
          outreach_status: record.outreach_status || "not_contacted",
        });
      });

      enhanceTable();
      observer = new MutationObserver(scheduleEnhancement);
      observer.observe(document.body, { childList: true, subtree: true });
      window.addEventListener("labnarrative:outreach-sent", handleOutreachSent as EventListener);
    };

    void initialize();

    return () => {
      cancelled = true;
      observer?.disconnect();
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("labnarrative:outreach-sent", handleOutreachSent as EventListener);
    };
  }, []);

  return null;
}
