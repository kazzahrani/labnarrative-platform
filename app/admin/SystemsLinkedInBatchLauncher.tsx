"use client";

import { createClient, type Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import styles from "./systems-linkedin-batch.module.css";

type Language = "en" | "ar";
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
};
type QueueItem = { prospect: Prospect; contact: Contact };

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);
const eligibleStatuses = new Set(["ready_to_send", "contacted"]);

export default function SystemsLinkedInBatchLauncher() {
  const pathname = usePathname();
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [language, setLanguage] = useState<Language>("en");
  const [prepared, setPrepared] = useState(false);
  const [recording, setRecording] = useState(false);
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
        .select("id,prospect_id,name,title,linkedin_url,priority")
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
    const byId = new Map(contacts.map((contact) => [contact.id, contact]));
    return prospects.flatMap((prospect) => {
      if (!eligibleStatuses.has(prospect.status)) return [];
      if (prospect.linkedin_request_sent_at || prospect.linkedin_connected_at || prospect.linkedin_reply_at) return [];
      if (!prospect.linkedin_note && !prospect.linkedin_note_ar) return [];
      const contact = prospect.linkedin_recipient_contact_id
        ? byId.get(prospect.linkedin_recipient_contact_id)
        : undefined;
      if (!contact?.linkedin_url) return [];
      return [{ prospect, contact }];
    });
  }, [prospects, contacts]);

  useEffect(() => {
    if (!open) return;
    if (queue.length && index >= queue.length) setIndex(0);
    if (!queue.length) setIndex(0);
  }, [open, queue.length, index]);

  useEffect(() => {
    setPrepared(false);
    setNotice("");
  }, [index, language]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (pathname !== "/admin/systems-outreach" || !session || !isAdmin) return null;

  const item = queue[index] ?? null;
  const note = item
    ? language === "ar"
      ? item.prospect.linkedin_note_ar || item.prospect.linkedin_note || ""
      : item.prospect.linkedin_note || item.prospect.linkedin_note_ar || ""
    : "";

  const openBatch = () => {
    setIndex(0);
    setLanguage("en");
    setPrepared(false);
    setNotice("");
    setOpen(true);
  };

  const copyAndOpen = () => {
    if (!item?.contact.linkedin_url || !note) return;
    navigator.clipboard?.writeText(note).catch(() => undefined);
    window.open(item.contact.linkedin_url, "_blank", "noopener,noreferrer");
    setPrepared(true);
    setNotice("Note copied. Send the connection request on LinkedIn, then return here and press Sent → Next.");
  };

  const skipNext = () => {
    if (!queue.length) return;
    setPrepared(false);
    setNotice("");
    setIndex((current) => (current + 1) % queue.length);
  };

  const previous = () => {
    if (!queue.length) return;
    setPrepared(false);
    setNotice("");
    setIndex((current) => (current - 1 + queue.length) % queue.length);
  };

  const recordSentAndNext = async () => {
    if (!item || !session || recording) return;
    setRecording(true);
    setNotice("");
    const now = new Date().toISOString();
    const shouldMoveToContacted = item.prospect.status === "ready_to_send";
    const patch: Record<string, unknown> = {
      linkedin_request_sent_at: now,
      updated_at: now,
    };
    if (shouldMoveToContacted) {
      patch.status = "contacted";
      patch.contacted_at = now;
    }
    const { error } = await supabase
      .from("systems_outreach_prospects")
      .update(patch)
      .eq("id", item.prospect.id);
    if (error) {
      setNotice(error.message);
      setRecording(false);
      return;
    }
    await supabase.from("systems_outreach_events").insert({
      prospect_id: item.prospect.id,
      channel: "linkedin",
      event_type: "linkedin_connection_request_sent",
      status: "recorded",
      content: `Administrator confirmed the LinkedIn connection request was manually sent to ${item.contact.name}.`,
    });
    setPrepared(false);
    await load(session);
    setRecording(false);
  };

  return (
    <>
      <button className={styles.launcher} onClick={openBatch}>
        <span>All LinkedIn Outreach</span>
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
          <section className={styles.modal} role="dialog" aria-modal="true" aria-label="All LinkedIn Outreach">
            <header className={styles.header}>
              <div>
                <span className={styles.eyebrow}>Systems · manual batch workflow</span>
                <h2>All LinkedIn Outreach</h2>
                <p>Work through one company at a time without reopening each prospect card.</p>
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
                    <span className={styles.companyLabel}>Company</span>
                    <h3>{item.prospect.company_name}</h3>
                    <p>{[item.prospect.city, item.prospect.country].filter(Boolean).join(" · ")} · Fit {item.prospect.fit_score}/100</p>
                  </div>
                  <div className={styles.person}>
                    <span>Contact</span>
                    <strong>{item.contact.name}</strong>
                    <small>{item.contact.title}</small>
                  </div>
                  <a className={styles.profileButton} href={item.contact.linkedin_url ?? "#"} target="_blank" rel="noreferrer">
                    Open LinkedIn ↗
                  </a>
                </div>

                <div className={styles.languageRow}>
                  <button className={language === "en" ? styles.languageActive : ""} onClick={() => setLanguage("en")}>English</button>
                  <button className={language === "ar" ? styles.languageActive : ""} onClick={() => setLanguage("ar")}>العربية</button>
                </div>

                <div className={styles.notesGrid}>
                  <button className={`${styles.noteCard} ${language === "en" ? styles.noteSelected : ""}`} onClick={() => setLanguage("en")}>
                    <span>English connection note</span>
                    <p>{item.prospect.linkedin_note || "English note unavailable."}</p>
                    <small>{item.prospect.linkedin_note?.length ?? 0}/300</small>
                  </button>
                  <button className={`${styles.noteCard} ${styles.arabicCard} ${language === "ar" ? styles.noteSelected : ""}`} onClick={() => setLanguage("ar")} dir="rtl">
                    <span>رسالة الاتصال العربية</span>
                    <p>{item.prospect.linkedin_note_ar || "الرسالة العربية غير متاحة."}</p>
                    <small>{item.prospect.linkedin_note_ar?.length ?? 0}/300</small>
                  </button>
                </div>

                {notice ? <div className={styles.notice}>{notice}</div> : null}

                <div className={styles.footer}>
                  <div className={styles.secondaryActions}>
                    <button onClick={previous} disabled={queue.length < 2}>← Previous</button>
                    <button onClick={skipNext} disabled={queue.length < 2}>Skip → Next</button>
                  </div>
                  {!prepared ? (
                    <button className={styles.primaryAction} onClick={copyAndOpen} disabled={!note}>
                      Copy {language === "ar" ? "Arabic" : "English"} & open LinkedIn ↗
                    </button>
                  ) : (
                    <button className={styles.primaryAction} onClick={() => void recordSentAndNext()} disabled={recording}>
                      {recording ? "Saving…" : "Sent → Next"}
                    </button>
                  )}
                </div>
                <p className={styles.humanGate}>LinkedIn stays manual. The first click only copies the note and opens the profile; “Sent → Next” records your confirmation after you actually send it.</p>
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
