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
  if (props.route.section === "research" && props.route.projectSlug) {
    return <HDPortraitProjectDesign {...props} />;
  }

  return <LensPortraitDesign {...props} />;
}
