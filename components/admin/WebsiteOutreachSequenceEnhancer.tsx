"use client";

import { useEffect } from "react";
import { browserSupabase as supabase } from "@/lib/supabase-browser";

type Site = { id: string; slug: string; outreach_status: string | null };
type Prospect = { id: string; site_id: string | null; status: string | null };
type Message = {
  site_id: string | null;
  message_kind: string;
  status: string;
  sent_at: string | null;
  follow_up_at: string | null;
  delivery_status: string | null;
  created_at: string;
};
type Reply = {
  prospect_id: string;
  received_at: string;
  reply_kind: string;
};
type SiteSequence = {
  site: Site;
  prospectId: string;
  prospectStatus: string;
  initial?: Message;
  follow1?: Message;
  follow2?: Message;
  latestAutoReplyAt?: string;
};
type SequenceState = {
  label: string;
  secondary: string;
  tone: string;
  active: boolean;
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

function derive(sequence: SiteSequence): SequenceState {
  const manual = (sequence.site.outreach_status || "").toLowerCase();
  const prospect = sequence.prospectStatus.toLowerCase();

  if (prospect === "replied" || manual === "replied") {
    return { label: "Replied · stopped", secondary: "No further email", tone: "#52c794", active: false };
  }
  if (prospect === "interested" || manual === "interested") {
    return { label: "Interested · stopped", secondary: "No further email", tone: "#52c794", active: false };
  }
  if (prospect === "rejected" || manual === "rejected") {
    return { label: "Rejected · stopped", secondary: "No further email", tone: "#8ba4b8", active: false };
  }
  if (prospect === "paused" || manual === "paused") {
    return { label: "Paused · stopped", secondary: "No further email", tone: "#8ba4b8", active: false };
  }

  const latestSent = [sequence.follow2, sequence.follow1, sequence.initial].find((message) => message?.status === "sent");
  if (latestSent?.delivery_status && STOP_DELIVERY.has(latestSent.delivery_status)) {
    return { label: `Stopped · ${latestSent.delivery_status}`, secondary: "No further email", tone: "#e58b75", active: false };
  }

  if (sequence.follow2?.status === "sending") {
    return { label: "Follow-up 2 sending", secondary: "Automatic delivery in progress", tone: "#e0b568", active: true };
  }
  if (sequence.follow1?.status === "sending") {
    return { label: "Follow-up 1 sending", secondary: "Automatic delivery in progress", tone: "#e0b568", active: true };
  }

  if (sequence.follow2?.status === "sent") {
    return { label: "Complete", secondary: "Three-message sequence finished", tone: "#8ba4b8", active: false };
  }

  if (sequence.follow1?.status === "sent") {
    const due = sequence.follow1.follow_up_at;
    return {
      label: due ? "Follow-up 1 sent" : "Stopped",
      secondary: due ? `Follow-up 2 automatic · ${fmt(due)}` : "No further email",
      tone: due ? "#76b7d8" : "#8ba4b8",
      active: Boolean(due),
    };
  }

  if (sequence.initial?.status === "sent") {
    const due = sequence.initial.follow_up_at;
    return {
      label: due ? "Email 1 sent" : "Stopped",
      secondary: due ? `Follow-up 1 automatic · ${fmt(due)}` : "No further email",
      tone: due ? "#76b7d8" : "#8ba4b8",
      active: Boolean(due),
    };
  }

  if (manual === "email_1_sent") {
    return { label: "Email 1 sent", secondary: "Historical outreach", tone: "#76b7d8", active: false };
  }

  return { label: "Not contacted", secondary: "No sequence started", tone: "#8ba4b8", active: false };
}

function mark(message: Message | undefined): string {
  if (message?.status === "sent") return "✓";
  if (message?.status === "sending") return "◐";
  return "○";
}

export default function WebsiteOutreachSequenceEnhancer() {
  useEffect(() => {
    let disposed = false;
    let sequencesBySlug = new Map<string, SiteSequence>();
    let loading = false;

    const findMonitorTable = (): HTMLTableElement | null => {
      if (window.location.pathname !== "/admin/sites") return null;
      for (const table of Array.from(document.querySelectorAll<HTMLTableElement>("table"))) {
        const headings = Array.from(table.querySelectorAll("thead th")).map((node) => node.textContent?.trim());
        if (headings.includes("Website") && headings.includes("PI and institution") && headings.includes("Website status")) return table;
      }
      return null;
    };

    const load = async () => {
      if (disposed || loading || window.location.pathname !== "/admin/sites") return;
      loading = true;
      try {
        const [siteResult, prospectResult, messageResult, replyResult] = await Promise.all([
          supabase.from("sites").select("id,slug,outreach_status"),
          supabase.from("prospects").select("id,site_id,status").not("site_id", "is", null),
          supabase
            .from("outreach_messages")
            .select("site_id,message_kind,status,sent_at,follow_up_at,delivery_status,created_at")
            .eq("is_test", false)
            .in("message_kind", ["initial", "followup_1", "followup_2"])
            .not("site_id", "is", null)
            .order("created_at", { ascending: true }),
          supabase
            .from("outreach_replies")
            .select("prospect_id,received_at,reply_kind")
            .eq("reply_kind", "automatic")
            .order("received_at", { ascending: false }),
        ]);

        if (disposed || siteResult.error || prospectResult.error || messageResult.error || replyResult.error) return;

        const prospects = new Map<string, Prospect>();
        const siteByProspect = new Map<string, string>();
        for (const row of (prospectResult.data || []) as Prospect[]) {
          if (row.site_id && !prospects.has(row.site_id)) prospects.set(row.site_id, row);
          if (row.site_id) siteByProspect.set(row.id, row.site_id);
        }

        const bySite = new Map<string, SiteSequence>();
        for (const site of (siteResult.data || []) as Site[]) {
          const prospect = prospects.get(site.id);
          bySite.set(site.id, {
            site,
            prospectId: prospect?.id || "",
            prospectStatus: prospect?.status || "",
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

        for (const reply of (replyResult.data || []) as Reply[]) {
          const siteId = siteByProspect.get(reply.prospect_id);
          if (!siteId) continue;
          const sequence = bySite.get(siteId);
          if (!sequence) continue;
          if (!sequence.latestAutoReplyAt || time(reply.received_at) > time(sequence.latestAutoReplyAt)) {
            sequence.latestAutoReplyAt = reply.received_at;
          }
        }

        sequencesBySlug = new Map(Array.from(bySite.values()).map((sequence) => [sequence.site.slug, sequence]));
        document.querySelectorAll(`[${CELL_ATTR}]`).forEach((node) => node.remove());
        apply();
      } finally {
        loading = false;
      }
    };

    const stopSequence = async (sequence: SiteSequence, button: HTMLButtonElement) => {
      if (!sequence.prospectId) return;
      if (!window.confirm("Stop all remaining automatic follow-ups for this PI?")) return;
      button.disabled = true;
      button.textContent = "Stopping…";
      const { error } = await supabase.rpc("manual_stop_outreach_sequence", { p_prospect_id: sequence.prospectId });
      if (error) {
        button.disabled = false;
        button.textContent = "Stop sequence";
        window.alert(error.message);
        return;
      }
      await load();
    };

    const apply = () => {
      if (disposed) return;
      const table = findMonitorTable();
      if (!table) return;

      const headerRow = table.querySelector<HTMLTableRowElement>("thead tr");
      if (!headerRow) return;

      const outreachHeader = Array.from(headerRow.children).find((node) =>
        (node as HTMLElement).dataset.outreachColumn === "true" || node.textContent?.trim() === "Outreach status"
      );
      if (!outreachHeader) return;

      let automaticHeader = headerRow.querySelector<HTMLElement>(`[${HEADER_ATTR}]`);
      if (!automaticHeader) {
        automaticHeader = document.createElement("th");
        automaticHeader.setAttribute(HEADER_ATTR, "true");
        automaticHeader.textContent = "Automatic follow-up";
      }
      if (outreachHeader.nextElementSibling !== automaticHeader) {
        outreachHeader.insertAdjacentElement("afterend", automaticHeader);
      }

      for (const row of Array.from(table.querySelectorAll<HTMLTableRowElement>("tbody tr"))) {
        const outreachCell = Array.from(row.children).find((node) => node.getAttribute("data-label") === "Outreach status") as HTMLElement | undefined;
        if (!outreachCell) continue;

        const existingCell = row.querySelector<HTMLElement>(`[${CELL_ATTR}]`);
        if (existingCell) {
          if (outreachCell.nextElementSibling !== existingCell) outreachCell.insertAdjacentElement("afterend", existingCell);
          continue;
        }

        const buttons = Array.from(row.querySelectorAll<HTMLButtonElement>("button"));
        const slugButton = buttons.find((candidate) => sequencesBySlug.has((candidate.textContent || "").trim()));
        const slug = (slugButton?.textContent || "").trim();
        const sequence = sequencesBySlug.get(slug);
        if (!sequence) continue;

        const state = derive(sequence);
        const cell = document.createElement("td");
        cell.setAttribute(CELL_ATTR, "true");
        cell.setAttribute("data-label", "Automatic follow-up");
        cell.style.minWidth = "230px";

        const statusLine = document.createElement("div");
        statusLine.style.display = "flex";
        statusLine.style.alignItems = "center";
        statusLine.style.gap = "7px";
        statusLine.style.flexWrap = "wrap";

        const primary = document.createElement("strong");
        primary.textContent = state.label;
        primary.style.color = state.tone;
        primary.style.fontSize = ".72rem";
        primary.style.lineHeight = "1.3";

        const automatic = document.createElement("span");
        automatic.textContent = "AUTOMATIC";
        automatic.style.padding = "2px 5px";
        automatic.style.borderRadius = "999px";
        automatic.style.background = "rgba(82,199,148,.10)";
        automatic.style.color = "#52c794";
        automatic.style.fontSize = ".54rem";
        automatic.style.fontWeight = "800";
        automatic.style.letterSpacing = ".04em";

        statusLine.append(primary, automatic);

        const progress = document.createElement("div");
        progress.textContent = `${sequence.initial?.status === "sent" ? "✓" : "○"} E1  →  ${mark(sequence.follow1)} F1  →  ${mark(sequence.follow2)} F2`;
        progress.style.marginTop = "4px";
        progress.style.fontSize = ".66rem";
        progress.style.fontWeight = "700";
        progress.style.opacity = ".82";
        progress.style.whiteSpace = "nowrap";

        const secondary = document.createElement("small");
        secondary.textContent = state.secondary;
        secondary.style.display = "block";
        secondary.style.marginTop = "3px";
        secondary.style.opacity = ".62";
        secondary.style.fontSize = ".64rem";
        secondary.style.lineHeight = "1.3";
        secondary.style.whiteSpace = "nowrap";

        cell.append(statusLine, progress, secondary);

        if (sequence.latestAutoReplyAt) {
          const autoReply = document.createElement("small");
          autoReply.textContent = `↪ Auto-reply received · ${fmt(sequence.latestAutoReplyAt)} · sequence continues`;
          autoReply.style.display = "block";
          autoReply.style.marginTop = "4px";
          autoReply.style.color = "#e0b568";
          autoReply.style.fontSize = ".62rem";
          autoReply.style.fontWeight = "700";
          autoReply.style.lineHeight = "1.3";
          autoReply.style.whiteSpace = "nowrap";
          cell.appendChild(autoReply);
        }

        if (state.active && sequence.prospectId) {
          const stop = document.createElement("button");
          stop.type = "button";
          stop.textContent = "Stop sequence";
          stop.style.marginTop = "6px";
          stop.style.border = "1px solid rgba(148,163,184,.25)";
          stop.style.borderRadius = "999px";
          stop.style.padding = "4px 7px";
          stop.style.background = "transparent";
          stop.style.color = "inherit";
          stop.style.font = "inherit";
          stop.style.fontSize = ".6rem";
          stop.style.fontWeight = "750";
          stop.style.cursor = "pointer";
          stop.addEventListener("click", () => void stopSequence(sequence, stop));
          cell.appendChild(stop);
        }

        outreachCell.insertAdjacentElement("afterend", cell);
      }
    };

    const observer = new MutationObserver(() => apply());
    observer.observe(document.body, { childList: true, subtree: true });
    const applyTimer = window.setInterval(apply, 800);
    const refreshTimer = window.setInterval(() => void load(), 15000);
    void load();

    const channel = supabase.channel("labnarrative-website-outreach-table")
      .on("postgres_changes", { event: "*", schema: "public", table: "outreach_messages" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "prospects" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "outreach_replies" }, () => void load())
      .subscribe();

    return () => {
      disposed = true;
      observer.disconnect();
      window.clearInterval(applyTimer);
      window.clearInterval(refreshTimer);
      void supabase.removeChannel(channel);
      document.querySelectorAll(`[${HEADER_ATTR}], [${CELL_ATTR}]`).forEach((node) => node.remove());
    };
  }, []);

  return null;
}
