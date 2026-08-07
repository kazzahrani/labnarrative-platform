"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { browserSupabase as supabase } from "@/lib/supabase-browser";
import styles from "./LiveProductionQueue.module.css";

type Prospect = {
  pi_name?: string;
  institution?: string;
  status?: string;
};

type Site = {
  slug?: string;
  domain_url?: string | null;
};

type Run = {
  id: string;
  prospect_id: string;
  status: string;
  current_step: string;
  retry_count: number;
  recovery_status: string | null;
  recovery_next_attempt_at: string | null;
  portrait_recovery_attempts: number;
  portrait_recovery_status: string | null;
  portrait_recovery_next_attempt_at: string | null;
  last_heartbeat_at: string | null;
  updated_at: string;
  error_message: string | null;
  site_id: string | null;
  prospects: Prospect | null;
  sites: Site | null;
};

type PipelineEvent = {
  id: number;
  production_run_id: string | null;
  event_type: string;
  step: string;
  message: string;
  created_at: string;
};

const stages = ["research", "content", "website", "portrait", "images", "qa", "domain", "email_draft", "final_review"];

function stageIndex(step: string) {
  const aliases: Record<string, string> = {
    image_quality: "images",
    qa_recovery: "qa",
    send: "final_review",
    completed: "final_review",
  };
  return Math.max(0, stages.indexOf(aliases[step] || step));
}

function pretty(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function retryAt(run: Run) {
  return run.current_step === "portrait" ? run.portrait_recovery_next_attempt_at : run.recovery_next_attempt_at;
}

function recoveryAttempts(run: Run) {
  return run.current_step === "portrait" ? run.portrait_recovery_attempts || 0 : run.retry_count || 0;
}

function operationalState(run: Run) {
  if (run.status === "running") return { key: "running", label: "Running" };
  if (run.status === "awaiting_final_review" || run.status === "approved_to_send") return { key: "ready", label: "Awaiting Final Review" };
  if (run.recovery_status === "waiting_manual_fix" || run.status === "paused") return { key: "manual", label: "Waiting Manual Fix" };
  const next = retryAt(run);
  if (next && new Date(next).getTime() > Date.now()) return { key: "waiting", label: "Waiting Retry" };
  if (run.status === "needs_attention") return { key: "recovering", label: "Recovering" };
  return { key: "waiting", label: pretty(run.status) };
}

function relativeTime(value: string | null | undefined, now: number) {
  if (!value) return "No activity yet";
  const diff = Math.max(0, Math.floor((now - new Date(value).getTime()) / 1000));
  if (diff < 5) return "just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function LiveProductionQueue() {
  const [mountNode, setMountNode] = useState<HTMLElement | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [events, setEvents] = useState<PipelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (typeof window === "undefined" || window.location.pathname !== "/admin/automation") return;

    let disposed = false;
    let original: HTMLElement | null = null;
    let mount: HTMLDivElement | null = null;

    const install = () => {
      if (disposed || mount) return;
      const sections = Array.from(document.querySelectorAll("section")) as HTMLElement[];
      original = sections.find((section) => {
        const text = section.textContent || "";
        return text.includes("Current production") || (text.includes("Production queue") && text.includes("Ready for the next PI"));
      }) || null;

      if (!original?.parentElement) return;
      mount = document.createElement("div");
      mount.dataset.liveProductionQueue = "true";
      original.parentElement.insertBefore(mount, original);
      original.style.display = "none";
      setMountNode(mount);
    };

    install();
    const observer = new MutationObserver(install);
    observer.observe(document.body, { childList: true, subtree: true });
    const timer = window.setInterval(install, 500);

    return () => {
      disposed = true;
      observer.disconnect();
      window.clearInterval(timer);
      if (original) original.style.display = "";
      if (mount) mount.remove();
      setMountNode(null);
    };
  }, []);

  const load = useCallback(async () => {
    const { data: runData, error: runError } = await supabase
      .from("production_runs")
      .select("id,prospect_id,status,current_step,retry_count,recovery_status,recovery_next_attempt_at,portrait_recovery_attempts,portrait_recovery_status,portrait_recovery_next_attempt_at,last_heartbeat_at,updated_at,error_message,site_id,prospects(pi_name,institution,status),sites(slug,domain_url)")
      .in("status", ["running", "needs_attention", "paused"])
      .order("updated_at", { ascending: false });

    if (runError) {
      setError(runError.message);
      setLoading(false);
      return;
    }

    const nextRuns = (runData || []) as unknown as Run[];
    const ids = nextRuns.map((run) => run.id);
    let nextEvents: PipelineEvent[] = [];

    if (ids.length) {
      const { data: eventData, error: eventError } = await supabase
        .from("pipeline_events")
        .select("id,production_run_id,event_type,step,message,created_at")
        .in("production_run_id", ids)
        .order("created_at", { ascending: false })
        .limit(250);
      if (!eventError) nextEvents = (eventData || []) as PipelineEvent[];
    }

    setRuns(nextRuns);
    setEvents(nextEvents);
    setError("");
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!mountNode) return;
    void load();
    const poll = window.setInterval(() => void load(), 10_000);
    const clock = window.setInterval(() => setNow(Date.now()), 1_000);

    const channel = supabase
      .channel("labnarrative-live-production-queue")
      .on("postgres_changes", { event: "*", schema: "public", table: "production_runs" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "pipeline_events" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "sites" }, () => void load())
      .subscribe();

    return () => {
      window.clearInterval(poll);
      window.clearInterval(clock);
      void supabase.removeChannel(channel);
    };
  }, [load, mountNode]);

  const latestEventByRun = useMemo(() => {
    const map = new Map<string, PipelineEvent>();
    for (const event of events) {
      if (event.production_run_id && !map.has(event.production_run_id)) map.set(event.production_run_id, event);
    }
    return map;
  }, [events]);

  const sortedRuns = useMemo(() => {
    const activityTime = (run: Run) => {
      const latestEvent = latestEventByRun.get(run.id);
      const value = latestEvent?.created_at || run.last_heartbeat_at || run.updated_at;
      const timestamp = value ? new Date(value).getTime() : 0;
      return Number.isFinite(timestamp) ? timestamp : 0;
    };

    const progression = (run: Run) => {
      const latestEvent = latestEventByRun.get(run.id);
      return stageIndex(latestEvent?.step || run.current_step || "research");
    };

    return [...runs].sort((left, right) => {
      const recentActivityDifference = activityTime(right) - activityTime(left);
      if (recentActivityDifference !== 0) return recentActivityDifference;

      const progressionDifference = progression(right) - progression(left);
      if (progressionDifference !== 0) return progressionDifference;

      return new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime();
    });
  }, [latestEventByRun, runs]);

  if (!mountNode) return null;

  return createPortal(
    <section className={styles.card} aria-label="Live production queue">
      <div className={styles.header}>
        <div>
          <p className={styles.kicker}>Production queue</p>
          <h2>Live production & recovery</h2>
          <p className={styles.subtle}>Updates automatically as workers build, retry and repair concepts.</p>
        </div>
        <div className={styles.live}><span />LIVE</div>
      </div>

      {loading ? <p className={styles.empty}>Loading live worker activity…</p> : null}
      {error ? <p className={styles.error}>{error}</p> : null}
      {!loading && !error && sortedRuns.length === 0 ? <p className={styles.empty}>No PI is currently in production or automated recovery.</p> : null}

      <div className={styles.list}>
        {sortedRuns.map((run) => {
          const latestEvent = latestEventByRun.get(run.id);
          const state = operationalState(run);
          const currentIndex = stageIndex(latestEvent?.step || run.current_step || "research");
          const latestActivity = latestEvent?.created_at || run.last_heartbeat_at || run.updated_at;
          const siteUrl = run.sites?.domain_url || (run.sites?.slug ? `https://${run.sites.slug}.labnarrative.com` : "");
          const currentAction = latestEvent?.message || run.error_message || `${pretty(run.current_step)} in progress.`;
          const nextRetry = retryAt(run);

          return (
            <article className={styles.run} key={run.id}>
              <div className={styles.runHeader}>
                <div>
                  <h3>{run.prospects?.pi_name || "Active PI"}</h3>
                  <p>{run.prospects?.institution || ""}</p>
                </div>
                <span className={styles.state} data-state={state.key}>{state.label}</span>
              </div>

              <div className={styles.progress} aria-label={`Current step ${pretty(run.current_step)}`}>
                {stages.map((stage, index) => {
                  const done = index < currentIndex;
                  const active = index === currentIndex;
                  return (
                    <div className={styles.stage} data-active={active} data-done={done} key={stage} title={pretty(stage)}>
                      <span>{done ? "✓" : active ? "•" : ""}</span>
                      <small>{pretty(stage).replace("Email Draft", "Email")}</small>
                    </div>
                  );
                })}
              </div>

              <div className={styles.details}>
                <div><span>Current</span><strong>{currentAction}</strong></div>
                <div><span>Recovery attempt</span><strong>{recoveryAttempts(run)}</strong></div>
                <div><span>Last activity</span><strong>{relativeTime(latestActivity, now)}</strong></div>
              </div>

              {state.key === "waiting" && nextRetry ? (
                <p className={styles.retry}>Next automatic retry: {new Date(nextRetry).toLocaleTimeString("en-GB", { timeZone: "Asia/Riyadh", hour: "2-digit", minute: "2-digit" })}</p>
              ) : null}

              <div className={styles.actions}>
                {siteUrl ? <a href={siteUrl} target="_blank" rel="noreferrer">Open concept ↗</a> : <span>Website checkpoint pending</span>}
                {run.sites?.slug ? <Link href={`/admin?site=${run.sites.slug}`}>Open editor</Link> : null}
              </div>
            </article>
          );
        })}
      </div>
    </section>,
    mountNode,
  );
}
