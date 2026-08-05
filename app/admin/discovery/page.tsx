"use client";

import { createClient, type Session } from "@supabase/supabase-js";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "../automation/automation.module.css";

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
  error_message: string;
  created_at: string;
  completed_at: string | null;
};

type Prospect = {
  id: string;
  pi_name: string;
  institution: string;
  country: string;
  research_area: string;
  qualification_score: number;
  status: string;
  official_profile_url: string;
  created_at: string;
};

type DiscoveryResponse = {
  ok?: boolean;
  error?: string;
  found?: number;
  inserted?: number;
  duplicates?: number;
  queued?: number;
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

export default function ProspectDiscoveryPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [role, setRole] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [runs, setRuns] = useState<DiscoveryRun[]>([]);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [researchAreas, setResearchAreas] = useState("molecular oncology, cancer biology, genetics, cell biology, ageing");
  const [countries, setCountries] = useState("");
  const [institutions, setInstitutions] = useState("");
  const [count, setCount] = useState(8);
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState(false);
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

      const [runResult, prospectResult] = await Promise.all([
        supabase
          .from("discovery_runs")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(30),
        supabase
          .from("prospects")
          .select("id,pi_name,institution,country,research_area,qualification_score,status,official_profile_url,created_at")
          .eq("discovery_source", "Automated academic web discovery")
          .order("created_at", { ascending: false })
          .limit(100),
      ]);

      if (runResult.error) throw runResult.error;
      if (prospectResult.error) throw prospectResult.error;

      setRuns((runResult.data ?? []) as DiscoveryRun[]);
      setProspects((prospectResult.data ?? []) as Prospect[]);
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
        setProspects([]);
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

  const totals = useMemo(() => ({
    runs: runs.length,
    found: runs.reduce((sum, run) => sum + run.found_count, 0),
    inserted: runs.reduce((sum, run) => sum + run.inserted_count, 0),
    queued: prospects.filter((item) => item.status === "queued").length,
    held: prospects.filter((item) => item.status === "qualified" || item.status === "discovered").length,
  }), [prospects, runs]);

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
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token,
      type: "email",
    });
    if (error) {
      setNotice(error.message);
      setNoticeError(true);
    }
  }

  async function runDiscovery(event: FormEvent) {
    event.preventDefault();
    if (!session || working) return;

    setWorking(true);
    setNotice("Searching current academic sources. This can take one to two minutes.");
    setNoticeError(false);

    const timeout = window.setTimeout(() => {
      setNotice("The search is taking longer than expected. It is still safe to leave this page open.");
      setNoticeError(false);
    }, 45_000);

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
      setNotice(`Discovery completed: ${result.inserted ?? 0} new prospects added, ${result.queued ?? 0} queued, ${result.duplicates ?? 0} duplicates skipped.`);
      setNoticeError(false);
    } catch (error) {
      setNotice(errorMessage(error, "Prospect discovery failed."));
      setNoticeError(true);
    } finally {
      window.clearTimeout(timeout);
      setWorking(false);
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
            <p className={styles.kicker}>Engine 1 · automatic qualification</p>
            <h1>Find the next laboratories.</h1>
            <p className={styles.heroCopy}>The discovery engine searches current academic sources, verifies independent PI status, evaluates website opportunity, removes duplicates and automatically queues prospects scoring 75 or higher.</p>
          </div>
          <div className={styles.heroActions}>
            <Link className={styles.buttonSecondary} href="/admin/automation">Open production queue</Link>
            <button className={styles.buttonSecondary} type="button" disabled={loading} onClick={() => session && void loadData(session, true)}>{loading ? "Refreshing…" : "Refresh"}</button>
          </div>
        </section>

        {notice ? <p className={`${styles.notice} ${noticeError ? styles.error : ""}`}>{notice}</p> : null}

        <section className={styles.stats}>
          <div className={styles.stat}><span>Discovery runs</span><strong>{totals.runs}</strong></div>
          <div className={styles.stat}><span>Candidates found</span><strong>{totals.found}</strong></div>
          <div className={styles.stat}><span>New prospects</span><strong>{totals.inserted}</strong></div>
          <div className={styles.stat}><span>Queued ≥75</span><strong>{totals.queued}</strong></div>
          <div className={styles.stat}><span>Held below 75</span><strong>{totals.held}</strong></div>
        </section>

        <div className={styles.grid}>
          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <div><p className={styles.kicker}>Discovery brief</p><h2>Search academic sources</h2></div>
              <span className={styles.status} data-status="queued">Auto-queue enabled</span>
            </div>
            <form onSubmit={runDiscovery}>
              <div className={styles.formGrid}>
                <div className={styles.fieldFull}>
                  <label>Research areas</label>
                  <textarea rows={5} value={researchAreas} onChange={(event) => setResearchAreas(event.target.value)} required />
                </div>
                <div className={styles.fieldFull}>
                  <label>Countries or regions</label>
                  <input value={countries} onChange={(event) => setCountries(event.target.value)} placeholder="Leave empty for worldwide discovery" />
                </div>
                <div className={styles.fieldFull}>
                  <label>Preferred institutions</label>
                  <textarea rows={3} value={institutions} onChange={(event) => setInstitutions(event.target.value)} placeholder="Optional universities, institutes or networks" />
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
                <button className={styles.button} type="submit" disabled={working || loading}>{working ? "Searching and qualifying…" : "Discover and auto-queue"}</button>
              </div>
            </form>
          </section>

          <div className={styles.stack}>
            <section className={styles.card}>
              <div className={styles.cardHeader}><div><p className={styles.kicker}>Discovery history</p><h2>Recent runs</h2></div></div>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead><tr><th>Started</th><th>Brief</th><th>Found</th><th>Added</th><th>Queued</th><th>Status</th></tr></thead>
                  <tbody>
                    {runs.length === 0 ? <tr><td colSpan={6}>No discovery runs yet.</td></tr> : runs.map((run) => (
                      <tr key={run.id}>
                        <td>{formatDate(run.created_at)}</td>
                        <td>{run.research_areas}</td>
                        <td>{run.found_count}</td>
                        <td>{run.inserted_count}</td>
                        <td>{run.queued_count}</td>
                        <td>
                          <span className={styles.status} data-status={run.status}>{statusText(run.status)}</span>
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
                <div><p className={styles.kicker}>Prospect database</p><h2>Discovered PIs</h2></div>
                <span className={styles.muted}>{prospects.length} shown</span>
              </div>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead><tr><th>PI</th><th>Institution</th><th>Research</th><th>Score</th><th>Status</th></tr></thead>
                  <tbody>
                    {prospects.length === 0 ? <tr><td colSpan={5}>No automatically discovered prospects yet.</td></tr> : prospects.map((prospect) => (
                      <tr key={prospect.id}>
                        <td>
                          <strong>{prospect.official_profile_url ? <a href={prospect.official_profile_url} target="_blank" rel="noreferrer">{prospect.pi_name} ↗</a> : prospect.pi_name}</strong>
                          <br /><small className={styles.muted}>{prospect.country}</small>
                        </td>
                        <td>{prospect.institution}</td>
                        <td>{prospect.research_area}</td>
                        <td>{prospect.qualification_score}</td>
                        <td><span className={styles.status} data-status={prospect.status}>{statusText(prospect.status)}</span></td>
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
