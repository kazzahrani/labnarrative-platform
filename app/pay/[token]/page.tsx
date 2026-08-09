"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { browserSupabase as supabase } from "@/lib/supabase-browser";
import styles from "../payment.module.css";

type PaymentData = {
  payment: {
    id: string;
    kind: string;
    status: string;
    proposal_version: number;
    proposal_amount: number | string;
    deposit_percent: number | string;
    amount: number | string;
    currency: string;
    balance_after: number | string;
    provider: string;
    valid_until: string;
    requested_at?: string | null;
    paid_at?: string | null;
    provider_order_id?: string | null;
    provider_capture_id?: string | null;
    payer_name?: string | null;
    payer_email?: string | null;
  };
  proposal: { id: string; title: string; package_name: string; status: string; accepted_at?: string | null };
  prospect: { pi_name: string; institution: string; department?: string | null };
  site: { slug?: string | null; domain_url?: string | null; lab_name?: string | null } | null;
};

type ProviderStatus = { configured: boolean; environment?: string };

function money(amount: number, currency: string) {
  try { return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD", maximumFractionDigits: 2 }).format(amount); }
  catch { return `${currency || "USD"} ${amount.toFixed(2)}`; }
}
function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "long", year: "numeric" }).format(date);
}

export default function PrivatePaymentPage() {
  const params = useParams<{ token: string }>();
  const searchParams = useSearchParams();
  const token = String(params?.token || "");
  const [data, setData] = useState<PaymentData | null>(null);
  const [provider, setProvider] = useState<ProviderStatus>({ configured: false });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const captureStarted = useRef(false);

  const functionUrl = `${String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "")}/functions/v1/paypal-checkout`;

  const callProvider = useCallback(async (action: string, extra: Record<string, unknown> = {}) => {
    if (!functionUrl.startsWith("https://")) throw new Error("Payment service is unavailable.");
    const response = await fetch(functionUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, token, ...extra }),
    });
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) throw new Error(String(payload.error || "Payment provider request failed."));
    return payload;
  }, [functionUrl, token]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    const [{ data: payment, error: rpcError }, providerResult] = await Promise.all([
      supabase.rpc("sales_payment_public_get", { p_token: token }),
      callProvider("status").catch(() => ({ configured: false })),
    ]);
    if (rpcError) setError(rpcError.message);
    else if (payment && typeof payment === "object" && "error" in payment) setError(String((payment as { error?: string }).error || "Payment request unavailable."));
    else setData(payment as PaymentData);
    setProvider({ configured: Boolean(providerResult.configured), environment: String(providerResult.environment || "") });
    setLoading(false);
  }, [callProvider, token]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const paypalState = searchParams.get("paypal");
    const orderId = searchParams.get("token");
    if (paypalState === "cancelled") setNotice("PayPal checkout was cancelled. No payment was recorded. You can try again when ready.");
    if (paypalState !== "return" || !orderId || captureStarted.current || loading || !data || data.payment.status === "paid") return;
    captureStarted.current = true;
    setBusy(true);
    setNotice("Confirming your PayPal payment…");
    setError("");
    void callProvider("capture", { orderId }).then(async (result) => {
      if (result.paid) {
        setNotice("Payment confirmed. Thank you.");
        await load();
        window.history.replaceState({}, "", `/pay/${token}`);
      }
    }).catch((captureError: unknown) => {
      setError(captureError instanceof Error ? captureError.message : "The PayPal payment could not be confirmed.");
    }).finally(() => setBusy(false));
  }, [callProvider, data, load, loading, searchParams, token]);

  async function beginCheckout() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await callProvider("create_order");
      if (result.paid) { await load(); return; }
      const approvalUrl = String(result.approvalUrl || "");
      if (!approvalUrl.startsWith("https://")) throw new Error("PayPal did not return a secure checkout URL.");
      window.location.assign(approvalUrl);
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : "Unable to open PayPal checkout.");
      setBusy(false);
    }
  }

  if (loading) return <main className={styles.statePage}><section className={styles.stateBox}><div className={styles.logo}>LabNarrative</div><h1>Opening secure payment…</h1><p>Loading the approved proposal and deposit request.</p></section></main>;
  if (!data || error && !data) return <main className={styles.statePage}><section className={styles.stateBox}><div className={styles.logo}>LabNarrative</div><h1>Payment unavailable.</h1><p>{error || "This private payment request is unavailable."}</p><a href="mailto:khaled@labnarrative.com">Contact LabNarrative</a></section></main>;

  const amount = Number(data.payment.amount || 0) || 0;
  const total = Number(data.payment.proposal_amount || 0) || 0;
  const balance = Number(data.payment.balance_after || 0) || 0;
  const depositPercent = Number(data.payment.deposit_percent || 0) || 0;
  const currency = data.payment.currency || "USD";
  const paid = data.payment.status === "paid";
  const conceptUrl = data.site?.domain_url || (data.site?.slug ? `https://${data.site.slug}.labnarrative.com` : "");
  const providerReady = provider.configured;

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <a href="/" className={styles.logo}>LabNarrative</a>
          <span className={styles.secure}>Private payment request</span>
        </header>

        {paid ? (
          <section className={styles.paymentGrid}>
            <article className={styles.receipt}>
              <span className={styles.receiptBadge}>Deposit received</span>
              <h1>Payment confirmed.</h1>
              <p>Thank you. The deposit for {data.prospect.pi_name}&apos;s LabNarrative project has been recorded and the project can move into client onboarding.</p>
              <dl>
                <div><dt>Amount received</dt><dd>{money(amount, currency)}</dd></div>
                <div><dt>Payment type</dt><dd>{depositPercent}% project deposit</dd></div>
                <div><dt>Paid on</dt><dd>{formatDate(data.payment.paid_at)}</dd></div>
                {data.payment.provider_capture_id ? <div><dt>Payment reference</dt><dd>{data.payment.provider_capture_id}</dd></div> : null}
                <div><dt>Remaining project balance</dt><dd>{money(balance, currency)}</dd></div>
              </dl>
            </article>
          </section>
        ) : (
          <section className={styles.paymentGrid}>
            <article className={styles.summaryCard}>
              <div className={styles.identity}>
                <p className={styles.eyebrow}>Approved project</p>
                <strong>{data.prospect.pi_name}</strong>
                <span>{data.prospect.institution}{data.prospect.department ? ` · ${data.prospect.department}` : ""}</span>
              </div>

              <p className={styles.eyebrow}>Deposit due</p>
              <div className={styles.amountHero}>
                <strong>{money(amount, currency)}</strong>
                <small>{depositPercent}% of the approved {money(total, currency)} project proposal</small>
              </div>

              <dl className={styles.breakdown}>
                <div><dt>Proposal</dt><dd>{data.proposal.title}</dd></div>
                <div><dt>Package</dt><dd>{data.proposal.package_name}</dd></div>
                <div><dt>Project total</dt><dd>{money(total, currency)}</dd></div>
                <div><dt>Deposit</dt><dd>{money(amount, currency)}</dd></div>
                <div><dt>Remaining after deposit</dt><dd>{money(balance, currency)}</dd></div>
                <div><dt>Payment request valid until</dt><dd>{formatDate(data.payment.valid_until)}</dd></div>
              </dl>
              {conceptUrl ? <a className={styles.conceptLink} href={conceptUrl} target="_blank" rel="noreferrer">View website concept ↗</a> : null}
            </article>

            <aside className={styles.checkoutCard}>
              <p className={styles.eyebrow}>Secure checkout</p>
              <h2>Confirm the project deposit.</h2>
              <p>The amount is locked to the approved proposal. It cannot be changed from this page. Project work begins after the deposit is successfully captured and recorded.</p>
              <div className={styles.providerLine}><span className={`${styles.providerDot} ${providerReady ? styles.providerDotReady : ""}`} />{providerReady ? "PayPal checkout connected" : "PayPal checkout awaiting activation"}</div>
              <button className={styles.payButton} type="button" onClick={() => void beginCheckout()} disabled={busy || !providerReady}>{busy ? "Please wait…" : `Pay ${money(amount, currency)} with PayPal`}</button>
              {!providerReady ? <p className={styles.notice}>The payment request is ready, but online PayPal checkout has not yet been activated by LabNarrative. No payment can be taken until the secure provider connection is configured.</p> : null}
              {notice ? <p className={styles.notice}>{notice}</p> : null}
              {error ? <p className={styles.error}>{error}</p> : null}
              <p className={styles.finePrint}>LabNarrative records payment only after the payment provider confirms a completed capture for this exact amount and currency.</p>
            </aside>
          </section>
        )}

        <footer className={styles.contact}>
          <span>Questions about this payment request?</span>
          <a href="mailto:khaled@labnarrative.com">khaled@labnarrative.com</a>
        </footer>
      </div>
    </main>
  );
}
