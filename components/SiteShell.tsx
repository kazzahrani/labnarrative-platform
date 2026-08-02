import Link from "next/link";
import type { CSSProperties } from "react";
import type { LabSite, SiteSection } from "@/lib/sites";

function SiteNav({ site }: { site: LabSite }) {
  const base = `/sites/${site.slug}`;

  return (
    <nav className="site-nav" aria-label={`${site.labName} navigation`}>
      <Link href={base}>Home</Link>
      <Link href={`${base}/research`}>Research</Link>
      <Link href={`${base}/team`}>Team</Link>
      <Link href={`${base}/publications`}>Publications</Link>
    </nav>
  );
}

function Home({ site }: { site: LabSite }) {
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">{site.eyebrow}</p>
          <h1>{site.headline}</h1>
          <p className="introduction">{site.introduction}</p>
          <div className="focus-list">
            {site.focusAreas.map((area) => (
              <span key={area}>{area}</span>
            ))}
          </div>
        </div>
        <aside className="pi-card">
          <div className="portrait-mark" aria-hidden="true">
            {site.piName
              .split(" ")
              .map((part) => part[0])
              .slice(0, 2)
              .join("")}
          </div>
          <p className="card-label">Principal Investigator</p>
          <h2>{site.piName}</h2>
          <p>{site.title}</p>
          <p>{site.institution}</p>
        </aside>
      </section>

      <section className="section-block">
        <div>
          <p className="eyebrow">Research programme</p>
          <h2>Three connected lines of investigation.</h2>
        </div>
        <div className="grid-three">
          {site.projects.map((project, index) => (
            <article className="content-card" key={project.title}>
              <span className="card-number">0{index + 1}</span>
              <h3>{project.title}</h3>
              <p>{project.description}</p>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}

function Research({ site }: { site: LabSite }) {
  return (
    <section className="inner-page">
      <p className="eyebrow">Research</p>
      <h1>Questions that organise the laboratory.</h1>
      <div className="stacked-list">
        {site.projects.map((project, index) => (
          <article key={project.title}>
            <span>0{index + 1}</span>
            <div>
              <h2>{project.title}</h2>
              <p>{project.description}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function Team({ site }: { site: LabSite }) {
  return (
    <section className="inner-page">
      <p className="eyebrow">People</p>
      <h1>The team behind the research.</h1>
      <div className="grid-three">
        {site.team.map((member) => (
          <article className="content-card" key={`${member.name}-${member.role}`}>
            <div className="member-mark">{member.name.slice(0, 1)}</div>
            <h2>{member.name}</h2>
            <p>{member.role}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function Publications({ site }: { site: LabSite }) {
  return (
    <section className="inner-page">
      <p className="eyebrow">Selected work</p>
      <h1>Publications and research outputs.</h1>
      <div className="publication-list">
        {site.publications.map((publication) => (
          <article key={`${publication.title}-${publication.year}`}>
            <span>{publication.year}</span>
            <div>
              <h2>{publication.title}</h2>
              <p>{publication.journal}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export default function SiteShell({
  site,
  section,
}: {
  site: LabSite;
  section: SiteSection;
}) {
  const variables = {
    "--site-background": site.theme.background,
    "--site-surface": site.theme.surface,
    "--site-foreground": site.theme.foreground,
    "--site-muted": site.theme.muted,
    "--site-accent": site.theme.accent,
  } as CSSProperties;

  return (
    <main className="site-theme" style={variables}>
      <div className="prototype-banner">
        Platform prototype · one application, multiple PI records
      </div>
      <header className="site-header">
        <Link className="wordmark" href={`/sites/${site.slug}`}>
          {site.labName}
        </Link>
        <SiteNav site={site} />
      </header>

      {section === "home" && <Home site={site} />}
      {section === "research" && <Research site={site} />}
      {section === "team" && <Team site={site} />}
      {section === "publications" && <Publications site={site} />}

      <footer className="site-footer">
        <span>{site.labName}</span>
        <span>Powered by LabNarrative</span>
      </footer>
    </main>
  );
}
