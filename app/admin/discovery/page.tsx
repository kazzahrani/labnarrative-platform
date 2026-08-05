"use client";

import { createClient, type Session } from "@supabase/supabase-js";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "../automation/automation.module.css";

type RunSummary = {
  reviewReady?: number;
  held?: number;
  rejected?: number;
  invalid?: number;
  duplicates?: number;
  shortfallReason?: string;
};

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

type CandidateStatus = "pending_review" | "held" | "invalid" | "duplicate" | "approved" | "rejected";

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

type DiscoveryResponse = {
  ok?: boolean;
  error?: string;
  found?: number;
  stored?: number;
  reviewReady?: number;
  held?: number;
  rejected?: number;
  invalid?: number;
  duplicates?: number;
  queued?: number;
  shortfallReason?: string;
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
);

function formatDate(value: string | null): string {
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

export default function ProspectDiscoveryPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [role, setRole] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [runs, setRuns] = useState<DiscoveryRun[]>([]);
  const [candidates, setCandidates] = useState<DiscoveryCandidate[]>([]);
  const [researchAreas, setResearchAreas] = useState("p53 biology, cell-cycle regulation and DNA-damage response");
  const [countries, setCountries] = useState("United Kingdom, Ireland");
  const [institutions, setInstitutions] = useState("");
  const [count, setCount] = useState(5);
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState(false);
  const [workingCandidate, setWorkingCandidate] = useState("");
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

      const [runResult, candidateResult] = await Promise.all([
        supabase
          .from("discovery_runs")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(40),
        supabase
          .from("discovery_candidates")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(250),
      ]);

      if (runResult.error) throw runResult.error;
      if (candidateResult.error) throw candidateResult.error;

      setRuns((runResult.data ?? []) as DiscoveryRun[]);
      setCandidates((candidateResult.data ?? []) as DiscoveryCandidate[]);
    } catch (error) {
      setNotice(errorMessage(error, "The discovery dashboard could not be loaded."));
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

  const reviewCandidates = useMemo(
    () => candidates.filter((item) => item.validation_status === "pending_review"),
    [candidates],
  );
  const decidedCandidates = useMemo(
    () => candidates.filter((item) => item.validation_status !== "pending_review"),
    [candidates],
  );
  const totals = useMemo(() => ({
    runs: runs.length,
    verified: runs.reduce((sum, run) => sum + run.found_count, 0),
    review: reviewCandidates.length,
    approved: candidates.filter((item) => item.validation_status === "approved").length,
    heldOrRejected: candidates.filter((item) => ["held", "rejected", "invalid", "duplicate"].includes(item.validation_status)).length,
  }), [candidates, reviewCandidates.length, runs]);

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

  async function runDiscovery(event: FormEvent) {
    event.preventDefault();
    if (!session || working) return;

    setWorking(true);
    setNotice("Searching across multiple academic-source strategies. This may take up to two minutes.");
    setNoticeError(false);

    try {
      const { data, error } = await supabase.functions.invoke("discover-prospects", {
        body: { researchAreas, countries, institutions, count },
      });

      if (error) {
        let detail = error.message;
        const context = (error as { context?: Response }).context;
        if (context) {
          const parsed = await context.clone().json().catch(() => ({})) as DiscoveryResponse;
          detail = parsed.error || detail;
        }
        throw new Error(detail);
      }

      const result = (data ?? {}) as DiscoveryResponse;
      if (result.error) throw new Error(result.error);

      await loadData(session);
      const shortfall = result.shortfallReason ? ` ${result.shortfallReason}` : "";
      setNotice(`Discovery completed: ${result.found ?? 0} verified, ${result.reviewReady ?? 0} ready for review, ${result.held ?? 0} held, ${result.rejected ?? 0} rejected, ${result.invalid ?? 0} invalid and ${result.duplicates ?? 0} duplicates.${shortfall}`);
      setNoticeError(false);
    } catch (error) {
      setNotice(errorMessage(error, "Prospect discovery failed."));
      setNoticeError(true);
    } finally {
      setWorking(false);
    }
  }

  async function approveCandidate(candidate: DiscoveryCandidate) {
    if (!session || workingCandidate) return;
    setWorkingCandidate(candidate.id);
    setNotice(`Approving ${candidate.pi_name} and adding the PI to the production queue…`);
    setNoticeError(false);
    try {
      const { data, error } = await supabase.rpc("admin_approve_discovery_candidate", {
        p_candidate_id: candidate.id,
      });
      if (error) throw error;
      await loadData(session);
      const result = (data ?? {}) as { duplicate?: boolean; status?: string };
      setNotice(result.duplicate
        ? `${candidate.pi_name} was marked as a duplicate; no new queue record was created.`
        : `${candidate.pi_name} was approved and added to the ${result.status ?? "production"} queue.`);
      setNoticeError(false);
    } catch (error) {
      setNotice(errorMessage(error, "The candidate could not be approved."));
      setNoticeError(true);
    } finally {
      setWorkingCandidate("");
    }
  }

  async function rejectCandidate(candidate: DiscoveryCandidate) {
    if (!session || workingCandidate) return;
    const reason = window.prompt("Reason for rejecting this prospect:", "Not a strong commercial fit for LabNarrative.");
    if (reason === null) return;

    setWorkingCandidate(candidate.id);
    setNotice(`Rejecting ${candidate.pi_name}…`);
    setNoticeError(false);
    try {
      const { error } = await supabase.rpc("admin_reject_discovery_candidate", {
        p_candidate_id: candidate.id,
        p_reason: reason,
      });
      if (error) throw error;
      await loadData(session);
      setNotice(`${candidate.pi_name} was rejected and will not enter production.`);
      setNoticeError(false);
    } catch (error) {
      setNotice(errorMessage(error, "The candidate could not be rejected."));
      setNoticeError(true);
    } finally {
      setWorkingCandidate("");
    }
  }

  if (!authReady) {
    return <main className={styles.page}><div className={styles.login}>Preparing prospect discovery…</div></main>;
  }

  if (!session) {
    return (
      <main className={styles.page}>
        <section className={styles.login}>
          <p className={styles.kicker}>LabNarrative administration</p>
          <h1>Prospect Discovery Engine</h1>
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
        <div>
          <Link className={styles.brand} href="/">LabNarrative</Link>
          <span className={styles.muted}>Prospect discovery</span>
        </div>
        <nav>
          <Link href="/admin/automation">Automation</Link>
          <Link href="/admin/sites">Websites</Link>
          <button className={styles.buttonSecondary} type="button" onClick={() => void supabase.auth.signOut()}>Sign out</button>
        </nav>
      </header>

      <div className={styles.main}>
        <section className={styles.hero}>
          <div>
            <p className={styles.kicker}>Engine 1 · verified discovery</p>
            <h1>Search, verify, then decide.</h1>
            <p className={styles.heroCopy}>The engine now searches through several strategies, requires an official PI profile and evidence sources, detects duplicates, penalises strong existing websites and sends every production-quality prospect to your review inbox. Nothing enters production without your approval.</p>
          </div>
          <div className={styles.heroActions}>
            <Link className={styles.buttonSecondary} href="/admin/automation">Open production queue</Link>
            <button className={styles.buttonSecondary} type="button" disabled={loading} onClick={() => session && void loadData(session, true)}>{loading ? "Refreshing…" : "Refresh"}</button>
          </div>
        </section>

        {notice ? <p className={`${styles.notice} ${noticeError ? styles.error : ""}`}>{notice}</p> : null}

        <section className={styles.stats}>
          <div className={styles.stat}><span>Discovery runs</span><strong>{totals.runs}</strong></div>
          <div className={styles.stat}><span>Verified candidates</span><strong>{totals.verified}</strong></div>
          <div className={styles.stat}><span>Awaiting review</span><strong>{totals.review}</strong></div>
          <div className={styles.stat}><span>Approved & queued</span><strong>{totals.approved}</strong></div>
          <div className={styles.stat}><span>Held or rejected</span><strong>{totals.heldOrRejected}</strong></div>
        </section>

        <div className={styles.grid}>
          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <div><p className={styles.kicker}>Discovery brief</p><h2>Search academic sources</h2></div>
              <span className={styles.status} data-status="pending_review">Human review required</span>
            </div>
            <p className={styles.muted}>Best practice: use one coherent research cluster, specify a country or region, leave institutions blank for broad discovery, and request five candidates per run.</p>
            <form onSubmit={runDiscovery}>
              <div className={styles.formGrid}>
                <div className={styles.fieldFull}>
                  <label>Research cluster</label>
                  <textarea rows={5} value={researchAreas} onChange={(event) => setResearchAreas(event.target.value)} required />
                </div>
                <div className={styles.fieldFull}>
                  <label>Countries or regions</label>
                  <input value={countries} onChange={(event) => setCountries(event.target.value)} placeholder="Example: Germany, Netherlands, Belgium" />
                </div>
                <div className={styles.fieldFull}>
                  <label>Preferred institutions</label>
                  <textarea rows={3} value={institutions} onChange={(event) => setInstitutions(event.target.value)} placeholder="Optional targeted universities or institutes" />
                </div>
                <div className={styles.field}>
                  <label>Number of candidates</label>
                  <input type="number" min={1} max={20} value={count} onChange={(event) => setCount(Number(event.target.value))} />
                </div>
                <div className={styles.field}>
                  <label>Production threshold</label>
                  <input value="75 / 100" readOnly />
                </div>
              </div>
              <div className={styles.formActions}>
                <button className={styles.button} type="submit" disabled={working || loading}>{working ? "Searching and verifying…" : "Discover prospects for review"}</button>
              </div>
            </form>
          </section>

          <div className={styles.stack}>
            <section className={styles.card}>
              <div className={styles.cardHeader}>
                <div><p className={styles.kicker}>Review inbox</p><h2>Production-quality prospects</h2></div>
                <span className={styles.status} data-status="pending_review">{reviewCandidates.length} awaiting decision</span>
              </div>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead><tr><th>Prospect</th><th>Fit</th><th>Evidence</th><th>Decision</th></tr></thead>
                  <tbody>
                    {reviewCandidates.length === 0 ? <tr><td colSpan={4}>No candidates are awaiting review.</td></tr> : reviewCandidates.map((candidate) => (
                      <tr key={candidate.id}>
                        <td>
                          <strong>{candidate.pi_name}</strong><br />
                          <span>{candidate.institution}</span><br />
                          <small className={styles.muted}>{[candidate.department, candidate.country].filter(Boolean).join(" · ")}</small>
                        </td>
                        <td>
                          <strong>{candidate.qualification_score}/100</strong><br />
                          <span className={styles.status} data-status={candidate.website_assessment}>{candidate.website_assessment} website</span><br />
                          <small className={styles.muted}>{candidate.research_area}</small>
                        </td>
                        <td>
                          {candidate.verification_sources.slice(0, 4).map((source) => (
                            <div key={source}><a href={source} target="_blank" rel="noreferrer">{sourceLabel(source)}</a></div>
                          ))}
                          <small className={styles.muted}>{candidate.discovery_reason}</small>
                        </td>
                        <td>
                          <div className={styles.reviewActions}>
                            <button className={styles.button} type="button" disabled={Boolean(workingCandidate)} onClick={() => void approveCandidate(candidate)}>{workingCandidate === candidate.id ? "Working…" : "Approve & queue"}</button>
                            <button className={styles.buttonDanger} type="button" disabled={Boolean(workingCandidate)} onClick={() => void rejectCandidate(candidate)}>Reject</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className={styles.card}>
              <div className={styles.cardHeader}><div><p className={styles.kicker}>Discovery history</p><h2>Recent runs</h2></div></div>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead><tr><th>Started</th><th>Brief</th><th>Requested</th><th>Verified</th><th>Review ready</th><th>Status</th></tr></thead>
                  <tbody>
                    {runs.length === 0 ? <tr><td colSpan={6}>No discovery runs yet.</td></tr> : runs.map((run) => (
                      <tr key={run.id}>
                        <td>{formatDate(run.created_at)}</td>
                        <td>{run.research_areas}<br /><small className={styles.muted}>{run.countries || "Worldwide"}</small></td>
                        <td>{run.requested_count}</td>
                        <td>{run.found_count}</td>
                        <td>{run.result_summary?.reviewReady ?? 0}</td>
                        <td>
                          <span className={styles.status} data-status={run.status}>{statusText(run.status)}</span>
                          {run.result_summary?.shortfallReason ? <><br /><small className={styles.muted}>{run.result_summary.shortfallReason}</small></> : null}
                          {run.error_message ? <><br /><small className={styles.muted}>{run.error_message}</small></> : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className={styles.card}>
              <div className={styles.cardHeader}>
                <div><p className={styles.kicker}>Diagnostic record</p><h2>Held, rejected and completed</h2></div>
              </div>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead><tr><th>Prospect</th><th>Score</th><th>Website</th><th>Outcome</th><th>Reason</th></tr></thead>
                  <tbody>
                    {decidedCandidates.length === 0 ? <tr><td colSpan={5}>No diagnostic records yet.</td></tr> : decidedCandidates.map((candidate) => (
                      <tr key={candidate.id}>
                        <td>
                          <strong>{candidate.pi_name || "Invalid result"}</strong><br />
                          <small className={styles.muted}>{candidate.institution || "Institution missing"}</small>
                        </td>
                        <td>{candidate.qualification_score}<br /><small className={styles.muted}>Raw {candidate.raw_qualification_score}</small></td>
                        <td>{candidate.website_assessment}</td>
                        <td><span className={styles.status} data-status={candidate.validation_status}>{statusText(candidate.validation_status)}</span></td>
                        <td>
                          {candidate.decision_reason || "—"}
                          {candidate.validation_issues.length > 0 ? <><br /><small className={styles.muted}>{candidate.validation_issues.join(" · ")}</small></> : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
