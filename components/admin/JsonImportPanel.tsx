"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  analyseSiteImport,
  exampleSiteImport,
  type SiteImportAnalysis,
} from "@/lib/site-import";
import type { LabSite } from "@/lib/sites";

type BulkImportFailure = {
  slug: string;
  message: string;
};

type BulkImportResult = {
  imported: string[];
  failed: BulkImportFailure[];
};

type Props = {
  existingSlugs: string[];
  importing: boolean;
  onImport: (content: LabSite) => Promise<void>;
  onImportMany: (contents: LabSite[]) => Promise<BulkImportResult>;
  seed?: { id: number; text: string; name: string } | null;
};

type ImportState = "ready" | "invalid" | "imported" | "failed";

type ImportItem = {
  id: string;
  fileName: string;
  text: string;
  size: number;
  analysis: SiteImportAnalysis;
  state: ImportState;
  resultMessage: string;
};

const MAX_FILES = 10;
const MAX_FILE_SIZE = 2 * 1024 * 1024;

function syntaxErrorAnalysis(message: string): SiteImportAnalysis {
  return {
    valid: false,
    content: null,
    summary: null,
    issues: [{ severity: "error", path: "$", message }],
  };
}

function clearImportedImages(content: LabSite): LabSite {
  const next = structuredClone(content);
  next.heroImage = "";

  if (next.pages?.home) {
    next.pages.home.topPortrait = "";
    next.pages.home.homepageImage = "";
    next.pages.home.piImage = "";
  }
  if (next.pages?.contact) next.pages.contact.piImage = "";

  next.research = (next.research ?? []).map((project) => ({
    ...project,
    figureImage: "",
  }));
  next.members = (next.members ?? []).map((member) => ({
    ...member,
    image: "",
  }));

  return next;
}

function createId(index: number): string {
  return `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function JsonImportPanel({
  existingSlugs,
  importing,
  onImport,
  onImportMany,
  seed,
}: Props) {
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [items, setItems] = useState<ImportItem[]>([]);
  const [message, setMessage] = useState("");
  const [removeImages, setRemoveImages] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const readyItems = useMemo(
    () => items.filter((item) => item.state === "ready" && item.analysis.valid && item.analysis.content),
    [items],
  );
  const invalidCount = useMemo(
    () => items.filter((item) => item.state === "invalid").length,
    [items],
  );
  const importedCount = useMemo(
    () => items.filter((item) => item.state === "imported").length,
    [items],
  );
  const totalWarnings = useMemo(
    () => items.reduce(
      (total, item) => total + item.analysis.issues.filter((issue) => issue.severity === "warning").length,
      0,
    ),
    [items],
  );

  function analyseEntries(entries: Array<{ fileName: string; text: string; size: number }>): ImportItem[] {
    const reservedSlugs = [...existingSlugs];

    return entries.slice(0, MAX_FILES).map((entry, index) => {
      let analysis: SiteImportAnalysis;
      try {
        const parsed: unknown = JSON.parse(entry.text);
        analysis = analyseSiteImport(parsed, reservedSlugs);
      } catch (error) {
        analysis = syntaxErrorAnalysis(
          error instanceof Error ? error.message : "The file is not valid JSON.",
        );
      }

      const slug = analysis.summary?.slug;
      if (slug) reservedSlugs.push(slug);

      return {
        id: createId(index),
        fileName: entry.fileName,
        text: entry.text,
        size: entry.size,
        analysis,
        state: analysis.valid ? "ready" : "invalid",
        resultMessage: "",
      };
    });
  }

  useEffect(() => {
    if (!seed) return;
    const nextItems = analyseEntries([{
      fileName: seed.name,
      text: seed.text,
      size: new Blob([seed.text]).size,
    }]);
    setItems(nextItems);
    setMessage(
      nextItems[0]?.analysis.valid
        ? "Generated JSON checked automatically and is ready to import."
        : "Generated JSON needs correction before import.",
    );
  // The seed id is the intentional trigger; existing slugs are checked again when files are selected.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed?.id]);

  async function readFiles(fileList: FileList | null) {
    if (!fileList) return;
    const selected = Array.from(fileList);
    if (selected.length === 0) return;

    const limited = selected.slice(0, MAX_FILES);
    const entries: Array<{ fileName: string; text: string; size: number }> = [];

    for (const file of limited) {
      if (!file.name.toLowerCase().endsWith(".json")) {
        entries.push({
          fileName: file.name,
          text: "",
          size: file.size,
        });
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        entries.push({
          fileName: file.name,
          text: "",
          size: file.size,
        });
        continue;
      }
      try {
        entries.push({
          fileName: file.name,
          text: await file.text(),
          size: file.size,
        });
      } catch {
        entries.push({
          fileName: file.name,
          text: "",
          size: file.size,
        });
      }
    }

    const analysed = analyseEntries(entries).map((item, index) => {
      const file = limited[index];
      if (!file.name.toLowerCase().endsWith(".json")) {
        return {
          ...item,
          analysis: syntaxErrorAnalysis("Choose a .json file."),
          state: "invalid" as const,
        };
      }
      if (file.size > MAX_FILE_SIZE) {
        return {
          ...item,
          analysis: syntaxErrorAnalysis("This JSON file is larger than 2 MB."),
          state: "invalid" as const,
        };
      }
      if (!item.text) {
        return {
          ...item,
          analysis: syntaxErrorAnalysis("The selected file could not be read."),
          state: "invalid" as const,
        };
      }
      return item;
    });

    setItems(analysed);
    setMessage(
      selected.length > MAX_FILES
        ? `Only the first ${MAX_FILES} files were loaded. ${selected.length - MAX_FILES} files were not added.`
        : `${analysed.length} JSON file${analysed.length === 1 ? "" : "s"} checked automatically.`,
    );
    if (fileInput.current) fileInput.current.value = "";
  }

  function updateSingleText(value: string) {
    if (items.length !== 1) return;
    const current = items[0];
    const [next] = analyseEntries([{
      fileName: current.fileName,
      text: value,
      size: new Blob([value]).size,
    }]);
    setItems([next]);
    setMessage(next.analysis.valid ? "JSON checked automatically and ready to import." : "JSON needs correction.");
  }

  function removeItem(id: string) {
    const remaining = items.filter((item) => item.id !== id);
    const importedItems = remaining.filter((item) => item.state === "imported");
    const activeItems = remaining.filter((item) => item.state !== "imported");
    const reanalysed = analyseEntries(activeItems.map((item) => ({
      fileName: item.fileName,
      text: item.text,
      size: item.size,
    })));
    setItems([...importedItems, ...reanalysed]);
    setMessage(remaining.length ? `${remaining.length} file${remaining.length === 1 ? "" : "s"} remain.` : "");
  }

  function retryItem(id: string) {
    setItems((current) => current.map((item) => item.id === id && item.analysis.valid
      ? { ...item, state: "ready", resultMessage: "" }
      : item));
    setMessage("The failed file is ready to retry.");
  }

  function clearAll() {
    setItems([]);
    setMessage("");
    if (fileInput.current) fileInput.current.value = "";
  }

  function loadExample() {
    const text = JSON.stringify(exampleSiteImport, null, 2);
    setItems(analyseEntries([{
      fileName: "labnarrative-example.json",
      text,
      size: new Blob([text]).size,
    }]));
    setMessage("Example JSON loaded and checked automatically. Change the slug before importing.");
  }

  function downloadExample() {
    const blob = new Blob([JSON.stringify(exampleSiteImport, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "labnarrative-site-import-example.json";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  function downloadItem(item: ImportItem) {
    const blob = new Blob([item.text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = item.fileName || "labnarrative-site-import.json";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  async function confirmImport() {
    if (readyItems.length === 0 || submitting || importing) return;
    setSubmitting(true);
    setMessage("");

    const prepared = readyItems
      .map((item) => item.analysis.content)
      .filter((content): content is LabSite => Boolean(content))
      .map((content) => removeImages ? clearImportedImages(content) : content);

    try {
      if (prepared.length === 1 && items.length === 1) {
        const slug = readyItems[0].analysis.summary?.slug ?? "draft";
        await onImport(prepared[0]);
        setItems((current) => current.map((item) => item.id === readyItems[0].id
          ? { ...item, state: "imported", resultMessage: `Imported ${slug} as a private Draft.` }
          : item));
        return;
      }

      const result = await onImportMany(prepared);
      const importedSlugs = new Set(result.imported);
      const failures = new Map(result.failed.map((failure) => [failure.slug, failure.message]));

      setItems((current) => current.map((item) => {
        const slug = item.analysis.summary?.slug ?? "";
        if (importedSlugs.has(slug)) {
          return { ...item, state: "imported", resultMessage: "Private Draft created." };
        }
        const failure = failures.get(slug);
        if (failure) {
          return { ...item, state: "failed", resultMessage: failure };
        }
        return item;
      }));

      setMessage(
        `${result.imported.length} private Draft${result.imported.length === 1 ? "" : "s"} created.`
        + (result.failed.length ? ` ${result.failed.length} file${result.failed.length === 1 ? "" : "s"} failed and can be retried.` : ""),
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The private Drafts could not be imported.");
    } finally {
      setSubmitting(false);
    }
  }

  const busy = importing || submitting;

  return (
    <section className="json-import-panel" aria-labelledby="json-import-title">
      <div className="json-import-heading">
        <div>
          <span className="admin-kicker">Multi-file JSON Import</span>
          <h2 id="json-import-title">Create up to 10 private Drafts at once.</h2>
          <p>
            Choose complete LabNarrative JSON files generated in ChatGPT or prepared elsewhere. Files are checked
            automatically, valid files can be imported together, and invalid files never block the rest of the batch.
          </p>
        </div>
        <span className="json-import-version">Format v1 · 10 files</span>
      </div>

      <div className="json-import-actions">
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          multiple
          hidden
          onChange={(event) => void readFiles(event.target.files)}
        />
        <button className="admin-factory-primary" type="button" onClick={() => fileInput.current?.click()} disabled={busy}>
          Choose JSON files
        </button>
        <button className="admin-secondary-button" type="button" onClick={loadExample} disabled={busy}>Load example</button>
        <button className="admin-secondary-button" type="button" onClick={downloadExample}>Download example</button>
        {items.length > 0 && <button className="admin-quiet-button" type="button" onClick={clearAll} disabled={busy}>Clear all</button>}
      </div>

      <div className="json-import-safety-row">
        <label>
          <input
            type="checkbox"
            checked={removeImages}
            onChange={(event) => setRemoveImages(event.target.checked)}
            disabled={busy}
          />
          <span>
            <strong>Keep images manual</strong>
            Clear image URLs during import so portraits and research images can be selected and uploaded later.
          </span>
        </label>
        <p>Every imported website is created as a private Draft. No subdomain is connected.</p>
      </div>

      {items.length > 0 && (
        <div className="json-import-batch-overview" aria-live="polite">
          <div><span>Files</span><strong>{items.length}</strong></div>
          <div><span>Ready</span><strong>{readyItems.length}</strong></div>
          <div><span>Needs correction</span><strong>{invalidCount}</strong></div>
          <div><span>Imported</span><strong>{importedCount}</strong></div>
          <div><span>Warnings</span><strong>{totalWarnings}</strong></div>
        </div>
      )}

      {items.length === 1 && items[0].state !== "imported" && (
        <label className="json-import-textarea">
          <span>JSON content <small>Optional editing; rechecked automatically</small></span>
          <textarea
            value={items[0].text}
            onChange={(event) => updateSingleText(event.target.value)}
            placeholder='{"format":"labnarrative-site","version":1,"site":{…}}'
            spellCheck={false}
          />
        </label>
      )}

      {items.length > 0 && (
        <div className="json-import-file-list">
          {items.map((item) => {
            const errors = item.analysis.issues.filter((issue) => issue.severity === "error");
            const warnings = item.analysis.issues.filter((issue) => issue.severity === "warning");
            const summary = item.analysis.summary;
            return (
              <article className={`json-import-file-card ${item.state}`} key={item.id}>
                <div className="json-import-file-card-heading">
                  <div>
                    <span className={`json-import-file-status ${item.state}`}>
                      {item.state === "ready" && "Ready"}
                      {item.state === "invalid" && "Needs correction"}
                      {item.state === "imported" && "Imported"}
                      {item.state === "failed" && "Failed"}
                    </span>
                    <strong>{item.fileName}</strong>
                    <small>{Math.max(1, Math.round(item.size / 1024))} KB</small>
                  </div>
                  <div className="json-import-file-card-actions">
                    {item.text && <button type="button" onClick={() => downloadItem(item)}>Download</button>}
                    {item.state === "failed" && <button type="button" onClick={() => retryItem(item.id)} disabled={busy}>Retry</button>}
                    {item.state !== "imported" && <button type="button" onClick={() => removeItem(item.id)} disabled={busy}>Remove</button>}
                  </div>
                </div>

                {summary && (
                  <dl className="json-import-file-summary">
                    <div><dt>Slug</dt><dd>{summary.slug || "—"}</dd></div>
                    <div><dt>PI</dt><dd>{summary.piName || "—"}</dd></div>
                    <div><dt>Laboratory</dt><dd>{summary.labName || "—"}</dd></div>
                    <div><dt>Research</dt><dd>{summary.researchCount}</dd></div>
                    <div><dt>Publications</dt><dd>{summary.publicationCount}</dd></div>
                    <div><dt>Members</dt><dd>{summary.memberCount}</dd></div>
                  </dl>
                )}

                {(errors.length > 0 || warnings.length > 0) && (
                  <details className="json-import-file-issues" open={errors.length > 0}>
                    <summary>{errors.length} errors · {warnings.length} warnings</summary>
                    <div>
                      {[...errors, ...warnings].map((issue, index) => (
                        <p className={issue.severity} key={`${issue.path}-${index}`}>
                          <span>{issue.severity}</span>
                          <code>{issue.path}</code>
                          {issue.message}
                        </p>
                      ))}
                    </div>
                  </details>
                )}

                {item.resultMessage && <p className="json-import-file-result">{item.resultMessage}</p>}
              </article>
            );
          })}
        </div>
      )}

      {readyItems.length > 0 && (
        <div className="json-import-confirm json-import-bulk-confirm">
          <div>
            <strong>Create {readyItems.length} private Draft{readyItems.length === 1 ? "" : "s"}</strong>
            <span>Automatic checking is complete. Invalid files will not be imported.</span>
          </div>
          <button className="admin-factory-primary" type="button" onClick={() => void confirmImport()} disabled={busy}>
            {busy
              ? "Importing…"
              : readyItems.length === 1
                ? "Import private Draft"
                : `Import ${readyItems.length} private Drafts`}
          </button>
        </div>
      )}

      {items.length === 0 && (
        <div className="json-import-empty-state">
          <strong>Select 1–10 JSON files.</strong>
          <span>The files will be checked immediately; there is no separate validation step.</span>
        </div>
      )}

      {message && <p className="json-import-message" role="status" aria-live="polite">{message}</p>}
    </section>
  );
}
