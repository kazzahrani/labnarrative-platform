"use client";

import { useEffect } from "react";
import { browserSupabase } from "../../lib/supabase-browser";

export default function BillingReturnBridge({ ready }: { ready: boolean }) {
  useEffect(() => {
    if (!ready || typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const state = url.searchParams.get("billing");
    if (!state || !["return", "changed", "cancelled", "change-cancelled"].includes(state)) return;

    let cancelled = false;
    void (async () => {
      try {
        if (state === "return" || state === "changed") {
          await browserSupabase.functions.invoke("trader-billing-control", { body: { action: "sync_subscription" } });
        }
      } finally {
        if (cancelled) return;
        url.searchParams.delete("billing");
        window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
        window.dispatchEvent(new CustomEvent("trader:billing-return", { detail: { state } }));
      }
    })();

    return () => { cancelled = true; };
  }, [ready]);

  return null;
}
