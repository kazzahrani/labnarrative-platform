"use client";

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import {
  getBourdonPages,
  type LabMember,
  type LabSite,
  type Opportunity,
  type ResearchProject,
  type SiteRoute,
} from "@/lib/sites";
import styles from "./EditorialImageDesign.module.css";

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

function members(site: LabSite): LabMember[] {
  if (site.members?.length) return site.members;
  return site.team.map((member) => ({ ...member }));
}

function opportunities(site: LabSite): Opportunity[] {
  return site.opportunities?.filter((item) => item.title || item.description) ?? [];
}

function Picture({ src, alt, fallback, className = "" }: { src?: string; alt: string; fallback: string; className?: string }) {
  const image = safeAsset(src);
  return image ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img className={className} src={image} alt={alt} />
  ) : (
    <div className={`${styles.placeholder} ${className}`} aria-label={alt}>{fallback}</div>
  );
}

function navItems(site: LabSite, basePath: string) {
  const pages = getBourdonPages(site);
  return [
    { section: "home" as const, label: pages.navigation.home, href: basePath },
    { section: "research" as const, label: pages.navigation.research, href: `${basePath}/research` },
    { section: "publications" as const, label: pages.navigation.publications, href: `${basePath}/publications` },
    { section: "members" as const, label: pages.navigation.members, href: `${basePath}/members` },
    { section: "join" as const, label: pages.navigation.join, href: `${basePath}/join` },
    { section: "contact" as const, label: pages.navigation.contact, href: `${basePath}/contact` },
  ];
}

function Header({ site, route, basePath }: { site: LabSite; route: SiteRoute; basePath: string }) {
  return (
    <header className={styles.header}>
      <Link className={styles.wordmark} href={basePath}>
        <span>{site.labName}</span><small>{site.institution}</small>
      </Link>
      <nav aria-label={`${site.labName} navigation`}>
        {navItems(site, basePath).map((item) => (
          <Link className={route.section === item.section ? styles.active : ""} href={item.href} key={item.section}>{item.label}</Link>
        ))}
      </nav>
    </header>
  );
}

function Footer({ site, basePath }: { site: LabSite; basePath: string }) {
  const pages = getBourdonPages(site);
  return (
    <footer className={styles.footer}>
      <div><strong>{pages.home.footerLabName || site.labName}</strong><p>{pages.home.footerDepartment || site.department}<br />{pages.home.footerInstitution || site.institution}</p></div>
      <div className={styles.footerLinks}>
        <Link href={`${basePath}/research`}>{pages.navigation.research}</Link><Link href={`${basePath}/publications`}>{pages.navigation.publications}</Link><Link href={`${basePath}/members`}>{pages.navigation.members}</Link><Link href={`${basePath}/contact`}>{pages.navigation.contact}</Link>
      </div>
      <div className={styles.footerMeta}>{site.email && <a href={`mailto:${site.email}`}>{site.email}</a>}<span>Independent concept by LabNarrative</span></div>
    </footer>
  );
}

function SectionTitle({ index, eyebrow, title, link }: { index: string; eyebrow: string; title: string; link?: ReactNode }) {
  return <div className={styles.sectionTitle}><span>{index}</span><div><p>{eyebrow}</p><h2>{title}</h2></div>{link && <div className={styles.sectionLink}>{link}</div>}</div>;
}

function Home({ site, basePath }: { site: LabSite; basePath: string }) {
  const pages = getBourdonPages(site);
  const projects = researchProjects(site);
  const pi = members(site)[0];
  const heroImage = pages.home.homepageImage || site.heroImage || pages.home.piImage || pages.home.topPortrait || pi?.image;
  const piImage = pages.home.piImage || pi?.image || pages.home.topPortrait || site.heroImage;
  return (
    <>
      <section className={styles.hero}>
        <div className={styles.heroCopy}><p className={styles.kicker}>{pages.home.topicLine}</p><h1>{pages.home.mainHeading}</h1><p className={styles.heroText}>{pages.home.openingText}</p><div className={styles.heroActions}><Link href={`${basePath}/research`}>{pages.home.researchButton}</Link><Link href={`${basePath}/publications`}>{pages.home.publicationsButton}</Link></div></div>
        <figure className={styles.heroFigure}><Picture src={heroImage} alt={`${site.piName}, ${site.labName}`} fallback={initials(site.piName)} /><figcaption><span>Principal investigator</span><strong>{site.piName}</strong><small>{site.title}</small></figcaption></figure>
        <div className={styles.heroRail}><span>Toronto</span><span>Cancer biology</span><span>Regeneration</span></div>
      </section>
      <section className={styles.manifesto}><SectionTitle index="01" eyebrow={pages.home.overviewLabel} title={pages.home.overviewHeading} /><div className={styles.manifestoText}><p>{pages.home.researchOverview}</p><Link href={`${basePath}/research`}>{pages.home.overviewLink} <span>↗</span></Link></div></section>
      <section className={styles.programmes}>
        <SectionTitle index="02" eyebrow={pages.home.programmesLabel} title={pages.home.programmesHeading} link={<Link href={`${basePath}/research`}>View all research ↗</Link>} />
        <div className={styles.programmeList}>{projects.map((project, index) => { const image = safeAsset(project.figureImage); return <Link className={styles.programme} href={`${basePath}/research/${project.slug}`} key={`${project.slug}-${index}`}><span className={styles.programmeNumber}>{String(index + 1).padStart(2, "0")}</span><div><h3>{project.title}</h3><p>{project.summary}</p></div>{image ? <Picture className={styles.programmeImage} src={image} alt={project.figureCaption || project.title} fallback="" /> : <span className={styles.programmeArrow}>↗</span>}</Link>; })}</div>
      </section>
      <section className={styles.publicationFeature}><SectionTitle index="03" eyebrow="Selected work" title="Recent and defining research" link={<Link href={`${basePath}/publications`}>All publications ↗</Link>} /><div className={styles.publicationGrid}>{site.publications.slice(0, 4).map((publication, index) => <article key={`${publication.title}-${index}`}><span>{publication.year}</span><p>{publication.journal}</p><h3>{publication.href ? <a href={publication.href} target="_blank" rel="noreferrer">{publication.title}</a> : publication.title}</h3></article>)}</div></section>
      <section className={styles.piFeature}><div className={styles.piImageWrap}><Picture src={piImage} alt={pages.home.piName || site.piName} fallback={initials(site.piName)} /></div><div className={styles.piCopy}><p className={styles.kicker}>{pages.home.piSectionLabel}</p><h2>{pages.home.piName}</h2><h3>{pages.home.piRole}</h3><p>{pages.home.piBiography}</p><Link href={`${basePath}/members`}>{pages.home.piLinkLabel} ↗</Link></div></section>
      <section className={styles.joinBanner}><div><p>{pages.home.joinLabel}</p><h2>{pages.home.joinHeading}</h2></div><Link href={`${basePath}/join`}>{pages.home.joinButton} ↗</Link></section>
    </>
  );
}

function PageIntro({ index, label, title, text }: { index: string; label: string; title: string; text: string }) {
  return <section className={styles.pageIntro}><span>{index}</span><div><p>{label}</p><h1>{title}</h1><div className={styles.pageIntroText}>{text}</div></div></section>;
}

function ResearchIndex({ site, basePath }: { site: LabSite; basePath: string }) {
  const pages = getBourdonPages(site); const projects = researchProjects(site);
  return <><PageIntro index="R" label={pages.research.pageLabel} title={pages.research.pageHeading} text={pages.research.introduction} /><section className={styles.researchIndex}>{projects.map((project, index) => <Link href={`${basePath}/research/${project.slug}`} key={`${project.slug}-${index}`}><span>{String(index + 1).padStart(2, "0")}</span><div><h2>{project.title}</h2><p>{project.summary}</p></div><b>Open ↗</b></Link>)}</section></>;
}

function ProjectDetail({ site, slug, basePath }: { site: LabSite; slug: string; basePath: string }) {
  const pages = getBourdonPages(site); const projects = researchProjects(site); const index = projects.findIndex((project) => project.slug === slug); const project = projects[index];
  if (!project) return <ResearchIndex site={site} basePath={basePath} />;
  const figure = safeAsset(project.figureImage);
  return <article className={styles.projectPage}><Link className={styles.backLink} href={`${basePath}/research`}>← {pages.research.backLink}</Link><header><span>{String(index + 1).padStart(2, "0")}</span><p>{pages.research.programmeLabel}</p><h1>{project.title}</h1><div>{project.summary}</div></header><section className={styles.projectQuestion}><p>{pages.research.questionLabel}</p><h2>{project.question || project.title}</h2></section><section className={styles.projectNarrative}><div className={styles.projectBody}>{(project.body || []).map((paragraph, paragraphIndex) => <p key={paragraphIndex}>{paragraph}</p>)}</div>{figure && <figure><Picture src={figure} alt={project.figureCaption || project.title} fallback="" />{project.figureCaption && <figcaption>{project.figureCaption}</figcaption>}</figure>}</section><Link className={styles.returnLink} href={`${basePath}/research`}>{pages.research.returnLink} ↗</Link></article>;
}

function Publications({ site }: { site: LabSite }) {
  const pages = getBourdonPages(site);
  return <><PageIntro index="P" label={pages.publications.pageLabel} title={pages.publications.pageHeading} text={pages.publications.introduction} /><section className={styles.publications}>{site.publications.map((publication, index) => { const content = <><span>{publication.year}</span><div><p>{publication.journal}</p><h2>{publication.title}</h2></div><b>↗</b></>; return publication.href ? <a href={publication.href} target="_blank" rel="noreferrer" key={`${publication.title}-${index}`}>{content}</a> : <article key={`${publication.title}-${index}`}>{content}</article>; })}</section></>;
}

function Members({ site }: { site: LabSite }) {
  const pages = getBourdonPages(site); const people = members(site);
  return <><PageIntro index="M" label={pages.members.pageLabel} title={pages.members.pageHeading} text={pages.members.introduction} /><section className={styles.members}>{people.map((member, index) => <article className={index === 0 ? styles.principal : ""} key={`${member.name}-${index}`}><Picture src={member.image || (index === 0 ? site.heroImage : undefined)} alt={member.name} fallback={initials(member.name)} /><div><span>{member.role}</span><h2>{member.name}</h2>{member.bio && <p>{member.bio}</p>}{member.href && <a href={member.href} target="_blank" rel="noreferrer">{pages.members.profileLinkLabel} ↗</a>}</div></article>)}</section>{pages.members.noticeText && <aside className={styles.notice}><strong>{pages.members.noticeHeading}</strong><p>{pages.members.noticeText}</p></aside>}</>;
}

function Join({ site }: { site: LabSite }) {
  const pages = getBourdonPages(site); const items = opportunities(site);
  return <><PageIntro index="J" label={pages.join.pageLabel} title={pages.join.pageHeading} text={pages.join.introduction} /><section className={styles.opportunities}>{items.map((item, index) => <article key={`${item.title}-${index}`}><span>{String(index + 1).padStart(2, "0")}</span><div>{item.status && <p>{item.status}</p>}<h2>{item.title}</h2><div>{item.description}</div>{item.href && <a href={item.href} target={item.href.startsWith("http") ? "_blank" : undefined} rel="noreferrer">{item.linkLabel || "Learn more"} ↗</a>}</div></article>)}</section><section className={styles.guidance}><p>{pages.join.guidanceLabel}</p><h2>{pages.join.guidanceHeading}</h2><div>{pages.join.guidanceText}</div>{site.email && <a href={`mailto:${site.email}`}>{pages.join.contactButton} ↗</a>}</section></>;
}

function Contact({ site }: { site: LabSite }) {
  const pages = getBourdonPages(site);
  return <><PageIntro index="C" label={pages.contact.pageLabel} title={pages.contact.pageHeading} text={pages.contact.introduction} /><section className={styles.contact}><div className={styles.contactPortrait}><Picture src={pages.contact.piImage || site.heroImage} alt={pages.contact.piName} fallback={initials(pages.contact.piName || site.piName)} /></div><div className={styles.contactDetails}><p>{pages.contact.piRole}</p><h2>{pages.contact.piName}</h2><div className={styles.contactGrid}><div><span>{pages.contact.laboratoryLabel}</span><p>{site.labName}<br />{pages.contact.department}<br />{pages.contact.institution}</p></div>{pages.contact.address && <div><span>Address</span><p>{pages.contact.address}</p></div>}{pages.contact.email && <div><span>{pages.contact.emailLabel}</span><a href={`mailto:${pages.contact.email}`}>{pages.contact.email}</a></div>}{pages.contact.phone && <div><span>{pages.contact.telephoneLabel}</span><p>{pages.contact.phone}</p></div>}{pages.contact.officialProfile && <div><span>{pages.contact.profileLabel}</span><a href={pages.contact.officialProfile} target="_blank" rel="noreferrer">{pages.contact.profileLinkText} ↗</a></div>}{pages.contact.pubmedRecord && <div><span>Publications</span><a href={pages.contact.pubmedRecord} target="_blank" rel="noreferrer">PubMed ↗</a></div>}</div></div></section></>;
}

export default function EditorialImageDesign({ site, route, basePath, previewMode = false }: { site: LabSite; route: SiteRoute; basePath: string; previewMode?: boolean }) {
  const variables = { "--ei-paper": site.theme.background, "--ei-white": site.theme.surface, "--ei-ink": site.theme.foreground, "--ei-muted": site.theme.muted, "--ei-accent": site.theme.accent } as CSSProperties;
  return <main className={styles.site} style={variables}>{previewMode && <div className={styles.previewBadge}>Private administrator preview · Draft</div>}<Header site={site} route={route} basePath={basePath} />{route.section === "home" && <Home site={site} basePath={basePath} />}{route.section === "research" && (route.projectSlug ? <ProjectDetail site={site} slug={route.projectSlug} basePath={basePath} /> : <ResearchIndex site={site} basePath={basePath} />)}{route.section === "publications" && <Publications site={site} />}{route.section === "members" && <Members site={site} />}{route.section === "join" && <Join site={site} />}{route.section === "contact" && <Contact site={site} />}<Footer site={site} basePath={basePath} /></main>;
}
