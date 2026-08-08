"use client";

import Link from "next/link";
import { useEffect, useRef, type CSSProperties } from "react";
import { NARITA_HERO_IMAGE } from "@/components/designs/naritaShared";
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
  const mainRef = useRef<HTMLElement>(null);
  const pages = getBourdonPages(site);
  const projects = researchProjects(site);
  const hero = NARITA_HERO_IMAGE;
  const variables = {
    "--pl-background": "#ffffff",
    "--pl-surface": "#ffffff",
    "--pl-foreground": "#111111",
    "--pl-muted": site.theme.muted || "#68787d",
    "--pl-accent": site.theme.accent || "#2c8175",
  } as CSSProperties;

  useEffect(() => {
    const main = mainRef.current;
    if (!main) return;

    const header = main.querySelector(":scope > header");
    const sections = Array.from(main.children).filter(
      (element): element is HTMLElement =>
        element instanceof HTMLElement && element.tagName === "SECTION",
    );
    const heroSection = sections[0];
    const contentSection = sections[1];
    if (!heroSection || !contentSection) return;

    let frame = 0;

    const measure = () => {
      const headerHeight = header instanceof HTMLElement ? header.offsetHeight : 136;
      main.style.setProperty("--ciribilli-header-height", `${headerHeight}px`);
    };

    const update = () => {
      frame = 0;
      const distance = Math.max(0, window.scrollY);
      heroSection.style.setProperty(
        "--ciribilli-hero-offset",
        `${-(distance * 0.3).toFixed(2)}px`,
      );
      heroSection.style.setProperty(
        "--ciribilli-image-offset",
        `${-(distance * 0.09).toFixed(2)}px`,
      );
      heroSection.style.setProperty(
        "--ciribilli-copy-offset",
        `${-(distance * 0.13).toFixed(2)}px`,
      );
    };

    const requestUpdate = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };

    const remeasure = () => {
      measure();
      requestUpdate();
    };

    const images = Array.from(main.querySelectorAll("img"));
    images.forEach((image) => image.addEventListener("load", remeasure));

    const resizeObserver = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(remeasure)
      : undefined;
    resizeObserver?.observe(main);
    resizeObserver?.observe(heroSection);
    resizeObserver?.observe(contentSection);

    measure();
    update();
    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", remeasure);
    window.addEventListener("load", remeasure);

    return () => {
      window.removeEventListener("scroll", requestUpdate);
      window.removeEventListener("resize", remeasure);
      window.removeEventListener("load", remeasure);
      images.forEach((image) => image.removeEventListener("load", remeasure));
      resizeObserver?.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
      heroSection.style.removeProperty("--ciribilli-hero-offset");
      heroSection.style.removeProperty("--ciribilli-image-offset");
      heroSection.style.removeProperty("--ciribilli-copy-offset");
      main.style.removeProperty("--ciribilli-header-height");
    };
  }, [route.projectSlug, route.section]);

  const navigation = [
    { section: "home", label: pages.navigation.home, href: basePath },
    { section: "research", label: pages.navigation.research, href: `${basePath}/research` },
    { section: "members", label: pages.navigation.members, href: `${basePath}/members` },
    { section: "publications", label: pages.navigation.publications, href: `${basePath}/publications` },
    { section: "join", label: pages.navigation.join, href: `${basePath}/join` },
    { section: "contact", label: pages.navigation.contact, href: `${basePath}/contact` },
  ];

  return (
    <main ref={mainRef} className={`${photoStyles.site} ${styles.site}`} style={variables}>
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

      <section className={`${photoStyles.researchEditorial} ${styles.contentPanel}`}>
        <header className={photoStyles.researchEditorialIntro}>
          <p>{pages.research.pageLabel}</p>
          <h2>{pages.research.pageHeading}</h2>
          {pages.research.introduction && <div>{pages.research.introduction}</div>}
        </header>

        {projects.map((project, index) => (
          <article
            className={photoStyles.researchEditorialTopic}
            id={project.slug}
            key={`${project.slug}-${index}`}
            style={{ gridTemplateColumns: "1fr" }}
          >
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
          </article>
        ))}
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
