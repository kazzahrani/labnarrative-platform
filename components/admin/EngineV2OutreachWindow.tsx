"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { browserSupabase as supabase } from "@/lib/supabase-browser";

type Draft = {
  runId: string;
  piName: string;
  slug: string;
  recipientEmail: string;
  subject: string;
  bodyText: string;
  status: "draft" | "sending" | "failed";
  sentAt?: string | null;
  providerMessageId?: string;
  errorMessage?: string;
};

const panel: React.CSSProperties = {
  position: "fixed",
  inset: "72px 24px 24px",
  zIndex: 2147483000,
  display: "grid",
  gridTemplateColumns: "240px minmax(0,1fr)",
  maxWidth: 1060,
  width: "calc(100vw - 48px)",
  margin: "0 auto",
  background: "#0f1c19",
  color: "#eef4ef",
  border: "1px solid rgba(255,255,255,.12)",
  borderRadius: 18,
  boxShadow: "0 28px 90px rgba(0,0,0,.52)",
  overflow: "hidden",
};

const field: React.CSSProperties = {
  width: "100%",
  border: "1px solid rgba(255,255,255,.14)",
  background: "rgba(255,255,255,.045)",
  color: "inherit",
  borderRadius: 10,
  padding: "10px 12px",
  font: "inherit",
  boxSizing: "border-box",
};

const button: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,.14)",
  borderRadius: 10,
  padding: "9px 13px",
  background: "rgba(255,255,255,.06)",
  color: "inherit",
  font: "inherit",
  fontWeight: 750,
  cursor: "pointer",
};

function messageFrom(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string") return error;
  return "The outreach action could not be completed.";
}

export default function EngineV2OutreachWindow() {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [activeRunId, setActiveRunId] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const active = useMemo(() => drafts.find((item) => item.runId === activeRunId) ?? drafts[0] ?? null, [drafts, activeRunId]);

  const updateActive = useCallback((patch: Partial<Draft>) => {
    if (!active) return;
    setDrafts((current) => current.map((item) => item.runId === active.runId ? { ...item, ...patch } : item));
  }, [active]);

  const loadPending = useCallback(async (openIfFound = false) => {
    if (window.location.pathname !== "/admin/automation") return;
    const { data: auth } = await supabase.auth.getSession();
    if (!auth.session) return;
    setLoading(true);
    try {
      const { data, error: rpcError } = await supabase.rpc("engine_v2_admin_outreach_pending");
      if (rpcError) throw rpcError;
      const next = Array.isArray(data) ? data as Draft[] : [];
      setDrafts(next);
      if (next.length) {
        setActiveRunId((current) => next.some((item) => item.runId === current) ? current : next[0].runId);
        if (openIfFound) setOpen(true);
      } else {
        setOpen(false);
      }
      setError("");
    } catch (loadError) {
      setError(messageFrom(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (window.location.pathname !== "/admin/automation") return;
    void loadPending(true);

    const observePublish = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const clicked = target.closest("button");
      if (!clicked) return;
      const label = clicked.textContent?.trim() || "";
      if (!label.startsWith("Publish")) return;
      window.setTimeout(() => void loadPending(true), 1800);
      window.setTimeout(() => void loadPending(true), 4500);
    };

    document.addEventListener("click", observePublish, false);
    return () => document.removeEventListener("click", observePublish, false);
  }, [loadPending]);

  async function saveCurrentDraft() {
    if (!active) return;
    const { error: saveError } = await supabase.rpc("engine_v2_admin_outreach_save", {
      p_run_id: active.runId,
      p_recipient_email: active.recipientEmail,
      p_subject: active.subject,
      p_body_text: active.bodyText,
    });
    if (saveError) throw saveError;
  }

  async function saveDraft() {
    if (!active || working) return false;
    setWorking("save");
    setNotice("");
    setError("");
    try {
      await saveCurrentDraft();
      setNotice("Draft saved.");
      return true;
    } catch (saveError) {
      setError(messageFrom(saveError));
      return false;
    } finally {
      setWorking("");
    }
  }

  function removeCompletedDraft(runId: string) {
    const remaining = drafts.filter((item) => item.runId !== runId);
    setDrafts(remaining);
    if (remaining.length) setActiveRunId(remaining[0].runId);
    else setOpen(false);
  }

  async function sendNow() {
    if (!active || working) return;
    setWorking("send");
    setNotice("");
    setError("");

    try {
      await saveCurrentDraft();

      const { data: auth } = await supabase.auth.getSession();
      const token = auth.session?.access_token;
      if (!token) throw new Error("Administrator session is not available. Reload the page and sign in again.");

      const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 15000);
      let response: Response;
      try {
        response = await fetch(`${url}/functions/v1/labnarrative-engine-v2-outreach-send`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${token}` },
          body: JSON.stringify({ runId: active.runId }),
          signal: controller.signal,
          cache: "no-store",
        });
      } finally {
        window.clearTimeout(timeout);
      }
      const payload = await response.json().catch(() => ({})) as { error?: string; providerMessageId?: string; alreadySent?: boolean };
      if (!response.ok) throw new Error(payload.error || `Email send failed (${response.status}).`);

      const sentRunId = active.runId;
      const sentName = active.piName;
      removeCompletedDraft(sentRunId);
      setNotice(`Email sent to ${sentName}.`);
      window.setTimeout(() => window.location.reload(), 450);
    } catch (sendError) {
      setError(sendError instanceof Error && sendError.name === "AbortError" ? "Email sending timed out. Check the status before retrying." : messageFrom(sendError));
      void loadPending(false);
    } finally {
      setWorking("");
    }
  }

  async function confirmPersonalSent() {
    if (!active || working) return;
    const confirmed = window.confirm(
      `Confirm that you already sent this email to ${active.recipientEmail} from your personal email?\n\nLabNarrative will NOT send an email. This only marks the outreach as sent and completes this production item.`
    );
    if (!confirmed) return;

    setWorking("personal");
    setNotice("");
    setError("");

    try {
      await saveCurrentDraft();
      const { error: confirmError } = await supabase.rpc("engine_v2_admin_confirm_personal_sent", {
        p_run_id: active.runId,
      });
      if (confirmError) throw confirmError;

      const sentRunId = active.runId;
      const sentName = active.piName;
      removeCompletedDraft(sentRunId);
      setNotice(`Marked ${sentName} as sent from personal email.`);
      window.setTimeout(() => window.location.reload(), 450);
    } catch (confirmError) {
      setError(messageFrom(confirmError));
    } finally {
      setWorking("");
    }
  }

  if (typeof window === "undefined" || window.location.pathname !== "/admin/automation") return null;
  if (!drafts.length && !notice) return null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{ ...button, position: "fixed", left: 24, bottom: 24, zIndex: 2147483000, background: "#1b6456", boxShadow: "0 12px 34px rgba(0,0,0,.28)" }}
      >
        Outreach ready{drafts.length ? ` (${drafts.length})` : ""}
      </button>
    );
  }

  return (
    <>
      <div style={{ position: "fixed", inset: 0, zIndex: 2147482999, background: "rgba(3,8,7,.66)", backdropFilter: "blur(3px)" }} onClick={() => setOpen(false)} />
      <section style={panel} aria-label="Engine v2 outreach review">
        <aside style={{ padding: 18, borderRight: "1px solid rgba(255,255,255,.1)", overflowY: "auto" }}>
          <p style={{ margin: "0 0 4px", opacity: .55, fontSize: 11, textTransform: "uppercase", letterSpacing: ".09em", fontWeight: 800 }}>Published concepts</p>
          <h2 style={{ margin: "0 0 14px", fontSize: 20 }}>Outreach ready</h2>
          <div style={{ display: "grid", gap: 7 }}>
            {drafts.map((item) => (
              <button
                key={item.runId}
                type="button"
                onClick={() => { setActiveRunId(item.runId); setNotice(""); setError(""); }}
                style={{ ...button, textAlign: "left", background: active?.runId === item.runId ? "rgba(70,170,145,.18)" : "rgba(255,255,255,.035)" }}
              >
                <strong style={{ display: "block", fontSize: 13 }}>{item.piName}</strong>
                <span style={{ display: "block", opacity: .56, fontSize: 11, marginTop: 2 }}>{item.recipientEmail}</span>
              </button>
            ))}
          </div>
        </aside>

        <div style={{ padding: 22, minWidth: 0, overflowY: "auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", marginBottom: 18 }}>
            <div>
              <p style={{ margin: 0, opacity: .55, fontSize: 11, textTransform: "uppercase", letterSpacing: ".09em", fontWeight: 800 }}>Review before sending</p>
              <h2 style={{ margin: "5px 0 3px", fontSize: 24 }}>{active?.piName || "Outreach"}</h2>
              {active ? <a href={`https://${active.slug}.labnarrative.com`} target="_blank" rel="noreferrer" style={{ color: "#8fcdbc", fontSize: 12 }}>Open live concept ↗</a> : null}
            </div>
            <button type="button" style={button} onClick={() => setOpen(false)}>Close</button>
          </div>

          {loading ? <p style={{ opacity: .65 }}>Loading outreach drafts…</p> : null}
          {notice ? <p style={{ padding: "9px 11px", borderRadius: 9, background: "rgba(80,185,145,.12)", color: "#a9dfc9", fontSize: 12 }}>{notice}</p> : null}
          {error ? <p style={{ padding: "9px 11px", borderRadius: 9, background: "rgba(218,100,86,.12)", color: "#f0b2a8", fontSize: 12 }}>{error}</p> : null}

          {active ? (
            <div style={{ display: "grid", gap: 13 }}>
              <label style={{ display: "grid", gap: 6, fontSize: 12, fontWeight: 750 }}>
                Recipient
                <input style={field} value={active.recipientEmail} onChange={(event) => updateActive({ recipientEmail: event.target.value })} />
              </label>
              <label style={{ display: "grid", gap: 6, fontSize: 12, fontWeight: 750 }}>
                Subject
                <input style={field} value={active.subject} onChange={(event) => updateActive({ subject: event.target.value })} />
              </label>
              <label style={{ display: "grid", gap: 6, fontSize: 12, fontWeight: 750 }}>
                Email
                <textarea style={{ ...field, minHeight: 300, resize: "vertical", lineHeight: 1.55 }} value={active.bodyText} onChange={(event) => updateActive({ bodyText: event.target.value })} />
              </label>
              <p style={{ margin: 0, opacity: .55, fontSize: 11 }}>Sender: LabNarrative &lt;khaled@labnarrative.com&gt; · “Send email now” sends through LabNarrative. “Confirm sent from personal email” never sends anything.</p>
              <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
                <button type="button" style={button} disabled={Boolean(working)} onClick={() => void saveDraft()}>{working === "save" ? "Saving…" : "Save draft"}</button>
                <button type="button" style={{ ...button, background: "#1b6456", borderColor: "rgba(143,205,188,.35)" }} disabled={Boolean(working)} onClick={() => void sendNow()}>{working === "send" ? "Sending…" : "Send email now"}</button>
                <button type="button" style={{ ...button, background: "rgba(255,255,255,.035)", borderColor: "rgba(255,255,255,.2)" }} disabled={Boolean(working)} onClick={() => void confirmPersonalSent()}>{working === "personal" ? "Confirming…" : "Confirm sent from personal email"}</button>
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </>
  );
}
