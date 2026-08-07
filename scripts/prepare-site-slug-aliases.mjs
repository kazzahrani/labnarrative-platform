import fs from "node:fs";

const sitesUrl = new URL("../lib/sites.ts", import.meta.url);
let source = fs.readFileSync(sitesUrl, "utf8");

const authoritativeSlugBefore = "    slug: row.content.slug || row.slug,";
const authoritativeSlugAfter = "    slug: row.slug,";
if (source.includes(authoritativeSlugBefore)) {
  source = source.replace(authoritativeSlugBefore, authoritativeSlugAfter);
}
if (!source.includes(authoritativeSlugAfter)) {
  throw new Error("Could not make the database row slug authoritative in hydrateSite().");
}

const replacement = `export async function getSite(slug: string): Promise<LabSite | undefined> {
  const normalizedSlug = slug.toLowerCase();
  const select = "select=slug,status,content,content_schema_version,design_key,design_version,design_settings";
  const rows = await querySites(
    \`\${select}&slug=eq.\${encodeURIComponent(normalizedSlug)}&limit=1\`,
  );
  if (rows[0]) return hydrateSite(rows[0]);

  const { url, publishableKey } = getSupabaseConfig();
  const aliasResponse = await fetch(
    \`\${url}/rest/v1/site_slug_aliases?select=site_id&alias_slug=eq.\${encodeURIComponent(normalizedSlug)}&limit=1\`,
    {
      headers: { apikey: publishableKey },
      next: { revalidate: 60 },
    },
  );
  if (!aliasResponse.ok) return undefined;
  const aliases = (await aliasResponse.json()) as Array<{ site_id: string }>;
  const siteId = aliases[0]?.site_id;
  if (!siteId) return undefined;

  const canonicalRows = await querySites(
    \`\${select}&id=eq.\${encodeURIComponent(siteId)}&limit=1\`,
  );
  return canonicalRows[0] ? hydrateSite(canonicalRows[0]) : undefined;
}

export async function getAllSites`;

const pattern = /export async function getSite\(slug: string\): Promise<LabSite \| undefined> \{[\s\S]*?\n\}\n\nexport async function getAllSites/;
if (!pattern.test(source)) {
  if (source.includes("site_slug_aliases?select=site_id")) {
    console.log("Site slug alias resolution already prepared.");
  } else {
    throw new Error("Could not locate getSite() for alias support.");
  }
} else {
  source = source.replace(pattern, replacement);
}

fs.writeFileSync(sitesUrl, source);
console.log("Canonical site slug routing and alias resolution prepared.");
