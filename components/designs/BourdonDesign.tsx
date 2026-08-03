"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { useMemo, useState } from "react";
import {
  getBourdonPages,
  type LabMember,
  type LabSite,
  type Opportunity,
  type ResearchProject,
  type SiteRoute,
} from "@/lib/sites";

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

function initials(name: string) {
  return name.split(" ").filter(Boolean).map((part) => part[0]).slice(0, 2).join("");
}

function researchProjects(site: LabSite): ResearchProject[] {
  if (site.research?.length) return site.research;
  return site.projects.map((project, index) => ({
    slug: `project-${index + 1}`,
    title: project.title,
    summary: project.description,
  }));
}

function labMembers(site: LabSite): LabMember[] {
  if (site.members?.length) return site.members;
  return site.team.map((member) => ({ ...member }));
}

function opportunities(site: LabSite): Opportunity[] {
  return site.opportunities?.filter((item) => item.title || item.description) ?? [];
}

function Portrait({ src, alt, fallback, className = "" }: { src?: string; alt: string; fallback: string; className?: string }) {
  const image = safeAsset(src);
  return image ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img className={className} src={image} alt={alt} />
  ) : (
    <div className={`bourdon-image-placeholder ${className}`}>{fallback}</div>
  );
}

function SiteHeader({ site, basePath }: { site: LabSite; basePath: string }) {
  const pages = getBourdonPages(site);
  return (
    <>
      <div className="bourdon-concept-banner">Independent concept by LabNarrative · not an official laboratory website</div>
      <header className="bourdon-header">
        <Link href={basePath} className="bourdon-identity">
          <Portrait src={pages.home.topPortrait} alt={site.piName} fallback={initials(site.piName)} className="bourdon-header-portrait" />
          <span><strong>{site.labName}</strong><small>{site.labSubtitle || `${site.department || "Research"} · ${site.institution}`}</small></span>
        </Link>
        <nav className="bourdon-nav" aria-label={`${site.labName} navigation`}>
          <Link href={basePath}>{pages.navigation.home}</Link>
          <Link href={`${basePath}/research`}>{pages.navigation.research}</Link>
          <Link href={`${basePath}/publications`}>{pages.navigation.publications}</Link>
          <Link href={`${basePath}/members`}>{pages.navigation.members}</Link>
          <Link href={`${basePath}/join`}>{pages.navigation.join}</Link>
          <Link href={`${basePath}/contact`}>{pages.navigation.contact}</Link>
        </nav>
      </header>
    </>
  );
}

function SiteFooter({ site, basePath }: { site: LabSite; basePath: string }) {
  const pages = getBourdonPages(site);
  return (
    <footer className="bourdon-footer">
      <div className="bourdon-footer-grid">
        <div><strong>{pages.home.footerLabName}</strong><span>{pages.home.footerDepartment}</span><span>{pages.home.footerInstitution}</span></div>
        <div><strong>{pages.home.footerContactHeading}</strong>{site.email && <a href={`mailto:${site.email}`}>{site.email}</a>}{site.phone && <a href={`tel:${site.phone}`}>{site.phone}</a>}</div>
        <div><strong>{pages.home.footerExploreHeading}</strong><Link href={`${basePath}/research`}>{pages.home.footerResearchLink}</Link><Link href={`${basePath}/publications`}>{pages.home.footerPublicationsLink}</Link><Link href={`${basePath}/join`}>{pages.home.footerJoinLink}</Link></div>
      </div>
      <p>{pages.home.footerNote}</p>
    </footer>
  );
}

function Home({ site, basePath }: { site: LabSite; basePath: string }) {
  const pages = getBourdonPages(site);
  const projects = researchProjects(site);
  return (
    <>
      <section className="bourdon-home-opening">
        <div className="bourdon-home-copy">
          <p className="bourdon-kicker">{pages.home.topicLine}</p>
          <h1>{pages.home.mainHeading}</h1>
          <p className="bourdon-lede">{pages.home.openingText}</p>
          <div className="bourdon-actions">
            <Link className="bourdon-primary-link" href={`${basePath}/research`}>{pages.home.researchButton}</Link>
            <Link href={`${basePath}/publications`}>{pages.home.publicationsButton}</Link>
          </div>
        </div>
        <div className="bourdon-home-hero-image">
          <Portrait src={pages.home.homepageImage} alt={`${site.labName} research`} fallback={initials(site.piName)} />
        </div>
      </section>

      <section className="bourdon-overview">
        <div><p className="bourdon-kicker">{pages.home.overviewLabel}</p><h2>{pages.home.overviewHeading}</h2><Link href={`${basePath}/research`}>{pages.home.overviewLink} →</Link></div>
        <p>{pages.home.researchOverview}</p>
      </section>

      <section className="bourdon-section">
        <div className="bourdon-section-heading"><div><p className="bourdon-kicker">{pages.home.programmesLabel}</p><h2>{pages.home.programmesHeading}</h2></div><Link href={`${basePath}/research`}>{pages.home.overviewLink} →</Link></div>
        <div className="bourdon-research-grid">
          {projects.map((project, index) => (
            <Link className="bourdon-research-card" href={`${basePath}/research/${project.slug}`} key={`${project.slug}-${index}`}>
              <span className="bourdon-card-index">{String(index + 1).padStart(2, "0")}</span>
              {safeAsset(project.figureImage) && <Portrait src={project.figureImage} alt={project.figureCaption || project.title} fallback="" />}
              <div><h3>{project.title}</h3><p>{project.summary}</p><strong>{pages.home.programmeLinkLabel} →</strong></div>
            </Link>
          ))}
        </div>
      </section>

      <section className="bourdon-pi-feature">
        <div className="bourdon-pi-image"><Portrait src={pages.home.piImage} alt={pages.home.piName} fallback={initials(pages.home.piName)} /></div>
        <div><p className="bourdon-kicker">{pages.home.piSectionLabel}</p><h2>{pages.home.piName}</h2><p className="bourdon-pi-role">{pages.home.piRole}</p><p>{pages.home.piBiography}</p><Link href={`${basePath}/members`}>{pages.home.piLinkLabel} →</Link></div>
      </section>

      <section className="bourdon-join"><p className="bourdon-kicker">{pages.home.joinLabel}</p><h2>{pages.home.joinHeading}</h2><Link className="bourdon-primary-link" href={`${basePath}/join`}>{pages.home.joinButton}</Link></section>
    </>
  );
}

function ResearchIndex({ site, basePath }: { site: LabSite; basePath: string }) {
  const pages = getBourdonPages(site);
  const projects = researchProjects(site);
  return (
    <section className="bourdon-inner">
      <header className="bourdon-inner-header"><p className="bourdon-kicker">{pages.research.pageLabel}</p><h1>{pages.research.pageHeading}</h1><p>{pages.research.introduction}</p></header>
      <div className="bourdon-project-list">
        {projects.map((project, index) => (
          <Link href={`${basePath}/research/${project.slug}`} key={`${project.slug}-${index}`}>
            <span>{String(index + 1).padStart(2, "0")}</span><div><h2>{project.title}</h2><p>{project.summary}</p>{project.question && <small>{pages.research.questionLabel}: {project.question}</small>}<strong>{pages.research.programmeLinkLabel} →</strong></div>
          </Link>
        ))}
      </div>
    </section>
  );
}

function ProjectDetail({ site, basePath, slug }: { site: LabSite; basePath: string; slug: string }) {
  const pages = getBourdonPages(site);
  const projects = researchProjects(site);
  const index = projects.findIndex((item) => item.slug === slug);
  const project = projects[index];
  if (!project) return <ResearchIndex site={site} basePath={basePath} />;
  const next = projects[(index + 1) % projects.length];
  return (
    <article className="bourdon-project-detail">
      <Link className="bourdon-back-link" href={`${basePath}/research`}>← {pages.research.backLink}</Link>
      <header><p className="bourdon-kicker">{pages.research.programmeLabel} {String(index + 1).padStart(2, "0")}</p><h1>{project.title}</h1><p>{project.summary}</p></header>
      {safeAsset(project.figureImage) && <figure><Portrait src={project.figureImage} alt={project.figureCaption || project.title} fallback="" />{project.figureCaption && <figcaption>{project.figureCaption}</figcaption>}</figure>}
      {project.question && <section className="bourdon-question"><span>{pages.research.questionLabel}</span><h2>{project.question}</h2></section>}
      {(project.body || []).map((paragraph, paragraphIndex) => <p className="bourdon-project-paragraph" key={paragraphIndex}>{paragraph}</p>)}
      {!!project.methods?.length && <section className="bourdon-detail-list"><h2>Approaches</h2><ul>{project.methods.map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}</ul></section>}
      {!!project.papers?.length && <section className="bourdon-detail-list"><h2>Selected work</h2><ul>{project.papers.map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}</ul></section>}
      {next && <Link className="bourdon-next-project" href={`${basePath}/research/${next.slug}`}><span>{pages.research.nextProgrammeLabel}</span><strong>{next.title} →</strong></Link>}
      <Link className="bourdon-return-link" href={`${basePath}/research`}>{pages.research.returnLink}</Link>
    </article>
  );
}

function Publications({ site }: { site: LabSite }) {
  const pages = getBourdonPages(site);
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return site.publications;
    return site.publications.filter((item) => `${item.title} ${item.journal} ${item.year}`.toLowerCase().includes(term));
  }, [query, site.publications]);
  return (
    <section className="bourdon-inner">
      <header className="bourdon-inner-header"><p className="bourdon-kicker">{pages.publications.pageLabel}</p><h1>{pages.publications.pageHeading}</h1><p>{pages.publications.introduction}</p></header>
      <div className="bourdon-publication-controls"><label><span>{pages.publications.searchLabel}</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={pages.publications.searchPlaceholder} /></label>{site.pubmedUrl && <a href={site.pubmedUrl} target="_blank" rel="noreferrer">{pages.publications.pubmedButton} ↗</a>}</div>
      <div className="bourdon-publication-list">
        {filtered.length ? filtered.map((publication, index) => <article key={`${publication.title}-${index}`}><span>{publication.year}</span><div><h2>{publication.href ? <a href={publication.href} target="_blank" rel="noreferrer">{publication.title}</a> : publication.title}</h2><p>{publication.journal}</p></div></article>) : <p className="bourdon-empty">{pages.publications.noResults}</p>}
      </div>
    </section>
  );
}

function Members({ site }: { site: LabSite }) {
  const pages = getBourdonPages(site);
  const members = labMembers(site);
  return (
    <section className="bourdon-inner">
      <header className="bourdon-inner-header"><p className="bourdon-kicker">{pages.members.pageLabel}</p><h1>{pages.members.pageHeading}</h1><p>{pages.members.introduction}</p></header>
      <div className="bourdon-member-grid">
        {members.map((member, index) => <article className={index === 0 ? "principal" : ""} key={`${member.name}-${index}`}><Portrait src={member.image} alt={member.name} fallback={initials(member.name || member.role)} /><div><span>{index === 0 ? "Principal investigator" : member.role}</span><h2>{member.name}</h2><p>{member.bio}</p>{member.href && <a href={member.href} target="_blank" rel="noreferrer">{pages.members.profileLinkLabel} ↗</a>}</div></article>)}
      </div>
      <aside className="bourdon-member-notice"><strong>{pages.members.noticeHeading}</strong><p>{pages.members.noticeText}</p></aside>
    </section>
  );
}

function Join({ site, basePath }: { site: LabSite; basePath: string }) {
  const pages = getBourdonPages(site);
  const items = opportunities(site);
  return (
    <section className="bourdon-inner">
      <header className="bourdon-inner-header"><p className="bourdon-kicker">{pages.join.pageLabel}</p><h1>{pages.join.pageHeading}</h1><p>{pages.join.introduction}</p></header>
      <section className="bourdon-guidance"><p className="bourdon-kicker">{pages.join.guidanceLabel}</p><h2>{pages.join.guidanceHeading}</h2><p>{pages.join.guidanceText}</p><Link className="bourdon-primary-link" href={`${basePath}/contact`}>{pages.join.contactButton}</Link></section>
      <div className="bourdon-opportunity-list">{items.map((item, index) => <article key={`${item.title}-${index}`}><span>{item.status}</span><h2>{item.title}</h2><p>{item.description}</p>{item.href && <a href={item.href} target="_blank" rel="noreferrer">{item.linkLabel || "Learn more"} ↗</a>}</article>)}</div>
    </section>
  );
}

function Contact({ site }: { site: LabSite }) {
  const pages = getBourdonPages(site);
  return (
    <section className="bourdon-inner">
      <header className="bourdon-inner-header"><p className="bourdon-kicker">{pages.contact.pageLabel}</p><h1>{pages.contact.pageHeading}</h1><p>{pages.contact.introduction}</p></header>
      <div className="bourdon-contact-layout">
        <div className="bourdon-contact-pi"><Portrait src={pages.contact.piImage} alt={pages.contact.piName} fallback={initials(pages.contact.piName)} /><div><h2>{pages.contact.piName}</h2><span>{pages.contact.piRole}</span><p>{pages.contact.piBiography}</p></div></div>
        <div className="bourdon-contact-details"><dl><div><dt>{pages.contact.laboratoryLabel}</dt><dd>{site.labName}<br />{pages.contact.department}<br />{pages.contact.institution}</dd></div>{pages.contact.address && <div><dt>Address</dt><dd>{pages.contact.address}</dd></div>}{pages.contact.email && <div><dt>{pages.contact.emailLabel}</dt><dd><a href={`mailto:${pages.contact.email}`}>{pages.contact.email}</a></dd></div>}{pages.contact.phone && <div><dt>{pages.contact.telephoneLabel}</dt><dd><a href={`tel:${pages.contact.phone}`}>{pages.contact.phone}</a></dd></div>}{pages.contact.officialProfile && <div><dt>{pages.contact.profileLabel}</dt><dd><a href={pages.contact.officialProfile} target="_blank" rel="noreferrer">{pages.contact.profileLinkText} ↗</a></dd></div>}</dl>{pages.contact.email && <a className="bourdon-primary-link" href={`mailto:${pages.contact.email}`}>{pages.contact.emailButton}</a>}</div>
      </div>
      {(pages.contact.locationName || pages.contact.latitude || pages.contact.longitude) && <div className="bourdon-location-strip"><strong>{pages.contact.locationName}</strong><span>{pages.contact.latitude}</span><span>{pages.contact.longitude}</span><span>{pages.contact.locationSuffix}</span></div>}
    </section>
  );
}

export default function BourdonDesign({ site, route, basePath, previewMode = false }: { site: LabSite; route: SiteRoute; basePath: string; previewMode?: boolean }) {
  const variables = {
    "--bourdon-bg": site.theme.background,
    "--bourdon-surface": site.theme.surface,
    "--bourdon-ink": site.theme.foreground,
    "--bourdon-muted": site.theme.muted,
    "--bourdon-accent": site.theme.accent,
  } as CSSProperties;
  return (
    <main className="bourdon-site" style={variables}>
      {previewMode && <div className="bourdon-preview-banner">Private administrator preview · this draft is not publicly visible</div>}
      <SiteHeader site={site} basePath={basePath} />
      <div className="bourdon-page-shell">
        {route.section === "home" && <Home site={site} basePath={basePath} />}
        {route.section === "research" && (route.projectSlug ? <ProjectDetail site={site} basePath={basePath} slug={route.projectSlug} /> : <ResearchIndex site={site} basePath={basePath} />)}
        {route.section === "publications" && <Publications site={site} />}
        {route.section === "members" && <Members site={site} />}
        {route.section === "join" && <Join site={site} basePath={basePath} />}
        {route.section === "contact" && <Contact site={site} />}
      </div>
      <SiteFooter site={site} basePath={basePath} />
    </main>
  );
}
