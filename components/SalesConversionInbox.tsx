"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { browserSupabase as supabase } from "@/lib/supabase-browser";
import styles from "./sales-conversion-inbox.module.css";

type Row = {
  prospect_id: string;
  pi_name: string;
  institution: string;
  email?: string | null;
  qualification_score?: number | null;
  slug: string;
  outreach_status: string;
  stage: string;
  next_action?: string | null;
  next_action_due_at?: string | null;
  meeting_at?: string | null;
  proposal_status?: string | null;
  payment_status?: string | null;
  human_replies: number;
  automatic_replies: number;
  last_reply_at?: string | null;
  visits: number | string;
  page_views: number | string;
  last_activity_at?: string | null;
  priority_rank: number;
};

const conversionStages = new Set(["replied","interested","meeting_scheduled","proposal_sent","client"]);

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
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

export default function SalesConversionInbox() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data, error: rpcError } = await supabase.rpc("sales_conversion_inbox");
    if (rpcError) setError(rpcError.message);
    else if (data && !Array.isArray(data) && typeof data === "object" && "error" in data) setError(String((data as { error?: string }).error || "Unable to load sales opportunities."));
    else setRows((data ?? []) as Row[]);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const channel = supabase
      .channel("sales-conversion-inbox")
      .on("postgres_changes", { event: "*", schema: "public", table: "outreach_replies" }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load]);

  const active = useMemo(() => rows.filter((row) => conversionStages.has(row.stage) || row.human_replies > 0 || Boolean(row.next_action)), [rows]);
  const due = useMemo(() => active.filter((row) => row.next_action_due_at && Date.parse(row.next_action_due_at) <= Date.now()).length, [active]);

  return (
    <section className={styles.section}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div>
            <p className={styles.kicker}>Conversion layer</p>
            <h2>Sales Conversion Workspace</h2>
            <p>Open a PI to manage the conversation, next action, meeting, proposal and deposit in one place.</p>
          </div>
          <button type="button" onClick={() => void load()} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</button>
        </header>

        {error ? <p className={styles.error}>{error}</p> : null}

        <div className={styles.metrics}>
          <article><span>Active opportunities</span><strong>{active.length}</strong><small>Reply stage or manually tracked</small></article>
          <article><span>Human replies</span><strong>{rows.reduce((sum,row) => sum + Number(row.human_replies || 0), 0)}</strong><small>Across current conversion candidates</small></article>
          <article><span>Actions due</span><strong>{due}</strong><small>Next actions due now or overdue</small></article>
        </div>

        <article className={styles.card}>
          <div className={styles.cardHeader}><div><p className={styles.kicker}>Priority</p><h3>Active opportunities</h3></div><span>{active.length}</span></div>
          {active.length === 0 ? <p className={styles.empty}>No human replies or manually tracked opportunities yet. When a PI replies, they will appear here automatically.</p> : (
            <div className={styles.rows}>
              {active.slice(0, 20).map((row) => (
                <Link className={styles.row} href={`/admin/sales/${row.prospect_id}`} key={row.prospect_id}>
                  <div className={styles.identity}><strong>{row.pi_name}</strong><small>{row.institution}</small><small>{row.next_action || `${Number(row.visits || 0)} visits · ${Number(row.page_views || 0)} page views`}</small></div>
                  <div className={styles.meta}><span className={styles.hot}>{label(row.stage)}</span>{row.human_replies ? <span>{row.human_replies} human repl{row.human_replies === 1 ? "y" : "ies"}</span> : null}<small>{row.next_action_due_at ? `Due ${formatDate(row.next_action_due_at)}` : `Last ${formatDate(row.last_activity_at)}`}</small></div>
                  <b>Open →</b>
                </Link>
              ))}
            </div>
          )}
        </article>
      </div>
    </section>
  );
}
