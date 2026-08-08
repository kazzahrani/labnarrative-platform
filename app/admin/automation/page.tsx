"use client";

import { createClient, type Session } from "@supabase/supabase-js";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import styles from "./automation.module.css";

type EngineRunState =
  | "research"
  | "build"
  | "assets"
  | "verify"
  | "final_review"
  | "blocked"
  | "approved"
  | "published";

type ReviewDecision = "approve" | "return_build" | "return_assets" | "cancel";

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
  publicUrl: string | null;
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
    published: number;
  };
  runs: EngineRun[];
  queue: QueueItem[];
};

type PublishResult = {
  runId?: string;
  state?: string;
  siteId?: string;
  publicUrl?: string;
  idempotent?: boolean;
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
    published: "Published",
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
    approved: "Human review approved. One explicit Publish click will make the concept public.",
    published: "The approved concept is live on its LabNarrative subdomain. Outreach remains separate.",
  };
  return labels[state];
}

function actionError(payload: unknown, status: number): string {
  if (payload && typeof payload === "object") {
    const row = payload as { message?: unknown; details?: unknown; hint?: unknown; error?: unknown };
    for (const value of [row.message, row.details, row.hint, row.error]) {
      if (typeof value === "string" && value.trim()) return value;
    }
  }
  return `Request failed (${status}).`;
}

async function rpcRequest<T>(session: Session, functionName: string, body: Record<string, unknown>, timeoutMs = 8000): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${functionName}`, {
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
    let payload: unknown = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = text;
      }
    }

    if (!response.ok) throw new Error(actionError(payload, response.status));
    return payload as T;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("The action timed out. Please try once more.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

function RunCard({
  run,
  actionKey,
  onReview,
  onPublish,
}: {
  run: EngineRun;
  actionKey: string;
  onReview: (runId: string, decision: ReviewDecision) => Promise<void>;
  onPublish: (runId: string) => Promise<void>;
}) {
  const isReview = run.state === "final_review";
  const isApproved = run.state === "approved";
  const isPublished = run.state === "published";
  const isBusy = actionKey.startsWith(`${run.runId}:`);
  const busyAction = isBusy ? actionKey.split(":")[1] : "";

  return (
    <article className={styles.card} style={{ display: "grid", gap: 14 }}>
      <div className={styles.cardHeader}>
        <div>
          <p className={styles.kicker}>{stateLabel(run.state)}</p>
          <h3 style={{ marginBottom: 4 }}>{run.piName}</h3>
          <p className={styles.muted} style={{ margin: 0 }}>{run.slug}.labnarrative.com · score {run.score ?? "—"}</p>
        </div>
        <span className={styles.status} data-status={run.state === "blocked" ? "needs_attention" : run.state === "final_review" ? "awaiting_final_review" : run.state === "published" ? "live" : "running"}>
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
          <a className={styles.buttonSecondary} href={run.previewPath} target="_blank" rel="noreferrer">
            Open private preview ↗
          </a>
        ) : null}
        {run.publicUrl ? (
          <a className={isPublished ? styles.button : styles.buttonSecondary} href={run.publicUrl} target="_blank" rel="noreferrer">
            Open live site ↗
          </a>
        ) : null}
        {isReview ? (
          <>
            <button className={styles.button} disabled={isBusy} type="button" onClick={() => void onReview(run.runId, "approve")}>
              {busyAction === "approve" ? "Approving…" : "Approve"}
            </button>
            <button className={styles.buttonSecondary} disabled={isBusy} type="button" onClick={() => void onReview(run.runId, "return_build")}>
              {busyAction === "return_build" ? "Returning…" : "Return to Build"}
            </button>
            <button className={styles.buttonSecondary} disabled={isBusy} type="button" onClick={() => void onReview(run.runId, "return_assets")}>
              {busyAction === "return_assets" ? "Returning…" : "Return to Assets"}
            </button>
            <button className={styles.buttonSecondary} disabled={isBusy} type="button" onClick={() => void onReview(run.runId, "cancel")}>
              {busyAction === "cancel" ? "Cancelling…" : "Cancel"}
            </button>
          </>
        ) : null}
        {isApproved ? (
          <button className={styles.button} disabled={isBusy} type="button" onClick={() => void onPublish(run.runId)}>
            {busyAction === "publish" ? "Publishing…" : "Publish concept"}
          </button>
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
  const [engineWorking, setEngineWorking] = useState(false);
  const [actionKey, setActionKey] = useState("");

  const loadData = useCallback(async (currentSession: Session) => {
    if (!currentSession) return;
    setLoading(true);
    try {
      const data = await rpcRequest<DashboardData>(currentSession, "engine_v2_admin_dashboard", {}, 8000);
      setDashboard(data);
      setNoticeError(false);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Engine v2 dashboard could not be loaded.");
      setNoticeError(true);
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
      if (data.session) void loadData(data.session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted || event === "INITIAL_SESSION") return;
      setSession(nextSession);
      setAuthReady(true);
      if (!nextSession) {
        setDashboard(null);
        return;
      }
      if (event === "SIGNED_IN") {
        window.setTimeout(() => void loadData(nextSession), 0);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [loadData]);

  const activeRuns = useMemo(() => dashboard?.runs.filter((run) => ["research", "build", "assets", "verify"].includes(run.state)) ?? [], [dashboard]);
  const finalReviewRuns = useMemo(() => dashboard?.runs.filter((run) => run.state === "final_review") ?? [], [dashboard]);
  const blockedRuns = useMemo(() => dashboard?.runs.filter((run) => run.state === "blocked") ?? [], [dashboard]);
  const approvedRuns = useMemo(() => dashboard?.runs.filter((run) => run.state === "approved") ?? [], [dashboard]);
  const publishedRuns = useMemo(() => dashboard?.runs.filter((run) => run.state === "published") ?? [], [dashboard]);

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

  function applyReviewLocally(runId: string, decision: ReviewDecision) {
    setDashboard((current) => {
      if (!current) return current;
      const existing = current.runs.find((run) => run.runId === runId);
      if (!existing) return current;

      const target = decision === "approve" ? "approved" : decision === "return_build" ? "build" : decision === "return_assets" ? "assets" : "cancelled";
      if (existing.state === target) return current;

      const counts = { ...current.counts };
      if (existing.state === "final_review") counts.finalReview = Math.max(0, counts.finalReview - 1);
      if (target === "approved") counts.approved += 1;
      if (target === "build" || target === "assets") counts.active += 1;

      const runs = target === "cancelled"
        ? current.runs.filter((run) => run.runId !== runId)
        : current.runs.map((run) => run.runId === runId ? { ...run, state: target as EngineRunState, updatedAt: new Date().toISOString() } : run);

      return { ...current, counts, runs };
    });
  }

  async function setEngineEnabled(enabled: boolean) {
    if (!session || engineWorking) return;
    setEngineWorking(true);
    try {
      await rpcRequest(session, "engine_v2_admin_set_enabled", { p_enabled: enabled });
      setDashboard((current) => current ? {
        ...current,
        runtime: { ...current.runtime, enabled, updatedAt: new Date().toISOString() },
      } : current);
      setNotice(enabled ? "Engine v2 resumed." : "Engine v2 paused. No new stages will be dispatched.");
      setNoticeError(false);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Engine state could not be changed.");
      setNoticeError(true);
    } finally {
      setEngineWorking(false);
    }
  }

  async function reviewRun(runId: string, decision: ReviewDecision) {
    if (!session || actionKey) return;
    setActionKey(`${runId}:${decision}`);
    try {
      await rpcRequest(session, "engine_v2_admin_review", { p_run_id: runId, p_decision: decision, p_note: null });
      applyReviewLocally(runId, decision);
      setNotice(
        decision === "approve" ? "Concept approved. It is still private until you click Publish concept." :
        decision === "return_build" ? "Concept returned to Build." :
        decision === "return_assets" ? "Concept returned to Assets." :
        "Run cancelled.",
      );
      setNoticeError(false);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Review decision could not be saved.");
      setNoticeError(true);
    } finally {
      setActionKey("");
    }
  }

  async function publishRun(runId: string) {
    if (!session || actionKey) return;
    setActionKey(`${runId}:publish`);
    try {
      const data = await rpcRequest<PublishResult>(session, "engine_v2_admin_publish", { p_run_id: runId });
      const publicUrl = data?.publicUrl || "";

      setDashboard((current) => {
        if (!current) return current;
        const existing = current.runs.find((run) => run.runId === runId);
        if (!existing) return current;
        const wasApproved = existing.state === "approved";
        return {
          ...current,
          counts: {
            ...current.counts,
            approved: wasApproved ? Math.max(0, current.counts.approved - 1) : current.counts.approved,
            published: existing.state === "published" ? current.counts.published : current.counts.published + 1,
          },
          runs: current.runs.map((run) => run.runId === runId ? {
            ...run,
            state: "published",
            siteStatus: "concept",
            previewPath: null,
            publicUrl: publicUrl || run.publicUrl || `https://${run.slug}.labnarrative.com`,
            updatedAt: new Date().toISOString(),
          } : run),
        };
      });

      setNotice(publicUrl ? `Concept published: ${publicUrl}` : "Concept published successfully.");
      setNoticeError(false);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Concept could not be published.");
      setNoticeError(true);
    } finally {
      setActionKey("");
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
        <div><a className={styles.brand} href="/">LabNarrative</a><span className={styles.muted}>Engine v2</span></div>
        <nav>
          <a href="/admin/sites">Websites</a>
          <a href="/admin/discovery">Discovery</a>
          <a href="/admin">Editor</a>
          <button className={styles.buttonSecondary} type="button" onClick={() => void supabase.auth.signOut()}>Sign out</button>
        </nav>
      </header>

      <div className={styles.main}>
        <section className={styles.hero}>
          <div>
            <p className={styles.kicker}>Engine v2 · evidence first</p>
            <h1>Queue → Research → Build → Assets → Verify → Final Review → Approve → Publish</h1>
            <p className={styles.heroCopy}>One PI is processed at a time. Scientific uncertainty stops the run instead of inventing a match. Final Review never blocks the next PI. Publishing requires your explicit approval and a separate Publish click. Outreach remains separate.</p>
          </div>
          <div className={styles.heroActions}>
            <button className={dashboard?.runtime.enabled ? styles.buttonSecondary : styles.button} type="button" disabled={engineWorking || !dashboard} onClick={() => void setEngineEnabled(!dashboard?.runtime.enabled)}>
              {engineWorking ? "Saving…" : dashboard?.runtime.enabled ? "Pause engine" : "Resume engine"}
            </button>
            <button className={styles.buttonSecondary} type="button" disabled={loading} onClick={() => session && void loadData(session)}>{loading ? "Refreshing…" : "Refresh"}</button>
          </div>
        </section>

        {notice ? <p className={`${styles.notice} ${noticeError ? styles.error : ""}`}>{notice}</p> : null}

        <section className={styles.stats} aria-label="Engine v2 totals">
          <div className={styles.stat}><span>Engine</span><strong>{dashboard?.runtime.enabled ? "ON" : "OFF"}</strong></div>
          <div className={styles.stat}><span>Eligible queue</span><strong>{dashboard?.counts.eligibleQueue ?? "—"}</strong></div>
          <div className={styles.stat}><span>Active production</span><strong>{dashboard?.counts.active ?? "—"}</strong></div>
          <div className={styles.stat}><span>Final Review</span><strong>{dashboard?.counts.finalReview ?? "—"}</strong></div>
          <div className={styles.stat}><span>Approved</span><strong>{dashboard?.counts.approved ?? "—"}</strong></div>
          <div className={styles.stat}><span>Published</span><strong>{dashboard?.counts.published ?? "—"}</strong></div>
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
            {activeRuns.map((run) => <RunCard key={run.runId} run={run} actionKey={actionKey} onReview={reviewRun} onPublish={publishRun} />)}

            <section className={styles.card}>
              <div className={styles.cardHeader}><div><p className={styles.kicker}>Final Review</p><h2>{finalReviewRuns.length} private concept{finalReviewRuns.length === 1 ? "" : "s"} waiting</h2></div></div>
              {finalReviewRuns.length === 0 ? <p className={styles.muted}>Nothing is waiting for review.</p> : null}
            </section>
            {finalReviewRuns.map((run) => <RunCard key={run.runId} run={run} actionKey={actionKey} onReview={reviewRun} onPublish={publishRun} />)}

            {approvedRuns.length ? (
              <section className={styles.card}>
                <div className={styles.cardHeader}><div><p className={styles.kicker}>Approved · ready to publish</p><h2>{approvedRuns.length} concept{approvedRuns.length === 1 ? "" : "s"}</h2></div></div>
                <p className={styles.muted}>These concepts passed human review but are still private. Publish only when you want the subdomain to become public.</p>
              </section>
            ) : null}
            {approvedRuns.map((run) => <RunCard key={run.runId} run={run} actionKey={actionKey} onReview={reviewRun} onPublish={publishRun} />)}

            {publishedRuns.length ? (
              <section className={styles.card}>
                <div className={styles.cardHeader}><div><p className={styles.kicker}>Published</p><h2>{publishedRuns.length} live concept{publishedRuns.length === 1 ? "" : "s"}</h2></div></div>
                <p className={styles.muted}>Published concepts are public. No outreach is sent by this action.</p>
              </section>
            ) : null}
            {publishedRuns.map((run) => <RunCard key={run.runId} run={run} actionKey={actionKey} onReview={reviewRun} onPublish={publishRun} />)}
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
          </div>
        </div>
      </div>
    </main>
  );
}
