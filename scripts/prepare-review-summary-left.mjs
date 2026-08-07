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

function lineForMarker(text, marker, label) {
  const markerIndex = text.indexOf(marker);
  if (markerIndex === -1) throw new Error(`${label} marker was not found.`);
  const start = text.lastIndexOf("\n", markerIndex) + 1;
  const nextBreak = text.indexOf("\n", markerIndex);
  const end = nextBreak === -1 ? text.length : nextBreak;
  return {
    start,
    end,
    block: text.slice(start, end).trim(),
  };
}

const collectorMarker = "reviewNotesCollector";
const activityMarker = "<p className={styles.kicker}>Recent activity</p>";
const historyMarker = 'renderProspectTable("Active and completed records"';

const collectorSection = sectionForMarker(source, collectorMarker, "Summary review");
const activitySection = sectionForMarker(source, activityMarker, "Recent activity");
const historyLine = lineForMarker(source, historyMarker, "Active and completed records");

for (const block of [collectorSection, activitySection, historyLine].sort((left, right) => right.start - left.start)) {
  source = `${source.slice(0, block.start)}${source.slice(block.end)}`;
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

const leftStackOpenEnd = source.indexOf("\n", leftStackStart);
if (leftStackOpenEnd === -1) {
  throw new Error("The opening line of the left Production column could not be identified.");
}

const orderedLeftBlocks = [historyLine.block, collectorSection.block, activitySection.block]
  .map((block) => `            ${block}`)
  .join("\n\n");

source = `${source.slice(0, leftStackOpenEnd + 1)}${orderedLeftBlocks}\n\n${source.slice(leftStackOpenEnd + 1)}`;

const finalHistory = lineForMarker(source, historyMarker, "Final Active and completed records");
const finalCollector = sectionForMarker(source, collectorMarker, "Final Summary review");
const finalActivity = sectionForMarker(source, activityMarker, "Final Recent activity");
const finalGridStart = source.indexOf(gridToken);
const finalLeftStackStart = source.indexOf(stackToken, finalGridStart + gridToken.length);
const finalLeftStackClose = findMatchingDivClose(source, finalLeftStackStart);

if (
  finalLeftStackStart === -1 ||
  finalLeftStackClose === -1 ||
  finalHistory.start < finalLeftStackStart ||
  finalActivity.end > finalLeftStackClose ||
  !(finalHistory.start < finalCollector.start && finalCollector.start < finalActivity.start)
) {
  throw new Error("Production left-column order must be Active and completed records, Summary review, then Recent activity.");
}

const betweenHistoryAndCollector = source.slice(finalHistory.end, finalCollector.start).trim();
const betweenCollectorAndActivity = source.slice(finalCollector.end, finalActivity.start).trim();
if (betweenHistoryAndCollector || betweenCollectorAndActivity) {
  throw new Error("The three priority Production windows are not consecutive in the left column.");
}

if (source.includes("Each saved note begins with the PI name and is ready to paste into ChatGPT.")) {
  throw new Error("The Summary review explanatory sentence is still present.");
}

fs.writeFileSync(pageUrl, source);
console.log("Production left column ordered as Active and completed records, Summary review, then Recent activity.");
