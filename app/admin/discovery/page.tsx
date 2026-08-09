"use client";

import type { Session } from "@supabase/supabase-js";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { browserSupabase as supabase } from "@/lib/supabase-browser";
import styles from "./discovery.module.css";

type RunSummary = Record<string, unknown>;

type DiscoveryRun = {
  id: string;
  status: "running" | "completed" | "failed";
  research_areas: string;
  countries: string;
  institutions: string;
  requested_count: number;
  found_count: number;
  inserted_count: number;
  duplicate_count: number;
  queued_count: number;
  result_summary: RunSummary | null;
  error_message: string;
  created_at: string;
  completed_at: string | null;
};

type CandidateStatus =
  | "pending_review"
  | "held"
  | "invalid"
  | "duplicate"
  | "approved"
  | "rejected";

type DiscoveryCandidate = {
  id: string;
  discovery_run_id: string;
  pi_name: string;
  institution: string;
  department: string;
  country: string;
  official_profile_url: string;
  email: string;
  current_website: string;
  research_area: string;
  discovery_reason: string;
  website_assessment: string;
  raw_qualification_score: number;
  qualification_score: number;
  verification_sources: string[];
  source_count: number;
  validation_status: CandidateStatus;
  validation_issues: string[];
  decision_reason: string;
  prospect_id: string | null;
  reviewed_at: string | null;
  created_at: string;
};

type EngineQueueItem = {
  prospectId: string;
  piName: string;
  slug: string;
  institution: string;
  score: number;
  queuedAt: string | null;
};

type EngineDashboard = {
  counts?: {
    eligibleQueue?: number;
    producing?: number;
    finalReview?: number;
    published?: number;
    blocked?: number;
    completed?: number;
  };
  queue?: EngineQueueItem[];
};

const QUEUE_BUFFER = 80;

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

function statusText(value: string): string {
  return value.replaceAll("_", " ");
}

function errorMessage(value: unknown, fallback: string): string {
  if (value instanceof Error && value.message) return value.message;
  if (value && typeof value === "object" && "message" in value && typeof value.message === "string") {
    return value.message;
  }
  return fallback;
}

function sourceLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Source";
  }
}

function summaryNumber(summary: RunSummary | null, keys: string[], fallback = 0): number {
  if (!summary) return fallback;
  for (const key of keys) {
    const value = summary[key];
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function summaryString(summary: RunSummary | null, keys: string[]): string {
  if (!summary) return "";
  for (const key of keys) {
    const value = summary[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function summaryFlag(summary: RunSummary | null, key: string): boolean | null {
  if (!summary || !(key in summary)) return null;
  return Boolean(summary[key]);
}

export default function ProspectDiscoveryPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [role, setRole] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [runs, setRuns] = useState<DiscoveryRun[]>([]);
  const [candidates, setCandidates] = useState<DiscoveryCandidate[]>([]);
  const [dashboard, setDashboard] = useState<EngineDashboard | null>(null);
  const [runCount, setRunCount] = useState(0);
  const [candidateCount, setCandidateCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [noticeError, setNoticeError] = useState(false);
  const loadLock = useRef(false);

  const loadData = useCallback(async (current: Session, clearNotice = false) => {
    if (loadLock.current) return;
    loadLock.current = true;
    setLoading(true);
    if (clearNotice) {
      setNotice("");
      setNoticeError(false);
    }

    try {
      const { data: roleRow, error: roleError } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", current.user.id)
        .maybeSingle();

      if (roleError) throw roleError;
      if (roleRow?.role !== "admin") {
        setRole(roleRow?.role ?? null);
        throw new Error("Administrator permission is required.");
      }
      setRole("admin");

      const [runResult, candidateResult, engineResult] = await Promise.all([
        supabase
          .from("discovery_runs")
          .select("*", { count: "exact" })
          .order("created_at", { ascending: false })
          .limit(30),
        supabase
          .from("discovery_candidates")
          .select("*", { count: "exact" })
          .order("created_at", { ascending: false })
          .limit(180),
        supabase.rpc("engine_v3_admin_dashboard"),
      ]);

      if (runResult.error) throw runResult.error;
      if (candidateResult.error) throw candidateResult.error;
      if (engineResult.error) throw engineResult.error;

      setRuns((runResult.data ?? []) as DiscoveryRun[]);
      setCandidates((candidateResult.data ?? []) as DiscoveryCandidate[]);
      setRunCount(runResult.count ?? 0);
      setCandidateCount(candidateResult.count ?? 0);
      setDashboard((engineResult.data ?? null) as EngineDashboard | null);
    } catch (error) {
      setNotice(errorMessage(error, "The Engine v3 discovery dashboard could not be loaded."));
      setNoticeError(true);
    } finally {
      setLoading(false);
      loadLock.current = false;
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return;
      if (error) {
        setNotice(error.message);
        setNoticeError(true);
      }
      setSession(data.session);
      setAuthReady(true);
      if (data.session) void loadData(data.session, true);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted || event === "INITIAL_SESSION") return;
      setSession(nextSession);
      setAuthReady(true);
      if (event === "SIGNED_OUT" || !nextSession) {
        setRole(null);
        setRuns([]);
        setCandidates([]);
        setDashboard(null);
        return;
      }
      if (["SIGNED_IN", "TOKEN_REFRESHED", "USER_UPDATED"].includes(event)) {
        void loadData(nextSession, event === "SIGNED_IN");
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [loadData]);

  async function requestOtp(event: FormEvent) {
    event.preventDefault();
    setNotice("");
    setNoticeError(false);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: false },
    });
    if (error) {
      setNotice(error.message);
      setNoticeError(true);
    } else {
      setOtpSent(true);
      setNotice("A six-digit verification code has been sent.");
    }
  }

  async function verifyOtp(event: FormEvent) {
    event.preventDefault();
    const token = otp.replace(/\D/g, "").slice(0, 6);
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token, type: "email" });
    if (error) {
      setNotice(error.message);
      setNoticeError(true);
    }
  }

  const latestRun = runs[0] ?? null;
  const queue = dashboard?.queue ?? [];
  const counts = dashboard?.counts ?? {};
  const eligibleQueue = counts.eligibleQueue ?? queue.length;
  const bufferPercent = Math.max(0, Math.min(100, (eligibleQueue / QUEUE_BUFFER) * 100));
  const bufferGap = Math.max(0, QUEUE_BUFFER - eligibleQueue);
  const latestReviewed = latestRun
    ? summaryNumber(latestRun.result_summary, ["reviewed", "found", "qualified"], latestRun.found_count)
    : 0;
  const latestHeld = latestRun ? summaryNumber(latestRun.result_summary, ["held"], 0) : 0;
  const latestRejected = latestRun ? summaryNumber(latestRun.result_summary, ["rejected"], 0) : 0;
  const latestDuplicates = latestRun
    ? Math.max(latestRun.duplicate_count, summaryNumber(latestRun.result_summary, ["duplicates", "duplicatesEncounteredAndReplaced"], 0))
    : 0;
  const latestGeneration = latestRun
    ? summaryString(latestRun.result_summary, ["generationSource", "note"])
    : "";
  const latestNoApi = latestRun
    ? summaryFlag(latestRun.result_summary, "externalOpenAiApiUsed") === false
    : true;
  const recentDecisions = useMemo(() => candidates.slice(0, 24), [candidates]);

  if (!authReady) {
    return <main className={styles.page}><div className={styles.login}>Preparing Engine v3 discovery…</div></main>;
  }

  if (!session) {
    return (
      <main className={styles.page}>
        <section className={styles.login}>
          <p className={styles.kicker}>LabNarrative administration</p>
          <h1>Engine v3 Discovery</h1>
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

  if (role !== "admin") {
    return <main className={styles.page}><div className={styles.login}>{notice || "Checking administrator access…"}</div></main>;
  }

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <div className={styles.brandRow}>
          <Link className={styles.brand} href="/">LabNarrative</Link>
          <span className={styles.sectionName}>Engine v3 Discovery</span>
        </div>
        <nav>
          <Link href="/admin/automation">Production</Link>
          <Link href="/admin/review">Final Review</Link>
          <Link href="/admin/sites">Websites</Link>
          <button className={styles.buttonSecondary} type="button" onClick={() => void supabase.auth.signOut()}>Sign out</button>
        </nav>
      </header>

      <div className={styles.main}>
        <section className={styles.hero}>
          <div>
            <p className={styles.kicker}>ChatGPT-native prospect discovery</p>
            <h1>Keep the production queue full with verified PIs.</h1>
            <p className={styles.heroCopy}>
              Engine v3 Discovery is a scheduled ChatGPT task, not an autonomous API worker. It inspects live LabNarrative state, rotates research clusters, verifies active independent PIs from official sources, checks publications and portrait readiness, rejects duplicates, and writes strong candidates directly into the production queue.
            </p>
            <div className={styles.toolbar}>
              <Link className={styles.button} href="/admin/automation">Open Engine v3 Production</Link>
              <button className={styles.buttonSecondary} type="button" disabled={loading} onClick={() => session && void loadData(session, true)}>{loading ? "Refreshing…" : "Refresh live state"}</button>
            </div>
          </div>
          <aside className={styles.heroAside}>
            <span>Operating model</span>
            <strong>Scheduled reasoning, human-controlled delivery.</strong>
            <p>Discovery can queue prospects only. It cannot build sites, publish concepts or send outreach. Successful candidates are consumed later by the separate Engine v3 Production task.</p>
          </aside>
        </section>

        {notice ? <p className={`${styles.notice} ${noticeError ? styles.error : ""}`}>{notice}</p> : null}

        <section className={styles.stats}>
          <div className={styles.stat}><span>Eligible queue</span><strong>{eligibleQueue}</strong><small>Oldest eligible PI is produced first.</small></div>
          <div className={styles.stat}><span>Queue buffer</span><strong>{QUEUE_BUFFER}</strong><small>Discovery skips when the pool is already healthy.</small></div>
          <div className={styles.stat}><span>Producing now</span><strong>{counts.producing ?? 0}</strong><small>Current Engine v3 production runs.</small></div>
          <div className={styles.stat}><span>Completed v3</span><strong>{counts.completed ?? 0}</strong><small>Production runs already completed.</small></div>
          <div className={styles.stat}><span>Discovery runs</span><strong>{runCount}</strong><small>Audit history across discovery generations.</small></div>
          <div className={styles.stat}><span>Candidate decisions</span><strong>{candidateCount}</strong><small>Accepted, held, rejected and duplicate records.</small></div>
        </section>

        <section className={styles.buffer}>
          <article className={styles.card}>
            <div className={styles.cardHeader}>
              <div><p className={styles.kicker}>Queue buffer</p><h2>{eligibleQueue >= QUEUE_BUFFER ? "Buffer healthy — discovery can skip." : `${bufferGap} places below the configured buffer.`}</h2></div>
              <span className={styles.status} data-status={eligibleQueue >= QUEUE_BUFFER ? "approved" : "running"}>{eligibleQueue}/{QUEUE_BUFFER}</span>
            </div>
            <div className={styles.bufferRow}>
              <div><div className={styles.bufferNumber}>{eligibleQueue}</div><div className={styles.muted}>eligible queued PIs</div></div>
              <div className={styles.muted}>{eligibleQueue >= QUEUE_BUFFER ? "The next Discovery task should leave the queue unchanged unless the buffer drops before it runs." : "The next scheduled Discovery task may add up to 20 strong new PIs; it never fills the quota with weak candidates."}</div>
            </div>
            <div className={styles.bufferTrack}><div className={styles.bufferFill} style={{ width: `${bufferPercent}%` }} /></div>
            <div className={styles.bufferMeta}><span>0</span><span>Target {QUEUE_BUFFER}</span></div>
          </article>

          <article className={styles.cardDark}>
            <p className={styles.kicker}>Engine v3 handoff</p>
            <h2>Discovery → Queue → Production → Final Review</h2>
            <div className={styles.flow}>
              <div className={styles.flowStep}><span>01</span><strong>Inspect live state</strong></div>
              <div className={styles.flowStep}><span>02</span><strong>Rotate cluster</strong></div>
              <div className={styles.flowStep}><span>03</span><strong>Verify PI</strong></div>
              <div className={styles.flowStep}><span>04</span><strong>Check portrait</strong></div>
              <div className={styles.flowStep}><span>05</span><strong>Queue prospect</strong></div>
              <div className={styles.flowStep}><span>06</span><strong>Production picks up</strong></div>
            </div>
            <div className={styles.schedule}>
              <div><span>Discovery schedule</span><strong>06:00 & 18:00 · Riyadh</strong></div>
              <div><span>Production cadence</span><strong>Up to 4 PIs every 3 hours</strong></div>
            </div>
          </article>
        </section>

        <section className={styles.grid}>
          <article className={styles.card}>
            <div className={styles.cardHeader}>
              <div><p className={styles.kicker}>Next into production</p><h2>Eligible queue order</h2></div>
              <span className={styles.status} data-status="approved">{eligibleQueue} queued</span>
            </div>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead><tr><th>Order</th><th>PI</th><th>Institution</th><th>Score</th><th>Queued</th></tr></thead>
                <tbody>
                  {queue.length === 0 ? <tr><td colSpan={5}><div className={styles.empty}>No eligible queued prospects.</div></td></tr> : queue.slice(0, 50).map((item, index) => (
                    <tr key={item.prospectId}>
                      <td><span className={styles.queueIndex}>{index + 1}</span></td>
                      <td><strong>{item.piName}</strong><br /><span className={styles.muted}>{item.slug}</span></td>
                      <td>{item.institution || "—"}</td>
                      <td>{Number(item.score || 0) || "—"}</td>
                      <td>{formatDate(item.queuedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {queue.length > 50 ? <p className={styles.footerNote}>Showing the first 50 PIs in production order. The complete eligible count is shown above.</p> : null}
          </article>

          <div className={styles.stack}>
            <article className={styles.card}>
              <div className={styles.cardHeader}><div><p className={styles.kicker}>Latest discovery</p><h2>{latestRun ? formatDate(latestRun.completed_at || latestRun.created_at) : "No runs yet"}</h2></div>{latestRun ? <span className={styles.status} data-status={latestRun.status}>{statusText(latestRun.status)}</span> : null}</div>
              {latestRun ? (
                <>
                  <p className={styles.cluster}>{latestRun.research_areas}</p>
                  <div className={styles.metaLine}>
                    <span className={styles.metaChip}>{latestReviewed} reviewed</span>
                    <span className={styles.metaChip}>{latestRun.queued_count} queued</span>
                    <span className={styles.metaChip}>{latestHeld} held</span>
                    <span className={styles.metaChip}>{latestRejected} rejected</span>
                    <span className={styles.metaChip}>{latestDuplicates} duplicates</span>
                  </div>
                  {latestGeneration ? <p className={styles.muted}>{latestGeneration}</p> : null}
                  <p className={styles.footerNote}>{latestNoApi ? "No external OpenAI API credits were used for this Engine v3 run." : "This historical run predates the current no-external-API Engine v3 rule or did not record the flag."}</p>
                </>
              ) : <div className={styles.empty}>No discovery run has been recorded.</div>}
            </article>

            <article className={styles.card}>
              <p className={styles.kicker}>Fail-closed qualification</p>
              <h2>What a PI must pass</h2>
              <div className={styles.decisionList}>
                {[
                  "Current active independent PI or equivalent group leader.",
                  "Official institutional or official laboratory identity/research evidence.",
                  "At least four independently attributable publications.",
                  "A plausible trusted PI portrait source under the Engine v3 portrait policy.",
                  "Enough substantive research evidence to support a real LabNarrative website.",
                  "No existing prospect, site, Engine v3 run or prior discovery identity match.",
                ].map((rule, index) => <div className={styles.decision} key={rule}><div className={styles.decisionTop}><strong>{String(index + 1).padStart(2, "0")}</strong><span className={styles.status} data-status="approved">required</span></div><p>{rule}</p></div>)}
              </div>
            </article>
          </div>
        </section>

        <section className={styles.card} style={{ marginBottom: 18 }}>
          <div className={styles.cardHeader}><div><p className={styles.kicker}>Discovery history</p><h2>Recent scheduled runs</h2></div><span className={styles.status} data-status="healthy">ChatGPT-native monitoring</span></div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>Completed</th><th>Research cluster</th><th>Reviewed</th><th>Queued</th><th>Held</th><th>Rejected</th><th>Duplicates</th><th>Status</th></tr></thead>
              <tbody>
                {runs.length === 0 ? <tr><td colSpan={8}><div className={styles.empty}>No discovery runs yet.</div></td></tr> : runs.map((run) => (
                  <tr key={run.id}>
                    <td>{formatDate(run.completed_at || run.created_at)}</td>
                    <td><strong>{run.research_areas}</strong><br /><span className={styles.muted}>{run.countries || "Global"}</span></td>
                    <td>{summaryNumber(run.result_summary, ["reviewed", "found", "qualified"], run.found_count)}</td>
                    <td>{run.queued_count}</td>
                    <td>{summaryNumber(run.result_summary, ["held"], 0)}</td>
                    <td>{summaryNumber(run.result_summary, ["rejected"], 0)}</td>
                    <td>{Math.max(run.duplicate_count, summaryNumber(run.result_summary, ["duplicates", "duplicatesEncounteredAndReplaced"], 0))}</td>
                    <td><span className={styles.status} data-status={run.status}>{statusText(run.status)}</span>{run.error_message ? <><br /><span className={styles.muted}>{run.error_message}</span></> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className={styles.card}>
          <div className={styles.cardHeader}><div><p className={styles.kicker}>Evidence trail</p><h2>Latest candidate decisions</h2></div><span className={styles.status}>{candidateCount} audit records</span></div>
          <div className={styles.decisionList}>
            {recentDecisions.length === 0 ? <div className={styles.empty}>No candidate decisions yet.</div> : recentDecisions.map((candidate) => (
              <article className={styles.decision} key={candidate.id}>
                <div className={styles.decisionTop}>
                  <div><strong>{candidate.pi_name || "Unresolved candidate"}</strong><br /><span className={styles.muted}>{[candidate.institution, candidate.department, candidate.country].filter(Boolean).join(" · ") || "Institution not recorded"}</span></div>
                  <span className={styles.status} data-status={candidate.validation_status}>{statusText(candidate.validation_status)}</span>
                </div>
                <p className={styles.reason}>{candidate.decision_reason || candidate.discovery_reason || "No decision reason recorded."}</p>
                {candidate.validation_issues?.length ? <p className={styles.reason}>{candidate.validation_issues.join(" · ")}</p> : null}
                <div className={styles.sourceLinks}>
                  {(candidate.verification_sources || []).slice(0, 5).filter((source) => source.startsWith("http")).map((source) => <a key={source} href={source} target="_blank" rel="noreferrer">{sourceLabel(source)} ↗</a>)}
                  {candidate.official_profile_url ? <a href={candidate.official_profile_url} target="_blank" rel="noreferrer">official profile ↗</a> : null}
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
