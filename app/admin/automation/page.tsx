"use client";

import { createClient, type Session } from "@supabase/supabase-js";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./automation.module.css";

type V3State = "producing" | "final_review" | "published" | "completed" | "blocked" | "cancelled";

type QueueItem = {
  prospectId: string;
  piName: string;
  slug: string;
  institution: string;
  score: number | null;
  queuedAt: string | null;
};

type Run = {
  runId: string;
  prospectId: string;
  siteId: string | null;
  piName: string;
  slug: string;
  state: V3State;
  blockedReason: string | null;
  startedAt: string;
  updatedAt: string;
  previewPath: string | null;
  publicUrl: string | null;
  evidenceCount: number;
  assetCount: number;
};

type Dashboard = {
  runtime: {
    enabled: boolean;
    version: number;
    mode: "manual_test" | "scheduled_chatgpt" | "paused";
    max_per_run: number;
    default_design_variant: string;
    note: string;
    updated_at: string;
  };
  counts: {
    eligibleQueue: number;
    producing: number;
    finalReview: number;
    published: number;
    blocked: number;
    completed: number;
  };
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
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Riyadh",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

function stateLabel(state: V3State) {
  return ({
    producing: "Producing",
    final_review: "Final Review",
    published: "Published",
    completed: "Completed",
    blocked: "Blocked",
    cancelled: "Cancelled",
  } as const)[state];
}

async function rpc<T>(session: Session, name: string, body: Record<string, unknown> = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: supabaseKey,
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: controller.signal,
    });
    const text = await response.text();
    const payload = text ? JSON.parse(text) : null;
    if (!response.ok) {
      const row = payload as { message?: string; details?: string; hint?: string } | null;
      throw new Error(row?.message || row?.details || row?.hint || `${name} failed (${response.status}).`);
    }
    return payload as T;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("The action timed out. Try again.");
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

export default function EngineV3ControlCentre() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState(false);
  const [actionKey, setActionKey] = useState("");

  const load = useCallback(async (activeSession: Session) => {
    setLoading(true);
    try {
      setDashboard(await rpc<Dashboard>(activeSession, "engine_v3_admin_dashboard"));
      setError(false);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Engine v3 dashboard could not be loaded.");
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

  const producing = useMemo(() => dashboard?.runs.filter((run) => run.state === "producing") ?? [], [dashboard]);
  const finalReview = useMemo(() => dashboard?.runs.filter((run) => run.state === "final_review") ?? [], [dashboard]);
  const blocked = useMemo(() => dashboard?.runs.filter((run) => run.state === "blocked") ?? [], [dashboard]);
  const recentPublished = useMemo(() => dashboard?.runs.filter((run) => ["published", "completed"].includes(run.state)).slice(0, 12) ?? [], [dashboard]);

  async function approvePublish(runId: string) {
    if (!session || actionKey) return;
    if (!window.confirm("Approve this concept and publish it? Outreach will NOT be sent.")) return;
    setActionKey(`${runId}:publish`);
    try {
      await rpc(session, "engine_v3_admin_approve_publish", { p_run_id: runId, p_note: null });
      setNotice("Concept approved and published. Outreach was not sent.");
      setError(false);
      await load(session);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Publish failed.");
      setError(true);
    } finally {
      setActionKey("");
    }
  }

  async function returnToProduction(runId: string) {
    if (!session || actionKey) return;
    const note = window.prompt("What should ChatGPT revise before Final Review?")?.trim();
    if (note === undefined) return;
    setActionKey(`${runId}:return`);
    try {
      await rpc(session, "engine_v3_admin_return_to_production", { p_run_id: runId, p_note: note || null });
      setNotice("Returned to ChatGPT production.");
      setError(false);
      await load(session);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Return to production failed.");
      setError(true);
    } finally {
      setActionKey("");
    }
  }

  if (!authReady) return <main className={styles.page}><div className={styles.login}>Preparing Engine v3…</div></main>;
  if (!session) {
    return (
      <main className={styles.page}>
        <section className={styles.login}>
          <p className={styles.kicker}>Engine v3</p>
          <h1>Administrator sign-in required.</h1>
          <p className={styles.muted}>Sign in through the LabNarrative administrator dashboard, then return to Production.</p>
          <Link className={styles.button} href="/admin">Open administrator dashboard</Link>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <div><Link className={styles.brand} href="/admin">LabNarrative</Link><span>Engine v3</span></div>
        <nav><span>{session.user.email}</span><Link href="/admin/sites">Websites</Link><Link href="/admin/discovery">Discovery</Link></nav>
      </header>

      <div className={styles.main}>
        <section className={styles.hero}>
          <div>
            <p className={styles.kicker}>ChatGPT-native production</p>
            <h1>Engine v3</h1>
            <p className={styles.heroCopy}>ChatGPT performs the research, scientific writing, reasoning and production. Supabase is the source of truth. There is no autonomous OpenAI API worker and no API-credit dependency.</p>
          </div>
          <div className={styles.heroActions}>
            <button className={styles.button} disabled={loading} onClick={() => void load(session)} type="button">{loading ? "Refreshing…" : "Refresh"}</button>
            <Link className={styles.buttonSecondary} href="/admin/sites">Website Monitor</Link>
          </div>
        </section>

        {notice ? <p className={`${styles.notice} ${error ? styles.error : ""}`}>{notice}</p> : null}

        <section className={styles.stats}>
          <article className={styles.stat}><span>Eligible queue</span><strong>{dashboard?.counts.eligibleQueue ?? "—"}</strong></article>
          <article className={styles.stat}><span>Producing</span><strong>{dashboard?.counts.producing ?? "—"}</strong></article>
          <article className={styles.stat}><span>Final Review</span><strong>{dashboard?.counts.finalReview ?? "—"}</strong></article>
          <article className={styles.stat}><span>Published</span><strong>{dashboard?.counts.published ?? "—"}</strong></article>
          <article className={styles.stat}><span>Blocked</span><strong>{dashboard?.counts.blocked ?? "—"}</strong></article>
        </section>

        <section className={styles.grid}>
          <div className={styles.stack}>
            <article className={styles.card}>
              <div className={styles.cardHeader}><div><p className={styles.kicker}>Runtime</p><h2>Clean v3 core</h2></div><span className={styles.status} data-status={dashboard?.runtime.enabled ? "running" : "needs_attention"}>{dashboard?.runtime.enabled ? "Enabled" : "Paused"}</span></div>
              <p className={styles.muted}>Mode: <strong>{dashboard?.runtime.mode ?? "—"}</strong></p>
              <p className={styles.muted}>Maximum per ChatGPT run: <strong>{dashboard?.runtime.max_per_run ?? 4}</strong></p>
              <p className={styles.muted}>Default design: <strong>{dashboard?.runtime.default_design_variant ?? "ciribilli-narita-v1"}</strong></p>
              <p className={styles.muted}>{dashboard?.runtime.note}</p>
              <p className={styles.muted}>No background production cron is running. Scheduling comes only after the manual v3 test passes.</p>
            </article>

            <article className={styles.card}>
              <div className={styles.cardHeader}><div><p className={styles.kicker}>Eligible queue</p><h2>Next prospects</h2></div><span className={styles.status}>{dashboard?.queue.length ?? 0}</span></div>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead><tr><th>PI</th><th>Institution</th><th>Score</th><th>Queued</th></tr></thead>
                  <tbody>
                    {(dashboard?.queue ?? []).slice(0, 30).map((item) => <tr key={item.prospectId}><td><strong>{item.piName}</strong><br/><span className={styles.muted}>{item.slug}</span></td><td>{item.institution}</td><td>{item.score ?? "—"}</td><td>{dateTime(item.queuedAt)}</td></tr>)}
                  </tbody>
                </table>
              </div>
            </article>
          </div>

          <div className={styles.stack}>
            <article className={styles.card}>
              <div className={styles.cardHeader}><div><p className={styles.kicker}>Current work</p><h2>ChatGPT production</h2></div><span className={styles.status} data-status="in_production">{producing.length}</span></div>
              {producing.length === 0 ? <p className={styles.muted}>No PI is currently claimed. The first manual v3 test will appear here.</p> : producing.map((run) => <div className={styles.event} key={run.runId}><strong>{run.piName}</strong><span>{run.slug} · evidence {run.evidenceCount} · assets {run.assetCount}</span><time>{dateTime(run.updatedAt)}</time>{run.previewPath ? <div className={styles.formActions}><a className={styles.buttonSecondary} href={run.previewPath} target="_blank" rel="noreferrer">Open draft ↗</a></div> : null}</div>)}
            </article>

            <article className={styles.card}>
              <div className={styles.cardHeader}><div><p className={styles.kicker}>Human gate</p><h2>Final Review</h2></div><span className={styles.status} data-status="awaiting_final_review">{finalReview.length}</span></div>
              {finalReview.length === 0 ? <p className={styles.muted}>Successful ChatGPT runs stop here before publication.</p> : finalReview.map((run) => <div className={styles.event} key={run.runId}><strong>{run.piName}</strong><span>{run.slug} · verified evidence {run.evidenceCount} · verified assets {run.assetCount}</span><div className={styles.formActions}>{run.previewPath ? <a className={styles.buttonSecondary} href={run.previewPath} target="_blank" rel="noreferrer">Preview ↗</a> : null}<button className={styles.button} disabled={Boolean(actionKey)} onClick={() => void approvePublish(run.runId)} type="button">{actionKey === `${run.runId}:publish` ? "Publishing…" : "Approve & Publish"}</button><button className={styles.buttonSecondary} disabled={Boolean(actionKey)} onClick={() => void returnToProduction(run.runId)} type="button">Return to ChatGPT</button></div></div>)}
            </article>

            {blocked.length ? <article className={styles.card}><div className={styles.cardHeader}><div><p className={styles.kicker}>Fail closed</p><h2>Blocked</h2></div><span className={styles.status} data-status="needs_attention">{blocked.length}</span></div>{blocked.map((run) => <div className={styles.event} key={run.runId}><strong>{run.piName}</strong><span>{run.blockedReason || "Blocked without a recorded reason."}</span><time>{dateTime(run.updatedAt)}</time></div>)}</article> : null}

            {recentPublished.length ? <article className={styles.card}><div className={styles.cardHeader}><div><p className={styles.kicker}>Recent</p><h2>Published by v3</h2></div></div>{recentPublished.map((run) => <div className={styles.event} key={run.runId}><strong>{run.piName}</strong><span>{stateLabel(run.state)}</span>{run.publicUrl ? <div className={styles.formActions}><a className={styles.buttonSecondary} href={run.publicUrl} target="_blank" rel="noreferrer">Open site ↗</a></div> : null}</div>)}</article> : null}
          </div>
        </section>
      </div>
    </main>
  );
}
