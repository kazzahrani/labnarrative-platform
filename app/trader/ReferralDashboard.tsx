"use client";

import { useEffect, useState } from "react";
import { browserSupabase } from "../../lib/supabase-browser";
import styles from "./referral-dashboard.module.css";

type Program = {
  currency: string;
  monthly_l1_bps: number;
  monthly_l2_bps: number;
  monthly_l3_bps: number;
  annual_l1_bps: number;
  annual_l2_bps: number;
  annual_l3_bps: number;
  customer_discount_bps: number;
  commission_hold_days: number;
  payout_minimum_cents: number;
};
type ReferralData = {
  ok?: boolean;
  referral?: { code: string; url: string; status: string; directReferrals: number; attribution: { referral_code?: string } | null };
  earnings?: { pending: number; available: number; paid: number; reversed: number; cancelled: number };
  program?: Program;
  error?: string;
};

const percent = (bps = 0) => `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 2)}%`;
const money = (cents = 0, currency = "USD") => new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(cents / 100);

async function invokeReferral(body: Record<string, unknown>) {
  const { data, error } = await browserSupabase.functions.invoke("trader-referral-control", { body });
  if (error) {
    let message = error.message || "referral_request_failed";
    const context = (error as { context?: Response }).context;
    if (context) {
      try {
        const payload = await context.clone().json() as { error?: string };
        if (payload.error) message = payload.error;
      } catch {}
    }
    throw new Error(message);
  }
  const payload = (data ?? {}) as ReferralData;
  if (payload.error || payload.ok !== true) throw new Error(payload.error || "referral_request_failed");
  return payload;
}

export default function ReferralDashboard() {
  const [data, setData] = useState<ReferralData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<"link" | "code" | "">("");
  const [claimCode, setClaimCode] = useState("");
  const [claimBusy, setClaimBusy] = useState(false);
  const [claimMessage, setClaimMessage] = useState("");

  const load = async () => {
    setLoading(true); setError("");
    try {
      setData(await invokeReferral({ action: "dashboard" }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load referrals.");
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const copy = async (value: string, kind: "link" | "code") => {
    await navigator.clipboard.writeText(value);
    setCopied(kind);
    window.setTimeout(() => setCopied(""), 1500);
  };

  const claim = async () => {
    if (!claimCode.trim() || claimBusy) return;
    setClaimBusy(true); setClaimMessage("");
    try {
      await invokeReferral({ action: "claim_code", code: claimCode.trim(), source: "code" });
      setClaimCode(""); setClaimMessage("Referral code applied.");
      await load();
    } catch (caught) { setClaimMessage(caught instanceof Error ? caught.message : "Unable to apply referral code."); }
    finally { setClaimBusy(false); }
  };

  if (loading) return <div className={styles.loading}>Loading referral dashboard…</div>;
  if (error || !data?.referral || !data.program || !data.earnings) return <div className={styles.loading}><strong>Referral dashboard unavailable</strong><span>{error || "Please try again."}</span><button onClick={() => void load()}>Retry</button></div>;

  const { referral, program, earnings } = data;
  const currency = program.currency || "USD";
  const totalEarned = earnings.pending + earnings.available + earnings.paid;

  return <div className={styles.page}>
    <div className={styles.heading}><div><small>REFERRAL PROGRAM</small><h1>Earn when your network grows.</h1><p>Share LabNarrative, track your referrals, and see commissions from all three levels.</p></div><span className={styles.status}>{referral.status}</span></div>

    <section className={styles.shareCard}>
      <div><small>YOUR REFERRAL LINK</small><strong>{referral.url}</strong><p>New customers receive {percent(program.customer_discount_bps)} off when paid checkout launches.</p></div>
      <div className={styles.shareActions}><button onClick={() => void copy(referral.url, "link")}>{copied === "link" ? "Copied" : "Copy link"}</button><button onClick={() => void copy(referral.code, "code")}>{copied === "code" ? "Copied" : `Code · ${referral.code}`}</button></div>
    </section>

    <div className={styles.metrics}>
      <article><span>Total earned</span><strong>{money(totalEarned, currency)}</strong><small>Pending + available + paid</small></article>
      <article><span>Available</span><strong>{money(earnings.available, currency)}</strong><small>{money(program.payout_minimum_cents, currency)} payout threshold</small></article>
      <article><span>Pending</span><strong>{money(earnings.pending, currency)}</strong><small>{program.commission_hold_days}-day safety hold</small></article>
      <article><span>Direct referrals</span><strong>{referral.directReferrals}</strong><small>Level 1 customers</small></article>
    </div>

    <div className={styles.grid}>
      <section className={styles.panel}><div className={styles.panelHead}><div><small>COMMISSION STRUCTURE</small><h2>Three levels of earnings</h2></div></div><div className={styles.planHead}><span>Level</span><span>Monthly</span><span>Annual prepaid</span></div>{[1,2,3].map((level) => <div className={styles.planRow} key={level}><div><b>Level {level}</b><small>{level === 1 ? "Your direct referral" : level === 2 ? "Referral of your referral" : "Third network level"}</small></div><strong>{percent(program[`monthly_l${level}_bps` as keyof Program] as number)}</strong><strong>{percent(program[`annual_l${level}_bps` as keyof Program] as number)}</strong></div>)}</section>
      <section className={styles.panel}><div className={styles.panelHead}><div><small>EARNINGS</small><h2>Commission balance</h2></div></div><div className={styles.balanceRows}><div><span>Pending</span><b>{money(earnings.pending, currency)}</b></div><div><span>Available for payout</span><b>{money(earnings.available, currency)}</b></div><div><span>Paid</span><b>{money(earnings.paid, currency)}</b></div><div className={styles.muted}><span>Reversed</span><b>{money(earnings.reversed, currency)}</b></div></div><p className={styles.note}>Payout methods and schedule will activate with paid subscriptions. No payout action is shown until the billing layer is real.</p></section>
    </div>

    <section className={styles.panel}><div className={styles.panelHead}><div><small>YOUR REFERRER</small><h2>{referral.attribution ? "You joined through a referral" : "No referral attached"}</h2></div></div>{referral.attribution ? <p className={styles.referrer}>Referral code <b>{referral.attribution.referral_code}</b> is attached to your user identity.</p> : <div className={styles.claim}><div><p>If someone introduced you to LabNarrative, you can attach their code before your first paid subscription.</p><small>Once attributed, the referral relationship is permanent.</small></div><input value={claimCode} onChange={(event) => setClaimCode(event.target.value.toUpperCase())} placeholder="Referral code"/><button disabled={claimBusy || !claimCode.trim()} onClick={() => void claim()}>{claimBusy ? "Applying…" : "Apply code"}</button></div>}{claimMessage && <p className={styles.claimMessage}>{claimMessage}</p>}</section>
  </div>;
}
