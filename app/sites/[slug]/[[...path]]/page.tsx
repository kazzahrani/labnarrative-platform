import { notFound } from "next/navigation";
import ConceptAnalytics from "@/components/ConceptAnalytics";
import SiteShell from "@/components/SiteShell";
import VisualOverridesHost from "@/components/VisualOverridesHost";
import { getSite, resolveSiteRoute } from "@/lib/sites";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

export default async function LabSitePage({
  params,
}: {
  params: Promise<{ slug: string; path?: string[] }>;
}) {
  const { slug, path } = await params;
  const site = await getSite(slug);

  if (!site) {
    notFound();
  }

  const route = resolveSiteRoute(path);

  return (
    <>
      <ConceptAnalytics slug={site.slug} />
      <VisualOverridesHost site={site} route={route}>
        <SiteShell site={site} route={route} />
      </VisualOverridesHost>
    </>
  );
}
