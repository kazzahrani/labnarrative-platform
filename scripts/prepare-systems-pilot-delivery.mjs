import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const pagePath = path.resolve(here, "../app/admin/systems-outreach/delivery/page.tsx");

let page = fs.readFileSync(pagePath, "utf8");

// Keep the Delivery workspace source build-safe. The Field helper currently does not expose
// a placeholder prop, so keep the example in the label/context rather than passing an invalid JSX prop.
page = page.replace(
  ' rows={10} placeholder="Example: 0 incomplete orders marked ready; collection owner visible for all Pilot invoices…" />',
  ' rows={10} />'
);

fs.writeFileSync(pagePath, page, "utf8");
console.log("Systems Pilot Delivery source prepared.");
