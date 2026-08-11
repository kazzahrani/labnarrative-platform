"use client";

import Link from "next/link";
import CiribilliNaritaDesign from "@/components/designs/CiribilliNaritaDesign";
import HDPortraitProjectDesign from "@/components/designs/HDPortraitProjectDesign";
import { getBourdonPages, type LabSite, type SiteRoute } from "@/lib/sites";

export const HDPORTRAIT_2_VARIANT = "HDportrait_2";

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

function settingText(site: LabSite, key: string, fallback: string) {
  const value = site.design?.settings?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function researchCardCopy(index: number, fallback: string) {
  const copies = [
    "How molecular motors tune spindle microtubules so chromosomes can align and segregate with precision.",
    "How dynamic microtubules build a stable mitotic spindle while remaining responsive enough to correct errors.",
    "How failures in chromosome positioning and segregation produce aneuploidy, genome instability and cancer-associated cell states.",
  ];
  return copies[index] || fallback;
}

export default function HDPortrait2Design(props: Props) {
  if (props.route.section === "research" && props.route.projectSlug) {
    return <HDPortraitProjectDesign {...props} />;
  }

  if (props.route.section !== "home") {
    return <CiribilliNaritaDesign {...props} />;
  }

  const pages = getBourdonPages(props.site);
  const pi = props.site.members?.[0];
  const portrait = safeAsset(pages.home.piImage || pages.home.topPortrait || pi?.image);
  const piName = pages.home.piName || props.site.piName;
  const piRole = pages.home.piRole || props.site.title || pi?.role;
  const heroKicker = settingText(props.site, "heroKicker", `${piName} Lab`);
  const heroStatement = settingText(props.site, "heroStatement", props.site.headline);
  const heroSupport = settingText(props.site, "heroSupport", props.site.introduction || props.site.overview);
  const researchLabel = settingText(props.site, "groupLabel", "Our research");
  const researchHeading = settingText(
    props.site,
    "groupHeading",
    "Dissecting the mechanisms that safeguard chromosome segregation and genome stability.",
  );
  const cards = props.site.focusAreas.slice(0, 3).map((title, index) => ({
    title,
    copy: researchCardCopy(index, props.site.projects[index]?.description || props.site.overview),
    href: props.site.research?.[index]?.slug
      ? `${props.basePath}/research/${props.site.research[index].slug}`
      : `${props.basePath}/research`,
  }));

  return (
    <div
      className="hdp2-site"
      style={{
        "--hdp2-accent": props.site.theme.accent,
        "--hdp2-bg": props.site.theme.background,
        "--hdp2-surface": props.site.theme.surface,
        "--hdp2-ink": props.site.theme.foreground,
        "--hdp2-muted": props.site.theme.muted,
      } as React.CSSProperties}
    >
      {props.previewMode && (
        <div className="hdp2-preview">Private administrator preview · this draft is not publicly visible</div>
      )}

      <header className="hdp2-header">
        <Link className="hdp2-brand" href={props.basePath}>{props.site.labName.replace(/Laboratory$/i, "Lab")}</Link>
        <nav aria-label={`${props.site.labName} navigation`}>
          <Link className="active" href={props.basePath}>Home</Link>
          <Link href={`${props.basePath}/research`}>Research</Link>
          <Link href={`${props.basePath}/members`}>Lab Members</Link>
          <Link href={`${props.basePath}/publications`}>Publications</Link>
          <Link href={`${props.basePath}/join`}>Join Our Lab</Link>
          <Link href={`${props.basePath}/contact`}>Contact</Link>
        </nav>
      </header>

      <main>
        <section className="hdp2-hero">
          <div className="hdp2-copy">
            <div className="hdp2-intro">
              <p className="hdp2-kicker">{heroKicker}</p>
              <span className="hdp2-rule" aria-hidden="true" />
              <h1>{piName}</h1>
              {piRole && <p className="hdp2-role">{piRole}</p>}
            </div>

            <div className="hdp2-lower">
              <span className="hdp2-rule" aria-hidden="true" />
              <p className="hdp2-statement">{heroStatement}</p>
              <p className="hdp2-support">{heroSupport}</p>
              <div className="hdp2-affiliation">
                {props.site.department && <span>{props.site.department}</span>}
                <strong>{props.site.institution}</strong>
              </div>
              <div className="hdp2-actions">
                <Link className="primary" href={`${props.basePath}/research`}>Research ↘</Link>
                <Link href={`${props.basePath}/publications`}>Publications</Link>
                <Link href={`${props.basePath}/contact`}>Contact</Link>
              </div>
            </div>
          </div>

          <div className="hdp2-photo">
            {portrait ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={portrait} alt={piName} />
            ) : (
              <div className="hdp2-photo-placeholder" aria-hidden="true" />
            )}
          </div>
        </section>

        <section className="hdp2-research">
          <div className="hdp2-research-intro">
            <p>{researchLabel}</p>
            <span className="hdp2-rule" aria-hidden="true" />
            <h2>{researchHeading}</h2>
          </div>

          <div className="hdp2-cards">
            {cards.map((card, index) => (
              <Link className="hdp2-card" href={card.href} key={`${card.title}-${index}`}>
                <div className="hdp2-card-icon" aria-hidden="true">
                  {index === 0 ? "↕" : index === 1 ? "◎" : "◌"}
                </div>
                <span className="hdp2-card-number">0{index + 1}</span>
                <h3>{card.title}</h3>
                <span className="hdp2-card-rule" aria-hidden="true" />
                <p>{card.copy}</p>
                <b>Learn more →</b>
              </Link>
            ))}
          </div>
        </section>
      </main>

      <footer className="hdp2-footer">
        <div>
          <strong>{props.site.labName}</strong>
          {props.site.department && <span>{props.site.department}</span>}
          <span>{props.site.institution}</span>
        </div>
        <div>
          <Link href={`${props.basePath}/research`}>Research</Link>
          <Link href={`${props.basePath}/members`}>Lab Members</Link>
          <Link href={`${props.basePath}/publications`}>Publications</Link>
        </div>
        <div>
          {props.site.email && <a href={`mailto:${props.site.email}`}>{props.site.email}</a>}
          <span>Independent concept by LabNarrative</span>
        </div>
      </footer>

      <style jsx global>{`
        .hdp2-site {
          min-height: 100vh;
          background: var(--hdp2-bg, #f6f1ea);
          color: var(--hdp2-ink, #2b1c20);
          font-family: Arial, Helvetica, sans-serif;
        }
        .hdp2-site * { box-sizing: border-box; }
        .hdp2-site a { color: inherit; text-decoration: none; }
        .hdp2-preview {
          padding: 8px 24px;
          background: var(--hdp2-accent, #7a2e3c);
          color: #fff;
          text-align: center;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: .14em;
          text-transform: uppercase;
        }

        .hdp2-header {
          min-height: 92px;
          padding: 0 clamp(26px, 4.5vw, 72px);
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 30px;
          background: var(--hdp2-bg, #f6f1ea);
          border-bottom: 1px solid color-mix(in srgb, var(--hdp2-accent, #7a2e3c) 18%, transparent);
        }
        .hdp2-brand {
          flex: 0 0 auto;
          font-size: 14px;
          font-weight: 800;
          letter-spacing: .11em;
          text-transform: uppercase;
          color: var(--hdp2-accent, #7a2e3c);
        }
        .hdp2-header nav {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: clamp(14px, 2vw, 30px);
          overflow-x: auto;
          scrollbar-width: none;
        }
        .hdp2-header nav::-webkit-scrollbar { display: none; }
        .hdp2-header nav a {
          position: relative;
          flex: 0 0 auto;
          padding: 10px 0;
          font-size: 10px;
          font-weight: 600;
          letter-spacing: .02em;
          color: color-mix(in srgb, var(--hdp2-ink, #2b1c20) 75%, transparent);
        }
        .hdp2-header nav a.active,
        .hdp2-header nav a:hover { color: var(--hdp2-accent, #7a2e3c); }
        .hdp2-header nav a.active::after {
          content: "";
          position: absolute;
          left: 0;
          right: 0;
          bottom: 3px;
          height: 1px;
          background: var(--hdp2-accent, #7a2e3c);
        }

        .hdp2-hero {
          min-height: calc(100svh - 92px);
          display: grid;
          grid-template-columns: 50% 50%;
          background: var(--hdp2-bg, #f6f1ea);
        }
        .hdp2-copy {
          min-height: calc(100svh - 92px);
          padding: clamp(48px, 5vw, 78px) clamp(36px, 5.3vw, 84px) clamp(48px, 5vw, 76px);
          display: flex;
          flex-direction: column;
          justify-content: center;
          gap: clamp(28px, 4vh, 48px);
          background:
            radial-gradient(circle at 12% 82%, color-mix(in srgb, var(--hdp2-accent, #7a2e3c) 7%, transparent), transparent 30%),
            var(--hdp2-bg, #f6f1ea);
          border-bottom-left-radius: 64px;
        }
        .hdp2-kicker,
        .hdp2-research-intro > p {
          margin: 0;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: .22em;
          text-transform: uppercase;
          color: var(--hdp2-accent, #7a2e3c);
        }
        .hdp2-rule {
          width: 40px;
          height: 1px;
          display: block;
          margin-top: 17px;
          background: color-mix(in srgb, var(--hdp2-accent, #7a2e3c) 70%, transparent);
        }
        .hdp2-intro h1 {
          max-width: 8ch;
          margin: 28px 0 0;
          font-family: Georgia, "Times New Roman", serif;
          font-size: clamp(64px, 6.5vw, 112px);
          font-weight: 400;
          line-height: .88;
          letter-spacing: -.055em;
          color: color-mix(in srgb, var(--hdp2-accent, #7a2e3c) 76%, #171012);
        }
        .hdp2-role {
          max-width: 580px;
          margin: 27px 0 0;
          font-size: clamp(11px, .9vw, 14px);
          font-weight: 600;
          line-height: 1.55;
          letter-spacing: .08em;
          text-transform: uppercase;
          color: var(--hdp2-muted, #7b6a6b);
        }
        .hdp2-lower { max-width: 620px; }
        .hdp2-lower > .hdp2-rule { margin: 0 0 23px; }
        .hdp2-statement {
          max-width: 15ch;
          margin: 0;
          font-family: Georgia, "Times New Roman", serif;
          font-size: clamp(25px, 2.35vw, 38px);
          font-weight: 400;
          line-height: 1.12;
          letter-spacing: -.025em;
        }
        .hdp2-support {
          max-width: 580px;
          margin: 20px 0 0;
          font-size: clamp(12px, 1vw, 15px);
          line-height: 1.55;
          color: var(--hdp2-muted, #7b6a6b);
        }
        .hdp2-affiliation {
          margin-top: 22px;
          display: flex;
          flex-direction: column;
          gap: 4px;
          font-size: 10px;
          line-height: 1.5;
          color: var(--hdp2-muted, #7b6a6b);
        }
        .hdp2-affiliation strong {
          font-weight: 700;
          color: var(--hdp2-accent, #7a2e3c);
        }
        .hdp2-actions {
          margin-top: 28px;
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 14px 30px;
        }
        .hdp2-actions a {
          padding: 8px 0 5px;
          border-bottom: 1px solid color-mix(in srgb, var(--hdp2-accent, #7a2e3c) 65%, transparent);
          font-size: 10px;
          font-weight: 800;
          letter-spacing: .12em;
          text-transform: uppercase;
          color: var(--hdp2-accent, #7a2e3c);
        }
        .hdp2-actions a.primary {
          padding: 14px 22px;
          border: 1px solid var(--hdp2-accent, #7a2e3c);
          background: var(--hdp2-accent, #7a2e3c);
          color: #fff;
        }

        .hdp2-photo {
          min-height: calc(100svh - 92px);
          overflow: hidden;
          background: #2a2725;
        }
        .hdp2-photo img,
        .hdp2-photo-placeholder {
          width: 100%;
          height: 100%;
          min-height: calc(100svh - 92px);
          display: block;
          object-fit: cover;
          object-position: center 18%;
        }
        .hdp2-photo img {
          filter: saturate(.88) contrast(1.03) sepia(.04);
        }
        .hdp2-photo-placeholder {
          background: linear-gradient(145deg, #342d2b, color-mix(in srgb, var(--hdp2-accent, #7a2e3c) 62%, #2e2526));
        }

        .hdp2-research {
          padding: clamp(84px, 9vw, 144px) clamp(28px, 5vw, 82px) clamp(96px, 10vw, 154px);
          background:
            radial-gradient(circle at 92% 12%, color-mix(in srgb, var(--hdp2-accent, #7a2e3c) 7%, transparent), transparent 26%),
            var(--hdp2-surface, #fffdfb);
        }
        .hdp2-research-intro { max-width: 960px; }
        .hdp2-research-intro h2 {
          max-width: 900px;
          margin: 30px 0 0;
          font-family: Georgia, "Times New Roman", serif;
          font-size: clamp(40px, 4.2vw, 70px);
          font-weight: 400;
          line-height: 1.02;
          letter-spacing: -.04em;
        }
        .hdp2-cards {
          margin-top: clamp(54px, 6vw, 88px);
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: clamp(16px, 2vw, 30px);
        }
        .hdp2-card {
          min-height: 390px;
          padding: clamp(28px, 3vw, 42px);
          display: flex;
          flex-direction: column;
          border: 1px solid color-mix(in srgb, var(--hdp2-accent, #7a2e3c) 20%, transparent);
          border-radius: 8px 28px 8px 28px;
          background: color-mix(in srgb, var(--hdp2-surface, #fffdfb) 93%, var(--hdp2-accent, #7a2e3c));
          transition: transform .22s ease, border-color .22s ease;
        }
        .hdp2-card:hover {
          transform: translateY(-5px);
          border-color: color-mix(in srgb, var(--hdp2-accent, #7a2e3c) 48%, transparent);
        }
        .hdp2-card-icon {
          width: 48px;
          height: 48px;
          display: grid;
          place-items: center;
          border: 1px solid color-mix(in srgb, var(--hdp2-accent, #7a2e3c) 30%, transparent);
          border-radius: 50%;
          font-family: Georgia, "Times New Roman", serif;
          font-size: 23px;
          color: var(--hdp2-accent, #7a2e3c);
        }
        .hdp2-card-number {
          margin-top: 28px;
          font-size: 9px;
          font-weight: 700;
          letter-spacing: .16em;
          color: var(--hdp2-muted, #7b6a6b);
        }
        .hdp2-card h3 {
          max-width: 12ch;
          margin: 12px 0 0;
          font-family: Georgia, "Times New Roman", serif;
          font-size: clamp(26px, 2.2vw, 38px);
          font-weight: 400;
          line-height: 1.04;
          letter-spacing: -.025em;
          color: var(--hdp2-accent, #7a2e3c);
        }
        .hdp2-card-rule {
          width: 28px;
          height: 1px;
          margin: 20px 0 18px;
          background: var(--hdp2-accent, #7a2e3c);
        }
        .hdp2-card p {
          margin: 0;
          font-size: 12px;
          line-height: 1.65;
          color: var(--hdp2-muted, #7b6a6b);
        }
        .hdp2-card b {
          margin-top: auto;
          padding-top: 34px;
          font-size: 9px;
          font-weight: 800;
          letter-spacing: .13em;
          text-transform: uppercase;
          color: var(--hdp2-accent, #7a2e3c);
        }

        .hdp2-footer {
          padding: 54px clamp(26px, 5vw, 80px);
          display: grid;
          grid-template-columns: 1.2fr .8fr 1fr;
          gap: 42px;
          background: color-mix(in srgb, var(--hdp2-accent, #7a2e3c) 72%, #171012);
          color: #fff;
        }
        .hdp2-footer > div { display: flex; flex-direction: column; gap: 8px; }
        .hdp2-footer strong {
          margin-bottom: 5px;
          font-family: Georgia, "Times New Roman", serif;
          font-size: 21px;
          font-weight: 400;
        }
        .hdp2-footer a,
        .hdp2-footer span {
          font-size: 10px;
          line-height: 1.6;
          letter-spacing: .05em;
          color: rgba(255,255,255,.68);
        }
        .hdp2-footer a:hover { color: #fff; }

        @media (max-width: 980px) {
          .hdp2-header { align-items: flex-start; flex-direction: column; padding-top: 22px; padding-bottom: 18px; }
          .hdp2-header nav { width: 100%; justify-content: flex-start; }
          .hdp2-hero { grid-template-columns: 48% 52%; }
          .hdp2-copy { padding-left: 38px; padding-right: 38px; }
          .hdp2-cards { grid-template-columns: 1fr; }
          .hdp2-card { min-height: 300px; }
        }

        @media (max-width: 720px) {
          .hdp2-header { gap: 13px; }
          .hdp2-header nav { gap: 8px 18px; }
          .hdp2-hero { grid-template-columns: 1fr; }
          .hdp2-photo { order: -1; min-height: 58svh; }
          .hdp2-photo img,
          .hdp2-photo-placeholder { min-height: 58svh; }
          .hdp2-copy { min-height: auto; padding: 54px 24px 62px; border-bottom-left-radius: 36px; }
          .hdp2-intro h1 { font-size: clamp(58px, 17vw, 86px); }
          .hdp2-research { padding-left: 22px; padding-right: 22px; }
          .hdp2-footer { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}
