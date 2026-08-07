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

const componentMarker = "export default function AutomationControlCentre() {";
const statusOrderMarker = "const pipelineHistoryFilterOrder: ProspectStatus[] = [";

if (!source.includes(statusOrderMarker)) {
  const statusOrder = `const pipelineHistoryFilterOrder: ProspectStatus[] = [
  "awaiting_final_review",
  "in_production",
  "revision_requested",
  "approved_to_send",
  "email_sent",
  "replied",
  "interested",
  "needs_attention",
  "paused",
  "discovered",
  "qualified",
];

`;

  if (!source.includes(componentMarker)) {
    throw new Error("The Production Engine component marker was not found.");
  }
  source = source.replace(componentMarker, statusOrder + componentMarker);
}

if (!source.includes("pipelineHistoryStatusFilter, setPipelineHistoryStatusFilter")) {
  source = replaceRequired(
    source,
    "  const [pipelineHistoryPage, setPipelineHistoryPage] = useState(1);\n",
    "  const [pipelineHistoryPage, setPipelineHistoryPage] = useState(1);\n  const [pipelineHistoryStatusFilter, setPipelineHistoryStatusFilter] = useState<\"all\" | ProspectStatus>(\"awaiting_final_review\");\n",
    "Pipeline history status-filter state",
  );
}

const oldPipelineData = `  const pipelineHistoryProspects = useMemo(
    () => sortPipelineHistoryProspects(
      prospects.filter((prospect) => !["queued", "held", "rejected"].includes(prospect.status)),
    ),
    [prospects],
  );`;

const newPipelineData = `  const pipelineHistoryAllProspects = useMemo(
    () => sortPipelineHistoryProspects(
      prospects.filter((prospect) => !["queued", "held", "rejected"].includes(prospect.status)),
    ),
    [prospects],
  );

  const pipelineHistoryStatusCounts = useMemo(() => {
    const countsByStatus = new Map<ProspectStatus, number>();
    pipelineHistoryAllProspects.forEach((prospect) => {
      countsByStatus.set(prospect.status, (countsByStatus.get(prospect.status) ?? 0) + 1);
    });
    return countsByStatus;
  }, [pipelineHistoryAllProspects]);

  const pipelineHistoryStatuses = useMemo(() => {
    const ordered = pipelineHistoryFilterOrder.filter(
      (status) => status === "awaiting_final_review" || (pipelineHistoryStatusCounts.get(status) ?? 0) > 0,
    );
    const additional = Array.from(pipelineHistoryStatusCounts.keys()).filter(
      (status) => !pipelineHistoryFilterOrder.includes(status),
    );
    return [...ordered, ...additional];
  }, [pipelineHistoryStatusCounts]);

  const pipelineHistoryProspects = useMemo(
    () => pipelineHistoryStatusFilter === "all"
      ? pipelineHistoryAllProspects
      : pipelineHistoryAllProspects.filter(
          (prospect) => prospect.status === pipelineHistoryStatusFilter,
        ),
    [pipelineHistoryAllProspects, pipelineHistoryStatusFilter],
  );`;

source = replaceRequired(
  source,
  oldPipelineData,
  newPipelineData,
  "Pipeline history filtered data",
);

const pageClampEffect = `  useEffect(() => {
    setPipelineHistoryPage((current) => Math.min(current, pipelineHistoryPageCount));
  }, [pipelineHistoryPageCount]);`;

if (!source.includes("setPipelineHistoryPage(1);\n  }, [pipelineHistoryStatusFilter]);")) {
  const filterEffects = `${pageClampEffect}

  useEffect(() => {
    setPipelineHistoryPage(1);
  }, [pipelineHistoryStatusFilter]);`;

  source = replaceRequired(
    source,
    pageClampEffect,
    filterEffects,
    "Pipeline history filter effects",
  );
}

const rendererStart = source.indexOf("  function renderProspectTable(");
const rendererEnd = source.indexOf("\n\n  if (!authReady)", rendererStart);
if (rendererStart === -1 || rendererEnd === -1) {
  throw new Error("The paginated Production prospect-table renderer was not found.");
}

let renderer = source.slice(rendererStart, rendererEnd);
renderer = replaceRequired(
  renderer,
  "items: Prospect[], emptyMessage: string, total: number, pagination: ReactNode)",
  "items: Prospect[], emptyMessage: string, total: number, toolbar: ReactNode, pagination: ReactNode)",
  "Prospect-table toolbar signature",
);
renderer = replaceRequired(
  renderer,
  "        <div className={styles.tableWrap}>",
  "        {toolbar}\n        <div className={styles.tableWrap}>",
  "Prospect-table toolbar placement",
);
source = source.slice(0, rendererStart) + renderer + source.slice(rendererEnd);

const historyTotalMarker = `              pipelineHistoryProspects.length,
              <ProductionPagination`;
const historyToolbar = `              pipelineHistoryProspects.length,
              <div className="productionStatusFilters" aria-label="Filter active and completed records by status">
                <button
                  type="button"
                  aria-pressed={pipelineHistoryStatusFilter === "all"}
                  onClick={() => setPipelineHistoryStatusFilter("all")}
                >
                  <span>All</span>
                  <strong>{pipelineHistoryAllProspects.length}</strong>
                </button>
                {pipelineHistoryStatuses.map((status) => (
                  <button
                    type="button"
                    aria-pressed={pipelineHistoryStatusFilter === status}
                    key={status}
                    onClick={() => setPipelineHistoryStatusFilter(status)}
                  >
                    <span>{status === "awaiting_final_review" ? "Awaiting confirmation" : statusText(status)}</span>
                    <strong>{pipelineHistoryStatusCounts.get(status) ?? 0}</strong>
                  </button>
                ))}
              </div>,
              <ProductionPagination`;
source = replaceRequired(
  source,
  historyTotalMarker,
  historyToolbar,
  "Pipeline history status toggles",
);

source = replaceRequired(
  source,
  `              "No prospects have entered production yet.",
              pipelineHistoryProspects.length,`,
  `              pipelineHistoryStatusFilter === "all"
                ? "No prospects have entered production yet."
                : pipelineHistoryStatusFilter === "awaiting_final_review"
                  ? "No PIs are currently awaiting confirmation."
                  : "No records match this status.",
              pipelineHistoryProspects.length,`,
  "Pipeline history filtered empty state",
);

source = replaceRequired(
  source,
  `              buildableProspects.length,
              <ProductionPagination`,
  `              buildableProspects.length,
              null,
              <ProductionPagination`,
  "Build queue empty toolbar",
);

for (const required of [
  statusOrderMarker,
  'useState<"all" | ProspectStatus>("awaiting_final_review")',
  "pipelineHistoryStatusCounts",
  "pipelineHistoryStatuses",
  "productionStatusFilters",
  "Awaiting confirmation",
  "Filter active and completed records by status",
  "{toolbar}",
]) {
  if (!source.includes(required)) {
    throw new Error(`Production history status-filter marker missing: ${required}`);
  }
}

fs.writeFileSync(pageUrl, source);
console.log("Active and completed records default to Awaiting confirmation with all status filters retained.");
