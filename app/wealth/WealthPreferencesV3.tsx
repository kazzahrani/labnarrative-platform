"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type WealthLanguage = "ar" | "en";
type WealthTheme = "dark" | "light";

const LANGUAGE_KEY = "thrwa:language";
const LEGACY_LANGUAGE_KEY = "tharwa:language";
const THEME_KEY = "thrwa:theme";
const LEGACY_THEME_KEY = "tharwa:theme";
const HAS_ARABIC = /[\u0600-\u06ff]/;

const PHRASES: Array<[string,string]> = [
  ["القيم معروضة بالعملة الرئيسية المختارة. المصدر الحالي للتاريخ والتوزيعات: Yahoo Finance كـ fallback بحثي متأخر.","Values are shown in the selected base currency. Historical prices and distributions currently use Yahoo Finance as a delayed research fallback."],
  ["كل السلاسل تبدأ من 0٪، ثم تعرض نسبة التغير منذ بداية الفترة.","All series start at 0%, then show the percentage change from the beginning of the selected period."],
  ["كل السلاسل تبدأ من 0%، ثم تعرض نسبة التغير منذ بداية الفترة.","All series start at 0%, then show the percentage change from the beginning of the selected period."],
  ["لا تصدر حكمًا نهائيًا عليها الآن؛ الأصول الرقمية محل اختلاف في المعالجة الشرعية.","No final ruling is issued at this stage; digital assets are subject to differing Shariah views."],
  ["مصنف متوافق مبدئيًا وفق طبيعة الأصل والبيانات المتاحة؛ يبقى الاعتماد النهائي لمرجع شرعي مؤهل.","Preliminarily classified as compliant based on the asset and available data; final reliance remains with a qualified Shariah authority."],
  ["صندوق مؤشري عام غير مفلتر شرعيًا؛ قد يضم قطاعات وشركات غير متوافقة.","A broad index fund without Shariah screening may include non-compliant sectors and companies."],
  ["التصنيف الحالي مبدئي ولا يمثل اعتمادًا شرعيًا رسميًا.","The current classification is preliminary and does not represent official Shariah approval."],
  ["لا توجد بيانات كافية لإصدار فحص مبدئي موثوق لهذا الأصل.","There is not enough data for a reliable preliminary screening of this asset."],
  ["التصنيف الآلي يساعد على اكتشاف ما يحتاج مراجعة.","Automated screening helps identify what needs review."],
  ["الأسهم تحتاج بيانات مالية محدثة وفحصًا وفق معيار شرعي مختار.","Stocks require current financial data and screening against the selected Shariah standard."],
  ["استبعاد أو تنبيه المنتجات والأنشطة الواضحة غير المفلترة شرعيًا.","Exclude or flag clearly non-screened products and activities."],
  ["يمكن تثبيت قرار هيئة أو مزود شرعي بدل التقييم الآلي.","A decision from a Shariah board or provider can override the automated assessment."],
  ["لا نحسب مبلغ تنقية قبل توفر نسبة موثوقة لكل أصل.","Purification is not calculated until a reliable rate is available for each asset."],
  ["القيم القديمة في صافي الثروة هي آخر قيمة معروفة وليست سعرًا حاليًا.","Stale values in net worth are the last known values, not current prices."],
  ["القيم غير المسعّرة يوميًا تبقى على آخر قيمة معروفة.","Assets without daily pricing remain at their last known value."],
  ["بين السعودية والعالم والكريبتو، كيف توزعت الثروة؟","How is my wealth split between Saudi, global and crypto assets?"],
  ["الرسم أعلاه يعتمد على تاريخ السعر الفعلي للرمز، وليس على تقدير بين التكلفة والسعر الحالي.","The chart above uses the symbol's actual price history rather than an estimate between cost and current price."],
  ["أصل ضمن المحفظة التجريبية — لا يؤثر على بياناتك الحقيقية.","This is a paper-portfolio asset and does not affect your real data."],
  ["لا يوجد رمز سوقي لهذا الأصل، لذلك لا يتوفر تاريخ سعري تلقائي.","This asset has no market symbol, so automatic price history is unavailable."],
  ["تعديل الأصول الحالية أو إضافة أصل جديد.","Edit current assets or add a new asset."],
  ["عدّل بيانات الاختبار دون أي تأثير على المحفظة الحقيقية.","Edit paper data without affecting the real portfolio."],
  ["هذه الحسابات تجريبية ومفصولة بالكامل عن حساباتك الحقيقية.","These paper accounts are fully separated from your real accounts."],
  ["إخفاء الحساب لا يحذف أصوله أو تاريخه.","Hiding an account does not delete its assets or history."],
  ["لا توجد توزيعات مسجلة في الفترة.","No distributions were recorded in this period."],
  ["استعمل التحليلات على بياناتك الحقيقية فقط","Use analytics on your real portfolio data only"],
  ["رابح وخاسر: ما أكثر الأصول؟","Which assets are the biggest winners and losers?"],
  ["ما أكبر تركّز في المحفظة؟","What is the largest concentration in my portfolio?"],
  ["فحص مبدئي، وليس فتوى.","Preliminary screening, not a fatwa."],
  ["جاري بناء الفحص الشرعي المبدئي…","Building preliminary Shariah screening…"],
  ["جاري بناء الفحص الشرعي المبدئي...","Building preliminary Shariah screening..."],
  ["جاري جلب الأسعار التاريخية…","Loading historical prices…"],
  ["جاري جلب الأسعار التاريخية...","Loading historical prices..."],
  ["جاري تحميل الأسعار الفعلية…","Loading market prices…"],
  ["جاري تحليل التوزيعات الفعلية…","Analyzing actual distributions…"],
  ["جاري تحميل ثروتك…","Loading your wealth…"],
  ["جاري تحميل الحسابات…","Loading accounts…"],
  ["جاري تحميل الأصول…","Loading assets…"],
  ["جاري بناء التحليلات…","Building analytics…"],
  ["تعذر تحميل التحليلات.","Could not load analytics."],
  ["تعذر بناء الأداء التاريخي للمحفظة.","Could not build historical portfolio performance."],
  ["تعذر بناء الأداء التاريخي.","Could not build historical performance."],
  ["تعذر تحميل الفحص.","Could not load screening."],
  ["تعذر تحميل الحسابات.","Could not load accounts."],
  ["تعذر تحميل الأصول.","Could not load assets."],
  ["لا توجد بيانات تاريخية كافية لهذه الفترة.","Not enough historical data for this period."],
  ["لا توجد نقاط سعرية كافية لهذا الأصل.","There are not enough price points for this asset."],
  ["تعذر تحميل التاريخ السعري","Could not load price history"],
  ["لا توجد تكلفة كافية لحساب الربحية.","There is not enough cost data to calculate performance."],
  ["التوزيعات الشهرية — آخر 12 شهرًا","Monthly distributions — last 12 months"],
  ["دخل آخر 12 شهرًا","Income over the last 12 months"],
  ["توزيعات تاريخية فعلية","Actual historical distributions"],
  ["الدخل السنوي المرجعي","Reference annual income"],
  ["Run-rate مبني على آخر 12 شهرًا","Run-rate based on the last 12 months"],
  ["أصول دفعت توزيعات","Assets paying distributions"],
  ["ضمن الأصول المسجلة","Among recorded assets"],
  ["أعلى مصادر الدخل","Top income sources"],
  ["الدخل حسب الحساب","Income by account"],
  ["آخر التوزيعات","Latest distributions"],
  ["آخر توزيع","Latest distribution"],
  ["التدفق النقدي","Cash flow"],
  ["التاريخ السعري الحقيقي","Historical market price"],
  ["بيانات سوق تاريخية","Historical market data"],
  ["سعر الوحدة الحالي","Current unit price"],
  ["متوسط تكلفة الوحدة","Average unit cost"],
  ["المبلغ المستثمر","Amount invested"],
  ["كل البيانات المسجلة حاليًا","All currently recorded data"],
  ["نسبة الأصل من المحفظة","Asset share of portfolio"],
  ["مبنية فقط على البيانات المتاحة","Based only on available data"],
  ["الوزن في المحفظة","Portfolio weight"],
  ["الربحية الحالية","Current performance"],
  ["تفاصيل الأصول","Asset details"],
  ["الفحص لكل الأصول","Screening by asset"],
  ["توزيع الحالة الشرعية","Shariah status allocation"],
  ["المنهجية الحالية","Current methodology"],
  ["كيف يتم الفحص؟","How is screening performed?"],
  ["طبيعة الأصل والنشاط","Asset and business activity"],
  ["النسب المالية","Financial ratios"],
  ["الدخل غير المباح والتنقية","Non-permissible income & purification"],
  ["مراجعة بشرية","Human review"],
  ["تنقية محسوبة","Calculated purification"],
  ["حسب المعدلات المسجلة","Based on recorded rates"],
  ["تحتاج بيانات دخل غير متوافق","Requires non-compliant income data"],
  ["غير متوافق مبدئيًا","Preliminarily non-compliant"],
  ["متوافق مبدئيًا","Preliminarily compliant"],
  ["يحتاج مراجعة","Needs review"],
  ["غير متوافق","Non-compliant"],
  ["غير مصنف","Unclassified"],
  ["غير مصنف بعد.","Not classified yet."],
  ["متوافق","Compliant"],
  ["سبب التصنيف","Classification reason"],
  ["التوزيع حسب المصدر","Allocation by source"],
  ["مصادر أصولك الحالية","Your current asset sources"],
  ["الحسابات والمحافظ","Accounts & portfolios"],
  ["حالة المراكز","Position status"],
  ["رابح مقابل خاسر","Winners vs losers"],
  ["مراكز رابحة","Winning positions"],
  ["مراكز خاسرة","Losing positions"],
  ["التكلفة غير مكتملة","Cost basis incomplete"],
  ["أين توجد الثروة؟","Where is your wealth?"],
  ["توزيع الأصول","Asset allocation"],
  ["كل الأصول","All assets"],
  ["الأصول المسجلة حاليًا","Currently recorded assets"],
  ["كل الأنواع","All types"],
  ["كل الحسابات","All accounts"],
  ["كل الأداء","All performance"],
  ["حسب التكلفة","By cost basis"],
  ["بدون تكلفة","No cost basis"],
  ["القيمة الإجمالية","Total value"],
  ["الربح / الخسارة","Profit / Loss"],
  ["الربح/الخسارة","Profit / Loss"],
  ["عدد الأصول","Number of assets"],
  ["السيولة المسجّلة","Recorded liquidity"],
  ["صافي الثروة","Net worth"],
  ["آخر Snapshot","Latest snapshot"],
  ["المحفظة الحقيقية","Real portfolio"],
  ["محفظتي الحقيقية","My real portfolio"],
  ["المحفظة التجريبية","Paper portfolio"],
  ["محفظة تجريبية","Paper portfolio"],
  ["بيئة الاختبار","Test environment"],
  ["إدارة الثروة","Wealth management"],
  ["إدارة الأصول","Manage assets"],
  ["إدارة المحفظة","Portfolio management"],
  ["إضافة أصل","Add asset"],
  ["إضافة حساب","Add account"],
  ["الدخل والتوزيعات","Income & distributions"],
  ["الالتزام الشرعي","Shariah"],
  ["اسأل ثروتي","Ask Thrwa"],
  ["اسأل عن ثروتك","Ask about your wealth"],
  ["نظرة عامة","Overview"],
  ["التحليلات","Analytics"],
  ["الحسابات","Accounts"],
  ["الأصول","Assets"],
  ["الدخل","Income"],
  ["لوحة الثروة السعودية","Saudi Wealth Dashboard"],
  ["الجغرافيا","Geography"],
  ["السعودية مقابل العالمي والكريبتو","Saudi vs global & crypto"],
  ["القطاعات","Sectors"],
  ["التوزيع القطاعي","Sector allocation"],
  ["العملات","Currencies"],
  ["التعرض للعملات","Currency exposure"],
  ["الفترة المحددة","Selected period"],
  ["أفضل وأسوأ الأصول","Best & worst assets"],
  ["الأداء المقارن","Comparative performance"],
  ["المحفظة مقابل السوق","Portfolio vs market"],
  ["أداء الفترة","Period performance"],
  ["أقصى هبوط","Max drawdown"],
  ["التقلب السنوي","Annualized volatility"],
  ["أكبر أصل","Largest asset"],
  ["أكبر 3 أصول","Top 3 assets"],
  ["مؤشر التركّز","Concentration index"],
  ["تقريب من السلسلة اليومية","Estimate from daily series"],
  ["أكبر المراكز","Largest positions"],
  ["التعرض للعملات","Currency exposure"],
  ["السعودية / محلي","Saudi / Local"],
  ["سعودي / محلي","Saudi / Local"],
  ["ريال سعودي","Saudi Riyal"],
  ["دولار أمريكي","US Dollar"],
  ["أرامكو","Aramco"],
  ["سدكو كابيتال ريت","SEDCO Capital REIT"],
  ["جدوى ريت","Jadwa REIT"],
  ["محفظة عوائد","Awaed portfolio"],
  ["الأسهم السعودية","Saudi stocks"],
  ["الأسهم العالمية","Global stocks"],
  ["الريت","REITs"],
  ["الصناديق","Funds"],
  ["الصكوك","Sukuk"],
  ["المرابحات","Murabaha"],
  ["النقد","Cash"],
  ["الأصول الرقمية","Digital assets"],
  ["العقار","Real estate"],
  ["الاستثمارات الخاصة","Private investments"],
  ["أخرى","Other"],
  ["الطاقة","Energy"],
  ["القطاع المالي","Financials"],
  ["المرافق","Utilities"],
  ["العقار والريت","Real estate & REITs"],
  ["التقنية","Technology"],
  ["متنوع عالمي","Global diversified"],
  ["صندوق متنوع","Diversified fund"],
  ["نقد وأدوات قصيرة","Cash & short-term instruments"],
  ["عالمي","Global"],
  ["كريبتو","Crypto"],
  ["غير مُسعّر","Unpriced"],
  ["غير محققة","Unrealized"],
  ["حديث","Fresh"],
  ["متأخر","Delayed"],
  ["قديم","Stale"],
  ["غير متاح","Unavailable"],
  ["سلامة الأسعار","Pricing integrity"],
  ["بحث","Search"],
  ["الأصل","Asset"],
  ["الحساب","Account"],
  ["الكمية","Quantity"],
  ["سعر الوحدة","Unit price"],
  ["التكلفة","Cost"],
  ["القيمة","Value"],
  ["الحالة","Status"],
  ["التاريخ","Date"],
  ["السجل","History"],
  ["للوحدة","Per unit"],
  ["الإجمالي","Total"],
  ["الكل","All"],
  ["الأفضل","Best"],
  ["الأسوأ","Worst"],
  ["التركيز","Concentration"],
  ["المصدر","Source"],
  ["نطاق الفترة","Period range"],
  ["آخر سعر","Latest price"],
  ["آخر إدخال","Last entry"],
  ["آخر إدخال مسجل","Last recorded entry"],
  ["وحدة","Unit"],
  ["من التكلفة والكمية","From cost and quantity"],
  ["مضاف يدويًا","Added manually"],
  ["يدوي","Manual"],
  ["متصل","Connected"],
  ["تجريبي","Paper"],
  ["ملخص الأصل","Asset summary"],
  ["تاريخ القيمة","Valuation date"],
  ["قراءة سريعة","Quick view"],
  ["لا توجد بيانات.","No data."],
  ["لا توجد بيانات","No data"],
  ["لا توجد بيانات بعد.","No data yet."],
  ["لا يوجد سجل بعد","No history yet"],
  ["جاري الحفظ…","Saving…"],
  ["جارٍ الحفظ…","Saving…"],
  ["حفظ","Save"],
  ["إلغاء","Cancel"],
  ["تم","Done"],
  ["تعديل","Edit"],
  ["إدارة","Manage"],
  ["ثروة","Thrwa"]
];

const WORDS: Record<string,string> = {
  "الحقيقية":"real","الحقيقي":"real","التجريبية":"paper","التجريبي":"paper","المبدئي":"preliminary","المبدئية":"preliminary",
  "إدارة":"Manage","الأصول":"assets","أصول":"assets","أصل":"asset","الحسابات":"accounts","حسابات":"accounts","حساب":"account",
  "الدخل":"income","التوزيعات":"distributions","توزيع":"allocation","حسب":"by","المصدر":"source","الحالة":"status","المراكز":"positions",
  "عدد":"number of","ضمن":"among","المسجلة":"recorded","حاليًا":"currently","حاليا":"currently","القيمة":"value","الإجمالية":"total",
  "التكلفة":"cost","سبب":"reason","التصنيف":"classification","التاريخ":"date","السجل":"history","آخر":"latest","الكل":"all","النوع":"type",
  "الأداء":"performance","الربح":"profit","الخسارة":"loss","الآلي":"automated","يساعد":"helps","اكتشاف":"identify","يحتاج":"needs","مراجعة":"review",
  "وليس":"not","فتوى":"fatwa","الحالي":"current","مبدئي":"preliminary","يمثل":"represent","اعتمادًا":"approval","شرعيًا":"Shariah",
  "رسميًا":"official","القيم":"values","غير":"non","المسعرة":"priced","المسعّرة":"priced","يوميًا":"daily","تبقى":"remain","على":"at",
  "قيمة":"value","معروفة":"known","بيانات":"data","كافية":"enough","لإصدار":"to issue","موثوق":"reliable","لهذا":"for this","الرقمية":"digital",
  "محل":"subject to","اختلاف":"differing views","المعالجة":"treatment","نهائيًا":"final","الآن":"now","السعودية":"Saudi Arabia","العالم":"global markets",
  "العالمي":"global","الكريبتو":"crypto","الثروة":"wealth","المحفظة":"portfolio","أكبر":"largest","تركّز":"concentration","كيف":"how",
  "توزعت":"allocated","رابح":"winner","وخاسر":"and loser","أكثر":"biggest","الشهرية":"monthly","شهرًا":"months","المختارة":"selected",
  "الرئيسية":"base","العملة":"currency","متوافق":"compliant","مصنف":"classified","الشرعي":"Shariah","الشرعية":"Shariah","الالتزام":"Shariah",
  "جاري":"Loading","جارٍ":"Loading","بناء":"building","الفحص":"screening","كل":"all","مقابل":"vs","السوق":"market","القطاعي":"sector",
  "القطاعات":"sectors","العملات":"currencies","التعرض":"exposure","الفترة":"period","أفضل":"best","وأسوأ":"and worst","الأفضل":"best","الأسوأ":"worst",
  "التركيز":"concentration","تقريب":"estimate","من":"from","السلسلة":"series","اليومية":"daily","المحلية":"local","محلي":"local","سعودي":"Saudi",
  "أرامكو":"Aramco","عوائد":"Awaed","ريت":"REIT","اللغة":"Language","الثيم":"Theme","العربية":"Arabic","غامق":"Dark","فاتح":"Light"
};

const MONTHS: Record<string,string> = {"يناير":"January","فبراير":"February","مارس":"March","أبريل":"April","مايو":"May","يونيو":"June","يوليو":"July","أغسطس":"August","سبتمبر":"September","أكتوبر":"October","نوفمبر":"November","ديسمبر":"December"};

const originals = new WeakMap<Text,string>();
const translated = new WeakMap<Text,string>();
const attributeOriginals = new WeakMap<Element,Map<string,string>>();
const orderedPhrases = [...PHRASES].sort((a,b) => b[0].length - a[0].length);

function westernize(value:string){
  return value.replace(/[٠-٩]/g,d=>String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[۰-۹]/g,d=>String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/٫/g,".").replace(/٬/g,",").replace(/٪/g,"%").replace(/،/g,",").replace(/ر\.س/g,"SAR").replace(/[\u061c\u200e\u200f]/g,"").replace(/Tharwa/g,"Thrwa");
}

function translateText(value:string){
  const leading=value.match(/^\s*/)?.[0]??"";
  const trailing=value.match(/\s*$/)?.[0]??"";
  let core=westernize(value.trim());
  if(!core)return value;

  let m=core.match(/^(\d+) أصل$/); if(m)return `${leading}${m[1]} assets${trailing}`;
  m=core.match(/^(\d+) حساب(?:ات)? · (\d+) أصل$/); if(m)return `${leading}${m[1]} accounts · ${m[2]} assets${trailing}`;
  m=core.match(/^عبر (\d+) حسابات$/); if(m)return `${leading}Across ${m[1]} accounts${trailing}`;
  m=core.match(/^(\d+) حدث خلال 5 سنوات$/); if(m)return `${leading}${m[1]} events over 5 years${trailing}`;
  m=core.match(/^آخر تحديث (.+)$/); if(m)return `${leading}Last updated ${westernize(m[1])}${trailing}`;
  m=core.match(/^متوسط التكلفة (.+)$/); if(m)return `${leading}Average cost ${westernize(m[1])}${trailing}`;

  for(const [ar,en] of orderedPhrases) core=core.replaceAll(ar,en);
  for(const [ar,en] of Object.entries(MONTHS)) core=core.replaceAll(ar,en);
  if(HAS_ARABIC.test(core)) core=core.replace(/[\u0600-\u06ff]+/g,token=>WORDS[token]??"");
  core=core.replace(/\s+/g," ").replace(/\s+([,.:;!?])/g,"$1").replace(/\bassets assets\b/gi,"assets").replace(/\baccounts accounts\b/gi,"accounts").replace(/\bShariah Shariah\b/g,"Shariah").trim();
  return `${leading}${core}${trailing}`;
}

function shouldSkip(text:Text){
  const parent=text.parentElement;
  if(!parent)return true;
  return ["SCRIPT","STYLE","CODE","PRE","NOSCRIPT"].includes(parent.tagName)||Boolean(parent.closest("[data-wealth-preferences-v3]"));
}

function applyLanguage(root:ParentNode,language:WealthLanguage){
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
  let node:Node|null=walker.nextNode();
  while(node){
    const text=node as Text;
    if(!shouldSkip(text)){
      const current=text.nodeValue??"";
      if(language==="en"){
        const last=translated.get(text);
        if(!originals.has(text)||(last!==undefined&&current!==last))originals.set(text,current);
        const source=originals.get(text)??current;
        const next=translateText(source);
        if(next!==current)text.nodeValue=next;
        translated.set(text,next);
      }else{
        const original=originals.get(text);
        if(original!==undefined&&current!==original)text.nodeValue=original;
        translated.delete(text);
      }
    }
    node=walker.nextNode();
  }
  root.querySelectorAll<HTMLElement>("[placeholder],[title],[aria-label]").forEach(el=>{
    if(el.closest("[data-wealth-preferences-v3]"))return;
    const saved=attributeOriginals.get(el)??new Map<string,string>();
    for(const attr of ["placeholder","title","aria-label"]){
      const current=el.getAttribute(attr); if(current===null)continue;
      if(!saved.has(attr))saved.set(attr,current);
      const original=saved.get(attr)??current;
      el.setAttribute(attr,language==="en"?translateText(original):original);
    }
    attributeOriginals.set(el,saved);
  });
}

function setFavicon(theme:WealthTheme){
  let icon=document.querySelector<HTMLLinkElement>('link[rel="icon"],link[rel="shortcut icon"]');
  if(!icon){icon=document.createElement("link");icon.rel="icon";document.head.appendChild(icon)}
  icon.href=theme==="light"?"/tharwa-logo-dark.svg":"/tharwa-logo-light.svg";
}
function applyBrandMarks(theme:WealthTheme){document.querySelectorAll<HTMLImageElement>(".wealth-brand-mark").forEach(mark=>{mark.src=theme==="light"?"/tharwa-logo-dark.svg":"/tharwa-logo-light.svg";mark.alt=""})}

export default function WealthPreferencesV3(){
  const[language,setLanguage]=useState<WealthLanguage>("ar");
  const[theme,setTheme]=useState<WealthTheme>("dark");
  const languageRef=useRef<WealthLanguage>("ar");
  const titleOriginal=useRef<string|null>(null);

  useEffect(()=>{
    const storedLanguage=localStorage.getItem(LANGUAGE_KEY)??localStorage.getItem(LEGACY_LANGUAGE_KEY);
    const storedTheme=localStorage.getItem(THEME_KEY)??localStorage.getItem(LEGACY_THEME_KEY);
    setLanguage(storedLanguage==="en"?"en":"ar");
    setTheme(storedTheme==="light"?"light":"dark");
  },[]);

  useEffect(()=>{
    languageRef.current=language;
    document.documentElement.dataset.wealthLang=language;
    document.documentElement.lang=language;
    const root=document.querySelector<HTMLElement>(".wealth-tahoma");
    if(root){root.dir=language==="en"?"ltr":"rtl";applyLanguage(root,language)}
    if(titleOriginal.current===null)titleOriginal.current=document.title;
    document.title=language==="en"?translateText(titleOriginal.current):titleOriginal.current;
    localStorage.setItem(LANGUAGE_KEY,language);localStorage.setItem(LEGACY_LANGUAGE_KEY,language);
    window.dispatchEvent(new CustomEvent("wealth:language-change",{detail:{language}}));
  },[language]);

  useEffect(()=>{
    document.documentElement.dataset.wealthTheme=theme;
    localStorage.setItem(THEME_KEY,theme);localStorage.setItem(LEGACY_THEME_KEY,theme);
    setFavicon(theme);applyBrandMarks(theme);
    window.dispatchEvent(new CustomEvent("wealth:theme-change",{detail:{theme}}));
  },[theme]);

  useEffect(()=>{
    let queued=false;
    const observer=new MutationObserver(()=>{
      if(queued)return;queued=true;
      queueMicrotask(()=>{queued=false;const root=document.querySelector<HTMLElement>(".wealth-tahoma");if(root)applyLanguage(root,languageRef.current)});
    });
    observer.observe(document.body,{subtree:true,childList:true,characterData:true});
    return()=>observer.disconnect();
  },[]);

  const copy=useMemo(()=>language==="en"?{language:"Language",theme:"Theme",arabic:"Arabic",english:"English",dark:"Dark",light:"Light"}:{language:"اللغة",theme:"الثيم",arabic:"العربية",english:"English",dark:"غامق",light:"فاتح"},[language]);

  return <div className="wealth-preferences" data-wealth-preferences-v3="true" dir={language==="en"?"ltr":"rtl"}>
    <div className="wealth-preference-group" aria-label={copy.language}><span className="wealth-preference-label">{copy.language}</span><div className="wealth-segmented"><button type="button" className={language==="ar"?"is-active":""} onClick={()=>setLanguage("ar")}>{copy.arabic}</button><button type="button" className={language==="en"?"is-active":""} onClick={()=>setLanguage("en")}>{copy.english}</button></div></div>
    <div className="wealth-preference-group" aria-label={copy.theme}><span className="wealth-preference-label">{copy.theme}</span><div className="wealth-segmented"><button type="button" className={theme==="dark"?"is-active":""} onClick={()=>setTheme("dark")}><span aria-hidden="true">◐</span>{copy.dark}</button><button type="button" className={theme==="light"?"is-active":""} onClick={()=>setTheme("light")}><span aria-hidden="true">○</span>{copy.light}</button></div></div>
  </div>;
}
