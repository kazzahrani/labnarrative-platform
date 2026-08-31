"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  CORE_V2_EXIT_PLAN_CLIENT_ENABLED,
  submitCoreV2ExitPlan,
  type CoreV2TakeProfitTarget,
} from "../../lib/trader-core-v2-command-client";
import {
  loadCoreV2ExitPlanState,
  type CoreV2CapabilitiesResponse,
  type CoreV2Position,
} from "../../lib/trader-core-v2-read-client";
import CoinLogo from "./CoinLogo";
import styles from "./core-v2-exit-plan-canary.module.css";

const CANARY_UI_ENABLED = process.env.NEXT_PUBLIC_TRADER_CORE_V2_CANARY_UI === "1";

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
  if (reason === "core_v2_execute_disabled") return "Core V2 write gate is locked for this Real Account.";
  if (reason === "live_trading_not_enabled") return "Real live execution is not currently enabled for this account.";
  if (reason === "core_v2_exit_plan_client_disabled") return "The browser write rollout flag is still off.";
  if (reason === "exit_strategy_v2_required") return "This position has not migrated to Exit Strategy V2.";
  return reason || "Core V2 exit-plan editing is locked.";
}

function errorText(message: string) {
  if (message.includes("core_v2_execute_disabled")) return "Core V2 write gate is locked.";
  if (message.includes("core_v2_exit_plan_client_disabled")) return "Core V2 browser writes are still disabled.";
  if (message.includes("invalid_take_profit_targets")) return "Each take-profit target needs a positive profit and allocation.";
  if (message.includes("take_profit_allocation_must_equal_100")) return "Take-profit allocations must total exactly 100%.";
  if (message.includes("account_busy")) return "This Real Account is processing another exit-plan command.";
  return message;
}

export default function CoreV2ExitPlanCanary() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [positions, setPositions] = useState<CoreV2Position[]>([]);
  const [capabilities, setCapabilities] = useState<CoreV2CapabilitiesResponse | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [stopEnabled, setStopEnabled] = useState(false);
  const [stopPct, setStopPct] = useState(8);
  const [targets, setTargets] = useState<CoreV2TakeProfitTarget[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const activePositions = useMemo(
    () => positions.filter((position) => position.status === "Active" && position.executionMode === "live"),
    [positions],
  );
  const selected = activePositions.find((position) => position.tradeId === selectedId) ?? null;
  const capability = capabilities?.commands["position.update_exit_plan"] ?? null;
  const serverReason = capability?.available === true ? null : capability?.reason ?? "core_v2_execute_disabled";
  const lockedReason = !selected?.exitStrategyV2
    ? "exit_strategy_v2_required"
    : serverReason
      ? serverReason
      : !CORE_V2_EXIT_PLAN_CLIENT_ENABLED
        ? "core_v2_exit_plan_client_disabled"
        : null;
  const canWrite = Boolean(selected && !lockedReason);
  const allocation = targets.reduce((sum, target) => sum + n(target.allocationPct), 0);
  const targetsValid = targets.length > 0 && targets.length <= 8 &&
    targets.every((target) => n(target.profitPct) > 0 && n(target.allocationPct) > 0) &&
    Math.abs(allocation - 100) <= 0.011;
  const formValid = (!stopEnabled || stopPct > 0) && targetsValid;

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const state = await loadCoreV2ExitPlanState();
      setPositions(state.positions.positions);
      setCapabilities(state.capabilities);
      const active = state.positions.positions.filter((position) => position.status === "Active" && position.executionMode === "live");
      setSelectedId((current) => active.some((position) => position.tradeId === current)
        ? current
        : active[0]?.tradeId ?? "");
    } catch (caught) {
      setError(errorText(caught instanceof Error ? caught.message : "Unable to load Core V2 state."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) void load();
  }, [open]);

  useEffect(() => {
    if (!selected) return;
    setStopEnabled(selected.stopEnabled);
    setStopPct(selected.stopPct > 0 ? selected.stopPct : 8);
    setTargets(selected.takeProfitTargets.length
      ? cleanTargets(selected.takeProfitTargets)
      : []);
    setError("");
    setNotice("");
  }, [selected?.tradeId, selected?.updatedAt]);

  const updateTarget = (index: number, key: keyof CoreV2TakeProfitTarget, value: number) => {
    setTargets((current) => current.map((target, targetIndex) => targetIndex === index
      ? { ...target, [key]: Math.max(0, n(value)) }
      : target));
  };

  const addTarget = () => {
    if (!canWrite) return;
    setTargets((current) => {
      if (current.length >= 8) return current;
      const lastProfit = current.length ? n(current[current.length - 1].profitPct) : 0;
      return [...current, { profitPct: Math.max(0.1, Math.round((lastProfit + 0.5) * 100) / 100), allocationPct: 0 }];
    });
  };

  const removeTarget = (index: number) => {
    if (!canWrite) return;
    setTargets((current) => current.filter((_, targetIndex) => targetIndex !== index));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected || !canWrite || !formValid || saving) return;
    if (!window.confirm(`Apply this Core V2 exit plan to ${selected.pair}? This changes the real position exit settings but sends no immediate exchange order.`)) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const result = await submitCoreV2ExitPlan({
        positionId: selected.tradeId,
        stopEnabled,
        stopPct,
        takeProfitTargets: cleanTargets(targets),
      });
      setNotice(result.replayed ? "Exit-plan command replayed safely." : "Exit-plan command accepted by Core V2.");
      await load();
    } catch (caught) {
      setError(errorText(caught instanceof Error ? caught.message : "Unable to update the Core V2 exit plan."));
    } finally {
      setSaving(false);
    }
  };

  if (!CANARY_UI_ENABLED) return null;

  return <>
    <button className={styles.launcher} onClick={() => setOpen(true)}>
      <span>V2</span>
      Exit plan
    </button>
    {open && <div className={styles.backdrop} onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setOpen(false); }}>
      <section className={styles.modal} onClick={(event) => event.stopPropagation()}>
        <header className={styles.header}>
          <div><small>CORE V2 CANARY</small><h2>Real Position Exit Plan</h2><p>Reads the authoritative Core V2 position model. Writes remain independently gated.</p></div>
          <button className={styles.close} disabled={saving} onClick={() => setOpen(false)}>×</button>
        </header>

        {loading && !positions.length ? <div className={styles.loading}>Loading Core V2 state…</div> : <form onSubmit={submit}>
          <div className={styles.statusRow}>
            <span className={capability?.available ? styles.readyDot : styles.lockedDot}/>
            <div><strong>{capability?.available ? "Server gate available" : "Read-only canary"}</strong><small>{capability?.available ? "Database capability allows this command." : lockText(serverReason)}</small></div>
            <button type="button" onClick={() => void load()} disabled={loading || saving}>{loading ? "Refreshing…" : "Refresh"}</button>
          </div>

          <label className={styles.positionPicker}>
            <span>Position</span>
            <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)} disabled={loading || saving}>
              {activePositions.map((position) => <option key={position.tradeId} value={position.tradeId}>
                #{position.publicTradeNo ?? "—"} · {position.pair} · {position.provider}
              </option>)}
            </select>
          </label>

          {!activePositions.length ? <div className={styles.empty}>No active live Core V2 positions are available.</div> : selected && <>
            <div className={styles.positionMeta}>
              <CoinLogo symbol={selected.pair} size={34}/>
              <div><strong>{selected.pair}</strong><small>Trade #{selected.publicTradeNo ?? "—"} · {selected.botName}</small></div>
              <div><span>Core V2 ID</span><code>{selected.tradeId.slice(0, 8)}…</code></div>
              <div><span>Legacy ID mapped</span><b>{selected.clientId ? "Yes" : "No"}</b></div>
            </div>

            <div className={styles.grid}>
              <label><span>Stop loss</span><select value={stopEnabled ? "On" : "Off"} onChange={(event) => setStopEnabled(event.target.value === "On")} disabled={!canWrite || saving}><option>Off</option><option>On</option></select></label>
              <label><span>Stop-loss distance</span><div className={styles.unit}><input type="number" min="0.1" step="0.1" value={stopPct} onChange={(event) => setStopPct(Math.max(0.1, n(event.target.value)))} disabled={!canWrite || !stopEnabled || saving}/><b>%</b></div></label>
            </div>

            <div className={styles.tpSection}>
              <div className={styles.tpHead}><div><strong>Take-profit targets</strong><small>Allocations must total 100%.</small></div><button type="button" onClick={addTarget} disabled={!canWrite || saving || targets.length >= 8}>＋ Add target</button></div>
              <div className={styles.tpTable}>
                <div className={styles.tpHeader}><span>Target</span><span>Profit</span><span>Allocation</span><span/></div>
                {targets.map((target, index) => <div className={styles.tpRow} key={index}>
                  <strong>TP {index + 1}</strong>
                  <div className={styles.unit}><input type="number" min="0.01" step="0.01" value={target.profitPct} onChange={(event) => updateTarget(index, "profitPct", n(event.target.value))} disabled={!canWrite || saving}/><b>%</b></div>
                  <div className={styles.unit}><input type="number" min="0.01" max="100" step="0.01" value={target.allocationPct} onChange={(event) => updateTarget(index, "allocationPct", n(event.target.value))} disabled={!canWrite || saving}/><b>%</b></div>
                  <button type="button" onClick={() => removeTarget(index)} disabled={!canWrite || saving || targets.length <= 1}>×</button>
                </div>)}
              </div>
              <div className={Math.abs(allocation - 100) <= 0.011 ? styles.allocationOk : styles.allocationBad}>Allocation total: <b>{allocation.toFixed(2)}%</b></div>
            </div>

            {!canWrite && <div className={styles.lockBox}><strong>Editing locked</strong><p>{lockText(lockedReason)}</p><small>No command is submitted while this state is locked.</small></div>}
            {notice && <div className={styles.notice}>{notice}</div>}
            {error && <div className={styles.error}>{error}</div>}

            <footer className={styles.footer}>
              <button type="button" onClick={() => setOpen(false)} disabled={saving}>Close</button>
              <button className={styles.primary} disabled={!canWrite || !formValid || saving}>{saving ? "Applying…" : "Apply exit plan"}</button>
            </footer>
          </>}
        </form>}
      </section>
    </div>}
  </>;
}
