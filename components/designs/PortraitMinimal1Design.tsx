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
          <Link href={`${props.basePath}/members`}>Lab Members</Link>
          <Link href={`${props.basePath}/publications`}>Publications</Link>
          <Link href={`${props.basePath}/join`}>Join Our Lab</Link>
          <Link href={`${props.basePath}/contact`}>Contact Us</Link>
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
            <p className="portrait-minimal-eyebrow">Principal Investigator</p>
            <h1>{piName}</h1>
            {piRole && <h2>{piRole}</h2>}
            {overview && <p className="portrait-minimal-overview">{overview}</p>}
            <Link className="portrait-minimal-cta" href={`${props.basePath}/members`}>Meet the lab →</Link>
          </div>
        </section>
      </main>

      <footer className="portrait-minimal-footer">
        <div>
          <strong>{props.site.labName}</strong>
          <span>{props.site.department}</span>
          <span>{props.site.institution}</span>
        </div>
        <div>
          <Link href={`${props.basePath}/research`}>Research</Link>
          <Link href={`${props.basePath}/members`}>Lab Members</Link>
          <Link href={`${props.basePath}/publications`}>Publications</Link>
          <Link href={`${props.basePath}/contact`}>Contact Us</Link>
        </div>
        <div>
          {props.site.email && <a href={`mailto:${props.site.email}`}>{props.site.email}</a>}
          <span>Independent concept by LabNarrative</span>
        </div>
      </footer>

      <style jsx global>{`
        .portrait-minimal-1 {
          min-height: 100vh;
          background: #000;
          color: #101a17;
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
          min-height: 158px;
          padding: 34px clamp(32px, 5vw, 78px) 30px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          gap: 20px;
          background: #000;
          color: #fff;
        }

        .portrait-minimal-brand {
          width: fit-content;
          font-family: Arial, Helvetica, sans-serif;
          font-size: clamp(25px, 2vw, 34px);
          font-weight: 500;
          line-height: 1;
          letter-spacing: -.025em;
          text-transform: uppercase;
        }

        .portrait-minimal-header nav {
          display: flex;
          flex-wrap: wrap;
          gap: 18px 29px;
        }

        .portrait-minimal-header nav a {
          position: relative;
          padding: 4px 0 9px;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: .17em;
          text-transform: uppercase;
          color: rgba(255,255,255,.62);
        }
        .portrait-minimal-header nav a:hover,
        .portrait-minimal-header nav a.active { color: #fff; }
        .portrait-minimal-header nav a.active::after {
          content: "";
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          height: 1px;
          background: #fff;
        }

        .portrait-minimal-main {
          margin: 0;
          padding: 0;
          background: #ecebea;
        }

        .portrait-minimal-hero {
          width: 100%;
          min-height: calc(100svh - 158px);
          display: grid;
          grid-template-columns: 52.5% 47.5%;
          background: #ecebea;
        }

        .portrait-minimal-photo {
          min-height: calc(100svh - 158px);
          overflow: hidden;
          background: #d5d3cf;
        }

        .portrait-minimal-photo img,
        .portrait-minimal-placeholder {
          width: 100%;
          height: 100%;
          min-height: calc(100svh - 158px);
          display: block;
          object-fit: cover;
          object-position: center 20%;
        }

        .portrait-minimal-info {
          min-height: calc(100svh - 158px);
          padding: clamp(56px, 7vw, 108px) clamp(48px, 7vw, 108px);
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: flex-start;
          background: #ecebea;
          color: #111b18;
        }

        .portrait-minimal-eyebrow {
          margin: 0 0 30px;
          font-size: 11px;
          font-weight: 800;
          line-height: 1.2;
          letter-spacing: .18em;
          text-transform: uppercase;
          color: #17231f;
        }

        .portrait-minimal-info h1 {
          margin: 0;
          max-width: 8.5ch;
          font-family: Georgia, "Times New Roman", serif;
          font-size: clamp(66px, 6.7vw, 112px);
          font-weight: 400;
          line-height: .93;
          letter-spacing: -.05em;
          color: #10201b;
        }

        .portrait-minimal-info h2 {
          margin: 26px 0 0;
          max-width: 650px;
          font-size: clamp(14px, 1.25vw, 19px);
          font-weight: 700;
          line-height: 1.25;
          letter-spacing: .08em;
          text-transform: uppercase;
          color: #6c7773;
        }

        .portrait-minimal-overview {
          margin: clamp(34px, 5vh, 58px) 0 0;
          max-width: 610px;
          font-family: Georgia, "Times New Roman", serif;
          font-size: clamp(18px, 1.55vw, 24px);
          line-height: 1.65;
          color: #17231f;
        }

        .portrait-minimal-cta {
          margin-top: 42px;
          padding-bottom: 5px;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: .14em;
          text-transform: uppercase;
          border-bottom: 1px solid #17231f;
        }

        .portrait-minimal-footer {
          min-height: 230px;
          padding: 54px clamp(32px, 5vw, 78px);
          display: grid;
          grid-template-columns: 1.2fr .9fr 1fr;
          align-items: start;
          gap: 48px;
          background: #000;
          color: #fff;
        }
        .portrait-minimal-footer > div {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .portrait-minimal-footer strong {
          margin-bottom: 5px;
          font-size: 22px;
          font-weight: 500;
          text-transform: uppercase;
        }
        .portrait-minimal-footer a,
        .portrait-minimal-footer span {
          font-size: 11px;
          line-height: 1.6;
          letter-spacing: .07em;
          color: rgba(255,255,255,.7);
        }
        .portrait-minimal-footer a:hover { color: #fff; }

        @media (max-width: 960px) {
          .portrait-minimal-hero { grid-template-columns: 50% 50%; }
          .portrait-minimal-info { padding: 48px; }
          .portrait-minimal-footer { grid-template-columns: 1fr 1fr; }
        }

        @media (max-width: 720px) {
          .portrait-minimal-header {
            min-height: auto;
            padding: 24px 20px 20px;
          }
          .portrait-minimal-header nav { gap: 12px 18px; }
          .portrait-minimal-hero { grid-template-columns: 1fr; min-height: 0; }
          .portrait-minimal-photo,
          .portrait-minimal-photo img,
          .portrait-minimal-placeholder { min-height: 62svh; }
          .portrait-minimal-info { min-height: auto; padding: 48px 24px 58px; }
          .portrait-minimal-info h1 { max-width: none; font-size: clamp(50px, 15vw, 76px); }
          .portrait-minimal-footer { grid-template-columns: 1fr; padding: 44px 24px; gap: 34px; }
        }
      `}</style>
    </div>
  );
}
