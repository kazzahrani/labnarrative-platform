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

type ContactQueueItem = {
  prospect: Prospect;
  contact: Contact;
  noteEn: string;
  noteAr: string;
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
  const [initialCount, setInitialCount] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);
  const [busyContact, setBusyContact] = useState<string | null>(null);
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

  const queue = useMemo<ContactQueueItem[]>(() => {
    return prospects.flatMap((prospect) => {
      if (!eligibleStatuses.has(prospect.status)) return [];
      if (prospect.linkedin_connected_at || prospect.linkedin_reply_at) return [];

      return contacts
        .filter((contact) => contact.prospect_id === prospect.id && Boolean(contact.linkedin_url) && !contact.linkedin_request_sent_at)
        .sort((a, b) => a.priority - b.priority)
        .flatMap((contact) => {
          const noteEn = contact.linkedin_note || prospect.linkedin_note || "";
          const noteAr = contact.linkedin_note_ar || prospect.linkedin_note_ar || "";
          if (!noteEn && !noteAr) return [];
          return [{ prospect, contact, noteEn, noteAr }];
        });
    });
  }, [prospects, contacts]);

  const pendingContactCount = queue.length;

  useEffect(() => {
    if (!open) return;
    if (!queue.length) {
      setIndex(0);
      return;
    }
    if (index >= queue.length) setIndex(queue.length - 1);
  }, [open, queue.length, index]);

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

  const openBatch = () => {
    setIndex(0);
    setInitialCount(queue.length);
    setCompletedCount(0);
    setNotice("");
    setOpen(true);
  };

  const skip = () => {
    if (queue.length < 2 || busyContact) return;
    setNotice("");
    setIndex((current) => (current + 1) % queue.length);
  };

  const back = () => {
    if (queue.length < 2 || busyContact) return;
    setNotice("");
    setIndex((current) => (current - 1 + queue.length) % queue.length);
  };

  const runOneClickOutreach = async (language: "en" | "ar") => {
    if (!item || !session || busyContact) return;

    const { contact, prospect } = item;
    const note = language === "ar" ? item.noteAr : item.noteEn;
    if (!note) {
      setNotice(`${language.toUpperCase()} draft is not available for ${contact.name}.`);
      return;
    }
    if (!contact.linkedin_url) {
      setNotice(`LinkedIn URL is missing for ${contact.name}.`);
      return;
    }

    // Open LinkedIn synchronously from the user's click so browsers do not treat
    // it as an async popup. Marking sent happens only after the copy succeeds.
    const linkedinTab = window.open(contact.linkedin_url, "_blank");
    if (!linkedinTab) {
      setNotice("LinkedIn was blocked by the browser. Allow pop-ups and try again; this contact was not marked sent.");
      return;
    }
    try {
      linkedinTab.opener = null;
    } catch {
      // Some browsers do not allow changing opener after navigation; harmless.
    }

    setBusyContact(contact.id);
    setNotice("");

    try {
      await navigator.clipboard.writeText(note);
    } catch {
      setNotice(`Could not copy the ${language.toUpperCase()} draft. ${contact.name} was not marked sent.`);
      setBusyContact(null);
      return;
    }

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
        .eq("prospect_id", prospect.id);

      if (contactError) throw contactError;

      const prospectPatch: Record<string, unknown> = { updated_at: now };
      if (!prospect.linkedin_request_sent_at) prospectPatch.linkedin_request_sent_at = now;
      if (prospect.status === "ready_to_send") {
        prospectPatch.status = "contacted";
        prospectPatch.contacted_at = now;
      }

      const { error: prospectError } = await supabase
        .from("systems_outreach_prospects")
        .update(prospectPatch)
        .eq("id", prospect.id);

      if (prospectError) throw prospectError;

      setContacts((current) => current.map((row) => (
        row.id === contact.id ? { ...row, linkedin_request_sent_at: now } : row
      )));
      setProspects((current) => current.map((row) => (
        row.id === prospect.id
          ? {
              ...row,
              linkedin_request_sent_at: row.linkedin_request_sent_at || now,
              status: row.status === "ready_to_send" ? "contacted" : row.status,
            }
          : row
      )));
      setCompletedCount((current) => current + 1);
      setNotice(`${language.toUpperCase()} copied · LinkedIn opened · ${contact.name} marked sent. Next contact ready.`);

      void supabase.from("systems_outreach_events").insert({
        prospect_id: prospect.id,
        channel: "linkedin",
        event_type: "linkedin_connection_request_sent",
        status: "recorded",
        content: `Administrator used the ${language.toUpperCase()} one-click LinkedIn action for ${contact.name} (${contact.title}); draft copied, LinkedIn opened, and the request was recorded as manually sent.`,
      });
      void load(session);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not record LinkedIn contact. Please try again.");
    } finally {
      setBusyContact(null);
    }
  };

  const progressTotal = Math.max(initialCount, completedCount + queue.length, 1);
  const progressDone = Math.min(completedCount, progressTotal);
  const progressPercent = (progressDone / progressTotal) * 100;

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
            if (event.target === event.currentTarget && !busyContact) setOpen(false);
          }}
        >
          <section className={styles.modal} role="dialog" aria-modal="true" aria-label="All LinkedIn Outreach">
            <header className={styles.header}>
              <div>
                <span className={styles.eyebrow}>LinkedIn Outreach</span>
                <h2>All LinkedIn Outreach</h2>
                <p>One contact at a time. Choose a language and the rest happens in one click.</p>
              </div>
              <button className={styles.close} onClick={() => setOpen(false)} disabled={Boolean(busyContact)} aria-label="Close">×</button>
            </header>

            {item ? (
              <>
                <div className={styles.summary}>
                  <span>{queue.length} remaining</span>
                  <span>{completedCount} completed</span>
                  <span>Fit {item.prospect.fit_score}/100</span>
                  <span>Manual LinkedIn send</span>
                </div>

                <div className={styles.progressTrack}>
                  <span style={{ width: `${progressPercent}%` }} />
                </div>

                <div className={styles.companyHead}>
                  <div>
                    <span className={styles.companyLabel}>Company</span>
                    <h3>{item.prospect.company_name}</h3>
                    <p>{[item.prospect.city, item.prospect.country].filter(Boolean).join(" · ")}</p>
                  </div>
                </div>

                <div className={styles.contactCard}>
                  <span className={styles.contactLabel}>Contact</span>
                  <h3>{item.contact.name}</h3>
                  <p>{item.contact.title}</p>
                  <span className={styles.pendingStatus}>Not contacted</span>
                </div>

                <div className={styles.oneClickHint}>Copy draft → open LinkedIn → mark sent → next contact</div>

                <div className={styles.primaryActions}>
                  <button
                    className={styles.flowAction}
                    onClick={() => void runOneClickOutreach("en")}
                    disabled={Boolean(busyContact) || !item.noteEn}
                    title="English: copy, open LinkedIn, mark sent, next"
                  >
                    {busyContact === item.contact.id ? "…" : "EN"}
                  </button>
                  <button
                    className={styles.flowAction}
                    onClick={() => void runOneClickOutreach("ar")}
                    disabled={Boolean(busyContact) || !item.noteAr}
                    title="Arabic: copy, open LinkedIn, mark sent, next"
                  >
                    {busyContact === item.contact.id ? "…" : "AR"}
                  </button>
                </div>

                {notice ? <div className={styles.notice}>{notice}</div> : null}

                <div className={styles.footer}>
                  <div className={styles.secondaryActions}>
                    <button onClick={back} disabled={queue.length < 2 || Boolean(busyContact)}>Back</button>
                    <button onClick={skip} disabled={queue.length < 2 || Boolean(busyContact)}>Skip</button>
                  </div>
                  <span>EN or AR performs the full platform workflow. You still send the actual connection request manually inside LinkedIn.</span>
                </div>
              </>
            ) : (
              <div className={styles.complete}>
                <span>✓</span>
                <h3>LinkedIn queue is clear.</h3>
                <p>All prepared connection requests in this batch are recorded.</p>
                <button onClick={() => setOpen(false)}>Close</button>
              </div>
            )}
          </section>
        </div>
      ) : null}
    </>
  );
}
