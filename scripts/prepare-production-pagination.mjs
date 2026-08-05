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
  'import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";',
  'import { FormEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";',
  "ReactNode import",
);

const helperMarker = "type ProductionPageSize = 10 | 25 | 50;";
if (!source.includes(helperMarker)) {
  const exportMarker = "export default function AutomationControlCentre() {";
  if (!source.includes(exportMarker)) {
    throw new Error("Production Engine component marker was not found.");
  }

  const helpers = `type ProductionPageSize = 10 | 25 | 50;

type ProductionPaginationProps = {
  total: number;
  page: number;
  pageSize: ProductionPageSize;
  label: string;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: ProductionPageSize) => void;
};

function productionPaginationItems(
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

function ProductionPagination({
  total,
  page,
  pageSize,
  label,
  onPageChange,
  onPageSizeChange,
}: ProductionPaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const firstRecord = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const lastRecord = Math.min(total, safePage * pageSize);

  return (
    <div className="productionPagination" aria-label={label + " pagination"}>
      <span className="productionPaginationSummary">
        {total === 0 ? "No records" : firstRecord + "–" + lastRecord + " of " + total}
      </span>

      <div className="productionPaginationControls">
        <label className="productionPageSize">
          <span>Show</span>
          <select
            aria-label={label + " rows per page"}
            value={pageSize}
            onChange={(event) =>
              onPageSizeChange(Number(event.target.value) as ProductionPageSize)
            }
          >
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
          </select>
        </label>

        <div className="productionPageButtons">
          <button
            type="button"
            disabled={safePage === 1}
            onClick={() => onPageChange(safePage - 1)}
          >
            Previous
          </button>

          {productionPaginationItems(totalPages, safePage).map((item, index) =>
            item === "ellipsis" ? (
              <span className="productionPageEllipsis" key={"ellipsis-" + index}>
                …
              </span>
            ) : (
              <button
                type="button"
                aria-current={item === safePage ? "page" : undefined}
                className={item === safePage ? "productionPageActive" : undefined}
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

if (!source.includes("const [pipelineHistoryPageSize, setPipelineHistoryPageSize]")) {
  const stateMarker = "  const [working, setWorking] = useState(false);\n";
  if (!source.includes(stateMarker)) {
    throw new Error("Production pagination state marker was not found.");
  }

  source = source.replace(
    stateMarker,
    stateMarker +
      "  const [pipelineHistoryPageSize, setPipelineHistoryPageSize] = useState<ProductionPageSize>(10);\n" +
      "  const [pipelineHistoryPage, setPipelineHistoryPage] = useState(1);\n" +
      "  const [buildablePageSize, setBuildablePageSize] = useState<ProductionPageSize>(10);\n" +
      "  const [buildablePage, setBuildablePage] = useState(1);\n",
  );
}

if (!source.includes("const pagedPipelineHistoryProspects")) {
  const insertionMarker = "  async function requestOtp(event: FormEvent) {";
  if (!source.includes(insertionMarker)) {
    throw new Error("Production pagination data insertion point was not found.");
  }

  const paginationData = `  const pipelineHistoryProspects = useMemo(
    () => sortPipelineHistoryProspects(
      prospects.filter((prospect) => !["queued", "held", "rejected"].includes(prospect.status)),
    ),
    [prospects],
  );
  const buildableProspects = useMemo(
    () => prospects.filter((prospect) => prospect.status === "queued"),
    [prospects],
  );

  const pipelineHistoryPageCount = Math.max(
    1,
    Math.ceil(pipelineHistoryProspects.length / pipelineHistoryPageSize),
  );
  const buildablePageCount = Math.max(
    1,
    Math.ceil(buildableProspects.length / buildablePageSize),
  );

  const pagedPipelineHistoryProspects = useMemo(() => {
    const start = (pipelineHistoryPage - 1) * pipelineHistoryPageSize;
    return pipelineHistoryProspects.slice(start, start + pipelineHistoryPageSize);
  }, [pipelineHistoryPage, pipelineHistoryPageSize, pipelineHistoryProspects]);

  const pagedBuildableProspects = useMemo(() => {
    const start = (buildablePage - 1) * buildablePageSize;
    return buildableProspects.slice(start, start + buildablePageSize);
  }, [buildablePage, buildablePageSize, buildableProspects]);

  useEffect(() => {
    setPipelineHistoryPage((current) => Math.min(current, pipelineHistoryPageCount));
  }, [pipelineHistoryPageCount]);

  useEffect(() => {
    setBuildablePage((current) => Math.min(current, buildablePageCount));
  }, [buildablePageCount]);

`;

  source = source.replace(insertionMarker, paginationData + insertionMarker);
}

source = replaceRequired(
  source,
  "  function renderProspectTable(kicker: string, title: string, items: Prospect[], emptyMessage: string) {",
  "  function renderProspectTable(kicker: string, title: string, items: Prospect[], emptyMessage: string, total: number, pagination: ReactNode) {",
  "prospect table pagination signature",
);

source = replaceRequired(
  source,
  '<span className={styles.muted}>{items.length} record{items.length === 1 ? "" : "s"}</span>',
  '<span className={styles.muted}>{total} record{total === 1 ? "" : "s"}</span>',
  "prospect table total count",
);

source = replaceRequired(
  source,
  `        </div>
      </section>
    );
  }

  if (!authReady)`,
  `        </div>
        {pagination}
      </section>
    );
  }

  if (!authReady)`,
  "prospect table pagination controls",
);

const oldHistoryCall = '{renderProspectTable("Active and completed records", "", sortPipelineHistoryProspects(prospects.filter((prospect) => !["queued", "held", "rejected"].includes(prospect.status))), "No prospects have entered production yet.")}';
const newHistoryCall = `{renderProspectTable(
              "Active and completed records",
              "",
              pagedPipelineHistoryProspects,
              "No prospects have entered production yet.",
              pipelineHistoryProspects.length,
              <ProductionPagination
                label="Active and completed records"
                total={pipelineHistoryProspects.length}
                page={pipelineHistoryPage}
                pageSize={pipelineHistoryPageSize}
                onPageChange={setPipelineHistoryPage}
                onPageSizeChange={(size) => {
                  setPipelineHistoryPageSize(size);
                  setPipelineHistoryPage(1);
                }}
              />,
            )}`;
source = replaceRequired(source, oldHistoryCall, newHistoryCall, "Pipeline history pagination");

const oldBuildableCall = '{renderProspectTable("Buildable prospects · score 75–100", "", prospects.filter((prospect) => prospect.status === "queued"), "No prospects are currently waiting to be built.")}';
const newBuildableCall = `{renderProspectTable(
              "Buildable prospects · score 75–100",
              "",
              pagedBuildableProspects,
              "No prospects are currently waiting to be built.",
              buildableProspects.length,
              <ProductionPagination
                label="Buildable prospects"
                total={buildableProspects.length}
                page={buildablePage}
                pageSize={buildablePageSize}
                onPageChange={setBuildablePage}
                onPageSizeChange={(size) => {
                  setBuildablePageSize(size);
                  setBuildablePage(1);
                }}
              />,
            )}`;
source = replaceRequired(source, oldBuildableCall, newBuildableCall, "Buildable prospect pagination");

for (const required of [
  helperMarker,
  "pagedPipelineHistoryProspects",
  "pagedBuildableProspects",
  'label="Active and completed records"',
  'label="Buildable prospects"',
  "{pagination}",
]) {
  if (!source.includes(required)) {
    throw new Error(`Production pagination marker missing: ${required}`);
  }
}

fs.writeFileSync(pageUrl, source);
console.log("Active/completed and buildable Production prospect tables paginated independently.");
