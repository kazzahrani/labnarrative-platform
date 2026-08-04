import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();

function read(relativePath) {
  return readFileSync(resolve(root, relativePath), "utf8");
}

function requireText(source, expected, message) {
  if (!source.includes(expected)) {
    throw new Error(`Ciribilli Narita template lock failed: ${message}`);
  }
}

function blockFor(source, selector) {
  const start = source.indexOf(selector);
  if (start < 0) throw new Error(`Ciribilli Narita template lock failed: missing CSS selector ${selector}`);
  const open = source.indexOf("{", start);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, index);
    }
  }
  throw new Error(`Ciribilli Narita template lock failed: malformed CSS block ${selector}`);
}

const shell = read("components/SiteShell.tsx");
const photoDesign = read("components/designs/PhotoLabDesign.tsx");
const researchCss = read("components/designs/CiribilliResearchDesign.module.css");

requireText(
  shell,
  'const CIRIBILLI_RESEARCH_HERO = "https://upload.wikimedia.org/wikipedia/commons/b/b3/HeLa-I.jpg";',
  "the approved microscopy hero must remain the Research hero source",
);
requireText(
  shell,
  'if (designVariant === "ciribilli-narita-v1")',
  "the canonical variant routing is missing",
);
requireText(
  shell,
  "const researchSite = { ...site, heroImage: CIRIBILLI_RESEARCH_HERO };",
  "Research must receive the approved inner-page microscopy hero rather than a project figure",
);
requireText(
  shell,
  "return <CiribilliResearchDesign site={researchSite}",
  "Research must retain the approved Ciribilli editorial research layout",
);
requireText(
  shell,
  "return <NaritaOverlapDesign site={site}",
  "Home and the other tabs must retain the Narita layout",
);

requireText(
  photoDesign,
  "const portrait = pages.home.piImage || pi?.image;",
  "PI portraits may only come from dedicated PI/member portrait fields",
);
if (/const portrait\s*=\s*[^;]*(heroImage|homepageImage|topPortrait|figureImage)/.test(photoDesign)) {
  throw new Error(
    "Ciribilli Narita template lock failed: a research or hero image is being used as a PI portrait fallback",
  );
}

const heroBlock = blockFor(researchCss, ".hero {");
requireText(heroBlock, "box-shadow: none !important;", "the Research hero must not have a box shadow");

const overlayBlock = blockFor(researchCss, ".hero > div:first-of-type {");
requireText(overlayBlock, "background: rgba(0, 0, 0, 0.2) !important;", "the Research hero overlay must stay uniform and subtle");
requireText(overlayBlock, "box-shadow: none !important;", "the Research hero overlay must not cast a shadow");
if (overlayBlock.includes("linear-gradient")) {
  throw new Error(
    "Ciribilli Narita template lock failed: the Research hero overlay must not contain a bottom-darkening gradient",
  );
}

console.log("Ciribilli Narita template lock verified.");
