"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type WealthLanguage = "ar" | "en";
type WealthTheme = "dark" | "light";

const LANGUAGE_KEY = "thrwa:language";
const LEGACY_LANGUAGE_KEY = "tharwa:language";
const THEME_KEY = "thrwa:theme";
const LEGACY_THEME_KEY = "tharwa:theme";
const ARABIC = /[\u0600-\u06ff]/;

const T: Record<string, string> = {
  "ثروة": "Thrwa",
  "لوحة الثروة السعودية": "Saudi Wealth Dashboard",
  "إدارة الثروة": "Wealth management",
  "المحفظة الحقيقية": "Real portfolio",
  "محفظة حقيقية": "Real portfolio",
  "المحفظة التجريبية": "Paper portfolio",
  "محفظة تجريبية": "Paper portfolio",
  "بيئة الاختبار": "Test environment",
  "بيئة اختبار آمنة": "Safe test environment",
  "بياناتك الحقيقية": "Your real data",
  "بيانات اختبار منفصلة": "Separate test data",
  "حساب المستثمر": "Investor account",
  "حساب تجريبي": "Paper account",
  "نظرة عامة": "Overview",
  "الأصول": "Assets",
  "الدخل": "Income",
  "الدخل والتوزيعات": "Income & distributions",
  "التحليلات": "Analytics",
  "الالتزام الشرعي": "Shariah",
  "الحسابات": "Accounts",
  "اسأل ثروتي": "Ask Thrwa",
  "إدارة الأصول": "Manage assets",
  "إدارة المحفظة": "Portfolio management",
  "إضافة أصل": "Add asset",
  "إضافة حساب": "Add account",
  "محفظتي الحقيقية": "My real portfolio",
  "تم": "Done",
  "إدارة": "Manage",
  "تعديل": "Edit",
  "حفظ": "Save",
  "حفظ الاسم": "Save name",
  "إلغاء": "Cancel",
  "إخفاء التفاصيل": "Hide details",
  "عرض التفاصيل": "Show details",
  "إظهار الحساب": "Show account",
  "إخفاء الحساب": "Hide account",
  "اسم الحساب": "Account name",
  "اسم الأصل": "Asset name",
  "الرمز": "Symbol",
  "الكمية": "Quantity",
  "سعر الوحدة": "Unit price",
  "سعر الوحدة (ر.س داخلي)": "Unit price (internal SAR)",
  "القيمة الحالية (ر.س داخلي)": "Current value (internal SAR)",
  "إجمالي التكلفة (ر.س داخلي)": "Total cost (internal SAR)",
  "التكلفة": "Cost",
  "إجمالي التكلفة": "Total cost",
  "القيمة": "Value",
  "القيمة الحالية": "Current value",
  "القيمة الإجمالية": "Total value",
  "قيمة الحساب": "Account value",
  "القيمة عبر الحسابات": "Value across accounts",
  "صافي الثروة": "Net worth",
  "آخر Snapshot": "Latest snapshot",
  "نقطة اختبار": "Test snapshot",
  "الربح / الخسارة": "Profit / Loss",
  "الربح/الخسارة": "Profit / Loss",
  "عدد الأصول": "Number of assets",
  "السيولة": "Liquidity",
  "السيولة المسجّلة": "Recorded liquidity",
  "توزيع الأصول": "Asset allocation",
  "أين توجد الثروة؟": "Where is your wealth?",
  "الحسابات والمحافظ": "Accounts & portfolios",
  "مصادر أصولك الحالية": "Your current asset sources",
  "التوزيع حسب المصدر": "Allocation by source",
  "حالة المراكز": "Position status",
  "رابح مقابل خاسر": "Winners vs losers",
  "مراكز رابحة": "Winning positions",
  "مراكز خاسرة": "Losing positions",
  "التكلفة غير مكتملة": "Cost basis incomplete",
  "سلامة الأسعار": "Pricing integrity",
  "حديث": "Fresh",
  "متأخر": "Delayed",
  "قديم": "Stale",
  "غير متاح": "Unavailable",
  "القيم القديمة في صافي الثروة هي آخر قيمة معروفة وليست سعرًا حاليًا.": "Stale values in net worth are the last known values, not current prices.",
  "كل الأصول": "All assets",
  "الأصول المسجلة حاليًا": "Currently recorded assets",
  "كل الأنواع": "All types",
  "كل الحسابات": "All accounts",
  "كل الأداء": "All performance",
  "رابح": "Profitable",
  "خاسر": "Losing",
  "بدون تكلفة": "No cost basis",
  "الأصل": "Asset",
  "الحساب": "Account",
  "بحث": "Search",
  "حسب التكلفة": "By cost basis",
  "غير مُسعّر": "Unpriced",
  "الأسهم السعودية": "Saudi stocks",
  "الأسهم العالمية": "Global stocks",
  "أسهم سعودية": "Saudi stocks",
  "أسهم عالمية": "Global stocks",
  "الريت": "REITs",
  "ريت": "REIT",
  "الصناديق": "Funds",
  "صناديق": "Funds",
  "الصكوك": "Sukuk",
  "صكوك": "Sukuk",
  "المرابحات": "Murabaha",
  "مرابحة": "Murabaha",
  "النقد": "Cash",
  "نقد": "Cash",
  "الأصول الرقمية": "Digital assets",
  "أصول رقمية": "Digital assets",
  "أصل رقمي": "Digital asset",
  "العقار": "Real estate",
  "عقار": "Real estate",
  "الاستثمارات الخاصة": "Private investments",
  "أصول خاصة": "Private assets",
  "ذهب": "Gold",
  "أخرى": "Other",
  "دخل آخر 12 شهرًا": "Income over the last 12 months",
  "توزيعات تاريخية فعلية": "Actual historical distributions",
  "الدخل السنوي المرجعي": "Reference annual income",
  "Run-rate مبني على آخر 12 شهرًا": "Run-rate based on the last 12 months",
  "أصول دفعت توزيعات": "Assets paying distributions",
  "ضمن الأصول المسجلة": "Among recorded assets",
  "آخر توزيع": "Latest distribution",
  "لا توجد بيانات": "No data",
  "التدفق النقدي": "Cash flow",
  "التوزيعات الشهرية — آخر 12 شهرًا": "Monthly distributions — last 12 months",
  "أعلى مصادر الدخل": "Top income sources",
  "الدخل حسب الحساب": "Income by account",
  "لا توجد توزيعات مسجلة في الفترة.": "No distributions were recorded in this period.",
  "السجل": "History",
  "آخر التوزيعات": "Latest distributions",
  "التاريخ": "Date",
  "للوحدة": "Per unit",
  "الإجمالي": "Total",
  "القيم معروضة بالعملة الرئيسية المختارة. المصدر الحالي للتاريخ والتوزيعات: Yahoo Finance كـ fallback بحثي متأخر.": "Values are shown in the selected base currency. Historical prices and distributions currently use Yahoo Finance as a delayed research fallback.",
  "شهر": "1 month",
  "3 أشهر": "3 months",
  "سنة": "1 year",
  "5 سنوات": "5 years",
  "المحفظة": "Portfolio",
  "الطاقة": "Energy",
  "القطاع المالي": "Financials",
  "المرافق": "Utilities",
  "العقار والريت": "Real estate & REITs",
  "التقنية": "Technology",
  "متنوع عالمي": "Global diversified",
  "صندوق متنوع": "Diversified fund",
  "نقد وأدوات قصيرة": "Cash & short-term instruments",
  "عالمي": "Global",
  "كريبتو": "Crypto",
  "السعودية / محلي": "Saudi / Local",
  "سعودي / محلي": "Saudi / Local",
  "الجغرافيا": "Geography",
  "السعودية مقابل العالمي والكريبتو": "Saudi vs global & crypto",
  "القطاعات": "Sectors",
  "التوزيع القطاعي": "Sector allocation",
  "العملات": "Currencies",
  "التعرض للعملات": "Currency exposure",
  "الفترة المحددة": "Selected period",
  "أفضل وأسوأ الأصول": "Best & worst assets",
  "الأفضل": "Best",
  "الأسوأ": "Worst",
  "التركيز": "Concentration",
  "أكبر المراكز": "Largest positions",
  "الأداء المقارن": "Comparative performance",
  "المحفظة مقابل السوق": "Portfolio vs market",
  "أداء الفترة": "Period performance",
  "أقصى هبوط": "Max drawdown",
  "التقلب السنوي": "Annualized volatility",
  "أكبر أصل": "Largest asset",
  "أكبر 3 أصول": "Top 3 assets",
  "مؤشر التركّز": "Concentration index",
  "تقريب من السلسلة اليومية": "Estimate from daily series",
  "جاري جلب الأسعار التاريخية…": "Loading historical prices…",
  "جاري جلب الأسعار التاريخية...": "Loading historical prices...",
  "جاري تحميل الأسعار الفعلية…": "Loading market prices…",
  "جاري تحليل التوزيعات الفعلية…": "Analyzing actual distributions…",
  "كل السلاسل تبدأ من 0٪، ثم تعرض نسبة التغير منذ بداية الفترة.": "All series start at 0%, then show the percentage change from the beginning of the selected period.",
  "كل السلاسل تبدأ من 0%، ثم تعرض نسبة التغير منذ بداية الفترة.": "All series start at 0%, then show the percentage change from the beginning of the selected period.",
  "لا توجد بيانات.": "No data.",
  "لا توجد بيانات تاريخية كافية لهذه الفترة.": "Not enough historical data for this period.",
  "جاري بناء التحليلات…": "Building analytics…",
  "تعذر تحميل التحليلات.": "Could not load analytics.",
  "تعذر بناء الأداء التاريخي للمحفظة.": "Could not build historical portfolio performance.",
  "تعذر بناء الأداء التاريخي.": "Could not build historical performance.",
  "التاريخ السعري الحقيقي": "Historical market price",
  "نطاق الفترة": "Period range",
  "آخر سعر": "Latest price",
  "بيانات سوق تاريخية": "Historical market data",
  "المصدر": "Source",
  "سعر الوحدة الحالي": "Current unit price",
  "لا توجد تكلفة شراء مسجلة": "No purchase cost recorded",
  "لا يوجد متوسط تكلفة": "No average cost",
  "آخر إدخال مسجل": "Last recorded entry",
  "آخر إدخال": "Last entry",
  "وحدة": "Unit",
  "المبلغ المستثمر": "Amount invested",
  "متوسط تكلفة الوحدة": "Average unit cost",
  "من التكلفة والكمية": "From cost and quantity",
  "مضاف يدويًا": "Added manually",
  "تجريبي": "Paper",
  "ملخص الأصل": "Asset summary",
  "كل البيانات المسجلة حاليًا": "All currently recorded data",
  "تاريخ القيمة": "Valuation date",
  "نسبة الأصل من المحفظة": "Asset share of portfolio",
  "قراءة سريعة": "Quick view",
  "مبنية فقط على البيانات المتاحة": "Based only on available data",
  "الوزن في المحفظة": "Portfolio weight",
  "الربحية الحالية": "Current performance",
  "السجل السعري": "Price history",
  "تفاصيل الأصول": "Asset details",
  "الفحص لكل الأصول": "Screening by asset",
  "الحالة": "Status",
  "سبب التصنيف": "Classification reason",
  "الكل": "All",
  "متوافق مبدئيًا": "Preliminarily compliant",
  "متوافق": "Compliant",
  "يحتاج مراجعة": "Needs review",
  "مراجعة": "Review",
  "غير متوافق مبدئيًا": "Preliminarily non-compliant",
  "غير متوافق": "Non-compliant",
  "غير مصنف": "Unclassified",
  "فحص مبدئي، وليس فتوى.": "Preliminary screening, not a fatwa.",
  "التصنيف الآلي يساعد على اكتشاف ما يحتاج مراجعة.": "Automated screening helps identify what needs review.",
  "تنقية محسوبة": "Calculated purification",
  "حسب المعدلات المسجلة": "Based on recorded rates",
  "تحتاج بيانات دخل غير متوافق": "Requires non-compliant income data",
  "توزيع الحالة الشرعية": "Shariah status allocation",
  "المنهجية الحالية": "Current methodology",
  "كيف يتم الفحص؟": "How is screening performed?",
  "طبيعة الأصل والنشاط": "Asset and business activity",
  "النسب المالية": "Financial ratios",
  "الدخل غير المباح والتنقية": "Non-permissible income & purification",
  "مراجعة بشرية": "Human review",
  "استبعاد أو تنبيه المنتجات والأنشطة الواضحة غير المفلترة شرعيًا.": "Exclude or flag clearly non-screened products and activities.",
  "الأسهم تحتاج بيانات مالية محدثة وفحصًا وفق معيار شرعي مختار.": "Stocks require current financial data and screening against the selected Shariah standard.",
  "لا نحسب مبلغ تنقية قبل توفر نسبة موثوقة لكل أصل.": "Purification is not calculated until a reliable rate is available for each asset.",
  "يمكن تثبيت قرار هيئة أو مزود شرعي بدل التقييم الآلي.": "A decision from a Shariah board or provider can override the automated assessment.",
  "لا توجد بيانات كافية لإصدار فحص مبدئي موثوق لهذا الأصل.": "There is not enough data for a reliable preliminary screening of this asset.",
  "غير مصنف بعد.": "Not classified yet.",
  "جاري بناء الفحص الشرعي المبدئي…": "Building preliminary Shariah screening…",
  "جاري بناء الفحص الشرعي المبدئي...": "Building preliminary Shariah screening...",
  "تعذر تحميل الفحص.": "Could not load screening.",
  "لا تصدر حكمًا نهائيًا عليها الآن؛ الأصول الرقمية محل اختلاف في المعالجة الشرعية.": "No final ruling is issued at this stage; digital assets are subject to differing Shariah views.",
  "التصنيف الحالي مبدئي ولا يمثل اعتمادًا شرعيًا رسميًا.": "The current classification is preliminary and does not represent official Shariah approval.",
  "اسأل عن ثروتك": "Ask about your wealth",
  "استعمل التحليلات على بياناتك الحقيقية فقط": "Use analytics on your real portfolio data only",
  "ما أكبر تركّز في المحفظة؟": "What is the largest concentration in my portfolio?",
  "رابح وخاسر: ما أكثر الأصول؟": "Which assets are the biggest winners and losers?",
  "بين السعودية والعالم والكريبتو، كيف توزعت الثروة؟": "How is my wealth split between Saudi, global and crypto assets?",
  "يدوي": "Manual",
  "متصل": "Connected",
  "غير محققة": "Unrealized",
  "لا يوجد سجل بعد": "No history yet",
  "حسابات تجريبية متنوعة": "Diversified paper accounts",
  "جاري تحميل ثروتك…": "Loading your wealth…",
  "لا توجد بيانات بعد.": "No data yet.",
  "ريال سعودي": "Saudi Riyal",
  "دولار أمريكي": "US Dollar",
  "سعودي / محلي": "Saudi / Local",
  "القيم النقدية معروضة بالعملة الرئيسية.": "Monetary values are shown in the selected base currency.",
  "القيم غير المسعّرة يوميًا تبقى على آخر قيمة معروفة.": "Assets without daily pricing remain at their last known value.",
  "أرامكو": "Aramco",
  "سدكو كابيتال ريت": "SEDCO Capital REIT",
  "جدوى ريت": "Jadwa REIT",
  "محفظة عوائد": "Awaed portfolio",
  "إجمالي الحسابات": "Total accounts",
  "حسابات ظاهرة": "Visible accounts",
  "بالعملة الرئيسية": "In base currency",
  "لا توجد أصول في هذا الحساب.": "There are no assets in this account.",
  "إخفاء الحساب لا يحذف أصوله أو تاريخه.": "Hiding an account does not delete its assets or history.",
  "هذه الحسابات تجريبية ومفصولة بالكامل عن حساباتك الحقيقية.": "These paper accounts are fully separated from your real accounts.",
  "جاري تحميل الحسابات…": "Loading accounts…",
  "تعذر تحميل الحسابات.": "Could not load accounts.",
  "جاري تحميل الأصول…": "Loading assets…",
  "تعذر تحميل الأصول.": "Could not load assets.",
  "تعديل الأصول الحالية أو إضافة أصل جديد.": "Edit current assets or add a new asset.",
  "عدّل بيانات الاختبار دون أي تأثير على المحفظة الحقيقية.": "Edit paper data without affecting the real portfolio.",
  "جاري الحفظ…": "Saving…",
  "العودة إلى لوحة الثروة": "Back to wealth dashboard",
  "فتح صفحة الأصل": "Open asset page",
  "فتح الحسابات": "Open accounts",
  "فتح التحليلات": "Open analytics",
  "فتح الالتزام الشرعي": "Open Shariah",
  "فتح الدخل والتوزيعات": "Open income & distributions"
};

const MONTHS: Record<string, string> = {
  "يناير":"January", "فبراير":"February", "مارس":"March", "أبريل":"April", "مايو":"May", "يونيو":"June",
  "يوليو":"July", "أغسطس":"August", "سبتمبر":"September", "أكتوبر":"October", "نوفمبر":"November", "ديسمبر":"December"
};

const originals = new WeakMap<Text, string>();
const translated = new WeakMap<Text, string>();
const attributeOriginals = new WeakMap<Element, Map<string,string>>();

function westernize(value: string) {
  return value
    .replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[۰-۹]/g, d => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/٫/g, ".")
    .replace(/٬/g, ",")
    .replace(/٪/g, "%")
    .replace(/،/g, ",")
    .replace(/ر\.س/g, "SAR")
    .replace(/[\u061c\u200e\u200f]/g, "")
    .replace(/Tharwa/g, "Thrwa");
}

function translateDates(value: string) {
  let next = westernize(value);
  for (const [ar,en] of Object.entries(MONTHS)) next = next.replaceAll(ar,en);
  return next.replace(/\sص$/," AM").replace(/\sم$/," PM");
}

function translateCore(core: string) {
  if (T[core]) return T[core];

  let m = core.match(/^(\d+|[٠-٩]+) أصل$/);
  if (m) return `${westernize(m[1])} assets`;
  m = core.match(/^(\d+|[٠-٩]+) حساب(?:ات)? · (\d+|[٠-٩]+) أصل$/);
  if (m) return `${westernize(m[1])} accounts · ${westernize(m[2])} assets`;
  m = core.match(/^عبر (\d+|[٠-٩]+) حسابات$/);
  if (m) return `Across ${westernize(m[1])} accounts`;
  m = core.match(/^(\d+|[٠-٩]+) حدث خلال 5 سنوات$/);
  if (m) return `${westernize(m[1])} events over 5 years`;
  m = core.match(/^آخر تحديث (.+)$/);
  if (m) return `Last updated ${translateDates(m[1])}`;
  m = core.match(/^متوسط التكلفة (.+)$/);
  if (m) return `Average cost ${westernize(m[1])}`;
  m = core.match(/^(.+) من إجمالي (.+)$/);
  if (m) return `${westernize(m[1])} of total ${westernize(m[2])}`;

  let next = translateDates(core);
  const replacements: Array<[string,string]> = [
    ["المحفظة الحقيقية","Real portfolio"], ["المحفظة التجريبية","Paper portfolio"],
    ["إدارة الأصول","Manage assets"], ["الالتزام الشرعي","Shariah"],
    ["أرامكو","Aramco"], ["سدكو كابيتال ريت","SEDCO Capital REIT"], ["جدوى ريت","Jadwa REIT"],
    ["محفظة عوائد","Awaed portfolio"], ["الأصول","assets"], ["أصل","asset"], ["الحسابات","accounts"],
    ["حساب","account"], ["القيمة","value"], ["التكلفة","cost"], ["الحالة","status"], ["التصنيف","classification"]
  ];
  for (const [ar,en] of replacements) next = next.replaceAll(ar,en);
  return next;
}

function translateText(value: string) {
  const leading = value.match(/^\s*/)?.[0] ?? "";
  const trailing = value.match(/\s*$/)?.[0] ?? "";
  const core = value.trim();
  if (!core) return value;
  return `${leading}${translateCore(core)}${trailing}`;
}

function shouldSkip(node: Text) {
  const parent = node.parentElement;
  if (!parent) return true;
  return ["SCRIPT","STYLE","CODE","PRE","NOSCRIPT"].includes(parent.tagName) || Boolean(parent.closest("[data-wealth-preferences-v2]"));
}

function applyLanguage(root: ParentNode, language: WealthLanguage) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node: Node | null = walker.nextNode();
  while (node) {
    const text = node as Text;
    if (!shouldSkip(text)) {
      const current = text.nodeValue ?? "";
      if (language === "en") {
        const last = translated.get(text);
        if (!originals.has(text) || (last !== undefined && current !== last)) originals.set(text, current);
        const source = originals.get(text) ?? current;
        const next = translateText(source);
        if (next !== current) text.nodeValue = next;
        translated.set(text, next);
      } else {
        const original = originals.get(text);
        if (original !== undefined && current !== original) text.nodeValue = original;
        translated.delete(text);
      }
    }
    node = walker.nextNode();
  }

  root.querySelectorAll<HTMLElement>("[placeholder],[title],[aria-label]").forEach(el => {
    if (el.closest("[data-wealth-preferences-v2]")) return;
    const saved = attributeOriginals.get(el) ?? new Map<string,string>();
    for (const attr of ["placeholder","title","aria-label"]) {
      const current = el.getAttribute(attr);
      if (current === null) continue;
      if (!saved.has(attr)) saved.set(attr,current);
      const original = saved.get(attr) ?? current;
      el.setAttribute(attr, language === "en" ? translateText(original) : original);
    }
    attributeOriginals.set(el,saved);
  });
}

function setFavicon(theme: WealthTheme) {
  let icon = document.querySelector<HTMLLinkElement>('link[rel="icon"],link[rel="shortcut icon"]');
  if (!icon) { icon = document.createElement("link"); icon.rel = "icon"; document.head.appendChild(icon); }
  icon.href = theme === "light" ? "/tharwa-logo-dark.svg" : "/tharwa-logo-light.svg";
}

function applyBrandMarks(theme: WealthTheme) {
  document.querySelectorAll<HTMLImageElement>(".wealth-brand-mark").forEach(mark => {
    mark.src = theme === "light" ? "/tharwa-logo-dark.svg" : "/tharwa-logo-light.svg";
    mark.alt = "";
  });
}

export default function WealthPreferencesV2() {
  const [language,setLanguage] = useState<WealthLanguage>("ar");
  const [theme,setTheme] = useState<WealthTheme>("dark");
  const languageRef = useRef<WealthLanguage>("ar");
  const titleOriginal = useRef<string | null>(null);

  useEffect(() => {
    const storedLanguage = localStorage.getItem(LANGUAGE_KEY) ?? localStorage.getItem(LEGACY_LANGUAGE_KEY);
    const storedTheme = localStorage.getItem(THEME_KEY) ?? localStorage.getItem(LEGACY_THEME_KEY);
    setLanguage(storedLanguage === "en" ? "en" : "ar");
    setTheme(storedTheme === "light" ? "light" : "dark");
  },[]);

  useEffect(() => {
    languageRef.current = language;
    document.documentElement.dataset.wealthLang = language;
    document.documentElement.lang = language;
    const root = document.querySelector<HTMLElement>(".wealth-tahoma");
    if (root) { root.dir = language === "en" ? "ltr" : "rtl"; applyLanguage(root,language); }
    if (titleOriginal.current === null) titleOriginal.current = document.title;
    document.title = language === "en" ? translateText(titleOriginal.current) : titleOriginal.current;
    localStorage.setItem(LANGUAGE_KEY,language);
    localStorage.setItem(LEGACY_LANGUAGE_KEY,language);
    window.dispatchEvent(new CustomEvent("wealth:language-change",{detail:{language}}));
  },[language]);

  useEffect(() => {
    document.documentElement.dataset.wealthTheme = theme;
    localStorage.setItem(THEME_KEY,theme);
    localStorage.setItem(LEGACY_THEME_KEY,theme);
    setFavicon(theme);
    applyBrandMarks(theme);
    window.dispatchEvent(new CustomEvent("wealth:theme-change",{detail:{theme}}));
  },[theme]);

  useEffect(() => {
    let queued = false;
    const observer = new MutationObserver(() => {
      if (queued) return;
      queued = true;
      queueMicrotask(() => {
        queued = false;
        const root = document.querySelector<HTMLElement>(".wealth-tahoma");
        if (root) applyLanguage(root,languageRef.current);
      });
    });
    observer.observe(document.body,{subtree:true,childList:true,characterData:true});
    return () => observer.disconnect();
  },[]);

  const copy = useMemo(() => language === "en" ? {
    language:"Language", theme:"Theme", arabic:"Arabic", english:"English", dark:"Dark", light:"Light"
  } : {
    language:"اللغة", theme:"الثيم", arabic:"العربية", english:"English", dark:"غامق", light:"فاتح"
  },[language]);

  return <div className="wealth-preferences" data-wealth-preferences-v2="true" dir={language === "en" ? "ltr" : "rtl"}>
    <div className="wealth-preference-group" aria-label={copy.language}>
      <span className="wealth-preference-label">{copy.language}</span>
      <div className="wealth-segmented">
        <button type="button" className={language === "ar" ? "is-active" : ""} onClick={() => setLanguage("ar")}>{copy.arabic}</button>
        <button type="button" className={language === "en" ? "is-active" : ""} onClick={() => setLanguage("en")}>{copy.english}</button>
      </div>
    </div>
    <div className="wealth-preference-group" aria-label={copy.theme}>
      <span className="wealth-preference-label">{copy.theme}</span>
      <div className="wealth-segmented">
        <button type="button" className={theme === "dark" ? "is-active" : ""} onClick={() => setTheme("dark")}><span aria-hidden="true">◐</span>{copy.dark}</button>
        <button type="button" className={theme === "light" ? "is-active" : ""} onClick={() => setTheme("light")}><span aria-hidden="true">○</span>{copy.light}</button>
      </div>
    </div>
  </div>;
}
