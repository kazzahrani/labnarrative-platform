"use client";

import { useEffect, useState } from "react";
import { scientificAdminLogin, scientificAdminSessionIsValid } from "@/lib/scientific-admin-auth";
import styles from "../../intelligence/auth.module.css";

export default function ScientificLoginClient() {
  const [email, setEmail] = useState("oxyginmusic@gmail.com");
  const [secret, setSecret] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void scientificAdminSessionIsValid().then((ok) => {
      if (ok) window.location.replace("/admin");
    });
  }, []);

  async function signIn() {
    setLoading(true);
    setError("");

    const result = await scientificAdminLogin(email, secret);
    if (!result.ok) {
      setError(result.error || "Sign in failed.");
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
      <div className={styles.brandFoot}><span>Scientific websites</span><span>Evidence-backed leads</span><span>Isolated admin access</span></div>
    </section>

    <section className={styles.formPane}>
      <div className={styles.card}>
        <p className={styles.eyebrow}>Administrator sign in</p>
        <h2>Welcome back.</h2>
        <p>This Scientific password is separate from Trading authentication, even if you choose the same password.</p>
        <div className={styles.form}>
          <label><span>Email</span><input type="email" autoComplete="email" value={email} onChange={(e)=>setEmail(e.target.value)} /></label>
          <label><span>Password</span><input type="password" autoComplete="current-password" value={secret} onChange={(e)=>setSecret(e.target.value)} onKeyDown={(e)=>{ if(e.key==="Enter") void signIn(); }} /></label>
          <button className={styles.button} type="button" onClick={()=>void signIn()} disabled={loading || !email.trim() || !secret}>{loading ? "SIGNING IN…" : "SIGN IN →"}</button>
        </div>
        {error ? <p className={styles.error}>{error}</p> : null}
        <div className={styles.security}>Scientific admin authentication is isolated from LabNarrative Trading.</div>
      </div>
    </section>
  </main>;
}
