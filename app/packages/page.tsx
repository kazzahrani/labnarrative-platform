import type { Metadata } from "next";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Packages — LabNarrative",
  description:
    "Compare LabNarrative Essential, Professional and Annual Care packages for scientific laboratory websites.",
};

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
    name: "+ Annual Care",
    price: "$300/year",
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

const comparisonRows = [
  ["Custom scientific website direction", "Included", "Included"],
  ["Research copy and content organisation", "Included", "Included"],
  ["Responsive design", "Included", "Included"],
  ["Website structure", "Core research, team and contact sections", "Complete multi-page website"],
  ["Research projects", "Core research presentation", "Up to six projects"],
  ["Laboratory members", "Core team presentation", "Unlimited members"],
  ["Publications and opportunities", "—", "Included"],
  ["Private editing and publishing access", "—", "Included"],
  ["Annual Care", "Available as an add-on", "Available as an add-on"],
];

const delivery = [
  {
    number: "01",
    title: "25% deposit to begin",
    copy: "The project begins after the initial deposit, with the remaining scope developed through the agreed review process.",
  },
  {
    number: "02",
    title: "First review in 3–5 days",
    copy: "You receive a private concept for scientific and visual review before the final refinement stage.",
  },
  {
    number: "03",
    title: "Typical launch in 7–10 days",
    copy: "Most focused projects move from confirmed scope to launch within this timeframe.",
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

export default function PackagesPage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <a className={styles.wordmark} href="/" aria-label="LabNarrative home">
          <Wordmark />
        </a>

        <nav className={styles.nav} aria-label="Packages navigation">
          <a href="/">Home</a>
          <a href="#comparison">Compare</a>
          <a href="#delivery">Delivery</a>
        </nav>

        <a
          className={styles.headerCta}
          href="mailto:hello@labnarrative.com?subject=Laboratory%20website%20package"
        >
          Start a project ↗
        </a>
      </header>

      <section className={styles.hero}>
        <p className={styles.eyebrow}>LabNarrative packages</p>
        <div className={styles.heroGrid}>
          <h1>
            Clear scope.
            <br />
            Thoughtful <em>delivery.</em>
          </h1>
          <p className={styles.heroCopy}>
            Choose a focused website for a clear laboratory presence, a complete multi-page platform
            for an active group, or ongoing care that keeps the finished site current.
          </p>
        </div>
      </section>

      <section className={styles.packages}>
        <div className={styles.sectionTopline}>
          <p className={styles.sectionLabel}>Packages</p>
          <p>Transparent pricing with a defined scientific and design scope.</p>
        </div>

        <div className={styles.packageGrid}>
          {packages.map((item) => (
            <article
              className={`${styles.packageCard} ${item.recommended ? styles.recommended : ""}`}
              key={item.name}
            >
              {item.recommended ? <span className={styles.badge}>Most complete</span> : null}
              <h2>{item.name}</h2>
              <strong className={styles.price}>{item.price}</strong>
              <p className={styles.subtitle}>{item.subtitle}</p>
              <ul className={styles.featureList}>
                {item.features.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.comparison} id="comparison">
        <p className={styles.sectionLabel}>Package comparison</p>
        <h2>See exactly what changes between Essential and Professional.</h2>

        <div className={styles.tableWrap}>
          <table className={styles.comparisonTable}>
            <thead>
              <tr>
                <th>Feature</th>
                <th>Essential</th>
                <th>Professional</th>
              </tr>
            </thead>
            <tbody>
              {comparisonRows.map(([feature, essential, professional]) => (
                <tr key={feature}>
                  <td>{feature}</td>
                  <td>{essential}</td>
                  <td>{professional}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.delivery} id="delivery">
        <div>
          <p className={styles.sectionLabel}>Payment and delivery</p>
          <h2>A focused process with clear milestones.</h2>
        </div>

        <div className={styles.deliveryList}>
          {delivery.map((item) => (
            <div className={styles.deliveryItem} key={item.number}>
              <span>{item.number}</span>
              <div>
                <strong>{item.title}</strong>
                <p>{item.copy}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.finalCta}>
        <p className={styles.sectionLabel}>Choose your starting point</p>
        <h2>Tell us about your laboratory and receive a focused recommendation.</h2>
        <p>
          Share your current laboratory profile, recent publications or institutional page. We will
          recommend the package and direction that best fit the group.
        </p>
        <a
          className={styles.emailButton}
          href="mailto:hello@labnarrative.com?subject=Laboratory%20website%20package"
        >
          Email LabNarrative <span aria-hidden="true">↗</span>
        </a>
      </section>

      <footer className={styles.footer}>
        <a className={styles.wordmark} href="/">
          <Wordmark />
        </a>
        <a href="mailto:hello@labnarrative.com">hello@labnarrative.com</a>
        <span>© 2026 LabNarrative</span>
      </footer>
    </main>
  );
}
