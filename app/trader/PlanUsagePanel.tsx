"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { browserSupabase } from "../../lib/supabase-browser";
import styles from "./plan-usage-panel.module.css";

type EntitlementSnapshot = {
  ok?: boolean;
  enforcementActive: boolean;
  plan: string;
  isPaid: boolean;
  limits: {
    singlePairBots: number;
    multiPairBots: number;
    activeExchanges: number | null;
  };
  usage: {
    singlePairBots: number;
    multiPairBots: number;
    activeExchanges: number;
  };
  remaining: {
    singlePairBots: number;
    multiPairBots: number;
    activeExchanges: number | null;
  };
  overLimit: {
    singlePairBots: boolean;
    multiPairBots: boolean;
    activeExchanges: boolean;
  };
  error?: string;
};

type Props = { refreshKey?: string };

type Metric = {
  key: "singlePairBots" | "multiPairBots" | "activeExchanges";
  label: string;
  description: string;
};

const metrics: Metric[] = [
  { key: "singlePairBots", label: "Single-pair DCA bots", description: "Active, non-archived single-market DCA bots" },
  { key: "multiPairBots", label: "Multi-pair DCA bots", description: "Active, non-archived multi-market DCA bots" },
  { key: "activeExchanges", label: "Exchange connections", description: "Connected or pending exchange accounts" },
];

function titleCase(value: string) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : "Free";
}

async function loadEntitlements() {
  const { data, error } = await browserSupabase.functions.invoke("trader-entitlements-control", { body: {} });
  if (error) {
    let message = error.message || "entitlements_load_failed";
    const context = (error as { context?: Response }).context;
    if (context) {
      try {
        const payload = await context.clone().json() as { error?: string };
        if (payload.error) message = payload.error;
      } catch {}
    }
    throw new Error(message);
  }
  const payload = (data ?? {}) as EntitlementSnapshot;
  if (payload.error || payload.ok !== true) throw new Error(payload.error || "entitlements_load_failed");
  return payload;
}

function progress(used: number, limit: number | null) {
  if (limit == null) return 0;
  if (limit <= 0) return used > 0 ? 100 : 0;
  return Math.min(100, Math.max(0, (used / limit) * 100));
}

function remainingLabel(used: number, limit: number | null, remaining: number | null, over: boolean) {
  if (limit == null) return "Unlimited on this plan";
  if (over) return `${used - limit} over current plan capacity`;
  if (limit === 0) return "Not included in this plan";
  if (remaining === 0) return "Capacity reached";
  return `${remaining ?? 0} remaining`;
}

export default function PlanUsagePanel({ refreshKey = "" }: Props) {
  const [snapshot, setSnapshot] = useState<EntitlementSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      setSnapshot(await loadEntitlements());
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message.replaceAll("_", " ") : "Unable to load plan usage.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { setLoading(true); void refresh(); }, [refresh, refreshKey]);
  useEffect(() => {
    const onBillingReturn = () => { setLoading(true); void refresh(); };
    window.addEventListener("trader:billing-return", onBillingReturn);
    return () => window.removeEventListener("trader:billing-return", onBillingReturn);
  }, [refresh]);

  const planLabel = useMemo(() => titleCase(snapshot?.plan || "free"), [snapshot?.plan]);

  if (loading && !snapshot) return <section className={styles.panel}><div className={styles.loading}>Loading current plan usage…</div></section>;
  if (!snapshot) return <section className={styles.panel}><div className={styles.error}>Plan usage is temporarily unavailable{error ? ` · ${error}` : ""}.</div></section>;

  return <section className={styles.panel}>
    <div className={styles.header}>
      <div>
        <small>PLAN CAPACITY</small>
        <div className={styles.titleRow}><h2>{planLabel} usage</h2><span className={snapshot.enforcementActive ? styles.live : styles.preview}>{snapshot.enforcementActive ? "Limits active" : "Preview mode"}</span></div>
        <p>Owner-level usage across your active Trader accounts. Existing resources remain visible even if a future plan change puts usage above a limit.</p>
      </div>
      <div className={styles.planState}><span>Effective plan</span><strong>{planLabel}</strong><small>{snapshot.isPaid ? "Paid entitlement" : "Free / protected entitlement"}</small></div>
    </div>

    <div className={styles.grid}>
      {metrics.map((metric) => {
        const used = snapshot.usage[metric.key];
        const limit = snapshot.limits[metric.key];
        const remaining = snapshot.remaining[metric.key];
        const over = snapshot.overLimit[metric.key];
        const pct = progress(used, limit);
        return <article key={metric.key} className={`${styles.metric} ${over ? styles.over : ""}`}>
          <div className={styles.metricTop}><div><span>{metric.label}</span><small>{metric.description}</small></div><strong>{used.toLocaleString()} <i>/</i> {limit == null ? "∞" : limit.toLocaleString()}</strong></div>
          <div className={styles.track} aria-hidden="true"><span style={{ width: `${pct}%` }} /></div>
          <div className={styles.metricBottom}><span>{remainingLabel(used, limit, remaining, over)}</span><small>{limit == null ? `${used.toLocaleString()} currently connected` : `${Math.round(pct)}% used`}</small></div>
        </article>;
      })}
    </div>

    {!snapshot.enforcementActive && <div className={styles.notice}><b>Preview only:</b> these are the capacities that will apply when plan enforcement is explicitly activated. Your current trading behavior is not being restricted by this panel.</div>}
    {error && <div className={styles.inlineError}>{error}</div>}
  </section>;
}
