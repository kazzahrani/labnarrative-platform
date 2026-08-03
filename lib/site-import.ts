import {
  createDefaultBourdonPages,
  defaultBourdonDesignSettings,
  getBourdonDesignSettings,
  getBourdonPages,
  type BourdonPages,
  type LabMember,
  type LabSite,
  type Opportunity,
  type Publication,
  type ResearchProject,
  type SiteTemplate,
  type Theme,
} from "@/lib/sites";

export type ImportIssue = {
  severity: "error" | "warning";
  path: string;
  message: string;
};

export type ImportSummary = {
  slug: string;
  piName: string;
  labName: string;
  template: SiteTemplate;
  researchCount: number;
  publicationCount: number;
  memberCount: number;
  opportunityCount: number;
  imageCount: number;
};

export type SiteImportAnalysis = {
  valid: boolean;
  issues: ImportIssue[];
  content: LabSite | null;
  summary: ImportSummary | null;
};

type AnyRecord = Record<string, unknown>;

const supportedTemplates: SiteTemplate[] = [
  "scientific-minimal",
  "editorial",
  "image-led",
  "institutional",
  "bourdon-full",
];

const themes: Record<SiteTemplate, Theme> = {
  "scientific-minimal": {
    background: "#eef1eb",
    surface: "#f8faf6",
    foreground: "#153229",
    muted: "#64726c",
    accent: "#1b5a45",
  },
  editorial: {
    background: "#f3eee5",
    surface: "#fffaf2",
    foreground: "#261f1a",
    muted: "#6d6259",
    accent: "#9a5839",
  },
  "image-led": {
    background: "#101716",
    surface: "#192321",
    foreground: "#f4f0e8",
    muted: "#acb8b3",
    accent: "#d7a85a",
  },
  institutional: {
    background: "#edf1f4",
    surface: "#ffffff",
    foreground: "#142534",
    muted: "#62717d",
    accent: "#1d4f73",
  },
  "bourdon-full": {
    background: "#f8f8f5",
    surface: "#ffffff",
    foreground: "#132d3a",
    muted: "#647178",
    accent: "#117b79",
  },
};

function isRecord(value: unknown): value is AnyRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string") return value.trim();
    if (typeof value === "number") return String(value);
  }
  return "";
}

function stringArray(value: unknown, maximum: number): string[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, maximum).map((item) => stringValue(item)).filter(Boolean);
}

function cleanSlug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function issue(issues: ImportIssue[], severity: ImportIssue["severity"], path: string, message: string) {
  issues.push({ severity, path, message });
}

function safeLink(value: unknown, path: string, issues: ImportIssue[]): string {
  const text = stringValue(value);
  if (!text) return "";
  if (text.startsWith("/") || text.startsWith("#")) return text;
  try {
    const parsed = new URL(text);
    if (["http:", "https:", "mailto:"].includes(parsed.protocol)) return text;
  } catch {
    // Report below.
  }
  issue(issues, "warning", path, "Unsupported link was removed. Use https://, http://, mailto:, /path, or #anchor.");
  return "";
}

function safeImage(value: unknown, path: string, issues: ImportIssue[]): string {
  const text = stringValue(value);
  if (!text) return "";
  try {
    const parsed = new URL(text);
    if (["http:", "https:"].includes(parsed.protocol)) return text;
  } catch {
    // Report below.
  }
  issue(issues, "warning", path, "Image URL was removed. Imported images must use a complete http:// or https:// URL; local images can be uploaded after import.");
  return "";
}

function colorValue(value: unknown, fallback: string, path: string, issues: ImportIssue[]): string {
  const text = stringValue(value);
  if (!text) return fallback;
  if (/^#[0-9a-f]{6}$/i.test(text)) return text.toLowerCase();
  issue(issues, "warning", path, `Invalid color was replaced with ${fallback}. Use a six-digit hex value.`);
  return fallback;
}

function normalizeTemplate(value: unknown, issues: ImportIssue[]): SiteTemplate {
  const text = stringValue(value);
  if (!text) {
    issue(issues, "warning", "site.template", "No template was supplied. Bourdon Full was selected.");
    return "bourdon-full";
  }
  if (supportedTemplates.includes(text as SiteTemplate)) return text as SiteTemplate;
  issue(issues, "error", "site.template", `Unsupported template “${text}”.`);
  return "bourdon-full";
}

function normalizeResearch(value: unknown, issues: ImportIssue[]): ResearchProject[] {
  if (!Array.isArray(value)) return [];
  const projects: ResearchProject[] = [];
  const usedSlugs = new Set<string>();

  value.slice(0, 100).forEach((raw, index) => {
    if (!isRecord(raw)) {
      issue(issues, "warning", `site.research[${index}]`, "Non-object research item was ignored.");
      return;
    }
    const title = stringValue(raw.title);
    if (!title) issue(issues, "warning", `site.research[${index}].title`, "Research programme has no title.");
    let slug = cleanSlug(stringValue(raw.slug, title, `research-project-${index + 1}`));
    if (!slug) slug = `research-project-${index + 1}`;
    if (usedSlugs.has(slug)) {
      issue(issues, "error", `site.research[${index}].slug`, `Duplicate research slug “${slug}”.`);
    }
    usedSlugs.add(slug);

    projects.push({
      slug,
      title,
      summary: stringValue(raw.summary, raw.description),
      question: stringValue(raw.question),
      body: stringArray(raw.body, 20),
      methods: stringArray(raw.methods, 30),
      papers: stringArray(raw.papers, 30),
      figureImage: safeImage(raw.figureImage ?? raw.image, `site.research[${index}].figureImage`, issues),
      figureCaption: stringValue(raw.figureCaption, raw.caption),
    });
  });

  if (Array.isArray(value) && value.length > 100) {
    issue(issues, "warning", "site.research", "Only the first 100 research programmes were imported.");
  }
  return projects;
}

function normalizeMembers(value: unknown, issues: ImportIssue[]): LabMember[] {
  if (!Array.isArray(value)) return [];
  const members = value.slice(0, 200).flatMap((raw, index) => {
    if (!isRecord(raw)) {
      issue(issues, "warning", `site.members[${index}]`, "Non-object member was ignored.");
      return [];
    }
    const name = stringValue(raw.name);
    const role = stringValue(raw.role, index === 0 ? "Principal Investigator" : "Researcher");
    if (!name) issue(issues, "warning", `site.members[${index}].name`, "Member has no name.");
    return [{
      name,
      role,
      bio: stringValue(raw.bio, raw.biography),
      image: safeImage(raw.image, `site.members[${index}].image`, issues),
      href: safeLink(raw.href ?? raw.profileUrl, `site.members[${index}].href`, issues),
    }];
  });
  if (value.length > 200) issue(issues, "warning", "site.members", "Only the first 200 members were imported.");
  return members;
}

function normalizePublications(value: unknown, issues: ImportIssue[]): Publication[] {
  if (!Array.isArray(value)) return [];
  const publications = value.slice(0, 1000).flatMap((raw, index) => {
    if (!isRecord(raw)) {
      issue(issues, "warning", `site.publications[${index}]`, "Non-object publication was ignored.");
      return [];
    }
    const title = stringValue(raw.title);
    if (!title) issue(issues, "warning", `site.publications[${index}].title`, "Publication has no title.");
    return [{
      title,
      journal: stringValue(raw.journal, raw.venue),
      year: stringValue(raw.year),
      href: safeLink(raw.href ?? raw.url ?? raw.doi, `site.publications[${index}].href`, issues) || undefined,
    }];
  });
  if (value.length > 1000) issue(issues, "warning", "site.publications", "Only the first 1,000 publications were imported.");
  return publications;
}

function normalizeOpportunities(value: unknown, issues: ImportIssue[]): Opportunity[] {
  if (!Array.isArray(value)) return [];
  const opportunities = value.slice(0, 100).flatMap((raw, index) => {
    if (!isRecord(raw)) {
      issue(issues, "warning", `site.opportunities[${index}]`, "Non-object opportunity was ignored.");
      return [];
    }
    return [{
      title: stringValue(raw.title),
      status: stringValue(raw.status),
      description: stringValue(raw.description),
      linkLabel: stringValue(raw.linkLabel, raw.buttonLabel),
      href: safeLink(raw.href ?? raw.url, `site.opportunities[${index}].href`, issues),
    }];
  });
  if (value.length > 100) issue(issues, "warning", "site.opportunities", "Only the first 100 opportunities were imported.");
  return opportunities;
}

function mergePages(defaults: BourdonPages, value: unknown, issues: ImportIssue[]): BourdonPages {
  if (!isRecord(value)) return defaults;
  const section = <T extends AnyRecord>(key: keyof BourdonPages, fallback: T): T => {
    const candidate = value[key];
    if (candidate === undefined) return fallback;
    if (!isRecord(candidate)) {
      issue(issues, "warning", `site.pages.${String(key)}`, "Page section was not an object and was ignored.");
      return fallback;
    }
    const merged: AnyRecord = { ...fallback };
    for (const [field, fieldValue] of Object.entries(candidate)) {
      if (!(field in fallback)) {
        issue(issues, "warning", `site.pages.${String(key)}.${field}`, "Unknown page field was ignored.");
        continue;
      }
      const isImage = ["topPortrait", "homepageImage", "piImage"].includes(field);
      const isLink = ["officialProfile", "pubmedRecord"].includes(field);
      merged[field] = isImage
        ? safeImage(fieldValue, `site.pages.${String(key)}.${field}`, issues)
        : isLink
          ? safeLink(fieldValue, `site.pages.${String(key)}.${field}`, issues)
          : stringValue(fieldValue);
    }
    return merged as T;
  };

  return {
    navigation: section("navigation", defaults.navigation),
    home: section("home", defaults.home),
    research: section("research", defaults.research),
    publications: section("publications", defaults.publications),
    members: section("members", defaults.members),
    join: section("join", defaults.join),
    contact: section("contact", defaults.contact),
  };
}

function countImages(site: LabSite): number {
  const candidates = [
    site.heroImage,
    site.pages?.home?.topPortrait,
    site.pages?.home?.homepageImage,
    site.pages?.home?.piImage,
    site.pages?.contact?.piImage,
    ...(site.research ?? []).map((project) => project.figureImage),
    ...(site.members ?? []).map((member) => member.image),
  ];
  return new Set(candidates.filter(Boolean)).size;
}

export function analyseSiteImport(input: unknown, existingSlugs: string[] = []): SiteImportAnalysis {
  const issues: ImportIssue[] = [];
  if (!isRecord(input)) {
    return {
      valid: false,
      issues: [{ severity: "error", path: "$", message: "The JSON root must be an object." }],
      content: null,
      summary: null,
    };
  }

  const format = stringValue(input.format);
  if (format && format !== "labnarrative-site") {
    issue(issues, "error", "format", `Unsupported import format “${format}”.`);
  }
  const version = Number(input.version ?? 1);
  if (!Number.isInteger(version) || version !== 1) {
    issue(issues, "error", "version", "Only LabNarrative import format version 1 is supported.");
  }

  const source = isRecord(input.site)
    ? input.site
    : isRecord(input.content)
      ? input.content
      : input;
  const identity = isRecord(source.identity) ? source.identity : {};
  const contact = isRecord(source.contact) ? source.contact : {};
  const rawDesign = isRecord(source.design) ? source.design : {};
  const template = normalizeTemplate(source.template ?? rawDesign.key ?? rawDesign.template, issues);

  const slugInput = stringValue(source.slug, identity.slug);
  const slug = cleanSlug(slugInput);
  if (!slug) issue(issues, "error", "site.slug", "A valid subdomain slug is required.");
  if (slugInput && slugInput !== slug) issue(issues, "warning", "site.slug", `Slug was normalized to “${slug}”.`);
  if (existingSlugs.map(cleanSlug).includes(slug)) issue(issues, "error", "site.slug", `The slug “${slug}” already exists.`);

  const piName = stringValue(source.piName, identity.piName, identity.name);
  const labName = stringValue(source.labName, identity.labName);
  const title = stringValue(source.title, identity.title, identity.role);
  const institution = stringValue(source.institution, identity.institution, contact.institution);
  const department = stringValue(source.department, identity.department, contact.department);
  const address = stringValue(source.address, contact.address);
  const email = stringValue(source.email, contact.email);
  const phone = stringValue(source.phone, contact.phone);
  const profileUrl = safeLink(source.profileUrl ?? contact.profileUrl, "site.profileUrl", issues);
  const pubmedUrl = safeLink(source.pubmedUrl ?? contact.pubmedUrl, "site.pubmedUrl", issues);
  const suppliedPages = isRecord(source.pages) ? source.pages : {};
  const suppliedHome = isRecord(suppliedPages.home) ? suppliedPages.home : {};
  const eyebrow = stringValue(source.eyebrow, suppliedHome.topicLine);
  const headline = stringValue(source.headline, suppliedHome.mainHeading);
  const introduction = stringValue(source.introduction, suppliedHome.openingText);
  const overview = stringValue(source.overview, suppliedHome.researchOverview, introduction);

  if (!piName) issue(issues, "error", "site.piName", "PI name is required.");
  if (!labName) issue(issues, "error", "site.labName", "Laboratory name is required.");
  if (!headline) issue(issues, "error", "site.headline", "Homepage headline is required.");
  if (!institution) issue(issues, "warning", "site.institution", "Institution is empty.");

  const researchInput = source.research ?? source.projects;
  const research = normalizeResearch(researchInput, issues);
  const members = normalizeMembers(source.members ?? source.team, issues);
  const publications = normalizePublications(source.publications, issues);
  const opportunities = normalizeOpportunities(source.opportunities, issues);

  const themeSource = isRecord(source.theme) ? source.theme : {};
  const defaultTheme = themes[template];
  const theme: Theme = {
    background: colorValue(themeSource.background, defaultTheme.background, "site.theme.background", issues),
    surface: colorValue(themeSource.surface, defaultTheme.surface, "site.theme.surface", issues),
    foreground: colorValue(themeSource.foreground, defaultTheme.foreground, "site.theme.foreground", issues),
    muted: colorValue(themeSource.muted, defaultTheme.muted, "site.theme.muted", issues),
    accent: colorValue(themeSource.accent, defaultTheme.accent, "site.theme.accent", issues),
  };

  const siteSeed: LabSite = {
    schemaVersion: template === "bourdon-full" ? 3 : 1,
    design: {
      key: template,
      version: template === "bourdon-full" ? 3 : 1,
      settings: template === "bourdon-full"
        ? { ...defaultBourdonDesignSettings, ...(isRecord(source.designSettings) ? source.designSettings : {}), ...(isRecord(rawDesign.settings) ? rawDesign.settings : {}) }
        : isRecord(rawDesign.settings) ? rawDesign.settings : {},
    },
    template,
    heroImage: safeImage(source.heroImage, "site.heroImage", issues),
    slug,
    piName,
    labName,
    labSubtitle: stringValue(source.labSubtitle, identity.labSubtitle),
    title,
    institution,
    department,
    address,
    email,
    phone,
    profileUrl,
    pubmedUrl,
    eyebrow,
    headline,
    introduction,
    overview,
    focusAreas: stringArray(source.focusAreas, 30),
    projects: research.map((project) => ({ title: project.title, description: project.summary })),
    research,
    team: members.map((member) => ({ name: member.name, role: member.role })),
    members,
    publications,
    opportunities,
    theme,
  };

  if (template === "bourdon-full") {
    siteSeed.design = {
      key: "bourdon-full",
      version: 3,
      settings: getBourdonDesignSettings(siteSeed),
    };
    const defaults = createDefaultBourdonPages(siteSeed);
    siteSeed.pages = mergePages(defaults, source.pages, issues);
    const pages = getBourdonPages(siteSeed);
    siteSeed.heroImage = siteSeed.heroImage || pages.home.homepageImage;
  }

  if (research.length === 0) issue(issues, "warning", "site.research", "No research programmes were supplied.");
  if (publications.length === 0) issue(issues, "warning", "site.publications", "No publications were supplied.");
  if (members.length === 0) issue(issues, "warning", "site.members", "No members were supplied.");

  const valid = !issues.some((item) => item.severity === "error");
  const summary: ImportSummary = {
    slug,
    piName,
    labName,
    template,
    researchCount: research.length,
    publicationCount: publications.length,
    memberCount: members.length,
    opportunityCount: opportunities.length,
    imageCount: countImages(siteSeed),
  };

  return { valid, issues, content: valid ? siteSeed : null, summary };
}

export const exampleSiteImport = {
  format: "labnarrative-site",
  version: 1,
  site: {
    slug: "example-lab",
    template: "bourdon-full",
    designSettings: {
      homeHeroLayout: "image-right",
      programmesLayout: "grid",
      piLayout: "image-left",
      researchIndexLayout: "image-right",
      projectLayout: "split",
      membersColumns: 3,
      pageIntroStyle: "navy",
      sectionSpacing: "balanced",
      cornerStyle: "square",
    },
    identity: {
      piName: "Dr Example Scientist",
      labName: "Example Lab",
      labSubtitle: "Molecular Biology · Example University",
      title: "Professor of Molecular Biology",
      institution: "Example University",
      department: "School of Life Sciences",
    },
    contact: {
      address: "Research Building\nExample University\nCity, Country",
      email: "scientist@example.edu",
      phone: "+00 000 000 0000",
      profileUrl: "https://example.edu/scientist",
      pubmedUrl: "https://pubmed.ncbi.nlm.nih.gov/?term=Example+Scientist%5BAuthor%5D",
    },
    eyebrow: "Gene regulation · Cell fate · Disease",
    headline: "Understanding biology with precision",
    introduction: "A concise opening description of the laboratory and its scientific direction.",
    overview: "A longer research overview explaining the central biological question and the laboratory's connected programme.",
    focusAreas: ["Gene regulation", "Cell fate", "Disease mechanisms"],
    heroImage: "",
    research: [
      {
        slug: "programme-one",
        title: "Research programme one",
        summary: "A concise description of the programme.",
        question: "What central biological question does this programme address?",
        body: ["First detailed paragraph.", "Second detailed paragraph."],
        methods: ["Functional genomics", "Cell biology"],
        papers: ["Landmark paper citation"],
        figureImage: "",
        figureCaption: "Scientific figure caption.",
      },
    ],
    publications: [
      {
        year: "2026",
        journal: "Example Journal",
        title: "Example publication title",
        href: "https://doi.org/10.0000/example",
      },
    ],
    members: [
      {
        name: "Dr Example Scientist",
        role: "Principal Investigator",
        bio: "Short principal-investigator biography.",
        image: "",
        href: "https://example.edu/scientist",
      },
    ],
    opportunities: [
      {
        title: "Postgraduate study",
        status: "Enquiries welcome",
        description: "Describe the opportunity and expected scientific fit.",
        linkLabel: "Contact the laboratory",
        href: "mailto:scientist@example.edu?subject=Research%20enquiry",
      },
    ],
    pages: {
      navigation: {
        home: "Home",
        research: "Research",
        publications: "Publications",
        members: "Lab members",
        join: "Join our lab",
        contact: "Contact us",
      },
      home: {
        topicLine: "Gene regulation · Cell fate · Disease",
        mainHeading: "Understanding biology with precision",
        openingText: "A concise opening description of the laboratory and its scientific direction.",
      },
    },
    theme: {
      background: "#f8f8f5",
      surface: "#ffffff",
      foreground: "#132d3a",
      muted: "#647178",
      accent: "#117b79",
    },
  },
};
