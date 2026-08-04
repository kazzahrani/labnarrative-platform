"use client";

import { createClient } from "@supabase/supabase-js";
import { useEffect, useState } from "react";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
);

const targetUrl = "https://platform.labnarrative.com/admin/session-import";

export default function AdminSessionTransferPage() {
  const [message, setMessage] = useState("Checking the administrator session on this address…");

  useEffect(() => {
    let active = true;

    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      const session = data.session;

      if (error || !session?.access_token || !session.refresh_token) {
        setMessage(
          "No active administrator session was found on this address. Return to the browser tab where LabNarrative administration is already open, replace its path with /admin/session-transfer, and load that page.",
        );
        return;
      }

      const fragment = new URLSearchParams({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      });

      setMessage("Transferring your secure administrator session…");
      window.location.replace(`${targetUrl}#${fragment.toString()}`);
    });

    return () => {
      active = false;
    };
  }, []);

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "#111815", color: "#eef2ed" }}>
      <section style={{ width: "min(620px, 100%)", padding: 32, border: "1px solid #425049", background: "#1b2420" }}>
        <p style={{ margin: "0 0 12px", letterSpacing: ".12em", textTransform: "uppercase", fontSize: 12, fontWeight: 800 }}>LabNarrative administration</p>
        <h1 style={{ margin: "0 0 18px", fontFamily: "Georgia, serif", fontSize: "clamp(2.2rem, 7vw, 4.8rem)", fontWeight: 400, lineHeight: .95 }}>Secure session transfer.</h1>
        <p style={{ margin: 0, color: "#b9c4be", lineHeight: 1.65 }}>{message}</p>
      </section>
    </main>
  );
}
