import Link from "next/link";
import type { CSSProperties } from "react";
import EngelandDesign from "./EngelandDesign";
import styles from "./engeland-design.module.css";
import {
  getBourdonPages,
  type LabSite,
  type ResearchProject,
  type SiteRoute,
} from "@/lib/sites";

type SourcedResearchProject = ResearchProject & {
  figureSourceUrl?: string;
};

function researchProjects(site: LabSite): SourcedResearchProject[] {
  if (site.research?.length) return site.research as SourcedResearchProject[];
  return site.projects.map((project, index) => ({
    slug: `project-${index + 1}`,
    title: project.title,
    summary: project.description,
  }));
}

function Header({ site, route, basePath }: { site: LabSite; route: SiteRoute; basePath: string }) {
  const pages = getBourdonPages(site);
  const nav = [
    { key: "home", label: pages.navigation.home, href: basePath },
    { key: "research", label: pages.navigation.research, href: `${basePath}/research` },
    { key: "publications", label: pages.navigation.publications, href: `${basePath}/publications` },
    { key: "members", label: pages.navigation.members, href: `${basePath}/members` },
    { key: "join", label: pages.navigation.join, href: `${basePath}/join` },
    { key: "contact", label: pages.navigation.contact, href: `${basePath}/contact` },
  ] as const;

  return (
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <Link className={styles.wordmark} href={basePath} aria-label={`${site.labName} home`}>
          <span className={styles.wordmarkSymbol} aria-hidden="true"><i /><i /><i /></span>
          <span>
            <strong>{site.labName}</strong>
            <small>{site.labSubtitle || site.department || site.institution}</small>
          </span>
        </Link>
        <nav aria-label="Main navigation" className={styles.navigation}>
          {nav.map((item) => (
            <Link className={route.section === item.key ? styles.active : ""} href={item.href} key={item.key}>
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}

function Footer({ site, basePath }: { site: LabSite; basePath: string }) {
  const pages = getBourdonPages(site);
  return (
    <footer className={styles.footer}>
      <div>
        <strong>{pages.home.footerLabName}</strong>
        <p>{pages.home.footerDepartment}</p>
        <p>{pages.home.footerInstitution}</p>
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
      <small>{pages.home.footerNote} · © {new Date().getFullYear()} {site.labName}</small>
    </footer>
  );
}

function ProjectDetail({ site, route, basePath, previewMode }: {
  site: LabSite;
  route: SiteRoute;
  basePath: string;
  previewMode: boolean;
}) {
  const pages = getBourdonPages(site);
  const projects = researchProjects(site);
  const index = projects.findIndex((project) => project.slug === route.projectSlug);
  const project = projects[index];

  if (!project) {
    return <EngelandDesign site={site} route={route} basePath={basePath} previewMode={previewMode} />;
  }

  const next = projects[(index + 1) % projects.length];
  const variables = {
    "--eng-background": site.theme.background,
    "--eng-surface": site.theme.surface,
    "--eng-foreground": site.theme.foreground,
    "--eng-muted": site.theme.muted,
    "--eng-accent": site.theme.accent,
  } as CSSProperties;

  return (
    <main className={styles.site} style={variables}>
      <style>{`
        .eng-published-figure {
          margin: 0;
          padding: clamp(28px, 5vw, 72px) clamp(22px, 7vw, 110px);
          background: var(--eng-surface);
          border-top: 1px solid color-mix(in srgb, var(--eng-foreground) 14%, transparent);
          border-bottom: 1px solid color-mix(in srgb, var(--eng-foreground) 14%, transparent);
        }
        .eng-published-figure__frame {
          max-width: 1180px;
          margin: 0 auto;
          padding: clamp(16px, 2vw, 28px);
          background: #fff;
          border: 1px solid color-mix(in srgb, var(--eng-foreground) 16%, transparent);
          box-shadow: 0 22px 70px rgba(16, 29, 38, .12);
        }
        .eng-published-figure img {
          display: block;
          width: 100%;
          max-height: 760px;
          object-fit: contain;
          background: #fff;
        }
        .eng-published-figure figcaption {
          max-width: 1180px;
          margin: 20px auto 0;
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 20px;
          align-items: start;
          color: var(--eng-muted);
          font-size: 14px;
          line-height: 1.65;
        }
        .eng-published-figure figcaption a {
          color: var(--eng-accent);
          font-weight: 700;
          text-decoration: none;
          white-space: nowrap;
        }
        .eng-published-figure figcaption a:hover { text-decoration: underline; }
        @media (max-width: 760px) {
          .eng-published-figure figcaption { grid-template-columns: 1fr; }
          .eng-published-figure figcaption a { white-space: normal; }
        }
      `}</style>
      <div className={styles.conceptBanner}>
        {previewMode
          ? "Private administrator preview · this draft is not publicly visible"
          : "LabNarrative concept · prepared as an independent design proposal"}
      </div>
      <Header site={site} route={route} basePath={basePath} />
      <section className={styles.projectHero}>
        <Link href={`${basePath}/research`}>← {pages.research.backLink}</Link>
        <p className={styles.kicker}>{pages.research.programmeLabel} {String(index + 1).padStart(2, "0")}</p>
        <h1>{project.title}</h1>
        <p>{project.summary}</p>
      </section>
      <section className={styles.projectQuestion}>
        <span>Core regulatory question</span>
        <h2>{project.question || project.title}</h2>
      </section>
      {project.figureImage && (
        <figure className="eng-published-figure">
          <div className="eng-published-figure__frame">
            <img src={project.figureImage} alt={project.figureCaption || `${project.title} published research figure`} />
          </div>
          <figcaption>
            <span>{project.figureCaption}</span>
            {project.figureSourceUrl && (
              <a href={project.figureSourceUrl} target="_blank" rel="noreferrer">View source publication ↗</a>
            )}
          </figcaption>
        </figure>
      )}
      <section className={styles.projectBody}>
        <div className={styles.projectNarrative}>
          {(project.body ?? []).map((paragraph, paragraphIndex) => <p key={paragraphIndex}>{paragraph}</p>)}
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

export default function EngelandDesignWithFigures({
  site,
  route,
  basePath,
  previewMode = false,
}: {
  site: LabSite;
  route: SiteRoute;
  basePath: string;
  previewMode?: boolean;
}) {
  if (route.section === "research" && route.projectSlug) {
    return <ProjectDetail site={site} route={route} basePath={basePath} previewMode={previewMode} />;
  }

  return <EngelandDesign site={site} route={route} basePath={basePath} previewMode={previewMode} />;
}
