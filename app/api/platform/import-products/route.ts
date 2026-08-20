import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import ExcelJS from "exceljs";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_IMPORTED_PRODUCTS = 25_000;
const MAX_HEADER_SCAN_ROWS = 25;

type FieldKey =
  | "sku"
  | "name"
  | "description"
  | "category"
  | "brand"
  | "manufacturer"
  | "mpn"
  | "nupco"
  | "aliases"
  | "unit"
  | "stock"
  | "reserved"
  | "unitcost"
  | "saleprice";

type SheetRows = { sheet: string; rows: string[][] };
type ExistingProduct = {
  sku: string;
  name: string;
  description: string | null;
  category: string | null;
  brand: string | null;
  manufacturer: string | null;
  manufacturer_part_number: string | null;
  nupco_code: string | null;
  aliases: string[] | null;
  unit: string | null;
  stock_qty: number;
  reserved_qty: number;
  unit_cost: number | null;
  sale_price: number | null;
  metadata: Record<string, unknown> | null;
};

function normalizeHeader(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^a-z0-9\u0600-\u06ff]+/g, "")
    .trim();
}

const rawAliases: Record<FieldKey, string[]> = {
  sku: [
    "sku", "product code", "productcode", "item code", "itemcode", "internal code", "internalcode",
    "stock code", "stockcode", "material code", "materialcode", "item no", "itemno", "item number", "itemnumber",
    "رقم الصنف", "كود الصنف", "كود المنتج", "الرقم الداخلي", "رمز الصنف",
  ],
  name: [
    "name", "product name", "productname", "item name", "itemname", "product", "item",
    "اسم المنتج", "اسم الصنف", "المنتج", "الصنف",
  ],
  description: [
    "description", "long description", "longdescription", "product description", "productdescription",
    "item description", "itemdescription", "specification", "specifications", "spec", "specs", "details",
    "الوصف", "وصف المنتج", "وصف الصنف", "المواصفات", "تفاصيل",
  ],
  category: [
    "category", "product category", "productcategory", "group", "family", "segment", "class",
    "التصنيف", "الفئة", "المجموعة", "العائلة",
  ],
  brand: ["brand", "trade name", "tradename", "العلامة التجارية", "الماركة"],
  manufacturer: [
    "manufacturer", "manufacturer name", "manufacturername", "maker", "producer",
    "الشركة المصنعة", "الشركه المصنعه", "المصنع", "اسم المصنع",
  ],
  mpn: [
    "manufacturer part number", "manufacturerpartnumber", "mpn", "part number", "partnumber", "part no", "partno",
    "catalog number", "catalognumber", "catalogue number", "cataloguenumber", "cat no", "catno", "reference", "ref",
    "رقم المصنع", "رقم الجزء", "رقم الكتالوج", "الرقم المرجعي",
  ],
  nupco: [
    "nupco code", "nupcocode", "nupco generic code", "nupcogenericcode", "generic code", "genericcode",
    "كود نوبكو", "رمز نوبكو", "الكود العام", "الرمز العام",
  ],
  aliases: [
    "aliases", "alias", "synonyms", "synonym", "alternate names", "alternatenames", "alternative names", "alternativenames", "keywords",
    "اسم بديل", "اسماء بديلة", "مرادفات", "كلمات مفتاحية",
  ],
  unit: ["uom", "unit", "unit of measure", "unitofmeasure", "وحدة", "الوحدة", "وحدة القياس"],
  stock: [
    "stock", "stock qty", "stockqty", "stock quantity", "stockquantity", "quantity", "qty", "on hand", "onhand", "available stock", "availablestock",
    "المخزون", "الكمية", "الكميه", "المتوفر", "الرصيد",
  ],
  reserved: ["reserved", "reserved qty", "reservedqty", "committed", "allocated", "المحجوز", "المخصص"],
  unitcost: ["unit cost", "unitcost", "cost", "purchase price", "purchaseprice", "التكلفة", "تكلفة الوحدة", "سعر الشراء"],
  saleprice: ["sale price", "saleprice", "selling price", "sellingprice", "price", "unit price", "unitprice", "سعر البيع", "السعر"],
};

const aliases: Record<FieldKey, Set<string>> = Object.fromEntries(
  Object.entries(rawAliases).map(([key, values]) => [key, new Set(values.map(normalizeHeader))]),
) as Record<FieldKey, Set<string>>;

function asNumber(value: unknown) {
  const text = String(value ?? "").replace(/,/g, "").trim();
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function cleanText(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeCode(value: unknown) {
  const text = cleanText(value);
  if (!text) return "";
  const digits = text.replace(/\D/g, "");
  if (digits.length === 13) return digits;
  return text;
}

function splitAliases(value: unknown) {
  return [...new Set(
    String(value ?? "")
      .split(/[;|\n]+/)
      .map((item) => cleanText(item))
      .filter(Boolean),
  )].slice(0, 30);
}

function parseCsvLine(line: string) {
  const out: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') { current += '"'; i += 1; }
      else quoted = !quoted;
    } else if (char === "," && !quoted) {
      out.push(current); current = "";
    } else current += char;
  }
  out.push(current);
  return out;
}

function rowsFromCsv(text: string): SheetRows[] {
  return [{
    sheet: "CSV",
    rows: text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim()).map(parseCsvLine),
  }];
}

async function rowsFromXlsx(buffer: Buffer): Promise<SheetRows[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  return workbook.worksheets.map((sheet) => {
    const rows: string[][] = [];
    sheet.eachRow({ includeEmpty: false }, (row) => {
      const values: string[] = [];
      const width = Math.max(row.cellCount, row.actualCellCount);
      for (let c = 1; c <= width; c += 1) values.push(row.getCell(c).text.trim());
      rows.push(values);
    });
    return { sheet: sheet.name, rows };
  }).filter((sheet) => sheet.rows.length);
}

function indexOf(headers: string[], key: FieldKey) {
  return headers.findIndex((header) => aliases[key].has(header));
}

function fieldIndexes(headers: string[]) {
  return {
    sku: indexOf(headers, "sku"),
    name: indexOf(headers, "name"),
    description: indexOf(headers, "description"),
    category: indexOf(headers, "category"),
    brand: indexOf(headers, "brand"),
    manufacturer: indexOf(headers, "manufacturer"),
    mpn: indexOf(headers, "mpn"),
    nupco: indexOf(headers, "nupco"),
    aliases: indexOf(headers, "aliases"),
    unit: indexOf(headers, "unit"),
    stock: indexOf(headers, "stock"),
    reserved: indexOf(headers, "reserved"),
    unitcost: indexOf(headers, "unitcost"),
    saleprice: indexOf(headers, "saleprice"),
  };
}

function detectCatalogTable(sheets: SheetRows[]) {
  let best: { sheet: string; rows: string[][]; headerIndex: number; headers: string[]; idx: ReturnType<typeof fieldIndexes>; score: number } | null = null;

  for (const sheet of sheets) {
    const limit = Math.min(MAX_HEADER_SCAN_ROWS, sheet.rows.length);
    for (let headerIndex = 0; headerIndex < limit; headerIndex += 1) {
      const headers = sheet.rows[headerIndex].map(normalizeHeader);
      const idx = fieldIndexes(headers);
      const hasPrimaryCode = idx.sku >= 0 || idx.mpn >= 0 || idx.nupco >= 0;
      const hasDescription = idx.name >= 0 || idx.description >= 0;
      if (!hasPrimaryCode || !hasDescription) continue;
      const recognized = Object.values(idx).filter((value) => value >= 0).length;
      const score = recognized * 10 + Math.min(20, sheet.rows.length - headerIndex);
      if (!best || score > best.score) best = { sheet: sheet.sheet, rows: sheet.rows, headerIndex, headers, idx, score };
    }
  }
  return best;
}

function rowText(row: string[], index: number) {
  return index >= 0 ? cleanText(row[index]) : "";
}

export async function POST(request: NextRequest) {
  try {
    const authorization = request.headers.get("authorization") || "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
    if (!token) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) return NextResponse.json({ error: "Platform configuration is incomplete." }, { status: 500 });

    const supabase = createClient(url, key, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) return NextResponse.json({ error: "Invalid session." }, { status: 401 });

    const form = await request.formData();
    const orgId = String(form.get("orgId") || "").trim();
    const file = form.get("file");
    if (!orgId || !(file instanceof File)) return NextResponse.json({ error: "Organization and file are required." }, { status: 400 });
    if (file.size > MAX_FILE_BYTES) return NextResponse.json({ error: "File is too large. Maximum size is 25 MB." }, { status: 400 });

    const { data: membership, error: membershipError } = await supabase
      .from("ln_organization_members")
      .select("org_id,role")
      .eq("org_id", orgId)
      .eq("status", "active")
      .maybeSingle();
    if (membershipError) throw membershipError;
    if (!membership) return NextResponse.json({ error: "You do not have access to this organization." }, { status: 403 });

    const lowerName = file.name.toLowerCase();
    const bytes = Buffer.from(await file.arrayBuffer());
    let sheets: SheetRows[];
    if (lowerName.endsWith(".csv")) sheets = rowsFromCsv(bytes.toString("utf8"));
    else if (lowerName.endsWith(".xlsx")) sheets = await rowsFromXlsx(bytes);
    else return NextResponse.json({ error: "Use an .xlsx or .csv file." }, { status: 400 });

    const detected = detectCatalogTable(sheets);
    if (!detected) {
      return NextResponse.json({
        error: "Could not identify a product table. Include a product name/description plus at least one code column such as SKU, Manufacturer Part Number, or NUPCO/Generic Code.",
      }, { status: 400 });
    }

    const bodyRows = detected.rows.slice(detected.headerIndex + 1).filter((row) => row.some((cell) => cleanText(cell)));
    if (!bodyRows.length) return NextResponse.json({ error: "The detected product table has no product rows." }, { status: 400 });

    const { data: existingRows, error: existingError } = await supabase
      .from("ln_products")
      .select("sku,name,description,category,brand,manufacturer,manufacturer_part_number,nupco_code,aliases,unit,stock_qty,reserved_qty,unit_cost,sale_price,metadata")
      .eq("org_id", orgId);
    if (existingError) throw existingError;
    const existingBySku = new Map(((existingRows ?? []) as ExistingProduct[]).map((product) => [product.sku.trim().toLowerCase(), product]));

    const importedAt = new Date().toISOString();
    let generatedSkuCount = 0;
    let skippedRows = 0;
    let duplicateRows = 0;
    let withNupcoCode = 0;
    let withMpn = 0;
    let withDescription = 0;
    const productMap = new Map<string, Record<string, unknown>>();

    for (const row of bodyRows) {
      const rawSku = rowText(row, detected.idx.sku);
      const mpn = rowText(row, detected.idx.mpn);
      const nupcoCode = normalizeCode(rowText(row, detected.idx.nupco));
      let sku = rawSku || mpn || nupcoCode;
      if (!sku) { skippedRows += 1; continue; }
      if (!rawSku) generatedSkuCount += 1;

      const keySku = sku.trim().toLowerCase();
      const existing = existingBySku.get(keySku);
      const description = rowText(row, detected.idx.description);
      const name = rowText(row, detected.idx.name) || description || existing?.name || "";
      if (!name) { skippedRows += 1; continue; }

      const aliasesCell = rowText(row, detected.idx.aliases);
      const parsedAliases = aliasesCell ? splitAliases(aliasesCell) : [];
      const existingAliases = Array.isArray(existing?.aliases) ? existing.aliases.filter(Boolean) : [];
      const mergedAliases = [...new Set([...existingAliases, ...parsedAliases])].slice(0, 30);

      const stock = detected.idx.stock >= 0 ? asNumber(row[detected.idx.stock]) : null;
      const reserved = detected.idx.reserved >= 0 ? asNumber(row[detected.idx.reserved]) : null;
      const unitCost = detected.idx.unitcost >= 0 ? asNumber(row[detected.idx.unitcost]) : null;
      const salePrice = detected.idx.saleprice >= 0 ? asNumber(row[detected.idx.saleprice]) : null;
      const manufacturer = rowText(row, detected.idx.manufacturer);
      const brand = rowText(row, detected.idx.brand);
      const category = rowText(row, detected.idx.category);
      const unit = rowText(row, detected.idx.unit);

      const product = {
        org_id: orgId,
        sku: sku.trim(),
        name,
        description: description || existing?.description || null,
        category: category || existing?.category || null,
        brand: brand || existing?.brand || null,
        manufacturer: manufacturer || existing?.manufacturer || null,
        manufacturer_part_number: mpn || existing?.manufacturer_part_number || null,
        nupco_code: nupcoCode || existing?.nupco_code || null,
        aliases: mergedAliases,
        unit: unit || existing?.unit || "unit",
        stock_qty: stock ?? Number(existing?.stock_qty ?? 0),
        reserved_qty: reserved ?? Number(existing?.reserved_qty ?? 0),
        unit_cost: unitCost ?? existing?.unit_cost ?? null,
        sale_price: salePrice ?? existing?.sale_price ?? null,
        active: true,
        metadata: {
          ...(existing?.metadata ?? {}),
          illustrative: false,
          import_source: file.name,
          import_sheet: detected.sheet,
          import_header_row: detected.headerIndex + 1,
          imported_by: userData.user.id,
          imported_at: importedAt,
          catalog_intelligence_version: "v1",
        },
      };

      if (productMap.has(keySku)) duplicateRows += 1;
      productMap.set(keySku, product);
      if (product.nupco_code) withNupcoCode += 1;
      if (product.manufacturer_part_number) withMpn += 1;
      if (product.description) withDescription += 1;
    }

    const products = [...productMap.values()];
    if (!products.length) return NextResponse.json({ error: "No valid products were found." }, { status: 400 });
    if (products.length > MAX_IMPORTED_PRODUCTS) {
      return NextResponse.json({ error: `This import contains ${products.length.toLocaleString()} products. V1 supports up to ${MAX_IMPORTED_PRODUCTS.toLocaleString()} products per file.` }, { status: 400 });
    }

    for (let start = 0; start < products.length; start += 500) {
      const batch = products.slice(start, start + 500);
      const { error } = await supabase.from("ln_products").upsert(batch, { onConflict: "org_id,sku" });
      if (error) throw error;
    }

    const { data: illustrativeRows, error: illustrativeError } = await supabase
      .from("ln_products")
      .select("id")
      .eq("org_id", orgId)
      .eq("active", true)
      .contains("metadata", { illustrative: true });
    if (illustrativeError) throw illustrativeError;
    const illustrativeIds = (illustrativeRows ?? []).map((row) => String(row.id));
    if (illustrativeIds.length) {
      const { error } = await supabase.from("ln_products").update({ active: false }).in("id", illustrativeIds);
      if (error) throw error;
    }

    await supabase.from("ln_activity_log").insert({
      org_id: orgId,
      actor_user_id: userData.user.id,
      activity_type: "products_imported",
      entity_type: "product",
      summary: `${products.length} products imported into tender intelligence catalog`,
      detail: {
        file_name: file.name,
        sheet_name: detected.sheet,
        header_row: detected.headerIndex + 1,
        count: products.length,
        skipped_rows: skippedRows,
        duplicate_rows_collapsed: duplicateRows,
        generated_sku_count: generatedSkuCount,
        with_nupco_code: withNupcoCode,
        with_manufacturer_part_number: withMpn,
        with_description: withDescription,
        illustrative_products_deactivated: illustrativeIds.length,
      },
    });

    let rematchRequestId: number | null = null;
    let rematchWarning: string | null = null;
    const { data: rematchData, error: rematchError } = await supabase.rpc("ln_request_tender_match_refresh", { p_org_id: orgId });
    if (rematchError) rematchWarning = rematchError.message;
    else if (rematchData !== null && rematchData !== undefined) rematchRequestId = Number(rematchData);

    return NextResponse.json({
      ok: true,
      count: products.length,
      sheet: detected.sheet,
      header_row: detected.headerIndex + 1,
      skipped_rows: skippedRows,
      duplicate_rows_collapsed: duplicateRows,
      generated_sku_count: generatedSkuCount,
      with_nupco_code: withNupcoCode,
      with_manufacturer_part_number: withMpn,
      with_description: withDescription,
      illustrative_products_deactivated: illustrativeIds.length,
      rematch_request_id: rematchRequestId,
      rematch_warning: rematchWarning,
    });
  } catch (error) {
    console.error("catalog intelligence import failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Import failed." }, { status: 500 });
  }
}
