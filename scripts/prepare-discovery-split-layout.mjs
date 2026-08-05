import fs from "node:fs";

const pageUrl = new URL("../app/admin/discovery/page.tsx", import.meta.url);
let source = fs.readFileSync(pageUrl, "utf8");

const cardClasses = [
  ["Discovery history", "discoverySplitHistory"],
  ["Diagnostic record", "discoverySplitDiagnostic"],
  ["Automatic queue", "discoverySplitQueue"],
];

const kickerIndexes = cardClasses.map(([kicker]) => {
  const token = `<p className={styles.kicker}>${kicker}</p>`;
  const index = source.indexOf(token);
  if (index === -1) throw new Error(`${kicker} was not found on the Discovery page.`);
  return index;
});

const firstCardIndex = Math.min(...kickerIndexes);
const stackToken = "<div className={styles.stack}>";
const stackIndex = source.lastIndexOf(stackToken, firstCardIndex);
if (stackIndex === -1) {
  throw new Error("The Discovery card stack was not found.");
}

const stackReplacement = '<div className={`${styles.stack} discoverySplitGrid`}>';
source = `${source.slice(0, stackIndex)}${stackReplacement}${source.slice(stackIndex + stackToken.length)}`;

for (const [kicker, className] of cardClasses) {
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

for (const requiredClass of [
  "discoverySplitGrid",
  "discoverySplitHistory",
  "discoverySplitDiagnostic",
  "discoverySplitQueue",
]) {
  if (!source.includes(requiredClass)) {
    throw new Error(`${requiredClass} was not added to the Discovery page.`);
  }
}

fs.writeFileSync(pageUrl, source);
console.log("Discovery workspace split into a left review stack and right automatic queue.");
