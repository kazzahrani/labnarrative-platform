"use client";

import { createClient } from "@supabase/supabase-js";
import { useEffect, useState } from "react";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
);

export default function AdminSessionImportPage() {
  const [message, setMessage] = useState("Importing your secure administrator session…");

  useEffect(() => {
    let active = true;

    const run = async () => {
      const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const accessToken = params.get("access_token") || "";
      const refreshToken = params.get("refresh_token") || "";

      window.history.replaceState({}, "", "/admin/session-import");

      if (!accessToken || !refreshToken) {
        if (active) setMessage("The secure session transfer data is missing. Return to the previous administrator tab and try the transfer again.");
        return;
      }

      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (error) {
        if (active) setMessage(`The administrator session could not be imported: ${error.message}`);
        return;
      }

      if (active) {
        setMessage("Session transferred successfully. Opening the administrator dashboard…");
        window.location.replace("/admin/sites");
      }
    };

    void run();
    return () => {
      active = false;
    };
  }, []);

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "#111815", color: "#eef2ed" }}>
      <section style={{ width: "min(620px, 100%)", padding: 32, border: "1px solid #425049", background: "#1b2420" }}>
        <p style={{ margin: "0 0 12px", letterSpacing: ".12em", textTransform: "uppercase", fontSize: 12, fontWeight: 800 }}>LabNarrative administration</p>
        <h1 style={{ margin: "0 0 18px", fontFamily: "Georgia, serif", fontSize: "clamp(2.2rem, 7vw, 4.8rem)", fontWeight: 400, lineHeight: .95 }}>Restoring access.</h1>
        <p style={{ margin: 0, color: "#b9c4be", lineHeight: 1.65 }}>{message}</p>
      </section>
    </main>
  );
}
