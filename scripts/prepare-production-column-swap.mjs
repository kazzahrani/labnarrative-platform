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

// Keep Active and completed records at the top of the left Production column.
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
const leftStackOpenEnd = pageSource.indexOf("\n", leftStackStart);
if (leftStackOpenEnd === -1) throw new Error("The Production left column opening line was not found.");

pageSource = `${pageSource.slice(0, leftStackOpenEnd + 1)}            ${historyCall.block}\n\n${pageSource.slice(leftStackOpenEnd + 1)}`;

const finalHistory = prospectTableCallForLabel(pageSource, historyLabel, `Final ${historyLabel}`);
const finalGridStart = pageSource.indexOf(gridToken);
const finalLeftStackStart = pageSource.indexOf(stackToken, finalGridStart + gridToken.length);
const finalLeftStackClose = findMatchingDivClose(pageSource, finalLeftStackStart);
const finalRightStackStart = pageSource.indexOf(stackToken, finalLeftStackClose);

if (
  finalHistory.start <= finalLeftStackStart ||
  finalHistory.end >= finalLeftStackClose ||
  finalHistory.start >= finalRightStackStart
) {
  throw new Error("Active and completed records was not placed inside the left Production column.");
}

fs.writeFileSync(pageUrl, pageSource);

// Place the live Production queue immediately after Active and completed records in the left stack,
// while hiding the legacy current-production card in the right stack.
let liveQueueSource = fs.readFileSync(liveQueueUrl, "utf8");
const oldPlacementTop = `      const rightStack = original?.parentElement;\n      const grid = rightStack?.parentElement;\n      const leftStack = grid?.firstElementChild as HTMLElement | null;\n      if (!original || !rightStack || !grid || !leftStack || leftStack === rightStack) return;\n      mount = document.createElement("div");\n      mount.dataset.liveProductionQueue = "true";\n      leftStack.insertBefore(mount, leftStack.firstChild);\n      original.style.display = "none";\n      setMountNode(mount);`;
const oldPlacementLegacy = `      if (!original?.parentElement) return;\n      mount = document.createElement("div");\n      mount.dataset.liveProductionQueue = "true";\n      original.parentElement.insertBefore(mount, original);\n      original.style.display = "none";\n      setMountNode(mount);`;
const newPlacement = `      const rightStack = original?.parentElement;\n      const grid = rightStack?.parentElement;\n      const leftStack = grid?.firstElementChild as HTMLElement | null;\n      if (!original || !rightStack || !grid || !leftStack || leftStack === rightStack) return;\n      mount = document.createElement("div");\n      mount.dataset.liveProductionQueue = "true";\n      const historyPanel = leftStack.firstElementChild;\n      leftStack.insertBefore(mount, historyPanel?.nextSibling ?? null);\n      original.style.display = "none";\n      setMountNode(mount);`;

if (liveQueueSource.includes(oldPlacementTop)) {
  liveQueueSource = liveQueueSource.replace(oldPlacementTop, newPlacement);
} else if (liveQueueSource.includes(oldPlacementLegacy)) {
  liveQueueSource = liveQueueSource.replace(oldPlacementLegacy, newPlacement);
} else if (!liveQueueSource.includes(newPlacement)) {
  throw new Error("The Live Production queue placement block was not found.");
}

if (!liveQueueSource.includes("leftStack.insertBefore(mount, historyPanel?.nextSibling ?? null);")) {
  throw new Error("The Live Production queue was not configured below Active and completed records.");
}

fs.writeFileSync(liveQueueUrl, liveQueueSource);
console.log("Production columns prepared: Active/completed records first on the left; live production below it; review panels remain on the right.");
