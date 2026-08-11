"use client";

import { createClient, type Session } from "@supabase/supabase-js";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./automation.module.css";

type V4State = "active" | "final_review" | "published" | "completed" | "blocked" | "cancelled";
type QueueItem = { prospectId: string; piName: string; slug: string; institution: string; score: number | null; queuedAt: string | null };
type Run = {
  engine: "v4";
  runId: string;
  prospectId: string;
  siteId: string | null;
  executionId: string | null;
  piName: string;
  slug: string;
  state: V4State;
  currentStage: "research" | "site" | "portrait" | "renderer" | "finalize";
  stageAttempts: number;
  blockedReason: string | null;
  revisionNote: string | null;
  lastError: string | null;
  startedAt: string;
  updatedAt: string;
  checkpointAt: string;
  leaseExpiresAt: string | null;
  previewPath: string | null;
  publicUrl: string | null;
  evidenceCount: number;
  assetCount: number;
  rendererPassed: boolean;
};
type Execution = {
  executionId: string;
  executionKey: string;
  state: "running" | "completed" | "paused" | "cancelled";
  targetFinalReviews: number;
  finalReviewsCompleted: number;
  startedAt: string;
  lastActivityAt: string;
  completedAt: string | null;
};
type Dashboard = {
  runtime: { enabled: boolean; version: number; mode: "manual_test" | "scheduled_chatgpt" | "paused"; target_final_reviews: number; max_active_slots: number; lease_minutes: number; default_design_variant: string; note: string; updated_at: string };
  currentExecution: Execution | null;
  counts: { eligibleQueue: number; active: number; finalReview: number; published: number; blocked: number; completedExecutions: number };
  queue: QueueItem[];
  runs: Run[];
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

function dateTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Riyadh", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date);
}

async function rpc<T>(session: Session, name: string, body: Record<string, unknown> = {}): Promise<T> {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: supabaseKey, Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const row = payload as { message?: string; details?: string; hint?: string } | null;
    throw new Error(row?.message || row?.details || row?.hint || `${name} failed (${response.status}).`);
  }
  return payload as T;
}

export default function EngineV4ControlCentre() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState(false);

  const load = useCallback(async (activeSession: Session) => {
    setLoading(true);
    try {
      setDashboard(await rpc<Dashboard>(activeSession, "engine_v4_admin_dashboard"));
      setNotice("");
      setError(false);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Engine v4 dashboard could not be loaded.");
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setAuthReady(true);
      if (data.session) void load(data.session);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession);
      setAuthReady(true);
      if (nextSession) void load(nextSession);
      else setDashboard(null);
    });
    return () => { mounted = false; subscription.unsubscribe(); };
  }, [load]);

  const active = useMemo(() => dashboard?.runs.filter((run) => run.state === "active") ?? [], [dashboard]);
  const finalReview = useMemo(() => dashboard?.runs.filter((run) => run.state === "final_review") ?? [], [dashboard]);
  const blocked = useMemo(() => dashboard?.runs.filter((run) => run.state === "blocked").slice(0, 12) ?? [], [dashboard]);
  const execution = dashboard?.currentExecution ?? null;
  const progress = execution ? Math.min(100, Math.round((execution.finalReviewsCompleted / Math.max(1, execution.targetFinalReviews)) * 100)) : 0;

  if (!authReady) return <main className={styles.page}><div className={styles.login}>Preparing Engine v4…</div></main>;
  if (!session) return <main className={styles.page}><section className={styles.login}><p className={styles.kicker}>Engine v4</p><h1>Administrator sign-in required.</h1><p className={styles.muted}>Sign in through the LabNarrative administrator dashboard, then return to Production.</p><Link className={styles.button} href="/admin">Open administrator dashboard</Link></section></main>;

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <div><Link className={styles.brand} href="/admin">LabNarrative</Link><span>Engine v4 Production</span></div>
        <nav><span>{session.user.email}</span><Link href="/admin/discovery">Discovery</Link><Link href="/admin/review">Final Review</Link><Link href="/admin/sites">Websites</Link><Link href="/admin/sales">Sales</Link></nav>
      </header>

      <div className={styles.main}>
        <section className={styles.hero}>
          <div>
            <p className={styles.kicker}>Database-controlled atomic production</p>
            <h1>Production v4</h1>
            <p className={styles.heroCopy}>V4 works one PI and one durable stage at a time. The database owns the execution target, lease and checkpoint. A blocked PI is replaced; an interrupted action resumes. The execution closes only after four concepts actually reach Final Review.</p>
          </div>
          <div className={styles.heroActions}>
            <Link className={styles.button} href="/admin/review">Open Final Review</Link>
            <button className={styles.buttonSecondary} disabled={loading} onClick={() => void load(session)} type="button">{loading ? "Refreshing…" : "Refresh"}</button>
            <Link className={styles.buttonSecondary} href="/admin/sites">Website Monitor</Link>
          </div>
        </section>

        {notice ? <p className={`${styles.notice} ${error ? styles.error : ""}`}>{notice}</p> : null}

        <section className={styles.stats}>
          <article className={styles.stat}><span>Eligible queue</span><strong>{dashboard?.counts.eligibleQueue ?? "—"}</strong></article>
          <article className={styles.stat}><span>Active PI</span><strong>{dashboard?.counts.active ?? "—"}</strong></article>
          <article className={styles.stat}><span>V4 Final Review</span><strong>{dashboard?.counts.finalReview ?? "—"}</strong></article>
          <article className={styles.stat}><span>Published</span><strong>{dashboard?.counts.published ?? "—"}</strong></article>
          <article className={styles.stat}><span>Hard-gate blocks</span><strong>{dashboard?.counts.blocked ?? "—"}</strong></article>
        </section>

        <section className={styles.grid}>
          <div className={styles.stack}>
            <article className={styles.card}>
              <div className={styles.cardHeader}><div><p className={styles.kicker}>Execution target</p><h2>{execution?.state === "running" ? "Current v4 execution" : "No running execution"}</h2></div><span className={styles.status} data-status={execution?.state === "running" ? "running" : "needs_attention"}>{execution?.state ?? "idle"}</span></div>
              {execution ? <>
                <p className={styles.muted}>Final Reviews: <strong>{execution.finalReviewsCompleted} / {execution.targetFinalReviews}</strong> · {progress}%</p>
                <p className={styles.muted}>Execution key: <strong>{execution.executionKey}</strong></p>
                <p className={styles.muted}>Last activity: <strong>{dateTime(execution.lastActivityAt)}</strong></p>
              </> : <p className={styles.muted}>The next scheduled v4 task will open a durable execution with a target of four successful Final Reviews.</p>}
            </article>

            <article className={styles.card}>
              <div className={styles.cardHeader}><div><p className={styles.kicker}>Runtime</p><h2>Engine v4</h2></div><span className={styles.status} data-status={dashboard?.runtime.enabled ? "running" : "needs_attention"}>{dashboard?.runtime.enabled ? "Enabled" : "Paused"}</span></div>
              <p className={styles.muted}>Mode: <strong>{dashboard?.runtime.mode ?? "—"}</strong></p>
              <p className={styles.muted}>Target per execution: <strong>{dashboard?.runtime.target_final_reviews ?? 4} Final Reviews</strong></p>
              <p className={styles.muted}>Concurrent active PI slots: <strong>{dashboard?.runtime.max_active_slots ?? 1}</strong></p>
              <p className={styles.muted}>Atomic-stage lease: <strong>{dashboard?.runtime.lease_minutes ?? 30} minutes</strong></p>
              <p className={styles.muted}>Default design: <strong>{dashboard?.runtime.default_design_variant ?? "ciribilli-narita-v1"}</strong></p>
            </article>

            <article className={styles.card}>
              <div className={styles.cardHeader}><div><p className={styles.kicker}>Eligible queue</p><h2>Next prospects</h2></div><span className={styles.status}>{dashboard?.queue.length ?? 0}</span></div>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead><tr><th>PI</th><th>Institution</th><th>Score</th><th>Queued</th></tr></thead>
                  <tbody>{(dashboard?.queue ?? []).slice(0, 30).map((item) => <tr key={item.prospectId}><td><strong>{item.piName}</strong><br/><span className={styles.muted}>{item.slug}</span></td><td>{item.institution}</td><td>{item.score ?? "—"}</td><td>{dateTime(item.queuedAt)}</td></tr>)}</tbody>
                </table>
              </div>
            </article>
          </div>

          <div className={styles.stack}>
            <article className={styles.card}>
              <div className={styles.cardHeader}><div><p className={styles.kicker}>Atomic work</p><h2>Current PI</h2></div><span className={styles.status} data-status="in_production">{active.length}</span></div>
              {active.length === 0 ? <p className={styles.muted}>No PI is currently leased. The next v4 execution/action claim will pull the oldest eligible prospect.</p> : active.map((run) => <div className={styles.event} key={run.runId}><strong>{run.piName}</strong><span>{run.slug} · stage <strong>{run.currentStage}</strong> · attempt {run.stageAttempts} · evidence {run.evidenceCount} · assets {run.assetCount}</span><time>checkpoint {dateTime(run.checkpointAt)}</time>{run.lastError ? <span className={styles.muted}>Last transient error: {run.lastError}</span> : null}{run.previewPath ? <div className={styles.formActions}><a className={styles.buttonSecondary} href={run.previewPath} target="_blank" rel="noreferrer">Open draft ↗</a></div> : null}</div>)}
            </article>

            <article className={styles.card}>
              <div className={styles.cardHeader}><div><p className={styles.kicker}>Human gate</p><h2>V4 Final Review</h2></div><span className={styles.status} data-status="awaiting_final_review">{finalReview.length}</span></div>
              <p className={styles.muted}>Successful v4 concepts stop here. Final Review combines v4 with preserved legacy v3 concepts.</p>
              <div className={styles.formActions}><Link className={styles.button} href="/admin/review">Open Final Review</Link></div>
              {finalReview.slice(0, 8).map((run) => <div className={styles.event} key={run.runId}><strong>{run.piName}</strong><span>{run.slug} · verified evidence {run.evidenceCount} · assets {run.assetCount}</span>{run.previewPath ? <div className={styles.formActions}><a className={styles.buttonSecondary} href={run.previewPath} target="_blank" rel="noreferrer">Preview ↗</a></div> : null}</div>)}
            </article>

            {blocked.length ? <article className={styles.card}><div className={styles.cardHeader}><div><p className={styles.kicker}>Replaced automatically</p><h2>Hard-gate blocks</h2></div><span className={styles.status} data-status="needs_attention">{blocked.length}</span></div><p className={styles.muted}>These PIs did not count toward the execution target. V4 continues with replacement prospects until four successful Final Reviews are reached.</p>{blocked.map((run) => <div className={styles.event} key={run.runId}><strong>{run.piName}</strong><span>{run.blockedReason || "Blocked without a recorded reason."}</span><time>{dateTime(run.updatedAt)}</time></div>)}</article> : null}
          </div>
        </section>
      </div>
    </main>
  );
}
