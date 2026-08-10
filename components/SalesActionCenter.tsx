"use client";

import { createClient, type Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./sales-action-center.module.css";

type Prospect = {
  id: string;
  site_id: string | null;
  pi_name: string;
  institution: string;
  email: string;
};

type Site = {
  id: string;
  slug: string;
  status: string;
  outreach_status: string;
  updated_at: string;
  content: { piName?: string; institution?: string } | null;
};

type Message = {
  id: string;
  prospect_id: string | null;
  site_id: string | null;
  recipient_email: string;
  message_kind: string;
  status: string;
  delivery_status: string | null;
  sent_at: string | null;
  bounced_at: string | null;
  complained_at: string | null;
};

type LinkedInRow = {
  prospect_id: string;
  status: string;
  profile_url: string;
  last_action_at: string | null;
};

type Reply = {
  id: string;
  prospect_id: string;
  from_email: string;
  subject: string;
  body_text: string;
  received_at: string;
  reply_kind: "human" | "automatic" | string;
};

type IntegrationState = {
  status: string;
  inbound_domain: string;
  inbound_status: string;
  last_event_at: string | null;
};

type Lead = {
  site: Site;
  prospect?: Prospect;
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
);

const ENGAGED = new Set(["replied", "interested", "meeting_scheduled", "proposal_sent", "client"]);
const STAGE_SCORE: Record<string, number> = {
  client: 5,
  proposal_sent: 4,
  meeting_scheduled: 3,
  interested: 2,
  replied: 1,
};

function label(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Riyadh",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

function preview(value: string, max = 115) {
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (!cleaned) return "No plain-text preview was provided.";
  return cleaned.length > max ? `${cleaned.slice(0, max - 1)}…` : cleaned;
}

export default function SalesActionCenter() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [linkedin, setLinkedin] = useState<LinkedInRow[]>([]);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [integration, setIntegration] = useState<IntegrationState | null>(null);

  const load = useCallback(async (activeSession: Session) => {
    setLoading(true);
    setNotice("");
    try {
      const { data: roleRow, error: roleError } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", activeSession.user.id)
        .maybeSingle();
      if (roleError) throw roleError;
      if (roleRow?.role !== "admin") {
        setNotice("Administrator access is required for sales actions.");
        return;
      }

      const [prospectResult, siteResult, messageResult, linkedinResult, replyResult, integrationResult] = await Promise.all([
        supabase.from("prospects").select("id,site_id,pi_name,institution,email").order("updated_at", { ascending: false }).limit(1000),
        supabase.from("sites").select("id,slug,status,outreach_status,updated_at,content").order("updated_at", { ascending: false }).limit(1000),
        supabase.from("outreach_messages").select("id,prospect_id,site_id,recipient_email,message_kind,status,delivery_status,sent_at,bounced_at,complained_at").eq("is_test", false).order("created_at", { ascending: false }).limit(1000),
        supabase.from("linkedin_outreach").select("prospect_id,status,profile_url,last_action_at").order("updated_at", { ascending: false }).limit(1000),
        supabase.from("outreach_replies").select("id,prospect_id,from_email,subject,body_text,received_at,reply_kind").order("received_at", { ascending: false }).limit(250),
        supabase.from("resend_integration_state").select("status,inbound_domain,inbound_status,last_event_at").eq("id", "primary").maybeSingle(),
      ]);

      if (prospectResult.error) throw prospectResult.error;
      if (siteResult.error) throw siteResult.error;
      if (messageResult.error) throw messageResult.error;
      if (linkedinResult.error) throw linkedinResult.error;
      if (replyResult.error) throw replyResult.error;
      if (integrationResult.error) throw integrationResult.error;

      setProspects((prospectResult.data ?? []) as Prospect[]);
      setSites((siteResult.data ?? []) as Site[]);
      setMessages((messageResult.data ?? []) as Message[]);
      setLinkedin((linkedinResult.data ?? []) as LinkedInRow[]);
      setReplies((replyResult.data ?? []) as Reply[]);
      setIntegration((integrationResult.data ?? null) as IntegrationState | null);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Sales action data could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setReady(true);
      if (data.session) void load(data.session);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession);
      setReady(true);
      if (nextSession) void load(nextSession);
    });
    return () => { mounted = false; subscription.unsubscribe(); };
  }, [load]);

  useEffect(() => {
    if (!session) return;
    const channel = supabase
      .channel("labnarrative-sales-reply-detection")
      .on("postgres_changes", { event: "*", schema: "public", table: "outreach_replies" }, () => void load(session))
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load, session]);

  const prospectBySite = useMemo(() => new Map(
    prospects.filter((row) => row.site_id).map((row) => [row.site_id as string, row]),
  ), [prospects]);

  const prospectById = useMemo(() => new Map(prospects.map((row) => [row.id, row])), [prospects]);

  const humanReplies = useMemo(() => replies.filter((row) => row.reply_kind === "human"), [replies]);
  const automaticReplies = useMemo(() => replies.filter((row) => row.reply_kind === "automatic"), [replies]);

  const stats = useMemo(() => {
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const initialSent = messages.filter((row) => row.message_kind === "initial" && row.status === "sent");
    const sent24h = messages.filter((row) => row.sent_at && Date.parse(row.sent_at) >= oneDayAgo).length;
    const confirmedDelivered = messages.filter((row) => row.message_kind === "initial" && row.delivery_status === "delivered").length;
    const deliveryIssues = messages.filter((row) => Boolean(row.bounced_at || row.complained_at) || ["bounced", "complained", "failed"].includes(row.delivery_status || "")).length;
    const linkedinBacklog = linkedin.filter((row) => row.status === "not_contacted").length;
    return { initialSent: initialSent.length, sent24h, confirmedDelivered, deliveryIssues, linkedinBacklog };
  }, [linkedin, messages]);

  const engagedLeads = useMemo<Lead[]>(() => sites
    .filter((row) => ENGAGED.has(row.outreach_status))
    .map((site) => ({ site, prospect: prospectBySite.get(site.id) }))
    .sort((a, b) => (STAGE_SCORE[b.site.outreach_status] ?? 0) - (STAGE_SCORE[a.site.outreach_status] ?? 0))
    .slice(0, 8), [prospectBySite, sites]);

  const deliveryProblems = useMemo(() => messages
    .filter((row) => Boolean(row.bounced_at || row.complained_at) || ["bounced", "complained", "failed"].includes(row.delivery_status || ""))
    .slice(0, 6), [messages]);

  const linkedinBacklog = useMemo(() => linkedin
    .filter((row) => row.status === "not_contacted")
    .map((row) => ({ ...row, prospect: prospectById.get(row.prospect_id) }))
    .filter((row) => row.prospect)
    .slice(0, 6), [linkedin, prospectById]);

  if (!ready || !session) return null;

  const replySystemHealthy = integration?.status === "connected" && Boolean(integration?.inbound_domain);

  return (
    <section className={styles.section} aria-label="Sales action center">
      <div className={styles.panel}>
        <header className={styles.header}>
          <div>
            <p className={styles.kicker}>Next-action layer</p>
            <h2>Sales Action Center</h2>
            <p>Prioritize conversations and exceptions. Human email replies are detected automatically and stop the remaining follow-up sequence.</p>
          </div>
          <button type="button" onClick={() => void load(session)} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</button>
        </header>

        {notice ? <p className={styles.notice}>{notice}</p> : null}

        <div className={styles.metrics}>
          <article><span>Initial emails sent</span><strong>{stats.initialSent}</strong><small>{stats.sent24h} messages sent in the last 24h</small></article>
          <article><span>Confirmed delivered</span><strong>{stats.confirmedDelivered}</strong><small>Delivery webhook confirmations</small></article>
          <article><span>Human replies</span><strong>{humanReplies.length}</strong><small>{automaticReplies.length} automatic replies detected and ignored</small></article>
          <article><span>Delivery issues</span><strong>{stats.deliveryIssues}</strong><small>Bounces, complaints or failed delivery</small></article>
          <article><span>LinkedIn backlog</span><strong>{stats.linkedinBacklog}</strong><small>Emailed PIs not yet touched on LinkedIn</small></article>
        </div>

        <div className={styles.grid}>
          <article className={styles.card}>
            <div className={styles.cardHeader}><div><p className={styles.kicker}>Automatic detection</p><h3>New human replies</h3></div><span>{humanReplies.length}</span></div>
            {humanReplies.length === 0 ? (
              <p className={styles.empty}>{replySystemHealthy
                ? `Listening for replies on ${integration?.inbound_domain}. Last Resend event: ${formatDate(integration?.last_event_at)}.`
                : "Reply detection is not currently reporting a healthy inbound connection."}</p>
            ) : humanReplies.slice(0, 8).map((reply) => {
              const prospect = prospectById.get(reply.prospect_id);
              return (
                <div className={styles.row} key={reply.id}>
                  <div><strong>{prospect?.pi_name || reply.from_email}</strong><small>{reply.subject || "Reply to LabNarrative outreach"}</small><small>{preview(reply.body_text)}</small></div>
                  <div className={styles.rowRight}><span className={styles.hot}>Reply received</span><small>{formatDate(reply.received_at)}</small><small>{reply.from_email}</small></div>
                </div>
              );
            })}
          </article>

          <article className={styles.card}>
            <div className={styles.cardHeader}><div><p className={styles.kicker}>Highest priority</p><h3>Conversations</h3></div><span>{engagedLeads.length}</span></div>
            {engagedLeads.length === 0 ? <p className={styles.empty}>No leads are marked as replied or interested yet.</p> : engagedLeads.map(({ site, prospect }) => (
              <div className={styles.row} key={site.id}>
                <div><strong>{prospect?.pi_name || site.content?.piName || site.slug}</strong><small>{prospect?.institution || site.content?.institution || ""}</small></div>
                <div className={styles.rowRight}><span className={styles.hot}>{label(site.outreach_status)}</span><small>{prospect?.email || "—"}</small></div>
              </div>
            ))}
          </article>

          <article className={styles.card}>
            <div className={styles.cardHeader}><div><p className={styles.kicker}>Protect deliverability</p><h3>Delivery problems</h3></div><span>{stats.deliveryIssues}</span></div>
            {deliveryProblems.length === 0 ? <p className={styles.empty}>No delivery problems are recorded.</p> : deliveryProblems.map((message) => {
              const prospect = message.prospect_id ? prospectById.get(message.prospect_id) : undefined;
              return <div className={styles.row} key={message.id}><div><strong>{prospect?.pi_name || message.recipient_email}</strong><small>{message.recipient_email}</small></div><div className={styles.rowRight}><span className={styles.problem}>{label(message.delivery_status || (message.complained_at ? "complained" : "bounced"))}</span><small>{formatDate(message.bounced_at || message.complained_at || message.sent_at)}</small></div></div>;
            })}
          </article>

          <article className={styles.card}>
            <div className={styles.cardHeader}><div><p className={styles.kicker}>Second touch</p><h3>LinkedIn next</h3></div><span>{stats.linkedinBacklog}</span></div>
            {linkedinBacklog.length === 0 ? <p className={styles.empty}>No LinkedIn backlog remains.</p> : linkedinBacklog.map((row) => (
              <div className={styles.row} key={row.prospect_id}>
                <div><strong>{row.prospect?.pi_name}</strong><small>{row.prospect?.institution || ""}</small></div>
                <div className={styles.rowRight}><span>Not contacted</span><small>{row.prospect?.email || "—"}</small></div>
              </div>
            ))}
          </article>
        </div>
      </div>
    </section>
  );
}
