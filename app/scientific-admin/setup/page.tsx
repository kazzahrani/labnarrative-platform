"use client";

import { useEffect, useState } from "react";
import { scientificSupabase as supabase } from "@/lib/scientific-supabase-browser";
import { setScientificAdminToken, scientificAdminSessionIsValid } from "@/lib/scientific-admin-auth";

export default function ScientificAdminSetupPage() {
  const [secret, setSecret] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [bootstrap, setBootstrap] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setBootstrap(params.get("token") || "");
    void scientificAdminSessionIsValid().then((ok) => {
      if (ok) window.location.replace("/admin");
    });
  }, []);

  async function finishSetup() {
    if (!bootstrap || !secret || secret !== confirm) return;
    setLoading(true);
    setError("");

    const { data, error: rpcError } = await supabase.rpc("scientific_admin_custom_bootstrap", {
      p_email: "oxyginmusic@gmail.com",
      p_bootstrap: bootstrap,
      p_password: secret,
    });

    if (rpcError || data?.ok !== true || !data?.session_token) {
      setError(rpcError?.message || data?.error || "Setup failed.");
      setLoading(false);
      return;
    }

    setScientificAdminToken(String(data.session_token));
    setSecret("");
    setConfirm("");
    window.location.replace("/admin");
  }

  return (
    <main style={{minHeight:"100vh",display:"grid",placeItems:"center",padding:24,background:"#0d171e",color:"#f2f6f4",fontFamily:"Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"}}>
      <section style={{width:"min(560px,100%)",background:"#13242d",border:"1px solid #29404b",borderRadius:18,padding:30}}>
        <div style={{fontWeight:850,fontSize:19,letterSpacing:"-.04em",marginBottom:28}}><span style={{color:"#73c9aa"}}>Lab</span>Narrative <span style={{color:"#708681",fontSize:11,letterSpacing:".12em"}}>SCIENTIFIC</span></div>
        <p style={{margin:"0 0 8px",color:"#73c9aa",fontSize:11,fontWeight:900,letterSpacing:".14em",textTransform:"uppercase"}}>One-time setup</p>
        <h1 style={{margin:"0 0 10px",fontSize:34,letterSpacing:"-.045em"}}>Choose your Scientific admin password.</h1>
        <p style={{margin:"0 0 24px",color:"#98aaa8",lineHeight:1.65,fontSize:14}}>You may use the same password you already use elsewhere, but it is stored separately and does not modify Trading authentication.</p>

        {!bootstrap ? <p style={{color:"#e2a5a5"}}>This setup link is incomplete.</p> : <>
          <label style={{display:"grid",gap:7,marginBottom:11}}>
            <span style={{color:"#98aaa8",fontSize:11,fontWeight:800}}>Password</span>
            <input value={secret} onChange={(e)=>setSecret(e.target.value)} type="password" autoComplete="new-password" style={{width:"100%",boxSizing:"border-box",border:"1px solid #29404b",borderRadius:9,padding:"11px 12px",color:"#f2f6f4",background:"#0f1c23",font:"inherit"}} />
          </label>
          <label style={{display:"grid",gap:7,marginBottom:11}}>
            <span style={{color:"#98aaa8",fontSize:11,fontWeight:800}}>Confirm password</span>
            <input value={confirm} onChange={(e)=>setConfirm(e.target.value)} type="password" autoComplete="new-password" onKeyDown={(e)=>{if(e.key==="Enter") void finishSetup();}} style={{width:"100%",boxSizing:"border-box",border:"1px solid #29404b",borderRadius:9,padding:"11px 12px",color:"#f2f6f4",background:"#0f1c23",font:"inherit"}} />
          </label>
          <button type="button" onClick={()=>void finishSetup()} disabled={loading || secret.length<8 || secret!==confirm} style={{width:"100%",border:"1px solid #356b5a",background:"#173c32",color:"#c9eee0",borderRadius:9,padding:"11px 12px",fontWeight:850,cursor:loading?"default":"pointer",opacity:loading?.6:1}}>{loading?"SETTING UP…":"SET PASSWORD & OPEN ADMIN →"}</button>
          {secret && confirm && secret!==confirm ? <p style={{margin:"10px 0 0",color:"#e2a5a5",fontSize:12}}>Passwords do not match.</p> : null}
          {error ? <p style={{margin:"10px 0 0",color:"#e2a5a5",fontSize:12}}>{error}</p> : null}
        </>}
      </section>
    </main>
  );
}
