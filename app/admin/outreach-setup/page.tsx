"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
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
  border: "1px solid rgba(148,163,184,.16)",
  borderRadius: 18,
  padding: 24,
  background: "#13232f",
  color: "#edf3f6",
  boxShadow: "0 12px 36px rgba(0,0,0,.22)",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 46,
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(148,163,184,.18)",
  background: "#0b1722",
  color: "#edf3f6",
  font: "inherit",
  boxSizing: "border-box",
};

const buttonStyle: React.CSSProperties = {
  minHeight: 44,
  padding: "10px 16px",
  border: "1px solid rgba(255,255,255,.06)",
  borderRadius: 10,
  background: "#194b3d",
  color: "#f5fbf8",
  font: "inherit",
  fontWeight: 700,
  cursor: "pointer",
  boxShadow: "0 8px 20px rgba(0,0,0,.14)",
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
  const legacyForwardingAddress = useMemo(
    () => integration?.inbound_domain ? `legacy-replies@${integration.inbound_domain}` : "",
    [integration?.inbound_domain],
  );

  return (
    <main style={shell}>
      <p style={{ margin: 0, opacity: .62, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", fontSize: 12 }}>
        LabNarrative · Outreach
      </p>
      <h1 style={{ margin: "8px 0 10px", fontSize: "clamp(30px,4vw,46px)", lineHeight: 1.05 }}>Automatic reply setup</h1>
      <p style={{ margin: "0 0 28px", maxWidth: 720, opacity: .72, lineHeight: 1.65 }}>
        LabNarrative uses Resend&apos;s managed receiving domain for PI replies. New outreach uses a unique PI-specific reply address; one iCloud Mail forwarding rule below also covers older emails that were sent before that change.
      </p>

      <section style={card}>
        <h2 style={{ marginTop: 0, color: "#f4f8fa" }}>1. Resend Receiving connection</h2>
        <p style={{ color: "rgba(237,243,246,.72)", lineHeight: 1.65 }}>
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
        {loading ? <p style={{ color: "rgba(237,243,246,.62)" }}>Checking current setup…</p> : null}
        {notice ? <p style={{ marginBottom: 0, color: "#8bd3b0", fontWeight: 700 }}>{notice}</p> : null}
        {error ? <p style={{ marginBottom: 0, color: "#ff9b9b", fontWeight: 700 }}>{error}</p> : null}
      </section>

      <section style={{ ...card, marginTop: 18 }}>
        <h2 style={{ marginTop: 0, color: "#f4f8fa" }}>2. Connection status</h2>
        {connected ? (
          <>
            <p style={{ margin: "0 0 8px", fontWeight: 800, color: "#8bd3b0" }}>✓ Automatic reply detection is connected</p>
            <p style={{ margin: 0, color: "rgba(237,243,246,.72)", lineHeight: 1.65 }}>
              Receiving domain: <strong>{integration?.inbound_domain}</strong>. No DNS changes are required.
            </p>
          </>
        ) : (
          <p style={{ margin: 0, color: "rgba(237,243,246,.72)" }}>Paste the Resend Receiving address above to finish the one-time setup.</p>
        )}
      </section>

      <section style={{ ...card, marginTop: 18 }}>
        <h2 style={{ marginTop: 0, color: "#f4f8fa" }}>3. Cover older emails from iCloud Mail</h2>
        {connected ? (
          <>
            <p style={{ color: "rgba(237,243,246,.72)", lineHeight: 1.65 }}>
              Add one automatic forwarding address to the <strong>khaled@labnarrative.com</strong> mailbox. Keep the original messages in iCloud so your normal inbox remains unchanged.
            </p>
            <div style={{ margin: "16px 0", padding: "14px 16px", borderRadius: 12, background: "#0b1722", border: "1px solid rgba(148,163,184,.18)" }}>
              <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: ".08em", color: "rgba(237,243,246,.55)", marginBottom: 6 }}>Forwarding address</div>
              <code style={{ color: "#9ee5c8", fontSize: 15, wordBreak: "break-all" }}>{legacyForwardingAddress}</code>
            </div>
            <p style={{ marginBottom: 0, color: "rgba(237,243,246,.72)", lineHeight: 1.65 }}>
              Go to <strong>iCloud.com/mail → Settings → Mail Forwarding</strong>. Enable <strong>Forward my email to</strong>, paste the address above, and leave <strong>Delete messages after forwarding</strong> turned off. Forwarded PI replies are matched by sender or thread headers; unmatched personal mail is ignored by LabNarrative.
            </p>
          </>
        ) : (
          <p style={{ margin: 0, color: "rgba(237,243,246,.72)" }}>Connect Resend first; the exact iCloud Mail forwarding address will appear here automatically.</p>
        )}
      </section>

      <section style={{ ...card, marginTop: 18 }}>
        <h2 style={{ marginTop: 0, color: "#f4f8fa" }}>What happens after setup</h2>
        <p style={{ marginBottom: 0, color: "rgba(237,243,246,.72)", lineHeight: 1.65 }}>
          New outreach threads use unique PI-specific Reply-To addresses. Replies to older outreach that still arrive at <strong>khaled@labnarrative.com</strong> are copied through the legacy forwarding address above. Human replies are saved in LabNarrative, surfaced in Sales, and remaining follow-ups stop; automatic replies are recorded without stopping the sequence.
        </p>
      </section>
    </main>
  );
}
