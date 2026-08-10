"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { browserSupabase as supabase } from "@/lib/supabase-browser";
import styles from "./sales-daily-action-queue.module.css";

type QueueAction = {
  action_key: string;
  prospect_id: string;
  pi_name: string;
  institution: string;
  action_type: string;
  title: string;
  detail: string;
  due_at: string;
  bucket: "overdue" | "today" | "upcoming";
  priority: number;
  slug?: string | null;
  stage?: string | null;
  source_at?: string | null;
};

type CompletedAction = {
  id: string;
  action_key: string;
  prospect_id: string;
  pi_name: string;
  institution: string;
  action_type: string;
  title: string;
  completed_at: string;
};

type QueueResponse = {
  actions: QueueAction[];
  completed: CompletedAction[];
};

type Tab = "overdue" | "today" | "upcoming" | "completed";

type ScheduleDraft = {
  action: string;
  due: string;
};

const PAGE_SIZES = [5, 10, 25, 50, 100] as const;

function pageNumbers(page: number, total: number): Array<number | "…"> {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
  const values: Array<number | "…"> = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(total - 1, page + 1);
  if (start > 2) values.push("…");
  for (let value = start; value <= end; value += 1) values.push(value);
  if (end < total - 1) values.push("…");
  values.push(total);
  return values;
}

function label(value?: string | null) {
  if (!value) return "—";
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

function todayLabel() {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Riyadh",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());
}

function toIso(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function actionTone(type: string) {
  if (["reply_waiting", "post_meeting_followup"].includes(type)) return styles.replyTone;
  if (type === "delivery_problem") return styles.problemTone;
  if (["proposal_followup", "deposit_followup"].includes(type)) return styles.moneyTone;
  if (type === "meeting_approaching") return styles.meetingTone;
  if (type === "linkedin_touch") return styles.linkedinTone;
  return styles.standardTone;
}

export default function SalesDailyActionQueue() {
  const [actions, setActions] = useState<QueueAction[]>([]);
  const [completed, setCompleted] = useState<CompletedAction[]>([]);
  const [tab, setTab] = useState<Tab>("today");
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [scheduleKey, setScheduleKey] = useState("");
  const [scheduleDraft, setScheduleDraft] = useState<ScheduleDraft>({ action: "", due: "" });
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZES)[number]>(10);
  const [page, setPage] = useState(1);

  const load = useCallback(async (preserveTab = true) => {
    setLoading(true);
    setError("");
    const { data, error: rpcError } = await supabase.rpc("sales_daily_action_queue");
    if (rpcError) {
      setError(rpcError.message);
      setLoading(false);
      return;
    }
    const payload = (data ?? { actions: [], completed: [] }) as QueueResponse;
    const nextActions = Array.isArray(payload.actions) ? payload.actions : [];
    setActions(nextActions);
    setCompleted(Array.isArray(payload.completed) ? payload.completed : []);
    if (!preserveTab) {
      if (nextActions.some((row) => row.bucket === "overdue")) setTab("overdue");
      else setTab("today");
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(false); }, [load]);
  useEffect(() => { setPage(1); }, [tab, pageSize]);

  useEffect(() => {
    const channel = supabase
      .channel("sales-daily-action-queue")
      .on("postgres_changes", { event: "*", schema: "public", table: "outreach_replies" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "outreach_messages" }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load]);

  const counts = useMemo(() => ({
    overdue: actions.filter((row) => row.bucket === "overdue").length,
    today: actions.filter((row) => row.bucket === "today").length,
    upcoming: actions.filter((row) => row.bucket === "upcoming").length,
    completed: completed.length,
  }), [actions, completed]);

  const visible = useMemo(() => tab === "completed" ? [] : actions.filter((row) => row.bucket === tab), [actions, tab]);
  const activeItems = tab === "completed" ? completed : visible;
  const totalPages = Math.max(1, Math.ceil(activeItems.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const pagedCompleted = completed.slice(pageStart, pageStart + pageSize);
  const pagedVisible = visible.slice(pageStart, pageStart + pageSize);
  const rangeStart = activeItems.length ? pageStart + 1 : 0;
  const rangeEnd = Math.min(activeItems.length, pageStart + pageSize);

  const pagination = (
    <div className="platformListPagination">
      <span className="platformListPaginationSummary">{rangeStart}–{rangeEnd} of {activeItems.length}</span>
      <div className="platformListPaginationControls">
        <label className="platformListPageSize">Show <select aria-label="Daily sales actions per page" value={pageSize} onChange={(event) => setPageSize(Number(event.target.value) as (typeof PAGE_SIZES)[number])}>{PAGE_SIZES.map((size) => <option value={size} key={size}>{size}</option>)}</select></label>
        <div className="platformListPageButtons">
          <button type="button" disabled={currentPage <= 1} onClick={() => setPage(Math.max(1, currentPage - 1))}>‹</button>
          {pageNumbers(currentPage, totalPages).map((value, index) => value === "…"
            ? <span className="platformListPageEllipsis" key={`ellipsis-${index}`}>…</span>
            : <button type="button" key={value} aria-current={value === currentPage ? "page" : undefined} onClick={() => setPage(value)}>{value}</button>)}
          <button type="button" disabled={currentPage >= totalPages} onClick={() => setPage(Math.min(totalPages, currentPage + 1))}>›</button>
        </div>
      </div>
    </div>
  );

  async function markDone(action: QueueAction) {
    setBusyKey(action.action_key);
    setError("");
    setNotice("");
    const { error: rpcError } = await supabase.rpc("sales_daily_action_complete", {
      p_action_key: action.action_key,
      p_prospect_id: action.prospect_id,
      p_action_type: action.action_type,
      p_title: action.title,
    });
    if (rpcError) setError(rpcError.message);
    else {
      setNotice(`Completed: ${action.title}`);
      if (scheduleKey === action.action_key) setScheduleKey("");
      await load();
    }
    setBusyKey("");
  }

  async function scheduleNext(action: QueueAction) {
    const nextAction = scheduleDraft.action.trim();
    const dueAt = toIso(scheduleDraft.due);
    if (!nextAction || !dueAt) {
      setError("Add both the next action and its due date.");
      return;
    }
    setBusyKey(action.action_key);
    setError("");
    setNotice("");
    const { error: rpcError } = await supabase.rpc("sales_daily_action_schedule", {
      p_action_key: action.action_key,
      p_prospect_id: action.prospect_id,
      p_action_type: action.action_type,
      p_title: action.title,
      p_next_action: nextAction,
      p_due_at: dueAt,
    });
    if (rpcError) setError(rpcError.message);
    else {
      setNotice(`Next action scheduled for ${action.pi_name}.`);
      setScheduleKey("");
      setScheduleDraft({ action: "", due: "" });
      await load();
    }
    setBusyKey("");
  }

  async function reopen(action: CompletedAction) {
    setBusyKey(action.action_key);
    setError("");
    setNotice("");
    const { error: rpcError } = await supabase.rpc("sales_daily_action_reopen", { p_action_key: action.action_key });
    if (rpcError) setError(rpcError.message);
    else {
      setNotice(`Reopened: ${action.title}`);
      await load();
    }
    setBusyKey("");
  }

  function openSchedule(action: QueueAction) {
    if (scheduleKey === action.action_key) {
      setScheduleKey("");
      setScheduleDraft({ action: "", due: "" });
      return;
    }
    setScheduleKey(action.action_key);
    setScheduleDraft({ action: "", due: "" });
    setError("");
  }

  return (
    <section className={styles.section} aria-label="Daily sales action queue">
      <div className={styles.shell}>
        <header className={styles.header}>
          <div>
            <p className={styles.kicker}>Daily operating queue · {todayLabel()} · Riyadh</p>
            <h2>What needs your attention today?</h2>
            <p>One prioritized list built from real replies, meetings, proposals, payments, engagement, LinkedIn and delivery exceptions.</p>
          </div>
          <button type="button" className={styles.refresh} onClick={() => void load()} disabled={loading}>{loading ? "Refreshing…" : "Refresh queue"}</button>
        </header>

        {notice ? <p className={styles.notice}>{notice}</p> : null}
        {error ? <p className={styles.error}>{error}</p> : null}

        <div className={styles.summary}>
          <button type="button" className={`${styles.summaryCard} ${tab === "overdue" ? styles.summaryActive : ""}`} onClick={() => setTab("overdue")}>
            <span>Overdue</span><strong>{counts.overdue}</strong><small>Needs attention first</small>
          </button>
          <button type="button" className={`${styles.summaryCard} ${tab === "today" ? styles.summaryActive : ""}`} onClick={() => setTab("today")}>
            <span>Today</span><strong>{counts.today}</strong><small>Riyadh calendar day</small>
          </button>
          <button type="button" className={`${styles.summaryCard} ${tab === "upcoming" ? styles.summaryActive : ""}`} onClick={() => setTab("upcoming")}>
            <span>Upcoming</span><strong>{counts.upcoming}</strong><small>Scheduled ahead</small>
          </button>
          <button type="button" className={`${styles.summaryCard} ${tab === "completed" ? styles.summaryActive : ""}`} onClick={() => setTab("completed")}>
            <span>Completed</span><strong>{counts.completed}</strong><small>Last 30 days</small>
          </button>
        </div>

        <div className={styles.tabs} role="tablist" aria-label="Sales action queue views">
          {(["overdue", "today", "upcoming", "completed"] as Tab[]).map((value) => (
            <button key={value} type="button" role="tab" aria-selected={tab === value} className={tab === value ? styles.tabActive : undefined} onClick={() => setTab(value)}>
              {label(value)} <span>{counts[value]}</span>
            </button>
          ))}
        </div>

        {pagination}

        {tab === "completed" ? (
          <div className={styles.list}>
            {completed.length === 0 ? <p className={styles.empty}>No completed sales actions yet.</p> : pagedCompleted.map((action) => (
              <article className={`${styles.action} ${styles.completedAction}`} key={action.id}>
                <div className={`${styles.typeMark} ${actionTone(action.action_type)}`}></div>
                <div className={styles.actionBody}>
                  <div className={styles.actionTitle}><div><span className={styles.typeLabel}>{label(action.action_type)}</span><h3>{action.title}</h3></div><time>Done {formatDate(action.completed_at)}</time></div>
                  <p><strong>{action.pi_name}</strong> · {action.institution}</p>
                </div>
                <div className={styles.actionButtons}>
                  <Link href={`/admin/sales/${action.prospect_id}`}>Open workspace</Link>
                  <button type="button" onClick={() => void reopen(action)} disabled={busyKey === action.action_key}>{busyKey === action.action_key ? "Reopening…" : "Reopen"}</button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className={styles.list}>
            {loading && visible.length === 0 ? <p className={styles.empty}>Loading the live sales queue…</p> : null}
            {!loading && visible.length === 0 ? <p className={styles.empty}>Nothing in {tab} right now.</p> : null}
            {pagedVisible.map((action) => (
              <article className={styles.action} key={action.action_key}>
                <div className={`${styles.typeMark} ${actionTone(action.action_type)}`}></div>
                <div className={styles.actionBody}>
                  <div className={styles.actionTitle}>
                    <div><span className={styles.typeLabel}>{label(action.action_type)}</span><h3>{action.title}</h3></div>
                    <time className={action.bucket === "overdue" ? styles.overdueTime : undefined}>{action.bucket === "overdue" ? "Overdue · " : ""}{formatDate(action.due_at)}</time>
                  </div>
                  <p>{action.detail}</p>
                  <div className={styles.meta}><strong>{action.pi_name}</strong><span>{action.institution}</span><span>{label(action.stage)}</span>{action.slug ? <span>{action.slug}.labnarrative.com</span> : null}</div>

                  {scheduleKey === action.action_key ? (
                    <div className={styles.scheduleBox}>
                      <label><span>Next action</span><input value={scheduleDraft.action} onChange={(event) => setScheduleDraft((current) => ({ ...current, action: event.target.value }))} placeholder="e.g. Send two meeting options" autoFocus /></label>
                      <label><span>Due date & time</span><input type="datetime-local" value={scheduleDraft.due} onChange={(event) => setScheduleDraft((current) => ({ ...current, due: event.target.value }))} /></label>
                      <div><button type="button" className={styles.scheduleSave} onClick={() => void scheduleNext(action)} disabled={busyKey === action.action_key}>{busyKey === action.action_key ? "Saving…" : "Save next action"}</button><button type="button" onClick={() => openSchedule(action)}>Cancel</button></div>
                    </div>
                  ) : null}
                </div>
                <div className={styles.actionButtons}>
                  <Link href={`/admin/sales/${action.prospect_id}`}>Open workspace</Link>
                  <button type="button" onClick={() => openSchedule(action)}>Schedule next</button>
                  <button type="button" className={styles.doneButton} onClick={() => void markDone(action)} disabled={busyKey === action.action_key}>{busyKey === action.action_key ? "Saving…" : "Mark done"}</button>
                </div>
              </article>
            ))}
          </div>
        )}

        {pagination}

        <footer className={styles.footerNote}>The queue never sends email, changes a PI to a later sales stage, or schedules meetings by itself. It only surfaces work and records the actions you explicitly complete or schedule.</footer>
      </div>
    </section>
  );
}