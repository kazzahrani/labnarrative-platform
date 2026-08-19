import { NextResponse } from "next/server";
import { Workbook } from "exceljs";
import { PDFParse } from "pdf-parse";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const DEMO_COMPANY_SLUG = "riyadh-scientific-demo";
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_ITEMS = 250;

type JsonRow = Record<string, unknown>;

type CatalogItem = {
  id: string;
  sku: string | null;
  name_en: string;
  name_ar: string | null;
  tags: string[];
};

type ExtractedItem = {
  line_number: number;
  item_code: string | null;
  description: string;
  quantity: number | null;
  unit: string | null;
  raw_text: string;
  extraction_confidence: number;
  source_page?: number | null;
  source_sheet?: string | null;
};

type MatchType = "exact" | "equivalent" | "missing";

const descriptionHeaders = [
  "description", "item description", "product", "material", "specification", "specifications", "details",
  "الوصف", "وصف", "الصنف", "اسم الصنف", "البند", "المادة", "المواصفات", "البيان",
];
const quantityHeaders = ["quantity", "qty", "الكمية", "كمية", "العدد", "عدد"];
const unitHeaders = ["unit", "uom", "unit of measure", "الوحدة", "وحدة"];
const codeHeaders = ["code", "item code", "item no", "item number", "sku", "رقم الصنف", "رقم البند", "الكود", "كود"];

const stopTokens = new Set([
  "the", "and", "or", "for", "with", "of", "to", "in", "a", "an", "including", "supply", "توريد", "تأمين",
  "و", "او", "أو", "في", "من", "على", "الى", "إلى", "مع", "ل", "لـ", "جميع", "كامل", "كاملة",
]);

const boilerplatePatterns = [
  /^(page|صفحة)\s*\d+/i,
  /^(tender|competition|reference|رقم المنافسة|الرقم المرجعي|مرجع)/i,
  /^(terms|conditions|الشروط|الأحكام)/i,
  /^(total|subtotal|الإجمالي|المجموع)\b/i,
  /^(date|التاريخ)\b/i,
];

function normalise(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^a-z0-9\u0600-\u06ff]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenise(value: string) {
  return normalise(value)
    .split(" ")
    .filter((token) => token.length > 1 && !stopTokens.has(token));
}

function expandTokens(tokens: string[]) {
  const expanded = new Set(tokens);
  const groups = [
    ["lab", "laboratory", "معمل", "مختبر", "مختبري", "معملي"],
    ["equipment", "device", "instrument", "system", "جهاز", "اجهزه", "اداه", "معدات"],
    ["reagent", "reagents", "chemical", "chemicals", "كاشف", "كواشف", "كيميائيه", "مواد"],
    ["consumable", "consumables", "materials", "material", "مستهلكات", "مواد"],
    ["balance", "weighing", "ميزان", "موازين"],
    ["pipette", "micropipette", "ماصه", "ماصات"],
    ["freezer", "فريزر", "مجمد"],
    ["filter", "filters", "مرشح", "مرشحات"],
    ["calibration", "calibrate", "معايره"],
  ];

  for (const group of groups) {
    if (group.some((token) => expanded.has(normalise(token)))) {
      group.forEach((token) => expanded.add(normalise(token)));
    }
  }
  return [...expanded];
}

function similarity(description: string, candidate: CatalogItem) {
  const descriptionNorm = normalise(description);
  const names = [candidate.name_en, candidate.name_ar ?? "", ...candidate.tags].filter(Boolean);
  let best = 0;

  for (const name of names) {
    const candidateNorm = normalise(name);
    if (!candidateNorm) continue;
    if (descriptionNorm === candidateNorm) best = Math.max(best, 1);
    if (descriptionNorm.includes(candidateNorm) || candidateNorm.includes(descriptionNorm)) {
      best = Math.max(best, 0.88);
    }

    const left = new Set(expandTokens(tokenise(description)));
    const right = new Set(expandTokens(tokenise(name)));
    if (!left.size || !right.size) continue;
    const intersection = [...right].filter((token) => left.has(token)).length;
    const union = new Set([...left, ...right]).size;
    const jaccard = intersection / Math.max(union, 1);
    const candidateCoverage = intersection / Math.max(right.size, 1);
    const score = jaccard * 0.45 + candidateCoverage * 0.55;
    best = Math.max(best, score);
  }

  return Math.min(1, best);
}

function chooseMatch(item: ExtractedItem, catalog: CatalogItem[]) {
  const ranked = catalog
    .map((catalogItem) => ({ catalogItem, score: similarity(item.description, catalogItem) }))
    .sort((a, b) => b.score - a.score);
  const best = ranked[0];
  const score = best?.score ?? 0;
  let match_type: MatchType = "missing";
  if (score >= 0.78) match_type = "exact";
  else if (score >= 0.38) match_type = "equivalent";

  const rationale = match_type === "exact"
    ? "Strong lexical/catalog-tag overlap. Confirm technical specifications before quoting."
    : match_type === "equivalent"
      ? "Related catalog terminology detected. Technical equivalence requires human confirmation."
      : "No sufficiently similar catalog item was found.";

  return {
    ...item,
    match_type,
    match_score: Number(score.toFixed(3)),
    matched_catalog_item: match_type === "missing" || !best ? null : best.catalogItem,
    rationale,
  };
}

async function restFetch(path: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !publishableKey) throw new Error("Supabase public configuration is missing.");
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    headers: { apikey: publishableKey },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Supabase REST request failed (${response.status}).`);
  return (await response.json()) as JsonRow[];
}

async function loadCatalog() {
  const companies = await restFetch(`tender_companies?slug=eq.${DEMO_COMPANY_SLUG}&select=id&limit=1`);
  const companyId = String(companies[0]?.id ?? "");
  if (!companyId) throw new Error("Tender demo company is not configured.");
  const rows = await restFetch(
    `tender_catalog_items?company_id=eq.${companyId}&active=eq.true&select=id,sku,name_en,name_ar,tags&order=name_en.asc`,
  );
  return rows.map((row) => ({
    id: String(row.id),
    sku: row.sku ? String(row.sku) : null,
    name_en: String(row.name_en ?? ""),
    name_ar: row.name_ar ? String(row.name_ar) : null,
    tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
  })) satisfies CatalogItem[];
}

function asCellText(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    const richText = (value as { richText?: Array<{ text?: string }> }).richText;
    if (Array.isArray(richText)) return richText.map((entry) => entry.text ?? "").join("");
    const text = (value as { text?: unknown }).text;
    if (typeof text === "string") return text;
    const result = (value as { result?: unknown }).result;
    if (result !== undefined) return String(result);
  }
  return String(value).trim();
}

function matchHeader(cell: string, headers: string[]) {
  const value = normalise(cell);
  return headers.some((header) => value === normalise(header) || value.includes(normalise(header)));
}

function headerMap(rows: string[][]) {
  for (let rowIndex = 0; rowIndex < Math.min(rows.length, 30); rowIndex += 1) {
    const row = rows[rowIndex];
    let description = -1;
    let quantity = -1;
    let unit = -1;
    let code = -1;
    row.forEach((cell, index) => {
      if (description < 0 && matchHeader(cell, descriptionHeaders)) description = index;
      if (quantity < 0 && matchHeader(cell, quantityHeaders)) quantity = index;
      if (unit < 0 && matchHeader(cell, unitHeaders)) unit = index;
      if (code < 0 && matchHeader(cell, codeHeaders)) code = index;
    });
    if (description >= 0) return { rowIndex, description, quantity, unit, code };
  }
  return null;
}

function parseNumeric(value: string) {
  const cleaned = value.replace(/,/g, "").replace(/[^0-9.-]/g, "");
  if (!cleaned) return null;
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : null;
}

function meaningfulDescription(value: string) {
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length < 4 || text.length > 800) return false;
  if (!/[a-zA-Z\u0600-\u06ff]/.test(text)) return false;
  if (boilerplatePatterns.some((pattern) => pattern.test(text))) return false;
  if ([...descriptionHeaders, ...quantityHeaders, ...unitHeaders, ...codeHeaders].some((header) => normalise(text) === normalise(header))) return false;
  return true;
}

function rowsToItems(rows: string[][], sourceSheet?: string) {
  const items: ExtractedItem[] = [];
  const map = headerMap(rows);
  const start = map ? map.rowIndex + 1 : 0;

  for (let index = start; index < rows.length && items.length < MAX_ITEMS; index += 1) {
    const row = rows[index].map((cell) => cell.trim());
    if (!row.some(Boolean)) continue;

    let description = "";
    let quantity: number | null = null;
    let unit: string | null = null;
    let itemCode: string | null = null;
    let confidence = 0.58;

    if (map) {
      description = row[map.description] ?? "";
      quantity = map.quantity >= 0 ? parseNumeric(row[map.quantity] ?? "") : null;
      unit = map.unit >= 0 ? (row[map.unit] || null) : null;
      itemCode = map.code >= 0 ? (row[map.code] || null) : null;
      confidence = 0.92;
    } else {
      const textualCells = row.filter((cell) => /[a-zA-Z\u0600-\u06ff]/.test(cell));
      description = textualCells.sort((a, b) => b.length - a.length)[0] ?? "";
      const numericCells = row.filter((cell) => /^\s*\d+(?:[.,]\d+)?\s*$/.test(cell));
      quantity = numericCells.length ? parseNumeric(numericCells[numericCells.length - 1]) : null;
      confidence = textualCells.length ? 0.62 : 0.35;
    }

    if (!meaningfulDescription(description)) continue;
    items.push({
      line_number: index + 1,
      item_code: itemCode,
      description,
      quantity,
      unit,
      raw_text: row.filter(Boolean).join(" | "),
      extraction_confidence: confidence,
      source_sheet: sourceSheet ?? null,
    });
  }
  return items;
}

function parseDelimitedText(text: string) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  const sample = lines.slice(0, 10).join("\n");
  const candidates = ["\t", ",", ";", "|"];
  const delimiter = candidates
    .map((candidate) => ({ candidate, count: sample.split(candidate).length - 1 }))
    .sort((a, b) => b.count - a.count)[0];

  if (delimiter && delimiter.count >= Math.max(2, lines.length / 3)) {
    return rowsToItems(lines.map((line) => line.split(delimiter.candidate).map((cell) => cell.trim())), "text");
  }

  return lines
    .map((line, index) => {
      const clean = line.replace(/\s+/g, " ").trim();
      const numbered = clean.match(/^(\d{1,5})[\s.)-]+(.+)$/);
      const description = numbered?.[2]?.trim() ?? clean;
      if (!meaningfulDescription(description)) return null;
      const qtyMatch = description.match(/(?:^|\s)(\d+(?:\.\d+)?)\s*(pcs?|pieces?|sets?|ea|each|عدد|قطعه|قطعة|طقم)\s*$/i);
      const quantity = qtyMatch ? Number(qtyMatch[1]) : null;
      const withoutQty = qtyMatch ? description.slice(0, qtyMatch.index).trim() : description;
      return {
        line_number: index + 1,
        item_code: numbered?.[1] ?? null,
        description: withoutQty || description,
        quantity,
        unit: qtyMatch?.[2] ?? null,
        raw_text: clean,
        extraction_confidence: numbered ? 0.76 : 0.48,
        source_sheet: "text",
      } satisfies ExtractedItem;
    })
    .filter((item): item is ExtractedItem => Boolean(item))
    .slice(0, MAX_ITEMS);
}

async function parsePdf(buffer: ArrayBuffer) {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    const items = parseDelimitedText(result.text ?? "").map((item) => ({ ...item, source_sheet: null }));
    return { items, pages: result.total ?? null };
  } finally {
    await parser.destroy();
  }
}

async function parseWorkbook(buffer: ArrayBuffer) {
  const workbook = new Workbook();
  await workbook.xlsx.load(Buffer.from(buffer) as never);
  const items: ExtractedItem[] = [];
  const sheets: string[] = [];

  workbook.eachSheet((worksheet) => {
    if (items.length >= MAX_ITEMS) return;
    sheets.push(worksheet.name);
    const rows: string[][] = [];
    worksheet.eachRow({ includeEmpty: false }, (row) => {
      const values = Array.isArray(row.values) ? row.values.slice(1) : [];
      rows.push(values.map(asCellText));
    });
    items.push(...rowsToItems(rows, worksheet.name).slice(0, MAX_ITEMS - items.length));
  });

  return { items, sheets };
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Choose a tender PDF, XLSX, CSV or TXT file." }, { status: 400 });
    }
    if (file.size <= 0) return NextResponse.json({ error: "The uploaded file is empty." }, { status: 400 });
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: "For this MVP, tender files must be 4 MB or smaller." }, { status: 413 });
    }

    const filename = file.name || "tender-document";
    const extension = filename.toLowerCase().split(".").pop() ?? "";
    const buffer = await file.arrayBuffer();
    let extracted: ExtractedItem[] = [];
    let parseMeta: Record<string, unknown> = {};
    let parser = "text";

    if (file.type === "application/pdf" || extension === "pdf") {
      parser = "pdf-parse";
      const parsed = await parsePdf(buffer);
      extracted = parsed.items;
      parseMeta = { pages: parsed.pages };
    } else if (extension === "xlsx" || file.type.includes("spreadsheetml")) {
      parser = "exceljs";
      const parsed = await parseWorkbook(buffer);
      extracted = parsed.items;
      parseMeta = { sheets: parsed.sheets };
    } else if (["csv", "txt", "tsv"].includes(extension) || file.type.startsWith("text/")) {
      parser = "text";
      extracted = parseDelimitedText(new TextDecoder().decode(buffer));
    } else {
      return NextResponse.json({ error: "Unsupported file type. Use PDF, XLSX, CSV, TSV or TXT." }, { status: 415 });
    }

    if (!extracted.length) {
      return NextResponse.json({
        error: "No line items could be extracted automatically. Try an XLSX/CSV BoQ export or a text-based PDF.",
        parser,
      }, { status: 422 });
    }

    const catalog = await loadCatalog();
    const items = extracted.map((item) => chooseMatch(item, catalog));
    const exact = items.filter((item) => item.match_type === "exact").length;
    const equivalent = items.filter((item) => item.match_type === "equivalent").length;
    const missing = items.filter((item) => item.match_type === "missing").length;
    const total = items.length;
    const coverage = total ? Math.round(((exact + equivalent) / total) * 100) : 0;
    const confirmedCoverage = total ? Math.round((exact / total) * 100) : 0;
    const extractionQuality = total
      ? Math.round((items.reduce((sum, item) => sum + item.extraction_confidence, 0) / total) * 100)
      : 0;
    const recommendation = coverage >= 80 && extractionQuality >= 60
      ? "BID"
      : coverage >= 55
        ? "REVIEW"
        : "NO BID";

    return NextResponse.json({
      document: {
        filename,
        mime_type: file.type || null,
        file_size_bytes: file.size,
        parser,
        ...parseMeta,
      },
      summary: {
        total_items: total,
        exact_matches: exact,
        possible_equivalents: equivalent,
        missing_items: missing,
        achievable_coverage: coverage,
        confirmed_coverage: confirmedCoverage,
        extraction_quality: extractionQuality,
        recommendation,
      },
      items,
      caveat: "Deterministic MVP analysis. Possible equivalents and technical specifications require human confirmation before quotation or bid submission.",
    });
  } catch (error) {
    console.error("tender BoQ analysis failed", error);
    return NextResponse.json({ error: "Tender document analysis failed." }, { status: 500 });
  }
}
