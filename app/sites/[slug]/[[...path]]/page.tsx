import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import ConceptAnalytics from "@/components/ConceptAnalytics";
import SiteShell from "@/components/SiteShell";
import VisualOverridesHost from "@/components/VisualOverridesHost";
import { getSite, resolveSiteRoute } from "@/lib/sites";

export const revalidate = 60;

type SiteStatus = "concept" | "live";

async function getSiteStatus(slug: string): Promise<SiteStatus> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) return "concept";

  const response = await fetch(
    `${url}/rest/v1/sites?select=status&slug=eq.${encodeURIComponent(slug.toLowerCase())}&limit=1`,
    {
      headers: { apikey: publishableKey },
      next: { revalidate: 60 },
    },
  );
  if (!response.ok) return "concept";
  const rows = await response.json() as { status?: SiteStatus }[];
  return rows[0]?.status === "live" ? "live" : "concept";
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; path?: string[] }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const status = await getSiteStatus(slug);
  return {
    robots: status === "live"
      ? { index: true, follow: true }
      : { index: false, follow: false, nocache: true },
  };
}

export default async function LabSitePage({
  params,
}: {
  params: Promise<{ slug: string; path?: string[] }>;
}) {
  const { slug, path } = await params;
  const [site, requestHeaders, status] = await Promise.all([
    getSite(slug),
    headers(),
    getSiteStatus(slug),
  ]);

  if (!site) {
    notFound();
  }

  const route = resolveSiteRoute(path);
  const publicSubdomain = requestHeaders.get("x-labnarrative-public-subdomain");
  const publicBasePath = publicSubdomain === site.slug ? "" : undefined;

  return (
    <>
      <ConceptAnalytics slug={site.slug} />
      <VisualOverridesHost site={site} route={route}>
        <SiteShell
          site={site}
          route={route}
          basePath={publicBasePath}
          isLive={status === "live"}
        />
      </VisualOverridesHost>
    </>
  );
}
