import { type SupabaseClient } from "@supabase/supabase-js";
import { recordHash } from "./etimad-official";

export type NupcoIngestionResult = {
  source: "nupco-public-tenders";
  status: "succeeded" | "partial" | "failed";
  run_id: string;
  list_url: string;
  links_found: number;
  records_normalized: number;
  inserted: number;
  updated: number;
  requirements_written: number;
  errors: string[];
  finished_at: string;
};

type SourceRow = {
  id: string;
  slug: string;
  base_url: string;
  status: string;
  metadata: Record<string, unknown> | null;
};

type ParsedTender = {
  source_record_id: string;
  tender_number: string;
  reference_number: string;
  title_ar: string;
  title_en: string | null;
  buyer_ar: string;
  buyer_en: string;
  purpose_ar: string;
  purpose_en: string | null;
  tender_type_ar: string | null;
  tender_type_en: string | null;
  document_price_sar: number | null;
  source_status_text: string | null;
  verification_state: "verified_metadata" | "closed" | "unknown";
  source_url: string;
  published_at: string | null;
  deadline_at: string | null;
  raw_payload: Record<string, unknown>;
  raw_text: string;
  document_urls: string[];
};

type ExistingTender = {
  id: string;
  reference_number: string | null;
  source_record_id: string | null;
};

type SnapshotRow = {
  id: string;
  source_record_id: string;
  content_hash: string;
};

const SOURCE_SLUG = "nupco-public-tenders";
const DEFAULT_LIST_URL = "https://www.nupco.com/ar/%D8%A7%D9%84%D9%85%D9%86%D8%A7%D9%81%D8%B3%D8%A7%D8%AA/tenders-list/";
const MAX_TENDERS_PER_RUN = 120;
const FETCH_TIMEOUT_MS = 15_000;
const DETAIL_CONCURRENCY = 6;
const MAX_RAW_TEXT = 120_000;

function htmlDecode(value: string) {
  const named: Record<string, string> = {
    amp: "&",
    quot: '"',
    apos: "'",
    lt: "<",
    gt: ">",
    nbsp: " ",
    ndash: "–",
    mdash: "—",
  };
  return value
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (match, name) => named[name.toLowerCase()] ?? match);
}

function stripTags(value: string) {
  return htmlDecode(
    value
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<!--([\s\S]*?)-->/g, " ")
      .replace(/<br\s*\/?\s*>/gi, "\n")
      .replace(/<\/(?:p|div|li|h1|h2|h3|h4|h5|section|article|tr)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[\t\r ]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function latinDigits(value: string) {
  const ar = "٠١٢٣٤٥٦٧٨٩";
  const fa = "۰۱۲۳۴۵۶۷۸۹";
  return value.replace(/[٠-٩۰-۹]/g, (char) => {
    const a = ar.indexOf(char);
    if (a >= 0) return String(a);
    const f = fa.indexOf(char);
    return f >= 0 ? String(f) : char;
  });
}

function normalizeWhitespace(value: string) {
  return htmlDecode(value).replace(/\s+/g, " ").trim();
}

function textFromMeta(html: string, property: string) {
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${property}["'][^>]*>`, "i"),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return normalizeWhitespace(match[1]);
  }
  return null;
}

function extractTitle(html: string, text: string) {
  const meta = textFromMeta(html, "og:title");
  const titleTag = normalizeWhitespace(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
  const candidates = [meta, titleTag]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.replace(/\s*[-–—]\s*nupco\s*$/i, "").trim())
    .filter((value) => value.length >= 4 && !/^nupco$/i.test(value));
  if (candidates.length) return candidates.sort((a, b) => b.length - a.length)[0];

  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  return lines
    .filter((line) => line.length >= 8 && line.length <= 280)
    .filter((line) => !["المنافسات", "المنافسات المطروحة", "Tenders", "Tenders List"].includes(line))
    .sort((a, b) => b.length - a.length)[0] ?? "NUPCO tender";
}

function findTenderNumber(text: string) {
  const match = latinDigits(text).match(/\b(N(?:DP|PT)\d{4}[-/]\d{2})\b/i);
  return match?.[1]?.toUpperCase().replace("-", "/") ?? null;
}

function extractDateAfterLabel(text: string, labels: string[]) {
  const normalized = latinDigits(text);
  for (const label of labels) {
    const index = normalized.indexOf(label);
    if (index < 0) continue;
    const slice = normalized.slice(index, index + 260);
    const match = slice.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
    if (match) return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  }
  return null;
}

function toIso(date: string | null, endOfDay = false) {
  if (!date) return null;
  const time = endOfDay ? "23:59:59" : "00:00:00";
  const parsed = new Date(`${date}T${time}+03:00`);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function extractPrice(text: string) {
  const normalized = latinDigits(text);
  const labels = ["سعر الاشتراك في المنافسة", "Tender Booklet Price"];
  for (const label of labels) {
    const index = normalized.toLowerCase().indexOf(label.toLowerCase());
    if (index < 0) continue;
    const slice = normalized.slice(index, index + 180);
    const match = slice.match(/([0-9][0-9,]*(?:\.[0-9]+)?)/);
    if (!match) continue;
    const number = Number(match[1].replace(/,/g, ""));
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function detectStatus(text: string) {
  const options = [
    "متاحة / محدثة",
    "متاحة / جديد",
    "الشراء المباشر",
    "النتائج الأولية",
    "النتائج النهائية",
    "تحت الدراسة",
    "ملغاة",
    "Available / Updated",
    "Available / New",
    "Direct Purchase",
    "Initial Results",
    "Final Results",
    "Under Studying",
    "Cancelled",
  ];
  return options.find((status) => text.includes(status)) ?? null;
}

function statusEnglish(status: string | null) {
  const map: Record<string, string> = {
    "متاحة / محدثة": "Available / Updated",
    "متاحة / جديد": "Available / New",
    "الشراء المباشر": "Direct Purchase",
    "النتائج الأولية": "Initial Results",
    "النتائج النهائية": "Final Results",
    "تحت الدراسة": "Under Studying",
    "ملغاة": "Cancelled",
  };
  return status ? map[status] ?? (/^[\x00-\x7F]+$/.test(status) ? status : status) : null;
}

function collectDocumentUrls(html: string, tenderNumber: string) {
  const normalizedNumber = tenderNumber.replace("/", "-").toLowerCase();
  const urls = new Set<string>();
  const hrefRegex = /href\s*=\s*["']([^"']+)["']/gi;
  for (const match of html.matchAll(hrefRegex)) {
    const raw = htmlDecode(match[1]);
    try {
      const url = new URL(raw, "https://www.nupco.com");
      if (url.protocol !== "https:" || !url.hostname.endsWith("nupco.com")) continue;
      const lower = url.toString().toLowerCase();
      const fileLike = /\.(pdf|xlsx|xls|csv|docx?|zip)(?:\?|$)/i.test(lower);
      if (!fileLike) continue;
      if (lower.includes(normalizedNumber) || lower.includes("tender") || lower.includes("announcement")) urls.add(url.toString());
    } catch {
      // Ignore malformed URLs.
    }
  }
  return [...urls].slice(0, 20);
}

function collectTenderLinks(html: string, listUrl: string) {
  const links = new Set<string>();
  const hrefRegex = /href\s*=\s*["']([^"']+)["']/gi;
  for (const match of html.matchAll(hrefRegex)) {
    const raw = htmlDecode(match[1]);
    try {
      const url = new URL(raw, listUrl);
      if (url.protocol !== "https:" || !url.hostname.endsWith("nupco.com")) continue;
      const path = url.pathname.toLowerCase();
      if (!/(^|\/)tender\//.test(path)) continue;
      if (/tenders-list\/?$/.test(path)) continue;
      links.add(url.toString());
    } catch {
      // Ignore malformed URLs.
    }
  }
  return [...links].slice(0, MAX_TENDERS_PER_RUN);
}

function likelyArabic(value: string) {
  return /[\u0600-\u06ff]/.test(value);
}

function normalizeDetail(html: string, sourceUrl: string): ParsedTender | null {
  const text = stripTags(html);
  const tenderNumber = findTenderNumber(text);
  if (!tenderNumber) return null;
  const title = extractTitle(html, text);
  const status = detectStatus(text);
  const publishedDate = extractDateAfterLabel(text, ["بداية بيع المنافسة", "Opening Date"]);
  const deadlineDate = extractDateAfterLabel(text, ["آخر موعد لرفع وتقديم العروض", "Submission Deadline"]);
  const deadlineAt = toIso(deadlineDate, true);
  const expired = deadlineAt ? new Date(deadlineAt).getTime() < Date.now() : false;
  const closedByStatus = Boolean(status && /تحت الدراسة|النتائج|ملغاة|Under Studying|Results|Cancelled/i.test(status));
  const titleAr = likelyArabic(title) ? title : title;
  const titleEn = likelyArabic(title) ? null : title;
  const documentUrls = collectDocumentUrls(html, tenderNumber);
  const rawPayload = {
    source: "NUPCO public tenders portal",
    tender_number: tenderNumber,
    status,
    title,
    published_date: publishedDate,
    submission_deadline_date: deadlineDate,
    booklet_price_sar: extractPrice(text),
    source_url: sourceUrl,
    document_urls: documentUrls,
    date_precision: "date_only",
    captured_from_public_page: true,
  };

  return {
    source_record_id: tenderNumber,
    tender_number: tenderNumber,
    reference_number: tenderNumber,
    title_ar: titleAr,
    title_en: titleEn,
    buyer_ar: "نوبكو",
    buyer_en: "NUPCO",
    purpose_ar: titleAr,
    purpose_en: titleEn,
    tender_type_ar: status,
    tender_type_en: statusEnglish(status),
    document_price_sar: extractPrice(text),
    source_status_text: status,
    verification_state: expired || closedByStatus ? "closed" : "verified_metadata",
    source_url: sourceUrl,
    published_at: toIso(publishedDate, false),
    deadline_at: deadlineAt,
    raw_payload: rawPayload,
    raw_text: text.slice(0, MAX_RAW_TEXT),
    document_urls: documentUrls,
  };
}

async function fetchText(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.6",
        "accept-language": "ar-SA,ar;q=0.9,en;q=0.7",
        "user-agent": "LabNarrative-Tender-Intelligence/1.0 (+https://labnarrative.com)",
      },
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`NUPCO returned HTTP ${response.status} for ${url}`);
    if (!text || text.length < 200) throw new Error(`NUPCO returned an empty page for ${url}`);
    return { text, status: response.status, contentType: response.headers.get("content-type") || "text/html" };
  } finally {
    clearTimeout(timeout);
  }
}

async function mapConcurrent<T, R>(items: T[], limit: number, mapper: (item: T) => Promise<R>) {
  const results = new Array<R>(items.length);
  let index = 0;
  async function worker() {
    while (true) {
      const current = index;
      index += 1;
      if (current >= items.length) return;
      results[current] = await mapper(items[current]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

function chunk<T>(items: T[], size = 120) {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function requirementTags(title: string) {
  return [...new Set(
    title
      .toLowerCase()
      .replace(/[\u064B-\u065F\u0670]/g, "")
      .replace(/[^a-z0-9\u0600-\u06ff]+/g, " ")
      .split(/\s+/)
      .filter((token) => token.length >= 3)
      .filter((token) => !["تأمين", "توريد", "منافسة", "الاتفاقية", "الإطارية", "المفتوحة", "بنود", "منصة", "السوق", "الإلكتروني", "nupco", "tender", "open", "framework", "agreement"].includes(token)),
  )].slice(0, 20);
}

export async function ingestNupcoPublicTenders(supabase: SupabaseClient): Promise<NupcoIngestionResult> {
  const { data: sourceData, error: sourceError } = await supabase
    .from("tender_data_sources")
    .select("id,slug,base_url,status,metadata")
    .eq("slug", SOURCE_SLUG)
    .single();
  if (sourceError) throw sourceError;
  const source = sourceData as SourceRow;
  if (source.status === "inactive") throw new Error("NUPCO tender source is inactive in LabNarrative.");

  const listUrl = source.base_url || DEFAULT_LIST_URL;
  const startedAt = new Date().toISOString();
  const { data: runData, error: runError } = await supabase
    .from("tender_ingestion_runs")
    .insert({ source_id: source.id, mode: "open_data", status: "running", records_seen: 0, records_upserted: 0, started_at: startedAt })
    .select("id")
    .single();
  if (runError) throw runError;
  const runId = String(runData.id);
  const errors: string[] = [];

  try {
    const listPage = await fetchText(listUrl);
    const links = collectTenderLinks(listPage.text, listUrl);
    if (!links.length) throw new Error("NUPCO public page loaded but no tender detail links were found.");

    const parsed = await mapConcurrent(links, DETAIL_CONCURRENCY, async (url) => {
      try {
        const page = await fetchText(url);
        return normalizeDetail(page.text, url);
      } catch (error) {
        errors.push(error instanceof Error ? error.message : `Failed to read ${url}`);
        return null;
      }
    });

    const normalized = parsed.filter((row): row is ParsedTender => row !== null);
    if (!normalized.length) throw new Error("NUPCO detail pages were found but none could be normalized safely.");

    const fetchedAt = new Date().toISOString();
    const snapshotRows = normalized.map((record) => ({
      source_id: source.id,
      ingestion_run_id: runId,
      source_record_id: record.source_record_id,
      source_url: record.source_url,
      fetched_at: fetchedAt,
      published_at: record.published_at,
      content_type: "text/html",
      http_status: 200,
      content_hash: recordHash(record.raw_payload),
      raw_text: record.raw_text,
      payload: record.raw_payload,
      document_urls: record.document_urls,
    }));

    for (const batch of chunk(snapshotRows)) {
      const { error } = await supabase.from("tender_source_records").upsert(batch, {
        onConflict: "source_id,source_record_id,content_hash",
        ignoreDuplicates: true,
      });
      if (error) throw error;
    }

    const wantedIds = [...new Set(normalized.map((record) => record.source_record_id))];
    const { data: snapshotData, error: snapshotError } = await supabase
      .from("tender_source_records")
      .select("id,source_record_id,content_hash")
      .eq("source_id", source.id)
      .in("source_record_id", wantedIds);
    if (snapshotError) throw snapshotError;
    const snapshotMap = new Map<string, string>();
    for (const row of (snapshotData ?? []) as SnapshotRow[]) snapshotMap.set(`${row.source_record_id}::${row.content_hash}`, row.id);

    const { data: existingData, error: existingError } = await supabase
      .from("tenders")
      .select("id,reference_number,source_record_id")
      .eq("source_id", source.id);
    if (existingError) throw existingError;
    const existing = (existingData ?? []) as ExistingTender[];
    const byReference = new Map(existing.filter((row) => row.reference_number).map((row) => [String(row.reference_number), row]));
    const byRecord = new Map(existing.filter((row) => row.source_record_id).map((row) => [String(row.source_record_id), row]));

    let inserted = 0;
    let updated = 0;
    let requirementsWritten = 0;
    const now = new Date().toISOString();

    for (const record of normalized) {
      const existingTender = byReference.get(record.reference_number) || byRecord.get(record.source_record_id) || null;
      const contentHash = recordHash(record.raw_payload);
      const sourceRecordUuid = snapshotMap.get(`${record.source_record_id}::${contentHash}`) ?? null;
      const payload = {
        source_id: source.id,
        source_record_id: record.source_record_id,
        tender_number: record.tender_number,
        reference_number: record.reference_number,
        title_ar: record.title_ar,
        title_en: record.title_en,
        buyer_ar: record.buyer_ar,
        buyer_en: record.buyer_en,
        purpose_ar: record.purpose_ar,
        purpose_en: record.purpose_en,
        tender_type_ar: record.tender_type_ar,
        tender_type_en: record.tender_type_en,
        document_price_sar: record.document_price_sar,
        contract_duration_text: null,
        source_status_text: record.source_status_text,
        verification_state: record.verification_state,
        is_public: true,
        source_url: record.source_url,
        source_indexed_at: now,
        published_at: record.published_at,
        deadline_at: record.deadline_at,
        raw_payload: record.raw_payload,
        source_record_uuid: sourceRecordUuid,
        normalized_at: now,
        updated_at: now,
      };

      let tenderId: string;
      if (existingTender) {
        const { data, error } = await supabase.from("tenders").update(payload).eq("id", existingTender.id).select("id").single();
        if (error) throw error;
        tenderId = String(data.id);
        updated += 1;
      } else {
        const { data, error } = await supabase.from("tenders").insert(payload).select("id").single();
        if (error) throw error;
        tenderId = String(data.id);
        inserted += 1;
      }

      const tags = requirementTags(record.title_ar);
      const { error: deleteRequirementError } = await supabase
        .from("tender_requirements")
        .delete()
        .eq("tender_id", tenderId)
        .eq("extraction_method", "public_metadata");
      if (deleteRequirementError) throw deleteRequirementError;

      const { error: requirementError } = await supabase.from("tender_requirements").insert({
        tender_id: tenderId,
        name_en: record.title_en || record.title_ar,
        name_ar: record.title_ar,
        tags,
        extraction_method: "public_metadata",
        confidence: 0.55,
      });
      if (requirementError) throw requirementError;
      requirementsWritten += 1;
    }

    const status: "succeeded" | "partial" = errors.length ? "partial" : "succeeded";
    const finishedAt = new Date().toISOString();
    const notes = [
      `Official NUPCO public portal connector.`,
      `Found ${links.length} tender detail links; normalized ${normalized.length}; inserted ${inserted}; updated ${updated}.`,
      `${errors.length} detail fetch/parse errors.`,
      `Public metadata is used only as a matching signal; technical equivalence still requires tender documents / BoQ confirmation.`,
    ].join(" ");

    const { error: finishError } = await supabase
      .from("tender_ingestion_runs")
      .update({ status, records_seen: links.length, records_upserted: inserted + updated, notes, finished_at: finishedAt })
      .eq("id", runId);
    if (finishError) throw finishError;

    await supabase
      .from("tender_data_sources")
      .update({
        metadata: {
          ...(source.metadata ?? {}),
          connector_state: "live",
          connector_ready: true,
          account_required: false,
          last_ingestion_at: finishedAt,
          last_ingestion_status: status,
          last_links_found: links.length,
          last_records_normalized: normalized.length,
          last_records_inserted: inserted,
          last_records_updated: updated,
          last_ingestion_errors: errors.slice(0, 10),
        },
        updated_at: finishedAt,
      })
      .eq("id", source.id);

    return {
      source: SOURCE_SLUG,
      status,
      run_id: runId,
      list_url: listUrl,
      links_found: links.length,
      records_normalized: normalized.length,
      inserted,
      updated,
      requirements_written: requirementsWritten,
      errors: errors.slice(0, 10),
      finished_at: finishedAt,
    };
  } catch (error) {
    const finishedAt = new Date().toISOString();
    const message = error instanceof Error ? error.message : "Unknown NUPCO ingestion error.";
    await supabase
      .from("tender_ingestion_runs")
      .update({ status: "failed", notes: message.slice(0, 1500), finished_at: finishedAt })
      .eq("id", runId);
    await supabase
      .from("tender_data_sources")
      .update({
        metadata: {
          ...(source.metadata ?? {}),
          connector_state: "error",
          connector_ready: true,
          account_required: false,
          last_ingestion_at: finishedAt,
          last_ingestion_status: "failed",
          last_ingestion_error: message.slice(0, 1000),
        },
        updated_at: finishedAt,
      })
      .eq("id", source.id);
    throw error;
  }
}
