import type { Metadata } from "next";
import Link from "next/link";
import MarketingShell from "@/components/marketing/MarketingShell";
import styles from "@/components/marketing/marketing.module.css";

export const metadata: Metadata = {
  title: "Research websites for scientific laboratories",
  description:
    "LabNarrative researches, writes and designs modern laboratory websites for principal investigators.",
};

const work = [
  {
    label: "Molecular oncology",
    design: "Bourdon Full",
    title: "A complete laboratory narrative",
    description:
      "A multi-page concept organised around research programmes, publications, people and opportunities.",
    image:
      "https://www.masseycancercenter.org/media/massey-cancer-center/massey-media/Litovchick_Larisa.jpg",
    href: "https://litovchick.labnarrative.com",
  },
  {
    label: "Cancer evolution",
    design: "Scientific editorial",
    title: "Complex biology, made legible",
    description:
      "A focused identity for work spanning TP53 biology, YB-1, genomics and precision medicine.",
    image: "https://www.waikato.ac.nz/assets/4301564.jpeg",
    href: "https://mehta.labnarrative.com",
  },
  {
    label: "Retinal cancer",
    design: "Editorial Image",
    title: "A brighter image-led system",
    description:
      "A new reusable design direction built around bold science, strong imagery and restrained typography.",
    image:
      "https://umhkpflyzlifiufvejwr.supabase.co/storage/v1/object/public/labnarrative-images/rod-bremner/homepage-hero/1785746226962-2f486e62-57bb-4182-a382-180fd5317d2e.jpg",
    href: "/work",
  },
];

export default function HomePage() {
  return (
    <MarketingShell>
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>Research websites for scientific laboratories</p>
          <h1>Your research deserves a clearer story.</h1>
          <p className={styles.heroLead}>
            We research, write and design modern laboratory websites—so principal investigators
            can present their science without becoming web designers.
          </p>
          <div className={styles.buttonRow}>
            <Link href="/start" className={styles.primaryButton}>
              Request a private concept
            </Link>
            <Link href="/work" className={styles.secondaryButton}>
              View selected work
            </Link>
          </div>
        </div>
        <div className={styles.heroVisual} aria-label="Examples of LabNarrative website designs">
          <div className={styles.browserStack}>
            <div className={styles.browserFrame}>
              <div className={styles.browserBar}>
                <span />
                <span />
                <span />
              </div>
              <div className={styles.browserImage}>
                <img
                  src="https://umhkpflyzlifiufvejwr.supabase.co/storage/v1/object/public/labnarrative-images/rod-bremner/homepage-hero/1785746226962-2f486e62-57bb-4182-a382-180fd5317d2e.jpg"
                  alt="Scientific microscopy used in an image-led laboratory website concept"
                />
                <div className={styles.browserOverlay}>
                  <strong>Finding the rules beneath cancer’s complexity.</strong>
                  <span>Editorial Image</span>
                </div>
              </div>
            </div>
            <div className={styles.browserFrame}>
              <div className={styles.browserBar}>
                <span />
                <span />
                <span />
              </div>
              <div className={styles.browserImage}>
                <img
                  src="https://www.waikato.ac.nz/assets/4301564.jpeg"
                  alt="Principal investigator portrait in a laboratory website concept"
                />
                <div className={styles.browserOverlay}>
                  <strong>One evolving tumour. Multiple layers of adaptation.</strong>
                  <span>Scientific editorial</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.metrics} aria-label="LabNarrative strengths">
        <div className={styles.metric}>
          <strong>Research-led</strong>
          <span>Scientific content shaped from publications and verified sources.</span>
        </div>
        <div className={styles.metric}>
          <strong>Private editing</strong>
          <span>Update projects, people, publications and opportunities without code.</span>
        </div>
        <div className={styles.metric}>
          <strong>Managed launch</strong>
          <span>Domains, HTTPS, hosting and ongoing care handled in one system.</span>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>Selected concepts</p>
            <h2>Different laboratories need different visual languages.</h2>
          </div>
          <p>
            Each concept begins with the PI’s science, institution and audience. The design follows
            the research—not the other way around.
          </p>
        </div>
        <div className={styles.workGrid}>
          {work.map((item) => (
            <article className={styles.workCard} key={item.title}>
              <div className={styles.workImage}>
                <img src={item.image} alt="" />
              </div>
              <div className={styles.workCopy}>
                <div className={styles.workMeta}>
                  <span>{item.label}</span>
                  <span>{item.design}</span>
                </div>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
                <a className={styles.workLink} href={item.href}>
                  View concept →
                </a>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>Why LabNarrative</p>
            <h2>More than a polished template.</h2>
          </div>
          <p>
            The finished website combines scientific interpretation, editorial structure, visual
            design and a practical management system.
          </p>
        </div>
        <div className={styles.valueGrid}>
          {[
            [
              "01",
              "Scientific understanding",
              "We read the institutional profile, research programme and publications before shaping the narrative.",
            ],
            [
              "02",
              "Editorial design",
              "Research is organised into a hierarchy that works for collaborators, trainees, funders and the public.",
            ],
            [
              "03",
              "Ongoing control",
              "Private editing and live preview keep the website useful after launch, without exposing code.",
            ],
          ].map(([number, title, copy]) => (
            <article className={styles.valueCard} key={number}>
              <span className={styles.valueNumber}>{number}</span>
              <h3>{title}</h3>
              <p>{copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.section} id="process">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>How it works</p>
            <h2>From papers to publication.</h2>
          </div>
          <p>
            A concise, guided process keeps the PI focused on scientific accuracy while
            LabNarrative manages the writing, design and technical work.
          </p>
        </div>
        <div className={styles.processGrid}>
          {[
            ["01", "Discover", "We review the laboratory, publications, institution and current digital presence."],
            ["02", "Compose", "We develop the scientific narrative, information architecture and first concept."],
            ["03", "Refine", "You review the private website and request focused scientific and visual changes."],
            ["04", "Launch", "We connect the domain, verify every page and prepare the website for public use."],
          ].map(([number, title, copy]) => (
            <article className={styles.processCard} key={number}>
              <span className={styles.processNumber}>{number}</span>
              <h3>{title}</h3>
              <p>{copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.platformPanel}>
        <div className={styles.platformIntro}>
          <p className={styles.eyebrow}>The LabNarrative platform</p>
          <h2>A website that remains manageable.</h2>
          <p>
            After launch, the laboratory can update content through private access while the public
            website remains clean, accurate and secure.
          </p>
        </div>
        <div className={styles.platformFeatures}>
          {[
            ["Live preview", "See changes in the real website layout before saving or publishing."],
            ["Research management", "Maintain programmes, central questions, figures and landmark papers."],
            ["People and publications", "Add laboratory members and keep selected publications current."],
            ["Version history", "Preserve previous content and restore an earlier version when needed."],
            ["Private access", "Editing controls are never exposed to ordinary website visitors."],
            ["Managed infrastructure", "One platform handles hosting, HTTPS, backups and domain status."],
          ].map(([title, copy]) => (
            <article className={styles.platformFeature} key={title}>
              <strong>{title}</strong>
              <p>{copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>Packages</p>
            <h2>Clear scope. No website-builder learning curve.</h2>
          </div>
          <p>
            Start with a focused presence or build a complete laboratory website. Annual Care keeps
            either option technically supported.
          </p>
        </div>
        <div className={styles.packageGrid}>
          <article className={styles.packageCard}>
            <span className={styles.packageBadge}>Essential</span>
            <h3>Focused laboratory presence</h3>
            <span className={styles.price}>$750</span>
            <p>For a clear, professionally written introduction to the laboratory and its work.</p>
            <ul>
              <li>Research-led scientific narrative</li>
              <li>Responsive modern design</li>
              <li>Selected publications and contact</li>
              <li>Private review and launch support</li>
            </ul>
            <Link href="/packages" className={styles.secondaryButton}>
              View package details
            </Link>
          </article>
          <article className={`${styles.packageCard} ${styles.packageCardFeatured}`}>
            <span className={styles.packageBadge}>Recommended</span>
            <h3>Professional laboratory website</h3>
            <span className={styles.price}>$1,050</span>
            <p>A complete multi-page research website with private content-management access.</p>
            <ul>
              <li>Everything in Essential</li>
              <li>Up to six research programmes</li>
              <li>Unlimited laboratory members</li>
              <li>Publications, opportunities and contact pages</li>
              <li>Private editing, preview and publishing controls</li>
            </ul>
            <Link href="/start" className={styles.primaryButton}>
              Request a concept
            </Link>
          </article>
          <article className={styles.packageCard}>
            <span className={styles.packageBadge}>Annual Care</span>
            <h3>Continuous technical support</h3>
            <span className={styles.price}>$300</span>
            <p>Managed hosting, oversight and routine support for one year.</p>
            <ul>
              <li>Hosting and HTTPS monitoring</li>
              <li>Backups and recovery support</li>
              <li>Routine content assistance</li>
              <li>Domain and platform oversight</li>
            </ul>
            <Link href="/packages" className={styles.secondaryButton}>
              Explore Annual Care
            </Link>
          </article>
        </div>
      </section>

      <section className={styles.founder}>
        <div className={styles.founderImage}>
          <div
            aria-hidden="true"
            style={{
              width: "100%",
              height: "100%",
              minHeight: "560px",
              background:
                "linear-gradient(135deg, rgba(23,53,45,.96), rgba(23,53,45,.62)), radial-gradient(circle at 70% 25%, #e36c50 0 9%, transparent 10%), #17352d",
            }}
          />
        </div>
        <div className={styles.founderCopy}>
          <p className={styles.eyebrow}>Built from inside research</p>
          <h2>Scientific literacy is part of the design process.</h2>
          <p>
            LabNarrative was founded by Khaled Azzahrani, Ph.D., a molecular oncology and
            pharmacology researcher. The service grew from a simple observation: laboratories
            often have important science, but no clear, current place to explain it.
          </p>
          <p>
            That background allows LabNarrative to work from papers, pathways and research
            questions—not only from generic marketing copy.
          </p>
          <Link href="/about" className={styles.inlineButton}>
            About LabNarrative
          </Link>
        </div>
      </section>

      <section className={styles.finalCta}>
        <h2>Send the laboratory profile. We’ll imagine the website.</h2>
        <p>
          Share the PI name, institution and official profile. LabNarrative will review the science
          and propose a suitable direction.
        </p>
        <Link href="/start" className={styles.primaryButton}>
          Start a project
        </Link>
      </section>
    </MarketingShell>
  );
}
