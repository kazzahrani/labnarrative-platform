"use client";

import { createClient, type Session } from "@supabase/supabase-js";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./site-monitor.module.css";

type SiteStatus = "draft" | "concept" | "live" | "archived";
type DomainStatus =
  | "not_connected"
  | "connecting"
  | "https_pending"
  | "live"
  | "error"
  | "legacy";

type SiteContent = {
  labName?: string;
  piName?: string;
  institution?: string;
  headline?: string;
};

type SiteRow = {
  id: string;
  slug: string;
  status: SiteStatus;
  content: SiteContent | null;
  created_at: string;
  updated_at: string;
  domain_status: DomainStatus;
  domain_url: string | null;
  domain_error: string | null;
  design_key: string;
  design_version: number;
  content_schema_version: number;
};

type StatusFilter = "all" | SiteStatus;
type DomainFilter = "all" | "not_connected" | "live" | "others";
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
  connecting: "Others",
  https_pending: "Others",
  live: "Live",
  error: "Others",
  legacy: "Others",
};

function siteName(site: SiteRow): string {
  return site.content?.labName?.trim() || site.slug;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function simplifiedDomainStatus(status: DomainStatus): "not_connected" | "live" | "others" {
  if (status === "not_connected") return "not_connected";
  if (status === "live") return "live";
  return "others";
}

export default function SiteMonitorPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [role, setRole] = useState<string | null>(null);
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [domainFilter, setDomainFilter] = useState<DomainFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("updated_desc");
  const [showArchived, setShowArchived] = useState(false);

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
        "id,slug,status,content,created_at,updated_at,domain_status,domain_url,domain_error,design_key,design_version,content_schema_version",
      );

    if (error) {
      setNotice(error.message);
    } else {
      setSites((data ?? []) as SiteRow[]);
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

  const counts = useMemo(() => {
    return {
      all: sites.length,
      active: sites.filter((site) => site.status !== "archived").length,
      draft: sites.filter((site) => site.status === "draft").length,
      concept: sites.filter((site) => site.status === "concept").length,
      client: sites.filter((site) => site.status === "live").length,
      archived: sites.filter((site) => site.status === "archived").length,
      domainOthers: sites.filter((site) => simplifiedDomainStatus(site.domain_status) === "others").length,
    };
  }, [sites]);

  const visibleSites = useMemo(() => {
    const query = search.trim().toLowerCase();

    const filtered = sites.filter((site) => {
      if (!showArchived && site.status === "archived") return false;
      if (statusFilter !== "all" && site.status !== statusFilter) return false;

      if (
        domainFilter !== "all"
        && simplifiedDomainStatus(site.domain_status) !== domainFilter
      ) {
        return false;
      }

      if (!query) return true;

      const haystack = [
        siteName(site),
        site.slug,
        site.content?.piName ?? "",
        site.content?.institution ?? "",
        site.content?.headline ?? "",
        site.status,
        site.domain_status,
        site.design_key,
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });

    return [...filtered].sort((a, b) => {
      switch (sortKey) {
        case "updated_asc":
          return new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime();
        case "created_desc":
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case "created_asc":
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case "name_asc":
          return siteName(a).localeCompare(siteName(b));
        case "name_desc":
          return siteName(b).localeCompare(siteName(a));
        case "status_asc":
          return statusOrder[a.status] - statusOrder[b.status] || siteName(a).localeCompare(siteName(b));
        case "updated_desc":
        default:
          return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      }
    });
  }, [sites, search, statusFilter, domainFilter, sortKey, showArchived]);

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
          <Link className={styles.primaryLink} href="/admin">
            Open administrator dashboard
          </Link>
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
          <Link className={styles.primaryLink} href="/admin">
            Return to dashboard
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <div>
          <Link className={styles.brand} href="/admin">
            LabNarrative
          </Link>
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
              Website status and domain status are shown separately, because a connected domain does not
              automatically make Draft content public.
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
          <article>
            <strong>Draft</strong>
            <span>Administrator-only working version. It is not publicly visible.</span>
          </article>
          <article>
            <strong>Concept</strong>
            <span>Public outreach preview. Suitable for sending to a prospective PI.</span>
          </article>
          <article>
            <strong>Client</strong>
            <span>Approved official client website intended for ongoing public use.</span>
          </article>
          <article>
            <strong>Archived</strong>
            <span>Hidden from public use but retained safely in the database.</span>
          </article>
        </section>

        <section className={styles.summary} aria-label="Website totals">
          <button
            className={statusFilter === "all" && !showArchived ? styles.activeSummary : ""}
            onClick={() => {
              setStatusFilter("all");
              setShowArchived(false);
            }}
            type="button"
          >
            <span>Active websites</span>
            <strong>{counts.active}</strong>
          </button>
          <button
            className={statusFilter === "draft" ? styles.activeSummary : ""}
            onClick={() => setStatusFilter("draft")}
            type="button"
          >
            <span>Drafts</span>
            <strong>{counts.draft}</strong>
          </button>
          <button
            className={statusFilter === "concept" ? styles.activeSummary : ""}
            onClick={() => setStatusFilter("concept")}
            type="button"
          >
            <span>Concepts</span>
            <strong>{counts.concept}</strong>
          </button>
          <button
            className={statusFilter === "live" ? styles.activeSummary : ""}
            onClick={() => setStatusFilter("live")}
            type="button"
          >
            <span>Clients</span>
            <strong>{counts.client}</strong>
          </button>
          <button
            className={domainFilter === "others" ? styles.activeSummary : ""}
            onClick={() => setDomainFilter(domainFilter === "others" ? "all" : "others")}
            type="button"
          >
            <span>Domain others</span>
            <strong>{counts.domainOthers}</strong>
          </button>
          <button
            className={showArchived ? styles.activeSummary : ""}
            onClick={() => {
              const next = !showArchived;
              setShowArchived(next);
              if (!next && statusFilter === "archived") setStatusFilter("all");
            }}
            type="button"
          >
            <span>{showArchived ? "Hide archived" : "Show archived"}</span>
            <strong>{counts.archived}</strong>
          </button>
        </section>

        <section className={styles.controls}>
          <label className={styles.search}>
            <span>Search</span>
            <input
              placeholder="PI, laboratory, institution, slug or design…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>

          <label>
            <span>Website status</span>
            <select
              value={statusFilter}
              onChange={(event) => {
                const nextStatus = event.target.value as StatusFilter;
                setStatusFilter(nextStatus);
                if (nextStatus === "archived") setShowArchived(true);
              }}
            >
              <option value="all">All statuses</option>
              <option value="draft">Draft</option>
              <option value="concept">Concept</option>
              <option value="live">Client</option>
              <option value="archived">Archived</option>
            </select>
          </label>

          <label>
            <span>Domain status</span>
            <select
              value={domainFilter}
              onChange={(event) => setDomainFilter(event.target.value as DomainFilter)}
            >
              <option value="all">All domain states</option>
              <option value="not_connected">Not connected</option>
              <option value="live">Live</option>
              <option value="others">Others</option>
            </select>
          </label>

          <label>
            <span>Sort by</span>
            <select value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)}>
              <option value="updated_desc">Recently updated</option>
              <option value="updated_asc">Least recently updated</option>
              <option value="created_desc">Newest created</option>
              <option value="created_asc">Oldest created</option>
              <option value="name_asc">Name A–Z</option>
              <option value="name_desc">Name Z–A</option>
              <option value="status_asc">Website status</option>
            </select>
          </label>
        </section>

        {notice && <p className={styles.notice}>{notice}</p>}

        <div className={styles.resultLine}>
          Showing <strong>{visibleSites.length}</strong> of{" "}
          <strong>{showArchived ? counts.all : counts.active}</strong> visible websites
          {!showArchived && counts.archived > 0 && (
            <span> · {counts.archived} archived hidden</span>
          )}
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
                <th>Created</th>
                <th>Updated</th>
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
                    <strong>{site.content?.piName || "—"}</strong>
                    <span>{site.content?.institution || "—"}</span>
                  </td>
                  <td data-label="Website status">
                    <span className={`${styles.badge} ${styles[`status_${site.status}`]}`}>
                      {statusLabels[site.status]}
                    </span>
                  </td>
                  <td data-label="Domain status">
                    <span
                      className={`${styles.badge} ${styles[`domain_${site.domain_status}`]}`}
                      title={`Technical state: ${site.domain_status}`}
                    >
                      {domainLabels[site.domain_status]}
                    </span>
                  </td>
                  <td data-label="Design">
                    <strong>{site.design_key || "—"}</strong>
                    <span>v{site.design_version || 1} · schema {site.content_schema_version || 1}</span>
                  </td>
                  <td data-label="Created">{formatDate(site.created_at)}</td>
                  <td data-label="Updated">{formatDate(site.updated_at)}</td>
                  <td data-label="Actions">
                    <div className={styles.actions}>
                      <Link href={`/admin?site=${encodeURIComponent(site.slug)}`}>
                        Edit PI website
                      </Link>
                      <Link href={`/admin/preview/${site.slug}`} target="_blank">
                        Preview
                      </Link>
                      {site.domain_url && site.domain_status === "live" && (
                        <a href={site.domain_url} target="_blank" rel="noreferrer">
                          Open live
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {!loading && visibleSites.length === 0 && (
            <div className={styles.empty}>
              <strong>No websites match these filters.</strong>
              <span>Clear the search or choose a different status.</span>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
