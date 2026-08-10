"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { browserSupabase as supabase } from "@/lib/supabase-browser";
import styles from "./proposal-public.module.css";

type Proposal = {
  id: string;
  status: string;
  version: number;
  package_name: string;
  title: string;
  summary_text: string;
  scope_items: string[];
  deliverable_items: string[];
  process_items: string[];
  timeline_label: string;
  price_amount: number | string;
  currency: string;
  deposit_percent: number | string;
  deposit_base_amount?: number | string | null;
  valid_until: string;
  terms_text: string;
  sent_at?: string | null;
  accepted_at?: string | null;
  accepted_by_name?: string | null;
  declined_at?: string | null;
};

type PublicData = {
  proposal: Proposal;
  prospect: { pi_name: string; institution: string; department?: string | null; email?: string | null };
  site: { slug?: string; domain_url?: string | null; content?: { labName?: string | null; headline?: string | null } | null } | null;
  payment?: { token: string; status: string; amount: number | string; currency: string; paid_at?: string | null } | null;
  error?: string;
};

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "long", year: "numeric" }).format(date);
}

function money(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD", maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${currency || "USD"} ${amount.toFixed(2)}`;
  }
}

export default function PublicProposalPage() {
  const params = useParams<{ token: string }>();
  const token = String(params?.token || "");
  const [data, setData] = useState<PublicData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [decision, setDecision] = useState<"accept" | "decline" | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    const { data: response, error: rpcError } = await supabase.rpc("sales_public_proposal_get", { p_token: token });
    if (rpcError) setError(rpcError.message);
    else if (response && typeof response === "object" && "error" in response) setError(String((response as { error?: string }).error || "Proposal unavailable."));
    else setData(response as PublicData);
    setLoading(false);
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const amount = Number(data?.proposal.price_amount || 0) || 0;
  const depositPercent = Number(data?.proposal.deposit_percent || 0) || 0;
  const rawDepositBase = data?.proposal.deposit_base_amount == null ? amount : Number(data.proposal.deposit_base_amount);
  const depositBaseAmount = Number.isFinite(rawDepositBase) ? rawDepositBase : amount;
  const depositAmount = useMemo(() => Math.round(depositBaseAmount * depositPercent) / 100, [depositBaseAmount, depositPercent]);
  const balanceAmount = Math.max(0, amount - depositAmount);
  const customDepositBase = data?.proposal.deposit_base_amount != null && depositBaseAmount !== amount;
  const websiteUrl = data?.site?.domain_url || (data?.site?.slug ? `https://${data.site.slug}.labnarrative.com` : "");

  async function submitDecision() {
    if (!decision || !name.trim()) return;
    setSubmitting(true);
    setError("");
    const { data: response, error: rpcError } = await supabase.rpc("sales_public_proposal_decide", {
      p_token: token,
      p_decision: decision,
      p_name: name,
      p_email: email || null,
    });
    if (rpcError) setError(rpcError.message);
    else if (response && typeof response === "object" && "error" in response) setError(String((response as { error?: string }).error || "The decision could not be recorded."));
    else {
      setResult(decision === "accept" ? "Proposal approved. Your secure deposit request is ready below." : "Your response has been recorded.");
      setDecision(null);
      await load();
    }
    setSubmitting(false);
  }

  if (loading) return <main className={styles.statePage}>Opening proposal…</main>;
  if (!data || error) return <main className={styles.statePage}><section><div className={styles.logo}>LabNarrative</div><h1>Proposal unavailable.</h1><p>{error || "This private proposal link is unavailable or has been disabled."}</p></section></main>;

  const { proposal, prospect } = data;
  const closed = proposal.status === "accepted" || proposal.status === "declined" || proposal.status === "expired";

  return (
    <main className={styles.page}>
      <div className={styles.topActions}>
        <button type="button" onClick={() => window.print()}>Print / Save PDF</button>
      </div>

      <section className={styles.paper}>
        <header className={styles.header}>
          <div><div className={styles.logo}>LabNarrative</div><p>Scientific websites for research groups</p></div>
          <div className={styles.meta}><span>Proposal #{proposal.id.slice(0,8).toUpperCase()}</span><span>Version {proposal.version}</span><span>Valid until {formatDate(proposal.valid_until)}</span></div>
        </header>

        <section className={styles.hero}>
          <div><p className={styles.eyebrow}>Prepared for</p><h1>{prospect.pi_name}</h1><p>{prospect.institution}{prospect.department ? ` · ${prospect.department}` : ""}</p></div>
          <h2>{proposal.title}</h2>
        </section>

        {websiteUrl ? <section className={styles.concept}><div><span>Prepared concept</span><strong>{data.site?.content?.labName || `${prospect.pi_name} laboratory website`}</strong></div><a href={websiteUrl} target="_blank" rel="noreferrer">View current concept ↗</a></section> : null}

        <p className={styles.summary}>{proposal.summary_text}</p>

        <section className={styles.block}><div className={styles.heading}><span>01</span><h3>Scope of work</h3></div><ul>{proposal.scope_items.map((item,index)=><li key={index}>{item}</li>)}</ul></section>
        <section className={styles.block}><div className={styles.heading}><span>02</span><h3>Deliverables</h3></div><ul>{proposal.deliverable_items.map((item,index)=><li key={index}>{item}</li>)}</ul></section>

        <section className={styles.commercial}>
          <article><span>Package</span><strong>{proposal.package_name}</strong></article>
          <article><span>Timeline</span><strong>{proposal.timeline_label}</strong></article>
          <article><span>Investment</span><strong>{money(amount,proposal.currency)}</strong></article>
        </section>

        <section className={styles.block}><div className={styles.heading}><span>03</span><h3>Project process</h3></div><ol>{proposal.process_items.map((item,index)=><li key={index}>{item}</li>)}</ol></section>

        <section className={styles.payment}>
          <div>
            <p className={styles.eyebrow}>Payment structure</p>
            <h3>{depositPercent}% deposit to begin</h3>
            <p>{customDepositBase ? `The deposit is calculated on ${money(depositBaseAmount, proposal.currency)} of the project total. The excluded portion is payable with the remaining balance.` : "The remaining balance is due before final handover."}</p>
          </div>
          <dl>
            <div><dt>Project total</dt><dd>{money(amount,proposal.currency)}</dd></div>
            {customDepositBase ? <div><dt>Deposit base</dt><dd>{money(depositBaseAmount,proposal.currency)}</dd></div> : null}
            <div><dt>Deposit</dt><dd>{money(depositAmount,proposal.currency)}</dd></div>
            <div><dt>Remaining balance</dt><dd>{money(balanceAmount,proposal.currency)}</dd></div>
          </dl>
        </section>

        <section className={styles.block}><div className={styles.heading}><span>04</span><h3>Terms & validity</h3></div><p className={styles.terms}>{proposal.terms_text}</p></section>

        <section className={styles.decisionSection}>
          {proposal.status === "accepted" ? (
            <div className={styles.accepted}>
              <span>Approved</span>
              <h3>Thank you — the proposal has been approved.</h3>
              <p>Approval was recorded {proposal.accepted_at ? `on ${formatDate(proposal.accepted_at)}` : ""}{proposal.accepted_by_name ? ` by ${proposal.accepted_by_name}` : ""}. The project begins after the stated deposit is received.</p>
              {data.payment?.token ? <a className={styles.paymentLink} href={`/pay/${data.payment.token}`}>{data.payment.status === "paid" ? "View payment receipt" : `Continue to secure deposit payment · ${money(Number(data.payment.amount || depositAmount), data.payment.currency || proposal.currency)}`} →</a> : null}
            </div>
          ) : proposal.status === "declined" ? (
            <div className={styles.closed}><span>Response recorded</span><h3>This proposal was declined.</h3><p>Thank you for letting us know.</p></div>
          ) : proposal.status === "expired" ? (
            <div className={styles.closed}><span>Expired</span><h3>This proposal is no longer active.</h3><p>Please contact LabNarrative if you would like an updated proposal.</p></div>
          ) : (
            <>
              <div><p className={styles.eyebrow}>Next step</p><h3>Ready to proceed?</h3><p>Approval records your intention to proceed with this proposal. Project work begins after the stated deposit is received.</p></div>
              <div className={styles.decisionButtons}><button type="button" className={styles.acceptButton} onClick={()=>setDecision("accept")}>Approve proposal</button><button type="button" onClick={()=>setDecision("decline")}>Decline</button></div>
            </>
          )}
          {result ? <p className={styles.result}>{result}</p> : null}
        </section>

        <footer className={styles.footer}><div><strong>LabNarrative</strong><span>Research deserves a clear digital home.</span></div><div><span>Prepared by</span><strong>Khaled Azzahrani, Ph.D.</strong></div></footer>
      </section>

      {decision && !closed ? (
        <div className={styles.modalBackdrop} onMouseDown={(event)=>{if(event.target===event.currentTarget)setDecision(null);}}>
          <section className={styles.modal} role="dialog" aria-modal="true">
            <p className={styles.eyebrow}>{decision === "accept" ? "Approve proposal" : "Decline proposal"}</p>
            <h2>{decision === "accept" ? "Confirm that you would like to proceed." : "Confirm your response."}</h2>
            <label><span>Your name</span><input value={name} onChange={(event)=>setName(event.target.value)} autoFocus /></label>
            <label><span>Email (optional)</span><input type="email" value={email} onChange={(event)=>setEmail(event.target.value)} /></label>
            {decision === "accept" ? <p className={styles.modalNote}>This records approval of the proposal and prepares the exact deposit request. It does not charge your card or initiate payment.</p> : null}
            {error ? <p className={styles.error}>{error}</p> : null}
            <div className={styles.modalActions}><button type="button" onClick={()=>setDecision(null)}>Cancel</button><button type="button" className={decision === "accept" ? styles.acceptButton : styles.declineButton} onClick={()=>void submitDecision()} disabled={submitting || name.trim().length < 2}>{submitting ? "Recording…" : decision === "accept" ? "Confirm approval" : "Confirm decline"}</button></div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
