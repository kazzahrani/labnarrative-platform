import type { Metadata } from "next";
import Link from "next/link";
import MarketingShell from "@/components/marketing/MarketingShell";
import styles from "@/components/marketing/marketing.module.css";

export const metadata: Metadata = {
  title: "Packages",
  description: "LabNarrative website packages for principal investigators and research laboratories.",
};

export default function PackagesPage() {
  return (
    <MarketingShell>
      <section className={styles.pageHero}>
        <p className={styles.eyebrow}>Packages</p>
        <h1>A clear investment in a clearer scientific presence.</h1>
        <p>
          Every project includes research, writing, design, responsive development and a private
          review process. A 25% deposit reserves the project.
        </p>
      </section>
      <section className={styles.contentSection}>
        <div className={styles.packageGrid}>
          <article className={styles.packageCard}>
            <span className={styles.packageBadge}>Essential</span>
            <h3>Focused laboratory presence</h3>
            <span className={styles.price}>$750</span>
            <p>A concise website for a PI or laboratory that needs a clear, credible public home.</p>
            <ul>
              <li>Research and institutional review</li>
              <li>Scientific narrative and copywriting</li>
              <li>Modern responsive design</li>
              <li>Research overview and selected publications</li>
              <li>Contact and institutional links</li>
              <li>Private review before launch</li>
            </ul>
            <Link href="/start" className={styles.secondaryButton}>
              Start with Essential
            </Link>
          </article>
          <article className={`${styles.packageCard} ${styles.packageCardFeatured}`}>
            <span className={styles.packageBadge}>Recommended</span>
            <h3>Professional laboratory website</h3>
            <span className={styles.price}>$1,050</span>
            <p>A complete multi-page system for established or growing research groups.</p>
            <ul>
              <li>Everything in Essential</li>
              <li>Home, Research, Publications, Members, Join and Contact</li>
              <li>Up to six research programmes</li>
              <li>Unlimited laboratory members</li>
              <li>Private editing and live preview</li>
              <li>Client publishing controls</li>
            </ul>
            <Link href="/start" className={styles.primaryButton}>
              Request a Professional concept
            </Link>
          </article>
          <article className={styles.packageCard}>
            <span className={styles.packageBadge}>Annual Care</span>
            <h3>Managed support for one year</h3>
            <span className={styles.price}>$300</span>
            <p>Recommended for laboratories that want the website continuously supported.</p>
            <ul>
              <li>Managed hosting and HTTPS</li>
              <li>Backups and recovery assistance</li>
              <li>Domain and platform oversight</li>
              <li>Routine publication and personnel support</li>
              <li>Continued private platform access</li>
            </ul>
            <Link href="/start" className={styles.secondaryButton}>
              Include Annual Care
            </Link>
          </article>
        </div>
      </section>
      <section className={styles.contentSection}>
        <div className={styles.contentNarrow}>
          <p className={styles.eyebrow}>Common questions</p>
          <div className={styles.faq}>
            <details>
              <summary>How long does a website take?</summary>
              <p>
                A first review is normally prepared within 3–5 days. A typical launch takes 7–10
                days, depending on feedback, content volume and domain readiness.
              </p>
            </details>
            <details>
              <summary>Who owns the website and domain?</summary>
              <p>
                The laboratory retains control of its domain. The completed content can also be
                exported, while managed hosting and editing are provided through LabNarrative.
              </p>
            </details>
            <details>
              <summary>Can the laboratory make its own updates?</summary>
              <p>
                Professional websites include private access for updating research, publications,
                team profiles, images and opportunities.
              </p>
            </details>
            <details>
              <summary>What happens after the first year?</summary>
              <p>
                Annual Care can be renewed for $300 per year. It covers managed hosting, oversight,
                backups and routine support.
              </p>
            </details>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
