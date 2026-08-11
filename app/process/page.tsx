import Link from "next/link";
import styles from "./process.module.css";

const steps = [
  {
    number: "01",
    phase: "Approve",
    title: "Approve your proposal",
    copy: "Review the agreed scope, deliverables, timeline and project fee. Approval records that you would like to proceed; it does not charge you automatically.",
    client: "You review and approve the private proposal.",
    lab: "We lock the agreed project scope and prepare the deposit request.",
  },
  {
    number: "02",
    phase: "Begin",
    title: "Pay the project deposit",
    copy: "Your secure payment page shows the exact amount before checkout. For standard LabNarrative projects, the deposit is 25% of the approved project fee.",
    client: "You complete the deposit through the secure payment link.",
    lab: "We verify the payment and open your client onboarding workspace.",
  },
  {
    number: "03",
    phase: "Onboard",
    title: "Review your laboratory information",
    copy: "Your private onboarding workspace is pre-filled with information we already have. You only need to correct, add or confirm what matters—research, people, publications, contact details, images, branding, domain preferences and opportunities.",
    client: "You review each section, upload any final assets and submit your notes.",
    lab: "We review your submission and identify the changes required for the final website.",
  },
  {
    number: "04",
    phase: "Refine",
    title: "We refine the website",
    copy: "We apply the approved onboarding changes to the website, including content, people, images, navigation and visual details. Changes are prepared through a controlled revision workflow rather than editing the live site blindly.",
    client: "Usually nothing is required from you while this work is being applied.",
    lab: "We revise, validate and prepare the finished website for your review.",
  },
  {
    number: "05",
    phase: "Review",
    title: "Review the finished website",
    copy: "You receive a private final-review link tied to the exact website version we are asking you to approve. You can approve it or send focused change requests.",
    client: "You review the real website and either approve it or request changes.",
    lab: "If changes are requested, we revise the site and send a new review version.",
  },
  {
    number: "06",
    phase: "Complete",
    title: "Pay the remaining balance",
    copy: "Once you approve the finished website, the remaining project balance becomes due. For standard projects this is the remaining 75%. The exact amount always comes from your approved proposal and recorded deposit.",
    client: "You complete the final balance payment through the secure payment page.",
    lab: "We verify payment and move the project into the final launch checklist.",
  },
  {
    number: "07",
    phase: "Launch",
    title: "We launch your website",
    copy: "Before launch, we complete the final operational checks—including domain readiness, HTTPS, mobile presentation, links, branding and website health. The website is launched only after the approved version and payment status are confirmed.",
    client: "No technical setup is expected from you unless a university or institutional domain requires your involvement.",
    lab: "We complete the launch checks, connect the final address and deliberately launch the approved site.",
  },
  {
    number: "08",
    phase: "Handover",
    title: "Receive your completed website",
    copy: "After launch, you receive a private handover page with the live website address, launch record and support information. You can confirm receipt when everything is in place.",
    client: "You open the live website and confirm handover.",
    lab: "We close the delivery phase and remain available for future support and updates.",
  },
];

const assurances = [
  "No technical knowledge is required from your laboratory.",
  "Nothing is charged merely by approving a proposal or website review.",
  "The website is not launched until the final version is approved and the project is paid in full.",
  "Your proposal remains the definitive source for scope, price, deposit and timeline.",
];

function Wordmark() {
  return <><span className={styles.logoLab}>Lab</span><span>Narrative</span></>;
}

export default function ClientProcessPage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.wordmark} aria-label="LabNarrative home"><Wordmark /></Link>
        <span className={styles.headerLabel}>Your project journey</span>
        <a className={styles.contactLink} href="mailto:hello@labnarrative.com">Questions? Email us ↗</a>
      </header>

      <section className={styles.hero}>
        <p className={styles.eyebrow}>What happens after you approve a proposal?</p>
        <div className={styles.heroGrid}>
          <h1>A clear path from approval to a live laboratory website.</h1>
          <div className={styles.heroAside}>
            <p>
              LabNarrative is designed to keep the process focused on your science—not on web
              development. You review the important decisions; we manage the technical work.
            </p>
            <a href="#journey">See the full process <span aria-hidden="true">↓</span></a>
          </div>
        </div>
      </section>

      <section className={styles.summaryStrip} aria-label="Project summary">
        <div><span>Standard start</span><strong>25% deposit</strong></div>
        <div><span>Your main contribution</span><strong>Review & verify</strong></div>
        <div><span>Before launch</span><strong>Final approval + balance</strong></div>
        <div><span>After launch</span><strong>Handover + optional Care</strong></div>
      </section>

      <section className={styles.intro}>
        <p className={styles.sectionLabel}>The principle</p>
        <div>
          <h2>You stay in control without having to manage the website project.</h2>
          <p>
            Every important transition is visible: proposal approval, payment, onboarding,
            final website review, launch and handover. We do not treat a button click as payment,
            and we do not launch a website simply because development is finished.
          </p>
        </div>
      </section>

      <section className={styles.timeline} id="journey">
        {steps.map((step) => (
          <article className={styles.step} key={step.number}>
            <div className={styles.stepIndex}>
              <span>{step.number}</span>
              <small>{step.phase}</small>
            </div>
            <div className={styles.stepMain}>
              <h2>{step.title}</h2>
              <p>{step.copy}</p>
            </div>
            <div className={styles.responsibility}>
              <div><span>You</span><p>{step.client}</p></div>
              <div><span>LabNarrative</span><p>{step.lab}</p></div>
            </div>
          </article>
        ))}
      </section>

      <section className={styles.assuranceSection}>
        <div>
          <p className={styles.sectionLabel}>Built around clear checkpoints</p>
          <h2>No surprises between “yes” and launch.</h2>
        </div>
        <ul>{assurances.map((item) => <li key={item}>{item}</li>)}</ul>
      </section>

      <section className={styles.careSection}>
        <div>
          <p className={styles.sectionLabel}>After handover</p>
          <h2>Keeping the website current is optional.</h2>
        </div>
        <div>
          <p>
            Your completed website is yours whether or not you continue with a maintenance plan.
            If you prefer ongoing support, LabNarrative Care can cover managed hosting, monitoring
            and routine website updates after delivery.
          </p>
          <p className={styles.careNote}>Care is a separate, optional post-launch service.</p>
        </div>
      </section>

      <section className={styles.faqSection}>
        <p className={styles.sectionLabel}>Common questions</p>
        <div className={styles.faqGrid}>
          <article><h3>Do I need to prepare all website text?</h3><p>No. We begin from the research and material already available. Onboarding is primarily a review-and-correction process.</p></article>
          <article><h3>Can I request changes before launch?</h3><p>Yes. The final website review lets you approve the finished version or send focused change requests before the final balance and launch.</p></article>
          <article><h3>When does the website go live?</h3><p>Only after the final website version is approved, the project is paid in full and the launch checks are complete.</p></article>
          <article><h3>What if my institution controls the domain?</h3><p>We handle the website-side setup and tell you exactly what is needed if your university or institution must make a DNS or domain change.</p></article>
        </div>
      </section>

      <section className={styles.finalCta}>
        <p className={styles.sectionLabel}>Ready to proceed?</p>
        <h2>Your private proposal is the starting point.</h2>
        <p>
          Approve it when the scope and terms are right for your laboratory. From there,
          LabNarrative guides you through each stage until your website is live.
        </p>
        <a href="mailto:hello@labnarrative.com?subject=Question%20about%20the%20LabNarrative%20project%20process">Ask a question <span aria-hidden="true">↗</span></a>
      </section>

      <footer className={styles.footer}>
        <Link href="/" className={styles.wordmark}><Wordmark /></Link>
        <span>Scientific websites for research groups</span>
        <a href="mailto:hello@labnarrative.com">hello@labnarrative.com</a>
      </footer>
    </main>
  );
}
