"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { calculateQuote, demoDraft, QuoteDraft, QuoteItem } from "@/lib/quote";

type Lang = "en" | "ar";
type Theme = "dark" | "light";
type View = "dashboard" | "quotes" | "catalog" | "settings";
type ServiceStatus = { ai: boolean; voice: boolean; whatsapp: boolean; database: boolean };
type RecentQuote = { quote_number: string; customer_name: string; total: number; status: string; created_at?: string };
type CatalogItem = { id: string; name: string; name_ar?: string; unit?: string; unit_price: number };

const text = {
  en: {
    nav: { dashboard: "Overview", quotes: "Quotations", catalog: "Products & services", settings: "Settings" },
    kicker: "QUOTATIONS", title: "Turn the message into a quote.", sub: "Paste what the employee would send on WhatsApp — or record it. THRWA extracts the draft, then deterministic code calculates the money.",
    placeholder: "Example: Make a quote for Khaled: install 4 ACs at 450 each, 20m copper at 75, transport 200, VAT 15%.",
    load: "Load example", generate: "Create draft", record: "Record voice", stop: "Stop recording", transcribing: "Transcribing…", inputLabel: "WhatsApp text / voice transcript",
    draft: "Draft quotation", customer: "Customer", qty: "Qty", price: "Unit price", item: "Description", discount: "Discount", vat: "VAT", subtotal: "Subtotal", total: "Total", add: "+ Add item", print: "Print / Save PDF", save: "Save draft", saving: "Saving…", saved: "Saved", status: "Ready for approval",
    stats: [["Quotes this month","47"],["Value quoted","SAR 128.4K"],["Waiting","21"],["Accepted","18"]],
    recent: "Recent quotations", catalogTitle: "Price catalogue", settingsTitle: "Company settings",
    catalogBody: "THRWA can match everyday wording to these standard services so staff do not need to dictate prices every time.",
    settingsBody: "These fields become the branded header, default VAT and language on every quotation.",
    company: "Company name", defaultLang: "Default quotation language", demoMode: "MVP integration status"
  },
  ar: {
    nav: { dashboard: "نظرة عامة", quotes: "عروض الأسعار", catalog: "المنتجات والخدمات", settings: "الإعدادات" },
    kicker: "عروض الأسعار", title: "حوّل الرسالة إلى عرض سعر.", sub: "الصق ما سيرسله الموظف في واتساب — أو سجّله صوتياً. ثروة يستخرج المسودة، ثم يحسب النظام القيم والضريبة بطريقة ثابتة ودقيقة.",
    placeholder: "مثال: سو عرض لخالد: تركيب ٤ مكيفات ٤٥٠ للحبة، ٢٠ متر نحاس ٧٥، نقل ٢٠٠، الضريبة ١٥٪.",
    load: "تحميل مثال", generate: "إنشاء المسودة", record: "تسجيل صوت", stop: "إيقاف التسجيل", transcribing: "جاري التفريغ…", inputLabel: "نص واتساب / تفريغ الملاحظة الصوتية",
    draft: "مسودة عرض السعر", customer: "العميل", qty: "الكمية", price: "سعر الوحدة", item: "الوصف", discount: "الخصم", vat: "الضريبة", subtotal: "قبل الضريبة", total: "الإجمالي", add: "+ إضافة بند", print: "طباعة / حفظ PDF", save: "حفظ المسودة", saving: "جاري الحفظ…", saved: "تم الحفظ", status: "جاهز للاعتماد",
    stats: [["عروض هذا الشهر","٤٧"],["قيمة العروض","١٢٨٫٤ ألف ر.س"],["بانتظار الرد","٢١"],["تمت الموافقة","١٨"]],
    recent: "أحدث عروض الأسعار", catalogTitle: "قائمة الأسعار", settingsTitle: "إعدادات الشركة",
    catalogBody: "يستطيع ثروة مطابقة كلام الموظف اليومي مع هذه الخدمات، فلا يحتاج لذكر السعر كل مرة.",
    settingsBody: "تظهر هذه البيانات في ترويسة عرض السعر وتحدد الضريبة واللغة الافتراضية.",
    company: "اسم الشركة", defaultLang: "لغة عرض السعر الافتراضية", demoMode: "حالة ربط مكونات MVP"
  }
} as const;

function Brand({ lang }: { lang: Lang }) {
  return <span className="brand"><img className="brandLogo" src="/thrwa-logo.svg" alt="" /><strong>{lang === "ar" ? "ثروة" : "THRWA"}</strong></span>;
}
function money(n: number) { return new Intl.NumberFormat("en-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n); }

export default function AppPage() {
  const [lang, setLang] = useState<Lang>("ar");
  const [theme, setThemeState] = useState<Theme>("dark");
  const [view, setView] = useState<View>("dashboard");
  const [input, setInput] = useState("");
  const [draft, setDraft] = useState<QuoteDraft>(demoDraft);
  const [busy, setBusy] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [recording, setRecording] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [voiceError, setVoiceError] = useState("");
  const [status, setStatus] = useState<ServiceStatus>({ ai: false, voice: false, whatsapp: false, database: false });
  const [recent, setRecent] = useState<RecentQuote[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const t = text[lang];
  const totals = useMemo(() => calculateQuote(draft), [draft]);

  const refreshData = async () => {
    const [statusRes, quotesRes, catalogRes] = await Promise.all([
      fetch("/api/status", { cache: "no-store" }).then(r => r.json()).catch(() => null),
      fetch("/api/quotes", { cache: "no-store" }).then(r => r.json()).catch(() => null),
      fetch("/api/catalog", { cache: "no-store" }).then(r => r.json()).catch(() => null)
    ]);
    if (statusRes) setStatus(statusRes);
    if (Array.isArray(quotesRes?.quotes)) setRecent(quotesRes.quotes);
    if (Array.isArray(catalogRes?.items)) setCatalog(catalogRes.items);
  };

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
    void refreshData();
  }, []);

  const setLanguage = (l: Lang) => {
    setLang(l);
    localStorage.setItem("thrwa-lang", l);
    document.documentElement.lang = l;
    document.documentElement.dir = l === "ar" ? "rtl" : "ltr";
  };

  const setTheme = (next: Theme) => {
    setThemeState(next);
    localStorage.setItem("thrwa-theme", next);
    document.documentElement.dataset.theme = next;
  };

  const generate = async () => {
    if (!input.trim()) return;
    setBusy(true); setSaved(false);
    try {
      const res = await fetch("/api/quote/parse", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ input }) });
      const data = await res.json();
      if (data.draft) setDraft(data.draft);
    } finally { setBusy(false); }
  };

  const saveDraft = async () => {
    setSaveBusy(true); setSaved(false);
    try {
      const response = await fetch("/api/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft, sourceText: input, sourceType: "text" })
      });
      if (response.ok) {
        setSaved(true);
        await refreshData();
      } else {
        localStorage.setItem("thrwa-demo-draft", JSON.stringify(draft));
        setSaved(true);
      }
    } finally { setSaveBusy(false); }
  };

  const toggleRecording = async () => {
    setVoiceError("");
    if (recording && recorderRef.current) {
      recorderRef.current.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = event => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onstop = async () => {
        setRecording(false);
        stream.getTracks().forEach(track => track.stop());
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        const form = new FormData();
        form.append("file", blob, "thrwa-voice.webm");
        setVoiceBusy(true);
        try {
          const response = await fetch("/api/audio/transcribe", { method: "POST", body: form });
          const data = await response.json();
          if (!response.ok) throw new Error(data?.error || "Transcription failed");
          setInput(data.text || "");
        } catch (error) {
          setVoiceError(error instanceof Error ? error.message : "Transcription failed");
        } finally {
          setVoiceBusy(false);
        }
      };
      recorder.start();
      setRecording(true);
    } catch {
      setVoiceError(lang === "ar" ? "لم نتمكن من الوصول إلى الميكروفون." : "Microphone access was not available.");
    }
  };

  const patchItem = (id: string, patch: Partial<QuoteItem>) => setDraft(d => ({ ...d, items: d.items.map(i => i.id === id ? { ...i, ...patch } : i) }));
  const addItem = () => setDraft(d => ({ ...d, items: [...d.items, { id: crypto.randomUUID(), description: "New item", descriptionAr: "بند جديد", quantity: 1, unitPrice: 0 }] }));

  const statusText = status.database ? (status.ai ? "● LIVE SERVICES" : "● DATABASE READY") : status.ai ? "● AI READY" : "● DEMO MODE";

  return <div className="appShell" dir={lang === "ar" ? "rtl" : "ltr"} lang={lang}>
    <aside className="sidebar">
      <div><Link href="/"><Brand lang={lang} /></Link><nav className="sideNav">{(Object.keys(t.nav) as View[]).map(key => <button key={key} className={view === key ? "active" : ""} onClick={() => setView(key)}><span>{key === "dashboard" ? "◫" : key === "quotes" ? "▤" : key === "catalog" ? "◇" : "⚙"}</span>{t.nav[key]}</button>)}</nav></div>
      <div className="sideBottom"><small>{t.demoMode}</small><div className="serviceMini"><span className={status.ai ? "on" : ""}>AI</span><span className={status.database ? "on" : ""}>DB</span><span className={status.whatsapp ? "on" : ""}>WA</span></div><Link href="/">← thrwa.tech</Link></div>
    </aside>

    <main className="workspace">
      <header className="workspaceTop"><button className="themeToggle" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label={theme === "dark" ? "Light mode" : "Dark mode"}>{theme === "dark" ? "☀" : "☾"}</button><div className="langSwitch"><button className={lang === "ar" ? "active" : ""} onClick={() => setLanguage("ar")}>العربية</button><button className={lang === "en" ? "active" : ""} onClick={() => setLanguage("en")}>English</button></div><div className="accountChip"><span>KA</span><div><strong>Demo Company</strong><small>Business workspace</small></div></div></header>

      {view === "dashboard" && <>
        <section className="workspaceHead"><p className="eyebrow">{t.kicker}</p><h1>{t.title}</h1><p>{t.sub}</p></section>
        <section className="statGrid">{t.stats.map(([label,value]) => <article key={label}><small>{label}</small><strong>{value}</strong></article>)}</section>
        <section className="composerGrid">
          <article className="panel capturePanel"><div className="panelTop"><div><small>01 · CAPTURE</small><h2>{t.inputLabel}</h2></div><span className="statusDot">{statusText}</span></div><textarea value={input} onChange={e => setInput(e.target.value)} placeholder={t.placeholder}/>{voiceError && <p className="inlineError">{voiceError}</p>}<div className="captureActions"><button className="softButton" onClick={() => setInput(lang === "ar" ? "سو عرض لخالد: تركيب 4 مكيفات 450 للحبة، 20 متر نحاس 75 للمتر، نقل 200، الضريبة 15%" : "Make a quote for Khaled: install 4 ACs at 450 each, 20m copper at 75, transport 200, VAT 15%")}>{t.load}</button><button className={`softButton ${recording ? "recording" : ""}`} disabled={voiceBusy} onClick={toggleRecording}>◉ {voiceBusy ? t.transcribing : recording ? t.stop : t.record}</button><button className="primaryButton" disabled={busy || !input.trim()} onClick={generate}>{busy ? "…" : t.generate} →</button></div></article>

          <article className="panel quotePanel"><div className="panelTop"><div><small>02 · REVIEW</small><h2>{t.draft}</h2></div><span className="readyPill">{t.status}</span></div><label className="field"><span>{t.customer}</span><input value={draft.customer} onChange={e => setDraft(d => ({ ...d, customer: e.target.value }))}/></label>
            <div className="lineHeader"><span>{t.item}</span><span>{t.qty}</span><span>{t.price}</span><span>Amount</span></div>
            <div className="lineItems">{draft.items.map(item => <div className="lineItem" key={item.id}><input value={lang === "ar" ? (item.descriptionAr || item.description) : item.description} onChange={e => patchItem(item.id, lang === "ar" ? { descriptionAr: e.target.value } : { description: e.target.value })}/><input type="number" min="0" value={item.quantity} onChange={e => patchItem(item.id, { quantity: Number(e.target.value) })}/><input type="number" min="0" value={item.unitPrice} onChange={e => patchItem(item.id, { unitPrice: Number(e.target.value) })}/><strong>{money(item.quantity * item.unitPrice)}</strong></div>)}</div>
            <button className="textButton" onClick={addItem}>{t.add}</button>
            <div className="quoteFoot"><div className="smallFields"><label><span>{t.discount}</span><input type="number" value={draft.discount} onChange={e => setDraft(d => ({ ...d, discount: Number(e.target.value) }))}/></label><label><span>{t.vat}</span><input type="number" value={draft.vatRate} onChange={e => setDraft(d => ({ ...d, vatRate: Number(e.target.value) }))}/></label></div><div className="totals"><div><span>{t.subtotal}</span><b>SAR {money(totals.subtotal)}</b></div><div><span>{t.vat}</span><b>SAR {money(totals.vat)}</b></div><div className="grand"><span>{t.total}</span><strong>SAR {money(totals.total)}</strong></div></div></div>
            <div className="quoteActions"><button className="softButton" disabled={saveBusy} onClick={saveDraft}>{saveBusy ? t.saving : saved ? "✓ " + t.saved : t.save}</button><button className="primaryButton" onClick={() => window.print()}>{t.print}</button></div>
          </article>
        </section>
        <section className="panel recentPanel"><div className="panelTop"><div><small>03 · FOLLOW-UP</small><h2>{t.recent}</h2></div><button className="textButton" onClick={() => setView("quotes")}>View all →</button></div><div className="quoteTable">{recent.map(q => <div className="quoteRow" key={q.quote_number}><span>{q.quote_number}</span><strong>{q.customer_name}</strong><span>SAR {money(Number(q.total || 0))}</span><em className={(q.status || "draft").toLowerCase()}>{q.status}</em></div>)}</div></section>
      </>}

      {view === "quotes" && <section className="singlePage"><div className="workspaceHead"><p className="eyebrow">QUOTATIONS</p><h1>{t.nav.quotes}</h1></div><div className="panel recentPanel"><div className="quoteTable">{recent.map(q => <div className="quoteRow" key={q.quote_number}><span>{q.quote_number}</span><strong>{q.customer_name}</strong><span>SAR {money(Number(q.total || 0))}</span><em className={(q.status || "draft").toLowerCase()}>{q.status}</em></div>)}</div></div></section>}
      {view === "catalog" && <section className="singlePage"><div className="workspaceHead"><p className="eyebrow">CATALOGUE</p><h1>{t.catalogTitle}</h1><p>{t.catalogBody}</p></div><div className="panel catalogPanel">{catalog.map(item => <div className="catalogRow" key={item.id}><div><strong>{lang === "ar" ? (item.name_ar || item.name) : item.name}</strong><small>{lang === "ar" ? item.name : item.name_ar}</small></div><b>SAR {money(Number(item.unit_price || 0))}</b><button>⋯</button></div>)}<button className="softButton">+ Add service</button></div></section>}
      {view === "settings" && <section className="singlePage"><div className="workspaceHead"><p className="eyebrow">SETTINGS</p><h1>{t.settingsTitle}</h1><p>{t.settingsBody}</p></div><div className="panel settingsPanel"><label className="field"><span>{t.company}</span><input defaultValue="Demo Air Conditioning Co."/></label><label className="field"><span>VAT number</span><input defaultValue="310000000000003"/></label><label className="field"><span>Default VAT</span><input defaultValue="15%"/></label><label className="field"><span>{t.defaultLang}</span><select defaultValue={lang}><option value="ar">العربية</option><option value="en">English</option><option value="bilingual">Arabic + English</option></select></label><button className="primaryButton">Save settings</button></div></section>}
    </main>
  </div>;
}
