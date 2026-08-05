import fs from "node:fs";

const pageUrl = new URL("../app/admin/discovery/page.tsx", import.meta.url);
let source = fs.readFileSync(pageUrl, "utf8");

const helperMarker = "type DiscoveryPageSize = 10 | 25 | 50;";

if (!source.includes(helperMarker)) {
  const exportMarker = "export default function ProspectDiscoveryPage() {";
  if (!source.includes(exportMarker)) {
    throw new Error("Prospect Discovery component marker was not found.");
  }

  const helpers = `type DiscoveryPageSize = 10 | 25 | 50;

type DiscoveryPaginationProps = {
  total: number;
  page: number;
  pageSize: DiscoveryPageSize;
  label: string;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: DiscoveryPageSize) => void;
};

function paginationItems(
  totalPages: number,
  currentPage: number,
): Array<number | "ellipsis"> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_item, index) => index + 1);
  }

  const items: Array<number | "ellipsis"> = [1];
  const start = Math.max(2, currentPage - 1);
  const end = Math.min(totalPages - 1, currentPage + 1);

  if (start > 2) items.push("ellipsis");
  for (let page = start; page <= end; page += 1) items.push(page);
  if (end < totalPages - 1) items.push("ellipsis");
  items.push(totalPages);

  return items;
}

function DiscoveryPagination({
  total,
  page,
  pageSize,
  label,
  onPageChange,
  onPageSizeChange,
}: DiscoveryPaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const firstRecord = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const lastRecord = Math.min(total, safePage * pageSize);

  return (
    <div className="discoveryPagination" aria-label={label + " pagination"}>
      <span className="discoveryPaginationSummary">
        {total === 0 ? "No records" : firstRecord + "–" + lastRecord + " of " + total}
      </span>

      <div className="discoveryPaginationControls">
        <label className="discoveryPageSize">
          <span>Show</span>
          <select
            aria-label={label + " rows per page"}
            value={pageSize}
            onChange={(event) =>
              onPageSizeChange(Number(event.target.value) as DiscoveryPageSize)
            }
          >
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
          </select>
        </label>

        <div className="discoveryPageButtons">
          <button
            type="button"
            disabled={safePage === 1}
            onClick={() => onPageChange(safePage - 1)}
          >
            Previous
          </button>

          {paginationItems(totalPages, safePage).map((item, index) =>
            item === "ellipsis" ? (
              <span className="discoveryPageEllipsis" key={"ellipsis-" + index}>
                …
              </span>
            ) : (
              <button
                type="button"
                aria-current={item === safePage ? "page" : undefined}
                className={item === safePage ? "discoveryPageActive" : undefined}
                key={item}
                onClick={() => onPageChange(item)}
              >
                {item}
              </button>
            ),
          )}

          <button
            type="button"
            disabled={safePage === totalPages}
            onClick={() => onPageChange(safePage + 1)}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

`;

  source = source.replace(exportMarker, helpers + exportMarker);
}

const stateMarker = "  const [noticeError, setNoticeError] = useState(false);\n";
if (!source.includes("const [queuePageSize, setQueuePageSize]")) {
  if (!source.includes(stateMarker)) {
    throw new Error("Discovery notice state marker was not found.");
  }
  source = source.replace(
    stateMarker,
    stateMarker +
      "  const [queuePageSize, setQueuePageSize] = useState<DiscoveryPageSize>(10);\n" +
      "  const [queuePage, setQueuePage] = useState(1);\n" +
      "  const [historyPageSize, setHistoryPageSize] = useState<DiscoveryPageSize>(10);\n" +
      "  const [historyPage, setHistoryPage] = useState(1);\n" +
      "  const [diagnosticPageSize, setDiagnosticPageSize] = useState<DiscoveryPageSize>(10);\n" +
      "  const [diagnosticPage, setDiagnosticPage] = useState(1);\n",
  );
} else if (!source.includes("const [historyPageSize, setHistoryPageSize]")) {
  const diagnosticState = "  const [diagnosticPageSize, setDiagnosticPageSize] = useState<DiscoveryPageSize>(10);\n";
  if (!source.includes(diagnosticState)) {
    throw new Error("Diagnostic pagination state marker was not found.");
  }
  source = source.replace(
    diagnosticState,
    "  const [historyPageSize, setHistoryPageSize] = useState<DiscoveryPageSize>(10);\n" +
      "  const [historyPage, setHistoryPage] = useState(1);\n" +
      diagnosticState,
  );
}

if (!source.includes("const pagedQueuedCandidates")) {
  const diagnosticMarker = `  const diagnosticCandidates = useMemo(
    () => candidates.filter((item) => item.validation_status !== "approved"),
    [candidates],
  );
`;

  if (!source.includes(diagnosticMarker)) {
    throw new Error("Diagnostic candidate memo marker was not found.");
  }

  const paginationState = `
  const queuePageCount = Math.max(
    1,
    Math.ceil(queuedCandidates.length / queuePageSize),
  );
  const historyPageCount = Math.max(
    1,
    Math.ceil(runs.length / historyPageSize),
  );
  const diagnosticPageCount = Math.max(
    1,
    Math.ceil(diagnosticCandidates.length / diagnosticPageSize),
  );

  const pagedQueuedCandidates = useMemo(() => {
    const start = (queuePage - 1) * queuePageSize;
    return queuedCandidates.slice(start, start + queuePageSize);
  }, [queuePage, queuePageSize, queuedCandidates]);

  const pagedRuns = useMemo(() => {
    const start = (historyPage - 1) * historyPageSize;
    return runs.slice(start, start + historyPageSize);
  }, [historyPage, historyPageSize, runs]);

  const pagedDiagnosticCandidates = useMemo(() => {
    const start = (diagnosticPage - 1) * diagnosticPageSize;
    return diagnosticCandidates.slice(start, start + diagnosticPageSize);
  }, [diagnosticCandidates, diagnosticPage, diagnosticPageSize]);

  useEffect(() => {
    setQueuePage((current) => Math.min(current, queuePageCount));
  }, [queuePageCount]);

  useEffect(() => {
    setHistoryPage((current) => Math.min(current, historyPageCount));
  }, [historyPageCount]);

  useEffect(() => {
    setDiagnosticPage((current) => Math.min(current, diagnosticPageCount));
  }, [diagnosticPageCount]);
`;

  source = source.replace(diagnosticMarker, diagnosticMarker + paginationState);
}

source = source.replace(
  "queuedCandidates.map((candidate) => (",
  "pagedQueuedCandidates.map((candidate) => (",
);
source = source.replace(
  "runs.map((run) => (",
  "pagedRuns.map((run) => (",
);
source = source.replace(
  "diagnosticCandidates.map((candidate) => (",
  "pagedDiagnosticCandidates.map((candidate) => (",
);

function insertPagination(kicker, marker, jsx) {
  if (source.includes(marker)) return;

  const kickerToken = `<p className={styles.kicker}>${kicker}</p>`;
  const kickerIndex = source.indexOf(kickerToken);
  if (kickerIndex === -1) throw new Error(`${kicker} card was not found.`);

  const tableEnd = source.indexOf("</table>", kickerIndex);
  if (tableEnd === -1) throw new Error(`${kicker} table ending was not found.`);

  const wrapEnd = source.indexOf("</div>", tableEnd);
  if (wrapEnd === -1) throw new Error(`${kicker} table wrapper ending was not found.`);

  const insertionPoint = wrapEnd + "</div>".length;
  source = source.slice(0, insertionPoint) + "\n\n" + jsx + source.slice(insertionPoint);
}

insertPagination(
  "Automatic queue",
  'label="Automatic queue"',
  `              <DiscoveryPagination
                label="Automatic queue"
                total={queuedCandidates.length}
                page={queuePage}
                pageSize={queuePageSize}
                onPageChange={setQueuePage}
                onPageSizeChange={(size) => {
                  setQueuePageSize(size);
                  setQueuePage(1);
                }}
              />`,
);

insertPagination(
  "Discovery history",
  'label="Discovery history"',
  `              <DiscoveryPagination
                label="Discovery history"
                total={runs.length}
                page={historyPage}
                pageSize={historyPageSize}
                onPageChange={setHistoryPage}
                onPageSizeChange={(size) => {
                  setHistoryPageSize(size);
                  setHistoryPage(1);
                }}
              />`,
);

insertPagination(
  "Diagnostic record",
  'label="Diagnostic records"',
  `              <DiscoveryPagination
                label="Diagnostic records"
                total={diagnosticCandidates.length}
                page={diagnosticPage}
                pageSize={diagnosticPageSize}
                onPageChange={setDiagnosticPage}
                onPageSizeChange={(size) => {
                  setDiagnosticPageSize(size);
                  setDiagnosticPage(1);
                }}
              />`,
);

function updateAutomaticQueueTable() {
  const kickerToken = '<p className={styles.kicker}>Automatic queue</p>';
  const kickerIndex = source.indexOf(kickerToken);
  if (kickerIndex === -1) throw new Error("Automatic queue card was not found.");

  const cardStartCandidates = [
    '<section className={`${styles.card} discoverySplitQueue`}>',
    "<section className={styles.card}>",
  ];
  let cardStart = -1;
  for (const token of cardStartCandidates) {
    const candidate = source.lastIndexOf(token, kickerIndex);
    if (candidate > cardStart) cardStart = candidate;
  }
  const cardEndStart = source.indexOf("</section>", kickerIndex);
  if (cardStart === -1 || cardEndStart === -1) {
    throw new Error("Automatic queue card boundaries were not found.");
  }
  const cardEnd = cardEndStart + "</section>".length;
  let card = source.slice(cardStart, cardEnd);

  card = card.replace(
    '<table className={styles.table}>',
    '<table className={`${styles.table} automaticQueueTable`}>',
  );
  card = card.replace(/\s*<th>Outcome<\/th>/, "");
  card = card.replace("<td colSpan={4}>", "<td colSpan={3}>");
  card = card.replace(
    /\n\s*<td>\n\s*<span\n\s*className=\{styles\.status\}\n\s*data-status="approved"\n\s*>\n\s*queued\n\s*<\/span>\n\s*<br \/>\n\s*<small className=\{styles\.muted\}>\n\s*\{candidate\.decision_reason \|\|\n\s*"Automatically admitted to production\."\}\n\s*<\/small>\n\s*<\/td>/,
    "",
  );

  if (card.includes("<th>Outcome</th>")) {
    throw new Error("The Automatic queue Outcome heading is still present.");
  }
  if (!card.includes("automaticQueueTable")) {
    throw new Error("The Automatic queue table class was not added.");
  }

  source = `${source.slice(0, cardStart)}${card}${source.slice(cardEnd)}`;
}

updateAutomaticQueueTable();

for (const required of [
  helperMarker,
  "pagedQueuedCandidates.map",
  "pagedRuns.map",
  "pagedDiagnosticCandidates.map",
  'label="Automatic queue"',
  'label="Discovery history"',
  'label="Diagnostic records"',
  "automaticQueueTable",
]) {
  if (!source.includes(required)) {
    throw new Error(`Discovery pagination marker missing: ${required}`);
  }
}

fs.writeFileSync(pageUrl, source);
console.log("Discovery history, automatic queue and diagnostic records pagination prepared; queue table simplified.");
