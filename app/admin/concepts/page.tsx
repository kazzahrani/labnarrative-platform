"use client";

import { createClient, type Session } from "@supabase/supabase-js";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./concepts.module.css";

type Prospect = {
  id: string;
  company_name: string;
  slug: string;
  website_url: string | null;
  country: string | null;
  city: string | null;
  industry: string | null;
  company_summary: string | null;
  business_quality_score: number;
  website_opportunity_score: number;
  systems_potential_score: number;
  qualification_reason: string | null;
  website_audit: Record<string, unknown> | null;
  public_evidence: unknown[] | null;
  status: string;
  concept_status: string;
  concept_url: string | null;
  updated_at: string;
};

type Contact = {
  id: string;
  prospect_id: string;
  full_name: string;
  title: string | null;
  linkedin_url: string | null;
  priority: number;
  source_url: string | null;
  verification_notes: string | null;
};

type ConceptRun = {
  id: string;
  prospect_id: string;
  version: number;
  status: string;
  brief: Record<string, unknown>;
  concept_config: Record<string, unknown> | null;
  preview_url: string | null;
  requested_at: string;
  review_ready_at: string | null;
  reviewed_at: string | null;
  reviewer_note: string | null;
  updated_at: string;
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
);

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function dateLabel(value: string | null) {
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

function titleCase(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function WebsitesConceptsPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [role, setRole] = useState<string | null>(null);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [runs, setRuns] = useState<ConceptRun[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState(false);
  const [reviewNote, setReviewNote] = useState("");

  const load = useCallback(async (activeSession: Session) => {
    setLoading(true);
    setNotice("");

    const { data: roleRow, error: roleError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", activeSession.user.id)
      .maybeSingle();

    if (roleError || roleRow?.role !== "admin") {
      setRole(roleRow?.role ?? null);
      setNotice(roleError?.message ?? "Administrator access required.");
      setLoading(false);
      return;
    }

    setRole("admin");

    const [prospectResult, contactResult, runResult] = await Promise.all([
      supabase
        .from("websites_company_prospects")
        .select("id,company_name,slug,website_url,country,city,industry,company_summary,business_quality_score,website_opportunity_score,systems_potential_score,qualification_reason,website_audit,public_evidence,status,concept_status,concept_url,updated_at")
        .in("status", ["qualified", "concept_ready", "ready_to_send", "replied", "interested", "proposal", "won"])
        .order("website_opportunity_score", { ascending: false }),
      supabase
        .from("websites_company_contacts")
        .select("id,prospect_id,full_name,title,linkedin_url,priority,source_url,verification_notes")
        .order("priority", { ascending: true }),
      supabase
        .from("websites_company_concept_runs")
        .select("id,prospect_id,version,status,brief,concept_config,preview_url,requested_at,review_ready_at,reviewed_at,reviewer_note,updated_at")
        .order("created_at", { ascending: false }),
    ]);

    const firstError = prospectResult.error || contactResult.error || runResult.error;
    if (firstError) {
      setNotice(firstError.message);
      setLoading(false);
      return;
    }

    const nextProspects = (prospectResult.data ?? []) as Prospect[];
    setProspects(nextProspects);
    setContacts((contactResult.data ?? []) as Contact[]);
    setRuns((runResult.data ?? []) as ConceptRun[]);
    setSelectedId((current) => current && nextProspects.some((p) => p.id === current)
      ? current
      : (nextProspects.find((p) => p.concept_status === "review")?.id
        ?? nextProspects.find((p) => p.concept_status === "brief_ready")?.id
        ?? nextProspects[0]?.id
        ?? ""));
    setLoading(false);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
      if (data.session) void load(data.session);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setAuthReady(true);
      if (next) void load(next);
    });
    return () => subscription.unsubscribe();
  }, [load]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return prospects.filter((p) => !q || [p.company_name, p.industry, p.city, p.country, p.concept_status]
      .filter(Boolean).join(" ").toLowerCase().includes(q));
  }, [prospects, search]);

  const selected = prospects.find((p) => p.id === selectedId) ?? null;
  const selectedContacts = contacts.filter((c) => c.prospect_id === selectedId);
  const selectedRuns = runs.filter((r) => r.prospect_id === selectedId).sort((a, b) => b.version - a.version);
  const currentRun = selectedRuns[0] ?? null;
  const audit = asObject(selected?.website_audit);

  const metrics = useMemo(() => ({
    brief: prospects.filter((p) => p.concept_status === "brief_ready").length,
    requested: runs.filter((r) => r.status === "requested").length,
    building: runs.filter((r) => r.status === "building").length,
    review: runs.filter((r) => r.status === "review").length,
    approved: runs.filter((r) => r.status === "approved").length,
  }), [prospects, runs]);

  const requestConcept = async () => {
    if (!selected || !session) return;
    setActing(true);
    setNotice("");
    const { error } = await supabase.rpc("websites_company_admin_request_concept", { p_prospect_id: selected.id });
    if (error) setNotice(error.message);
    else setNotice(`Concept build requested for ${selected.company_name}.`);
    await load(session);
    setActing(false);
  };

  const reviewConcept = async (decision: "approve" | "return" | "block") => {
    if (!currentRun || !session) return;
    setActing(true);
    setNotice("");
    const { error } = await supabase.rpc("websites_company_admin_review_concept", {
      p_run_id: currentRun.id,
      p_decision: decision,
      p_note: reviewNote.trim() || null,
    });
    if (error) setNotice(error.message);
    else {
      setNotice(decision === "approve" ? "Concept approved. Outreach is still locked until the separate outreach gate." : `Concept ${decision === "return" ? "returned for revision" : "blocked"}.`);
      setReviewNote("");
    }
    await load(session);
    setActing(false);
  };

  if (!authReady) return <main className={styles.page}><div className={styles.center}>Preparing Concept Review…</div></main>;
  if (!session) return <main className={styles.page}><div className={styles.center}><h1>Administrator sign-in required.</h1><Link href="/admin">Go to admin →</Link></div></main>;
  if (role !== "admin") return <main className={styles.page}><div className={styles.center}><h1>Administrator permission required.</h1><p>{notice}</p></div></main>;

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.topbar}>
          <div><Link href="/admin/websites" className={styles.wordmark}><span>Lab</span>Narrative</Link><b>WEBSITES · CONCEPT REVIEW</b></div>
          <div className={styles.topActions}><Link href="/admin/websites">Company pipeline</Link><button onClick={() => void load(session)} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</button></div>
        </header>

        <section className={styles.hero}>
          <div><p>CONCEPT + REVIEW</p><h1>Build less. <em>Review better.</em></h1></div>
          <p className={styles.heroCopy}>Qualified companies enter a focused concept brief. Production only starts after you press Build Concept, and outreach remains locked even after concept approval.</p>
        </section>

        <section className={styles.metrics}>
          <article><span>Brief ready</span><strong>{metrics.brief}</strong></article>
          <article><span>Requested</span><strong>{metrics.requested}</strong></article>
          <article><span>Building</span><strong>{metrics.building}</strong></article>
          <article><span>Awaiting review</span><strong>{metrics.review}</strong></article>
          <article><span>Approved</span><strong>{metrics.approved}</strong></article>
        </section>

        {notice ? <div className={styles.notice}>{notice}</div> : null}

        <section className={styles.workspace}>
          <aside className={styles.rail}>
            <div className={styles.railHead}><div><span>Qualified companies</span><strong>{prospects.length}</strong></div><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" /></div>
            <div className={styles.companyList}>
              {visible.map((p) => <button key={p.id} onClick={() => { setSelectedId(p.id); setReviewNote(""); }} className={p.id === selectedId ? styles.activeCompany : ""}>
                <span><strong>{p.company_name}</strong><b>{p.website_opportunity_score}</b></span>
                <small>{titleCase(p.concept_status)} · Business {p.business_quality_score}</small>
              </button>)}
              {visible.length === 0 ? <div className={styles.railEmpty}>The discovery worker has not qualified a company yet.</div> : null}
            </div>
          </aside>

          <section className={styles.detail}>
            {!selected ? (
              <div className={styles.emptyDetail}><span>READY FOR FIRST QUALIFIED COMPANY</span><h2>The review system is live.</h2><p>When Discovery qualifies the first company, its audit, contacts and Build Concept control will appear here automatically.</p></div>
            ) : (
              <>
                <div className={styles.companyHead}>
                  <div><p>{selected.industry || "B2B company"}</p><h2>{selected.company_name}</h2><span>{[selected.city, selected.country].filter(Boolean).join(" · ")}</span></div>
                  <div className={styles.scoreStack}><span>Website opportunity <b>{selected.website_opportunity_score}</b></span><span>Business quality <b>{selected.business_quality_score}</b></span><span>Systems signal <b>{selected.systems_potential_score}</b></span></div>
                </div>

                <div className={styles.actionBar}>
                  <div><span>Concept state</span><strong>{titleCase(selected.concept_status)}</strong><small>Updated {dateLabel(selected.updated_at)}</small></div>
                  {(["brief_ready", "revision_requested", "blocked"].includes(selected.concept_status)) ? <button className={styles.primary} onClick={() => void requestConcept()} disabled={acting}>{acting ? "Working…" : currentRun?.status === "returned" ? "Build Revision" : "Build Concept"}</button> : null}
                  {currentRun?.status === "requested" ? <span className={styles.locked}>Requested · waiting for production</span> : null}
                  {currentRun?.status === "building" ? <span className={styles.locked}>Concept is being built</span> : null}
                  {currentRun?.status === "approved" ? <span className={styles.approved}>Approved · outreach still locked</span> : null}
                </div>

                <div className={styles.gridTwo}>
                  <article className={styles.panel}>
                    <span className={styles.kicker}>WHY THIS COMPANY</span>
                    <h3>{selected.qualification_reason || "Qualified Website opportunity"}</h3>
                    <p>{selected.company_summary || "Company summary will appear from verified public research."}</p>
                    {selected.website_url ? <a href={selected.website_url} target="_blank" rel="noreferrer">Open current website ↗</a> : null}
                  </article>
                  <article className={styles.panel}>
                    <span className={styles.kicker}>CONCEPT FOCUS</span>
                    <h3>{asString(audit.recommended_concept_focus) || "Focused commercial transformation"}</h3>
                    <p>{asString(audit.current_state_summary) || "The concept brief will concentrate on the most commercially visible website weaknesses."}</p>
                  </article>
                </div>

                <article className={styles.panel}>
                  <span className={styles.kicker}>WEBSITE AUDIT</span>
                  <div className={styles.auditGrid}>
                    <div><b>Weaknesses</b>{asStringList(audit.weaknesses).length ? asStringList(audit.weaknesses).map((item) => <p key={item}>— {item}</p>) : <p>— Awaiting structured audit details</p>}</div>
                    <div><b>Missed opportunities</b>{asStringList(audit.missed_business_opportunities).length ? asStringList(audit.missed_business_opportunities).map((item) => <p key={item}>— {item}</p>) : <p>— Awaiting structured audit details</p>}</div>
                    <div><b>Suggested pages / flows</b>{asStringList(audit.suggested_pages_or_flows).length ? asStringList(audit.suggested_pages_or_flows).map((item) => <p key={item}>— {item}</p>) : <p>— Homepage<br/>— Products / services<br/>— RFQ / enquiry</p>}</div>
                  </div>
                </article>

                <article className={styles.panel}>
                  <span className={styles.kicker}>DECISION-MAKERS</span>
                  <div className={styles.contacts}>
                    {selectedContacts.length ? selectedContacts.map((contact) => <div key={contact.id}><span><strong>{contact.full_name}</strong><small>{contact.title || "Decision-maker"}</small></span><b>P{contact.priority}</b>{contact.linkedin_url ? <a href={contact.linkedin_url} target="_blank" rel="noreferrer">LinkedIn ↗</a> : null}</div>) : <p>No verified decision-makers stored yet.</p>}
                  </div>
                </article>

                {currentRun ? <article className={styles.panel}>
                  <div className={styles.runHead}><div><span className={styles.kicker}>CONCEPT RUN</span><h3>Version {currentRun.version} · {titleCase(currentRun.status)}</h3></div><small>{dateLabel(currentRun.review_ready_at || currentRun.requested_at)}</small></div>
                  <div className={styles.runPolicy}><span>Focused preview</span><span>Max 3 primary flows</span><span>No invented company facts</span><span>Human review required</span></div>
                  {currentRun.preview_url ? <a className={styles.previewButton} href={currentRun.preview_url} target="_blank" rel="noreferrer">Open concept preview ↗</a> : <p className={styles.waiting}>The producer will attach a preview URL here when the concept is ready.</p>}
                  {currentRun.status === "review" ? <div className={styles.reviewBox}>
                    <label>Reviewer note<textarea value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} placeholder="Optional approval note, revision request, or block reason…" /></label>
                    <div><button className={styles.approveButton} onClick={() => void reviewConcept("approve")} disabled={acting}>Approve Concept</button><button onClick={() => void reviewConcept("return")} disabled={acting}>Return for Revision</button><button className={styles.dangerButton} onClick={() => void reviewConcept("block")} disabled={acting}>Block</button></div>
                    <p>Approval moves the company to <b>Concept Ready</b>. It does not prepare or send outreach.</p>
                  </div> : null}
                  {currentRun.reviewer_note ? <blockquote>{currentRun.reviewer_note}</blockquote> : null}
                </article> : null}

                {selectedRuns.length > 1 ? <article className={styles.panel}><span className={styles.kicker}>VERSION HISTORY</span><div className={styles.history}>{selectedRuns.map((run) => <div key={run.id}><strong>v{run.version}</strong><span>{titleCase(run.status)}</span><small>{dateLabel(run.updated_at)}</small></div>)}</div></article> : null}
              </>
            )}
          </section>
        </section>
      </div>
    </main>
  );
}
