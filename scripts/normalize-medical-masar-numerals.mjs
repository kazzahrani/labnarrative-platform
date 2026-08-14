import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const pagePath = path.resolve(here, "../app/systems/demos/medical-masar/page.tsx");
const dynamicDemoPath = path.resolve(here, "../app/systems/demos/[slug]/ConceptDemoClient.tsx");

const arabicIndic = "٠١٢٣٤٥٦٧٨٩";
const easternArabic = "۰۱۲۳۴۵۶۷۸۹";
const westernizeLiteralDigits = (value) => value
  .replace(/[٠-٩]/g, (digit) => String(arabicIndic.indexOf(digit)))
  .replace(/[۰-۹]/g, (digit) => String(easternArabic.indexOf(digit)));

let source = fs.readFileSync(pagePath, "utf8");

// Make both language versions use Western digits at source/build time.
// This deliberately avoids runtime observers, DOM scans and prototype patches.
source = source
  .replaceAll('lang === "ar" ? "ar-SA" : "en-SA"', '"en-SA"')
  .replaceAll('lang === "ar" ? "ar-SA" : "en-US"', '"en-US"')
  .replace(
    /function localizeId\(v: string, lang: Lang\) \{[\s\S]*?\n\}/,
    'function localizeId(v: string, _lang: Lang) {\n  return v;\n}',
  );
source = westernizeLiteralDigits(source);

// Performance: the original Medical Masar component eagerly creates every demo screen
// on every language/theme state change. Turn each screen into a lazy render function so
// only the currently visible screen is constructed when Arabic/English changes.
for (const viewName of [
  "overview",
  "tendersView",
  "quotesView",
  "ordersView",
  "warehouseView",
  "supplyView",
  "invoicesView",
  "collectionView",
  "managementView",
  "accountsView",
  "automationView",
  "aiView",
]) {
  source = source.replace(`const ${viewName} = (`, `const ${viewName} = () => (`);
}

source = source
  .replace(
    "const views: Record<View, React.ReactNode> = {",
    "const views: Record<View, () => React.ReactNode> = {",
  )
  .replace(
    '<div className={styles.content}>{views[active]}</div>',
    '<div className={styles.content}>{views[active]()}</div>',
  );

fs.writeFileSync(pagePath, source, "utf8");

// Dynamic client demos (including NSC) must follow the same reference-number standard:
// Arabic UI text is RTL, but all numbers remain Western 0-9 for IDs, values and reports.
let dynamicSource = fs.readFileSync(dynamicDemoPath, "utf8");
dynamicSource = dynamicSource
  .replaceAll('lang === "ar" ? "ar-SA-u-nu-arab" : "en-US"', '"en-US"')
  .replaceAll('lang === "ar" ? "ar-SA-u-nu-arab" : "en-SA"', '"en-SA"');
dynamicSource = westernizeLiteralDigits(dynamicSource);
fs.writeFileSync(dynamicDemoPath, dynamicSource, "utf8");

console.log("Systems demo numerals normalized to Western 0-9; Medical Masar inactive views lazy-rendered.");
