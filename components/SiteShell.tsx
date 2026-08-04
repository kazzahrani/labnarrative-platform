import Link from "next/link";
import type { CSSProperties } from "react";
import BourdonDesign from "@/components/designs/BourdonDesign";
import EditorialImageDesign from "@/components/designs/EditorialImageDesign";
import EngelandDesign from "@/components/designs/EngelandDesign";
import {
  resolveDesignKey,
  type LabSite,
  type SiteRoute,
  type SiteTemplate,
} from "@/lib/sites";

function resolveTemplate(value: LabSite["template"]): SiteTemplate {
  return value === "editorial"
    || value === "image-led"
    || value === "institutional"
    || value === "scientific-minimal"
    || value === "bourdon-full"
    ? value
    : "scientific-minimal";
}

function safeImageUrl(value: LabSite["heroImage"]): string | undefined {
  if (!value) return undefined;
  if (/^data:image\/(png|jpe?g|webp|gif);base64,[a-z0-9+/=\s]+$/i.test(value)) return value;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function initials(name: string) {
  return name.split(" ").filter(Boolean).map((part) => part[0]).slice(0, 2).join("");
}

function SiteNav({ site, basePath }: { site: LabSite; basePath: string }) {
  return (
    <nav className="site-nav" aria-label={`${site.labName} navigation`}>
      <Link href={basePath}>Home</Link>
      <Link href={`${basePath}/research`}>Research</Link>
      <Link href={`${basePath}/members`}>Team</Link>
      <Link href={`${basePath}/publications`}>Publications</Link>
    </nav>
  );
}

function Home({ site }: { site: LabSite }) {
  const heroImage = safeImageUrl(site.heroImage);
  return (
    <>
      <section className="hero">
        <div className="hero-copy"><p className="eyebrow">{site.eyebrow}</p><h1>{site.headline}</h1><p className="introduction">{site.introduction}</p><div className="focus-list">{site.focusAreas.map((area) => <span key={area}>{area}</span>)}</div></div>
        <aside className="pi-card"><div className={`portrait-mark${heroImage ? " has-image" : ""}`}>{heroImage ? <img src={heroImage} alt={`${site.piName} or ${site.labName}`} /> : initials(site.piName)}</div><div className="pi-card-copy"><p className="card-label">Principal Investigator</p><h2>{site.piName}</h2><p>{site.title}</p><p>{site.institution}</p></div></aside>
      </section>
      <section className="section-block"><div><p className="eyebrow">Research programme</p><h2>{site.projects.length} connected lines of investigation.</h2></div><div className="grid-three">{site.projects.map((project, index) => <article className="content-card" key={`${project.title}-${index}`}><span className="card-number">{String(index + 1).padStart(2, "0")}</span><h3>{project.title}</h3><p>{project.description}</p></article>)}</div></section>
    </>
  );
}

function Research({ site }: { site: LabSite }) {
  return <section className="inner-page"><p className="eyebrow">Research</p><h1>Questions that organise the laboratory.</h1><div className="stacked-list">{site.projects.map((project, index) => <article key={`${project.title}-${index}`}><span>{String(index + 1).padStart(2, "0")}</span><div><h2>{project.title}</h2><p>{project.description}</p></div></article>)}</div></section>;
}

function Team({ site }: { site: LabSite }) {
  return <section className="inner-page"><p className="eyebrow">People</p><h1>The team behind the research.</h1><div className="grid-three">{site.team.map((member, index) => <article className="content-card" key={`${member.name}-${member.role}-${index}`}><div className="member-mark">{member.name.slice(0, 1)}</div><h2>{member.name}</h2><p>{member.role}</p></article>)}</div></section>;
}

function Publications({ site }: { site: LabSite }) {
  return <section className="inner-page"><p className="eyebrow">Selected work</p><h1>Publications and research outputs.</h1><div className="publication-list">{site.publications.map((publication, index) => <article key={`${publication.title}-${publication.year}-${index}`}><span>{publication.year}</span><div><h2>{publication.href ? <a href={publication.href} target="_blank" rel="noreferrer">{publication.title}</a> : publication.title}</h2><p>{publication.journal}</p></div></article>)}</div></section>;
}

export default function SiteShell({ site, route, basePath, previewMode = false }: { site: LabSite; route: SiteRoute; basePath?: string; previewMode?: boolean }) {
  const resolvedBasePath = basePath ?? `/sites/${site.slug}`;
  const designKey = resolveDesignKey(site);
  const designVariant = site.design?.settings?.variant;

  if (designVariant === "engeland-modern-v1") {
    return <EngelandDesign site={site} route={route} basePath={resolvedBasePath} previewMode={previewMode} />;
  }

  if (designVariant === "editorial-image-v1") {
    return <EditorialImageDesign site={site} route={route} basePath={resolvedBasePath} previewMode={previewMode} />;
  }

  if (designKey === "bourdon-full") return <BourdonDesign site={site} route={route} basePath={resolvedBasePath} previewMode={previewMode} />;

  const template = resolveTemplate(site.template);
  const variables = {
    "--site-background": site.theme.background,
    "--site-surface": site.theme.surface,
    "--site-foreground": site.theme.foreground,
    "--site-muted": site.theme.muted,
    "--site-accent": site.theme.accent,
  } as CSSProperties;

  return (
    <main className={`site-theme site-template-${template}`} style={variables}>
      <div className="prototype-banner">{previewMode ? "Private administrator preview · this draft is not publicly visible" : "LabNarrative concept · prepared as an independent design proposal"}</div>
      <header className="site-header"><Link className="wordmark" href={resolvedBasePath}>{site.labName}</Link><SiteNav site={site} basePath={resolvedBasePath} /></header>
      {route.section === "home" && <Home site={site} />}
      {route.section === "research" && <Research site={site} />}
      {route.section === "members" && <Team site={site} />}
      {route.section === "publications" && <Publications site={site} />}
      {(route.section === "join" || route.section === "contact") && <Home site={site} />}
      <footer className="site-footer"><span>{site.labName}</span><span>Powered by LabNarrative</span></footer>
    </main>
  );
}
