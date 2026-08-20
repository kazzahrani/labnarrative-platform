import { createHash } from "node:crypto";
import { Workbook } from "exceljs";

type JsonRecord = Record<string, unknown>;

export type NormalizedEtimadTender = {
  source_record_id: string;
  tender_number: string | null;
  reference_number: string | null;
  title_ar: string;
  title_en: string | null;
  buyer_ar: string | null;
  buyer_en: string | null;
  purpose_ar: string | null;
  purpose_en: string | null;
  tender_type_ar: string | null;
  tender_type_en: string | null;
  document_price_sar: number | null;
  contract_duration_text: string | null;
  source_status_text: string | null;
  verification_state: "verified_metadata" | "closed" | "unknown";
  source_url: string;
  published_at: string | null;
  deadline_at: string | null;
  raw_payload: JsonRecord;
  document_urls: string[];
};

export type ParsedEtimadFeed = {
  records: JsonRecord[];
  contentType: string;
  parser: "json" | "xlsx" | "csv";
};

const MAX_RECORDS = 5000;
const MAX_FEED_BYTES = 20 * 1024 * 1024;
const OFFICIAL_HOST_SUFFIX = ".etimad.sa";

const aliases = {
  sourceRecordId: [
    "source_record_id", "sourceRecordId", "id", "tenderId", "tender_id", "competitionId", "competition_id",
    "الرقم المرجعي", "رقم المنافسة", "معرف المنافسة",
  ],
  tenderNumber: ["tender_number", "tenderNumber", "competitionNumber", "competition_number", "رقم المنافسة"],
  referenceNumber: ["reference_number", "referenceNumber", "referenceNo", "reference_no", "الرقم المرجعي", "رقم مرجعي"],
  titleAr: [
    "title_ar", "titleAr", "tenderNameAr", "competitionNameAr", "projectNameAr", "nameAr",
    "اسم المنافسة", "المنافسة", "اسم المشروع", "المشروع",
  ],
  titleEn: ["title_en", "titleEn", "tenderNameEn", "competitionNameEn", "projectNameEn", "nameEn"],
  titleFallback: ["title", "name", "tenderName", "competitionName", "projectName"],
  buyerAr: [
    "buyer_ar", "buyerAr", "agencyNameAr", "governmentEntityAr", "entityNameAr",
    "الجهة الحكومية", "اسم الجهة", "الجهة الطارحة",
  ],
  buyerEn: ["buyer_en", "buyerEn", "agencyNameEn", "governmentEntityEn", "entityNameEn"],
  buyerFallback: ["buyer", "agencyName", "governmentEntity", "entityName", "agency"],
  purposeAr: ["purpose_ar", "purposeAr", "purpose", "descriptionAr", "projectDescriptionAr", "الغرض من المنافسة", "الوصف", "وصف المشروع"],
  purposeEn: ["purpose_en", "purposeEn", "descriptionEn", "projectDescriptionEn"],
  tenderTypeAr: ["tender_type_ar", "tenderTypeAr", "competitionTypeAr", "نوع المنافسة"],
  tenderTypeEn: ["tender_type_en", "tenderTypeEn", "competitionTypeEn"],
  tenderTypeFallback: ["tenderType", "competitionType", "type"],
  documentPrice: ["document_price_sar", "documentPrice", "documentPriceSar", "documentsValue", "قيمة وثائق المنافسة", "قيمة الوثائق"],
  contractDuration: ["contract_duration_text", "contractDuration", "contractDurationText", "duration", "مدة العقد"],
  status: ["source_status_text", "status", "statusName", "competitionStatus", "tenderStatus", "حالة المنافسة", "الحالة"],
  publishedAt: ["published_at", "publishedAt", "publishedDate", "publicationDate", "publishDate", "تاريخ الطرح", "تاريخ النشر"],
  deadlineAt: [
    "deadline_at", "deadlineAt", "submissionDeadline", "bidDeadline", "closingDate", "offersDeadline",
    "آخر موعد لتقديم العروض", "نهاية تقديم العروض", "تاريخ إغلاق المنافسة", "تاريخ الإغلاق",
  ],
  sourceUrl: ["source_url", "sourceUrl", "url", "detailsUrl", "detailUrl", "رابط المنافسة"],
  documentUrls: ["document_urls", "documentUrls", "attachments", "documents", "files", "المرفقات"],
} as const;

function arabicDigitsToAscii(value: string) {
  const arabic = "٠١٢٣٤٥٦٧٨٩";
  const eastern = "۰۱۲۳۴۵۶۷۸۹";
  return value.replace(/[٠-٩۰-۹]/g, (digit) => {
    const first = arabic.indexOf(digit);
    if (first >= 0) return String(first);
    const second = eastern.indexOf(digit);
    return second >= 0 ? String(second) : digit;
  });
}

function cleanText(value: unknown) {
  if (value === null || value === undefined) return null;
  if (typeof value === "object") {
    const richText = (value as { richText?: Array<{ text?: string }> }).richText;
    if (Array.isArray(richText)) {
      const text = richText.map((entry) => entry.text ?? "").join("").replace(/\s+/g, " ").trim();
      return text || null;
    }
    const text = (value as { text?: unknown }).text;
    if (typeof text === "string") return text.replace(/\s+/g, " ").trim() || null;
    const result = (value as { result?: unknown }).result;
    if (result !== undefined) return cleanText(result);
    return null;
  }
  const text = String(value).replace(/\s+/g, " ").trim();
  return text || null;
}

function canonicalKey(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^a-z0-9\u0600-\u06ff]+/g, "")
    .trim();
}

function recordLookup(record: JsonRecord) {
  const map = new Map<string, unknown>();
  Object.entries(record).forEach(([key, value]) => map.set(canonicalKey(key), value));
  return map;
}

function pick(record: JsonRecord, keys: readonly string[]) {
  const lookup = recordLookup(record);
  for (const key of keys) {
    const value = lookup.get(canonicalKey(key));
    if (value !== undefined && value !== null && cleanText(value)) return value;
  }
  return null;
}

function pickText(record: JsonRecord, keys: readonly string[]) {
  return cleanText(pick(record, keys));
}

function parseMoney(value: unknown) {
  const text = cleanText(value);
  if (!text) return null;
  const normalized = arabicDigitsToAscii(text)
    .replace(/[٬,]/g, "")
    .replace(/٫/g, ".")
    .replace(/[^0-9.-]/g, "");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDate(value: unknown) {
  const text = cleanText(value);
  if (!text) return null;
  const normalized = arabicDigitsToAscii(text).replace(/\u200f/g, "").trim();
  const direct = Date.parse(normalized);
  if (Number.isFinite(direct)) return new Date(direct).toISOString();

  const match = normalized.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (match) {
    const [, day, month, year, hour = "0", minute = "0"] = match;
    const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute)));
    if (Number.isFinite(date.getTime())) return date.toISOString();
  }
  return null;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as JsonRecord).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function recordHash(record: JsonRecord) {
  return createHash("sha256").update(stableStringify(record)).digest("hex");
}

function safeOfficialUrl(value: unknown, fallback: string) {
  const text = cleanText(value);
  const candidate = text || fallback;
  try {
    const url = new URL(candidate);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || (host !== "etimad.sa" && !host.endsWith(OFFICIAL_HOST_SUFFIX))) return fallback;
    return url.toString();
  } catch {
    return fallback;
  }
}

function collectOfficialUrls(value: unknown) {
  const candidates: unknown[] = [];
  if (Array.isArray(value)) candidates.push(...value);
  else if (value && typeof value === "object") candidates.push(...Object.values(value as JsonRecord));
  else if (value !== null && value !== undefined) candidates.push(value);

  const urls = new Set<string>();
  for (const candidate of candidates) {
    const text = cleanText(candidate);
    if (!text) continue;
    try {
      const url = new URL(text);
      const host = url.hostname.toLowerCase();
      if (url.protocol === "https:" && (host === "etimad.sa" || host.endsWith(OFFICIAL_HOST_SUFFIX))) urls.add(url.toString());
    } catch {
      // Ignore non-URL attachment labels.
    }
  }
  return [...urls];
}

function isClosedStatus(value: string | null) {
  if (!value) return false;
  const status = canonicalKey(value);
  return ["closed", "expired", "awarded", "cancelled", "canceled", "ended", "منتهي", "منتهيه", "ملغي", "ملغاه", "تماغلاق", "تماعتمادالترسيه", "تمالترسيه"]
    .some((token) => status.includes(canonicalKey(token)));
}

function detectArabic(value: string | null) {
  return Boolean(value && /[\u0600-\u06ff]/.test(value));
}

function normalizeSourceRecordId(record: JsonRecord, reference: string | null, tenderNumber: string | null) {
  const explicit = pickText(record, aliases.sourceRecordId);
  if (explicit) return arabicDigitsToAscii(explicit).slice(0, 240);
  if (reference) return arabicDigitsToAscii(reference).slice(0, 240);
  if (tenderNumber) return arabicDigitsToAscii(tenderNumber).slice(0, 240);
  return `etimad-${recordHash(record).slice(0, 32)}`;
}

export function normalizeEtimadRecord(record: JsonRecord, feedUrl: string): NormalizedEtimadTender | null {
  const tenderNumber = pickText(record, aliases.tenderNumber);
  const referenceNumber = pickText(record, aliases.referenceNumber);
  const fallbackTitle = pickText(record, aliases.titleFallback);
  let titleAr = pickText(record, aliases.titleAr);
  let titleEn = pickText(record, aliases.titleEn);
  if (!titleAr && fallbackTitle && detectArabic(fallbackTitle)) titleAr = fallbackTitle;
  if (!titleEn && fallbackTitle && !detectArabic(fallbackTitle)) titleEn = fallbackTitle;
  if (!titleAr && titleEn) titleAr = titleEn;
  if (!titleAr) return null;

  const fallbackBuyer = pickText(record, aliases.buyerFallback);
  let buyerAr = pickText(record, aliases.buyerAr);
  let buyerEn = pickText(record, aliases.buyerEn);
  if (!buyerAr && fallbackBuyer && detectArabic(fallbackBuyer)) buyerAr = fallbackBuyer;
  if (!buyerEn && fallbackBuyer && !detectArabic(fallbackBuyer)) buyerEn = fallbackBuyer;

  const fallbackType = pickText(record, aliases.tenderTypeFallback);
  let tenderTypeAr = pickText(record, aliases.tenderTypeAr);
  let tenderTypeEn = pickText(record, aliases.tenderTypeEn);
  if (!tenderTypeAr && fallbackType && detectArabic(fallbackType)) tenderTypeAr = fallbackType;
  if (!tenderTypeEn && fallbackType && !detectArabic(fallbackType)) tenderTypeEn = fallbackType;

  const sourceStatusText = pickText(record, aliases.status);
  const sourceUrl = safeOfficialUrl(pick(record, aliases.sourceUrl), feedUrl);
  const documentUrls = collectOfficialUrls(pick(record, aliases.documentUrls));
  const sourceRecordId = normalizeSourceRecordId(record, referenceNumber, tenderNumber);

  return {
    source_record_id: sourceRecordId,
    tender_number: tenderNumber,
    reference_number: referenceNumber || tenderNumber || sourceRecordId,
    title_ar: titleAr,
    title_en: titleEn,
    buyer_ar: buyerAr,
    buyer_en: buyerEn,
    purpose_ar: pickText(record, aliases.purposeAr),
    purpose_en: pickText(record, aliases.purposeEn),
    tender_type_ar: tenderTypeAr,
    tender_type_en: tenderTypeEn,
    document_price_sar: parseMoney(pick(record, aliases.documentPrice)),
    contract_duration_text: pickText(record, aliases.contractDuration),
    source_status_text: sourceStatusText,
    verification_state: isClosedStatus(sourceStatusText) ? "closed" : "verified_metadata",
    source_url: sourceUrl,
    published_at: parseDate(pick(record, aliases.publishedAt)),
    deadline_at: parseDate(pick(record, aliases.deadlineAt)),
    raw_payload: record,
    document_urls: documentUrls,
  };
}

function extractJsonRecords(payload: unknown): JsonRecord[] {
  if (Array.isArray(payload)) return payload.filter((item): item is JsonRecord => Boolean(item && typeof item === "object" && !Array.isArray(item))).slice(0, MAX_RECORDS);
  if (!payload || typeof payload !== "object") return [];
  const root = payload as JsonRecord;
  const candidates = [root.data, root.items, root.results, root.tenders, root.competitions, root.records];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return extractJsonRecords(candidate);
    if (candidate && typeof candidate === "object") {
      const nested = candidate as JsonRecord;
      for (const key of ["items", "results", "records", "tenders", "competitions", "data"]) {
        if (Array.isArray(nested[key])) return extractJsonRecords(nested[key]);
      }
    }
  }
  return [];
}

function parseCsvLine(line: string, delimiter: string) {
  const cells: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      cells.push(value.trim());
      value = "";
    } else {
      value += char;
    }
  }
  cells.push(value.trim());
  return cells;
}

function parseCsv(text: string) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];
  const sample = lines.slice(0, 8).join("\n");
  const delimiter = [",", "\t", ";", "|"]
    .map((candidate) => ({ candidate, count: sample.split(candidate).length - 1 }))
    .sort((a, b) => b.count - a.count)[0]?.candidate ?? ",";
  const headers = parseCsvLine(lines[0], delimiter).map((header, index) => header || `column_${index + 1}`);
  return lines.slice(1, MAX_RECORDS + 1).map((line) => {
    const values = parseCsvLine(line, delimiter);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
}

async function parseXlsx(buffer: ArrayBuffer) {
  const workbook = new Workbook();
  await workbook.xlsx.load(Buffer.from(buffer) as never);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];
  const rows: unknown[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    if (rows.length > MAX_RECORDS) return;
    rows.push(Array.isArray(row.values) ? row.values.slice(1) : []);
  });
  if (rows.length < 2) return [];
  const headers = rows[0].map((value, index) => cleanText(value) || `column_${index + 1}`);
  return rows.slice(1, MAX_RECORDS + 1).map((row) => Object.fromEntries(headers.map((header, index) => [header, cleanText(row[index]) ?? ""])));
}

export async function parseEtimadFeed(response: Response): Promise<ParsedEtimadFeed> {
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > MAX_FEED_BYTES) throw new Error("Official tender feed exceeds the 20 MB ingestion limit.");
  const contentType = (response.headers.get("content-type") || "").toLowerCase();
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > MAX_FEED_BYTES) throw new Error("Official tender feed exceeds the 20 MB ingestion limit.");
  const bytes = Buffer.from(buffer);
  const textStart = bytes.subarray(0, Math.min(bytes.length, 2048)).toString("utf8").trim().toLowerCase();
  if (contentType.includes("text/html") || textStart.startsWith("<!doctype html") || textStart.startsWith("<html")) {
    throw new Error("Etimad returned HTML instead of a machine-readable feed. LabNarrative will not scrape or bypass visitor verification.");
  }

  if (contentType.includes("json") || textStart.startsWith("[") || textStart.startsWith("{")) {
    const payload = JSON.parse(bytes.toString("utf8"));
    return { records: extractJsonRecords(payload), contentType: contentType || "application/json", parser: "json" };
  }

  if (contentType.includes("spreadsheetml") || contentType.includes("excel") || bytes.subarray(0, 2).toString("hex") === "504b") {
    return { records: await parseXlsx(buffer), contentType: contentType || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", parser: "xlsx" };
  }

  if (contentType.startsWith("text/") || contentType.includes("csv") || contentType.includes("octet-stream")) {
    return { records: parseCsv(bytes.toString("utf8")), contentType: contentType || "text/csv", parser: "csv" };
  }

  throw new Error(`Unsupported official tender feed content type: ${contentType || "unknown"}.`);
}

export function validateOfficialFeedUrl(value: string) {
  const url = new URL(value);
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || (host !== "etimad.sa" && !host.endsWith(OFFICIAL_HOST_SUFFIX))) {
    throw new Error("ETIMAD_TENDER_FEED_URL must be an HTTPS endpoint on etimad.sa.");
  }
  return url;
}

export function buildOfficialFeedHeaders() {
  const headers: Record<string, string> = {
    accept: "application/json, text/csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;q=0.9, */*;q=0.5",
    "user-agent": "LabNarrative-Tender-Intelligence/1.0",
  };
  const raw = process.env.ETIMAD_TENDER_FEED_HEADERS_JSON?.trim();
  if (!raw) return headers;
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value === "string" && key.trim() && value.trim()) headers[key.trim()] = value.trim();
  }
  return headers;
}
