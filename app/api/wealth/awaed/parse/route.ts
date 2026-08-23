import ExcelJS from "exceljs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_FILE_BYTES = 10 * 1024 * 1024;

type HoldingType = "سهم" | "صندوق" | "مرابحة" | "نقد" | "صك" | "أصل آخر";

type Holding = {
  name: string;
  type: HoldingType;
  value: number;
  confidence: "مرتفع" | "متوسط" | "منخفض";
  source: string;
};

const arabicDigits: Record<string, string> = {
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
  "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
  "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4",
  "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
};

function normalizeDigits(value: string) {
  return value
    .replace(/[٠-٩۰-۹]/g, (digit) => arabicDigits[digit] ?? digit)
    .replaceAll("٬", ",")
    .replaceAll("٫", ".")
    .replace(/\u00a0/g, " ");
}

function numberFrom(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const text = normalizeDigits(String(value ?? ""))
    .replace(/[^0-9.,-]/g, "")
    .replace(/,(?=\d{3}(?:\D|$))/g, "");
  const parsed = Number(text.replaceAll(",", ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function compact(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function detectType(text: string): HoldingType {
  const value = text.toLowerCase();
  if (/مرابح|murabaha|murabahah/.test(value)) return "مرابحة";
  if (/صندوق|fund|mutual|etf/.test(value)) return "صندوق";
  if (/صك|sukuk|bond/.test(value)) return "صك";
  if (/نقد|سيول|cash|balance/.test(value)) return "نقد";
  if (/سهم|أسهم|stock|share|equity|شركة/.test(value)) return "سهم";
  return "أصل آخر";
}

function cleanName(value: string) {
  return compact(
    normalizeDigits(value)
      .replace(/(?:ر\.?\s?س|SAR|ريال(?:\s+سعودي)?)/gi, " ")
      .replace(/[+-]?\d[\d,\s]*(?:\.\d+)?/g, " ")
      .replace(/[|•·]+/g, " "),
  ).slice(0, 120);
}

function textLineHoldings(text: string) {
  const candidates: Holding[] = [];
  const lines = text.split(/\r?\n/).map(compact).filter(Boolean);

  for (const original of lines) {
    const line = normalizeDigits(original);
    if (/^(الإجمالي|المجموع|total|portfolio value|القيمة الإجمالية)/i.test(line)) continue;
    const matches = [...line.matchAll(/[+-]?\d[\d,\s]*(?:\.\d+)?/g)]
      .map((match) => numberFrom(match[0]))
      .filter((value) => value > 0);
    if (!matches.length) continue;
    const value = Math.max(...matches);
    if (value < 10) continue;
    const name = cleanName(line);
    if (name.length < 2 || /^(التاريخ|date|quantity|الكمية|السعر|price)$/i.test(name)) continue;
    candidates.push({
      name,
      type: detectType(line),
      value,
      confidence: /ر\.?\s?س|SAR|ريال/i.test(line) ? "متوسط" : "منخفض",
      source: original,
    });
  }

  return dedupe(candidates).slice(0, 120);
}

function dedupe(items: Holding[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.name.toLowerCase()}|${Math.round(item.value * 100)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function csvRows(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

function headerIndex(headers: string[], patterns: RegExp[]) {
  return headers.findIndex((header) => patterns.some((pattern) => pattern.test(header)));
}

function holdingsFromRows(rows: unknown[][], sourceName: string) {
  if (!rows.length) return [] as Holding[];
  const stringRows = rows.map((row) => row.map(compact));
  let headerRow = -1;
  let nameIndex = -1;
  let valueIndex = -1;
  let typeIndex = -1;

  for (let index = 0; index < Math.min(stringRows.length, 12); index += 1) {
    const headers = stringRows[index].map((value) => value.toLowerCase());
    const possibleName = headerIndex(headers, [/اسم/, /الأصل/, /الاستثمار/, /المنتج/, /السهم/, /name/, /asset/, /security/, /instrument/]);
    const possibleValue = headerIndex(headers, [/القيمة الحالية/, /القيمة السوقية/, /^القيمة$/, /الرصيد/, /market value/, /current value/, /balance/, /^amount$/]);
    if (possibleName >= 0 && possibleValue >= 0) {
      headerRow = index;
      nameIndex = possibleName;
      valueIndex = possibleValue;
      typeIndex = headerIndex(headers, [/النوع/, /الفئة/, /type/, /category/, /asset class/]);
      break;
    }
  }

  if (headerRow >= 0) {
    const items: Holding[] = [];
    for (const row of stringRows.slice(headerRow + 1)) {
      const name = compact(row[nameIndex]);
      const value = numberFrom(row[valueIndex]);
      if (!name || value <= 0) continue;
      const typeText = typeIndex >= 0 ? row[typeIndex] : name;
      items.push({
        name: name.slice(0, 120),
        type: detectType(typeText),
        value,
        confidence: "مرتفع",
        source: sourceName,
      });
    }
    if (items.length) return dedupe(items);
  }

  return textLineHoldings(stringRows.map((row) => row.join(" | ")).join("\n"));
}

async function parsePdf(bytes: Uint8Array) {
  const module = await import("pdf-parse");
  const PDFParse = (module as unknown as { PDFParse?: new (input: { data: Uint8Array }) => {
    getText: () => Promise<{ text?: string }>;
    destroy?: () => Promise<void> | void;
  } }).PDFParse;
  if (!PDFParse) throw new Error("PDF parser is unavailable.");
  const parser = new PDFParse({ data: bytes });
  try {
    const result = await parser.getText();
    return result.text ?? "";
  } finally {
    await parser.destroy?.();
  }
}

async function parseWorkbook(bytes: Uint8Array) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  const holdings: Holding[] = [];
  workbook.eachSheet((sheet) => {
    const rows: unknown[][] = [];
    sheet.eachRow({ includeEmpty: false }, (row) => {
      const rawValues = row.values as unknown;
      const values: unknown[] = Array.isArray(rawValues)
        ? rawValues.slice(1)
        : Object.values((rawValues ?? {}) as Record<string, unknown>);
      rows.push(values.map((cell) => {
        if (cell && typeof cell === "object" && "result" in cell) return (cell as { result?: unknown }).result ?? "";
        if (cell && typeof cell === "object" && "text" in cell) return (cell as { text?: unknown }).text ?? "";
        return cell ?? "";
      }));
    });
    holdings.push(...holdingsFromRows(rows, sheet.name));
  });
  return dedupe(holdings);
}

function summarize(holdings: Holding[]) {
  const categories: Record<string, number> = {};
  let total = 0;
  for (const holding of holdings) {
    total += holding.value;
    categories[holding.type] = (categories[holding.type] ?? 0) + holding.value;
  }
  return { total, categories };
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return Response.json({ error: "اختر ملف كشف أولًا." }, { status: 400 });
    }
    if (file.size <= 0 || file.size > MAX_FILE_BYTES) {
      return Response.json({ error: "حجم الملف يجب أن يكون أقل من 10 MB." }, { status: 400 });
    }

    const lowerName = file.name.toLowerCase();
    const bytes = new Uint8Array(await file.arrayBuffer());
    let holdings: Holding[] = [];
    let rawPreview = "";

    if (lowerName.endsWith(".pdf") || file.type === "application/pdf") {
      const text = await parsePdf(bytes);
      rawPreview = compact(text).slice(0, 1200);
      holdings = textLineHoldings(text);
    } else if (lowerName.endsWith(".xlsx")) {
      holdings = await parseWorkbook(bytes);
    } else if (lowerName.endsWith(".csv") || file.type.includes("csv")) {
      const text = new TextDecoder("utf-8").decode(bytes);
      rawPreview = compact(text).slice(0, 1200);
      holdings = holdingsFromRows(csvRows(text), file.name);
    } else {
      return Response.json({ error: "ندعم حاليًا PDF وXLSX وCSV. الصور وXLS ستضاف لاحقًا." }, { status: 415 });
    }

    const summary = summarize(holdings);
    return Response.json({
      fileName: file.name,
      count: holdings.length,
      holdings,
      total: summary.total,
      categories: summary.categories,
      rawPreview,
      warning: holdings.length
        ? "هذه قراءة آلية أولية. راجع الأسماء والقيم قبل اعتمادها في ثروتك."
        : "لم نستطع اكتشاف أصول بثقة من هذا الملف. جرّب XLSX/CSV أو استخدم الإدخال السريع مؤقتًا.",
    });
  } catch (error) {
    console.error("Awaed statement parser failed", error);
    return Response.json({ error: "تعذر تحليل الكشف. جرّب ملفًا آخر أو الإدخال السريع." }, { status: 500 });
  }
}
