"use client";

import { createClient, type Session } from "@supabase/supabase-js";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import SalesDailyActionQueue from "../../../components/SalesDailyActionQueue";
import styles from "./sales-dashboard.module.css";

type SummaryRow = {
  site_id: string;
  slug: string;
  site_status: "draft" | "concept" | "live";
  outreach_status: string;
  pi_name: string;
  institution: string;
  page_views: number | string;
  visits: number | string;
  cta_clicks: number | string;
  first_viewed_at: string | null;
  last_viewed_at: string | null;
};

type DraftSiteRow = {
  id: string;
  slug: string;
  status: "draft";
  outreach_status: string;
  content: {
    piName?: string;
    institution?: string;
  } | null;
};

type ProspectRow = {
  id: string;
  site_id: string | null;
  pi_name: string;
  institution: string;
  email: string;
  status: string;
  qualification_score: number;
};

type SalesRow = SummaryRow & {
  prospect?: ProspectRow;
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);
const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "labnarrative.com";
const INTERNAL_DEVICE_COOKIE = "labnarrative_internal_device";
const INTERNAL_DEVICE_MAX_AGE = 60 * 60 * 24 * 365;

const REPLIED_STAGES = new Set([
  "replied",
  "interested",
  "meeting_scheduled",
  "proposal_sent",
  "client",
]);
const INTERESTED_STAGES = new Set([
  "interested",
  "meeting_scheduled",
  "proposal_sent",
  "client",
]);

function numberValue(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Riyadh",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

function stageLabel(value: string): string {
  if (!value) return "Not contacted";
  return value
    .replace(/^email_(\d+)_sent$/i, (_match, number) => `Email ${number} sent`)
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function stageIsHot(value: string, visits: number): boolean {
  return REPLIED_STAGES.has(value) || visits >= 2;
}

function stagePriority(value: string): number {
  if (value === "client") return 5;
  if (value === "proposal_sent") return 4;
  if (value === "meeting_scheduled") return 3;
  if (value === "interested") return 2;
  if (value === "replied") return 1;
  return 0;
}

function hasInternalDeviceCookie(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie
    .split(";")
    .some((entry) => entry.trim() === `${INTERNAL_DEVICE_COOKIE}=1`);
}

function setInternalDeviceCookie(excluded: boolean) {
  if (typeof window === "undefined") return;

  const host = window.location.hostname.toLowerCase();
  const domain = host === rootDomain || host.endsWith(`.${rootDomain}`)
    ? `; Domain=.${rootDomain}`
    : "";
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  const maxAge = excluded ? INTERNAL_DEVICE_MAX_AGE : 0;
  const value = excluded ? "1" : "";

  document.cookie = `${INTERNAL_DEVICE_COOKIE}=${value}; Path=/; Max-Age=${maxAge}; SameSite=Lax${domain}${secure}`;
}

async function fetchAllProspects(): Promise<ProspectRow[]> {
  const pageSize = 1000;
  const rows: ProspectRow[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("prospects")
      .select("id,site_id,pi_name,institution,email,status,qualification_score")
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) throw error;
    const page = (data ?? []) as ProspectRow[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }

  return rows;
}

export default function SalesDashboardPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [summaries, setSummaries] = useState<SummaryRow[]>([]);
  const [prospects, setProspects] = useState<ProspectRow[]>([]);
  const [sentCount, setSentCount] = useState(0);
  const [search, setSearch] = useState("");
  const [deviceExcluded, setDeviceExcluded] = useState(false);
  const [deviceStatusReady, setDeviceStatusReady] = useState(false);

  const loadSales = useCallback(async (activeSession: Session) => {
    setLoading(true);
    setNotice("");

    const { data: roleRow, error: roleError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", activeSession.user.id)
      .maybeSingle();

    if (roleError) {
      setRole(null);
      setNotice(roleError.message);
      setLoading(false);
      return;
    }

    if (roleRow?.role !== "admin") {
      setRole(roleRow?.role ?? null);
      setNotice("This account does not have LabNarrative administrator access.");
      setLoading(false);
      return;
    }

    setRole("admin");

    try {
      const [summaryResult, draftResult, prospectRows, sentResult] = await Promise.all([
        supabase
          .from("sales_concept_summary")
          .select("site_id,slug,site_status,outreach_status,pi_name,institution,page_views,visits,cta_clicks,first_viewed_at,last_viewed_at"),
        supabase
          .from("sites")
          .select("id,slug,status,outreach_status,content")
          .eq("status", "draft")
          .in("outreach_status", Array.from(REPLIED_STAGES)),
        fetchAllProspects(),
        supabase
          .from("outreach_messages")
          .select("id", { count: "exact", head: true })
          .eq("message_kind", "initial")
          .eq("is_test", false)
          .eq("status", "sent"),
      ]);

      if (summaryResult.error) throw summaryResult.error;
      if (draftResult.error) throw draftResult.error;
      if (sentResult.error) throw sentResult.error;

      const engagedDrafts: SummaryRow[] = ((draftResult.data ?? []) as DraftSiteRow[]).map((site) => ({
        site_id: site.id,
        slug: site.slug,
        site_status: "draft",
        outreach_status: site.outreach_status,
        pi_name: site.content?.piName || site.slug,
        institution: site.content?.institution || "",
        page_views: 0,
        visits: 0,
        cta_clicks: 0,
        first_viewed_at: null,
        last_viewed_at: null,
      }));

      setSummaries([
        ...((summaryResult.data ?? []) as SummaryRow[]),
        ...engagedDrafts,
      ]);
      setProspects(prospectRows);
      setSentCount(sentResult.count ?? 0);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to load sales data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setDeviceExcluded(hasInternalDeviceCookie());
    setDeviceStatusReady(true);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
      if (data.session) void loadSales(data.session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthReady(true);
      if (nextSession) {
        void loadSales(nextSession);
      } else {
        setRole(null);
        setSummaries([]);
        setProspects([]);
        setSentCount(0);
      }
    });

    return () => subscription.unsubscribe();
  }, [loadSales]);

  const toggleDeviceExclusion = useCallback(() => {
    const nextExcluded = !deviceExcluded;
    setInternalDeviceCookie(nextExcluded);
    setDeviceExcluded(hasInternalDeviceCookie());
  }, [deviceExcluded]);

  const prospectBySite = useMemo(() => {
    const map = new Map<string, ProspectRow>();
    for (const prospect of prospects) {
      if (prospect.site_id && !map.has(prospect.site_id)) map.set(prospect.site_id, prospect);
    }
    return map;
  }, [prospects]);

  const rows = useMemo<SalesRow[]>(() => summaries.map((summary) => ({
    ...summary,
    prospect: prospectBySite.get(summary.site_id),
  })), [prospectBySite, summaries]);

  const metrics = useMemo(() => {
    const concepts = rows.filter((row) => row.site_status === "concept").length;
    const viewed = rows.filter((row) => numberValue(row.visits) > 0).length;
    const visits = rows.reduce((total, row) => total + numberValue(row.visits), 0);
    const pageViews = rows.reduce((total, row) => total + numberValue(row.page_views), 0);
    const replied = rows.filter((row) => REPLIED_STAGES.has(row.outreach_status)).length;
    const interested = rows.filter((row) => INTERESTED_STAGES.has(row.outreach_status)).length;
    const clients = rows.filter((row) => row.site_status === "live" || row.outreach_status === "client").length;
    const denominator = sentCount || 0;
    const viewRate = denominator > 0 ? (viewed / denominator) * 100 : 0;

    return { concepts, viewed, visits, pageViews, replied, interested, clients, viewRate };
  }, [rows, sentCount]);

  const visibleRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = rows.filter((row) => {
      if (!query) return true;
      return [
        row.pi_name,
        row.institution,
        row.slug,
        row.outreach_status,
        row.prospect?.email ?? "",
      ].join(" ").toLowerCase().includes(query);
    });

    return [...filtered].sort((a, b) => {
      const stageDifference = stagePriority(b.outreach_status) - stagePriority(a.outreach_status);
      if (stageDifference !== 0) return stageDifference;

      const aLast = a.last_viewed_at ? Date.parse(a.last_viewed_at) : 0;
      const bLast = b.last_viewed_at ? Date.parse(b.last_viewed_at) : 0;
      if (bLast !== aLast) return bLast - aLast;

      const visitDifference = numberValue(b.visits) - numberValue(a.visits);
      if (visitDifference !== 0) return visitDifference;

      return (b.prospect?.qualification_score ?? 0) - (a.prospect?.qualification_score ?? 0);
    });
  }, [rows, search]);

  if (!authReady) {
    return (
      <main className={styles.page}>
        <section className={styles.authCard}>Preparing the secure sales dashboard…</section>
      </main>
    );
  }

  if (!session) {
    return (
      <main className={styles.page}>
        <section className={styles.authCard}>
          <div className={styles.brand}>LabNarrative</div>
          <p className={styles.kicker}>Sales dashboard</p>
          <h1>Administrator sign-in required.</h1>
          <p>Use the existing LabNarrative administrator sign-in, then return here to view campaign activity.</p>
          <Link href="/admin">Go to administrator sign-in →</Link>
        </section>
      </main>
    );
  }

  if (role !== "admin") {
    return (
      <main className={styles.page}>
        <section className={styles.authCard}>
          <div className={styles.brand}>LabNarrative</div>
          <p className={styles.kicker}>Access restricted</p>
          <h1>Administrator permission required.</h1>
          <p>{loading ? "Checking permission…" : notice}</p>
          <Link href="/admin">Return to administrator dashboard →</Link>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.topbar}>
          <div>
            <div className={styles.brand}>LabNarrative</div>
            <p className={styles.kicker}>Sales intelligence</p>
            <h1 className={styles.title}>See which concepts are turning into conversations.</h1>
            <p className={styles.subtitle}>
              Privacy-minimal concept analytics linked to the existing outreach pipeline. A visit is a short-lived browser session, not a persistent person profile.
            </p>
          </div>
          <div className={styles.actions}>
            <button
              type="button"
              className={deviceExcluded ? styles.deviceButtonActive : undefined}
              onClick={toggleDeviceExclusion}
              disabled={!deviceStatusReady}
              aria-pressed={deviceExcluded}
              title={deviceExcluded
                ? "This browser is excluded from concept analytics. Click to include it for testing."
                : "Exclude visits from this browser across all LabNarrative concept subdomains."}
            >
              {!deviceStatusReady
                ? "Checking device…"
                : deviceExcluded
                  ? "✓ Device excluded"
                  : "Exclude this device"}
            </button>
            <button type="button" onClick={() => void loadSales(session)} disabled={loading}>
              {loading ? "Refreshing…" : "Refresh"}
            </button>
            <Link href="/admin">Admin</Link>
            <Link href="/admin/sites">Websites</Link>
          </div>
        </header>

        <SalesDailyActionQueue />

        {notice && <p className={styles.notice}>{notice}</p>}

        <section className={styles.metrics} aria-label="Sales funnel summary">
          <article className={styles.metric}>
            <span>Initial emails sent</span>
            <strong>{sentCount}</strong>
            <small>Real outreach only; tests excluded.</small>
          </article>
          <article className={styles.metric}>
            <span>Concepts viewed</span>
            <strong>{metrics.viewed}</strong>
            <small>{metrics.viewRate.toFixed(1)}% of sent initial emails.</small>
          </article>
          <article className={styles.metric}>
            <span>Distinct visits</span>
            <strong>{metrics.visits}</strong>
            <small>{metrics.pageViews} total page views.</small>
          </article>
          <article className={styles.metric}>
            <span>Positive replies</span>
            <strong>{metrics.replied}</strong>
            <small>Reply stage or later.</small>
          </article>
          <article className={styles.metric}>
            <span>Interested</span>
            <strong>{metrics.interested}</strong>
            <small>Interest, meeting, proposal, or client.</small>
          </article>
          <article className={styles.metric}>
            <span>Clients</span>
            <strong>{metrics.clients}</strong>
            <small>{metrics.concepts} active concepts currently tracked.</small>
          </article>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <h2>Concept activity</h2>
              <p>Engaged leads appear first, followed by the most recently viewed concepts.</p>
            </div>
            <input
              className={styles.search}
              type="search"
              placeholder="Search PI, institution, email or slug…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Principal investigator</th>
                  <th>Concept</th>
                  <th>Outreach</th>
                  <th>Visits</th>
                  <th>Page views</th>
                  <th>First viewed</th>
                  <th>Last viewed</th>
                  <th>Score</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => {
                  const visits = numberValue(row.visits);
                  const stage = row.outreach_status || "not_contacted";
                  const isDraftLead = row.site_status === "draft";

                  return (
                    <tr key={row.site_id}>
                      <td className={styles.pi}>
                        <strong>{row.pi_name}</strong>
                        <small>{row.institution || row.prospect?.institution || "—"}</small>
                      </td>
                      <td>
                        {isDraftLead ? (
                          <span className={styles.muted}>Private draft · not tracked</span>
                        ) : (
                          <a
                            className={styles.conceptLink}
                            href={`https://${row.slug}.${rootDomain}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {row.slug}.{rootDomain} ↗
                          </a>
                        )}
                      </td>
                      <td>
                        <span className={`${styles.stage} ${stageIsHot(stage, visits) ? styles.hot : ""}`}>
                          {stageLabel(stage)}
                        </span>
                      </td>
                      <td className={styles.number}>{isDraftLead ? "—" : visits}</td>
                      <td className={styles.number}>{isDraftLead ? "—" : numberValue(row.page_views)}</td>
                      <td className={styles.muted}>{formatDateTime(row.first_viewed_at)}</td>
                      <td className={styles.muted}>{formatDateTime(row.last_viewed_at)}</td>
                      <td className={styles.number}>{row.prospect?.qualification_score ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {visibleRows.length === 0 && (
              <div className={styles.empty}>
                {search ? "No concepts match this search." : "No sales activity has been recorded yet."}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
