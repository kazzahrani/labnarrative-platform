"use client";

import { useEffect } from "react";
import { browserSupabase as supabase } from "@/lib/supabase-browser";

type Site = {
  id: string;
  slug: string;
  outreach_status: string | null;
};

type Prospect = {
  site_id: string | null;
  status: string | null;
};

type Message = {
  site_id: string | null;
  message_kind: string;
  status: string;
  sent_at: string | null;
  follow_up_at: string | null;
  delivery_status: string | null;
  created_at: string;
};

type SiteSequence = {
  site: Site;
  prospectStatus: string;
  initial?: Message;
  follow1?: Message;
  follow2?: Message;
};

const STOP_DELIVERY = new Set(["bounced", "complained", "failed", "suppressed"]);
const HEADER_ATTR = "data-labnarrative-outreach-sequence-header";
const CELL_ATTR = "data-labnarrative-outreach-sequence-cell";

function time(value: string | null | undefined): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function fmt(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Riyadh",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

function latest(current: Message | undefined, candidate: Message): Message {
  if (!current) return candidate;
  return time(candidate.sent_at || candidate.created_at) >= time(current.sent_at || current.created_at)
    ? candidate
    : current;
}

function derive(sequence: SiteSequence): { primary: string; secondary: string; tone: string } {
  const manual = (sequence.site.outreach_status || "").toLowerCase();
  const prospect = sequence.prospectStatus.toLowerCase();

  if (prospect === "replied" || manual === "replied") {
    return { primary: "Replied · stopped", secondary: "No further email", tone: "#52c794" };
  }
  if (prospect === "interested" || manual === "interested") {
    return { primary: "Interested · stopped", secondary: "No further email", tone: "#52c794" };
  }

  const latestSent = [sequence.follow2, sequence.follow1, sequence.initial]
    .find((message) => message?.status === "sent");
  if (latestSent?.delivery_status && STOP_DELIVERY.has(latestSent.delivery_status)) {
    return {
      primary: `Stopped · ${latestSent.delivery_status}`,
      secondary: "No further email",
      tone: "#e58b75",
    };
  }

  if (sequence.follow2?.status === "sent") {
    return { primary: "✓ E1 · ✓ F1 · ✓ F2", secondary: "Complete", tone: "#8ba4b8" };
  }

  if (sequence.follow1?.status === "sent") {
    const due = sequence.follow1.follow_up_at;
    return {
      primary: "✓ E1 · ✓ F1 · ○ F2",
      secondary: due ? `F2 due ${fmt(due)}` : "Sequence stopped",
      tone: due ? "#76b7d8" : "#8ba4b8",
    };
  }

  if (sequence.initial?.status === "sent") {
    const due = sequence.initial.follow_up_at;
    return {
      primary: "✓ E1 · ○ F1 · ○ F2",
      secondary: due ? `F1 due ${fmt(due)}` : "Sequence stopped",
      tone: due ? "#76b7d8" : "#8ba4b8",
    };
  }

  if (manual === "email_1_sent") {
    return { primary: "✓ E1 · ○ F1 · ○ F2", secondary: "Historical outreach", tone: "#76b7d8" };
  }

  return { primary: "Not contacted", secondary: "—", tone: "#8ba4b8" };
}

export default function WebsiteOutreachSequenceEnhancer() {
  useEffect(() => {
    let disposed = false;
    let sequencesBySlug = new Map<string, SiteSequence>();

    const findMonitorTable = (): HTMLTableElement | null => {
      if (window.location.pathname !== "/admin/sites") return null;
      for (const table of Array.from(document.querySelectorAll<HTMLTableElement>("table"))) {
        const headings = Array.from(table.querySelectorAll("thead th")).map((node) => node.textContent?.trim());
        if (headings.includes("Website") && headings.includes("PI and institution") && headings.includes("Website status")) {
          return table;
        }
      }
      return null;
    };

    const apply = () => {
      if (disposed) return;
      const table = findMonitorTable();
      if (!table) return;

      const headerRow = table.querySelector<HTMLTableRowElement>("thead tr");
      if (headerRow && !headerRow.querySelector(`[${HEADER_ATTR}]`)) {
        const header = document.createElement("th");
        header.setAttribute(HEADER_ATTR, "true");
        header.textContent = "Outreach sequence";
        const websiteStatusHeader = Array.from(headerRow.children).find(
          (node) => node.textContent?.trim() === "Website status",
        );
        if (websiteStatusHeader) websiteStatusHeader.insertAdjacentElement("afterend", header);
        else headerRow.appendChild(header);
      }

      for (const row of Array.from(table.querySelectorAll<HTMLTableRowElement>("tbody tr"))) {
        if (row.querySelector(`[${CELL_ATTR}]`)) continue;
        const buttons = Array.from(row.querySelectorAll<HTMLButtonElement>("button"));
        const slugButton = buttons.find((candidate) => sequencesBySlug.has((candidate.textContent || "").trim()));
        const slug = (slugButton?.textContent || "").trim();
        const sequence = sequencesBySlug.get(slug);
        if (!sequence) continue;

        const state = derive(sequence);
        const cell = document.createElement("td");
        cell.setAttribute(CELL_ATTR, "true");
        cell.setAttribute("data-label", "Outreach sequence");
        cell.style.minWidth = "168px";

        const primary = document.createElement("strong");
        primary.textContent = state.primary;
        primary.style.display = "block";
        primary.style.color = state.tone;
        primary.style.fontSize = ".76rem";
        primary.style.lineHeight = "1.35";
        primary.style.whiteSpace = "nowrap";

        const secondary = document.createElement("small");
        secondary.textContent = state.secondary;
        secondary.style.display = "block";
        secondary.style.marginTop = "3px";
        secondary.style.opacity = ".62";
        secondary.style.fontSize = ".68rem";
        secondary.style.whiteSpace = "nowrap";

        cell.append(primary, secondary);

        const websiteStatusCell = Array.from(row.children).find(
          (node) => node.getAttribute("data-label") === "Website status",
        ) || row.children.item(2);
        if (websiteStatusCell) websiteStatusCell.insertAdjacentElement("afterend", cell);
        else row.appendChild(cell);
      }
    };

    const load = async () => {
      if (disposed || window.location.pathname !== "/admin/sites") return;
      const [siteResult, prospectResult, messageResult] = await Promise.all([
        supabase.from("sites").select("id,slug,outreach_status"),
        supabase.from("prospects").select("site_id,status").not("site_id", "is", null),
        supabase
          .from("outreach_messages")
          .select("site_id,message_kind,status,sent_at,follow_up_at,delivery_status,created_at")
          .eq("is_test", false)
          .in("message_kind", ["initial", "followup_1", "followup_2"])
          .not("site_id", "is", null)
          .order("created_at", { ascending: true }),
      ]);

      if (disposed || siteResult.error || prospectResult.error || messageResult.error) return;

      const prospects = new Map<string, string>();
      for (const row of (prospectResult.data || []) as Prospect[]) {
        if (row.site_id) prospects.set(row.site_id, row.status || "");
      }

      const bySite = new Map<string, SiteSequence>();
      for (const site of (siteResult.data || []) as Site[]) {
        bySite.set(site.id, {
          site,
          prospectStatus: prospects.get(site.id) || "",
        });
      }

      for (const message of (messageResult.data || []) as Message[]) {
        if (!message.site_id) continue;
        const sequence = bySite.get(message.site_id);
        if (!sequence) continue;
        if (message.message_kind === "initial" && message.status === "sent") sequence.initial = latest(sequence.initial, message);
        if (message.message_kind === "followup_1") sequence.follow1 = latest(sequence.follow1, message);
        if (message.message_kind === "followup_2") sequence.follow2 = latest(sequence.follow2, message);
      }

      sequencesBySlug = new Map(
        Array.from(bySite.values()).map((sequence) => [sequence.site.slug, sequence]),
      );

      document.querySelectorAll(`[${CELL_ATTR}]`).forEach((node) => node.remove());
      apply();
    };

    const observer = new MutationObserver(() => apply());
    observer.observe(document.body, { childList: true, subtree: true });
    const applyTimer = window.setInterval(apply, 800);
    const refreshTimer = window.setInterval(() => void load(), 15000);
    void load();

    return () => {
      disposed = true;
      observer.disconnect();
      window.clearInterval(applyTimer);
      window.clearInterval(refreshTimer);
      document.querySelectorAll(`[${HEADER_ATTR}], [${CELL_ATTR}]`).forEach((node) => node.remove());
    };
  }, []);

  return null;
}
