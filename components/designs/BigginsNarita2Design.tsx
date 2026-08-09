import Link from "next/link";
import type { LabSite, SiteRoute } from "@/lib/sites";

type ResearchProgram = {
  slug: string;
  title: string;
  introduction: string;
  sourceUrl?: string;
  heroImage?: string;
  heroCaption?: string;
  projects: { title: string; text: string; image?: string; caption?: string }[];
};

type PublicationGroup = { year: string; items: { citation: string; href?: string }[] };
type FormerGroup = { label: string; items: string[] };

type BigginsSite = LabSite & {
  researchOverview?: string[];
  researchQuestions?: string[];
  researchPrograms?: ResearchProgram[];
  publicationGroups?: PublicationGroup[];
  invitedReviews?: { citation: string; href?: string }[];
  formerMemberGroups?: FormerGroup[];
};

function nav(basePath: string) {
  return [
    ["Home", basePath], ["Research", `${basePath}/research`], ["Lab Members", `${basePath}/members`],
    ["Publications", `${basePath}/publications`], ["Join the Lab", `${basePath}/join`], ["Contact", `${basePath}/contact`],
  ];
}

function Header({ site, basePath, previewMode }: { site: BigginsSite; basePath: string; previewMode?: boolean }) {
  return <><div className="bn2-banner">{previewMode ? "Private administrator preview" : "LabNarrative concept · independent redesign"}</div><header className="bn2-header"><Link href={basePath} className="bn2-brand">Biggins Lab</Link><nav>{nav(basePath).map(([label, href]) => <Link key={label} href={href}>{label}</Link>)}</nav></header></>;
}

function Home({ site, basePath }: { site: BigginsSite; basePath: string }) {
  const featured = site.publications.slice(0, 3);
  return <>
    <section className="bn2-hero">
      {site.heroImage ? <img src={site.heroImage} alt="Biggins Lab group" /> : null}
      <div className="bn2-shade" />
      <div className="bn2-hero-copy"><p>Fred Hutch Cancer Center · Basic Sciences Division</p><h1>{site.headline}</h1><span>{site.introduction}</span></div>
    </section>
    <section className="bn2-intro"><div><p className="bn2-kicker">Our Research</p><h2>How cells get the right chromosomes.</h2></div><div><p>{site.overview}</p><Link href={`${basePath}/research`}>Explore the research →</Link></div></section>
    <section className="bn2-program-grid">{(site.researchPrograms ?? []).map((program, i) => <Link key={program.slug} href={`${basePath}/research/${program.slug}`} className="bn2-program-card"><span>0{i+1}</span><h3>{program.title}</h3><p>{program.introduction}</p></Link>)}</section>
    <section className="bn2-featured"><p className="bn2-kicker">Featured Publications</p>{featured.map((p) => <article key={`${p.year}-${p.title}`}><span>{p.year}</span><div><h3>{p.title}</h3><p>{p.journal}</p></div></article>)}<Link href={`${basePath}/publications`}>View all publications →</Link></section>
  </>;
}

function Research({ site, route, basePath }: { site: BigginsSite; route: SiteRoute; basePath: string }) {
  const programs = site.researchPrograms ?? [];
  const current = route.projectSlug ? programs.find((p) => p.slug === route.projectSlug) : undefined;
  if (!current) return <section className="bn2-page"><p className="bn2-kicker">Research</p><h1>Cell division and chromosome segregation</h1>{(site.researchOverview ?? []).map((p, i) => <p className="bn2-lead" key={i}>{p}</p>)}<div className="bn2-question-list">{(site.researchQuestions ?? []).map((q) => <div key={q}>— {q}</div>)}</div><div className="bn2-research-links">{programs.map((p) => <Link key={p.slug} href={`${basePath}/research/${p.slug}`}><strong>{p.title}</strong><span>{p.introduction}</span></Link>)}</div></section>;
  return <article className="bn2-page bn2-program-page"><Link className="bn2-back" href={`${basePath}/research`}>← All research</Link><h1>{current.title}</h1>{current.heroImage ? <figure className="bn2-figure hero"><img src={current.heroImage} alt={current.heroCaption || current.title}/><figcaption>{current.heroCaption}</figcaption></figure> : null}<p className="bn2-lead">{current.introduction}</p><h2>Projects</h2>{current.projects.map((project, i) => <section className="bn2-project" key={`${project.title}-${i}`}><div><span>0{i+1}</span><h3>{project.title}</h3><p>{project.text}</p></div>{project.image ? <figure className="bn2-figure"><img src={project.image} alt={project.caption || project.title}/><figcaption>{project.caption}</figcaption></figure> : null}</section>)}</article>;
}

function Members({ site }: { site: BigginsSite }) {
  return <section className="bn2-page"><p className="bn2-kicker">Lab Members</p><h1>Current Biggins Lab</h1><div className="bn2-members">{(site.members ?? []).map((m) => <article key={m.name}>{m.image ? <img src={m.image} alt={m.name}/> : <div className="bn2-placeholder">{m.name.slice(0,1)}</div>}<div><h2>{m.name}</h2><p className="bn2-role">{m.role}</p>{m.bio ? <p>{m.bio}</p> : null}</div></article>)}</div>{(site.formerMemberGroups ?? []).length ? <section className="bn2-former"><h2>Former Lab Members</h2>{site.formerMemberGroups!.map((g) => <div key={g.label}><h3>{g.label}</h3><p>{g.items.join(" · ")}</p></div>)}</section> : null}</section>;
}

function Publications({ site }: { site: BigginsSite }) {
  return <section className="bn2-page"><p className="bn2-kicker">Publications</p><h1>Original Research</h1><div className="bn2-years">{(site.publicationGroups ?? []).map((group) => <section key={group.year} id={`y-${group.year.replace(/\s/g,"-")}`}><h2>{group.year}</h2>{group.items.map((item, i) => <p key={i}>{item.href ? <a href={item.href} target="_blank" rel="noreferrer">{item.citation}</a> : item.citation}</p>)}</section>)}</div>{site.invitedReviews?.length ? <section className="bn2-reviews"><h1>Invited Reviews</h1>{site.invitedReviews.map((item,i)=><p key={i}>{item.href ? <a href={item.href} target="_blank" rel="noreferrer">{item.citation}</a> : item.citation}</p>)}</section>:null}</section>;
}

function Join({ site }: { site: BigginsSite }) {
  return <section className="bn2-page"><p className="bn2-kicker">Join the Lab</p><h1>Graduate students and postdoctoral fellows</h1>{(site.opportunities ?? []).map((o) => <article className="bn2-join" key={o.title}><h2>{o.title}</h2><p>{o.description}</p></article>)}<p className="bn2-lead">The laboratory emphasizes a supportive, inclusive environment and professional development for trainees.</p></section>;
}

function Contact({ site }: { site: BigginsSite }) {
  const c = (site as any).contactDetails ?? {};
  return <section className="bn2-page"><p className="bn2-kicker">Contact Us</p><h1>Sue Biggins</h1><div className="bn2-contact"><div><h2>Principal Investigator & Director</h2><p><a href={`mailto:${site.email}`}>{site.email}</a></p><p>{site.phone}</p></div><div><h2>Robin Evans · Research Administrator</h2><p><a href={`mailto:${c.administratorEmail}`}>{c.administratorEmail}</a></p><p>{c.administratorPhone}</p></div><div><h2>Mailing Address</h2><p>{site.address}</p></div></div></section>;
}

export default function BigginsNarita2Design({ site, route, basePath, previewMode }: { site: LabSite; route: SiteRoute; basePath: string; previewMode?: boolean }) {
  const s = site as BigginsSite;
  return <div className="bn2"><main><Header site={s} basePath={basePath} previewMode={previewMode}/>{route.section === "home" && <Home site={s} basePath={basePath}/>} {route.section === "research" && <Research site={s} route={route} basePath={basePath}/>} {route.section === "members" && <Members site={s}/>} {route.section === "publications" && <Publications site={s}/>} {route.section === "join" && <Join site={s}/>} {route.section === "contact" && <Contact site={s}/>}<footer><strong>Biggins Lab</strong><span>Fred Hutch Cancer Center</span><span>Concept by LabNarrative</span></footer></main><style jsx global>{`
    .bn2{--ink:#10251f;--green:#184f42;--mint:#dfeae4;--paper:#f5f4ef;--line:#cbd5cf;color:var(--ink);background:var(--paper);font-family:Arial,Helvetica,sans-serif}.bn2 *{box-sizing:border-box}.bn2 a{color:inherit}.bn2-banner{padding:8px 5vw;background:#0e2e27;color:#fff;font-size:11px;letter-spacing:.09em;text-transform:uppercase}.bn2-header{height:118px;padding:28px 5vw 20px;display:flex;flex-direction:column;gap:18px;background:var(--paper);border-bottom:1px solid var(--line);position:relative;z-index:10}.bn2-brand{font-family:Georgia,serif;font-size:34px;text-decoration:none}.bn2-header nav{display:flex;gap:26px;flex-wrap:wrap}.bn2-header nav a{text-decoration:none;font-size:12px;text-transform:uppercase;letter-spacing:.08em}.bn2-hero{height:calc(100svh - 146px);min-height:560px;position:relative;overflow:hidden;background:#173d34}.bn2-hero>img{width:100%;height:100%;object-fit:cover;object-position:center 42%;display:block}.bn2-shade{position:absolute;inset:0;background:linear-gradient(90deg,rgba(5,24,19,.72),rgba(5,24,19,.12) 65%,rgba(5,24,19,.15))}.bn2-hero-copy{position:absolute;left:5vw;bottom:7vh;max-width:850px;color:white}.bn2-hero-copy p,.bn2-kicker{font-size:12px;text-transform:uppercase;letter-spacing:.15em}.bn2-hero-copy h1{font-family:Georgia,serif;font-weight:400;font-size:clamp(48px,7vw,100px);line-height:.94;margin:16px 0}.bn2-hero-copy span{display:block;max-width:700px;font-size:18px;line-height:1.55}.bn2-intro{display:grid;grid-template-columns:1fr 1fr;gap:8vw;padding:100px 7vw;border-bottom:1px solid var(--line)}.bn2-intro h2,.bn2-page h1{font-family:Georgia,serif;font-weight:400;font-size:clamp(42px,5vw,72px);line-height:1.02;margin:14px 0 30px}.bn2-intro p{font-size:20px;line-height:1.6}.bn2-intro a,.bn2-featured>a{font-weight:700;text-decoration:none}.bn2-program-grid{display:grid;grid-template-columns:repeat(3,1fr);border-bottom:1px solid var(--line)}.bn2-program-card{padding:48px 4vw 60px;text-decoration:none;border-right:1px solid var(--line);min-height:340px}.bn2-program-card:last-child{border-right:none}.bn2-program-card span,.bn2-project span{font-size:12px;letter-spacing:.14em}.bn2-program-card h3{font-family:Georgia,serif;font-size:34px;font-weight:400}.bn2-program-card p{line-height:1.55}.bn2-featured{padding:80px 7vw}.bn2-featured article{display:grid;grid-template-columns:100px 1fr;padding:24px 0;border-top:1px solid var(--line)}.bn2-featured h3{margin:0;font-family:Georgia,serif;font-size:24px}.bn2-page{max-width:1220px;margin:auto;padding:80px 6vw 120px}.bn2-lead{font-family:Georgia,serif;font-size:22px;line-height:1.6;max-width:900px}.bn2-question-list{margin:40px 0 70px;display:grid;gap:12px;font-size:18px}.bn2-research-links{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}.bn2-research-links a{padding:28px;border:1px solid var(--line);text-decoration:none}.bn2-research-links strong{font-family:Georgia,serif;font-size:26px;display:block;margin-bottom:15px}.bn2-research-links span{line-height:1.5}.bn2-back{display:inline-block;margin-bottom:30px;text-decoration:none}.bn2-program-page>h2{font-family:Georgia,serif;font-size:42px;font-weight:400;margin-top:70px}.bn2-project{display:grid;grid-template-columns:1.1fr .9fr;gap:50px;padding:50px 0;border-top:1px solid var(--line)}.bn2-project h3{font-family:Georgia,serif;font-weight:400;font-size:32px}.bn2-project p{font-size:17px;line-height:1.7}.bn2-figure{margin:0}.bn2-figure.hero{margin:30px 0 50px;max-width:900px}.bn2-figure img{width:100%;display:block;background:#e6e6e6;min-height:180px;object-fit:contain}.bn2-figure figcaption{font-size:12px;padding-top:10px;color:#56655f}.bn2-members{display:grid;gap:1px;background:var(--line);border:1px solid var(--line)}.bn2-members article{display:grid;grid-template-columns:280px 1fr;gap:40px;background:var(--paper);padding:34px}.bn2-members img,.bn2-placeholder{width:280px;height:280px;object-fit:cover;background:#d8dfdb}.bn2-placeholder{display:grid;place-items:center;font-size:64px;font-family:Georgia,serif}.bn2-members h2{font-family:Georgia,serif;font-size:34px;font-weight:400;margin:5px 0}.bn2-role{text-transform:uppercase;letter-spacing:.08em;font-size:12px}.bn2-members article p:last-child{line-height:1.65}.bn2-former{margin-top:80px}.bn2-former h2,.bn2-years h2,.bn2-reviews h1{font-family:Georgia,serif;font-size:42px;font-weight:400}.bn2-former>div{padding:18px 0;border-top:1px solid var(--line)}.bn2-years section{padding:25px 0 55px;border-top:1px solid var(--line)}.bn2-years p,.bn2-reviews p{line-height:1.55;margin:15px 0}.bn2-years a,.bn2-reviews a{text-decoration:none}.bn2-years a:hover,.bn2-reviews a:hover{text-decoration:underline}.bn2-reviews{margin-top:60px}.bn2-join{padding:30px 0;border-top:1px solid var(--line);max-width:900px}.bn2-join h2{font-family:Georgia,serif;font-size:34px;font-weight:400}.bn2-join p{font-size:18px;line-height:1.7}.bn2-contact{display:grid;grid-template-columns:repeat(3,1fr);gap:30px}.bn2-contact>div{border-top:1px solid var(--line);padding-top:20px}.bn2-contact h2{font-family:Georgia,serif;font-weight:400}.bn2 footer{padding:40px 5vw;background:#10251f;color:white;display:flex;justify-content:space-between;gap:20px;font-size:13px}
    @media(max-width:850px){.bn2-header{height:auto}.bn2-hero{height:72svh;min-height:500px}.bn2-intro,.bn2-program-grid,.bn2-research-links,.bn2-contact{grid-template-columns:1fr}.bn2-program-card{border-right:none;border-bottom:1px solid var(--line)}.bn2-project{grid-template-columns:1fr}.bn2-members article{grid-template-columns:1fr}.bn2-members img,.bn2-placeholder{width:100%;height:auto;aspect-ratio:1}.bn2 footer{flex-direction:column}.bn2-hero-copy{bottom:35px}.bn2-hero-copy h1{font-size:48px}}
  `}</style></div>;
}
