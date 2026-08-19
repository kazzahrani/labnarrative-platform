import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import ExcelJS from "exceljs";

export const runtime = "nodejs";

const normalize = (value: unknown) => String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
const asNumber = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
};

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

function rowsFromCsv(text: string) {
  return text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim()).map(parseCsvLine);
}

async function rowsFromXlsx(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [] as string[][];
  const rows: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const values: string[] = [];
    const width = Math.max(row.cellCount, row.actualCellCount);
    for (let c = 1; c <= width; c += 1) values.push(row.getCell(c).text.trim());
    rows.push(values);
  });
  return rows;
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
    if (file.size > 8 * 1024 * 1024) return NextResponse.json({ error: "File is too large. Maximum size is 8 MB." }, { status: 400 });

    const { data: membership } = await supabase.from("ln_organization_members").select("org_id,role").eq("org_id", orgId).eq("status", "active").maybeSingle();
    if (!membership) return NextResponse.json({ error: "You do not have access to this organization." }, { status: 403 });

    const lowerName = file.name.toLowerCase();
    const bytes = Buffer.from(await file.arrayBuffer());
    let rows: string[][];
    if (lowerName.endsWith(".csv")) rows = rowsFromCsv(bytes.toString("utf8"));
    else if (lowerName.endsWith(".xlsx")) rows = await rowsFromXlsx(bytes);
    else return NextResponse.json({ error: "Use an .xlsx or .csv file." }, { status: 400 });

    if (rows.length < 2) return NextResponse.json({ error: "The file has no product rows." }, { status: 400 });
    if (rows.length > 5001) return NextResponse.json({ error: "V1 imports support up to 5,000 product rows at a time." }, { status: 400 });

    const headers = rows[0].map(normalize);
    const aliases: Record<string, string[]> = {
      sku: ["sku", "productcode", "itemcode", "code"],
      name: ["name", "productname", "itemname", "description"],
      category: ["category", "productcategory", "group"],
      brand: ["brand", "manufacturer"],
      stock: ["stock", "stockqty", "quantity", "qty", "onhand"],
      reserved: ["reserved", "reservedqty", "committed"],
      unitcost: ["unitcost", "cost", "purchaseprice"],
      saleprice: ["saleprice", "price", "sellingprice"],
    };
    const indexOf = (keyName: string) => headers.findIndex((h) => aliases[keyName].includes(h));
    const idx = { sku: indexOf("sku"), name: indexOf("name"), category: indexOf("category"), brand: indexOf("brand"), stock: indexOf("stock"), reserved: indexOf("reserved"), unitcost: indexOf("unitcost"), saleprice: indexOf("saleprice") };
    if (idx.sku < 0 || idx.name < 0) return NextResponse.json({ error: "The file must include SKU and Name columns." }, { status: 400 });

    const products = rows.slice(1).map((row) => ({
      org_id: orgId,
      sku: String(row[idx.sku] || "").trim(),
      name: String(row[idx.name] || "").trim(),
      category: idx.category >= 0 ? String(row[idx.category] || "").trim() || null : null,
      brand: idx.brand >= 0 ? String(row[idx.brand] || "").trim() || null : null,
      stock_qty: idx.stock >= 0 ? asNumber(row[idx.stock]) : 0,
      reserved_qty: idx.reserved >= 0 ? asNumber(row[idx.reserved]) : 0,
      unit_cost: idx.unitcost >= 0 && String(row[idx.unitcost] || "").trim() ? asNumber(row[idx.unitcost]) : null,
      sale_price: idx.saleprice >= 0 && String(row[idx.saleprice] || "").trim() ? asNumber(row[idx.saleprice]) : null,
      active: true,
      metadata: { import_source: file.name, imported_by: userData.user.id },
    })).filter((row) => row.sku && row.name);

    if (!products.length) return NextResponse.json({ error: "No valid products were found." }, { status: 400 });
    for (let start = 0; start < products.length; start += 500) {
      const batch = products.slice(start, start + 500);
      const { error } = await supabase.from("ln_products").upsert(batch, { onConflict: "org_id,sku" });
      if (error) throw error;
    }

    await supabase.from("ln_activity_log").insert({ org_id: orgId, actor_user_id: userData.user.id, activity_type: "products_imported", entity_type: "product", summary: `${products.length} products imported`, detail: { file_name: file.name, count: products.length } });
    return NextResponse.json({ ok: true, count: products.length });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Import failed." }, { status: 500 });
  }
}
