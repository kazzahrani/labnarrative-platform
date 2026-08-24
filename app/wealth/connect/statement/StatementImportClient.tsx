"use client";

import Link from "next/link";
import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { browserSupabase } from "@/lib/supabase-browser";
import styles from "./statement.module.css";

type Row = Record<string, string>;
type FieldKey = "name" | "symbol" | "quantity" | "unitPrice" | "marketValue" | "avgCost" | "totalCost" | "assetType";
type Mapping = Record<FieldKey, string>;

const PROVIDERS: Record<string, string> = {
  derayah: "دراية",
  alrajhi: "الراجحي المالية",
  snb: "SNB Capital",
  riyad: "الرياض المالية",
  alinma: "الإنماء للاستثمار",
  sahm: "Sahm",
};

const EMPTY_MAPPING: Mapping = { name: "", symbol: "", quantity: "", unitPrice: "", marketValue: "", avgCost: "", totalCost: "", assetType: "" };

const SYNONYMS: Record<FieldKey, string[]> = {
  name: ["name", "security name", "instrument", "asset", "company", "اسم", "اسم الورقة", "اسم السهم", "الأصل", "الشركة"],
  symbol: ["symbol", "ticker", "code", "security code", "رمز", "الرمز", "رمز السهم", "كود"],
  quantity: ["quantity", "qty", "shares", "units", "position", "الكمية", "كمية", "عدد الأسهم", "عدد الوحدات", "الوحدات"],
  unitPrice: ["price", "last price", "market price", "current price", "سعر", "السعر", "سعر السوق", "السعر الحالي"],
  marketValue: ["market value", "current value", "value", "marketvalue", "القيمة السوقية", "القيمة الحالية", "القيمة"],
  avgCost: ["average cost", "avg cost", "cost price", "average price", "متوسط التكلفة", "متوسط السعر", "سعر التكلفة"],
  totalCost: ["cost basis", "total cost", "book cost", "book value", "إجمالي التكلفة", "التكلفة", "القيمة الدفترية"],
  assetType: ["asset type", "security type", "type", "نوع الأصل", "نوع", "نوع الورقة"],
};

function normalizeDigits(value: string) {
  return value
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/٫/g, ".").replace(/٬/g, ",");
}

function num(value: string | undefined) {
  if (!value) return null;
  const cleaned = normalizeDigits(value).replace(/[^0-9.,()\-]/g, "").trim();
  if (!cleaned) return null;
  const negative = cleaned.startsWith("(") && cleaned.endsWith(")");
  const normalized = cleaned.replace(/[()]/g, "").replace(/,/g, "");
  const n = Number(normalized);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

function canonical(value: string) {
  return value.trim().toLowerCase().replace(/[\s_\-./]+/g, " ").replace(/\s+/g, " ");
}

function guessMapping(headers: string[]): Mapping {
  const result = { ...EMPTY_MAPPING };
  (Object.keys(SYNONYMS) as FieldKey[]).forEach((field) => {
    const exact = headers.find((header) => SYNONYMS[field].some((s) => canonical(header) === canonical(s)));
    if (exact) { result[field] = exact; return; }
    const fuzzy = headers.find((header) => SYNONYMS[field].some((s) => canonical(header).includes(canonical(s)) || canonical(s).includes(canonical(header))));
    if (fuzzy) result[field] = fuzzy;
  });
  return result;
}

function parseCsv(text: string): { headers: string[]; rows: Row[] } {
  const lines: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (ch === "," && !quoted) { row.push(cell); cell = ""; }
    else if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((v) => v.trim())) lines.push(row);
      row = [];
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); if (row.some((v) => v.trim())) lines.push(row); }
  if (!lines.length) return { headers: [], rows: [] };
  const headers = lines[0].map((h, i) => h.trim() || `عمود ${i + 1}`);
  return { headers, rows: lines.slice(1).map((values) => Object.fromEntries(headers.map((h, i) => [h, String(values[i] ?? "").trim()]))) };
}

async function parseExcel(file: File): Promise<{ headers: string[]; rows: Row[] }> {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const sheet = workbook.worksheets[0];
  if (!sheet) return { headers: [], rows: [] };
  const matrix: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (excelRow) => {
    const values = (excelRow.values as unknown[]).slice(1).map((v) => {
      if (v == null) return "";
      if (typeof v === "object" && v && "text" in (v as Record<string, unknown>)) return String((v as Record<string, unknown>).text ?? "");
      if (typeof v === "object" && v && "result" in (v as Record<string, unknown>)) return String((v as Record<string, unknown>).result ?? "");
      return String(v);
    });
    if (values.some((v) => v.trim())) matrix.push(values);
  });
  if (!matrix.length) return { headers: [], rows: [] };
  const headerIndex = Math.max(0, matrix.findIndex((r) => r.filter((x) => x.trim()).length >= 2));
  const headers = matrix[headerIndex].map((h, i) => h.trim() || `عمود ${i + 1}`);
  return { headers, rows: matrix.slice(headerIndex + 1).map((values) => Object.fromEntries(headers.map((h, i) => [h, String(values[i] ?? "").trim()]))) };
}

function resolveAssetType(raw: string, name: string, symbol: string) {
  const text = `${raw} ${name}`.toLowerCase();
  if (/reit|ريت/.test(text)) return "reit";
  if (/fund|صندوق/.test(text)) return "fund";
  if (/sukuk|صك/.test(text)) return "sukuk";
  if (/cash|نقد|سيولة/.test(text)) return "cash";
  if (/etf/.test(text)) return "etf";
  if (/gold|ذهب/.test(text)) return "gold";
  if (/real estate|عقار/.test(text)) return "real_estate";
  if (symbol) return "saudi_stock";
  return "other";
}

export default function StatementImportClient() {
  const [providerKey, setProviderKey] = useState("alrajhi");
  const [provider, setProvider] = useState(PROVIDERS.alrajhi);
  const [accountName, setAccountName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [mapping, setMapping] = useState<Mapping>(EMPTY_MAPPING);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const key = new URLSearchParams(window.location.search).get("provider") || "alrajhi";
    const safe = PROVIDERS[key] ? key : "alrajhi";
    setProviderKey(safe); setProvider(PROVIDERS[safe]); setAccountName(`${PROVIDERS[safe]} · كشف حساب`);
  }, []);

  const preview = useMemo(() => {
    return rows.map((r) => {
      const name = mapping.name ? r[mapping.name] : "";
      const symbol = mapping.symbol ? normalizeDigits(r[mapping.symbol] || "").replace(/\s/g, "") : "";
      const quantity = num(mapping.quantity ? r[mapping.quantity] : "") ?? 0;
      const unitPrice = num(mapping.unitPrice ? r[mapping.unitPrice] : "");
      const marketValueRaw = num(mapping.marketValue ? r[mapping.marketValue] : "");
      const avgCost = num(mapping.avgCost ? r[mapping.avgCost] : "");
      const totalCostRaw = num(mapping.totalCost ? r[mapping.totalCost] : "");
      const marketValue = marketValueRaw ?? (unitPrice !== null && quantity ? unitPrice * quantity : null);
      const totalCost = totalCostRaw ?? (avgCost !== null && quantity ? avgCost * quantity : null);
      const typeRaw = mapping.assetType ? r[mapping.assetType] : "";
      return { name: name || symbol, symbol, quantity, unitPrice: unitPrice ?? (marketValue !== null && quantity ? marketValue / quantity : null), marketValue, totalCost, assetType: resolveAssetType(typeRaw, name, symbol) };
    }).filter((r) => r.name && r.quantity > 0 && r.marketValue !== null && r.marketValue >= 0);
  }, [rows, mapping]);

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.files?.[0] || null;
    setFile(next); setError(""); setMessage(""); setHeaders([]); setRows([]); setMapping(EMPTY_MAPPING);
    if (!next) return;
    setParsing(true);
    try {
      const lower = next.name.toLowerCase();
      let parsed;
      if (lower.endsWith(".csv")) parsed = parseCsv(await next.text());
      else if (lower.endsWith(".xlsx")) parsed = await parseExcel(next);
      else throw new Error("حالياً ندعم CSV وExcel (.xlsx). أرسل لنا نموذج PDF لاحقًا لنضيف Parser خاصًا به.");
      if (!parsed.headers.length || !parsed.rows.length) throw new Error("لم أجد جدولًا قابلًا للقراءة في الملف.");
      setHeaders(parsed.headers); setRows(parsed.rows); setMapping(guessMapping(parsed.headers));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "تعذر قراءة الملف."); }
    finally { setParsing(false); }
  }

  async function rebuildSnapshot(uid: string) {
    const { data } = await browserSupabase.from("wealth_holdings").select("asset_type,market_value").eq("user_id", uid).eq("portfolio_kind", "real");
    let netWorth = 0, liquidAssets = 0; const allocation: Record<string, number> = {};
    for (const row of data || []) {
      if (row.market_value == null) continue;
      const value = Number(row.market_value); if (!Number.isFinite(value)) continue;
      netWorth += value; const type = String(row.asset_type || "other"); allocation[type] = (allocation[type] || 0) + value; if (type === "cash") liquidAssets += value;
    }
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    await browserSupabase.from("wealth_snapshots").upsert({ user_id: uid, snapshot_date: today, portfolio_kind: "real", net_worth: netWorth, liquid_assets: liquidAssets, annual_income_estimate: 0, currency: "SAR", allocation, metadata: { recalculated_by: "statement_import", recalculated_at: new Date().toISOString() } }, { onConflict: "user_id,snapshot_date,portfolio_kind" });
  }

  async function save() {
    setError(""); setMessage("");
    if (!file || !preview.length) { setError("راجع ربط الأعمدة أولًا؛ لا توجد مراكز صالحة للحفظ."); return; }
    if (!mapping.quantity || (!mapping.marketValue && !mapping.unitPrice)) { setError("حدد عمود الكمية، وحدد إما القيمة السوقية أو السعر الحالي."); return; }
    setSaving(true);
    try {
      const { data: userData, error: userError } = await browserSupabase.auth.getUser();
      if (userError || !userData.user) { window.location.replace(`/wealth/login?next=${encodeURIComponent(`/wealth/connect/statement?provider=${providerKey}`)}`); return; }
      const uid = userData.user.id;
      let { data: account, error: accountError } = await browserSupabase.from("wealth_accounts").select("id").eq("user_id", uid).eq("provider", provider).eq("portfolio_kind", "real").eq("connection_mode", "statement").eq("account_name", accountName.trim() || `${provider} · كشف حساب`).maybeSingle();
      if (accountError) throw accountError;
      if (!account) {
        const created = await browserSupabase.from("wealth_accounts").insert({ user_id: uid, provider, account_name: accountName.trim() || `${provider} · كشف حساب`, account_type: "investment", connection_mode: "statement", status: "active", currency: "SAR", portfolio_kind: "real", metadata: { source: "statement_import", provider_key: providerKey } }).select("id").single();
        if (created.error) throw created.error; account = created.data;
      }
      const { data: oldRows, error: oldError } = await browserSupabase.from("wealth_holdings").select("id").eq("user_id", uid).eq("account_id", account.id).eq("portfolio_kind", "real");
      if (oldError) throw oldError;
      const importResult = await browserSupabase.from("wealth_imports").insert({ user_id: uid, account_id: account.id, source: provider, file_name: file.name, file_type: file.name.split(".").pop()?.toLowerCase() || "unknown", parse_status: "reviewed", detected_count: preview.length, total_value: preview.reduce((s, r) => s + Number(r.marketValue || 0), 0), currency: "SAR", parser_version: "statement-mapper-v1", summary: { headers, mapping, source_rows: rows.length } }).select("id").single();
      if (importResult.error) throw importResult.error;
      const payload = preview.map((r) => ({ user_id: uid, account_id: account.id, import_id: importResult.data.id, asset_name: r.name, symbol: r.symbol || null, asset_type: r.assetType, quantity: r.quantity, unit_price: r.unitPrice, market_value: r.marketValue, cost_basis: r.totalCost, currency: "SAR", as_of_date: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()), portfolio_kind: "real", metadata: { source: "statement_import", provider, file_name: file.name, imported_at: new Date().toISOString() } }));
      const inserted = await browserSupabase.from("wealth_holdings").insert(payload);
      if (inserted.error) throw inserted.error;
      const oldIds = (oldRows || []).map((r) => r.id); if (oldIds.length) { const deleted = await browserSupabase.from("wealth_holdings").delete().in("id", oldIds); if (deleted.error) throw deleted.error; }
      await rebuildSnapshot(uid);
      await browserSupabase.from("wealth_imports").update({ parse_status: "saved", updated_at: new Date().toISOString() }).eq("id", importResult.data.id);
      setMessage(`تم حفظ ${preview.length} أصل من ${provider} وتحديث صافي الثروة.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "تعذر حفظ الكشف."); }
    finally { setSaving(false); }
  }

  const fields: Array<[FieldKey, string, boolean]> = [
    ["name", "اسم الأصل", false], ["symbol", "الرمز", false], ["quantity", "الكمية", true], ["unitPrice", "السعر الحالي", false], ["marketValue", "القيمة السوقية", false], ["avgCost", "متوسط التكلفة", false], ["totalCost", "إجمالي التكلفة", false], ["assetType", "نوع الأصل", false],
  ];

  return <main className={styles.page} dir="rtl"><div className={styles.shell}>
    <header className={styles.header}><div><Link href="/wealth/connect" className={styles.back}>العودة إلى إدارة الأصول</Link><p>استيراد فعلي · بدون كلمة مرور</p><h1>{provider}</h1><span>ارفع CSV أو Excel ثم راجع الأعمدة قبل حفظ أي شيء في ثروة.</span></div><Link href="/wealth/assets" className={styles.ghost}>الأصول</Link></header>
    {message && <div className={styles.success}>{message}</div>}{error && <div className={styles.error}>{error}</div>}
    <section className={styles.grid}>
      <article className={styles.panel}><small>١ · الملف</small><h2>ارفع كشف المحفظة</h2><label className={styles.fileBox}><input type="file" accept=".csv,.xlsx" onChange={handleFile}/><b>{parsing ? "جاري القراءة…" : file ? file.name : "اختر CSV أو Excel"}</b><span>لا نحتاج اسم المستخدم أو كلمة المرور.</span></label><label className={styles.accountLabel}>اسم الحساب<input value={accountName} onChange={(e)=>setAccountName(e.target.value)} /></label></article>
      <article className={styles.panel}><small>٢ · ربط الأعمدة</small><h2>ما معنى كل عمود؟</h2>{headers.length ? <div className={styles.mapping}>{fields.map(([key,label,required])=><label key={key}><span>{label}{required ? " *" : ""}</span><select value={mapping[key]} onChange={(e)=>setMapping((m)=>({...m,[key]:e.target.value}))}><option value="">— غير موجود —</option>{headers.map((h)=><option key={h} value={h}>{h}</option>)}</select></label>)}</div> : <p className={styles.muted}>بعد رفع الملف ستظهر الأعمدة هنا. ثروة ستحاول اكتشافها تلقائيًا، ويمكنك تصحيحها يدويًا.</p>}</article>
    </section>
    {rows.length > 0 && <section className={styles.preview}><div className={styles.previewHead}><div><small>٣ · المعاينة</small><h2>{preview.length} مركز جاهز للحفظ</h2></div><button className={styles.primary} onClick={save} disabled={saving || !preview.length}>{saving ? "جاري الحفظ…" : "اعتماد وحفظ"}</button></div><div className={styles.tableWrap}><table><thead><tr><th>الأصل</th><th>الرمز</th><th>الكمية</th><th>السعر</th><th>القيمة</th><th>التكلفة</th><th>النوع</th></tr></thead><tbody>{preview.slice(0,100).map((r,i)=><tr key={`${r.symbol}-${i}`}><td>{r.name}</td><td>{r.symbol || "—"}</td><td>{r.quantity}</td><td>{r.unitPrice == null ? "—" : r.unitPrice.toLocaleString("ar-SA")}</td><td>{r.marketValue == null ? "—" : `${r.marketValue.toLocaleString("ar-SA")} ر.س`}</td><td>{r.totalCost == null ? "—" : `${r.totalCost.toLocaleString("ar-SA")} ر.س`}</td><td>{r.assetType}</td></tr>)}</tbody></table></div>{preview.length>100&&<p className={styles.muted}>تظهر أول 100 صف فقط في المعاينة؛ سيتم حفظ جميع المراكز.</p>}</section>}
    <section className={styles.note}><b>لماذا لا ندعم PDF تلقائيًا الآن؟</b><span>تنسيقات PDF تختلف بشدة بين الوسطاء. سنضيف Parser خاصًا لكل وسيط بعد اختبار كشف حقيقي منه، بدل استخراج أرقام قد تكون خاطئة. CSV وExcel هما المسار الآمن والقابل للمراجعة الآن.</span></section>
  </div></main>;
}
