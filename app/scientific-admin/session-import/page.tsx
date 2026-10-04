"use client";

import { useEffect, useState } from "react";
import { scientificSupabase as supabase } from "@/lib/scientific-supabase-browser";

export default function ScientificSessionImportPage() {
  const [message, setMessage] = useState("Finishing Scientific administrator sign-in…");

  useEffect(() => {
    let active = true;

    const run = async () => {
      const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const accessToken = params.get("access_token") || "";
      const refreshToken = params.get("refresh_token") || "";

      window.history.replaceState({}, "", "/admin/session-import");

      if (!accessToken || !refreshToken) {
        if (active) setMessage("The secure session transfer data is missing. Please request a fresh sign-in link.");
        return;
      }

      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (error) {
        if (active) setMessage(`The Scientific session could not be restored: ${error.message}`);
        return;
      }

      const { data: allowed, error: adminError } = await supabase.rpc("is_labnarrative_admin");
      if (adminError || allowed !== true) {
        await supabase.auth.signOut({ scope: "local" });
        if (active) setMessage("This account is not authorized for LabNarrative Scientific.");
        return;
      }

      window.location.replace("/admin");
    };

    void run();
    return () => { active = false; };
  }, []);

  return (
    <main style={{minHeight:"100vh",display:"grid",placeItems:"center",padding:24,background:"#0d171e",color:"#f2f6f4",fontFamily:"Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"}}>
      <section style={{width:"min(560px,100%)",padding:30,border:"1px solid #29404b",borderRadius:18,background:"#13242d"}}>
        <p style={{margin:"0 0 8px",color:"#73c9aa",fontSize:11,fontWeight:900,letterSpacing:".14em",textTransform:"uppercase"}}>LabNarrative Scientific</p>
        <h1 style={{margin:"0 0 12px",fontSize:34,letterSpacing:"-.045em"}}>Almost there.</h1>
        <p style={{margin:0,color:"#98aaa8",lineHeight:1.65}}>{message}</p>
      </section>
    </main>
  );
}
