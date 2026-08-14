"use client";

import { useEffect, useState } from "react";
import { browserSupabase as supabase } from "@/lib/supabase-browser";
import SiteMonitorV4Page from "../sites-v4/page";

export default function WebsitesPage() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;

    const checkSession = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (!active) return;

      if (!error && data.session) {
        setReady(true);
        return;
      }

      // Supabase browser sessions are origin-scoped. If the administrator
      // authenticated on labnarrative.com, securely transfer that existing
      // session into platform.labnarrative.com before opening the monitor.
      if (window.location.hostname === "platform.labnarrative.com") {
        window.location.replace("https://labnarrative.com/admin/session-transfer");
        return;
      }

      // On another LabNarrative host, use the normal dashboard sign-in flow.
      window.location.replace("/admin");
    };

    void checkSession();

    return () => {
      active = false;
    };
  }, []);

  if (!ready) {
    return (
      <main
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: 24,
          background: "#0d1b22",
          color: "#eef2f0",
        }}
      >
        <section
          style={{
            width: "min(620px, 100%)",
            padding: 32,
            border: "1px solid #274c4d",
            borderRadius: 28,
            background: "#0c292c",
          }}
        >
          <p
            style={{
              margin: "0 0 12px",
              letterSpacing: ".12em",
              textTransform: "uppercase",
              fontSize: 12,
              fontWeight: 800,
              color: "#b6c2c4",
            }}
          >
            Website Monitor v4
          </p>
          <h1 style={{ margin: 0, fontSize: "clamp(2rem, 6vw, 4rem)", lineHeight: 1 }}>
            Restoring administrator access…
          </h1>
        </section>
      </main>
    );
  }

  return <SiteMonitorV4Page />;
}
