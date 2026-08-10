"use client";

import Link from "next/link";
import CiribilliNaritaDesign from "@/components/designs/CiribilliNaritaDesign";
import { getBourdonPages, type LabSite, type SiteRoute } from "@/lib/sites";

export const PERSONAL_SCROLL_1_VARIANT = "PersonalScroll_1";

type PersonalScroll1DesignProps = {
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

export default function PersonalScroll1Design(props: PersonalScroll1DesignProps) {
  const pages = getBourdonPages(props.site);
  const homeOverview = (pages.home as typeof pages.home & { overview?: string }).overview;
  const pi = props.site.members?.[0];
  const portrait = safeAsset(pages.home.piImage || pages.home.topPortrait || pi?.image);
  const piName = pages.home.piName || props.site.piName;
  const piRole = pages.home.piRole || props.site.title || pi?.role;
  const heroOverview = homeOverview || pi?.bio || props.site.introduction;
  const welcomeTitle = pages.home.mainHeading || props.site.headline || `Welcome to ${props.site.labName}`;
  const welcomeText = pages.home.openingText || props.site.introduction;

  if (props.route.section !== "home") {
    return <CiribilliNaritaDesign {...props} />;
  }

  return (
    <div className="personal-scroll-1">
      {props.previewMode && (
        <div className="personal-scroll-preview">Private administrator preview · this draft is not publicly visible</div>
      )}

      <header className="personal-scroll-header">
        <Link className="personal-scroll-wordmark" href={props.basePath}>{props.site.labName}</Link>
        <nav aria-label={`${props.site.labName} navigation`}>
          <Link className="active" href={props.basePath}>Home</Link>
          <Link href={`${props.basePath}/research`}>Research</Link>
          <Link href={`${props.basePath}/members`}>People</Link>
          <Link href={`${props.basePath}/publications`}>Publications</Link>
          <Link href={`${props.basePath}/join`}>Join</Link>
          <Link href={`${props.basePath}/contact`}>Contact</Link>
        </nav>
      </header>

      <main>
        <section className="personal-scroll-hero">
          <div className="personal-scroll-portrait">
            {portrait ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={portrait} alt={piName} />
            ) : (
              <div className="personal-scroll-placeholder" aria-hidden="true" />
            )}
          </div>

          <div className="personal-scroll-pi-copy">
            <p className="personal-scroll-eyebrow">Principal Investigator</p>
            <h1>{piName}</h1>
            {piRole && <h2>{piRole}</h2>}
            <p className="personal-scroll-institution">{props.site.institution}</p>
            {heroOverview && <p className="personal-scroll-overview">{heroOverview}</p>}
          </div>
        </section>

        <section className="personal-scroll-welcome">
          <div className="personal-scroll-welcome-inner">
            <p className="personal-scroll-eyebrow">Welcome to our lab</p>
            <h2>{welcomeTitle}</h2>
            {welcomeText && <p>{welcomeText}</p>}
          </div>
        </section>
      </main>

      <footer className="personal-scroll-footer">
        <div>
          <strong>{props.site.labName}</strong>
          <p>{props.site.department}<br />{props.site.institution}</p>
        </div>
        <div className="personal-scroll-footer-links">
          <Link href={`${props.basePath}/research`}>Research</Link>
          <Link href={`${props.basePath}/members`}>People</Link>
          <Link href={`${props.basePath}/publications`}>Publications</Link>
          <Link href={`${props.basePath}/contact`}>Contact</Link>
        </div>
        <div className="personal-scroll-footer-meta">
          {props.site.email && <a href={`mailto:${props.site.email}`}>{props.site.email}</a>}
          <span>Independent concept by LabNarrative</span>
        </div>
      </footer>

      <style jsx global>{`
        .personal-scroll-1 {
          --ps-ink: #000000;
          --ps-paper: #ece9e4;
          --ps-header-height: 132px;
          min-height: 100vh;
          background: var(--ps-paper);
          color: var(--ps-ink);
          font-family: Arial, Helvetica, sans-serif;
        }

        .personal-scroll-1 * { box-sizing: border-box; }
        .personal-scroll-1 a { color: inherit; text-decoration: none; }

        .personal-scroll-preview {
          padding: 9px 24px;
          background: #f2d679;
          color: #000;
          text-align: center;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: .08em;
          text-transform: uppercase;
        }

        .personal-scroll-header {
          min-height: var(--ps-header-height);
          padding: 18px clamp(24px, 5vw, 76px) 16px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          gap: 16px;
          background: var(--ps-paper);
          color: #000;
          border-bottom: 1px solid rgba(0,0,0,.18);
        }

        .personal-scroll-wordmark {
          width: fit-content;
          font-family: Georgia, "Times New Roman", serif;
          font-size: clamp(24px, 2.1vw, 34px);
          line-height: 1;
          color: #000;
        }

        .personal-scroll-header nav {
          display: flex;
          gap: clamp(18px, 2vw, 30px);
          flex-wrap: wrap;
        }

        .personal-scroll-header nav a {
          position: relative;
          padding: 5px 0 8px;
          color: rgba(0,0,0,.62);
          font-size: 10px;
          font-weight: 700;
          letter-spacing: .16em;
          text-transform: uppercase;
        }

        .personal-scroll-header nav a:hover,
        .personal-scroll-header nav a.active { color: #000; }
        .personal-scroll-header nav a.active::after {
          content: "";
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          height: 1px;
          background: #000;
        }

        .personal-scroll-1 main {
          background: var(--ps-paper);
          color: #000;
        }

        .personal-scroll-hero {
          height: calc(100svh - var(--ps-header-height));
          min-height: 620px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          overflow: hidden;
          background: var(--ps-paper);
        }

        .personal-scroll-portrait {
          height: 100%;
          overflow: hidden;
          background: #d4d1ca;
        }

        .personal-scroll-portrait img,
        .personal-scroll-placeholder {
          width: 100%;
          height: 100%;
          display: block;
          object-fit: cover;
          object-position: center 24%;
        }

        .personal-scroll-pi-copy {
          display: flex;
          flex-direction: column;
          justify-content: center;
          padding: clamp(50px, 6vw, 104px);
          background: var(--ps-paper);
          color: #000;
        }

        .personal-scroll-eyebrow {
          margin: 0 0 18px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: .18em;
          text-transform: uppercase;
          color: #000;
        }

        .personal-scroll-pi-copy h1 {
          margin: 0;
          max-width: 8.5ch;
          font-family: Georgia, "Times New Roman", serif;
          font-size: clamp(62px, min(7.4vw, 9.6svh), 108px);
          font-weight: 400;
          line-height: .93;
          letter-spacing: -.045em;
          color: #000;
        }

        .personal-scroll-pi-copy h2 {
          margin: 26px 0 0;
          font-size: clamp(14px, 1.35vw, 19px);
          line-height: 1.35;
          font-weight: 700;
          letter-spacing: .05em;
          text-transform: uppercase;
          color: #000;
        }

        .personal-scroll-institution {
          margin: 9px 0 0;
          font-size: 13px;
          line-height: 1.5;
          color: #000;
        }

        .personal-scroll-overview {
          max-width: 650px;
          margin: 32px 0 0;
          font-family: Georgia, "Times New Roman", serif;
          font-size: clamp(16px, 1.45vw, 21px);
          line-height: 1.58;
          color: #000;
        }

        .personal-scroll-welcome {
          padding: clamp(90px, 12vw, 150px) 24px;
          background: #fff;
          color: #000;
          border-top: 1px solid rgba(0,0,0,.12);
        }

        .personal-scroll-welcome-inner {
          max-width: 920px;
          margin: 0 auto;
          text-align: center;
        }

        .personal-scroll-welcome h2 {
          margin: 0;
          font-family: Georgia, "Times New Roman", serif;
          font-size: clamp(42px, 5.5vw, 78px);
          font-weight: 400;
          line-height: 1.04;
          letter-spacing: -.035em;
          color: #000;
        }

        .personal-scroll-welcome-inner > p:last-child {
          max-width: 760px;
          margin: 34px auto 0;
          font-family: Georgia, "Times New Roman", serif;
          font-size: clamp(18px, 1.8vw, 24px);
          line-height: 1.7;
          color: #000;
        }

        .personal-scroll-footer {
          min-height: 260px;
          padding: 58px clamp(24px, 5vw, 76px);
          display: grid;
          grid-template-columns: 1.2fr .8fr 1fr;
          gap: 48px;
          background: var(--ps-paper);
          color: #000;
          border-top: 1px solid rgba(0,0,0,.18);
        }

        .personal-scroll-footer strong {
          font-family: Georgia, "Times New Roman", serif;
          font-size: 24px;
          font-weight: 400;
          color: #000;
        }

        .personal-scroll-footer p,
        .personal-scroll-footer-meta {
          color: #000;
          font-size: 12px;
          line-height: 1.7;
        }

        .personal-scroll-footer-links,
        .personal-scroll-footer-meta {
          display: flex;
          flex-direction: column;
          gap: 9px;
        }

        .personal-scroll-footer-links a {
          width: fit-content;
          color: #000;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: .13em;
          text-transform: uppercase;
        }

        @media (max-width: 900px) {
          .personal-scroll-hero { grid-template-columns: .9fr 1.1fr; }
          .personal-scroll-pi-copy { padding: 44px; }
          .personal-scroll-footer { grid-template-columns: 1fr 1fr; }
          .personal-scroll-footer-meta { grid-column: 1 / -1; }
        }

        @media (max-width: 700px) {
          .personal-scroll-1 { --ps-header-height: 112px; }
          .personal-scroll-header { padding: 14px 20px 12px; gap: 12px; }
          .personal-scroll-header nav { gap: 14px 18px; }

          .personal-scroll-hero {
            height: auto;
            min-height: calc(100svh - var(--ps-header-height));
            grid-template-columns: 1fr;
          }

          .personal-scroll-portrait { min-height: 48svh; }
          .personal-scroll-pi-copy { padding: 34px 24px 44px; }
          .personal-scroll-pi-copy h1 { max-width: none; font-size: clamp(44px, 13vw, 64px); }
          .personal-scroll-overview { margin-top: 24px; font-size: 17px; }

          .personal-scroll-welcome { padding: 82px 22px 94px; }

          .personal-scroll-footer { grid-template-columns: 1fr; gap: 32px; }
          .personal-scroll-footer-meta { grid-column: auto; }
        }
      `}</style>
    </div>
  );
}
