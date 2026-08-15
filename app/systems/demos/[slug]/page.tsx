import { createClient } from "@supabase/supabase-js";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import MasterOperationsDemoClient from "./MasterOperationsDemoClient";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

type DemoProspect = {
  company_name: string;
  slug: string;
  demo_status: string;
  demo_config: Record<string, unknown> | null;
  industry: string | null;
  city: string | null;
  country: string | null;
};

type LegacyExampleAccount = { name?: unknown; region?: unknown; status?: unknown };
type LegacyExampleOpportunity = { account?: unknown; stage?: unknown; region?: unknown; division?: unknown; product_line?: unknown; value_sar?: unknown };
type UnknownRow = Record<string, unknown>;

const bi = (en: string, ar: string) => ({ en, ar });
const asText = (value: unknown) => typeof value === "string" ? value : "";
const asMoney = (value: unknown, fallback: number) => typeof value === "number" && Number.isFinite(value) ? value : fallback;
const asNumber = (value: unknown, fallback = 0) => typeof value === "number" && Number.isFinite(value) ? value : fallback;
const asObject = (value: unknown): UnknownRow => value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRow : {};
const asBi = (value: unknown, fallbackEn: string, fallbackAr: string) => {
  if (typeof value === "string" && value.trim()) return value;
  const object = asObject(value);
  const en = asText(object.en);
  const ar = asText(object.ar);
  if (en || ar) return { en: en || ar || fallbackEn, ar: ar || en || fallbackAr };
  return bi(fallbackEn, fallbackAr);
};
const regionAr = (value: string) => ({ Riyadh: "الرياض", Jeddah: "جدة", Khobar: "الخبر", Dammam: "الدمام", "Eastern Province": "المنطقة الشرقية", "Eastern Region": "المنطقة الشرقية" }[value] ?? value);

const fallbackStock = [
  { sku: "LAB-SYS-112", name: bi("Primary instrument / kit line", "بند الجهاز / الطقم الرئيسي"), stock: 9, reserved: 8, needed: 8, available: 1, status: bi("Ready", "جاهز") },
  { sku: "LAB-BUF-204", name: bi("Core consumable", "مستهلك أساسي"), stock: 4, reserved: 4, needed: 4, available: 0, status: bi("Ready", "جاهز") },
  { sku: "LAB-CRIT-037", name: bi("Critical specialist item", "صنف تخصصي حرج"), stock: 1, reserved: 1, needed: 2, available: 0, status: bi("1 unit missing", "وحدة واحدة ناقصة") },
  { sku: "LAB-ACC-082", name: bi("Accessory pack", "حزمة ملحقات"), stock: 12, reserved: 10, needed: 10, available: 2, status: bi("Ready", "جاهز") },
  { sku: "LAB-RGT-051", name: bi("Specialist reagent / component", "كاشف / مكوّن تخصصي"), stock: 0, reserved: 0, needed: 2, available: 0, status: bi("2 units missing", "وحدتان ناقصتان") },
];

function normalizeDemoConfig(raw: Record<string, unknown>): Record<string, unknown> {
  const config: Record<string, unknown> = { ...raw };

  if (!config.aiBrief && config.ai_brief) config.aiBrief = config.ai_brief;
  if (!config.reportSummary && config.reporting_summary) config.reportSummary = config.reporting_summary;

  const exampleAccounts = Array.isArray(config.example_accounts) ? config.example_accounts as LegacyExampleAccount[] : [];
  const exampleOpps = Array.isArray(config.example_opportunities) ? config.example_opportunities as LegacyExampleOpportunity[] : [];

  if (!Array.isArray(config.accounts) || config.accounts.length === 0) {
    if (exampleAccounts.length) {
      config.accounts = exampleAccounts.map((item, i) => {
        const name = asText(item.name) || `Illustrative customer ${i + 1}`;
        const region = asText(item.region) || "Saudi Arabia";
        const status = asText(item.status) || "Active account";
        return {
          name: bi(name, `عميل توضيحي ${i + 1}`),
          type: bi(status, "حساب تجاري توضيحي"),
          region: bi(region, regionAr(region)),
          division: bi("Relevant business division", "القسم التجاري المختص"),
          owner: bi("Commercial team", "الفريق التجاري"),
          value: [176000, 310000, 128000, 142000][i] ?? 128000,
          contacts: 3,
        };
      });
    } else if (exampleOpps.length) {
      config.accounts = exampleOpps.map((item, i) => {
        const name = asText(item.account) || `Illustrative customer ${i + 1}`;
        const region = asText(item.region) || "Saudi Arabia";
        const division = asText(item.division) || asText(item.product_line) || "Relevant division";
        return {
          name: bi(name, `عميل توضيحي ${i + 1}`),
          type: bi("Illustrative B2B customer", "عميل أعمال توضيحي"),
          region: bi(region, regionAr(region)),
          division: bi(division, "القسم المختص"),
          owner: bi("Commercial team", "الفريق التجاري"),
          value: asMoney(item.value_sar, [176000, 310000, 128000, 142000][i] ?? 128000),
          contacts: 3,
        };
      });
    }
  } else {
    config.accounts = (config.accounts as unknown[]).map((value, i) => {
      const row = asObject(value);
      return {
        ...row,
        name: asBi(row.name, `Illustrative customer ${i + 1}`, `عميل توضيحي ${i + 1}`),
        type: row.type ? asBi(row.type, "Illustrative B2B customer", "عميل أعمال توضيحي") : undefined,
        region: row.region ? asBi(row.region, "Saudi Arabia", "السعودية") : undefined,
        division: row.division ? asBi(row.division, "Relevant division", "القسم المختص") : undefined,
        owner: row.owner ? asBi(row.owner, "Commercial team", "الفريق التجاري") : undefined,
        value: asMoney(row.value, [176000, 310000, 128000, 142000][i] ?? 128000),
      };
    });
  }

  if ((!Array.isArray(config.opportunities) || config.opportunities.length === 0) && exampleOpps.length) {
    config.opportunities = exampleOpps.map((item, i) => {
      const account = asText(item.account) || `Illustrative customer ${i + 1}`;
      const stage = asText(item.stage) || "Commercial review";
      const product = asText(item.product_line) || asText(item.division) || "Laboratory solution";
      return {
        account: bi(account, `عميل توضيحي ${i + 1}`),
        title: bi(product, "حل مختبري تخصصي"),
        value: asMoney(item.value_sar, [176000, 310000, 128000][i] ?? 128000),
        score: [94, 90, 87][i] ?? 86,
        stage: bi(stage, i === 0 ? "عرض سعر" : i === 1 ? "مراجعة فنية" : "متابعة تجارية"),
        division: bi(asText(item.division) || asText(item.product_line) || "Relevant division", "القسم المختص"),
      };
    });
  } else if (Array.isArray(config.opportunities)) {
    config.opportunities = (config.opportunities as unknown[]).map((value, i) => {
      const row = asObject(value);
      return {
        ...row,
        account: row.account ? asBi(row.account, `Illustrative customer ${i + 1}`, `عميل توضيحي ${i + 1}`) : undefined,
        title: asBi(row.title ?? row.name ?? row.id, `Commercial opportunity ${i + 1}`, `فرصة تجارية ${i + 1}`),
        value: asMoney(row.value ?? row.value_sar, [176000, 310000, 128000][i] ?? 128000),
        score: asNumber(row.score, [94, 90, 87][i] ?? 86),
        stage: row.stage ? asBi(row.stage, "Commercial review", "مراجعة تجارية") : bi("Commercial review", "مراجعة تجارية"),
        division: row.division ? asBi(row.division, "Relevant division", "القسم المختص") : undefined,
      };
    });
  }

  if (Array.isArray(config.tenders)) {
    config.tenders = (config.tenders as unknown[]).map((value, i) => {
      const row = asObject(value);
      const customer = row.account ?? row.customer;
      return {
        title: asBi(row.title ?? row.id, `Tender / enquiry ${i + 1}`, `مناقصة / استفسار ${i + 1}`),
        account: customer ? asBi(customer, `Illustrative customer ${i + 1}`, `عميل توضيحي ${i + 1}`) : undefined,
        status: row.status ? asBi(row.status, "In progress", "قيد العمل") : undefined,
        value: asMoney(row.value, [176000, 310000, 142000][i] ?? 142000),
        when: row.when ?? row.deadline,
        owner: row.owner,
      };
    });
  }

  if (Array.isArray(config.quotes)) {
    config.quotes = (config.quotes as unknown[]).map((value, i) => {
      const row = asObject(value);
      return {
        title: asBi(row.title ?? row.id, `Quotation ${i + 1}`, `عرض سعر ${i + 1}`),
        account: row.account ? asBi(row.account, `Illustrative customer ${i + 1}`, `عميل توضيحي ${i + 1}`) : undefined,
        status: row.status ? asBi(row.status, "Sent", "مرسل") : undefined,
        value: asMoney(row.value, [128000, 98000, 215000][i] ?? 128000),
        when: row.when ?? row.next,
        owner: row.owner,
      };
    });
  }

  const normalizedOrders = Array.isArray(config.orders) ? (config.orders as unknown[]).map((value, i) => {
    const row = asObject(value);
    const completeness = asText(row.completeness);
    const match = completeness.match(/(\d+)\s*\/\s*(\d+)/);
    const items = asNumber(row.items, match ? Number(match[2]) : 9);
    const ready = asNumber(row.ready, match ? Number(match[1]) : Math.max(items - 1, 0));
    const missing = asNumber(row.missing, Math.max(items - ready, 0));
    return {
      id: asText(row.id) || `SO-2026-${String(41 - i).padStart(3, "0")}`,
      customerId: Math.max(1, asNumber(row.customerId, i + 1)),
      source: asText(row.source ?? row.quoteId) || `Q-2026-${84 - i}`,
      value: asMoney(row.value, [398000, 215000, 98000][i] ?? 128000),
      items,
      ready,
      missing,
      due: asBi(row.due, "Due soon", "مستحق قريبًا"),
      status: asBi(row.status, missing ? "Awaiting missing item" : "Ready to dispatch", missing ? "بانتظار بند ناقص" : "جاهز للشحن"),
    };
  }) : [];
  if (normalizedOrders.length) config.orders = normalizedOrders;

  const normalizedWarehouse = Array.isArray(config.warehouse) ? (config.warehouse as unknown[]).map((value, i) => {
    const row = asObject(value);
    const needed = asNumber(row.needed ?? row.required, 1);
    const available = asNumber(row.available, 0);
    const stock = asNumber(row.stock, available);
    const reserved = asNumber(row.reserved, Math.min(needed, stock));
    const missing = Math.max(needed - available, 0);
    return {
      sku: asText(row.sku) || `LAB-ITEM-${String(i + 1).padStart(3, "0")}`,
      name: asBi(row.name ?? row.item, `Operational item ${i + 1}`, `بند تشغيلي ${i + 1}`),
      stock,
      reserved,
      needed,
      available,
      status: asBi(row.status, missing ? `${missing} unit${missing === 1 ? "" : "s"} missing` : "Ready", missing ? `${missing} ${missing === 1 ? "وحدة ناقصة" : "وحدات ناقصة"}` : "جاهز"),
    };
  }) : [];
  if (normalizedWarehouse.length) {
    const padded = [...normalizedWarehouse];
    for (let i = padded.length; i < 5; i += 1) padded.push(fallbackStock[i]);
    config.warehouse = padded;
  }

  if (Array.isArray(config.supplyLines)) {
    const warehouse = (Array.isArray(config.warehouse) ? config.warehouse : fallbackStock) as UnknownRow[];
    config.supplyLines = (config.supplyLines as unknown[]).map((value, i) => {
      const row = asObject(value);
      const stock = warehouse.find((candidate) => asNumber(candidate.needed, 0) > asNumber(candidate.available, 0)) ?? warehouse[i] ?? warehouse[0] ?? fallbackStock[0];
      const qty = asNumber(row.qty, asNumber(stock.needed, 1));
      const allocated = asNumber(row.allocated, Math.min(qty, asNumber(stock.available, 0)));
      return {
        no: asNumber(row.no, i + 1),
        sku: asText(row.sku) || asText(stock.sku) || `LAB-ITEM-${i + 1}`,
        item: asBi(row.item ?? stock.name, `Order line ${i + 1}`, `بند طلب ${i + 1}`),
        qty,
        allocated,
        source: asBi(row.source, allocated < qty ? "Supplier action pending" : "Main warehouse", allocated < qty ? "إجراء المورد قيد الانتظار" : "المستودع الرئيسي"),
        status: asBi(row.status, allocated < qty ? "Shortage blocks dispatch" : "Ready", allocated < qty ? "النقص يمنع الشحن" : "جاهز"),
      };
    });
  }

  const normalizedInvoices = Array.isArray(config.invoices) ? (config.invoices as unknown[]).map((value, i) => {
    const row = asObject(value);
    const orderId = asText(row.order ?? row.orderId ?? row.sourceOrder) || (normalizedOrders[i]?.id ?? normalizedOrders[0]?.id ?? `SO-2026-${41 - i}`);
    return {
      id: asText(row.id) || `INV-2608${11 - i}`,
      customerId: Math.max(1, asNumber(row.customerId, i + 1)),
      order: orderId,
      amount: asMoney(row.amount, normalizedOrders[i]?.value ?? normalizedOrders[0]?.value ?? [215000, 98000][i] ?? 128000),
      issued: asBi(row.issued, i === 0 ? "11 Aug 2026" : "4 Aug 2026", i === 0 ? "11 أغسطس 2026" : "4 أغسطس 2026"),
      due: asBi(row.due, i === 0 ? "29 Aug 2026" : "18 Aug 2026", i === 0 ? "29 أغسطس 2026" : "18 أغسطس 2026"),
      paid: asNumber(row.paid, 0),
      status: asBi(row.status, "Issued", "صادرة"),
    };
  }) : [];
  if (normalizedInvoices.length) {
    const padded = [...normalizedInvoices];
    if (padded.length < 2) {
      padded.push({
        id: "INV-260804",
        customerId: 1,
        order: normalizedOrders[0]?.id ?? "SO-2026-041",
        amount: 98000,
        issued: bi("4 Aug 2026", "4 أغسطس 2026"),
        due: bi("18 Aug 2026", "18 أغسطس 2026"),
        paid: 24000,
        status: bi("Partially paid", "مدفوعة جزئيًا"),
      });
    }
    config.invoices = padded;
  }

  if (Array.isArray(config.collectionActions)) {
    const invoices = (Array.isArray(config.invoices) ? config.invoices : normalizedInvoices) as UnknownRow[];
    config.collectionActions = (config.collectionActions as unknown[]).map((value, i) => {
      const row = asObject(value);
      const invoiceId = asText(row.invoice ?? row.invoiceId) || asText(invoices[i]?.id) || `INV-${i + 1}`;
      const linked = invoices.find((candidate) => asText(candidate.id) === invoiceId) ?? invoices[i] ?? invoices[0] ?? {};
      const amount = asMoney(row.amount, Math.max(asMoney(linked.amount, 0) - asNumber(linked.paid, 0), 0));
      return {
        invoice: invoiceId,
        customerId: Math.max(1, asNumber(row.customerId, asNumber(linked.customerId, i + 1))),
        amount,
        overdue: Math.max(0, asNumber(row.overdue, 0)),
        owner: asBi(row.owner, "Finance / collection", "المالية / التحصيل"),
        action: asBi(row.action, "Follow up on payment", "متابعة التحصيل"),
        status: asBi(row.status, asNumber(row.overdue, 0) > 0 ? "Overdue" : "Follow-up scheduled", asNumber(row.overdue, 0) > 0 ? "متأخرة" : "متابعة مجدولة"),
      };
    });
  }

  if (Array.isArray(config.workflows)) {
    const fallbackArabic = [
      "إدارة المناقصات والاستفسارات",
      "التحقق من عروض الأسعار والمتابعة",
      "تنسيق الطلبات والتوريد",
      "ربط المستودع والنواقص بالمورد",
      "متابعة الفواتير والتحصيل",
      "تقارير الإدارة والمتابعة التشغيلية",
    ];
    config.workflows = (config.workflows as unknown[]).map((workflow, i) => {
      if (typeof workflow === "string") {
        return { name: bi(workflow, fallbackArabic[i] ?? "سير عمل تشغيلي"), detail: bi("Company-specific workflow adapted into the master operating model.", "سير عمل مخصص للشركة ضمن النموذج التشغيلي الأساسي."), enabled: true };
      }
      const row = asObject(workflow);
      if (row.name) return { ...row, name: asBi(row.name, `Workflow ${i + 1}`, fallbackArabic[i] ?? "سير عمل تشغيلي"), detail: row.detail ? asBi(row.detail, "Company-specific operating workflow.", "سير عمل تشغيلي مخصص للشركة.") : undefined, enabled: row.enabled !== false };
      if (row.en || row.ar) return { name: asBi(row, `Workflow ${i + 1}`, fallbackArabic[i] ?? "سير عمل تشغيلي"), detail: bi("Company-specific workflow adapted into the master operating model.", "سير عمل مخصص للشركة ضمن النموذج التشغيلي الأساسي."), enabled: true };
      return { name: bi(`Workflow ${i + 1}`, fallbackArabic[i] ?? "سير عمل تشغيلي"), detail: bi("Company-specific operating workflow.", "سير عمل تشغيلي مخصص للشركة."), enabled: true };
    });
  }

  return config;
}

async function getProspect(slug: string): Promise<DemoProspect | null> {
  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase
    .from("systems_outreach_prospects")
    .select("company_name,slug,demo_status,demo_config,industry,city,country")
    .eq("slug", slug)
    .eq("demo_status", "ready")
    .maybeSingle();

  if (error || !data?.demo_config) return null;
  return data as DemoProspect;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const prospect = await getProspect(slug);
  if (!prospect) {
    return {
      title: "Private Systems Concept | LabNarrative",
      robots: { index: false, follow: false, nocache: true },
    };
  }

  return {
    title: `Private Concept — ${prospect.company_name} | LabNarrative Systems`,
    description: `A private illustrative LabNarrative Systems concept connecting tenders, quotations, orders, warehouse, supply, invoicing, collections and management visibility for ${prospect.company_name}.`,
    robots: { index: false, follow: false, nocache: true },
  };
}

export default async function DynamicSystemsDemoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const prospect = await getProspect(slug);
  if (!prospect) notFound();

  return (
    <MasterOperationsDemoClient
      companyName={prospect.company_name}
      industry={prospect.industry ?? "Business operations"}
      location={[prospect.city, prospect.country].filter(Boolean).join(", ")}
      config={normalizeDemoConfig(prospect.demo_config ?? {})}
    />
  );
}
