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
const bigginsNarita2 = read("components/designs/BigginsNarita2Design.tsx");

requireText(
  naritaShared,
  'export const NARITA_HERO_IMAGE = "https://upload.wikimedia.org/wikipedia/commons/2/21/HeLa-II.jpg";',
  "the approved red microscopy image must remain the canonical Narita hero",
);
requireText(
  naritaShared,
  "homepageImage: NARITA_HERO_IMAGE",
  "all canonical Narita home pages must override site-specific homepage hero images",
);
requireText(
  naritaShared,
  "topPortrait: NARITA_HERO_IMAGE",
  "legacy canonical Narita hero fields must also resolve to the approved microscopy image",
);
requireText(
  ciribilliMotion,
  "withNaritaHero(props.site)",
  "shared canonical Narita routes must normalize their homepage hero through the canonical hero helper",
);
requireText(
  ciribilliMotion,
  "<NaritaOverlapDesign {...props} site={naritaSite} />",
  "the normalized canonical Narita site must be passed into the shared renderer",
);

requireText(
  researchDesign,
  "const hero = NARITA_HERO_IMAGE;",
  "the canonical Narita Research tab must retain the approved microscopy hero",
);
requireText(
  researchDesign,
  '<Picture src={hero} alt="Research" fallback="LMCG" />',
  "the canonical Narita Research hero image must remain visible",
);
if (researchDesign.includes("project.figureImage")) {
  throw new Error(
    "Ciribilli Narita template lock failed: canonical Narita Research project sections must remain image-free",
  );
}
requireText(
  researchDesign,
  'style={{ gridTemplateColumns: "1fr" }}',
  "all canonical Narita Research projects must render as full-width text-only sections",
);
requireText(
  shell,
  'if (designVariant === "ciribilli-narita-v1")',
  "the canonical Narita variant routing is missing",
);
requireText(
  shell,
  'if (designVariant === "narita-2-v1")',
  "the independent Narita 2 variant routing is missing",
);
requireText(
  shell,
  "return <BigginsNarita2Design site={site}",
  "Narita 2 must use the independent Biggins full-lab renderer",
);
requireText(
  bigginsNarita2,
  "site.heroImage",
  "Narita 2 must accept the site-supplied lab hero image",
);
requireText(
  shell,
  "return <CiribilliResearchDesign site={researchSite}",
  "canonical Narita Research must retain the approved Ciribilli editorial research layout",
);
requireText(
  shell,
  "return <CiribilliNaritaDesign site={site}",
  "canonical Narita Home and the other tabs must retain the shared Narita layout",
);
requireText(
  ciribilliMotion,
  "const distance = reducedMotion ? 0 : window.scrollY;",
  "the canonical Narita homepage hero motion must remain directly tied to scrollY",
);
requireText(
  ciribilliMotion,
  "--ciribilli-home-panel-offset",
  "the canonical Narita homepage hero must retain its constant linear panel offset",
);
requireText(
  ciribilliMotion,
  "--ciribilli-gutter: clamp(24px, 5vw, 76px);",
  "the canonical Narita wordmark, navigation and hero copy must retain a shared responsive gutter",
);
requireText(
  ciribilliMotion,
  "--narita-header-height: 132px;",
  "the canonical Narita desktop header must retain the approved compact height",
);
requireText(
  ciribilliMotion,
  "height: calc(100svh - var(--narita-header-height)) !important;",
  "the canonical Narita homepage hero must fit the remaining viewport beneath the header",
);
requireText(
  ciribilliMotion,
  "font-size: clamp(46px, min(7vw, 10svh), 96px) !important;",
  "the canonical Narita homepage hero typography must remain constrained by both viewport width and height",
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
requireText(heroBlock, "box-shadow: none !important;", "the canonical Research hero must not have a box shadow");

const overlayBlock = blockFor(researchCss, ".hero > div:first-of-type {");
requireText(overlayBlock, "background: rgba(0, 0, 0, 0.2) !important;", "the canonical Research hero overlay must stay uniform and subtle");
requireText(overlayBlock, "box-shadow: none !important;", "the canonical Research hero overlay must not cast a shadow");
if (overlayBlock.includes("linear-gradient")) {
  throw new Error(
    "Ciribilli Narita template lock failed: the canonical Research hero overlay must not contain a bottom-darkening gradient",
  );
}

console.log("Ciribilli Narita template lock verified; Narita 2 remains independently routed.");
