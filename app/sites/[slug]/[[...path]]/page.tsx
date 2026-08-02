import { notFound } from "next/navigation";
import SiteShell from "@/components/SiteShell";
import { getSite, type SiteSection } from "@/lib/sites";

const allowedSections = new Set<SiteSection>([
  "home",
  "research",
  "team",
  "publications",
]);

export default async function LabSitePage({
  params,
}: {
  params: Promise<{ slug: string; path?: string[] }>;
}) {
  const { slug, path } = await params;
  const site = getSite(slug);

  if (!site) {
    notFound();
  }

  const requestedSection = path?.[0] ?? "home";

  const section = allowedSections.has(requestedSection as SiteSection)
    ? (requestedSection as SiteSection)
    : "home";

  return <SiteShell site={site} section={section} />;
}
