"use client";

import { createClient, type Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import styles from "./websites-linkedin-batch.module.css";

type Prospect = {
  id: string;
  company_name: string;
  city: string | null;
  country: string | null;
  website_opportunity_score: number;
  status: string;
};

type Contact = {
  id: string;
  prospect_id: string;
  name: string;
  title: string | null;
  priority: number;
  is_current_verified: boolean;
  linkedin_url: string | null;
  linkedin_note: string | null;
  linkedin_note_ar: string | null;
  linkedin_request_sent_at: string | null;
  linkedin_connected_at: string | null;
  linkedin_reply_at: string | null;
};

type QueueItem = {
  prospect: Prospect;
  contact: Contact;
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
);

const validPaths = new Set([
  "/admin/websites",
  "/admin/websites/concepts",
  "/admin/concepts",
]);

const eligibleStatuses = new Set([
  "qualified",
  "ready_for_connection",
  "connection_sent",
  "connected",
  "concept_ready",
  "ready_to_send",
  "contacted",
]);

export default function WebsitesLinkedInBatchLauncher() {
  const pathname = usePathname();
  const isWebsitesRoute = validPaths.has(pathname);
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
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
    const [prospectResult, contactResult] = await Promise.all([
      supabase
        .from("websites_company_prospects")
        .select("id,company_name,city,country,website_opportunity_score,status")
        .order("website_opportunity_score", { ascending: false })
        .order("company_name", { ascending: true }),
      supabase
        .from("websites_company_contacts")
        .select("id,prospect_id,name,title,priority,is_current_verified,linkedin_url,linkedin_note,linkedin_note_ar,linkedin_request_sent_at,linkedin_connected_at,linkedin_reply_at")
        .order("priority", { ascending: true }),
    ]);

    if (!prospectResult.error) setProspects((prospectResult.data ?? []) as Prospect[]);
    if (!contactResult.error) setContacts((contactResult.data ?? []) as Contact[]);
  }, []);

  useEffect(() => {
    if (!isWebsitesRoute) return;

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
  }, [isWebsitesRoute, load]);

  const queue = useMemo<QueueItem[]>(() => {
    const prospectById = new Map(
      prospects
        .filter((prospect) => eligibleStatuses.has(prospect.status))
        .map((prospect) => [prospect.id, prospect]),
    );

    return contacts
      .filter((contact) => {
        const prospect = prospectById.get(contact.prospect_id);
        if (!prospect) return false;
        if (!contact.is_current_verified || !contact.linkedin_url) return false;
        if (contact.linkedin_request_sent_at || contact.linkedin_connected_at || contact.linkedin_reply_at) return false;
        return Boolean(contact.linkedin_note?.trim() && contact.linkedin_note_ar?.trim());
      })
      .map((contact) => ({ prospect: prospectById.get(contact.prospect_id)!, contact }))
      .sort((a, b) => {
        const score = b.prospect.website_opportunity_score - a.prospect.website_opportunity_score;
        if (score) return score;
        const company = a.prospect.company_name.localeCompare(b.prospect.company_name);
        if (company) return company;
        return a.contact.priority - b.contact.priority;
      });
  }, [prospects, contacts]);

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

  if (!isWebsitesRoute || !session || !isAdmin) return null;

  const item = queue[index] ?? null;

  const move = (direction: 1 | -1) => {
    if (!queue.length) return;
    setNotice("");
    setIndex((current) => (current + direction + queue.length) % queue.length);
  };

  const sendAndNext = async (language: "en" | "ar") => {
    if (!item || !session || busyId) return;
    const { contact } = item;
    const note = language === "ar" ? contact.linkedin_note_ar : contact.linkedin_note;
    if (!note || !contact.linkedin_url) return;

    setBusyId(contact.id);
    setNotice("");

    const copyPromise = navigator.clipboard?.writeText(note);
    const linkedinTab = window.open(contact.linkedin_url, "_blank");
    if (linkedinTab) linkedinTab.opener = null;

    if (!linkedinTab) {
      try { await copyPromise; } catch { /* keep contact pending */ }
      setNotice("LinkedIn was blocked by the browser. Allow pop-ups and try again; this contact was not marked sent.");
      setBusyId(null);
      return;
    }

    try {
      if (!copyPromise) throw new Error("Clipboard unavailable");
      await copyPromise;
    } catch {
      setNotice("The LinkedIn profile opened, but the draft could not be copied. This contact was not marked sent.");
      setBusyId(null);
      return;
    }

    const { error } = await supabase.rpc("websites_company_admin_mark_contact_connection_sent", {
      p_contact_id: contact.id,
    });

    if (error) {
      setNotice(`LinkedIn opened and ${language.toUpperCase()} was copied, but send tracking failed: ${error.message}`);
      setBusyId(null);
      return;
    }

    const now = new Date().toISOString();
    setContacts((current) => current.map((row) => (
      row.id === contact.id ? { ...row, linkedin_request_sent_at: now } : row
    )));
    setNotice(`${language.toUpperCase()} copied · LinkedIn opened · ${contact.name} marked sent.`);
    setBusyId(null);
    void load(session);
  };

  return (
    <>
      <button
        className={styles.launcher}
        onClick={() => {
          setIndex(0);
          setNotice("");
          setOpen(true);
        }}
      >
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
          <section className={styles.modal} role="dialog" aria-modal="true" aria-label="Websites LinkedIn Outreach">
            <header className={styles.header}>
              <div>
                <span>LINKEDIN OUTREACH</span>
                <h2>All LinkedIn Outreach</h2>
                <p>One contact at a time. Choose the language and the rest happens in one click.</p>
              </div>
              <button className={styles.close} onClick={() => setOpen(false)} aria-label="Close">×</button>
            </header>

            {item ? (
              <div className={styles.body}>
                <div className={styles.progressRow}>
                  <span>{queue.length} remaining</span>
                  <span>Contact {index + 1} of {queue.length}</span>
                  <span>Website {item.prospect.website_opportunity_score}/100</span>
                </div>

                <article className={styles.contactCard}>
                  <span className={styles.companyLabel}>COMPANY</span>
                  <h3>{item.prospect.company_name}</h3>
                  <p>{[item.prospect.city, item.prospect.country].filter(Boolean).join(" · ")}</p>
                  <div className={styles.person}>
                    <strong>{item.contact.name}</strong>
                    <span>{item.contact.title || "Decision-maker"}</span>
                  </div>
                </article>

                <div className={styles.actions}>
                  <button
                    className={styles.primary}
                    onClick={() => void sendAndNext("en")}
                    disabled={busyId === item.contact.id || !item.contact.linkedin_note}
                  >
                    {busyId === item.contact.id ? "Working…" : "EN"}
                  </button>
                  <button
                    className={styles.primary}
                    onClick={() => void sendAndNext("ar")}
                    disabled={busyId === item.contact.id || !item.contact.linkedin_note_ar}
                  >
                    {busyId === item.contact.id ? "Working…" : "AR"}
                  </button>
                </div>

                <p className={styles.rule}>Copies the draft · opens LinkedIn · marks this contact sent · loads the next contact.</p>
                {notice ? <div className={styles.notice}>{notice}</div> : null}

                <footer className={styles.footer}>
                  <button onClick={() => move(-1)} disabled={queue.length < 2}>Back</button>
                  <button onClick={() => move(1)} disabled={queue.length < 2}>Skip</button>
                </footer>
              </div>
            ) : (
              <div className={styles.complete}>
                <span>✓</span>
                <h3>LinkedIn queue is clear.</h3>
                <p>No Website connection requests are waiting right now.</p>
                <button onClick={() => setOpen(false)}>Close</button>
              </div>
            )}
          </section>
        </div>
      ) : null}
    </>
  );
}
