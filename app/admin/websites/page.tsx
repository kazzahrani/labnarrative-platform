"use client";

import { createClient, type Session } from "@supabase/supabase-js";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./websites-company.module.css";

type Campaign = {
  id: string;
  name: string;
  is_active: boolean;
  geography: string[];
  verticals: string[];
  ready_buffer_target: number;
  qualification_score_threshold: number;
};

type Prospect = {
  id: string;
  company_name: string;
  slug: string;
  normalized_domain: string | null;
  country: string | null;
  city: string | null;
  industry: string | null;
  business_quality_score: number;
  website_opportunity_score: number;
  systems_potential_score: number;
  status: string;
  concept_status: string;
  updated_at: string;
};

type ContactRow = {
  prospect_id: string;
  is_current_verified: boolean;
  linkedin_url: string | null;
  linkedin_request_sent_at: string | null;
  linkedin_connected_at: string | null;
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
);

const pipeline = [
  ["01", "Discover", "Find commercially strong B2B companies whose current website undersells the real business."],
  ["02", "Qualify", "Require strong business quality, real website opportunity and a clear Systems cross-business guard."],
  ["03", "Decision-makers", "Verify roughly 2–3 relevant LinkedIn people and prepare personalized EN + AR connection notes."],
  ["04", "Connect", "Contact all selected decision-makers at the company in one manual LinkedIn sending session."],
  ["05", "Concept", "Only after at least one person connects, unlock a focused visual concept and human review."],
  ["06", "Sales", "Use the approved concept in the warm conversation, then move toward meeting, proposal and client."],
] as const;

function Wordmark() { return <><span>Lab</span>Narrative</>; }

export default function WebsitesCompanyHome() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [role, setRole] = useState<string | null>(null);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [systemsProtected, setSystemsProtected] = useState(0);
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (activeSession: Session) => {
    setLoading(true);
    setNotice("");
    const { data: roleRow, error: roleError } = await supabase.from("user_roles").select("role").eq("user_id", activeSession.user.id).maybeSingle();
    if (roleError || roleRow?.role !== "admin") {
      setRole(roleRow?.role ?? null);
      setNotice(roleError?.message ?? "Administrator access required.");
      setLoading(false);
      return;
    }
    setRole("admin");

    const [campaignResult, prospectResult, contactResult, guardResult] = await Promise.all([
      supabase.from("websites_company_campaigns").select("id,name,is_active,geography,verticals,ready_buffer_target,qualification_score_threshold").eq("name", "LabNarrative Websites — Saudi/GCC B2B Acquisition").maybeSingle(),
      supabase.from("websites_company_prospects").select("id,company_name,slug,normalized_domain,country,city,industry,business_quality_score,website_opportunity_score,systems_potential_score,status,concept_status,updated_at").order("updated_at", { ascending: false }),
      supabase.from("websites_company_contacts").select("prospect_id,is_current_verified,linkedin_url,linkedin_request_sent_at,linkedin_connected_at"),
      supabase.from("company_outreach_guard").select("source_id").eq("business", "systems"),
    ]);
    const firstError = campaignResult.error || prospectResult.error || contactResult.error || guardResult.error;
    if (firstError) {
      setNotice(firstError.message);
      setLoading(false);
      return;
    }
    setCampaign((campaignResult.data ?? null) as Campaign | null);
    setProspects((prospectResult.data ?? []) as Prospect[]);
    setContacts((contactResult.data ?? []) as ContactRow[]);
    setSystemsProtected((guardResult.data ?? []).length);
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

  const contactStats = useMemo(() => {
    const map = new Map<string, { total: number; sent: number; connected: number }>();
    contacts.filter((c) => c.is_current_verified && Boolean(c.linkedin_url)).forEach((c) => {
      const row = map.get(c.prospect_id) ?? { total: 0, sent: 0, connected: 0 };
      row.total += 1;
      if (c.linkedin_request_sent_at) row.sent += 1;
      if (c.linkedin_connected_at) row.connected += 1;
      map.set(c.prospect_id, row);
    });
    return map;
  }, [contacts]);

  const metrics = useMemo(() => ({
    total: prospects.length,
    ready: prospects.filter((p) => p.status === "ready_for_connection").length,
    sent: prospects.filter((p) => p.status === "connection_sent").length,
    connected: prospects.filter((p) => ["connected", "concept_ready"].includes(p.status)).length,
    concepts: prospects.filter((p) => ["requested", "building", "review", "approved", "revision_requested"].includes(p.concept_status)).length,
    won: prospects.filter((p) => p.status === "won").length,
  }), [prospects]);

  const visibleProspects = useMemo(() => {
    const query = search.trim().toLowerCase();
    return prospects.filter((p) => !query || [p.company_name,p.industry,p.city,p.country,p.normalized_domain,p.status].filter(Boolean).join(" ").toLowerCase().includes(query)).slice(0,60);
  }, [prospects, search]);

  if (!authReady) return <main className={styles.page}><div className={styles.center}>Preparing LabNarrative Websites…</div></main>;
  if (!session) return <main className={styles.page}><div className={styles.center}><h1>Administrator sign-in required.</h1><Link href="/admin">Go to admin →</Link></div></main>;
  if (role !== "admin") return <main className={styles.page}><div className={styles.center}><h1>Administrator permission required.</h1><p>{notice}</p></div></main>;

  return <main className={styles.page}><div className={styles.shell}>
    <header className={styles.topbar}>
      <Link href="/admin" className={styles.wordmark}><Wordmark /></Link><span className={styles.branch}>WEBSITES</span>
      <div className={styles.topActions}><Link href="/admin/websites/concepts" className={styles.secondaryLink}>Connections + Concepts</Link><Link href="/admin/websites/sites" className={styles.secondaryLink}>Legacy PI archive</Link><button onClick={() => void load(session)} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</button></div>
    </header>

    <section className={styles.hero}>
      <div><p className={styles.eyebrow}>LabNarrative Websites · Company Acquisition</p><h1>Connect first. <em>Build second.</em></h1></div>
      <div className={styles.heroAside}><p>We now spend concept-production effort only after a real LinkedIn connection. Every selected decision-maker at a company is prepared together with English and Arabic notes for one easy manual sending session.</p><div className={styles.guardBadge}><span>Cross-business guard</span><strong>{systemsProtected} Systems companies protected</strong></div></div>
    </section>

    <section className={styles.metrics}>
      <article><span>Companies</span><strong>{metrics.total}</strong><small>new Websites pipeline</small></article>
      <article><span>Ready to connect</span><strong>{metrics.ready}</strong><small>EN + AR prepared</small></article>
      <article><span>Batch sent</span><strong>{metrics.sent}</strong><small>waiting for acceptance</small></article>
      <article><span>Connected</span><strong>{metrics.connected}</strong><small>concept eligible</small></article>
      <article><span>Concepts</span><strong>{metrics.concepts}</strong><small>requested / review / approved</small></article>
      <article><span>Won</span><strong>{metrics.won}</strong><small>website clients</small></article>
    </section>

    {notice ? <div className={styles.notice}>{notice}</div> : null}

    <section className={styles.strategyGrid}>
      <article className={styles.strategyCard}><div className={styles.cardKicker}>CURRENT CAMPAIGN</div><h2>{campaign?.name ?? "Company Websites acquisition"}</h2><p>The worker discovers and audits strong businesses, then stops before outreach. You remain the sending gate.</p><div className={styles.ruleRow}><span>Status</span><strong>{campaign?.is_active ? "Active" : "Paused"}</strong></div><div className={styles.ruleRow}><span>Qualification gate</span><strong>{campaign?.qualification_score_threshold ?? 75}+</strong></div><div className={styles.ruleRow}><span>Company buffer</span><strong>{metrics.ready + metrics.sent + metrics.connected} / {campaign?.ready_buffer_target ?? 20}</strong></div></article>
      <article className={styles.strategyCard}><div className={styles.cardKicker}>BATCH CONNECTION POLICY</div><h2>All decision-makers together.</h2><p>For operational ease, the platform groups every verified decision-maker at the same company into one sending session.</p><div className={styles.guardLine}><span className={styles.dot}/>Approximately 2–3 verified people</div><div className={styles.guardLine}><span className={styles.dot}/>English + Arabic connection notes</div><div className={styles.guardLine}><span className={styles.dot}/>One company-level “Mark all sent” action</div></article>
      <article className={styles.strategyCard}><div className={styles.cardKicker}>CONCEPT GATE</div><h2>No connection, no concept.</h2><p>The database itself blocks concept production until at least one verified decision-maker is marked Connected.</p><div className={styles.guardLine}><span className={styles.dot}/>No speculative mass production</div><div className={styles.guardLine}><span className={styles.dot}/>Connection unlocks Build Concept</div><div className={styles.guardLine}><span className={styles.dot}/>No automatic LinkedIn or email sending</div></article>
    </section>

    <section className={styles.pipelineSection}><div className={styles.sectionHead}><div><p className={styles.eyebrow}>OPERATING MODEL</p><h2>Engagement before production.</h2></div><p>The expensive creative step now happens only after the prospect shows a minimum real-world signal: a LinkedIn connection.</p></div><div className={styles.pipeline}>{pipeline.map(([n,t,d]) => <article key={n}><span>{n}</span><h3>{t}</h3><p>{d}</p></article>)}</div></section>

    <section className={styles.prospectSection}>
      <div className={styles.sectionHead}><div><p className={styles.eyebrow}>COMPANY PIPELINE</p><h2>Website opportunities.</h2></div><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search company, industry or city…" aria-label="Search Website prospects" /></div>
      {prospects.length === 0 ? <div className={styles.emptyState}><div><span>DISCOVERY ACTIVE</span><h3>Waiting for the first company batch.</h3><p>Qualified companies will arrive with their website audit, verified LinkedIn decision-makers, and bilingual connection notes already prepared.</p></div><div className={styles.emptyChecklist}><p><b>01</b> Strong company + weak website</p><p><b>02</b> Systems guard checked</p><p><b>03</b> 2–3 decision-makers researched</p><p><b>04</b> EN + AR notes prepared</p><p><b>05</b> You send all requests together</p></div></div> : <div className={styles.tableWrap}><table><thead><tr><th>Company</th><th>Website</th><th>Business</th><th>Contacts</th><th>Sent</th><th>Connected</th><th>Stage</th><th>Operate</th></tr></thead><tbody>{visibleProspects.map((p) => { const s=contactStats.get(p.id) ?? {total:0,sent:0,connected:0}; return <tr key={p.id}><td><strong>{p.company_name}</strong><small>{[p.industry,p.city,p.country].filter(Boolean).join(" · ") || "B2B company"}</small></td><td><b>{p.website_opportunity_score}</b><small>opportunity</small></td><td><b>{p.business_quality_score}</b><small>quality</small></td><td><b>{s.total}</b><small>decision-makers</small></td><td><b>{s.sent}</b><small>requests</small></td><td><b>{s.connected}</b><small>accepted</small></td><td><span className={styles.stage}>{p.status.replaceAll("_"," ")}</span></td><td><Link href={`/admin/websites/concepts?prospect=${p.id}`} className={styles.stage}>Open →</Link></td></tr>; })}</tbody></table></div>}
    </section>

    <section className={styles.legacyStrip}><div><span>CONNECTIONS + CONCEPTS</span><h3>Your daily Websites operating workspace.</h3><p>Copy EN/AR notes, open all decision-makers, mark the company batch sent, track who connects, then unlock concept production.</p></div><Link href="/admin/websites/concepts">Open workspace →</Link></section>
    <section className={styles.legacyStrip}><div><span>LEGACY WEBSITES</span><h3>PI concepts and historical scientific website data are preserved.</h3><p>They remain available for existing client operations but are no longer the active acquisition engine.</p></div><Link href="/admin/websites/sites">Open legacy PI archive →</Link></section>
    <footer className={styles.footer}><Link href="/admin" className={styles.wordmark}><Wordmark /></Link><span>Websites · Connection-first B2B acquisition</span></footer>
  </div></main>;
}
