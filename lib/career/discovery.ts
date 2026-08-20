import type { SupabaseClient } from "@supabase/supabase-js";
import { careerAdminClient } from "./admin";

type CareerSource = {
  id: string;
  key: string;
  organization: string;
  source_type: "successfactors_html" | "m42_html" | "official_page" | "hidden_target";
  source_url: string;
  country: string | null;
  city: string | null;
  track_hint: string | null;
  config: Record<string, unknown> | null;
};

type ParsedOpportunity = {
  externalKey: string;
  title: string;
  sourceUrl: string;
  datePosted: string | null;
  description: string;
  city: string | null;
  country: string | null;
};

const monthPattern = "Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?";
const positiveTerms = [
  "pharmacology", "toxicology", "translational", "oncology", "cancer", "precision medicine", "genomics",
  "functional genomics", "molecular", "biomedical", "research scientist", "scientist", "assistant professor",
  "lecturer", "faculty", "drug discovery", "biobank", "bioinformatics", "omics", "clinical research",
  "life science", "life sciences", "artificial intelligence", "scientific ai", "digital health",
];
const negativeTitleTerms = ["nurse", "account", "procurement", "marketing", "network", "radiology", "finance", "inventory"];

function stripHtml(value: string) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function compact(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function absoluteUrl(href: string, base: string) {
  try { return new URL(href, base).toString(); } catch { return href; }
}

function dateFromContext(value: string) {
  const match = value.match(new RegExp(`\\b(${monthPattern})\\s+\\d{1,2},\\s+\\d{4}\\b`, "i"));
  if (!match) return null;
  const parsed = new Date(match[0]);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : null;
}

function externalKeyFromUrl(value: string) {
  try {
    const url = new URL(value);
    const numeric = url.pathname.match(/\/(\d{4,})(?:\/|$)/)?.[1];
    return numeric ? `${url.hostname}:${numeric}` : `${url.hostname}:${url.pathname.replace(/\/$/, "")}`;
  } catch {
    return value;
  }
}

function extractAnchoredJobs(html: string, source: CareerSource, hrefNeedle: string) {
  const results: ParsedOpportunity[] = [];
  const seen = new Set<string>();
  const anchor = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = anchor.exec(html))) {
    const href = match[1];
    if (!href.includes(hrefNeedle)) continue;
    const title = stripHtml(match[2]);
    if (!title || title.length < 3 || /^(apply|view|details|title)$/i.test(title)) continue;
    const sourceUrl = absoluteUrl(href, source.source_url);
    const externalKey = externalKeyFromUrl(sourceUrl);
    if (seen.has(externalKey)) continue;
    seen.add(externalKey);
    const start = Math.max(0, match.index - 350);
    const end = Math.min(html.length, match.index + match[0].length + 1200);
    const context = stripHtml(html.slice(start, end));
    results.push({
      externalKey,
      title,
      sourceUrl,
      datePosted: dateFromContext(context),
      description: context.slice(0, 1800),
      city: source.city,
      country: source.country,
    });
  }
  return results;
}

function collectJobPostings(value: unknown, output: Record<string, unknown>[] = []) {
  if (!value) return output;
  if (Array.isArray(value)) {
    value.forEach((item) => collectJobPostings(item, output));
    return output;
  }
  if (typeof value !== "object") return output;
  const obj = value as Record<string, unknown>;
  const kind = obj["@type"];
  if (kind === "JobPosting" || (Array.isArray(kind) && kind.includes("JobPosting"))) output.push(obj);
  Object.values(obj).forEach((item) => collectJobPostings(item, output));
  return output;
}

function extractJsonLdJobs(html: string, source: CareerSource) {
  const results: ParsedOpportunity[] = [];
  const seen = new Set<string>();
  const script = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = script.exec(html))) {
    try {
      const parsed = JSON.parse(match[1].trim());
      for (const job of collectJobPostings(parsed)) {
        const title = String(job.title || job.name || "").trim();
        const url = String(job.url || source.source_url);
        if (!title) continue;
        const externalKey = String(job.identifier && typeof job.identifier === "object" ? (job.identifier as Record<string, unknown>).value || "" : "") || externalKeyFromUrl(url);
        if (seen.has(externalKey)) continue;
        seen.add(externalKey);
        const description = stripHtml(String(job.description || ""));
        results.push({
          externalKey,
          title,
          sourceUrl: absoluteUrl(url, source.source_url),
          datePosted: job.datePosted ? String(job.datePosted).slice(0, 10) : null,
          description: description.slice(0, 1800),
          city: source.city,
          country: source.country,
        });
      }
    } catch {
      // Ignore malformed structured-data blocks and continue scanning the official page.
    }
  }
  return results;
}

function inferTrack(text: string, hint: string | null) {
  const value = compact(text);
  if (/assistant professor|lecturer|faculty|professor|pharmacology|toxicology/.test(value)) return "Academic Pharmacology";
  if (/precision medicine|genomics|bioinformatics|biobank|omics|molecular diagnostics/.test(value)) return "Precision Medicine";
  if (/(artificial intelligence|\bai\b|machine learning|digital health)/.test(value) && /(health|medical|biomedical|life science|genomics)/.test(value)) return "AI + Life Sciences";
  if (/translational|oncology|cancer|drug discovery|research scientist|scientist|clinical research/.test(value)) return "Translational R&D";
  return hint || "Translational R&D";
}

function scoreOpportunity(item: ParsedOpportunity, source: CareerSource) {
  const text = compact(`${item.title} ${item.description}`);
  const title = compact(item.title);
  const matched = positiveTerms.filter((term) => text.includes(term));
  const domain = Math.min(98, 54 + matched.length * 7);
  const evidence = Math.min(96, 66 + matched.length * 5);
  let seniority = /assistant professor|research scientist|senior scientist|lecturer|faculty/.test(title) ? 94 : /scientist|researcher|specialist/.test(title) ? 86 : /technologist|technician|assistant/.test(title) ? 65 : 78;
  const country = compact(item.country || source.country || "");
  const city = compact(item.city || source.city || "");
  const location = country.includes("saudi") ? (city.includes("riyadh") ? 100 : 96) : country.includes("uae") || country.includes("united arab emirates") || country.includes("qatar") ? 91 : country.includes("germany") || country.includes("switzerland") || country.includes("united kingdom") ? 82 : 72;
  let score = Math.round(domain * 0.45 + evidence * 0.25 + seniority * 0.15 + location * 0.15);
  if (negativeTitleTerms.some((term) => title.includes(term)) && matched.length < 2) score -= 25;
  if (/uae national|emirati talent/.test(text)) score -= 18;
  score = Math.max(20, Math.min(99, score));
  const track = inferTrack(text, source.track_hint);
  const reasons = [
    matched.length ? `Official posting contains profile-aligned signals: ${matched.slice(0, 5).join(", ")}.` : "Official posting was verified, but profile-specific domain overlap is limited.",
    `${track} is the strongest current career-track match.`,
    `Location fit: ${item.city || source.city || "unspecified"}, ${item.country || source.country || "unspecified"}.`,
  ];
  const gaps = ["Verify the exact degree, years-of-experience and licensing requirements before applying."];
  if (seniority < 75) gaps.push("The advertised seniority may underuse the current profile; review before investing application time.");
  if (/uae national|emirati talent/.test(text)) gaps.push("The posting appears to include a nationality restriction and should be treated as low priority unless eligibility is confirmed.");
  const strategy = track === "Academic Pharmacology"
    ? "Lead with pharmacology training, College of Pharmacy experience, teaching/supervision evidence and a focused translational research program."
    : track === "Precision Medicine"
      ? "Lead with functional genomics, molecular oncology and the ability to bridge experimental biology with data-driven precision medicine."
      : track === "AI + Life Sciences"
        ? "Target scientific product, domain-expert and life-science AI strategy roles rather than pure software-engineering positions."
        : "Lead with translational pharmacology, mechanistic oncology, drug-response models and hands-on molecular research evidence.";
  return { score, track, components: { domain, evidence, seniority, location }, reasons, gaps, strategy };
}

async function enrich(items: ParsedOpportunity[]) {
  const selected = items.slice(0, 30);
  return Promise.all(selected.map(async (item) => {
    try {
      const response = await fetch(item.sourceUrl, {
        cache: "no-store",
        headers: { "User-Agent": "LabNarrative Career Agent/1.0", Accept: "text/html,application/xhtml+xml" },
        signal: AbortSignal.timeout(9000),
      });
      if (!response.ok) return item;
      const html = await response.text();
      const body = stripHtml(html).slice(0, 7000);
      return { ...item, description: body || item.description, datePosted: item.datePosted || dateFromContext(body) };
    } catch { return item; }
  }));
}

async function markMissingAsStale(supabase: SupabaseClient, sourceId: string, seenKeys: Set<string>) {
  const { data } = await supabase.from("career_opportunities").select("id,external_key").eq("source_id", sourceId).eq("opportunity_type", "open_vacancy").eq("is_active", true);
  for (const row of data ?? []) {
    if (!seenKeys.has(String(row.external_key))) {
      await supabase.from("career_opportunities").update({ is_active: false, verification_state: "stale", source_checked_at: new Date().toISOString() }).eq("id", row.id);
    }
  }
}

export async function runCareerDiscovery(options: { force?: boolean } = {}) {
  const supabase = careerAdminClient();
  const now = new Date();
  if (!options.force) {
    const { data: recent } = await supabase.from("career_discovery_runs").select("finished_at,status").in("status", ["succeeded", "partial"]).order("finished_at", { ascending: false }).limit(1).maybeSingle();
    if (recent?.finished_at && now.getTime() - new Date(recent.finished_at).getTime() < 10 * 60_000) {
      return { ok: true, skipped: true, reason: "cooldown", last_finished_at: recent.finished_at };
    }
  }

  const { data: run, error: runError } = await supabase.from("career_discovery_runs").insert({ status: "running", metadata: { version: "official_sources_v1" } }).select("id").single();
  if (runError) throw runError;
  const runId = run.id;
  const errors: Array<Record<string, unknown>> = [];
  let seenCount = 0;
  let upsertedCount = 0;
  let scanned = 0;

  try {
    const { data: sources, error } = await supabase.from("career_sources").select("id,key,organization,source_type,source_url,country,city,track_hint,config").eq("active", true).neq("source_type", "hidden_target");
    if (error) throw error;

    for (const source of (sources ?? []) as CareerSource[]) {
      scanned += 1;
      const checkedAt = new Date().toISOString();
      try {
        const response = await fetch(source.source_url, {
          cache: "no-store",
          headers: { "User-Agent": "LabNarrative Career Agent/1.0", Accept: "text/html,application/xhtml+xml" },
          signal: AbortSignal.timeout(12000),
        });
        if (!response.ok) throw new Error(`Official source returned HTTP ${response.status}`);
        const html = await response.text();
        let parsed = source.source_type === "successfactors_html"
          ? extractAnchoredJobs(html, source, String(source.config?.job_href_pattern || "/job/"))
          : source.source_type === "m42_html"
            ? extractAnchoredJobs(html, source, String(source.config?.job_href_pattern || "/jobs/"))
            : extractJsonLdJobs(html, source);
        parsed = await enrich(parsed);
        const seenKeys = new Set<string>();

        for (const item of parsed) {
          seenKeys.add(item.externalKey);
          const fit = scoreOpportunity(item, source);
          const row = {
            source_id: source.id,
            external_key: item.externalKey,
            opportunity_type: "open_vacancy",
            title: item.title,
            organization: source.organization,
            city: item.city || source.city,
            country: item.country || source.country,
            track: fit.track,
            source_url: item.sourceUrl,
            date_posted: item.datePosted,
            description_excerpt: item.description.slice(0, 1800),
            fit_score: fit.score,
            fit_components: fit.components,
            reasons: fit.reasons,
            gaps: fit.gaps,
            strategy: fit.strategy,
            verification_state: "official_source",
            is_active: true,
            last_seen_at: checkedAt,
            source_checked_at: checkedAt,
            raw: { source_key: source.key, discovery_version: "official_sources_v1" },
          };
          const { error: upsertError } = await supabase.from("career_opportunities").upsert(row, { onConflict: "source_id,external_key" });
          if (upsertError) throw upsertError;
          upsertedCount += 1;
        }
        seenCount += parsed.length;
        if (parsed.length > 0) await markMissingAsStale(supabase, source.id, seenKeys);
        await supabase.from("career_sources").update({ last_checked_at: checkedAt, last_success_at: checkedAt, last_error: null, updated_at: checkedAt }).eq("id", source.id);
      } catch (sourceError) {
        const message = sourceError instanceof Error ? sourceError.message : String(sourceError);
        errors.push({ source: source.key, error: message });
        await supabase.from("career_sources").update({ last_checked_at: checkedAt, last_error: message, updated_at: checkedAt }).eq("id", source.id);
      }
    }

    await supabase.from("career_opportunities").update({ is_active: false, verification_state: "closed", source_checked_at: now.toISOString() }).eq("opportunity_type", "open_vacancy").eq("is_active", true).lt("valid_through", now.toISOString());
    const status = errors.length === 0 ? "succeeded" : scanned > errors.length ? "partial" : "failed";
    await supabase.from("career_discovery_runs").update({ finished_at: new Date().toISOString(), status, sources_scanned: scanned, opportunities_seen: seenCount, opportunities_upserted: upsertedCount, errors }).eq("id", runId);
    return { ok: status !== "failed", status, run_id: runId, sources_scanned: scanned, opportunities_seen: seenCount, opportunities_upserted: upsertedCount, errors };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await supabase.from("career_discovery_runs").update({ finished_at: new Date().toISOString(), status: "failed", sources_scanned: scanned, opportunities_seen: seenCount, opportunities_upserted: upsertedCount, errors: [...errors, { error: message }] }).eq("id", runId);
    throw error;
  }
}
