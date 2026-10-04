"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { scientificSupabase as supabase } from "@/lib/scientific-supabase-browser";

async function isScientificAdmin() {
  const { data, error } = await supabase.rpc("is_labnarrative_admin");
  return !error && data === true;
}

export default function ScientificAdminGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<"checking" | "signed_out" | "ready">("checking");
  const [email, setEmail] = useState("oxyginmusic@gmail.com");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    const validate = async () => {
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      if (!data.session) {
        setState("signed_out");
        return;
      }
      const allowed = await isScientificAdmin();
      if (!active) return;
      if (allowed) {
        setState("ready");
      } else {
        await supabase.auth.signOut({ scope: "local" });
        if (active) setState("signed_out");
      }
    };

    void validate();
    const { data: subscription } = supabase.auth.onAuthStateChange(() => {
      if (!active) return;
      window.setTimeout(() => void validate(), 0);
    });
    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const sendCode = async () => {
    if (busy || !email.trim()) return;
    setBusy(true);
    setMessage("");
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: false },
    });
    if (error) setMessage(error.message);
    else {
      setSent(true);
      setMessage("Verification code sent. Enter the code from your email.");
    }
    setBusy(false);
  };

  const verifyCode = async () => {
    if (busy || !email.trim() || !code.trim()) return;
    setBusy(true);
    setMessage("");
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: "email",
    });
    if (error) {
      setMessage(error.message);
      setBusy(false);
      return;
    }
    const allowed = await isScientificAdmin();
    if (!allowed) {
      await supabase.auth.signOut({ scope: "local" });
      setMessage("This account is not authorized for LabNarrative Scientific.");
      setState("signed_out");
      setBusy(false);
      return;
    }
    setState("ready");
    setBusy(false);
  };

  if (state === "ready") return <>{children}</>;

  return (
    <main style={{minHeight:"100vh",display:"grid",placeItems:"center",padding:24,background:"#0d171e",color:"#f2f6f4",fontFamily:"Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"}}>
      <section style={{width:"min(560px,100%)",background:"#13242d",border:"1px solid #29404b",borderRadius:18,padding:30,boxShadow:"0 24px 70px rgba(0,0,0,.28)"}}>
        <div style={{fontWeight:850,fontSize:19,letterSpacing:"-.04em",marginBottom:28}}><span style={{color:"#73c9aa"}}>Lab</span>Narrative <span style={{color:"#708681",fontSize:11,letterSpacing:".12em"}}>SCIENTIFIC</span></div>
        <p style={{margin:"0 0 8px",color:"#73c9aa",fontSize:11,fontWeight:900,letterSpacing:".14em",textTransform:"uppercase"}}>Scientific administration</p>
        <h1 style={{margin:"0 0 10px",fontSize:34,letterSpacing:"-.045em"}}>{state === "checking" ? "Checking your session…" : "Sign in to Scientific."}</h1>
        <p style={{margin:"0 0 24px",color:"#98aaa8",lineHeight:1.65,fontSize:14}}>This is the new admin for LabNarrative Scientific on labnarrative.site. It is separate from the retired .com Websites admin.</p>

        {state === "signed_out" ? <>
          <label style={{display:"grid",gap:7,marginBottom:11}}>
            <span style={{color:"#98aaa8",fontSize:11,fontWeight:800}}>Administrator email</span>
            <input value={email} onChange={(e)=>setEmail(e.target.value)} type="email" autoComplete="email" style={{width:"100%",boxSizing:"border-box",border:"1px solid #29404b",borderRadius:9,padding:"11px 12px",color:"#f2f6f4",background:"#0f1c23",font:"inherit"}} />
          </label>
          {!sent ? <button type="button" onClick={()=>void sendCode()} disabled={busy} style={{width:"100%",border:"1px solid #356b5a",background:"#173c32",color:"#c9eee0",borderRadius:9,padding:"11px 12px",fontWeight:850,cursor:busy?"default":"pointer",opacity:busy?.6:1}}>{busy?"Sending…":"Send verification code"}</button>
          : <div style={{display:"grid",gap:10}}>
              <label style={{display:"grid",gap:7}}>
                <span style={{color:"#98aaa8",fontSize:11,fontWeight:800}}>Verification code</span>
                <input value={code} onChange={(e)=>setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" style={{width:"100%",boxSizing:"border-box",border:"1px solid #29404b",borderRadius:9,padding:"11px 12px",color:"#f2f6f4",background:"#0f1c23",font:"inherit"}} />
              </label>
              <button type="button" onClick={()=>void verifyCode()} disabled={busy || !code.trim()} style={{width:"100%",border:"1px solid #356b5a",background:"#173c32",color:"#c9eee0",borderRadius:9,padding:"11px 12px",fontWeight:850,cursor:busy?"default":"pointer",opacity:busy?.6:1}}>{busy?"Verifying…":"Verify & continue"}</button>
            </div>}
          {message ? <p style={{margin:"12px 0 0",color:message.toLowerCase().includes("sent")?"#9fd1bf":"#e2a5a5",fontSize:12,lineHeight:1.5}}>{message}</p> : null}
        </> : null}
      </section>
    </main>
  );
}
