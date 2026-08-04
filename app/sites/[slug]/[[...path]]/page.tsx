import { notFound } from "next/navigation";
import SiteShell from "@/components/SiteShell";
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

  return <SiteShell site={site} route={resolveSiteRoute(path)} />;
}
