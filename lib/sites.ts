export type SiteSection =
  | "home"
  | "research"
  | "members"
  | "publications"
  | "join"
  | "contact";

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

export type BourdonNavigation = {
  home: string;
  research: string;
  publications: string;
  members: string;
  join: string;
  contact: string;
};

export type BourdonHomePage = {
  topPortrait: string;
  topicLine: string;
  mainHeading: string;
  openingText: string;
  researchButton: string;
  publicationsButton: string;
  researchOverview: string;
  overviewLabel: string;
  overviewHeading: string;
  overviewLink: string;
  homepageImage: string;
  programmesLabel: string;
  programmesHeading: string;
  programmeLinkLabel: string;
  piSectionLabel: string;
  piName: string;
  piRole: string;
  piBiography: string;
  piLinkLabel: string;
  piImage: string;
  joinLabel: string;
  joinHeading: string;
  joinButton: string;
  footerLabName: string;
  footerDepartment: string;
  footerInstitution: string;
  footerContactHeading: string;
  footerExploreHeading: string;
  footerResearchLink: string;
  footerPublicationsLink: string;
  footerJoinLink: string;
  footerNote: string;
};

export type BourdonResearchPage = {
  pageLabel: string;
  pageHeading: string;
  introduction: string;
  questionLabel: string;
  programmeLinkLabel: string;
  backLink: string;
  programmeLabel: string;
  nextProgrammeLabel: string;
  returnLink: string;
};

export type BourdonPublicationsPage = {
  pageLabel: string;
  pageHeading: string;
  introduction: string;
  searchLabel: string;
  searchPlaceholder: string;
  pubmedButton: string;
  noResults: string;
};

export type BourdonMembersPage = {
  pageLabel: string;
  pageHeading: string;
  introduction: string;
  profileLinkLabel: string;
  noticeHeading: string;
  noticeText: string;
};

export type BourdonJoinPage = {
  pageLabel: string;
  pageHeading: string;
  introduction: string;
  guidanceLabel: string;
  guidanceHeading: string;
  guidanceText: string;
  contactButton: string;
};

export type BourdonContactPage = {
  pageLabel: string;
  pageHeading: string;
  introduction: string;
  piName: string;
  piRole: string;
  piBiography: string;
  piImage: string;
  institution: string;
  department: string;
  address: string;
  email: string;
  phone: string;
  officialProfile: string;
  pubmedRecord: string;
  laboratoryLabel: string;
  emailLabel: string;
  telephoneLabel: string;
  profileLabel: string;
  profileLinkText: string;
  emailButton: string;
  locationName: string;
  latitude: string;
  longitude: string;
  locationSuffix: string;
};

export type BourdonPages = {
  navigation: BourdonNavigation;
  home: BourdonHomePage;
  research: BourdonResearchPage;
  publications: BourdonPublicationsPage;
  members: BourdonMembersPage;
  join: BourdonJoinPage;
  contact: BourdonContactPage;
};

export type LabSite = {
  schemaVersion?: number;
  design?: {
    key: string;
    version: number;
    settings?: Record<string, unknown>;
  };
  template?: SiteTemplate;
  pages?: Partial<BourdonPages>;
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

export function createDefaultBourdonPages(site: Partial<LabSite> = {}): BourdonPages {
  const piName = site.piName || "Principal Investigator";
  const labName = site.labName || "Laboratory name";
  const title = site.title || "Principal Investigator";
  const institution = site.institution || "Institution";
  const department = site.department || "Department";
  const introduction = site.introduction || "Describe the laboratory and its scientific direction.";
  const overview = site.overview || introduction;
  const focus = site.focusAreas?.filter(Boolean).slice(0, 2).join(" and ") || "the laboratory's research";

  return {
    navigation: {
      home: "Home",
      research: "Research",
      publications: "Publications",
      members: "Lab members",
      join: "Join our lab",
      contact: "Contact us",
    },
    home: {
      topPortrait: site.heroImage || "",
      topicLine: site.eyebrow || "Research area · Biological question · Disease context",
      mainHeading: site.headline || "Understanding biology with precision",
      openingText: introduction,
      researchButton: "Explore our research",
      publicationsButton: "View publications",
      researchOverview: overview,
      overviewLabel: "Our research",
      overviewHeading: "One question. A connected research programme.",
      overviewLink: "Read about our research programmes",
      homepageImage: site.heroImage || "",
      programmesLabel: "Research programmes",
      programmesHeading: "What we study",
      programmeLinkLabel: "Learn more",
      piSectionLabel: "Principal investigator",
      piName,
      piRole: title,
      piBiography: overview,
      piLinkLabel: "Meet the lab",
      piImage: site.members?.[0]?.image || site.heroImage || "",
      joinLabel: "Join the lab",
      joinHeading: `Interested in ${focus}?`,
      joinButton: "View opportunities",
      footerLabName: labName,
      footerDepartment: department,
      footerInstitution: institution,
      footerContactHeading: "Contact",
      footerExploreHeading: "Explore",
      footerResearchLink: "Research",
      footerPublicationsLink: "Publications",
      footerJoinLink: "Join our lab",
      footerNote: "Independent concept by LabNarrative · Not an official laboratory website",
    },
    research: {
      pageLabel: "Research",
      pageHeading: "How we investigate the laboratory's central questions",
      introduction: overview,
      questionLabel: "Central question",
      programmeLinkLabel: "Explore this programme",
      backLink: "All research",
      programmeLabel: "Research programme",
      nextProgrammeLabel: "Next programme",
      returnLink: "Return to all research",
    },
    publications: {
      pageLabel: "Publications",
      pageHeading: "Selected landmark and recent work",
      introduction: "Explore publications spanning the laboratory's discoveries, mechanisms, and translational work.",
      searchLabel: "Search publications",
      searchPlaceholder: "Title, journal or year",
      pubmedButton: "Complete PubMed record",
      noResults: "No publications match this search.",
    },
    members: {
      pageLabel: "Lab members",
      pageHeading: "People behind the research",
      introduction: `A collaborative ${site.eyebrow || "research"} laboratory connecting fundamental biology with discovery and translation.`,
      profileLinkLabel: "View profile",
      noticeHeading: "Additional profiles",
      noticeText: "Additional member profiles can be added after confirmation by the laboratory.",
    },
    join: {
      pageLabel: "Join our lab",
      pageHeading: "Build the next chapter of our research",
      introduction: "We welcome enquiries from prospective students, postdoctoral researchers, and collaborators whose interests align with the laboratory.",
      guidanceLabel: "Before contacting us",
      guidanceHeading: "Make the scientific fit clear.",
      guidanceText: "Include a concise description of your background, the question you hope to address, why it connects with the laboratory's work, and any relevant funding route or timescale.",
      contactButton: "Contact the lab",
    },
    contact: {
      pageLabel: "Contact us",
      pageHeading: `Connect with the ${labName}`,
      introduction: "For research, collaboration, and training enquiries, please contact the laboratory using the details below.",
      piName,
      piRole: title,
      piBiography: overview,
      piImage: site.members?.[0]?.image || site.heroImage || "",
      institution,
      department,
      address: site.address || "",
      email: site.email || "",
      phone: site.phone || "",
      officialProfile: site.profileUrl || "",
      pubmedRecord: site.pubmedUrl || "",
      laboratoryLabel: "Laboratory",
      emailLabel: "Email",
      telephoneLabel: "Telephone",
      profileLabel: "Official profile",
      profileLinkText: `${institution} profile`,
      emailButton: "Send an email",
      locationName: institution,
      latitude: "",
      longitude: "",
      locationSuffix: "",
    },
  };
}

export function getBourdonPages(site: LabSite): BourdonPages {
  const defaults = createDefaultBourdonPages(site);
  const pages = site.pages ?? {};
  return {
    navigation: { ...defaults.navigation, ...(pages.navigation ?? {}) },
    home: { ...defaults.home, ...(pages.home ?? {}) },
    research: { ...defaults.research, ...(pages.research ?? {}) },
    publications: { ...defaults.publications, ...(pages.publications ?? {}) },
    members: { ...defaults.members, ...(pages.members ?? {}) },
    join: { ...defaults.join, ...(pages.join ?? {}) },
    contact: { ...defaults.contact, ...(pages.contact ?? {}) },
  };
}

const sectionAliases: Record<string, SiteSection> = {
  home: "home",
  research: "research",
  publications: "publications",
  members: "members",
  team: "members",
  join: "join",
  opportunities: "join",
  contact: "contact",
};

export function resolveSiteRoute(path?: string[]): SiteRoute {
  const requested = path?.[0] ?? "home";
  const section = sectionAliases[requested] ?? "home";
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
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.");
  }
  return { url, publishableKey };
}

async function querySites(query: string): Promise<SiteRow[]> {
  const { url, publishableKey } = getSupabaseConfig();
  const response = await fetch(`${url}/rest/v1/sites?${query}`, {
    headers: { apikey: publishableKey },
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
  const rows = await querySites(
    `select=slug,status,content,content_schema_version,design_key,design_version,design_settings&slug=eq.${encodeURIComponent(slug.toLowerCase())}&limit=1`,
  );
  return rows[0] ? hydrateSite(rows[0]) : undefined;
}

export async function getAllSites(): Promise<LabSite[]> {
  const rows = await querySites(
    "select=slug,status,content,content_schema_version,design_key,design_version,design_settings&order=slug.asc",
  );
  return rows.map(hydrateSite);
}
