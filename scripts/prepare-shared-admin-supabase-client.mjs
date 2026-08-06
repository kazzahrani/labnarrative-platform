import fs from "node:fs";
import path from "node:path";

const roots = [
  path.join(process.cwd(), "app", "admin"),
  path.join(process.cwd(), "components", "admin"),
];

function collectTsxFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectTsxFiles(fullPath);
    return entry.isFile() && entry.name.endsWith(".tsx") ? [fullPath] : [];
  });
}

const clientBlock = `const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);
`;

let patched = 0;
const touched = [];

for (const filePath of roots.flatMap(collectTsxFiles)) {
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
    .replace(clientBlock, "");

  if (source.includes("createClient(") || source.includes("NEXT_PUBLIC_SUPABASE_URL")) {
    throw new Error(`A local Supabase client remains in ${path.relative(process.cwd(), filePath)}.`);
  }
  if (!source.includes('browserSupabase as supabase')) {
    throw new Error(`The shared Supabase import was not installed in ${path.relative(process.cwd(), filePath)}.`);
  }
  if (hadSessionType && !source.includes('import type { Session } from "@supabase/supabase-js";')) {
    throw new Error(`The Session type import was lost in ${path.relative(process.cwd(), filePath)}.`);
  }

  fs.writeFileSync(filePath, source);
  patched += 1;
  touched.push(path.relative(process.cwd(), filePath));
}

if (patched === 0) {
  throw new Error("No admin Supabase clients were converted to the shared singleton.");
}

console.log(`Shared browser Supabase client installed across ${patched} admin files: ${touched.join(", ")}.`);
