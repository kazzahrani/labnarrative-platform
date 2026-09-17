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

  const sendMagicLink = async () => {
    if (busy || !email.trim()) return;
    setBusy(true);
    setMessage("");

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        shouldCreateUser: false,
        emailRedirectTo: `${window.location.origin}/admin/trading-outreach`,
      },
    });

    if (error) {
      setMessage(error.message);
    } else {
      setSent(true);
      setMessage("Sign-in link sent. Open the email and click Sign in.");
    }

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
          Use the secure email sign-in link to access the LabNarrative Trading backend.
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
                onClick={() => void sendMagicLink()}
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
                {busy ? "Sending…" : "Send sign-in link"}
              </button>
            ) : (
              <div style={{
                border: "1px solid #2c4a40",
                background: "#13211c",
                borderRadius: 10,
                padding: 14,
              }}>
                <strong style={{ display: "block", color: "#68d7b0", fontSize: 13 }}>
                  Check your email
                </strong>
                <p style={{ margin: "6px 0 12px", color: "#a0aaa5", fontSize: 12, lineHeight: 1.55 }}>
                  We sent a secure one-time sign-in link to <b>{email}</b>. Click <b>Sign in</b> in that email; you will return directly to Trading Outreach.
                </p>
                <button
                  type="button"
                  onClick={() => void sendMagicLink()}
                  disabled={busy}
                  style={{
                    width: "100%",
                    border: "1px solid #34403c",
                    background: "#171b19",
                    color: "#d9dfdc",
                    borderRadius: 8,
                    padding: "9px 11px",
                    fontWeight: 800,
                    cursor: busy ? "default" : "pointer",
                    opacity: busy ? .6 : 1,
                  }}
                >
                  {busy ? "Sending…" : "Resend sign-in link"}
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
