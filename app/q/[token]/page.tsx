"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type QuoteItem = {
  id: string;
  description: string;
  description_ar?: string;
  quantity: number;
  unit_price: number;
  line_total: number;
};

type Quote = {
  quote_number: string;
  customer_name: string;
  status: string;
  discount: number;
  vat_rate: number;
  subtotal: number;
  vat: number;
  total: number;
  created_at: string;
  items: QuoteItem[];
};

type Lang = "ar" | "en";
type Theme = "dark" | "light";

function money(value: number) {
  return new Intl.NumberFormat("en-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0));
}

export default function PublicQuotePage() {
  const params = useParams<{ token: string }>();
  const token = String(params?.token || "");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [lang, setLang] = useState<Lang>("ar");
  const [theme, setThemeState] = useState<Theme>("dark");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const savedLang = localStorage.getItem("thrwa-lang") as Lang | null;
    const resolvedLang: Lang = savedLang === "en" ? "en" : "ar";
    const savedTheme = localStorage.getItem("thrwa-theme") as Theme | null;
    const resolvedTheme: Theme = savedTheme === "light" ? "light" : "dark";
    setLang(resolvedLang);
    setThemeState(resolvedTheme);
    document.documentElement.lang = resolvedLang;
    document.documentElement.dir = resolvedLang === "ar" ? "rtl" : "ltr";
    document.documentElement.dataset.theme = resolvedTheme;

    if (!token) return;
    fetch(`/api/public/quotes/${token}`, { cache: "no-store" })
      .then(async r => {
        const data = await r.json();
        if (!r.ok) throw new Error(data?.error || "Could not load quotation.");
        setQuote(data.quote);
      })
      .catch(e => setError(e instanceof Error ? e.message : "Could not load quotation."));
  }, [token]);

  const setLanguage = (next: Lang) => {
    setLang(next);
    localStorage.setItem("thrwa-lang", next);
    document.documentElement.lang = next;
    document.documentElement.dir = next === "ar" ? "rtl" : "ltr";
  };

  const setTheme = (next: Theme) => {
    setThemeState(next);
    localStorage.setItem("thrwa-theme", next);
    document.documentElement.dataset.theme = next;
  };

  const act = async (action: "accept" | "reject") => {
    if (!token) return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`/api/public/quotes/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action })
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || "Could not update quotation.");
      setQuote(q => q ? { ...q, status: data?.quote?.status || (action === "accept" ? "accepted" : "rejected") } : q);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update quotation.");
    } finally {
      setBusy(false);
    }
  };

  if (error && !quote) return <main className="publicQuotePage" dir={lang === "ar" ? "rtl" : "ltr"}><div className="quoteError">{error}</div></main>;
  if (!quote) return <main className="publicQuotePage" dir="rtl"><div className="quoteLoading">جاري تحميل عرض السعر…</div></main>;

  const accepted = quote.status === "accepted";
  const rejected = quote.status === "rejected";

  return <main className="publicQuotePage" dir={lang === "ar" ? "rtl" : "ltr"} lang={lang}>
    <header className="publicQuoteTop">
      <span className="brand"><img className="brandLogo" src="/thrwa-logo.svg" alt="" /><strong>{lang === "ar" ? "ثروة" : "THRWA"}</strong></span>
      <div className="publicQuoteControls">
        <button className="themeToggle" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>{theme === "dark" ? "☀" : "☾"}</button>
        <div className="langSwitch"><button className={lang === "ar" ? "active" : ""} onClick={() => setLanguage("ar")}>العربية</button><button className={lang === "en" ? "active" : ""} onClick={() => setLanguage("en")}>English</button></div>
      </div>
    </header>

    <section className="publicQuoteCard">
      <div className="publicQuoteHero">
        <div>
          <p className="eyebrow">{lang === "ar" ? "عرض سعر" : "QUOTATION"}</p>
          <h1>{quote.quote_number}</h1>
          <p>{lang === "ar" ? "مقدم إلى" : "Prepared for"} <strong>{quote.customer_name}</strong></p>
        </div>
        <div className="publicQuoteTotal"><small>{lang === "ar" ? "الإجمالي" : "TOTAL"}</small><strong>{money(quote.total)} <span>{lang === "ar" ? "ر.س" : "SAR"}</span></strong></div>
      </div>

      <div className="publicQuoteItems">
        <div className="publicQuoteHeader"><span>{lang === "ar" ? "البند" : "Item"}</span><span>{lang === "ar" ? "الكمية" : "Qty"}</span><span>{lang === "ar" ? "سعر الوحدة" : "Unit price"}</span><span>{lang === "ar" ? "الإجمالي" : "Amount"}</span></div>
        {quote.items.map(item => <div className="publicQuoteRow" key={item.id}><strong>{lang === "ar" ? (item.description_ar || item.description) : item.description}</strong><span>{item.quantity}</span><span>{money(item.unit_price)}</span><span>{money(item.line_total)}</span></div>)}
      </div>

      <div className="publicQuoteSummary">
        {quote.discount > 0 && <div><span>{lang === "ar" ? "الخصم" : "Discount"}</span><b>- {money(quote.discount)}</b></div>}
        <div><span>{lang === "ar" ? "قبل الضريبة" : "Subtotal"}</span><b>{money(quote.subtotal)}</b></div>
        <div><span>{lang === "ar" ? `الضريبة (${quote.vat_rate}٪)` : `VAT (${quote.vat_rate}%)`}</span><b>{money(quote.vat)}</b></div>
        <div className="grand"><span>{lang === "ar" ? "الإجمالي" : "Total"}</span><strong>{money(quote.total)} {lang === "ar" ? "ر.س" : "SAR"}</strong></div>
      </div>

      {accepted || rejected ? <div className={`decisionState ${accepted ? "accepted" : "rejected"}`}>
        <strong>{accepted ? (lang === "ar" ? "تمت الموافقة على عرض السعر ✓" : "Quotation accepted ✓") : (lang === "ar" ? "تم رفض عرض السعر" : "Quotation rejected")}</strong>
        <p>{lang === "ar" ? "تم إرسال الحالة إلى الشركة." : "The business has been notified of your decision."}</p>
      </div> : <div className="publicQuoteActions">
        <button className="rejectButton" disabled={busy} onClick={() => act("reject")}>{lang === "ar" ? "رفض" : "Reject"}</button>
        <button className="acceptButton" disabled={busy} onClick={() => act("accept")}>{busy ? "…" : lang === "ar" ? "الموافقة على العرض" : "Accept quotation"}</button>
      </div>}

      {error && <p className="inlineError">{error}</p>}
      <button className="printQuoteButton" onClick={() => window.print()}>{lang === "ar" ? "طباعة / حفظ PDF" : "Print / Save PDF"}</button>
    </section>
    <footer className="publicQuoteFooter">thrwa.tech · {lang === "ar" ? "عروض أسعار أسرع من واتساب" : "Faster quotations from WhatsApp"}</footer>
  </main>;
}
