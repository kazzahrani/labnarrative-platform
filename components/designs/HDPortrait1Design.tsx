import HDPortraitProjectDesign from "@/components/designs/HDPortraitProjectDesign";
import LensPortraitDesign from "@/components/designs/LensPortraitDesign";
import type { LabSite, SiteRoute } from "@/lib/sites";

export const HDPORTRAIT_1_VARIANT = "HDportrait_1";

type Props = {
  site: LabSite;
  route: SiteRoute;
  basePath: string;
  previewMode?: boolean;
};

export default function HDPortrait1Design(props: Props) {
  if (props.route.section === "research" && props.route.projectSlug) {
    return <HDPortraitProjectDesign {...props} />;
  }

  return <LensPortraitDesign {...props} />;
}
