"use client";

import { useEffect } from "react";
import { browserSupabase as supabase } from "@/lib/supabase-browser";

type RouteResult = { ok?: boolean; path?: string; error?: string };

function prospectIdFromCard(card: HTMLElement) {
  const workspace = card.querySelector<HTMLAnchorElement>('a[href^="/admin/sales/"]');
  if (!workspace) return "";
  return workspace.getAttribute("href")?.split("/").filter(Boolean).pop() || "";
}

export default function SalesDeliveryOutreachEnhancer() {
  useEffect(() => {
    if (typeof window === "undefined" || !window.location.pathname.startsWith("/admin/sales")) return;

    let stopped = false;

    const enhance = () => {
      if (stopped) return;
      const cards = Array.from(document.querySelectorAll<HTMLElement>("article"));
      for (const card of cards) {
        const text = (card.innerText || "").toLowerCase();
        if (!text.includes("delivery problem") || card.querySelector('[data-delivery-outreach-button="true"]')) continue;

        const prospectId = prospectIdFromCard(card);
        if (!prospectId) continue;
        const actionArea = card.querySelector<HTMLElement>("div:last-child");
        if (!actionArea) continue;

        const button = document.createElement("button");
        button.type = "button";
        button.textContent = "Outreach";
        button.setAttribute("data-delivery-outreach-button", "true");
        button.style.background = "#2f6f5e";
        button.style.borderColor = "rgba(63,143,113,.55)";
        button.style.color = "#f4fbf8";

        button.addEventListener("click", async () => {
          if (button.dataset.busy === "true") return;
          button.dataset.busy = "true";
          button.disabled = true;
          button.textContent = "Opening…";
          try {
            const { data, error } = await supabase.rpc("sales_delivery_outreach_route", { p_prospect_id: prospectId });
            if (error) throw error;
            const result = data as RouteResult | null;
            if (!result?.ok || !result.path) throw new Error(result?.error || "Outreach window not found.");
            window.location.href = result.path;
          } catch (error) {
            button.textContent = "Outreach unavailable";
            button.title = error instanceof Error ? error.message : "Outreach window not found.";
            button.disabled = false;
            button.dataset.busy = "false";
          }
        });

        const scheduleButton = Array.from(actionArea.querySelectorAll("button")).find((node) => node.textContent?.trim() === "Schedule next");
        if (scheduleButton) actionArea.insertBefore(button, scheduleButton);
        else actionArea.appendChild(button);
      }
    };

    enhance();
    const observer = new MutationObserver(enhance);
    observer.observe(document.body, { childList: true, subtree: true });
    const interval = window.setInterval(enhance, 1000);

    return () => {
      stopped = true;
      observer.disconnect();
      window.clearInterval(interval);
    };
  }, []);

  return null;
}
