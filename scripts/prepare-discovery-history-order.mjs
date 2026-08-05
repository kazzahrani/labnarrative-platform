import fs from "node:fs";

const pageUrl = new URL("../app/admin/discovery/page.tsx", import.meta.url);
let source = fs.readFileSync(pageUrl, "utf8");

function findCardRange(kicker) {
  const kickerToken = `<p className={styles.kicker}>${kicker}</p>`;
  const kickerIndex = source.indexOf(kickerToken);
  if (kickerIndex === -1) {
    throw new Error(`${kicker} heading was not found on the Discovery page.`);
  }

  const sectionStart = source.lastIndexOf("<section className={styles.card}>", kickerIndex);
  if (sectionStart === -1) {
    throw new Error(`${kicker} card start was not found.`);
  }

  const sectionEndToken = "</section>";
  const sectionEndStart = source.indexOf(sectionEndToken, kickerIndex);
  if (sectionEndStart === -1) {
    throw new Error(`${kicker} card ending was not found.`);
  }

  return {
    start: sectionStart,
    end: sectionEndStart + sectionEndToken.length,
  };
}

const historyRange = findCardRange("Discovery history");
const queueRange = findCardRange("Automatic queue");

if (historyRange.start > queueRange.start) {
  const historyBlock = source.slice(historyRange.start, historyRange.end);
  source = `${source.slice(0, historyRange.start)}${source.slice(historyRange.end)}`;

  const refreshedQueueRange = findCardRange("Automatic queue");
  source = `${source.slice(0, refreshedQueueRange.start)}${historyBlock}\n\n            ${source.slice(refreshedQueueRange.start)}`;
}

const finalHistoryIndex = source.indexOf('<p className={styles.kicker}>Discovery history</p>');
const finalQueueIndex = source.indexOf('<p className={styles.kicker}>Automatic queue</p>');
if (finalHistoryIndex === -1 || finalQueueIndex === -1 || finalHistoryIndex > finalQueueIndex) {
  throw new Error("Discovery history was not placed above the automatic queue.");
}

fs.writeFileSync(pageUrl, source);
console.log("Discovery history placed above the automatic queue.");
