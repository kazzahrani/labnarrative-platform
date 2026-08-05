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

const collectorMarker = "reviewNotesCollector";
const activityMarker = "<p className={styles.kicker}>Recent activity</p>";
const collectorSection = sectionForMarker(source, collectorMarker, "Review summary");
const activitySection = sectionForMarker(source, activityMarker, "Recent activity");

for (const section of [collectorSection, activitySection].sort((left, right) => right.start - left.start)) {
  source = `${source.slice(0, section.start)}${source.slice(section.end)}`;
}

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

const rightColumnBlocks = [activitySection.block, collectorSection.block]
  .map((block) => `            ${block}`)
  .join("\n\n");

source = `${source.slice(0, buildableCallEnd)}\n\n${rightColumnBlocks}${source.slice(buildableCallEnd)}`;

const finalBuildableMarkerIndex = source.indexOf(buildableMarker);
const finalBuildableCallStart = source.lastIndexOf("{renderProspectTable(", finalBuildableMarkerIndex);
const finalBuildableCallClose = findMatchingCurly(source, finalBuildableCallStart);
const finalActivity = sectionForMarker(source, activityMarker, "Final Recent activity");
const finalCollector = sectionForMarker(source, collectorMarker, "Final Review summary");

if (
  finalBuildableCallStart === -1 ||
  finalBuildableCallClose === -1 ||
  finalActivity.start <= finalBuildableCallClose ||
  finalCollector.start <= finalActivity.end
) {
  throw new Error("The right-column Production window order is incorrect.");
}

const betweenBuildableAndActivity = source
  .slice(finalBuildableCallClose + 1, finalActivity.start)
  .trim();
if (betweenBuildableAndActivity) {
  throw new Error("Recent activity is not immediately after Buildable prospects.");
}

const betweenActivityAndCollector = source
  .slice(finalActivity.end, finalCollector.start)
  .trim();
if (betweenActivityAndCollector) {
  throw new Error("Review summary is not immediately after Recent activity.");
}

const stackToken = "<div className={styles.stack}>";
const rightStackStart = source.lastIndexOf(stackToken, finalBuildableMarkerIndex);
const rightStackClose = findMatchingDivClose(source, rightStackStart);
if (
  rightStackStart === -1 ||
  rightStackClose === -1 ||
  finalActivity.start < rightStackStart ||
  finalCollector.end > rightStackClose
) {
  throw new Error("Recent activity and Review summary were not placed in the right Production Engine column.");
}

if (source.includes("Each saved note begins with the PI name and is ready to paste into ChatGPT.")) {
  throw new Error("The Review summary explanatory sentence is still present.");
}

fs.writeFileSync(pageUrl, source);
console.log("Recent activity moved to the right Production Engine column above Review summary.");
