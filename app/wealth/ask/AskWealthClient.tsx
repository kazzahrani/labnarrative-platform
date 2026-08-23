"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { browserSupabase } from "@/lib/supabase-browser";
import styles from "./ask.module.css";

type PortfolioKind = "real" | "paper";
type Holding = {
  id: string;
  account_id: string;
  asset_name: string;
  symbol: string | null;
  asset_type: string | null;
  market_value: number | string | null;
  cost_basis: number | string | null;
  quantity: number | string | null;
  unit_price: number | string | null;
  currency: string | null;
  as_of_date: string | null;
};
type Account = {
  id: string;
  provider: string | null;
  account_name: string | null;
  status: string | null;
  connection_mode: string | null;
  currency: string | null;
  updated_at: string | null;
};
type IncomeEvent = {
  holding_id: string;
  event_date: string;
  total_amount_sar: number | string | null;
  event_type: string | null;
};
type ShariahAssessment = {
  holding_id: string;
  status: string;
  confidence: string | null;
  reason: string | null;
};
type StatTone = "positive" | "negative" | "neutral" | "review";
type AnswerStat = { label: string; value: string; tone?: StatTone };
type Message = {
  id: number;
  role: "user" | "assistant";
  text: string;
  stats?: AnswerStat[];
  link?: { href: string; label: string };
};
type Facts = ReturnType<typeof buildFacts>;

const SUGGESTIONS = [
  "كم صافي ثروتي؟",
  "كم عندي في السوق السعودي؟",
  "ما نسبة الكريبتو؟",
  "ما أكبر مخاطرة في المحفظة؟",
  "كم دخلت توزيعات آخر 12 شهر؟",
  "ما الأصول الخاسرة؟",
  "كم عندي في Binance؟",
  "ما حالة الالتزام الشرعي؟",
];

const TYPE_LABELS: Record<string, string> = {
  saudi_stock: "سهم سعودي",
  global_stock: "سهم عالمي",
  etf: "ETF",
  fund: "صندوق",
  sukuk: "صكوك",
  reit: "ريت",
  crypto: "أصل رقمي",
  cash: "نقد",
  murabaha: "مرابحة",
  real_estate: "عقار",
  gold: "ذهب",
  private_asset: "أصل خاص",
  other: "أخرى",
};

function numeric(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function fmt(value: number, digits = 2) {
  return new Intl.NumberFormat("ar-SA-u-nu-arab", { maximumFractionDigits: digits }).format(value);
}

function sar(value: number) {
  return `${fmt(value)} ر.س`;
}

function pct(value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${fmt(value, 1)}٪`;
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[،؟?!.:,؛;()\[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function includesAny(q: string, terms: string[]) {
  return terms.some((term) => q.includes(normalize(term)));
}

function assetTypeLabel(type: string | null) {
  return TYPE_LABELS[type || ""] || "أصل";
}

function buildFacts(holdings: Holding[], accounts: Account[], income: IncomeEvent[], shariah: ShariahAssessment[]) {
  const accountMap = new Map(accounts.map((account) => [account.id, account]));
  const shariahMap = new Map(shariah.map((row) => [row.holding_id, row]));
  const total = holdings.reduce((sum, row) => sum + numeric(row.market_value), 0);
  const cost = holdings.reduce((sum, row) => sum + numeric(row.cost_basis), 0);
  const pnl = total - cost;
  const pnlPct = cost > 0 ? pnl / cost * 100 : 0;
  const sorted = [...holdings].sort((a, b) => numeric(b.market_value) - numeric(a.market_value));
  const top = sorted[0] || null;
  const top3Value = sorted.slice(0, 3).reduce((sum, row) => sum + numeric(row.market_value), 0);
  const saudi = holdings.filter((row) => !["global_stock", "crypto"].includes(row.asset_type || "")).reduce((sum, row) => sum + numeric(row.market_value), 0);
  const global = holdings.filter((row) => row.asset_type === "global_stock" || row.asset_type === "etf").reduce((sum, row) => sum + numeric(row.market_value), 0);
  const crypto = holdings.filter((row) => row.asset_type === "crypto").reduce((sum, row) => sum + numeric(row.market_value), 0);
  const cash = holdings.filter((row) => ["cash", "murabaha"].includes(row.asset_type || "")).reduce((sum, row) => sum + numeric(row.market_value), 0);
  const realEstate = holdings.filter((row) => row.asset_type === "real_estate").reduce((sum, row) => sum + numeric(row.market_value), 0);
  const gold = holdings.filter((row) => row.asset_type === "gold").reduce((sum, row) => sum + numeric(row.market_value), 0);
  const winners = holdings.filter((row) => numeric(row.cost_basis) > 0 && numeric(row.market_value) > numeric(row.cost_basis)).sort((a, b) => (numeric(b.market_value) - numeric(b.cost_basis)) - (numeric(a.market_value) - numeric(a.cost_basis)));
  const losers = holdings.filter((row) => numeric(row.cost_basis) > 0 && numeric(row.market_value) < numeric(row.cost_basis)).sort((a, b) => (numeric(a.market_value) - numeric(a.cost_basis)) - (numeric(b.market_value) - numeric(b.cost_basis)));

  const accountTotals = accounts.map((account) => {
    const rows = holdings.filter((holding) => holding.account_id === account.id);
    const value = rows.reduce((sum, row) => sum + numeric(row.market_value), 0);
    const accountCost = rows.reduce((sum, row) => sum + numeric(row.cost_basis), 0);
    const accountPnl = value - accountCost;
    return { account, holdings: rows, value, cost: accountCost, pnl: accountPnl, pnlPct: accountCost > 0 ? accountPnl / accountCost * 100 : 0 };
  }).sort((a, b) => b.value - a.value);

  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10);
  const twelveMonthsAgo = new Date(now);
  twelveMonthsAgo.setDate(twelveMonthsAgo.getDate() - 365);
  const twelveCutoff = twelveMonthsAgo.toISOString().slice(0, 10);
  const income12 = income.filter((row) => row.event_date >= twelveCutoff).reduce((sum, row) => sum + numeric(row.total_amount_sar), 0);
  const incomeYtd = income.filter((row) => row.event_date >= yearStart).reduce((sum, row) => sum + numeric(row.total_amount_sar), 0);

  const shariahValues = { compliant: 0, review: 0, nonCompliant: 0, unknown: 0 };
  holdings.forEach((holding) => {
    const value = numeric(holding.market_value);
    const status = shariahMap.get(holding.id)?.status;
    if (status === "likely_compliant") shariahValues.compliant += value;
    else if (status === "review_required") shariahValues.review += value;
    else if (status === "likely_non_compliant") shariahValues.nonCompliant += value;
    else shariahValues.unknown += value;
  });

  return {
    total, cost, pnl, pnlPct, sorted, top, top3Value, saudi, global, crypto, cash, realEstate, gold,
    winners, losers, accountTotals, accountMap, shariahMap, income12, incomeYtd, shariahValues,
  };
}

function valueShare(value: number, total: number) {
  return total > 0 ? value / total * 100 : 0;
}

function findAsset(q: string, holdings: Holding[]) {
  const ranked = holdings
    .map((holding) => ({ holding, names: [holding.asset_name, holding.symbol || ""].filter(Boolean).map(normalize) }))
    .sort((a, b) => Math.max(...b.names.map((name) => name.length), 0) - Math.max(...a.names.map((name) => name.length), 0));
  return ranked.find(({ names }) => names.some((name) => name.length >= 2 && q.includes(name)))?.holding || null;
}

function findAccount(q: string, accounts: Account[]) {
  const ranked = accounts
    .map((account) => ({ account, names: [account.provider || "", account.account_name || ""].filter(Boolean).map(normalize) }))
    .sort((a, b) => Math.max(...b.names.map((name) => name.length), 0) - Math.max(...a.names.map((name) => name.length), 0));
  return ranked.find(({ names }) => names.some((name) => name.length >= 3 && q.includes(name)))?.account || null;
}

function answerQuestion(rawQuestion: string, holdings: Holding[], accounts: Account[], facts: Facts, paper: boolean) {
  const q = normalize(rawQuestion);
  const suffix = paper ? "?portfolio=paper" : "";
  const asset = findAsset(q, holdings);
  const account = findAccount(q, accounts);

  if (asset) {
    const value = numeric(asset.market_value);
    const cost = numeric(asset.cost_basis);
    const pnl = value - cost;
    const pnlPct = cost > 0 ? pnl / cost * 100 : 0;
    const accountRow = facts.accountMap.get(asset.account_id);
    const shariah = facts.shariahMap.get(asset.id);
    const shariahLabel = shariah?.status === "likely_compliant" ? "متوافق" : shariah?.status === "review_required" ? "يحتاج مراجعة" : shariah?.status === "likely_non_compliant" ? "غير متوافق مبدئيًا" : "غير مصنف";
    return {
      text: `${asset.asset_name} يمثل ${pct(valueShare(value, facts.total))} من المحفظة، وقيمته الحالية ${sar(value)}${accountRow?.provider ? ` داخل ${accountRow.provider}` : ""}.`,
      stats: [
        { label: "القيمة", value: sar(value) },
        { label: "الوزن", value: pct(valueShare(value, facts.total)) },
        ...(cost > 0 ? [{ label: "الربح/الخسارة", value: `${sar(pnl)} · ${pct(pnlPct)}`, tone: pnl >= 0 ? "positive" as StatTone : "negative" as StatTone }] : []),
        { label: "النوع", value: assetTypeLabel(asset.asset_type) },
        { label: "التصنيف الشرعي", value: shariahLabel, tone: shariah?.status === "likely_compliant" ? "positive" as StatTone : shariah?.status === "review_required" ? "review" as StatTone : shariah?.status === "likely_non_compliant" ? "negative" as StatTone : "neutral" as StatTone },
      ],
      link: { href: `/wealth/assets/${asset.id}${suffix}`, label: "فتح صفحة الأصل" },
    };
  }

  if (account) {
    const row = facts.accountTotals.find((item) => item.account.id === account.id);
    const top = row?.holdings.slice().sort((a, b) => numeric(b.market_value) - numeric(a.market_value))[0];
    return {
      text: `${account.provider || account.account_name || "الحساب"} يحتوي على ${row?.holdings.length || 0} أصل بقيمة إجمالية ${sar(row?.value || 0)}.`,
      stats: [
        { label: "قيمة الحساب", value: sar(row?.value || 0) },
        { label: "عدد الأصول", value: fmt(row?.holdings.length || 0, 0) },
        ...(row && row.cost > 0 ? [{ label: "الربح/الخسارة", value: `${sar(row.pnl)} · ${pct(row.pnlPct)}`, tone: row.pnl >= 0 ? "positive" as StatTone : "negative" as StatTone }] : []),
        { label: "أكبر أصل", value: top?.asset_name || "—" },
      ],
      link: { href: `/wealth/accounts${suffix}`, label: "فتح الحسابات" },
    };
  }

  if (includesAny(q, ["ملخص", "لخص", "summary", "وضعي", "محفظتي باختصار"])) {
    return {
      text: `صافي المحفظة ${sar(facts.total)} عبر ${accounts.length} حساب و${holdings.length} أصل. أكبر مركز هو ${facts.top?.asset_name || "—"}، والكريبتو يمثل ${pct(valueShare(facts.crypto, facts.total))}.`,
      stats: [
        { label: "صافي الثروة", value: sar(facts.total) },
        { label: "الربح/الخسارة", value: `${sar(facts.pnl)} · ${pct(facts.pnlPct)}`, tone: facts.pnl >= 0 ? "positive" : "negative" },
        { label: "السعودية / محلي", value: pct(valueShare(facts.saudi, facts.total)) },
        { label: "الكريبتو", value: pct(valueShare(facts.crypto, facts.total)) },
      ],
      link: { href: `/wealth${suffix}`, label: "فتح النظرة العامة" },
    };
  }

  if (includesAny(q, ["صافي ثروتي", "صافي الثروه", "كم ثروتي", "اجمالي ثروتي", "إجمالي ثروتي", "net worth", "total wealth", "قيمة المحفظة", "قيمه المحفظه"])) {
    return {
      text: `صافي قيمة الأصول المسجلة في هذه المحفظة حاليًا هو ${sar(facts.total)}.`,
      stats: [
        { label: "القيمة الحالية", value: sar(facts.total) },
        { label: "إجمالي التكلفة المسجلة", value: sar(facts.cost) },
        { label: "الربح/الخسارة غير المحققة", value: `${sar(facts.pnl)} · ${pct(facts.pnlPct)}`, tone: facts.pnl >= 0 ? "positive" : "negative" },
      ],
    };
  }

  if (includesAny(q, ["السوق السعودي", "السعوديه", "السعودية", "محلي", "saudi", "tadawul"])) {
    return {
      text: `التعرض السعودي/المحلي هو ${sar(facts.saudi)}، أي ${pct(valueShare(facts.saudi, facts.total))} من المحفظة الحالية.`,
      stats: [
        { label: "السعودية / محلي", value: sar(facts.saudi) },
        { label: "النسبة", value: pct(valueShare(facts.saudi, facts.total)) },
        { label: "العالمي", value: pct(valueShare(facts.global, facts.total)) },
        { label: "الكريبتو", value: pct(valueShare(facts.crypto, facts.total)) },
      ],
      link: { href: `/wealth/analytics${suffix}`, label: "فتح التحليلات" },
    };
  }

  if (includesAny(q, ["كريبتو", "عملات رقمية", "العملات الرقميه", "crypto", "bitcoin and ethereum"])) {
    const cryptoRows = holdings.filter((row) => row.asset_type === "crypto").sort((a, b) => numeric(b.market_value) - numeric(a.market_value));
    return {
      text: `إجمالي الأصول الرقمية ${sar(facts.crypto)}، وتمثل ${pct(valueShare(facts.crypto, facts.total))} من المحفظة.`,
      stats: [
        { label: "إجمالي الكريبتو", value: sar(facts.crypto) },
        { label: "النسبة", value: pct(valueShare(facts.crypto, facts.total)) },
        ...cryptoRows.slice(0, 2).map((row) => ({ label: row.asset_name, value: `${sar(numeric(row.market_value))} · ${pct(valueShare(numeric(row.market_value), facts.total))}` })),
      ],
      link: { href: `/wealth/assets${suffix}`, label: "فتح الأصول" },
    };
  }

  if (includesAny(q, ["عالمي", "امريكي", "أمريكي", "اسهم امريكيه", "أسهم أمريكية", "global", "us stocks", "international"])) {
    return {
      text: `التعرض للأسهم والأدوات العالمية المسجلة هو ${sar(facts.global)}، أي ${pct(valueShare(facts.global, facts.total))} من المحفظة.`,
      stats: [
        { label: "عالمي", value: sar(facts.global) },
        { label: "النسبة", value: pct(valueShare(facts.global, facts.total)) },
      ],
    };
  }

  if (includesAny(q, ["نقد", "سيوله", "سيولة", "cash", "مرابحه", "مرابحة"])) {
    return {
      text: `النقد والمرابحة المسجلان حاليًا يساويان ${sar(facts.cash)}، أي ${pct(valueShare(facts.cash, facts.total))} من المحفظة.`,
      stats: [
        { label: "نقد ومرابحة", value: sar(facts.cash) },
        { label: "النسبة", value: pct(valueShare(facts.cash, facts.total)) },
      ],
    };
  }

  if (includesAny(q, ["عقار", "العقار", "real estate"])) {
    return {
      text: `قيمة العقار المسجل هي ${sar(facts.realEstate)}، وتمثل ${pct(valueShare(facts.realEstate, facts.total))} من المحفظة.`,
      stats: [
        { label: "العقار", value: sar(facts.realEstate) },
        { label: "النسبة", value: pct(valueShare(facts.realEstate, facts.total)) },
      ],
    };
  }

  if (includesAny(q, ["ذهب", "gold"])) {
    return {
      text: `قيمة الذهب المسجل هي ${sar(facts.gold)}، أي ${pct(valueShare(facts.gold, facts.total))} من المحفظة. في الفحص الشرعي الحالي بقي الذهب ضمن فئة «يحتاج مراجعة».`,
      stats: [
        { label: "الذهب", value: sar(facts.gold) },
        { label: "النسبة", value: pct(valueShare(facts.gold, facts.total)) },
        { label: "الحالة الشرعية", value: "يحتاج مراجعة", tone: "review" },
      ],
      link: { href: `/wealth/shariah${suffix}`, label: "فتح الالتزام الشرعي" },
    };
  }

  if (includesAny(q, ["توزيعات", "دخل", "dividend", "income", "ارباح موزعه", "أرباح موزعة"])) {
    const ytd = includesAny(q, ["هذا العام", "السنه", "السنة", "ytd", "year"]);
    const amount = ytd ? facts.incomeYtd : facts.income12;
    return {
      text: ytd ? `إجمالي الدخل والتوزيعات المسجلة منذ بداية السنة هو ${sar(amount)}.` : `إجمالي الدخل والتوزيعات المسجلة خلال آخر 12 شهرًا هو ${sar(amount)}.`,
      stats: [
        { label: "آخر 12 شهر", value: sar(facts.income12), tone: "positive" },
        { label: "منذ بداية السنة", value: sar(facts.incomeYtd), tone: "positive" },
      ],
      link: { href: `/wealth/income${suffix}`, label: "فتح الدخل والتوزيعات" },
    };
  }

  if (includesAny(q, ["شرعي", "الشريعه", "الشريعة", "متوافق", "حلال", "shariah", "compliant"])) {
    const s = facts.shariahValues;
    return {
      text: `وفق التصنيفات المسجلة حاليًا، ${pct(valueShare(s.compliant, facts.total))} من قيمة المحفظة مصنف متوافق، و${pct(valueShare(s.review, facts.total))} يحتاج مراجعة.`,
      stats: [
        { label: "متوافق", value: `${sar(s.compliant)} · ${pct(valueShare(s.compliant, facts.total))}`, tone: "positive" },
        { label: "يحتاج مراجعة", value: `${sar(s.review)} · ${pct(valueShare(s.review, facts.total))}`, tone: "review" },
        { label: "غير متوافق مبدئيًا", value: `${sar(s.nonCompliant)} · ${pct(valueShare(s.nonCompliant, facts.total))}`, tone: "negative" },
      ],
      link: { href: `/wealth/shariah${suffix}`, label: "فتح الالتزام الشرعي" },
    };
  }

  if (includesAny(q, ["الخاسره", "الخاسرة", "خاسره", "خاسرة", "losses", "losing", "الخسائر"])) {
    const totalLoss = facts.losers.reduce((sum, row) => sum + (numeric(row.market_value) - numeric(row.cost_basis)), 0);
    return {
      text: facts.losers.length ? `يوجد ${facts.losers.length} أصل بخسارة غير محققة، بإجمالي ${sar(totalLoss)}.` : "لا توجد حاليًا أصول ذات تكلفة مسجلة وقيمة حالية أقل منها.",
      stats: facts.losers.slice(0, 4).map((row) => {
        const loss = numeric(row.market_value) - numeric(row.cost_basis);
        const rate = numeric(row.cost_basis) > 0 ? loss / numeric(row.cost_basis) * 100 : 0;
        return { label: row.asset_name, value: `${sar(loss)} · ${pct(rate)}`, tone: "negative" as StatTone };
      }),
      link: { href: `/wealth/assets${suffix}`, label: "فتح الأصول" },
    };
  }

  if (includesAny(q, ["الرابحه", "الرابحة", "رابحه", "رابحة", "winners", "profitable", "الارباح", "الأرباح"])) {
    const totalProfit = facts.winners.reduce((sum, row) => sum + (numeric(row.market_value) - numeric(row.cost_basis)), 0);
    return {
      text: facts.winners.length ? `يوجد ${facts.winners.length} أصل بربح غير محقق، بإجمالي ${sar(totalProfit)}.` : "لا توجد حاليًا أصول ذات تكلفة مسجلة وقيمة حالية أعلى منها.",
      stats: facts.winners.slice(0, 4).map((row) => {
        const profit = numeric(row.market_value) - numeric(row.cost_basis);
        const rate = numeric(row.cost_basis) > 0 ? profit / numeric(row.cost_basis) * 100 : 0;
        return { label: row.asset_name, value: `${sar(profit)} · ${pct(rate)}`, tone: "positive" as StatTone };
      }),
      link: { href: `/wealth/assets${suffix}`, label: "فتح الأصول" },
    };
  }

  if (includesAny(q, ["مخاطره", "مخاطرة", "مخاطر", "تركيز", "اكبر اصل", "أكبر أصل", "اكبر مركز", "أكبر مركز", "risk", "concentration", "largest holding"])) {
    const topShare = facts.top ? valueShare(numeric(facts.top.market_value), facts.total) : 0;
    const top3Share = valueShare(facts.top3Value, facts.total);
    const cryptoShare = valueShare(facts.crypto, facts.total);
    const notes = [];
    if (topShare >= 25) notes.push(`أكبر مركز (${facts.top?.asset_name}) يمثل ${pct(topShare)}`);
    if (top3Share >= 60) notes.push(`أكبر 3 مراكز تمثل ${pct(top3Share)}`);
    if (cryptoShare >= 20) notes.push(`الكريبتو يمثل ${pct(cryptoShare)}`);
    const summary = notes.length ? notes.join("، و") : "لا يظهر تركّز مرتفع جدًا وفق المؤشرات البسيطة الحالية";
    return {
      text: `أبرز مؤشر مخاطرة تركّز حاليًا: ${summary}. هذا وصف للمحفظة وليس توصية بيع أو شراء.`,
      stats: [
        { label: "أكبر أصل", value: `${facts.top?.asset_name || "—"} · ${pct(topShare)}` },
        { label: "أكبر 3 أصول", value: pct(top3Share) },
        { label: "الكريبتو", value: pct(cryptoShare) },
      ],
      link: { href: `/wealth/analytics${suffix}`, label: "فتح التحليلات" },
    };
  }

  if (includesAny(q, ["الحسابات", "كم حساب", "accounts", "account list"])) {
    return {
      text: `لديك ${accounts.length} حسابات في هذه المحفظة.`,
      stats: facts.accountTotals.slice(0, 5).map((row) => ({ label: row.account.provider || row.account.account_name || "حساب", value: `${sar(row.value)} · ${pct(valueShare(row.value, facts.total))}` })),
      link: { href: `/wealth/accounts${suffix}`, label: "فتح الحسابات" },
    };
  }

  return {
    text: "أستطيع الآن الإجابة من بيانات محفظتك عن صافي الثروة، توزيع السعودية والعالمي والكريبتو، الحسابات، الأصول، الأرباح والخسائر، الدخل والتوزيعات، التركّز، والتصنيف الشرعي. جرّب سؤالًا مباشرًا أو اضغط أحد الاقتراحات.",
    stats: [
      { label: "مثال", value: "كم نسبة أرامكو؟" },
      { label: "مثال", value: "ما أكبر مخاطرة؟" },
      { label: "مثال", value: "كم دخلت توزيعات؟" },
    ],
  };
}

export default function AskWealthClient() {
  const [kind, setKind] = useState<PortfolioKind>("real");
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [income, setIncome] = useState<IncomeEvent[]>([]);
  const [shariah, setShariah] = useState<ShariahAssessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const nextId = useRef(1);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const mode: PortfolioKind = new URLSearchParams(window.location.search).get("portfolio") === "paper" ? "paper" : "real";
        setKind(mode);
        const { data: userData, error: userError } = await browserSupabase.auth.getUser();
        if (userError || !userData.user) {
          window.location.replace(`/wealth/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
          return;
        }
        if (mode === "paper") {
          const { error: seedError } = await browserSupabase.rpc("ensure_wealth_paper_portfolio");
          if (seedError) throw seedError;
        }
        const uid = userData.user.id;
        const [h, a, i, s] = await Promise.all([
          browserSupabase.from("wealth_holdings").select("id,account_id,asset_name,symbol,asset_type,market_value,cost_basis,quantity,unit_price,currency,as_of_date").eq("user_id", uid).eq("portfolio_kind", mode),
          browserSupabase.from("wealth_accounts").select("id,provider,account_name,status,connection_mode,currency,updated_at").eq("user_id", uid).eq("portfolio_kind", mode).neq("status", "archived"),
          browserSupabase.from("wealth_income_events").select("holding_id,event_date,total_amount_sar,event_type").eq("user_id", uid).eq("portfolio_kind", mode),
          browserSupabase.from("wealth_shariah_assessments").select("holding_id,status,confidence,reason").eq("user_id", uid).eq("portfolio_kind", mode),
        ]);
        if (h.error) throw h.error;
        if (a.error) throw a.error;
        if (i.error) throw i.error;
        if (s.error) throw s.error;
        if (!active) return;
        setHoldings((h.data || []) as Holding[]);
        setAccounts((a.data || []) as Account[]);
        setIncome((i.data || []) as IncomeEvent[]);
        setShariah((s.data || []) as ShariahAssessment[]);
        setMessages([{
          id: nextId.current++,
          role: "assistant",
          text: mode === "paper" ? "أنا جاهز لقراءة المحفظة التجريبية. اسألني عن أي أصل، حساب، توزيع، تركّز أو نسبة داخل المحفظة." : "أنا جاهز لقراءة محفظتك الحالية. اسألني عن أي أصل، حساب، توزيع، تركّز أو نسبة داخل المحفظة.",
        }]);
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : "تعذر تحميل بيانات المحفظة.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  const facts = useMemo(() => buildFacts(holdings, accounts, income, shariah), [holdings, accounts, income, shariah]);
  const paper = kind === "paper";
  const suffix = paper ? "?portfolio=paper" : "";

  function ask(question: string) {
    const clean = question.trim();
    if (!clean || loading) return;
    const answer = answerQuestion(clean, holdings, accounts, facts, paper);
    setMessages((current) => [
      ...current,
      { id: nextId.current++, role: "user", text: clean },
      { id: nextId.current++, role: "assistant", text: answer.text, stats: answer.stats, link: answer.link },
    ]);
    setInput("");
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    ask(input);
  }

  if (loading) return <main className={styles.page}><div className={styles.state}>جاري قراءة المحفظة…</div></main>;
  if (error) return <main className={styles.page}><div className={styles.state}><strong>تعذر تشغيل اسأل ثروتي.</strong><span>{error}</span></div></main>;

  return <main className={styles.page} dir="rtl">
    <aside className={styles.sidebar}>
      <div><div className={styles.brand}>ثروة</div><div className={styles.brandSub}>{paper ? "محفظة تجريبية" : "إدارة الثروة"}</div></div>
      <nav className={styles.nav}>
        <Link href={`/wealth${suffix}`} className={styles.navItem}>نظرة عامة</Link>
        <Link href={`/wealth/assets${suffix}`} className={styles.navItem}>الأصول</Link>
        <Link href={`/wealth/income${suffix}`} className={styles.navItem}>الدخل</Link>
        <Link href={`/wealth/analytics${suffix}`} className={styles.navItem}>التحليلات</Link>
        <Link href={`/wealth/shariah${suffix}`} className={styles.navItem}>الالتزام الشرعي</Link>
        <Link href={`/wealth/accounts${suffix}`} className={styles.navItem}>الحسابات</Link>
        <Link href={`/wealth/ask${suffix}`} className={`${styles.navItem} ${styles.active}`}>اسأل ثروتي</Link>
      </nav>
    </aside>

    <section className={styles.workspace}>
      <header className={styles.topbar}>
        <div><p>{paper ? "بيئة الاختبار" : "المحفظة الحقيقية"}</p><h1>اسأل ثروتي</h1></div>
        <div className={styles.actions}>
          <Link href={paper ? "/wealth/ask" : "/wealth/ask?portfolio=paper"} className={styles.ghost}>{paper ? "محفظتي الحقيقية" : "محفظة تجريبية"}</Link>
          <Link href={`/wealth/accounts${suffix}`} className={styles.primary}>الحسابات</Link>
        </div>
      </header>

      <div className={styles.content}>
        <section className={styles.contextBar}>
          <div><small>يقرأ الآن</small><b>{paper ? "المحفظة التجريبية" : "المحفظة الحقيقية"}</b></div>
          <div><small>صافي الثروة</small><b>{sar(facts.total)}</b></div>
          <div><small>الأصول</small><b>{fmt(holdings.length, 0)}</b></div>
          <div><small>الحسابات</small><b>{fmt(accounts.length, 0)}</b></div>
          <span>إجابات مباشرة من بيانات Supabase الحالية — بدون تكلفة API إضافية.</span>
        </section>

        <section className={styles.chatShell}>
          <div className={styles.chatHeader}>
            <div><small>مساعد المحفظة</small><h2>اسأل عن أموالك بصيغة طبيعية</h2></div>
            <span className={styles.liveDot}>بيانات حية</span>
          </div>

          <div className={styles.suggestions}>
            {SUGGESTIONS.map((suggestion) => <button type="button" key={suggestion} onClick={() => ask(suggestion)}>{suggestion}</button>)}
          </div>

          <div className={styles.messages}>
            {messages.map((message) => <article key={message.id} className={`${styles.message} ${message.role === "user" ? styles.user : styles.assistant}`}>
              <div className={styles.messageLabel}>{message.role === "user" ? "أنت" : "ثروتي"}</div>
              <p>{message.text}</p>
              {message.stats?.length ? <div className={styles.answerStats}>{message.stats.map((stat) => <div key={`${message.id}-${stat.label}`} className={stat.tone ? styles[stat.tone] : ""}><small>{stat.label}</small><b>{stat.value}</b></div>)}</div> : null}
              {message.link ? <Link className={styles.answerLink} href={message.link.href}>{message.link.label}<span>←</span></Link> : null}
            </article>)}
            <div ref={endRef} />
          </div>

          <form className={styles.composer} onSubmit={submit}>
            <input value={input} onChange={(event) => setInput(event.target.value)} placeholder="مثال: كم نسبة أرامكو من ثروتي؟" aria-label="اسأل ثروتي" autoComplete="off" />
            <button type="submit" disabled={!input.trim()}>اسأل</button>
          </form>
          <div className={styles.disclaimer}>المساعد يصف ويحلل بيانات المحفظة المسجلة ولا يصدر توصيات شراء أو بيع.</div>
        </section>
      </div>
    </section>
  </main>;
}
