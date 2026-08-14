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

const bi = (en: string, ar: string) => ({ en, ar });
const asText = (value: unknown) => typeof value === "string" ? value : "";
const asMoney = (value: unknown, fallback: number) => typeof value === "number" && Number.isFinite(value) ? value : fallback;
const regionAr = (value: string) => ({ Riyadh: "الرياض", Jeddah: "جدة", Khobar: "الخبر", Dammam: "الدمام", "Eastern Province": "المنطقة الشرقية", "Eastern Region": "المنطقة الشرقية" }[value] ?? value);

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
    config.workflows = config.workflows.map((workflow, i) => {
      if (typeof workflow === "string") {
        return { name: bi(workflow, fallbackArabic[i] ?? "سير عمل تشغيلي"), detail: bi("Company-specific workflow adapted into the master operating model.", "سير عمل مخصص للشركة ضمن النموذج التشغيلي الأساسي."), enabled: true };
      }
      return workflow;
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
