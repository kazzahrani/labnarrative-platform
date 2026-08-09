import Link from "next/link";
import styles from "./payment.module.css";

export default function PaymentLandingPage() {
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <Link href="/" className={styles.logo}>LabNarrative</Link>
          <span className={styles.secure}>Secure project payments</span>
        </header>

        <section className={styles.hero}>
          <div>
            <p className={styles.eyebrow}>Payments</p>
            <h1>A clear payment step for every project.</h1>
          </div>
          <p className={styles.heroText}>LabNarrative payment requests are created from an approved project proposal. The private payment link shows the exact project total, deposit, remaining balance and payment status before checkout.</p>
        </section>

        <section className={styles.card}>
          <p className={styles.eyebrow}>Private payment link</p>
          <h2>Use the link provided with your approved proposal.</h2>
          <p className={styles.muted}>For security, project amounts cannot be entered or changed on this page. If you have approved a proposal, return to that proposal and choose the secure deposit payment step, or use the private payment link supplied by LabNarrative.</p>
          <div className={styles.steps}>
            <article className={styles.step}><span>01</span><strong>Approve</strong><p>Confirm the project scope and commercial terms in your private proposal.</p></article>
            <article className={styles.step}><span>02</span><strong>Review</strong><p>Open the generated payment request and verify the exact deposit and remaining balance.</p></article>
            <article className={styles.step}><span>03</span><strong>Pay</strong><p>Complete the payment through the secure provider checkout when available.</p></article>
          </div>
        </section>

        <footer className={styles.contact}>
          <span>Need help locating your payment request?</span>
          <a href="mailto:khaled@labnarrative.com">khaled@labnarrative.com</a>
        </footer>
      </div>
    </main>
  );
}
