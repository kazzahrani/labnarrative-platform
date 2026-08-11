import HDPortraitProjectDesign from "@/components/designs/HDPortraitProjectDesign";
import HDPortrait2Design from "@/components/designs/HDPortrait2Design";
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
  if (props.site.design?.settings?.templatePolicy === "HDportrait_2") {
    return <HDPortrait2Design {...props} />;
  }

  if (props.route.section === "research" && props.route.projectSlug) {
    return <HDPortraitProjectDesign {...props} />;
  }

  return <LensPortraitDesign {...props} />;
}
