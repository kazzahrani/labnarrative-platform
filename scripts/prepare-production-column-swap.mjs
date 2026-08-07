import fs from "node:fs";

const pageUrl = new URL("../app/admin/automation/page.tsx", import.meta.url);
const liveQueueUrl = new URL("../components/admin/LiveProductionQueue.tsx", import.meta.url);
const cssUrl = new URL("../app/admin/automation/automation.module.css", import.meta.url);

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

// Final Production layout:
// LEFT  = Active and completed records (top) ... Build queue (bottom)
// RIGHT = Production queue (top, mounted by LiveProductionQueue) ... Summary review / Recent activity (bottom)
let pageSource = fs.readFileSync(pageUrl, "utf8");
const historyLabel = "Active and completed records";
const buildLabel = "Build queue";
const historyCall = prospectTableCallForLabel(pageSource, historyLabel, historyLabel);
const buildCall = prospectTableCallForLabel(pageSource, buildLabel, buildLabel);

for (const block of [historyCall, buildCall].sort((a, b) => b.start - a.start)) {
  pageSource = `${pageSource.slice(0, block.start)}${pageSource.slice(block.end)}`;
}

const gridToken = "<div className={styles.grid}>";
const stackToken = "<div className={styles.stack}>";
let gridStart = pageSource.indexOf(gridToken);
if (gridStart === -1) throw new Error("The Production two-column grid was not found.");

let leftStackStart = pageSource.indexOf(stackToken, gridStart + gridToken.length);
if (leftStackStart === -1) throw new Error("The Production left column was not found.");
let leftStackOpenEnd = pageSource.indexOf("\n", leftStackStart);
if (leftStackOpenEnd === -1) throw new Error("The Production left column opening line was not found.");

// Active/completed records goes first in the left column.
pageSource = `${pageSource.slice(0, leftStackOpenEnd + 1)}            ${historyCall.block}\n\n${pageSource.slice(leftStackOpenEnd + 1)}`;

// Re-find the left column after insertion and put Build queue immediately before its closing tag.
gridStart = pageSource.indexOf(gridToken);
leftStackStart = pageSource.indexOf(stackToken, gridStart + gridToken.length);
let leftStackClose = findMatchingDivClose(pageSource, leftStackStart);
if (leftStackClose === -1) throw new Error("The Production left column closing tag was not found.");
pageSource = `${pageSource.slice(0, leftStackClose)}            ${buildCall.block}\n          ${pageSource.slice(leftStackClose)}`;

// Validate both tables are in the left column and in the requested order.
const finalHistory = prospectTableCallForLabel(pageSource, historyLabel, `Final ${historyLabel}`);
const finalBuild = prospectTableCallForLabel(pageSource, buildLabel, `Final ${buildLabel}`);
const finalGridStart = pageSource.indexOf(gridToken);
const finalLeftStackStart = pageSource.indexOf(stackToken, finalGridStart + gridToken.length);
const finalLeftStackClose = findMatchingDivClose(pageSource, finalLeftStackStart);
const finalRightStackStart = pageSource.indexOf(stackToken, finalLeftStackClose);

if (
  finalHistory.start <= finalLeftStackStart ||
  finalBuild.end >= finalLeftStackClose ||
  finalHistory.start >= finalBuild.start ||
  finalBuild.end >= finalRightStackStart
) {
  throw new Error("Left Production column must contain Active and completed records first and Build queue last.");
}

fs.writeFileSync(pageUrl, pageSource);

// Mount the enhanced Production queue at the very top of the RIGHT column and hide the legacy card.
let liveQueueSource = fs.readFileSync(liveQueueUrl, "utf8");
const placements = [
  `      const rightStack = original?.parentElement;\n      const grid = rightStack?.parentElement;\n      const leftStack = grid?.firstElementChild as HTMLElement | null;\n      if (!original || !rightStack || !grid || !leftStack || leftStack === rightStack) return;\n      mount = document.createElement("div");\n      mount.dataset.liveProductionQueue = "true";\n      const historyPanel = leftStack.firstElementChild;\n      leftStack.insertBefore(mount, historyPanel?.nextSibling ?? null);\n      original.style.display = "none";\n      setMountNode(mount);`,
  `      const rightStack = original?.parentElement;\n      const grid = rightStack?.parentElement;\n      const leftStack = grid?.firstElementChild as HTMLElement | null;\n      if (!original || !rightStack || !grid || !leftStack || leftStack === rightStack) return;\n      mount = document.createElement("div");\n      mount.dataset.liveProductionQueue = "true";\n      leftStack.insertBefore(mount, leftStack.firstChild);\n      original.style.display = "none";\n      setMountNode(mount);`,
  `      if (!original?.parentElement) return;\n      mount = document.createElement("div");\n      mount.dataset.liveProductionQueue = "true";\n      original.parentElement.insertBefore(mount, original);\n      original.style.display = "none";\n      setMountNode(mount);`,
];
const newPlacement = `      const rightStack = original?.parentElement;\n      if (!original || !rightStack) return;\n      mount = document.createElement("div");\n      mount.dataset.liveProductionQueue = "true";\n      rightStack.insertBefore(mount, rightStack.firstChild);\n      original.style.display = "none";\n      setMountNode(mount);`;

if (!liveQueueSource.includes(newPlacement)) {
  const oldPlacement = placements.find((placement) => liveQueueSource.includes(placement));
  if (!oldPlacement) throw new Error("The Live Production queue placement block was not found.");
  liveQueueSource = liveQueueSource.replace(oldPlacement, newPlacement);
}

if (!liveQueueSource.includes("rightStack.insertBefore(mount, rightStack.firstChild);")) {
  throw new Error("The Live Production queue was not configured at the top of the right Production column.");
}

fs.writeFileSync(liveQueueUrl, liveQueueSource);

// Keep both dashboard halves genuinely equal and prevent table content from widening either column.
let css = fs.readFileSync(cssUrl, "utf8");
css = css.replace(
  "grid-template-columns: minmax(330px, 0.72fr) minmax(0, 1.28fr);",
  "grid-template-columns: repeat(2, minmax(0, 1fr));",
);
if (!css.includes("grid-template-columns: repeat(2, minmax(0, 1fr));")) {
  throw new Error("Balanced Production grid columns could not be applied.");
}

const stackRule = `.stack {\n  display: grid;\n  gap: 20px;\n}`;
const balancedStackRule = `.stack {\n  display: grid;\n  gap: 20px;\n  min-width: 0;\n}`;
if (css.includes(stackRule)) css = css.replace(stackRule, balancedStackRule);

const cardRule = `.card {\n  border: 1px solid #d1dad4;`;
const balancedCardRule = `.card {\n  min-width: 0;\n  border: 1px solid #d1dad4;`;
if (!css.includes(".card {\n  min-width: 0;")) css = css.replace(cardRule, balancedCardRule);

const tableWrapRule = `.tableWrap {\n  overflow: hidden;`;
const balancedTableWrapRule = `.tableWrap {\n  width: 100%;\n  max-width: 100%;\n  min-width: 0;\n  overflow: hidden;`;
if (!css.includes(".tableWrap {\n  width: 100%;")) css = css.replace(tableWrapRule, balancedTableWrapRule);

fs.writeFileSync(cssUrl, css);
console.log("Production columns prepared: records top-left, Build queue bottom-left, Production queue top-right, review/activity bottom-right; columns balanced 50/50.");
