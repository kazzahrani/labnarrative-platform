import BourdonDesign from "@/components/designs/BourdonDesign";
import { getBourdonPages, type LabSite, type SiteRoute } from "@/lib/sites";

export const DOBBELSTEIN_EDITORIAL_VARIANT = "dobbelstein-editorial-v1";

export const DOBBELSTEIN_EDITORIAL_SETTINGS = {
  variant: DOBBELSTEIN_EDITORIAL_VARIANT,
  engine: "v2",
  homeHeroLayout: "text-only",
  programmesLayout: "grid",
  piLayout: "image-left",
  researchIndexLayout: "image-right",
  projectLayout: "split",
  membersColumns: 3,
  pageIntroStyle: "teal",
  sectionSpacing: "balanced",
  cornerStyle: "soft",
  templatePolicy: "bourdon_only_v1",
} as const;

export default function DobbelsteinEditorialDesign({
  site,
  route,
  basePath,
  previewMode = false,
}: {
  site: LabSite;
  route: SiteRoute;
  basePath: string;
  previewMode?: boolean;
}) {
  const currentPages = getBourdonPages(site);
  const pages = {
    ...currentPages,
    home: {
      ...currentPages.home,
      homepageImage: "",
    },
  };

  const editorialSite: LabSite = {
    ...site,
    heroImage: "",
    pages,
    design: {
      key: "bourdon-full",
      version: 3,
      settings: {
        ...(site.design?.settings ?? {}),
        ...DOBBELSTEIN_EDITORIAL_SETTINGS,
      },
    },
  };

  return (
    <BourdonDesign
      site={editorialSite}
      route={route}
      basePath={basePath}
      previewMode={previewMode}
    />
  );
}
