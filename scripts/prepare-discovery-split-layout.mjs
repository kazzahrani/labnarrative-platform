import fs from "node:fs";

const pageUrl = new URL("../app/admin/discovery/page.tsx", import.meta.url);
let source = fs.readFileSync(pageUrl, "utf8");

const cardClasses = [
  ["Discovery history", "discoverySplitHistory"],
  ["Diagnostic record", "discoverySplitDiagnostic"],
  ["Automatic queue", "discoverySplitQueue"],
];

function cardRange(kicker) {
  const kickerToken = `<p className={styles.kicker}>${kicker}</p>`;
  const kickerIndex = source.indexOf(kickerToken);
  if (kickerIndex === -1) throw new Error(`${kicker} was not found on the Discovery page.`);

  const cardStartTokens = [
    "<section className={styles.card}>",
    '<section className={`${styles.card} discoverySplitHistory`}>',
    '<section className={`${styles.card} discoverySplitDiagnostic`}>',
    '<section className={`${styles.card} discoverySplitQueue`}>',
  ];

  let start = -1;
  for (const token of cardStartTokens) {
    const candidate = source.lastIndexOf(token, kickerIndex);
    if (candidate > start) start = candidate;
  }
  if (start === -1) throw new Error(`${kicker} card container was not found.`);

  const endStart = source.indexOf("</section>", kickerIndex);
  if (endStart === -1) throw new Error(`${kicker} card ending was not found.`);

  return { start, end: endStart + "</section>".length };
}

const initialRanges = cardClasses.map(([kicker]) => cardRange(kicker));
const firstCardIndex = Math.min(...initialRanges.map((range) => range.start));
const stackToken = "<div className={styles.stack}>";
const preparedStackToken = '<div className={`${styles.stack} discoverySplitGrid`}>';
let stackIndex = source.lastIndexOf(preparedStackToken, firstCardIndex);
let stackTokenLength = preparedStackToken.length;

if (stackIndex === -1) {
  stackIndex = source.lastIndexOf(stackToken, firstCardIndex);
  stackTokenLength = stackToken.length;
}
if (stackIndex === -1) {
  throw new Error("The Discovery card stack was not found.");
}

if (!source.includes("discoverySplitGrid")) {
  source = `${source.slice(0, stackIndex)}${preparedStackToken}${source.slice(stackIndex + stackTokenLength)}`;
}

for (const [kicker, className] of cardClasses) {
  if (source.includes(className)) continue;

  const kickerToken = `<p className={styles.kicker}>${kicker}</p>`;
  const kickerIndex = source.indexOf(kickerToken);
  const cardToken = "<section className={styles.card}>";
  const cardIndex = source.lastIndexOf(cardToken, kickerIndex);

  if (cardIndex === -1) {
    throw new Error(`${kicker} card container was not found.`);
  }

  const replacement = '<section className={`${styles.card} ' + className + '`}>';
  source = `${source.slice(0, cardIndex)}${replacement}${source.slice(cardIndex + cardToken.length)}`;
}

if (!source.includes("discoverySplitLeft")) {
  const historyRange = cardRange("Discovery history");
  const diagnosticRange = cardRange("Diagnostic record");
  const queueRange = cardRange("Automatic queue");

  const historyBlock = source.slice(historyRange.start, historyRange.end).trim();
  const diagnosticBlock = source.slice(diagnosticRange.start, diagnosticRange.end).trim();
  const queueBlock = source.slice(queueRange.start, queueRange.end).trim();

  const rangesDescending = [historyRange, diagnosticRange, queueRange]
    .sort((a, b) => b.start - a.start);
  for (const range of rangesDescending) {
    source = `${source.slice(0, range.start)}${source.slice(range.end)}`;
  }

  const refreshedStackIndex = source.indexOf(preparedStackToken);
  if (refreshedStackIndex === -1) {
    throw new Error("The prepared Discovery split container was not found.");
  }
  const insertionPoint = refreshedStackIndex + preparedStackToken.length;
  const splitContent = `
            <div className="discoverySplitLeft">
              ${historyBlock}

              ${diagnosticBlock}
            </div>

            ${queueBlock}`;
  source = `${source.slice(0, insertionPoint)}${splitContent}${source.slice(insertionPoint)}`;
}

const leftIndex = source.indexOf('className="discoverySplitLeft"');
const historyIndex = source.indexOf("discoverySplitHistory");
const diagnosticIndex = source.indexOf("discoverySplitDiagnostic");
const queueIndex = source.indexOf("discoverySplitQueue");
if (
  leftIndex === -1 ||
  historyIndex === -1 ||
  diagnosticIndex === -1 ||
  queueIndex === -1 ||
  !(leftIndex < historyIndex && historyIndex < diagnosticIndex && diagnosticIndex < queueIndex)
) {
  throw new Error("The Discovery left stack and right queue were not arranged correctly.");
}

fs.writeFileSync(pageUrl, source);
console.log("Discovery history and diagnostic records stacked directly in the left column beside the automatic queue.");
