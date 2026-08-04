import type { Metadata } from "next";
import MarketingShell from "@/components/marketing/MarketingShell";
import styles from "@/components/marketing/marketing.module.css";

export const metadata: Metadata = {
  title: "Terms",
  description: "LabNarrative website terms.",
};

export default function TermsPage() {
  return (
    <MarketingShell>
      <section className={styles.pageHero}>
        <p className={styles.eyebrow}>Terms</p>
        <h1>Website concepts, proposals and service terms.</h1>
        <p>Effective August 2026.</p>
      </section>
      <section className={styles.contentSection}>
        <div className={styles.contentNarrow}>
          <h2>Independent concepts</h2>
          <p>
            Public concepts labelled as independent are speculative demonstrations. They are not
            official websites, endorsements or representations of the named laboratory unless a
            formal client relationship is stated.
          </p>
          <h2>Proposals and payments</h2>
          <p>
            Website scope, timelines, revisions, payments and ongoing care are confirmed in the
            written proposal or invoice provided for each project. A website enquiry alone does
            not create a service agreement.
          </p>
          <h2>Scientific review</h2>
          <p>
            LabNarrative researches and drafts scientific content carefully, but the client is
            responsible for reviewing and approving official content before public launch.
          </p>
          <h2>Third-party services</h2>
          <p>
            Domains, hosting, payment processing, email and other technical services may depend on
            third-party providers and their availability.
          </p>
          <h2>Contact</h2>
          <p>Questions about these terms can be sent to hello@labnarrative.com.</p>
        </div>
      </section>
    </MarketingShell>
  );
}
