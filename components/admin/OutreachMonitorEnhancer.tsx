"use client";

import { createClient } from "@supabase/supabase-js";
import { useEffect } from "react";

type OutreachStatus =
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
  outreach_status: OutreachStatus;
};

const outreachOptions: Array<{ value: OutreachStatus; label: string }> = [
  { value: "not_contacted", label: "Not contacted" },
  { value: "email_1_sent", label: "Email 1 sent" },
  { value: "email_2_sent", label: "Email 2 sent" },
  { value: "email_3_sent", label: "Email 3 sent" },
  { value: "replied", label: "Replied" },
  { value: "interested", label: "Interested" },
  { value: "meeting_scheduled", label: "Meeting scheduled" },
  { value: "proposal_sent", label: "Proposal sent" },
  { value: "client", label: "Client" },
  { value: "not_pursuing", label: "Closed / not pursuing" },
];

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

function styleSelect(select: HTMLSelectElement) {
  Object.assign(select.style, {
    width: "100%",
    minWidth: "150px",
    minHeight: "36px",
    padding: "7px 9px",
    border: "1px solid #bac6bf",
    borderRadius: "5px",
    background: "transparent",
    color: "inherit",
    font: "inherit",
    fontSize: "0.68rem",
    fontWeight: "700",
    cursor: "pointer",
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

    const showFeedback = (element: HTMLElement, message: string, isError = false) => {
      element.textContent = message;
      element.style.color = isError ? "#b85c5c" : "#6d7a74";
      window.setTimeout(() => {
        if (element.textContent === message) element.textContent = "";
      }, 1800);
    };

    const saveStatus = async (
      record: OutreachRecord,
      select: HTMLSelectElement,
      feedback: HTMLElement,
      nextStatus: OutreachStatus,
    ) => {
      const previousStatus = record.outreach_status;
      if (nextStatus === previousStatus) return;

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
        select.value = previousStatus;
        showFeedback(feedback, "Could not save", true);
        return;
      }

      showFeedback(feedback, "Saved");
    };

    function enhanceTable() {
      if (cancelled) return;

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

        const select = document.createElement("select");
        select.dataset.outreachSelect = "true";
        select.setAttribute("aria-label", `Outreach status for ${slug}`);
        styleSelect(select);

        outreachOptions.forEach(({ value, label }) => {
          const option = document.createElement("option");
          option.value = value;
          option.textContent = label;
          select.append(option);
        });

        select.value = record.outreach_status || "not_contacted";

        const feedback = document.createElement("small");
        feedback.style.display = "block";
        feedback.style.minHeight = "14px";
        feedback.style.marginTop = "4px";
        feedback.style.fontSize = "0.58rem";

        select.addEventListener("change", () => {
          void saveStatus(record, select, feedback, select.value as OutreachStatus);
        });

        cell.append(select, feedback);
      });
    }

    const initialize = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session || cancelled) return;

      const { data, error } = await supabase
        .from("sites")
        .select("id,slug,outreach_status");

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
    };

    void initialize();

    return () => {
      cancelled = true;
      observer?.disconnect();
      window.cancelAnimationFrame(animationFrame);
    };
  }, []);

  return null;
}
