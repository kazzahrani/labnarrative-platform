import HDPortraitProjectDesign from "@/components/designs/HDPortraitProjectDesign";
import LensPortraitDesign from "@/components/designs/LensPortraitDesign";
import type { LabSite, SiteRoute } from "@/lib/sites";

export const LENS_1_VARIANT = "Lens_1";

type Props = {
  site: LabSite;
  route: SiteRoute;
  basePath: string;
  previewMode?: boolean;
};

/**
 * Lens_1
 * Independent reusable portrait-led design based on the approved Susanne Lens concept.
 */
export default function Lens1Design(props: Props) {
  const currentDesign = props.site.design;
  const site: LabSite = currentDesign
    ? {
        ...props.site,
        design: {
          key: currentDesign.key,
          version: currentDesign.version,
          settings: {
            ...currentDesign.settings,
            variant: "HDportrait_1",
            templatePolicy: "HDportrait_1",
          },
        },
      }
    : props.site;

  if (props.route.section === "research" && props.route.projectSlug) {
    return <HDPortraitProjectDesign {...props} site={site} />;
  }

  return <LensPortraitDesign {...props} site={site} />;
}
