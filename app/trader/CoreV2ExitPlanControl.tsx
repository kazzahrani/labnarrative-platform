"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { submitCoreV2ExitPlan, type CoreV2TakeProfitTarget } from "../../lib/trader-core-v2-command-client";
import { previewCoreV2ExitPlan, type CoreV2ExitPlanPreviewResponse } from "../../lib/trader-core-v2-preview-client";
import { loadCoreV2ExitPlanState, type CoreV2CapabilitiesResponse, type CoreV2Position } from "../../lib/trader-core-v2-read-client";
import CoinLogo from "./CoinLogo";
import styles from "./core-v2-exit-plan-canary.module.css";

function n(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function cleanTargets(targets: CoreV2TakeProfitTarget[]) {
  return targets.map((target) => ({
    profitPct: Math.round(Math.max(0, n(target.profitPct)) * 10000) / 10000,
    allocationPct: Math.round(Math.max(0, n(target.allocationPct)) * 10000) / 10000,
  }));
}

function lockText(reason: string | null) {
  if (reason === "core_v2_execute_disabled") return "Position editing is temporarily locked by the server safety gate.";
  if (reason === "live_trading_not_enabled") return "Real live execution is not currently enabled for this account.";
  if (reason === "exit_strategy_v2_required") return "This position is not yet on Exit Strategy V2.";
  return reason || "Position editing is temporarily unavailable.";
}

function errorText(message: string) {
  if (message.includes("core_v2_execute_disabled")) return "Position editing is currently locked by the server safety gate.";
  if (message.includes("invalid_take_profit_targets")) return "Each take-profit target needs a positive profit and allocation.";
  if (message.includes("take_profit_allocation_must_equal_100")) return "Take-profit allocations must total exactly 100%.";
  if (message.includes("account_busy")) return "This account is processing another exit-plan update. Please retry.";
  return message;
}

export default function CoreV2ExitPlanControl() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [positions, setPositions] = useState<CoreV2Position[]>([]);
  const [capabilities, setCapabilities] = useState<CoreV2CapabilitiesResponse | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [stopEnabled, setStopEnabled] = useState(false);
  const [stopPct, setStopPct] = useState(8);
  const [targets, setTargets] = useState<CoreV2TakeProfitTarget[]>([]);
  const [preview, setPreview] = useState<CoreV2ExitPlanPreviewResponse["preview"] | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const activePositions = useMemo(
    () => positions.filter((position) => position.status === "Active" && position.executionMode === "live"),
    [positions],
  );
  const selected = activePositions.find((position) => position.tradeId === selectedId) ?? null;
  const capability = capabilities?.commands["position.update_exit_plan"] ?? null;
  const serverReason = capability?.available === true ? null : capability?.reason ?? "core_v2_execute_disabled";
  const lockedReason = !selected?.exitStrategyV2 ? "exit_strategy_v2_required" : serverReason;
  const canDraft = Boolean(selected?.exitStrategyV2);
  const canWrite = Boolean(selected && !lockedReason);
  const allocation = targets.reduce((sum, target) => sum + n(target.allocationPct), 0);
  const allocationValid = targets.length === 0 || Math.abs(allocation - 100) <= 0.011;
  const targetsValid = targets.length <= 8 && targets.every((target) => n(target.profitPct) > 0 && n(target.allocationPct) > 0) && allocationValid;
  const formValid = (!stopEnabled || stopPct > 0) && targetsValid;
  const busy = loading || validating || saving;

  const clearValidation = () => {
    setPreview(null);
    setNotice("");
    setError("");
  };

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const state = await loadCoreV2ExitPlanState();
      setPositions(state.positions.positions);
      setCapabilities(state.capabilities);
      const active = state.positions.positions.filter((position) => position.status === "Active" && position.executionMode === "live");
      setSelectedId((current) => active.some((position) => position.tradeId === current) ? current : active[0]?.tradeId ?? "");
    } catch (caught) {
      setError(errorText(caught instanceof Error ? caught.message : "Unable to load position controls."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const openForPosition = (event: Event) => {
      const detail = (event as CustomEvent<{ tradeId?: string }>).detail;
      if (detail?.tradeId) setSelectedId(detail.tradeId);
      setOpen(true);
    };
    window.addEventListener("labnarrative:edit-exit-plan", openForPosition);
    return () => window.removeEventListener("labnarrative:edit-exit-plan", openForPosition);
  }, []);

  useEffect(() => { if (open) void load(); }, [open]);

  useEffect(() => {
    if (!selected) return;
    setStopEnabled(selected.stopEnabled);
    setStopPct(selected.stopPct > 0 ? selected.stopPct : 8);
    setTargets(selected.takeProfitTargets.length ? cleanTargets(selected.takeProfitTargets) : []);
    setPreview(null);
    setError("");
    setNotice("");
  }, [selected?.tradeId, selected?.updatedAt]);

  const updateTarget = (index: number, key: keyof CoreV2TakeProfitTarget, value: number) => {
    clearValidation();
    setTargets((current) => current.map((target, targetIndex) => targetIndex === index ? { ...target, [key]: Math.max(0, n(value)) } : target));
  };

  const addTarget = () => {
    if (!canDraft) return;
    clearValidation();
    setTargets((current) => {
      if (current.length >= 8) return current;
      const lastProfit = current.length ? n(current[current.length - 1].profitPct) : 0;
      return [...current, { profitPct: Math.max(0.1, Math.round((lastProfit + 0.5) * 100) / 100), allocationPct: 0 }];
    });
  };

  const removeTarget = (index: number) => {
    if (!canDraft) return;
    clearValidation();
    setTargets((current) => current.filter((_, targetIndex) => targetIndex !== index));
  };

  const validateDraft = async () => {
    if (!selected || !canDraft || !formValid || busy) return;
    setValidating(true);
    setError("");
    setNotice("");
    try {
      const result = await previewCoreV2ExitPlan({ positionId: selected.tradeId, stopEnabled, stopPct, takeProfitTargets: cleanTargets(targets) });
      setPreview(result.preview);
      setNotice(result.preview.executeReady ? "Validation passed. This exit plan is ready to apply." : "Validation passed, but execution is still blocked by the safety status shown below.");
    } catch (caught) {
      setPreview(null);
      setError(errorText(caught instanceof Error ? caught.message : "Unable to validate this exit plan."));
    } finally {
      setValidating(false);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected || !canWrite || !formValid || saving) return;
    if (!window.confirm(`Apply this exit plan to ${selected.pair}? This updates the real position's SL/TP configuration. It sends no immediate exchange order, but normal exit workers may act later if the configured conditions are met.`)) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const result = await submitCoreV2ExitPlan({ positionId: selected.tradeId, stopEnabled, stopPct, takeProfitTargets: cleanTargets(targets) });
      setNotice(result.replayed ? "Exit plan replayed safely." : "Exit plan updated through Core V2.");
      setPreview(null);
      await load();
    } catch (caught) {
      setError(errorText(caught instanceof Error ? caught.message : "Unable to update the exit plan."));
    } finally {
      setSaving(false);
    }
  };

  return <>
    <button className={styles.launcher} onClick={() => setOpen(true)}><span>↗</span>Edit exit plan</button>
    {open && <div className={styles.backdrop} onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setOpen(false); }}>
      <section className={styles.modal} onClick={(event) => event.stopPropagation()}>
        <header className={styles.header}>
          <div><small>REAL POSITION</small><h2>Exit Plan</h2><p>Edit stop-loss and take-profit settings through the guarded Core V2 position path.</p></div>
          <button className={styles.close} disabled={busy} onClick={() => setOpen(false)}>×</button>
        </header>

        {loading && !positions.length ? <div className={styles.loading}>Loading position state…</div> : <form onSubmit={submit}>
          <div className={styles.statusRow}>
            <span className={capability?.available ? styles.readyDot : styles.lockedDot}/>
            <div><strong>{capability?.available ? "Position editing available" : "Position editing locked"}</strong><small>{capability?.available ? "The server safety gate allows this account-scoped update." : lockText(serverReason)}</small></div>
            <button type="button" onClick={() => void load()} disabled={busy}>{loading ? "Refreshing…" : "Refresh"}</button>
          </div>

          <label className={styles.positionPicker}>
            <span>Position</span>
            <select value={selectedId} onChange={(event) => { setSelectedId(event.target.value); clearValidation(); }} disabled={busy}>
              {activePositions.map((position) => <option key={position.tradeId} value={position.tradeId}>#{position.publicTradeNo ?? "—"} · {position.pair} · {position.provider}</option>)}
            </select>
          </label>

          {!activePositions.length ? <div className={styles.empty}>No active live positions are available.</div> : selected && <>
            <div className={styles.positionMeta}>
              <CoinLogo symbol={selected.pair} size={34}/>
              <div><strong>{selected.pair}</strong><small>Trade #{selected.publicTradeNo ?? "—"} · {selected.botName}</small></div>
              <div><span>Exchange</span><b>{selected.provider}</b></div>
              <div><span>Core state</span><b>{selected.exitStrategyV2 ? "V2" : "Legacy"}</b></div>
            </div>

            <div className={styles.grid}>
              <label><span>Stop loss</span><select value={stopEnabled ? "On" : "Off"} onChange={(event) => { clearValidation(); setStopEnabled(event.target.value === "On"); }} disabled={!canDraft || busy}><option>Off</option><option>On</option></select></label>
              <label><span>Stop-loss distance</span><div className={styles.unit}><input type="number" min="0.1" step="0.1" value={stopPct} onChange={(event) => { clearValidation(); setStopPct(Math.max(0.1, n(event.target.value))); }} disabled={!canDraft || !stopEnabled || busy}/><b>%</b></div></label>
            </div>

            <div className={styles.tpSection}>
              <div className={styles.tpHead}><div><strong>Take-profit targets</strong><small>Allocations must total 100% when targets are enabled.</small></div><button type="button" onClick={addTarget} disabled={!canDraft || busy || targets.length >= 8}>＋ Add target</button></div>
              <div className={styles.tpTable}>
                <div className={styles.tpHeader}><span>Target</span><span>Profit</span><span>Allocation</span><span/></div>
                {targets.map((target, index) => <div className={styles.tpRow} key={index}>
                  <strong>TP {index + 1}</strong>
                  <div className={styles.unit}><input type="number" min="0.01" step="0.01" value={target.profitPct} onChange={(event) => updateTarget(index, "profitPct", n(event.target.value))} disabled={!canDraft || busy}/><b>%</b></div>
                  <div className={styles.unit}><input type="number" min="0.01" max="100" step="0.01" value={target.allocationPct} onChange={(event) => updateTarget(index, "allocationPct", n(event.target.value))} disabled={!canDraft || busy}/><b>%</b></div>
                  <button type="button" onClick={() => removeTarget(index)} disabled={!canDraft || busy}>×</button>
                </div>)}
              </div>
              <div className={allocationValid ? styles.allocationOk : styles.allocationBad}>Allocation total: <b>{targets.length ? `${allocation.toFixed(2)}%` : "TP off"}</b></div>
            </div>

            {preview && <div className={styles.previewBox}><div><strong>Validation {preview.executeReady ? "ready" : "complete"}</strong><span>{preview.hasChanges ? "Changes detected" : "No changes"}</span></div><p>{preview.blockers.length ? `Execution blockers: ${preview.blockers.join(" · ")}` : "No server-side execution blockers detected."}</p><small>No command enqueued · No order sent · No position mutation</small></div>}
            {!canWrite && <div className={styles.lockBox}><strong>Apply is locked</strong><p>{lockText(lockedReason)}</p><small>You can still review and validate the draft without creating a command.</small></div>}
            {notice && <div className={styles.notice}>{notice}</div>}
            {error && <div className={styles.error}>{error}</div>}

            <footer className={styles.footer}>
              <button type="button" onClick={() => setOpen(false)} disabled={busy}>Close</button>
              <button type="button" onClick={() => void validateDraft()} disabled={!canDraft || !formValid || busy}>{validating ? "Validating…" : "Validate"}</button>
              <button className={styles.primary} disabled={!canWrite || !formValid || busy}>{saving ? "Applying…" : "Apply exit plan"}</button>
            </footer>
          </>}
        </form>}
      </section>
    </div>}
  </>;
}
