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
import styles from "./signature-academic-design.module.css";

type SignatureMode = "zhang" | "gao" | "goyette";

type SignatureProps = {
  site: LabSite;
  route: SiteRoute;
  basePath: string;
  previewMode?: boolean;
  mode: SignatureMode;
};

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

function safeImageUrl(value?: string): string | undefined {
  if (!value) return undefined;
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

function themeStyle(site: LabSite, mode: SignatureMode): CSSProperties {
  const defaults = {
    zhang: { bg: "#F4F3EE", surface: "#FFFFFF", ink: "#10172A", muted: "#697082", accent: "#2D50FF" },
    gao: { bg: "#090A13", surface: "#151827", ink: "#F7F4F0", muted: "#A5A7B5", accent: "#FF785A" },
    goyette: { bg: "#F6F0E8", surface: "#FFFDF9", ink: "#291C24", muted: "#766A6F", accent: "#8B2D4A" },
  }[mode];
  return {
    "--sig-background": site.theme?.background || defaults.bg,
    "--sig-surface": site.theme?.surface || defaults.surface,
    "--sig-foreground": site.theme?.foreground || defaults.ink,
    "--sig-muted": site.theme?.muted || defaults.muted,
    "--sig-accent": site.theme?.accent || defaults.accent,
  } as CSSProperties;
}

function modeLabel(mode: SignatureMode): string {
  if (mode === "zhang") return "Transcription systems";
  if (mode === "gao") return "Tumour ecosystems";
  return "Metastatic evolution";
}

function Header({ site, route, basePath, mode }: Omit<SignatureProps, "previewMode">) {
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
      <Link href={basePath} className={styles.brand} aria-label={`${site.labName} home`}>
        <span className={styles.brandMark} aria-hidden="true">
          {mode === "zhang" && <><i /><i /><i /><i /></>}
          {mode === "gao" && <><i /><i /><i /></>}
          {mode === "goyette" && <><i /><i /></>}
        </span>
        <span>
          <strong>{site.labName}</strong>
          <small>{site.labSubtitle || modeLabel(mode)}</small>
        </span>
      </Link>
      <nav className={styles.nav} aria-label="Main navigation">
        {nav.map((item) => (
          <Link className={route.section === item.key ? styles.active : ""} href={item.href} key={item.key}>
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}

function TranscriptionVisual() {
  return (
    <div className={styles.transcriptionVisual} aria-label="Stylised transcriptional control map">
      <span className={styles.transcriptTrackA} />
      <span className={styles.transcriptTrackB} />
      <span className={styles.transcriptTrackC} />
      <div className={styles.promoterNode}><small>DNA</small><b>promoter</b></div>
      <div className={styles.tfNode}><small>TF</small><b>factor</b></div>
      <div className={styles.cofactorNode}><small>CF</small><b>cofactor</b></div>
      <div className={styles.polNode}><small>Pol II</small><b>transcription</b></div>
      <div className={styles.rnaNode}><small>RNA</small><b>processing</b></div>
      <div className={styles.visualCaption}><span>01</span><p>Regulatory precision emerges from cooperative molecular assemblies.</p></div>
    </div>
  );
}

function EcosystemVisual() {
  const cells = ["tumour", "myeloid", "tcell", "stromal", "neutrophil", "vascular"];
  return (
    <div className={styles.ecosystemVisual} aria-label="Abstract spatial tumour immune ecosystem">
      <div className={styles.ecosystemGrid} />
      <span className={styles.ecosystemHaloA} />
      <span className={styles.ecosystemHaloB} />
      <span className={styles.ecosystemHaloC} />
      {cells.map((cell, index) => <i className={styles[`cell${index + 1}`]} key={cell}><small>{cell}</small></i>)}
      <div className={styles.ecosystemLegend}>
        <span><i /> spatial state</span>
        <span><i /> immune interface</span>
        <span><i /> metastatic niche</span>
      </div>
    </div>
  );
}

function EvolutionVisual({ image }: { image?: string }) {
  return (
    <div className={styles.evolutionVisual}>
      {image && <img src={image} alt="Tumour heterogeneity and metastasis research" />}
      <svg viewBox="0 0 640 450" role="img" aria-label="Stylised tumour evolution lineage">
        <path d="M45 210 C145 210 135 95 245 95 C350 95 325 35 470 35" />
        <path d="M45 210 C165 210 150 210 280 210 C405 210 390 145 575 145" />
        <path d="M45 210 C150 210 145 330 275 330 C390 330 415 395 590 395" />
        <circle cx="45" cy="210" r="13" />
        <circle cx="245" cy="95" r="9" />
        <circle cx="280" cy="210" r="9" />
        <circle cx="275" cy="330" r="9" />
        <circle cx="470" cy="35" r="13" />
        <circle cx="575" cy="145" r="13" />
        <circle cx="590" cy="395" r="13" />
      </svg>
      <div className={styles.evolutionLabels}>
        <span>primary tumour</span><span>adaptation</span><span>metastatic states</span>
      </div>
    </div>
  );
}

function ActionLinks({ basePath, pages }: { basePath: string; pages: ReturnType<typeof getBourdonPages> }) {
  return (
    <div className={styles.heroActions}>
      <Link className={styles.primaryButton} href={`${basePath}/research`}>{pages.home.researchButton}<span>↗</span></Link>
      <Link className={styles.secondaryButton} href={`${basePath}/publications`}>{pages.home.publicationsButton}</Link>
    </div>
  );
}

function ProgrammeCards({ site, basePath, mode }: { site: LabSite; basePath: string; mode: SignatureMode }) {
  const projects = researchProjects(site);
  return (
    <section className={styles.programmes}>
      <div className={styles.sectionHeading}>
        <div><span>02</span><p>Research programmes</p><h2>{mode === "zhang" ? "Mechanisms with therapeutic consequence." : mode === "gao" ? "Mapping the cells, niches and pressures that shape disease." : "Following heterogeneity from primary tumour to resistant metastasis."}</h2></div>
        <Link href={`${basePath}/research`}>Explore all programmes ↗</Link>
      </div>
      <div className={styles.programmeGrid}>
        {projects.map((project, index) => (
          <Link href={`${basePath}/research/${project.slug}`} className={styles.programmeCard} key={`${project.slug}-${index}`}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <h3>{project.title}</h3>
            <p>{project.summary}</p>
            <b>Open programme ↗</b>
          </Link>
        ))}
      </div>
    </section>
  );
}

function PiFeature({ site, basePath, mode }: { site: LabSite; basePath: string; mode: SignatureMode }) {
  const pages = getBourdonPages(site);
  const image = safeImageUrl(pages.home.piImage || site.heroImage);
  return (
    <section className={styles.piFeature}>
      <div className={styles.piVisual}>
        {image ? <img src={image} alt={pages.home.piName} /> : <span>{initials(pages.home.piName)}</span>}
        <small>{modeLabel(mode)} · principal investigator</small>
      </div>
      <div className={styles.piCopy}>
        <p>{pages.home.piSectionLabel}</p>
        <h2>{pages.home.piName}</h2>
        <h3>{pages.home.piRole}</h3>
        <div>{pages.home.piBiography}</div>
        <Link href={`${basePath}/members`}>{pages.home.piLinkLabel} ↗</Link>
      </div>
    </section>
  );
}

function PublicationPreview({ site, basePath }: { site: LabSite; basePath: string }) {
  const publications = site.publications.slice(0, 4);
  return (
    <section className={styles.publicationPreview}>
      <div className={styles.sectionHeading}>
        <div><span>03</span><p>Selected work</p><h2>Recent and defining publications.</h2></div>
        <Link href={`${basePath}/publications`}>Full publication list ↗</Link>
      </div>
      <div className={styles.publicationRows}>
        {publications.map((publication, index) => {
          const row = <article><span>{publication.year}</span><div><h3>{publication.title}</h3><p>{publication.journal}</p></div><b>↗</b></article>;
          return publication.href ? <a href={publication.href} target="_blank" rel="noreferrer" key={`${publication.title}-${index}`}>{row}</a> : <div key={`${publication.title}-${index}`}>{row}</div>;
        })}
      </div>
    </section>
  );
}

function JoinBanner({ site, basePath }: { site: LabSite; basePath: string }) {
  const pages = getBourdonPages(site);
  return (
    <section className={styles.joinBanner}>
      <div><p>{pages.home.joinLabel}</p><h2>{pages.home.joinHeading}</h2></div>
      <Link href={`${basePath}/join`}>{pages.home.joinButton} ↗</Link>
    </section>
  );
}

function ZhangHome({ site, basePath }: { site: LabSite; basePath: string }) {
  const pages = getBourdonPages(site);
  return (
    <>
      <section className={styles.zhangHero}>
        <div className={styles.heroCopy}>
          <p className={styles.kicker}>{pages.home.topicLine}</p>
          <h1>{pages.home.mainHeading}</h1>
          <p className={styles.heroText}>{pages.home.openingText}</p>
          <ActionLinks basePath={basePath} pages={pages} />
          <div className={styles.focusStrip}>{site.focusAreas.slice(0, 4).map((area) => <span key={area}>{area}</span>)}</div>
        </div>
        <TranscriptionVisual />
      </section>
      <section className={styles.statement}><span>01</span><h2>{pages.home.overviewHeading}</h2><p>{pages.home.researchOverview}</p></section>
      <ProgrammeCards site={site} basePath={basePath} mode="zhang" />
      <PiFeature site={site} basePath={basePath} mode="zhang" />
      <PublicationPreview site={site} basePath={basePath} />
      <JoinBanner site={site} basePath={basePath} />
    </>
  );
}

function GaoHome({ site, basePath }: { site: LabSite; basePath: string }) {
  const pages = getBourdonPages(site);
  return (
    <>
      <section className={styles.gaoHero}>
        <EcosystemVisual />
        <div className={styles.gaoOverlay}>
          <p className={styles.kicker}>{pages.home.topicLine}</p>
          <h1>{pages.home.mainHeading}</h1>
          <p>{pages.home.openingText}</p>
          <ActionLinks basePath={basePath} pages={pages} />
        </div>
        <div className={styles.gaoFocus}>{site.focusAreas.slice(0, 4).map((area, index) => <span key={area}><b>{String(index + 1).padStart(2, "0")}</b>{area}</span>)}</div>
      </section>
      <section className={styles.ecosystemStatement}><div><span>01</span><p>Research framework</p></div><h2>{pages.home.overviewHeading}</h2><p>{pages.home.researchOverview}</p></section>
      <ProgrammeCards site={site} basePath={basePath} mode="gao" />
      <PiFeature site={site} basePath={basePath} mode="gao" />
      <PublicationPreview site={site} basePath={basePath} />
      <JoinBanner site={site} basePath={basePath} />
    </>
  );
}

function GoyetteHome({ site, basePath }: { site: LabSite; basePath: string }) {
  const pages = getBourdonPages(site);
  const image = safeImageUrl(pages.home.homepageImage || site.heroImage);
  return (
    <>
      <section className={styles.goyetteHero}>
        <div className={styles.goyetteHeadline}>
          <p className={styles.kicker}>{pages.home.topicLine}</p>
          <h1>{pages.home.mainHeading}</h1>
          <p>{pages.home.openingText}</p>
          <ActionLinks basePath={basePath} pages={pages} />
        </div>
        <EvolutionVisual image={image} />
        <div className={styles.goyetteEdition}><span>New laboratory · 2026</span><b>Tumour heterogeneity<br />& metastasis</b></div>
      </section>
      <section className={styles.goyetteStatement}><span>01</span><div><p>{pages.home.overviewLabel}</p><h2>{pages.home.overviewHeading}</h2></div><p>{pages.home.researchOverview}</p></section>
      <ProgrammeCards site={site} basePath={basePath} mode="goyette" />
      <PiFeature site={site} basePath={basePath} mode="goyette" />
      <PublicationPreview site={site} basePath={basePath} />
      <JoinBanner site={site} basePath={basePath} />
    </>
  );
}

function PageIntro({ label, title, text, mode }: { label: string; title: string; text: string; mode: SignatureMode }) {
  return (
    <section className={styles.pageIntro}>
      <div><p>{label}</p><h1>{title}</h1></div>
      <div className={styles.pageIntroMark} aria-hidden="true">{mode === "zhang" ? "TF" : mode === "gao" ? "TME" : "EVO"}</div>
      <p>{text}</p>
    </section>
  );
}

function ResearchIndex({ site, basePath, mode }: { site: LabSite; basePath: string; mode: SignatureMode }) {
  const pages = getBourdonPages(site);
  const projects = researchProjects(site);
  return (
    <>
      <PageIntro label={pages.research.pageLabel} title={pages.research.pageHeading} text={pages.research.introduction} mode={mode} />
      <section className={styles.researchIndex}>
        {projects.map((project, index) => (
          <Link href={`${basePath}/research/${project.slug}`} className={styles.researchRow} key={`${project.slug}-${index}`}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <div><h2>{project.title}</h2><p>{project.summary}</p></div>
            <aside>{project.question && <blockquote><small>{pages.research.questionLabel}</small>{project.question}</blockquote>}<b>{pages.research.programmeLinkLabel} ↗</b></aside>
          </Link>
        ))}
      </section>
    </>
  );
}

function ProjectDetail({ site, slug, basePath, mode }: { site: LabSite; slug: string; basePath: string; mode: SignatureMode }) {
  const pages = getBourdonPages(site);
  const projects = researchProjects(site);
  const index = projects.findIndex((project) => project.slug === slug);
  const project = projects[index];
  if (!project) return <ResearchIndex site={site} basePath={basePath} mode={mode} />;
  const next = projects[(index + 1) % projects.length];
  return (
    <>
      <section className={styles.projectHero}>
        <Link href={`${basePath}/research`}>← {pages.research.backLink}</Link>
        <p>{pages.research.programmeLabel} {String(index + 1).padStart(2, "0")}</p>
        <h1>{project.title}</h1>
        <div>{project.summary}</div>
      </section>
      <section className={styles.projectQuestion}><span>Central question</span><h2>{project.question || project.title}</h2></section>
      <section className={styles.projectBody}>
        <div>{(project.body?.length ? project.body : [project.summary]).map((paragraph, paragraphIndex) => <p key={paragraphIndex}>{paragraph}</p>)}</div>
        <aside>
          {!!project.methods?.length && <div><h3>Approaches</h3><ul>{project.methods.map((method, methodIndex) => <li key={methodIndex}>{method}</li>)}</ul></div>}
          {!!project.papers?.length && <div><h3>Selected work</h3><ul>{project.papers.map((paper, paperIndex) => <li key={paperIndex}>{paper}</li>)}</ul></div>}
        </aside>
      </section>
      {next && <section className={styles.nextProject}><span>{pages.research.nextProgrammeLabel}</span><Link href={`${basePath}/research/${next.slug}`}>{next.title} ↗</Link></section>}
    </>
  );
}

function PublicationsPage({ site, mode }: { site: LabSite; mode: SignatureMode }) {
  const pages = getBourdonPages(site);
  return (
    <>
      <PageIntro label={pages.publications.pageLabel} title={pages.publications.pageHeading} text={pages.publications.introduction} mode={mode} />
      <section className={styles.publicationPage}>
        {site.publications.map((publication, index) => {
          const content = <article><span>{String(index + 1).padStart(2, "0")}</span><time>{publication.year}</time><div><h2>{publication.title}</h2><p>{publication.journal}</p></div><b>↗</b></article>;
          return publication.href ? <a href={publication.href} target="_blank" rel="noreferrer" key={`${publication.title}-${index}`}>{content}</a> : <div key={`${publication.title}-${index}`}>{content}</div>;
        })}
        {site.pubmedUrl && <a className={styles.recordLink} href={site.pubmedUrl} target="_blank" rel="noreferrer">{pages.publications.pubmedButton} ↗</a>}
      </section>
    </>
  );
}

function MembersPage({ site, mode }: { site: LabSite; mode: SignatureMode }) {
  const pages = getBourdonPages(site);
  const members = labMembers(site);
  return (
    <>
      <PageIntro label={pages.members.pageLabel} title={pages.members.pageHeading} text={pages.members.introduction} mode={mode} />
      <section className={styles.membersGrid}>
        {members.map((member, index) => {
          const image = safeImageUrl(member.image);
          return <article className={styles.memberCard} key={`${member.name}-${index}`}>
            <div className={styles.memberVisual}>{image ? <img src={image} alt={member.name} /> : <span>{initials(member.name)}</span>}</div>
            <small>{index === 0 ? "Principal investigator" : member.role}</small>
            <h2>{member.name}</h2>
            <p>{member.bio}</p>
            {member.href && <a href={member.href} target="_blank" rel="noreferrer">{pages.members.profileLinkLabel} ↗</a>}
          </article>;
        })}
      </section>
      {pages.members.noticeText && <section className={styles.memberNotice}><h3>{pages.members.noticeHeading}</h3><p>{pages.members.noticeText}</p></section>}
    </>
  );
}

function JoinPage({ site, mode }: { site: LabSite; mode: SignatureMode }) {
  const pages = getBourdonPages(site);
  const items = opportunities(site);
  return (
    <>
      <PageIntro label={pages.join.pageLabel} title={pages.join.pageHeading} text={pages.join.introduction} mode={mode} />
      <section className={styles.opportunitiesGrid}>
        {items.map((item, index) => <article key={`${item.title}-${index}`}><span>{item.status || "Opportunity"}</span><h2>{item.title}</h2><p>{item.description}</p>{item.href && <a href={item.href} target={item.href.startsWith("http") ? "_blank" : undefined} rel="noreferrer">{item.linkLabel || "Learn more"} ↗</a>}</article>)}
      </section>
      <section className={styles.guidance}><p>{pages.join.guidanceLabel}</p><h2>{pages.join.guidanceHeading}</h2><div>{pages.join.guidanceText}</div><a href={`mailto:${site.email}`}>{pages.join.contactButton} ↗</a></section>
    </>
  );
}

function ContactPage({ site, mode }: { site: LabSite; mode: SignatureMode }) {
  const pages = getBourdonPages(site);
  const image = safeImageUrl(pages.contact.piImage || site.heroImage);
  return (
    <>
      <PageIntro label={pages.contact.pageLabel} title={pages.contact.pageHeading} text={pages.contact.introduction} mode={mode} />
      <section className={styles.contactGrid}>
        <div className={styles.contactIdentity}>
          <div>{image ? <img src={image} alt={pages.contact.piName} /> : <span>{initials(pages.contact.piName)}</span>}</div>
          <h2>{pages.contact.piName}</h2><h3>{pages.contact.piRole}</h3><p>{pages.contact.piBiography}</p>
        </div>
        <div className={styles.contactDetails}>
          <section><span>{pages.contact.laboratoryLabel}</span><strong>{pages.contact.department || site.department}</strong><p>{pages.contact.institution || site.institution}</p><p className={styles.preserveLines}>{pages.contact.address || site.address}</p></section>
          <section><span>{pages.contact.emailLabel}</span><a href={`mailto:${pages.contact.email || site.email}`}>{pages.contact.email || site.email}</a></section>
          {(pages.contact.phone || site.phone) && <section><span>{pages.contact.telephoneLabel}</span><p>{pages.contact.phone || site.phone}</p></section>}
          <section className={styles.contactLinks}>{(pages.contact.officialProfile || site.profileUrl) && <a href={pages.contact.officialProfile || site.profileUrl} target="_blank" rel="noreferrer">{pages.contact.profileLinkText || "Official profile"} ↗</a>}{site.pubmedUrl && <a href={site.pubmedUrl} target="_blank" rel="noreferrer">PubMed record ↗</a>}</section>
        </div>
      </section>
    </>
  );
}

function Footer({ site, basePath }: { site: LabSite; basePath: string }) {
  const pages = getBourdonPages(site);
  return (
    <footer className={styles.footer}>
      <div><strong>{pages.home.footerLabName || site.labName}</strong><p>{pages.home.footerDepartment || site.department}</p><p>{pages.home.footerInstitution || site.institution}</p></div>
      <div><span>{pages.home.footerExploreHeading}</span><Link href={`${basePath}/research`}>{pages.home.footerResearchLink}</Link><Link href={`${basePath}/publications`}>{pages.home.footerPublicationsLink}</Link><Link href={`${basePath}/join`}>{pages.home.footerJoinLink}</Link></div>
      <div><span>{pages.home.footerContactHeading}</span>{site.email && <a href={`mailto:${site.email}`}>{site.email}</a>}{site.phone && <p>{site.phone}</p>}</div>
      <small>{pages.home.footerNote || "Independent concept by LabNarrative · Not an official laboratory website"} · © {new Date().getFullYear()} {site.labName}</small>
    </footer>
  );
}

function RenderRoute({ site, route, basePath, mode }: Omit<SignatureProps, "previewMode">): ReactNode {
  if (route.section === "home") {
    if (mode === "zhang") return <ZhangHome site={site} basePath={basePath} />;
    if (mode === "gao") return <GaoHome site={site} basePath={basePath} />;
    return <GoyetteHome site={site} basePath={basePath} />;
  }
  if (route.section === "research" && route.projectSlug) return <ProjectDetail site={site} slug={route.projectSlug} basePath={basePath} mode={mode} />;
  if (route.section === "research") return <ResearchIndex site={site} basePath={basePath} mode={mode} />;
  if (route.section === "publications") return <PublicationsPage site={site} mode={mode} />;
  if (route.section === "members") return <MembersPage site={site} mode={mode} />;
  if (route.section === "join") return <JoinPage site={site} mode={mode} />;
  return <ContactPage site={site} mode={mode} />;
}

export default function SignatureAcademicDesign({ site, route, basePath, previewMode = false, mode }: SignatureProps) {
  return (
    <main className={`${styles.site} ${styles[mode]}`} style={themeStyle(site, mode)}>
      <div className={styles.conceptBanner}>{previewMode ? "Private administrator preview · this draft is not publicly visible" : "LabNarrative concept · prepared as an independent design proposal"}</div>
      <Header site={site} route={route} basePath={basePath} mode={mode} />
      <RenderRoute site={site} route={route} basePath={basePath} mode={mode} />
      <Footer site={site} basePath={basePath} />
    </main>
  );
}
