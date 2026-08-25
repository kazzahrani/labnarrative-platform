"use client";

import { FormEvent, useEffect, useState } from "react";
import { browserSupabase } from "../../lib/supabase-browser";
import styles from "./binance-connect.module.css";

type ControlResponse = {
  ok?: boolean;
  connection?: {
    status?: string;
    apiKeyLast4?: string | null;
    permissionRead?: boolean;
    permissionTrade?: boolean;
    permissionWithdraw?: boolean;
    permissionInternalTransfer?: boolean;
    ipRestricted?: boolean | null;
  } | null;
  gateway?: {
    status?: string;
    egressIp?: string | null;
  };
  error?: string;
};

function friendlyError(raw: string) {
  if (raw.includes("trader_account_not_bound")) return "This signed-in account is not bound to the Trader account.";
  if (raw.includes("gateway_not_ready")) return "The Binance gateway is not ready yet.";
  if (raw.includes("gateway_401")) return "The secure gateway rejected its signed server request. Please try again.";
  if (raw.includes("binance_key_reading_disabled")) return "Enable Reading on this Binance API key, then save the Binance settings and retry.";
  if (raw.includes("binance_key_ip_restriction_required")) return "Binance does not report this API key as IP-restricted. Restrict it to 84.13.156.194 and retry.";
  if (raw.includes("binance_key_unsafe_permissions")) return "This Binance API key has an unsafe permission enabled. Keep withdrawals, transfers, futures and options disabled.";
  if (raw.includes("-2015") || raw.toLowerCase().includes("invalid api-key")) return "Binance rejected the key. Check the API key, secret, trusted IP 84.13.156.194, and Spot trading permission.";
  if (raw.includes("invalid_credentials_format")) return "Enter the complete Binance API key and secret.";
  if (raw.includes("unauthorized")) return "Your secure sign-in expired. Sign in again and retry.";
  return "Binance verification failed. Recheck the API key settings and try again.";
}

async function invokeControl(body: Record<string, unknown>): Promise<ControlResponse> {
  const { data, error } = await browserSupabase.functions.invoke("trader-binance-control", { body });
  if (error) {
    let message = error.message || "binance_control_failed";
    const context = (error as { context?: Response }).context;
    if (context) {
      try {
        const payload = await context.clone().json() as { error?: string };
        if (payload?.error) message = payload.error;
      } catch {}
    }
    throw new Error(message);
  }
  const result = (data ?? {}) as ControlResponse;
  if (result.error) throw new Error(result.error);
  return result;
}

export default function BinanceConnectionLayer() {
  const [open, setOpen] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(false);
  const [last4, setLast4] = useState<string | null>(null);
  const [gatewayIp, setGatewayIp] = useState("84.13.156.194");

  const [authChecked, setAuthChecked] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");

  const loadStatus = async () => {
    try {
      const data = await invokeControl({ action: "status" });
      setConnected(data.connection?.status === "connected");
      setLast4(data.connection?.apiKeyLast4 ?? null);
      if (data.gateway?.egressIp) setGatewayIp(data.gateway.egressIp);
    } catch {}
  };

  useEffect(() => {
    let active = true;
    void browserSupabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      const hasSession = Boolean(data.session);
      setSignedIn(hasSession);
      setAuthChecked(true);
      if (hasSession) void loadStatus();
    });
    const { data: listener } = browserSupabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      const hasSession = Boolean(session);
      setSignedIn(hasSession);
      setAuthChecked(true);
      if (hasSession) void loadStatus();
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const intercept = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const button = target?.closest("button");
      if (!button) return;
      const label = (button.textContent ?? "").replace(/\s+/g, " ").trim().toLowerCase();
      if (label !== "connect binance" && label !== "connect a new account" && label !== "connect") return;
      event.preventDefault();
      event.stopPropagation();
      setError("");
      setAuthError("");
      setOpen(true);
    };
    document.addEventListener("click", intercept, true);
    return () => document.removeEventListener("click", intercept, true);
  }, []);

  const close = () => {
    if (busy || authBusy) return;
    setApiKey("");
    setApiSecret("");
    setError("");
    setAuthError("");
    setOtp("");
    setOpen(false);
  };

  const sendOtp = async (event: FormEvent) => {
    event.preventDefault();
    if (authBusy) return;
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes("@")) {
      setAuthError("Enter the email address for your LabNarrative account.");
      return;
    }
    setAuthBusy(true);
    setAuthError("");
    try {
      const { error: sendError } = await browserSupabase.auth.signInWithOtp({
        email: cleanEmail,
        options: { shouldCreateUser: false },
      });
      if (sendError) throw sendError;
      setOtpSent(true);
    } catch (caught) {
      setAuthError(caught instanceof Error ? caught.message : "Unable to send the sign-in code.");
    } finally {
      setAuthBusy(false);
    }
  };

  const verifyOtp = async (event: FormEvent) => {
    event.preventDefault();
    if (authBusy) return;
    const cleanEmail = email.trim().toLowerCase();
    const token = otp.trim();
    if (!token) {
      setAuthError("Enter the verification code from your email.");
      return;
    }
    setAuthBusy(true);
    setAuthError("");
    try {
      const { data, error: verifyError } = await browserSupabase.auth.verifyOtp({
        email: cleanEmail,
        token,
        type: "email",
      });
      if (verifyError) throw verifyError;
      if (!data.session) throw new Error("Sign-in did not create a session.");
      setSignedIn(true);
      setOtp("");
      await loadStatus();
    } catch (caught) {
      setAuthError(caught instanceof Error ? caught.message : "Unable to verify the sign-in code.");
    } finally {
      setAuthBusy(false);
    }
  };

  const connect = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (apiKey.trim().length < 10 || apiSecret.trim().length < 10) {
      setError("Enter the complete Binance API key and secret.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const health = await invokeControl({ action: "gateway_health" });
      if (health.gateway?.egressIp) setGatewayIp(health.gateway.egressIp);
      const result = await invokeControl({ action: "connect", apiKey: apiKey.trim(), apiSecret: apiSecret.trim() });
      setConnected(result.connection?.status === "connected");
      setLast4(result.connection?.apiKeyLast4 ?? apiKey.trim().slice(-4));
      setApiKey("");
      setApiSecret("");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setError(friendlyError(message));
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return <div className={styles.backdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
    <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="binance-connect-title">
      <div className={styles.header}>
        <div><span className={styles.kicker}>BINANCE SPOT</span><h2 id="binance-connect-title">{connected ? "Binance connected" : signedIn ? "Connect Binance" : "Secure sign in"}</h2></div>
        <button type="button" className={styles.close} onClick={close} aria-label="Close">×</button>
      </div>

      {!authChecked ? <div className={styles.success}><p>Checking secure session…</p></div> : !signedIn ? (
        otpSent ? <form onSubmit={verifyOtp} className={styles.form}>
          <p className={styles.intro}>Enter the verification code sent to your LabNarrative account email. This sign-in only authorizes access to your private Trader account.</p>
          <label><span>Verification code</span><input value={otp} onChange={(event) => setOtp(event.target.value)} inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit code" disabled={authBusy}/></label>
          {authError && <div className={styles.error}>{authError}</div>}
          <div className={styles.actions}><button type="button" className={styles.secondary} onClick={() => { setOtpSent(false); setOtp(""); setAuthError(""); }} disabled={authBusy}>Back</button><button type="submit" className={styles.primary} disabled={authBusy}>{authBusy ? "Verifying…" : "Verify & continue"}</button></div>
        </form> : <form onSubmit={sendOtp} className={styles.form}>
          <p className={styles.intro}>Sign in to the LabNarrative account that owns this Trader workspace before connecting an exchange.</p>
          <label><span>Email</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="Your LabNarrative account email" disabled={authBusy}/></label>
          {authError && <div className={styles.error}>{authError}</div>}
          <div className={styles.actions}><button type="button" className={styles.secondary} onClick={close} disabled={authBusy}>Cancel</button><button type="submit" className={styles.primary} disabled={authBusy}>{authBusy ? "Sending…" : "Send verification code"}</button></div>
        </form>
      ) : connected ? <div className={styles.success}>
        <div className={styles.successIcon}>✓</div>
        <strong>API verified and stored securely</strong>
        <p>{last4 ? `Connected key ending in ${last4}. ` : ""}Live trading is still OFF and the kill switch remains ON.</p>
        <div className={styles.securityGrid}>
          <div><span>Gateway IP</span><b>{gatewayIp}</b></div>
          <div><span>Execution</span><b>Disabled</b></div>
        </div>
        <button type="button" className={styles.primary} onClick={close}>Done</button>
      </div> : <form onSubmit={connect} className={styles.form}>
        <p className={styles.intro}>Paste the credentials directly here. They are sent to the authenticated Supabase control function for Binance verification and Vault storage.</p>
        <div className={styles.guardrail}><span>✓</span><div><strong>Trusted egress IP</strong><p>{gatewayIp}</p></div></div>
        <label><span>API Key</span><input value={apiKey} onChange={(event) => setApiKey(event.target.value)} autoComplete="off" spellCheck={false} placeholder="Paste Binance API Key" disabled={busy}/></label>
        <label><span>Secret Key</span><input type="password" value={apiSecret} onChange={(event) => setApiSecret(event.target.value)} autoComplete="new-password" spellCheck={false} placeholder="Paste Binance Secret Key" disabled={busy}/></label>
        <p className={styles.note}>Required: Reading + Spot & Margin Trading. Withdrawals, transfers, futures and options must remain disabled.</p>
        {error && <div className={styles.error}>{error}</div>}
        <div className={styles.actions}><button type="button" className={styles.secondary} onClick={close} disabled={busy}>Cancel</button><button type="submit" className={styles.primary} disabled={busy}>{busy ? "Verifying…" : "Connect & verify"}</button></div>
        <p className={styles.liveOff}>Connecting the exchange does not enable real-money execution.</p>
      </form>}
    </section>
  </div>;
}
