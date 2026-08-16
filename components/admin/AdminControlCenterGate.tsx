"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { browserSupabase as supabase } from "@/lib/supabase-browser";

const LEGACY_PLATFORM_ORIGIN = "https://platform.labnarrative.com";

function safeReturnTo(raw: string | null) {
  if (!raw || !raw.startsWith("/admin") || raw.startsWith("//")) return "/admin";
  if (raw.startsWith("/admin/session-import") || raw.startsWith("/admin/session-transfer")) return "/admin";
  return raw;
}

function requestedReturnTo() {
  if (typeof window === "undefined") return "/admin";
  return safeReturnTo(new URLSearchParams(window.location.search).get("return_to"));
}

export default function AdminControlCenterGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<"checking" | "signed_out" | "ready">("checking");
  const [email, setEmail] = useState("hello@labnarrative.com");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;

    const validate = async () => {
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      const session = data.session;
      if (!session) {
        setState("signed_out");
        return;
      }

      const { data: roleRow, error: roleError } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id)
        .maybeSingle();
      if (!active) return;

      if (!roleError && roleRow?.role === "admin") {
        setState("ready");
        return;
      }

      // A client/customer session may coexist on the same domain, but it must
      // never be treated as an administrator session. Clear only the local
      // default admin-storage session and show the admin recovery flow.
      await supabase.auth.signOut({ scope: "local" });
      if (active) setState("signed_out");
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

  const restoreExisting = () => {
    const transfer = new URL("/admin/session-transfer", LEGACY_PLATFORM_ORIGIN);
    transfer.searchParams.set("return_to", requestedReturnTo());
    window.location.assign(transfer.toString());
  };

  const sendCode = async () => {
    if (busy || !email.trim()) return;
    setBusy(true);
    setMessage("");
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: false },
    });
    if (error) {
      setMessage(error.message);
    } else {
      setSent(true);
      setMessage("Verification code sent. Enter the code from your administrator mailbox.");
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
    window.sessionStorage.removeItem("labnarrative-admin-recovery-attempted");
    const returnTo = requestedReturnTo();
    if (returnTo !== "/admin") {
      window.location.replace(returnTo);
      return;
    }
    setState("ready");
    setBusy(false);
  };

  if (state === "ready") return <>{children}</>;

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "#f6f7f2", color: "#152019", fontFamily: "Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      <section style={{ width: "min(560px, 100%)", background: "#fff", border: "1px solid #d8ded9", borderRadius: 18, padding: 28, boxShadow: "0 18px 48px rgba(36,75,59,.08)" }}>
        <div style={{ fontWeight: 800, marginBottom: 26 }}><span style={{ color: "#244b3b" }}>Lab</span>Narrative</div>
        <p style={{ margin: "0 0 7px", color: "#315f50", fontSize: 11, fontWeight: 800, letterSpacing: ".12em", textTransform: "uppercase" }}>Administrator access</p>
        <h1 style={{ margin: "0 0 8px", fontSize: 30, letterSpacing: "-.04em" }}>{state === "checking" ? "Checking your session…" : "Restore administrator access."}</h1>
        <p style={{ margin: "0 0 22px", color: "#627069", lineHeight: 1.6 }}>Your LabNarrative admin session is designed to stay signed in on one canonical domain. Client-portal sessions are kept separate and cannot satisfy the administrator gate.</p>

        {state === "signed_out" ? <>
          <button type="button" onClick={restoreExisting} style={{ width: "100%", border: "1px solid #244b3b", background: "#244b3b", color: "#fff", borderRadius: 10, padding: "11px 13px", fontWeight: 800, cursor: "pointer" }}>Restore existing admin session →</button>
          <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "20px 0", color: "#7b8881", fontSize: 11 }}><span style={{ flex: 1, height: 1, background: "#e1e6e2" }} />or sign in<span style={{ flex: 1, height: 1, background: "#e1e6e2" }} /></div>
          <label style={{ display: "grid", gap: 6, marginBottom: 10 }}><span style={{ color: "#627069", fontSize: 11, fontWeight: 700 }}>Administrator email</span><input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" style={{ width: "100%", boxSizing: "border-box", border: "1px solid #d8ded9", borderRadius: 9, padding: "10px 11px", color: "#152019", background: "#fff", font: "inherit" }} /></label>
          {!sent ? <button type="button" onClick={() => void sendCode()} disabled={busy} style={{ width: "100%", border: "1px solid #c6d5cc", background: "#e9f0eb", color: "#244b3b", borderRadius: 9, padding: "10px 12px", fontWeight: 800, cursor: busy ? "default" : "pointer", opacity: busy ? .6 : 1 }}>{busy ? "Sending…" : "Send verification code"}</button> : <div style={{ display: "grid", gap: 9 }}><label style={{ display: "grid", gap: 6 }}><span style={{ color: "#627069", fontSize: 11, fontWeight: 700 }}>Verification code</span><input value={code} onChange={(event) => setCode(event.target.value)} inputMode="numeric" autoComplete="one-time-code" style={{ width: "100%", boxSizing: "border-box", border: "1px solid #d8ded9", borderRadius: 9, padding: "10px 11px", color: "#152019", background: "#fff", font: "inherit" }} /></label><button type="button" onClick={() => void verifyCode()} disabled={busy || !code.trim()} style={{ width: "100%", border: "1px solid #244b3b", background: "#244b3b", color: "#fff", borderRadius: 9, padding: "10px 12px", fontWeight: 800, cursor: busy ? "default" : "pointer", opacity: busy ? .6 : 1 }}>{busy ? "Verifying…" : "Verify & continue"}</button></div>}
          {message ? <p style={{ margin: "12px 0 0", color: message.toLowerCase().includes("sent") ? "#315f50" : "#9b5656", fontSize: 12, lineHeight: 1.5 }}>{message}</p> : null}
        </> : null}
      </section>
    </main>
  );
}
