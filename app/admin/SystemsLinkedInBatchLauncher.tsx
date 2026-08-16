"use client";

import { createClient, type Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import styles from "./systems-linkedin-batch.module.css";

type Prospect = {
  id: string;
  company_name: string;
  country: string | null;
  city: string | null;
  fit_score: number;
  status: string;
  linkedin_note: string | null;
  linkedin_note_ar: string | null;
  linkedin_recipient_contact_id: string | null;
  linkedin_request_sent_at: string | null;
  linkedin_connected_at: string | null;
  linkedin_followup_sent_at: string | null;
  linkedin_reply_at: string | null;
};

type Contact = {
  id: string;
  prospect_id: string;
  name: string;
  title: string;
  linkedin_url: string | null;
  priority: number;
  linkedin_note: string | null;
  linkedin_note_ar: string | null;
  linkedin_request_sent_at: string | null;
};

type CompanyQueueItem = {
  prospect: Prospect;
  contacts: Contact[];
  pendingCount: number;
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
);
const eligibleStatuses = new Set(["ready_to_send", "contacted"]);

export default function SystemsLinkedInBatchLauncher() {
  const pathname = usePathname();
  const isSystemsRoute = pathname === "/admin/systems" || pathname === "/admin/systems/acquire" || pathname === "/admin/systems-outreach";
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [recordingContacts, setRecordingContacts] = useState<Set<string>>(() => new Set());
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
        .select("id,company_name,country,city,fit_score,status,linkedin_note,linkedin_note_ar,linkedin_recipient_contact_id,linkedin_request_sent_at,linkedin_connected_at,linkedin_followup_sent_at,linkedin_reply_at")
        .order("fit_score", { ascending: false })
        .order("company_name", { ascending: true }),
      supabase
        .from("systems_outreach_contacts")
        .select("id,prospect_id,name,title,linkedin_url,priority,linkedin_note,linkedin_note_ar,linkedin_request_sent_at")
        .order("priority", { ascending: true }),
    ]);

    if (!p.error) setProspects((p.data ?? []) as Prospect[]);
    if (!c.error) setContacts((c.data ?? []) as Contact[]);
  }, []);

  useEffect(() => {
    if (!isSystemsRoute) return;

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
  }, [isSystemsRoute, load]);

  const queue = useMemo<CompanyQueueItem[]>(() => {
    return prospects.flatMap((prospect) => {
      if (!eligibleStatuses.has(prospect.status)) return [];
      if (prospect.linkedin_connected_at || prospect.linkedin_reply_at) return [];

      const companyContacts = contacts
        .filter((contact) => contact.prospect_id === prospect.id && Boolean(contact.linkedin_url))
        .sort((a, b) => a.priority - b.priority);

      const preparedContacts = companyContacts.filter((contact) => {
        const noteEn = contact.linkedin_note || prospect.linkedin_note;
        const noteAr = contact.linkedin_note_ar || prospect.linkedin_note_ar;
        return Boolean(noteEn || noteAr);
      });
      const pendingCount = preparedContacts.filter((contact) => !contact.linkedin_request_sent_at).length;
      if (!pendingCount) return [];
      return [{ prospect, contacts: preparedContacts, pendingCount }];
    });
  }, [prospects, contacts]);

  const pendingContactCount = useMemo(
    () => queue.reduce((sum, item) => sum + item.pendingCount, 0),
    [queue],
  );

  useEffect(() => {
    if (!open) return;
    if (!queue.length) {
      setIndex(0);
      return;
    }
    if (index >= queue.length) setIndex(queue.length - 1);
  }, [open, queue.length, index]);

  useEffect(() => {
    setNotice("");
  }, [index]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!isSystemsRoute || !session || !isAdmin) return null;

  const item = queue[index] ?? null;

  const noteFor = (contact: Contact, language: "en" | "ar") => {
    if (!item) return "";
    return language === "ar"
      ? contact.linkedin_note_ar || item.prospect.linkedin_note_ar || ""
      : contact.linkedin_note || item.prospect.linkedin_note || "";
  };

  const openBatch = () => {
    setIndex(0);
    setNotice("");
    setOpen(true);
  };

  const copyNote = async (contact: Contact, language: "en" | "ar") => {
    const text = noteFor(contact, language);
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setNotice(`${language === "ar" ? "AR" : "EN"} note copied for ${contact.name}.`);
    } catch {
      setNotice("Copy failed.");
    }
  };

  const openLinkedIn = (contact: Contact) => {
    if (!contact.linkedin_url) return;
    window.open(contact.linkedin_url, "_blank", "noopener,noreferrer");
  };

  const nextCompany = () => {
    if (!queue.length) return;
    setNotice("");
    setIndex((current) => (current + 1) % queue.length);
  };

  const previousCompany = () => {
    if (!queue.length) return;
    setNotice("");
    setIndex((current) => (current - 1 + queue.length) % queue.length);
  };

  const startRecording = (contactId: string) => {
    setRecordingContacts((current) => {
      const next = new Set(current);
      next.add(contactId);
      return next;
    });
  };

  const stopRecording = (contactId: string) => {
    setRecordingContacts((current) => {
      const next = new Set(current);
      next.delete(contactId);
      return next;
    });
  };

  const recordSent = async (contact: Contact) => {
    if (!item || !session || recordingContacts.has(contact.id) || contact.linkedin_request_sent_at) return;
    startRecording(contact.id);
    setNotice("");
    const now = new Date().toISOString();

    try {
      const { error: contactError } = await supabase
        .from("systems_outreach_contacts")
        .update({
          linkedin_request_sent_at: now,
          linkedin_request_sent_by: session.user.id,
          updated_at: now,
        })
        .eq("id", contact.id)
        .eq("prospect_id", item.prospect.id);

      if (contactError) {
        setNotice(contactError.message);
        return;
      }

      const prospectPatch: Record<string, unknown> = { updated_at: now };
      if (!item.prospect.linkedin_request_sent_at) prospectPatch.linkedin_request_sent_at = now;
      if (item.prospect.status === "ready_to_send") {
        prospectPatch.status = "contacted";
        prospectPatch.contacted_at = now;
      }

      const { error: prospectError } = await supabase
        .from("systems_outreach_prospects")
        .update(prospectPatch)
        .eq("id", item.prospect.id);

      if (prospectError) {
        setNotice(prospectError.message);
        return;
      }

      // The durable writes succeeded. Reflect that immediately instead of
      // holding the button in "Saving…" while a full refresh completes.
      setContacts((current) => current.map((row) => (
        row.id === contact.id ? { ...row, linkedin_request_sent_at: now } : row
      )));
      setProspects((current) => current.map((row) => (
        row.id === item.prospect.id
          ? {
              ...row,
              linkedin_request_sent_at: row.linkedin_request_sent_at || now,
              status: row.status === "ready_to_send" ? "contacted" : row.status,
            }
          : row
      )));
      setNotice(`${contact.name} marked as Contacted.`);

      // Event history and reconciliation are secondary to the button response.
      // Keep them asynchronous so a slow refresh cannot leave the UI stuck.
      void supabase.from("systems_outreach_events").insert({
        prospect_id: item.prospect.id,
        channel: "linkedin",
        event_type: "linkedin_connection_request_sent",
        status: "recorded",
        content: `Administrator confirmed the LinkedIn connection request was manually sent to ${contact.name} (${contact.title}).`,
      });
      void load(session);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not record LinkedIn contact. Please try again.");
    } finally {
      stopRecording(contact.id);
    }
  };

  return (
    <>
      <button className={styles.launcher} onClick={openBatch}>
        <span>All LinkedIn Outreach</span>
        <strong>{pendingContactCount}</strong>
      </button>

      {open ? (
        <div
          className={styles.backdrop}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <section className={styles.modal} role="dialog" aria-modal="true" aria-label="All LinkedIn Outreach">
            <header className={styles.header}>
              <div>
                <span className={styles.eyebrow}>LinkedIn Outreach</span>
                <h2>All LinkedIn Outreach</h2>
                <p>One company at a time. All prepared contacts stay together in one compact window.</p>
              </div>
              <button className={styles.close} onClick={() => setOpen(false)} aria-label="Close">×</button>
            </header>

            {item ? (
              <>
                <div className={styles.summary}>
                  <span>Company {index + 1} of {queue.length}</span>
                  <span>{item.contacts.length} contacts</span>
                  <span>{item.pendingCount} not contacted</span>
                  <span>Fit {item.prospect.fit_score}/100</span>
                  <span>Manual send gate</span>
                </div>

                <div className={styles.progressTrack}>
                  <span style={{ width: `${((index + 1) / queue.length) * 100}%` }} />
                </div>

                <div className={styles.companyHead}>
                  <div>
                    <span className={styles.companyLabel}>Company</span>
                    <h3>{item.prospect.company_name}</h3>
                    <p>{[item.prospect.city, item.prospect.country].filter(Boolean).join(" · ")}</p>
                  </div>
                </div>

                <div className={styles.tableWrap}>
                  <table className={styles.routeTable}>
                    <thead>
                      <tr>
                        <th>Contact</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {item.contacts.map((contact) => {
                        const en = noteFor(contact, "en");
                        const ar = noteFor(contact, "ar");
                        const contacted = Boolean(contact.linkedin_request_sent_at);
                        const saving = recordingContacts.has(contact.id);
                        return (
                          <tr key={contact.id}>
                            <td className={styles.contactCell}>
                              <strong>{contact.name}</strong>
                              <small>{contact.title}</small>
                            </td>
                            <td>
                              <span className={contacted ? styles.contactedStatus : styles.pendingStatus}>
                                {contacted ? "Contacted" : "Not contacted"}
                              </span>
                            </td>
                            <td>
                              <div className={styles.rowActions}>
                                <button className={styles.secondaryAction} onClick={() => void copyNote(contact, "en")} disabled={!en}>EN</button>
                                <button className={styles.secondaryAction} onClick={() => void copyNote(contact, "ar")} disabled={!ar}>AR</button>
                                <button className={styles.secondaryAction} onClick={() => openLinkedIn(contact)} disabled={!contact.linkedin_url}>Open LinkedIn ↗</button>
                                <button className={contacted ? styles.contactedAction : styles.primaryAction} onClick={() => void recordSent(contact)} disabled={contacted || saving}>
                                  {saving ? "Saving…" : contacted ? "✓ Contacted" : "Sent"}
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {notice ? <div className={styles.notice}>{notice}</div> : null}

                <div className={styles.footer}>
                  <div className={styles.secondaryActions}>
                    <button onClick={previousCompany} disabled={queue.length < 2}>← Previous company</button>
                    <button onClick={nextCompany} disabled={queue.length < 2}>Next company →</button>
                  </div>
                  <span>EN and AR copy the prepared note. LinkedIn stays manual. Sent records only that contact.</span>
                </div>
              </>
            ) : (
              <div className={styles.complete}>
                <span>✓</span>
                <h3>LinkedIn queue is clear.</h3>
                <p>No prepared connection requests are waiting right now.</p>
                <button onClick={() => setOpen(false)}>Close</button>
              </div>
            )}
          </section>
        </div>
      ) : null}
    </>
  );
}
