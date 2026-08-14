import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const pagePath = path.resolve(here, "../app/systems/demos/medical-masar/page.tsx");
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

const arabicIndic = "٠١٢٣٤٥٦٧٨٩";
const easternArabic = "۰۱۲۳۴۵۶۷۸۹";
source = source
  .replace(/[٠-٩]/g, (digit) => String(arabicIndic.indexOf(digit)))
  .replace(/[۰-۹]/g, (digit) => String(easternArabic.indexOf(digit)));

// Performance: the original component eagerly creates every demo screen on every
// language/theme state change. Turn each screen into a lazy render function so
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
console.log("Medical Masar numerals normalized and inactive views lazy-rendered for build.");
