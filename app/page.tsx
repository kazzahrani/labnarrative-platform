import styles from "./page.module.css";

const approach = [
  {
    number: "01",
    title: "We understand the science",
    copy: "We read your publications and translate the work into a clear, accurate research story—without asking you to write the website yourself.",
  },
  {
    number: "02",
    title: "We design the experience",
    copy: "A calm, modern website gives your group a credible home for its research, people, publications, opportunities and collaborations.",
  },
  {
    number: "03",
    title: "We make launch effortless",
    copy: "Review a private concept, request focused changes, then launch on a domain owned by your laboratory or institution.",
  },
];

const process = [
  {
    number: "01",
    title: "Discover",
    copy: "We study your laboratory, recent papers and current online presence.",
  },
  {
    number: "02",
    title: "Compose",
    copy: "We shape the scientific narrative and build a private concept website.",
  },
  {
    number: "03",
    title: "Refine",
    copy: "You verify the science and choose what should be adjusted or added.",
  },
  {
    number: "04",
    title: "Launch",
    copy: "We connect your domain and hand over a finished, maintainable website.",
  },
];

const packages = [
  {
    name: "Essential",
    price: "$750",
    subtitle: "For focused and emerging laboratories",
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
    subtitle: "For active groups with people and projects",
    recommended: true,
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
    name: "+ Annual care",
    price: "$300 / year",
    subtitle: "For a site that stays current",
    features: [
      "Managed hosting and maintenance",
      "Backups and technical updates",
      "Routine content support",
      "Domain and delivery monitoring",
      "Priority assistance",
    ],
  },
];

function Wordmark() {
  return (
    <>
      <span className={styles.logoLab}>Lab</span>
      <span className={styles.logoNarrative}>Narrative</span>
    </>
  );
}

export default function HomePage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <a className={styles.wordmark} href="#top" aria-label="LabNarrative home">
          <Wordmark />
        </a>

        <nav className={styles.nav} aria-label="Primary navigation">
          <a href="#work">Approach</a>
          <a href="#process">Process</a>
          <a href="#pricing">Pricing</a>
        </nav>

        <a
          className={styles.headerCta}
          href="mailto:hello@labnarrative.com?subject=Laboratory%20website%20enquiry"
        >
          Start a project <span aria-hidden="true">↗</span>
        </a>
      </header>

      <section className={styles.hero} id="top">
        <p className={styles.eyebrow}>Websites for scientific laboratories</p>

        <div className={styles.heroGrid}>
          <h1>
            Your research
            <br />
            deserves
            <br />
            a clearer <em>story.</em>
          </h1>

          <div className={styles.heroAside}>
            <p>
              We research, write and design modern laboratory websites—so principal investigators
              can present their science without becoming web designers.
            </p>
            <a href="mailto:hello@labnarrative.com?subject=Request%20a%20private%20concept">
              Request a private concept <span aria-hidden="true">↗</span>
            </a>
          </div>
        </div>

        <div className={styles.heroFooter}>
          <span>Scientific understanding</span>
          <span>Editorial design</span>
          <span>Effortless launch</span>
        </div>
      </section>

      <section className={styles.approachSection}>
        <p className={styles.sectionLabel}>The LabNarrative approach</p>
        <h2>
          Not a generic template filled with scientific words. A considered digital home built
          around the work your laboratory actually does.
        </h2>

        <div className={styles.approachGrid}>
          {approach.map((item) => (
            <article key={item.number}>
              <span className={styles.number}>{item.number}</span>
              <h3>{item.title}</h3>
              <p>{item.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.workSection} id="work">
        <div className={styles.sectionTopline}>
          <p className={styles.sectionLabel}>A tailored direction</p>
          <p>Different science. Different identity.</p>
        </div>

        <div className={styles.workIntro}>
          <h2>A distinct scientific presence for every laboratory.</h2>
          <p>
            Every project begins with the research rather than a generic visual theme. The design
            direction is shaped around the laboratory’s scientific identity, priorities and
            audience.
          </p>
        </div>
      </section>

      <section className={styles.processSection} id="process">
        <div className={styles.sectionTopline}>
          <p className={styles.sectionLabel}>From papers to publication</p>
          <p>A focused process that protects your time.</p>
        </div>

        <div className={styles.processGrid}>
          {process.map((item) => (
            <article key={item.number}>
              <span className={styles.number}>{item.number}</span>
              <h3>{item.title}</h3>
              <p>{item.copy}</p>
            </article>
          ))}
        </div>

        <div className={styles.platformNote}>
          <div>
            <p className={styles.sectionLabel}>After launch</p>
            <h2>A website your laboratory can keep current.</h2>
          </div>
          <p>
            Private editing access lets your group update projects, members, publications and
            opportunities through a simple draft, preview and publish workflow—with version history
            available when needed.
          </p>
        </div>
      </section>

      <section className={styles.pricingSection} id="pricing">
        <div className={styles.sectionTopline}>
          <p className={styles.sectionLabel}>Simple packages</p>
          <p>Clear scope. No technical learning curve.</p>
        </div>

        <div className={styles.pricingGrid}>
          {packages.map((item) => (
            <article
              className={item.recommended ? styles.recommendedCard : undefined}
              key={item.name}
            >
              {item.recommended ? <span className={styles.badge}>Most complete</span> : null}
              <h3>{item.name}</h3>
              <strong>{item.price}</strong>
              <p>{item.subtitle}</p>
              <ul>
                {item.features.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>

        <div className={styles.deliveryLine}>
          <span>25% deposit to begin</span>
          <span>First review in 3–5 days</span>
          <span>Typical launch in 7–10 days</span>
        </div>
      </section>

      <section className={styles.founderSection}>
        <p className={styles.sectionLabel}>Built by a scientist, for scientists</p>
        <div>
          <h2>Scientific credibility is part of the design.</h2>
          <div className={styles.founderCopy}>
            <p>
              Khaled Azzahrani, Ph.D., is a molecular oncology researcher whose work has focused on
              p53, p21–RB/E2F signalling, DREAM and transcriptional regulation.
            </p>
            <p>
              He founded LabNarrative so scientific groups can communicate their identity clearly,
              accurately and with the visual quality their work deserves.
            </p>
            <span>Khaled Azzahrani, Ph.D. · Founder, LabNarrative</span>
          </div>
        </div>
      </section>

      <section className={styles.finalCta}>
        <p className={styles.sectionLabel}>Begin with the science</p>
        <h2>
          Send us your laboratory profile.
          <br />
          We’ll imagine the website.
        </h2>
        <p>
          Introduce your group at <a href="mailto:hello@labnarrative.com">hello@labnarrative.com</a>
          {" "}and receive a focused project recommendation.
        </p>
        <a
          className={styles.emailButton}
          href="mailto:hello@labnarrative.com?subject=Laboratory%20website%20enquiry"
        >
          Email LabNarrative <span aria-hidden="true">↗</span>
        </a>
      </section>

      <footer className={styles.footer}>
        <a className={styles.wordmark} href="#top"><Wordmark /></a>
        <a href="mailto:hello@labnarrative.com">hello@labnarrative.com</a>
        <span>© 2026 LabNarrative</span>
      </footer>
    </main>
  );
}
