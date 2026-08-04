"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import BourdonDesign from "@/components/designs/BourdonDesign";
import {
  getBourdonDesignSettings,
  getBourdonPages,
  type BourdonDesignSettings,
  type LabSite,
  type ResearchProject,
  type SiteRoute,
} from "@/lib/sites";

type SourcedResearchProject = ResearchProject & {
  figureAlt?: string;
  figureSource?: string;
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

function initials(name: string): string {
  return name.split(" ").filter(Boolean).map((part) => part[0]).slice(0, 2).join("");
}

function researchProjects(site: LabSite): SourcedResearchProject[] {
  if (site.research?.length) return site.research as SourcedResearchProject[];
  return site.projects.map((project, index) => ({
    slug: `project-${index + 1}`,
    title: project.title,
    summary: project.description,
  }));
}

function Picture({ src, alt, fallback = "", className = "" }: { src?: string; alt: string; fallback?: string; className?: string }) {
  const image = safeAsset(src);
  return image ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img className={className} src={image} alt={alt} />
  ) : (
    <div className={`bn-person-placeholder ${className}`} aria-label={alt}><span>{fallback}</span></div>
  );
}

function SiteHeader({ site, route, basePath }: { site: LabSite; route: SiteRoute; basePath: string }) {
  const pages = getBourdonPages(site);
  const nav: Array<{ key: SiteRoute["section"]; label: string; href: string }> = [
    { key: "home", label: pages.navigation.home, href: basePath },
    { key: "research", label: pages.navigation.research, href: `${basePath}/research` },
    { key: "publications", label: pages.navigation.publications, href: `${basePath}/publications` },
    { key: "members", label: pages.navigation.members, href: `${basePath}/members` },
    { key: "join", label: pages.navigation.join, href: `${basePath}/join` },
    { key: "contact", label: pages.navigation.contact, href: `${basePath}/contact` },
  ];
  return (
    <header className="bn-site-header">
      <div className="bn-header-inner">
        <Link href={basePath} className="bn-wordmark" aria-label={`${site.labName} home`}>
          <span className="bn-wordmark-mark"><Picture src={pages.home.topPortrait} alt="" fallback={initials(site.piName)} /></span>
          <span><strong>{site.labName}</strong><small>{site.labSubtitle || `${site.department || "Research"} · ${site.institution}`}</small></span>
        </Link>
        <nav aria-label="Main navigation">
          {nav.map((item) => <Link className={route.section === item.key ? "active" : ""} href={item.href} key={item.key}>{item.label}</Link>)}
        </nav>
      </div>
    </header>
  );
}

function SiteFooter({ site, basePath }: { site: LabSite; basePath: string }) {
  const pages = getBourdonPages(site);
  return (
    <footer className="bn-footer">
      <div className="bn-page-shell bn-footer-main">
        <div><strong>{pages.home.footerLabName}</strong><p className="bn-preserve-lines">{`${pages.home.footerDepartment}\n${pages.home.footerInstitution}`}</p></div>
        <div><span>{pages.home.footerContactHeading}</span>{site.email && <a href={`mailto:${site.email}`}>{site.email}</a>}{site.phone && <p>{site.phone}</p>}</div>
        <div><span>{pages.home.footerExploreHeading}</span><Link href={`${basePath}/research`}>{pages.home.footerResearchLink}</Link><Link href={`${basePath}/publications`}>{pages.home.footerPublicationsLink}</Link><Link href={`${basePath}/join`}>{pages.home.footerJoinLink}</Link></div>
      </div>
      <div className="bn-page-shell bn-footer-bottom"><span>{pages.home.footerNote}</span><span>© {new Date().getFullYear()} {site.labName}</span></div>
    </footer>
  );
}

function PageIntro({ label, title, text, style }: { label: string; title: string; text: string; style: BourdonDesignSettings["pageIntroStyle"] }) {
  return <section className={`bn-page-intro style-${style}`}><div className="bn-page-shell"><p className="bn-eyebrow">{label}</p><h1>{title}</h1><p className="bn-intro-text">{text}</p></div></section>;
}

function FigureCaption({ project }: { project: SourcedResearchProject }) {
  const source = safeAsset(project.figureSource);
  if (!project.figureCaption && !source) return null;
  return (
    <figcaption className="bn-sourced-figure-caption">
      {project.figureCaption && <span>{project.figureCaption}</span>}
      {source && <a href={source} target="_blank" rel="noreferrer">View source publication ↗</a>}
    </figcaption>
  );
}

function ResearchIndex({ site, basePath, settings }: { site: LabSite; basePath: string; settings: BourdonDesignSettings }) {
  const pages = getBourdonPages(site);
  const projects = researchProjects(site);
  return (
    <>
      <PageIntro label={pages.research.pageLabel} title={pages.research.pageHeading} text={pages.research.introduction} style={settings.pageIntroStyle} />
      <section className="bn-research-page bn-page-shell">
        {projects.map((project, index) => {
          const figure = settings.researchIndexLayout === "text-only" ? undefined : safeAsset(project.figureImage);
          const articleClass = [figure ? "has-figure" : "", settings.researchIndexLayout === "alternating" ? "layout-alternating" : "", settings.researchIndexLayout === "alternating" && index % 2 === 1 ? "is-even" : ""].filter(Boolean).join(" ");
          return (
            <article className={articleClass} key={`${project.slug}-${index}`}>
              <span className="bn-research-number">{String(index + 1).padStart(2, "0")}</span>
              <div>
                <h2>{project.title}</h2><p>{project.summary}</p>
                {project.question && <><h3>{pages.research.questionLabel}</h3><blockquote>{project.question}</blockquote></>}
                <Link className="bn-text-link" href={`${basePath}/research/${project.slug}`}>{pages.research.programmeLinkLabel} <span>→</span></Link>
              </div>
              {figure && <figure className="bn-research-card-figure"><Picture src={figure} alt={project.figureAlt || project.figureCaption || project.title} /><FigureCaption project={project} /></figure>}
            </article>
          );
        })}
      </section>
    </>
  );
}

function ProjectDetail({ site, basePath, slug, settings }: { site: LabSite; basePath: string; slug: string; settings: BourdonDesignSettings }) {
  const pages = getBourdonPages(site);
  const projects = researchProjects(site);
  const index = projects.findIndex((item) => item.slug === slug);
  const project = projects[index];
  if (!project) return <ResearchIndex site={site} basePath={basePath} settings={settings} />;
  const next = projects[(index + 1) % projects.length];
  const figure = safeAsset(project.figureImage);
  return (
    <>
      <section className={`bn-project-intro style-${settings.pageIntroStyle}`}><div className="bn-page-shell"><Link className="bn-back-link" href={`${basePath}/research`}>← {pages.research.backLink}</Link><p className="bn-eyebrow">{pages.research.programmeLabel} {String(index + 1).padStart(2, "0")}</p><h1>{project.title}</h1><p>{project.summary}</p></div></section>
      <section className={`bn-project-content bn-page-shell layout-${settings.projectLayout}`}><div><p className="bn-eyebrow">{pages.research.questionLabel}</p><h2>{project.question || project.title}</h2></div><div>{(project.body || []).map((paragraph, paragraphIndex) => <p key={paragraphIndex}>{paragraph}</p>)}</div></section>
      {figure && <section className="bn-figure-wrap bn-page-shell"><figure className="bn-research-figure"><Picture src={figure} alt={project.figureAlt || project.figureCaption || project.title} /><FigureCaption project={project} /></figure></section>}
      {(!!project.methods?.length || !!project.papers?.length) && <section className="bn-project-lists bn-page-shell">
        {!!project.methods?.length && <div><p className="bn-eyebrow">Approaches</p><ul>{project.methods.map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}</ul></div>}
        {!!project.papers?.length && <div><p className="bn-eyebrow">Selected work</p><ul>{project.papers.map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}</ul></div>}
      </section>}
      <section className="bn-next-programme bn-page-shell">{next && <Link href={`${basePath}/research/${next.slug}`}>{pages.research.nextProgrammeLabel}<span>{next.title} →</span></Link>}<Link className="bn-return-link" href={`${basePath}/research`}>{pages.research.returnLink}</Link></section>
    </>
  );
}

export default function SourcedBourdonResearchDesign({ site, route, basePath, previewMode = false }: { site: LabSite; route: SiteRoute; basePath: string; previewMode?: boolean }) {
  if (route.section !== "research") return <BourdonDesign site={site} route={route} basePath={basePath} previewMode={previewMode} />;
  const settings = getBourdonDesignSettings(site);
  const variables = { "--bn-paper": site.theme.background, "--bn-white": site.theme.surface, "--bn-navy": site.theme.foreground, "--bn-muted": site.theme.muted, "--bn-teal": site.theme.accent } as CSSProperties;
  return (
    <main className={`bourdon-site bn-site spacing-${settings.sectionSpacing} corners-${settings.cornerStyle}`} style={variables}>
      <style>{`.bn-sourced-figure-caption{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:16px;align-items:start}.bn-sourced-figure-caption a{color:var(--bn-teal);font-weight:700;text-decoration:none;white-space:nowrap}.bn-sourced-figure-caption a:hover{text-decoration:underline}@media(max-width:760px){.bn-sourced-figure-caption{grid-template-columns:1fr}.bn-sourced-figure-caption a{white-space:normal}}`}</style>
      {previewMode && <div className="bn-preview-badge">Private administrator preview · Draft</div>}
      <SiteHeader site={site} route={route} basePath={basePath} />
      {route.projectSlug ? <ProjectDetail site={site} basePath={basePath} slug={route.projectSlug} settings={settings} /> : <ResearchIndex site={site} basePath={basePath} settings={settings} />}
      <SiteFooter site={site} basePath={basePath} />
    </main>
  );
}
