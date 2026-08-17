"use client";

import { useEffect, useState } from "react";
import styles from "../auth.module.css";
import { intelligenceAuth, intelligenceFunctionsBase } from "../client/authClient";

export default function LoginClient() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [claimToken, setClaimToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setEmail(params.get("email") || "");
    setClaimToken(params.get("claim") || "");
    void intelligenceAuth.auth.getSession().then(({ data }) => {
      if (data.session && !params.get("claim")) window.location.href = "/client";
    });
  }, []);

  async function signIn() {
    setLoading(true); setError("");
    try {
      const signed = await intelligenceAuth.auth.signInWithPassword({ email: email.trim(), password });
      if (signed.error || !signed.data.session) throw signed.error || new Error("Sign in failed.");
      if (claimToken) {
        const claim = await fetch(`${intelligenceFunctionsBase}/intelligence-client-auth`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${signed.data.session.access_token}` }, body: JSON.stringify({ action: "claim", token: claimToken }) });
        const payload = await claim.json().catch(() => ({})); if (!claim.ok) throw new Error(String(payload.error || "This purchase could not be linked to your account."));
      }
      window.location.href = "/client";
    } catch (e) { setError(e instanceof Error ? e.message : "Sign in failed."); } finally { setLoading(false); }
  }

  return <main className={styles.page}>
    <section className={styles.brandPane}><div className={styles.wordmark}><span>Lab</span>Narrative</div><div><p className={styles.eyebrow}>Client portal</p><h1>Your products.<br />Your opportunities.<br /><em>One account.</em></h1><p>Return whenever you need to start another product analysis, monitor progress, or retrieve a completed LabNarrative report.</p></div><div className={styles.brandFoot}><span>Scientific revenue intelligence</span><span>Scientist-validated</span><span>Secure client access</span></div></section>
    <section className={styles.formPane}><div className={styles.card}><p className={styles.eyebrow}>Client sign in</p><h2>Welcome back.</h2><p>{claimToken ? "Sign in with the email used for this purchase. We’ll attach the new package to your account." : "Sign in to your LabNarrative client portal."}</p><div className={styles.form}><label><span>Email</span><input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label><label><span>Password</span><input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void signIn(); }} /></label><button className={styles.button} type="button" onClick={signIn} disabled={loading}>{loading ? "SIGNING IN…" : "SIGN IN →"}</button></div>{error ? <p className={styles.error}>{error}</p> : null}<div className={styles.security}>Your session is securely managed by Supabase Auth.</div><a className={styles.secondary} href="mailto:hello@labnarrative.com">Need help accessing your account? →</a></div></section>
  </main>;
}
