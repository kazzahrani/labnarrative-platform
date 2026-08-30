"use client";

import { useEffect, useRef } from "react";
import { browserSupabase } from "../../lib/supabase-browser";

const PENDING_REFERRAL_KEY = "ln-pending-referral-code-v1";

function normalize(value: string | null) {
  return String(value ?? "").trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 32);
}

export default function ReferralAttributionBridge({ ready }: { ready: boolean }) {
  const attempted = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const code = normalize(url.searchParams.get("ref"));
    if (code) {
      sessionStorage.setItem(PENDING_REFERRAL_KEY, code);
      url.searchParams.delete("ref");
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    }
  }, []);

  useEffect(() => {
    if (!ready || attempted.current || typeof window === "undefined") return;
    const code = normalize(sessionStorage.getItem(PENDING_REFERRAL_KEY));
    if (!code) return;
    attempted.current = true;

    void browserSupabase.functions.invoke("trader-referral-control", {
      body: { action: "claim_code", code, source: "link" },
    }).then(({ error }) => {
      if (!error) sessionStorage.removeItem(PENDING_REFERRAL_KEY);
      else attempted.current = false;
    }).catch(() => { attempted.current = false; });
  }, [ready]);

  return null;
}
