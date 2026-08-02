import Link from "next/link";
import type { CSSProperties } from "react";
import type {
  LabMember,
  LabSite,
  Opportunity,
  ResearchProject,
  SiteRoute,
} from "@/lib/sites";

function safeAsset(value?: string): string | undefined {
  if (!value) return undefined;
  if (/^data:image\/(png|jpe?g|webp|gif);base64,[a-z0-9+/=\s]+$/i.test(value)) {
    return value;
  }
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.toString()
      : undefined;
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

function opportunityItems(site: LabSite): Opportunity[] {
  return site.opportunities?.filter((item) => item.title || item.description) ?? [];
}

function SiteNav({ site, basePath }: { site: LabSite; basePath: string }) {
  const opportunities = opportunityItems(site);
  return (
    <nav className="bourdon-nav" aria-label={`${site.labName} navigation`}>
      <Link href={basePath}>Home</Link>
      <Link href={`${basePath}/research`}>Research</Link>
      <Link href={`${basePath}/team`}>Team</Link>
      <Link href={`${basePath}/publications`}>Publications</Link>
      {opportunities.length > 0 && (
        <Link href={`${basePath}/opportunities`}>Opportunities</Link>
      )}
    </nav>
  );
}

function Hero({ site, basePath }: { site: LabSite; basePath: string }) {
  const image = safeAsset(site.heroImage);
  return (
    <section className="bourdon-hero">
      <div className="bourdon-hero-copy">
        <p className="bourdon-kicker">{site.labSubtitle || site.eyebrow}</p>
        <h1>{site.headline}</h1>
        <p className="bourdon-lede">{site.introduction}</p>
        <div className="bourdon-tag-row">
          {site.focusAreas.map((area) => <span key={area}>{area}</span>)}
        </div>
        <div className="bourdon-actions">
          <Link className="bourdon-primary-link" href={`${basePath}/research`}>
            Explore our research
          </Link>
          {site.profileUrl && (
            <a href={site.profileUrl} target="_blank" rel="noreferrer">
              PI profile ↗
            </a>
          )}
        </div>
      </div>
      <div className="bourdon-hero-visual">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt={`${site.piName} or ${site.labName}`} />
        ) : (
          <div className="bourdon-image-placeholder">{initials(site.piName)}</div>
        )}
        <div className="bourdon-pi-strip">
          <span>Principal Investigator</span>
          <strong>{site.piName}</strong>
          <small>{site.title}</small>
        </div>
      </div>
    </section>
  );
}

function Overview({ site }: { site: LabSite }) {
  return (
    <section className="bourdon-overview">
      <div>
        <p className="bourdon-kicker">Our research</p>
        <h2>{site.heroTitle as string || "One gene. A network of proteins."}</h2>
      </div>
      <p>{site.overview || site.introduction}</p>
    </section>
  );
}

function ResearchGrid({ site, basePath }: { site: LabSite; basePath: string }) {
  const projects = researchProjects(site);
  return (
    <section className="bourdon-section bourdon-research-feature">
      <div className="bourdon-section-heading">
        <div>
          <p className="bourdon-kicker">Research programmes</p>
          <h2>Questions that organise the laboratory.</h2>
        </div>
        <Link href={`${basePath}/research`}>View all research →</Link>
      </div>
      <div className="bourdon-research-grid">
        {projects.map((project, index) => {
          const image = safeAsset(project.figureImage);
          return (
            <Link
              className="bourdon-research-card"
              href={`${basePath}/research/${project.slug}`}
              key={`${project.slug}-${index}`}
            >
              <span className="bourdon-card-index">{String(index + 1).padStart(2, "0")}</span>
              {image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={image} alt={project.figureCaption || project.title} />
              )}
              <div>
                <h3>{project.title}</h3>
                <p>{project.summary}</p>
                <strong>Open project →</strong>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function PrincipalInvestigator({ site }: { site: LabSite }) {
  const pi = labMembers(site)[0];
  const image = safeAsset(pi?.image || site.heroImage);
  return (
    <section className="bourdon-pi-feature">
      <div className="bourdon-pi-image">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt={pi?.name || site.piName} />
        ) : (
          <div className="bourdon-image-placeholder">{initials(site.piName)}</div>
        )}
      </div>
      <div>
        <p className="bourdon-kicker">Principal investigator</p>
        <h2>{pi?.name || site.piName}</h2>
        <p className="bourdon-pi-role">{pi?.role || site.title}</p>
        <p>{pi?.bio || site.overview || site.introduction}</p>
        {pi?.href && (
          <a href={pi.href} target="_blank" rel="noreferrer">
            View full profile ↗
          </a>
        )}
      </div>
    </section>
  );
}

function SelectedPublications({ site, basePath }: { site: LabSite; basePath: string }) {
  return (
    <section className="bourdon-section bourdon-publication-feature">
      <div className="bourdon-section-heading">
        <div>
          <p className="bourdon-kicker">Selected work</p>
          <h2>Research outputs.</h2>
        </div>
        <Link href={`${basePath}/publications`}>All publications →</Link>
      </div>
      <div className="bourdon-publication-list">
        {site.publications.slice(0, 5).map((publication, index) => (
          <article key={`${publication.title}-${index}`}>
            <span>{publication.year}</span>
            <div>
              <h3>
                {publication.href ? (
                  <a href={publication.href} target="_blank" rel="noreferrer">
                    {publication.title}
                  </a>
                ) : publication.title}
              </h3>
              <p>{publication.journal}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function JoinLab({ site, basePath }: { site: LabSite; basePath: string }) {
  const opportunities = opportunityItems(site);
  return (
    <section className="bourdon-join">
      <p className="bourdon-kicker">Join the lab</p>
      <h2>Interested in {site.focusAreas.slice(0, 2).join(" and ") || "our research"}?</h2>
      <p>
        Explore current routes for postgraduate study, fellowships, collaboration, and research enquiries.
      </p>
      {opportunities.length > 0 ? (
        <Link className="bourdon-primary-link" href={`${basePath}/opportunities`}>
          View opportunities
        </Link>
      ) : site.email ? (
        <a className="bourdon-primary-link" href={`mailto:${site.email}`}>Contact the lab</a>
      ) : null}
    </section>
  );
}

function Home({ site, basePath }: { site: LabSite; basePath: string }) {
  return (
    <>
      <Hero site={site} basePath={basePath} />
      <Overview site={site} />
      <ResearchGrid site={site} basePath={basePath} />
      <PrincipalInvestigator site={site} />
      <SelectedPublications site={site} basePath={basePath} />
      <JoinLab site={site} basePath={basePath} />
    </>
  );
}

function ResearchIndex({ site, basePath }: { site: LabSite; basePath: string }) {
  const projects = researchProjects(site);
  return (
    <section className="bourdon-inner">
      <header className="bourdon-inner-header">
        <p className="bourdon-kicker">Research</p>
        <h1>Understanding biology at isoform resolution.</h1>
        <p>{site.overview || site.introduction}</p>
      </header>
      <div className="bourdon-project-list">
        {projects.map((project, index) => (
          <Link href={`${basePath}/research/${project.slug}`} key={`${project.slug}-${index}`}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <div>
              <h2>{project.title}</h2>
              <p>{project.summary}</p>
            </div>
            <strong>Open →</strong>
          </Link>
        ))}
      </div>
    </section>
  );
}

function ResearchDetail({
  site,
  project,
  basePath,
}: {
  site: LabSite;
  project: ResearchProject;
  basePath: string;
}) {
  const image = safeAsset(project.figureImage);
  return (
    <article className="bourdon-project-page">
      <Link className="bourdon-back-link" href={`${basePath}/research`}>← All research</Link>
      <header>
        <p className="bourdon-kicker">Research programme</p>
        <h1>{project.title}</h1>
        <p className="bourdon-lede">{project.summary}</p>
      </header>
      {project.question && (
        <section className="bourdon-project-question">
          <span>Central question</span>
          <h2>{project.question}</h2>
        </section>
      )}
      <div className="bourdon-project-body">
        <div className="bourdon-project-copy">
          {(project.body ?? []).map((paragraph, index) => <p key={index}>{paragraph}</p>)}
        </div>
        {image && (
          <figure>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image} alt={project.figureCaption || project.title} />
            {project.figureCaption && <figcaption>{project.figureCaption}</figcaption>}
          </figure>
        )}
      </div>
      {(project.methods?.length || project.papers?.length) && (
        <div className="bourdon-project-columns">
          {project.methods?.length ? (
            <section>
              <p className="bourdon-kicker">Methods and capabilities</p>
              <ul>{project.methods.map((method) => <li key={method}>{method}</li>)}</ul>
            </section>
          ) : null}
          {project.papers?.length ? (
            <section>
              <p className="bourdon-kicker">Research landmarks</p>
              <ul>{project.papers.map((paper) => <li key={paper}>{paper}</li>)}</ul>
            </section>
          ) : null}
        </div>
      )}
    </article>
  );
}

function Team({ site }: { site: LabSite }) {
  const members = labMembers(site);
  return (
    <section className="bourdon-inner">
      <header className="bourdon-inner-header">
        <p className="bourdon-kicker">People</p>
        <h1>The team behind the research.</h1>
      </header>
      <div className="bourdon-team-grid">
        {members.map((member, index) => {
          const image = safeAsset(member.image);
          return (
            <article className={index === 0 ? "principal" : ""} key={`${member.name}-${index}`}>
              <div className="bourdon-member-image">
                {image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={image} alt={member.name} />
                ) : (
                  <div className="bourdon-image-placeholder">{initials(member.name)}</div>
                )}
              </div>
              <div>
                <span>{member.role}</span>
                <h2>{member.name}</h2>
                {member.bio && <p>{member.bio}</p>}
                {member.href && <a href={member.href} target="_blank" rel="noreferrer">Profile ↗</a>}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function Publications({ site }: { site: LabSite }) {
  return (
    <section className="bourdon-inner">
      <header className="bourdon-inner-header">
        <p className="bourdon-kicker">Publications</p>
        <h1>Selected research outputs.</h1>
        {site.pubmedUrl && <a href={site.pubmedUrl} target="_blank" rel="noreferrer">View complete PubMed record ↗</a>}
      </header>
      <div className="bourdon-publication-list full">
        {site.publications.map((publication, index) => (
          <article key={`${publication.title}-${index}`}>
            <span>{publication.year}</span>
            <div>
              <h3>{publication.href ? <a href={publication.href} target="_blank" rel="noreferrer">{publication.title}</a> : publication.title}</h3>
              <p>{publication.journal}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function Opportunities({ site }: { site: LabSite }) {
  const opportunities = opportunityItems(site);
  return (
    <section className="bourdon-inner">
      <header className="bourdon-inner-header">
        <p className="bourdon-kicker">Opportunities</p>
        <h1>Study, collaborate, and build with us.</h1>
      </header>
      <div className="bourdon-opportunity-grid">
        {opportunities.map((item, index) => (
          <article key={`${item.title}-${index}`}>
            {item.status && <span>{item.status}</span>}
            <h2>{item.title}</h2>
            <p>{item.description}</p>
            {item.href && (
              <a href={item.href} target={item.href.startsWith("mailto:") ? undefined : "_blank"} rel="noreferrer">
                {item.linkLabel || "Learn more"} →
              </a>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

export default function BourdonDesign({
  site,
  route,
  basePath,
  previewMode,
}: {
  site: LabSite;
  route: SiteRoute;
  basePath: string;
  previewMode: boolean;
}) {
  const variables = {
    "--bourdon-bg": site.theme.background,
    "--bourdon-surface": site.theme.surface,
    "--bourdon-ink": site.theme.foreground,
    "--bourdon-muted": site.theme.muted,
    "--bourdon-accent": site.theme.accent,
  } as CSSProperties;

  const projects = researchProjects(site);
  const project = route.projectSlug
    ? projects.find((item) => item.slug === route.projectSlug)
    : undefined;

  return (
    <main className="bourdon-site" style={variables}>
      <div className="prototype-banner bourdon-prototype-banner">
        {previewMode
          ? "Private administrator preview · this draft is not publicly visible"
          : "LabNarrative concept · prepared as an independent design proposal"}
      </div>
      <header className="bourdon-header">
        <Link className="bourdon-wordmark" href={basePath}>{site.labName}</Link>
        <SiteNav site={site} basePath={basePath} />
      </header>

      {route.section === "home" && <Home site={site} basePath={basePath} />}
      {route.section === "research" && !project && <ResearchIndex site={site} basePath={basePath} />}
      {route.section === "research" && project && <ResearchDetail site={site} project={project} basePath={basePath} />}
      {route.section === "team" && <Team site={site} />}
      {route.section === "publications" && <Publications site={site} />}
      {route.section === "opportunities" && <Opportunities site={site} />}

      <footer className="bourdon-footer">
        <div>
          <strong>{site.labName}</strong>
          <span>{site.department || site.labSubtitle}</span>
          <span>{site.institution}</span>
        </div>
        <div>
          <strong>Contact</strong>
          {site.email && <a href={`mailto:${site.email}`}>{site.email}</a>}
          {site.phone && <a href={`tel:${site.phone.replace(/\s/g, "")}`}>{site.phone}</a>}
          {site.address && <span>{site.address}</span>}
        </div>
        <div>
          <strong>LabNarrative</strong>
          <span>Versioned design: Bourdon Full v1</span>
        </div>
      </footer>
    </main>
  );
}
