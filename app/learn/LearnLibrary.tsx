"use client";

import { useMemo, useState } from "react";
import styles from "./learn.module.css";
import { learnCategories, learnGuides, type LearnGuide } from "./content";

function coverClass(visual: LearnGuide["visual"]) {
  const map = {
    paper: styles.coverPaper,
    dca: styles.coverDca,
    tradingview: styles.coverTradingview,
    threecommas: styles.coverThreecommas,
    bitsgap: styles.coverBitsgap,
    cryptohopper: styles.coverCryptohopper,
    coinrule: styles.coverCoinrule,
  };
  return map[visual];
}

function Cover({ guide }: { guide: LearnGuide }) {
  return (
    <div className={`${styles.cover} ${coverClass(guide.visual)}`} aria-hidden="true">
      <span className={styles.coverLabel}>LabNarrative Learn · {guide.category}</span>
      <strong className={styles.coverTitle}>{guide.kicker}</strong>
    </div>
  );
}

export default function LearnLibrary() {
  const [category, setCategory] = useState<(typeof learnCategories)[number]>("Latest");
  const [query, setQuery] = useState("");

  const normalizedQuery = query.trim().toLowerCase();
  const featured = learnGuides.find((guide) => guide.featured) ?? learnGuides[0];

  const visibleGuides = useMemo(() => {
    return learnGuides.filter((guide) => {
      const matchesCategory = category === "Latest" || guide.category === category;
      const haystack = `${guide.title} ${guide.excerpt} ${guide.category} ${guide.kicker}`.toLowerCase();
      const matchesQuery = !normalizedQuery || haystack.includes(normalizedQuery);
      return matchesCategory && matchesQuery;
    });
  }, [category, normalizedQuery]);

  const showFeatured = category === "Latest" && !normalizedQuery;
  const listGuides = showFeatured
    ? visibleGuides.filter((guide) => guide.href !== featured.href)
    : visibleGuides;

  return (
    <>
      <div className={styles.libraryBar}>
        <div className={styles.categoryScroll} aria-label="Learn categories">
          {learnCategories.map((item) => (
            <button
              className={`${styles.categoryButton} ${category === item ? styles.categoryButtonActive : ""}`}
              key={item}
              type="button"
              onClick={() => setCategory(item)}
              aria-pressed={category === item}
            >
              {item}
            </button>
          ))}
        </div>
        <label className={styles.searchWrap}>
          <span className={styles.searchIcon} aria-hidden="true" />
          <span style={{ position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0,0,0,0)", whiteSpace: "nowrap", border: 0 }}>Search Learn</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search guides"
          />
        </label>
      </div>

      {showFeatured && (
        <a className={styles.featuredLink} href={featured.href}>
          <article className={styles.featured}>
            <Cover guide={featured} />
            <div className={styles.featuredContent}>
              <p className={styles.cardKicker}>Featured guide</p>
              <div className={styles.meta}><span>{featured.category}</span><span>{featured.readTime}</span></div>
              <h2>{featured.title}</h2>
              <p>{featured.excerpt}</p>
              <span className={styles.readMore}>Read guide →</span>
            </div>
          </article>
        </a>
      )}

      <div className={styles.sectionHead}>
        <div>
          <p className={styles.sectionLabel}>{category === "Latest" ? "Latest guides" : category}</p>
          <h2>{normalizedQuery ? `Search results for “${query.trim()}”` : category === "Latest" ? "Practical guides for real trading workflows." : `Explore ${category}.`}</h2>
        </div>
        <p>
          Focused on concrete automation problems: build the workflow, understand what it does, test it in Paper, and only then decide what belongs in Live trading.
        </p>
      </div>

      <div className={styles.grid}>
        {listGuides.length ? listGuides.map((guide) => (
          <a className={styles.cardLink} href={guide.href} key={guide.href}>
            <article className={styles.card}>
              <Cover guide={guide} />
              <div className={styles.cardBody}>
                <div className={styles.meta}><span>{guide.category}</span><span>{guide.readTime}</span></div>
                <h3>{guide.title}</h3>
                <p>{guide.excerpt}</p>
              </div>
            </article>
          </a>
        )) : (
          <div className={styles.empty}>
            <strong>No guides match this view yet.</strong>
            <p>Try another category or clear the search.</p>
          </div>
        )}
      </div>
    </>
  );
}
