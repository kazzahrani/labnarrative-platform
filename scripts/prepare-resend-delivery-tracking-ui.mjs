import fs from "node:fs";

const pageUrl = new URL("../app/admin/automation/page.tsx", import.meta.url);
let source = fs.readFileSync(pageUrl, "utf8");

const componentImport = 'import ResendDeliveryTracker from "@/components/admin/ResendDeliveryTracker";';
const componentMarkup = "<ResendDeliveryTracker />";

source = source
  .replace(`${componentImport}\n`, "")
  .replace(componentImport, "")
  .replace(/^[ \t]*<ResendDeliveryTracker \/>\n?/m, "");

if (source.includes(componentImport) || source.includes(componentMarkup)) {
  throw new Error("The Resend tracking window is still mounted in the Production page.");
}

fs.writeFileSync(pageUrl, source);
console.log("Resend delivery tracking window removed from the Production Engine; backend tracking remains available.");
