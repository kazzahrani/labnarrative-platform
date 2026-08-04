import Link from "next/link";
import type { CSSProperties } from "react";
import {
  getBourdonPages,
  type LabSite,
  type ResearchProject,
  type SiteRoute,
} from "@/lib/sites";
import styles from "./signature-academic-design.module.css";

type SignatureMode = "zhang" | "gao" | "goyette";

type SourcedProject = ResearchProject & {
  figureAlt?: string;
  figureSource?: string;
};

type Props = {
  site: LabSite;
  route: SiteRoute;
  basePath: string;
  previewMode?: boolean;
  mode: SignatureMode;
};

function researchProjects(site: LabSite): SourcedProject[] {
  if (site.research?.length) return site.research as SourcedProject[];
  return site.projects.map((project, index) => ({
    slug: `project-${index + 1}`,
    title: project.title,
    summary: project.description,
  }));
}

function safeImageUrl(value?: string): string | undefined {
  if (!value) return undefined;
  if (/^data:image\/(png|jpe?g|webp|gif);base64,[a-z0-9+/=\s]+$/i.test(value)) return value;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function themeStyle(site: LabSite, mode: SignatureMode): CSSProperties {
  const defaults = {
    zhang: { bg: "#F4F3EE", surface: "#FFFFFF", ink: "#10172A", muted: "#697082", accent: "#2D50FF" },
    gao: { bg: "#090A13", surface: "#151827", ink: "#F7F4F0", muted: "#A5A7B5", accent: "#FF785A" },
    goyette: { bg: "#F6F0E8", surface: "#FFFDF9", ink: "#291C24", muted: "#766A6F", accent: "#8B2D4A" },
  }[mode];

  return {
    "--sig-background": site.theme?.background || defaults.bg,
    "--sig-surface": site.theme?.surface || defaults.surface,
    "--sig-foreground": site.theme?.foreground || defaults.ink,
    "--sig-muted": site.theme?.muted || defaults.muted,
    "--sig-accent": site.theme?.accent || defaults.accent,
  } as CSSProperties;
}

function Header({ site, basePath, mode }: { site: LabSite; basePath: string; mode: SignatureMode }) {
  const pages = getBourdonPages(site);
  const nav = [
    { label: pages.navigation.home, href: basePath },
    { label: pages.navigation.research, href: `${basePath}/research`, active: true },
    { label: pages.navigation.publications, href: `${basePath}/publications` },
    { label: pages.navigation.members, href: `${basePath}/members` },
    { label: pages.navigation.join, href: `${basePath}/join` },
    { label: pages.navigation.contact, href: `${basePath}/contact` },
  ];

  return (
    <header className={styles.header}>
      <Link href={basePath} className={styles.brand} aria-label={`${site.labName} home`}>
        <span className={styles.brandMark} aria-hidden="true">
          {mode === "zhang" && <><i /><i /><i /><i /></>}
          {mode === "gao" && <><i /><i /><i /></>}
          {mode === "goyette" && <><i /><i /></>}
        </span>
        <span>
          <strong>{site.labName}</strong>
          <small>{site.labSubtitle}</small>
        </span>
      </Link>
      <nav className={styles.nav} aria-label="Main navigation">
        {nav.map((item) => (
          <Link className={item.active ? styles.active : ""} href={item.href} key={item.href}>
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}

function Footer({ site, basePath }: { site: LabSite; basePath: string }) {
  const pages = getBourdonPages(site);
  return (
    <footer className={styles.footer}>
      <div>
        <strong>{pages.home.footerLabName || site.labName}</strong>
        <p>{pages.home.footerDepartment || site.department}</p>
        <p>{pages.home.footerInstitution || site.institution}</p>
      </div>
      <div>
        <span>{pages.home.footerExploreHeading}</span>
        <Link href={`${basePath}/research`}>{pages.home.footerResearchLink}</Link>
        <Link href={`${basePath}/publications`}>{pages.home.footerPublicationsLink}</Link>
        <Link href={`${basePath}/join`}>{pages.home.footerJoinLink}</Link>
      </div>
      <div>
        <span>{pages.home.footerContactHeading}</span>
        {site.email && <a href={`mailto:${site.email}`}>{site.email}</a>}
        {site.phone && <p>{site.phone}</p>}
      </div>
      <small>{pages.home.footerNote || "Independent concept by LabNarrative · Not an official laboratory website"} · © {new Date().getFullYear()} {site.labName}</small>
    </footer>
  );
}

export default function SourcedSignatureProjectDesign({
  site,
  route,
  basePath,
  previewMode = false,
  mode,
}: Props) {
  const pages = getBourdonPages(site);
  const projects = researchProjects(site);
  const index = projects.findIndex((project) => project.slug === route.projectSlug);
  const project = projects[index];

  if (!project) return null;

  const next = projects[(index + 1) % projects.length];
  const figure = safeImageUrl(project.figureImage);
  const figureAlt = project.figureAlt || project.figureCaption || project.title;

  return (
    <main className={`${styles.site} ${styles[mode]}`} style={themeStyle(site, mode)}>
      <div className={styles.conceptBanner}>
        {previewMode ? "Private administrator preview · this draft is not publicly visible" : "LabNarrative concept · prepared as an independent design proposal"}
      </div>
      <Header site={site} basePath={basePath} mode={mode} />

      <section className={styles.projectHero}>
        <Link href={`${basePath}/research`}>← {pages.research.backLink}</Link>
        <p>{pages.research.programmeLabel} {String(index + 1).padStart(2, "0")}</p>
        <h1>{project.title}</h1>
        <div>{project.summary}</div>
      </section>

      <section className={styles.projectQuestion}>
        <span>{pages.research.questionLabel}</span>
        <h2>{project.question || project.title}</h2>
      </section>

      <section className={styles.projectBody}>
        <div>
          {(project.body?.length ? project.body : [project.summary]).map((paragraph, paragraphIndex) => (
            <p key={paragraphIndex}>{paragraph}</p>
          ))}
        </div>
        <aside>
          {!!project.methods?.length && (
            <div>
              <h3>Approaches</h3>
              <ul>{project.methods.map((method, methodIndex) => <li key={methodIndex}>{method}</li>)}</ul>
            </div>
          )}
          {!!project.papers?.length && (
            <div>
              <h3>Selected work</h3>
              <ul>{project.papers.map((paper, paperIndex) => <li key={paperIndex}>{paper}</li>)}</ul>
            </div>
          )}
        </aside>
      </section>

      {figure && (
        <section style={{ maxWidth: "1500px", margin: "0 auto", padding: "0 7vw 110px" }}>
          <figure style={{ margin: 0 }}>
            <img
              src={figure}
              alt={figureAlt}
              style={{
                display: "block",
                width: "100%",
                height: "auto",
                maxHeight: "900px",
                objectFit: "contain",
                background: "var(--sig-surface)",
              }}
            />
            <figcaption
              style={{
                display: "flex",
                flexWrap: "wrap",
                justifyContent: "space-between",
                gap: "12px 24px",
                paddingTop: "16px",
                color: "var(--sig-muted)",
                fontSize: "13px",
                lineHeight: 1.6,
              }}
            >
              <span style={{ flex: "1 1 620px" }}>{project.figureCaption}</span>
              {project.figureSource && (
                <a
                  href={project.figureSource}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: "var(--sig-accent)", fontWeight: 700, whiteSpace: "nowrap" }}
                >
                  View source publication ↗
                </a>
              )}
            </figcaption>
          </figure>
        </section>
      )}

      {next && (
        <section className={styles.nextProject}>
          <span>{pages.research.nextProgrammeLabel}</span>
          <Link href={`${basePath}/research/${next.slug}`}>{next.title} ↗</Link>
        </section>
      )}

      <Footer site={site} basePath={basePath} />
    </main>
  );
}
