"use client";

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { useMemo, useState } from "react";
import {
  getBourdonDesignSettings,
  getBourdonPages,
  type BourdonDesignSettings,
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
  return name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join("");
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

function openOpportunities(site: LabSite): Opportunity[] {
  return site.opportunities?.filter((item) => item.title || item.description) ?? [];
}

function Picture({
  src,
  alt,
  fallback,
  className = "",
}: {
  src?: string;
  alt: string;
  fallback: string;
  className?: string;
}) {
  const image = safeAsset(src);
  return image ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img className={className} src={image} alt={alt} />
  ) : (
    <div className={`bn-person-placeholder ${className}`} aria-label={alt}>
      <span>{fallback}</span>
    </div>
  );
}

function PageIntro({ label, title, text, style }: { label: string; title: string; text: string; style: BourdonDesignSettings["pageIntroStyle"] }) {
  return (
    <section className={`bn-page-intro style-${style}`}>
      <div className="bn-page-shell">
        <p className="bn-eyebrow">{label}</p>
        <h1>{title}</h1>
        <p className="bn-intro-text">{text}</p>
      </div>
    </section>
  );
}

function activeSection(route: SiteRoute): SiteRoute["section"] {
  return route.section;
}

function SiteHeader({ site, route, basePath }: { site: LabSite; route: SiteRoute; basePath: string }) {
  const pages = getBourdonPages(site);
  const active = activeSection(route);
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
          <span className="bn-wordmark-mark">
            <Picture
              src={pages.home.topPortrait}
              alt=""
              fallback={initials(site.piName)}
            />
          </span>
          <span>
            <strong>{site.labName}</strong>
            <small>{site.labSubtitle || `${site.department || "Research"} · ${site.institution}`}</small>
          </span>
        </Link>
        <nav aria-label="Main navigation">
          {nav.map((item) => (
            <Link className={active === item.key ? "active" : ""} href={item.href} key={item.key}>
              {item.label}
            </Link>
          ))}
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
        <div>
          <strong>{pages.home.footerLabName}</strong>
          <p className="bn-preserve-lines">{`${pages.home.footerDepartment}\n${pages.home.footerInstitution}`}</p>
        </div>
        <div>
          <span>{pages.home.footerContactHeading}</span>
          {site.email && <a href={`mailto:${site.email}`}>{site.email}</a>}
          {site.phone && <p>{site.phone}</p>}
        </div>
        <div>
          <span>{pages.home.footerExploreHeading}</span>
          <Link href={`${basePath}/research`}>{pages.home.footerResearchLink}</Link>
          <Link href={`${basePath}/publications`}>{pages.home.footerPublicationsLink}</Link>
          <Link href={`${basePath}/join`}>{pages.home.footerJoinLink}</Link>
        </div>
      </div>
      <div className="bn-page-shell bn-footer-bottom">
        <span>{pages.home.footerNote}</span>
        <span>© {new Date().getFullYear()} {site.labName}</span>
      </div>
    </footer>
  );
}

function Home({ site, basePath, settings }: { site: LabSite; basePath: string; settings: BourdonDesignSettings }) {
  const pages = getBourdonPages(site);
  const projects = researchProjects(site);
  return (
    <>
      <section className={`bn-home-hero layout-${settings.homeHeroLayout}`}>
        <div className={`bn-page-shell bn-hero-grid layout-${settings.homeHeroLayout}`}>
          <div className="bn-hero-content">
            <p className="bn-eyebrow">{pages.home.topicLine}</p>
            <h1>{pages.home.mainHeading}</h1>
            <p>{pages.home.openingText}</p>
            <div className="bn-button-row">
              <Link href={`${basePath}/research`} className="bn-button primary">{pages.home.researchButton}</Link>
              <Link href={`${basePath}/publications`} className="bn-button">{pages.home.publicationsButton}</Link>
            </div>
          </div>
          {settings.homeHeroLayout !== "text-only" && (
            <div className="bn-hero-visual">
              <Picture
                src={pages.home.homepageImage}
                alt={`${site.labName} research`}
                fallback={initials(site.piName)}
              />
            </div>
          )}
        </div>
      </section>

      <section className="bn-home-overview bn-page-shell">
        <div>
          <p className="bn-eyebrow">{pages.home.overviewLabel}</p>
          <h2 className="bn-preserve-lines">{pages.home.overviewHeading}</h2>
        </div>
        <div>
          <p>{pages.home.researchOverview}</p>
          <Link href={`${basePath}/research`} className="bn-text-link">
            {pages.home.overviewLink} <span>→</span>
          </Link>
        </div>
      </section>

      <section className={`bn-home-programmes layout-${settings.programmesLayout}`}>
        <div className="bn-page-shell">
          <div className="bn-section-title">
            <div>
              <p className="bn-eyebrow">{pages.home.programmesLabel}</p>
              <h2>{pages.home.programmesHeading}</h2>
            </div>
          </div>
          <div className={`bn-programme-grid layout-${settings.programmesLayout}`}>
            {projects.map((project, index) => (
              <Link href={`${basePath}/research/${project.slug}`} key={`${project.slug}-${index}`}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <h3>{project.title}</h3>
                <p>{project.summary}</p>
                <b>{pages.home.programmeLinkLabel} →</b>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className={`bn-pi-home bn-page-shell layout-${settings.piLayout}`}>
        {settings.piLayout !== "text-only" && (
          <Picture
            className="bn-person-image"
            src={pages.home.piImage}
            alt={pages.home.piName}
            fallback={initials(pages.home.piName)}
          />
        )}
        <div>
          <p className="bn-eyebrow">{pages.home.piSectionLabel}</p>
          <h2>{pages.home.piName}</h2>
          <h3>{pages.home.piRole}</h3>
          <p>{pages.home.piBiography}</p>
          <Link href={`${basePath}/members`} className="bn-text-link">
            {pages.home.piLinkLabel} <span>→</span>
          </Link>
        </div>
      </section>

      <section className="bn-join-strip">
        <div className="bn-page-shell">
          <div>
            <p className="bn-eyebrow">{pages.home.joinLabel}</p>
            <h2>{pages.home.joinHeading}</h2>
          </div>
          <Link href={`${basePath}/join`} className="bn-button light">{pages.home.joinButton}</Link>
        </div>
      </section>
    </>
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
          const articleClass = [
            figure ? "has-figure" : "",
            settings.researchIndexLayout === "alternating" ? "layout-alternating" : "",
            settings.researchIndexLayout === "alternating" && index % 2 === 1 ? "is-even" : "",
          ].filter(Boolean).join(" ");
          return (
            <article className={articleClass} key={`${project.slug}-${index}`}>
              <span className="bn-research-number">{String(index + 1).padStart(2, "0")}</span>
              <div>
                <h2>{project.title}</h2>
                <p>{project.summary}</p>
                {project.question && (
                  <>
                    <h3>{pages.research.questionLabel}</h3>
                    <blockquote>{project.question}</blockquote>
                  </>
                )}
                <Link className="bn-text-link" href={`${basePath}/research/${project.slug}`}>
                  {pages.research.programmeLinkLabel} <span>→</span>
                </Link>
              </div>
              {figure && (
                <figure className="bn-research-card-figure">
                  <Picture src={figure} alt={project.figureCaption || project.title} fallback="" />
                  {project.figureCaption && <figcaption>{project.figureCaption}</figcaption>}
                </figure>
              )}
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
      <section className={`bn-project-intro style-${settings.pageIntroStyle}`}>
        <div className="bn-page-shell">
          <Link className="bn-back-link" href={`${basePath}/research`}>← {pages.research.backLink}</Link>
          <p className="bn-eyebrow">{pages.research.programmeLabel} {String(index + 1).padStart(2, "0")}</p>
          <h1>{project.title}</h1>
          <p>{project.summary}</p>
        </div>
      </section>

      <section className={`bn-project-content bn-page-shell layout-${settings.projectLayout}`}>
        <div>
          <p className="bn-eyebrow">{pages.research.questionLabel}</p>
          <h2>{project.question || project.title}</h2>
        </div>
        <div>
          {(project.body || []).map((paragraph, paragraphIndex) => <p key={paragraphIndex}>{paragraph}</p>)}
        </div>
      </section>

      {figure && (
        <section className="bn-figure-wrap bn-page-shell">
          <figure className="bn-research-figure">
            <Picture src={figure} alt={project.figureCaption || project.title} fallback="" />
            {project.figureCaption && <figcaption>{project.figureCaption}</figcaption>}
          </figure>
        </section>
      )}

      {(!!project.methods?.length || !!project.papers?.length) && (
        <section className="bn-project-lists bn-page-shell">
          {!!project.methods?.length && (
            <div>
              <p className="bn-eyebrow">Approaches</p>
              <ul>{project.methods.map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}</ul>
            </div>
          )}
          {!!project.papers?.length && (
            <div>
              <p className="bn-eyebrow">Selected work</p>
              <ul>{project.papers.map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}</ul>
            </div>
          )}
        </section>
      )}

      <section className="bn-next-programme bn-page-shell">
        {next && (
          <Link href={`${basePath}/research/${next.slug}`}>
            {pages.research.nextProgrammeLabel}
            <span>{next.title} →</span>
          </Link>
        )}
        <Link className="bn-return-link" href={`${basePath}/research`}>{pages.research.returnLink}</Link>
      </section>
    </>
  );
}

function PublicationRow({ children, href }: { children: ReactNode; href?: string }) {
  return href ? <a href={href} target="_blank" rel="noreferrer">{children}</a> : <div className="bn-publication-row">{children}</div>;
}

function Publications({ site, settings }: { site: LabSite; settings: BourdonDesignSettings }) {
  const pages = getBourdonPages(site);
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return site.publications;
    return site.publications.filter((item) => `${item.title} ${item.journal} ${item.year}`.toLowerCase().includes(term));
  }, [query, site.publications]);

  return (
    <>
      <PageIntro label={pages.publications.pageLabel} title={pages.publications.pageHeading} text={pages.publications.introduction} style={settings.pageIntroStyle} />
      <section className="bn-publication-page bn-page-shell">
        <div className="bn-publication-tools">
          <label>
            <span>{pages.publications.searchLabel}</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={pages.publications.searchPlaceholder} />
          </label>
          {site.pubmedUrl && <a className="bn-text-link" href={site.pubmedUrl} target="_blank" rel="noreferrer">{pages.publications.pubmedButton} ↗</a>}
        </div>
        <div className="bn-publication-list">
          {filtered.length ? filtered.map((publication, index) => (
            <PublicationRow href={publication.href} key={`${publication.title}-${index}`}>
              <time>{publication.year}</time>
              <div>
                <h2>{publication.title}</h2>
                <p>{publication.journal}</p>
              </div>
              <span>↗</span>
            </PublicationRow>
          )) : <p className="bn-no-results">{pages.publications.noResults}</p>}
        </div>
      </section>
    </>
  );
}

function MemberContent({ member, roleLabel, linkLabel }: { member: LabMember; roleLabel: string; linkLabel: string }) {
  return (
    <div>
      <p className="bn-member-role">{roleLabel}</p>
      <h2>{member.name}</h2>
      <p>{member.bio}</p>
      {member.href && <a className="bn-text-link" href={member.href} target="_blank" rel="noreferrer">{linkLabel} ↗</a>}
    </div>
  );
}

function Members({ site, settings }: { site: LabSite; settings: BourdonDesignSettings }) {
  const pages = getBourdonPages(site);
  const members = labMembers(site);
  const principal = members[0];
  const additional = members.slice(1);

  return (
    <>
      <PageIntro label={pages.members.pageLabel} title={pages.members.pageHeading} text={pages.members.introduction} style={settings.pageIntroStyle} />
      {principal && (
        <section className="bn-principal-member bn-page-shell">
          <article>
            <Picture className="bn-person-image" src={principal.image} alt={principal.name} fallback={initials(principal.name || principal.role)} />
            <MemberContent member={principal} roleLabel="Principal investigator" linkLabel={pages.members.profileLinkLabel} />
          </article>
        </section>
      )}
      {!!additional.length && (
        <section className={`bn-members-grid bn-page-shell columns-${settings.membersColumns}`}>
          {additional.map((member, index) => (
            <article key={`${member.name}-${index}`}>
              <Picture className="bn-person-image" src={member.image} alt={member.name} fallback={initials(member.name || member.role)} />
              <MemberContent member={member} roleLabel={member.role} linkLabel={pages.members.profileLinkLabel} />
            </article>
          ))}
        </section>
      )}
      <aside className="bn-team-note">
        <div className="bn-page-shell">
          <p className="bn-eyebrow">{pages.members.noticeHeading}</p>
          <h2>{pages.members.noticeText}</h2>
        </div>
      </aside>
    </>
  );
}

function Join({ site, basePath, settings }: { site: LabSite; basePath: string; settings: BourdonDesignSettings }) {
  const pages = getBourdonPages(site);
  const items = openOpportunities(site);
  return (
    <>
      <PageIntro label={pages.join.pageLabel} title={pages.join.pageHeading} text={pages.join.introduction} style={settings.pageIntroStyle} />
      <section className="bn-opportunity-page bn-page-shell">
        {items.map((item, index) => (
          <article key={`${item.title}-${index}`}>
            <span className="bn-opportunity-status">{item.status}</span>
            <h2>{item.title}</h2>
            <p>{item.description}</p>
            {item.href && <a className="bn-text-link" href={item.href} target="_blank" rel="noreferrer">{item.linkLabel || "Learn more"} ↗</a>}
          </article>
        ))}
      </section>
      <section className="bn-application-note">
        <div className="bn-page-shell">
          <p className="bn-eyebrow">{pages.join.guidanceLabel}</p>
          <h2>{pages.join.guidanceHeading}</h2>
          <p>{pages.join.guidanceText}</p>
          <Link className="bn-button light" href={`${basePath}/contact`}>{pages.join.contactButton}</Link>
        </div>
      </section>
    </>
  );
}

function Contact({ site, settings }: { site: LabSite; settings: BourdonDesignSettings }) {
  const pages = getBourdonPages(site);
  return (
    <>
      <PageIntro label={pages.contact.pageLabel} title={pages.contact.pageHeading} text={pages.contact.introduction} style={settings.pageIntroStyle} />
      <section className="bn-contact-page bn-page-shell">
        <div className="bn-contact-card">
          <h2>{pages.contact.piName}</h2>
          <h3>{pages.contact.piRole}</h3>
          <p>{pages.contact.piBiography}</p>
          <p className="bn-address-lines">{pages.contact.address}</p>
        </div>
        <div className="bn-contact-details">
          <div>
            <span>{pages.contact.laboratoryLabel}</span>
            <p>{site.labName}<br />{pages.contact.department}<br />{pages.contact.institution}</p>
          </div>
          {pages.contact.email && <div><span>{pages.contact.emailLabel}</span><a href={`mailto:${pages.contact.email}`}>{pages.contact.email}</a></div>}
          {pages.contact.phone && <div><span>{pages.contact.telephoneLabel}</span><p>{pages.contact.phone}</p></div>}
          {pages.contact.officialProfile && <div><span>{pages.contact.profileLabel}</span><a href={pages.contact.officialProfile} target="_blank" rel="noreferrer">{pages.contact.profileLinkText} ↗</a></div>}
          {pages.contact.pubmedRecord && <div><span>Publications</span><a href={pages.contact.pubmedRecord} target="_blank" rel="noreferrer">PubMed record ↗</a></div>}
          {pages.contact.email && <a className="bn-button primary" href={`mailto:${pages.contact.email}`}>{pages.contact.emailButton}</a>}
        </div>
      </section>
      {(pages.contact.locationName || pages.contact.latitude || pages.contact.longitude || pages.contact.locationSuffix) && (
        <section className="bn-contact-map">
          <div className="bn-page-shell">
            <span>{pages.contact.locationName}</span>
            <i />
            {pages.contact.latitude && <strong>{pages.contact.latitude}</strong>}
            {pages.contact.longitude && <strong>{pages.contact.longitude}</strong>}
            {pages.contact.locationSuffix && <span>{pages.contact.locationSuffix}</span>}
          </div>
        </section>
      )}
    </>
  );
}

export default function BourdonDesign({
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
  const settings = getBourdonDesignSettings(site);
  const variables = {
    "--bn-paper": site.theme.background,
    "--bn-white": site.theme.surface,
    "--bn-navy": site.theme.foreground,
    "--bn-muted": site.theme.muted,
    "--bn-teal": site.theme.accent,
  } as CSSProperties;

  return (
    <main className={`bourdon-site bn-site spacing-${settings.sectionSpacing} corners-${settings.cornerStyle}`} style={variables}>
      {previewMode && <div className="bn-preview-badge">Private administrator preview · Draft</div>}
      <SiteHeader site={site} route={route} basePath={basePath} />
      {route.section === "home" && <Home site={site} basePath={basePath} settings={settings} />}
      {route.section === "research" && (route.projectSlug
        ? <ProjectDetail site={site} basePath={basePath} slug={route.projectSlug} settings={settings} />
        : <ResearchIndex site={site} basePath={basePath} settings={settings} />)}
      {route.section === "publications" && <Publications site={site} settings={settings} />}
      {route.section === "members" && <Members site={site} settings={settings} />}
      {route.section === "join" && <Join site={site} basePath={basePath} settings={settings} />}
      {route.section === "contact" && <Contact site={site} settings={settings} />}
      <SiteFooter site={site} basePath={basePath} />
    </main>
  );
}
