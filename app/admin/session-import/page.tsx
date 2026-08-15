"use client";

import { useEffect, useState } from "react";
import { browserSupabase as supabase } from "@/lib/supabase-browser";

function safeReturnTo(raw: string | null) {
  if (!raw || !raw.startsWith("/admin") || raw.startsWith("//")) return "/admin";
  if (raw.startsWith("/admin/session-import") || raw.startsWith("/admin/session-transfer")) return "/admin";
  return raw;
}

export default function AdminSessionImportPage() {
  const [message, setMessage] = useState("Importing your administrator session…");

  useEffect(() => {
    let active = true;

    const run = async () => {
      const query = new URLSearchParams(window.location.search);
      const returnTo = safeReturnTo(query.get("return_to"));
      const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const accessToken = params.get("access_token") || "";
      const refreshToken = params.get("refresh_token") || "";

      // Strip credentials from the visible URL immediately.
      window.history.replaceState({}, "", `/admin/session-import?return_to=${encodeURIComponent(returnTo)}`);

      if (!accessToken || !refreshToken) {
        if (active) setMessage("The secure session transfer data is missing. Open the LabNarrative admin page and sign in once.");
        return;
      }

      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (error) {
        if (active) setMessage(`The administrator session could not be restored: ${error.message}`);
        return;
      }

      window.sessionStorage.removeItem("labnarrative-admin-recovery-attempted");
      if (active) {
        setMessage("Session restored. Opening your workspace…");
        window.location.replace(returnTo);
      }
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
