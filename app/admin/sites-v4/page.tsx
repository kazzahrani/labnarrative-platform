"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { browserSupabase as supabase } from "@/lib/supabase-browser";
import WebsiteOutreachTimeline from "@/components/admin/WebsiteOutreachTimeline";
import WebsiteDesignAction from "@/components/admin/WebsiteDesignAction";
import WebsiteApprovePublishAction from "@/components/admin/WebsiteApprovePublishAction";
import styles from "../sites-v3/site-monitor-v3.module.css";

type SiteRow = {
  id:string; slug:string; status:string; content:Record<string,any>|null; created_at:string; updated_at:string;
  domain_status:string; domain_url:string|null; outreach_status:string|null; design_key:string|null;
  design_settings:Record<string,any>|null; design_version:number|null;
};
type ProspectRow = { id:string; site_id:string|null; slug:string|null; pi_name:string|null; institution:string|null; status:string|null; metadata:Record<string,any>|null };
type EngineRun = { engine:"v3"|"v4"; runId:string; prospectId:string; siteId:string|null; piName:string; slug:string; state:string; currentStage?:string; blockedReason?:string|null; updatedAt:string; previewPath?:string|null; publicUrl?:string|null; evidenceCount?:number; assetCount?:number };
type OutreachMessage = { id:string; prospect_id:string; site_id:string|null; message_kind:string; status:string; sent_at:string|null; follow_up_at:string|null; created_at:string };
type Dashboard = { counts?:Record<string,number>; runs?:EngineRun[] };
type Filter = "all"|"v4"|"final_review"|"live"|"private"|"legacy"|"outside";

const PAGE_SIZES=[10,25,50,100] as const;

function isPublic(site:SiteRow){return ["concept","live"].includes(site.status)}
function isOutside(prospect?:ProspectRow){return String(prospect?.metadata?.conceptCategory||"").toLowerCase()==="outside_concept"}
function piName(site:SiteRow,prospect?:ProspectRow,run?:EngineRun){return String(run?.piName||site.content?.piName||prospect?.pi_name||site.content?.labName||site.slug)}
function institution(site:SiteRow,prospect?:ProspectRow){return String(site.content?.institution||prospect?.institution||"—")}
function publicUrl(site:SiteRow,run?:EngineRun){return String(site.domain_url||run?.publicUrl||`https://${site.slug}.labnarrative.com`)}
function designLabel(site:SiteRow){const variant=String(site.design_settings?.variant||site.content?.design?.settings?.variant||site.content?.design?.variant||"").trim();if(variant==="ciribilli-narita-v1")return "Narita";if(variant)return variant.replace(/-v\d+$/i,"").split("-").map(x=>x.charAt(0).toUpperCase()+x.slice(1)).join(" ");return String(site.design_key||"Unspecified")}

export default function SiteMonitorV4Page(){
  const [sites,setSites]=useState<SiteRow[]>([]);const [prospects,setProspects]=useState<ProspectRow[]>([]);const [runs,setRuns]=useState<EngineRun[]>([]);const [messages,setMessages]=useState<OutreachMessage[]>([]);
  const [authState,setAuthState]=useState<"loading"|"signed_out"|"forbidden"|"ready">("loading");const [loading,setLoading]=useState(true);const [notice,setNotice]=useState("");
  const [filter,setFilter]=useState<Filter>("all");const [search,setSearch]=useState("");const [pageSize,setPageSize]=useState<(typeof PAGE_SIZES)[number]>(50);const [page,setPage]=useState(1);

  const load=useCallback(async()=>{
    setLoading(true);setNotice("");
    const {data:sessionData}=await supabase.auth.getSession();const session=sessionData.session;
    if(!session){setAuthState("signed_out");setLoading(false);return}
    const {data:role}=await supabase.from("user_roles").select("role").eq("user_id",session.user.id).maybeSingle();
    if(role?.role!=="admin"){setAuthState("forbidden");setLoading(false);return}
    setAuthState("ready");
    const [siteResult,prospectResult,dashboardResult,outreachResult]=await Promise.all([
      supabase.from("sites").select("id,slug,status,content,created_at,updated_at,domain_status,domain_url,outreach_status,design_key,design_settings,design_version").order("created_at",{ascending:false}),
      supabase.from("prospects").select("id,site_id,slug,pi_name,institution,status,metadata").not("site_id","is",null),
      supabase.rpc("engine_admin_dashboard"),
      supabase.from("outreach_messages").select("id,prospect_id,site_id,message_kind,status,sent_at,follow_up_at,created_at").eq("is_test",false).in("message_kind",["initial","followup_1","followup_2"]),
    ]);
    const error=siteResult.error||prospectResult.error||dashboardResult.error||outreachResult.error;if(error)setNotice(error.message);
    setSites((siteResult.data||[]) as SiteRow[]);setProspects((prospectResult.data||[]) as ProspectRow[]);setRuns((((dashboardResult.data||{}) as Dashboard).runs||[]) as EngineRun[]);setMessages((outreachResult.data||[]) as OutreachMessage[]);setLoading(false);
  },[]);
  useEffect(()=>{void load()},[load]);useEffect(()=>setPage(1),[filter,search,pageSize]);

  const prospectBySite=useMemo(()=>new Map(prospects.filter(p=>p.site_id).map(p=>[p.site_id as string,p])),[prospects]);
  const runBySite=useMemo(()=>{const map=new Map<string,EngineRun>();for(const run of runs){if(!run.siteId)continue;const prior=map.get(run.siteId);if(!prior||Date.parse(run.updatedAt)>Date.parse(prior.updatedAt))map.set(run.siteId,run)}return map},[runs]);
  const messagesBySite=useMemo(()=>{const map=new Map<string,OutreachMessage[]>();for(const m of messages){if(!m.site_id)continue;const rows=map.get(m.site_id)||[];rows.push(m);map.set(m.site_id,rows)}return map},[messages]);
  const messagesByProspect=useMemo(()=>{const map=new Map<string,OutreachMessage[]>();for(const m of messages){const rows=map.get(m.prospect_id)||[];rows.push(m);map.set(m.prospect_id,rows)}return map},[messages]);
  const enriched=useMemo(()=>sites.map(site=>{const prospect=prospectBySite.get(site.id);const run=runBySite.get(site.id);const siteMessages=messagesBySite.get(site.id)||(prospect?messagesByProspect.get(prospect.id):undefined)||[];return {site,prospect,run,messages:siteMessages}}),[sites,prospectBySite,runBySite,messagesBySite,messagesByProspect]);
  const metrics=useMemo(()=>({total:enriched.filter(x=>x.site.status!=="archived").length,live:enriched.filter(x=>x.site.status!=="archived"&&isPublic(x.site)).length,private:enriched.filter(x=>x.site.status==="draft").length,finalReview:enriched.filter(x=>x.run?.state==="final_review").length,v4:enriched.filter(x=>x.run?.engine==="v4").length}),[enriched]);
  const visible=useMemo(()=>{const q=search.trim().toLowerCase();return enriched.filter(({site,prospect,run})=>{
    if(site.status==="archived"&&filter!=="legacy")return false;
    if(filter==="v4"&&run?.engine!=="v4")return false;
    if(filter==="final_review"&&run?.state!=="final_review")return false;
    if(filter==="live"&&!isPublic(site))return false;
    if(filter==="private"&&site.status!=="draft")return false;
    if(filter==="legacy"&&run)return false;
    if(filter==="outside"&&!isOutside(prospect))return false;
    if(!q)return true;
    return [piName(site,prospect,run),institution(site,prospect),site.slug,designLabel(site),site.status,site.outreach_status||"",prospect?.status||"",run?.engine||"",run?.state||"",run?.currentStage||""].join(" ").toLowerCase().includes(q);
  }).sort((a,b)=>Date.parse(b.site.created_at)-Date.parse(a.site.created_at))},[enriched,filter,search]);
  const totalPages=Math.max(1,Math.ceil(visible.length/pageSize));const currentPage=Math.min(page,totalPages);const paged=visible.slice((currentPage-1)*pageSize,currentPage*pageSize);

  if(authState==="loading")return <main className={styles.statePage}>Preparing Website Monitor v4…</main>;
  if(authState==="signed_out")return <main className={styles.statePage}><section className={styles.stateCard}><p className={styles.kicker}>Website Monitor v4</p><h1>Administrator sign-in required.</h1><Link href="/admin">Open dashboard</Link></section></main>;
  if(authState==="forbidden")return <main className={styles.statePage}><section className={styles.stateCard}><p className={styles.kicker}>Website Monitor v4</p><h1>Administrator permission required.</h1><Link href="/admin">Return to dashboard</Link></section></main>;

  return <main className={styles.page}>
    <header className={styles.topbar}><div className={styles.topbarLeft}><Link className={styles.brand} href="/admin">LabNarrative</Link><span>Website Monitor v4</span></div><nav className={styles.nav}><Link href="/admin/discovery">Discovery</Link><Link href="/admin/automation">Production</Link><Link href="/admin/review">Final Review</Link><Link href="/admin/sales">Sales</Link></nav></header>
    <section className={styles.content}>
      <div className={styles.hero}><div><p className={styles.kicker}>Site operations</p><h1>Every website. One operational truth.</h1><p>V4 production state, preserved v3 concepts, site visibility and outreach status are shown in one place.</p></div><div className={styles.heroActions}><button className={styles.buttonSecondary} onClick={()=>void load()} disabled={loading}>{loading?"Refreshing…":"Refresh data"}</button></div></div>
      <section className={styles.metrics}>{[
        {k:"all" as Filter,l:"Active sites",v:metrics.total,s:"Non-archived"},{k:"v4" as Filter,l:"Engine v4",v:metrics.v4,s:"New production"},{k:"final_review" as Filter,l:"Final Review",v:metrics.finalReview,s:"Human gate"},{k:"live" as Filter,l:"Live sites",v:metrics.live,s:"Currently public"},{k:"private" as Filter,l:"Private sites",v:metrics.private,s:"Currently unpublished"},
      ].map(m=><button key={m.k} className={`${styles.metric} ${filter===m.k?styles.metricActive:""}`} onClick={()=>setFilter(m.k)}><span>{m.l}</span><strong>{m.v}</strong><small>{m.s}</small></button>)}</section>
      <section className={styles.toolbar}><label className={styles.field}><span>Search</span><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="PI, institution, slug, engine, stage or status…"/></label><label className={styles.field}><span>View</span><select value={filter} onChange={e=>setFilter(e.target.value as Filter)}><option value="all">All active</option><option value="v4">Engine v4</option><option value="final_review">Final Review</option><option value="live">Live sites</option><option value="private">Private sites</option><option value="outside">Outside concept</option><option value="legacy">Pre-engine / legacy</option></select></label><label className={styles.field}><span>Show</span><select value={pageSize} onChange={e=>setPageSize(Number(e.target.value) as (typeof PAGE_SIZES)[number])}>{PAGE_SIZES.map(size=><option key={size} value={size}>{size}</option>)}</select></label></section>
      {notice?<p className={styles.notice}>{notice}</p>:null}
      <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Website</th><th>Engine / design</th><th>Visibility</th><th>Outreach sequence</th><th>Actions</th></tr></thead><tbody>{paged.map(({site,prospect,run,messages})=><tr key={site.id} id={`site-${site.id}`}><td className={styles.siteCell}><strong>{piName(site,prospect,run)}</strong>{isOutside(prospect)?<small className={`${styles.pill} ${styles.pillWarn}`}>Outside concept</small>:null}<span>{institution(site,prospect)}</span><span>{site.slug}.labnarrative.com</span></td><td><span className={styles.pill}>{run?`Engine ${run.engine.toUpperCase()}`:"Legacy"}</span><span className={styles.muted}>{designLabel(site)}{run?.currentStage?` · ${run.currentStage}`:""}</span></td><td><span className={isPublic(site)?`${styles.pill} ${styles.pillGood}`:`${styles.pill} ${styles.pillWarn}`}>{isPublic(site)?"Live":"Private"}</span><span className={styles.muted}>site {site.status} · domain {site.domain_status||"unknown"}</span></td><td><WebsiteOutreachTimeline messages={messages} outreachStatus={site.outreach_status} prospectStatus={prospect?.status} outside={isOutside(prospect)}/></td><td><div className={styles.actions}><Link href={`/admin/sites/${site.slug}/edit`}>Edit</Link><Link href={`/admin/preview/${site.slug}`}>Preview</Link>{isPublic(site)?<a href={publicUrl(site,run)} target="_blank" rel="noreferrer">Open site</a>:null}{run?.state==="final_review"&&!isPublic(site)?<WebsiteApprovePublishAction runId={run.runId} engine={run.engine}/>:null}{run?.state==="final_review"?<Link href="/admin/review">Final Review</Link>:null}{run?.state==="published"?<Link href={`/admin/outreach/${run.runId}`} style={{background:"#2f6f5e",borderColor:"rgba(63,143,113,.50)",color:"#f4fbf8"}}>Outreach</Link>:null}<WebsiteDesignAction siteId={site.id} slug={site.slug} status={site.status} currentVariant={String(site.design_settings?.variant||"")} onChanged={()=>void load()}/></div></td></tr>)}</tbody></table>{!visible.length?<div className={styles.empty}>No websites match this view.</div>:null}</div>
      <div className="platformListPagination" data-platform-native-pagination="sites-v4"><span className="platformListPaginationSummary">{visible.length?`${(currentPage-1)*pageSize+1}–${Math.min(currentPage*pageSize,visible.length)} of ${visible.length}`:"0 of 0"}</span><div className="platformListPaginationControls"><div className="platformListPageButtons"><button type="button" disabled={currentPage<=1} onClick={()=>setPage(p=>Math.max(1,p-1))}>‹</button><span>{currentPage} / {totalPages}</span><button type="button" disabled={currentPage>=totalPages} onClick={()=>setPage(p=>Math.min(totalPages,p+1))}>›</button></div></div></div>
    </section>
  </main>;
}
