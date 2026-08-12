import { createClient } from "@supabase/supabase-js";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import SiteShell from "@/components/SiteShell";
import { resolveSiteRoute, type LabSite } from "@/lib/sites";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

const FALLBACK_THEME: LabSite["theme"] = {
  background: "#f4f3ee",
  surface: "#ffffff",
  foreground: "#16231f",
  muted: "#66736e",
  accent: "#315f50",
};

type RenderPayload = {
  error?: string;
  runId: string;
  executionId: string;
  siteId: string;
  slug: string;
  siteStatus: "draft" | "concept" | "live" | "archived";
  content: LabSite;
  contentSchemaVersion?: number;
  designKey?: string;
  designVersion?: number;
  designSettings?: Record<string, unknown>;
  portraitStatus?: "verified" | "unavailable" | "rejected" | null;
  portraitAssetUrl?: string | null;
  portraitSourceUrl?: string | null;
  portraitMetadata?: Record<string, unknown> | null;
  tokenExpiresAt: string;
};

type LegacyContentDesign = NonNullable<LabSite["design"]> & {
  variant?: string;
  designKey?: string;
  designVersion?: number;
  templatePolicy?: string;
};

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function normalizeAsset(value?: string | null) {
  if (!value) return "";
  try {
    return new URL(value).toString();
  } catch {
    return value;
  }
}

export default async function EngineV4MachineRenderPage({
  params,
  searchParams,
}: {
  params: Promise<{ runId: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { runId } = await params;
  const { token = "" } = await searchParams;

  if (!isUuid(runId) || !isUuid(token)) notFound();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !publishableKey) notFound();

  const supabase = createClient(supabaseUrl, publishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const { data, error } = await supabase.rpc("engine_v4_render_payload", {
    p_run_id: runId,
    p_token: token,
  });

  const payload = data as RenderPayload | null;
  if (error || !payload || payload.error || payload.siteStatus !== "draft") notFound();

  const contentDesign = payload.content.design as LegacyContentDesign | undefined;
  const normalizedDesign: NonNullable<LabSite["design"]> = {
    key:
      payload.designKey ||
      contentDesign?.key ||
      contentDesign?.designKey ||
      payload.content.template ||
      "scientific-minimal",
    version:
      payload.designVersion ??
      contentDesign?.version ??
      contentDesign?.designVersion ??
      1,
    settings: {
      ...(contentDesign?.variant ? { variant: contentDesign.variant } : {}),
      ...(contentDesign?.templatePolicy ? { templatePolicy: contentDesign.templatePolicy } : {}),
      ...(contentDesign?.settings ?? {}),
      ...(payload.designSettings ?? {}),
    },
  };

  const site: LabSite = {
    ...payload.content,
    slug: payload.content.slug || payload.slug,
    schemaVersion: payload.content.schemaVersion ?? payload.contentSchemaVersion ?? 1,
    theme: payload.content.theme ?? FALLBACK_THEME,
    design: normalizedDesign,
  };

  const expectedPortrait = normalizeAsset(payload.portraitAssetUrl);
  const homePortrait = normalizeAsset(site.pages?.home?.piImage);
  const memberPortrait = normalizeAsset(site.members?.[0]?.image);
  const portraitBound = Boolean(expectedPortrait) && (
    homePortrait === expectedPortrait || memberPortrait === expectedPortrait
  );
  const portraitWarningAccepted =
    payload.portraitStatus === "unavailable" &&
    payload.portraitMetadata?.portrait_warning_accepted === true;
  const kopsVariant = site.design?.settings?.variant === "Kops_1";

  if (!kopsVariant) notFound();
  if (payload.portraitStatus === "verified" && !portraitBound) notFound();
  if (payload.portraitStatus !== "verified" && !portraitWarningAccepted) notFound();

  return (
    <>
      <div
        id="engine-v4-render-proof"
        hidden
        data-engine-v4-render="passed"
        data-run-id={payload.runId}
        data-execution-id={payload.executionId}
        data-site-id={payload.siteId}
        data-site-status={payload.siteStatus}
        data-site-slug={site.slug}
        data-design-variant={String(site.design?.settings?.variant ?? "")}
        data-portrait-url={expectedPortrait}
        data-portrait-bound={portraitBound ? "true" : "false"}
        data-portrait-warning={portraitWarningAccepted ? "true" : "false"}
        data-token-expires-at={payload.tokenExpiresAt}
      />
      <SiteShell
        site={site}
        route={resolveSiteRoute(undefined)}
        basePath={`/engine-v4/render/${runId}`}
        previewMode
      />
    </>
  );
}
