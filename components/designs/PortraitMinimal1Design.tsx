"use client";

import Link from "next/link";
import CiribilliNaritaDesign from "@/components/designs/CiribilliNaritaDesign";
import { getBourdonPages, type LabSite, type SiteRoute } from "@/lib/sites";

export const PORTRAIT_MINIMAL_1_VARIANT = "PortraitMinimal_1";

type PortraitMinimal1DesignProps = {
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

export default function PortraitMinimal1Design(props: PortraitMinimal1DesignProps) {
  if (props.route.section !== "home") {
    return <CiribilliNaritaDesign {...props} />;
  }

  const pages = getBourdonPages(props.site);
  const homeOverview = (pages.home as typeof pages.home & { overview?: string }).overview;
  const pi = props.site.members?.[0];
  const portrait = safeAsset(pages.home.piImage || pages.home.topPortrait || pi?.image);
  const piName = pages.home.piName || props.site.piName;
  const piRole = pages.home.piRole || props.site.title || pi?.role;
  const overview = homeOverview || pi?.bio || props.site.introduction;

  return (
    <div className="portrait-minimal-1">
      {props.previewMode && (
        <div className="portrait-minimal-preview">Private administrator preview · this draft is not publicly visible</div>
      )}

      <header className="portrait-minimal-header">
        <Link className="portrait-minimal-brand" href={props.basePath}>{props.site.labName}</Link>
        <nav aria-label={`${props.site.labName} navigation`}>
          <Link className="active" href={props.basePath}>Home</Link>
          <Link href={`${props.basePath}/research`}>Research</Link>
          <Link href={`${props.basePath}/members`}>People</Link>
          <Link href={`${props.basePath}/publications`}>Publications</Link>
          <Link href={`${props.basePath}/join`}>Join</Link>
          <Link href={`${props.basePath}/contact`}>Contact</Link>
        </nav>
      </header>

      <main className="portrait-minimal-main">
        <section className="portrait-minimal-hero">
          <div className="portrait-minimal-photo">
            {portrait ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={portrait} alt={piName} />
            ) : (
              <div className="portrait-minimal-placeholder" aria-hidden="true" />
            )}
          </div>

          <div className="portrait-minimal-info">
            <div className="portrait-minimal-info-top">
              <p>Principal Investigator</p>
              <span>{props.site.department}</span>
            </div>
            <div className="portrait-minimal-info-main">
              <h1>{piName}</h1>
              {piRole && <h2>{piRole}</h2>}
              <p className="portrait-minimal-institution">{props.site.institution}</p>
              {overview && <p className="portrait-minimal-overview">{overview}</p>}
            </div>
            <div className="portrait-minimal-info-bottom">
              {props.site.email && <a href={`mailto:${props.site.email}`}>{props.site.email}</a>}
              <Link href={`${props.basePath}/research`}>View research →</Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="portrait-minimal-footer">
        <div>
          <strong>{props.site.labName}</strong>
          <span>{props.site.institution}</span>
        </div>
        <div>
          <Link href={`${props.basePath}/research`}>Research</Link>
          <Link href={`${props.basePath}/members`}>People</Link>
          <Link href={`${props.basePath}/publications`}>Publications</Link>
          <Link href={`${props.basePath}/contact`}>Contact</Link>
        </div>
        <span>Independent concept by LabNarrative</span>
      </footer>

      <style jsx global>{`
        .portrait-minimal-1 {
          min-height: 100vh;
          background: #f4f2ed;
          color: #000;
          font-family: Arial, Helvetica, sans-serif;
        }
        .portrait-minimal-1 * { box-sizing: border-box; }
        .portrait-minimal-1 a { color: inherit; text-decoration: none; }

        .portrait-minimal-preview {
          padding: 8px 24px;
          background: #ececec;
          color: #000;
          text-align: center;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: .13em;
          text-transform: uppercase;
        }

        .portrait-minimal-header {
          min-height: 118px;
          padding: 24px clamp(24px, 4vw, 64px) 20px;
          display: grid;
          grid-template-columns: 1fr auto;
          align-items: end;
          gap: 36px;
          background: #000;
          color: #fff;
        }

        .portrait-minimal-brand {
          font-family: Georgia, "Times New Roman", serif;
          font-size: clamp(28px, 2.4vw, 40px);
          line-height: 1;
          letter-spacing: -.03em;
        }

        .portrait-minimal-header nav {
          display: flex;
          flex-wrap: wrap;
          justify-content: flex-end;
          gap: 18px 26px;
        }

        .portrait-minimal-header nav a {
          padding-bottom: 5px;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: .15em;
          text-transform: uppercase;
          opacity: .62;
          border-bottom: 1px solid transparent;
        }
        .portrait-minimal-header nav a:hover,
        .portrait-minimal-header nav a.active { opacity: 1; }
        .portrait-minimal-header nav a.active { border-bottom-color: #fff; }

        .portrait-minimal-main {
          padding: clamp(22px, 2.5vw, 40px);
          background: #f4f2ed;
        }

        .portrait-minimal-hero {
          min-height: calc(100svh - 118px - clamp(44px, 5vw, 80px));
          display: grid;
          grid-template-columns: minmax(0, 1.55fr) minmax(320px, .75fr);
          background: #fff;
          overflow: hidden;
        }

        .portrait-minimal-photo {
          min-height: 680px;
          overflow: hidden;
          background: #d7d7d7;
        }

        .portrait-minimal-photo img,
        .portrait-minimal-placeholder {
          width: 100%;
          height: 100%;
          display: block;
          object-fit: cover;
          object-position: center 23%;
        }

        .portrait-minimal-info {
          min-height: 680px;
          padding: clamp(34px, 4.2vw, 72px);
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          border-left: 1px solid #d9d9d9;
          background: #fff;
          color: #000;
        }

        .portrait-minimal-info-top,
        .portrait-minimal-info-bottom {
          display: flex;
          justify-content: space-between;
          gap: 24px;
          font-size: 10px;
          font-weight: 700;
          line-height: 1.5;
          letter-spacing: .14em;
          text-transform: uppercase;
        }
        .portrait-minimal-info-top p { margin: 0; }
        .portrait-minimal-info-top span { text-align: right; }
        .portrait-minimal-info-bottom { align-items: flex-end; }

        .portrait-minimal-info-main {
          padding: clamp(56px, 8vh, 120px) 0;
        }

        .portrait-minimal-info h1 {
          margin: 0;
          max-width: 7.5ch;
          font-family: Georgia, "Times New Roman", serif;
          font-size: clamp(60px, 6.6vw, 112px);
          font-weight: 400;
          line-height: .9;
          letter-spacing: -.055em;
          color: #000;
        }

        .portrait-minimal-info h2 {
          margin: 28px 0 0;
          max-width: 520px;
          font-size: clamp(14px, 1.25vw, 18px);
          font-weight: 700;
          line-height: 1.4;
          letter-spacing: .05em;
          text-transform: uppercase;
          color: #000;
        }

        .portrait-minimal-institution {
          margin: 8px 0 0;
          max-width: 520px;
          font-size: 13px;
          line-height: 1.55;
          color: #474747;
        }

        .portrait-minimal-overview {
          margin: clamp(30px, 5vh, 54px) 0 0;
          max-width: 560px;
          font-family: Georgia, "Times New Roman", serif;
          font-size: clamp(17px, 1.45vw, 22px);
          line-height: 1.58;
          color: #111;
        }

        .portrait-minimal-footer {
          min-height: 230px;
          padding: 54px clamp(24px, 4vw, 64px);
          display: grid;
          grid-template-columns: 1.2fr 1fr 1fr;
          align-items: start;
          gap: 48px;
          background: #000;
          color: #fff;
        }
        .portrait-minimal-footer > div { display: flex; flex-direction: column; gap: 10px; }
        .portrait-minimal-footer > div:nth-child(2) a,
        .portrait-minimal-footer > span,
        .portrait-minimal-footer > div:first-child span {
          font-size: 11px;
          line-height: 1.6;
          letter-spacing: .08em;
        }
        .portrait-minimal-footer strong {
          font-family: Georgia, "Times New Roman", serif;
          font-size: 26px;
          font-weight: 400;
        }
        .portrait-minimal-footer > span { justify-self: end; text-align: right; opacity: .62; }

        @media (max-width: 960px) {
          .portrait-minimal-hero { grid-template-columns: 1.15fr .85fr; }
          .portrait-minimal-info { padding: 36px; }
          .portrait-minimal-footer { grid-template-columns: 1fr 1fr; }
          .portrait-minimal-footer > span { justify-self: start; text-align: left; }
        }

        @media (max-width: 720px) {
          .portrait-minimal-header {
            min-height: auto;
            padding: 22px 20px 18px;
            grid-template-columns: 1fr;
            align-items: start;
          }
          .portrait-minimal-header nav { justify-content: flex-start; gap: 12px 18px; }
          .portrait-minimal-main { padding: 14px; }
          .portrait-minimal-hero { grid-template-columns: 1fr; min-height: 0; }
          .portrait-minimal-photo { min-height: 62svh; }
          .portrait-minimal-info { min-height: auto; border-left: 0; border-top: 1px solid #d9d9d9; padding: 30px 24px 38px; }
          .portrait-minimal-info-main { padding: 54px 0 60px; }
          .portrait-minimal-info h1 { max-width: none; font-size: clamp(50px, 15vw, 76px); }
          .portrait-minimal-info-bottom { flex-direction: column; align-items: flex-start; }
          .portrait-minimal-footer { grid-template-columns: 1fr; padding: 44px 24px; }
        }
      `}</style>
    </div>
  );
}
