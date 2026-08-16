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
  daily_ready_target: number;
  qualification_score_threshold: number;
};

type Prospect = {
  id: string;
  company_name: string;
  slug: string;
  website_url: string | null;
  normalized_domain: string | null;
  country: string | null;
  city: string | null;
  industry: string | null;
  business_quality_score: number;
  website_opportunity_score: number;
  systems_potential_score: number;
  qualification_reason: string | null;
  status: string;
  concept_status: string;
  concept_url: string | null;
  contacted_at: string | null;
  replied_at: string | null;
  updated_at: string;
};

type ContactRow = { prospect_id: string };
type GuardRow = { business: string; source_id: string; status: string };

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const pipeline = [
  ["01", "Discover", "Strong B2B companies whose current website undersells the real business."],
  ["02", "Qualify", "Score business quality, website opportunity, reachability and commercial value."],
  ["03", "Audit", "Document concrete weaknesses, missed conversion paths and high-value improvements."],
  ["04", "Concept", "Build a focused visual preview only for the strongest qualified opportunities."],
  ["05", "Outreach", "Separate Websites messaging, contacts and human-gated LinkedIn/email activity."],
  ["06", "Sales", "Replies, meetings, proposals, wins and later cross-sell opportunities."],
] as const;

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

function Wordmark() {
  return <><span>Lab</span>Narrative</>;
}

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

    const [campaignResult, prospectResult, contactResult, guardResult] = await Promise.all([
      supabase
        .from("websites_company_campaigns")
        .select("id,name,is_active,geography,verticals,ready_buffer_target,daily_ready_target,qualification_score_threshold")
        .eq("name", "LabNarrative Websites — Saudi/GCC B2B Acquisition")
        .maybeSingle(),
      supabase
        .from("websites_company_prospects")
        .select("id,company_name,slug,website_url,normalized_domain,country,city,industry,business_quality_score,website_opportunity_score,systems_potential_score,qualification_reason,status,concept_status,concept_url,contacted_at,replied_at,updated_at")
        .order("updated_at", { ascending: false }),
      supabase.from("websites_company_contacts").select("prospect_id"),
      supabase.from("company_outreach_guard").select("business,source_id,status").eq("business", "systems"),
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

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthReady(true);
      if (nextSession) void load(nextSession);
    });

    return () => subscription.unsubscribe();
  }, [load]);

  const metrics = useMemo(() => ({
    total: prospects.length,
    qualified: prospects.filter((p) => ["qualified", "concept_ready", "ready_to_send"].includes(p.status)).length,
    concepts: prospects.filter((p) => ["ready", "building", "brief_ready"].includes(p.concept_status)).length,
    ready: prospects.filter((p) => p.status === "ready_to_send").length,
    conversations: prospects.filter((p) => ["replied", "interested", "proposal", "won"].includes(p.status)).length,
    won: prospects.filter((p) => p.status === "won").length,
  }), [prospects]);

  const visibleProspects = useMemo(() => {
    const query = search.trim().toLowerCase();
    return prospects
      .filter((prospect) => !query || [
        prospect.company_name,
        prospect.industry,
        prospect.city,
        prospect.country,
        prospect.normalized_domain,
        prospect.status,
      ].filter(Boolean).join(" ").toLowerCase().includes(query))
      .slice(0, 60);
  }, [prospects, search]);

  const contactCounts = useMemo(() => {
    const counts = new Map<string, number>();
    contacts.forEach((contact) => counts.set(contact.prospect_id, (counts.get(contact.prospect_id) ?? 0) + 1));
    return counts;
  }, [contacts]);

  if (!authReady) {
    return <main className={styles.page}><div className={styles.center}>Preparing LabNarrative Websites…</div></main>;
  }

  if (!session) {
    return <main className={styles.page}><div className={styles.center}><h1>Administrator sign-in required.</h1><Link href="/admin">Go to admin →</Link></div></main>;
  }

  if (role !== "admin") {
    return <main className={styles.page}><div className={styles.center}><h1>Administrator permission required.</h1><p>{notice}</p></div></main>;
  }

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.topbar}>
          <Link href="/admin" className={styles.wordmark}><Wordmark /></Link>
          <span className={styles.branch}>WEBSITES</span>
          <div className={styles.topActions}>
            <Link href="/admin/websites/sites" className={styles.secondaryLink}>Legacy PI archive</Link>
            <button onClick={() => session && void load(session)} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</button>
          </div>
        </header>

        <section className={styles.hero}>
          <div>
            <p className={styles.eyebrow}>LabNarrative Websites · Company Acquisition</p>
            <h1>Find strong businesses with <em>weak digital presence.</em></h1>
          </div>
          <div className={styles.heroAside}>
            <p>Websites is now an independent B2B acquisition business. It targets commercially valuable companies whose current website does not reflect the quality, scale or credibility of the real business.</p>
            <div className={styles.guardBadge}><span>Cross-business guard</span><strong>{systemsProtected} Systems companies protected</strong></div>
          </div>
        </section>

        <section className={styles.metrics}>
          <article><span>Companies</span><strong>{metrics.total}</strong><small>new Websites pipeline</small></article>
          <article><span>Qualified</span><strong>{metrics.qualified}</strong><small>strong opportunities</small></article>
          <article><span>Concepts</span><strong>{metrics.concepts}</strong><small>brief / build / ready</small></article>
          <article><span>Ready</span><strong>{metrics.ready}</strong><small>human outreach gate</small></article>
          <article><span>Conversations</span><strong>{metrics.conversations}</strong><small>reply or later</small></article>
          <article><span>Won</span><strong>{metrics.won}</strong><small>website clients</small></article>
        </section>

        {notice ? <div className={styles.notice}>{notice}</div> : null}

        <section className={styles.strategyGrid}>
          <article className={styles.strategyCard}>
            <div className={styles.cardKicker}>CURRENT CAMPAIGN</div>
            <h2>{campaign?.name ?? "Company Websites acquisition"}</h2>
            <p>The first offer stays purely Websites. Systems remains a separate acquisition business and is only coordinated through the internal company guard.</p>
            <div className={styles.ruleRow}><span>Status</span><strong>{campaign?.is_active ? "Active foundation" : "Paused"}</strong></div>
            <div className={styles.ruleRow}><span>Qualification gate</span><strong>{campaign?.qualification_score_threshold ?? 75}+</strong></div>
            <div className={styles.ruleRow}><span>Ready buffer</span><strong>{metrics.ready} / {campaign?.ready_buffer_target ?? 20}</strong></div>
          </article>

          <article className={styles.strategyCard}>
            <div className={styles.cardKicker}>TARGET PROFILE</div>
            <h2>Good business. Bad website.</h2>
            <p>Website quality alone is not enough. We prioritize businesses with meaningful products, customers, commercial credibility and the ability to pay for a high-quality transformation.</p>
            <div className={styles.tagWrap}>
              {(campaign?.verticals ?? ["Medical & laboratory suppliers", "Scientific distributors", "Industrial suppliers", "Manufacturing"]).map((vertical) => <span key={vertical}>{vertical}</span>)}
            </div>
          </article>

          <article className={styles.strategyCard}>
            <div className={styles.cardKicker}>NON-INTERFERENCE RULE</div>
            <h2>One company, one cold approach.</h2>
            <p>If Systems is already working a company, Websites must not independently cold-contact it. Cross-sell happens only after a real relationship exists.</p>
            <div className={styles.guardLine}><span className={styles.dot} />Systems outreach remains untouched</div>
            <div className={styles.guardLine}><span className={styles.dot} />Websites has separate contacts and copy</div>
            <div className={styles.guardLine}><span className={styles.dot} />No dual demo links in cold outreach</div>
          </article>
        </section>

        <section className={styles.pipelineSection}>
          <div className={styles.sectionHead}>
            <div><p className={styles.eyebrow}>OPERATING MODEL</p><h2>Sales first. Production second.</h2></div>
            <p>We no longer measure success by how many complete concepts are manufactured. The funnel is built around qualified opportunities, conversations and customers.</p>
          </div>
          <div className={styles.pipeline}>
            {pipeline.map(([number, title, description]) => (
              <article key={number}>
                <span>{number}</span>
                <h3>{title}</h3>
                <p>{description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.prospectSection}>
          <div className={styles.sectionHead}>
            <div><p className={styles.eyebrow}>COMPANY PIPELINE</p><h2>Website opportunities.</h2></div>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search company, industry or city…" aria-label="Search Website prospects" />
          </div>

          {prospects.length === 0 ? (
            <div className={styles.emptyState}>
              <div><span>NEW FOUNDATION READY</span><h3>No company prospects have been added yet.</h3><p>The old PI production engine is frozen. The next step is to connect a dedicated company-discovery worker to this clean Websites pipeline without touching Systems acquisition.</p></div>
              <div className={styles.emptyChecklist}>
                <p><b>01</b> Discover commercially strong companies</p>
                <p><b>02</b> Check the Systems guard before admission</p>
                <p><b>03</b> Audit and score the current website</p>
                <p><b>04</b> Find 2–3 decision-makers</p>
                <p><b>05</b> Build only the strongest concepts</p>
              </div>
            </div>
          ) : (
            <div className={styles.tableWrap}>
              <table>
                <thead><tr><th>Company</th><th>Website</th><th>Business</th><th>Systems</th><th>Contacts</th><th>Stage</th><th>Updated</th></tr></thead>
                <tbody>
                  {visibleProspects.map((prospect) => (
                    <tr key={prospect.id}>
                      <td><strong>{prospect.company_name}</strong><small>{[prospect.industry, prospect.city, prospect.country].filter(Boolean).join(" · ") || "B2B company"}</small></td>
                      <td><b>{prospect.website_opportunity_score}</b><small>{prospect.concept_status.replaceAll("_", " ")}</small></td>
                      <td><b>{prospect.business_quality_score}</b><small>quality score</small></td>
                      <td><b>{prospect.systems_potential_score}</b><small>internal signal only</small></td>
                      <td><b>{contactCounts.get(prospect.id) ?? 0}</b><small>decision-makers</small></td>
                      <td><span className={styles.stage}>{prospect.status.replaceAll("_", " ")}</span></td>
                      <td><small>{dateLabel(prospect.updated_at)}</small></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className={styles.legacyStrip}>
          <div><span>LEGACY WEBSITES</span><h3>PI concepts and historical scientific website data are preserved — not deleted.</h3><p>They remain available for reference and existing client operations, but they are no longer the active acquisition engine.</p></div>
          <Link href="/admin/websites/sites">Open legacy PI archive →</Link>
        </section>

        <footer className={styles.footer}>
          <Link href="/admin" className={styles.wordmark}><Wordmark /></Link>
          <span>Websites · Independent B2B acquisition</span>
        </footer>
      </div>
    </main>
  );
}
