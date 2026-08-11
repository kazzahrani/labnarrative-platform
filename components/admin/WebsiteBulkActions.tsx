"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { browserSupabase as supabase } from "@/lib/supabase-browser";

type BulkItem = {
  siteId: string;
  slug: string;
  status: string;
  currentVariant: string;
  runId: string | null;
  runState: string | null;
};

type Props = {
  items: BulkItem[];
  onDone: (message: string) => void;
};

type DesignOption = { value: string; label: string };

type OutreachDraft = {
  productionRunId?: string;
  recipientEmail?: string;
  status?: string;
};

type SendResult = { ok?: boolean; alreadySent?: boolean; error?: string };

const DESIGNS: DesignOption[] = [
  { value: "Karpen_1", label: "Karpen_1" },
  { value: "Kops_1", label: "Kops_1" },
  { value: "Lens_1", label: "Lens_1" },
  { value: "ciribilli-narita-v1", label: "Narita" },
  { value: "bourdon-full", label: "bourdon-full" },
  { value: "dobbelstein-editorial-v1", label: "Dobbelstein Editorial" },
  { value: "editorial-image-v1", label: "Editorial Image" },
];

function isDesignEditable(status: string) {
  return status === "draft" || status === "concept";
}

export default function WebsiteBulkActions({ items, onDone }: Props) {
  const [designOpen, setDesignOpen] = useState(false);
  const [chosen, setChosen] = useState("Kops_1");
  const [busy, setBusy] = useState<"" | "design" | "send">("");
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");

  const editableDesignCount = useMemo(() => items.filter((item) => isDesignEditable(item.status)).length, [items]);
  const publishedRunCount = useMemo(() => items.filter((item) => item.runId && item.runState === "published").length, [items]);

  async function derivePortraitAccent(siteId: string) {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) throw new Error("Administrator sign-in required.");
    const response = await fetch("/api/admin/portrait-accent", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ siteId }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result?.ok !== true) throw new Error(result?.error || "Portrait color analysis failed.");
  }

  async function applyDesign() {
    if (busy || !items.length) return;
    const targets = items.filter((item) => isDesignEditable(item.status));
    if (!targets.length) {
      setError("None of the selected sites can change design.");
      return;
    }
    setBusy("design");
    setError("");
    let success = 0;
    const failed: string[] = [];
    for (let index = 0; index < targets.length; index += 1) {
      const item = targets[index];
      setProgress(`Applying ${index + 1}/${targets.length}…`);
      try {
        if (chosen === "Karpen_1") await derivePortraitAccent(item.siteId);
        const { data, error: rpcError } = await supabase.rpc("admin_change_site_design", {
          p_site_id: item.siteId,
          p_design_variant: chosen,
        });
        if (rpcError || !data || (typeof data === "object" && "ok" in data && data.ok !== true)) throw new Error(rpcError?.message || "Design change not confirmed.");
        success += 1;
      } catch (cause) {
        failed.push(`${item.slug}: ${cause instanceof Error ? cause.message : "failed"}`);
      }
    }
    setBusy("");
    setProgress("");
    setDesignOpen(false);
    onDone(`Changed design to ${chosen} for ${success} selected concept${success === 1 ? "" : "s"}.${failed.length ? ` ${failed.length} skipped/failed.` : ""}`);
  }

  async function sendFirstEmails() {
    if (busy || !items.length) return;
    setBusy("send");
    setError("");
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    if (!session) {
      setBusy("");
      setError("Administrator sign-in required.");
      return;
    }

    let sent = 0;
    let alreadySent = 0;
    const skipped: string[] = [];
    const targets = items.filter((item) => item.runId && item.runState === "published");

    for (let index = 0; index < targets.length; index += 1) {
      const item = targets[index];
      setProgress(`Sending ${index + 1}/${targets.length}…`);
      try {
        const { data: draftData, error: draftError } = await supabase.rpc("engine_admin_outreach_get", { p_run_id: item.runId });
        if (draftError) throw draftError;
        const draft = (draftData || {}) as OutreachDraft;
        if (draft.status === "sent") {
          alreadySent += 1;
          continue;
        }
        if (draft.status !== "draft") throw new Error(`outreach status ${draft.status || "unknown"}`);
        const recipient = String(draft.recipientEmail || "").trim();
        const productionRunId = String(draft.productionRunId || "").trim();
        if (!recipient) throw new Error("missing recipient email");
        if (!productionRunId) throw new Error("missing outreach production run");

        const { error: authError } = await supabase.rpc("authorize_operator_send", {
          p_run_id: productionRunId,
          p_recipient_email: recipient,
        });
        if (authError) throw authError;

        const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/operator-send-outreach`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ runId: productionRunId, sendKsuCopy: false }),
          cache: "no-store",
        });
        const result = await response.json().catch(() => ({})) as SendResult;
        if (!response.ok || result.ok !== true) throw new Error(result.error || `send failed (${response.status})`);
        if (result.alreadySent) alreadySent += 1; else sent += 1;
      } catch (cause) {
        skipped.push(`${item.slug}: ${cause instanceof Error ? cause.message : "failed"}`);
      }
    }

    const ineligible = items.length - targets.length;
    setBusy("");
    setProgress("");
    onDone(`Email 1 sent to ${sent}. ${alreadySent ? `${alreadySent} already sent. ` : ""}${ineligible + skipped.length ? `${ineligible + skipped.length} skipped.` : ""}`.trim());
  }

  if (!items.length) return null;

  return <>
    <section style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap", padding: "11px 13px", border: "1px solid rgba(74,126,118,.34)", borderRadius: 12, background: "rgba(12,35,43,.92)", marginBottom: 10 }}>
      <strong style={{ fontSize: ".76rem" }}>{items.length} selected</strong>
      <button type="button" disabled={Boolean(busy) || editableDesignCount === 0} onClick={() => { setError(""); setDesignOpen(true); }} style={{ border: "1px solid #2e4a52", borderRadius: 8, padding: "7px 10px", background: "#10252d", color: "#d7e1de", font: "inherit", fontSize: ".72rem", fontWeight: 800, cursor: "pointer" }}>Change design</button>
      <button type="button" disabled={Boolean(busy) || publishedRunCount === 0} onClick={() => void sendFirstEmails()} style={{ border: "1px solid rgba(63,143,113,.55)", borderRadius: 8, padding: "7px 10px", background: "#2f6f5e", color: "#f4fbf8", font: "inherit", fontSize: ".72rem", fontWeight: 850, cursor: "pointer" }}>{busy === "send" ? (progress || "Sending…") : "Send 1st email now"}</button>
      <span style={{ fontSize: ".66rem", opacity: .58 }}>{editableDesignCount} design-editable · {publishedRunCount} outreach-ready</span>
      {error ? <span style={{ fontSize: ".68rem", color: "#ffaaaa" }}>{error}</span> : null}
    </section>

    {designOpen && typeof document !== "undefined" ? createPortal(
      <div role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setDesignOpen(false); }} style={{ position: "fixed", inset: 0, zIndex: 2600, display: "grid", placeItems: "center", padding: 18, background: "rgba(4,11,16,.82)", backdropFilter: "blur(10px)" }}>
        <section role="dialog" aria-modal="true" style={{ width: "min(520px, calc(100vw - 36px))", border: "1px solid rgba(126,153,168,.22)", borderRadius: 18, background: "#13232f", color: "#edf3f6", boxShadow: "0 24px 72px rgba(0,0,0,.42)", padding: 22 }}>
          <h2 style={{ margin: "0 0 6px", fontSize: "1.22rem" }}>Change design for {editableDesignCount} selected concept{editableDesignCount === 1 ? "" : "s"}</h2>
          <p style={{ margin: "0 0 16px", fontSize: ".76rem", lineHeight: 1.45, opacity: .68 }}>Only draft/concept sites are changed. Live client sites are skipped.</p>
          <select value={chosen} onChange={(event) => setChosen(event.target.value)} disabled={Boolean(busy)} style={{ width: "100%", border: "1px solid rgba(126,153,168,.28)", borderRadius: 11, background: "#0b1722", color: "#edf3f6", padding: "11px 12px", font: "inherit", fontSize: ".84rem" }}>
            {DESIGNS.map((design) => <option key={design.value} value={design.value}>{design.label}</option>)}
          </select>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
            <button type="button" disabled={Boolean(busy)} onClick={() => setDesignOpen(false)} style={{ border: "1px solid rgba(126,153,168,.22)", borderRadius: 9, padding: "8px 12px", background: "transparent", color: "inherit", font: "inherit", fontSize: ".74rem", fontWeight: 800 }}>Cancel</button>
            <button type="button" disabled={Boolean(busy)} onClick={() => void applyDesign()} style={{ border: "1px solid rgba(63,143,113,.50)", borderRadius: 9, padding: "8px 12px", background: "#2f6f5e", color: "#fff", font: "inherit", fontSize: ".74rem", fontWeight: 850 }}>{busy === "design" ? (progress || "Applying…") : `Apply to ${editableDesignCount}`}</button>
          </div>
        </section>
      </div>, document.body
    ) : null}
  </>;
}
