"use client";

import Link from "next/link";
import { getBourdonPages, type LabSite, type ResearchProject, type SiteRoute } from "@/lib/sites";

type Props = {
  site: LabSite;
  route: SiteRoute;
  basePath: string;
  previewMode?: boolean;
};

function safeAsset(value?: string) {
  if (!value) return undefined;
  if (value.startsWith("/")) return value;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function projectsFor(site: LabSite): ResearchProject[] {
  if (site.research?.length) return site.research;
  return site.projects.map((project, index) => ({
    slug: `project-${index + 1}`,
    title: project.title,
    summary: project.description,
  }));
}

export default function HDPortraitProjectDesign({ site, route, basePath, previewMode = false }: Props) {
  const pages = getBourdonPages(site);
  const projects = projectsFor(site);
  const index = projects.findIndex((project) => project.slug === route.projectSlug);
  const project = projects[index];

  if (!project) {
    return (
      <main className="hdp-project-missing">
        <p>Research project not found.</p>
        <Link href={`${basePath}/research`}>← Back to research</Link>
      </main>
    );
  }

  const figure = safeAsset(project.figureImage);
  const question = project.question?.trim();
  const showQuestion = Boolean(question && question.toLowerCase() !== project.title.trim().toLowerCase());

  return (
    <div className="hdp-project-site">
      {previewMode && (
        <div className="hdp-project-preview">Private administrator preview · this draft is not publicly visible</div>
      )}

      <header className="hdp-project-header">
        <Link className="hdp-project-brand" href={basePath}>{site.labName.toUpperCase()}</Link>
        <nav aria-label={`${site.labName} navigation`}>
          <Link href={basePath}>{pages.navigation.home}</Link>
          <Link className="active" href={`${basePath}/research`}>{pages.navigation.research}</Link>
          <Link href={`${basePath}/members`}>{pages.navigation.members}</Link>
          <Link href={`${basePath}/publications`}>{pages.navigation.publications}</Link>
          <Link href={`${basePath}/join`}>{pages.navigation.join}</Link>
          <Link href={`${basePath}/contact`}>{pages.navigation.contact}</Link>
        </nav>
      </header>

      <main className="hdp-project-main">
        <article>
          <header className="hdp-project-intro">
            <p className="hdp-project-kicker">{pages.research.programmeLabel} {String(index + 1).padStart(2, "0")}</p>
            <h1>{project.title}</h1>
            {project.summary && <p className="hdp-project-summary">{project.summary}</p>}
          </header>

          {showQuestion && (
            <section className="hdp-project-question">
              <p>{pages.research.questionLabel}</p>
              <h2>{question}</h2>
            </section>
          )}

          {((project.body?.length ?? 0) > 0 || figure) && (
            <section className={`hdp-project-narrative${figure ? " has-figure" : ""}`}>
              {(project.body?.length ?? 0) > 0 && (
                <div className="hdp-project-body">
                  {project.body?.map((paragraph, paragraphIndex) => <p key={paragraphIndex}>{paragraph}</p>)}
                </div>
              )}
              {figure && (
                <figure>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={figure} alt={project.figureAlt || project.figureCaption || project.title} />
                  {project.figureCaption && <figcaption>{project.figureCaption}</figcaption>}
                </figure>
              )}
            </section>
          )}

          {!!project.methods?.length && (
            <section className="hdp-project-detail-list">
              <p>Approaches</p>
              <div>{project.methods.map((method) => <span key={method}>{method}</span>)}</div>
            </section>
          )}

          {!!project.papers?.length && (
            <section className="hdp-project-detail-list">
              <p>Selected work</p>
              <div>{project.papers.map((paper) => <span key={paper}>{paper}</span>)}</div>
            </section>
          )}

          <Link className="hdp-project-return" href={`${basePath}/research`}>← {pages.research.returnLink}</Link>
        </article>
      </main>

      <footer className="hdp-project-footer">
        <div>
          <strong>{site.labName}</strong>
          {site.department && <span>{site.department}</span>}
          <span>{site.institution}</span>
        </div>
        <div>
          <Link href={`${basePath}/research`}>{pages.navigation.research}</Link>
          <Link href={`${basePath}/members`}>{pages.navigation.members}</Link>
          <Link href={`${basePath}/publications`}>{pages.navigation.publications}</Link>
        </div>
        <div>
          {site.email && <a href={`mailto:${site.email}`}>{site.email}</a>}
          <span>Independent concept by LabNarrative</span>
        </div>
      </footer>

      <style jsx global>{`
        .hdp-project-site {
          min-height: 100vh;
          background: #f7f6f2;
          color: #15201c;
          font-family: Arial, Helvetica, sans-serif;
        }
        .hdp-project-site * { box-sizing: border-box; }
        .hdp-project-site a { color: inherit; text-decoration: none; }
        .hdp-project-preview {
          padding: 8px 24px;
          background: #dfe2df;
          color: #121514;
          text-align: center;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: .14em;
          text-transform: uppercase;
        }
        .hdp-project-header {
          min-height: 132px;
          padding: 17px clamp(24px, 5vw, 76px) 15px;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          justify-content: center;
          gap: 10px;
          background: #080a09;
          color: #fff;
        }
        .hdp-project-brand {
          font-family: Arial, Helvetica, sans-serif;
          font-size: clamp(24px, 2vw, 32px);
          font-weight: 400;
          line-height: 1;
          letter-spacing: -.025em;
        }
        .hdp-project-header nav {
          width: 100%;
          display: flex;
          align-items: center;
          gap: clamp(17px, 1.75vw, 27px);
          overflow-x: auto;
          scrollbar-width: none;
          white-space: nowrap;
        }
        .hdp-project-header nav::-webkit-scrollbar { display: none; }
        .hdp-project-header nav a {
          position: relative;
          flex: 0 0 auto;
          padding: 6px 0 8px;
          color: rgba(255,255,255,.58);
          font-size: 10px;
          font-weight: 700;
          line-height: 1.2;
          letter-spacing: .145em;
          text-transform: uppercase;
        }
        .hdp-project-header nav a:hover,
        .hdp-project-header nav a.active { color: #fff; }
        .hdp-project-header nav a.active::after {
          content: "";
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          height: 1px;
          background: #fff;
        }
        .hdp-project-main {
          padding: clamp(70px, 8vw, 120px) clamp(24px, 7vw, 112px) clamp(82px, 9vw, 136px);
          background: #fff;
        }
        .hdp-project-main article { max-width: 1240px; margin: 0 auto; }
        .hdp-project-intro {
          padding-bottom: clamp(52px, 6vw, 86px);
          border-bottom: 1px solid #d7d9d7;
        }
        .hdp-project-kicker,
        .hdp-project-question > p,
        .hdp-project-detail-list > p {
          margin: 0 0 20px;
          color: ${site.theme.accent || "#315f50"};
          font-size: 11px;
          font-weight: 800;
          letter-spacing: .2em;
          text-transform: uppercase;
        }
        .hdp-project-intro h1 {
          max-width: 1050px;
          margin: 0;
          font-family: Georgia, "Times New Roman", serif;
          font-size: clamp(48px, 6.5vw, 96px);
          font-weight: 400;
          line-height: .98;
          letter-spacing: -.05em;
        }
        .hdp-project-summary {
          max-width: 900px;
          margin: 38px 0 0;
          font-family: Georgia, "Times New Roman", serif;
          font-size: clamp(19px, 1.75vw, 26px);
          line-height: 1.62;
          color: #48524e;
        }
        .hdp-project-question {
          padding: clamp(48px, 6vw, 76px) 0;
          border-bottom: 1px solid #d7d9d7;
        }
        .hdp-project-question h2 {
          max-width: 920px;
          margin: 0;
          font-family: Georgia, "Times New Roman", serif;
          font-size: clamp(31px, 4vw, 54px);
          font-weight: 400;
          line-height: 1.12;
          letter-spacing: -.03em;
        }
        .hdp-project-narrative {
          padding: clamp(52px, 6vw, 84px) 0;
          border-bottom: 1px solid #d7d9d7;
        }
        .hdp-project-narrative.has-figure {
          display: grid;
          grid-template-columns: minmax(0, .9fr) minmax(340px, 1.1fr);
          gap: clamp(36px, 6vw, 86px);
          align-items: start;
        }
        .hdp-project-body p {
          margin: 0 0 24px;
          font-family: Georgia, "Times New Roman", serif;
          font-size: 19px;
          line-height: 1.72;
          color: #29322f;
        }
        .hdp-project-narrative figure { margin: 0; }
        .hdp-project-narrative img {
          width: 100%;
          min-height: 360px;
          display: block;
          object-fit: cover;
          background: #ebeae6;
        }
        .hdp-project-narrative figcaption {
          margin-top: 11px;
          color: #6e7773;
          font-size: 11px;
          line-height: 1.5;
        }
        .hdp-project-detail-list {
          padding: 44px 0;
          border-bottom: 1px solid #d7d9d7;
        }
        .hdp-project-detail-list > div {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px 36px;
        }
        .hdp-project-detail-list span {
          padding: 15px 0;
          border-bottom: 1px solid #e5e6e4;
          font-family: Georgia, "Times New Roman", serif;
          font-size: 18px;
          line-height: 1.5;
        }
        .hdp-project-return {
          display: inline-block;
          margin-top: 48px;
          padding-bottom: 5px;
          border-bottom: 1px solid currentColor;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: .14em;
          text-transform: uppercase;
        }
        .hdp-project-footer {
          padding: 54px clamp(24px, 5vw, 80px);
          display: grid;
          grid-template-columns: 1.25fr .8fr 1fr;
          gap: 46px;
          background: #080a09;
          color: #fff;
        }
        .hdp-project-footer > div { display: flex; flex-direction: column; gap: 8px; }
        .hdp-project-footer strong {
          margin-bottom: 6px;
          font-family: Georgia, "Times New Roman", serif;
          font-size: 21px;
          font-weight: 400;
        }
        .hdp-project-footer a,
        .hdp-project-footer span {
          font-size: 10px;
          line-height: 1.6;
          letter-spacing: .06em;
          color: rgba(255,255,255,.62);
        }
        .hdp-project-footer a:hover { color: #fff; }
        .hdp-project-missing { padding: 80px; font-family: Arial, Helvetica, sans-serif; }
        @media (max-width: 900px) {
          .hdp-project-narrative.has-figure { grid-template-columns: 1fr; }
        }
        @media (max-width: 700px) {
          .hdp-project-header { min-height: 108px; padding: 13px 20px 11px; gap: 8px; }
          .hdp-project-header nav { gap: 18px; }
          .hdp-project-main { padding: 58px 24px 82px; }
          .hdp-project-intro h1 { font-size: clamp(42px, 13vw, 66px); }
          .hdp-project-summary { margin-top: 28px; }
          .hdp-project-detail-list > div { grid-template-columns: 1fr; }
          .hdp-project-footer { grid-template-columns: 1fr; padding: 44px 24px; gap: 34px; }
        }
      `}</style>
    </div>
  );
}
