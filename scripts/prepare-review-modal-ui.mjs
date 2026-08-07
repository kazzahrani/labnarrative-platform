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

if (!source.includes("reviewModalRunId, setReviewModalRunId")) {
  source = replaceRequired(
    source,
    '  const [revisionText, setRevisionText] = useState<Record<string, string>>({});\n',
    '  const [revisionText, setRevisionText] = useState<Record<string, string>>({});\n  const [reviewModalRunId, setReviewModalRunId] = useState<string | null>(null);\n',
    "Review modal state",
  );
}

if (!source.includes("const selectedReviewRun = useMemo")) {
  const reviewRunsMarker = '  const reviewRuns = useMemo(() => runs.filter((run) => run.status === "awaiting_final_review" || run.status === "approved_to_send"), [runs]);\n';
  source = replaceRequired(
    source,
    reviewRunsMarker,
    `${reviewRunsMarker}  const selectedReviewRun = useMemo(\n    () => reviewModalRunId\n      ? reviewRuns.find((run) => run.id === reviewModalRunId) ?? null\n      : null,\n    [reviewModalRunId, reviewRuns],\n  );\n`,
    "Selected review run",
  );
}

if (!source.includes('event.key === "Escape" && setReviewModalRunId(null)')) {
  const effectInsertionMarker = "  async function requestOtp(event: FormEvent) {";
  const modalEffect = `  useEffect(() => {
    if (!selectedReviewRun) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setReviewModalRunId(null);
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedReviewRun]);

`;
  source = replaceRequired(
    source,
    effectInsertionMarker,
    modalEffect + effectInsertionMarker,
    "Review modal keyboard and scroll behavior",
  );
}

const oldStatusCell = '                  <td><span className={styles.status} data-status={prospect.status}>{statusText(prospect.status)}</span></td>';
const newStatusCell = `                  <td>
                    <div className="productionStatusCell">
                      <span className={styles.status} data-status={prospect.status}>{statusText(prospect.status)}</span>
                      {prospect.status === "awaiting_final_review" || prospect.status === "approved_to_send" ? (
                        <button
                          className="reviewTableButton"
                          type="button"
                          aria-label={\`Review \${prospect.pi_name}\`}
                          onClick={() => {
                            const reviewRun = reviewRuns.find((run) => run.prospect_id === prospect.id);
                            if (reviewRun) setReviewModalRunId(reviewRun.id);
                          }}
                        >
                          Review
                        </button>
                      ) : null}
                    </div>
                  </td>`;
source = replaceRequired(source, oldStatusCell, newStatusCell, "Review-table opener");

if (!source.includes("reviewModalBackdrop")) {
  const reviewStartToken = "            {reviewRuns.map((run) => {";
  const reviewEndToken = "\n            })}";
  const reviewStart = source.indexOf(reviewStartToken);
  if (reviewStart === -1) {
    throw new Error("The awaiting-final-review card renderer was not found.");
  }

  const reviewEndStart = source.indexOf(reviewEndToken, reviewStart);
  if (reviewEndStart === -1) {
    throw new Error("The awaiting-final-review card renderer ending was not found.");
  }

  const reviewEnd = reviewEndStart + reviewEndToken.length;
  let reviewBlock = source.slice(reviewStart, reviewEnd);
  reviewBlock = reviewBlock.replace(
    reviewStartToken,
    "            {reviewRuns.filter((run) => run.id === reviewModalRunId).map((run) => {",
  );

  const cardStart = '                <section className={`${styles.card} ${styles.reviewCard}`} key={run.id}>';
  if (!reviewBlock.includes(cardStart)) {
    throw new Error("The awaiting-final-review card opening was not found.");
  }

  reviewBlock = reviewBlock.replace(
    cardStart,
    `                <div
                  className="reviewModalBackdrop"
                  key={run.id}
                  role="presentation"
                  onMouseDown={(event) => {
                    if (event.currentTarget === event.target) setReviewModalRunId(null);
                  }}
                >
                  <div
                    className="reviewModalShell"
                    role="dialog"
                    aria-modal="true"
                    aria-label={\`Awaiting final review · \${run.prospects?.pi_name || "PI"}\`}
                  >
                    <button
                      className="reviewModalClose"
                      type="button"
                      aria-label="Close review"
                      onClick={() => setReviewModalRunId(null)}
                    >
                      ×
                    </button>
                    <section className={\`\${styles.card} \${styles.reviewCard}\`}>`,
  );

  const cardEnd = "                </section>\n              );";
  const cardEndIndex = reviewBlock.lastIndexOf(cardEnd);
  if (cardEndIndex === -1) {
    throw new Error("The awaiting-final-review card closing was not found.");
  }

  reviewBlock = `${reviewBlock.slice(0, cardEndIndex)}                </section>\n                  </div>\n                </div>\n              );${reviewBlock.slice(cardEndIndex + cardEnd.length)}`;
  source = `${source.slice(0, reviewStart)}${reviewBlock}${source.slice(reviewEnd)}`;
}

for (const required of [
  "reviewModalRunId",
  "selectedReviewRun",
  "reviewTableButton",
  "reviewModalBackdrop",
  "reviewModalShell",
  "reviewModalClose",
  'reviewRuns.filter((run) => run.id === reviewModalRunId)',
]) {
  if (!source.includes(required)) {
    throw new Error(`Review modal marker missing: ${required}`);
  }
}

if (source.includes("            {reviewRuns.map((run) => {")) {
  throw new Error("Standalone awaiting-final-review cards are still rendered in the page flow.");
}

fs.writeFileSync(pageUrl, source);
console.log("Awaiting-final-review cards hidden from page flow and opened from table review buttons.");
