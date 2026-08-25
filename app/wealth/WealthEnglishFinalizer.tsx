"use client";

import { useEffect } from "react";

const ARABIC = /[\u0600-\u06ff]/;

const PHRASES: Array<[string, string]> = [
  ["جاري بناء الفحص الشرعي المبدئي…", "Building preliminary Shariah screening…"],
  ["جاري بناء الفحص الشرعي المبدئي...", "Building preliminary Shariah screening..."],
  ["فحص مبدئي، وليس فتوى.", "Preliminary screening, not a fatwa."],
  ["التصنيف الآلي يساعد على اكتشاف ما يحتاج مراجعة.", "Automated screening helps identify what needs review."],
  ["التوزيع حسب المصدر", "Allocation by source"],
  ["توزيع الحالة الشرعية", "Shariah status allocation"],
  ["كيف يتم الفحص؟", "How is screening performed?"],
  ["طبيعة الأصل والنشاط", "Asset and business activity"],
  ["النسب المالية", "Financial ratios"],
  ["الدخل غير المباح والتنقية", "Non-permissible income & purification"],
  ["مراجعة بشرية", "Human review"],
  ["الفحص لكل الأصول", "Screening by asset"],
  ["تفاصيل الأصول", "Asset details"],
  ["سبب التصنيف", "Classification reason"],
  ["لا تصدر حكمًا نهائيًا عليها الآن؛ الأصول الرقمية محل اختلاف في المعالجة الشرعية.", "No final ruling is issued at this stage; digital assets are subject to differing Shariah views."],
  ["لا توجد بيانات كافية لإصدار فحص مبدئي موثوق لهذا الأصل.", "There is not enough data for a reliable preliminary screening of this asset."],
  ["التصنيف الحالي مبدئي ولا يمثل اعتمادًا شرعيًا رسميًا.", "The current classification is preliminary and does not represent official Shariah approval."],
  ["القيم غير المسعّرة يوميًا تبقى على آخر قيمة معروفة.", "Assets without daily pricing remain at their last known value."],
  ["القيم غير المسعرة يومياً تبقى على آخر قيمة معروفة.", "Assets without daily pricing remain at their last known value."],
  ["المحفظة الحقيقية", "Real portfolio"],
  ["المحفظة التجريبية", "Paper portfolio"],
  ["إدارة الأصول", "Manage assets"],
  ["الالتزام الشرعي", "Shariah"],
  ["الدخل والتوزيعات", "Income & distributions"],
  ["التوزيعات الشهرية — آخر 12 شهرًا", "Monthly distributions — last 12 months"],
  ["أصول دفعت توزيعات", "Assets paying distributions"],
  ["ضمن الأصول المسجلة", "Among recorded assets"],
  ["آخر التوزيعات", "Latest distributions"],
  ["الدخل حسب الحساب", "Income by account"],
  ["أعلى مصادر الدخل", "Top income sources"],
  ["كل الأصول", "All assets"],
  ["الأصول المسجلة حاليًا", "Currently recorded assets"],
  ["عدد الأصول", "Number of assets"],
  ["حسب التكلفة", "By cost basis"],
  ["كل الحسابات", "All accounts"],
  ["توزيع الأصول", "Asset allocation"],
  ["حالة المراكز", "Position status"],
  ["أين توجد الثروة؟", "Where is your wealth?"],
  ["اسأل عن ثروتك", "Ask about your wealth"],
  ["استعمل التحليلات على بياناتك الحقيقية فقط", "Use analytics on your real portfolio data only"],
  ["ما أكبر تركّز في المحفظة؟", "What is the largest concentration in my portfolio?"],
  ["رابح وخاسر: ما أكثر الأصول؟", "Which assets are the biggest winners and losers?"],
  ["بين السعودية والعالم والكريبتو، كيف توزعت الثروة؟", "How is my wealth split between Saudi, global and crypto assets?"],
  ["السعودية / محلي", "Saudi / Local"],
  ["سعودي / محلي", "Saudi / Local"],
  ["ريال سعودي", "Saudi Riyal"],
  ["دولار أمريكي", "US Dollar"],
  ["سدكو كابيتال ريت", "SEDCO Capital REIT"],
  ["جدوى ريت", "Jadwa REIT"],
  ["أرامكو", "Aramco"],
  ["محفظة عوائد", "Awaed portfolio"],
  ["العربية", "Arabic"],
  ["اللغة", "Language"],
  ["الثيم", "Theme"],
  ["غامق", "Dark"],
  ["فاتح", "Light"],
  ["الحقيقية portfolio", "Real portfolio"],
  ["portfolio الحقيقية", "Real portfolio"],
  ["إدارة assets", "Manage assets"],
  ["الالتزام Shariah", "Shariah"],
  ["توزيع assets", "Asset allocation"],
  ["allocation حسب المصدر", "Allocation by source"],
  ["حالة positions", "Position status"],
  ["عدد assets", "Number of assets"],
  ["ضمن assets المسجلة", "Among recorded assets"],
  ["آخر distributions", "Latest distributions"],
  ["الدخل حسب account", "Income by account"],
  ["screening لكل asset", "Screening by asset"],
  ["توزيع status Shariah", "Shariah status allocation"],
  ["كيف يتم screening؟", "How is screening performed?"],
  ["Best وWorst asset", "Best & worst assets"],
  ["Best وWorst assets", "Best & worst assets"],
  ["value الإجمالية", "Total value"],
  ["كل assets", "All assets"],
  ["حسب cost", "By cost basis"],
  ["المسجلة حاليًا assets", "Currently recorded assets"],
  ["assets المسجلة حاليًا", "Currently recorded assets"],
  ["الasset", "Asset"],
  ["الaccount", "Account"],
  ["الvalue", "Value"],
  ["الstatus", "Status"],
  ["الclassification", "Classification"],
  ["portfolio", "portfolio"]
];

const WORDS: Record<string, string> = {
  "الحقيقية":"real", "الحقيقي":"real", "المبدئي":"preliminary", "المبدئية":"preliminary",
  "جاري":"Loading", "بناء":"building", "الفحص":"screening", "الشرعي":"Shariah", "الشرعية":"Shariah",
  "الالتزام":"Shariah", "إدارة":"Manage", "الأصول":"assets", "أصول":"assets", "أصل":"asset",
  "الدخل":"income", "والتوزيعات":"& distributions", "التوزيعات":"distributions", "توزيع":"allocation",
  "حسب":"by", "المصدر":"source", "الحالة":"status", "المراكز":"positions", "عدد":"Number of",
  "ضمن":"Among", "المسجلة":"recorded", "حاليًا":"currently", "حاليا":"currently", "الأصل":"Asset",
  "الحساب":"Account", "الحسابات":"Accounts", "القيمة":"Value", "الإجمالية":"total", "التكلفة":"cost",
  "سبب":"Reason", "التصنيف":"classification", "التاريخ":"Date", "السجل":"History", "الأخير":"latest",
  "آخر":"Latest", "الكل":"All", "النوع":"Type", "الأداء":"performance", "الربح":"profit", "الخسارة":"loss",
  "الآلي":"automated", "يساعد":"helps", "اكتشاف":"identify", "يحتاج":"needs", "مراجعة":"review",
  "وليس":"not", "فتوى":"fatwa", "الحالي":"current", "مبدئي":"preliminary", "يمثل":"represent",
  "اعتمادًا":"approval", "اعتماداً":"approval", "شرعيًا":"Shariah", "شرعياً":"Shariah", "رسميًا":"official",
  "رسمياً":"official", "القيم":"values", "غير":"non", "المسعرة":"priced", "المسعّرة":"priced", "يوميًا":"daily",
  "يومياً":"daily", "تبقى":"remain", "على":"at", "قيمة":"value", "معروفة":"known", "بيانات":"data",
  "كافية":"enough", "لإصدار":"to issue", "موثوق":"reliable", "لهذا":"for this", "الرقمية":"digital",
  "محل":"subject to", "اختلاف":"differing views", "المعالجة":"treatment", "نهائيًا":"final", "نهائياً":"final",
  "الآن":"now", "السعودية":"Saudi Arabia", "العالم":"global markets", "العالمي":"global", "الكريبتو":"crypto",
  "الثروة":"wealth", "المحفظة":"portfolio", "أكبر":"largest", "تركّز":"concentration", "كيف":"how",
  "توزعت":"allocated", "رابح":"winner", "وخاسر":"and loser", "أكثر":"biggest", "الشهري":"monthly",
  "الشهرية":"monthly", "شهرًا":"months", "شهراً":"months", "المختارة":"selected", "الرئيسية":"base",
  "العملة":"currency", "المبالغ":"amounts", "نقدية":"cash", "متوافق":"compliant", "مصنف":"classified",
  "غيرمصنف":"unclassified", "يحتاجمراجعة":"needs review", "العربية":"Arabic", "اللغة":"Language", "الثيم":"Theme",
  "غامق":"Dark", "فاتح":"Light"
};

function westernize(value: string) {
  return value
    .replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[۰-۹]/g, d => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/٪/g, "%")
    .replace(/ر\.س/g, "SAR")
    .replace(/،/g, ",");
}

function translate(value: string) {
  let next = westernize(value);
  const ordered = [...PHRASES].sort((a,b) => b[0].length - a[0].length);
  for (const [from, to] of ordered) next = next.replaceAll(from, to);
  if (!ARABIC.test(next)) return next;

  next = next.replace(/[\u0600-\u06ff]+/g, token => WORDS[token] ?? token);
  next = next
    .replace(/\s+/g, " ")
    .replace(/\s+([,.:;!?])/g, "$1")
    .replace(/\bShariah Shariah\b/g, "Shariah")
    .replace(/\bassets assets\b/g, "assets")
    .replace(/\bportfolio portfolio\b/g, "portfolio")
    .trim();
  return next;
}

function apply() {
  if (document.documentElement.dataset.wealthLang !== "en") return;
  const root = document.querySelector<HTMLElement>(".wealth-tahoma");
  if (!root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const text = node as Text;
    const parent = text.parentElement;
    if (parent && !["SCRIPT","STYLE","CODE","PRE","NOSCRIPT"].includes(parent.tagName)) {
      const current = text.nodeValue ?? "";
      if (ARABIC.test(current) || /[٠-٩۰-۹٪]/.test(current)) {
        const next = translate(current);
        if (next !== current) text.nodeValue = next;
      }
    }
    node = walker.nextNode();
  }
  root.querySelectorAll<HTMLElement>("[placeholder],[title],[aria-label]").forEach(el => {
    for (const attr of ["placeholder","title","aria-label"]) {
      const current = el.getAttribute(attr);
      if (current && ARABIC.test(current)) el.setAttribute(attr, translate(current));
    }
  });
  if (ARABIC.test(document.title)) document.title = translate(document.title);
}

export default function WealthEnglishFinalizer() {
  useEffect(() => {
    let queued = false;
    const schedule = () => {
      if (queued) return;
      queued = true;
      queueMicrotask(() => {
        queued = false;
        apply();
        requestAnimationFrame(apply);
      });
    };
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { subtree: true, childList: true, characterData: true });
    const onLanguage = () => schedule();
    window.addEventListener("wealth:language-change", onLanguage);
    schedule();
    return () => {
      observer.disconnect();
      window.removeEventListener("wealth:language-change", onLanguage);
    };
  }, []);
  return null;
}
