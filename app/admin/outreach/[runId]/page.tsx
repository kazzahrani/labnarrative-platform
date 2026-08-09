"use client";

import { createClient, type Session } from "@supabase/supabase-js";
import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";
import styles from "./outreach.module.css";

type OutreachDraft = {
  runId: string;
  productionRunId: string;
  messageId: string;
  recipientEmail: string;
  senderEmail: string;
  subject: string;
  bodyText: string;
  status: string;
  publicUrl?: string;
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function rpc<T>(session: Session, name: string, body: Record<string, unknown> = {}): Promise<T> {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: supabaseKey,
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const row = payload as { message?: string; details?: string; hint?: string } | null;
    throw new Error(row?.message || row?.details || row?.hint || `${name} failed (${response.status}).`);
  }
  return payload as T;
}

export default function EngineV3OutreachDraftPage() {
  const params = useParams<{ runId: string }>();
  const runId = String(params.runId ?? "");
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [draft, setDraft] = useState<OutreachDraft | null>(null);
  const [recipientEmail, setRecipientEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (activeSession: Session) => {
    if (!runId) return;
    try {
      const row = await rpc<OutreachDraft>(activeSession, "engine_v3_admin_outreach_get", { p_run_id: runId });
      setDraft(row);
      setRecipientEmail(row.recipientEmail || "");
      setSubject(row.subject || "");
      setBodyText(row.bodyText || "");
      setNotice("");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The outreach draft could not be loaded.");
    }
  }, [runId]);

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
      else setDraft(null);
    });
    return () => { mounted = false; subscription.unsubscribe(); };
  }, [load]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!session || saving) return;
    setSaving(true);
    try {
      const row = await rpc<OutreachDraft>(session, "engine_v3_admin_outreach_save", {
        p_run_id: runId,
        p_recipient_email: recipientEmail,
        p_subject: subject,
        p_body_text: bodyText,
      });
      setDraft((current) => ({ ...(current ?? row), ...row }));
      setNotice("Draft saved. No email was sent.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The outreach draft could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  if (!ready) return <main className={styles.state}>Preparing outreach draft…</main>;
  if (!session) return <main className={styles.state}><section><h1>Administrator sign-in required.</h1><Link href="/admin">Open administrator dashboard</Link></section></main>;

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <div><Link className={styles.brand} href="/admin">LabNarrative</Link><span>Outreach draft</span></div>
        <nav><Link href="/admin/review">Final Review</Link><Link href="/admin/automation">Production</Link><Link href="/admin/sites">Websites</Link></nav>
      </header>

      <section className={styles.content}>
        <div className={styles.hero}>
          <div><p className={styles.kicker}>Human-controlled outreach</p><h1>Review the email before anything is sent.</h1><p>This page only edits and saves the draft. There is deliberately no automatic send action here.</p></div>
          {draft?.publicUrl ? <a href={draft.publicUrl} target="_blank" rel="noreferrer">Open published concept ↗</a> : null}
        </div>

        <div className={styles.safety}><strong>Safe state:</strong><span>Publication is complete. Outreach status is <b>{draft?.status || "draft"}</b>. Saving this page does not send email.</span></div>
        {notice ? <p className={styles.notice}>{notice}</p> : null}

        {!draft && !notice ? <p>Loading outreach draft…</p> : null}
        {draft ? (
          <form className={styles.form} onSubmit={save}>
            <label><span>From</span><input readOnly value={draft.senderEmail || "LabNarrative <khaled@labnarrative.com>"} /></label>
            <label><span>Recipient email</span><input placeholder="Verified institutional email" type="email" value={recipientEmail} onChange={(event) => setRecipientEmail(event.target.value)} /></label>
            {!recipientEmail.trim() ? <p className={styles.warning}>Recipient is still missing. The draft can be saved, but it cannot be approved for sending until a verified email is added.</p> : null}
            <label><span>Subject</span><input required value={subject} onChange={(event) => setSubject(event.target.value)} /></label>
            <label><span>Email body</span><textarea required rows={24} value={bodyText} onChange={(event) => setBodyText(event.target.value)} /></label>
            <div className={styles.actions}>
              <button disabled={saving} type="submit">{saving ? "Saving…" : "Save draft"}</button>
              <Link href="/admin/review">Back to Final Review</Link>
            </div>
          </form>
        ) : null}
      </section>
    </main>
  );
}
