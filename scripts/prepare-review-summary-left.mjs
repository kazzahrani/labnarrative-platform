import fs from "node:fs";

const pageUrl = new URL("../app/admin/automation/page.tsx", import.meta.url);
let source = fs.readFileSync(pageUrl, "utf8");

const explanatorySentence = /\s*<p className=\{styles\.muted\}>Each saved note begins with the PI name and is ready to paste into ChatGPT\.<\/p>/;
source = source.replace(explanatorySentence, "");

function sectionForMarker(text, marker, label) {
  const markerIndex = text.indexOf(marker);
  if (markerIndex === -1) {
    throw new Error(`${label} marker was not found.`);
  }

  const start = text.lastIndexOf("<section", markerIndex);
  const endStart = text.indexOf("</section>", markerIndex);
  if (start === -1 || endStart === -1) {
    throw new Error(`${label} section boundaries could not be identified.`);
  }

  const end = endStart + "</section>".length;
  return {
    start,
    end,
    block: text.slice(start, end).trim(),
  };
}

function findMatchingDivClose(text, openingIndex) {
  const tagPattern = /<div\b[^>]*>|<\/div>/g;
  tagPattern.lastIndex = openingIndex;
  let depth = 0;
  let match;

  while ((match = tagPattern.exec(text))) {
    if (match[0].startsWith("</div")) {
      depth -= 1;
      if (depth === 0) return match.index;
    } else {
      depth += 1;
    }
  }

  return -1;
}

const collectorMarker = "reviewNotesCollector";
const activityMarker = "<p className={styles.kicker}>Recent activity</p>";
const collectorSection = sectionForMarker(source, collectorMarker, "Review summary");
const activitySection = sectionForMarker(source, activityMarker, "Recent activity");

for (const section of [collectorSection, activitySection].sort((left, right) => right.start - left.start)) {
  source = `${source.slice(0, section.start)}${source.slice(section.end)}`;
}

const gridToken = "<div className={styles.grid}>";
const gridStart = source.indexOf(gridToken);
if (gridStart === -1) {
  throw new Error("The Production two-column grid was not found.");
}

const stackToken = "<div className={styles.stack}>";
const leftStackStart = source.indexOf(stackToken, gridStart + gridToken.length);
if (leftStackStart === -1) {
  throw new Error("The left Production column was not found.");
}

const leftStackClose = findMatchingDivClose(source, leftStackStart);
if (leftStackClose === -1) {
  throw new Error("The end of the left Production column could not be identified.");
}

const leftColumnBlocks = [activitySection.block, collectorSection.block]
  .map((block) => `            ${block}`)
  .join("\n\n");

source = `${source.slice(0, leftStackClose)}\n\n${leftColumnBlocks}\n          ${source.slice(leftStackClose)}`;

const finalActivity = sectionForMarker(source, activityMarker, "Final Recent activity");
const finalCollector = sectionForMarker(source, collectorMarker, "Final Review summary");
const finalGridStart = source.indexOf(gridToken);
const finalLeftStackStart = source.indexOf(stackToken, finalGridStart + gridToken.length);
const finalLeftStackClose = findMatchingDivClose(source, finalLeftStackStart);

if (
  finalLeftStackStart === -1 ||
  finalLeftStackClose === -1 ||
  finalActivity.start < finalLeftStackStart ||
  finalCollector.end > finalLeftStackClose ||
  finalCollector.start <= finalActivity.end
) {
  throw new Error("Recent activity and Review summary were not placed in the left Production Engine column.");
}

const betweenActivityAndCollector = source
  .slice(finalActivity.end, finalCollector.start)
  .trim();
if (betweenActivityAndCollector) {
  throw new Error("Review summary is not immediately after Recent activity.");
}

if (source.includes("Each saved note begins with the PI name and is ready to paste into ChatGPT.")) {
  throw new Error("The Review summary explanatory sentence is still present.");
}

fs.writeFileSync(pageUrl, source);
console.log("Recent activity and Review summary moved to the left Production Engine column.");
