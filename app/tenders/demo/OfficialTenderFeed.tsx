"use client";

import { useEffect, useState } from "react";
import styles from "./official.module.css";

type Requirement = {
  id: string;
  name_en: string;
  name_ar?: string;
  extraction_method: string;
  confidence: number;
};

type Opportunity = {
  id: string;
  tender_number?: string;
  reference_number?: string;
  title_ar: string;
  title_en?: string;
  buyer_ar?: string;
  buyer_en?: string;
  purpose_ar?: string;
  purpose_en?: string;
  tender_type_ar?: string;
  tender_type_en?: string;
  document_price_sar?: number;
  contract_duration_text?: string;
  source_status_text?: string;
  verification_state: string;
  source_url: string;
  metadata_fit: number;
  requirements: Requirement[];
  matched_requirement_ids: string[];
};

type FeedData = {
  generated_at: string;
  company: { name_en: string; name_ar?: string; sector_en?: string; sector_ar?: string };
  source: { name: string; cadence?: string; attribution_text?: string; base_url: string };
  opportunities: Opportunity[];
  caveat: string;
};

export default function OfficialTenderFeed() {
  const [data, setData] = useState<FeedData | null>(null);
  const [error, setError] = useState("");
  const [language, setLanguage] = useState<"en" | "ar">("en");
  const [openId, setOpenId] = useState<string | null>(null);
  const rtl = language === "ar";

  useEffect(() => {
    let active = true;
    fetch("/api/tenders/demo", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load official-source data.");
        return response.json() as Promise<FeedData>;
      })
      .then((payload) => {
        if (active) setData(payload);
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : "Unable to load data.");
      });
    return () => { active = false; };
  }, []);

  return (
    <section className={styles.wrap} dir={rtl ? "rtl" : "ltr"}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>{rtl ? "الطبقة الرسمية الجديدة" : "NEW OFFICIAL-SOURCE LAYER"}</span>
          <h1>{rtl ? "سجل منافسات حقيقية من اعتماد" : "Real Etimad tender records"}</h1>
          <p>
            {rtl
              ? "هذه السجلات مأخوذة من بيانات وصفية منشورة على منصة اعتماد، مع إبقاء حالة التحقق منفصلة عن قرار الدخول في المنافسة."
              : "These records come from tender metadata published by Etimad. Source verification is kept separate from the Bid / No-Bid decision."}
          </p>
        </div>
        <div className={styles.actions}>
          <button className={language === "en" ? styles.active : ""} onClick={() => setLanguage("en")}>EN</button>
          <button className={language === "ar" ? styles.active : ""} onClick={() => setLanguage("ar")}>AR</button>
        </div>
      </header>

      {error && <div className={styles.error}>{error}</div>}
      {!data && !error && <div className={styles.loading}>{rtl ? "تحميل بيانات اعتماد..." : "Loading Etimad records..."}</div>}

      {data && (
        <>
          <div className={styles.sourceBar}>
            <div>
              <span>{rtl ? "المصدر" : "Source"}</span>
              <strong>{data.source.name}</strong>
            </div>
            <div>
              <span>{rtl ? "التحديث المنشور" : "Published cadence"}</span>
              <strong>{data.source.cadence ?? "—"}</strong>
            </div>
            <div>
              <span>{rtl ? "الشركة التجريبية" : "Demo company"}</span>
              <strong>{rtl ? data.company.name_ar ?? data.company.name_en : data.company.name_en}</strong>
            </div>
            <a href={data.source.base_url} target="_blank" rel="noreferrer">
              {rtl ? "بيانات اعتماد المفتوحة ↗" : "Etimad open data ↗"}
            </a>
          </div>

          <div className={styles.feed}>
            {data.opportunities.map((opportunity) => {
              const open = openId === opportunity.id;
              const matched = new Set(opportunity.matched_requirement_ids);
              return (
                <article key={opportunity.id} className={styles.card}>
                  <button className={styles.cardTop} onClick={() => setOpenId(open ? null : opportunity.id)}>
                    <div className={styles.fit}>
                      <strong>{opportunity.metadata_fit}%</strong>
                      <span>{rtl ? "تطابق وصفي" : "metadata fit"}</span>
                    </div>
                    <div className={styles.copy}>
                      <span>{rtl ? opportunity.buyer_ar : opportunity.buyer_en ?? opportunity.buyer_ar}</span>
                      <h2>{rtl ? opportunity.title_ar : opportunity.title_en ?? opportunity.title_ar}</h2>
                      <p>
                        {rtl ? "مرجع" : "Ref"}: {opportunity.reference_number ?? "—"}
                        {opportunity.tender_number ? ` · ${rtl ? "منافسة" : "Tender"}: ${opportunity.tender_number}` : ""}
                      </p>
                    </div>
                    <div className={styles.state}>
                      <span>{rtl ? "سجل رسمي" : "Official record"}</span>
                      <strong>{rtl ? "أعد التحقق من الحالة" : "Recheck status"}</strong>
                    </div>
                    <span className={styles.chevron}>{open ? "−" : "+"}</span>
                  </button>

                  {open && (
                    <div className={styles.detail}>
                      <div className={styles.metaGrid}>
                        <div><span>{rtl ? "الحالة المنشورة" : "Published status"}</span><strong>{opportunity.source_status_text ?? "—"}</strong></div>
                        <div><span>{rtl ? "نوع المنافسة" : "Tender type"}</span><strong>{rtl ? opportunity.tender_type_ar ?? "—" : opportunity.tender_type_en ?? opportunity.tender_type_ar ?? "—"}</strong></div>
                        <div><span>{rtl ? "مدة العقد" : "Contract duration"}</span><strong>{opportunity.contract_duration_text ?? "—"}</strong></div>
                        <div><span>{rtl ? "سعر الكراسة" : "Document price"}</span><strong>{opportunity.document_price_sar ? `${opportunity.document_price_sar.toLocaleString()} SAR` : "—"}</strong></div>
                      </div>

                      <div className={styles.purpose}>
                        <span>{rtl ? "الغرض المنشور" : "Published purpose"}</span>
                        <p>{rtl ? opportunity.purpose_ar : opportunity.purpose_en ?? opportunity.purpose_ar}</p>
                      </div>

                      <div className={styles.signals}>
                        <div className={styles.signalHead}>
                          <strong>{rtl ? "إشارات الاحتياج من البيانات العامة" : "Requirement signals from public metadata"}</strong>
                          <span>{rtl ? "ليست جدول كميات" : "Not the bill of quantities"}</span>
                        </div>
                        {opportunity.requirements.map((requirement) => (
                          <div key={requirement.id} className={styles.signalRow}>
                            <span className={matched.has(requirement.id) ? styles.hit : styles.miss}>{matched.has(requirement.id) ? "✓" : "—"}</span>
                            <div>
                              <strong>{rtl ? requirement.name_ar ?? requirement.name_en : requirement.name_en}</strong>
                              <small>{Math.round(requirement.confidence * 100)}% {rtl ? "ثقة الاستخراج" : "extraction confidence"}</small>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className={styles.detailFooter}>
                        <p>{rtl ? "قبل اتخاذ قرار الدخول يجب فتح اعتماد والتحقق من الحالة الحالية وتحميل وثائق المنافسة وجدول الكميات." : "Before a bid decision, open Etimad, verify the current status, and review the tender documents and bill of quantities."}</p>
                        <a href={opportunity.source_url} target="_blank" rel="noreferrer">{rtl ? "فتح السجل في اعتماد ↗" : "Open record in Etimad ↗"}</a>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>

          <div className={styles.caveat}>
            <strong>{rtl ? "ما الذي تغير؟" : "What changed"}</strong>
            <p>{rtl ? "المنصة لم تعد تعتمد فقط على مناقصات خيالية. طبقة البيانات الخلفية الآن تحفظ سجلات اعتماد الرسمية ومصدر كل سجل وحالة التحقق وإشارات الاحتياج المستخرجة من البيانات العامة." : "The platform is no longer limited to fictional tender examples. The backend now stores official Etimad records, provenance, verification state, and requirement signals extracted from public metadata."}</p>
          </div>
        </>
      )}
    </section>
  );
}
