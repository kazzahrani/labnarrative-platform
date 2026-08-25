"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type WealthLanguage = "ar" | "en";
type WealthTheme = "dark" | "light";

const LANGUAGE_KEY = "tharwa:language";
const THEME_KEY = "tharwa:theme";

const EN: Record<string, string> = {
  "ثروة": "Tharwa",
  "إدارة الثروة": "Wealth management",
  "محفظة تجريبية": "Paper portfolio",
  "المحفظة التجريبية": "Paper portfolio",
  "المحفظة الحقيقية": "Real portfolio",
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
  "أصل": "Asset",
  "حساب": "Account",
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
  "لا توجد بيانات.": "No data.",
  "لا توجد بيانات تاريخية كافية لهذه الفترة.": "Not enough historical data for this period.",
  "جاري بناء التحليلات…": "Building analytics…",
  "تعذر تحميل التحليلات.": "Could not load analytics.",
  "تعذر بناء الأداء التاريخي للمحفظة.": "Could not build historical portfolio performance.",
  "تعذر بناء الأداء التاريخي.": "Could not build historical performance.",
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
  "لا توجد بيانات كافية لإصدار فحص مبدئي موثوق لهذا الأصل.": "There is not enough data for a reliable preliminary screening of this asset.",
  "غير مصنف بعد.": "Not classified yet.",
  "جاري بناء الفحص الشرعي المبدئي…": "Building preliminary Shariah screening…",
  "تعذر تحميل الفحص.": "Could not load screening.",
  "إجمالي الحسابات": "Total accounts",
  "حسابات ظاهرة": "Visible accounts",
  "بالعملة الرئيسية": "In base currency",
  "محاكاة الربط": "Connection simulation",
  "ربط مباشر": "Direct connection",
  "حساب API": "API account",
  "يدوي / كشف حساب": "Manual / statement",
  "حسابات غير API": "Non-API accounts",
  "نشط": "Active",
  "قيد الإعداد": "Pending setup",
  "غير متصل": "Disconnected",
  "مخفي": "Hidden",
  "محاكاة API": "API simulation",
  "اتصال API": "API connection",
  "كشف حساب": "Statement",
  "إدخال يدوي": "Manual entry",
  "حساب نقدي": "Cash account",
  "حساب استثماري": "Investment account",
  "لا توجد أصول": "No assets",
  "أكبر فئة": "Largest category",
  "عملة العرض": "Display currency",
  "النوع": "Type",
  "لا توجد أصول في هذا الحساب.": "There are no assets in this account.",
  "إخفاء الحساب لا يحذف أصوله أو تاريخه.": "Hiding an account does not delete its assets or history.",
  "هذه الحسابات تجريبية ومفصولة بالكامل عن حساباتك الحقيقية.": "These are paper accounts and are fully separated from your real accounts.",
  "جاري تحميل الحسابات…": "Loading accounts…",
  "تعذر تحميل الحسابات.": "Could not load accounts.",
  "جاري تحميل الأصول…": "Loading assets…",
  "تعذر تحميل الأصول.": "Could not load assets.",
  "تعديل الأصول الحالية أو إضافة أصل جديد.": "Edit current assets or add a new asset.",
  "عدّل بيانات الاختبار دون أي تأثير على المحفظة الحقيقية.": "Edit paper data without affecting the real portfolio.",
  "جاري الحفظ…": "Saving…",
  "العودة إلى لوحة الثروة": "Back to wealth dashboard",
  "الحسابات والمصادر": "Accounts & sources",
  "اربط حساباتك وأكمل صورة ثروتك.": "Connect your accounts and complete your wealth picture.",
  "نستخدم الربط الرسمي عندما يكون متاحًا، والكشف المنظم عندما يحتاج المزود إلى شراكة أو لا يوفر API للمستخدم مباشرة.": "We use official connections when available, and structured statements when a provider requires a partnership or does not offer a direct user API.",
  "الأساس": "Foundation",
  "ربط، مزامنة، ثم تحقق.": "Connect, sync, then verify.",
  "كل مصدر يدخل إلى نفس نموذج الحسابات والأصول والتكلفة والنقد بدون خلط البيانات.": "Every source feeds the same account, asset, cost and cash model without mixing data.",
  "اربط أو استورد": "Connect or import",
  "API قراءة فقط عندما يتوفر، أو ملف منظم عندما لا يتوفر.": "Use read-only API when available, or a structured file when it is not.",
  "راجع البيانات": "Review the data",
  "لا نحفظ كشفًا قبل معاينة الأعمدة والمراكز والتكلفة.": "We do not save a statement before reviewing columns, positions and cost basis.",
  "وحّد المحفظة": "Unify the portfolio",
  "تدخل النتيجة إلى نفس صافي الثروة والتحليلات والمحاسبة.": "The result feeds the same net worth, analytics and accounting model.",
  "الروابط الفعلية": "Live connections",
  "Binance يعمل فعليًا. IBKR جاهز عند توفر حساب صالح. دراية تحتاج اعتماد OpenAPI من المزود.": "Binance is live. IBKR is ready when a valid account is available. Derayah requires provider OpenAPI approval.",
  "رفع كشف": "Upload statement",
  "الوسطاء السعوديون الآن": "Saudi brokers now",
  "CSV وExcel يعملان الآن مع ربط مرن للأعمدة ومعاينة قبل الحفظ.": "CSV and Excel work now with flexible column mapping and review before saving.",
  "الأصول التي لا تحتاج API": "Assets that do not need an API",
  "للعقار والذهب والسيولة والأصول الخاصة.": "For real estate, gold, liquidity and private assets.",
  "استيراد الكشف": "Import statement",
  "فتح": "Open",
  "يتطلب اعتماد المزود": "Provider approval required",
  "وسيط سعودي": "Saudi broker",
  "وسيط عالمي": "Global broker",
  "منصة استثمار سعودية": "Saudi investment platform",
  "أصول رقمية": "Digital assets",
  "وسيط استثماري": "Investment broker",
  "أصل مدرج": "Listed asset",
  "صناديق": "Funds",
  "دخل ثابت": "Fixed income",
  "أصل حقيقي": "Real asset",
  "أصل بديل": "Alternative asset",
  "سيولة": "Liquidity",
  "أصل خاص": "Private asset",
  "API رسمي": "Official API",
  "يتطلب اعتماد شريك": "Partner approval required",
  "تقارير فقط": "Reports only",
  "Vault مشفر": "Encrypted Vault",
  "API قراءة فقط": "Read-only API",
  "ربط رسمي لاحقًا": "Official connection later",
  "مراجعة قبل الحفظ": "Review before saving",
  "رمز": "Symbol",
  "كمية": "Quantity",
  "تكلفة": "Cost",
  "اسم الصندوق": "Fund name",
  "وحدات": "Units",
  "قيمة": "Value",
  "استحقاق": "Maturity",
  "دخل": "Income",
  "قيمة تقديرية": "Estimated value",
  "دخل سنوي": "Annual income",
  "وزن": "Weight",
  "رصيد": "Balance",
  "عملة": "Currency",
  "اسم": "Name",
  "ملاحظات": "Notes",
  "العودة إلى ثروة": "Back to Thrwa",
  "دخول آمن": "Secure sign-in",
  "بياناتك المالية تبقى مرتبطة بك أنت فقط.": "Your financial data stays linked only to you.",
  "نستخدم تسجيل الدخول حتى نستطيع حفظ محافظك واستثماراتك بأمان، مع سياسات وصول تمنع أي مستخدم من رؤية بيانات مستخدم آخر.": "We use sign-in to save your portfolios and investments securely, with access policies that prevent one user from seeing another user's data.",
  "لا نطلب كلمة مرور أي بنك أو وسيط استثماري.": "We never ask for a bank or broker password.",
  "منصة ثروة في هذه المرحلة للعرض والتحليل فقط.": "At this stage, Thrwa is for viewing and analysis only.",
  "بيانات المحافظ محمية بسياسات Row Level Security في Supabase.": "Portfolio data is protected by Row Level Security policies in Supabase.",
  "تسجيل الدخول": "Sign in",
  "حساب جديد": "New account",
  "حسابك": "Your account",
  "ابدأ الآن": "Start now",
  "الخطوة الأخيرة": "Final step",
  "استعادة الوصول": "Recover access",
  "مرحبًا بعودتك.": "Welcome back.",
  "أنشئ حساب ثروة.": "Create a Thrwa account.",
  "أكّد بريدك الإلكتروني.": "Confirm your email.",
  "استعد حسابك.": "Recover your account.",
  "ادخل لحفظ محفظة عوائد ومتابعة ثروتك من أي جهاز.": "Sign in to save your Awaed portfolio and track your wealth from any device.",
  "أنشئ حسابًا واحدًا لكل أصولك ومحافظك.": "Create one account for all your assets and portfolios.",
  "أدخل رمز التحقق المكوّن من 6 أرقام الذي أرسلناه إلى بريدك.": "Enter the 6-digit verification code we sent to your email.",
  "أدخل بريدك وسنرسل رابطًا آمنًا لاختيار كلمة مرور جديدة.": "Enter your email and we will send a secure link to choose a new password.",
  "البريد الإلكتروني": "Email",
  "رمز التحقق": "Verification code",
  "كلمة المرور": "Password",
  "8 أحرف على الأقل": "At least 8 characters",
  "نسيت كلمة المرور؟": "Forgot password?",
  "لدي رمز تحقق بالفعل": "I already have a verification code",
  "إعادة إرسال الرمز": "Resend code",
  "تغيير البريد / بدء التسجيل من جديد": "Change email / restart sign-up",
  "العودة إلى تسجيل الدخول": "Back to sign in",
  "جاري التحقق…": "Verifying…",
  "دخول إلى ثروة": "Sign in to Thrwa",
  "إنشاء الحساب": "Create account",
  "تأكيد الرمز والدخول": "Confirm code and sign in",
  "إرسال رابط الاستعادة": "Send recovery link",
  "يتم تأمين الجلسة بواسطة Supabase Auth. لا نخزن كلمة المرور داخل تطبيق ثروة.": "Your session is secured by Supabase Auth. Thrwa does not store your password.",
  "السوق السعودي + الأمريكي": "Saudi + US markets",
  "أدخل الاستثمار بعملته الأصلية.": "Enter each investment in its native currency.",
  "اختر الريال للأصول السعودية والدولار للأصول الأمريكية كما تظهر في عوائد. تحتفظ ثروة بالقيمة الأصلية، ثم توحّد الحسابات وتعرض المنصة كلها بالعملة الرئيسية التي تختارها.": "Choose SAR for Saudi assets and USD for US assets as shown in Awaed. Thrwa preserves the native value, then normalizes accounting and displays the platform in your selected base currency.",
  "العملات المدعومة": "Supported currencies",
  "سعر التحويل": "FX rate",
  "الأسهم السعودية": "Saudi stocks",
  "سعر سوق تلقائي": "Automatic market price",
  "الحفظ": "Saving",
  "مطابقة ذرّية": "Atomic reconciliation",
  "عملة الأصل لا تضيع": "The asset currency is preserved",
  "ثروة تستخدم الريال كعملة محاسبية داخلية موحدة، لكنها تحفظ عملة الإدخال والقيمة الأصلية لكل أصل. تغيير العملة الرئيسية من ريال إلى دولار يغير العرض فقط ولا يعيد كتابة استثماراتك أو تكلفتها.": "Tharwa uses SAR as the unified internal accounting currency while preserving each asset's input currency and native value. Changing the base currency only changes display and never rewrites your investments or cost basis.",
  "المطابقة الآمنة": "Safe reconciliation",
  "سجّل الدخول لعرض محفظة عوائد الحالية.": "Sign in to view your current Awaed portfolio.",
  "الحساب الجاري تحديثه": "Account being updated",
  "محفظة حقيقية": "Real portfolio",
  "العملة الرئيسية للمنصة": "Platform base currency",
  "لا تغيّر عملة الأصل؛ تغيّر فقط طريقة عرض ثروتك.": "This does not change the asset currency; it only changes how your wealth is displayed.",
  "السوق السعودي + السوق الأمريكي": "Saudi market + US market",
  "أدخل الأصل بعملته الأصلية، واترك السعر لثروة.": "Enter the asset in its native currency and let Thrwa handle pricing.",
  "للأسهم والـREIT يكفي الرمز والكمية ومتوسط التكلفة؛ السعر والقيمة الحالية تأتي تلقائيًا من Market Data Engine. استخدم القيمة الحالية يدويًا فقط للأصول غير المسعّرة في السوق.": "For stocks and REITs, enter the symbol, quantity and average cost; the Market Data Engine supplies price and current value automatically. Enter current value manually only for assets without market pricing.",
  "الاستثمار": "Investment",
  "العملة": "Currency",
  "متوسط التكلفة": "Average cost",
  "العودة إلى مصادر الاستثمار": "Back to investment sources",
  "عوائد × ثروة": "Awaed × Thrwa"
};

const MONTHS: Record<string, string> = {
  "يناير": "January", "فبراير": "February", "مارس": "March", "أبريل": "April", "مايو": "May", "يونيو": "June",
  "يوليو": "July", "أغسطس": "August", "سبتمبر": "September", "أكتوبر": "October", "نوفمبر": "November", "ديسمبر": "December"
};

const originals = new WeakMap<Text, string>();
const translated = new WeakMap<Text, string>();
const attributeOriginals = new WeakMap<Element, Map<string, string>>();

function westernDigits(value: string) {
  return value
    .replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[۰-۹]/g, digit => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/٪/g, "%")
    .replace(/ر\.س/g, "SAR");
}

function dynamicEnglish(value: string) {
  const rules: Array<[RegExp, (...args: string[]) => string]> = [
    [/^(\d+|[٠-٩]+) أصل$/, n => `${westernDigits(n)} assets`],
    [/^(\d+|[٠-٩]+) حساب · (\d+|[٠-٩]+) أصل$/, (a, h) => `${westernDigits(a)} accounts · ${westernDigits(h)} assets`],
    [/^عبر (\d+|[٠-٩]+) حسابات$/, n => `Across ${westernDigits(n)} accounts`],
    [/^آخر تحديث (.+)$/, rest => `Last updated ${translateDateWords(rest)}`],
    [/^(\d+|[٠-٩]+) حدث خلال 5 سنوات$/, n => `${westernDigits(n)} events over 5 years`],
    [/^تعديل: (.+)$/, name => `Edit: ${name}`],
    [/^ربط (.+)$/, name => `Connect ${name}`],
    [/^(.+) أصل بقيمة (.+)\.$/, (count, amount) => `${westernDigits(count)} assets worth ${westernDigits(amount)}.`],
    [/^(.+)٪ غير محققة$/, pct => `${westernDigits(pct)}% unrealized`],
  ];
  for (const [pattern, build] of rules) {
    const match = value.match(pattern);
    if (match) return build(...match.slice(1));
  }
  return "";
}

function translateDateWords(value: string) {
  let next = westernDigits(value);
  for (const [ar, en] of Object.entries(MONTHS)) next = next.replaceAll(ar, en);
  return next;
}

function translateText(value: string) {
  const leading = value.match(/^\s*/)?.[0] ?? "";
  const trailing = value.match(/\s*$/)?.[0] ?? "";
  const core = value.trim();
  if (!core) return value;
  const exact = EN[core];
  if (exact) return `${leading}${exact}${trailing}`;
  const dynamic = dynamicEnglish(core);
  if (dynamic) return `${leading}${dynamic}${trailing}`;
  const dateOnly = translateDateWords(core);
  if (dateOnly !== core && !/[\u0600-\u06ff]/.test(dateOnly)) return `${leading}${dateOnly}${trailing}`;
  return value;
}

function shouldSkipText(node: Text) {
  const parent = node.parentElement;
  if (!parent) return true;
  return ["SCRIPT", "STYLE", "CODE", "PRE", "NOSCRIPT"].includes(parent.tagName) || Boolean(parent.closest("[data-wealth-preferences]"));
}

function applyLanguage(root: ParentNode, language: WealthLanguage) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node: Node | null = walker.nextNode();
  while (node) {
    const text = node as Text;
    if (!shouldSkipText(text)) {
      const current = text.nodeValue ?? "";
      if (language === "en") {
        const lastTranslation = translated.get(text);
        if (!originals.has(text) || (lastTranslation !== undefined && current !== lastTranslation)) originals.set(text, current);
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

  root.querySelectorAll?.<HTMLElement>("[placeholder], [title], [aria-label]").forEach(element => {
    if (element.closest("[data-wealth-preferences]")) return;
    const saved = attributeOriginals.get(element) ?? new Map<string, string>();
    for (const attr of ["placeholder", "title", "aria-label"]) {
      const current = element.getAttribute(attr);
      if (current === null) continue;
      if (!saved.has(attr)) saved.set(attr, current);
      const original = saved.get(attr) ?? current;
      element.setAttribute(attr, language === "en" ? translateText(original) : original);
    }
    attributeOriginals.set(element, saved);
  });
}

function setFavicon(theme: WealthTheme) {
  let icon = document.querySelector<HTMLLinkElement>('link[rel="icon"], link[rel="shortcut icon"]');
  if (!icon) {
    icon = document.createElement("link");
    icon.rel = "icon";
    document.head.appendChild(icon);
  }
  icon.href = theme === "light" ? "/tharwa-logo-dark.svg" : "/tharwa-logo-light.svg";
}

function applyBrandMarks(theme: WealthTheme) {
  document.querySelectorAll<HTMLImageElement>(".wealth-brand-mark").forEach(mark => {
    mark.src = theme === "light" ? "/tharwa-logo-dark.svg" : "/tharwa-logo-light.svg";
  });
}

export default function WealthPreferences() {
  const [language, setLanguage] = useState<WealthLanguage>("ar");
  const [theme, setTheme] = useState<WealthTheme>("dark");
  const languageRef = useRef<WealthLanguage>("ar");
  const titleOriginal = useRef<string | null>(null);

  useEffect(() => {
    const storedLanguage = localStorage.getItem(LANGUAGE_KEY) === "en" ? "en" : "ar";
    const storedTheme = localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark";
    setLanguage(storedLanguage);
    setTheme(storedTheme);
  }, []);

  useEffect(() => {
    languageRef.current = language;
    document.documentElement.dataset.wealthLang = language;
    document.documentElement.lang = language;
    const wealthRoot = document.querySelector<HTMLElement>(".wealth-tahoma");
    if (wealthRoot) {
      wealthRoot.dir = language === "en" ? "ltr" : "rtl";
      applyLanguage(wealthRoot, language);
    }
    if (titleOriginal.current === null) titleOriginal.current = document.title;
    document.title = language === "en" ? translateText(titleOriginal.current) : titleOriginal.current;
    localStorage.setItem(LANGUAGE_KEY, language);
    window.dispatchEvent(new CustomEvent("wealth:language-change", { detail: { language } }));
  }, [language]);

  useEffect(() => {
    document.documentElement.dataset.wealthTheme = theme;
    localStorage.setItem(THEME_KEY, theme);
    setFavicon(theme);
    applyBrandMarks(theme);
    window.dispatchEvent(new CustomEvent("wealth:theme-change", { detail: { theme } }));
  }, [theme]);

  useEffect(() => {
    let queued = false;
    const observer = new MutationObserver(() => {
      if (queued) return;
      queued = true;
      queueMicrotask(() => {
        queued = false;
        const root = document.querySelector<HTMLElement>(".wealth-tahoma");
        if (root) applyLanguage(root, languageRef.current);
      });
    });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true });
    return () => observer.disconnect();
  }, []);

  const copy = useMemo(() => language === "en" ? {
    language: "Language", theme: "Theme", arabic: "العربية", english: "English", dark: "Dark", light: "Light"
  } : {
    language: "اللغة", theme: "الثيم", arabic: "العربية", english: "English", dark: "غامق", light: "فاتح"
  }, [language]);

  return (
    <div className="wealth-preferences" data-wealth-preferences="true" dir={language === "en" ? "ltr" : "rtl"}>
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
    </div>
  );
}
