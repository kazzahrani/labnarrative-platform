"use client";

import { useLayoutEffect } from "react";

const originals = new WeakMap<Text, string>();
const ARABIC = /[\u0600-\u06ff]/;

const EXACT: Record<string, string> = {
  "العربية": "Arabic",
  "أرامكو": "Aramco",
  "سدكو كابيتال ريت": "SEDCO Capital REIT",
  "جدوى ريت": "Jadwa REIT",
  "محفظة عوائد": "Awaed portfolio",
  "الجغرافيا": "Geography",
  "السعودية مقابل العالمي والكريبتو": "Saudi vs global & crypto",
  "القطاعات": "Sectors",
  "التوزيع القطاعي": "Sector allocation",
  "العملات": "Currencies",
  "التعرض للعملات": "Currency exposure",
  "الفترة المحددة": "Selected period",
  "أفضل وأسوأ الأصول": "Best & worst assets",
  "أفضل وأسوأ assets": "Best & worst assets",
  "Best وWorst asset": "Best & worst assets",
  "Best وWorst assets": "Best & worst assets",
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
  "أكبر asset": "Largest asset",
  "أكبر 3 أصول": "Top 3 assets",
  "أكبر 3 assets": "Top 3 assets",
  "مؤشر التركّز": "Concentration index",
  "تقريب من السلسلة اليومية": "Estimate from daily series",
  "جاري جلب الأسعار التاريخية…": "Loading historical prices…",
  "جاري تحميل الأسعار الفعلية…": "Loading market prices…",
  "جاري تحليل التوزيعات الفعلية…": "Analyzing actual distributions…",
  "كل السلاسل تبدأ من 0٪، ثم تعرض نسبة التغير منذ بداية الفترة.": "All series start at 0%, then show the percentage change from the beginning of the selected period.",
  "كل السلاسل تبدأ من 0%، ثم تعرض نسبة التغير منذ بداية الفترة.": "All series start at 0%, then show the percentage change from the beginning of the selected period.",
  "كل السلاسل تبدأ من 0%, ثم تعرض نسبة التغير منذ بداية period.": "All series start at 0%, then show the percentage change from the beginning of the selected period.",
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
  "تفاصيل الassets": "Asset details",
  "تفاصيل assets": "Asset details",
  "الفحص لكل الأصول": "Screening by asset",
  "الفحص لكل assets": "Screening by asset",
  "screening لكل asset": "Screening by asset",
  "screening لكل assets": "Screening by asset",
  "الحالة": "Status",
  "سبب التصنيف": "Classification reason",
  "الكل": "All",
  "فحص مبدئي، وليس فتوى.": "Preliminary screening, not a fatwa.",
  "screening مبدئي، وليس فتوى.": "Preliminary screening, not a fatwa.",
  "استبعاد أو تنبيه المنتجات والأنشطة الواضحة غير المفلترة شرعيًا.": "Exclude or flag clearly non-screened products and activities.",
  "الأسهم تحتاج بيانات مالية محدثة وفحصًا وفق معيار شرعي مختار.": "Stocks require current financial data and screening against the selected Shariah standard.",
  "لا نحسب مبلغ تنقية قبل توفر نسبة موثوقة لكل أصل.": "Purification is not calculated until a reliable rate is available for each asset.",
  "يمكن تثبيت قرار هيئة أو مزود شرعي بدل التقييم الآلي.": "A decision from a Shariah board or provider can override the automated assessment.",
  "صندوق مؤشري عام غير مفلتر شرعيًا؛ قد يضم قطاعات وشركات غير متوافقة.": "A broad index fund without Shariah screening may include non-compliant sectors and companies.",
  "مصنف متوافق مبدئيًا وفق طبيعة الأصل والبيانات المتاحة؛ يبقى الاعتماد النهائي لمرجع شرعي مؤهل.": "Preliminarily classified as compliant based on the asset and available data; final reliance remains with a qualified Shariah authority.",
  "الذهب يتطلب تحققًا من الملكية والقبض وطريقة التسوية.": "Gold requires verification of ownership, possession and settlement method.",
  "لا تصدر ثروة حكمًا نهائيًا عليها حاليًا لأنها أصول رقمية محل اختلاف في المعالجة الشرعية.": "Thrwa does not currently issue a definitive Shariah ruling on digital assets because their treatment differs across Shariah methodologies.",
  "لا تصدر Thrwa حكمًا نهائيًا عليها حاليًا لأنها assets رقمية محل اختلاف في المعالجة Shariah.": "Thrwa does not currently issue a definitive Shariah ruling on digital assets because their treatment differs across Shariah methodologies.",
  "اسأل عن ثروتك": "Ask about your wealth",
  "ذكاء ثروة AI": "Thrwa AI",
  "ذكاء Thrwa AI": "Thrwa AI",
  "AI ذكاءThrwa": "Thrwa AI",
  "استعمل التحليلات على بياناتك الحقيقية فقط": "Use analytics on your real portfolio data only",
  "استعمل Analytics على بياناتك الحقيقية فقط": "Use analytics on your real portfolio data only",
  "ما أكبر تركّز في المحفظة؟": "What is the largest concentration in my portfolio?",
  "رابح وخاسر: ما أكثر الأصول؟": "Which assets are the biggest winners and losers?",
  "رابح وخاسر: ما أكثر asset؟": "Which assets are the biggest winners and losers?",
  "رابح وخاسر: ما أكثر assets؟": "Which assets are the biggest winners and losers?",
  "بين السعودية والعالم والكريبتو، كيف توزعت الثروة؟": "How is my wealth split between Saudi, global and crypto assets?",
  "بين Saudi Arabia وglobal markets وcrypto، كيف توزعت الportfolio؟": "How is my wealth split between Saudi, global and crypto assets?",
  "يدوي": "Manual",
  "متصل": "Connected",
  "غير محققة": "Unrealized",
  "لا يوجد سجل بعد": "No history yet",
  "حسابات تجريبية متنوعة": "Diversified paper accounts",
  "جاري تحميل ثروتك…": "Loading your wealth…",
  "لا توجد بيانات بعد.": "No data yet.",
  "الإجمالي": "Total",
  "القيمة الإجمالية": "Total value",
  "value الإجمالية": "Total value",
  "كل الأصول": "All assets",
  "كل assets": "All assets",
  "الأصول المسجلة حاليًا": "Currently recorded assets",
  "assets المسجلة حاليًا": "Currently recorded assets",
  "كل الحسابات": "All accounts",
  "كل accounts": "All accounts",
  "حسب التكلفة": "By cost basis",
  "حسب cost": "By cost basis",
  "التوزيعات الشهرية — آخر 12 شهرًا": "Monthly distributions — last 12 months",
  "allocationات الشهرية — آخر 12 شهرًا": "Monthly distributions — last 12 months",
  "الدخل حسب الحساب": "Income by account",
  "الدخل حسب account": "Income by account",
  "حدث خلال 5 سنوات": "events over 5 years",
  "سعودي / محلي": "Saudi / Local",
  "SAR سعودي / محلي": "Saudi / Local · SAR",
  "ريال سعودي": "Saudi Riyal",
  "دولار أمريكي": "US Dollar",
  "الدولار": "USD",
  "الريال": "SAR",
  "القيم النقدية معروضة بالعملة الرئيسية.": "Monetary values are shown in the selected base currency.",
  "التصنيف الحالي مبدئي.": "The current classification is preliminary.",
  "لا يوجد رمز سوقي لهذا الأصل، لذلك لا يتوفر تاريخ سعري تلقائي.": "This asset has no market symbol, so automatic price history is unavailable.",
  "لا توجد نقاط سعرية كافية لهذا الأصل.": "There are not enough price points for this asset.",
  "تعذر تحميل التاريخ السعري": "Could not load price history",
  "أصل ضمن المحفظة التجريبية — لا يؤثر على بياناتك الحقيقية.": "This is a paper-portfolio asset and does not affect your real data.",
  "هذا الأصل يمثل": "This asset represents",
  "من المحفظة الحالية.": "of the current portfolio.",
  "لا توجد تكلفة كافية لحساب الربحية.": "There is not enough cost data to calculate performance.",
  "الرسم أعلاه يعتمد على تاريخ السعر الفعلي للرمز، وليس على تقدير بين التكلفة والسعر الحالي.": "The chart above uses the symbol's actual price history rather than an estimate between cost and current price.",
  "القيم معروضة الآن بـ": "Values are currently shown in ",
  "القيمة المرجعية الداخلية محفوظة بالريال": "The internal reference value is stored in SAR",
  "التكلفة الإجمالية": "Total cost",
  "آخر تحديث": "Last updated",
  "الاسم": "Name",
  "النوع": "Type",
  "الوزن": "Weight",
  "النسبة": "Share",
  "التصنيف الشرعي": "Shariah classification",
  "فتح صفحة الأصل": "Open asset page",
  "فتح الحسابات": "Open accounts",
  "فتح التحليلات": "Open analytics",
  "فتح الالتزام الشرعي": "Open Shariah",
  "فتح الدخل والتوزيعات": "Open income & distributions"
};

const PHRASES: Array<[string, string]> = [
  ["التوزيعات الشهرية — آخر 12 شهرًا", "Monthly distributions — last 12 months"],
  ["الأصول المسجلة حاليًا", "Currently recorded assets"],
  ["لا تصدر ثروة حكمًا نهائيًا عليها حاليًا لأنها أصول رقمية محل اختلاف في المعالجة الشرعية.", "Thrwa does not currently issue a definitive Shariah ruling on digital assets because their treatment differs across Shariah methodologies."],
  ["سدكو كابيتال ريت", "SEDCO Capital REIT"],
  ["جدوى ريت", "Jadwa REIT"],
  ["محفظة عوائد", "Awaed portfolio"],
  ["أرامكو", "Aramco"],
  ["فحص مبدئي، وليس فتوى.", "Preliminary screening, not a fatwa."],
  ["متوسط التكلفة", "Average cost"],
  ["من إجمالي", "of total"],
  ["الثروة المسجلة", "recorded wealth"],
  ["المحفظة التجريبية", "paper portfolio"],
  ["المحفظة الحالية", "current portfolio"],
  ["كل الأصول", "All assets"],
  ["كل الحسابات", "All accounts"],
  ["حسب التكلفة", "By cost basis"],
  ["الدخل حسب الحساب", "Income by account"],
  ["المحفظة", "portfolio"],
  ["الأصول", "assets"],
  ["أصل", "asset"],
  ["الحسابات", "accounts"],
  ["حسابات", "accounts"],
  ["حساب", "account"],
  ["السعودية", "Saudi Arabia"],
  ["السعودي", "Saudi"],
  ["العالمي", "global"],
  ["العالم", "global markets"],
  ["الكريبتو", "crypto"],
  ["الشرعي", "Shariah"],
  ["الشرعية", "Shariah"],
  ["الفحص", "screening"],
  ["التصنيف", "classification"],
  ["التكلفة", "cost"],
  ["القيمة", "value"],
  ["المراكز", "positions"],
  ["الفترة", "period"],
  ["التوزيعات", "distributions"],
  ["التوزيع", "allocation"],
  ["القطاعي", "sector"],
  ["القطاعات", "sectors"],
  ["الجغرافيا", "geography"],
  ["العملات", "currencies"],
  ["التعرض", "exposure"],
  ["التركيز", "concentration"],
  ["الربح", "profit"],
  ["الخسارة", "loss"],
  ["الخاسرة", "losing"],
  ["الرابحة", "winning"],
  ["أفضل", "Best"],
  ["أسوأ", "Worst"],
  ["أكبر", "Largest"],
  ["تفاصيل", "Details"],
  ["الحالة", "status"],
  ["السبب", "reason"],
  ["يدوي", "Manual"],
  ["متصل", "Connected"],
  ["الكل", "All"]
];

const TOKENS: Array<[RegExp, string]> = [
  [/\bلكل\b/g, "by"],
  [/\bالإجمالية\b/g, "total"],
  [/\bالمسجلة\b/g, "recorded"],
  [/\bحاليًا\b/g, "currently"],
  [/\bحسب\b/g, "by"],
  [/\bالشهرية\b/g, "monthly"],
  [/\bآخر\b/g, "last"],
  [/\bشهرًا\b/g, "months"],
  [/\bمنذ\b/g, "since"],
  [/\bبداية\b/g, "start of"],
  [/\bتبدأ\b/g, "start"],
  [/\bتعرض\b/g, "show"],
  [/\bنسبة\b/g, "percentage"],
  [/\bالتغير\b/g, "change"],
  [/\bالسلاسل\b/g, "series"],
  [/\bكل\b/g, "all"],
  [/\bوWorst\b/g, "& Worst"],
  [/\bوBest\b/g, "& Best"],
  [/\bوglobal\b/g, "and global"],
  [/\bوcrypto\b/g, "and crypto"],
  [/\bذكاء\b/g, "AI"],
  [/\bاستعمل\b/g, "Use"],
  [/\bعلى\b/g, "on"],
  [/\bبياناتك\b/g, "your data"],
  [/\bالحقيقية\b/g, "real"],
  [/\bفقط\b/g, "only"],
  [/\bرابح\b/g, "winner"],
  [/\bوخاسر\b/g, "and loser"],
  [/\bما\b/g, "what"],
  [/\bأكثر\b/g, "largest"],
  [/\bبين\b/g, "between"],
  [/\bكيف\b/g, "how"],
  [/\bتوزعت\b/g, "is allocated"],
  [/\bالثروة\b/g, "wealth"],
  [/\bفحص\b/g, "screening"],
  [/\bمبدئي\b/g, "preliminary"],
  [/\bوليس\b/g, "not"],
  [/\bفتوى\b/g, "fatwa"],
  [/\bلا\b/g, "not"],
  [/\bتصدر\b/g, "issue"],
  [/\bحكمًا\b/g, "a ruling"],
  [/\bنهائيًا\b/g, "definitive"],
  [/\bعليها\b/g, "on it"],
  [/\bلأنها\b/g, "because it is"],
  [/\bرقمية\b/g, "digital"],
  [/\bمحل\b/g, "subject to"],
  [/\bاختلاف\b/g, "different views"],
  [/\bفي\b/g, "in"],
  [/\bالمعالجة\b/g, "treatment"]
];

function westernize(value: string) {
  return value
    .replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[۰-۹]/g, d => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/٪/g, "%")
    .replace(/ر\.س/g, "SAR")
    .replace(/،/g, ",");
}

function cleanMixed(value: string) {
  return value
    .replace(/screening\s+لكل\s+assets?/gi, "Screening by asset")
    .replace(/Best\s+و\s*Worst\s+assets?/gi, "Best & worst assets")
    .replace(/value\s+الإجمالية/gi, "Total value")
    .replace(/كل\s+assets/gi, "All assets")
    .replace(/assets\s+المسجلة\s+حاليًا/gi, "Currently recorded assets")
    .replace(/كل\s+accounts/gi, "All accounts")
    .replace(/حسب\s+cost/gi, "By cost basis")
    .replace(/allocationات\s+الشهرية\s+—\s+آخر\s+12\s+شهرًا/gi, "Monthly distributions — last 12 months")
    .replace(/account\s*الدخل\s+حسب\s+ال?/gi, "Income by account")
    .replace(/الدخل\s+حسب\s+account/gi, "Income by account")
    .replace(/AI\s+ذكاء\s*Thrwa/gi, "Thrwa AI")
    .replace(/ذكاء\s*Thrwa\s*AI/gi, "Thrwa AI")
    .replace(/SAR\s+سعودي\s*\/\s*محلي/gi, "Saudi / Local · SAR")
    .replace(/كل\s+السلاسل\s+تبدأ\s+من\s+0%،?\s*ثم\s+تعرض\s+نسبة\s+التغير\s+منذ\s+بداية\s+period\.?/gi, "All series start at 0%, then show the percentage change from the beginning of the selected period.")
    .replace(/لا\s+تصدر\s+(?:Thrwa\s+)?حكمًا\s+نهائيًا\s+عليها\s+حاليًا\s+لأنها\s+(?:assets\s+)?رقمية\s+محل\s+اختلاف\s+في\s+المعالجة\s+Shariah\.?/gi, "Thrwa does not currently issue a definitive Shariah ruling on digital assets because their treatment differs across Shariah methodologies.");
}

function translateRemaining(value: string) {
  let next = westernize(value);
  const trimmed = next.trim();
  if (EXACT[trimmed]) {
    const lead = next.match(/^\s*/)?.[0] ?? "";
    const trail = next.match(/\s*$/)?.[0] ?? "";
    return `${lead}${EXACT[trimmed]}${trail}`;
  }

  next = cleanMixed(next)
    .replace(/^(\d+)\s+حدث خلال 5 سنوات$/, "$1 events over 5 years")
    .replace(/^حدث خلال 5 سنوات\s+(\d+)$/, "$1 events over 5 years")
    .replace(/^عبر\s+(\d+)\s+حسابات$/, "Across $1 accounts")
    .replace(/^آخر تحديث\s+(.+)$/, "Last updated $1")
    .replace(/^متوسط التكلفة\s+(.+)$/, "Average cost $1")
    .replace(/^(.+)\s+من إجمالي\s+(.+)$/, "$1 of total $2")
    .replace(/^(\d+)\s+أصل$/, "$1 assets")
    .replace(/^(\d+)\s+حساب$/, "$1 account")
    .replace(/^(\d+)\s+حسابات$/, "$1 accounts");

  for (const [ar, en] of PHRASES) next = next.replaceAll(ar, en);
  next = cleanMixed(next);

  if (ARABIC.test(next)) {
    for (const [pattern, en] of TOKENS) next = next.replace(pattern, en);
    next = cleanMixed(next);
  }

  return next
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.!?])/g, "$1")
    .replace(/\bby\s+asset\b/gi, "by asset")
    .replace(/\bAll\s+asset\b/gi, "All assets")
    .replace(/\bUse\s+Analytics\b/g, "Use analytics")
    .replace(/\bwinner\s+and loser:\s*what\s+largest\s+asset\??/gi, "Which assets are the biggest winners and losers?")
    .replace(/\bbetween\s+Saudi Arabia\s+and global markets\s+and crypto,?\s*how\s+is allocated\s+the?\s*portfolio\??/gi, "How is my wealth split between Saudi, global and crypto assets?");
}

function capturable(node: Text) {
  const parent = node.parentElement;
  if (!parent) return false;
  return !["SCRIPT", "STYLE", "CODE", "PRE", "NOSCRIPT"].includes(parent.tagName);
}

function capture(root: ParentNode) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const text = node as Text;
    if (capturable(text) && !originals.has(text)) originals.set(text, text.nodeValue ?? "");
    node = walker.nextNode();
  }
}

function applyEnglish(root: ParentNode) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const text = node as Text;
    if (capturable(text)) {
      const current = text.nodeValue ?? "";
      if (ARABIC.test(current) || /[٠-٩۰-۹٪]/.test(current)) {
        const next = translateRemaining(current);
        if (next !== current) text.nodeValue = next;
      }
    }
    node = walker.nextNode();
  }

  document.querySelectorAll<HTMLElement>("[placeholder],[title],[aria-label]").forEach(el => {
    for (const attr of ["placeholder", "title", "aria-label"]) {
      const current = el.getAttribute(attr);
      if (current && (ARABIC.test(current) || /[٠-٩۰-۹٪]/.test(current))) el.setAttribute(attr, translateRemaining(current));
    }
  });

  if (ARABIC.test(document.title)) document.title = translateRemaining(document.title);
}

function restoreArabic(root: ParentNode, originalTitle: string) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const text = node as Text;
    const original = originals.get(text);
    if (original !== undefined && text.nodeValue !== original) text.nodeValue = original;
    node = walker.nextNode();
  }
  document.title = originalTitle;
}

export default function WealthEnglishGuard() {
  useLayoutEffect(() => {
    const root = document.querySelector<HTMLElement>(".wealth-tahoma");
    if (!root) return;
    const originalTitle = document.title;
    capture(root);

    let queued = false;
    const schedule = () => {
      if (queued) return;
      queued = true;
      queueMicrotask(() => {
        queued = false;
        if (document.documentElement.dataset.wealthLang === "en") applyEnglish(root);
      });
    };

    const observer = new MutationObserver(records => {
      for (const record of records) {
        record.addedNodes.forEach(node => {
          if (node.nodeType === Node.TEXT_NODE) {
            const text = node as Text;
            if (capturable(text) && !originals.has(text)) originals.set(text, text.nodeValue ?? "");
          } else if (node instanceof Element) capture(node);
        });
      }
      schedule();
    });
    observer.observe(root, { childList: true, subtree: true, characterData: true });

    const onLanguage = (event: Event) => {
      const language = (event as CustomEvent<{ language?: string }>).detail?.language;
      queueMicrotask(() => {
        if (language === "en") applyEnglish(root);
        if (language === "ar") restoreArabic(root, originalTitle);
      });
    };
    window.addEventListener("wealth:language-change", onLanguage);
    schedule();

    return () => {
      observer.disconnect();
      window.removeEventListener("wealth:language-change", onLanguage);
    };
  }, []);
  return null;
}
