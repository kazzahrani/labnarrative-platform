"use client";

import { useEffect, useRef } from "react";
import { browserSupabase } from "@/lib/supabase-browser";

const CHECK_EVERY_MS = 60 * 1000;

export default function WealthSaudiMarketAutoRefresh() {
  const latestSeen = useRef<number | null>(null);

  useEffect(() => {
    let disposed = false;
    let running = false;

    async function checkForCentralRefresh() {
      if (disposed || running) return;
      running = true;
      try {
        const { data: userData } = await browserSupabase.auth.getUser();
        const user = userData.user;
        if (!user) return;

        const { data, error } = await browserSupabase
          .from("wealth_holdings")
          .select("updated_at")
          .eq("user_id", user.id)
          .in("asset_type", ["saudi_stock", "reit"])
          .order("updated_at", { ascending: false })
          .limit(1);
        if (error) throw error;

        const latest = Date.parse(String(data?.[0]?.updated_at ?? ""));
        if (!Number.isFinite(latest)) return;

        if (latestSeen.current === null) {
          latestSeen.current = latest;
          return;
        }

        if (latest > latestSeen.current) {
          latestSeen.current = latest;
          window.dispatchEvent(new CustomEvent("wealth:market-refresh", { detail: { source: "central-market-engine" } }));
          window.setTimeout(() => {
            if (!disposed && document.visibilityState === "visible") window.location.reload();
          }, 200);
        }
      } catch {
        // The database/cron engine owns pricing. A failed UI poll must never mutate or downgrade prices.
      } finally {
        running = false;
      }
    }

    void checkForCentralRefresh();
    const timer = window.setInterval(() => void checkForCentralRefresh(), CHECK_EVERY_MS);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void checkForCentralRefresh();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      disposed = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return null;
}
