import Link from "next/link";
import Lens1Design from "@/components/designs/Lens1Design";
import type { LabSite, SiteRoute } from "@/lib/sites";

export const KOPS_1_VARIANT = "Kops_1";

type Props = {
  site: LabSite;
  route: SiteRoute;
  basePath: string;
  previewMode?: boolean;
  innerTitle?: {
    eyebrow?: string;
    title: string;
    text?: string;
  };
};

function KopsHeader({ site, route, basePath }: Pick<Props, "site" | "route" | "basePath">) {
  // Use a relative home target on inner pages so the same header works both on
  // platform.labnarrative.com/sites/<slug>/... and on <slug>.labnarrative.com/....
  const homeHref = route.projectSlug ? "../../" : "../";
  const links = [
    { section: "home", label: "Home", href: homeHref },
    { section: "research", label: "Research", href: `${basePath}/research` },
    { section: "members", label: "Group", href: `${basePath}/members` },
    { section: "publications", label: "Publications", href: `${basePath}/publications` },
    { section: "contact", label: "Contact", href: `${basePath}/contact` },
  ];

  return (
    <header className="kops-shared-header">
      <Link className="kops-shared-brand" href={homeHref}>{site.labName}</Link>
      <nav aria-label={`${site.labName} navigation`}>
        {links.map((item) => (
          <Link
            className={route.section === item.section ? "active" : ""}
            href={item.href}
            key={item.section}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}

function KopsFooter({ site, basePath }: Pick<Props, "site" | "basePath">) {
  return (
    <footer className="kops-shared-footer">
      <div>
        <strong>{site.labName}</strong>
        {site.department && <span>{site.department}</span>}
        <span>{site.institution}</span>
      </div>
      <div>
        <Link href={`${basePath}/research`}>Research</Link>
        <Link href={`${basePath}/members`}>Group</Link>
        <Link href={`${basePath}/publications`}>Publications</Link>
      </div>
      <div>
        {site.email && <a href={`mailto:${site.email}`}>{site.email}</a>}
        <span>Independent concept by LabNarrative</span>
      </div>
    </footer>
  );
}

/**
 * Kops_1
 * Reusable Lens_1-derived portrait design with:
 * - the original portrait homepage unchanged
 * - no colored heroes on non-home pages
 * - the homepage header/footer reused on every inner page
 */
export default function Kops1Design(props: Props) {
  if (props.route.section === "home") {
    return <Lens1Design {...props} />;
  }

  return (
    <div className="kops-1-design kops-1-inner">
      <KopsHeader site={props.site} route={props.route} basePath={props.basePath} />

      {props.innerTitle ? (
        <section className="kops-inner-title" aria-labelledby="kops-inner-page-title">
          <div>
            {props.innerTitle.eyebrow ? <p>{props.innerTitle.eyebrow}</p> : null}
            <h1 id="kops-inner-page-title">{props.innerTitle.title}</h1>
          </div>
          {props.innerTitle.text ? <div className="kops-inner-title-text">{props.innerTitle.text}</div> : null}
        </section>
      ) : null}

      <Lens1Design {...props} />
      <KopsFooter site={props.site} basePath={props.basePath} />

      <style>{`
        .kops-1-inner {
          min-height: 100vh;
          background: #f2f0eb;
          color: #151918;
          font-family: Arial, Helvetica, sans-serif;
        }
        .kops-1-inner * { box-sizing: border-box; }
        .kops-1-inner a { color: inherit; text-decoration: none; }

        .kops-shared-header {
          min-height: 104px;
          padding: 0 clamp(24px, 4.6vw, 76px);
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 32px;
          background: #111513;
          color: #fff;
        }
        .kops-shared-brand {
          font-family: Georgia, "Times New Roman", serif;
          font-size: clamp(24px, 2vw, 32px);
          line-height: 1;
          letter-spacing: -.035em;
        }
        .kops-shared-header nav {
          display: flex;
          flex-wrap: wrap;
          justify-content: flex-end;
          gap: 16px 28px;
        }
        .kops-shared-header nav a {
          position: relative;
          padding: 8px 0;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: .16em;
          text-transform: uppercase;
          color: rgba(255,255,255,.58);
        }
        .kops-shared-header nav a:hover,
        .kops-shared-header nav a.active { color: #fff; }
        .kops-shared-header nav a.active::after {
          content: "";
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          height: 1px;
          background: #fff;
        }

        .kops-inner-title {
          padding: clamp(62px, 7vw, 108px) clamp(24px, 6vw, 96px) clamp(48px, 6vw, 82px);
          display: grid;
          grid-template-columns: minmax(0, 1.4fr) minmax(260px, .75fr);
          gap: clamp(36px, 7vw, 120px);
          align-items: end;
          background: #f2f0eb;
          border-bottom: 1px solid rgba(21,25,24,.12);
        }
        .kops-inner-title p {
          margin: 0 0 18px;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: .2em;
          text-transform: uppercase;
          color: #68716d;
        }
        .kops-inner-title h1 {
          margin: 0;
          max-width: 12ch;
          font-family: Georgia, "Times New Roman", serif;
          font-size: clamp(52px, 6vw, 96px);
          font-weight: 400;
          line-height: .92;
          letter-spacing: -.055em;
          color: #151918;
        }
        .kops-inner-title-text {
          max-width: 600px;
          padding-bottom: 5px;
          font-family: Georgia, "Times New Roman", serif;
          font-size: clamp(17px, 1.5vw, 22px);
          line-height: 1.55;
          color: #5e6763;
        }

        .kops-1-inner
          .lens-flat-hero-shell
          .narita-overlap-design
          > main
          > header,
        .kops-1-inner
          .lens-flat-hero-shell
          .narita-overlap-design
          > main
          > footer {
          display: none !important;
        }

        .kops-1-inner
          .lens-flat-hero-shell
          .narita-overlap-design:not(.narita-route-home)
          main
          > section:first-of-type,
        .kops-1-inner
          .lens-flat-hero-shell
          .narita-overlap-design:not(.narita-route-home)
          main
          > article
          > section:first-of-type {
          display: none !important;
        }

        /* Project detail pages use HDPortraitProjectDesign underneath Lens_1.
           Kops_1 and all designs derived from it already provide the canonical
           site header/footer, so suppress the embedded project chrome to avoid
           duplicate navigation and duplicate footers. */
        .kops-1-inner .hdp-project-header,
        .kops-1-inner .hdp-project-footer {
          display: none !important;
        }

        .kops-shared-footer {
          padding: 54px clamp(24px, 5vw, 80px);
          display: grid;
          grid-template-columns: 1.25fr .8fr 1fr;
          gap: 46px;
          background: #080a09;
          color: #fff;
        }
        .kops-shared-footer > div {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .kops-shared-footer strong {
          margin-bottom: 6px;
          font-family: Georgia, "Times New Roman", serif;
          font-size: 21px;
          font-weight: 400;
        }
        .kops-shared-footer a,
        .kops-shared-footer span {
          font-size: 10px;
          line-height: 1.6;
          letter-spacing: .06em;
          color: rgba(255,255,255,.62);
        }
        .kops-shared-footer a:hover { color: #fff; }

        @media (max-width: 720px) {
          .kops-shared-header {
            min-height: auto;
            padding: 24px 20px;
            align-items: flex-start;
            flex-direction: column;
          }
          .kops-shared-header nav {
            justify-content: flex-start;
            gap: 10px 18px;
          }
          .kops-inner-title {
            grid-template-columns: 1fr;
            gap: 24px;
            padding: 52px 22px 42px;
          }
          .kops-inner-title h1 {
            max-width: 100%;
            font-size: clamp(44px, 15vw, 68px);
          }
          .kops-shared-footer {
            grid-template-columns: 1fr;
            gap: 30px;
            padding: 42px 22px;
          }
        }
      `}</style>
    </div>
  );
}
