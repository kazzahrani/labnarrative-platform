"use client";

import { useEffect, useRef, type MouseEvent } from "react";
import SiteShell from "@/components/SiteShell";
import type { LabSite, SiteRoute, SiteSection } from "@/lib/sites";
import styles from "./live-site-preview.module.css";

type SiteStatus = "draft" | "concept" | "live" | "archived";

const previewPages: Array<{ section: SiteSection; label: string }> = [
  { section: "home", label: "Home" },
  { section: "research", label: "Research" },
  { section: "publications", label: "Publications" },
  { section: "members", label: "Members" },
  { section: "join", label: "Join" },
  { section: "contact", label: "Contact" },
];

const statusLabels: Record<SiteStatus, string> = {
  draft: "Draft",
  concept: "Concept",
  live: "Client",
  archived: "Archived",
};

const internalBasePath = "/admin/live-preview";

function sectionFromPath(pathname: string): SiteRoute {
  const remainder = pathname.startsWith(internalBasePath)
    ? pathname.slice(internalBasePath.length)
    : "";

  const segments = remainder.split("/").filter(Boolean);
  const requested = segments[0] ?? "home";

  const aliases: Record<string, SiteSection> = {
    home: "home",
    research: "research",
    publications: "publications",
    team: "members",
    members: "members",
    opportunities: "join",
    join: "join",
    contact: "contact",
  };

  const section = aliases[requested] ?? "home";

  return {
    section,
    projectSlug: section === "research" ? segments[1] : undefined,
  };
}

export default function LiveSitePreview({
  site,
  status,
  route,
  onRouteChange,
}: {
  site: LabSite;
  status: SiteStatus;
  route: SiteRoute;
  onRouteChange: (route: SiteRoute) => void;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    viewportRef.current?.scrollTo({ top: 0, left: 0, behavior: "smooth" });
  }, [route.section, route.projectSlug]);

  function handlePreviewClick(event: MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    const anchor = target.closest("a");

    if (!anchor) return;

    const href = anchor.getAttribute("href");
    if (!href) return;

    event.preventDefault();
    event.stopPropagation();

    const url = new URL(href, window.location.origin);

    if (url.pathname.startsWith(internalBasePath)) {
      onRouteChange(sectionFromPath(url.pathname));
    }
  }

  return (
    <aside className={styles.previewPane} aria-label="Instant website preview">
      <div className={styles.previewHeader}>
        <div>
          <span className={styles.kicker}>Instant preview</span>
          <strong>{site.labName || "New laboratory concept"}</strong>
          <small>Unsaved edits appear immediately</small>
        </div>
        <span className={`${styles.statusBadge} ${styles[`status_${status}`]}`}>
          {statusLabels[status]}
        </span>
      </div>

      <nav className={styles.previewNavigation} aria-label="Preview page">
        {previewPages.map((page) => (
          <button
            className={route.section === page.section ? styles.activePage : ""}
            key={page.section}
            onClick={() => onRouteChange({ section: page.section })}
            type="button"
          >
            {page.label}
          </button>
        ))}
      </nav>

      <div className={styles.viewportLabel}>
        <span>Live editing view</span>
        <span>Scroll independently</span>
      </div>

      <div
        className={styles.previewViewport}
        onClickCapture={handlePreviewClick}
        ref={viewportRef}
      >
        <SiteShell
          site={site}
          route={route}
          basePath={internalBasePath}
          previewMode={status === "draft"}
        />
      </div>

      <div className={styles.previewFooter}>
        <span>Changes shown here are not stored until you click Save only.</span>
      </div>
    </aside>
  );
}
