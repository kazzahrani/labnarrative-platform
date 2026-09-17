"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { browserSupabase as supabase } from "@/lib/supabase-browser";
import styles from "./trading-outreach.module.css";

type Campaign = {
  id: string;
  slug: string;
  name: string;
  segment: string;
  description: string;
  message_angle: string;
  active: boolean;
  priority: number;
};

type Settings = {
  id: string;
  sender_name: string;
  sender_email: string;
  reply_to_email: string;
  provider: string;
  auto_send_enabled: boolean;
  daily_send_limit: number;
  batch_size: number;
  send_window_start: number;
  send_window_end: number;
  timezone: string;
  min_lead_score: number;
  require_grounding: boolean;
  require_valid_email: boolean;
};

type Prospect = {
  id: string;
  campaign_id: string | null;
  source_platform: string;
  source_url: string;
  source_date: string | null;
  handle: string | null;
  title: string | null;
  need_summary: string;
  fit_reason: string;
  lead_score: number;
  tags: string[];
  status: string;
  pain_category: string | null;
  exchange: string | null;
  market: string | null;
  tradingview_type: string | null;
  current_solution: string | null;
  fit_tier: string | null;
  product_angle: string | null;
  outreach_grounding_verified: boolean;
  outreach_grounding_notes: string | null;
  segment: string | null;
  company_name: string | null;
  company_domain: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_role: string | null;
  contact_email_status: string | null;
  country: string | null;
  language: string | null;
  contact_timezone: string | null;
  research_summary: string | null;
  research_sources: unknown;
  personalization_facts: unknown;
  email_subject: string | null;
  email_body: string | null;
  email_draft_status: string;
  auto_outreach_enabled: boolean;
  email_status: string;
  last_email_at: string | null;
  last_email_error: string | null;
  reply_status: string | null;
  replied_at: string | null;
  suppressed_at: string | null;
  suppression_reason: string | null;
  next_email_at: string | null;
  touch_count: number;
  updated_at: string;
};

type OutreachEmail = {
  id: string;
  prospect_id: string;
  campaign_id: string | null;
  send_kind: string;
  sequence_step: number;
  to_email: string;
  from_email: string;
  recipient_name: string | null;
  subject: string;
  body: string;
  provider: string;
  provider_message_id: string | null;
  status: string;
  scheduled_for: string | null;
  sent_at: string | null;
  delivery_status: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

function fmt(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function statusTone(status: string | null | undefined) {
  const value = String(status || "").toLowerCase();
  if (["sent", "replied", "positive", "converted", "paid"].includes(value)) return styles.good;
  if (["failed", "bounced", "suppressed", "unsubscribe", "unsubscribed"].includes(value)) return styles.bad;
  if (["scheduled", "sending", "contacted"].includes(value)) return styles.warn;
  return styles.neutral;
}

function sourceList(value: unknown): Array<{ url?: string; title?: string }> {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item === "object")
    .map((item) => item as { url?: string; title?: string })
    .slice(0, 6);
}

export default function TradingOutreachConsole() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [emails, setEmails] = useState<OutreachEmail[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState("all");
  const [selectedLeadId, setSelectedLeadId] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [campaignResult, settingsResult, prospectResult, emailResult] = await Promise.all([
      supabase
        .from("internal_outreach_campaigns")
        .select("id,slug,name,segment,description,message_angle,active,priority")
        .order("priority", { ascending: true }),
      supabase.from("internal_outreach_settings").select("*").eq("id", "primary").maybeSingle(),
      supabase
        .from("internal_sales_prospects")
        .select(
          "id,campaign_id,source_platform,source_url,source_date,handle,title,need_summary,fit_reason,lead_score,tags,status,pain_category,exchange,market,tradingview_type,current_solution,fit_tier,product_angle,outreach_grounding_verified,outreach_grounding_notes,segment,company_name,company_domain,contact_name,contact_email,contact_role,contact_email_status,country,language,contact_timezone,research_summary,research_sources,personalization_facts,email_subject,email_body,email_draft_status,auto_outreach_enabled,email_status,last_email_at,last_email_error,reply_status,replied_at,suppressed_at,suppression_reason,next_email_at,touch_count,updated_at",
        )
        .order("updated_at", { ascending: false })
        .limit(500),
      supabase
        .from("internal_outreach_emails")
        .select(
          "id,prospect_id,campaign_id,send_kind,sequence_step,to_email,from_email,recipient_name,subject,body,provider,provider_message_id,status,scheduled_for,sent_at,delivery_status,last_error,created_at,updated_at",
        )
        .order("created_at", { ascending: false })
        .limit(1000),
    ]);

    const error =
      campaignResult.error || settingsResult.error || prospectResult.error || emailResult.error;
    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    const nextProspects = (prospectResult.data || []) as unknown as Prospect[];
    setCampaigns((campaignResult.data || []) as Campaign[]);
    setSettings(settingsResult.data as Settings | null);
    setProspects(nextProspects);
    setEmails((emailResult.data || []) as unknown as OutreachEmail[]);
    setSelectedLeadId((current) =>
      current && nextProspects.some((lead) => lead.id === current)
        ? current
        : nextProspects[0]?.id || "",
    );
    setMessage("");
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 20000);
    return () => window.clearInterval(timer);
  }, [load]);

  const campaignById = useMemo(
    () => new Map(campaigns.map((campaign) => [campaign.id, campaign])),
    [campaigns],
  );

  const leadCampaign = useCallback(
    (lead: Prospect) => {
      if (lead.campaign_id) return campaignById.get(lead.campaign_id)?.slug || "";
      return campaigns.find((campaign) => campaign.segment === lead.segment)?.slug || "";
    },
    [campaignById, campaigns],
  );

  const visibleLeads = useMemo(() => {
    const filtered =
      selectedCampaign === "all"
        ? prospects
        : prospects.filter((lead) => leadCampaign(lead) === selectedCampaign);

    return filtered.sort((a, b) => {
      const aReady = a.auto_outreach_enabled && a.contact_email ? 1 : 0;
      const bReady = b.auto_outreach_enabled && b.contact_email ? 1 : 0;
      if (aReady !== bReady) return bReady - aReady;
      return Number(b.lead_score || 0) - Number(a.lead_score || 0);
    });
  }, [leadCampaign, prospects, selectedCampaign]);

  useEffect(() => {
    if (!visibleLeads.length) {
      setSelectedLeadId("");
      return;
    }
    if (!visibleLeads.some((lead) => lead.id === selectedLeadId)) {
      setSelectedLeadId(visibleLeads[0].id);
    }
  }, [selectedLeadId, visibleLeads]);

  const selectedLead = prospects.find((lead) => lead.id === selectedLeadId) || null;
  const selectedEmails = useMemo(
    () =>
      emails
        .filter((email) => email.prospect_id === selectedLeadId)
        .sort((a, b) => a.sequence_step - b.sequence_step),
    [emails, selectedLeadId],
  );

  const previewEmail =
    selectedEmails.find((email) => email.sequence_step === 1) ||
    selectedEmails[0] ||
    null;

  const metrics = useMemo(() => {
    const sent = emails.filter((email) => email.status === "sent").length;
    const scheduled = emails.filter((email) => email.status === "scheduled").length;
    const replies = prospects.filter(
      (lead) => lead.replied_at || ["replied", "positive", "negative"].includes(String(lead.reply_status)),
    ).length;
    const ready = prospects.filter(
      (lead) =>
        lead.auto_outreach_enabled &&
        Boolean(lead.contact_email) &&
        lead.outreach_grounding_verified &&
        Number(lead.lead_score || 0) >= Number(settings?.min_lead_score || 4),
    ).length;
    return { sent, scheduled, replies, ready };
  }, [emails, prospects, settings?.min_lead_score]);

  const campaignCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const lead of prospects) {
      const slug = leadCampaign(lead);
      if (slug) map.set(slug, (map.get(slug) || 0) + 1);
    }
    return map;
  }, [leadCampaign, prospects]);

  async function toggleAutoSend() {
    if (!settings) return;
    setWorking("settings");
    const { error } = await supabase
      .from("internal_outreach_settings")
      .update({
        auto_send_enabled: !settings.auto_send_enabled,
        updated_at: new Date().toISOString(),
      })
      .eq("id", "primary");
    if (error) setMessage(error.message);
    else await load();
    setWorking("");
  }

  async function updateDailyLimit(value: number) {
    if (!settings || !Number.isFinite(value)) return;
    setWorking("settings");
    const { error } = await supabase
      .from("internal_outreach_settings")
      .update({
        daily_send_limit: Math.max(0, Math.min(Math.round(value), 500)),
        updated_at: new Date().toISOString(),
      })
      .eq("id", "primary");
    if (error) setMessage(error.message);
    else await load();
    setWorking("");
  }

  async function runBatchNow() {
    setWorking("run");
    setMessage("");
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      setMessage("Administrator session is not available.");
      setWorking("");
      return;
    }

    const response = await fetch("/api/internal/trading-outreach-worker", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ limit: settings?.batch_size || 2 }),
    });
    const result = (await response.json().catch(() => ({}))) as {
      error?: string;
      sent?: number;
      failed?: number;
      claimed?: number;
    };
    if (!response.ok) {
      setMessage(result.error || "Outreach worker failed.");
    } else {
      setMessage(
        result.claimed
          ? `Worker finished: ${result.sent || 0} sent, ${result.failed || 0} failed.`
          : "No eligible emails are due right now.",
      );
    }
    await load();
    setWorking("");
  }

  async function toggleLead(lead: Prospect) {
    setWorking(lead.id);
    const { error } = await supabase
      .from("internal_sales_prospects")
      .update({
        auto_outreach_enabled: !lead.auto_outreach_enabled,
        updated_at: new Date().toISOString(),
      })
      .eq("id", lead.id);
    if (error) setMessage(error.message);
    else await load();
    setWorking("");
  }

  async function suppressLead(lead: Prospect) {
    if (!lead.contact_email) return;
    if (!window.confirm(`Suppress ${lead.contact_email} from all future outreach?`)) return;
    setWorking(lead.id);
    const email = lead.contact_email.trim().toLowerCase();
    const now = new Date().toISOString();

    const { error: suppressionError } = await supabase
      .from("internal_outreach_suppressions")
      .upsert({ email, reason: "manual_admin", source: "trading_outreach" }, { onConflict: "email" });

    const { error: leadError } = await supabase
      .from("internal_sales_prospects")
      .update({
        auto_outreach_enabled: false,
        suppressed_at: now,
        suppression_reason: "manual_admin",
        status: "suppressed",
        email_status: "suppressed",
        updated_at: now,
      })
      .eq("id", lead.id);

    const { error: queueError } = await supabase
      .from("internal_outreach_emails")
      .update({ status: "suppressed", updated_at: now })
      .eq("prospect_id", lead.id)
      .in("status", ["draft", "scheduled"]);

    const error = suppressionError || leadError || queueError;
    if (error) setMessage(error.message);
    else await load();
    setWorking("");
  }

  const emailBody = previewEmail?.body || selectedLead?.email_body || "";
  const emailSubject = previewEmail?.subject || selectedLead?.email_subject || "No email drafted yet";
  const sources = sourceList(selectedLead?.research_sources);

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <div>
          <a href="/admin" className={styles.brand}><span>Lab</span>Narrative</a>
          <span className={styles.product}>Trading Outreach</span>
        </div>
        <div className={styles.sender}>
          <span className={styles.dot} />
          <div>
            <small>Sender</small>
            <strong>{settings?.sender_email || "khaled@labnarrative.com"}</strong>
          </div>
          <span className={settings?.auto_send_enabled ? styles.livePill : styles.pausedPill}>
            {settings?.auto_send_enabled ? "AUTOMATIC" : "PAUSED"}
          </span>
        </div>
      </header>

      <section className={styles.shell}>
        <aside className={styles.sidebar}>
          <div className={styles.sideIntro}>
            <span>CAMPAIGNS</span>
            <strong>{campaigns.filter((campaign) => campaign.active).length} active</strong>
          </div>
          <button
            className={selectedCampaign === "all" ? styles.activeCampaign : styles.campaignButton}
            onClick={() => setSelectedCampaign("all")}
          >
            <span>All leads</span><b>{prospects.length}</b>
          </button>
          {campaigns.map((campaign) => (
            <button
              key={campaign.id}
              className={selectedCampaign === campaign.slug ? styles.activeCampaign : styles.campaignButton}
              onClick={() => setSelectedCampaign(campaign.slug)}
            >
              <span>{campaign.name}</span>
              <b>{campaignCounts.get(campaign.slug) || 0}</b>
            </button>
          ))}
          <div className={styles.sideFooter}>
            <span>Lead factory</span>
            <p>Research → qualify → draft → schedule → send → stop on reply.</p>
          </div>
        </aside>

        <section className={styles.main}>
          <div className={styles.hero}>
            <div>
              <p className={styles.eyebrow}>FIRST-PARTY GTM</p>
              <h1>Lead generation + outreach</h1>
              <p>Every email is grounded in public research about the person, company or trading workflow before it can enter the automatic queue.</p>
            </div>
            <div className={styles.heroActions}>
              <button
                className={settings?.auto_send_enabled ? styles.pauseButton : styles.primaryButton}
                disabled={!settings || working === "settings"}
                onClick={() => void toggleAutoSend()}
              >
                {settings?.auto_send_enabled ? "Pause auto-send" : "Enable auto-send"}
              </button>
              <button
                className={styles.secondaryButton}
                disabled={working === "run" || !settings?.auto_send_enabled}
                onClick={() => void runBatchNow()}
              >
                {working === "run" ? "Running…" : "Run due batch"}
              </button>
            </div>
          </div>

          <div className={styles.metrics}>
            <div><span>Qualified & enabled</span><strong>{metrics.ready}</strong></div>
            <div><span>Scheduled emails</span><strong>{metrics.scheduled}</strong></div>
            <div><span>Sent / logged</span><strong>{metrics.sent}</strong></div>
            <div><span>Replies</span><strong>{metrics.replies}</strong></div>
          </div>

          <div className={styles.controlStrip}>
            <div>
              <span>Daily send cap</span>
              <input
                type="number"
                min={0}
                max={500}
                value={settings?.daily_send_limit ?? 20}
                disabled={!settings || working === "settings"}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  setSettings((current) => current ? { ...current, daily_send_limit: value } : current);
                }}
                onBlur={(event) => void updateDailyLimit(Number(event.target.value))}
              />
            </div>
            <div>
              <span>Batch</span><strong>{settings?.batch_size ?? 2}</strong>
            </div>
            <div>
              <span>Window</span><strong>{String(settings?.send_window_start ?? 8).padStart(2, "0")}:00–{String(settings?.send_window_end ?? 17).padStart(2, "0")}:00</strong>
            </div>
            <div>
              <span>Timezone</span><strong>{settings?.timezone || "Asia/Riyadh"}</strong>
            </div>
            <div>
              <span>Minimum score</span><strong>{Number(settings?.min_lead_score || 4).toFixed(1)}</strong>
            </div>
          </div>

          {message ? <div className={styles.notice}>{message}</div> : null}

          <div className={styles.workspace}>
            <section className={styles.leadsPane}>
              <div className={styles.paneHead}>
                <div><span>LEADS</span><strong>{visibleLeads.length}</strong></div>
                <small>{loading ? "Refreshing…" : "Live from Supabase"}</small>
              </div>
              <div className={styles.leadList}>
                {visibleLeads.map((lead) => {
                  const selected = lead.id === selectedLeadId;
                  const name = lead.contact_name || lead.handle || lead.title || lead.company_name || "Prospect";
                  const org = lead.company_name || lead.title || lead.source_platform;
                  return (
                    <button
                      className={selected ? styles.leadRowActive : styles.leadRow}
                      key={lead.id}
                      onClick={() => setSelectedLeadId(lead.id)}
                    >
                      <div className={styles.avatar}>{name.slice(0, 2).toUpperCase()}</div>
                      <div className={styles.leadText}>
                        <strong>{name}</strong>
                        <span>{org}</span>
                        <small>{lead.contact_role || lead.pain_category || lead.fit_reason}</small>
                      </div>
                      <div className={styles.leadMeta}>
                        <span className={statusTone(lead.email_status)}>{lead.email_status.replaceAll("_", " ")}</span>
                        <b>{Number(lead.lead_score || 0).toFixed(1)}</b>
                      </div>
                    </button>
                  );
                })}
                {!visibleLeads.length && !loading ? <div className={styles.empty}>No leads in this campaign yet.</div> : null}
              </div>
            </section>

            <section className={styles.detailPane}>
              {selectedLead ? (
                <>
                  <div className={styles.detailHead}>
                    <div>
                      <span className={styles.eyebrow}>GROUNDING</span>
                      <h2>{selectedLead.contact_name || selectedLead.handle || selectedLead.title || selectedLead.company_name}</h2>
                      <p>{selectedLead.contact_role ? `${selectedLead.contact_role} · ` : ""}{selectedLead.company_name || selectedLead.source_platform}</p>
                    </div>
                    <div className={styles.leadActions}>
                      <button
                        className={selectedLead.auto_outreach_enabled ? styles.pauseButton : styles.secondaryButton}
                        disabled={working === selectedLead.id || Boolean(selectedLead.suppressed_at)}
                        onClick={() => void toggleLead(selectedLead)}
                      >
                        {selectedLead.auto_outreach_enabled ? "Pause lead" : "Enable lead"}
                      </button>
                      {selectedLead.contact_email ? (
                        <button
                          className={styles.dangerButton}
                          disabled={working === selectedLead.id}
                          onClick={() => void suppressLead(selectedLead)}
                        >
                          Suppress
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <div className={styles.factsGrid}>
                    <div><span>Email</span><strong>{selectedLead.contact_email || "Not enriched yet"}</strong><small>{selectedLead.contact_email_status || ""}</small></div>
                    <div><span>Segment</span><strong>{campaignById.get(selectedLead.campaign_id || "")?.name || selectedLead.segment || "Unassigned"}</strong></div>
                    <div><span>Current solution</span><strong>{selectedLead.current_solution || "—"}</strong></div>
                    <div><span>Product angle</span><strong>{selectedLead.product_angle || "—"}</strong></div>
                  </div>

                  <div className={styles.researchCard}>
                    <div className={styles.sectionTitle}>
                      <span>Deep research</span>
                      <b className={selectedLead.outreach_grounding_verified ? styles.verified : styles.unverified}>
                        {selectedLead.outreach_grounding_verified ? "VERIFIED" : "NOT VERIFIED"}
                      </b>
                    </div>
                    <p>{selectedLead.research_summary || selectedLead.need_summary}</p>
                    <p className={styles.fitReason}>{selectedLead.fit_reason}</p>
                    <div className={styles.sourceLinks}>
                      {sources.map((source, index) =>
                        source.url ? (
                          <a key={index} href={source.url} target="_blank" rel="noreferrer">
                            {source.title || `Source ${index + 1}`} ↗
                          </a>
                        ) : null,
                      )}
                      {!sources.length && selectedLead.source_url ? (
                        <a href={selectedLead.source_url} target="_blank" rel="noreferrer">Primary source ↗</a>
                      ) : null}
                    </div>
                  </div>

                  <div className={styles.emailCard}>
                    <div className={styles.sectionTitle}>
                      <span>What this lead gets</span>
                      <div className={styles.sequencePills}>
                        {selectedEmails.length
                          ? selectedEmails.map((email) => (
                              <span key={email.id} className={statusTone(email.status)}>
                                {email.sequence_step === 1 ? "Email 1" : `Follow-up ${email.sequence_step - 1}`} · {email.status}
                              </span>
                            ))
                          : <span className={styles.neutral}>No sequence yet</span>}
                      </div>
                    </div>
                    <div className={styles.subject}>{emailSubject}</div>
                    <div className={styles.mailMeta}>
                      <span>From <b>{settings?.sender_name || "Khaled Azzahrani"}</b> &lt;{settings?.sender_email || "khaled@labnarrative.com"}&gt;</span>
                      <span>To {selectedLead.contact_email || previewEmail?.to_email || "—"}</span>
                    </div>
                    <pre className={styles.emailBody}>{emailBody || "The lead factory has not drafted an email for this lead yet."}</pre>
                  </div>

                  <div className={styles.timeline}>
                    <div className={styles.sectionTitle}><span>Sequence</span><small>{selectedLead.touch_count || 0} touches</small></div>
                    {selectedEmails.map((email) => (
                      <div className={styles.timelineRow} key={email.id}>
                        <span className={statusTone(email.status)} />
                        <div>
                          <strong>{email.sequence_step === 1 ? "Initial email" : `Follow-up ${email.sequence_step - 1}`}</strong>
                          <small>{email.status === "sent" ? fmt(email.sent_at) : `Scheduled ${fmt(email.scheduled_for)}`}</small>
                        </div>
                        <b>{email.status}</b>
                      </div>
                    ))}
                    {!selectedEmails.length ? <div className={styles.emptyInline}>No email sequence created yet.</div> : null}
                  </div>
                </>
              ) : (
                <div className={styles.empty}>Select a lead to inspect its research and personalized email.</div>
              )}
            </section>
          </div>
        </section>
      </section>
    </main>
  );
}
