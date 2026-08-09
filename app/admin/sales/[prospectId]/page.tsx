"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { browserSupabase as supabase } from "@/lib/supabase-browser";
import styles from "./sales-lead.module.css";

type Prospect = {
  id: string;
  pi_name: string;
  institution: string;
  department?: string | null;
  country?: string | null;
  email?: string | null;
  official_profile_url?: string | null;
  current_website?: string | null;
  research_area?: string | null;
  qualification_score?: number | null;
  qualification_reason?: string | null;
  status: string;
};

type Site = {
  id: string;
  slug: string;
  status: string;
  outreach_status: string;
  domain_url?: string | null;
  content?: { piName?: string; institution?: string } | null;
};

type Workspace = {
  id: string;
  prospect_id: string;
  stage: string;
  notes: string;
  next_action: string;
  next_action_due_at: string | null;
  meeting_at: string | null;
  meeting_location: string;
  meeting_url: string;
  meeting_notes: string;
  proposal_status: string;
  proposal_sent_at: string | null;
  proposal_amount: number | null;
  proposal_currency: string;
  payment_status: string;
  deposit_percent: number;
  deposit_amount: number | null;
  deposit_received_at: string | null;
  updated_at: string;
};

type Message = {
  id: string;
  subject: string;
  body_text: string;
  recipient_email: string;
  sender_email: string;
  message_kind: string;
  status: string;
  delivery_status?: string | null;
  sent_at?: string | null;
  created_at: string;
};

type Reply = {
  id: string;
  from_email: string;
  to_email: string;
  subject: string;
  body_text: string;
  received_at: string;
  reply_kind: string;
};

type LinkedIn = {
  status: string;
  profile_url: string;
  connection_note?: string | null;
  last_action_at?: string | null;
};

type Analytics = {
  page_views?: number | string;
  visits?: number | string;
  cta_clicks?: number | string;
  first_viewed_at?: string | null;
  last_viewed_at?: string | null;
};

type PipelineEvent = {
  id: number;
  event_type: string;
  step?: string | null;
  message?: string | null;
  created_at: string;
};

type LeadData = {
  prospect: Prospect;
  site: Site | null;
  workspace: Workspace;
  messages: Message[];
  replies: Reply[];
  linkedin: LinkedIn | null;
  analytics: Analytics | null;
  events: PipelineEvent[];
};

type FormState = {
  stage: string;
  notes: string;
  nextAction: string;
  nextActionDueAt: string;
  meetingAt: string;
  meetingLocation: string;
  meetingUrl: string;
  meetingNotes: string;
  proposalStatus: string;
  proposalSentAt: string;
  proposalAmount: string;
  proposalCurrency: string;
  paymentStatus: string;
  depositPercent: string;
  depositAmount: string;
  depositReceivedAt: string;
};

const stages = [
  ["contacted", "Contacted"],
  ["replied", "Replied"],
  ["interested", "Interested"],
  ["meeting_scheduled", "Meeting scheduled"],
  ["proposal_sent", "Proposal sent"],
  ["client", "Client"],
  ["not_pursuing", "Not pursuing"],
] as const;

const proposalStatuses = [
  ["not_started", "Not started"],
  ["drafting", "Drafting"],
  ["ready", "Ready"],
  ["sent", "Sent"],
  ["accepted", "Accepted"],
  ["declined", "Declined"],
] as const;

const paymentStatuses = [
  ["not_requested", "Not requested"],
  ["deposit_requested", "Deposit requested"],
  ["deposit_received", "Deposit received"],
  ["paid_in_full", "Paid in full"],
  ["refunded", "Refunded"],
] as const;

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
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

function datetimeInput(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

function isoOrNull(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function numberOrNull(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function workspaceToForm(workspace: Workspace): FormState {
  return {
    stage: workspace.stage,
    notes: workspace.notes || "",
    nextAction: workspace.next_action || "",
    nextActionDueAt: datetimeInput(workspace.next_action_due_at),
    meetingAt: datetimeInput(workspace.meeting_at),
    meetingLocation: workspace.meeting_location || "",
    meetingUrl: workspace.meeting_url || "",
    meetingNotes: workspace.meeting_notes || "",
    proposalStatus: workspace.proposal_status || "not_started",
    proposalSentAt: datetimeInput(workspace.proposal_sent_at),
    proposalAmount: workspace.proposal_amount == null ? "" : String(workspace.proposal_amount),
    proposalCurrency: workspace.proposal_currency || "USD",
    paymentStatus: workspace.payment_status || "not_requested",
    depositPercent: String(workspace.deposit_percent ?? 25),
    depositAmount: workspace.deposit_amount == null ? "" : String(workspace.deposit_amount),
    depositReceivedAt: datetimeInput(workspace.deposit_received_at),
  };
}

export default function SalesLeadWorkspacePage() {
  const params = useParams<{ prospectId: string }>();
  const prospectId = String(params?.prospectId || "");
  const [data, setData] = useState<LeadData | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [threadFilter, setThreadFilter] = useState<"all" | "human">("all");

  const load = useCallback(async () => {
    if (!prospectId) return;
    setLoading(true);
    setError("");
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      setError("Administrator sign-in is required.");
      setLoading(false);
      return;
    }
    const { data: result, error: rpcError } = await supabase.rpc("sales_lead_workspace_get", { p_prospect_id: prospectId });
    if (rpcError) {
      setError(rpcError.message);
      setLoading(false);
      return;
    }
    const next = result as LeadData;
    setData(next);
    setForm(workspaceToForm(next.workspace));
    setLoading(false);
  }, [prospectId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!prospectId) return;
    const channel = supabase
      .channel(`sales-lead-${prospectId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "outreach_replies", filter: `prospect_id=eq.${prospectId}` }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load, prospectId]);

  const timeline = useMemo(() => {
    if (!data) return [];
    const outgoing = data.messages.map((item) => ({
      id: `m-${item.id}`,
      direction: "out" as const,
      kind: item.message_kind,
      subject: item.subject,
      body: item.body_text,
      email: item.recipient_email,
      at: item.sent_at || item.created_at,
      status: item.delivery_status || item.status,
      human: false,
    }));
    const incoming = data.replies.map((item) => ({
      id: `r-${item.id}`,
      direction: "in" as const,
      kind: item.reply_kind,
      subject: item.subject,
      body: item.body_text,
      email: item.from_email,
      at: item.received_at,
      status: item.reply_kind,
      human: item.reply_kind === "human",
    }));
    const merged = [...outgoing, ...incoming].sort((a, b) => Date.parse(a.at || "") - Date.parse(b.at || ""));
    return threadFilter === "human" ? merged.filter((item) => item.direction === "out" || item.human) : merged;
  }, [data, threadFilter]);

  const humanReplies = useMemo(() => data?.replies.filter((reply) => reply.reply_kind === "human") ?? [], [data]);
  const automaticReplies = useMemo(() => data?.replies.filter((reply) => reply.reply_kind === "automatic") ?? [], [data]);

  async function save(nextStage?: string) {
    if (!form || !data) return;
    const payload = { ...form, stage: nextStage || form.stage };
    setSaving(true);
    setError("");
    setNotice("");
    const { data: result, error: rpcError } = await supabase.rpc("sales_lead_workspace_save", {
      p_prospect_id: prospectId,
      p_stage: payload.stage,
      p_notes: payload.notes,
      p_next_action: payload.nextAction,
      p_next_action_due_at: isoOrNull(payload.nextActionDueAt),
      p_meeting_at: isoOrNull(payload.meetingAt),
      p_meeting_location: payload.meetingLocation,
      p_meeting_url: payload.meetingUrl,
      p_meeting_notes: payload.meetingNotes,
      p_proposal_status: payload.proposalStatus,
      p_proposal_sent_at: isoOrNull(payload.proposalSentAt),
      p_proposal_amount: numberOrNull(payload.proposalAmount),
      p_proposal_currency: payload.proposalCurrency,
      p_payment_status: payload.paymentStatus,
      p_deposit_percent: numberOrNull(payload.depositPercent) ?? 25,
      p_deposit_amount: numberOrNull(payload.depositAmount),
      p_deposit_received_at: isoOrNull(payload.depositReceivedAt),
    });
    if (rpcError) {
      setError(rpcError.message);
      setSaving(false);
      return;
    }
    const workspace = result as Workspace;
    setForm(workspaceToForm(workspace));
    setNotice(nextStage ? `Stage changed to ${label(nextStage)}.` : "Sales workspace saved.");
    setSaving(false);
    await load();
  }

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => current ? { ...current, [key]: value } : current);
    setNotice("");
  }

  if (loading) return <main className={styles.statePage}>Preparing conversion workspace…</main>;
  if (!data || !form) return <main className={styles.statePage}><section><h1>Lead workspace unavailable.</h1><p>{error || "This prospect could not be loaded."}</p><Link href="/admin/sales">Return to Sales</Link></section></main>;

  const { prospect, site, analytics, linkedin } = data;
  const websiteUrl = site?.domain_url || (site?.slug ? `https://${site.slug}.labnarrative.com` : "");
  const nextActionOverdue = form.nextActionDueAt && Date.parse(form.nextActionDueAt) < Date.now();

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <div className={styles.brandBlock}>
          <Link href="/admin/sales" className={styles.brand}>LabNarrative</Link>
          <span>Sales Conversion Workspace</span>
        </div>
        <div className={styles.topActions}>
          <Link href="/admin/sales">Sales</Link>
          <Link href="/admin/sites">Websites</Link>
          {site?.slug ? <Link href={`/admin/sites/${site.slug}/edit`}>Edit site</Link> : null}
          {websiteUrl ? <a href={websiteUrl} target="_blank" rel="noreferrer">Open website ↗</a> : null}
          <button type="button" onClick={() => void save()} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
        </div>
      </header>

      <div className={styles.shell}>
        <section className={styles.hero}>
          <div>
            <p className={styles.kicker}>Opportunity</p>
            <h1>{prospect.pi_name}</h1>
            <p className={styles.institution}>{prospect.institution}{prospect.department ? ` · ${prospect.department}` : ""}</p>
            <div className={styles.identityLinks}>
              {prospect.email ? <a href={`mailto:${prospect.email}`}>{prospect.email}</a> : <span>Email not stored on prospect</span>}
              {prospect.official_profile_url ? <a href={prospect.official_profile_url} target="_blank" rel="noreferrer">Official profile ↗</a> : null}
              {prospect.current_website ? <a href={prospect.current_website} target="_blank" rel="noreferrer">Existing website ↗</a> : null}
            </div>
          </div>
          <div className={styles.heroStats}>
            <article><span>Current stage</span><strong>{label(form.stage)}</strong></article>
            <article><span>Human replies</span><strong>{humanReplies.length}</strong><small>{automaticReplies.length} automatic</small></article>
            <article><span>Website visits</span><strong>{Number(analytics?.visits ?? 0)}</strong><small>{Number(analytics?.page_views ?? 0)} page views</small></article>
            <article><span>Qualification</span><strong>{prospect.qualification_score ?? "—"}</strong><small>/ 100</small></article>
          </div>
        </section>

        {notice ? <p className={styles.notice}>{notice}</p> : null}
        {error ? <p className={styles.error}>{error}</p> : null}

        <section className={styles.stageBar} aria-label="Sales stage">
          <div><p className={styles.kicker}>Move the opportunity</p><strong>{label(form.stage)}</strong></div>
          <div className={styles.stageButtons}>
            {stages.map(([value, text]) => (
              <button
                key={value}
                type="button"
                className={form.stage === value ? styles.stageActive : value === "not_pursuing" ? styles.stageDanger : undefined}
                onClick={() => void save(value)}
                disabled={saving || form.stage === value}
              >{text}</button>
            ))}
          </div>
        </section>

        <section className={styles.priorityGrid}>
          <article className={`${styles.card} ${nextActionOverdue ? styles.overdueCard : ""}`}>
            <div className={styles.cardHeading}><div><p className={styles.kicker}>Next action</p><h2>What happens next?</h2></div>{nextActionOverdue ? <span className={styles.overdue}>Overdue</span> : null}</div>
            <label className={styles.fieldWide}><span>Action</span><input value={form.nextAction} onChange={(event) => update("nextAction", event.target.value)} placeholder="e.g. Reply with two meeting times" /></label>
            <label><span>Due</span><input type="datetime-local" value={form.nextActionDueAt} onChange={(event) => update("nextActionDueAt", event.target.value)} /></label>
            <p className={styles.helper}>This is your manual action queue. Nothing here sends automatically.</p>
          </article>

          <article className={styles.card}>
            <div className={styles.cardHeading}><div><p className={styles.kicker}>Engagement</p><h2>Signals</h2></div></div>
            <dl className={styles.signalList}>
              <div><dt>Last website visit</dt><dd>{formatDate(analytics?.last_viewed_at)}</dd></div>
              <div><dt>CTA clicks</dt><dd>{Number(analytics?.cta_clicks ?? 0)}</dd></div>
              <div><dt>LinkedIn</dt><dd>{linkedin ? label(linkedin.status) : "Not tracked"}</dd></div>
              <div><dt>Outreach</dt><dd>{label(site?.outreach_status || prospect.status)}</dd></div>
            </dl>
            {linkedin?.profile_url ? <a className={styles.inlineLink} href={linkedin.profile_url} target="_blank" rel="noreferrer">Open LinkedIn profile ↗</a> : null}
          </article>
        </section>

        <section className={styles.mainGrid}>
          <div className={styles.primaryColumn}>
            <article className={styles.card}>
              <div className={styles.cardHeading}>
                <div><p className={styles.kicker}>Conversation</p><h2>Email thread</h2></div>
                <div className={styles.segmented}>
                  <button type="button" className={threadFilter === "all" ? styles.segmentActive : undefined} onClick={() => setThreadFilter("all")}>All</button>
                  <button type="button" className={threadFilter === "human" ? styles.segmentActive : undefined} onClick={() => setThreadFilter("human")}>Human only</button>
                </div>
              </div>
              {timeline.length === 0 ? <p className={styles.empty}>No outreach messages or replies are linked to this PI yet.</p> : (
                <div className={styles.thread}>
                  {timeline.map((item) => (
                    <article key={item.id} className={`${styles.message} ${item.direction === "in" ? styles.incoming : styles.outgoing} ${item.kind === "automatic" ? styles.automatic : ""}`}>
                      <header><div><strong>{item.direction === "in" ? "Incoming" : label(item.kind)}</strong><span>{item.email}</span></div><div><span>{label(item.status || "")}</span><time>{formatDate(item.at)}</time></div></header>
                      {item.subject ? <h3>{item.subject}</h3> : null}
                      <p>{item.body || "No plain-text body was stored."}</p>
                    </article>
                  ))}
                </div>
              )}
            </article>

            <article className={styles.card}>
              <div className={styles.cardHeading}><div><p className={styles.kicker}>Internal context</p><h2>Notes</h2></div></div>
              <textarea className={styles.notes} rows={10} value={form.notes} onChange={(event) => update("notes", event.target.value)} placeholder="Meeting context, objections, pricing discussion, preferences, follow-up details…" />
            </article>
          </div>

          <aside className={styles.secondaryColumn}>
            <article className={styles.card}>
              <div className={styles.cardHeading}><div><p className={styles.kicker}>Meeting</p><h2>Conversation → call</h2></div></div>
              <label><span>Date & time</span><input type="datetime-local" value={form.meetingAt} onChange={(event) => update("meetingAt", event.target.value)} /></label>
              <label><span>Location</span><input value={form.meetingLocation} onChange={(event) => update("meetingLocation", event.target.value)} placeholder="Teams / Zoom / office" /></label>
              <label><span>Meeting URL</span><input value={form.meetingUrl} onChange={(event) => update("meetingUrl", event.target.value)} placeholder="https://…" /></label>
              <label><span>Meeting notes</span><textarea rows={4} value={form.meetingNotes} onChange={(event) => update("meetingNotes", event.target.value)} /></label>
            </article>

            <article className={styles.card}>
              <div className={styles.cardHeading}><div><p className={styles.kicker}>Proposal</p><h2>Commercial offer</h2></div></div>
              <label><span>Status</span><select value={form.proposalStatus} onChange={(event) => update("proposalStatus", event.target.value)}>{proposalStatuses.map(([value,text]) => <option key={value} value={value}>{text}</option>)}</select></label>
              <div className={styles.inlineFields}>
                <label><span>Amount</span><input inputMode="decimal" value={form.proposalAmount} onChange={(event) => update("proposalAmount", event.target.value)} placeholder="2500" /></label>
                <label><span>Currency</span><input value={form.proposalCurrency} onChange={(event) => update("proposalCurrency", event.target.value.toUpperCase())} maxLength={3} /></label>
              </div>
              <label><span>Sent at</span><input type="datetime-local" value={form.proposalSentAt} onChange={(event) => update("proposalSentAt", event.target.value)} /></label>
            </article>

            <article className={styles.card}>
              <div className={styles.cardHeading}><div><p className={styles.kicker}>Payment</p><h2>Deposit & close</h2></div></div>
              <label><span>Status</span><select value={form.paymentStatus} onChange={(event) => update("paymentStatus", event.target.value)}>{paymentStatuses.map(([value,text]) => <option key={value} value={value}>{text}</option>)}</select></label>
              <div className={styles.inlineFields}>
                <label><span>Deposit %</span><input inputMode="decimal" value={form.depositPercent} onChange={(event) => update("depositPercent", event.target.value)} /></label>
                <label><span>Deposit amount</span><input inputMode="decimal" value={form.depositAmount} onChange={(event) => update("depositAmount", event.target.value)} /></label>
              </div>
              <label><span>Deposit received</span><input type="datetime-local" value={form.depositReceivedAt} onChange={(event) => update("depositReceivedAt", event.target.value)} /></label>
              <Link className={styles.payLink} href="/pay" target="_blank">Open LabNarrative payment page ↗</Link>
            </article>

            <article className={styles.card}>
              <div className={styles.cardHeading}><div><p className={styles.kicker}>History</p><h2>Recent pipeline events</h2></div></div>
              <div className={styles.events}>
                {data.events.slice(0, 12).map((event) => <div key={event.id}><strong>{label(event.event_type)}</strong><span>{event.message || event.step || "Pipeline event"}</span><time>{formatDate(event.created_at)}</time></div>)}
                {data.events.length === 0 ? <p className={styles.empty}>No pipeline events recorded.</p> : null}
              </div>
            </article>
          </aside>
        </section>

        <footer className={styles.saveDock}>
          <div><strong>{prospect.pi_name}</strong><span>Stage: {label(form.stage)} · Workspace updated {formatDate(data.workspace.updated_at)}</span></div>
          <button type="button" onClick={() => void save()} disabled={saving}>{saving ? "Saving…" : "Save workspace"}</button>
        </footer>
      </div>
    </main>
  );
}
