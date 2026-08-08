"use client";

import { useEffect } from "react";
import { browserSupabase as supabase } from "@/lib/supabase-browser";

type EngineRun = {
  runId?: string;
  piName?: string;
  slug?: string;
  state?: string;
  siteId?: string;
};

type DashboardPayload = {
  runs?: EngineRun[];
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

const BUTTON_ATTR = "data-website-confirm-publish";

function styleButton(button: HTMLButtonElement, recovery = false) {
  Object.assign(button.style, {
    border: recovery ? "1px solid rgba(224,181,104,.45)" : "1px solid rgba(34,193,181,.5)",
    borderRadius: "7px",
    padding: "5px 8px",
    background: recovery ? "rgba(224,181,104,.10)" : "rgba(34,193,181,.12)",
    color: recovery ? "#e0b568" : "#74d8cf",
    font: "inherit",
    fontSize: ".58rem",
    fontWeight: "800",
    lineHeight: "1.15",
    cursor: "pointer",
    whiteSpace: "nowrap",
    transition: "background .16s ease, opacity .16s ease, transform .16s ease",
  });
}

export default function WebsiteConfirmPublishEnhancer() {
  useEffect(() => {
    if (window.location.pathname !== "/admin/sites") return;

    let disposed = false;
    let observer: MutationObserver | null = null;
    let frame = 0;
    let runsBySlug = new Map<string, EngineRun>();

    const rpc = async <T,>(name: string, body: Record<string, unknown>): Promise<T> => {
      const { data: auth } = await supabase.auth.getSession();
      const token = auth.session?.access_token;
      if (!token) throw new Error("Administrator session is not available. Reload the page and sign in again.");

      const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 9000);
      try {
        const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: key,
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
          cache: "no-store",
        });
        const payload = await response.json().catch(() => ({})) as T & { message?: string; details?: string; hint?: string };
        if (!response.ok) throw new Error(payload.message || payload.details || payload.hint || `${name} failed (${response.status}).`);
        return payload;
      } finally {
        window.clearTimeout(timeout);
      }
    };

    const updateRowAfterPublish = (row: HTMLTableRowElement, slug: string) => {
      const statusCell = Array.from(row.children).find((cell) => cell.getAttribute("data-label") === "Website status") as HTMLElement | undefined;
      const badge = statusCell?.querySelector<HTMLElement>("span");
      if (badge) badge.textContent = "Concept";

      row.querySelector<HTMLButtonElement>(`button[${BUTTON_ATTR}]`)?.remove();
      window.dispatchEvent(new CustomEvent("labnarrative:site-published", { detail: { slug } }));
    };

    const publish = async (run: EngineRun, button: HTMLButtonElement, row: HTMLTableRowElement) => {
      if (!run.runId || !run.slug || button.disabled) return;

      button.disabled = true;
      button.style.cursor = "wait";
      button.style.opacity = ".58";
      button.style.background = "rgba(34,193,181,.28)";
      button.style.transform = "translateY(1px)";

      try {
        if (run.state === "final_review") {
          button.textContent = "Confirming…";
          await rpc("engine_v2_admin_review", {
            p_run_id: run.runId,
            p_decision: "approve",
            p_note: null,
          });
          run.state = "approved";
        }

        button.textContent = "Publishing…";
        const published = await rpc<{ siteId?: string; state?: string }>("engine_v2_admin_publish", {
          p_run_id: run.runId,
        });
        run.state = "published";
        if (published.siteId) run.siteId = published.siteId;

        const siteId = run.siteId || published.siteId;
        if (!siteId) throw new Error("Published concept did not return a site ID.");

        button.textContent = "Preparing email…";
        const draft = await rpc<OutreachDraft>("engine_v2_admin_prepare_site_outreach", {
          p_site_id: siteId,
        });
        if (!draft?.runId) throw new Error("The outreach draft could not be prepared after publishing.");

        updateRowAfterPublish(row, run.slug);
        runsBySlug.delete(run.slug);

        window.dispatchEvent(new CustomEvent<OutreachDraft>("labnarrative:open-outreach-draft", {
          detail: draft,
        }));
      } catch (error) {
        const message = error instanceof Error && error.name === "AbortError"
          ? "The action timed out. Please try again."
          : error instanceof Error ? error.message : "Confirm & publish could not be completed.";

        button.disabled = false;
        button.style.cursor = "pointer";
        button.style.opacity = "1";
        button.style.transform = "none";

        if (run.state === "approved") {
          button.textContent = "Publish concept";
          styleButton(button, true);
        } else {
          button.textContent = "Confirm & publish";
          styleButton(button, false);
        }
        window.alert(message);
      }
    };

    const apply = () => {
      if (disposed) return;
      const table = document.querySelector<HTMLTableElement>("main table");
      if (!table) return;

      for (const row of Array.from(table.querySelectorAll<HTMLTableRowElement>("tbody tr"))) {
        const websiteCell = Array.from(row.children).find((cell) => cell.getAttribute("data-label") === "Website") as HTMLElement | undefined;
        const slug = websiteCell?.querySelector<HTMLButtonElement>("button")?.textContent?.trim().toLowerCase() || "";
        const run = runsBySlug.get(slug);

        const actionsCell = Array.from(row.children).find((cell) => cell.getAttribute("data-label") === "Actions") as HTMLElement | undefined;
        const actions = actionsCell?.querySelector<HTMLElement>("div");
        if (!actions) continue;

        const existing = actions.querySelector<HTMLButtonElement>(`button[${BUTTON_ATTR}]`);
        if (!run || !run.runId || !["final_review", "approved"].includes(run.state || "")) {
          existing?.remove();
          continue;
        }
        if (existing) continue;

        const button = document.createElement("button");
        button.type = "button";
        button.setAttribute(BUTTON_ATTR, "true");
        const recovery = run.state === "approved";
        button.textContent = recovery ? "Publish concept" : "Confirm & publish";
        styleButton(button, recovery);
        button.addEventListener("click", () => void publish(run, button, row));
        actions.prepend(button);
      }
    };

    const scheduleApply = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(apply);
    };

    const load = async () => {
      try {
        const dashboard = await rpc<DashboardPayload>("engine_v2_admin_dashboard", {});
        runsBySlug = new Map(
          (dashboard.runs || [])
            .filter((run) => run.slug && ["final_review", "approved"].includes(run.state || ""))
            .map((run) => [run.slug!.trim().toLowerCase(), run]),
        );
        apply();
      } catch {
        // Keep Websites usable if Engine v2 dashboard lookup is temporarily unavailable.
      }
    };

    observer = new MutationObserver(scheduleApply);
    observer.observe(document.body, { childList: true, subtree: true });
    void load();

    return () => {
      disposed = true;
      observer?.disconnect();
      window.cancelAnimationFrame(frame);
      document.querySelectorAll(`button[${BUTTON_ATTR}]`).forEach((node) => node.remove());
    };
  }, []);

  return null;
}
