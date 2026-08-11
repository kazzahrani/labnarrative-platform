import HDPortrait2Design from "@/components/designs/HDPortrait2Design";
import type { LabSite, SiteRoute } from "@/lib/sites";

export const WALCZAK_1_VARIANT = "WALCZAK_1";

type Props = {
  site: LabSite;
  route: SiteRoute;
  basePath: string;
  previewMode?: boolean;
};

/**
 * WALCZAK_1
 * Independent reusable portrait-led design based on the approved Claire Walczak concept.
 */
export default function Walczak1Design(props: Props) {
  return <HDPortrait2Design {...props} />;
}
