"use client";

import { useEffect } from "react";
import { browserSupabase as supabase } from "@/lib/supabase-browser";

function slugFromCard(button: HTMLButtonElement): string {
  const card = button.closest<HTMLElement>("article");
  const text = card?.textContent || "";
  const match = text.match(/([a-z0-9-]+)\.labnarrative\.com/i);
  return match?.[1]?.toLowerCase() || "";
}

function relabelApproveButtons() {
  if (window.location.pathname !== "/admin/automation") return;
  document.querySelectorAll<HTMLButtonElement>("button").forEach((button) => {
    if (button.textContent?.trim() === "Approve") button.textContent = "Approve & Publish";
  });
}

export default function EngineV2ApprovePublishEnhancer() {
  useEffect(() => {
    if (window.location.pathname !== "/admin/automation") return;

    // The dashboard loads asynchronously. A few bounded one-shot relabels keep the
    // visible action simple without introducing a page-wide observer or polling loop.
    const timers = [0, 350, 900, 1800].map((delay) => window.setTimeout(relabelApproveButtons, delay));

    const handleClick = async (event: MouseEvent) => {
      if (event.button !== 0) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const button = target.closest<HTMLButtonElement>("button");
      const label = button?.textContent?.trim();
      if (!button || (label !== "Approve" && label !== "Approve & Publish")) return;

      const slug = slugFromCard(button);
      if (!slug) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      if (button.dataset.engineV2ApprovePublishBusy === "true") return;
      button.dataset.engineV2ApprovePublishBusy = "true";
      button.disabled = true;
      button.textContent = "Approving…";
      button.style.cursor = "wait";

      let approved = false;

      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) throw new Error("Administrator session is not available. Reload the page and sign in again.");

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

        const callRpc = async <T,>(name: string, body: Record<string, unknown>): Promise<T> => {
          const controller = new AbortController();
          const timeout = window.setTimeout(() => controller.abort(), 8000);
          try {
            const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                apikey: anonKey,
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify(body),
              signal: controller.signal,
              cache: "no-store",
            });

            const payload = await response.json().catch(() => ({})) as T & { message?: string; details?: string; hint?: string };
            if (!response.ok) {
              throw new Error(payload.message || payload.details || payload.hint || `${name} failed (${response.status}).`);
            }
            return payload;
          } finally {
            window.clearTimeout(timeout);
          }
        };

        // Resolve the current live run by slug at click time. This deliberately does
        // not trust a run id held by an older dashboard render.
        const review = await callRpc<{ runId?: string }>("engine_v2_admin_review_by_slug", {
          p_slug: slug,
          p_decision: "approve",
          p_note: null,
        });

        if (!review.runId) throw new Error("Approval succeeded but the current run identifier was not returned.");
        approved = true;
        button.textContent = "Publishing…";

        await callRpc("engine_v2_admin_publish", { p_run_id: review.runId });
        window.location.reload();
      } catch (error) {
        const message = error instanceof Error && error.name === "AbortError"
          ? "The action timed out. Please try again."
          : error instanceof Error ? error.message : "Approve & Publish could not be completed.";

        if (approved) {
          window.alert(`The concept was approved, but publishing did not complete: ${message}\n\nThe approved state has been preserved safely. You can use Publish concept to retry.`);
          window.location.reload();
          return;
        }

        button.disabled = false;
        button.textContent = "Approve & Publish";
        button.style.cursor = "";
        delete button.dataset.engineV2ApprovePublishBusy;
        window.alert(message);
      }
    };

    document.addEventListener("click", handleClick, true);
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      document.removeEventListener("click", handleClick, true);
    };
  }, []);

  return null;
}
