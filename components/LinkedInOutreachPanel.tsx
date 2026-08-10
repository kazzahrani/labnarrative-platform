"use client";

import { createClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./linkedin-outreach.module.css";

type LinkedInStatus = "not_contacted" | "connected" | "message_sent" | "replied";

type TrackingRow = {
  prospect_id: string;
  profile_url: string;
  status: LinkedInStatus;
  connection_note: string;
  last_action_at: string | null;
  updated_at: string;
};

type ProspectRow = {
  id: string;
  pi_name: string;
  institution: string;
  research_area: string;
  email: string;
};

type OutreachRow = TrackingRow & { prospect: ProspectRow };

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
);

const STATUS_OPTIONS: Array<{ value: LinkedInStatus; label: string }> = [
  { value: "not_contacted", label: "Not contacted" },
  { value: "connected", label: "Connected" },
  { value: "message_sent", label: "Message sent" },
  { value: "replied", label: "Replied" },
];

const PAGE_SIZES = [5, 10, 25, 50, 100] as const;
type PageSize = (typeof PAGE_SIZES)[number];

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

function familyName(piName: string): string {
  const cleaned = piName
    .replace(/\b(Professor|Prof\.?|Doctor|Dr\.?|Ph\.?D\.?|DPhil|M\.?D\.?|MD|FRS|FMedSci|MBA|MSc|MS)\b/gi, " ")
    .replace(/[,.()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const parts = cleaned.split(" ").filter(Boolean);
  return parts.at(-1) || "Professor";
}

function connectionNote(piName: string): string {
  const surname = familyName(piName);
  return `Dear Professor ${surname}, I recently sent you a website concept I prepared for your laboratory. I’m also a molecular oncology researcher working in p53 and cell-cycle biology, so I wanted to connect here as well. Best wishes, Khaled`;
}

function postAcceptMessage(piName: string): string {
  const surname = familyName(piName);
  return `Thank you for connecting, Professor ${surname}. I hope you had a chance to see the laboratory website concept I sent. I’d be very interested to hear what you think of the direction.`;
}

function linkedinSearchUrl(piName: string, institution: string): string {
  const query = [piName, institution].filter(Boolean).join(" ");
  return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(query)}`;
}

function statusLabel(status: LinkedInStatus): string {
  return STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status;
}

export default function LinkedInOutreachPanel() {
  const [rows, setRows] = useState<OutreachRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [draftUrls, setDraftUrls] = useState<Record<string, string>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState<PageSize>(10);
  const [page, setPage] = useState(1);

  const loadRows = useCallback(async () => {
    setLoading(true);
    setNotice("");

    const { data: trackingData, error: trackingError } = await supabase
      .from("linkedin_outreach")
      .select("prospect_id,profile_url,status,connection_note,last_action_at,updated_at")
      .order("updated_at", { ascending: false });

    if (trackingError) {
      setNotice(trackingError.message);
      setLoading(false);
      return;
    }

    const trackingRows = (trackingData ?? []) as TrackingRow[];
    const ids = trackingRows.map((row) => row.prospect_id);
    if (ids.length === 0) {
      setRows([]);
      setLoading(false);
      return;
    }

    const { data: prospectData, error: prospectError } = await supabase
      .from("prospects")
      .select("id,pi_name,institution,research_area,email")
      .in("id", ids);

    if (prospectError) {
      setNotice(prospectError.message);
      setLoading(false);
      return;
    }

    const prospectMap = new Map(((prospectData ?? []) as ProspectRow[]).map((prospect) => [prospect.id, prospect]));
    const merged = trackingRows.flatMap((tracking) => {
      const prospect = prospectMap.get(tracking.prospect_id);
      return prospect ? [{ ...tracking, prospect }] : [];
    });

    setRows(merged);
    setDraftUrls(Object.fromEntries(merged.map((row) => [row.prospect_id, row.profile_url || ""])));
    setLoading(false);
  }, []);

  useEffect(() => { void loadRows(); }, [loadRows]);
  useEffect(() => { setPage(1); }, [search, pageSize]);

  const updateStatus = useCallback(async (prospectId: string, status: LinkedInStatus) => {
    setSavingId(prospectId);
    setNotice("");
    const now = new Date().toISOString();
    const { error } = await supabase.from("linkedin_outreach").update({ status, last_action_at: now, updated_at: now }).eq("prospect_id", prospectId);
    if (error) setNotice(error.message);
    else setRows((current) => current.map((row) => row.prospect_id === prospectId ? { ...row, status, last_action_at: now, updated_at: now } : row));
    setSavingId(null);
  }, []);

  const saveProfile = useCallback(async (prospectId: string) => {
    const profileUrl = (draftUrls[prospectId] ?? "").trim();
    if (profileUrl && !/^https:\/\/(www\.)?linkedin\.com\//i.test(profileUrl)) {
      setNotice("Please use a LinkedIn profile URL beginning with https://linkedin.com/ or https://www.linkedin.com/.");
      return;
    }
    setSavingId(prospectId);
    setNotice("");
    const now = new Date().toISOString();
    const { error } = await supabase.from("linkedin_outreach").update({ profile_url: profileUrl, updated_at: now }).eq("prospect_id", prospectId);
    if (error) setNotice(error.message);
    else setRows((current) => current.map((row) => row.prospect_id === prospectId ? { ...row, profile_url: profileUrl, updated_at: now } : row));
    setSavingId(null);
  }, [draftUrls]);

  const copyMessage = useCallback(async (prospectId: string, kind: "connection" | "post_accept", message: string) => {
    const key = `${prospectId}:${kind}`;
    try {
      await navigator.clipboard.writeText(message);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey((current) => current === key ? null : current), 1600);
    } catch {
      setNotice("Clipboard access was unavailable. Select and copy the message manually.");
    }
  }, []);

  const visibleRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = rows.filter((row) => !query || [row.prospect.pi_name, row.prospect.institution, row.prospect.email, row.status].join(" ").toLowerCase().includes(query));
    const priority: Record<LinkedInStatus, number> = { replied: 4, message_sent: 3, connected: 2, not_contacted: 1 };
    return [...filtered].sort((a, b) => priority[b.status] - priority[a.status] || a.prospect.pi_name.localeCompare(b.prospect.pi_name));
  }, [rows, search]);

  const counts = useMemo(() => ({
    total: rows.length,
    notContacted: rows.filter((row) => row.status === "not_contacted").length,
    connected: rows.filter((row) => row.status === "connected").length,
    messageSent: rows.filter((row) => row.status === "message_sent").length,
    replied: rows.filter((row) => row.status === "replied").length,
  }), [rows]);

  const totalPages = Math.max(1, Math.ceil(visibleRows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const pagedRows = visibleRows.slice(pageStart, pageStart + pageSize);
  const rangeStart = visibleRows.length ? pageStart + 1 : 0;
  const rangeEnd = Math.min(visibleRows.length, pageStart + pageSize);

  const pagination = (position: "top" | "bottom") => (
    <div className={`${styles.pagination} ${position === "bottom" ? styles.paginationBottom : ""}`}>
      <span>{rangeStart}–{rangeEnd} of {visibleRows.length}</span>
      <div className={styles.paginationControls}>
        <label>Show
          <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value) as PageSize)} aria-label="LinkedIn outreach items per page">
            {PAGE_SIZES.map((size) => <option value={size} key={size}>{size}</option>)}
          </select>
        </label>
        <div className={styles.pageButtons}>
          <button type="button" disabled={currentPage <= 1} onClick={() => setPage(Math.max(1, currentPage - 1))}>‹</button>
          {pageNumbers(currentPage, totalPages).map((value, index) => value === "…"
            ? <span key={`ellipsis-${position}-${index}`}>…</span>
            : <button type="button" key={`${position}-${value}`} aria-current={value === currentPage ? "page" : undefined} onClick={() => setPage(value)}>{value}</button>)}
          <button type="button" disabled={currentPage >= totalPages} onClick={() => setPage(Math.min(totalPages, currentPage + 1))}>›</button>
        </div>
      </div>
    </div>
  );

  return (
    <section className={styles.section} aria-label="LinkedIn outreach">
      <div className={styles.panel}>
        <div className={styles.header}>
          <div className={styles.headerCopy}>
            <p className={styles.kicker}>Second-touch channel</p>
            <h2>LinkedIn Outreach</h2>
            <p className={styles.description}>Use the connection note when you send the request. After the PI accepts, the dashboard reveals a lighter follow-up message. You still send everything yourself on LinkedIn.</p>
          </div>
          <div className={styles.headerActions}>
            <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search emailed PIs…" aria-label="Search LinkedIn outreach" />
            <button type="button" onClick={() => void loadRows()} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</button>
          </div>
        </div>

        <div className={styles.summary}>
          <span><strong>{counts.total}</strong> eligible</span>
          <span><strong>{counts.notContacted}</strong> not contacted</span>
          <span><strong>{counts.connected}</strong> connected</span>
          <span><strong>{counts.messageSent}</strong> messaged</span>
          <span><strong>{counts.replied}</strong> replied</span>
        </div>

        {notice && <p className={styles.notice}>{notice}</p>}
        {pagination("top")}

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <colgroup><col className={styles.colPi} /><col className={styles.colProfile} /><col className={styles.colMessage} /><col className={styles.colStatus} /></colgroup>
            <thead><tr><th>Principal investigator</th><th>LinkedIn profile</th><th>Prepared messages</th><th>Status</th></tr></thead>
            <tbody>
              {pagedRows.map((row) => {
                const note = row.connection_note.trim() || connectionNote(row.prospect.pi_name);
                const followUp = postAcceptMessage(row.prospect.pi_name);
                const profileUrl = draftUrls[row.prospect_id] ?? row.profile_url;
                const busy = savingId === row.prospect_id;
                const showPostAccept = row.status === "connected" || row.status === "message_sent" || row.status === "replied";
                return (
                  <tr key={row.prospect_id}>
                    <td className={styles.piCell}><strong>{row.prospect.pi_name}</strong><small>{row.prospect.institution || "—"}</small><small>{row.prospect.email || "—"}</small></td>
                    <td><div className={styles.profileEditor}><input value={profileUrl} onChange={(event) => setDraftUrls((current) => ({ ...current, [row.prospect_id]: event.target.value }))} placeholder="Paste LinkedIn profile URL" aria-label={`LinkedIn profile for ${row.prospect.pi_name}`} /><div className={styles.profileActions}><button type="button" onClick={() => void saveProfile(row.prospect_id)} disabled={busy}>Save</button><a href={row.profile_url || linkedinSearchUrl(row.prospect.pi_name, row.prospect.institution)} target="_blank" rel="noreferrer">{row.profile_url ? "Open profile ↗" : "Find on LinkedIn ↗"}</a></div></div></td>
                    <td><div className={styles.messageStack}><div className={styles.noteBox}><small className={styles.noteLabel}>Connection request note</small><p>{note}</p><button type="button" onClick={() => void copyMessage(row.prospect_id, "connection", note)}>{copiedKey === `${row.prospect_id}:connection` ? "✓ Copied" : "Copy connection note"}</button></div>{showPostAccept && <div className={`${styles.noteBox} ${styles.followUpBox}`}><small className={styles.noteLabel}>After they accept</small><p>{followUp}</p><button type="button" onClick={() => void copyMessage(row.prospect_id, "post_accept", followUp)}>{copiedKey === `${row.prospect_id}:post_accept` ? "✓ Copied" : "Copy follow-up"}</button></div>}</div></td>
                    <td><select className={`${styles.status} ${styles[`status_${row.status}`]}`} value={row.status} onChange={(event) => void updateStatus(row.prospect_id, event.target.value as LinkedInStatus)} disabled={busy} aria-label={`LinkedIn status for ${row.prospect.pi_name}`}>{STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><small className={styles.statusHint}>{statusLabel(row.status)}</small></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!loading && visibleRows.length === 0 && <div className={styles.empty}>{search ? "No LinkedIn outreach records match this search." : "No emailed PIs are ready for LinkedIn outreach yet."}</div>}
        </div>

        {pagination("bottom")}
      </div>
    </section>
  );
}
