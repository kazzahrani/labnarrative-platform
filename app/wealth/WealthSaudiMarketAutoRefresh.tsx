"use client";

import { useEffect } from "react";
import { browserSupabase } from "@/lib/supabase-browser";
import { refreshSaudiMarketPrices } from "@/lib/wealth-saudi-market";

const REFRESH_EVERY_MS = 5 * 60 * 1000;
const LAST_REFRESH_KEY = "tharwa:saudi-market:last-refresh";

export default function WealthSaudiMarketAutoRefresh() {
  useEffect(() => {
    let disposed = false;
    let running = false;

    async function refresh(force = false) {
      if (disposed || running) return;
      const now = Date.now();
      const last = Number(window.localStorage.getItem(LAST_REFRESH_KEY) || 0);
      if (!force && Number.isFinite(last) && now - last < REFRESH_EVERY_MS - 5000) return;

      running = true;
      try {
        const { data: userData } = await browserSupabase.auth.getUser();
        const user = userData.user;
        if (!user) return;

        const { data: holdings, error } = await browserSupabase
          .from("wealth_holdings")
          .select("id,asset_type,symbol,quantity,unit_price,market_value,portfolio_kind")
          .eq("user_id", user.id);
        if (error) throw error;

        const result = await refreshSaudiMarketPrices(user.id, holdings ?? []);
        window.localStorage.setItem(LAST_REFRESH_KEY, String(Date.now()));
        window.localStorage.setItem("tharwa:saudi-market:last-result", JSON.stringify(result));
        window.dispatchEvent(new CustomEvent("wealth:market-refresh", { detail: result }));

        if (result.updated > 0 && !disposed) {
          window.setTimeout(() => {
            if (!disposed && document.visibilityState === "visible") window.location.reload();
          }, 250);
        }
      } catch (error) {
        window.localStorage.setItem("tharwa:saudi-market:last-error", error instanceof Error ? error.message : "market refresh failed");
      } finally {
        running = false;
      }
    }

    void refresh();
    const timer = window.setInterval(() => void refresh(true), REFRESH_EVERY_MS);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void refresh();
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
