"use client";

import { createClient, type Session } from "@supabase/supabase-js";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./automation.module.css";

type EngineRunState =
  | "research"
  | "build"
  | "assets"
  | "verify"
  | "final_review"
  | "blocked"
  | "approved";

type EngineRun = {
  runId: string;
  prospectId: string;
  piName: string;
  slug: string;
  score: number | null;
  state: EngineRunState;
  blockedReason: string | null;
  startedAt: string | null;
  updatedAt: string | null;
  siteId: string | null;
  siteStatus: string | null;
  previewPath: string | null;
  verificationTotal: number;
  verificationPassed: number;
  researchEvidence: number;
  assets: number;
};

type QueueItem = {
  prospectId: string;
  piName: string;
  slug: string;
  institution: string;
  score: number | null;
  priority: number | null;
  createdAt: string;
};

type DashboardData = {
  runtime: {
    enabled: boolean;
    version: number;
    mode: string;
    maxConcurrency: number;
    note: string;
    updatedAt: string;
  };
  counts: {
    eligibleQueue: number;
    active: number;
    finalReview: number;
    blocked: number;
    approved: number;
  };
  runs: EngineRun[];
  queue: QueueItem[];
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

function formatDate(value: string | null | undefined): string {
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

function stateLabel(state: EngineRunState): string {
  const labels: Record<EngineRunState, string> = {
    research: "Research",
    build: "Build",
    assets: "Assets",
    verify: "Verify",
    final_review: "Final Review",
    blocked: "Blocked",
    approved: "Approved",
  };
  return labels[state];
}

function stateDescription(state: EngineRunState): string {
  const labels: Record<EngineRunState, string> = {
    research: "Verifying identity, official research sources and PubMed records.",
    build: "Writing the private text-first concept from verified evidence only.",
    assets: "Separating portrait, hero and optional research-image roles.",
    verify: "Running deterministic evidence and asset checks.",
    final_review: "Private concept is ready for your decision.",
    blocked: "The engine stopped rather than guessing. See the exact reason below.",
    approved: "Human review approved. Publication is still a separate manual step.",
  };
  return labels[state];
}

function RunCard({
  run,
  working,
  onReview,
}: {
  run: EngineRun;
  working: boolean;
  onReview: (runId: string, decision: "approve" | "return_build" | "return_assets" | "cancel") => Promise<void>;
}) {
  const isReview = run.state === "final_review";
  return (
    <article className={styles.card} style={{ display: "grid", gap: 14 }}>
      <div className={styles.cardHeader}>
        <div>
          <p className={styles.kicker}>{stateLabel(run.state)}</p>
          <h3 style={{ marginBottom: 4 }}>{run.piName}</h3>
          <p className={styles.muted} style={{ margin: 0 }}>{run.slug}.labnarrative.com · score {run.score ?? "—"}</p>
        </div>
        <span className={styles.status} data-status={run.state === "blocked" ? "needs_attention" : run.state === "final_review" ? "awaiting_final_review" : "running"}>
          {stateLabel(run.state)}
        </span>
      </div>

      <p style={{ margin: 0 }}>{stateDescription(run.state)}</p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, fontSize: 13 }}>
        <span>Evidence: <strong>{run.researchEvidence}</strong></span>
        <span>Verified assets: <strong>{run.assets}</strong></span>
        <span>Checks: <strong>{run.verificationPassed}/{run.verificationTotal}</strong></span>
        <span>Updated: <strong>{formatDate(run.updatedAt)}</strong></span>
      </div>

      {run.blockedReason ? (
        <div className={`${styles.notice} ${styles.error}`} style={{ margin: 0 }}>
          <strong>Stopped safely:</strong> {run.blockedReason}
        </div>
      ) : null}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {run.previewPath ? (
          <Link className={styles.buttonSecondary} href={run.previewPath} target="_blank">
            Open private preview ↗
          </Link>
        ) : null}
        {isReview ? (
          <>
            <button className={styles.button} disabled={working} type="button" onClick={() => void onReview(run.runId, "approve")}>Approve</button>
            <button className={styles.buttonSecondary} disabled={working} type="button" onClick={() => void onReview(run.runId, "return_build")}>Return to Build</button>
            <button className={styles.buttonSecondary} disabled={working} type="button" onClick={() => void onReview(run.runId, "return_assets")}>Return to Assets</button>
            <button className={styles.buttonSecondary} disabled={working} type="button" onClick={() => void onReview(run.runId, "cancel")}>Cancel</button>
          </>
        ) : null}
      </div>
    </article>
  );
}

export default function AutomationControlCentre() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [notice, setNotice] = useState("");
  const [noticeError, setNoticeError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState(false);
  const pollLock = useRef(false);

  const loadData = useCallback(async (activeSession?: Session | null) => {
    const currentSession = activeSession ?? session;
    if (!currentSession || pollLock.current) return;
    pollLock.current = true;
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("engine_v2_admin_dashboard");
      if (error) throw error;
      setDashboard(data as DashboardData);
      setNoticeError(false);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Engine v2 dashboard could not be loaded.");
      setNoticeError(true);
    } finally {
      setLoading(false);
      pollLock.current = false;
    }
  }, [session]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
      if (data.session) void loadData(data.session);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthReady(true);
      if (nextSession) void loadData(nextSession);
      else setDashboard(null);
    });
    return () => subscription.unsubscribe();
  }, [loadData]);

  useEffect(() => {
    if (!session) return;
    const timer = window.setInterval(() => void loadData(), 10_000);
    return () => window.clearInterval(timer);
  }, [loadData, session]);

  const activeRuns = useMemo(() => dashboard?.runs.filter((run) => ["research", "build", "assets", "verify"].includes(run.state)) ?? [], [dashboard]);
  const finalReviewRuns = useMemo(() => dashboard?.runs.filter((run) => run.state === "final_review") ?? [], [dashboard]);
  const blockedRuns = useMemo(() => dashboard?.runs.filter((run) => run.state === "blocked") ?? [], [dashboard]);
  const approvedRuns = useMemo(() => dashboard?.runs.filter((run) => run.state === "approved") ?? [], [dashboard]);

  async function requestOtp(event: FormEvent) {
    event.preventDefault();
    setNotice("");
    setNoticeError(false);
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: false } });
    if (error) {
      setNotice(error.message);
      setNoticeError(true);
      return;
    }
    setOtpSent(true);
    setNotice("A six-digit verification code has been sent to your email.");
  }

  async function verifyOtp(event: FormEvent) {
    event.preventDefault();
    const token = otp.replace(/\D/g, "").slice(0, 6);
    if (token.length !== 6) {
      setNotice("Enter the complete six-digit code.");
      setNoticeError(true);
      return;
    }
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token, type: "email" });
    if (error) {
      setNotice(error.message);
      setNoticeError(true);
    }
  }

  async function setEngineEnabled(enabled: boolean) {
    setWorking(true);
    try {
      const { error } = await supabase.rpc("engine_v2_admin_set_enabled", { p_enabled: enabled });
      if (error) throw error;
      setNotice(enabled ? "Engine v2 resumed." : "Engine v2 paused. No new stages will be dispatched.");
      setNoticeError(false);
      await loadData();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Engine state could not be changed.");
      setNoticeError(true);
    } finally {
      setWorking(false);
    }
  }

  async function reviewRun(runId: string, decision: "approve" | "return_build" | "return_assets" | "cancel") {
    setWorking(true);
    try {
      const { error } = await supabase.rpc("engine_v2_admin_review", { p_run_id: runId, p_decision: decision, p_note: null });
      if (error) throw error;
      setNotice(
        decision === "approve" ? "Concept approved. It remains private until publication is built and explicitly triggered." :
        decision === "return_build" ? "Concept returned to Build." :
        decision === "return_assets" ? "Concept returned to Assets." :
        "Run cancelled.",
      );
      setNoticeError(false);
      await loadData();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Review decision could not be saved.");
      setNoticeError(true);
    } finally {
      setWorking(false);
    }
  }

  if (!authReady) return <main className={styles.page}><div className={styles.login}>Loading administrator access…</div></main>;

  if (!session) {
    return (
      <main className={styles.page}>
        <section className={styles.login}>
          <p className={styles.kicker}>LabNarrative administration</p>
          <h1>Engine v2</h1>
          {!otpSent ? (
            <form onSubmit={requestOtp}>
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Administrator email" required />
              <button className={styles.button} type="submit">Send verification code</button>
            </form>
          ) : (
            <form onSubmit={verifyOtp}>
              <input inputMode="numeric" value={otp} onChange={(event) => setOtp(event.target.value)} placeholder="Six-digit code" required />
              <button className={styles.button} type="submit">Verify and continue</button>
            </form>
          )}
          {notice ? <p className={`${styles.notice} ${noticeError ? styles.error : ""}`}>{notice}</p> : null}
        </section>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <div><Link className={styles.brand} href="/">LabNarrative</Link><span className={styles.muted}>Engine v2</span></div>
        <nav><Link href="/admin/sites">Websites</Link><Link href="/admin/discovery">Discovery</Link><Link href="/admin">Editor</Link><button className={styles.buttonSecondary} type="button" onClick={() => void supabase.auth.signOut()}>Sign out</button></nav>
      </header>

      <div className={styles.main}>
        <section className={styles.hero}>
          <div>
            <p className={styles.kicker}>Engine v2 · evidence first</p>
            <h1>Queue → Research → Build → Assets → Verify → Final Review</h1>
            <p className={styles.heroCopy}>One PI is processed at a time. Scientific uncertainty stops the run instead of inventing a match. Final Review never blocks the next PI. Publication and outreach are not automated.</p>
          </div>
          <div className={styles.heroActions}>
            <button className={dashboard?.runtime.enabled ? styles.buttonSecondary : styles.button} type="button" disabled={working || !dashboard} onClick={() => void setEngineEnabled(!dashboard?.runtime.enabled)}>
              {dashboard?.runtime.enabled ? "Pause engine" : "Resume engine"}
            </button>
            <button className={styles.buttonSecondary} type="button" disabled={loading} onClick={() => void loadData()}>Refresh</button>
          </div>
        </section>

        {notice ? <p className={`${styles.notice} ${noticeError ? styles.error : ""}`}>{notice}</p> : null}

        <section className={styles.stats} aria-label="Engine v2 totals">
          <div className={styles.stat}><span>Engine</span><strong>{dashboard?.runtime.enabled ? "ON" : "OFF"}</strong></div>
          <div className={styles.stat}><span>Eligible queue</span><strong>{dashboard?.counts.eligibleQueue ?? "—"}</strong></div>
          <div className={styles.stat}><span>Active production</span><strong>{dashboard?.counts.active ?? "—"}</strong></div>
          <div className={styles.stat}><span>Final Review</span><strong>{dashboard?.counts.finalReview ?? "—"}</strong></div>
          <div className={styles.stat}><span>Blocked safely</span><strong>{dashboard?.counts.blocked ?? "—"}</strong></div>
        </section>

        <div className={styles.grid}>
          <div className={styles.stack}>
            <section className={styles.card}>
              <div className={styles.cardHeader}>
                <div><p className={styles.kicker}>Live production</p><h2>{activeRuns.length ? "One PI is moving through v2" : "No active PI right now"}</h2></div>
                <span className={styles.status} data-status={dashboard?.runtime.enabled ? "running" : "paused"}>{dashboard?.runtime.enabled ? "Automatic" : "Paused"}</span>
              </div>
              <p className={styles.muted}>{dashboard?.runtime.note ?? "Loading engine state…"}</p>
            </section>
            {activeRuns.map((run) => <RunCard key={run.runId} run={run} working={working} onReview={reviewRun} />)}

            <section className={styles.card}>
              <div className={styles.cardHeader}><div><p className={styles.kicker}>Final Review</p><h2>{finalReviewRuns.length} private concept{finalReviewRuns.length === 1 ? "" : "s"} waiting</h2></div></div>
              {finalReviewRuns.length === 0 ? <p className={styles.muted}>Nothing is waiting for review.</p> : null}
            </section>
            {finalReviewRuns.map((run) => <RunCard key={run.runId} run={run} working={working} onReview={reviewRun} />)}
          </div>

          <div className={styles.stack}>
            <section className={styles.card}>
              <div className={styles.cardHeader}><div><p className={styles.kicker}>Eligible queue</p><h2>{dashboard?.counts.eligibleQueue ?? 0} PIs waiting</h2></div></div>
              <div style={{ display: "grid", gap: 10 }}>
                {(dashboard?.queue ?? []).slice(0, 15).map((item, index) => (
                  <div key={item.prospectId} style={{ display: "grid", gridTemplateColumns: "32px minmax(0,1fr) auto", gap: 10, alignItems: "center", padding: "10px 0", borderBottom: "1px solid rgba(22,35,31,.10)" }}>
                    <span className={styles.muted}>{String(index + 1).padStart(2, "0")}</span>
                    <div><strong>{item.piName}</strong><div className={styles.muted} style={{ fontSize: 13 }}>{item.institution || "Institution not yet recorded"}</div></div>
                    <strong>{item.score ?? "—"}</strong>
                  </div>
                ))}
                {(dashboard?.queue.length ?? 0) > 15 ? <p className={styles.muted}>Showing the next 15 queued PIs.</p> : null}
              </div>
            </section>

            <section className={styles.card}>
              <div className={styles.cardHeader}><div><p className={styles.kicker}>Blocked safely</p><h2>{blockedRuns.length} run{blockedRuns.length === 1 ? "" : "s"}</h2></div></div>
              <p className={styles.muted}>Blocked runs do not consume the production slot. No automatic recovery is running.</p>
              <div style={{ display: "grid", gap: 12 }}>
                {blockedRuns.map((run) => (
                  <div key={run.runId} style={{ paddingTop: 10, borderTop: "1px solid rgba(22,35,31,.10)" }}>
                    <strong>{run.piName}</strong>
                    <p className={styles.muted} style={{ margin: "4px 0 0" }}>{run.blockedReason || "Unknown blocker"}</p>
                  </div>
                ))}
              </div>
            </section>

            {approvedRuns.length ? (
              <section className={styles.card}>
                <div className={styles.cardHeader}><div><p className={styles.kicker}>Approved</p><h2>{approvedRuns.length} concept{approvedRuns.length === 1 ? "" : "s"}</h2></div></div>
                <p className={styles.muted}>Approval does not publish or send outreach yet.</p>
              </section>
            ) : null}
          </div>
        </div>
      </div>
    </main>
  );
}
