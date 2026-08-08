"use client";

import { useEffect } from "react";
import { browserSupabase as supabase } from "@/lib/supabase-browser";

const ACTIONS: Record<string, { decision: "approve" | "return_build" | "return_assets" | "cancel"; busy: string }> = {
  "Approve": { decision: "approve", busy: "Approving…" },
  "Return to Build": { decision: "return_build", busy: "Returning…" },
  "Return to Assets": { decision: "return_assets", busy: "Returning…" },
  "Cancel": { decision: "cancel", busy: "Cancelling…" },
};

function slugFromCard(button: HTMLButtonElement): string {
  const card = button.closest<HTMLElement>("article");
  const text = card?.textContent || "";
  const match = text.match(/([a-z0-9-]+)\.labnarrative\.com/i);
  return match?.[1]?.toLowerCase() || "";
}

export default function EngineV2FinalReviewActions() {
  useEffect(() => {
    if (window.location.pathname !== "/admin/automation") return;

    const handleClick = async (event: MouseEvent) => {
      if (event.button !== 0) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const button = target.closest<HTMLButtonElement>("button");
      if (!button) return;

      const originalLabel = button.textContent?.trim() || "";
      const action = ACTIONS[originalLabel];
      if (!action) return;

      const slug = slugFromCard(button);
      if (!slug) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      if (button.dataset.engineV2ReviewBusy === "true") return;
      button.dataset.engineV2ReviewBusy = "true";
      button.disabled = true;
      button.textContent = action.busy;
      button.style.cursor = "wait";

      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 8000);

      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) throw new Error("Administrator session is not available. Reload the page and sign in again.");

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
        const response = await fetch(`${supabaseUrl}/rest/v1/rpc/engine_v2_admin_review_by_slug`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": anonKey,
            "Authorization": `Bearer ${token}`,
          },
          body: JSON.stringify({ p_slug: slug, p_decision: action.decision, p_note: null }),
          signal: controller.signal,
          cache: "no-store",
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => ({})) as { message?: string; hint?: string; details?: string };
          throw new Error(payload.message || payload.details || payload.hint || `Review action failed (${response.status}).`);
        }

        window.location.reload();
      } catch (error) {
        button.disabled = false;
        button.textContent = originalLabel;
        button.style.cursor = "";
        delete button.dataset.engineV2ReviewBusy;
        window.alert(error instanceof Error && error.name === "AbortError"
          ? "The review action timed out. No page lock was left behind; please try again."
          : error instanceof Error ? error.message : "The review action could not be saved.");
      } finally {
        window.clearTimeout(timeout);
      }
    };

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, []);

  return null;
}
