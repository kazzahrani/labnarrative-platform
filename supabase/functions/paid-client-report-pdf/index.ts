// LabNarrative Intelligence paid-client PDF renderer.
// Canonical live source is deployed in Supabase Edge Functions.
// Theme: classic editorial system restored 2026-08-17.
// Visual rules: warm ivory body pages, dark-green cover and core final page,
// thin rules/no pastel cards, lime accent on dark pages, two black platform appendix pages.
// Live function slug: paid-client-report-pdf
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

// NOTE: The complete executable source is intentionally deployed through Supabase.
// Keep this file as the repository theme contract until the function-sync workflow
// is switched to source-of-truth deployment from GitHub.
