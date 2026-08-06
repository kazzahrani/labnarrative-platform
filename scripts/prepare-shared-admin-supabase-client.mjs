import fs from "node:fs";
import path from "node:path";

const explicitFiles = [
  "app/admin/page.tsx",
  "app/admin/automation/page.tsx",
  "app/admin/discovery/page.tsx",
  "app/admin/sites/page.tsx",
].map((relativePath) => path.join(process.cwd(), ...relativePath.split("/")));

function collectTsxFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectTsxFiles(fullPath);
    return entry.isFile() && entry.name.endsWith(".tsx") ? [fullPath] : [];
  });
}

const files = [
  ...explicitFiles,
  ...collectTsxFiles(path.join(process.cwd(), "components", "admin")),
];

let patched = 0;
const touched = [];

for (const filePath of files) {
  const relativePath = path.relative(process.cwd(), filePath);
  let source = fs.readFileSync(filePath, "utf8");
  if (!source.includes("createClient(") || !source.includes("NEXT_PUBLIC_SUPABASE_URL")) continue;

  const hadSessionType = source.includes("type Session") && source.includes("@supabase/supabase-js");

  source = source
    .replace(
      'import { createClient, type Session } from "@supabase/supabase-js";\n',
      'import type { Session } from "@supabase/supabase-js";\nimport { browserSupabase as supabase } from "@/lib/supabase-browser";\n',
    )
    .replace(
      'import { type Session, createClient } from "@supabase/supabase-js";\n',
      'import type { Session } from "@supabase/supabase-js";\nimport { browserSupabase as supabase } from "@/lib/supabase-browser";\n',
    )
    .replace(
      'import { createClient } from "@supabase/supabase-js";\n',
      'import { browserSupabase as supabase } from "@/lib/supabase-browser";\n',
    )
    .replace(
      /const supabaseUrl = process\.env\.NEXT_PUBLIC_SUPABASE_URL!;\nconst supabaseKey = process\.env\.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;\nconst supabase = createClient\(supabaseUrl, supabaseKey\);\n/,
      "",
    )
    .replace(
      /const supabase = createClient\(\s*process\.env\.NEXT_PUBLIC_SUPABASE_URL!,\s*process\.env\.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,?\s*\);\n/,
      "",
    );

  if (source.includes("createClient(") || source.includes("NEXT_PUBLIC_SUPABASE_URL")) {
    throw new Error(`A local Supabase client remains in ${relativePath}.`);
  }
  if (!source.includes('browserSupabase as supabase')) {
    throw new Error(`The shared Supabase import was not installed in ${relativePath}.`);
  }
  if (hadSessionType && !source.includes('import type { Session } from "@supabase/supabase-js";')) {
    throw new Error(`The Session type import was lost in ${relativePath}.`);
  }

  fs.writeFileSync(filePath, source);
  patched += 1;
  touched.push(relativePath);
}

if (patched < 5) {
  throw new Error(`Only ${patched} admin clients were converted; expected the dashboards and shared components.`);
}

console.log(`Shared browser Supabase client installed across ${patched} admin files: ${touched.join(", ")}.`);
