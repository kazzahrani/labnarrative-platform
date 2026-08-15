"use client";

import { createClient, type Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import styles from "./systems-email-batch.module.css";

type Prospect = {
  id: string;
  company_name: string;
  country: string | null;
  city: string | null;
  fit_score: number;
  status: string;
  email_subject: string | null;
  email_body: string | null;
  email_draft_approved_at: string | null;
  email_recipient_contact_id: string | null;
  email_sent_at: string | null;
  manual_email_recipient_email: string | null;
  manual_email_recipient_name: string | null;
};

type Contact = {
  id: string;
  prospect_id: string;
  name: string;
  title: string;
  email: string | null;
  priority: number;
  is_current_verified: boolean;
};

type QueueItem = { prospect: Prospect; contacts: Contact[]; knownEmails: Contact[] };

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);
const eligibleStatuses = new Set(["ready_to_send", "contacted", "connected"]);

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export default function SystemsEmailBatchLauncher() {
  const pathname = usePathname();
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [recipientId, setRecipientId] = useState("");
  const [manualEmail, setManualEmail] = useState("");
  const [manualName, setManualName] = useState("");
  const [copyToKsu, setCopyToKsu] = useState(false);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState("");

  const load = useCallback(async (activeSession: Session) => {
    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", activeSession.user.id)
      .maybeSingle();

    if (roleRow?.role !== "admin") {
      setIsAdmin(false);
      return;
    }

    setIsAdmin(true);
    const [p, c] = await Promise.all([
      supabase
        .from("systems_outreach_prospects")
        .select("id,company_name,country,city,fit_score,status,email_subject,email_body,email_draft_approved_at,email_recipient_contact_id,email_sent_at,manual_email_recipient_email,manual_email_recipient_name")
        .order("fit_score", { ascending: false })
        .order("company_name", { ascending: true }),
      supabase
        .from("systems_outreach_contacts")
        .select("id,prospect_id,name,title,email,priority,is_current_verified")
        .order("priority", { ascending: true }),
    ]);

    if (!p.error) setProspects((p.data ?? []) as Prospect[]);
    if (!c.error) setContacts((c.data ?? []) as Contact[]);
  }, []);

  useEffect(() => {
    if (pathname !== "/admin/systems-outreach") return;
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
      }
    });
    return () => subscription.unsubscribe();
  }, [pathname, load]);

  const queue = useMemo<QueueItem[]>(() => {
    return prospects.flatMap((prospect) => {
      if (!eligibleStatuses.has(prospect.status) || prospect.email_sent_at) return [];
      if (!prospect.email_subject?.trim() || !prospect.email_body?.trim()) return [];

      const knownEmails = contacts
        .filter(
          (contact) =>
            contact.prospect_id === prospect.id &&
            Boolean(contact.email) &&
            validEmail(contact.email ?? ""),
        )
        .sort((a, b) => a.priority - b.priority);

      const verified = knownEmails.filter((contact) => contact.is_current_verified);
      return [{ prospect, contacts: verified, knownEmails }];
    });
  }, [prospects, contacts]);

  const item = queue[index] ?? null;

  useEffect(() => {
    if (!open) return;
    if (queue.length && index >= queue.length) setIndex(0);
    if (!queue.length) setIndex(0);
  }, [open, queue.length, index]);

  useEffect(() => {
    if (!item) {
      setSubject("");
      setBody("");
      setRecipientId("");
      setManualEmail("");
      setManualName("");
      setCopyToKsu(false);
      return;
    }

    setSubject(item.prospect.email_subject ?? "");
    setBody(item.prospect.email_body ?? "");
    setManualEmail(item.prospect.manual_email_recipient_email ?? "");
    setManualName(item.prospect.manual_email_recipient_name ?? "");
    const preferred =
      (item.prospect.email_recipient_contact_id &&
        item.contacts.some((contact) => contact.id === item.prospect.email_recipient_contact_id)
        ? item.prospect.email_recipient_contact_id
        : item.contacts[0]?.id) ??
      (item.prospect.manual_email_recipient_email ? "manual" : "");
    setRecipientId(preferred || (item.contacts.length ? item.contacts[0].id : "manual"));
    setCopyToKsu(false);
    setNotice("");
  }, [item?.prospect.id]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (pathname !== "/admin/systems-outreach" || !session || !isAdmin) return null;

  const selectedContact = item?.contacts.find((contact) => contact.id === recipientId) ?? item?.contacts[0] ?? null;
  const usingManual = recipientId === "manual" || (!selectedContact && Boolean(manualEmail.trim()));
  const activeEmail = usingManual ? manualEmail.trim().toLowerCase() : selectedContact?.email?.trim().toLowerCase() ?? "";
  const activeName = usingManual
    ? manualName.trim() || item?.prospect.company_name || "Manual recipient"
    : selectedContact?.name ?? "";
  const draftDirty = Boolean(item) && ((item?.prospect.email_subject ?? "") !== subject || (item?.prospect.email_body ?? "") !== body);
  const manualDirty =
    Boolean(item) &&
    ((item?.prospect.manual_email_recipient_email ?? "") !== manualEmail.trim() ||
      (item?.prospect.manual_email_recipient_name ?? "") !== manualName.trim());
  const needsApproval = Boolean(item) && (!item?.prospect.email_draft_approved_at || draftDirty);
  const recipientReady = usingManual ? validEmail(activeEmail) : Boolean(selectedContact?.email);
  const canSend = Boolean(item && subject.trim() && body.trim() && recipientReady && !sending);

  const openBatch = () => {
    setIndex(0);
    setNotice("");
    setOpen(true);
  };

  const skipNext = () => {
    if (!queue.length) return;
    setNotice("");
    setIndex((current) => (current + 1) % queue.length);
  };

  const previous = () => {
    if (!queue.length) return;
    setNotice("");
    setIndex((current) => (current - 1 + queue.length) % queue.length);
  };

  const approveAndSend = async () => {
    if (!item || !session || !canSend) return;
    setSending(true);
    setNotice("");

    try {
      const now = new Date().toISOString();
      const patch: Record<string, unknown> = { updated_at: now };

      if (draftDirty) {
        patch.email_subject = subject.trim();
        patch.email_body = body.trim();
        patch.email_draft_approved_at = null;
        patch.email_draft_approved_by = null;
      }

      if (usingManual && manualDirty) {
        patch.manual_email_recipient_email = manualEmail.trim().toLowerCase();
        patch.manual_email_recipient_name = manualName.trim() || null;
        patch.manual_email_recipient_set_at = now;
        patch.manual_email_recipient_set_by = session.user.id;
      }

      if (draftDirty || (usingManual && manualDirty)) {
        const { error: updateError } = await supabase
          .from("systems_outreach_prospects")
          .update(patch)
          .eq("id", item.prospect.id);
        if (updateError) throw updateError;

        if (draftDirty) {
          await supabase.from("systems_outreach_events").insert({
            prospect_id: item.prospect.id,
            channel: "email",
            event_type: "email_draft_saved",
            status: "recorded",
            content: "Email draft edited inside All Email Outreach; approval was refreshed immediately before manual send.",
          });
        }

        if (usingManual && manualDirty) {
          await supabase.from("systems_outreach_events").insert({
            prospect_id: item.prospect.id,
            channel: "email",
            event_type: "manual_email_recipient_saved",
            status: "recorded",
            content: `Administrator manually entered outreach recipient ${manualName.trim() ? `${manualName.trim()} ` : ""}<${manualEmail.trim().toLowerCase()}> in All Email Outreach. This address was not populated by automated research.`,
          });
        }
      }

      if (needsApproval) {
        const { error: approvalError } = await supabase.rpc("approve_systems_outreach_email_draft", {
          p_prospect_id: item.prospect.id,
        });
        if (approvalError) throw approvalError;
      }

      const { data, error } = await supabase.functions.invoke("systems-send-outreach", {
        body: {
          prospectId: item.prospect.id,
          contactId: usingManual ? null : selectedContact?.id,
          useManualRecipient: usingManual,
          copyToKsu,
        },
      });
      if (error) throw error;

      const result = (data ?? {}) as {
        error?: string;
        recipient?: string;
        recipientName?: string;
        alreadySent?: boolean;
        copy?: { recipient?: string; status?: string; error?: string | null } | null;
      };
      if (result.error) throw new Error(result.error);

      const copyNote = result.copy
        ? result.copy.error
          ? ` KSU copy failed: ${result.copy.error}`
          : ` Separate KSU copy: ${result.copy.status ?? "sent"}.`
        : "";
      setNotice(
        `${result.alreadySent ? "Already sent" : "Sent"} to ${result.recipientName ?? activeName} <${result.recipient ?? activeEmail}>.${copyNote}`,
      );
      await load(session);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to send this email.");
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <button className={styles.launcher} onClick={openBatch}>
        <span>All Email Outreach</span>
        <strong>{queue.length}</strong>
      </button>

      {open ? (
        <div
          className={styles.backdrop}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <section className={styles.modal} role="dialog" aria-modal="true" aria-label="All Email Outreach">
            <header className={styles.header}>
              <div>
                <span className={styles.eyebrow}>Systems · human-approved batch workflow</span>
                <h2>All Email Outreach</h2>
                <p>Review the exact receiver and email address before every send.</p>
              </div>
              <button className={styles.close} onClick={() => setOpen(false)} aria-label="Close">×</button>
            </header>

            {item ? (
              <>
                <div className={styles.progressRow}>
                  <span>{index + 1} of {queue.length}</span>
                  <strong>{Math.round(((index + 1) / queue.length) * 100)}%</strong>
                </div>
                <div className={styles.progressTrack}>
                  <span style={{ width: `${((index + 1) / queue.length) * 100}%` }} />
                </div>

                <div className={styles.identity}>
                  <div>
                    <span className={styles.label}>Company</span>
                    <h3>{item.prospect.company_name}</h3>
                    <p>{[item.prospect.city, item.prospect.country].filter(Boolean).join(" · ")} · Fit {item.prospect.fit_score}/100</p>
                  </div>
                  <div className={styles.approvalState}>
                    <span>Draft</span>
                    <strong>{needsApproval ? (draftDirty ? "Edited · approval required" : "Ready for approval") : "Approved"}</strong>
                  </div>
                </div>

                <div className={styles.recipientCard}>
                  <div className={styles.recipientHead}>
                    <div>
                      <span className={styles.label}>Receiver</span>
                      <strong>{activeName || "No receiver selected"}</strong>
                      <small>{usingManual ? "Human-entered override · not research-verified" : selectedContact ? selectedContact.title : "Choose or enter a receiver below."}</small>
                    </div>
                    {item.contacts.length ? (
                      <select value={recipientId} onChange={(event) => setRecipientId(event.target.value)}>
                        {item.contacts.map((contact) => (
                          <option value={contact.id} key={contact.id}>{contact.name} · {contact.email}</option>
                        ))}
                        {item.prospect.manual_email_recipient_email ? (
                          <option value="manual">{item.prospect.manual_email_recipient_name || "Manual recipient"} · {item.prospect.manual_email_recipient_email}</option>
                        ) : null}
                      </select>
                    ) : null}
                  </div>

                  <div className={styles.manualGrid}>
                    <label>
                      <span>Email address</span>
                      <input value={activeEmail} readOnly placeholder="No receiver email selected" />
                    </label>
                    <label>
                      <span>Address status</span>
                      <input value={activeEmail ? (usingManual ? "Manual human-entered address" : "Verified public work email") : "Missing — enter manually below"} readOnly />
                    </label>
                  </div>

                  {item.knownEmails.length ? (
                    <div className={styles.editor}>
                      <label>
                        <span>Known email addresses for this company</span>
                        <select value={recipientId} onChange={(event) => {
                          const nextId = event.target.value;
                          const candidate = item.contacts.find((contact) => contact.id === nextId);
                          if (candidate) setRecipientId(candidate.id);
                        }}>
                          {item.knownEmails.map((contact) => (
                            <option value={contact.id} key={`known-${contact.id}`} disabled={!contact.is_current_verified}>
                              {contact.name} · {contact.email} · {contact.is_current_verified ? "verified / sendable" : "known / not verified for sending"}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  ) : null}

                  {item.contacts.length && !usingManual ? (
                    <button className={styles.manualToggle} onClick={() => setRecipientId("manual")}>Use a manual recipient instead</button>
                  ) : null}

                  {usingManual || !item.contacts.length ? (
                    <div className={styles.manualGrid}>
                      <label>
                        <span>Manual email</span>
                        <input type="email" value={manualEmail} onChange={(event) => { setManualEmail(event.target.value); setRecipientId("manual"); }} placeholder="recipient@company.com" />
                      </label>
                      <label>
                        <span>Name · optional</span>
                        <input value={manualName} onChange={(event) => setManualName(event.target.value)} placeholder="e.g. Ahmed Alqahtani or Sales Team" />
                      </label>
                      {item.contacts.length ? <button className={styles.backToVerified} onClick={() => setRecipientId(item.contacts[0].id)}>Use verified contact</button> : null}
                    </div>
                  ) : null}
                </div>

                <div className={styles.editor}>
                  <label>
                    <span>Subject</span>
                    <input value={subject} onChange={(event) => setSubject(event.target.value)} />
                  </label>
                  <label>
                    <span>Email message</span>
                    <textarea value={body} onChange={(event) => setBody(event.target.value)} rows={15} />
                  </label>
                </div>

                <label className={styles.copyToggle}>
                  <input type="checkbox" checked={copyToKsu} onChange={(event) => setCopyToKsu(event.target.checked)} />
                  <span>Send me a separate copy — kazzahrani@ksu.edu.sa</span>
                </label>

                {notice ? <div className={styles.notice}>{notice}</div> : null}

                <div className={styles.footer}>
                  <div className={styles.secondaryActions}>
                    <button onClick={previous} disabled={queue.length < 2}>← Previous</button>
                    <button onClick={skipNext} disabled={queue.length < 2}>Skip → Next</button>
                  </div>
                  <button className={styles.primaryAction} onClick={() => void approveAndSend()} disabled={!canSend}>
                    {sending ? "Sending…" : needsApproval || draftDirty || manualDirty ? "Approve & Send → Next" : "Send Email → Next"}
                  </button>
                </div>
                <p className={styles.humanGate}>Nothing is sent automatically. The receiver name and exact email address shown above are the destination for this send.</p>
              </>
            ) : (
              <div className={styles.complete}>
                <span>✓</span>
                <h3>Email queue is clear.</h3>
                <p>No prepared initial emails are waiting right now.</p>
                <button onClick={() => setOpen(false)}>Close</button>
              </div>
            )}
          </section>
        </div>
      ) : null}
    </>
  );
}
