"use client";

import { createClient, type Session } from "@supabase/supabase-js";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import styles from "./systems-simple-outreach-panel.module.css";

type Prospect = {
  id: string;
  company_name: string;
  slug: string;
  website_url: string | null;
  city: string | null;
  country: string | null;
  industry: string | null;
  fit_score: number;
  status: string;
  demo_status: string;
  linkedin_note: string | null;
  linkedin_recipient_contact_id: string | null;
  linkedin_connected_at: string | null;
  linkedin_followup_sent_at: string | null;
  linkedin_reply_at: string | null;
  email_subject: string | null;
  email_body: string | null;
  email_recipient_contact_id: string | null;
  email_recipient_email: string | null;
  email_draft_approved_at: string | null;
  email_sent_at: string | null;
  email_delivery_status: string | null;
  manual_email_recipient_email: string | null;
  manual_email_recipient_name: string | null;
  sequence_status: string | null;
};

type Contact = {
  id: string;
  prospect_id: string;
  name: string;
  title: string;
  linkedin_url: string | null;
  email: string | null;
  priority: number;
  is_current_verified: boolean;
  linkedin_note: string | null;
  linkedin_note_ar: string | null;
  linkedin_request_sent_at: string | null;
};

type MailMessage = {
  id: string;
  prospect_id: string;
  message_kind: "initial" | "followup_1" | "followup_2";
  sequence: number;
  status: string;
  delivery_status: string;
  scheduled_for: string | null;
  sent_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
  bounced_at: string | null;
};

const validPaths = new Set(["/admin/systems", "/admin/systems-outreach"]);
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
);

function label(value: string | null | undefined) {
  return String(value || "—").replaceAll("_", " ");
}

function dateLabel(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Riyadh",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

function deliveryLabel(message: MailMessage | null, prospect: Prospect) {
  if (message?.clicked_at) return "Clicked";
  if (message?.opened_at) return "Opened";
  if (message?.bounced_at) return "Bounced";
  if (message?.sent_at) return label(message.delivery_status || message.status || "Sent");
  if (prospect.email_sent_at) return label(prospect.email_delivery_status || "Sent");
  if (prospect.email_draft_approved_at) return "Approved";
  if (prospect.email_subject && prospect.email_body) return "Draft";
  return "Missing";
}

function statusTone(value: string) {
  const normalized = value.toLowerCase();
  if (/sent|delivered|opened|clicked|approved|connected|replied|interested|won/.test(normalized)) return styles.good;
  if (/draft|ready|pending|scheduled/.test(normalized)) return styles.warn;
  if (/bounced|failed|blocked|not fit/.test(normalized)) return styles.bad;
  return styles.neutral;
}

function findLegacyAside() {
  return Array.from(document.querySelectorAll<HTMLElement>("main aside")).find((aside) => {
    const text = aside.textContent || "";
    return text.includes("Messages & status") || text.includes("Change sales stage") || text.includes("Select a company to review it");
  }) ?? null;
}

function clickLegacyAction(action: "LinkedIn" | "Email" | "Contacts" | "Research" | "Pipeline") {
  const aside = findLegacyAside();
  if (!aside) return false;
  const button = Array.from(aside.querySelectorAll<HTMLButtonElement>("button")).find((candidate) => {
    const firstLabel = candidate.querySelector("span")?.textContent?.trim();
    return firstLabel === action;
  });
  button?.click();
  return Boolean(button);
}

export default function SystemsSimpleOutreachPanel() {
  const pathname = usePathname();
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [messages, setMessages] = useState<MailMessage[]>([]);
  const [selectedCompany, setSelectedCompany] = useState("");
  const [mount, setMount] = useState<HTMLElement | null>(null);
  const [busyContact, setBusyContact] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  const load = useCallback(async (activeSession: Session) => {
    const { data: role } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", activeSession.user.id)
      .maybeSingle();

    if (role?.role !== "admin") {
      setIsAdmin(false);
      return;
    }

    setIsAdmin(true);
    const [prospectResult, contactResult, messageResult] = await Promise.all([
      supabase
        .from("systems_outreach_prospects")
        .select("id,company_name,slug,website_url,city,country,industry,fit_score,status,demo_status,linkedin_note,linkedin_recipient_contact_id,linkedin_connected_at,linkedin_followup_sent_at,linkedin_reply_at,email_subject,email_body,email_recipient_contact_id,email_recipient_email,email_draft_approved_at,email_sent_at,email_delivery_status,manual_email_recipient_email,manual_email_recipient_name,sequence_status")
        .order("fit_score", { ascending: false }),
      supabase
        .from("systems_outreach_contacts")
        .select("id,prospect_id,name,title,linkedin_url,email,priority,is_current_verified,linkedin_note,linkedin_note_ar,linkedin_request_sent_at")
        .order("priority", { ascending: true }),
      supabase
        .from("systems_outreach_messages")
        .select("id,prospect_id,message_kind,sequence,status,delivery_status,scheduled_for,sent_at,opened_at,clicked_at,bounced_at")
        .order("sequence", { ascending: true }),
    ]);

    if (!prospectResult.error) setProspects((prospectResult.data ?? []) as Prospect[]);
    if (!contactResult.error) setContacts((contactResult.data ?? []) as Contact[]);
    if (!messageResult.error) setMessages((messageResult.data ?? []) as MailMessage[]);
  }, []);

  useEffect(() => {
    if (!validPaths.has(pathname)) return;

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) void load(data.session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (next) void load(next);
      else {
        setIsAdmin(false);
        setProspects([]);
        setContacts([]);
        setMessages([]);
      }
    });

    return () => subscription.unsubscribe();
  }, [pathname, load]);

  useEffect(() => {
    if (!session || !isAdmin || !validPaths.has(pathname)) return;
    const timer = window.setInterval(() => void load(session), 8000);
    return () => window.clearInterval(timer);
  }, [session, isAdmin, pathname, load]);

  useEffect(() => {
    if (!session || !isAdmin || !validPaths.has(pathname)) return;

    let observer: MutationObserver | null = null;

    const attach = () => {
      const aside = findLegacyAside();
      if (!aside) return;

      const original = Array.from(aside.children).find((child) => !(child as HTMLElement).dataset.systemsSimpleOutreachHost) as HTMLElement | undefined;
      const heading = original?.querySelector("h2")?.textContent?.trim() || "";
      if (heading && heading !== "Prospect queue") setSelectedCompany(heading);

      if (original) {
        original.dataset.systemsOriginalDetail = "true";
        original.style.display = "none";
      }

      let host = aside.querySelector<HTMLElement>('[data-systems-simple-outreach-host="true"]');
      if (!host) {
        host = document.createElement("div");
        host.dataset.systemsSimpleOutreachHost = "true";
        aside.appendChild(host);
      }
      setMount((current) => current === host ? current : host);
      aside.parentElement?.setAttribute("data-systems-simple-outreach-grid", "true");
    };

    attach();
    observer = new MutationObserver(attach);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer?.disconnect();
      document.querySelectorAll<HTMLElement>('[data-systems-original-detail="true"]').forEach((node) => {
        node.style.removeProperty("display");
        delete node.dataset.systemsOriginalDetail;
      });
      document.querySelectorAll<HTMLElement>('[data-systems-simple-outreach-host="true"]').forEach((node) => node.remove());
      document.querySelectorAll<HTMLElement>('[data-systems-simple-outreach-grid="true"]').forEach((node) => node.removeAttribute("data-systems-simple-outreach-grid"));
      setMount(null);
    };
  }, [session, isAdmin, pathname]);

  const selected = useMemo(
    () => prospects.find((prospect) => prospect.company_name === selectedCompany) ?? null,
    [prospects, selectedCompany],
  );

  const selectedContacts = useMemo(
    () => selected ? contacts.filter((contact) => contact.prospect_id === selected.id).sort((a, b) => a.priority - b.priority) : [],
    [selected, contacts],
  );

  const linkedinContacts = useMemo(
    () => selectedContacts.filter((contact) => Boolean(contact.linkedin_url)),
    [selectedContacts],
  );

  const selectedMessages = useMemo(
    () => selected ? messages.filter((message) => message.prospect_id === selected.id).sort((a, b) => a.sequence - b.sequence) : [],
    [selected, messages],
  );

  if (!mount || !session || !isAdmin || !selected) return null;

  const initialMessage = selectedMessages.find((message) => message.message_kind === "initial") ?? null;
  const scheduledFollowups = selectedMessages.filter((message) => message.message_kind !== "initial" && ["scheduled", "claimed"].includes(message.status));
  const nextFollowup = scheduledFollowups
    .filter((message) => Boolean(message.scheduled_for))
    .sort((a, b) => new Date(a.scheduled_for || 0).getTime() - new Date(b.scheduled_for || 0).getTime())[0] ?? null;

  const noteFor = (contact: Contact) => contact.linkedin_note || (contact.id === selected.linkedin_recipient_contact_id ? selected.linkedin_note : null) || "";
  const linkedinReady = linkedinContacts.filter((contact) => Boolean(noteFor(contact))).length;
  const linkedinSent = linkedinContacts.filter((contact) => Boolean(contact.linkedin_request_sent_at)).length;
  const emailReady = Boolean(selected.email_subject && selected.email_body) ? 1 : 0;
  const emailSent = Boolean(initialMessage?.sent_at || selected.email_sent_at) ? 1 : 0;
  const outreachTotal = linkedinContacts.length + 1;
  const outreachReady = linkedinReady + emailReady;
  const outreachSent = linkedinSent + emailSent;

  const verifiedEmailContact = selectedContacts.find((contact) => contact.id === selected.email_recipient_contact_id)
    ?? selectedContacts.find((contact) => Boolean(contact.email) && contact.is_current_verified)
    ?? null;
  const recipientEmail = selected.manual_email_recipient_email || selected.email_recipient_email || verifiedEmailContact?.email || "No receiver email yet";
  const recipientName = selected.manual_email_recipient_name || verifiedEmailContact?.name || "Email recipient";
  const emailStatus = deliveryLabel(initialMessage, selected);

  const contactStatus = (contact: Contact) => {
    const isPrimary = contact.id === selected.linkedin_recipient_contact_id;
    if (isPrimary && selected.linkedin_reply_at) return "Replied";
    if (isPrimary && selected.linkedin_followup_sent_at) return "Follow-up sent";
    if (isPrimary && selected.linkedin_connected_at) return "Connected";
    if (contact.linkedin_request_sent_at) return "Sent";
    if (noteFor(contact)) return "Ready";
    return "Draft";
  };

  const copyText = async (text: string, message: string) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setNotice(message);
    } catch {
      setNotice("Copy failed.");
    }
  };

  const markLinkedinSent = async (contact: Contact) => {
    if (!session || busyContact || contact.linkedin_request_sent_at) {
      if (contact.linkedin_request_sent_at) clickLegacyAction("LinkedIn");
      return;
    }

    setBusyContact(contact.id);
    setNotice("");
    const now = new Date().toISOString();

    const { error: contactError } = await supabase
      .from("systems_outreach_contacts")
      .update({
        linkedin_request_sent_at: now,
        linkedin_request_sent_by: session.user.id,
        updated_at: now,
      })
      .eq("id", contact.id)
      .eq("prospect_id", selected.id);

    if (contactError) {
      setNotice(contactError.message);
      setBusyContact(null);
      return;
    }

    const prospectPatch: Record<string, unknown> = { updated_at: now };
    if (selected.status === "ready_to_send") {
      prospectPatch.status = "contacted";
      prospectPatch.contacted_at = now;
    }

    await supabase.from("systems_outreach_prospects").update(prospectPatch).eq("id", selected.id);
    await supabase.from("systems_outreach_events").insert({
      prospect_id: selected.id,
      channel: "linkedin",
      event_type: "linkedin_connection_request_sent",
      status: "recorded",
      content: `Administrator confirmed the LinkedIn connection request was manually sent to ${contact.name} (${contact.title}).`,
    });

    setNotice(`${contact.name} marked as sent.`);
    await load(session);
    setBusyContact(null);
  };

  const companySubtitle = [selected.industry, selected.city, selected.country, `Fit ${selected.fit_score}/100`].filter(Boolean).join(" · ");
  const stage = label(selected.status);

  return createPortal(
    <div className={styles.panel}>
      <div className={styles.head}>
        <div className={styles.identity}>
          <h2>{selected.company_name}</h2>
          <p>{companySubtitle}</p>
        </div>
        <div className={styles.headActions}>
          <button className={`${styles.stage} ${statusTone(stage)}`} type="button" onClick={() => clickLegacyAction("Pipeline")} title="Open Pipeline">
            <span />{stage}
          </button>
          {selected.website_url ? <a className={styles.secondaryButton} href={selected.website_url} target="_blank" rel="noreferrer">Website ↗</a> : null}
          {selected.demo_status === "ready" ? <a className={styles.secondaryButton} href={`/systems/demos/${selected.slug}`} target="_blank" rel="noreferrer">Demo ↗</a> : null}
        </div>
      </div>

      <div className={styles.stats}>
        <div><span>Outreach ready</span><strong>{outreachReady}/{outreachTotal}</strong></div>
        <div><span>Sent</span><strong>{outreachSent}/{outreachTotal}</strong></div>
        <div><span>LinkedIn</span><strong>{linkedinSent}/{linkedinContacts.length || 0}</strong></div>
        <div><span>Active follow-ups</span><strong>{scheduledFollowups.length}</strong></div>
        <div><span>Next follow-up</span><strong className={styles.dateValue}>{dateLabel(nextFollowup?.scheduled_for)}</strong></div>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr><th>Contact</th><th>Channel</th><th>Status</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {linkedinContacts.map((contact) => {
              const currentStatus = contactStatus(contact);
              const note = noteFor(contact);
              return (
                <tr key={contact.id}>
                  <td><strong>{contact.name}</strong><small>{contact.title}</small></td>
                  <td>LinkedIn</td>
                  <td><span className={`${styles.rowStatus} ${statusTone(currentStatus)}`}><span />{currentStatus}</span></td>
                  <td>
                    <div className={styles.rowActions}>
                      <button type="button" onClick={() => void copyText(note, `${contact.name}'s LinkedIn note copied.`)} disabled={!note}>Copy</button>
                      {contact.linkedin_url ? <a href={contact.linkedin_url} target="_blank" rel="noreferrer">Open LinkedIn</a> : null}
                      <button
                        className={contact.linkedin_request_sent_at ? styles.sentButton : styles.primaryButton}
                        type="button"
                        onClick={() => void markLinkedinSent(contact)}
                        disabled={busyContact === contact.id}
                        title={contact.linkedin_request_sent_at ? "Open LinkedIn status workflow" : "Record this manual LinkedIn request as sent"}
                      >
                        {busyContact === contact.id ? "Saving…" : contact.linkedin_request_sent_at ? "✓ Sent" : "Mark Sent"}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            <tr>
              <td><strong>{recipientName}</strong><small>{recipientEmail}</small></td>
              <td>Email</td>
              <td><span className={`${styles.rowStatus} ${statusTone(emailStatus)}`}><span />{emailStatus}</span></td>
              <td>
                <div className={styles.rowActions}>
                  <button type="button" onClick={() => void copyText(`${selected.email_subject || ""}\n\n${selected.email_body || ""}`.trim(), "Email copied.")} disabled={!selected.email_subject && !selected.email_body}>Copy</button>
                  <button type="button" onClick={() => clickLegacyAction("Email")}>Open Email</button>
                  <button className={emailSent ? styles.sentButton : styles.primaryButton} type="button" onClick={() => clickLegacyAction("Email")}>{emailSent ? "✓ Sent" : "Review & Send"}</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {notice ? <div className={styles.notice}>{notice}</div> : null}

      <div className={styles.footer}>
        <div>
          <strong>Company tools</strong>
          <span>Open details only when you need them.</span>
        </div>
        <div className={styles.footerActions}>
          <button type="button" onClick={() => clickLegacyAction("LinkedIn")}>LinkedIn details</button>
          <button type="button" onClick={() => clickLegacyAction("Contacts")}>Contacts</button>
          <button type="button" onClick={() => clickLegacyAction("Research")}>Research</button>
          <button type="button" onClick={() => clickLegacyAction("Pipeline")}>Pipeline</button>
        </div>
      </div>
    </div>,
    mount,
  );
}
