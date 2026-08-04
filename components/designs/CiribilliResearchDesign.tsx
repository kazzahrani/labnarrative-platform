import Link from "next/link";
import type { CSSProperties } from "react";
import {
  getBourdonPages,
  type LabSite,
  type ResearchProject,
  type SiteRoute,
} from "@/lib/sites";
import photoStyles from "./PhotoLabDesign.module.css";
import styles from "./CiribilliResearchDesign.module.css";

type CiribilliResearchDesignProps = {
  site: LabSite;
  route: SiteRoute;
  basePath: string;
  previewMode?: boolean;
};

function safeAsset(value?: string): string | undefined {
  if (!value) return undefined;
  if (value.startsWith("/")) return value;
  if (/^data:image\/(png|jpe?g|webp|gif);base64,[a-z0-9+/=\s]+$/i.test(value)) return value;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function researchProjects(site: LabSite): ResearchProject[] {
  if (site.research?.length) return site.research;
  return site.projects.map((project, index) => ({
    slug: `project-${index + 1}`,
    title: project.title,
    summary: project.description,
  }));
}

function Picture({ src, alt, fallback }: { src?: string; alt: string; fallback: string }) {
  const image = safeAsset(src);
  return image ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={image} alt={alt} />
  ) : (
    <div className={photoStyles.placeholder} aria-label={alt}>{fallback}</div>
  );
}

export default function CiribilliResearchDesign({
  site,
  route,
  basePath,
  previewMode = false,
}: CiribilliResearchDesignProps) {
  const pages = getBourdonPages(site);
  const projects = researchProjects(site);
  const hero = site.heroImage || pages.home.homepageImage || pages.home.topPortrait;
  const variables = {
    "--pl-background": "#ffffff",
    "--pl-surface": "#ffffff",
    "--pl-foreground": "#111111",
    "--pl-muted": site.theme.muted || "#68787d",
    "--pl-accent": site.theme.accent || "#2c8175",
  } as CSSProperties;

  const navigation = [
    { section: "home", label: pages.navigation.home, href: basePath },
    { section: "research", label: pages.navigation.research, href: `${basePath}/research` },
    { section: "members", label: pages.navigation.members, href: `${basePath}/members` },
    { section: "publications", label: pages.navigation.publications, href: `${basePath}/publications` },
    { section: "join", label: pages.navigation.join, href: `${basePath}/join` },
    { section: "contact", label: pages.navigation.contact, href: `${basePath}/contact` },
  ];

  return (
    <main className={`${photoStyles.site} ${styles.site}`} style={variables}>
      {previewMode && <div className={photoStyles.previewBadge}>Private administrator preview · Draft</div>}

      <header className={`${photoStyles.header} ${styles.header}`}>
        <Link className={`${photoStyles.wordmark} ${styles.wordmark}`} href={basePath}>
          {site.labName.toUpperCase()}
        </Link>
        <nav aria-label={`${site.labName} navigation`}>
          {navigation.map((item) => (
            <Link
              className={route.section === item.section ? photoStyles.active : ""}
              href={item.href}
              key={item.section}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>

      <section className={`${photoStyles.pageHero} ${styles.hero}`}>
        <Picture src={hero} alt="Research" fallback="LMCG" />
        <div className={photoStyles.pageHeroShade} />
        <div className={`${photoStyles.pageHeroCopy} ${styles.heroCopy}`}>
          <p>{site.labName}</p>
          <h1>Research</h1>
        </div>
      </section>

      <section className={photoStyles.researchEditorial}>
        <header className={photoStyles.researchEditorialIntro}>
          <p>{pages.research.pageLabel}</p>
          <h2>{pages.research.pageHeading}</h2>
          {pages.research.introduction && <div>{pages.research.introduction}</div>}
        </header>

        {projects.map((project, index) => {
          const figure = project.figureImage || hero;
          return (
            <article className={photoStyles.researchEditorialTopic} id={project.slug} key={`${project.slug}-${index}`}>
              <div className={photoStyles.researchEditorialCopy}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <h2>{project.title}</h2>
                {project.summary && <p className={photoStyles.researchEditorialLead}>{project.summary}</p>}
                <div className={photoStyles.researchEditorialBody}>
                  {(project.body || []).map((paragraph, paragraphIndex) => (
                    <p key={paragraphIndex}>{paragraph}</p>
                  ))}
                </div>
              </div>
              <figure className={photoStyles.researchEditorialFigure}>
                <Picture
                  src={figure}
                  alt={project.figureCaption || project.title}
                  fallback={String(index + 1).padStart(2, "0")}
                />
                {project.figureCaption && <figcaption>{project.figureCaption}</figcaption>}
              </figure>
            </article>
          );
        })}
      </section>

      <footer className={`${photoStyles.footer} ${styles.footer}`}>
        <div>
          <strong>{pages.home.footerLabName || site.labName}</strong>
          <p>{pages.home.footerDepartment || site.department}<br />{pages.home.footerInstitution || site.institution}</p>
        </div>
        <div className={photoStyles.footerLinks}>
          <Link href={`${basePath}/research`}>{pages.navigation.research}</Link>
          <Link href={`${basePath}/members`}>{pages.navigation.members}</Link>
          <Link href={`${basePath}/publications`}>{pages.navigation.publications}</Link>
          <Link href={`${basePath}/contact`}>{pages.navigation.contact}</Link>
        </div>
        <div className={photoStyles.footerMeta}>
          {site.email && <a href={`mailto:${site.email}`}>{site.email}</a>}
          <span>Independent concept by LabNarrative</span>
        </div>
      </footer>
    </main>
  );
}
