"use client";

import { createClient, type Session } from "@supabase/supabase-js";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./site-monitor.module.css";

type SiteStatus = "draft" | "concept" | "live" | "archived";
type SummaryFilter = "active" | SiteStatus;
type DomainStatus =
  | "not_connected"
  | "connecting"
  | "https_pending"
  | "live"
  | "error"
  | "legacy";

type SiteRow = {
  id: string;
  slug: string;
  status: SiteStatus;
  lab_name: string | null;
  pi_name: string | null;
  institution: string | null;
  headline: string | null;
  created_at: string;
  updated_at: string;
  domain_status: DomainStatus;
  domain_url: string | null;
  domain_error: string | null;
  design_key: string;
  design_settings: { variant?: string } | null;
  design_version: number;
  content_schema_version: number;
};

type SortKey =
  | "updated_desc"
  | "updated_asc"
  | "created_desc"
  | "created_asc"
  | "name_asc"
  | "name_desc"
  | "status_asc";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const statusOrder: Record<SiteStatus, number> = {
  draft: 1,
  concept: 2,
  live: 3,
  archived: 4,
};

const statusLabels: Record<SiteStatus, string> = {
  draft: "Draft",
  concept: "Concept",
  live: "Client",
  archived: "Archived",
};

const domainLabels: Record<DomainStatus, string> = {
  not_connected: "Not connected",
  connecting: "Not connected",
  https_pending: "Not connected",
  live: "Live",
  error: "Not connected",
  legacy: "Not connected",
};

function siteName(site: SiteRow): string {
  return site.lab_name?.trim() || site.slug;
}

function timestamp(value: string): number {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function compareStable(a: SiteRow, b: SiteRow): number {
  return b.id.localeCompare(a.id);
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  const datePart = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Riyadh",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);

  const timePart = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Riyadh",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(date);

  return `${datePart} · ${timePart}`;
}

function simplifiedDomainStatus(status: DomainStatus): "not_connected" | "live" {
  return status === "live" ? "live" : "not_connected";
}

function humanizeDesignName(value: string): string {
  return value
    .trim()
    .replace(/-v(\d+)$/i, " v$1")
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => (/^v\d+$/i.test(part) ? part.toLowerCase() : `${part.charAt(0).toUpperCase()}${part.slice(1)}`))
    .join(" ").trim();
}

function designPrimaryLabel(site: SiteRow): string {
  const variant = site.design_settings?.variant?.trim();
  return humanizeDesignName(variant || site.design_key || "") || "—";
}

function designSecondaryLabel(site: SiteRow): string {
  const variant = site.design_settings?.variant?.trim();
  if (variant) {
    return `Base ${site.design_key || "—"} · schema ${site.content_schema_version || 1}`;
  }

  return `v${site.design_version || 1} · schema ${site.content_schema_version || 1}`;
}

export default function SiteMonitorPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [role, setRole] = useState<string | null>(null);
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [summaryFilter, setSummaryFilter] = useState<SummaryFilter>("active");
  const [sortKey, setSortKey] = useState<SortKey>("created_desc");

  const loadSites = useCallback(async (activeSession: Session) => {
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

    const { data, error } = await supabase
      .from("sites")
      .select(
        "id,slug,status,lab_name:content->>labName,pi_name:content->>piName,institution:content->>institution,headline:content->>headline,created_at,updated_at,domain_status,domain_url,domain_error,design_key,design_settings,design_version,content_schema_version",
      )
      .order("created_at", { ascending: false })
      .order("updated_at", { ascending: false })
      .order("id", { ascending: false });

    if (error) {
      setNotice(error.message);
    } else {
      setSites((data ?? []) as unknown as SiteRow[]);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
      if (data.session) void loadSites(data.session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthReady(true);
      if (nextSession) {
        void loadSites(nextSession);
      } else {
        setRole(null);
        setSites([]);
      }
    });

    return () => subscription.unsubscribe();
  }, [loadSites]);

  const counts = useMemo(() => ({
    active: sites.filter((site) => site.status !== "archived").length,
    draft: sites.filter((site) => site.status === "draft").length,
    concept: sites.filter((site) => site.status === "concept").length,
    client: sites.filter((site) => site.status === "live").length,
    archived: sites.filter((site) => site.status === "archived").length,
  }), [sites]);

  const selectedTotal = useMemo(() => {
    switch (summaryFilter) {
      case "draft": return counts.draft;
      case "concept": return counts.concept;
      case "live": return counts.client;
      case "archived": return counts.archived;
      case "active":
      default: return counts.active;
    }
  }, [counts, summaryFilter]);

  const visibleSites = useMemo(() => {
    const query = search.trim().toLowerCase();

    const filtered = sites.filter((site) => {
      const matchesSummary = summaryFilter === "active"
        ? site.status !== "archived"
        : site.status === summaryFilter;

      if (!matchesSummary) return false;
      if (!query) return true;

      return [
        siteName(site),
        site.slug,
        site.pi_name ?? "",
        site.institution ?? "",
        site.headline ?? "",
        site.status,
        site.domain_status,
        site.design_key,
        site.design_settings?.variant ?? "",
      ].join(" ").toLowerCase().includes(query);
    });

    return [...filtered].sort((a, b) => {
      switch (sortKey) {
        case "updated_asc":
          return timestamp(a.updated_at) - timestamp(b.updated_at) || compareStable(a, b);
        case "created_desc":
          return timestamp(b.created_at) - timestamp(a.created_at)
            || timestamp(b.updated_at) - timestamp(a.updated_at)
            || compareStable(a, b);
        case "created_asc":
          return timestamp(a.created_at) - timestamp(b.created_at)
            || timestamp(a.updated_at) - timestamp(b.updated_at)
            || compareStable(b, a);
        case "name_asc":
          return siteName(a).localeCompare(siteName(b)) || compareStable(a, b);
        case "name_desc":
          return siteName(b).localeCompare(siteName(a)) || compareStable(a, b);
        case "status_asc":
          return statusOrder[a.status] - statusOrder[b.status]
            || siteName(a).localeCompare(siteName(b))
            || compareStable(a, b);
        case "updated_desc":
        default:
          return timestamp(b.updated_at) - timestamp(a.updated_at) || compareStable(a, b);
      }
    });
  }, [sites, search, sortKey, summaryFilter]);

  async function copySlug(slug: string) {
    try {
      await navigator.clipboard.writeText(slug);
      setNotice(`Copied ${slug}.`);
    } catch {
      setNotice("The slug could not be copied automatically.");
    }
  }

  if (!authReady) {
    return <main className={styles.statePage}>Preparing the secure website monitor…</main>;
  }

  if (!session) {
    return (
      <main className={styles.statePage}>
        <section className={styles.stateCard}>
          <p className={styles.kicker}>LabNarrative website monitor</p>
          <h1>Administrator sign-in required.</h1>
          <p>Sign in through the existing administrator dashboard, then return to this page.</p>
          <Link className={styles.primaryLink} href="/admin">Open administrator dashboard</Link>
        </section>
      </main>
    );
  }

  if (role !== "admin") {
    return (
      <main className={styles.statePage}>
        <section className={styles.stateCard}>
          <p className={styles.kicker}>Access restricted</p>
          <h1>Administrator permission required.</h1>
          <p>{loading ? "Checking administrator permission…" : notice}</p>
          <Link className={styles.primaryLink} href="/admin">Return to dashboard</Link>
        </section>
      </main>
    );
  }

  const summaryItems: Array<{ label: string; value: number; filter: SummaryFilter }> = [
    { label: "Active websites", value: counts.active, filter: "active" },
    { label: "Drafts", value: counts.draft, filter: "draft" },
    { label: "Concepts", value: counts.concept, filter: "concept" },
    { label: "Clients", value: counts.client, filter: "live" },
    { label: "Archived hidden", value: counts.archived, filter: "archived" },
  ];

  const selectedLabel = summaryItems.find((item) => item.filter === summaryFilter)?.label ?? "Websites";

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <div>
          <Link className={styles.brand} href="/admin">LabNarrative</Link>
          <span>Website monitor</span>
        </div>
        <nav>
          <span>{session.user.email}</span>
          <Link href="/admin">Administrator dashboard</Link>
          <Link href="/">View platform</Link>
        </nav>
      </header>

      <section className={styles.content}>
        <div className={styles.heading}>
          <div>
            <p className={styles.kicker}>Portfolio operations</p>
            <h1>Monitor every PI website.</h1>
            <p>
              Website status and domain status are shown separately. Archived websites remain hidden from
              the default operational table.
            </p>
          </div>
          <button
            className={styles.refreshButton}
            disabled={loading}
            onClick={() => void loadSites(session)}
            type="button"
          >
            {loading ? "Refreshing…" : "Refresh data"}
          </button>
        </div>

        <section className={styles.explanation} aria-label="Status definitions">
          <article><strong>Draft</strong><span>Administrator-only working version. It is not publicly visible.</span></article>
          <article><strong>Concept</strong><span>Public outreach preview. Suitable for sending to a prospective PI.</span></article>
          <article><strong>Client</strong><span>Approved official client website intended for ongoing public use.</span></article>
          <article><strong>Archived</strong><span>Hidden by default but available through the Archived summary filter.</span></article>
        </section>

        <section
          className={styles.summary}
          aria-label="Website totals and status filters"
          style={{ gridTemplateColumns: "repeat(5, minmax(0, 1fr))" }}
        >
          {summaryItems.map((item) => (
            <button
              aria-pressed={summaryFilter === item.filter}
              className={summaryFilter === item.filter ? styles.activeSummary : undefined}
              key={item.filter}
              onClick={() => setSummaryFilter(item.filter)}
              type="button"
            >
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </button>
          ))}
        </section>

        <section
          className={styles.controls}
          style={{ gridTemplateColumns: "minmax(260px, 1.5fr) minmax(180px, 0.7fr)" }}
        >
          <label className={styles.search}>
            <span>Search</span>
            <input
              placeholder="PI, laboratory, institution, slug or design…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>

          <label>
            <span>Sort by</span>
            <select value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)}>
              <option value="created_desc">Newest created</option>
              <option value="created_asc">Oldest created</option>
              <option value="updated_desc">Recently updated</option>
              <option value="updated_asc">Least recently updated</option>
              <option value="name_asc">Name A–Z</option>
              <option value="name_desc">Name Z–A</option>
              <option value="status_asc">Website status</option>
            </select>
          </label>
        </section>

        {notice && <p className={styles.notice}>{notice}</p>}

        <div className={styles.resultLine}>
          Showing <strong>{visibleSites.length}</strong> of <strong>{selectedTotal}</strong> {selectedLabel.toLowerCase()}
          {summaryFilter !== "archived" && counts.archived > 0 && <span> · {counts.archived} archived hidden</span>}
        </div>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Website</th>
                <th>PI and institution</th>
                <th>Website status</th>
                <th>Domain status</th>
                <th>Design</th>
                <th>Created (Riyadh)</th>
                <th>Updated (Riyadh)</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleSites.map((site) => (
                <tr key={site.id}>
                  <td data-label="Website">
                    <strong>{siteName(site)}</strong>
                    <button className={styles.slugButton} onClick={() => void copySlug(site.slug)} type="button">
                      {site.slug}
                    </button>
                  </td>
                  <td data-label="PI and institution">
                    <strong>{site.pi_name || "—"}</strong>
                    <span>{site.institution || "—"}</span>
                  </td>
                  <td data-label="Website status">
                    <span className={`${styles.badge} ${styles[`status_${site.status}`]}`}>{statusLabels[site.status]}</span>
                  </td>
                  <td data-label="Domain status">
                    <span className={`${styles.badge} ${styles[`domain_${simplifiedDomainStatus(site.domain_status)}`]}`}>
                      {domainLabels[site.domain_status]}
                    </span>
                  </td>
                  <td data-label="Design">
                    <strong>{designPrimaryLabel(site)}</strong>
                    <span>{designSecondaryLabel(site)}</span>
                  </td>
                  <td data-label="Created (Riyadh)">
                    <time dateTime={site.created_at} title={site.created_at}>{formatDateTime(site.created_at)}</time>
                  </td>
                  <td data-label="Updated (Riyadh)">
                    <time dateTime={site.updated_at} title={site.updated_at}>{formatDateTime(site.updated_at)}</time>
                  </td>
                  <td data-label="Actions">
                    <div className={styles.actions}>
                      <Link href={`/admin?site=${encodeURIComponent(site.slug)}`}>Edit PI website</Link>
                      <Link href={`/admin/preview/${site.slug}`} target="_blank">Preview</Link>
                      {site.domain_url && site.domain_status === "live" && (
                        <a href={site.domain_url} target="_blank" rel="noreferrer">Open live</a>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {!loading && visibleSites.length === 0 && (
            <div className={styles.empty}>
              <strong>No websites match this view.</strong>
              <span>Clear the search field or choose another summary filter.</span>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
