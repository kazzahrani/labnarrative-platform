"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { browserSupabase as supabase } from "@/lib/supabase-browser";
import styles from "./AdminVideoStudio.module.css";

type LeagueBot = {
  id: string;
  slug: string;
  name: string;
  publishedAt: string;
  updatedAt: string;
};

type VideoJob = {
  id: string;
  league_entry_id: string;
  league_slug: string;
  bot_name: string;
  bot_snapshot: {
    creator?: string;
    pair?: string;
    versionNumber?: number;
    totalReturn?: number | null;
    maxDrawdown?: number | null;
    winRate?: number | null;
    closedTrades?: number;
    ageDays?: number;
    benchmark?: { returnPct?: number | null } | null;
  };
  language: "en" | "ar";
  duration_seconds: number;
  video_type: string;
  voice_name: string;
  script: string;
  caption: string;
  status: "draft" | "queued" | "processing" | "completed" | "failed" | "approved";
  worker_task_id: string | null;
  worker_progress: number;
  output_url: string | null;
  error: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
};

type StudioPayload = {
  renderer?: { configured?: boolean };
  bots?: LeagueBot[];
  jobs?: VideoJob[];
  message?: string;
  error?: string;
};

const VOICES = {
  en: [
    { value: "en-US-GuyNeural", label: "Male · US English" },
    { value: "en-US-JennyNeural", label: "Female · US English" },
  ],
  ar: [
    { value: "ar-SA-HamedNeural", label: "Male · Saudi Arabic" },
    { value: "ar-SA-ZariyahNeural", label: "Female · Saudi Arabic" },
  ],
} as const;

const TYPE_LABELS: Record<string, string> = {
  performance_story: "Performance story",
  strategy_explainer: "Strategy explanation",
  educational: "Educational",
};

function signedPct(value?: number | null) {
  if (value == null || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${Math.abs(value).toFixed(1)}%`;
}

function drawdown(value?: number | null) {
  if (value == null || !Number.isFinite(value)) return "—";
  return value === 0 ? "0.0%" : `−${Math.abs(value).toFixed(1)}%`;
}

function age(days?: number) {
  if (days == null || !Number.isFinite(days)) return "—";
  if (days < 1) return "<1d";
  if (days < 60) return `${Math.floor(days)}d`;
  return `${(days / 30.4375).toFixed(1)}mo`;
}

function when(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function statusLabel(status: VideoJob["status"]) {
  if (status === "queued") return "Queued";
  if (status === "processing") return "Rendering";
  if (status === "completed") return "Ready for approval";
  if (status === "approved") return "Approved";
  if (status === "failed") return "Failed";
  return "Brief only";
}

export default function AdminVideoStudio() {
  const [bots, setBots] = useState<LeagueBot[]>([]);
  const [jobs, setJobs] = useState<VideoJob[]>([]);
  const [rendererConnected, setRendererConnected] = useState(false);
  const [selectedBot, setSelectedBot] = useState("");
  const [language, setLanguage] = useState<"en" | "ar">("en");
  const [durationSeconds, setDurationSeconds] = useState(30);
  const [videoType, setVideoType] = useState("performance_story");
  const [voiceName, setVoiceName] = useState<string>(VOICES.en[0].value);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const refreshingRef = useRef(false);

  async function accessToken() {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("Sign in with an authorized internal account first.");
    return token;
  }

  async function load(showSpinner = true) {
    if (showSpinner) setLoading(true);
    setError("");
    try {
      const token = await accessToken();
      const response = await fetch("/api/admin/video-studio", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const payload = await response.json() as StudioPayload;
      if (!response.ok) throw new Error(payload.error || "Unable to load Video Studio.");
      const nextBots = Array.isArray(payload.bots) ? payload.bots : [];
      setBots(nextBots);
      setJobs(Array.isArray(payload.jobs) ? payload.jobs : []);
      setRendererConnected(Boolean(payload.renderer?.configured));
      setSelectedBot((current) => current || nextBots[0]?.id || "");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load Video Studio.");
    } finally {
      if (showSpinner) setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    setVoiceName(VOICES[language][0].value);
  }, [language]);

  useEffect(() => {
    return () => {
      for (const url of Object.values(previewUrls)) URL.revokeObjectURL(url);
    };
  }, [previewUrls]);

  const activeJobs = useMemo(
    () => jobs.filter((job) => (job.status === "queued" || job.status === "processing") && Boolean(job.worker_task_id)),
    [jobs],
  );

  useEffect(() => {
    if (!activeJobs.length) return;
    const timer = window.setInterval(() => {
      if (refreshingRef.current) return;
      refreshingRef.current = true;
      void Promise.all(activeJobs.map((job) => refreshJob(job.id, true))).finally(() => {
        refreshingRef.current = false;
      });
    }, 7000);
    return () => window.clearInterval(timer);
  }, [activeJobs.map((job) => `${job.id}:${job.status}`).join("|")]);

  async function createVideo() {
    if (!selectedBot) {
      setError("Choose a League bot first.");
      return;
    }
    setBusy("create");
    setError("");
    setNotice("");
    try {
      const token = await accessToken();
      const response = await fetch("/api/admin/video-studio", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          entryId: selectedBot,
          language,
          durationSeconds,
          videoType,
          voiceName,
        }),
      });
      const payload = await response.json() as StudioPayload & { job?: VideoJob };
      if (!response.ok && !payload.job) throw new Error(payload.error || "Unable to create video.");
      if (payload.job) setJobs((current) => [payload.job as VideoJob, ...current.filter((job) => job.id !== payload.job?.id)]);
      setRendererConnected(Boolean(payload.renderer?.configured));
      if (payload.error) setError(payload.error);
      else setNotice(payload.message || (payload.renderer?.configured ? "Video sent to the renderer." : "Video brief created. Renderer connection is still required for the MP4."));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to create video.");
    } finally {
      setBusy("");
    }
  }

  async function refreshJob(id: string, quiet = false) {
    if (!quiet) setBusy(`refresh:${id}`);
    try {
      const token = await accessToken();
      const response = await fetch("/api/admin/video-studio", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ id, action: "refresh" }),
      });
      const payload = await response.json() as { job?: VideoJob; error?: string };
      if (payload.job) setJobs((current) => current.map((job) => job.id === id ? payload.job as VideoJob : job));
      if (!response.ok && !quiet) throw new Error(payload.error || "Unable to refresh renderer status.");
    } catch (caught) {
      if (!quiet) setError(caught instanceof Error ? caught.message : "Unable to refresh renderer status.");
    } finally {
      if (!quiet) setBusy("");
    }
  }

  async function approveJob(id: string) {
    setBusy(`approve:${id}`);
    setError("");
    try {
      const token = await accessToken();
      const response = await fetch("/api/admin/video-studio", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ id, action: "approve" }),
      });
      const payload = await response.json() as { job?: VideoJob; error?: string };
      if (!response.ok || !payload.job) throw new Error(payload.error || "Unable to approve video.");
      setJobs((current) => current.map((job) => job.id === id ? payload.job as VideoJob : job));
      setNotice("Approved. Publishing is still manual in this MVP.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to approve video.");
    } finally {
      setBusy("");
    }
  }

  async function loadPreview(job: VideoJob) {
    setBusy(`preview:${job.id}`);
    setError("");
    try {
      const token = await accessToken();
      const response = await fetch(`/api/admin/video-studio/media/${encodeURIComponent(job.id)}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || "Unable to load video preview.");
      }
      const blob = await response.blob();
      const nextUrl = URL.createObjectURL(blob);
      setPreviewUrls((current) => {
        if (current[job.id]) URL.revokeObjectURL(current[job.id]);
        return { ...current, [job.id]: nextUrl };
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load video preview.");
    } finally {
      setBusy("");
    }
  }

  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
    setNotice("Copied.");
  }

  if (loading) return <div className={styles.state}>Loading Video Studio…</div>;

  return <main className={styles.page}>
    <header className={styles.header}>
      <div>
        <div className={styles.eyebrow}>LABNARRATIVE · INTERNAL CONTENT</div>
        <h1>Video Studio</h1>
        <p>Turn real Bot League performance into short-form video briefs and rendered 9:16 clips.</p>
      </div>
      <div className={styles.headerActions}>
        <span className={rendererConnected ? styles.connected : styles.disconnected}>
          <i />{rendererConnected ? "Renderer connected" : "Renderer not connected"}
        </span>
        <button onClick={() => void load(false)}>Refresh</button>
      </div>
    </header>

    {error ? <div className={styles.error}>{error}</div> : null}
    {notice ? <div className={styles.notice}>{notice}</div> : null}

    <section className={styles.builder}>
      <div className={styles.builderIntro}>
        <span>NEW VIDEO</span>
        <h2>League bot → short-form story</h2>
        <p>Facts come from the public League snapshot. Nothing is auto-published.</p>
      </div>

      <div className={styles.formGrid}>
        <label>
          <span>League bot</span>
          <select value={selectedBot} onChange={(event) => setSelectedBot(event.target.value)}>
            {bots.map((bot) => <option key={bot.id} value={bot.id}>{bot.name}</option>)}
          </select>
        </label>

        <label>
          <span>Video type</span>
          <select value={videoType} onChange={(event) => setVideoType(event.target.value)}>
            <option value="performance_story">Performance story</option>
            <option value="strategy_explainer">Strategy explanation</option>
            <option value="educational">Educational</option>
          </select>
        </label>

        <label>
          <span>Language</span>
          <select value={language} onChange={(event) => setLanguage(event.target.value as "en" | "ar")}>
            <option value="en">English</option>
            <option value="ar">Saudi Arabic</option>
          </select>
        </label>

        <label>
          <span>Voice</span>
          <select value={voiceName} onChange={(event) => setVoiceName(event.target.value)}>
            {VOICES[language].map((voice) => <option key={voice.value} value={voice.value}>{voice.label}</option>)}
          </select>
        </label>

        <label>
          <span>Length</span>
          <div className={styles.segmented}>
            {[15, 30, 45, 60].map((seconds) => <button key={seconds} type="button" className={durationSeconds === seconds ? styles.segmentActive : ""} onClick={() => setDurationSeconds(seconds)}>{seconds}s</button>)}
          </div>
        </label>

        <div className={styles.createCell}>
          <button className={styles.primary} disabled={busy === "create" || !selectedBot} onClick={() => void createVideo()}>
            {busy === "create" ? "Preparing…" : rendererConnected ? "Generate video" : "Create video brief"}
          </button>
          {!rendererConnected ? <small>The brief works now; rendering starts once MPT_WORKER_URL is configured.</small> : <small>Sent privately to the LabNarrative media worker.</small>}
        </div>
      </div>
    </section>

    <section className={styles.jobsHeader}>
      <div><span>RECENT JOBS</span><h2>Review queue</h2></div>
      <strong>{jobs.length}</strong>
    </section>

    <section className={styles.jobs}>
      {jobs.length === 0 ? <div className={styles.empty}>No video jobs yet. Create the first one above.</div> : jobs.map((job) => {
        const snap = job.bot_snapshot || {};
        const preview = previewUrls[job.id];
        const running = job.status === "queued" || job.status === "processing";
        return <article key={job.id} className={styles.job}>
          <div className={styles.jobTop}>
            <div>
              <div className={styles.jobMeta}>
                <span>{job.language === "ar" ? "SAUDI ARABIC" : "ENGLISH"}</span>
                <span>{TYPE_LABELS[job.video_type] || job.video_type}</span>
                <span>{job.duration_seconds}s</span>
              </div>
              <h3>{job.bot_name}</h3>
              <p>{snap.creator || "League creator"} · {snap.pair || "Crypto"} · V{snap.versionNumber || 1}</p>
            </div>
            <div className={`${styles.status} ${styles[`status_${job.status}`] || ""}`}>{statusLabel(job.status)}</div>
          </div>

          <div className={styles.metrics}>
            <div><span>Return</span><strong>{signedPct(snap.totalReturn)}</strong></div>
            <div><span>Max DD</span><strong>{drawdown(snap.maxDrawdown)}</strong></div>
            <div><span>Closed trades</span><strong>{snap.closedTrades ?? "—"}</strong></div>
            <div><span>Age</span><strong>{age(snap.ageDays)}</strong></div>
          </div>

          {running ? <div className={styles.progress}><div style={{ width: `${Math.max(4, job.worker_progress || 0)}%` }} /><span>{job.worker_progress || 0}%</span></div> : null}
          {job.error ? <div className={styles.jobError}>{job.error}</div> : null}

          <div className={styles.contentGrid}>
            <details open={job.status === "draft"}>
              <summary>Script</summary>
              <div className={job.language === "ar" ? styles.arabicText : styles.copyText}>{job.script}</div>
              <button onClick={() => void copy(job.script)}>Copy script</button>
            </details>
            <details>
              <summary>Caption</summary>
              <div className={job.language === "ar" ? styles.arabicText : styles.copyText}>{job.caption}</div>
              <button onClick={() => void copy(job.caption)}>Copy caption</button>
            </details>
          </div>

          {preview ? <div className={styles.videoWrap}><video src={preview} controls playsInline preload="metadata" /></div> : null}

          <div className={styles.jobActions}>
            {running ? <button disabled={busy === `refresh:${job.id}`} onClick={() => void refreshJob(job.id)}>{busy === `refresh:${job.id}` ? "Checking…" : "Check status"}</button> : null}
            {(job.status === "completed" || job.status === "approved") && job.output_url ? <button disabled={busy === `preview:${job.id}`} onClick={() => void loadPreview(job)}>{busy === `preview:${job.id}` ? "Loading…" : preview ? "Reload preview" : "Load preview"}</button> : null}
            {job.status === "completed" ? <button className={styles.approve} disabled={busy === `approve:${job.id}`} onClick={() => void approveJob(job.id)}>{busy === `approve:${job.id}` ? "Approving…" : "Approve"}</button> : null}
            <a href="/trader" target="_blank" rel="noreferrer">Open trading ↗</a>
            <span className={styles.timestamp}>{when(job.created_at)}</span>
          </div>
        </article>;
      })}
    </section>

    <footer className={styles.footer}>Internal only · Video generation uses public Paper Bot League facts · No content is auto-published without approval.</footer>
  </main>;
}
