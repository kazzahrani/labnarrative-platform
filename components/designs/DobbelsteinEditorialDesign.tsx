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

  const incomingVariant = site.design?.settings?.variant;
  const useInlineResearch = incomingVariant === DOBBELSTEIN_EDITORIAL_VARIANT;

  const research = useInlineResearch && site.research?.length
    ? site.research.map((project) => {
        const detailBlocks = [
          project.summary,
          ...(project.body ?? []),
          project.methods?.length
            ? `Approaches\n${project.methods.map((item) => `• ${item}`).join("\n")}`
            : "",
          project.papers?.length
            ? `Selected work\n${project.papers.map((item) => `• ${item}`).join("\n")}`
            : "",
        ].filter(Boolean);

        return {
          ...project,
          slug: "",
          summary: detailBlocks.join("\n\n"),
          body: [],
          methods: [],
          papers: [],
        };
      })
    : site.research;

  const editorialSite: LabSite = {
    ...site,
    heroImage: "",
    research,
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

  const editorialRoute = useInlineResearch && route.section === "research" && route.projectSlug
    ? { ...route, projectSlug: undefined }
    : route;

  return (
    <div className={useInlineResearch ? "dobbelstein-editorial-design" : undefined}>
      <BourdonDesign
        site={editorialSite}
        route={editorialRoute}
        basePath={basePath}
        previewMode={previewMode}
      />
      {useInlineResearch && (
        <style>{`
          .dobbelstein-editorial-design .bn-research-page article > div > p {
            white-space: pre-line;
          }

          .dobbelstein-editorial-design .bn-research-page article > div > .bn-text-link {
            display: none !important;
          }
        `}</style>
      )}
    </div>
  );
}
