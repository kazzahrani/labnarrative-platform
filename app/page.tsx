import styles from "./page.module.css";

const concepts = [
  {
    name: "Bremner Laboratory",
    description: "Editorial design for cancer states, transformation competence and retinal biology.",
    href: "https://bremner.labnarrative.com",
    previewClass: styles.editorialPreview,
  },
  {
    name: "Litovchick Laboratory",
    description: "A structured scientific identity for DREAM, cell-cycle control and cancer biology.",
    href: "https://litovchick.labnarrative.com",
    previewClass: styles.classicPreview,
  },
  {
    name: "Bourdon Laboratory",
    description: "A complete multi-page research website centred on p53 isoforms and cell fate.",
    href: "https://bourdon.labnarrative.com",
    previewClass: styles.sciencePreview,
  },
  {
    name: "Chen Laboratory",
    description: "A modern image-led laboratory presence for tumour-suppressor research.",
    href: "https://chen.labnarrative.com",
    previewClass: styles.imagePreview,
  },
];

const values = [
  {
    number: "01",
    title: "Scientific understanding",
    copy: "We study the laboratory’s research before shaping its structure, language and visual identity.",
  },
  {
    number: "02",
    title: "Complete delivery",
    copy: "Scientific writing, information architecture, design, development and launch are handled together.",
  },
  {
    number: "03",
    title: "Simple ongoing control",
    copy: "Private editing access lets laboratories maintain projects, people, publications and opportunities.",
  },
];

const process = [
  {
    number: "01",
    title: "Discover",
    copy: "We study the laboratory, its research programmes, audience and existing online presence.",
  },
  {
    number: "02",
    title: "Compose",
    copy: "We translate the science into a clear narrative, page structure and distinctive visual direction.",
  },
  {
    number: "03",
    title: "Refine",
    copy: "The principal investigator reviews the concept and we refine the content, imagery and design together.",
  },
  {
    number: "04",
    title: "Launch",
    copy: "We connect the domain, publish the website and provide private access for future updates.",
  },
];

const packages = [
  {
    name: "Essential",
    price: "$750",
    note: "A focused professional presence for an individual laboratory.",
    features: [
      "Custom visual direction",
      "Scientifically organised content",
      "Responsive laboratory website",
      "Core research, team and contact sections",
      "Domain connection and launch",
    ],
  },
  {
    name: "Professional",
    price: "$1,050",
    note: "The complete LabNarrative system for an active research group.",
    featured: true,
    features: [
      "Everything included in Essential",
      "Full multi-page laboratory website",
      "Up to six research projects",
      "Unlimited laboratory members",
      "Publications and opportunities sections",
      "Private editing and publishing access",
    ],
  },
  {
    name: "Annual Care",
    price: "$300",
    priceNote: "/ year",
    note: "Managed continuity after launch, without technical burden.",
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
          <a href="#work">Selected work</a>
          <a href="#approach">Approach</a>
          <a href="#services">Services</a>
          <a href="#about">About</a>
          <a className={styles.navCta} href="mailto:hello@labnarrative.com?subject=Laboratory%20website%20enquiry">
            Start a conversation
          </a>
        </nav>
      </header>

      <section className={styles.hero} id="top">
        <div className={styles.heroCopy}>
          <div>
            <p className={styles.eyebrow}>Scientific laboratory websites</p>
            <h1>Good science deserves to be presented well.</h1>
            <p className={styles.heroIntro}>
              LabNarrative researches, writes and designs modern websites for scientific laboratories—combining scientific understanding, editorial clarity and an effortless launch process.
            </p>
            <div className={styles.heroActions}>
              <a className={styles.primaryButton} href="#work">
                View selected concepts
              </a>
              <a className={styles.secondaryButton} href="mailto:hello@labnarrative.com?subject=Laboratory%20website%20enquiry">
                Discuss your laboratory website
              </a>
            </div>
          </div>

          <div className={styles.heroFoot} aria-label="LabNarrative strengths">
            <span>Built by a scientist</span>
            <span>Designed for laboratories</span>
            <span>Complete launch and care</span>
          </div>
        </div>

        <div className={styles.heroVisual} aria-hidden="true">
          <div className={styles.heroVisualInner}>
            <div className={styles.visualLabel}>
              <span>Research</span>
              <span>Narrative</span>
              <span>Design</span>
            </div>
            <div className={styles.visualStatement}>
              <strong>From papers to a clear scientific identity.</strong>
              <p>
                A laboratory website should do more than list information. It should reveal the questions, people and ideas that make the research distinctive.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.section} id="work">
        <div className={styles.sectionHeader}>
          <div>
            <p className={styles.eyebrow}>Selected concepts</p>
            <h2>Different science. Different identity.</h2>
          </div>
          <p>
            Every laboratory receives a direction shaped around its research rather than a generic theme. These concepts demonstrate how different scientific programmes can become distinctive, coherent online experiences.
          </p>
        </div>

        <div className={styles.workGrid}>
          {concepts.map((concept) => (
            <a
              className={styles.workCard}
              href={concept.href}
              key={concept.name}
              target="_blank"
              rel="noreferrer"
              aria-label={`View ${concept.name} concept`}
            >
              <div className={`${styles.workPreview} ${concept.previewClass}`} />
              <div className={styles.workInfo}>
                <div>
                  <h3>{concept.name}</h3>
                  <p>{concept.description}</p>
                </div>
                <span className={styles.workArrow} aria-hidden="true">↗</span>
              </div>
            </a>
          ))}
        </div>

        <p className={styles.disclaimer}>
          Selected examples include independent website concepts created from publicly available information and are presented to demonstrate LabNarrative’s design and scientific-communication approach.
        </p>
      </section>

      <section className={styles.statement}>
        <h2>A laboratory is not a template. It is a scientific story still being written.</h2>
        <p className={styles.statementAside}>
          LabNarrative brings together scientific literacy, editorial thinking and web development so the final website feels credible to researchers, accessible to collaborators and distinctive to the laboratory itself.
        </p>
      </section>

      <section className={styles.section} id="approach">
        <div className={styles.sectionHeader}>
          <div>
            <p className={styles.eyebrow}>Why LabNarrative</p>
            <h2>More than web design.</h2>
          </div>
          <p>
            The work begins with understanding the science. That changes the questions we ask, the way research programmes are organised and the clarity of the final website.
          </p>
        </div>

        <div className={styles.valueGrid}>
          {values.map((value) => (
            <article className={styles.valueCard} key={value.number}>
              <span className={styles.number}>{value.number}</span>
              <h3>{value.title}</h3>
              <p>{value.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.darkSection}>
        <div className={styles.sectionHeader}>
          <div>
            <p className={styles.eyebrow}>The process</p>
            <h2>Clear from first concept to launch.</h2>
          </div>
          <p>
            A practical, collaborative workflow keeps the principal investigator in control while LabNarrative handles the technical and editorial work.
          </p>
        </div>

        <div className={styles.processGrid}>
          {process.map((step) => (
            <article className={styles.processCard} key={step.number}>
              <span className={styles.number}>{step.number}</span>
              <h3>{step.title}</h3>
              <p>{step.copy}</p>
            </article>
          ))}
        </div>

        <div className={styles.systemBand}>
          <div className={styles.systemCopy}>
            <h3>Built around laboratory reality.</h3>
            <p>
              Research changes. People join, papers are published and opportunities open. The LabNarrative platform gives each group private access to maintain its website without exposing editing controls to the public.
            </p>
          </div>
          <div className={styles.systemList}>
            <span>Private laboratory login</span>
            <span>Draft, preview and publish workflow</span>
            <span>Version history and restore</span>
            <span>Projects, members, publications and opportunities</span>
          </div>
        </div>
      </section>

      <section className={styles.section} id="services">
        <div className={styles.sectionHeader}>
          <div>
            <p className={styles.eyebrow}>Services</p>
            <h2>Choose the right level of support.</h2>
          </div>
          <p>
            Fixed, transparent pricing for a complete scientific website. Professional is recommended for active laboratories that need a substantial multi-page presence and ongoing control.
          </p>
        </div>

        <div className={styles.packageGrid}>
          {packages.map((item) => (
            <article
              className={`${styles.packageCard} ${item.featured ? styles.featuredPackage : ""}`}
              key={item.name}
            >
              <span className={styles.packageTag}>{item.featured ? "Recommended" : "LabNarrative"}</span>
              <h3>{item.name}</h3>
              <div className={styles.price}>
                {item.price}
                {item.priceNote ? <small>{item.priceNote}</small> : <small>one-time</small>}
              </div>
              <p>{item.note}</p>
              <ul className={styles.featureList}>
                {item.features.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
              <a className={styles.packageLink} href="mailto:hello@labnarrative.com?subject=LabNarrative%20package%20enquiry">
                Discuss this option <span aria-hidden="true">→</span>
              </a>
            </article>
          ))}
        </div>

        <div className={styles.practicalNote}>
          <span>25% deposit to begin</span>
          <span>First review in 3–5 days</span>
          <span>Typical launch in 7–10 days</span>
        </div>
      </section>

      <section className={styles.founderSection} id="about">
        <div className={styles.founderCard} aria-label="Khaled Azzahrani, founder of LabNarrative">
          <div className={styles.founderCardInner}>
            <div className={styles.founderInitials}>KA</div>
            <div>
              <strong>Khaled Azzahrani, Ph.D.</strong>
              <span>Molecular oncology researcher · Founder, LabNarrative</span>
            </div>
          </div>
        </div>

        <div className={styles.founderCopy}>
          <p className={styles.eyebrow}>Built by a scientist, for scientists</p>
          <h2>Scientific credibility is part of the design.</h2>
          <p>
            Khaled Azzahrani is a molecular oncology researcher whose work has focused on p53, p21–RB/E2F signalling, DREAM and transcriptional regulation. He founded LabNarrative to help research groups communicate their scientific identity with the clarity and quality their work deserves.
          </p>
          <p>
            That background makes the process different from a conventional agency: publications can be read critically, research themes can be connected accurately and technical scientific language can be shaped without losing its meaning.
          </p>

          <div className={styles.founderFacts}>
            <div>
              <strong>Science first</strong>
              <span>Research is studied before the website is structured.</span>
            </div>
            <div>
              <strong>One accountable partner</strong>
              <span>Writing, design, development and launch remain connected.</span>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.cta}>
        <h2>Ready to give your laboratory the presence its science deserves?</h2>
        <div>
          <p>
            Share your current website, laboratory profile or research interests. We will discuss the right direction and a practical route to launch.
          </p>
          <a className={styles.lightButton} href="mailto:hello@labnarrative.com?subject=Laboratory%20website%20enquiry">
            hello@labnarrative.com
          </a>
        </div>
      </section>

      <footer className={styles.footer}>
        <div>
          <span className={styles.footerBrand}>LabNarrative</span>
          <span>Scientific laboratory websites, thoughtfully researched and completely delivered.</span>
        </div>
        <div className={styles.footerLinks}>
          <a href="#work">Selected work</a>
          <a href="#services">Services</a>
          <a href="mailto:hello@labnarrative.com">Contact</a>
          <span>© 2026 LabNarrative</span>
        </div>
      </footer>
    </main>
  );
}
