"use client";

import Link from "next/link";
import CiribilliNaritaDesign from "@/components/designs/CiribilliNaritaDesign";
import { getBourdonPages, type LabSite, type SiteRoute } from "@/lib/sites";

export const LENS_PORTRAIT_VARIANT = "lens-portrait-v1";

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

export default function LensPortraitDesign(props: Props) {
  if (props.route.section !== "home") {
    return <CiribilliNaritaDesign {...props} />;
  }

  const pages = getBourdonPages(props.site);
  const pi = props.site.members?.[0];
  const portrait = safeAsset(pages.home.piImage || pages.home.topPortrait || pi?.image);
  const piName = pages.home.piName || props.site.piName;
  const piRole = pages.home.piRole || props.site.title || pi?.role;
  const overview = (pages.home as typeof pages.home & { overview?: string }).overview || props.site.overview || props.site.introduction;
  const themes = props.site.focusAreas.slice(0, 4);

  return (
    <div className="lens-portrait-site">
      {props.previewMode && (
        <div className="lens-preview">Private administrator preview · this draft is not publicly visible</div>
      )}

      <header className="lens-header">
        <Link className="lens-brand" href={props.basePath}>Lens Lab</Link>
        <nav aria-label={`${props.site.labName} navigation`}>
          <Link className="active" href={props.basePath}>Home</Link>
          <Link href={`${props.basePath}/research`}>Research</Link>
          <Link href={`${props.basePath}/members`}>Group</Link>
          <Link href={`${props.basePath}/publications`}>Publications</Link>
          <Link href={`${props.basePath}/contact`}>Contact</Link>
        </nav>
      </header>

      <main>
        <section className="lens-hero">
          <div className="lens-photo">
            {portrait ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={portrait} alt={piName} />
            ) : (
              <div className="lens-photo-placeholder" aria-hidden="true" />
            )}
          </div>

          <div className="lens-info">
            <div>
              <p className="lens-kicker">Susanne Lens Lab</p>
              <h1>{piName}</h1>
              {piRole && <p className="lens-role">{piRole}</p>}
            </div>

            <div className="lens-info-bottom">
              <p className="lens-statement">Understanding how chromosome segregation and aneuploidy shape cancer.</p>
              <div className="lens-affiliation">
                <span>{props.site.department}</span>
                <span>{props.site.institution}</span>
              </div>
              <div className="lens-actions">
                <Link href={`${props.basePath}/research`}>Research ↘</Link>
                <Link href={`${props.basePath}/publications`}>Publications</Link>
                <Link href={`${props.basePath}/contact`}>Contact</Link>
              </div>
            </div>
          </div>
        </section>

        <section className="lens-group">
          <div className="lens-group-label">The Lens Group</div>
          <div className="lens-group-copy">
            <h2>Chromosomes.<br />Cell division.<br />Cancer.</h2>
            <p>{overview}</p>
          </div>
          <div className="lens-themes" aria-label="Research themes">
            {themes.map((theme, index) => (
              <div className="lens-theme" key={theme}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{theme}</strong>
              </div>
            ))}
          </div>
          <div className="lens-group-links">
            <Link href={`${props.basePath}/members`}>Meet the group →</Link>
            <Link href={`${props.basePath}/research`}>Explore the research →</Link>
          </div>
        </section>
      </main>

      <footer className="lens-footer">
        <div>
          <strong>Lens Lab</strong>
          <span>{props.site.department}</span>
          <span>{props.site.institution}</span>
        </div>
        <div>
          <Link href={`${props.basePath}/research`}>Research</Link>
          <Link href={`${props.basePath}/members`}>Group</Link>
          <Link href={`${props.basePath}/publications`}>Publications</Link>
        </div>
        <div>
          {props.site.email && <a href={`mailto:${props.site.email}`}>{props.site.email}</a>}
          <span>Independent concept by LabNarrative</span>
        </div>
      </footer>

      <style jsx global>{`
        .lens-portrait-site {
          min-height: 100vh;
          background: #f2f0eb;
          color: #151918;
          font-family: Arial, Helvetica, sans-serif;
        }
        .lens-portrait-site * { box-sizing: border-box; }
        .lens-portrait-site a { color: inherit; text-decoration: none; }

        .lens-preview {
          padding: 8px 24px;
          background: #dfe2df;
          color: #121514;
          text-align: center;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: .14em;
          text-transform: uppercase;
        }

        .lens-header {
          min-height: 104px;
          padding: 0 clamp(24px, 4.6vw, 76px);
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 32px;
          background: #111513;
          color: #fff;
        }
        .lens-brand {
          font-family: Georgia, "Times New Roman", serif;
          font-size: clamp(24px, 2vw, 32px);
          line-height: 1;
          letter-spacing: -.035em;
        }
        .lens-header nav {
          display: flex;
          flex-wrap: wrap;
          justify-content: flex-end;
          gap: 16px 28px;
        }
        .lens-header nav a {
          position: relative;
          padding: 8px 0;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: .16em;
          text-transform: uppercase;
          color: rgba(255,255,255,.58);
        }
        .lens-header nav a:hover,
        .lens-header nav a.active { color: #fff; }
        .lens-header nav a.active::after {
          content: "";
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          height: 1px;
          background: #fff;
        }

        .lens-hero {
          min-height: calc(100svh - 104px);
          display: grid;
          grid-template-columns: 52% 48%;
          background: #e9e7e1;
        }
        .lens-photo {
          min-height: calc(100svh - 104px);
          overflow: hidden;
          background: #d5d3ce;
        }
        .lens-photo img,
        .lens-photo-placeholder {
          width: 100%;
          height: 100%;
          min-height: calc(100svh - 104px);
          display: block;
          object-fit: cover;
          object-position: center 18%;
        }
        .lens-photo img {
          filter: saturate(.88) contrast(1.02);
        }

        .lens-info {
          min-height: calc(100svh - 104px);
          padding: clamp(54px, 6vw, 96px) clamp(42px, 6vw, 92px) clamp(46px, 5vw, 78px);
          display: flex;
          flex-direction: column;
          justify-content: flex-start;
          gap: clamp(28px, 2.5vw, 40px);
          background: #f2f0eb;
        }
        .lens-kicker {
          margin: 0 0 24px;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: .2em;
          text-transform: uppercase;
        }
        .lens-info h1 {
          margin: 0;
          max-width: 8ch;
          font-family: Georgia, "Times New Roman", serif;
          font-size: clamp(70px, 7.2vw, 124px);
          font-weight: 400;
          line-height: .88;
          letter-spacing: -.06em;
        }
        .lens-role {
          margin: 25px 0 0;
          font-size: clamp(13px, 1.1vw, 17px);
          font-weight: 700;
          letter-spacing: .08em;
          text-transform: uppercase;
          color: #69716d;
        }
        .lens-info-bottom {
          display: grid;
          gap: 25px;
          max-width: 650px;
        }
        .lens-statement {
          margin: 0;
          font-family: Georgia, "Times New Roman", serif;
          font-size: clamp(23px, 2vw, 34px);
          line-height: 1.25;
          letter-spacing: -.025em;
        }
        .lens-affiliation {
          display: flex;
          flex-direction: column;
          gap: 5px;
          font-size: 11px;
          line-height: 1.55;
          letter-spacing: .055em;
          color: #68716d;
        }
        .lens-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 14px 28px;
          padding-top: 5px;
        }
        .lens-actions a,
        .lens-group-links a {
          padding-bottom: 5px;
          border-bottom: 1px solid currentColor;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: .14em;
          text-transform: uppercase;
        }

        .lens-group {
          padding: clamp(78px, 9vw, 144px) clamp(24px, 6vw, 96px) clamp(86px, 10vw, 154px);
          display: grid;
          grid-template-columns: .7fr 1.45fr 1fr;
          column-gap: clamp(36px, 5vw, 84px);
          row-gap: 62px;
          background: #111513;
          color: #f7f4ee;
        }
        .lens-group-label {
          padding-top: 8px;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: .18em;
          text-transform: uppercase;
          color: rgba(255,255,255,.56);
        }
        .lens-group-copy h2 {
          margin: 0;
          font-family: Georgia, "Times New Roman", serif;
          font-size: clamp(48px, 5vw, 84px);
          font-weight: 400;
          line-height: .94;
          letter-spacing: -.05em;
        }
        .lens-group-copy p {
          margin: 38px 0 0;
          max-width: 720px;
          font-family: Georgia, "Times New Roman", serif;
          font-size: clamp(18px, 1.45vw, 23px);
          line-height: 1.65;
          color: rgba(255,255,255,.72);
        }
        .lens-themes {
          border-top: 1px solid rgba(255,255,255,.2);
        }
        .lens-theme {
          padding: 20px 0;
          display: grid;
          grid-template-columns: 46px 1fr;
          gap: 16px;
          align-items: start;
          border-bottom: 1px solid rgba(255,255,255,.2);
        }
        .lens-theme span {
          font-size: 10px;
          letter-spacing: .12em;
          color: rgba(255,255,255,.4);
        }
        .lens-theme strong {
          font-size: 13px;
          font-weight: 600;
          line-height: 1.35;
        }
        .lens-group-links {
          grid-column: 2 / -1;
          display: flex;
          flex-wrap: wrap;
          gap: 18px 32px;
        }

        .lens-footer {
          padding: 54px clamp(24px, 5vw, 80px);
          display: grid;
          grid-template-columns: 1.25fr .8fr 1fr;
          gap: 46px;
          background: #080a09;
          color: #fff;
        }
        .lens-footer > div {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .lens-footer strong {
          margin-bottom: 6px;
          font-family: Georgia, "Times New Roman", serif;
          font-size: 21px;
          font-weight: 400;
        }
        .lens-footer a,
        .lens-footer span {
          font-size: 10px;
          line-height: 1.6;
          letter-spacing: .06em;
          color: rgba(255,255,255,.62);
        }
        .lens-footer a:hover { color: #fff; }

        @media (max-width: 980px) {
          .lens-hero { grid-template-columns: 50% 50%; }
          .lens-info { padding: 54px 48px 48px; }
          .lens-group { grid-template-columns: .7fr 1.4fr; }
          .lens-themes { grid-column: 2; }
          .lens-group-links { grid-column: 2; }
        }

        @media (max-width: 720px) {
          .lens-header {
            min-height: auto;
            padding: 24px 20px;
            align-items: flex-start;
            flex-direction: column;
          }
          .lens-header nav { justify-content: flex-start; gap: 10px 18px; }
          .lens-hero { grid-template-columns: 1fr; min-height: 0; }
          .lens-photo,
          .lens-photo img,
          .lens-photo-placeholder { min-height: 68svh; }
          .lens-info { min-height: auto; padding: 50px 24px 58px; gap: 32px; }
          .lens-info h1 { max-width: none; font-size: clamp(56px, 17vw, 84px); }
          .lens-group { grid-template-columns: 1fr; padding: 74px 24px 84px; row-gap: 44px; }
          .lens-group-copy,
          .lens-themes,
          .lens-group-links { grid-column: 1; }
          .lens-group-copy p { margin-top: 28px; }
          .lens-footer { grid-template-columns: 1fr; padding: 44px 24px; gap: 34px; }
        }
      `}</style>
    </div>
  );
}
