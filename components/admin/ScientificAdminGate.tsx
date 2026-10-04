"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { scientificAdminSessionIsValid } from "@/lib/scientific-admin-auth";

export default function ScientificAdminGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<"checking" | "signed_out" | "ready">("checking");

  useEffect(() => {
    let active = true;
    void scientificAdminSessionIsValid().then((ok) => {
      if (!active) return;
      setState(ok ? "ready" : "signed_out");
    });
    return () => { active = false; };
  }, []);

  if (state === "ready") return <>{children}</>;

  return (
    <main style={{minHeight:"100vh",display:"grid",placeItems:"center",padding:24,background:"#0d171e",color:"#f2f6f4",fontFamily:"Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"}}>
      <section style={{width:"min(560px,100%)",background:"#13242d",border:"1px solid #29404b",borderRadius:18,padding:30,boxShadow:"0 24px 70px rgba(0,0,0,.28)"}}>
        <div style={{fontWeight:850,fontSize:19,letterSpacing:"-.04em",marginBottom:28}}><span style={{color:"#73c9aa"}}>Lab</span>Narrative <span style={{color:"#708681",fontSize:11,letterSpacing:".12em"}}>SCIENTIFIC</span></div>
        <p style={{margin:"0 0 8px",color:"#73c9aa",fontSize:11,fontWeight:900,letterSpacing:".14em",textTransform:"uppercase"}}>Scientific administration</p>
        <h1 style={{margin:"0 0 10px",fontSize:34,letterSpacing:"-.045em"}}>{state === "checking" ? "Checking your session…" : "Sign in to Scientific."}</h1>
        <p style={{margin:"0 0 24px",color:"#98aaa8",lineHeight:1.65,fontSize:14}}>Scientific admin access is isolated from LabNarrative Trading. No Trading authentication settings are used or changed.</p>
        {state === "signed_out" ? <a href="/admin/login" style={{display:"block",width:"100%",boxSizing:"border-box",border:"1px solid #356b5a",background:"#173c32",color:"#c9eee0",borderRadius:9,padding:"12px 14px",fontWeight:850,textAlign:"center",textDecoration:"none"}}>Sign in →</a> : null}
      </section>
    </main>
  );
}
