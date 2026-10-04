"use client";

import { useEffect, useState } from "react";
import { scientificSupabase as supabase } from "@/lib/scientific-supabase-browser";
import styles from "../../intelligence/auth.module.css";

export default function ScientificLoginClient() {
  const [email, setEmail] = useState("oxyginmusic@gmail.com");
  const [secret, setSecret] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [setupMessage, setSetupMessage] = useState("");

  useEffect(() => {
    void supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) return;
      const { data: allowed } = await supabase.rpc("is_labnarrative_admin");
      if (allowed === true) window.location.replace("/admin");
    });
  }, []);

  async function sendSetupLink() {
    setLoading(true);
    setError("");
    setSetupMessage("");

    const { error: linkError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        shouldCreateUser: false,
        emailRedirectTo: "https://labnarrative.site/admin/setup-password",
      },
    });

    if (linkError) setError(linkError.message);
    else setSetupMessage("Setup link sent. Open the fresh email once, then set the same password you already use.");
    setLoading(false);
  }

  async function signIn() {
    setLoading(true);
    setError("");

    const signed = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: secret,
    });

    if (signed.error || !signed.data.session) {
      setError(signed.error?.message || "Sign in failed.");
      setLoading(false);
      return;
    }

    const { data: allowed, error: adminError } = await supabase.rpc("is_labnarrative_admin");
    if (adminError || allowed !== true) {
      await supabase.auth.signOut({ scope: "local" });
      setError("This account is not authorized for LabNarrative Scientific.");
      setLoading(false);
      return;
    }

    setSecret("");
    window.location.replace("/admin");
  }

  return <main className={styles.page}>
    <section className={styles.brandPane}>
      <div className={styles.wordmark}><span>Lab</span>Narrative</div>
      <div>
        <p className={styles.eyebrow}>Scientific admin</p>
        <h1>Scientific websites.<br />Qualified leads.<br /><em>One workspace.</em></h1>
        <p>Manage lead discovery, outreach, proposals and scientific website delivery from the dedicated LabNarrative Scientific workspace.</p>
      </div>
      <div className={styles.brandFoot}><span>Scientific websites</span><span>Evidence-backed leads</span><span>Private admin access</span></div>
    </section>

    <section className={styles.formPane}>
      <div className={styles.card}>
        <p className={styles.eyebrow}>Administrator sign in</p>
        <h2>Welcome back.</h2>
        <p>Use the same LabNarrative account credentials you already use. No email verification step is needed.</p>
        <div className={styles.form}>
          <label><span>Email</span><input type="email" autoComplete="email" value={email} onChange={(e)=>setEmail(e.target.value)} /></label>
          <label><span>Password</span><input type="password" autoComplete="current-password" value={secret} onChange={(e)=>setSecret(e.target.value)} onKeyDown={(e)=>{ if(e.key==="Enter") void signIn(); }} /></label>
          <button className={styles.button} type="button" onClick={()=>void signIn()} disabled={loading || !email.trim() || !secret}>{loading ? "SIGNING IN…" : "SIGN IN →"}</button>\n          <button type="button" onClick={()=>void sendSetupLink()} disabled={loading || !email.trim()} style={{border:"1px solid rgba(255,255,255,.15)",background:"transparent",color:"inherit",borderRadius:10,padding:"12px 14px",fontWeight:800,cursor:"pointer"}}>FIRST-TIME SETUP — SEND LINK</button>
        </div>
        {error ? <p className={styles.error}>{error}</p> : null}\n        {setupMessage ? <p style={{fontSize:12,lineHeight:1.55,opacity:.8}}>{setupMessage}</p> : null}
        <div className={styles.security}>Your session is securely managed by Supabase Auth.</div>
      </div>
    </section>
  </main>;
}
