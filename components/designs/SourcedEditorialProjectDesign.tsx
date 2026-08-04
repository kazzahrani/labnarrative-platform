import Link from "next/link";
import type { CSSProperties } from "react";
import {
  getBourdonPages,
  type LabSite,
  type ResearchProject,
  type SiteRoute,
} from "@/lib/sites";
import styles from "./EditorialImageDesign.module.css";

type SourcedProject = ResearchProject & {
  figureAlt?: string;
  figureSource?: string;
};

type Props = {
  site: LabSite;
  route: SiteRoute;
  basePath: string;
  previewMode?: boolean;
};

function safeAsset(value?: string): string | undefined {
  if (!value) return undefined;
  if (/^data:image\/(png|jpe?g|webp|gif);base64,[a-z0-9+/=\s]+$/i.test(value)) return value;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function researchProjects(site: LabSite): SourcedProject[] {
  if (site.research?.length) return site.research as SourcedProject[];
  return site.projects.map((project, index) => ({
    slug: `project-${index + 1}`,
    title: project.title,
    summary: project.description,
  }));
}

function Picture({ src, alt }: { src?: string; alt: string }) {
  const image = safeAsset(src);
  if (!image) return null;
  return <img src={image} alt={alt} />;
}

function Header({ site, basePath }: { site: LabSite; basePath: string }) {
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
      <Link className={styles.wordmark} href={basePath}>
        <span>{site.labName}</span>
        <small>{site.institution}</small>
      </Link>
      <nav aria-label={`${site.labName} navigation`}>
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
        <p>{pages.home.footerDepartment || site.department}<br />{pages.home.footerInstitution || site.institution}</p>
      </div>
      <div className={styles.footerLinks}>
        <Link href={`${basePath}/research`}>{pages.navigation.research}</Link>
        <Link href={`${basePath}/publications`}>{pages.navigation.publications}</Link>
        <Link href={`${basePath}/members`}>{pages.navigation.members}</Link>
        <Link href={`${basePath}/contact`}>{pages.navigation.contact}</Link>
      </div>
      <div className={styles.footerMeta}>
        {site.email && <a href={`mailto:${site.email}`}>{site.email}</a>}
        <span>Independent concept by LabNarrative</span>
      </div>
    </footer>
  );
}

export default function SourcedEditorialProjectDesign({
  site,
  route,
  basePath,
  previewMode = false,
}: Props) {
  const pages = getBourdonPages(site);
  const projects = researchProjects(site);
  const index = projects.findIndex((project) => project.slug === route.projectSlug);
  const project = projects[index];

  if (!project) return null;

  const figure = safeAsset(project.figureImage);
  const figureAlt = project.figureAlt || project.figureCaption || project.title;
  const variables = {
    "--ei-paper": site.theme.background,
    "--ei-white": site.theme.surface,
    "--ei-ink": site.theme.foreground,
    "--ei-muted": site.theme.muted,
    "--ei-accent": site.theme.accent,
  } as CSSProperties;

  return (
    <main className={styles.site} style={variables}>
      {previewMode && <div className={styles.previewBadge}>Private administrator preview · Draft</div>}
      <Header site={site} basePath={basePath} />

      <article className={styles.projectPage}>
        <Link className={styles.backLink} href={`${basePath}/research`}>← {pages.research.backLink}</Link>
        <header>
          <span>{String(index + 1).padStart(2, "0")}</span>
          <p>{pages.research.programmeLabel}</p>
          <h1>{project.title}</h1>
          <div>{project.summary}</div>
        </header>

        <section className={styles.projectQuestion}>
          <p>{pages.research.questionLabel}</p>
          <h2>{project.question || project.title}</h2>
        </section>

        <section className={styles.projectNarrative}>
          <div className={styles.projectBody}>
            {(project.body || []).map((paragraph, paragraphIndex) => <p key={paragraphIndex}>{paragraph}</p>)}
          </div>
          {figure && (
            <figure>
              <Picture src={figure} alt={figureAlt} />
              {project.figureCaption && (
                <figcaption
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    justifyContent: "space-between",
                    gap: "10px 20px",
                  }}
                >
                  <span style={{ flex: "1 1 520px" }}>{project.figureCaption}</span>
                  {project.figureSource && (
                    <a
                      href={project.figureSource}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: "var(--ei-accent)", fontWeight: 800, whiteSpace: "nowrap" }}
                    >
                      View source publication ↗
                    </a>
                  )}
                </figcaption>
              )}
            </figure>
          )}
        </section>

        <Link className={styles.returnLink} href={`${basePath}/research`}>{pages.research.returnLink} ↗</Link>
      </article>

      <Footer site={site} basePath={basePath} />
    </main>
  );
}
