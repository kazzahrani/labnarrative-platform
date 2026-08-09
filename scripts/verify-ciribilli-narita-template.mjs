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
const researchDesign = read("components/designs/CiribilliResearchDesign.tsx");
const researchCss = read("components/designs/CiribilliResearchDesign.module.css");
const ciribilliMotion = read("components/designs/CiribilliNaritaDesign.tsx");
const naritaShared = read("components/designs/naritaShared.ts");

requireText(
  naritaShared,
  'export const NARITA_HERO_IMAGE = "https://upload.wikimedia.org/wikipedia/commons/2/21/HeLa-II.jpg";',
  "the approved red microscopy image must remain the canonical Narita hero",
);
requireText(
  naritaShared,
  "homepageImage: NARITA_HERO_IMAGE",
  "all Narita home pages must override site-specific homepage hero images",
);
requireText(
  naritaShared,
  "topPortrait: NARITA_HERO_IMAGE",
  "legacy Narita hero fields must also resolve to the canonical red microscopy image",
);
requireText(
  ciribilliMotion,
  "withNaritaHero(props.site)",
  "shared Narita routes must normalize their homepage hero through the canonical hero helper",
);
requireText(
  ciribilliMotion,
  "<NaritaOverlapDesign {...props} site={naritaSite} />",
  "the normalized Narita site must be passed into the shared renderer",
);

requireText(
  researchDesign,
  "const hero = NARITA_HERO_IMAGE;",
  "the Research tab must retain the canonical red microscopy hero",
);
requireText(
  researchDesign,
  '<Picture src={hero} alt="Research" fallback="LMCG" />',
  "the Research hero image must remain visible",
);
if (researchDesign.includes("project.figureImage")) {
  throw new Error(
    "Ciribilli Narita template lock failed: Research project sections must remain image-free",
  );
}
requireText(
  researchDesign,
  'style={{ gridTemplateColumns: "1fr" }}',
  "all Research projects must render as full-width text-only sections",
);
requireText(
  shell,
  'if (designVariant === "ciribilli-narita-v1" || designVariant === "narita-2-v1")',
  "the canonical Narita and Narita 2 variant routing is missing",
);
requireText(
  shell,
  "return <CiribilliResearchDesign site={researchSite}",
  "Research must retain the approved Ciribilli editorial research layout",
);
requireText(
  shell,
  "return <CiribilliNaritaDesign site={site}",
  "Home and the other tabs must retain the shared Narita layout",
);
requireText(
  ciribilliMotion,
  "const distance = reducedMotion ? 0 : window.scrollY;",
  "the homepage hero motion must remain directly tied to scrollY",
);
requireText(
  ciribilliMotion,
  "--ciribilli-home-panel-offset",
  "the homepage hero must retain its constant linear panel offset",
);
requireText(
  ciribilliMotion,
  "--ciribilli-gutter: clamp(24px, 5vw, 76px);",
  "the wordmark, navigation and hero copy must retain a shared responsive gutter",
);
requireText(
  ciribilliMotion,
  "--narita-header-height: 132px;",
  "the desktop Narita header must retain the approved compact height",
);
requireText(
  ciribilliMotion,
  "height: calc(100svh - var(--narita-header-height)) !important;",
  "the homepage hero must fit the remaining viewport beneath the header",
);
requireText(
  ciribilliMotion,
  "font-size: clamp(46px, min(7vw, 10svh), 96px) !important;",
  "the homepage hero typography must remain constrained by both viewport width and height",
);
requireText(
  ciribilliMotion,
  "object-position: center center !important;",
  "the canonical Narita homepage microscopy image must remain centered within the viewport-fit hero",
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
