import Link from "next/link";
import type { LabMember, LabSite, ResearchProject, SiteRoute } from "@/lib/sites";
import styles from "./FischerMinimalDesign.module.css";

export const FISCHER_MINIMAL_VARIANT = "fischer-minimal-v1";

type Props = {
  site: LabSite;
  route: SiteRoute;
  basePath: string;
  previewMode?: boolean;
};

function safeImage(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith("/")) return trimmed;
  if (/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function piPortrait(site: LabSite): string | undefined {
  return safeImage(site.pages?.home?.piImage) || safeImage(site.pages?.contact?.piImage);
}

function researchHero(site: LabSite): string | undefined {
  const projectImage = site.research?.find((project) => safeImage(project.figureImage))?.figureImage;
  return safeImage(projectImage) || safeImage(site.heroImage);
}

function members(site: LabSite): LabMember[] {
  if (site.members?.length) return site.members;
  return site.team.map((member) => ({ name: member.name, role: member.role }));
}

function Header({ site, basePath }: Pick<Props, "site" | "basePath">) {
  return (
    <header className={styles.header}>
      <Link className={styles.brand} href={basePath}>
        <strong>{site.labName}</strong>
        <span>{site.institution}</span>
      </Link>
      <nav className={styles.nav} aria-label={`${site.labName} navigation`}>
        <Link href={basePath}>Home</Link>
        <Link href={`${basePath}/research`}>Research</Link>
        <Link href={`${basePath}/publications`}>Publications</Link>
        <Link href={`${basePath}/members`}>People</Link>
        <Link href={`${basePath}/join`}>Join</Link>
        <Link href={`${basePath}/contact`}>Contact</Link>
      </nav>
    </header>
  );
}

function Footer({ site, basePath }: Pick<Props, "site" | "basePath">) {
  return (
    <footer className={styles.footer}>
      <div>
        <strong>{site.labName}</strong>
        <span>{site.department || site.institution}</span>
      </div>
      <nav aria-label="Footer navigation">
        <Link href={`${basePath}/research`}>Research</Link>
        <Link href={`${basePath}/publications`}>Publications</Link>
        <Link href={`${basePath}/contact`}>Contact</Link>
      </nav>
      <span className={styles.footerNote}>Powered by LabNarrative</span>
    </footer>
  );
}

function Home({ site, basePath }: Pick<Props, "site" | "basePath">) {
  const portrait = piPortrait(site);
  const hero = safeImage(site.heroImage);
  const featuredProjects = (site.research?.length ? site.research : site.projects).slice(0, 4);

  return (
    <>
      <section className={`${styles.homeHero} ${portrait ? styles.homeHeroWithPortrait : ""}`}>
        <div className={styles.homeCopy}>
          <p className={styles.eyebrow}>{site.eyebrow}</p>
          <h1>{site.headline}</h1>
          <p className={styles.lede}>{site.introduction}</p>
          <div className={styles.homeActions}>
            <Link href={`${basePath}/research`}>Explore our research</Link>
            <Link href={`${basePath}/publications`}>Publications</Link>
          </div>
        </div>
        {portrait ? (
          <aside className={styles.piPortrait} aria-label={`Principal investigator ${site.piName}`}>
            <img src={portrait} alt={`${site.piName}, ${site.title}`} />
            <div>
              <span>Principal investigator</span>
              <strong>{site.piName}</strong>
              <p>{site.title}</p>
            </div>
          </aside>
        ) : null}
      </section>

      {hero ? (
        <figure className={styles.homeImage}>
          <img src={hero} alt={`${site.labName} research`} />
        </figure>
      ) : null}

      <section className={styles.overview}>
        <div className={styles.sectionLabel}>Research</div>
        <div>
          <h2>{site.pages?.home?.overviewHeading || "A connected programme of discovery."}</h2>
          <p>{site.overview || site.pages?.home?.researchOverview || site.introduction}</p>
        </div>
      </section>

      <section className={styles.projectIndex}>
        {featuredProjects.map((project, index) => {
          const title = "title" in project ? project.title : "Research programme";
          const description = "summary" in project ? project.summary : project.description;
          const slug = "slug" in project ? project.slug : undefined;
          return (
            <article key={`${title}-${index}`}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div>
                <h3>{title}</h3>
                <p>{description}</p>
              </div>
              <Link href={slug ? `${basePath}/research/${slug}` : `${basePath}/research`}>Read more</Link>
            </article>
          );
        })}
      </section>

      <section className={styles.homeClosing}>
        <div>
          <p className={styles.eyebrow}>Laboratory</p>
          <h2>{site.piName}</h2>
          <p>{site.title}{site.department ? ` · ${site.department}` : ""}</p>
        </div>
        <p>{site.overview || site.introduction}</p>
      </section>
    </>
  );
}

function InnerHero({ label, title, introduction, image }: { label: string; title: string; introduction?: string; image?: string }) {
  return (
    <section className={`${styles.innerHero} ${image ? styles.innerHeroWithImage : ""}`}>
      {image ? <img src={image} alt="" aria-hidden="true" /> : null}
      {image ? <div className={styles.innerHeroOverlay} aria-hidden="true" /> : null}
      <div className={styles.innerHeroCopy}>
        <p className={styles.eyebrow}>{label}</p>
        <h1>{title}</h1>
        {introduction ? <p>{introduction}</p> : null}
      </div>
    </section>
  );
}

function ResearchProjectPage({ site, project, basePath }: { site: LabSite; project: ResearchProject; basePath: string }) {
  const figure = safeImage(project.figureImage);
  return (
    <>
      <InnerHero
        label="Research programme"
        title={project.title}
        introduction={project.question || project.summary}
        image={figure || researchHero(site)}
      />
      <article className={styles.projectPage}>
        <Link className={styles.backLink} href={`${basePath}/research`}>← All research</Link>
        <div className={styles.projectBody}>
          <div>
            <p className={styles.sectionLabel}>Overview</p>
            <p className={styles.projectSummary}>{project.summary}</p>
            {project.body?.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
          </div>
          {figure ? (
            <figure className={styles.projectFigure}>
              <img src={figure} alt={project.figureAlt || project.title} />
              {project.figureCaption ? <figcaption>{project.figureCaption}</figcaption> : null}
            </figure>
          ) : null}
        </div>
        {project.methods?.length ? (
          <section className={styles.detailBlock}>
            <p className={styles.sectionLabel}>Approaches</p>
            <ul>{project.methods.map((method) => <li key={method}>{method}</li>)}</ul>
          </section>
        ) : null}
        {project.papers?.length ? (
          <section className={styles.detailBlock}>
            <p className={styles.sectionLabel}>Related work</p>
            <ul>{project.papers.map((paper) => <li key={paper}>{paper}</li>)}</ul>
          </section>
        ) : null}
      </article>
    </>
  );
}

function Research({ site, route, basePath }: Pick<Props, "site" | "route" | "basePath">) {
  const project = route.projectSlug ? site.research?.find((item) => item.slug === route.projectSlug) : undefined;
  if (project) return <ResearchProjectPage site={site} project={project} basePath={basePath} />;

  const projects = site.research?.length
    ? site.research
    : site.projects.map((item, index) => ({ slug: `project-${index + 1}`, title: item.title, summary: item.description } as ResearchProject));

  return (
    <>
      <InnerHero
        label={site.pages?.research?.pageLabel || "Research"}
        title={site.pages?.research?.pageHeading || "Questions that organise the laboratory."}
        introduction={site.pages?.research?.introduction || site.overview || site.introduction}
        image={researchHero(site)}
      />
      <section className={styles.researchList}>
        {projects.map((item, index) => {
          const figure = safeImage(item.figureImage);
          return (
            <article key={item.slug}>
              <span className={styles.index}>{String(index + 1).padStart(2, "0")}</span>
              <div className={styles.researchCopy}>
                <h2>{item.title}</h2>
                <p>{item.summary}</p>
                {item.question ? <p className={styles.question}>{item.question}</p> : null}
                {site.research?.length ? <Link href={`${basePath}/research/${item.slug}`}>Explore programme →</Link> : null}
              </div>
              {figure ? <img className={styles.researchThumb} src={figure} alt={item.figureAlt || item.title} /> : null}
            </article>
          );
        })}
      </section>
    </>
  );
}

function People({ site }: Pick<Props, "site">) {
  const people = members(site);
  return (
    <>
      <InnerHero
        label={site.pages?.members?.pageLabel || "People"}
        title={site.pages?.members?.pageHeading || "The people behind the research."}
        introduction={site.pages?.members?.introduction || `Meet the researchers working across ${site.labName}.`}
        image={safeImage(site.heroImage)}
      />
      <section className={styles.peopleGrid}>
        {people.map((member, index) => {
          const image = safeImage(member.image);
          return (
            <article key={`${member.name}-${index}`}>
              {image ? <img src={image} alt={member.name} /> : <div className={styles.personBlank} aria-hidden="true" />}
              <div>
                <h2>{member.name}</h2>
                <p className={styles.role}>{member.role}</p>
                {member.bio ? <p>{member.bio}</p> : null}
                {member.href ? <a href={member.href} target="_blank" rel="noreferrer">Profile ↗</a> : null}
              </div>
            </article>
          );
        })}
      </section>
    </>
  );
}

function Publications({ site }: Pick<Props, "site">) {
  return (
    <>
      <InnerHero
        label={site.pages?.publications?.pageLabel || "Publications"}
        title={site.pages?.publications?.pageHeading || "Selected and recent work."}
        introduction={site.pages?.publications?.introduction || "A chronological view of representative publications from the laboratory."}
        image={safeImage(site.heroImage)}
      />
      <section className={styles.publicationList}>
        {site.publications.map((publication, index) => (
          <article key={`${publication.title}-${publication.year}-${index}`}>
            <span className={styles.pubYear}>{publication.year}</span>
            <div>
              <h2>{publication.href ? <a href={publication.href} target="_blank" rel="noreferrer">{publication.title}</a> : publication.title}</h2>
              <p>{publication.journal}</p>
            </div>
            <span className={styles.pubIndex}>{String(index + 1).padStart(2, "0")}</span>
          </article>
        ))}
        {site.pubmedUrl ? <a className={styles.externalLink} href={site.pubmedUrl} target="_blank" rel="noreferrer">Complete PubMed record ↗</a> : null}
      </section>
    </>
  );
}

function Join({ site, basePath }: Pick<Props, "site" | "basePath">) {
  const opportunities = site.opportunities || [];
  return (
    <>
      <InnerHero
        label={site.pages?.join?.pageLabel || "Join the lab"}
        title={site.pages?.join?.pageHeading || "Work with us."}
        introduction={site.pages?.join?.introduction || "We welcome enquiries from researchers whose interests align with the laboratory."}
        image={safeImage(site.heroImage)}
      />
      <section className={styles.joinGrid}>
        <div>
          <p className={styles.sectionLabel}>{site.pages?.join?.guidanceLabel || "Before contacting us"}</p>
          <h2>{site.pages?.join?.guidanceHeading || "Make the scientific fit clear."}</h2>
          <p>{site.pages?.join?.guidanceText || "Tell us about your background, the question you want to address, and why it connects with the laboratory’s work."}</p>
          <Link href={`${basePath}/contact`}>Contact the laboratory →</Link>
        </div>
        <div className={styles.opportunities}>
          {opportunities.length ? opportunities.map((opportunity, index) => (
            <article key={`${opportunity.title}-${index}`}>
              <span>{opportunity.status || "Opportunity"}</span>
              <h3>{opportunity.title}</h3>
              <p>{opportunity.description}</p>
              {opportunity.href ? <a href={opportunity.href} target="_blank" rel="noreferrer">{opportunity.linkLabel || "Learn more"} ↗</a> : null}
            </article>
          )) : (
            <article>
              <span>Enquiries</span>
              <h3>Prospective researchers and collaborators</h3>
              <p>Openings and project-specific opportunities can be added here as they become available.</p>
            </article>
          )}
        </div>
      </section>
    </>
  );
}

function Contact({ site }: Pick<Props, "site">) {
  const portrait = piPortrait(site);
  return (
    <>
      <InnerHero
        label={site.pages?.contact?.pageLabel || "Contact"}
        title={site.pages?.contact?.pageHeading || `Connect with ${site.piName}.`}
        introduction={site.pages?.contact?.introduction || `${site.department || "Laboratory"} · ${site.institution}`}
        image={safeImage(site.heroImage)}
      />
      <section className={styles.contactGrid}>
        <div className={styles.contactDetails}>
          <div><span>Email</span>{site.email ? <a href={`mailto:${site.email}`}>{site.email}</a> : <strong>Available through the institution</strong>}</div>
          <div><span>Telephone</span><strong>{site.phone || "—"}</strong></div>
          <div><span>Institution</span><strong>{site.institution}</strong></div>
          <div><span>Address</span><strong>{site.address || "—"}</strong></div>
          {site.profileUrl ? <div><span>Official profile</span><a href={site.profileUrl} target="_blank" rel="noreferrer">View profile ↗</a></div> : null}
        </div>
        <aside className={styles.contactPi}>
          {portrait ? <img src={portrait} alt={`${site.piName}, ${site.title}`} /> : null}
          <div>
            <span>Principal investigator</span>
            <h2>{site.piName}</h2>
            <p>{site.title}</p>
          </div>
        </aside>
      </section>
    </>
  );
}

export default function FischerMinimalDesign({ site, route, basePath, previewMode = false }: Props) {
  return (
    <main className={styles.site}>
      <div className={styles.banner}>
        {previewMode
          ? "Private administrator preview · this draft is not publicly visible"
          : "LabNarrative concept · prepared as an independent design proposal"}
      </div>
      <Header site={site} basePath={basePath} />
      {route.section === "home" && <Home site={site} basePath={basePath} />}
      {route.section === "research" && <Research site={site} route={route} basePath={basePath} />}
      {route.section === "members" && <People site={site} />}
      {route.section === "publications" && <Publications site={site} />}
      {route.section === "join" && <Join site={site} basePath={basePath} />}
      {route.section === "contact" && <Contact site={site} />}
      <Footer site={site} basePath={basePath} />
    </main>
  );
}
