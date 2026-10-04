"use client";

import { useEffect, useState } from "react";
import { scientificSupabase as supabase } from "@/lib/scientific-supabase-browser";

export default function ScientificPasswordSetupPage() {
  const [ready, setReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [first, setFirst] = useState("");
  const [second, setSecond] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setHasSession(Boolean(data.session));
      setReady(true);
    });
  }, []);

  const save = async () => {
    if (!first || first !== second || busy) return;
    setBusy(true);
    setMessage("");

    const { error } = await supabase.auth.updateUser({ password: first });
    if (error) {
      setMessage(error.message);
      setBusy(false);
      return;
    }

    setFirst("");
    setSecond("");
    window.location.replace("https://labnarrative.site/admin/login?password_ready=1");
  };

  return (
    <main style={{minHeight:"100vh",display:"grid",placeItems:"center",padding:24,background:"#0d171e",color:"#f2f6f4",fontFamily:"Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"}}>
      <section style={{width:"min(560px,100%)",background:"#13242d",border:"1px solid #29404b",borderRadius:18,padding:30}}>
        <div style={{fontWeight:850,fontSize:19,letterSpacing:"-.04em",marginBottom:28}}><span style={{color:"#73c9aa"}}>Lab</span>Narrative <span style={{color:"#708681",fontSize:11,letterSpacing:".12em"}}>SCIENTIFIC</span></div>
        <p style={{margin:"0 0 8px",color:"#73c9aa",fontSize:11,fontWeight:900,letterSpacing:".14em",textTransform:"uppercase"}}>One-time setup</p>
        <h1 style={{margin:"0 0 10px",fontSize:34,letterSpacing:"-.045em"}}>Set your Scientific password.</h1>
        <p style={{margin:"0 0 24px",color:"#98aaa8",lineHeight:1.65,fontSize:14}}>Use the same password you already use if you want. It is sent directly from your browser to Supabase Auth and is not stored by LabNarrative.</p>

        {!ready ? <p style={{color:"#98aaa8"}}>Checking your recent sign-in…</p> : !hasSession ? <p style={{color:"#e2a5a5",lineHeight:1.6}}>Your recent Scientific sign-in session is not present on this domain. Open the most recent Scientific sign-in email once, then return to this page.</p> : <>
          <label style={{display:"grid",gap:7,marginBottom:11}}>
            <span style={{color:"#98aaa8",fontSize:11,fontWeight:800}}>Password</span>
            <input value={first} onChange={(e)=>setFirst(e.target.value)} type="password" autoComplete="new-password" style={{width:"100%",boxSizing:"border-box",border:"1px solid #29404b",borderRadius:9,padding:"11px 12px",color:"#f2f6f4",background:"#0f1c23",font:"inherit"}} />
          </label>
          <label style={{display:"grid",gap:7,marginBottom:11}}>
            <span style={{color:"#98aaa8",fontSize:11,fontWeight:800}}>Confirm password</span>
            <input value={second} onChange={(e)=>setSecond(e.target.value)} type="password" autoComplete="new-password" onKeyDown={(e)=>{if(e.key==="Enter") void save();}} style={{width:"100%",boxSizing:"border-box",border:"1px solid #29404b",borderRadius:9,padding:"11px 12px",color:"#f2f6f4",background:"#0f1c23",font:"inherit"}} />
          </label>
          <button type="button" onClick={()=>void save()} disabled={busy || !first || first!==second} style={{width:"100%",border:"1px solid #356b5a",background:"#173c32",color:"#c9eee0",borderRadius:9,padding:"11px 12px",fontWeight:850,cursor:busy?"default":"pointer",opacity:busy?.6:1}}>{busy?"Saving…":"Save password & open Scientific admin →"}</button>
          {first && second && first!==second ? <p style={{margin:"10px 0 0",color:"#e2a5a5",fontSize:12}}>Passwords do not match.</p> : null}
          {message ? <p style={{margin:"10px 0 0",color:"#e2a5a5",fontSize:12}}>{message}</p> : null}
        </>}
      </section>
    </main>
  );
}
