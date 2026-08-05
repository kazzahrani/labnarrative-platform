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

source = `${source.slice(0, collectorStart)}${source.slice(collectorEnd)}`;

function findMatchingCurly(text, openingIndex) {
  let depth = 0;
  let quote = "";
  let escaped = false;

  for (let index = openingIndex; index < text.length; index += 1) {
    const character = text[index];

    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (character === "\\") {
        escaped = true;
        continue;
      }
      if (character === quote) quote = "";
      continue;
    }

    if (character === '"' || character === "'" || character === "`") {
      quote = character;
      continue;
    }

    if (character === "{") depth += 1;
    if (character === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }

  return -1;
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

const buildableMarker = '"Buildable prospects · score 75–100"';
const buildableMarkerIndex = source.indexOf(buildableMarker);
if (buildableMarkerIndex === -1) {
  throw new Error("The Buildable prospects window was not found.");
}

const buildableCallStart = source.lastIndexOf("{renderProspectTable(", buildableMarkerIndex);
if (buildableCallStart === -1) {
  throw new Error("The Buildable prospects render call was not found.");
}

const buildableCallClose = findMatchingCurly(source, buildableCallStart);
if (buildableCallClose === -1) {
  throw new Error("The end of the Buildable prospects window could not be identified.");
}
const buildableCallEnd = buildableCallClose + 1;

source = `${source.slice(0, buildableCallEnd)}\n\n            ${collectorBlock}${source.slice(buildableCallEnd)}`;

const finalBuildableMarkerIndex = source.indexOf(buildableMarker);
const finalBuildableCallStart = source.lastIndexOf("{renderProspectTable(", finalBuildableMarkerIndex);
const finalBuildableCallClose = findMatchingCurly(source, finalBuildableCallStart);
const finalCollectorMarkerIndex = source.indexOf(collectorMarker);
const finalCollectorStart = source.lastIndexOf("<section", finalCollectorMarkerIndex);

if (
  finalBuildableCallStart === -1 ||
  finalBuildableCallClose === -1 ||
  finalCollectorMarkerIndex === -1 ||
  finalCollectorStart === -1 ||
  finalCollectorStart <= finalBuildableCallClose
) {
  throw new Error("The Review summary card was not placed after Buildable prospects.");
}

const betweenBuildableAndCollector = source
  .slice(finalBuildableCallClose + 1, finalCollectorStart)
  .trim();
if (betweenBuildableAndCollector) {
  throw new Error("The Review summary card is not immediately after Buildable prospects.");
}

const stackToken = "<div className={styles.stack}>";
const rightStackStart = source.lastIndexOf(stackToken, finalBuildableMarkerIndex);
const rightStackClose = findMatchingDivClose(source, rightStackStart);
if (
  rightStackStart === -1 ||
  rightStackClose === -1 ||
  finalCollectorStart < rightStackStart ||
  finalCollectorStart > rightStackClose
) {
  throw new Error("The Review summary card was not placed in the right Production Engine column.");
}

if (source.includes("Each saved note begins with the PI name and is ready to paste into ChatGPT.")) {
  throw new Error("The Review summary explanatory sentence is still present.");
}

fs.writeFileSync(pageUrl, source);
console.log("Review summary moved to the right Production Engine column directly below Buildable prospects.");
