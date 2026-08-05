import fs from "node:fs";

const pageUrl = new URL("../app/admin/automation/page.tsx", import.meta.url);
let source = fs.readFileSync(pageUrl, "utf8");

const reviewStartToken = "            {reviewRuns.map((run) => {";
const reviewEndToken = "\n            })}";
const leftColumnToken = "        <div className={styles.grid}>\n          <div className={styles.stack}>\n";
const prospectIntakeToken = "<p className={styles.kicker}>Prospect intake</p>";

const reviewStart = source.indexOf(reviewStartToken);
if (reviewStart === -1) {
  throw new Error("The awaiting-final-review card renderer was not found.");
}

const reviewEndStart = source.indexOf(reviewEndToken, reviewStart);
if (reviewEndStart === -1) {
  throw new Error("The awaiting-final-review card renderer ending was not found.");
}

const reviewEnd = reviewEndStart + reviewEndToken.length;
const reviewBlock = source.slice(reviewStart, reviewEnd);

source = `${source.slice(0, reviewStart)}${source.slice(reviewEnd)}`;

const leftColumnStart = source.indexOf(leftColumnToken);
if (leftColumnStart === -1) {
  throw new Error("The Automation left-column insertion point was not found.");
}

const insertionPoint = leftColumnStart + leftColumnToken.length;
source = `${source.slice(0, insertionPoint)}${reviewBlock}\n\n${source.slice(insertionPoint)}`;

const finalReviewPosition = source.indexOf(reviewStartToken);
const prospectIntakePosition = source.indexOf(prospectIntakeToken);
if (finalReviewPosition === -1 || prospectIntakePosition === -1 || finalReviewPosition > prospectIntakePosition) {
  throw new Error("The final-review cards were not placed above Prospect intake.");
}

fs.writeFileSync(pageUrl, source);
console.log("Awaiting-final-review cards placed in the left column above Prospect intake.");
