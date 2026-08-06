"use client";

import { useCallback, useEffect, useState } from "react";
import { browserSupabase as supabase } from "@/lib/supabase-browser";

type RuntimeState = {
  production_paused: boolean;
  pause_reason: string;
  paused_at: string | null;
  daily_limit: number;
  today_count: number;
  day_key: string;
  updated_at: string;
};

function normalizeRuntime(value: unknown): RuntimeState | null {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== "object") return null;
  const record = row as Record<string, unknown>;
  return {
    production_paused: record.production_paused === true,
    pause_reason: typeof record.pause_reason === "string" ? record.pause_reason : "",
    paused_at: typeof record.paused_at === "string" ? record.paused_at : null,
    daily_limit: Math.max(1, Math.min(200, Number(record.daily_limit || 10))),
    today_count: Math.max(0, Number(record.today_count || 0)),
    day_key: typeof record.day_key === "string" ? record.day_key : "",
    updated_at: typeof record.updated_at === "string" ? record.updated_at : "",
  };
}

export default function DailyLimitControl() {
  const [runtime, setRuntime] = useState<RuntimeState | null>(null);
  const [limit, setLimit] = useState(10);
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
      setLimit(next.daily_limit);
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

  async function updateRuntime(patch: { paused?: boolean; limit?: number }) {
    setWorking(true);
    setError("");
    try {
      const nextLimit = patch.limit === undefined ? null : Math.max(1, Math.min(200, Math.round(patch.limit)));
      const { data, error: updateError } = await supabase.rpc("set_automation_runtime_config", {
        p_production_paused: patch.paused === undefined ? null : patch.paused,
        p_daily_limit: nextLimit,
      });
      if (updateError) throw updateError;
      const next = normalizeRuntime(data);
      if (!next) throw new Error("The saved runtime state could not be read.");
      setRuntime(next);
      setLimit(next.daily_limit);
    } catch (updateFailure) {
      setError(updateFailure instanceof Error ? updateFailure.message : "The Daily Limit setting could not be saved.");
    } finally {
      setWorking(false);
    }
  }

  const paused = runtime?.production_paused === true;
  const savedLimit = runtime?.daily_limit ?? 10;
  const todayCount = runtime?.today_count ?? 0;
  const limitReached = !paused && todayCount >= savedLimit;
  const limitChanged = limit !== savedLimit;
  const state = paused ? "paused" : limitReached ? "limit-reached" : "active";
  const stateLabel = loading && !runtime ? "Loading…" : paused ? "Paused" : limitReached ? "Limit reached" : "Active";

  return (
    <div className="reviewBufferControl" aria-label="Daily production limit controls">
      <div className="reviewBufferStatusLine">
        <span className="reviewBufferLabel">Daily Limit</span>
        <span className="reviewBufferState" data-state={state}>
          {stateLabel}
        </span>
      </div>

      <div className="reviewBufferCount">
        <strong>{todayCount}/{savedLimit}</strong>
        <span>unique PIs started today · Riyadh</span>
      </div>

      <div className="reviewBufferActions">
        <label className="reviewBufferTarget">
          <span>Limit</span>
          <input
            aria-label="Daily production limit"
            disabled={working || loading}
            inputMode="numeric"
            max={200}
            min={1}
            onChange={(event) => setLimit(Math.max(1, Math.min(200, Number(event.target.value) || 1)))}
            type="number"
            value={limit}
          />
        </label>
        <button
          className="reviewBufferSave"
          disabled={working || loading || !limitChanged}
          onClick={() => void updateRuntime({ limit })}
          type="button"
        >
          Save limit
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

      {limitReached ? <p className="reviewBufferReason">Today’s unique-PI limit is complete. New PIs become eligible again at midnight in Riyadh; retries of a PI already started today may still continue.</p> : null}
      {paused && runtime?.pause_reason ? <p className="reviewBufferReason">{runtime.pause_reason}</p> : null}
      {error ? <p className="reviewBufferError" role="alert">{error}</p> : null}
    </div>
  );
}
