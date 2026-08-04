"use client";

import { createClient, type Session } from "@supabase/supabase-js";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./automation.module.css";

type ProspectStatus =
  | "discovered"
  | "qualified"
  | "queued"
  | "in_production"
  | "awaiting_final_review"
  | "revision_requested"
  | "approved_to_send"
  | "email_sent"
  | "needs_attention"
  | "rejected"
  | "paused"
  | "replied"
  | "interested";

type RunStatus =
  | "queued"
  | "running"
  | "awaiting_final_review"
  | "revision_requested"
  | "approved_to_send"
  | "completed"
  | "failed"
  | "needs_attention"
  | "paused"
  | "rejected";

type PipelineStep =
  | "research"
  | "images"
  | "content"
  | "website"
  | "qa"
  | "domain"
  | "email_draft"
  | "final_review"
  | "send"
  | "completed";

type Prospect = {
  id: string;
  pi_name: string;
  institution: string;
  department: string;
  country: string;
  official_profile_url: string;
  email: string;
  current_website: string;
  research_area: string;
  discovery_source: string;
  qualification_score: number;
  qualification_reason: string;
  status: ProspectStatus;
  priority: number;
  slug: string;
  site_id: string | null;
  created_at: string;
  updated_at: string;
};

type SiteSummary = {
  id: string;
  slug: string;
  status: string;
  domain_status: string;
  domain_url: string | null;
  content: {
    labName?: string;
    piName?: string;
    institution?: string;
    email?: string;
  } | null;
};

type ProductionRun = {
  id: string;
  prospect_id: string;
  site_id: string | null;
  status: RunStatus;
  current_step: PipelineStep;
  attempt_count: number;
  retry_count: number;
  error_message: string;
  revision_request: string;
  source_pack: Record<string, unknown>;
  qa_results: Record<string, unknown>;
  cost_summary: Record<string, unknown>;
  started_at: string | null;
  review_ready_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  prospects: Prospect | null;
  sites: SiteSummary | null;
};

type OutreachMessage = {
  id: string;
  prospect_id: string;
  production_run_id: string;
  recipient_email: string;
  sender_email: string;
  subject: string;
  body_text: string;
  status: "draft" | "approved" | "sending" | "sent" | "failed" | "cancelled";
  error_message: string;
  sent_at: string | null;
};

type PipelineEvent = {
  id: number;
  prospect_id: string | null;
  production_run_id: string | null;
  event_type: string;
  step: string;
  message: string;
  created_at: string;
};

type WorkerResponse = {
  ok?: boolean;
  error?: string;
  message?: string;
  status?: string;
  setupRequired?: boolean;
};

type ProspectForm = {
  piName: string;
  institution: string;
  department: string;
  country: string;
  profileUrl: string;
  email: string;
  currentWebsite: string;
  researchArea: string;
  discoverySource: string;
  score: number;
  priority: number;
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const steps: PipelineStep[] = [
  "research",
  "images",
  "content",
  "website",
  "qa",
  "domain",
  "email_draft",
  "final_review",
  "send",
];

const blankForm = (): ProspectForm => ({
  piName: "",
  institution: "",
  department: "",
  country: "",
  profileUrl: "",
  email: "",
  currentWebsite: "",
  researchArea: "",
  discoverySource: "Manual entry",
  score: 80,
  priority: 100,
});

function statusText(value: string): string {
  return value.replaceAll("_", " ");
}

function cleanSlug(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(professor|prof|doctor|dr|associate|assistant)\.?\b/gi, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
}

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

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function parseQuickList(text: string): Array<{ pi_name: string; institution: string; official_profile_url: string; country: string; email: string; research_area: string }> {
  return text
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.includes("\t") ? line.split("\t") : line.split(",");
      return {
        pi_name: (parts[0] || "").trim(),
        institution: (parts[1] || "").trim(),
        official_profile_url: (parts[2] || "").trim(),
        country: (parts[3] || "").trim(),
        email: (parts[4] || "").trim(),
        research_area: (parts[5] || "").trim(),
      };
    })
    .filter((row) => row.pi_name && row.institution);
}

export default function AutomationControlCentre() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [role, setRole] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [runs, setRuns] = useState<ProductionRun[]>([]);
  const [messages, setMessages] = useState<OutreachMessage[]>([]);
  const [events, setEvents] = useState<PipelineEvent[]>([]);
  const [form, setForm] = useState<ProspectForm>(blankForm);
  const [quickList, setQuickList] = useState("");
  const [notice, setNotice] = useState("");
  const [noticeError, setNoticeError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState(false);
  const [revisionText, setRevisionText] = useState<Record<string, string>>({});
  const pollLock = useRef(false);

  const loadData = useCallback(async (activeSession?: Session | null) => {
    const currentSession = activeSession ?? session;
    if (!currentSession || pollLock.current) return;
    pollLock.current = true;
    setLoading(true);

    try {
      const { data: roleRow, error: roleError } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", currentSession.user.id)
        .maybeSingle();
      if (roleError) throw roleError;
      if (roleRow?.role !== "admin") {
        setRole(roleRow?.role ?? null);
        throw new Error("This account does not have LabNarrative administrator access.");
      }
      setRole("admin");

      const [prospectResult, runResult, messageResult, eventResult] = await Promise.all([
        supabase.from("prospects").select("*").order("priority", { ascending: true }).order("created_at", { ascending: true }),
        supabase.from("production_runs").select("*,prospects(*),sites(id,slug,status,domain_status,domain_url,content)").order("created_at", { ascending: false }),
        supabase.from("outreach_messages").select("*").order("created_at", { ascending: false }),
        supabase.from("pipeline_events").select("*").order("created_at", { ascending: false }).limit(120),
      ]);

      if (prospectResult.error) throw prospectResult.error;
      if (runResult.error) throw runResult.error;
      if (messageResult.error) throw messageResult.error;
      if (eventResult.error) throw eventResult.error;

      setProspects((prospectResult.data ?? []) as Prospect[]);
      setRuns((runResult.data ?? []) as unknown as ProductionRun[]);
      setMessages((messageResult.data ?? []) as OutreachMessage[]);
      setEvents((eventResult.data ?? []) as PipelineEvent[]);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The automation dashboard could not be loaded.");
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
      else {
        setRole(null);
        setProspects([]);
        setRuns([]);
      }
    });
    return () => subscription.unsubscribe();
  }, [loadData]);

  useEffect(() => {
    if (!session || role !== "admin") return;
    const timer = window.setInterval(() => void loadData(), 30_000);
    return () => window.clearInterval(timer);
  }, [loadData, role, session]);

  const activeRun = useMemo(
    () => runs.find((run) => ["running", "awaiting_final_review", "revision_requested", "approved_to_send", "needs_attention", "paused"].includes(run.status)),
    [runs],
  );
  const reviewRuns = useMemo(() => runs.filter((run) => run.status === "awaiting_final_review" || run.status === "approved_to_send"), [runs]);
  const counts = useMemo(() => ({
    total: prospects.length,
    queued: prospects.filter((item) => item.status === "queued").length,
    active: prospects.filter((item) => ["in_production", "awaiting_final_review", "revision_requested", "approved_to_send", "needs_attention"].includes(item.status)).length,
    sent: prospects.filter((item) => item.status === "email_sent").length,
    attention: prospects.filter((item) => item.status === "needs_attention").length,
  }), [prospects]);

  async function requestOtp(event: FormEvent) {
    event.preventDefault();
    setNotice("");
    setNoticeError(false);
    const { error: authError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: false },
    });
    if (authError) {
      setNotice(authError.message);
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
    const { error: authError } = await supabase.auth.verifyOtp({ email: email.trim(), token, type: "email" });
    if (authError) {
      setNotice(authError.message);
      setNoticeError(true);
    }
  }

  async function addProspect(event: FormEvent) {
    event.preventDefault();
    setWorking(true);
    setNotice("");
    setNoticeError(false);
    try {
      const payload = {
        pi_name: form.piName.trim(),
        institution: form.institution.trim(),
        department: form.department.trim(),
        country: form.country.trim(),
        official_profile_url: form.profileUrl.trim(),
        email: form.email.trim(),
        current_website: form.currentWebsite.trim(),
        research_area: form.researchArea.trim(),
        discovery_source: form.discoverySource.trim(),
        qualification_score: form.score,
        qualification_reason: form.score >= 75 ? "Meets the automatic production threshold." : "Held below the automatic production threshold.",
        priority: form.priority,
        slug: cleanSlug(form.piName),
        status: "discovered",
      };
      if (!payload.pi_name || !payload.institution) throw new Error("PI name and institution are required.");
      const { error } = await supabase.from("prospects").insert(payload);
      if (error) throw error;
      setForm(blankForm());
      setNotice(payload.qualification_score >= 75 ? "Prospect added and queued automatically." : "Prospect added to the database.");
      await loadData();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The prospect could not be added.");
      setNoticeError(true);
    } finally {
      setWorking(false);
    }
  }

  async function importQuickList() {
    setWorking(true);
    setNotice("");
    setNoticeError(false);
    try {
      const rows = parseQuickList(quickList);
      if (rows.length === 0) throw new Error("Add one PI per line: name, institution, profile URL, country, email, research area.");
      const payload = rows.map((row, index) => ({
        ...row,
        discovery_source: "Imported prospect list",
        qualification_score: 80,
        qualification_reason: "Imported as a pre-qualified LabNarrative prospect.",
        priority: 100 + index,
        slug: cleanSlug(row.pi_name),
        status: "discovered",
      }));
      const { error } = await supabase.from("prospects").insert(payload);
      if (error) throw error;
      setQuickList("");
      setNotice(`${payload.length} prospects were added and queued automatically.`);
      await loadData();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The prospect list could not be imported.");
      setNoticeError(true);
    } finally {
      setWorking(false);
    }
  }

  async function invokeWorker(action: string, body: Record<string, unknown> = {}): Promise<WorkerResponse> {
    setWorking(true);
    setNotice("");
    setNoticeError(false);
    try {
      const { data, error } = await supabase.functions.invoke("automation-worker", { body: { action, ...body } });
      if (error) {
        let detail = error.message;
        const context = (error as { context?: Response }).context;
        if (context) {
          const parsed = await context.clone().json().catch(() => ({})) as WorkerResponse;
          detail = parsed.error || parsed.message || detail;
        }
        throw new Error(detail);
      }
      const result = (data ?? {}) as WorkerResponse;
      if (result.error) throw new Error(result.error);
      setNotice(result.message || (result.setupRequired ? "Approved. Email delivery configuration is still required." : "Automation action completed."));
      await loadData();
      return result;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The automation worker failed.");
      setNoticeError(true);
      return { error: error instanceof Error ? error.message : "Unknown worker error" };
    } finally {
      setWorking(false);
    }
  }

  async function saveMessage(message: OutreachMessage) {
    setWorking(true);
    try {
      const { error } = await supabase.from("outreach_messages").update({
        recipient_email: message.recipient_email.trim(),
        subject: message.subject.trim(),
        body_text: message.body_text,
        body_html: "",
      }).eq("id", message.id);
      if (error) throw error;
      setNotice("Email draft saved.");
      setNoticeError(false);
      await loadData();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The email draft could not be saved.");
      setNoticeError(true);
    } finally {
      setWorking(false);
    }
  }

  function updateMessage(id: string, patch: Partial<OutreachMessage>) {
    setMessages((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  }

  if (!authReady) return <main className={styles.page}><div className={styles.login}>Loading administrator access…</div></main>;

  if (!session) {
    return (
      <main className={styles.page}>
        <section className={styles.login}>
          <p className={styles.kicker}>LabNarrative administration</p>
          <h1>Automation Control Centre</h1>
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
    return <main className={styles.page}><div className={styles.login}>{loading ? "Checking administrator access…" : notice || "Administrator access is required."}</div></main>;
  }

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <div><Link className={styles.brand} href="/">LabNarrative</Link><span className={styles.muted}>Automation</span></div>
        <nav><Link href="/admin/sites">Websites</Link><Link href="/admin">Editor</Link><button className={styles.buttonSecondary} type="button" onClick={() => void supabase.auth.signOut()}>Sign out</button></nav>
      </header>

      <div className={styles.main}>
        <section className={styles.hero}>
          <div>
            <p className={styles.kicker}>Production system · Ciribilli Narita v1</p>
            <h1>From prospect to live concept.</h1>
            <p className={styles.heroCopy}>Qualified prospects enter the production queue automatically. The system researches, builds, checks and publishes one PI website at a time. Your only standard checkpoint is the finished website and email.</p>
          </div>
          <div className={styles.heroActions}>
            <button className={styles.button} type="button" disabled={working || Boolean(activeRun)} onClick={() => void invokeWorker("start_next")}>Build next queued PI</button>
            <button className={styles.buttonSecondary} type="button" disabled={working || activeRun?.current_step !== "domain"} onClick={() => void invokeWorker("continue_active")}>Check domain & continue</button>
            <button className={styles.buttonSecondary} type="button" disabled={loading} onClick={() => void loadData()}>Refresh</button>
          </div>
        </section>

        {notice ? <p className={`${styles.notice} ${noticeError ? styles.error : ""}`}>{notice}</p> : null}

        <section className={styles.stats} aria-label="Automation totals">
          <div className={styles.stat}><span>Prospects</span><strong>{counts.total}</strong></div>
          <div className={styles.stat}><span>Queued</span><strong>{counts.queued}</strong></div>
          <div className={styles.stat}><span>Active</span><strong>{counts.active}</strong></div>
          <div className={styles.stat}><span>Needs attention</span><strong>{counts.attention}</strong></div>
          <div className={styles.stat}><span>Emails sent</span><strong>{counts.sent}</strong></div>
        </section>

        <div className={styles.grid}>
          <div className={styles.stack}>
            <section className={styles.card}>
              <div className={styles.cardHeader}><div><p className={styles.kicker}>Prospect intake</p><h2>Add one PI</h2></div><span className={styles.status} data-status={form.score >= 75 ? "queued" : "qualified"}>{form.score >= 75 ? "Auto-queue" : "Hold"}</span></div>
              <form onSubmit={addProspect}>
                <div className={styles.formGrid}>
                  <div className={styles.field}><label>PI name</label><input value={form.piName} onChange={(event) => setForm({ ...form, piName: event.target.value })} required /></div>
                  <div className={styles.field}><label>Institution</label><input value={form.institution} onChange={(event) => setForm({ ...form, institution: event.target.value })} required /></div>
                  <div className={styles.field}><label>Department</label><input value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })} /></div>
                  <div className={styles.field}><label>Country</label><input value={form.country} onChange={(event) => setForm({ ...form, country: event.target.value })} /></div>
                  <div className={styles.fieldFull}><label>Official profile URL</label><input type="url" value={form.profileUrl} onChange={(event) => setForm({ ...form, profileUrl: event.target.value })} /></div>
                  <div className={styles.field}><label>Public email</label><input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></div>
                  <div className={styles.field}><label>Current website</label><input type="url" value={form.currentWebsite} onChange={(event) => setForm({ ...form, currentWebsite: event.target.value })} /></div>
                  <div className={styles.fieldFull}><label>Research area</label><textarea rows={3} value={form.researchArea} onChange={(event) => setForm({ ...form, researchArea: event.target.value })} /></div>
                  <div className={styles.field}><label>Qualification score</label><input type="number" min={0} max={100} value={form.score} onChange={(event) => setForm({ ...form, score: Number(event.target.value) })} /></div>
                  <div className={styles.field}><label>Queue priority</label><input type="number" min={1} max={1000} value={form.priority} onChange={(event) => setForm({ ...form, priority: Number(event.target.value) })} /></div>
                </div>
                <div className={styles.formActions}><button className={styles.button} disabled={working} type="submit">Add prospect</button></div>
              </form>
            </section>

            <section className={styles.card}>
              <div className={styles.cardHeader}><div><p className={styles.kicker}>Fast import</p><h3>Paste a prospect list</h3></div></div>
              <div className={styles.fieldFull}><label>One PI per line</label><textarea rows={7} value={quickList} onChange={(event) => setQuickList(event.target.value)} placeholder="PI name, Institution, Official profile URL, Country, Email, Research area" /></div>
              <div className={styles.formActions}><button className={styles.buttonSecondary} type="button" disabled={working || !quickList.trim()} onClick={() => void importQuickList()}>Import and auto-queue</button></div>
            </section>

            <section className={styles.card}>
              <div className={styles.cardHeader}><div><p className={styles.kicker}>Recent activity</p><h3>Pipeline events</h3></div></div>
              <div className={styles.eventList}>
                {events.length === 0 ? <p className={styles.muted}>No automation events yet.</p> : events.map((event) => (
                  <div className={styles.event} key={event.id}><strong>{statusText(event.event_type)}</strong><span>{event.message}</span><time>{formatDate(event.created_at)} · {statusText(event.step)}</time></div>
                ))}
              </div>
            </section>
          </div>

          <div className={styles.stack}>
            {activeRun ? (
              <section className={styles.card}>
                <div className={styles.cardHeader}>
                  <div><p className={styles.kicker}>Current production</p><h2>{activeRun.prospects?.pi_name || activeRun.sites?.content?.piName || "Active PI"}</h2><p className={styles.muted}>{activeRun.prospects?.institution}</p></div>
                  <span className={styles.status} data-status={activeRun.status}>{statusText(activeRun.status)}</span>
                </div>
                <p><strong>Current step:</strong> {statusText(activeRun.current_step)}</p>
                <div className={styles.progress}>{steps.map((step) => <span key={step} title={statusText(step)} data-active={steps.indexOf(step) <= steps.indexOf(activeRun.current_step)} />)}</div>
                {activeRun.error_message ? <p className={`${styles.notice} ${styles.error}`}>{activeRun.error_message}</p> : null}
                {activeRun.sites?.slug ? <div className={styles.reviewActions}><a className={styles.buttonSecondary} href={`https://${activeRun.sites.slug}.labnarrative.com`} target="_blank" rel="noreferrer">Open concept</a><Link className={styles.buttonSecondary} href={`/admin?site=${activeRun.sites.slug}`}>Open editor</Link></div> : null}
              </section>
            ) : (
              <section className={styles.card}><div className={styles.cardHeader}><div><p className={styles.kicker}>Production queue</p><h2>Ready for the next PI</h2></div></div><p className={styles.muted}>{counts.queued > 0 ? `${counts.queued} qualified prospect${counts.queued === 1 ? " is" : "s are"} waiting.` : "There are no qualified prospects in the queue."}</p></section>
            )}

            {reviewRuns.map((run) => {
              const message = messages.find((item) => item.production_run_id === run.id);
              const qaIssues = stringArray(run.qa_results?.issues);
              const siteUrl = run.sites?.domain_url || (run.sites?.slug ? `https://${run.sites.slug}.labnarrative.com` : "");
              return (
                <section className={`${styles.card} ${styles.reviewCard}`} key={run.id}>
                  <div className={styles.cardHeader}><div><p className={styles.kicker}>Your single approval gate</p><h2>{run.prospects?.pi_name}</h2><p className={styles.muted}>{run.prospects?.institution}</p></div><span className={styles.status} data-status={run.status}>{statusText(run.status)}</span></div>
                  <div className={styles.reviewMeta}>
                    <div><small>Website</small><strong>{siteUrl ? <a href={siteUrl} target="_blank" rel="noreferrer">Open live concept ↗</a> : "Not connected"}</strong></div>
                    <div><small>QA</small><strong>{run.qa_results?.passed === true ? "Passed" : qaIssues.length ? `${qaIssues.length} issue(s)` : "Pending"}</strong></div>
                    <div><small>Ready</small><strong>{formatDate(run.review_ready_at)}</strong></div>
                  </div>
                  {qaIssues.length ? <div className={`${styles.notice} ${styles.error}`}>{qaIssues.join(" ")}</div> : null}
                  {message ? (
                    <div className={styles.emailEditor}>
                      <label>Recipient<input type="email" value={message.recipient_email} onChange={(event) => updateMessage(message.id, { recipient_email: event.target.value })} /></label>
                      <label>Subject<input value={message.subject} onChange={(event) => updateMessage(message.id, { subject: event.target.value })} /></label>
                      <label>Email message<textarea value={message.body_text} onChange={(event) => updateMessage(message.id, { body_text: event.target.value })} /></label>
                      <div className={styles.reviewActions}><button className={styles.buttonSecondary} disabled={working} type="button" onClick={() => void saveMessage(message)}>Save email draft</button></div>
                    </div>
                  ) : <p className={styles.muted}>The email draft is still being prepared.</p>}
                  <div className={styles.revisionBox}><textarea rows={3} value={revisionText[run.id] || ""} onChange={(event) => setRevisionText((current) => ({ ...current, [run.id]: event.target.value }))} placeholder="Revision instruction, for example: replace project 2 image and shorten the biography." /></div>
                  <div className={styles.reviewActions}>
                    <button className={styles.button} type="button" disabled={working || !message} onClick={() => void invokeWorker("approve_send", { runId: run.id })}>Approve website & send email</button>
                    <button className={styles.buttonSecondary} type="button" disabled={working || !(revisionText[run.id] || "").trim()} onClick={() => void invokeWorker("request_revision", { runId: run.id, instruction: revisionText[run.id] })}>Request changes</button>
                    <button className={styles.buttonDanger} type="button" disabled={working} onClick={() => window.confirm("Reject this prospect and archive the concept without sending an email?") && void invokeWorker("reject", { runId: run.id })}>Reject prospect</button>
                  </div>
                </section>
              );
            })}

            <section className={styles.card}>
              <div className={styles.cardHeader}><div><p className={styles.kicker}>Prospect database</p><h2>Production queue</h2></div><span className={styles.muted}>{prospects.length} records</span></div>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead><tr><th>PI</th><th>Institution</th><th>Score</th><th>Status</th><th>Priority</th><th>Added</th></tr></thead>
                  <tbody>
                    {prospects.length === 0 ? <tr><td colSpan={6}>No prospects yet.</td></tr> : prospects.map((prospect) => (
                      <tr key={prospect.id}>
                        <td><strong>{prospect.pi_name}</strong>{prospect.research_area ? <><br /><small className={styles.muted}>{prospect.research_area}</small></> : null}</td>
                        <td>{prospect.institution}{prospect.country ? <><br /><small className={styles.muted}>{prospect.country}</small></> : null}</td>
                        <td>{prospect.qualification_score}</td>
                        <td><span className={styles.status} data-status={prospect.status}>{statusText(prospect.status)}</span></td>
                        <td>{prospect.priority}</td>
                        <td>{formatDate(prospect.created_at)}</td>
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
