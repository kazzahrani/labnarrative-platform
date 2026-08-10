"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { browserSupabase as supabase } from "@/lib/supabase-browser";
import styles from "./site-monitor-v3.module.css";

type SiteRow = {
  id: string;
  slug: string;
  status: string;
  content: Record<string, any> | null;
  created_at: string;
  updated_at: string;
  domain_status: string;
  domain_url: string | null;
  domain_error: string | null;
  outreach_status: string | null;
  design_key: string | null;
  design_settings: Record<string, any> | null;
  design_version: number | null;
};

type ProspectRow = {
  id: string;
  site_id: string | null;
  slug: string | null;
  pi_name: string | null;
  institution: string | null;
  status: string | null;
};

type V3Run = {
  runId: string;
  prospectId: string;
  siteId: string | null;
  piName: string;
  slug: string;
  state: string;
  blockedReason?: string | null;
  updatedAt: string;
  previewPath?: string | null;
  publicUrl?: string | null;
  evidenceCount?: number;
  assetCount?: number;
};

type Dashboard = { counts?: Record<string, number>; runs?: V3Run[] };
type Health = { ok: boolean; status: number; error?: string; finalUrl?: string };
type Filter = "all" | "problems" | "v3" | "live" | "private" | "legacy";

const REQUIRED_KEYS = ["slug","piName","labName","title","institution","eyebrow","headline","introduction","focusAreas","projects","team","members","publications","research","pages","theme","design"];
const ARRAY_KEYS = ["focusAreas","projects","team","members","publications","research"];
const THEME_KEYS = ["background","surface","foreground","muted","accent"];
const PAGE_SIZES = [5,10,25,100] as const;

function pageNumbers(page:number,total:number):Array<number|"…"> {
  if (total<=7) return Array.from({length:total},(_,index)=>index+1);
  const values:Array<number|"…">=[1];
  const start=Math.max(2,page-1);
  const end=Math.min(total-1,page+1);
  if (start>2) values.push("…");
  for (let value=start;value<=end;value+=1) values.push(value);
  if (end<total-1) values.push("…");
  values.push(total);
  return values;
}

function portraitUrl(content: Record<string, any> | null): string {
  return String(content?.pages?.home?.piImage || content?.pages?.contact?.piImage || "").trim();
}

function piName(site: SiteRow, prospect?: ProspectRow, run?: V3Run): string {
  return String(run?.piName || site.content?.piName || prospect?.pi_name || site.content?.labName || site.slug);
}

function institution(site: SiteRow, prospect?: ProspectRow): string {
  return String(site.content?.institution || prospect?.institution || "—");
}

function publicUrl(site: SiteRow, run?: V3Run): string {
  return String(site.domain_url || run?.publicUrl || `https://${site.slug}.labnarrative.com`);
}

function designLabel(site: SiteRow): string {
  const variant = String(site.design_settings?.variant || site.content?.design?.variant || "").trim();
  const known: Record<string,string> = {
    "ciribilli-narita-v1": "Narita",
    "dobbelstein-editorial-v1": "Dobbelstein Editorial",
    "portrait-first-v1": "Portrait First",
    "goyette-evolution-v1": "Goyette Evolution",
    "prives-photo-lab-v1": "Prives Photo Lab",
    "zhang-transcription-v1": "Zhang Transcription",
    "gao-ecosystem-v1": "Gao Ecosystem",
    "biggins-field-v1": "Biggins Field",
    "editorial-image-v1": "Editorial Image",
  };
  if (known[variant]) return known[variant];
  if (variant) return variant.replace(/-v\d+$/i, "").split("-").map((part)=>part.charAt(0).toUpperCase()+part.slice(1)).join(" ");
  return String(site.design_key || site.content?.design?.key || "Unspecified");
}

function followUpStage(site: SiteRow): number {
  const status=String(site.outreach_status||"").toLowerCase();
  if (["email_3_sent","followup_2_sent"].includes(status)) return 3;
  if (["email_2_sent","followup_1_sent"].includes(status)) return 2;
  if (["email_1_sent","initial_sent","no_response_yet","interested","replied"].includes(status)) return 1;
  return 0;
}

function isPublic(site: SiteRow): boolean {
  return ["concept","live"].includes(site.status);
}

function productionHistoryLabel(site: SiteRow, run?: V3Run): string {
  if (run) {
    if (run.state === "final_review") return "Final Review";
    if (run.state === "producing") return "Producing";
    if (run.state === "published") return "Published before";
    if (run.state === "completed") return "Completed";
    if (run.state === "blocked") return "Blocked";
    return run.state.replaceAll("_", " ");
  }
  if (site.status === "draft") return "Legacy draft";
  if (site.status === "concept") return "Legacy concept";
  if (site.status === "live") return "Legacy client";
  if (site.status === "archived") return "Archived";
  return site.status;
}

function visibilityLabel(site: SiteRow): string {
  return isPublic(site) ? "Live" : "Private";
}

function domainLabel(site: SiteRow): string {
  if (["live","wildcard_live"].includes(site.domain_status)) return "domain ready";
  return `domain ${site.domain_status || "unknown"}`;
}

function dataIssues(site: SiteRow, run?: V3Run): string[] {
  const issues: string[] = [];
  const content = site.content || {};
  if (run) {
    for (const key of REQUIRED_KEYS) {
      const value = content[key];
      if (value == null || value === "" || (ARRAY_KEYS.includes(key) && !Array.isArray(value)) || (["pages","theme","design"].includes(key) && (typeof value !== "object" || Array.isArray(value)))) issues.push(`Missing ${key}`);
    }
    if (content.slug && content.slug !== site.slug) issues.push("Slug mismatch");
    for (const key of THEME_KEYS) if (!String(content?.theme?.[key] || "").trim()) issues.push(`Theme ${key}`);
    if (!portraitUrl(content)) issues.push("Portrait missing");
    if (run.state === "final_review" && site.status !== "draft") issues.push("Final Review not private");
  }
  if (isPublic(site)) {
    if (!site.domain_url) issues.push("Public URL missing");
    if (!["live","wildcard_live"].includes(site.domain_status)) issues.push("Domain not live");
  }
  if (site.domain_error) issues.push("Domain error");
  return [...new Set(issues)];
}

function pillClass(label: string) {
  const lower = label.toLowerCase();
  if (["completed","published before","live","verified","healthy"].some((x) => lower.includes(x))) return `${styles.pill} ${styles.pillGood}`;
  if (["blocked","error","problem","missing"].some((x) => lower.includes(x))) return `${styles.pill} ${styles.pillBad}`;
  if (["producing","final review","draft","checking","private"].some((x) => lower.includes(x))) return `${styles.pill} ${styles.pillWarn}`;
  return `${styles.pill} ${styles.pillNeutral}`;
}

export default function SiteMonitorV3Page() {
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [prospects, setProspects] = useState<ProspectRow[]>([]);
  const [runs, setRuns] = useState<V3Run[]>([]);
  const [health, setHealth] = useState<Record<string, Health>>({});
  const [portraitHealth, setPortraitHealth] = useState<Record<string, "ok" | "error" | "checking">>({});
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [authState, setAuthState] = useState<"loading"|"signed_out"|"forbidden"|"ready">("loading");
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("created");
  const [pageSize,setPageSize] = useState<(typeof PAGE_SIZES)[number]>(100);
  const [page,setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setNotice("");
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    if (!session) { setAuthState("signed_out"); setLoading(false); return; }
    const { data: role } = await supabase.from("user_roles").select("role").eq("user_id", session.user.id).maybeSingle();
    if (role?.role !== "admin") { setAuthState("forbidden"); setLoading(false); return; }
    setAuthState("ready");
    const [siteResult, prospectResult, dashboardResult] = await Promise.all([
      supabase.from("sites").select("id,slug,status,content,created_at,updated_at,domain_status,domain_url,domain_error,outreach_status,design_key,design_settings,design_version").order("created_at", { ascending: false }),
      supabase.from("prospects").select("id,site_id,slug,pi_name,institution,status").not("site_id", "is", null),
      supabase.rpc("engine_v3_admin_dashboard"),
    ]);
    const error = siteResult.error || prospectResult.error || dashboardResult.error;
    if (error) setNotice(error.message);
    setSites((siteResult.data || []) as SiteRow[]);
    setProspects((prospectResult.data || []) as ProspectRow[]);
    setRuns((((dashboardResult.data || {}) as Dashboard).runs || []) as V3Run[]);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setPage(1); }, [filter,search,sort,pageSize]);

  const runBySite = useMemo(() => {
    const map = new Map<string,V3Run>();
    for (const run of runs) {
      if (!run.siteId) continue;
      const previous = map.get(run.siteId);
      if (!previous || Date.parse(run.updatedAt) > Date.parse(previous.updatedAt)) map.set(run.siteId,run);
    }
    return map;
  }, [runs]);
  const prospectBySite = useMemo(() => new Map(prospects.filter((p)=>p.site_id).map((p)=>[p.site_id as string,p])), [prospects]);

  const enriched = useMemo(() => sites.map((site) => {
    const run=runBySite.get(site.id); const prospect=prospectBySite.get(site.id); const issues=dataIssues(site,run);
    if (health[site.id] && !health[site.id].ok) issues.push(`Site ${health[site.id].error || "unreachable"}`);
    if (portraitHealth[site.id] === "error") issues.push("Portrait not rendering");
    return { site, run, prospect, issues:[...new Set(issues)] };
  }), [sites,runBySite,prospectBySite,health,portraitHealth]);

  const metrics = useMemo(() => ({
    total: enriched.filter((x)=>x.site.status!=="archived").length,
    live: enriched.filter((x)=>x.site.status!=="archived"&&isPublic(x.site)).length,
    private: enriched.filter((x)=>x.site.status==="draft").length,
    finalReview: enriched.filter((x)=>x.run?.state==="final_review").length,
    problems: enriched.filter((x)=>x.site.status!=="archived"&&x.issues.length>0).length,
  }), [enriched]);

  const visible = useMemo(() => {
    const q=search.trim().toLowerCase();
    const result=enriched.filter(({site,run,prospect,issues})=>{
      if (site.status==="archived"&&filter!=="legacy") return false;
      if (filter==="problems"&&!issues.length) return false;
      if (filter==="v3"&&!run) return false;
      if (filter==="live"&&!isPublic(site)) return false;
      if (filter==="private"&&site.status!=="draft") return false;
      if (filter==="legacy"&&run) return false;
      if (!q) return true;
      return [piName(site,prospect,run),institution(site,prospect),site.slug,productionHistoryLabel(site,run),visibilityLabel(site),designLabel(site),site.outreach_status||"",issues.join(" ")].join(" ").toLowerCase().includes(q);
    });
    return result.sort((a,b)=>sort==="name"?piName(a.site,a.prospect,a.run).localeCompare(piName(b.site,b.prospect,b.run)):sort==="problems"?b.issues.length-a.issues.length||Date.parse(b.site.created_at)-Date.parse(a.site.created_at):Date.parse(b.site.created_at)-Date.parse(a.site.created_at));
  }, [enriched,search,filter,sort]);

  const totalPages=Math.max(1,Math.ceil(visible.length/pageSize));
  const currentPage=Math.min(page,totalPages);
  const pageStart=(currentPage-1)*pageSize;
  const pagedVisible=visible.slice(pageStart,pageStart+pageSize);
  const rangeStart=visible.length?pageStart+1:0;
  const rangeEnd=Math.min(visible.length,pageStart+pageSize);

  async function checkPortrait(id:string,url:string) {
    if (!url) return;
    setPortraitHealth((prev)=>({...prev,[id]:"checking"}));
    await new Promise<void>((resolve)=>{
      const image=new Image(); let settled=false; let timer:ReturnType<typeof setTimeout>;
      const done=(value:"ok"|"error")=>{ if(settled)return; settled=true; clearTimeout(timer); setPortraitHealth((prev)=>({...prev,[id]:value})); resolve(); };
      image.onload=()=>done("ok"); image.onerror=()=>done("error"); timer=setTimeout(()=>done("error"),9000); image.src=url;
    });
  }

  async function runHealthChecks() {
    setChecking(true);
    const targets=enriched.filter((x)=>x.site.status!=="archived"&&isPublic(x.site));
    for (let i=0;i<targets.length;i+=25) {
      const batch=targets.slice(i,i+25);
      const response=await fetch("/api/admin/site-health",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({targets:batch.map((x)=>({id:x.site.id,url:publicUrl(x.site,x.run)}))})});
      const payload=await response.json().catch(()=>({results:[]}));
      const next:Record<string,Health>={}; for (const item of payload.results||[]) next[item.id]=item;
      setHealth((prev)=>({...prev,...next}));
      await Promise.all(batch.map((x)=>checkPortrait(x.site.id,portraitUrl(x.site.content))));
    }
    setChecking(false);
  }

  if (authState==="loading") return <main className={styles.statePage}>Preparing Website Monitor v3…</main>;
  if (authState==="signed_out") return <main className={styles.statePage}><section className={styles.stateCard}><p className={styles.kicker}>Website Monitor v3</p><h1>Administrator sign-in required.</h1><p>Sign in through the administrator dashboard and return here.</p><Link href="/admin">Open dashboard</Link></section></main>;
  if (authState==="forbidden") return <main className={styles.statePage}><section className={styles.stateCard}><p className={styles.kicker}>Website Monitor v3</p><h1>Administrator permission required.</h1><Link href="/admin">Return to dashboard</Link></section></main>;

  const problemRows=enriched.filter((x)=>x.site.status!=="archived"&&x.issues.length).slice(0,8);

  return <main className={styles.page}>
    <header className={styles.topbar}><div className={styles.topbarLeft}><Link className={styles.brand} href="/admin">LabNarrative</Link><span>Website Monitor v3</span></div><nav className={styles.nav}><Link href="/admin/review">Final Review</Link><Link href="/admin/automation">Production</Link><Link href="/admin/sales">Sales</Link></nav></header>
    <section className={styles.content}>
      <div className={styles.hero}><div><p className={styles.kicker}>Site operations</p><h1>Every website. One operational truth.</h1><p>Production history and current site visibility are shown separately, alongside renderer integrity, domain health and portrait rendering, so historical workflow state can never be mistaken for whether a website is live now.</p></div><div className={styles.heroActions}><button className={styles.buttonSecondary} onClick={()=>void load()} disabled={loading}>{loading?"Refreshing…":"Refresh data"}</button><button className={styles.button} onClick={()=>void runHealthChecks()} disabled={checking}>{checking?"Checking sites…":"Run health checks"}</button></div></div>

      <section className={styles.metrics}>{[
        {k:"all" as Filter,l:"Active sites",v:metrics.total,s:"Non-archived"},
        {k:"live" as Filter,l:"Live sites",v:metrics.live,s:"Currently public"},
        {k:"private" as Filter,l:"Private sites",v:metrics.private,s:"Currently unpublished"},
        {k:"v3" as Filter,l:"Engine v3",v:enriched.filter((x)=>x.run).length,s:`${metrics.finalReview} in Final Review`},
        {k:"problems" as Filter,l:"Problems",v:metrics.problems,s:"Needs attention"},
      ].map((m)=><button key={m.k} className={`${styles.metric} ${filter===m.k?styles.metricActive:""}`} onClick={()=>setFilter(m.k)}><span>{m.l}</span><strong>{m.v}</strong><small>{m.s}</small></button>)}</section>

      <section className={styles.toolbar}>
        <label className={styles.field}><span>Search</span><input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="PI, institution, slug, design, visibility, production state or problem…" /></label>
        <label className={styles.field}><span>View</span><select value={filter} onChange={(e)=>setFilter(e.target.value as Filter)}><option value="all">All active</option><option value="problems">Problems</option><option value="v3">Engine v3 only</option><option value="live">Live sites</option><option value="private">Private sites</option><option value="legacy">Legacy / archived</option></select></label>
        <label className={styles.field}><span>Sort</span><select value={sort} onChange={(e)=>setSort(e.target.value)}><option value="created">Newest websites</option><option value="problems">Most problems</option><option value="name">PI name</option></select></label>
      </section>

      {notice?<p className={styles.notice}>{notice}</p>:null}

      {problemRows.length?<section className={styles.problemPanel}><div className={styles.problemHeader}><h2>Problems requiring attention</h2><span>{metrics.problems} active site{metrics.problems===1?"":"s"}</span></div><div className={styles.problemGrid}>{problemRows.map(({site,run,prospect,issues})=><article className={styles.problemItem} key={site.id}><div><strong>{piName(site,prospect,run)}</strong><p>{issues.slice(0,3).join(" · ")}</p></div><Link href={`/admin/sites/${site.slug}/edit`}>Fix</Link></article>)}</div></section>:null}

      <div className="platformListPagination" data-platform-native-pagination="sites">
        <span className="platformListPaginationSummary">{rangeStart}–{rangeEnd} of {visible.length}</span>
        <div className="platformListPaginationControls">
          <label className="platformListPageSize">Show <select aria-label="Items per page" value={pageSize} onChange={(event)=>setPageSize(Number(event.target.value) as (typeof PAGE_SIZES)[number])}>{PAGE_SIZES.map((size)=><option value={size} key={size}>{size}</option>)}</select></label>
          <div className="platformListPageButtons">
            <button type="button" disabled={currentPage<=1} onClick={()=>setPage(Math.max(1,currentPage-1))}>‹</button>
            {pageNumbers(currentPage,totalPages).map((value,index)=>value==="…"?<span className="platformListPageEllipsis" key={`ellipsis-${index}`}>…</span>:<button type="button" key={value} aria-current={value===currentPage?"page":undefined} onClick={()=>setPage(value)}>{value}</button>)}
            <button type="button" disabled={currentPage>=totalPages} onClick={()=>setPage(Math.min(totalPages,currentPage+1))}>›</button>
          </div>
        </div>
      </div>

      <div className={styles.tableWrap}><table className={styles.table}>
        <thead><tr><th>Website</th><th>Design</th><th>Production history</th><th>Site visibility</th><th>Health</th><th>Portrait</th><th>Follow-up</th><th>Problems</th><th>Actions</th></tr></thead>
        <tbody>{pagedVisible.map(({site,run,prospect,issues})=>{
          const h=health[site.id]; const ph=portraitHealth[site.id]; const portrait=portraitUrl(site.content); const pub=isPublic(site); const followUp=followUpStage(site); const visibility=visibilityLabel(site); const production=productionHistoryLabel(site,run);
          return <tr id={`site-${site.id}`} key={site.id}>
            <td className={styles.siteCell}><strong>{piName(site,prospect,run)}</strong><span>{institution(site,prospect)}</span><span>{site.slug}.labnarrative.com</span></td>
            <td><span className={styles.pill}>{designLabel(site)}</span><span className={styles.muted}>{site.design_key||"design"}{site.design_version?` · v${site.design_version}`:""}</span></td>
            <td><span className={pillClass(production)}>{production}</span>{run?<span className={styles.muted}>Engine v3 · {run.evidenceCount||0} evidence · {run.assetCount||0} assets</span>:<span className={styles.muted}>Historical legacy record</span>}</td>
            <td><span className={pillClass(visibility)}>{visibility}</span><span className={styles.muted}>site {site.status} · {domainLabel(site)}</span></td>
            <td><div className={styles.healthStack}><div className={styles.healthLine}><span className={`${styles.dot} ${h?(h.ok?styles.dotGood:styles.dotBad):styles.dotWarn}`}></span>{h?(h.ok?`Healthy · ${h.status}`:`Problem · ${h.error||h.status}`):pub?"Not checked":"Private"}</div></div></td>
            <td><div className={styles.healthStack}><div className={styles.healthLine}><span className={`${styles.dot} ${ph==="ok"?styles.dotGood:ph==="error"?styles.dotBad:styles.dotWarn}`}></span>{!portrait?"Missing":ph==="ok"?"Rendering":ph==="error"?"Not rendering":"Not checked"}</div></div></td>
            <td><div className={styles.healthStack}><div className={styles.healthLine}><span className={followUp>=1?`${styles.pill} ${styles.pillGood}`:styles.pill}>E1</span><span>›</span><span className={followUp>=2?`${styles.pill} ${styles.pillGood}`:styles.pill}>F1</span><span>›</span><span className={followUp>=3?`${styles.pill} ${styles.pillGood}`:styles.pill}>F2</span></div><span className={styles.muted}>{site.outreach_status||prospect?.status||"not_contacted"}</span></div></td>
            <td>{issues.length?<div className={styles.issues}>{issues.slice(0,5).map((issue)=><span className={styles.issue} key={issue}>{issue}</span>)}</div>:<span className={styles.ok}>No data problems</span>}</td>
            <td><div className={styles.actions}><Link href={`/admin/sites/${site.slug}/edit`}>{issues.length?"Edit / Fix":"Edit"}</Link>{pub?<a href={publicUrl(site,run)} target="_blank" rel="noreferrer">Open site</a>:null}<Link href={`/admin/preview/${site.slug}`}>Preview</Link>{run?.state==="final_review"?<Link href="/admin/review">Final Review</Link>:null}{run&&["published","completed"].includes(run.state)&&followUp===0?<Link href={`/admin/outreach/${run.runId}`}>Outreach</Link>:null}</div></td>
          </tr>;
        })}</tbody>
      </table>{!visible.length?<div className={styles.empty}>No websites match this view.</div>:null}</div>
      <p className={styles.footerNote}>Production history records what the Engine v3 run reached; Site visibility reflects the website’s current public/private state. A site can therefore show “Published before” and “Private” after it is intentionally unpublished. Health checks run only against currently live sites. Follow-up shows E1 → F1 → F2. Outreach is offered only before the outreach sequence has started. Edit / Fix opens a private draft revision; the public website changes only after validation and Publish Changes.</p>
    </section>
  </main>;
}