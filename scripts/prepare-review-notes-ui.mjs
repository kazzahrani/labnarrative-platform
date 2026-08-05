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
  '      setRuns((runResult.data ?? []) as unknown as ProductionRun[]);\n',
  `      const loadedRuns = (runResult.data ?? []) as unknown as ProductionRun[];
      setRuns(loadedRuns);
      setRevisionText((current) => {
        const next = { ...current };
        loadedRuns.forEach((run) => {
          if (!(run.id in next)) next[run.id] = run.revision_request || "";
        });
        return next;
      });
`,
  "review-note loading",
);

if (!source.includes("const collectedRevisionNotes = useMemo")) {
  const countsToken = "  const counts = useMemo";
  if (!source.includes(countsToken)) throw new Error("Review-note summary insertion point was not found.");

  const collectedNotes = `  const collectedRevisionNotes = useMemo(
    () => reviewRuns
      .map((run) => ({
        name: run.prospects?.pi_name?.trim() || "Unnamed PI",
        note: (run.revision_request || "").trim(),
      }))
      .filter((item) => item.note)
      .map((item) => \`\${item.name}: \${item.note}\`)
      .join("\\n"),
    [reviewRuns],
  );

`;

  source = source.replace(countsToken, `${collectedNotes}${countsToken}`);
}

if (!source.includes("async function saveReviewNote(runId: string)")) {
  const functionToken = "  function updateMessage(id: string, patch: Partial<OutreachMessage>) {";
  if (!source.includes(functionToken)) throw new Error("Review-note function insertion point was not found.");

  const functions = `  async function saveReviewNote(runId: string) {
    const note = (revisionText[runId] || "").trim();
    setWorking(true);
    setNotice("");
    setNoticeError(false);

    try {
      const { error } = await supabase
        .from("production_runs")
        .update({ revision_request: note })
        .eq("id", runId);
      if (error) throw error;

      setRuns((current) => current.map((run) => (
        run.id === runId ? { ...run, revision_request: note } : run
      )));
      setRevisionText((current) => ({ ...current, [runId]: note }));
      setNotice(note ? "Issue note saved." : "Issue note cleared.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The issue note could not be saved.");
      setNoticeError(true);
    } finally {
      setWorking(false);
    }
  }

  async function copyRevisionNotes() {
    if (!collectedRevisionNotes) return;

    try {
      await navigator.clipboard.writeText(collectedRevisionNotes);
      setNotice("All saved issue notes were copied.");
      setNoticeError(false);
    } catch {
      setNotice("The notes could not be copied automatically.");
      setNoticeError(true);
    }
  }

`;

  source = source.replace(functionToken, `${functions}${functionToken}`);
}

const oldRevisionField = '                  <div className={styles.revisionBox}><textarea rows={3} value={revisionText[run.id] || ""} onChange={(event) => setRevisionText((current) => ({ ...current, [run.id]: event.target.value }))} placeholder="Revision instruction, for example: replace project 2 image and shorten the biography." /></div>\n';
const newRevisionField = `                  <div className={\`\${styles.revisionBox} reviewIssueNote\`}>
                    <label>
                      <span>Issue note</span>
                      <input
                        value={revisionText[run.id] || ""}
                        onChange={(event) => setRevisionText((current) => ({ ...current, [run.id]: event.target.value }))}
                        placeholder="Example: PI photo missing"
                      />
                    </label>
                    <button className={styles.buttonSecondary} type="button" disabled={working} onClick={() => void saveReviewNote(run.id)}>Save note</button>
                  </div>
`;
source = replaceRequired(source, oldRevisionField, newRevisionField, "one-line issue note");

source = source.replace(
  /^\s*<button className=\{styles\.buttonSecondary\} type="button" disabled=\{working \|\| !\(revisionText\[run\.id\] \|\| ""\)\.trim\(\)\} onClick=\{\(\) => void invokeWorker\("request_revision", \{ runId: run\.id, instruction: revisionText\[run\.id\] \}\)\}>Request changes<\/button>\n/m,
  "",
);

if (!source.includes("reviewNotesCollector")) {
  const modalToken = "\n      {prospectModal ? (";
  if (!source.includes(modalToken)) throw new Error("Collected-note box insertion point was not found.");

  const collector = `
      <section className={\`\${styles.card} reviewNotesCollector\`}>
        <div className={styles.cardHeader}>
          <div>
            <p className={styles.kicker}>Review summary</p>
            <h2>Collected issue notes</h2>
            <p className={styles.muted}>Each saved note begins with the PI name and is ready to paste into ChatGPT.</p>
          </div>
          <button className={styles.buttonSecondary} type="button" disabled={!collectedRevisionNotes} onClick={() => void copyRevisionNotes()}>Copy all</button>
        </div>
        <textarea
          aria-label="Collected issue notes"
          readOnly
          rows={8}
          value={collectedRevisionNotes}
          placeholder="Saved issue notes will appear here."
        />
      </section>
`;

  source = source.replace(modalToken, `${collector}${modalToken}`);
}

if (source.includes("Request changes")) {
  throw new Error("The old Request changes action is still present.");
}
if (source.includes("Revision instruction, for example")) {
  throw new Error("The old revision-instruction field is still present.");
}
if (!source.includes("Save note")) {
  throw new Error("The Save note control was not added.");
}
if (!source.includes("Collected issue notes")) {
  throw new Error("The collected issue-notes box was not added.");
}
if (!source.includes("navigator.clipboard.writeText(collectedRevisionNotes)")) {
  throw new Error("The Copy all action was not added.");
}

fs.writeFileSync(pageUrl, source);
console.log("Review instructions converted to saved issue notes with a copy-all summary.");
