import Link from "next/link";
import type { CSSProperties } from "react";
import {
  getBourdonPages,
  type LabMember,
  type LabSite,
  type Opportunity,
  type ResearchProject,
  type SiteRoute,
} from "@/lib/sites";
import styles from "./engeland-design.module.css";

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

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join("");
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
          <span className={styles.wordmarkSymbol} aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span>
            <strong>{site.labName}</strong>
            <small>{site.labSubtitle || site.department || site.institution}</small>
          </span>
        </Link>
        <nav aria-label="Main navigation" className={styles.navigation}>
          {nav.map((item) => (
            <Link
              className={route.section === item.key ? styles.active : ""}
              href={item.href}
              key={item.key}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}

function CircuitGraphic() {
  const nodes = [
    { label: "DNA damage", className: styles.nodeDamage },
    { label: "p53", className: styles.nodeP53 },
    { label: "p21", className: styles.nodeP21 },
    { label: "RB / DREAM", className: styles.nodeDream },
    { label: "E2F / CHR", className: styles.nodeE2f },
    { label: "Cell-cycle genes", className: styles.nodeGenes },
  ];
  return (
    <div className={styles.circuit} aria-label="p53 p21 RB DREAM transcriptional circuit">
      <span className={styles.orbitOne} />
      <span className={styles.orbitTwo} />
      <span className={styles.circuitLine} />
      {nodes.map((node) => (
        <div className={`${styles.circuitNode} ${node.className}`} key={node.label}>
          <span />
          <strong>{node.label}</strong>
        </div>
      ))}
      <div className={styles.circuitCaption}>
        <small>Regulatory logic</small>
        <b>Signal → promoter → cell fate</b>
      </div>
    </div>
  );
}

function Home({ site, basePath }: { site: LabSite; basePath: string }) {
  const pages = getBourdonPages(site);
  const projects = researchProjects(site);
  const selectedPublications = site.publications.slice(0, 4);
  return (
    <>
      <section className={styles.hero}>
        <div className={styles.heroGrid}>
          <div className={styles.heroCopy}>
            <p className={styles.kicker}>{pages.home.topicLine}</p>
            <h1>{pages.home.mainHeading}</h1>
            <p className={styles.heroText}>{pages.home.openingText}</p>
            <div className={styles.heroActions}>
              <Link className={styles.primaryButton} href={`${basePath}/research`}>
                {pages.home.researchButton} <span>↗</span>
              </Link>
              <Link className={styles.secondaryButton} href={`${basePath}/publications`}>
                {pages.home.publicationsButton}
              </Link>
            </div>
            <div className={styles.focusStrip}>
              {site.focusAreas.slice(0, 4).map((area, index) => (
                <span key={`${area}-${index}`}>{area}</span>
              ))}
            </div>
          </div>
          <CircuitGraphic />
        </div>
        <div className={styles.scrollCue}>
          <span />
          Scroll to follow the regulatory programme
        </div>
      </section>

      <section className={styles.overview}>
        <div className={styles.sectionIndex}>01</div>
        <div>
          <p className={styles.kicker}>{pages.home.overviewLabel}</p>
          <h2>{pages.home.overviewHeading}</h2>
        </div>
        <div>
          <p>{pages.home.researchOverview}</p>
          <Link className={styles.inlineLink} href={`${basePath}/research`}>
            {pages.home.overviewLink} <span>↗</span>
          </Link>
        </div>
      </section>

      <section className={styles.programmes}>
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.kicker}>{pages.home.programmesLabel}</p>
            <h2>{pages.home.programmesHeading}</h2>
          </div>
          <p>Each programme resolves a different layer of the same system: how promoter architecture converts stress signals into precise decisions about proliferation.</p>
        </div>
        <div className={styles.programmeGrid}>
          {projects.map((project, index) => (
            <Link
              className={styles.programmeCard}
              href={`${basePath}/research/${project.slug}`}
              key={`${project.slug}-${index}`}
            >
              <span className={styles.programmeNumber}>{String(index + 1).padStart(2, "0")}</span>
              <h3>{project.title}</h3>
              <p>{project.summary}</p>
              <b>{pages.home.programmeLinkLabel} ↗</b>
            </Link>
          ))}
        </div>
      </section>

      <section className={styles.piSection}>
        <div className={styles.piMonogram} aria-hidden="true">
          <span>{initials(pages.home.piName)}</span>
          <i />
          <i />
          <i />
        </div>
        <div className={styles.piCopy}>
          <p className={styles.kicker}>{pages.home.piSectionLabel}</p>
          <h2>{pages.home.piName}</h2>
          <h3>{pages.home.piRole}</h3>
          <p>{pages.home.piBiography}</p>
          <Link className={styles.inlineLink} href={`${basePath}/members`}>
            {pages.home.piLinkLabel} <span>↗</span>
          </Link>
        </div>
      </section>

      {selectedPublications.length > 0 && (
        <section className={styles.publicationPreview}>
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.kicker}>Selected work</p>
              <h2>From promoter mechanisms to systems-level control.</h2>
            </div>
            <Link className={styles.inlineLink} href={`${basePath}/publications`}>
              All publications <span>↗</span>
            </Link>
          </div>
          <div className={styles.previewList}>
            {selectedPublications.map((publication, index) => {
              const content = (
                <article>
                  <time>{publication.year}</time>
                  <div>
                    <h3>{publication.title}</h3>
                    <p>{publication.journal}</p>
                  </div>
                  <span>↗</span>
                </article>
              );
              return publication.href ? (
                <a href={publication.href} key={`${publication.title}-${index}`} target="_blank" rel="noreferrer">
                  {content}
                </a>
              ) : (
                <div key={`${publication.title}-${index}`}>{content}</div>
              );
            })}
          </div>
        </section>
      )}

      <section className={styles.joinBanner}>
        <div>
          <p className={styles.kicker}>{pages.home.joinLabel}</p>
          <h2>{pages.home.joinHeading}</h2>
        </div>
        <Link className={styles.lightButton} href={`${basePath}/join`}>
          {pages.home.joinButton} ↗
        </Link>
      </section>
    </>
  );
}

function PageIntro({ label, title, text }: { label: string; title: string; text: string }) {
  return (
    <section className={styles.pageIntro}>
      <div>
        <p className={styles.kicker}>{label}</p>
        <h1>{title}</h1>
      </div>
      <p>{text}</p>
    </section>
  );
}

function ResearchIndex({ site, basePath }: { site: LabSite; basePath: string }) {
  const pages = getBourdonPages(site);
  const projects = researchProjects(site);
  return (
    <>
      <PageIntro label={pages.research.pageLabel} title={pages.research.pageHeading} text={pages.research.introduction} />
      <section className={styles.researchIndex}>
        {projects.map((project, index) => (
          <article className={styles.researchRow} key={`${project.slug}-${index}`}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <div>
              <h2>{project.title}</h2>
              <p>{project.summary}</p>
            </div>
            <div>
              {project.question && (
                <blockquote>
                  <small>{pages.research.questionLabel}</small>
                  {project.question}
                </blockquote>
              )}
              <Link className={styles.inlineLink} href={`${basePath}/research/${project.slug}`}>
                {pages.research.programmeLinkLabel} ↗
              </Link>
            </div>
          </article>
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
  const next = projects[(index + 1) % projects.length];
  return (
    <>
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
      <section className={styles.projectBody}>
        <div className={styles.projectNarrative}>
          {(project.body ?? []).map((paragraph, paragraphIndex) => (
            <p key={paragraphIndex}>{paragraph}</p>
          ))}
        </div>
        <aside>
          {!!project.methods?.length && (
            <div>
              <h3>Approaches</h3>
              <ul>
                {project.methods.map((method, methodIndex) => (
                  <li key={methodIndex}>{method}</li>
                ))}
              </ul>
            </div>
          )}
          {!!project.papers?.length && (
            <div>
              <h3>Selected work</h3>
              <ul>
                {project.papers.map((paper, paperIndex) => (
                  <li key={paperIndex}>{paper}</li>
                ))}
              </ul>
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
    </>
  );
}

function Publications({ site }: { site: LabSite }) {
  const pages = getBourdonPages(site);
  return (
    <>
      <PageIntro
        label={pages.publications.pageLabel}
        title={pages.publications.pageHeading}
        text={pages.publications.introduction}
      />
      <section className={styles.publicationPage}>
        {site.publications.map((publication, index) => {
          const content = (
            <article>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <time>{publication.year}</time>
              <div>
                <h2>{publication.title}</h2>
                <p>{publication.journal}</p>
              </div>
              <b>↗</b>
            </article>
          );
          return publication.href ? (
            <a href={publication.href} key={`${publication.title}-${index}`} target="_blank" rel="noreferrer">
              {content}
            </a>
          ) : (
            <div key={`${publication.title}-${index}`}>{content}</div>
          );
        })}
        {site.pubmedUrl && (
          <a className={styles.pubmedLink} href={site.pubmedUrl} target="_blank" rel="noreferrer">
            {pages.publications.pubmedButton} ↗
          </a>
        )}
      </section>
    </>
  );
}

function Members({ site }: { site: LabSite }) {
  const pages = getBourdonPages(site);
  const members = labMembers(site);
  return (
    <>
      <PageIntro label={pages.members.pageLabel} title={pages.members.pageHeading} text={pages.members.introduction} />
      <section className={styles.membersGrid}>
        {members.map((member, index) => (
          <article className={styles.memberCard} key={`${member.name}-${index}`}>
            <div className={styles.memberMark}>{initials(member.name)}</div>
            <span>{index === 0 ? "Principal investigator" : member.role}</span>
            <h2>{member.name}</h2>
            <p>{member.bio}</p>
            {member.href && <a href={member.href} target="_blank" rel="noreferrer">{pages.members.profileLinkLabel} ↗</a>}
          </article>
        ))}
      </section>
      {pages.members.noticeText && (
        <section className={styles.memberNotice}>
          <h3>{pages.members.noticeHeading}</h3>
          <p>{pages.members.noticeText}</p>
        </section>
      )}
    </>
  );
}

function Join({ site }: { site: LabSite }) {
  const pages = getBourdonPages(site);
  const items = opportunities(site);
  return (
    <>
      <PageIntro label={pages.join.pageLabel} title={pages.join.pageHeading} text={pages.join.introduction} />
      <section className={styles.opportunitiesGrid}>
        {items.map((item, index) => (
          <article key={`${item.title}-${index}`}>
            <span>{item.status || `Route ${String(index + 1).padStart(2, "0")}`}</span>
            <h2>{item.title}</h2>
            <p>{item.description}</p>
            {item.href && (
              <a href={item.href} target={item.href.startsWith("mailto:") ? undefined : "_blank"} rel="noreferrer">
                {item.linkLabel || pages.join.contactButton} ↗
              </a>
            )}
          </article>
        ))}
      </section>
      <section className={styles.guidance}>
        <p className={styles.kicker}>{pages.join.guidanceLabel}</p>
        <h2>{pages.join.guidanceHeading}</h2>
        <p>{pages.join.guidanceText}</p>
        {site.email && <a href={`mailto:${site.email}`}>{pages.join.contactButton} ↗</a>}
      </section>
    </>
  );
}

function Contact({ site }: { site: LabSite }) {
  const pages = getBourdonPages(site);
  return (
    <>
      <PageIntro label={pages.contact.pageLabel} title={pages.contact.pageHeading} text={pages.contact.introduction} />
      <section className={styles.contactGrid}>
        <div className={styles.contactIdentity}>
          <div className={styles.contactMonogram}>{initials(pages.contact.piName)}</div>
          <h2>{pages.contact.piName}</h2>
          <h3>{pages.contact.piRole}</h3>
          <p>{pages.contact.piBiography}</p>
        </div>
        <div className={styles.contactDetails}>
          <div>
            <span>{pages.contact.laboratoryLabel}</span>
            <strong>{pages.contact.department}</strong>
            <p>{pages.contact.institution}</p>
            <p className={styles.preserveLines}>{pages.contact.address}</p>
          </div>
          {pages.contact.email && (
            <div>
              <span>{pages.contact.emailLabel}</span>
              <a href={`mailto:${pages.contact.email}`}>{pages.contact.email}</a>
            </div>
          )}
          {pages.contact.phone && (
            <div>
              <span>{pages.contact.telephoneLabel}</span>
              <p>{pages.contact.phone}</p>
            </div>
          )}
          <div className={styles.contactLinks}>
            {pages.contact.officialProfile && <a href={pages.contact.officialProfile} target="_blank" rel="noreferrer">{pages.contact.profileLinkText} ↗</a>}
            {pages.contact.pubmedRecord && <a href={pages.contact.pubmedRecord} target="_blank" rel="noreferrer">PubMed record ↗</a>}
          </div>
        </div>
      </section>
    </>
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

export default function EngelandDesign({
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
  const variables = {
    "--eng-background": site.theme.background,
    "--eng-surface": site.theme.surface,
    "--eng-foreground": site.theme.foreground,
    "--eng-muted": site.theme.muted,
    "--eng-accent": site.theme.accent,
  } as CSSProperties;

  return (
    <main className={styles.site} style={variables}>
      <div className={styles.conceptBanner}>
        {previewMode ? "Private administrator preview · this draft is not publicly visible" : "LabNarrative concept · prepared as an independent design proposal"}
      </div>
      <Header site={site} route={route} basePath={basePath} />
      {route.section === "home" && <Home site={site} basePath={basePath} />}
      {route.section === "research" && !route.projectSlug && <ResearchIndex site={site} basePath={basePath} />}
      {route.section === "research" && route.projectSlug && <ProjectDetail site={site} slug={route.projectSlug} basePath={basePath} />}
      {route.section === "publications" && <Publications site={site} />}
      {route.section === "members" && <Members site={site} />}
      {route.section === "join" && <Join site={site} />}
      {route.section === "contact" && <Contact site={site} />}
      <Footer site={site} basePath={basePath} />
    </main>
  );
}
