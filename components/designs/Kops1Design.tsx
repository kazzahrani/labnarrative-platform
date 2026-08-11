import Lens1Design from "@/components/designs/Lens1Design";
import type { LabSite, SiteRoute } from "@/lib/sites";

export const KOPS_1_VARIANT = "Kops_1";

type Props = {
  site: LabSite;
  route: SiteRoute;
  basePath: string;
  previewMode?: boolean;
};

/**
 * Kops_1
 * Reusable Lens_1-derived portrait design with all non-home page heroes removed.
 */
export default function Kops1Design(props: Props) {
  return (
    <div className="kops-1-design">
      <Lens1Design {...props} />
      <style>{`
        .kops-1-design
          .lens-flat-hero-shell
          .narita-overlap-design:not(.narita-route-home)
          main
          > section:first-of-type,
        .kops-1-design
          .lens-flat-hero-shell
          .narita-overlap-design:not(.narita-route-home)
          main
          > article
          > section:first-of-type {
          display: none !important;
        }
      `}</style>
    </div>
  );
}
