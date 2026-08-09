"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { browserSupabase as supabase } from "@/lib/supabase-browser";
import styles from "./sales-reply-assistant.module.css";

type Prospect = {
  id: string;
  pi_name: string;
  institution: string;
  department?: string | null;
  email?: string | null;
  research_area?: string | null;
  qualification_score?: number | null;
};

type SiteContent = {
  piName?: string;
  labName?: string;
  headline?: string;
  introduction?: string;
  focusAreas?: string[];
};

type Site = {
  id: string;
  slug: string;
  outreach_status: string;
  domain_url?: string | null;
  content?: SiteContent | null;
};

type Workspace = {
  stage: string;
  notes: string;
  next_action: string;
  next_action_due_at?: string | null;
  meeting_at?: string | null;
  meeting_location?: string;
  meeting_url?: string;
  meeting_notes?: string;
  proposal_status?: string;
  proposal_amount?: number | null;
  proposal_currency?: string;
  payment_status?: string;
  deposit_percent?: number;
  reply_draft_subject?: string;
  reply_draft_body?: string;
  reply_draft_updated_at?: string | null;
};

type Message = {
  id: string;
  subject: string;
  body_text: string;
  sender_email: string;
  recipient_email: string;
  message_kind: string;
  sent_at?: string | null;
  created_at: string;
};

type Reply = {
  id: string;
  subject: string;
  body_text: string;
  from_email: string;
  to_email: string;
  received_at: string;
  reply_kind: string;
};

type Analytics = {
  visits?: number | string;
  page_views?: number | string;
  cta_clicks?: number | string;
  last_viewed_at?: string | null;
};

type LeadData = {
  prospect: Prospect;
  site: Site | null;
  workspace: Workspace;
  messages: Message[];
  replies: Reply[];
  analytics: Analytics | null;
};

function clip(value: string | null | undefined, max = 5000) {
  const text = (value || "").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n[truncated]`;
}

function dateLabel(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
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

function replySubject(value: string) {
  const subject = value.trim();
  if (!subject) return "";
  return /^re:/i.test(subject) ? subject : `Re: ${subject}`;
}

function parseDraft(value: string) {
  const text = value.trim();
  if (!text) return { subject: "", body: "" };

  const subjectMatch = text.match(/^\s*Subject\s*:\s*(.+)$/im);
  const bodyMatch = text.match(/(?:^|\n)\s*Body\s*:\s*\n?([\s\S]*)$/i);

  if (subjectMatch) {
    const subject = subjectMatch[1].trim();
    if (bodyMatch) return { subject, body: bodyMatch[1].trim() };
    const withoutSubject = text.replace(subjectMatch[0], "").trim();
    return { subject, body: withoutSubject };
  }

  return { subject: "", body: text };
}

function buildBrief(data: LeadData, websiteUrl: string) {
  const { prospect, site, workspace, analytics } = data;
  const humanReplies = data.replies.filter((reply) => reply.reply_kind === "human");
  const automaticReplies = data.replies.filter((reply) => reply.reply_kind === "automatic");

  const thread = [
    ...data.messages.map((message) => ({
      at: message.sent_at || message.created_at,
      direction: "OUTGOING",
      kind: message.message_kind,
      email: message.recipient_email,
      subject: message.subject,
      body: message.body_text,
    })),
    ...humanReplies.map((reply) => ({
      at: reply.received_at,
      direction: "INCOMING HUMAN REPLY",
      kind: "human reply",
      email: reply.from_email,
      subject: reply.subject,
      body: reply.body_text,
    })),
  ].sort((a, b) => Date.parse(a.at || "") - Date.parse(b.at || ""));

  const threadText = thread.length
    ? thread.map((item, index) => [
        `--- Message ${index + 1} · ${item.direction} · ${dateLabel(item.at)} ---`,
        `Email: ${item.email || "—"}`,
        `Subject: ${item.subject || "—"}`,
        clip(item.body, 6000) || "[No plain-text body stored]",
      ].join("\n")).join("\n\n")
    : "No email thread is linked yet.";

  const focusAreas = Array.isArray(site?.content?.focusAreas) ? site?.content?.focusAreas?.join(", ") : "";

  return `Draft the next reply email for me. Do not send anything. Use only the information below and do not invent facts, prices, availability, meeting times, promises, or scientific claims that are not supported by the context.\n\nSENDER\nName: Khaled Azzahrani, Ph.D.\nRole: Molecular oncology researcher; Founder, LabNarrative\nEmail: khaled@labnarrative.com\nBusiness: LabNarrative creates researched, written and designed laboratory websites for scientists.\n\nRECIPIENT / LEAD\nPI: ${prospect.pi_name}\nInstitution: ${prospect.institution || "—"}\nDepartment: ${prospect.department || "—"}\nEmail: ${prospect.email || "—"}\nResearch area: ${prospect.research_area || "—"}\nQualification score: ${prospect.qualification_score ?? "—"}\nCurrent sales stage: ${workspace.stage || "contacted"}\n\nLABNARRATIVE WEBSITE CONCEPT\nURL: ${websiteUrl || "—"}\nLab name: ${site?.content?.labName || "—"}\nHeadline: ${site?.content?.headline || "—"}\nIntroduction: ${clip(site?.content?.introduction, 1200) || "—"}\nFocus areas: ${focusAreas || "—"}\nWebsite visits: ${Number(analytics?.visits ?? 0)}\nPage views: ${Number(analytics?.page_views ?? 0)}\nCTA clicks: ${Number(analytics?.cta_clicks ?? 0)}\nLast website visit: ${dateLabel(analytics?.last_viewed_at)}\n\nSALES CONTEXT\nInternal notes: ${clip(workspace.notes, 2500) || "—"}\nNext action: ${workspace.next_action || "—"}\nNext action due: ${dateLabel(workspace.next_action_due_at)}\nMeeting date/time already recorded: ${dateLabel(workspace.meeting_at)}\nMeeting location already recorded: ${workspace.meeting_location || "—"}\nMeeting URL already recorded: ${workspace.meeting_url || "—"}\nMeeting notes: ${clip(workspace.meeting_notes, 1200) || "—"}\nProposal status: ${workspace.proposal_status || "not_started"}\nProposal amount: ${workspace.proposal_amount == null ? "—" : `${workspace.proposal_amount} ${workspace.proposal_currency || "USD"}`}\nPayment status: ${workspace.payment_status || "not_requested"}\nAutomatic replies received: ${automaticReplies.length} (do not respond to automatic replies)\n\nEMAIL THREAD\n${threadText}\n\nWRITING INSTRUCTIONS\n- Reply to the latest human message, if one exists. If there is no human reply, draft a useful manual follow-up only if the context clearly calls for one.\n- Keep the tone professional, warm, natural and concise. Avoid salesy language, exaggerated praise and generic filler.\n- Preserve continuity with the existing thread.\n- If the PI asks a direct question, answer it first.\n- If the PI suggests a meeting and a meeting time is already recorded above, acknowledge that exact time. If no time is recorded, do not invent one.\n- Do not claim the PI has viewed the website merely because analytics show visits. Never mention tracking or analytics to the PI.\n- Do not mention internal sales stages, notes, scores, payment tracking or automation.\n- Do not automatically offer discounts.\n- Sign simply as Khaled unless the existing thread clearly calls for the full signature.\n- Aim for roughly 70–170 words unless the PI's message genuinely requires more.\n\nReturn exactly this format and nothing else:\nSubject: <email subject>\nBody:\n<email body>`;
}

export default function SalesReplyAssistant({ prospectId }: { prospectId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<LeadData | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!prospectId) return;
    setLoading(true);
    setError("");
    const { data: result, error: rpcError } = await supabase.rpc("sales_lead_workspace_get", { p_prospect_id: prospectId });
    if (rpcError) {
      setError(rpcError.message);
      setLoading(false);
      return;
    }
    const next = result as LeadData;
    setData(next);
    const savedSubject = next.workspace.reply_draft_subject || "";
    const savedBody = next.workspace.reply_draft_body || "";
    const latestHuman = [...next.replies].reverse().find((reply) => reply.reply_kind === "human");
    const latestOutgoing = [...next.messages].reverse().find((message) => message.subject);
    setSubject(savedSubject || replySubject(latestHuman?.subject || latestOutgoing?.subject || ""));
    setBody(savedBody);
    setLoading(false);
  }, [prospectId]);

  useEffect(() => { void load(); }, [load]);

  const websiteUrl = useMemo(() => {
    if (!data?.site) return "";
    return data.site.domain_url || (data.site.slug ? `https://${data.site.slug}.labnarrative.com` : "");
  }, [data]);

  const brief = useMemo(() => data ? buildBrief(data, websiteUrl) : "", [data, websiteUrl]);
  const humanReplyCount = useMemo(() => data?.replies.filter((reply) => reply.reply_kind === "human").length ?? 0, [data]);

  async function copyText(value: string, message: string) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice(message);
      setError("");
    } catch {
      setError("Clipboard access was blocked by the browser. Select and copy the text manually.");
    }
  }

  async function copyBrief(openChatGPT = false) {
    if (!brief) return;
    await copyText(brief, "ChatGPT brief copied.");
    if (openChatGPT) window.open("https://chatgpt.com/", "_blank", "noopener,noreferrer");
  }

  async function pasteDraft() {
    try {
      const value = await navigator.clipboard.readText();
      const parsed = parseDraft(value);
      if (parsed.subject) setSubject(parsed.subject);
      if (parsed.body) setBody(parsed.body);
      setNotice("Draft pasted from clipboard. Review it before saving.");
      setError("");
    } catch {
      setError("The browser did not allow reading the clipboard. Paste the ChatGPT draft directly into the fields below.");
    }
  }

  async function saveDraft() {
    setSaving(true);
    setError("");
    setNotice("");
    const { data: result, error: rpcError } = await supabase.rpc("sales_lead_reply_draft_save", {
      p_prospect_id: prospectId,
      p_subject: subject,
      p_body: body,
    });
    if (rpcError) {
      setError(rpcError.message);
      setSaving(false);
      return;
    }
    const workspace = result as Workspace;
    setSubject(workspace.reply_draft_subject || "");
    setBody(workspace.reply_draft_body || "");
    setNotice("Reply draft saved. Nothing was sent.");
    setSaving(false);
  }

  async function copyReply() {
    const output = `${subject.trim() ? `Subject: ${subject.trim()}\n\n` : ""}${body.trim()}`.trim();
    if (!output) return;
    await copyText(output, "Reply copied. Nothing was sent.");
  }

  return (
    <>
      <button type="button" className={styles.launcher} onClick={() => setOpen(true)}>
        <span>ChatGPT</span>
        <strong>Reply Assistant</strong>
        {humanReplyCount > 0 ? <b>{humanReplyCount}</b> : null}
      </button>

      {open ? (
        <div className={styles.backdrop} onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
          <aside className={styles.drawer} aria-label="ChatGPT reply assistant">
            <header className={styles.header}>
              <div>
                <p>ChatGPT-native sales help</p>
                <h2>Reply Assistant</h2>
                <span>{data?.prospect.pi_name || "Lead"} · nothing sends automatically</span>
              </div>
              <button type="button" onClick={() => setOpen(false)}>Close</button>
            </header>

            {loading ? <div className={styles.state}>Loading the lead context…</div> : null}
            {notice ? <p className={styles.notice}>{notice}</p> : null}
            {error ? <p className={styles.error}>{error}</p> : null}

            {!loading && data ? (
              <div className={styles.body}>
                <section className={styles.contextCard}>
                  <div><span>Lead</span><strong>{data.prospect.pi_name}</strong></div>
                  <div><span>Stage</span><strong>{data.workspace.stage.replaceAll("_", " ")}</strong></div>
                  <div><span>Human replies</span><strong>{humanReplyCount}</strong></div>
                  <div><span>Website</span><strong>{websiteUrl ? "Available" : "—"}</strong></div>
                </section>

                <section className={styles.workflow}>
                  <div className={styles.step}>
                    <span>1</span>
                    <div><strong>Send context to ChatGPT</strong><p>The copied brief contains the real thread, PI/site context and your current sales notes.</p></div>
                  </div>
                  <div className={styles.buttonRow}>
                    <button type="button" className={styles.primary} onClick={() => void copyBrief(false)}>Copy ChatGPT brief</button>
                    <button type="button" onClick={() => void copyBrief(true)}>Copy + open ChatGPT</button>
                  </div>

                  <div className={styles.step}>
                    <span>2</span>
                    <div><strong>Bring the draft back</strong><p>Paste the ChatGPT response here, then edit freely before saving.</p></div>
                  </div>
                  <button type="button" className={styles.pasteButton} onClick={() => void pasteDraft()}>Paste ChatGPT draft from clipboard</button>
                </section>

                <section className={styles.draftCard}>
                  <label>
                    <span>Subject</span>
                    <input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Reply subject" />
                  </label>
                  <label>
                    <span>Body</span>
                    <textarea rows={14} value={body} onChange={(event) => setBody(event.target.value)} placeholder="Paste or write the reply here…" />
                  </label>
                  <div className={styles.draftMeta}>
                    <span>{data.workspace.reply_draft_updated_at ? `Last saved ${dateLabel(data.workspace.reply_draft_updated_at)}` : "Not saved yet"}</span>
                    <span>{body.trim() ? `${body.trim().split(/\s+/).length} words` : "0 words"}</span>
                  </div>
                  <div className={styles.buttonRow}>
                    <button type="button" className={styles.primary} onClick={() => void saveDraft()} disabled={saving}>{saving ? "Saving…" : "Save reply draft"}</button>
                    <button type="button" onClick={() => void copyReply()} disabled={!subject.trim() && !body.trim()}>Copy reply</button>
                    <button type="button" onClick={() => { setSubject(""); setBody(""); setNotice("Draft cleared locally. Save if you want to clear the stored draft too."); }}>Clear</button>
                  </div>
                </section>

                <p className={styles.guardrail}>LabNarrative does not send from this assistant. Saving stores an internal working draft only; sending remains a separate human action.</p>
              </div>
            ) : null}
          </aside>
        </div>
      ) : null}
    </>
  );
}
