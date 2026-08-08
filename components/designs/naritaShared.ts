import type { LabSite } from "@/lib/sites";

export const NARITA_HERO_IMAGE = "https://upload.wikimedia.org/wikipedia/commons/2/21/HeLa-II.jpg";

export function withNaritaHero(site: LabSite): LabSite {
  const pages = site.pages
    ? {
        ...site.pages,
        ...(site.pages.home
          ? {
              home: {
                ...site.pages.home,
                topPortrait: NARITA_HERO_IMAGE,
                homepageImage: NARITA_HERO_IMAGE,
              },
            }
          : {}),
      }
    : site.pages;

  return {
    ...site,
    heroImage: NARITA_HERO_IMAGE,
    pages,
  };
}
