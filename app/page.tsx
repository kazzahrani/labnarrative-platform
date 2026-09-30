"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Lang = "en" | "ar";
type Theme = "dark" | "light";

const copy = {
  en: {
    navHow: "How it works", navWho: "Who it's for", navPricing: "Pricing", login: "Open app",
    eyebrow: "AI COMMERCIAL ASSISTANT · SAUDI-FIRST",
    title1: "A quotation shouldn't take", title2: "twenty minutes.",
    lead: "Send THRWA a WhatsApp text or voice note. It turns the messy details into a professional quotation, calculates VAT, saves it, and reminds you to follow up.",
    cta: "Try the MVP", secondary: "See the workflow",
    input: "Voice note or message", bubble: "Make a quote for Khaled: install 4 ACs at 450 each, 20m copper at 75, transport 200, VAT 15%.",
    ready: "Quotation ready", amount: "SAR 4,025", approve: "Approve & send",
    painTitle: "Built for businesses that quote custom work every day.",
    painCopy: "HVAC, maintenance, electrical, plumbing, fit-out, signage, aluminium, glass, kitchens and building-material suppliers already run much of their sales process in WhatsApp.",
    cards: [
      ["01", "Send it naturally", "Text it, dictate it, or later forward a customer RFQ. No forms for field staff."],
      ["02", "THRWA structures it", "Customer, quantities, unit prices, discount and VAT become editable line items."],
      ["03", "Approve the quotation", "Your company branding, totals and terms are ready for PDF and WhatsApp."],
      ["04", "Don't lose the sale", "Pending quotations stay visible so follow-up doesn't disappear inside chat history."]
    ],
    pricingKicker: "MVP PRICING HYPOTHESIS", pricingTitle: "Cheap enough to try. Valuable enough to keep.",
    plans: [["Starter", "SAR 99", "20 quotations / month"], ["Pro", "SAR 299", "100 quotations + follow-ups"], ["Business", "SAR 599", "Team workflow + catalogue + approvals"]],
    final: "Your next quotation can start with a voice note.", finalCta: "Open THRWA MVP"
  },
  ar: {
    navHow: "كيف يعمل", navWho: "لمن؟", navPricing: "الأسعار", login: "فتح المنصة",
    eyebrow: "مساعد تجاري بالذكاء الاصطناعي · مصمم للسعودية",
    title1: "عرض السعر ما يحتاج", title2: "عشرين دقيقة.",
    lead: "أرسل لثروة رسالة واتساب أو ملاحظة صوتية. يحول التفاصيل غير المرتبة إلى عرض سعر احترافي، يحسب الضريبة، يحفظه، ويذكرك بالمتابعة.",
    cta: "جرّب النسخة الأولية", secondary: "شاهد طريقة العمل",
    input: "رسالة أو ملاحظة صوتية", bubble: "سو عرض لخالد: تركيب ٤ مكيفات ٤٥٠ للحبة، ٢٠ متر نحاس ٧٥، نقل ٢٠٠، الضريبة ١٥٪.",
    ready: "عرض السعر جاهز", amount: "٤٬٠٢٥ ر.س", approve: "اعتماد وإرسال",
    painTitle: "للشركات التي تسعّر أعمالاً مخصصة كل يوم.",
    painCopy: "التكييف والصيانة والكهرباء والسباكة والتشطيبات واللوحات والألمنيوم والزجاج والمطابخ ومورّدو مواد البناء يديرون جزءاً كبيراً من البيع أصلاً عبر واتساب.",
    cards: [
      ["٠١", "أرسلها بطريقتك", "اكتب أو سجّل صوتياً، ولاحقاً حوّل طلب العميل مباشرة. بدون نماذج معقدة للفنيين."],
      ["٠٢", "ثروة يرتبها", "العميل والكميات والأسعار والخصم والضريبة تتحول إلى بنود قابلة للتعديل."],
      ["٠٣", "اعتمد عرض السعر", "هوية شركتك والإجمالي والشروط جاهزة للطباعة أو الإرسال عبر واتساب."],
      ["٠٤", "لا تضيع الصفقة", "العروض التي لم يُرد عليها تبقى أمامك حتى لا تختفي المتابعة داخل المحادثات."]
    ],
    pricingKicker: "فرضية تسعير النسخة الأولية", pricingTitle: "سهل للتجربة. مفيد بما يكفي للاستمرار.",
    plans: [["البداية", "٩٩ ر.س", "٢٠ عرض سعر شهرياً"], ["احترافي", "٢٩٩ ر.س", "١٠٠ عرض + متابعة"], ["الأعمال", "٥٩٩ ر.س", "فريق + قائمة أسعار + موافقات"]],
    final: "عرض السعر القادم يمكن أن يبدأ بملاحظة صوتية.", finalCta: "فتح ثروة"
  }
} as const;

function Brand({ lang }: { lang: Lang }) {
  return <span className="brand"><img className="brandLogo" src="/thrwa-logo.svg" alt="" /><strong>{lang === "ar" ? "ثروة" : "THRWA"}</strong></span>;
}

export default function Home() {
  const [lang, setLang] = useState<Lang>("ar");
  const [theme, setThemeState] = useState<Theme>("dark");
  useEffect(() => {
    const savedLang = localStorage.getItem("thrwa-lang") as Lang | null;
    const resolvedLang: Lang = savedLang === "en" || savedLang === "ar" ? savedLang : "ar";
    const savedTheme = localStorage.getItem("thrwa-theme") as Theme | null;
    const resolvedTheme: Theme = savedTheme === "light" ? "light" : "dark";
    setLang(resolvedLang);
    setThemeState(resolvedTheme);
    document.documentElement.lang = resolvedLang;
    document.documentElement.dir = resolvedLang === "ar" ? "rtl" : "ltr";
    document.documentElement.dataset.theme = resolvedTheme;
  }, []);
  const setLanguage = (next: Lang) => { setLang(next); localStorage.setItem("thrwa-lang", next); document.documentElement.lang = next; document.documentElement.dir = next === "ar" ? "rtl" : "ltr"; };
  const setTheme = (next: Theme) => { setThemeState(next); localStorage.setItem("thrwa-theme", next); document.documentElement.dataset.theme = next; };
  const t = copy[lang];

  return <main className="marketing" dir={lang === "ar" ? "rtl" : "ltr"} lang={lang}>
    <header className="topbar shell">
      <Link href="/" aria-label="THRWA home"><Brand lang={lang} /></Link>
      <nav><a href="#workflow">{t.navHow}</a><a href="#who">{t.navWho}</a><a href="#pricing">{t.navPricing}</a></nav>
      <div className="topActions"><button className="themeToggle" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label={theme === "dark" ? "Light mode" : "Dark mode"}>{theme === "dark" ? "☀" : "☾"}</button><div className="langSwitch"><button className={lang === "ar" ? "active" : ""} onClick={() => setLanguage("ar")}>العربية</button><button className={lang === "en" ? "active" : ""} onClick={() => setLanguage("en")}>English</button></div><Link className="button ghost" href="/app">{t.login}</Link></div>
    </header>

    <section className="hero shell">
      <div className="heroCopy"><p className="eyebrow">{t.eyebrow}</p><h1>{t.title1}<br/><em>{t.title2}</em></h1><p className="lead">{t.lead}</p><div className="heroActions"><Link className="button primary" href="/app">{t.cta} →</Link><a className="button secondary" href="#workflow">{t.secondary}</a></div></div>
      <div className="heroDemo">
        <div className="chatWindow"><div className="chatTop"><Brand lang={lang} /><span>{t.input}</span></div><div className="voiceCard"><span className="mic">●</span><p>{t.bubble}</p></div><div className="quoteMini"><span>{t.ready}</span><strong>{t.amount}</strong><div className="miniLines"><i/><i/><i/></div><button>{t.approve}</button></div></div>
      </div>
    </section>

    <section className="customerStrip shell" id="who"><span>HVAC</span><span>MAINTENANCE</span><span>FIT-OUT</span><span>SIGNAGE</span><span>BUILDING MATERIALS</span></section>

    <section className="section shell" id="workflow"><div className="sectionHead"><p className="eyebrow">WORKFLOW</p><h2>{t.painTitle}</h2><p>{t.painCopy}</p></div><div className="workflowGrid">{t.cards.map(([n,title,body]) => <article key={n}><span>{n}</span><h3>{title}</h3><p>{body}</p></article>)}</div></section>

    <section className="section shell" id="pricing"><div className="sectionHead"><p className="eyebrow">{t.pricingKicker}</p><h2>{t.pricingTitle}</h2></div><div className="pricingGrid">{t.plans.map(([name,price,desc], index) => <article className={index === 1 ? "featured" : ""} key={name}><small>{name}</small><strong>{price}</strong><p>{desc}</p><Link href="/app">{t.cta} →</Link></article>)}</div></section>

    <section className="finalCta shell"><h2>{t.final}</h2><Link className="button primary" href="/app">{t.finalCta} →</Link></section>
    <footer className="footer shell"><Brand lang={lang} /><span>thrwa.tech</span><small>© 2026 THRWA</small></footer>
  </main>;
}
