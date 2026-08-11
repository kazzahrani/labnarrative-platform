"use client";

import { useState } from "react";
import { browserSupabase as supabase } from "@/lib/supabase-browser";

type Engine = "v3" | "v4";
type PublishResult = {
  ok?: boolean;
  runId?: string;
  outreachSent?: boolean;
};

type Props = {
  runId: string;
  engine: Engine;
};

export default function WebsiteApprovePublishAction({ runId, engine }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function publish() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const { data, error: rpcError } = await supabase.rpc("engine_admin_approve_publish", {
        p_run_id: runId,
        p_engine: engine,
        p_note: null,
      });
      if (rpcError) throw rpcError;
      const result = (data || {}) as PublishResult;
      if (!result.ok || result.outreachSent) {
        throw new Error("Publication did not return the expected safe outreach-draft state.");
      }
      window.location.href = `/admin/outreach/${runId}`;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Approve & Publish failed.");
      setBusy(false);
    }
  }

  return <>
    <button type="button" disabled={busy} onClick={() => void publish()}>
      {busy ? "Publishing…" : "Approve & Publish"}
    </button>
    {error ? <span title={error} style={{ color: "#d58f89", fontSize: ".62rem", lineHeight: 1.2 }}>{error}</span> : null}
  </>;
}
