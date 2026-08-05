import fs from "node:fs";

const pageUrl = new URL("../app/admin/automation/page.tsx", import.meta.url);
let source = fs.readFileSync(pageUrl, "utf8");

const explanatorySentence = /\s*<p className=\{styles\.muted\}>Each saved note begins with the PI name and is ready to paste into ChatGPT\.<\/p>/;
source = source.replace(explanatorySentence, "");

const collectorMarker = "reviewNotesCollector";
const collectorMarkerIndex = source.indexOf(collectorMarker);
if (collectorMarkerIndex === -1) {
  throw new Error("The Review summary card was not found on the Production Engine page.");
}

const collectorStart = source.lastIndexOf("<section", collectorMarkerIndex);
const collectorEndToken = "</section>";
const collectorEndStart = source.indexOf(collectorEndToken, collectorMarkerIndex);
if (collectorStart === -1 || collectorEndStart === -1) {
  throw new Error("The Review summary card boundaries could not be identified.");
}
const collectorEnd = collectorEndStart + collectorEndToken.length;
const collectorBlock = source.slice(collectorStart, collectorEnd).trim();

const gridToken = "<div className={styles.grid}>";
const gridIndex = source.indexOf(gridToken);
const stackToken = "<div className={styles.stack}>";
const leftStackStart = source.indexOf(stackToken, gridIndex + gridToken.length);
if (gridIndex === -1 || leftStackStart === -1) {
  throw new Error("The left Production Engine column was not found.");
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

const leftStackClose = findMatchingDivClose(source, leftStackStart);
if (leftStackClose === -1) {
  throw new Error("The end of the left Production Engine column was not found.");
}

const collectorAlreadyLeft = collectorStart > leftStackStart && collectorEnd <= leftStackClose;
if (!collectorAlreadyLeft) {
  source = `${source.slice(0, collectorStart)}${source.slice(collectorEnd)}`;

  const refreshedGridIndex = source.indexOf(gridToken);
  const refreshedLeftStackStart = source.indexOf(stackToken, refreshedGridIndex + gridToken.length);
  const refreshedLeftStackClose = findMatchingDivClose(source, refreshedLeftStackStart);
  if (refreshedLeftStackClose === -1) {
    throw new Error("The left Production Engine column could not be recalculated.");
  }

  source = `${source.slice(0, refreshedLeftStackClose)}\n\n            ${collectorBlock}\n          ${source.slice(refreshedLeftStackClose)}`;
}

const finalCollectorIndex = source.indexOf(collectorMarker);
const finalGridIndex = source.indexOf(gridToken);
const finalLeftStackStart = source.indexOf(stackToken, finalGridIndex + gridToken.length);
const finalLeftStackClose = findMatchingDivClose(source, finalLeftStackStart);

if (
  finalCollectorIndex === -1 ||
  finalCollectorIndex < finalLeftStackStart ||
  finalCollectorIndex > finalLeftStackClose
) {
  throw new Error("The Review summary card was not placed in the left column.");
}
if (source.includes("Each saved note begins with the PI name and is ready to paste into ChatGPT.")) {
  throw new Error("The Review summary explanatory sentence is still present.");
}

fs.writeFileSync(pageUrl, source);
console.log("Review summary moved to the left Production Engine column and simplified.");
