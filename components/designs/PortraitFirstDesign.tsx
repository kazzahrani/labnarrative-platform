import Link from "next/link";
import type { LabSite, SiteRoute } from "@/lib/sites";
import styles from "./PortraitFirstDesign.module.css";

type Props = {
  site: LabSite;
  route: SiteRoute;
  basePath: string;
  previewMode?: boolean;
};

type ResearchListItem = {
  slug: string;
  title: string;
  summary: string;
  question?: string;
};

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join("");
}

function portraitUrl(site: LabSite) {
  const portrait = site.members?.find((member) => Boolean(member.image))?.image;
  if (portrait) return portrait;
  const contactPortrait = site.pages?.contact?.piImage;
  return typeof contactPortrait === "string" && contactPortrait ? contactPortrait : undefined;
}

function Header({ site, basePath }: Pick<Props, "site" | "basePath">) {
  return (
    <header className={styles.header}>
      <Link className={styles.brand} href={basePath}>
        <strong>{site.labName}</strong>
        <span>{site.institution}</span>
      </Link>
      <nav className={styles.nav} aria-label={`${site.labName} navigation`}>
        <Link href={`${basePath}/research`}>Research</Link>
        <Link href={`${basePath}/members`}>People</Link>
        <Link href={`${basePath}/publications`}>Publications</Link>
        <Link href={`${basePath}/join`}>Join</Link>
        <Link href={`${basePath}/contact`}>Contact</Link>
      </nav>
    </header>
  );
}

function Footer({ site, basePath }: Pick<Props, "site" | "basePath">) {
  return (
    <footer className={styles.footer}>
      <strong>{site.labName}</strong>
      <Link href={basePath}>University of South Carolina</Link>
      <span>Powered by LabNarrative</span>
    </footer>
  );
}

function Home({ site, basePath }: Pick<Props, "site" | "basePath">) {
  const portrait = portraitUrl(site);
  const focus = site.focusAreas.slice(0, 4);

  return (
    <>
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <div>
            <p className={styles.kicker}>{site.eyebrow}</p>
            <h1>{site.headline}</h1>
            <p className={styles.lede}>{site.introduction}</p>
          </div>
          <div className={styles.heroSignals} aria-label="Research focus">
            {focus.map((area) => <span key={area}>{area}</span>)}
          </div>
        </div>

        <aside className={styles.portraitSide} aria-label={`Principal investigator ${site.piName}`}>
          <div className={styles.orbit} aria-hidden="true" />
          <div className={styles.portraitWrap}>
            <div className={styles.portraitFrame}>
              {portrait ? (
                <img src={portrait} alt={`${site.piName}, ${site.title}`} />
              ) : (
                <div className={styles.portraitFallback}>{initials(site.piName)}</div>
              )}
            </div>
            <div className={styles.piMeta}>
              <div>
                <p className={styles.metaLabel}>Principal investigator</p>
                <h2>{site.piName}</h2>
                <p>{site.title} · {site.department}</p>
              </div>
              <span className={styles.piCode}>PI / 01</span>
            </div>
          </div>
        </aside>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionIntro}>
          <p className={styles.sectionLabel}>Research programme</p>
          <div>
            <h2>One laboratory. Four connected regulatory questions.</h2>
            <p>{site.overview || site.introduction}</p>
          </div>
        </div>
        <div className={styles.researchGrid}>
          {site.projects.map((project, index) => (
            <article className={styles.researchCard} key={`${project.title}-${index}`}>
              <span className={styles.cardIndex}>{String(index + 1).padStart(2, "0")}</span>
              <h3>{project.title}</h3>
              <p>{project.description}</p>
              <Link className={styles.researchLink} href={`${basePath}/research`}>Explore research →</Link>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.statement}>
        <div className={styles.statementMain}>
          <blockquote>How do cells decide when p53 is expressed, stabilized, and allowed to change cell fate?</blockquote>
        </div>
        <div className={styles.statementAside}>
          <div>
            <p className={styles.sectionLabel}>Scientific direction</p>
            <p>The laboratory connects transcriptional control, DNA-damage responses and non-coding RNA biology to understand how regulatory decisions are altered in cancer.</p>
          </div>
          <Link href={`${basePath}/publications`}>Selected publications →</Link>
        </div>
      </section>
    </>
  );
}

function Research({ site, basePath }: Pick<Props, "site" | "basePath">) {
  const projects: ResearchListItem[] = site.research?.length
    ? site.research.map((project) => ({
        slug: project.slug,
        title: project.title,
        summary: project.summary,
        question: typeof project.question === "string" ? project.question : undefined,
      }))
    : site.projects.map((project, index) => ({
        slug: `project-${index + 1}`,
        title: project.title,
        summary: project.description,
      }));

  return (
    <section className={styles.inner}>
      <div className={styles.innerHeader}>
        <p className={styles.sectionLabel}>Research</p>
        <div>
          <h1>Regulatory questions across p53 and leukemia cell state.</h1>
          <p>{site.overview || site.introduction}</p>
        </div>
      </div>
      <div className={styles.list}>
        {projects.map((project, index) => (
          <article className={styles.listItem} key={project.slug}>
            <span className={styles.cardIndex}>{String(index + 1).padStart(2, "0")}</span>
            <div>
              <h2>{project.title}</h2>
              <p>{project.summary}</p>
              {project.question ? <p><strong>Question:</strong> {project.question}</p> : null}
            </div>
            <span>Research programme</span>
          </article>
        ))}
      </div>
      <p style={{ marginTop: 32 }}><Link className={styles.researchLink} href={`${basePath}/publications`}>View publications →</Link></p>
    </section>
  );
}

function Members({ site }: Pick<Props, "site">) {
  const people = site.members?.length ? site.members : site.team;
  return (
    <section className={styles.inner}>
      <div className={styles.innerHeader}>
        <p className={styles.sectionLabel}>People</p>
        <div>
          <h1>A research group defined by the questions, not by a photo wall.</h1>
          <p>Profiles are intentionally presented with clear typography and roles. Additional members can be added without requiring professional portraits or a group photograph.</p>
        </div>
      </div>
      <div className={styles.peopleGrid}>
        {people.map((member, index) => (
          <article className={styles.person} key={`${member.name}-${index}`}>
            <div className={styles.personMark}>{initials(member.name)}</div>
            <h2>{member.name}</h2>
            <p>{member.role}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function Publications({ site }: Pick<Props, "site">) {
  return (
    <section className={styles.inner}>
      <div className={styles.innerHeader}>
        <p className={styles.sectionLabel}>Publications</p>
        <div>
          <h1>Selected work across p53 regulation and cancer biology.</h1>
          <p>A concise record of landmark and representative publications from the laboratory.</p>
        </div>
      </div>
      <div className={styles.list}>
        {site.publications.map((publication, index) => (
          <article className={styles.listItem} key={`${publication.title}-${index}`}>
            <span className={styles.cardIndex}>{publication.year}</span>
            <div>
              <h2>{publication.href ? <a href={publication.href} target="_blank" rel="noreferrer">{publication.title}</a> : publication.title}</h2>
              <p>{publication.journal}</p>
            </div>
            <span>{String(index + 1).padStart(2, "0")}</span>
          </article>
        ))}
      </div>
      {site.pubmedUrl ? <p style={{ marginTop: 32 }}><a className={styles.researchLink} href={site.pubmedUrl} target="_blank" rel="noreferrer">Complete PubMed record →</a></p> : null}
    </section>
  );
}

function Join({ site, basePath }: Pick<Props, "site" | "basePath">) {
  return (
    <section className={styles.inner}>
      <div className={styles.innerHeader}>
        <p className={styles.sectionLabel}>Join the lab</p>
        <div>
          <h1>Bring a precise question and a strong scientific fit.</h1>
          <p>Prospective students, postdoctoral researchers and collaborators whose interests align with p53 regulation, cellular stress or RNA biology are welcome to get in touch.</p>
        </div>
      </div>
      <div className={styles.statement}>
        <div className={styles.statementMain}><blockquote>Tell us what you want to understand—and why this laboratory is the right place to ask it.</blockquote></div>
        <div className={styles.statementAside}><p>Include your background, research interests, relevant experience and expected timing or funding route.</p><Link href={`${basePath}/contact`}>Contact the laboratory →</Link></div>
      </div>
    </section>
  );
}

function Contact({ site }: Pick<Props, "site">) {
  return (
    <section className={styles.inner}>
      <div className={styles.innerHeader}>
        <p className={styles.sectionLabel}>Contact</p>
        <div>
          <h1>Connect with {site.piName}.</h1>
          <p>{site.department}<br />{site.institution}</p>
        </div>
      </div>
      <div className={styles.contactGrid}>
        <div className={styles.contactBlock}><span className={styles.metaLabel}>Email</span><strong>{site.email ? <a href={`mailto:${site.email}`}>{site.email}</a> : "Available through the institution"}</strong></div>
        <div className={styles.contactBlock}><span className={styles.metaLabel}>Telephone</span><strong>{site.phone || "—"}</strong></div>
        <div className={styles.contactBlock}><span className={styles.metaLabel}>Office</span><strong>{site.address || site.institution}</strong></div>
        <div className={styles.contactBlock}><span className={styles.metaLabel}>Official profile</span><strong>{site.profileUrl ? <a href={site.profileUrl} target="_blank" rel="noreferrer">University profile ↗</a> : "—"}</strong></div>
      </div>
    </section>
  );
}

export default function PortraitFirstDesign({ site, route, basePath, previewMode = false }: Props) {
  return (
    <main className={styles.site}>
      <div className={styles.banner}>
        {previewMode
          ? "Private administrator preview · this draft is not publicly visible"
          : "LabNarrative concept · prepared as an independent design proposal"}
      </div>
      <Header site={site} basePath={basePath} />
      {route.section === "home" && <Home site={site} basePath={basePath} />}
      {route.section === "research" && <Research site={site} basePath={basePath} />}
      {route.section === "members" && <Members site={site} />}
      {route.section === "publications" && <Publications site={site} />}
      {route.section === "join" && <Join site={site} basePath={basePath} />}
      {route.section === "contact" && <Contact site={site} />}
      <Footer site={site} basePath={basePath} />
    </main>
  );
}