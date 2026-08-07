"use client";

import { FormEvent, useEffect, useState } from "react";
import { browserSupabase as supabase } from "@/lib/supabase-browser";

type IntegrationState = {
  status: string;
  last_error: string;
  inbound_domain: string;
  inbound_status: string;
};

type ConnectResult = {
  ok?: boolean;
  error?: string;
  message?: string;
  inbound?: { domain?: string; status?: string };
};

const shell: React.CSSProperties = {
  maxWidth: 860,
  margin: "0 auto",
  padding: "48px 24px 80px",
  fontFamily: "inherit",
};

const card: React.CSSProperties = {
  border: "1px solid rgba(120,130,125,.26)",
  borderRadius: 18,
  padding: 24,
  background: "var(--background, #fff)",
  boxShadow: "0 12px 36px rgba(0,0,0,.05)",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 46,
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(120,130,125,.4)",
  background: "transparent",
  color: "inherit",
  font: "inherit",
  boxSizing: "border-box",
};

const buttonStyle: React.CSSProperties = {
  minHeight: 44,
  padding: "10px 16px",
  border: 0,
  borderRadius: 10,
  background: "#183f34",
  color: "white",
  font: "inherit",
  fontWeight: 700,
  cursor: "pointer",
};

export default function OutreachSetupPage() {
  const [integration, setIntegration] = useState<IntegrationState | null>(null);
  const [receivingAddress, setReceivingAddress] = useState("");
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      setError("Administrator sign-in is required.");
      setLoading(false);
      return;
    }
    const result = await supabase
      .from("resend_integration_state")
      .select("status,last_error,inbound_domain,inbound_status")
      .eq("id", "primary")
      .maybeSingle();
    if (result.error) setError(result.error.message);
    else setIntegration((result.data ?? null) as IntegrationState | null);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  async function connect(event: FormEvent) {
    event.preventDefault();
    const address = receivingAddress.trim();
    if (!address) return;
    setConnecting(true);
    setError("");
    setNotice("");
    try {
      const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError || !refreshed.session) throw new Error("Administrator sign-in is required. Refresh the page and sign in again.");

      const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/resend-connect`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${refreshed.session.access_token}`,
          apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ receivingAddress: address }),
      });
      const result = (await response.json().catch(() => ({}))) as ConnectResult;
      if (!response.ok || result.error) throw new Error(result.error || result.message || `Setup failed with HTTP ${response.status}.`);

      setNotice(result.message || "Automatic reply detection is connected.");
      setReceivingAddress("");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Resend inbound setup failed.");
    } finally {
      setConnecting(false);
    }
  }

  const connected = integration?.status === "connected" && integration?.inbound_status === "managed_ready" && Boolean(integration?.inbound_domain);

  return (
    <main style={shell}>
      <p style={{ margin: 0, opacity: .62, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", fontSize: 12 }}>
        LabNarrative · Outreach
      </p>
      <h1 style={{ margin: "8px 0 10px", fontSize: "clamp(30px,4vw,46px)", lineHeight: 1.05 }}>Automatic reply setup</h1>
      <p style={{ margin: "0 0 28px", maxWidth: 720, opacity: .72, lineHeight: 1.65 }}>
        LabNarrative will use Resend&apos;s free managed receiving domain for PI replies. This avoids a second custom-domain charge and requires no DNS changes.
      </p>

      <section style={card}>
        <h2 style={{ marginTop: 0 }}>1. Copy your Resend Receiving address</h2>
        <p style={{ opacity: .72, lineHeight: 1.65 }}>
          In Resend, open <strong>Emails → Receiving</strong>, click the <strong>⋯</strong> menu, then choose <strong>Receiving address</strong>. Copy the address ending in <strong>.resend.app</strong> and paste it below.
        </p>
        <form onSubmit={connect} style={{ display: "flex", gap: 10, alignItems: "stretch", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 430px" }}>
            <input
              aria-label="Resend Receiving address"
              autoComplete="off"
              disabled={connecting}
              onChange={(event) => setReceivingAddress(event.target.value)}
              placeholder="anything@your-id.resend.app"
              style={inputStyle}
              type="text"
              value={receivingAddress}
            />
          </div>
          <button disabled={connecting || !receivingAddress.trim()} style={{ ...buttonStyle, opacity: connecting || !receivingAddress.trim() ? .55 : 1 }} type="submit">
            {connecting ? "Connecting…" : "Connect automatic replies"}
          </button>
        </form>
        {loading ? <p style={{ opacity: .65 }}>Checking current setup…</p> : null}
        {notice ? <p style={{ marginBottom: 0, color: "#2d6a4f", fontWeight: 700 }}>{notice}</p> : null}
        {error ? <p style={{ marginBottom: 0, color: "#a33", fontWeight: 700 }}>{error}</p> : null}
      </section>

      <section style={{ ...card, marginTop: 18 }}>
        <h2 style={{ marginTop: 0 }}>2. Connection status</h2>
        {connected ? (
          <>
            <p style={{ margin: "0 0 8px", fontWeight: 800, color: "#2d6a4f" }}>✓ Automatic reply detection is connected</p>
            <p style={{ margin: 0, opacity: .72, lineHeight: 1.65 }}>
              Receiving domain: <strong>{integration?.inbound_domain}</strong>. No Spaceship or DNS changes are required.
            </p>
          </>
        ) : (
          <p style={{ margin: 0, opacity: .72 }}>Paste the Resend Receiving address above to finish the one-time setup.</p>
        )}
      </section>

      <section style={{ ...card, marginTop: 18 }}>
        <h2 style={{ marginTop: 0 }}>What happens after connection</h2>
        <p style={{ marginBottom: 0, opacity: .72, lineHeight: 1.65 }}>
          Every new outreach thread gets a unique PI-specific Reply-To address on the Resend-managed domain. Replies are matched to the PI and email thread, saved in LabNarrative, forwarded to <strong>khaled@labnarrative.com</strong>, and any remaining follow-ups stop immediately. Follow-ups also reuse Message-ID headers so they remain grouped with Email 1 in major mail clients.
        </p>
      </section>
    </main>
  );
}
