import styles from "./page.module.css";

const capabilities = [
  {
    number: "01",
    title: "Catalog-aware matching",
    copy: "The engine starts with what your company actually sells, then ranks tenders by product and capability fit instead of generic keywords.",
  },
  {
    number: "02",
    title: "Line-item coverage",
    copy: "See which requested items match your catalog, which may have alternatives, and which are missing before your team spends hours reviewing documents.",
  },
  {
    number: "03",
    title: "Bid / No-Bid intelligence",
    copy: "Combine catalog coverage, preparation time and commercial fit into a clear opportunity score and a recommendation your team can review.",
  },
];

function Wordmark() {
  return (
    <span className={styles.wordmark}>
      <span>Lab</span>
      <span>Narrative</span>
      <b>Tenders</b>
    </span>
  );
}

export default function TendersHomePage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <a href="/" aria-label="LabNarrative home">
          <Wordmark />
        </a>
        <nav className={styles.nav} aria-label="Tenders navigation">
          <a href="#product">Product</a>
          <a href="#how-it-works">How it works</a>
          <a href="/tenders/demo">Working demo</a>
        </nav>
        <a className={styles.headerCta} href="/tenders/demo">
          Open demo <span aria-hidden="true">↗</span>
        </a>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroTopline}>
          <p><i /> Saudi tender intelligence</p>
          <span>Built for suppliers · العربية + English</span>
        </div>
        <div className={styles.heroGrid}>
          <div>
            <h1>
              Stop reading every tender.
              <br />
              Find the ones <em>worth pursuing.</em>
            </h1>
          </div>
          <aside>
            <p>
              LabNarrative Tenders matches Saudi tenders to your company&apos;s product catalog, checks line-item coverage, and turns a crowded feed into a prioritized Bid / Review / No-Bid queue.
            </p>
            <a href="/tenders/demo">Explore the working MVP <span>↗</span></a>
          </aside>
        </div>

        <div className={styles.enginePreview} aria-label="Tender intelligence workflow preview">
          <div className={styles.previewHeader}>
            <div>
              <span>Opportunity engine</span>
              <strong>Today&apos;s tender intelligence</strong>
            </div>
            <span className={styles.demoBadge}>Illustrative MVP</span>
          </div>
          <div className={styles.metrics}>
            <article><span>Tenders scanned</span><strong>238</strong><small>Saudi opportunities</small></article>
            <article><span>Potential matches</span><strong>27</strong><small>Catalog-aware</small></article>
            <article><span>High priority</span><strong>06</strong><small>Action recommended</small></article>
            <article><span>Potential value</span><strong>8.4M</strong><small>SAR · illustrative</small></article>
          </div>
          <div className={styles.opportunityRow}>
            <div className={styles.score}>94</div>
            <div className={styles.opportunityMain}>
              <span>Laboratory equipment supply</span>
              <strong>18 of 20 requested items match your catalog</strong>
              <small>11 days remaining · strong capability fit</small>
            </div>
            <div className={styles.recommendation}>BID</div>
          </div>
        </div>
      </section>

      <section className={styles.statement} id="product">
        <p className={styles.sectionLabel}>The difference</p>
        <div>
          <h2>A tender feed tells you what exists. <em>Intelligence tells you what deserves your team&apos;s time.</em></h2>
          <p>
            The same tender should not receive the same score for every supplier. LabNarrative Tenders evaluates the opportunity against your products, missing items, preparation window and company capabilities.
          </p>
        </div>
      </section>

      <section className={styles.capabilities} id="how-it-works">
        {capabilities.map((item) => (
          <article key={item.number}>
            <span>{item.number}</span>
            <h3>{item.title}</h3>
            <p>{item.copy}</p>
          </article>
        ))}
      </section>

      <section className={styles.flowSection}>
        <p className={styles.sectionLabel}>MVP workflow</p>
        <div className={styles.flow}>
          <span>Company profile</span><i>→</i>
          <span>Product catalog</span><i>→</i>
          <span>Tender matching</span><i>→</i>
          <span>Item coverage</span><i>→</i>
          <span>Bid / No-Bid</span>
        </div>
      </section>

      <section className={styles.finalCta}>
        <div>
          <p className={styles.sectionLabel}>LabNarrative Tenders</p>
          <h2>Build the bid queue around <em>what you can actually supply.</em></h2>
        </div>
        <a href="/tenders/demo">Open the working demo <span>↗</span></a>
      </section>
    </main>
  );
}
