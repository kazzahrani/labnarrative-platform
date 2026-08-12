"use client";

import { useEffect } from "react";
import { browserSupabase as supabase } from "@/lib/supabase-browser";

type ProspectRow = { id: string; site_id: string | null };
type LinkedInRow = { prospect_id: string; status: "not_contacted" | "message_sent" | "not_found" };
type InitialRow = { prospect_id: string; site_id: string | null; status: string; sent_at: string | null };

function styleLinkedInAction(anchor: HTMLAnchorElement, ready: boolean) {
  anchor.classList.add("ln-linkedin-monitor-action");
  anchor.classList.toggle("ln-linkedin-monitor-ready", ready);
  anchor.style.setProperty("display", "inline-flex", "important");
  anchor.style.setProperty("align-items", "center", "important");
  anchor.style.setProperty("width", "fit-content", "important");
  anchor.style.setProperty("min-height", "30px", "important");
  anchor.style.setProperty("padding", "6px 10px", "important");
  anchor.style.setProperty("border-radius", "8px", "important");
  anchor.style.setProperty("font-size", "12px", "important");
  anchor.style.setProperty("font-weight", "800", "important");
  anchor.style.setProperty("line-height", "1.2", "important");
  anchor.style.setProperty("text-decoration", "none", "important");
  anchor.style.setProperty("white-space", "nowrap", "important");
  if (ready) {
    anchor.style.setProperty("background", "#16a05f", "important");
    anchor.style.setProperty("border", "1px solid #4ade80", "important");
    anchor.style.setProperty("color", "#ffffff", "important");
    anchor.style.setProperty("box-shadow", "0 0 0 1px rgba(74,222,128,.35), 0 0 16px rgba(22,160,95,.5)", "important");
  } else {
    anchor.style.setProperty("background", "transparent", "important");
    anchor.style.setProperty("border", "1px solid #34505c", "important");
    anchor.style.setProperty("color", "#c7d3d0", "important");
    anchor.style.setProperty("box-shadow", "none", "important");
  }
}

function ensureArrow(parent: HTMLElement, primary: HTMLAnchorElement, siteId: string) {
  let arrow: HTMLElement | null = parent.querySelector<HTMLElement>(`[data-linkedin-arrow-for="${siteId}"]`);
  if (!arrow) {
    arrow = (Array.from(parent.children).find((node) => node instanceof HTMLElement && node.textContent?.trim() === "›") as HTMLElement | undefined) ?? null;
  }
  if (!arrow) {
    arrow = document.createElement("span");
    arrow.textContent = "›";
    primary.insertAdjacentElement("afterend", arrow);
  }
  arrow.dataset.linkedinArrowFor = siteId;
  arrow.style.setProperty("color", "#6f8781", "important");
  arrow.style.setProperty("font-size", ".78rem", "important");
  arrow.style.setProperty("font-weight", "900", "important");
  arrow.style.setProperty("line-height", "1", "important");
  return arrow;
}

function ensureAllLinkedInOutreachButton() {
  if (document.querySelector('[data-all-linkedin-outreach="host"]')) return;
  const table = document.querySelector("table");
  const tableWrap = table?.parentElement;
  if (!tableWrap) return;

  const host = document.createElement("div");
  host.dataset.allLinkedinOutreach = "host";
  host.className = "ln-all-linkedin-outreach-host";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "ln-all-linkedin-outreach-button";
  button.textContent = "All LinkedIn outreach";
  button.addEventListener("click", () => {
    const popup = window.open(
      "/admin/linkedin",
      "ln-linkedin-outreach-queue",
      "popup=yes,width=1120,height=900,resizable=yes,scrollbars=yes"
    );
    popup?.focus();
  });

  host.appendChild(button);
  tableWrap.insertAdjacentElement("beforebegin", host);
}

export default function WebsiteLinkedInCueEnhancer() {
  useEffect(() => {
    if (typeof window === "undefined" || !window.location.pathname.startsWith("/admin/sites")) return;

    let cancelled = false;
    let observer: MutationObserver | null = null;
    let applying = false;

    async function apply() {
      if (cancelled || applying) return;
      applying = true;
      try {
        ensureAllLinkedInOutreachButton();

        const [{ data: prospectData }, { data: linkedinData }, { data: initialData }] = await Promise.all([
          supabase.from("prospects").select("id,site_id").not("site_id", "is", null),
          supabase.from("linkedin_outreach").select("prospect_id,status"),
          supabase.from("outreach_messages").select("prospect_id,site_id,status,sent_at").eq("message_kind", "initial").eq("is_test", false),
        ]);
        if (cancelled) return;

        const prospectBySite = new Map<string, string>();
        for (const row of (prospectData || []) as ProspectRow[]) if (row.site_id) prospectBySite.set(row.site_id, row.id);
        const linkedinByProspect = new Map<string, LinkedInRow["status"]>();
        for (const row of (linkedinData || []) as LinkedInRow[]) linkedinByProspect.set(row.prospect_id, row.status);
        const sentBySite = new Set<string>();
        const sentByProspect = new Set<string>();
        for (const row of (initialData || []) as InitialRow[]) {
          const sent = row.status === "sent" || Boolean(row.sent_at);
          if (!sent) continue;
          if (row.site_id) sentBySite.add(row.site_id);
          sentByProspect.add(row.prospect_id);
        }

        const anchors = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href^="/admin/linkedin/"]'));
        for (const anchor of anchors) {
          if (anchor.dataset.linkedinNative === "v4") continue;
          const href = anchor.getAttribute("href") || "";
          if (href.includes("mode=followup") || anchor.dataset.linkedinCue === "followup") continue;
          const match = href.match(/^\/admin\/linkedin\/([0-9a-f-]{36})(?:\?|$)/i);
          if (!match) continue;

          const siteId = match[1];
          const prospectId = prospectBySite.get(siteId) || "";
          const status = prospectId ? linkedinByProspect.get(prospectId) : undefined;
          const emailSent = sentBySite.has(siteId) || (prospectId ? sentByProspect.has(prospectId) : false);
          const primaryReady = emailSent && (!status || status === "not_contacted");

          anchor.dataset.linkedinCue = "primary";
          styleLinkedInAction(anchor, primaryReady);

          const parent = anchor.parentElement;
          if (!parent) continue;

          const followups = Array.from(parent.querySelectorAll<HTMLAnchorElement>(`a[href="/admin/linkedin/${siteId}?mode=followup"], a[data-linkedin-followup-for="${siteId}"]`));
          const arrows = Array.from(parent.querySelectorAll<HTMLElement>(`[data-linkedin-arrow-for="${siteId}"]`));
          for (const child of Array.from(parent.children)) {
            if (child instanceof HTMLElement && child.textContent?.trim() === "›" && !arrows.includes(child)) arrows.push(child);
          }

          if (status === "message_sent") {
            let followup = followups[0];
            for (const duplicate of followups.slice(1)) duplicate.remove();
            if (!followup) {
              followup = document.createElement("a");
              followup.href = `/admin/linkedin/${siteId}?mode=followup`;
              followup.textContent = "LinkedIn follow up";
              parent.appendChild(followup);
            }
            followup.dataset.linkedinCue = "followup";
            followup.dataset.linkedinFollowupFor = siteId;
            styleLinkedInAction(followup, false);
            const arrow = ensureArrow(parent, anchor, siteId);
            if (followup.previousElementSibling !== arrow) arrow.insertAdjacentElement("afterend", followup);
          } else {
            for (const followup of followups) followup.remove();
            for (const arrow of arrows) arrow.remove();
          }
        }
      } finally {
        applying = false;
      }
    }

    void apply();
    observer = new MutationObserver(() => { window.setTimeout(() => void apply(), 30); });
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      cancelled = true;
      observer?.disconnect();
    };
  }, []);

  return <style jsx global>{`
    .ln-all-linkedin-outreach-host {
      display: flex !important;
      justify-content: flex-end !important;
      margin: 0 0 10px !important;
    }
    .ln-all-linkedin-outreach-button {
      border: 1px solid #356f5d !important;
      border-radius: 9px !important;
      background: #214f42 !important;
      color: #eaf5f1 !important;
      padding: 8px 11px !important;
      font: inherit !important;
      font-size: 12px !important;
      font-weight: 850 !important;
      line-height: 1.2 !important;
      cursor: pointer !important;
      box-shadow: none !important;
    }
    .ln-all-linkedin-outreach-button:hover {
      background: #285f50 !important;
      border-color: #43826d !important;
    }
    a.ln-linkedin-monitor-action {
      width: fit-content !important;
      display: inline-flex !important;
      align-items: center !important;
      min-height: 30px !important;
      padding: 6px 10px !important;
      border: 1px solid #34505c !important;
      border-radius: 8px !important;
      background: transparent !important;
      color: #c7d3d0 !important;
      font-size: 12px !important;
      font-weight: 800 !important;
      line-height: 1.2 !important;
      text-decoration: none !important;
      box-shadow: none !important;
    }
    a.ln-linkedin-monitor-ready {
      border-color: #4ade80 !important;
      background: #16a05f !important;
      color: #ffffff !important;
      box-shadow: 0 0 0 1px rgba(74,222,128,.35), 0 0 16px rgba(22,160,95,.5) !important;
    }
  `}</style>;
}
