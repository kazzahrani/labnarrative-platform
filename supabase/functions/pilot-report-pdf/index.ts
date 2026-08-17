// LabNarrative Intelligence managed-pilot PDF renderer.
// Canonical live source is deployed in Supabase Edge Functions.
// Theme restored 2026-08-17 from the GeneTex GTX00678 classic editorial report.
// Visual rules: warm ivory scientific pages, dark-green cover and core final page,
// thin rules/no pastel cards, lime accent only on dark pages, and two black
// platform appendix pages after the report.
// Live function slug: pilot-report-pdf
// Supabase project: pryezqkkildppjxbdrsj

export const PDF_THEME = {
  name: "LabNarrative Intelligence Classic Editorial",
  paper: "#F6F7F2",
  ink: "#101814",
  green: "#12372B",
  lime: "#DCFE79",
  black: "#070908",
  muted: "#6F7973",
  cover: "dark-green",
  coreFinalPage: "dark-green",
  platformAppendix: "black",
  platformAppendixPages: 2,
  pastelCards: false,
  purplePrimary: false,
} as const;

// NOTE: The complete executable source is deployed through Supabase.
// Keep this repository file as the theme contract until this renderer is
// migrated to source-of-truth deployment directly from GitHub.
