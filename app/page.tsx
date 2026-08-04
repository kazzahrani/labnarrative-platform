import styles from "./page.module.css";

const concepts = [
  {
    name: "Bremner Laboratory",
    field: "Cancer states · Retinal biology",
    description:
      "An editorial, image-led concept connecting transformation competence, retinoblastoma and retinal regeneration.",
    href: "https://bremner.labnarrative.com",
  },
  {
    name: "Litovchick Laboratory",
    field: "DREAM · Cell-cycle control",
    description:
      "A structured scientific identity for a laboratory studying transcriptional regulation, cancer and the mammalian DREAM complex.",
    href: "https://litovchick.labnarrative.com",
  },
  {
    name: "Bourdon Laboratory",
    field: "p53 isoforms · Cell fate",
    description:
      "A complete multi-page research website presenting connected programmes in p53 biology, cancer, ageing and therapeutic development.",
    href: "https://bourdon.labnarrative.com",
  },
  {
    name: "Chen Laboratory",
    field: "Tumour suppressors · Cancer biology",
    description:
      "A modern visual direction built around tumour-suppressor research, genomic stability and cancer mechanisms.",
    href: "https://chen.labnarrative.com",
  },
];

const approach = [
  {
    number: "01",
    title: "We understand the science",
    description:
      "We read the laboratory’s publications and organise its research into a clear, accurate story—without asking the principal investigator to write the website alone.",
  },
  {
    number: "02",
    title: "We design the experience",
    description:
      "Research, people, publications, opportunities and collaborations are shaped into a calm, modern and distinctive online presence.",
  },
  {
    number: "03",
    title: "We make launch effortless",
    description:
      "LabNarrative handles the scientific writing, structure, design, development, domain connection and final launch as one complete service.",
  },
];

const process = [
  {
    number: "01",
    title: "Discover",
    description:
      "We study your laboratory, recent papers, research programmes and current online presence.",
  },
  {
    number: "02",
    title: "Compose",
    description:
      "We shape the scientific narrative and build a private website concept around the work your group actually does.",
  },
  {
    number: "03",
    title: "Refine",
    description:
      "You verify the science and guide focused adjustments to the content, imagery and visual direction.",
  },
  {
    number: "04",
    title: "Launch",
    description:
      "We connect the domain, publish the website and provide private access for future updates.",
  },
];

const packages = [
  {
    name: "Essential",
    price: "$750",
    suffix: "one-time",
    audience: "For focused and emerging laboratories",
    features: [
      "Custom scientific website direction",
      "Research copy and content organisation",
      "Responsive design",
      "Core research, team and contact sections",
      "Domain connection and launch",
    ],
  },
  {
    name: "Professional",
    price: "$1,050",
    suffix: "one-time",
    audience: "For active groups with people and projects",
    featured: true,
    features: [
      "Everything included in Essential",
      "Complete multi-page laboratory website",
      "Up to six research projects",
      "Unlimited laboratory members",
      "Publications and opportunities sections",
      "Private editing and publishing access",
    ],
  },
  {
    name: "Annual Care",
    price: "$300",
    suffix: "per year",
    audience: "For a website that stays current",
    features: [
      "Managed hosting and maintenance",
      "Backups and technical updates",
      "Routine content support",
      "Domain and delivery monitoring",
      "Priority assistance",
    ],
  },
];

export default function HomePage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <a className={styles.wordmark} href="#top" aria-label="LabNarrative home">
          LabNarrative
        </a>

        <nav className={styles.nav} aria-label="Primary navigation">
          <a href="#work">Work</a>
          <a href="#process">Process</a>
          <a href="#pricing">Pricing</a>
          <a
            className={styles.headerCta}
            href="mailto:hello@labnarrative.com?subject=Laboratory%20website%20enquiry"
          >
            Start a project <span aria-hidden="true">↗</span>
          </a>
        </nav>
      </header>

      <section className={styles.hero} id="top">
        <p className={styles.kicker}>Websites for scientific laboratories</p>
        <h1>
          Good science deserves
          <span>to be presented well.</span>
        </h1>
        <p className={styles.heroText}>
          LabNarrative researches, writes and designs modern laboratory websites—so principal
          investigators can present their science clearly without becoming web designers.
        </p>
        <a
          className={styles.primaryCta}
          href="mailto:hello@labnarrative.com?subject=Request%20a%20private%20laboratory%20concept"
        >
          Request a private concept <span aria-hidden="true">↗</span>
        </a>

        <div className={styles.heroPrinciples} aria-label="LabNarrative strengths">
          <span>Scientific understanding</span>
          <span>Editorial design</span>
          <span>Effortless launch</span>
        </div>
      </section>

      <section className={styles.approachSection} id="approach">
        <div className={styles.introBlock}>
          <p className={styles.sectionLabel}>The LabNarrative approach</p>
          <h2>
            Not a generic template filled with scientific words. A considered digital home built
            around the work your laboratory actually does.
          </h2>
        </div>

        <div className={styles.approachGrid}>
          {approach.map((item) => (
            <article className={styles.approachItem} key={item.number}>
              <span className={styles.number}>{item.number}</span>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.workSection} id="work">
        <div className={styles.sectionHeadingRow}>
          <div>
            <p className={styles.sectionLabel}>Selected concepts</p>
            <h2>Different science deserves a different identity.</h2>
          </div>
          <p>
            Each direction is shaped around the laboratory’s research rather than a generic visual
            theme. These concepts show how different scientific programmes can become clear,
            coherent online experiences.
          </p>
        </div>

        <div className={styles.conceptList}>
          {concepts.map((concept, index) => (
            <a
              className={styles.conceptItem}
              href={concept.href}
              key={concept.name}
              target="_blank"
              rel="noreferrer"
            >
              <span className={styles.conceptIndex}>{String(index + 1).padStart(2, "0")}</span>
              <div className={styles.conceptTitle}>
                <span>{concept.field}</span>
                <h3>{concept.name}</h3>
              </div>
              <p>{concept.description}</p>
              <span className={styles.conceptArrow} aria-hidden="true">↗</span>
            </a>
          ))}
        </div>

        <p className={styles.disclaimer}>
          These include independent website concepts created from publicly available information to
          demonstrate the LabNarrative scientific-communication and design approach.
        </p>
      </section>

      <section className={styles.processSection} id="process">
        <div className={styles.processIntro}>
          <p className={styles.sectionLabel}>From papers to publication</p>
          <h2>A focused process that protects your time.</h2>
          <p>
            The principal investigator remains in control of the science and direction while
            LabNarrative handles the writing, organisation, design and technical work.
          </p>
        </div>

        <div className={styles.processGrid}>
          {process.map((item) => (
            <article className={styles.processItem} key={item.number}>
              <span className={styles.number}>{item.number}</span>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
            </article>
          ))}
        </div>

        <div className={styles.platformPanel}>
          <div>
            <p className={styles.sectionLabel}>After launch</p>
            <h3>A website your laboratory can keep current.</h3>
          </div>
          <p>
            Research changes, papers appear and people join. Private editing access allows the
            laboratory to update projects, members, publications and opportunities through a simple
            draft, preview and publish workflow.
          </p>
          <ul>
            <li>Private laboratory login</li>
            <li>Draft, preview and publish</li>
            <li>Version history and restore</li>
          </ul>
        </div>
      </section>

      <section className={styles.pricingSection} id="pricing">
        <div className={styles.pricingIntro}>
          <p className={styles.sectionLabel}>Simple packages</p>
          <h2>Clear scope. No technical learning curve.</h2>
          <p>
            Professional is recommended for active laboratories that need a substantial multi-page
            presence and simple ongoing control.
          </p>
        </div>

        <div className={styles.pricingGrid}>
          {packages.map((item) => (
            <article
              className={`${styles.priceCard} ${item.featured ? styles.featuredCard : ""}`}
              key={item.name}
            >
              {item.featured ? <span className={styles.featuredLabel}>Most complete</span> : null}
              <h3>{item.name}</h3>
              <div className={styles.priceLine}>
                <strong>{item.price}</strong>
                <span>{item.suffix}</span>
              </div>
              <p className={styles.audience}>{item.audience}</p>
              <ul>
                {item.features.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>

        <div className={styles.deliveryDetails}>
          <span>25% deposit to begin</span>
          <span>First review in 3–5 days</span>
          <span>Typical launch in 7–10 days</span>
        </div>
      </section>

      <section className={styles.founderSection} id="about">
        <div>
          <p className={styles.sectionLabel}>Built by a scientist, for scientists</p>
          <h2>Scientific credibility is part of the design.</h2>
        </div>
        <div className={styles.founderCopy}>
          <p>
            Khaled Azzahrani, Ph.D., is a molecular oncology researcher whose work has focused on
            p53, p21–RB/E2F signalling, DREAM and transcriptional regulation. He founded
            LabNarrative to help research groups communicate their scientific identity with the
            clarity and quality their work deserves.
          </p>
          <p>
            Publications can be read critically, connected research themes can be presented
            accurately and scientific language can be shaped without losing its meaning.
          </p>
          <span>Khaled Azzahrani, Ph.D. · Founder, LabNarrative</span>
        </div>
      </section>

      <section className={styles.finalCta}>
        <div>
          <p className={styles.sectionLabel}>Begin with the science</p>
          <h2>Send us your laboratory profile. We’ll imagine the website.</h2>
        </div>
        <div>
          <p>
            Share your current website, laboratory profile or research interests. We will recommend
            a focused direction and a practical route to launch.
          </p>
          <a
            href="mailto:hello@labnarrative.com?subject=Laboratory%20website%20enquiry"
            className={styles.lightCta}
          >
            Email LabNarrative <span aria-hidden="true">↗</span>
          </a>
        </div>
      </section>

      <footer className={styles.footer}>
        <a className={styles.footerWordmark} href="#top">LabNarrative</a>
        <a href="mailto:hello@labnarrative.com">hello@labnarrative.com</a>
        <span>© 2026 LabNarrative</span>
      </footer>
    </main>
  );
}
