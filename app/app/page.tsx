"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { calculateQuote, demoDraft, QuoteDraft, QuoteItem } from "@/lib/quote";

type Lang = "en" | "ar";
type View = "dashboard" | "quotes" | "catalog" | "settings";

const text = {
  en: {
    nav: { dashboard: "Overview", quotes: "Quotations", catalog: "Products & services", settings: "Settings" },
    kicker: "QUOTATIONS", title: "Turn the message into a quote.", sub: "Paste what the employee would send on WhatsApp. THRWA extracts the draft, then deterministic code calculates the money.",
    placeholder: "Example: Make a quote for Khaled: install 4 ACs at 450 each, 20m copper at 75, transport 200, VAT 15%.",
    load: "Load example", generate: "Create draft", record: "Voice note", inputLabel: "WhatsApp text / voice transcript",
    draft: "Draft quotation", customer: "Customer", qty: "Qty", price: "Unit price", item: "Description", discount: "Discount", vat: "VAT", subtotal: "Subtotal", total: "Total", add: "+ Add item", print: "Print / Save PDF", save: "Save draft", status: "Ready for approval",
    stats: [["Quotes this month","47"],["Value quoted","SAR 128.4K"],["Waiting","21"],["Accepted","18"]],
    recent: "Recent quotations", catalogTitle: "Price catalogue", settingsTitle: "Company settings",
    catalogBody: "The production AI will match everyday wording to these standard services so staff do not need to dictate prices every time.",
    settingsBody: "These fields become the branded header, default VAT and language on every quotation.",
    company: "Company name", defaultLang: "Default quotation language", demoMode: "MVP demo mode — local data only"
  },
  ar: {
    nav: { dashboard: "نظرة عامة", quotes: "عروض الأسعار", catalog: "المنتجات والخدمات", settings: "الإعدادات" },
    kicker: "عروض الأسعار", title: "حوّل الرسالة إلى عرض سعر.", sub: "الصق ما سيرسله الموظف في واتساب. ثروة يستخرج المسودة، ثم يحسب النظام القيم والضريبة بطريقة ثابتة ودقيقة.",
    placeholder: "مثال: سو عرض لخالد: تركيب ٤ مكيفات ٤٥٠ للحبة، ٢٠ متر نحاس ٧٥، نقل ٢٠٠، الضريبة ١٥٪.",
    load: "تحميل مثال", generate: "إنشاء المسودة", record: "ملاحظة صوتية", inputLabel: "نص واتساب / تفريغ الملاحظة الصوتية",
    draft: "مسودة عرض السعر", customer: "العميل", qty: "الكمية", price: "سعر الوحدة", item: "الوصف", discount: "الخصم", vat: "الضريبة", subtotal: "قبل الضريبة", total: "الإجمالي", add: "+ إضافة بند", print: "طباعة / حفظ PDF", save: "حفظ المسودة", status: "جاهز للاعتماد",
    stats: [["عروض هذا الشهر","٤٧"],["قيمة العروض","١٢٨٫٤ ألف ر.س"],["بانتظار الرد","٢١"],["تمت الموافقة","١٨"]],
    recent: "أحدث عروض الأسعار", catalogTitle: "قائمة الأسعار", settingsTitle: "إعدادات الشركة",
    catalogBody: "في النسخة الإنتاجية سيطابق الذكاء الاصطناعي كلام الموظف اليومي مع هذه الخدمات، فلا يحتاج لذكر السعر كل مرة.",
    settingsBody: "تظهر هذه البيانات في ترويسة عرض السعر وتحدد الضريبة واللغة الافتراضية.",
    company: "اسم الشركة", defaultLang: "لغة عرض السعر الافتراضية", demoMode: "نسخة MVP تجريبية — البيانات محلية فقط"
  }
} as const;

const recent = [
  ["Q-1047", "Al Noor Contracting", "SAR 12,640", "Waiting"],
  ["Q-1046", "Abdullah Alotaibi", "SAR 4,025", "Accepted"],
  ["Q-1045", "Rawafid Co.", "SAR 28,920", "Draft"],
  ["Q-1044", "Fahad Alqahtani", "SAR 7,130", "Waiting"]
];

const catalog = [
  ["Split AC installation", "تركيب مكيف سبليت", 450],
  ["AC cleaning", "تنظيف مكيف", 150],
  ["Copper piping / meter", "تمديد نحاس / متر", 75],
  ["Site visit", "زيارة موقع", 200]
];

function Mark() { return <span className="brand"><span className="brandMark"><i/><b/></span><strong>THRWA</strong></span>; }
function money(n: number) { return new Intl.NumberFormat("en-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n); }

export default function AppPage() {
  const [lang, setLang] = useState<Lang>("en");
  const [view, setView] = useState<View>("dashboard");
  const [input, setInput] = useState("");
  const [draft, setDraft] = useState<QuoteDraft>(demoDraft);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const t = text[lang];
  const totals = useMemo(() => calculateQuote(draft), [draft]);

  useEffect(() => { const savedLang = localStorage.getItem("thrwa-lang") as Lang | null; if (savedLang === "ar" || savedLang === "en") setLang(savedLang); }, []);
  const setLanguage = (l: Lang) => { setLang(l); localStorage.setItem("thrwa-lang", l); };
  const generate = async () => {
    if (!input.trim()) return;
    setBusy(true); setSaved(false);
    try {
      const res = await fetch("/api/quote/parse", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ input }) });
      const data = await res.json();
      if (data.draft) setDraft(data.draft);
    } finally { setBusy(false); }
  };
  const patchItem = (id: string, patch: Partial<QuoteItem>) => setDraft(d => ({ ...d, items: d.items.map(i => i.id === id ? { ...i, ...patch } : i) }));
  const addItem = () => setDraft(d => ({ ...d, items: [...d.items, { id: crypto.randomUUID(), description: "New item", descriptionAr: "بند جديد", quantity: 1, unitPrice: 0 }] }));

  return <div className="appShell" dir={lang === "ar" ? "rtl" : "ltr"} lang={lang}>
    <aside className="sidebar">
      <div><Link href="/"><Mark /></Link><nav className="sideNav">{(Object.keys(t.nav) as View[]).map(key => <button key={key} className={view === key ? "active" : ""} onClick={() => setView(key)}><span>{key === "dashboard" ? "◫" : key === "quotes" ? "▤" : key === "catalog" ? "◇" : "⚙"}</span>{t.nav[key]}</button>)}</nav></div>
      <div className="sideBottom"><small>{t.demoMode}</small><Link href="/">← thrwa.tech</Link></div>
    </aside>

    <main className="workspace">
      <header className="workspaceTop"><div className="langSwitch"><button className={lang === "ar" ? "active" : ""} onClick={() => setLanguage("ar")}>العربية</button><button className={lang === "en" ? "active" : ""} onClick={() => setLanguage("en")}>English</button></div><div className="accountChip"><span>KA</span><div><strong>Demo Company</strong><small>Business workspace</small></div></div></header>

      {view === "dashboard" && <>
        <section className="workspaceHead"><p className="eyebrow">{t.kicker}</p><h1>{t.title}</h1><p>{t.sub}</p></section>
        <section className="statGrid">{t.stats.map(([label,value]) => <article key={label}><small>{label}</small><strong>{value}</strong></article>)}</section>
        <section className="composerGrid">
          <article className="panel capturePanel"><div className="panelTop"><div><small>01 · CAPTURE</small><h2>{t.inputLabel}</h2></div><span className="statusDot">● MVP</span></div><textarea value={input} onChange={e => setInput(e.target.value)} placeholder={t.placeholder}/><div className="captureActions"><button className="softButton" onClick={() => setInput(lang === "ar" ? "سو عرض لخالد: تركيب 4 مكيفات 450 للحبة، 20 متر نحاس 75 للمتر، نقل 200، الضريبة 15%" : "Make a quote for Khaled: install 4 ACs at 450 each, 20m copper at 75, transport 200, VAT 15%")}>{t.load}</button><button className="softButton" title="Voice transport is wired in the next integration step">◉ {t.record}</button><button className="primaryButton" disabled={busy || !input.trim()} onClick={generate}>{busy ? "…" : t.generate} →</button></div></article>

          <article className="panel quotePanel"><div className="panelTop"><div><small>02 · REVIEW</small><h2>{t.draft}</h2></div><span className="readyPill">{t.status}</span></div><label className="field"><span>{t.customer}</span><input value={draft.customer} onChange={e => setDraft(d => ({ ...d, customer: e.target.value }))}/></label>
            <div className="lineHeader"><span>{t.item}</span><span>{t.qty}</span><span>{t.price}</span><span>Amount</span></div>
            <div className="lineItems">{draft.items.map(item => <div className="lineItem" key={item.id}><input value={lang === "ar" ? (item.descriptionAr || item.description) : item.description} onChange={e => patchItem(item.id, lang === "ar" ? { descriptionAr: e.target.value } : { description: e.target.value })}/><input type="number" min="0" value={item.quantity} onChange={e => patchItem(item.id, { quantity: Number(e.target.value) })}/><input type="number" min="0" value={item.unitPrice} onChange={e => patchItem(item.id, { unitPrice: Number(e.target.value) })}/><strong>{money(item.quantity * item.unitPrice)}</strong></div>)}</div>
            <button className="textButton" onClick={addItem}>{t.add}</button>
            <div className="quoteFoot"><div className="smallFields"><label><span>{t.discount}</span><input type="number" value={draft.discount} onChange={e => setDraft(d => ({ ...d, discount: Number(e.target.value) }))}/></label><label><span>{t.vat}</span><input type="number" value={draft.vatRate} onChange={e => setDraft(d => ({ ...d, vatRate: Number(e.target.value) }))}/></label></div><div className="totals"><div><span>{t.subtotal}</span><b>SAR {money(totals.subtotal)}</b></div><div><span>{t.vat}</span><b>SAR {money(totals.vat)}</b></div><div className="grand"><span>{t.total}</span><strong>SAR {money(totals.total)}</strong></div></div></div>
            <div className="quoteActions"><button className="softButton" onClick={() => { localStorage.setItem("thrwa-demo-draft", JSON.stringify(draft)); setSaved(true); }}>{saved ? "✓" : t.save}</button><button className="primaryButton" onClick={() => window.print()}>{t.print}</button></div>
          </article>
        </section>
        <section className="panel recentPanel"><div className="panelTop"><div><small>03 · FOLLOW-UP</small><h2>{t.recent}</h2></div><button className="textButton" onClick={() => setView("quotes")}>View all →</button></div><div className="quoteTable">{recent.map(([id,name,amount,status]) => <div className="quoteRow" key={id}><span>{id}</span><strong>{name}</strong><span>{amount}</span><em className={status.toLowerCase()}>{status}</em></div>)}</div></section>
      </>}

      {view === "quotes" && <section className="singlePage"><div className="workspaceHead"><p className="eyebrow">QUOTATIONS</p><h1>{t.nav.quotes}</h1></div><div className="panel recentPanel"><div className="quoteTable">{recent.concat([["Q-1043","Al Manar Services","SAR 3,880","Accepted"]]).map(([id,name,amount,status]) => <div className="quoteRow" key={id}><span>{id}</span><strong>{name}</strong><span>{amount}</span><em className={status.toLowerCase()}>{status}</em></div>)}</div></div></section>}
      {view === "catalog" && <section className="singlePage"><div className="workspaceHead"><p className="eyebrow">CATALOGUE</p><h1>{t.catalogTitle}</h1><p>{t.catalogBody}</p></div><div className="panel catalogPanel">{catalog.map(([en,ar,price]) => <div className="catalogRow" key={String(en)}><div><strong>{lang === "ar" ? ar : en}</strong><small>{lang === "ar" ? en : ar}</small></div><b>SAR {price}</b><button>⋯</button></div>)}<button className="softButton">+ Add service</button></div></section>}
      {view === "settings" && <section className="singlePage"><div className="workspaceHead"><p className="eyebrow">SETTINGS</p><h1>{t.settingsTitle}</h1><p>{t.settingsBody}</p></div><div className="panel settingsPanel"><label className="field"><span>{t.company}</span><input defaultValue="Demo Air Conditioning Co."/></label><label className="field"><span>VAT number</span><input defaultValue="310000000000003"/></label><label className="field"><span>Default VAT</span><input defaultValue="15%"/></label><label className="field"><span>{t.defaultLang}</span><select defaultValue={lang}><option value="ar">العربية</option><option value="en">English</option><option value="bilingual">Arabic + English</option></select></label><button className="primaryButton">Save settings</button></div></section>}
    </main>
  </div>;
}
