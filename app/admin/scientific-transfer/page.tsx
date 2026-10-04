"use client";

import { useEffect, useState } from "react";
import { scientificSupabase as supabase } from "@/lib/scientific-supabase-browser";

export default function ScientificAdminTransferPage() {
  const [message, setMessage] = useState("Transferring your Scientific administrator session…");

  useEffect(() => {
    let active = true;

    const run = async () => {
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const query = new URLSearchParams(window.location.search);
      const accessToken = hash.get("access_token") || query.get("access_token") || "";
      const refreshToken = hash.get("refresh_token") || query.get("refresh_token") || "";

      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (error) {
          if (active) setMessage(`Could not establish the Scientific session: ${error.message}`);
          return;
        }
      } else {
        // Supabase may already have consumed the callback fragment.
        const { data } = await supabase.auth.getSession();
        if (!data.session) {
          if (active) setMessage("The sign-in link did not contain a valid Scientific session. Please request a fresh link.");
          return;
        }
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData.session;
      if (!session) {
        if (active) setMessage("The Scientific session could not be created. Please request a fresh sign-in link.");
        return;
      }

      const target = new URL("https://labnarrative.site/admin/session-import");
      target.hash = new URLSearchParams({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      }).toString();
      window.location.replace(target.toString());
    };

    void run();
    return () => { active = false; };
  }, []);

  return (
    <main style={{minHeight:"100vh",display:"grid",placeItems:"center",padding:24,background:"#0d171e",color:"#f2f6f4",fontFamily:"Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"}}>
      <section style={{width:"min(560px,100%)",padding:30,border:"1px solid #29404b",borderRadius:18,background:"#13242d"}}>
        <p style={{margin:"0 0 8px",color:"#73c9aa",fontSize:11,fontWeight:900,letterSpacing:".14em",textTransform:"uppercase"}}>LabNarrative Scientific</p>
        <h1 style={{margin:"0 0 12px",fontSize:34,letterSpacing:"-.045em"}}>Opening Scientific admin…</h1>
        <p style={{margin:0,color:"#98aaa8",lineHeight:1.65}}>{message}</p>
      </section>
    </main>
  );
}
