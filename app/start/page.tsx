import type { Metadata } from "next";
import InquiryForm from "@/components/marketing/InquiryForm";
import MarketingShell from "@/components/marketing/MarketingShell";
import styles from "@/components/marketing/marketing.module.css";

export const metadata: Metadata = {
  title: "Start a project",
  description: "Send a laboratory profile to begin a private LabNarrative website concept.",
};

export default function StartPage() {
  return (
    <MarketingShell>
      <section className={styles.pageHero}>
        <p className={styles.eyebrow}>Start a project</p>
        <h1>Share the laboratory. We’ll study the story.</h1>
        <p>
          Send the PI name, institution and official profile. This is enough for an initial review
          and a recommended design direction.
        </p>
      </section>
      <section className={styles.inquiryWrap}>
        <aside className={styles.inquiryAside}>
          <p className={styles.eyebrow}>Project enquiry</p>
          <h2>What happens next?</h2>
          <p>
            LabNarrative reviews the scientific profile, publications and current website, then
            responds with the recommended scope and next steps.
          </p>
          <p>
            Prefer email? Write directly to{" "}
            <a href="mailto:hello@labnarrative.com">hello@labnarrative.com</a>.
          </p>
        </aside>
        <InquiryForm />
      </section>
    </MarketingShell>
  );
}
