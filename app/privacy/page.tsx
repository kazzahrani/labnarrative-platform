import type { Metadata } from "next";
import MarketingShell from "@/components/marketing/MarketingShell";
import styles from "@/components/marketing/marketing.module.css";

export const metadata: Metadata = {
  title: "Privacy",
  description: "LabNarrative privacy notice.",
};

export default function PrivacyPage() {
  return (
    <MarketingShell>
      <section className={styles.pageHero}>
        <p className={styles.eyebrow}>Privacy</p>
        <h1>How enquiry information is handled.</h1>
        <p>Effective August 2026.</p>
      </section>
      <section className={styles.contentSection}>
        <div className={styles.contentNarrow}>
          <h2>Information collected</h2>
          <p>
            LabNarrative may collect the information you submit through the project enquiry form,
            including your name, email, institution, website links, project preferences and
            message.
          </p>
          <h2>How it is used</h2>
          <p>
            This information is used to assess and respond to your enquiry, prepare proposals,
            deliver requested services and maintain necessary business records. LabNarrative does
            not sell enquiry information to advertisers.
          </p>
          <h2>Storage and service providers</h2>
          <p>
            Website and enquiry data may be processed through service providers used to operate
            LabNarrative, including hosting, database, email and payment providers.
          </p>
          <h2>Contact</h2>
          <p>
            Questions or requests concerning your submitted information can be sent to
            hello@labnarrative.com.
          </p>
        </div>
      </section>
    </MarketingShell>
  );
}
