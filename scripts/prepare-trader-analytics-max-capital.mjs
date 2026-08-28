import fs from "node:fs";
import path from "node:path";

const analyticsPath = path.join(process.cwd(), "app", "trader", "Analytics.tsx");
if (!fs.existsSync(analyticsPath)) throw new Error("Analytics max-capital target missing");
let source = fs.readFileSync(analyticsPath, "utf8");

function replaceOnce(from, to, label) {
  if (!source.includes(from)) throw new Error(`Analytics max-capital missing ${label}`);
  source = source.replace(from, to);
}

if (!source.includes("maxCapitalMode?:")) {
  replaceOnce(
    "  market: string;\n  activePositions: number;",
    "  market: string;\n  maxCapital?: number | null;\n  maxCapitalMode?: \"fixed\" | \"dynamic\";\n  activePositions: number;",
    "automation capital fields",
  );
}

if (!source.includes("type CapitalResponse =")) {
  replaceOnce(
    "type Props = { accountId: string; accountName: string };",
    "type CapitalResponse = { ok?: boolean; automations?: Array<{ id: string; maxCapital: number | null; maxCapitalMode: \"fixed\" | \"dynamic\" }>; error?: string };\ntype Props = { accountId: string; accountName: string };",
    "capital response type",
  );
}

if (!source.includes("function maxCapitalLabel")) {
  replaceOnce(
    "function pct(value: number | null | undefined, digits = 2) {",
    "function maxCapitalLabel(item: Pick<AutomationStats, \"maxCapital\" | \"maxCapitalMode\">) {\n  if (item.maxCapitalMode === \"dynamic\") return \"Dynamic\";\n  if (item.maxCapital == null || !Number.isFinite(item.maxCapital)) return \"—\";\n  return new Intl.NumberFormat(\"en-US\", { style: \"currency\", currency: \"USD\", maximumFractionDigits: 2 }).format(item.maxCapital);\n}\nfunction pct(value: number | null | undefined, digits = 2) {",
    "capital formatter",
  );
}

if (!source.includes('"trader-analytics-capital"')) {
  replaceOnce(
    "      if (response.range !== range) throw new Error(\"analytics_range_mismatch\");\n      if (requestId !== requestIdRef.current) return;\n      setSummary(response.summary);\n      setOverallSeries(response.series ?? []);\n      setAutomations(response.automations ?? []);\n      setError(\"\");\n      setSelectedId((current) => current === \"all\" || (response.automations ?? []).some((item) => item.id === current) ? current : \"all\");",
    "      if (response.range !== range) throw new Error(\"analytics_range_mismatch\");\n      if (requestId !== requestIdRef.current) return;\n      const { data: capitalData } = await browserSupabase.functions.invoke(\"trader-analytics-capital\", { body: { accountId } });\n      if (requestId !== requestIdRef.current) return;\n      const capitalResponse = (capitalData ?? {}) as CapitalResponse;\n      const capitalById = new Map((capitalResponse.automations ?? []).map((item) => [item.id, item]));\n      const enrichedAutomations = (response.automations ?? []).map((item) => ({ ...item, ...(capitalById.get(item.id) ?? {}) }));\n      setSummary(response.summary);\n      setOverallSeries(response.series ?? []);\n      setAutomations(enrichedAutomations);\n      setError(\"\");\n      setSelectedId((current) => current === \"all\" || enrichedAutomations.some((item) => item.id === current) ? current : \"all\");",
    "capital enrichment",
  );
}

replaceOnce("<span>Positions</span>", "<span>Max Capital</span>", "table capital heading");
replaceOnce(
  "<span>{item.activePositions} / {item.maxActivePositions ?? \"∞\"}</span>",
  "<span>{maxCapitalLabel(item)}</span>",
  "table capital value",
);

for (const marker of [
  "maxCapitalMode?:",
  '"trader-analytics-capital"',
  "<span>Max Capital</span>",
  "{maxCapitalLabel(item)}",
]) if (!source.includes(marker)) throw new Error(`Analytics max-capital output missing ${marker}`);
if (source.includes("<span>Positions</span>")) throw new Error("Analytics Positions column still present");

fs.writeFileSync(analyticsPath, source);
console.log("Prepared Analytics Max Capital column and removed Positions column.");
