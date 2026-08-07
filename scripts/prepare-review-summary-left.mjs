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

function prospectTableCallFromStart(text, start, label) {
  const openParen = text.indexOf("(", start);
  if (openParen === -1) throw new Error(`${label} opening parenthesis was not found.`);

  let depth = 0;
  let quote = "";
  let escaped = false;

  for (let index = openParen; index < text.length; index += 1) {
    const char = text[index];

    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === quote) quote = "";
      continue;
    }

    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }

    if (char === "(") depth += 1;
    if (char === ")") {
      depth -= 1;
      if (depth === 0) {
        let end = index + 1;
        while (/\s/.test(text[end] || "")) end += 1;
        if (text[end] !== "}") {
          throw new Error(`${label} closing JSX brace was not found.`);
        }
        end += 1;
        return {
          start,
          end,
          block: text.slice(start, end).trim(),
        };
      }
    }
  }

  throw new Error(`${label} call boundaries could not be identified.`);
}

function prospectTableCallForLabel(text, tableLabel, label) {
  let searchFrom = 0;
  while (searchFrom < text.length) {
    const start = text.indexOf("{renderProspectTable(", searchFrom);
    if (start === -1) break;
    const call = prospectTableCallFromStart(text, start, label);
    if (call.block.includes(`"${tableLabel}"`)) return call;
    searchFrom = call.end;
  }
  throw new Error(`${label} marker was not found.`);
}

const collectorMarker = "reviewNotesCollector";
const activityMarker = "<p className={styles.kicker}>Recent activity</p>";
const historyLabel = "Active and completed records";

const collectorSection = sectionForMarker(source, collectorMarker, "Summary review");
const activitySection = sectionForMarker(source, activityMarker, "Recent activity");
const historyCall = prospectTableCallForLabel(source, historyLabel, "Active and completed records");

for (const block of [collectorSection, activitySection, historyCall].sort((left, right) => right.start - left.start)) {
  source = `${source.slice(0, block.start)}${source.slice(block.end)}`;
}

const gridToken = "<div className={styles.grid}>";
const stackToken = "<div className={styles.stack}>";
const gridStart = source.indexOf(gridToken);
if (gridStart === -1) {
  throw new Error("The Production two-column grid was not found.");
}

const leftStackStart = source.indexOf(stackToken, gridStart + gridToken.length);
if (leftStackStart === -1) {
  throw new Error("The left Production column was not found.");
}
const leftStackClose = findMatchingDivClose(source, leftStackStart);
if (leftStackClose === -1) {
  throw new Error("The left Production column closing tag was not found.");
}

const rightStackStart = source.indexOf(stackToken, leftStackClose);
if (rightStackStart === -1) {
  throw new Error("The right Production column was not found.");
}

const leftStackOpenEnd = source.indexOf("\n", leftStackStart);
const rightStackOpenEnd = source.indexOf("\n", rightStackStart);
if (leftStackOpenEnd === -1 || rightStackOpenEnd === -1) {
  throw new Error("A Production column opening line could not be identified.");
}

source = `${source.slice(0, rightStackOpenEnd + 1)}            ${collectorSection.block}\n\n            ${activitySection.block}\n\n${source.slice(rightStackOpenEnd + 1)}`;

const refreshedGridStart = source.indexOf(gridToken);
const refreshedLeftStackStart = source.indexOf(stackToken, refreshedGridStart + gridToken.length);
const refreshedLeftOpenEnd = source.indexOf("\n", refreshedLeftStackStart);
source = `${source.slice(0, refreshedLeftOpenEnd + 1)}            ${historyCall.block}\n\n${source.slice(refreshedLeftOpenEnd + 1)}`;

const finalHistory = prospectTableCallForLabel(source, historyLabel, "Final Active and completed records");
const finalCollector = sectionForMarker(source, collectorMarker, "Final Summary review");
const finalActivity = sectionForMarker(source, activityMarker, "Final Recent activity");
const finalGridStart = source.indexOf(gridToken);
const finalLeftStackStart = source.indexOf(stackToken, finalGridStart + gridToken.length);
const finalLeftStackClose = findMatchingDivClose(source, finalLeftStackStart);
const finalRightStackStart = source.indexOf(stackToken, finalLeftStackClose);
const finalRightStackClose = findMatchingDivClose(source, finalRightStackStart);

if (
  finalHistory.start <= finalLeftStackStart ||
  finalHistory.end >= finalLeftStackClose
) {
  throw new Error("Active and completed records was not placed in the left Production column.");
}

if (
  finalCollector.start <= finalRightStackStart ||
  finalActivity.end >= finalRightStackClose ||
  finalCollector.start >= finalActivity.start
) {
  throw new Error("Summary review and Recent activity were not placed in that order in the right Production column.");
}

const betweenCollectorAndActivity = source.slice(finalCollector.end, finalActivity.start).trim();
if (betweenCollectorAndActivity) {
  throw new Error("Summary review is not immediately followed by Recent activity in the right column.");
}

if (source.includes("Each saved note begins with the PI name and is ready to paste into ChatGPT.")) {
  throw new Error("The Summary review explanatory sentence is still present.");
}

fs.writeFileSync(pageUrl, source);
console.log("Production layout prepared: Active and completed records left; Summary review then Recent activity right.");
