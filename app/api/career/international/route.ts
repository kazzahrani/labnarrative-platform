/* Public vacancy metadata bridge for International Career Radar.
 * Only factual vacancy records published as GitHub issues are read.
 * No private CV or workspace token is sent to GitHub. */
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const BASE = "https://api.github.com/repos/kazzahrani/labnarrative-platform/issues";
const PREFIX = "[CAREER-RADAR]";
const TAG = /<!--\s*career-international-v1\s*([\s\S]*?)\s*-->/i;
const allowedCountries = new Set([
  "Ireland", "United Kingdom", "Germany", "Austria", "Switzerland",
  "Netherlands", "Finland", "Canada", "New Zealand", "Australia", "Norway"
]);
type Job = {
  id: number;
  title: string;
  organization: string;
  country: string;
  city: string | null;
  source_url: string;
  deadline: string | null;
  salary: string | null;
  fit_score: number;
  track: string;
  fit_reason: string;
  gaps: string;
  visa_status: "confirmed_sponsorship" | "unknown" | "restricted";
  verified_on: string;
  issue_url: string;
};
type Issue = {
  number?: number;
  title?: string;
  body?: string | null;
  html_url?: string;
  pull_request?: unknown;
};
function short(v: unknown, max = 240) {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}
function validDate(v: unknown) {
  const s = short(v, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) ? s : null;
}
function validUrl(v: unknown) {
  try {
    const u = new URL(String(v ?? ""));
    if (u.protocol !== "https:" || u.username || u.password) return null;
    return u.toString();
  } catch { return null; }
}
function parseJob(issue: Issue): Job | null {
  if (!issue.title?.startsWith(PREFIX) || issue.pull_request || !issue.body || !issue.number) return null;
  const tag = issue.body.match(TAG);
  if (!tag || tag[1].length > 12000) return null;
  try {
    const j = JSON.parse(tag[1]) as Record<string, unknown>;
    const country = short(j.country, 64);
    const url = validUrl(j.source_url);
    const verified = validDate(j.verified_on);
    const deadline = validDate(j.deadline);
    const today = new Date().toISOString().slice(0, 10);
    const fit = Number(j.fit_score);
    if (!allowedCountries.has(country) || !url || !verified || verified > today) return null;
    if (deadline && deadline < today) return null;
    if (!Number.isFinite(fit) || fit < 70 || fit > 100) return null;
    const title = short(j.title, 160);
    const organization = short(j.organization, 160);
    if (!title || !organization || !short(j.fit_reason) || !short(j.track)) return null;
    const visa = j.visa_status;
    return {
      id: issue.number,
      title, organization, country,
      city: short(j.city, 90) || null,
      source_url: url,
      deadline,
      salary: short(j.salary, 100) || null,
      fit_score: Math.round(fit),
      track: short(j.track, 100),
      fit_reason: short(j.fit_reason, 450),
      gaps: short(j.gaps, 450),
      visa_status: visa === "confirmed_sponsorship" || visa === "restricted" ? visa : "unknown",
      verified_on: verified,
      issue_url: validUrl(issue.html_url) || "",
    };
  } catch { return null; }
}
export async function GET() {
  try {
    const issues: Issue[] = [];
    for (let page = 1; page <= 3; page++) {
      const r = await fetch(BASE + "?state=open&per_page=100&sort=created&direction=desc&page=" + page, {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "LabNarrative-Career-Radar/1.0",
          "X-GitHub-Api-Version": "2022-11-28"
        },
        next: { revalidate: 600 }
      });
      if (!r.ok) throw new Error("GitHub job index returned " + r.status);
      const rows = await r.json();
      if (!Array.isArray(rows)) throw new Error("Unexpected job index response");
      issues.push(...rows);
      if (rows.length < 100) break;
    }
    const seen = new Set<string>();
    const jobs = issues.map(parseJob).filter((x): x is Job => Boolean(x))
      .filter(j => {
        const key = j.source_url.split("?")[0].replace(/\/$/, "").toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => b.fit_score - a.fit_score || b.verified_on.localeCompare(a.verified_on))
      .slice(0, 60);
    return NextResponse.json({ ok: true, source: "public_vacancy_records", jobs, note: "Separate from private App2 applications. No automatic submission." }, {
      headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=600" }
    });
  } catch {
    return NextResponse.json({ ok: false, jobs: [], error: "The international feed is temporarily unavailable." }, { status: 503 });
  }
}
