import fs from "node:fs";

const pageUrl = new URL("../app/admin/automation/page.tsx", import.meta.url);
let source = fs.readFileSync(pageUrl, "utf8");

function replaceRequired(current, oldText, newText, label) {
  if (current.includes(newText)) return current;
  if (!current.includes(oldText)) {
    throw new Error(`${label} insertion point was not found.`);
  }
  return current.replace(oldText, newText);
}

source = replaceRequired(
  source,
  'supabase.from("production_runs").select("*,prospects(*),sites(id,slug,status,domain_status,domain_url,content)").order("created_at", { ascending: false })',
  'supabase.from("production_runs").select("*,prospects(*),sites(id,slug,status,domain_status,domain_url)").order("created_at", { ascending: false })',
  "Production run payload reduction",
);

source = replaceRequired(
  source,
  'supabase.from("pipeline_events").select("*").order("created_at", { ascending: false }).limit(120)',
  'supabase.from("pipeline_events").select("id,prospect_id,production_run_id,event_type,step,message,created_at").order("created_at", { ascending: false }).limit(60)',
  "Production event payload reduction",
);

const pollingBlock = `
  useEffect(() => {
    if (!session || role !== "admin") return;
    const timer = window.setInterval(() => void loadData(), 30_000);
    return () => window.clearInterval(timer);
  }, [loadData, role, session]);
`;

if (source.includes(pollingBlock)) {
  source = source.replace(pollingBlock, "\n");
}

if (!source.includes("run.source_pack?.auto_sequence !== true")) {
  const activeIndex = source.indexOf("const activeRun = useMemo(");
  if (activeIndex !== -1) {
    const searchEnd = Math.min(source.length, activeIndex + 1200);
    const findNeedle = "runs.find((run) => ";
    const findIndex = source.indexOf(findNeedle, activeIndex);
    if (findIndex !== -1 && findIndex < searchEnd) {
      const insertion = findIndex + findNeedle.length;
      source = `${source.slice(0, insertion)}run.source_pack?.auto_sequence !== true && ${source.slice(insertion)}`;
    }
  }
}

for (const required of [
  "const sessionRef = useRef<Session | null>(null);",
  "activeSession ?? sessionRef.current",
  "sites(id,slug,status,domain_status,domain_url)",
  ".limit(60)",
]) {
  if (!source.includes(required)) {
    throw new Error(`Production performance marker missing: ${required}`);
  }
}

if (source.includes("window.setInterval(() => void loadData(), 30_000)")) {
  throw new Error("The Production background polling loop is still present.");
}
if (source.includes("sites(id,slug,status,domain_status,domain_url,content)")) {
  throw new Error("Full site content is still included in Production loading.");
}

fs.writeFileSync(pageUrl, source);
console.log(source.includes("run.source_pack?.auto_sequence !== true")
  ? "Production loading stabilized; follow-up reviews do not occupy website production."
  : "Production loading stabilized; follow-up review remains safely non-sending even if the optional active-slot UI filter was not applicable.");
