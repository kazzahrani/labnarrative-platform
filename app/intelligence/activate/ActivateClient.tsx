"use client";

import { useEffect, useState } from "react";
import styles from "../auth.module.css";
import { intelligenceAuth, intelligenceFunctionsBase } from "../client/authClient";

type Invite = {
  activated: boolean;
  email: string;
  name: string;
  companyName: string;
  companyWebsite: string;
  packageName: string;
  productCount: number;
  amount: number;
  currency: string;
};

export default function ActivateClient() {
  const [token, setToken] = useState("");
  const [invite, setInvite] = useState<Invite | null>(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function authCall(action: string, body: Record<string, unknown> = {}) {
    const response = await fetch(`${intelligenceFunctionsBase}/intelligence-client-auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, token, ...body }),
    });
    const payload = await response.json().catch(() => ({})) as Record<string, any>;
    if (!response.ok) {
      const err = new Error(String(payload.error || "Account activation failed.")) as Error & { payload?: Record<string, any> };
      err.payload = payload;
      throw err;
    }
    return payload;
  }

  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get("token") || "";
    setToken(value);
    if (!value) {
      setError("This activation link is incomplete.");
      setLoading(false);
      return;
    }
    void fetch(`${intelligenceFunctionsBase}/intelligence-client-auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "inspect", token: value }),
    })
      .then(async (r) => {
        const p = await r.json();
        if (!r.ok) throw new Error(String(p.error || "Activation link could not be opened."));
        setInvite(p as Invite);
        setName(String(p.name || ""));
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Activation link could not be opened."))
      .finally(() => setLoading(false));
  }, []);

  async function activate() {
    if (!invite) return;
    setError("");
    if (password.length < 8) return setError("Use at least 8 characters for your password.");
    if (password !== confirmPassword) return setError("The passwords do not match.");
    setSubmitting(true);
    try {
      await authCall("activate", { password, fullName: name });
      const signed = await intelligenceAuth.auth.signInWithPassword({ email: invite.email, password });
      if (signed.error) throw signed.error;
      window.location.href = "/client";
    } catch (e) {
      const err = e as Error & { payload?: Record<string, any> };
      if (err.payload?.error === "account_exists") {
        window.location.href = `/login?claim=${encodeURIComponent(token)}&email=${encodeURIComponent(invite.email)}`;
        return;
      }
      if (err.payload?.error === "already_activated") {
        window.location.href = "/login";
        return;
      }
      setError(err.message || "Account activation failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.brandPane}>
        <div className={styles.wordmark}><span>Lab</span>Narrative</div>
        <div>
          <p className={styles.eyebrow}>Client portal</p>
          <h1>Your LabNarrative account,<br /><em>ready to work.</em></h1>
          <p>Create your password once. After that, your product analyses, reports, billing and company profile live in one secure client portal.</p>
        </div>
        <div className={styles.brandFoot}><span>Scientific intelligence</span><span>Scientist-validated</span><span>Private client access</span></div>
      </section>
      <section className={styles.formPane}>
        <div className={styles.card}>
          {loading ? <p className={styles.loading}>Opening your paid LabNarrative account…</p> : null}
          {!loading && invite ? (
            <>
              <p className={styles.eyebrow}>Activate your portal</p>
              <h2>{invite.activated ? "Your account is already active." : "Create your client account."}</h2>
              <p>{invite.activated ? "Sign in to continue to your LabNarrative workspace." : "Your paid package is already attached. Set a password to secure your account."}</p>
              <div className={styles.summary}>
                <div><span>Package</span><strong>{invite.packageName}</strong></div>
                <div><span>Analyses</span><strong>{invite.productCount}</strong></div>
                <div><span>Paid</span><strong>${invite.amount} {invite.currency}</strong></div>
                <div><span>Company</span><strong>{invite.companyName || "Your company"}</strong></div>
              </div>
              {invite.activated ? (
                <a className={styles.button} href="/login" style={{display:"block",textAlign:"center",textDecoration:"none"}}>SIGN IN TO CLIENT PORTAL →</a>
              ) : (
                <div className={styles.form}>
                  <label><span>Full name</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" /></label>
                  <label><span>Account email</span><input value={invite.email} disabled /></label>
                  <div className={styles.emailHint}>This is the email attached to the paid purchase.</div>
                  <label><span>Create password</span><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Minimum 8 characters" /></label>
                  <label><span>Confirm password</span><input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} /></label>
                  <button className={styles.button} type="button" onClick={activate} disabled={submitting}>{submitting ? "CREATING ACCOUNT…" : "CREATE CLIENT ACCOUNT →"}</button>
                </div>
              )}
              <div className={styles.security}>Secured with Supabase Auth. Your paid analysis entitlement stays linked to your account.</div>
            </>
          ) : null}
          {error ? <p className={styles.error}>{error}</p> : null}
          {!loading && !invite ? <a className={styles.secondary} href="/login">Go to client sign in →</a> : null}
        </div>
      </section>
    </main>
  );
}
