import fs from "node:fs";

const pageUrl = new URL("../app/admin/sites/page.tsx", import.meta.url);
let source = fs.readFileSync(pageUrl, "utf8");

const explanationBlock = `        <section className={styles.explanation} aria-label="Status definitions">
          <article><strong>Draft</strong><span>Administrator-only working version. It is not publicly visible.</span></article>
          <article><strong>Concept</strong><span>Public outreach preview. Suitable for sending to a prospective PI.</span></article>
          <article><strong>Client</strong><span>Approved official client website intended for ongoing public use.</span></article>
          <article><strong>Archived</strong><span>Hidden by default but available through the Archived summary filter.</span></article>
        </section>

`;

const summaryBlock = `        <section
          className={styles.summary}
          aria-label="Website totals and status filters"
          style={{ gridTemplateColumns: "repeat(5, minmax(0, 1fr))" }}
        >
          {summaryItems.map((item) => (
            <button
              aria-pressed={summaryFilter === item.filter}
              className={summaryFilter === item.filter ? styles.activeSummary : undefined}
              key={item.filter}
              onClick={() => setSummaryFilter(item.filter)}
              type="button"
            >
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </button>
          ))}
        </section>

`;

if (source.includes(explanationBlock)) {
  source = source.replace(explanationBlock, "");
}

if (source.includes(summaryBlock)) {
  source = source.replace(summaryBlock, "");
}

for (const removedMarker of [
  'aria-label="Status definitions"',
  'aria-label="Website totals and status filters"',
]) {
  if (source.includes(removedMarker)) {
    throw new Error(`Websites Monitor block was not removed: ${removedMarker}`);
  }
}

fs.writeFileSync(pageUrl, source);
console.log("Websites Monitor status explanation and summary panels removed.");
