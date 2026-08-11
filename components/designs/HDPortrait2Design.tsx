"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import CiribilliNaritaDesign from "@/components/designs/CiribilliNaritaDesign";
import HDPortraitProjectDesign from "@/components/designs/HDPortraitProjectDesign";
import { getBourdonPages, type LabSite, type SiteRoute } from "@/lib/sites";

export const HDPORTRAIT_2_VARIANT = "HDportrait_2";

type Props = { site: LabSite; route: SiteRoute; basePath: string; previewMode?: boolean };

function safeAsset(value?: string) {
  if (!value) return undefined;
  if (value.startsWith("/")) return value;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : undefined;
  } catch { return undefined; }
}

function setting(site: LabSite, key: string, fallback?: string) {
  const value = site.design?.settings?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : (fallback || "");
}

const cardCopy = [
  "How molecular motors tune spindle microtubules so chromosomes align and segregate with precision.",
  "How dynamic microtubules build a stable mitotic spindle while remaining responsive enough to correct errors.",
  "How chromosome-segregation failures generate aneuploidy, genome instability and cancer-associated cell states.",
];

export default function HDPortrait2Design(props: Props) {
  if (props.route.section === "research" && props.route.projectSlug) return <HDPortraitProjectDesign {...props} />;

  if (props.route.section !== "home") {
    return (
      <div className="p2-inner-black">
        <CiribilliNaritaDesign {...props} />
        <style jsx global>{`
          .p2-inner-black .ciribilli-narita-shell .narita-overlap-design main > header {
            background: #070707 !important;
            color: #fff !important;
            border-bottom-color: rgba(255,255,255,.12) !important;
          }
          .p2-inner-black .ciribilli-narita-shell .narita-overlap-design main > header > a {
            color: #fff !important;
          }
          .p2-inner-black .ciribilli-narita-shell .narita-overlap-design main > header nav a {
            color: rgba(255,255,255,.62) !important;
          }
          .p2-inner-black .ciribilli-narita-shell .narita-overlap-design main > header nav a:hover,
          .p2-inner-black .ciribilli-narita-shell .narita-overlap-design main > header nav a[class*="active"] {
            color: #fff !important;
          }
          .p2-inner-black .ciribilli-narita-shell .narita-overlap-design main > footer {
            background: #070707 !important;
            color: #fff !important;
            border-top-color: rgba(255,255,255,.12) !important;
          }
          .p2-inner-black .ciribilli-narita-shell .narita-overlap-design main > footer a,
          .p2-inner-black .ciribilli-narita-shell .narita-overlap-design main > footer span,
          .p2-inner-black .ciribilli-narita-shell .narita-overlap-design main > footer p {
            color: rgba(255,255,255,.64) !important;
          }
          .p2-inner-black .ciribilli-narita-shell .narita-overlap-design main > footer strong {
            color: #fff !important;
          }
          .p2-inner-black .ciribilli-narita-shell .narita-overlap-design main > footer a:hover {
            color: #fff !important;
          }
        `}</style>
      </div>
    );
  }

  const pages = getBourdonPages(props.site);
  const portrait = safeAsset(pages.home.piImage || pages.home.topPortrait || props.site.members?.[0]?.image);
  const name = pages.home.piName || props.site.piName;
  const role = pages.home.piRole || props.site.title || "Principal Investigator";
  const kicker = setting(props.site, "heroKicker", `${name} Lab`);
  const statement = setting(props.site, "heroStatement", props.site.headline);
  const support = setting(props.site, "heroSupport", props.site.introduction || props.site.overview);
  const researchHeading = setting(props.site, "groupHeading", "Dissecting the mechanisms that safeguard chromosome segregation and genome stability.");
  const areas = props.site.focusAreas.slice(0, 3);
  const vars = {
    "--p2-accent": props.site.theme.accent,
    "--p2-bg": props.site.theme.background,
    "--p2-surface": props.site.theme.surface,
    "--p2-ink": props.site.theme.foreground,
    "--p2-muted": props.site.theme.muted,
  } as CSSProperties;

  return (
    <div className="p2" style={vars}>
      {props.previewMode && <div className="p2-preview">Private administrator preview · this draft is not publicly visible</div>}
      <header className="p2-nav">
        <Link className="p2-brand" href={props.basePath}>{props.site.labName.replace(/Laboratory$/i, "Lab")}</Link>
        <nav aria-label={`${props.site.labName} navigation`}>
          <Link className="active" href={props.basePath}>Home</Link><Link href={`${props.basePath}/research`}>Research</Link><Link href={`${props.basePath}/members`}>Lab Members</Link><Link href={`${props.basePath}/publications`}>Publications</Link><Link href={`${props.basePath}/join`}>Join Our Lab</Link><Link href={`${props.basePath}/contact`}>Contact</Link>
        </nav>
      </header>

      <main>
        <section className="p2-hero">
          <div className="p2-copy">
            <div>
              <p className="p2-kicker">{kicker}</p><i className="p2-rule" />
              <h1>{name}</h1><p className="p2-role">{role}</p>
            </div>
            <div className="p2-lower">
              <i className="p2-rule" /><p className="p2-statement">{statement}</p>
              <p className="p2-support">{support}</p>
              <div className="p2-affiliation"><span>{props.site.department}</span><strong>{props.site.institution}</strong></div>
              <div className="p2-actions"><Link className="primary" href={`${props.basePath}/research`}>Research ↘</Link><Link href={`${props.basePath}/publications`}>Publications</Link><Link href={`${props.basePath}/contact`}>Contact</Link></div>
            </div>
          </div>
          <div className="p2-photo">{portrait ? <img src={portrait} alt={name} /> : <div className="p2-placeholder" />}</div>
        </section>

        <section className="p2-research">
          <p className="p2-kicker">Our research</p><i className="p2-rule" />
          <h2>{researchHeading}</h2>
          <div className="p2-cards">
            {areas.map((area, index) => {
              const slug = props.site.research?.[index]?.slug;
              return <Link className="p2-card" href={slug ? `${props.basePath}/research/${slug}` : `${props.basePath}/research`} key={`${area}-${index}`}>
                <span className="p2-icon">{index === 0 ? "↕" : index === 1 ? "◎" : "◌"}</span><small>0{index + 1}</small><h3>{area}</h3><i /><p>{cardCopy[index] || props.site.projects[index]?.description || props.site.overview}</p><b>Learn more →</b>
              </Link>;
            })}
          </div>
        </section>
      </main>

      <footer className="p2-footer"><div><strong>{props.site.labName}</strong><span>{props.site.department}</span><span>{props.site.institution}</span></div><div><Link href={`${props.basePath}/research`}>Research</Link><Link href={`${props.basePath}/members`}>Lab Members</Link><Link href={`${props.basePath}/publications`}>Publications</Link></div><div>{props.site.email && <a href={`mailto:${props.site.email}`}>{props.site.email}</a>}<span>Independent concept by LabNarrative</span></div></footer>

      <style jsx global>{`
        .p2{min-height:100vh;background:var(--p2-bg,#f6f0e9);color:var(--p2-ink,#2a1c20);font-family:Arial,Helvetica,sans-serif}.p2 *{box-sizing:border-box}.p2 a{color:inherit;text-decoration:none}.p2-preview{padding:8px 20px;background:var(--p2-accent,#7a2f42);color:#fff;text-align:center;font-size:9px;font-weight:700;letter-spacing:.14em;text-transform:uppercase}
        .p2-nav{min-height:88px;padding:0 clamp(24px,4.5vw,72px);display:flex;align-items:center;justify-content:space-between;gap:28px;background:#070707;color:#fff;border-bottom:1px solid rgba(255,255,255,.12)}.p2-brand{flex:0 0 auto;color:#fff;font-size:14px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}.p2-nav nav{display:flex;align-items:center;gap:clamp(14px,2vw,29px);overflow-x:auto;scrollbar-width:none}.p2-nav nav::-webkit-scrollbar{display:none}.p2-nav nav a{position:relative;flex:0 0 auto;padding:10px 0;font-size:10px;font-weight:600;color:rgba(255,255,255,.62)}.p2-nav nav a:hover,.p2-nav nav a.active{color:#fff}.p2-nav nav a.active:after{content:"";position:absolute;left:0;right:0;bottom:3px;height:1px;background:#fff}
        .p2-hero{min-height:calc(100svh - 88px);display:grid;grid-template-columns:50% 50%}.p2-copy{min-height:calc(100svh - 88px);padding:clamp(46px,5vw,78px) clamp(34px,5.2vw,82px);display:flex;flex-direction:column;justify-content:center;gap:clamp(30px,4vh,50px);background:radial-gradient(circle at 10% 88%,color-mix(in srgb,var(--p2-accent) 7%,transparent),transparent 30%),var(--p2-bg);border-bottom-left-radius:64px}.p2-kicker{margin:0;color:var(--p2-accent);font-size:10px;font-weight:800;letter-spacing:.22em;text-transform:uppercase}.p2-rule{width:38px;height:1px;display:block;margin-top:16px;background:color-mix(in srgb,var(--p2-accent) 72%,transparent)}.p2-copy h1{max-width:8ch;margin:26px 0 0;color:color-mix(in srgb,var(--p2-accent) 78%,#151013);font-family:Georgia,"Times New Roman",serif;font-size:clamp(62px,6.3vw,108px);font-weight:400;line-height:.89;letter-spacing:-.055em}.p2-role{max-width:590px;margin:24px 0 0;color:var(--p2-muted);font-size:clamp(11px,.9vw,14px);font-weight:600;line-height:1.5;letter-spacing:.07em;text-transform:uppercase}.p2-lower{max-width:620px}.p2-lower>.p2-rule{margin:0 0 21px}.p2-statement{max-width:16ch;margin:0;font-family:Georgia,"Times New Roman",serif;font-size:clamp(25px,2.3vw,37px);line-height:1.12;letter-spacing:-.025em}.p2-support{max-width:580px;margin:18px 0 0;color:var(--p2-muted);font-size:clamp(12px,1vw,15px);line-height:1.55}.p2-affiliation{margin-top:20px;display:flex;flex-direction:column;gap:4px;color:var(--p2-muted);font-size:10px;line-height:1.5}.p2-affiliation strong{color:var(--p2-accent)}.p2-actions{margin-top:26px;display:flex;flex-wrap:wrap;align-items:center;gap:14px 28px}.p2-actions a{padding:7px 0 5px;border-bottom:1px solid color-mix(in srgb,var(--p2-accent) 65%,transparent);color:var(--p2-accent);font-size:9px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}.p2-actions .primary{padding:14px 22px;border:1px solid var(--p2-accent);background:var(--p2-accent);color:#fff}
        .p2-photo{min-height:calc(100svh - 88px);overflow:hidden;background:#2b2826}.p2-photo img,.p2-placeholder{width:100%;height:100%;min-height:calc(100svh - 88px);display:block;object-fit:cover;object-position:center 18%}.p2-photo img{filter:saturate(.9) contrast(1.02)}.p2-placeholder{background:linear-gradient(145deg,#332c2a,color-mix(in srgb,var(--p2-accent) 60%,#2d2527))}
        .p2-research{padding:clamp(82px,9vw,142px) clamp(26px,5vw,80px) clamp(96px,10vw,150px);background:radial-gradient(circle at 93% 10%,color-mix(in srgb,var(--p2-accent) 7%,transparent),transparent 28%),var(--p2-surface)}.p2-research>h2{max-width:930px;margin:28px 0 0;font-family:Georgia,"Times New Roman",serif;font-size:clamp(40px,4.2vw,68px);font-weight:400;line-height:1.03;letter-spacing:-.04em}.p2-cards{margin-top:clamp(52px,6vw,84px);display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:clamp(16px,2vw,28px)}.p2-card{min-height:380px;padding:clamp(27px,3vw,40px);display:flex;flex-direction:column;border:1px solid color-mix(in srgb,var(--p2-accent) 20%,transparent);border-radius:8px 28px 8px 28px;background:color-mix(in srgb,var(--p2-surface) 94%,var(--p2-accent));transition:.2s ease}.p2-card:hover{transform:translateY(-5px);border-color:color-mix(in srgb,var(--p2-accent) 48%,transparent)}.p2-icon{width:46px;height:46px;display:grid;place-items:center;border:1px solid color-mix(in srgb,var(--p2-accent) 30%,transparent);border-radius:50%;color:var(--p2-accent);font-family:Georgia,serif;font-size:22px}.p2-card small{margin-top:25px;color:var(--p2-muted);font-size:9px;letter-spacing:.15em}.p2-card h3{max-width:13ch;margin:10px 0 0;color:var(--p2-accent);font-family:Georgia,"Times New Roman",serif;font-size:clamp(26px,2.2vw,37px);font-weight:400;line-height:1.04;letter-spacing:-.025em}.p2-card>i{width:27px;height:1px;margin:19px 0 17px;background:var(--p2-accent)}.p2-card p{margin:0;color:var(--p2-muted);font-size:12px;line-height:1.65}.p2-card b{margin-top:auto;padding-top:30px;color:var(--p2-accent);font-size:9px;letter-spacing:.13em;text-transform:uppercase}
        .p2-footer{padding:52px clamp(24px,5vw,78px);display:grid;grid-template-columns:1.2fr .8fr 1fr;gap:40px;background:#070707;color:#fff}.p2-footer>div{display:flex;flex-direction:column;gap:7px}.p2-footer strong{margin-bottom:5px;font-family:Georgia,serif;font-size:20px;font-weight:400}.p2-footer a,.p2-footer span{color:rgba(255,255,255,.64);font-size:10px;line-height:1.55}.p2-footer a:hover{color:#fff}
        @media(max-width:980px){.p2-nav{align-items:flex-start;flex-direction:column;padding-top:20px;padding-bottom:17px}.p2-nav nav{width:100%}.p2-hero{grid-template-columns:48% 52%}.p2-copy{padding-left:36px;padding-right:36px}.p2-cards{grid-template-columns:1fr}.p2-card{min-height:290px}}
        @media(max-width:720px){.p2-hero{grid-template-columns:1fr}.p2-photo{order:-1;min-height:58svh}.p2-photo img,.p2-placeholder{min-height:58svh}.p2-copy{min-height:auto;padding:52px 24px 60px;border-bottom-left-radius:36px}.p2-copy h1{font-size:clamp(56px,17vw,84px)}.p2-research{padding-left:22px;padding-right:22px}.p2-footer{grid-template-columns:1fr}}
      `}</style>
    </div>
  );
}
