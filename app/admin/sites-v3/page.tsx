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

type OutreachMessage = {
  id: string;
  prospect_id: string;
  site_id: string | null;
  message_kind: string;
  status: string;
  sent_at: string | null;
  follow_up_at: string | null;
  created_at: string;
};

type Dashboard = { counts?: Record<string, number>; runs?: V3Run[] };
type Filter = "all" | "v3" | "live" | "private" | "legacy";
type TimelineItem = { key: "E1" | "F1" | "F2"; state: string; date: string | null; tone: "sent" | "future" | "stopped" | "idle" };

const PAGE_SIZES = [5,10,25,100] as const;
const STOPPED_PROSPECT_STATES = new Set(["replied","interested","rejected","paused"]);
const STOPPED_SITE_STATES = new Set(["replied","interested","meeting_scheduled","proposal_sent","client"]);

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

function isPublic(site: SiteRow): boolean {
  return ["concept","live"].includes(site.status);
}

function visibilityLabel(site: SiteRow): string {
  return isPublic(site) ? "Live" : "Private";
}

function domainLabel(site: SiteRow): string {
  if (["live","wildcard_live"].includes(site.domain_status)) return "domain ready";
  return `domain ${site.domain_status || "unknown"}`;
}

function pillClass(label: string) {
  const lower = label.toLowerCase();
  if (lower.includes("live")) return `${styles.pill} ${styles.pillGood}`;
  if (lower.includes("private")) return `${styles.pill} ${styles.pillWarn}`;
  return `${styles.pill} ${styles.pillNeutral}`;
}

function formatOutreachDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", { day:"2-digit", month:"short", year:"numeric", timeZone:"Asia/Riyadh" }).format(date);
}

function addDays(value: string, days: number): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate()+days);
  return date.toISOString();
}

function bestMessage(messages: OutreachMessage[], kind: string): OutreachMessage | undefined {
  return messages
    .filter((message)=>message.message_kind===kind)
    .sort((a,b)=>{
      const sentDelta=Number(Boolean(b.sent_at))-Number(Boolean(a.sent_at));
      if (sentDelta) return sentDelta;
      return Date.parse(b.created_at)-Date.parse(a.created_at);
    })[0];
}

function outreachTimeline(site: SiteRow, prospect: ProspectRow | undefined, messages: OutreachMessage[]): TimelineItem[] {
  const initial=bestMessage(messages,"initial");
  const f1=bestMessage(messages,"followup_1");
  const f2=bestMessage(messages,"followup_2");
  const stopped=STOPPED_PROSPECT_STATES.has(String(prospect?.status||"").toLowerCase()) || STOPPED_SITE_STATES.has(String(site.outreach_status||"").toLowerCase());

  const e1:TimelineItem = initial?.sent_at
    ? {key:"E1",state:"Sent",date:formatOutreachDate(initial.sent_at),tone:"sent"}
    : initial
      ? {key:"E1",state:"Draft",date:formatOutreachDate(initial.created_at),tone:"idle"}
      : {key:"E1",state:"Not started",date:null,tone:"idle"};

  let first:TimelineItem;
  if (f1?.sent_at) first={key:"F1",state:"Sent",date:formatOutreachDate(f1.sent_at),tone:"sent"};
  else if (stopped && initial?.sent_at) first={key:"F1",state:"Stopped",date:null,tone:"stopped"};
  else if (initial?.sent_at && initial.follow_up_at) first={key:"F1",state:"Due",date:formatOutreachDate(initial.follow_up_at),tone:"future"};
  else first={key:"F1",state:"Not scheduled",date:null,tone:"idle"};

  let second:TimelineItem;
  if (f2?.sent_at) second={key:"F2",state:"Sent",date:formatOutreachDate(f2.sent_at),tone:"sent"};
  else if (stopped && (initial?.sent_at || f1?.sent_at)) second={key:"F2",state:"Stopped",date:null,tone:"stopped"};
  else if (f1?.sent_at && f1.follow_up_at) second={key:"F2",state:"Due",date:formatOutreachDate(f1.follow_up_at),tone:"future"};
  else if (initial?.sent_at && initial.follow_up_at) {
    const expected=addDays(initial.follow_up_at,8);
    second={key:"F2",state:"Expected",date:formatOutreachDate(expected),tone:"future"};
  } else second={key:"F2",state:"Not scheduled",date:null,tone:"idle"};

  return [e1,first,second];
}

function outreachStarted(site: SiteRow, messages: OutreachMessage[]): boolean {
  return messages.some((message)=>Boolean(message.sent_at)) || ["email_1_sent","email_2_sent","email_3_sent","replied","interested"].includes(String(site.outreach_status||"").toLowerCase());
}

export default function SiteMonitorV3Page() {
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [prospects, setProspects] = useState<ProspectRow[]>([]);
  const [runs, setRuns] = useState<V3Run[]>([]);
  const [outreachMessages, setOutreachMessages] = useState<OutreachMessage[]>([]);
  const [loading, setLoading] = useState(true);
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
    const [siteResult, prospectResult, dashboardResult, outreachResult] = await Promise.all([
      supabase.from("sites").select("id,slug,status,content,created_at,updated_at,domain_status,domain_url,outreach_status,design_key,design_settings,design_version").order("created_at", { ascending: false }),
      supabase.from("prospects").select("id,site_id,slug,pi_name,institution,status").not("site_id", "is", null),
      supabase.rpc("engine_v3_admin_dashboard"),
      supabase.from("outreach_messages").select("id,prospect_id,site_id,message_kind,status,sent_at,follow_up_at,created_at").eq("is_test",false).in("message_kind",["initial","followup_1","followup_2"]),
    ]);
    const error = siteResult.error || prospectResult.error || dashboardResult.error || outreachResult.error;
    if (error) setNotice(error.message);
    setSites((siteResult.data || []) as SiteRow[]);
    setProspects((prospectResult.data || []) as ProspectRow[]);
    setRuns((((dashboardResult.data || {}) as Dashboard).runs || []) as V3Run[]);
    setOutreachMessages((outreachResult.data || []) as OutreachMessage[]);
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

  const outreachBySite = useMemo(() => {
    const map=new Map<string,OutreachMessage[]>();
    for (const message of outreachMessages) {
      if (!message.site_id) continue;
      const rows=map.get(message.site_id)||[];
      rows.push(message);
      map.set(message.site_id,rows);
    }
    return map;
  },[outreachMessages]);

  const outreachByProspect = useMemo(() => {
    const map=new Map<string,OutreachMessage[]>();
    for (const message of outreachMessages) {
      const rows=map.get(message.prospect_id)||[];
      rows.push(message);
      map.set(message.prospect_id,rows);
    }
    return map;
  },[outreachMessages]);

  const enriched = useMemo(() => sites.map((site) => {
    const prospect=prospectBySite.get(site.id);
    const messages=outreachBySite.get(site.id) || (prospect ? outreachByProspect.get(prospect.id) : undefined) || [];
    return { site, run:runBySite.get(site.id), prospect, messages };
  }), [sites,runBySite,prospectBySite,outreachBySite,outreachByProspect]);

  const metrics = useMemo(() => ({
    total: enriched.filter((x)=>x.site.status!=="archived").length,
    live: enriched.filter((x)=>x.site.status!=="archived"&&isPublic(x.site)).length,
    private: enriched.filter((x)=>x.site.status==="draft").length,
    finalReview: enriched.filter((x)=>x.run?.state==="final_review").length,
  }), [enriched]);

  const visible = useMemo(() => {
    const q=search.trim().toLowerCase();
    const result=enriched.filter(({site,run,prospect,messages})=>{
      if (site.status==="archived"&&filter!=="legacy") return false;
      if (filter==="v3"&&!run) return false;
      if (filter==="live"&&!isPublic(site)) return false;
      if (filter==="private"&&site.status!=="draft") return false;
      if (filter==="legacy"&&run) return false;
      if (!q) return true;
      const timeline=outreachTimeline(site,prospect,messages).map((item)=>`${item.key} ${item.state} ${item.date||""}`).join(" ");
      return [piName(site,prospect,run),institution(site,prospect),site.slug,visibilityLabel(site),designLabel(site),site.outreach_status||"",timeline].join(" ").toLowerCase().includes(q);
    });
    return result.sort((a,b)=>sort==="name"?piName(a.site,a.prospect,a.run).localeCompare(piName(b.site,b.prospect,b.run)):Date.parse(b.site.created_at)-Date.parse(a.site.created_at));
  }, [enriched,search,filter,sort]);

  const totalPages=Math.max(1,Math.ceil(visible.length/pageSize));
  const currentPage=Math.min(page,totalPages);
  const pageStart=(currentPage-1)*pageSize;
  const pagedVisible=visible.slice(pageStart,pageStart+pageSize);
  const rangeStart=visible.length?pageStart+1:0;
  const rangeEnd=Math.min(visible.length,pageStart+pageSize);

  if (authState==="loading") return <main className={styles.statePage}>Preparing Website Monitor v3…</main>;
  if (authState==="signed_out") return <main className={styles.statePage}><section className={styles.stateCard}><p className={styles.kicker}>Website Monitor v3</p><h1>Administrator sign-in required.</h1><p>Sign in through the administrator dashboard and return here.</p><Link href="/admin">Open dashboard</Link></section></main>;
  if (authState==="forbidden") return <main className={styles.statePage}><section className={styles.stateCard}><p className={styles.kicker}>Website Monitor v3</p><h1>Administrator permission required.</h1><Link href="/admin">Return to dashboard</Link></section></main>;

  return <main className={styles.page}>
    <header className={styles.topbar}><div className={styles.topbarLeft}><Link className={styles.brand} href="/admin">LabNarrative</Link><span>Website Monitor v3</span></div><nav className={styles.nav}><Link href="/admin/review">Final Review</Link><Link href="/admin/automation">Production</Link><Link href="/admin/sales">Sales</Link></nav></header>
    <section className={styles.content}>
      <div className={styles.hero}><div><p className={styles.kicker}>Site operations</p><h1>Every website. One operational truth.</h1><p>Current site visibility and the complete E1 → F1 → F2 outreach timeline are shown together, with real sent dates and upcoming sequence dates.</p></div><div className={styles.heroActions}><button className={styles.buttonSecondary} onClick={()=>void load()} disabled={loading}>{loading?"Refreshing…":"Refresh data"}</button></div></div>

      <section className={styles.metrics}>{[
        {k:"all" as Filter,l:"Active sites",v:metrics.total,s:"Non-archived"},
        {k:"live" as Filter,l:"Live sites",v:metrics.live,s:"Currently public"},
        {k:"private" as Filter,l:"Private sites",v:metrics.private,s:"Currently unpublished"},
        {k:"v3" as Filter,l:"Engine v3",v:enriched.filter((x)=>x.run).length,s:`${metrics.finalReview} in Final Review`},
      ].map((m)=><button key={m.k} className={`${styles.metric} ${filter===m.k?styles.metricActive:""}`} onClick={()=>setFilter(m.k)}><span>{m.l}</span><strong>{m.v}</strong><small>{m.s}</small></button>)}</section>

      <section className={styles.toolbar}>
        <label className={styles.field}><span>Search</span><input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="PI, institution, slug, design, visibility or outreach date…" /></label>
        <label className={styles.field}><span>View</span><select value={filter} onChange={(e)=>setFilter(e.target.value as Filter)}><option value="all">All active</option><option value="v3">Engine v3 only</option><option value="live">Live sites</option><option value="private">Private sites</option><option value="legacy">Pre-v3 / archived</option></select></label>
        <label className={styles.field}><span>Sort</span><select value={sort} onChange={(e)=>setSort(e.target.value)}><option value="created">Newest websites</option><option value="name">PI name</option></select></label>
      </section>

      {notice?<p className={styles.notice}>{notice}</p>:null}

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
        <thead><tr><th>Website</th><th>Design</th><th>Site visibility</th><th>Outreach timeline</th><th>Actions</th></tr></thead>
        <tbody>{pagedVisible.map(({site,run,prospect,messages})=>{
          const pub=isPublic(site); const visibility=visibilityLabel(site); const timeline=outreachTimeline(site,prospect,messages); const started=outreachStarted(site,messages);
          return <tr id={`site-${site.id}`} key={site.id}>
            <td className={styles.siteCell}><strong>{piName(site,prospect,run)}</strong><span>{institution(site,prospect)}</span><span>{site.slug}.labnarrative.com</span></td>
            <td><span className={styles.pill}>{designLabel(site)}</span><span className={styles.muted}>{site.design_key||"design"}{site.design_version?` · v${site.design_version}`:""}</span></td>
            <td><span className={pillClass(visibility)}>{visibility}</span><span className={styles.muted}>site {site.status} · {domainLabel(site)}</span></td>
            <td><div className={styles.outreachTimeline}>{timeline.map((item)=><div className={`${styles.outreachStage} ${styles[`outreach_${item.tone}`]}`} key={item.key}><strong>{item.key}</strong><div><span>{item.state}</span>{item.date?<time>{item.date}</time>:null}</div></div>)}</div><span className={styles.outreachRaw}>{site.outreach_status||prospect?.status||"not_contacted"}</span></td>
            <td><div className={styles.actions}><Link href={`/admin/sites/${site.slug}/edit`}>Edit</Link>{pub?<a href={publicUrl(site,run)} target="_blank" rel="noreferrer">Open site</a>:null}<Link href={`/admin/preview/${site.slug}`}>Preview</Link>{run?.state==="final_review"?<Link href="/admin/review">Final Review</Link>:null}{run&&["published","completed"].includes(run.state)&&!started?<Link href={`/admin/outreach/${run.runId}`}>Outreach</Link>:null}</div></td>
          </tr>;
        })}</tbody>
      </table>{!visible.length?<div className={styles.empty}>No websites match this view.</div>:null}</div>
      <p className={styles.footerNote}>Outreach dates use Riyadh time. E1 and completed follow-ups show their actual sent dates. F1 uses the stored next-send date. F2 uses the stored date after F1 is sent; before then it is explicitly marked Expected based on the current 5-day then 8-day sequence. Reply/interested/paused sequences show remaining stages as Stopped. Edit opens a private draft revision; the public website changes only after validation and Publish Changes.</p>
    </section>
  </main>;
}