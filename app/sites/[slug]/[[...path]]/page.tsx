import { headers } from "next/headers";
import { notFound } from "next/navigation";
import ConceptAnalytics from "@/components/ConceptAnalytics";
import SiteShell from "@/components/SiteShell";
import VisualOverridesHost from "@/components/VisualOverridesHost";
import { getSite, resolveSiteRoute } from "@/lib/sites";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

async function getSiteStatus(slug: string): Promise<"concept" | "live"> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) return "concept";

  const response = await fetch(
    `${url}/rest/v1/sites?select=status&slug=eq.${encodeURIComponent(slug.toLowerCase())}&limit=1`,
    { headers: { apikey: publishableKey }, cache: "no-store" },
  );
  if (!response.ok) return "concept";
  const rows = await response.json() as { status?: "concept" | "live" }[];
  return rows[0]?.status === "live" ? "live" : "concept";
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
