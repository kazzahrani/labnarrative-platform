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

const sites: Record<string, LabSite> = {
  bourdon: {
    slug: "bourdon",
    piName: "Jean-Christophe Bourdon",
    labName: "Bourdon Lab",
    title: "Senior Lecturer in Cancer Research",
    institution: "University of Dundee",
    eyebrow: "p53 isoforms · Cell fate · Cancer",
    headline: "One gene. A network of proteins.",
    introduction:
      "The laboratory studies how p53 isoforms shape cell fate, cancer biology, ageing and therapeutic response. This record demonstrates how one shared platform can render a complete, distinct laboratory identity.",
    focusAreas: ["p53 isoforms", "Molecular oncology", "Cancer diagnostics"],
    projects: [
      {
        title: "p53 isoform biology",
        description: "Mapping the distinct functions and interactions of human p53 isoforms.",
      },
      {
        title: "Cancer and cell fate",
        description: "Understanding how isoform balance influences proliferation, arrest and survival.",
      },
      {
        title: "Clinical translation",
        description: "Connecting fundamental p53 biology with diagnosis and treatment response.",
      },
    ],
    team: [
      { name: "Jean-Christophe Bourdon", role: "Principal Investigator" },
      { name: "Team member", role: "Researcher" },
      { name: "Team member", role: "Doctoral researcher" },
    ],
    publications: [
      { title: "Selected publication placeholder", journal: "Research journal", year: "2026" },
      { title: "Selected publication placeholder", journal: "Research journal", year: "2025" },
    ],
    theme: {
      background: "#eef1eb",
      surface: "#f8faf6",
      foreground: "#153229",
      muted: "#64726c",
      accent: "#1b5a45",
    },
  },
  chen: {
    slug: "chen",
    piName: "Xinbin Chen",
    labName: "Chen Laboratory",
    title: "Cancer Biology Research",
    institution: "Pilot concept record",
    eyebrow: "Tumour suppression · p53 · Cancer biology",
    headline: "Mechanisms that decide whether damaged cells survive.",
    introduction:
      "This second record uses the same application and components while presenting a different scientific narrative, visual identity and content set. It proves that a new PI does not require a new codebase.",
    focusAreas: ["Tumour suppressors", "Genome integrity", "Cancer mechanisms"],
    projects: [
      {
        title: "Tumour suppressor networks",
        description: "Studying molecular systems that restrain malignant transformation.",
      },
      {
        title: "Cellular stress responses",
        description: "Defining how damaged cells choose repair, arrest or elimination.",
      },
      {
        title: "Translational cancer biology",
        description: "Linking mechanistic discoveries with clinically relevant questions.",
      },
    ],
    team: [
      { name: "Xinbin Chen", role: "Principal Investigator" },
      { name: "Team member", role: "Research scientist" },
      { name: "Team member", role: "Graduate researcher" },
    ],
    publications: [
      { title: "Selected publication placeholder", journal: "Cancer research journal", year: "2026" },
      { title: "Selected publication placeholder", journal: "Cancer research journal", year: "2025" },
    ],
    theme: {
      background: "#101617",
      surface: "#172022",
      foreground: "#f0eee8",
      muted: "#a5b0ad",
      accent: "#d7a85a",
    },
  },
};

export function getSite(slug: string): LabSite | undefined {
  return sites[slug.toLowerCase()];
}

export function getAllSites(): LabSite[] {
  return Object.values(sites);
}
