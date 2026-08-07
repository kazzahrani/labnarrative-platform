import fs from "node:fs";

const ncbiRouteUrl = new URL("../app/api/ncbi-figure/route.ts", import.meta.url);
let ncbiSource = fs.readFileSync(ncbiRouteUrl, "utf8");

ncbiSource = ncbiSource.replace(
  '    found.push(...results.filter((item): item is ImageCandidate => Boolean(item)));',
  '    for (const item of results) { if (item) found.push(item as ImageCandidate); }',
);

if (ncbiSource.includes('results.filter((item): item is ImageCandidate')) {
  throw new Error("The NCBI figure resolver TypeScript narrowing fix was not applied.");
}

const ambiguityMessage = "A specific NCBI figure URL is required; article-level PubMed/PMC URLs are ambiguous.";
if (!ncbiSource.includes(ambiguityMessage)) {
  ncbiSource = ncbiSource.replace(
    '  try {\n    let pmcid = pmcidFromUrl(sourceUrl);',
    `  try {\n    const requested = requestedFigureNumber(sourceUrl);\n    if (requested === null) return errorResponse("${ambiguityMessage}", 400);\n\n    let pmcid = pmcidFromUrl(sourceUrl);`,
  );
  ncbiSource = ncbiSource.replace(
    '    return await resolveFigure(pmcid, requestedFigureNumber(sourceUrl));',
    '    return await resolveFigure(pmcid, requested);',
  );
}

if (!ncbiSource.includes(ambiguityMessage) || !ncbiSource.includes('return await resolveFigure(pmcid, requested);')) {
  throw new Error("The NCBI figure ambiguity guard was not applied.");
}

fs.writeFileSync(ncbiRouteUrl, ncbiSource);

const figureRouteUrl = new URL("../app/api/figure/route.ts", import.meta.url);
let figureSource = fs.readFileSync(figureRouteUrl, "utf8");

if (!figureSource.includes("function isDirectScientificImage")) {
  figureSource = figureSource.replace(
    'function isNcbiFigureSource(url: URL) {',
    `function isDirectScientificImage(url: URL) {\n  let path = url.pathname.toLowerCase();\n  try { path = decodeURIComponent(path); } catch { /* keep encoded path */ }\n  return /\\.(png|jpe?g|webp)$/.test(path) || /\\/bin\\/[^/]+$/.test(path);\n}\n\nfunction isNcbiFigureSource(url: URL) {`,
  );
}

figureSource = figureSource.replace(
  '    if (isNcbiFigureSource(source)) {',
  '    if (isNcbiFigureSource(source) && !isDirectScientificImage(source)) {',
);

if (!figureSource.includes("function isDirectScientificImage") || !figureSource.includes("isNcbiFigureSource(source) && !isDirectScientificImage(source)")) {
  throw new Error("The direct-image bypass for the NCBI resolver was not applied.");
}

fs.writeFileSync(figureRouteUrl, figureSource);
console.log("Deterministic figure resolver and ambiguity guards prepared.");
