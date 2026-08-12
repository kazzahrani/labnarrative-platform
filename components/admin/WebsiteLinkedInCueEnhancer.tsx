"use client";

import { useEffect } from "react";
import { browserSupabase as supabase } from "@/lib/supabase-browser";

type ProspectRow = { id: string; site_id: string | null };
type LinkedInRow = { prospect_id: string; status: "not_contacted" | "message_sent" | "not_found" };
type InitialRow = { prospect_id: string; site_id: string | null; status: string; sent_at: string | null };

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
          if (anchor.dataset.linkedinCue === "followup") continue;
          const match = anchor.getAttribute("href")?.match(/^\/admin\/linkedin\/([0-9a-f-]{36})(?:\?|$)/i);
          if (!match) continue;
          const siteId = match[1];
          const prospectId = prospectBySite.get(siteId) || "";
          const status = prospectId ? linkedinByProspect.get(prospectId) : undefined;
          const emailSent = sentBySite.has(siteId) || (prospectId ? sentByProspect.has(prospectId) : false);
          const primaryReady = emailSent && (!status || status === "not_contacted");

          anchor.classList.add("ln-linkedin-monitor-action");
          anchor.classList.toggle("ln-linkedin-monitor-ready", primaryReady);
          anchor.dataset.linkedinCue = "primary";

          const parent = anchor.parentElement;
          if (!parent) continue;
          const existing = parent.querySelector<HTMLAnchorElement>(`a[data-linkedin-followup-for="${siteId}"]`);
          if (status === "message_sent") {
            if (!existing) {
              const followup = document.createElement("a");
              followup.href = `/admin/linkedin/${siteId}?mode=followup`;
              followup.textContent = "LinkedIn follow-up";
              followup.dataset.linkedinCue = "followup";
              followup.dataset.linkedinFollowupFor = siteId;
              followup.className = "ln-linkedin-monitor-action ln-linkedin-followup-ready";
              anchor.insertAdjacentElement("afterend", followup);
            }
          } else if (existing) {
            existing.remove();
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
    a.ln-linkedin-monitor-ready,
    a.ln-linkedin-followup-ready {
      border-color: rgba(63,143,113,.72) !important;
      background: #2f6f5e !important;
      color: #f4fbf8 !important;
    }
  `}</style>;
}
