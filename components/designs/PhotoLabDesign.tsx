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
import styles from "./PhotoLabDesign.module.css";

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

function initials(name: string): string {
  const ignored = new Set(["prof", "prof.", "dr", "dr.", "phd", "ph.d.", "md", "m.d."]);
  const parts = name
    .replace(/[,()]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((part) => !ignored.has(part.toLowerCase()));
  const selected = parts.length > 1 ? [parts[0], parts[parts.length - 1]] : parts;
  return selected.map((part) => part[0]).join("").slice(0, 2).toUpperCase();
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
    { section: "members" as const, label: pages.navigation.members, href: `${basePath}/members` },
    { section: "publications" as const, label: pages.navigation.publications, href: `${basePath}/publications` },
    { section: "join" as const, label: pages.navigation.join, href: `${basePath}/join` },
    { section: "contact" as const, label: pages.navigation.contact, href: `${basePath}/contact` },
  ];
}

function Header({ site, route, basePath }: { site: LabSite; route: SiteRoute; basePath: string }) {
  return (
    <header className={styles.header}>
      <Link className={styles.wordmark} href={basePath}>{site.labName.toUpperCase()}</Link>
      <nav aria-label={`${site.labName} navigation`}>
        {navItems(site, basePath).map((item) => (
          <Link className={route.section === item.section ? styles.active : ""} href={item.href} key={item.section}>
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
        <Link href={`${basePath}/members`}>{pages.navigation.members}</Link>
        <Link href={`${basePath}/publications`}>{pages.navigation.publications}</Link>
        <Link href={`${basePath}/contact`}>{pages.navigation.contact}</Link>
      </div>
      <div className={styles.footerMeta}>
        {site.email && <a href={`mailto:${site.email}`}>{site.email}</a>}
        <span>Independent concept by LabNarrative</span>
      </div>
    </footer>
  );
}

function PageHero({ image, label, title, text }: { image?: string; label: string; title: string; text?: string }) {
  return (
    <section className={styles.pageHero}>
      <Picture src={image} alt={title} fallback="LAB" />
      <div className={styles.pageHeroShade} />
      <div className={styles.pageHeroCopy}>
        <p>{label}</p>
        <h1>{title}</h1>
        {text && <div>{text}</div>}
      </div>
    </section>
  );
}

function SectionHeading({ label, title, link }: { label: string; title: string; link?: ReactNode }) {
  return (
    <div className={styles.sectionHeading}>
      <div><p>{label}</p><h2>{title}</h2></div>
      {link && <div>{link}</div>}
    </div>
  );
}

function Home({ site, basePath }: { site: LabSite; basePath: string }) {
  const pages = getBourdonPages(site);
  const projects = researchProjects(site);
  const members = labMembers(site);
  const pi = members[0];
  const heroImage = pages.home.homepageImage || site.heroImage || pages.home.topPortrait || pages.home.piImage || pi?.image;
  const portrait = pages.home.piImage || pi?.image || pages.home.topPortrait || site.heroImage;

  return (
    <>
      <section className={styles.homeHero}>
        <Picture src={heroImage} alt={`${site.labName} research`} fallback="PRIVES LAB" />
        <div className={styles.heroShade} />
        <div className={styles.heroCaption}>
          <p>{pages.home.topicLine}</p>
          <h1>{site.labName}</h1>
          <span>{site.institution}</span>
        </div>
      </section>

      <section className={styles.welcome}>
        <p className={styles.eyebrow}>Welcome to our lab</p>
        <h2>{pages.home.mainHeading}</h2>
        <div className={styles.welcomeText}>{pages.home.openingText}</div>
        <div className={styles.welcomeActions}>
          <Link href={`${basePath}/research`}>{pages.home.researchButton}</Link>
          <Link href={`${basePath}/publications`}>{pages.home.publicationsButton}</Link>
        </div>
      </section>

      <section className={styles.piStory}>
        <div className={styles.piPhoto}><Picture src={portrait} alt={pages.home.piName || site.piName} fallback={initials(site.piName)} /></div>
        <div className={styles.piStoryCopy}>
          <p className={styles.eyebrow}>{pages.home.piSectionLabel}</p>
          <h2>{pages.home.piName || site.piName}</h2>
          <h3>{pages.home.piRole || site.title}</h3>
          <div>{pages.home.piBiography}</div>
          <Link href={`${basePath}/members`}>{pages.home.piLinkLabel} →</Link>
        </div>
      </section>

      <section className={styles.researchFeature}>
        <SectionHeading label={pages.home.programmesLabel} title={pages.home.programmesHeading} link={<Link href={`${basePath}/research`}>View all research →</Link>} />
        <div className={styles.researchGrid}>
          {projects.map((project, index) => (
            <Link className={styles.researchCard} href={`${basePath}/research/${project.slug}`} key={`${project.slug}-${index}`}>
              <Picture src={project.figureImage || heroImage} alt={project.figureCaption || project.title} fallback={String(index + 1).padStart(2, "0")} />
              <div className={styles.cardShade} />
              <div className={styles.cardCopy}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <h3>{project.title}</h3>
                <p>{project.summary}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className={styles.publicationPreview}>
        <SectionHeading label="Selected publications" title="Recent and defining work" link={<Link href={`${basePath}/publications`}>View all publications →</Link>} />
        <div className={styles.publicationRows}>
          {site.publications.slice(0, 5).map((publication, index) => {
            const row = <><span>{publication.year}</span><div><h3>{publication.title}</h3><p>{publication.journal}</p></div><b>↗</b></>;
            return publication.href ? <a href={publication.href} target="_blank" rel="noreferrer" key={`${publication.title}-${index}`}>{row}</a> : <article key={`${publication.title}-${index}`}>{row}</article>;
          })}
        </div>
      </section>

      <section className={styles.joinBanner}>
        <div><p>{pages.home.joinLabel}</p><h2>{pages.home.joinHeading}</h2></div>
        <Link href={`${basePath}/join`}>{pages.home.joinButton} →</Link>
      </section>
    </>
  );
}

function ResearchIndex({ site, basePath }: { site: LabSite; basePath: string }) {
  const pages = getBourdonPages(site);
  const projects = researchProjects(site);
  const hero = site.heroImage || pages.home.homepageImage || pages.home.topPortrait;

  if (site.slug === "prives") {
    return (
      <>
        <PageHero image={hero} label={site.labName} title="Research" />
        <section className={styles.researchEditorial}>
          <header className={styles.researchEditorialIntro}>
            <p>{pages.research.pageLabel}</p>
            <h2>{pages.research.pageHeading}</h2>
            {pages.research.introduction && <div>{pages.research.introduction}</div>}
          </header>

          {projects.map((project, index) => {
            const figure = project.figureImage || hero;
            return (
              <article className={`${styles.researchEditorialTopic} ${index % 2 === 1 ? styles.researchEditorialTopicReverse : ""}`} id={project.slug} key={`${project.slug}-${index}`}>
                <div className={styles.researchEditorialCopy}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <h2>{project.title}</h2>
                  {project.summary && <p className={styles.researchEditorialLead}>{project.summary}</p>}
                  <div className={styles.researchEditorialBody}>
                    {(project.body || []).map((paragraph, paragraphIndex) => <p key={paragraphIndex}>{paragraph}</p>)}
                  </div>
                </div>
                <figure className={styles.researchEditorialFigure}>
                  <Picture src={figure} alt={project.figureCaption || project.title} fallback={String(index + 1).padStart(2, "0")} />
                  {project.figureCaption && <figcaption>{project.figureCaption}</figcaption>}
                </figure>
              </article>
            );
          })}
        </section>
      </>
    );
  }

  return (
    <>
      <PageHero image={hero} label={pages.research.pageLabel} title={pages.research.pageHeading} text={pages.research.introduction} />
      <section className={styles.researchList}>
        {projects.map((project, index) => (
          <Link href={`${basePath}/research/${project.slug}`} key={`${project.slug}-${index}`}>
            <div className={styles.researchListImage}><Picture src={project.figureImage || hero} alt={project.figureCaption || project.title} fallback={String(index + 1).padStart(2, "0")} /></div>
            <div className={styles.researchListCopy}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <h2>{project.title}</h2>
              <p>{project.summary}</p>
              <b>{pages.research.programmeLinkLabel} →</b>
            </div>
          </Link>
        ))}
      </section>
    </>
  );
}

function ProjectDetail({ site, slug, basePath }: { site: LabSite; slug: string; basePath: string }) {
  const pages = getBourdonPages(site);
  const projects = researchProjects(site);
  const index = projects.findIndex((project) => project.slug === slug);
  const project = projects[index];
  if (!project) return <ResearchIndex site={site} basePath={basePath} />;
  const figure = project.figureImage || site.heroImage;
  const showExtendedDetails = site.slug !== "prives";
  return (
    <article className={styles.projectPage}>
      <PageHero image={figure} label={`${pages.research.programmeLabel} ${String(index + 1).padStart(2, "0")}`} title={project.title} text={project.summary} />
      <section className={styles.projectQuestion}><p>{pages.research.questionLabel}</p><h2>{project.question || project.title}</h2></section>
      <section className={styles.projectNarrative}>
        <div className={styles.projectBody}>{(project.body || []).map((paragraph, paragraphIndex) => <p key={paragraphIndex}>{paragraph}</p>)}</div>
        <figure><Picture src={figure} alt={project.figureCaption || project.title} fallback={String(index + 1).padStart(2, "0")} />{project.figureCaption && <figcaption>{project.figureCaption}</figcaption>}</figure>
      </section>
      {showExtendedDetails && !!project.methods?.length && <section className={styles.detailList}><p>Approaches</p><div>{project.methods.map((method) => <span key={method}>{method}</span>)}</div></section>}
      {showExtendedDetails && !!project.papers?.length && <section className={styles.detailList}><p>Selected work</p><div>{project.papers.map((paper) => <span key={paper}>{paper}</span>)}</div></section>}
      <Link className={styles.returnLink} href={`${basePath}/research`}>← {pages.research.returnLink}</Link>
    </article>
  );
}

function Publications({ site }: { site: LabSite }) {
  const pages = getBourdonPages(site);
  return (
    <>
      <PageHero image={site.heroImage || pages.home.homepageImage} label={pages.publications.pageLabel} title={pages.publications.pageHeading} text={pages.publications.introduction} />
      <section className={styles.publications}>
        {site.publications.map((publication, index) => {
          const content = <><span>{publication.year}</span><div><p>{publication.journal}</p><h2>{publication.title}</h2></div><b>↗</b></>;
          return publication.href ? <a href={publication.href} target="_blank" rel="noreferrer" key={`${publication.title}-${index}`}>{content}</a> : <article key={`${publication.title}-${index}`}>{content}</article>;
        })}
      </section>
    </>
  );
}

function Members({ site }: { site: LabSite }) {
  const pages = getBourdonPages(site);
  const members = labMembers(site);
  return (
    <>
      <PageHero image={site.heroImage || pages.home.homepageImage} label={pages.members.pageLabel} title={pages.members.pageHeading} text={pages.members.introduction} />
      <section className={styles.members}>
        {members.map((member, index) => (
          <article className={index === 0 ? styles.principal : ""} key={`${member.name}-${index}`}>
            <Picture src={member.image || (index === 0 ? site.heroImage : undefined)} alt={member.name} fallback={initials(member.name)} />
            <div><span>{member.role}</span><h2>{member.name}</h2>{member.bio && <p>{member.bio}</p>}{member.href && <a href={member.href} target="_blank" rel="noreferrer">{pages.members.profileLinkLabel} →</a>}</div>
          </article>
        ))}
      </section>
      {pages.members.noticeText && <aside className={styles.notice}><strong>{pages.members.noticeHeading}</strong><p>{pages.members.noticeText}</p></aside>}
    </>
  );
}

function Join({ site }: { site: LabSite }) {
  const pages = getBourdonPages(site);
  const items = opportunities(site);
  return (
    <>
      <PageHero image={site.heroImage || pages.home.homepageImage} label={pages.join.pageLabel} title={pages.join.pageHeading} text={pages.join.introduction} />
      <section className={styles.opportunities}>
        {items.map((item, index) => (
          <article key={`${item.title}-${index}`}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <div>{item.status && <p>{item.status}</p>}<h2>{item.title}</h2><div>{item.description}</div>{item.href && <a href={item.href} target={item.href.startsWith("http") ? "_blank" : undefined} rel="noreferrer">{item.linkLabel || "Learn more"} →</a>}</div>
          </article>
        ))}
      </section>
      <section className={styles.guidance}><p>{pages.join.guidanceLabel}</p><h2>{pages.join.guidanceHeading}</h2><div>{pages.join.guidanceText}</div>{site.email && <a href={`mailto:${site.email}`}>{pages.join.contactButton} →</a>}</section>
    </>
  );
}

function Contact({ site }: { site: LabSite }) {
  const pages = getBourdonPages(site);
  return (
    <>
      <PageHero image={site.heroImage || pages.home.homepageImage} label={pages.contact.pageLabel} title={pages.contact.pageHeading} text={pages.contact.introduction} />
      <section className={styles.contact}>
        <div className={styles.contactPhoto}><Picture src={pages.contact.piImage || pages.home.piImage || site.heroImage} alt={pages.contact.piName || site.piName} fallback={initials(site.piName)} /></div>
        <div className={styles.contactDetails}>
          <p>{pages.contact.piRole}</p><h2>{pages.contact.piName}</h2>
          <div className={styles.contactGrid}>
            <div><span>{pages.contact.laboratoryLabel}</span><p>{site.labName}<br />{pages.contact.department}<br />{pages.contact.institution}</p></div>
            {pages.contact.address && <div><span>Address</span><p>{pages.contact.address}</p></div>}
            {pages.contact.email && <div><span>{pages.contact.emailLabel}</span><a href={`mailto:${pages.contact.email}`}>{pages.contact.email}</a></div>}
            {pages.contact.phone && <div><span>{pages.contact.telephoneLabel}</span><p>{pages.contact.phone}</p></div>}
            {pages.contact.officialProfile && <div><span>{pages.contact.profileLabel}</span><a href={pages.contact.officialProfile} target="_blank" rel="noreferrer">{pages.contact.profileLinkText} →</a></div>}
            {pages.contact.pubmedRecord && <div><span>Publications</span><a href={pages.contact.pubmedRecord} target="_blank" rel="noreferrer">PubMed →</a></div>}
          </div>
        </div>
      </section>
    </>
  );
}

export default function PhotoLabDesign({ site, route, basePath, previewMode = false }: { site: LabSite; route: SiteRoute; basePath: string; previewMode?: boolean }) {
  const variables = {
    "--pl-background": site.theme.background || "#ffffff",
    "--pl-surface": site.theme.surface || "#ffffff",
    "--pl-foreground": site.theme.foreground || "#111111",
    "--pl-muted": site.theme.muted || "#6f6f6f",
    "--pl-accent": site.theme.accent || "#8f2336",
  } as CSSProperties;

  return (
    <main className={styles.site} style={variables}>
      {previewMode && <div className={styles.previewBadge}>Private administrator preview · Draft</div>}
      <Header site={site} route={route} basePath={basePath} />
      {route.section === "home" && <Home site={site} basePath={basePath} />}
      {route.section === "research" && (site.slug === "prives" ? <ResearchIndex site={site} basePath={basePath} /> : route.projectSlug ? <ProjectDetail site={site} slug={route.projectSlug} basePath={basePath} /> : <ResearchIndex site={site} basePath={basePath} />)}
      {route.section === "publications" && <Publications site={site} />}
      {route.section === "members" && <Members site={site} />}
      {route.section === "join" && <Join site={site} />}
      {route.section === "contact" && <Contact site={site} />}
      <Footer site={site} basePath={basePath} />
    </main>
  );
}
