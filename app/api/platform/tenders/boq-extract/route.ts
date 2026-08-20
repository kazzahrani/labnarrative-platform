import { NextResponse } from "next/server";
import { Workbook } from "exceljs";
import { PDFParse } from "pdf-parse";
import { parseNupcoItemListPage } from "../../../../../lib/tenders/nupco-item-parser";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_ITEMS = 2000;

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

type ParseMeta = {
  pages?: number | null;
  sheets?: string[];
  structured_source?: "nupco_item_list" | "workbook" | "delimited_text";
  total_detected_items?: number;
  offset?: number;
  limit?: number;
  truncated?: boolean;
};

const descriptionHeaders = [
  "description", "item description", "product", "material", "specification", "specifications", "details",
  "الوصف", "وصف", "الصنف", "اسم الصنف", "البند", "المادة", "المواصفات", "البيان",
];
const quantityHeaders = ["quantity", "qty", "الكمية", "كمية", "العدد", "عدد"];
const unitHeaders = ["unit", "uom", "unit of measure", "الوحدة", "وحدة"];
const codeHeaders = ["code", "item code", "item no", "item number", "sku", "رقم الصنف", "رقم البند", "الكود", "كود"];
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

function rowsToItems(rows: string[][], sourceSheet?: string, maxItems = MAX_ITEMS) {
  const items: ExtractedItem[] = [];
  const map = headerMap(rows);
  const start = map ? map.rowIndex + 1 : 0;

  for (let index = start; index < rows.length && items.length < maxItems; index += 1) {
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
      description = [...textualCells].sort((a, b) => b.length - a.length)[0] ?? "";
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

function parseGenericDelimitedText(text: string) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  const sample = lines.slice(0, 10).join("\n");
  const candidates = ["\t", ",", ";", "|"];
  const delimiter = candidates
    .map((candidate) => ({ candidate, count: sample.split(candidate).length - 1 }))
    .sort((a, b) => b.count - a.count)[0];

  if (delimiter && delimiter.count >= Math.max(2, lines.length / 3)) {
    return rowsToItems(
      lines.map((line) => line.split(delimiter.candidate).map((cell) => cell.trim())),
      "text",
      Number.MAX_SAFE_INTEGER,
    );
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
    .filter((item): item is NonNullable<typeof item> => item !== null);
}

function parseText(text: string, offset: number, limit: number) {
  const nupco = parseNupcoItemListPage(text, offset, limit);
  if (nupco.totalDetected > 0) {
    return {
      items: nupco.items,
      meta: {
        structured_source: "nupco_item_list" as const,
        total_detected_items: nupco.totalDetected,
        offset: nupco.offset,
        limit: nupco.limit,
        truncated: nupco.truncated,
      } satisfies ParseMeta,
    };
  }

  const allItems = parseGenericDelimitedText(text).map((item, index) => ({ ...item, line_number: index + 1 }));
  const totalDetected = allItems.length;
  const items = allItems.slice(offset, offset + limit);
  return {
    items,
    meta: {
      structured_source: "delimited_text" as const,
      total_detected_items: totalDetected,
      offset,
      limit,
      truncated: offset + items.length < totalDetected,
    } satisfies ParseMeta,
  };
}

async function parsePdf(buffer: ArrayBuffer, offset: number, limit: number) {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    const parsed = parseText(result.text ?? "", offset, limit);
    return { items: parsed.items.map((item) => ({ ...item, source_sheet: null })), pages: result.total ?? null, meta: parsed.meta };
  } finally {
    await parser.destroy();
  }
}

async function parseWorkbook(buffer: ArrayBuffer, offset: number, limit: number) {
  const workbook = new Workbook();
  await workbook.xlsx.load(Buffer.from(buffer) as never);
  const allItems: ExtractedItem[] = [];
  const sheets: string[] = [];

  workbook.eachSheet((worksheet) => {
    sheets.push(worksheet.name);
    const rows: string[][] = [];
    worksheet.eachRow({ includeEmpty: false }, (row) => {
      const values = Array.isArray(row.values) ? row.values.slice(1) : [];
      rows.push(values.map(asCellText));
    });

    const sheetItems = rowsToItems(rows, worksheet.name, Number.MAX_SAFE_INTEGER);
    for (const item of sheetItems) {
      const localLine = item.line_number;
      allItems.push({
        ...item,
        line_number: allItems.length + 1,
        raw_text: `[${worksheet.name} row ${localLine}] ${item.raw_text}`,
      });
    }
  });

  const totalDetected = allItems.length;
  const items = allItems.slice(offset, offset + limit);
  return {
    items,
    sheets,
    meta: {
      structured_source: "workbook" as const,
      total_detected_items: totalDetected,
      offset,
      limit,
      truncated: offset + items.length < totalDetected,
    } satisfies ParseMeta,
  };
}

function boundedInteger(value: FormDataEntryValue | null, fallback: number, min: number, max: number) {
  if (typeof value !== "string" || !value.trim()) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Choose a tender PDF, XLSX, CSV or TXT file." }, { status: 400 });
    if (file.size <= 0) return NextResponse.json({ error: "The uploaded file is empty." }, { status: 400 });
    if (file.size > MAX_FILE_BYTES) return NextResponse.json({ error: "Tender files must be 4 MB or smaller." }, { status: 413 });

    const offset = boundedInteger(formData.get("offset"), 0, 0, 1_000_000);
    const limit = boundedInteger(formData.get("limit"), MAX_ITEMS, 1, MAX_ITEMS);
    const filename = file.name || "tender-document";
    const extension = filename.toLowerCase().split(".").pop() ?? "";
    const buffer = await file.arrayBuffer();
    let extracted: ExtractedItem[] = [];
    let parseMeta: ParseMeta = {};
    let parser = "text";

    if (file.type === "application/pdf" || extension === "pdf") {
      parser = "pdf-parse";
      const parsed = await parsePdf(buffer, offset, limit);
      extracted = parsed.items;
      parseMeta = { pages: parsed.pages, ...parsed.meta };
    } else if (extension === "xlsx" || file.type.includes("spreadsheetml")) {
      parser = "exceljs";
      const parsed = await parseWorkbook(buffer, offset, limit);
      extracted = parsed.items;
      parseMeta = { sheets: parsed.sheets, ...parsed.meta };
    } else if (["csv", "txt", "tsv"].includes(extension) || file.type.startsWith("text/")) {
      const parsed = parseText(new TextDecoder().decode(buffer), offset, limit);
      extracted = parsed.items;
      parseMeta = parsed.meta;
    } else {
      return NextResponse.json({ error: "Unsupported file type. Use PDF, XLSX, CSV, TSV or TXT." }, { status: 415 });
    }

    const totalDetected = parseMeta.total_detected_items ?? extracted.length;
    const effectiveOffset = parseMeta.offset ?? 0;
    const effectiveLimit = parseMeta.limit ?? MAX_ITEMS;
    const truncated = parseMeta.truncated ?? (effectiveOffset + extracted.length < totalDetected);

    if (!extracted.length && totalDetected === 0) {
      return NextResponse.json({ error: "No line items could be extracted automatically. Try an XLSX/CSV BoQ export or a text-based PDF.", parser }, { status: 422 });
    }

    const extractionQuality = extracted.length
      ? Math.round((extracted.reduce((sum, item) => sum + item.extraction_confidence, 0) / extracted.length) * 100)
      : null;

    return NextResponse.json({
      document: { filename, mime_type: file.type || null, file_size_bytes: file.size, parser, ...parseMeta },
      summary: {
        total_items: extracted.length,
        returned_items: extracted.length,
        total_detected_items: totalDetected,
        offset: effectiveOffset,
        limit: effectiveLimit,
        truncated,
        extraction_quality: extractionQuality,
      },
      items: extracted,
      caveat: truncated
        ? "Extraction returned one safe chunk of the document. Request the next offset to continue before treating coverage as complete."
        : "Extraction complete for the detected item list. Matching is performed against the authenticated organization product catalog in LabNarrative.",
    });
  } catch (error) {
    console.error("platform tender BoQ extraction failed", error);
    return NextResponse.json({ error: "Tender document extraction failed." }, { status: 500 });
  }
}
