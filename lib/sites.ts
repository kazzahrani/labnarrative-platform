export type SiteSection = "home" | "research" | "team" | "publications";

export type LabSite = {
  slug: string;
  piName: string;
  labName: string;
  title: string;
  institution: string;
  eyebrow: string;
  headline: string;
  introduction: string;
  focusAreas: string[];
  projects: { title: string; description: string }[];
  team: { name: string; role: string }[];
  publications: { title: string; journal: string; year: string }[];
  theme: {
    background: string;
    surface: string;
    foreground: string;
    muted: string;
    accent: string;
  };
};

type SiteRow = {
  slug: string;
  status: "concept" | "live";
  content: LabSite;
};

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

export async function getSite(slug: string): Promise<LabSite | undefined> {
  const normalizedSlug = slug.toLowerCase();
  const rows = await querySites(
    `select=slug,status,content&slug=eq.${encodeURIComponent(normalizedSlug)}&limit=1`,
  );

  return rows[0]?.content;
}

export async function getAllSites(): Promise<LabSite[]> {
  const rows = await querySites("select=slug,status,content&order=slug.asc");
  return rows.map((row) => row.content);
}
