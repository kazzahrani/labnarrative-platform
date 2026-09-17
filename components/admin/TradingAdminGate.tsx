"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { tradingBrowserSupabase as supabase } from "@/lib/trading-supabase-browser";

async function isTradingAdmin() {
  const { data, error } = await supabase.rpc("is_internal_admin");
  return !error && data === true;
}

export default function TradingAdminGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<"checking" | "signed_out" | "ready">("checking");
  const [email, setEmail] = useState("khaled@labnarrative.com");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;

    const validate = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (!active) return;
      if (error || !data.session) {
        setState("signed_out");
        return;
      }

      const allowed = await isTradingAdmin();
      if (!active) return;
      if (allowed) {
        setState("ready");
        return;
      }

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

    const allowed = await isTradingAdmin();
    if (!allowed) {
      await supabase.auth.signOut({ scope: "local" });
      setMessage("This account is not authorized for Trading Outreach.");
      setState("signed_out");
      setBusy(false);
      return;
    }

    setState("ready");
    setBusy(false);
  };

  if (state === "ready") return <>{children}</>;

  return (
    <main style={{
      minHeight: "100vh",
      display: "grid",
      placeItems: "center",
      padding: 24,
      background: "#0d0e0f",
      color: "#f2f3f4",
      fontFamily: "Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    }}>
      <section style={{
        width: "min(520px, 100%)",
        background: "#151719",
        border: "1px solid #2a2d31",
        borderRadius: 18,
        padding: 28,
        boxShadow: "0 20px 60px rgba(0,0,0,.32)",
      }}>
        <div style={{ fontWeight: 850, marginBottom: 26, fontSize: 18 }}>
          <span style={{ color: "#2fc891" }}>Lab</span>Narrative
        </div>
        <p style={{
          margin: "0 0 7px",
          color: "#59caa4",
          fontSize: 10,
          fontWeight: 850,
          letterSpacing: ".11em",
          textTransform: "uppercase",
        }}>
          Trading administrator access
        </p>
        <h1 style={{ margin: "0 0 8px", fontSize: 30, letterSpacing: "-.04em" }}>
          {state === "checking" ? "Checking your session…" : "Sign in to Trading Outreach."}
        </h1>
        <p style={{ margin: "0 0 22px", color: "#8b9197", lineHeight: 1.6, fontSize: 13 }}>
          This page now authenticates directly against the LabNarrative Trading backend.
        </p>

        {state === "signed_out" ? (
          <>
            <label style={{ display: "grid", gap: 6, marginBottom: 10 }}>
              <span style={{ color: "#8b9197", fontSize: 11, fontWeight: 700 }}>Administrator email</span>
              <input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                type="email"
                autoComplete="email"
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  border: "1px solid #32363a",
                  borderRadius: 9,
                  padding: "11px 12px",
                  color: "#f2f3f4",
                  background: "#0f1113",
                  font: "inherit",
                }}
              />
            </label>

            {!sent ? (
              <button
                type="button"
                onClick={() => void sendCode()}
                disabled={busy}
                style={{
                  width: "100%",
                  border: "1px solid #2fc891",
                  background: "#2fc891",
                  color: "#071510",
                  borderRadius: 9,
                  padding: "10px 12px",
                  fontWeight: 850,
                  cursor: busy ? "default" : "pointer",
                  opacity: busy ? .6 : 1,
                }}
              >
                {busy ? "Sending…" : "Send verification code"}
              </button>
            ) : (
              <div style={{ display: "grid", gap: 9 }}>
                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ color: "#8b9197", fontSize: 11, fontWeight: 700 }}>Verification code</span>
                  <input
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    style={{
                      width: "100%",
                      boxSizing: "border-box",
                      border: "1px solid #32363a",
                      borderRadius: 9,
                      padding: "11px 12px",
                      color: "#f2f3f4",
                      background: "#0f1113",
                      font: "inherit",
                    }}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void verifyCode()}
                  disabled={busy || !code.trim()}
                  style={{
                    width: "100%",
                    border: "1px solid #2fc891",
                    background: "#2fc891",
                    color: "#071510",
                    borderRadius: 9,
                    padding: "10px 12px",
                    fontWeight: 850,
                    cursor: busy ? "default" : "pointer",
                    opacity: busy ? .6 : 1,
                  }}
                >
                  {busy ? "Verifying…" : "Verify & continue"}
                </button>
              </div>
            )}

            {message ? (
              <p style={{
                margin: "12px 0 0",
                color: message.toLowerCase().includes("sent") ? "#59caa4" : "#dc8a8a",
                fontSize: 12,
                lineHeight: 1.5,
              }}>
                {message}
              </p>
            ) : null}
          </>
        ) : null}
      </section>
    </main>
  );
}
