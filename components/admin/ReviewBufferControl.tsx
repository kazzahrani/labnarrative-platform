"use client";

import { useCallback, useEffect, useState } from "react";
import { browserSupabase as supabase } from "@/lib/supabase-browser";

type RuntimeState = {
  production_paused: boolean;
  pause_reason: string;
  paused_at: string | null;
  review_buffer_target: number;
  updated_at: string;
};

type Props = {
  reviewCount: number;
};

function normalizeRuntime(value: unknown): RuntimeState | null {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== "object") return null;
  const record = row as Record<string, unknown>;
  return {
    production_paused: record.production_paused === true,
    pause_reason: typeof record.pause_reason === "string" ? record.pause_reason : "",
    paused_at: typeof record.paused_at === "string" ? record.paused_at : null,
    review_buffer_target: Math.max(1, Math.min(50, Number(record.review_buffer_target || 10))),
    updated_at: typeof record.updated_at === "string" ? record.updated_at : "",
  };
}

export default function ReviewBufferControl({ reviewCount }: Props) {
  const [runtime, setRuntime] = useState<RuntimeState | null>(null);
  const [target, setTarget] = useState(10);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  const loadRuntime = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error: runtimeError } = await supabase.rpc("get_automation_runtime_state");
      if (runtimeError) throw runtimeError;
      const next = normalizeRuntime(data);
      if (!next) throw new Error("Production runtime state is unavailable.");
      setRuntime(next);
      setTarget(next.review_buffer_target);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Production runtime state could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRuntime();

    const onFocus = () => void loadRuntime();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void loadRuntime();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [loadRuntime]);

  async function updateRuntime(patch: { paused?: boolean; target?: number }) {
    setWorking(true);
    setError("");
    try {
      const nextTarget = patch.target === undefined ? null : Math.max(1, Math.min(50, Math.round(patch.target)));
      const { data, error: updateError } = await supabase.rpc("set_automation_runtime_config", {
        p_production_paused: patch.paused === undefined ? null : patch.paused,
        p_review_buffer_target: nextTarget,
      });
      if (updateError) throw updateError;
      const next = normalizeRuntime(data);
      if (!next) throw new Error("The saved runtime state could not be read.");
      setRuntime(next);
      setTarget(next.review_buffer_target);
    } catch (updateFailure) {
      setError(updateFailure instanceof Error ? updateFailure.message : "The Review Buffer setting could not be saved.");
    } finally {
      setWorking(false);
    }
  }

  const paused = runtime?.production_paused === true;
  const savedTarget = runtime?.review_buffer_target ?? 10;
  const targetChanged = target !== savedTarget;

  return (
    <div className="reviewBufferControl" aria-label="Review Buffer controls">
      <div className="reviewBufferStatusLine">
        <span className="reviewBufferLabel">Review Buffer</span>
        <span className="reviewBufferState" data-state={paused ? "paused" : "active"}>
          {loading && !runtime ? "Loading…" : paused ? "Paused" : "Active"}
        </span>
      </div>

      <div className="reviewBufferCount">
        <strong>{reviewCount}/{savedTarget}</strong>
        <span>awaiting review</span>
      </div>

      <div className="reviewBufferActions">
        <label className="reviewBufferTarget">
          <span>Target</span>
          <input
            aria-label="Review Buffer target"
            disabled={working || loading}
            inputMode="numeric"
            max={50}
            min={1}
            onChange={(event) => setTarget(Math.max(1, Math.min(50, Number(event.target.value) || 1)))}
            type="number"
            value={target}
          />
        </label>
        <button
          className="reviewBufferSave"
          disabled={working || loading || !targetChanged}
          onClick={() => void updateRuntime({ target })}
          type="button"
        >
          Save target
        </button>
        <button
          className="reviewBufferPause"
          data-action={paused ? "resume" : "pause"}
          disabled={working || loading || !runtime}
          onClick={() => void updateRuntime({ paused: !paused })}
          type="button"
        >
          {working ? "Saving…" : paused ? "Resume" : "Pause"}
        </button>
      </div>

      {paused && runtime?.pause_reason ? <p className="reviewBufferReason">{runtime.pause_reason}</p> : null}
      {error ? <p className="reviewBufferError" role="alert">{error}</p> : null}
    </div>
  );
}
