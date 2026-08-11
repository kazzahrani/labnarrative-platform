import HDPortrait2Design from "@/components/designs/HDPortrait2Design";
import type { LabSite, SiteRoute } from "@/lib/sites";

export const WALCZAK_1_VARIANT = "WALCZAK_1";

type Props = {
  site: LabSite;
  route: SiteRoute;
  basePath: string;
  previewMode?: boolean;
};

function portraitAccent(site: LabSite) {
  const value = site.design?.settings?.portraitAccent;
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : "";
}

/**
 * WALCZAK_1
 * Independent reusable portrait-led design based on the approved Claire Walczak concept.
 * Its accent is automatically derived from the PI portrait when the design is applied.
 */
export default function Walczak1Design(props: Props) {
  const accent = portraitAccent(props.site);
  const site: LabSite = props.site.design
    ? {
        ...props.site,
        theme: accent ? { ...props.site.theme, accent } : props.site.theme,
        design: {
          ...props.site.design,
          settings: {
            ...props.site.design.settings,
            variant: "HDportrait_1",
            templatePolicy: "HDportrait_2",
          },
        },
      }
    : props.site;

  return <HDPortrait2Design {...props} site={site} />;
}
