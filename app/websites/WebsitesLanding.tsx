import styles from "./websites.module.css";

const approach = [
  {
    number: "01",
    title: "We understand your business",
    copy: "We learn what you do, who you serve and what visitors need to understand before we design a single screen.",
  },
  {
    number: "02",
    title: "We shape the message",
    copy: "We organize your offer, services and story into clear website content instead of asking you to arrive with every word already written.",
  },
  {
    number: "03",
    title: "We design the experience",
    copy: "We turn that message into a polished, responsive website that feels credible, modern and distinctly yours.",
  },
];

const process = [
  { number: "01", title: "Discover", copy: "We understand your business, audience, goals and current online presence." },
  { number: "02", title: "Structure", copy: "We define the pages, content hierarchy and clearest journey for visitors." },
  { number: "03", title: "Design", copy: "We create a private modern concept and refine it with your feedback." },
  { number: "04", title: "Launch", copy: "We connect your domain, publish the site and make sure everything works beautifully." },
];

const packages = [
  {
    name: "Essential",
    price: "$750",
    subtitle: "For professionals and focused businesses",
    features: [
      "Custom website direction",
      "Content structure and copy support",
      "Responsive modern design",
      "Core services, about and contact pages",
      "Domain connection and launch",
    ],
  },
  {
    name: "Professional",
    price: "$1,050",
    subtitle: "For businesses that need a fuller digital presence",
    recommended: true,
    features: [
      "Everything included in Essential",
      "Complete multi-page website",
      "Expanded services or product sections",
      "Team, portfolio, news or resource pages",
      "Lead-generation and conversion structure",
      "Private editing and publishing access",
    ],
  },
  {
    name: "+ Annual care",
    price: "$300 / year",
    subtitle: "For a website that stays current",
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

export default function WebsitesLanding() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <a className={styles.wordmark} href="/" aria-label="LabNarrative home">
          <Wordmark />
        </a>
        <nav className={styles.nav} aria-label="Websites navigation">
          <a href="#approach">Approach</a>
          <a href="#process">Process</a>
          <a href="#pricing">Pricing</a>
          <a href="/systems">Systems</a>
        </nav>
        <a className={styles.headerCta} href="mailto:hello@labnarrative.com?subject=Website%20project%20enquiry">
          Start a project <span aria-hidden="true">↗</span>
        </a>
      </header>

      <section className={styles.hero}>
        <p className={styles.eyebrow}>LabNarrative Websites</p>
        <div className={styles.heroGrid}>
          <h1>
            Websites that make your business
            <br />
            <em>look the part.</em>
          </h1>
          <div className={styles.heroAside}>
            <p>
              Modern websites for businesses, professionals and organizations — thoughtfully structured, written and designed from the ground up.
            </p>
            <a className={styles.primaryButton} href="mailto:hello@labnarrative.com?subject=Website%20project%20enquiry">
              Tell us about your website <span aria-hidden="true">↗</span>
            </a>
          </div>
        </div>
        <div className={styles.heroFooter}>
          <span>Clear positioning</span>
          <span>Modern design</span>
          <span>Easy launch</span>
        </div>
      </section>

      <section className={styles.approachSection} id="approach">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.sectionLabel}>Our approach</p>
            <h2>Not a template with your logo added. A website built around what makes your business worth choosing.</h2>
          </div>
          <p>
            The goal is simple: make your company easier to understand, easier to trust and easier to contact.
          </p>
        </div>
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

      <section className={styles.directionSection}>
        <div className={styles.sectionTopline}>
          <p className={styles.sectionLabel}>A tailored direction</p>
          <p>Different businesses should not all look the same.</p>
        </div>
        <div className={styles.directionGrid}>
          <h2>A distinct digital presence for every brand.</h2>
          <div>
            <p>
              We shape the design around your audience, positioning and personality instead of forcing every client into the same visual formula.
            </p>
            <div className={styles.audiencePills}>
              <span>Companies</span>
              <span>Professional services</span>
              <span>Clinics & practices</span>
              <span>Suppliers</span>
              <span>Consultants</span>
              <span>Organizations</span>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.processSection} id="process">
        <div className={styles.sectionTopline}>
          <p className={styles.sectionLabel}>From idea to launch</p>
          <p>A focused process without unnecessary complexity.</p>
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
      </section>

      <section className={styles.afterLaunchSection}>
        <div>
          <p className={styles.sectionLabel}>After launch</p>
          <h2>A website you can actually keep current.</h2>
        </div>
        <div className={styles.afterLaunchCopy}>
          <p>
            Your site does not have to become frozen the day it launches. We can provide private editing access and ongoing care so services, team members, projects, announcements and other content stay current.
          </p>
          <span>Simple updates. Clean publishing. No technical headache.</span>
        </div>
      </section>

      <section className={styles.pricingSection} id="pricing">
        <div className={styles.sectionTopline}>
          <p className={styles.sectionLabel}>Simple packages</p>
          <p>Clear scope. No technical learning curve.</p>
        </div>
        <div className={styles.pricingGrid}>
          {packages.map((item) => (
            <article className={item.recommended ? styles.recommendedCard : undefined} key={item.name}>
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

      <section className={styles.whySection}>
        <div>
          <p className={styles.sectionLabel}>Made to feel established</p>
          <h2>Good websites create confidence before the first conversation.</h2>
        </div>
        <div className={styles.whyCopy}>
          <p>
            LabNarrative Websites combines positioning, content structure and modern design so visitors immediately understand who you are, what you offer and what to do next.
          </p>
          <p>
            The result should feel professional without feeling generic — whether you are a growing company, an independent professional or an established organization modernizing its online presence.
          </p>
        </div>
      </section>

      <section className={styles.finalCta}>
        <p className={styles.sectionLabel}>Start with your business</p>
        <h2>
          Tell us what you do.
          <br />
          We’ll shape the website around it.
        </h2>
        <p>
          Send a short introduction, your current website if you have one, and what you want the new site to achieve.
        </p>
        <a className={styles.emailButton} href="mailto:hello@labnarrative.com?subject=Website%20project%20enquiry">
          Email LabNarrative <span aria-hidden="true">↗</span>
        </a>
      </section>

      <footer className={styles.footer}>
        <a className={styles.wordmark} href="/">
          <Wordmark />
        </a>
        <a href="mailto:hello@labnarrative.com">hello@labnarrative.com</a>
        <span>Websites</span>
        <span>© 2026 LabNarrative</span>
      </footer>
    </main>
  );
}
