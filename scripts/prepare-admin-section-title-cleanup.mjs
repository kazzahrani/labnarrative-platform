import fs from "node:fs";

const pages = [
  new URL("../app/admin/discovery/page.tsx", import.meta.url),
  new URL("../app/admin/automation/page.tsx", import.meta.url),
];

const titles = [
  "Production-quality prospects",
  "Recent runs",
  "Held, rejected and exceptions",
  "Collected issue notes",
];

for (const pageUrl of pages) {
  let source = fs.readFileSync(pageUrl, "utf8");

  for (const title of titles) {
    const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    source = source.replace(new RegExp(`\\s*<h2>\\s*${escaped}\\s*<\\/h2>`, "g"), "");
  }

  fs.writeFileSync(pageUrl, source);
}

const combined = pages.map((pageUrl) => fs.readFileSync(pageUrl, "utf8")).join("\n");
for (const title of titles) {
  if (combined.includes(`<h2>${title}</h2>`)) {
    throw new Error(`Redundant section title remains: ${title}`);
  }
}

console.log("Redundant Discovery and Production section titles removed.");
