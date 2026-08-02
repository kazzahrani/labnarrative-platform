export type SiteSection = "home" | "research" | "team" | "publications" | "opportunities";
export type SiteTemplate =
  | "scientific-minimal"
  | "editorial"
  | "image-led"
  | "institutional"
  | "bourdon-full";

export type Theme = {
  background: string;
  surface: string;
  foreground: string;
  muted: string;
  accent: string;
};

export type ResearchProject = {
  slug: string;
  title: string;
  summary: string;
  question?: string;
  body?: string[];
  methods?: string[];
  papers?: string[];
  figureImage?: string;
  figureCaption?: string;
};

export type LabMember = {
  name: string;
  role: string;
  bio?: string;
  image?: string;
  href?: string;
};

export type Opportunity = {
  title: string;
  status?: string;
  description: string;
  linkLabel?: string;
  href?: string;
};

export type Publication = {
  title: string;
  journal: string;
  year: string;
  href?: string;
};

export type LabSite = {
  schemaVersion?: number;
  design?: {
    key: string;
    version: number;
    settings?: Record<string, unknown>;
  };
  template?: SiteTemplate;
  heroImage?: string;
  slug: string;
  piName: string;
  labName: string;
  labSubtitle?: string;
  title: string;
  institution: string;
  department?: string;
  address?: string;
  email?: string;
  phone?: string;
  profileUrl?: string;
  pubmedUrl?: string;
  eyebrow: string;
  headline: string;
  introduction: string;
  overview?: string;
  focusAreas: string[];
  projects: { title: string; description: string }[];
  research?: ResearchProject[];
  team: { name: string; role: string }[];
  members?: LabMember[];
  publications: Publication[];
  opportunities?: Opportunity[];
  theme: Theme;
  [key: string]: unknown;
};

export type SiteRoute = {
  section: SiteSection;
  projectSlug?: string;
};

type SiteRow = {
  slug: string;
  status: "concept" | "live";
  content: LabSite;
  content_schema_version?: number;
  design_key?: string;
  design_version?: number;
  design_settings?: Record<string, unknown>;
};

const allowedSections = new Set<SiteSection>([
  "home",
  "research",
  "team",
  "publications",
  "opportunities",
]);

export function resolveSiteRoute(path?: string[]): SiteRoute {
  const requestedSection = path?.[0] ?? "home";
  const section = allowedSections.has(requestedSection as SiteSection)
    ? requestedSection as SiteSection
    : "home";

  return {
    section,
    projectSlug: section === "research" ? path?.[1] : undefined,
  };
}

export function resolveDesignKey(site: LabSite): string {
  return site.design?.key || site.template || "scientific-minimal";
}

function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
    );
  }

  return { url, publishableKey };
}

async function querySites(query: string): Promise<SiteRow[]> {
  const { url, publishableKey } = getSupabaseConfig();
  const response = await fetch(`${url}/rest/v1/sites?${query}`, {
    headers: {
      apikey: publishableKey,
    },
    next: { revalidate: 60 },
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Supabase request failed (${response.status}): ${details}`);
  }

  return (await response.json()) as SiteRow[];
}

function hydrateSite(row: SiteRow): LabSite {
  return {
    ...row.content,
    slug: row.content.slug || row.slug,
    schemaVersion: row.content.schemaVersion ?? row.content_schema_version ?? 1,
    design: row.content.design ?? {
      key: row.design_key || row.content.template || "scientific-minimal",
      version: row.design_version ?? 1,
      settings: row.design_settings ?? {},
    },
  };
}

export async function getSite(slug: string): Promise<LabSite | undefined> {
  const normalizedSlug = slug.toLowerCase();
  const rows = await querySites(
    `select=slug,status,content,content_schema_version,design_key,design_version,design_settings&slug=eq.${encodeURIComponent(normalizedSlug)}&limit=1`,
  );

  return rows[0] ? hydrateSite(rows[0]) : undefined;
}

export async function getAllSites(): Promise<LabSite[]> {
  const rows = await querySites(
    "select=slug,status,content,content_schema_version,design_key,design_version,design_settings&order=slug.asc",
  );
  return rows.map(hydrateSite);
}
