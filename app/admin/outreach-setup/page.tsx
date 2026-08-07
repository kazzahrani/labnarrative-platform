"use client";

import { createClient } from "@supabase/supabase-js";
import { FormEvent, useEffect, useState } from "react";

type IntegrationState = {
  status: string;
  last_error: string;
  inbound_domain: string;
  inbound_status: string;
  inbound_mx_name: string;
  inbound_mx_value: string;
  inbound_mx_priority: number | null;
};

type ConnectResult = {
  ok?: boolean;
  error?: string;
  message?: string;
  inbound?: {
    domain?: string;
    status?: string;
    mxName?: string;
    mxValue?: string;
    mxPriority?: number;
  };
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
);

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
  const [apiKey, setApiKey] = useState("");
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
      .select("status,last_error,inbound_domain,inbound_status,inbound_mx_name,inbound_mx_value,inbound_mx_priority")
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
    const key = apiKey.trim();
    if (!key) return;
    setConnecting(true);
    setError("");
    setNotice("");
    try {
      const { data, error: invokeError } = await supabase.functions.invoke("resend-connect", {
        body: { apiKey: key },
      });

      if (invokeError) {
        let detail = invokeError.message;
        const context = (invokeError as { context?: unknown }).context;
        if (
          context &&
          typeof context === "object" &&
          "json" in context &&
          typeof (context as { json?: unknown }).json === "function"
        ) {
          const parsed = await (context as { json: () => Promise<ConnectResult> })
            .json()
            .catch(() => ({} as ConnectResult));
          detail = parsed.error || parsed.message || detail;
        }
        throw new Error(detail);
      }

      const result = (data ?? {}) as ConnectResult;
      if (result.error) throw new Error(result.error);
      setApiKey("");
      setNotice(result.message || "Resend inbound reply handling is configured.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Resend inbound setup failed.");
    } finally {
      setConnecting(false);
    }
  }

  const domain = integration?.inbound_domain || "reply.labnarrative.com";
  const mxName = integration?.inbound_mx_name || "";
  const mxValue = integration?.inbound_mx_value || "";
  const mxPriority = integration?.inbound_mx_priority ?? 10;
  const configured = Boolean(mxValue);

  return (
    <main style={shell}>
      <p style={{ margin: 0, opacity: .62, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", fontSize: 12 }}>
        LabNarrative · Outreach
      </p>
      <h1 style={{ margin: "8px 0 10px", fontSize: "clamp(30px,4vw,46px)", lineHeight: 1.05 }}>Automatic reply setup</h1>
      <p style={{ margin: "0 0 28px", maxWidth: 720, opacity: .72, lineHeight: 1.65 }}>
        This one-time setup lets LabNarrative detect PI replies automatically, stop remaining follow-ups, keep the reply in the platform, and forward a copy to your LabNarrative mailbox.
      </p>

      <section style={card}>
        <h2 style={{ marginTop: 0 }}>1. Connect a Resend Full access key</h2>
        <p style={{ opacity: .72, lineHeight: 1.6 }}>
          In Resend, create a new API key with <strong>Full access</strong>. Paste it here once. LabNarrative stores it securely in Supabase Vault; the key is not displayed again.
        </p>
        <form onSubmit={connect} style={{ display: "flex", gap: 10, alignItems: "stretch", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 420px" }}>
            <input
              aria-label="Resend Full access API key"
              autoComplete="off"
              disabled={connecting}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder="re_…"
              style={inputStyle}
              type="password"
              value={apiKey}
            />
          </div>
          <button disabled={connecting || !apiKey.trim()} style={{ ...buttonStyle, opacity: connecting || !apiKey.trim() ? .55 : 1 }} type="submit">
            {connecting ? "Connecting…" : "Connect & prepare inbound"}
          </button>
        </form>
        {loading ? <p style={{ opacity: .65 }}>Checking current setup…</p> : null}
        {notice ? <p style={{ marginBottom: 0, color: "#2d6a4f", fontWeight: 700 }}>{notice}</p> : null}
        {error ? <p style={{ marginBottom: 0, color: "#a33", fontWeight: 700 }}>{error}</p> : null}
      </section>

      <section style={{ ...card, marginTop: 18, opacity: configured ? 1 : .62 }}>
        <h2 style={{ marginTop: 0 }}>2. Add the receiving MX record in Spaceship</h2>
        {configured ? (
          <>
            <p style={{ opacity: .72, lineHeight: 1.6 }}>
              Resend has prepared <strong>{domain}</strong>. Add this single MX record to the DNS zone for <strong>labnarrative.com</strong>.
            </p>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                <thead><tr><th style={{ textAlign: "left", padding: "10px 8px" }}>Type</th><th style={{ textAlign: "left", padding: "10px 8px" }}>Host / Name</th><th style={{ textAlign: "left", padding: "10px 8px" }}>Value</th><th style={{ textAlign: "left", padding: "10px 8px" }}>Priority</th></tr></thead>
                <tbody><tr>
                  <td style={{ padding: "12px 8px", borderTop: "1px solid rgba(120,130,125,.22)" }}>MX</td>
                  <td style={{ padding: "12px 8px", borderTop: "1px solid rgba(120,130,125,.22)", fontFamily: "monospace" }}>{mxName}</td>
                  <td style={{ padding: "12px 8px", borderTop: "1px solid rgba(120,130,125,.22)", fontFamily: "monospace" }}>{mxValue}</td>
                  <td style={{ padding: "12px 8px", borderTop: "1px solid rgba(120,130,125,.22)" }}>{mxPriority}</td>
                </tr></tbody>
              </table>
            </div>
            <p style={{ marginBottom: 0, opacity: .66 }}>
              Current Resend receiving status: <strong>{integration?.inbound_status || "waiting for DNS"}</strong>. Use an automatic/default TTL in Spaceship.
            </p>
          </>
        ) : (
          <p style={{ marginBottom: 0 }}>Connect the Full access key above first; the exact MX record will appear here automatically.</p>
        )}
      </section>

      <section style={{ ...card, marginTop: 18 }}>
        <h2 style={{ marginTop: 0 }}>What happens after DNS is active</h2>
        <p style={{ marginBottom: 0, opacity: .72, lineHeight: 1.65 }}>
          Every new outreach email uses a PI-specific address at <strong>{domain}</strong>. A reply is matched to the PI and email thread, saved in LabNarrative, forwarded to <strong>khaled@labnarrative.com</strong>, and the remaining follow-up sequence stops immediately. Follow-ups also reuse Message-ID headers so they stay grouped with Email 1 in major mail clients.
        </p>
      </section>
    </main>
  );
}
