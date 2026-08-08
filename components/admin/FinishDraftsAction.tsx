"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { browserSupabase as supabase } from "@/lib/supabase-browser";

type DraftItem = {
  siteId: string;
  slug: string;
  piName: string;
  runId: string;
};

type AuditResponse = {
  ok?: boolean;
  count?: number;
  drafts?: DraftItem[];
  error?: string;
};

type FinishResponse = {
  ok?: boolean;
  siteId?: string;
  slug?: string;
  piName?: string;
  publicUrl?: string;
  error?: string;
};

export default function FinishDraftsAction() {
  const pathname = usePathname();
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState("");

  if (pathname !== "/admin/sites") return null;

  const finishDrafts = async () => {
    if (running) return;
    const confirmed = window.confirm(
      "Finish recent Engine-managed drafts?\n\nLabNarrative will find a proper official PI portrait, apply it consistently, run final checks, and publish each successful draft as a Concept. Outreach email will NOT be sent automatically.",
    );
    if (!confirmed) return;

    setRunning(true);
    setStatus("Auditing drafts…");

    try {
      const { data: auditData, error: auditError } = await supabase.functions.invoke<AuditResponse>(
        "labnarrative-finish-drafts",
        { body: { action: "audit" } },
      );
      if (auditError) throw auditError;
      if (!auditData?.ok) throw new Error(auditData?.error || "Draft audit failed.");

      const drafts = auditData.drafts ?? [];
      if (!drafts.length) {
        setStatus("No Engine-managed drafts need finishing.");
        return;
      }

      let published = 0;
      const failed: Array<{ slug: string; reason: string }> = [];

      for (let index = 0; index < drafts.length; index += 1) {
        const draft = drafts[index];
        setStatus(`Finishing ${index + 1}/${drafts.length}: ${draft.piName}…`);

        const { data, error } = await supabase.functions.invoke<FinishResponse>(
          "labnarrative-finish-drafts",
          { body: { action: "finish_one", siteId: draft.siteId } },
        );

        if (error) {
          failed.push({ slug: draft.slug, reason: error.message });
          continue;
        }
        if (!data?.ok) {
          failed.push({ slug: draft.slug, reason: data?.error || "Unknown finishing error" });
          continue;
        }
        published += 1;
      }

      const summary = failed.length
        ? `Finished ${published}/${drafts.length}. ${failed.length} remained drafts: ${failed.map((item) => `${item.slug} — ${item.reason}`).join(" | ")}`
        : `Finished and published all ${published} Engine-managed drafts. No outreach emails were sent.`;
      setStatus(summary);
      window.dispatchEvent(new CustomEvent("labnarrative:drafts-finished", { detail: { published, failed } }));
      window.setTimeout(() => window.location.reload(), 1200);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Draft finishing failed.");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        right: 24,
        bottom: 24,
        zIndex: 70,
        display: "grid",
        gap: 8,
        width: "min(420px, calc(100vw - 32px))",
        pointerEvents: "none",
      }}
    >
      {status && (
        <div
          role="status"
          style={{
            pointerEvents: "auto",
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,.14)",
            background: "rgba(12,24,31,.96)",
            color: "#e8f3f5",
            fontSize: 12,
            lineHeight: 1.45,
            boxShadow: "0 12px 30px rgba(0,0,0,.28)",
          }}
        >
          {status}
        </div>
      )}
      <button
        type="button"
        disabled={running}
        onClick={() => void finishDrafts()}
        style={{
          pointerEvents: "auto",
          justifySelf: "end",
          border: "1px solid rgba(70,201,188,.5)",
          borderRadius: 10,
          padding: "10px 14px",
          background: running ? "rgba(70,201,188,.12)" : "rgba(26,117,108,.94)",
          color: "white",
          font: "inherit",
          fontSize: 12,
          fontWeight: 800,
          cursor: running ? "wait" : "pointer",
          boxShadow: "0 10px 26px rgba(0,0,0,.24)",
        }}
      >
        {running ? "Finishing drafts…" : "Finish drafts"}
      </button>
    </div>
  );
}
