import fs from "node:fs";

const routeUrl = new URL("../app/api/ncbi-figure/route.ts", import.meta.url);
let source = fs.readFileSync(routeUrl, "utf8");

source = source.replace(
  '    found.push(...results.filter((item): item is ImageCandidate => Boolean(item)));',
  '    for (const item of results) { if (item) found.push(item as ImageCandidate); }',
);

if (source.includes('results.filter((item): item is ImageCandidate')) {
  throw new Error("The NCBI figure resolver TypeScript narrowing fix was not applied.");
}

fs.writeFileSync(routeUrl, source);
console.log("Deterministic figure resolver prepared.");
