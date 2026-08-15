"use client";

import { useEffect, useState } from "react";
import { browserSupabase as supabase } from "@/lib/supabase-browser";

const ROOT_ORIGIN = "https://labnarrative.com";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function safeReturnTo(raw: string | null) {
  if (!raw || !raw.startsWith("/admin") || raw.startsWith("//")) return "/admin";
  if (raw.startsWith("/admin/session-import") || raw.startsWith("/admin/session-transfer")) return "/admin";
  return raw;
}

function clearLocalAuthCopy() {
  try {
    const projectRef = new URL(SUPABASE_URL).hostname.split(".")[0];
    const storageKey = `sb-${projectRef}-auth-token`;
    window.localStorage.removeItem(storageKey);
    window.sessionStorage.removeItem(storageKey);
  } catch {
    // Best-effort cleanup only. Never revoke the transferred refresh token.
  }
}

export default function AdminSessionTransferPage() {
  const [message, setMessage] = useState("Checking the existing administrator session…");

  useEffect(() => {
    let active = true;

    const run = async () => {
      const query = new URLSearchParams(window.location.search);
      const returnTo = safeReturnTo(query.get("return_to"));

      // labnarrative.com is now the only primary admin origin. If this route is
      // opened there directly, there is nothing to copy across origins.
      if (window.location.hostname === "labnarrative.com" || window.location.hostname === "www.labnarrative.com") {
        window.location.replace(returnTo);
        return;
      }

      const { data, error } = await supabase.auth.getSession();
      if (!active) return;
      const session = data.session;

      if (error || !session?.access_token || !session.refresh_token) {
        const login = new URL("/admin", ROOT_ORIGIN);
        login.searchParams.set("return_to", returnTo);
        login.searchParams.set("recovery", "no_legacy_session");
        window.location.replace(login.toString());
        return;
      }

      setMessage("Moving your administrator session to labnarrative.com…");

      // Prevent the old origin from continuing to refresh the same token after
      // the handoff. We intentionally remove browser storage rather than call
      // signOut(), because signOut would revoke the refresh token we are moving.
      try {
        supabase.auth.stopAutoRefresh();
      } catch {
        // Older client versions may not expose stopAutoRefresh; page unload
        // immediately after storage cleanup still prevents future refreshes.
      }
      clearLocalAuthCopy();

      const target = new URL("/admin/session-import", ROOT_ORIGIN);
      target.searchParams.set("return_to", returnTo);
      target.hash = new URLSearchParams({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      }).toString();

      window.location.replace(target.toString());
    };

    void run();

    return () => {
      active = false;
    };
  }, []);

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "#f6f7f2", color: "#152019" }}>
      <section style={{ width: "min(620px, 100%)", padding: 32, border: "1px solid #d8ded9", borderRadius: 18, background: "#fff", boxShadow: "0 18px 48px rgba(36,75,59,.08)" }}>
        <p style={{ margin: "0 0 12px", letterSpacing: ".12em", textTransform: "uppercase", fontSize: 12, fontWeight: 800, color: "#315f50" }}>LabNarrative administration</p>
        <h1 style={{ margin: "0 0 18px", fontSize: "clamp(2rem, 6vw, 3.6rem)", fontWeight: 700, lineHeight: 1 }}>Restoring access.</h1>
        <p style={{ margin: 0, color: "#627069", lineHeight: 1.65 }}>{message}</p>
      </section>
    </main>
  );
}
