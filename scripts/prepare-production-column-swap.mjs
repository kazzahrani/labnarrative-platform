import fs from "node:fs";

const pageUrl = new URL("../app/admin/automation/page.tsx", import.meta.url);
const liveQueueUrl = new URL("../components/admin/LiveProductionQueue.tsx", import.meta.url);

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
        if (text[end] !== "}") throw new Error(`${label} closing JSX brace was not found.`);
        return { start, end: end + 1, block: text.slice(start, end + 1).trim() };
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

// Move the Active and completed records table from the left stack to the top of the right stack.
let pageSource = fs.readFileSync(pageUrl, "utf8");
const historyLabel = "Active and completed records";
const historyCall = prospectTableCallForLabel(pageSource, historyLabel, historyLabel);
pageSource = `${pageSource.slice(0, historyCall.start)}${pageSource.slice(historyCall.end)}`;

const gridToken = "<div className={styles.grid}>";
const stackToken = "<div className={styles.stack}>";
const gridStart = pageSource.indexOf(gridToken);
if (gridStart === -1) throw new Error("The Production two-column grid was not found.");

const leftStackStart = pageSource.indexOf(stackToken, gridStart + gridToken.length);
if (leftStackStart === -1) throw new Error("The Production left column was not found.");
const leftStackClose = findMatchingDivClose(pageSource, leftStackStart);
if (leftStackClose === -1) throw new Error("The Production left column closing tag was not found.");

const rightStackStart = pageSource.indexOf(stackToken, leftStackClose);
if (rightStackStart === -1) throw new Error("The Production right column was not found.");
const rightStackOpenEnd = pageSource.indexOf("\n", rightStackStart);
if (rightStackOpenEnd === -1) throw new Error("The Production right column opening line was not found.");

pageSource = `${pageSource.slice(0, rightStackOpenEnd + 1)}            ${historyCall.block}\n\n${pageSource.slice(rightStackOpenEnd + 1)}`;

const finalHistory = prospectTableCallForLabel(pageSource, historyLabel, `Final ${historyLabel}`);
const finalGridStart = pageSource.indexOf(gridToken);
const finalLeftStackStart = pageSource.indexOf(stackToken, finalGridStart + gridToken.length);
const finalLeftStackClose = findMatchingDivClose(pageSource, finalLeftStackStart);
const finalRightStackStart = pageSource.indexOf(stackToken, finalLeftStackClose);
const finalRightStackClose = findMatchingDivClose(pageSource, finalRightStackStart);

if (
  finalHistory.start <= finalLeftStackClose ||
  finalHistory.start <= finalRightStackStart ||
  finalHistory.end >= finalRightStackClose
) {
  throw new Error("Active and completed records was not placed inside the right Production column.");
}

fs.writeFileSync(pageUrl, pageSource);

// Place the live Production queue portal at the top of the left stack while hiding the legacy current-production card.
let liveQueueSource = fs.readFileSync(liveQueueUrl, "utf8");
const oldPlacement = `      if (!original?.parentElement) return;\n      mount = document.createElement("div");\n      mount.dataset.liveProductionQueue = "true";\n      original.parentElement.insertBefore(mount, original);\n      original.style.display = "none";\n      setMountNode(mount);`;
const newPlacement = `      const rightStack = original?.parentElement;\n      const grid = rightStack?.parentElement;\n      const leftStack = grid?.firstElementChild as HTMLElement | null;\n      if (!original || !rightStack || !grid || !leftStack || leftStack === rightStack) return;\n      mount = document.createElement("div");\n      mount.dataset.liveProductionQueue = "true";\n      leftStack.insertBefore(mount, leftStack.firstChild);\n      original.style.display = "none";\n      setMountNode(mount);`;

if (liveQueueSource.includes(oldPlacement)) {
  liveQueueSource = liveQueueSource.replace(oldPlacement, newPlacement);
} else if (!liveQueueSource.includes(newPlacement)) {
  throw new Error("The Live Production queue placement block was not found.");
}

if (!liveQueueSource.includes("leftStack.insertBefore(mount, leftStack.firstChild);")) {
  throw new Error("The Live Production queue was not configured for the left Production column.");
}

fs.writeFileSync(liveQueueUrl, liveQueueSource);
console.log("Production columns prepared: Live production & recovery left; Active and completed records right.");
