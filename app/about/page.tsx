import type { Metadata } from "next";
import Link from "next/link";
import MarketingShell from "@/components/marketing/MarketingShell";
import styles from "@/components/marketing/marketing.module.css";

export const metadata: Metadata = {
  title: "About",
  description: "About LabNarrative and its research-led approach to laboratory websites.",
};

export default function AboutPage() {
  return (
    <MarketingShell>
      <section className={styles.pageHero}>
        <p className={styles.eyebrow}>About LabNarrative</p>
        <h1>Website design informed by how research actually works.</h1>
        <p>
          LabNarrative helps principal investigators explain their science clearly, present their
          laboratories professionally and keep their public information current.
        </p>
      </section>
      <section className={styles.contentSection}>
        <div className={styles.contentNarrow}>
          <h2>The idea</h2>
          <p>
            Many laboratory websites are outdated, fragmented or difficult to maintain. Generic
            builders can solve the technical problem, but they rarely solve the scientific one:
            deciding what the laboratory is really about and how its projects connect.
          </p>
          <p>
            LabNarrative begins with the research. Publications, institutional profiles, projects
            and scientific questions are organised into a coherent narrative before the visual
            system is developed.
          </p>
        </div>
      </section>
      <section className={styles.contentSection}>
        <div className={styles.contentNarrow}>
          <h2>Founder</h2>
          <p>
            Khaled Azzahrani, Ph.D., is a molecular oncology and pharmacology researcher with
            experience in transcriptional regulation, tumour-suppressor pathways and scientific
            publication. LabNarrative combines that background with editorial design and a
            purpose-built website platform.
          </p>
          <p>
            The objective is not to make every laboratory look the same. It is to make every
            laboratory easier to understand.
          </p>
          <Link href="/start" className={styles.inlineButton}>
            Discuss a laboratory website
          </Link>
        </div>
      </section>
    </MarketingShell>
  );
}
