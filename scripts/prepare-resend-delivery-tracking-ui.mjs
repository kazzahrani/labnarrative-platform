import fs from "node:fs";

const pageUrl = new URL("../app/admin/automation/page.tsx", import.meta.url);
let source = fs.readFileSync(pageUrl, "utf8");

const componentImport = 'import ResendDeliveryTracker from "@/components/admin/ResendDeliveryTracker";';
if (!source.includes(componentImport)) {
  const importMarker = 'import Link from "next/link";';
  if (!source.includes(importMarker)) {
    throw new Error("The Production page Link import was not found.");
  }
  source = source.replace(importMarker, `${importMarker}\n${componentImport}`);
}

const componentMarkup = "<ResendDeliveryTracker />";
if (!source.includes(componentMarkup)) {
  const activityMarker = "<p className={styles.kicker}>Recent activity</p>";
  const activityMarkerIndex = source.indexOf(activityMarker);
  if (activityMarkerIndex === -1) {
    throw new Error("The Recent activity window was not found for Resend tracking placement.");
  }

  const activitySectionStart = source.lastIndexOf("<section", activityMarkerIndex);
  if (activitySectionStart === -1) {
    throw new Error("The Recent activity section boundary could not be identified.");
  }

  const lineStart = source.lastIndexOf("\n", activitySectionStart) + 1;
  const indentation = source.slice(lineStart, activitySectionStart);
  source = `${source.slice(0, lineStart)}${indentation}${componentMarkup}\n\n${source.slice(lineStart)}`;
}

const importCount = source.split(componentImport).length - 1;
const markupCount = source.split(componentMarkup).length - 1;
if (importCount !== 1 || markupCount !== 1) {
  throw new Error(`Resend tracking must appear exactly once; imports=${importCount}, panels=${markupCount}.`);
}

const activityIndex = source.indexOf("<p className={styles.kicker}>Recent activity</p>");
const trackingIndex = source.indexOf(componentMarkup);
if (trackingIndex === -1 || activityIndex === -1 || trackingIndex > activityIndex) {
  throw new Error("Resend tracking was not placed before Recent activity.");
}

fs.writeFileSync(pageUrl, source);
console.log("Resend connection and delivery tracking added to the Production Engine.");
