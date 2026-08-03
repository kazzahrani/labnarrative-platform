"use client";

import { useMemo, useRef, useState } from "react";
import {
  analyseSiteImport,
  exampleSiteImport,
  type SiteImportAnalysis,
} from "@/lib/site-import";
import type { LabSite } from "@/lib/sites";

type Props = {
  existingSlugs: string[];
  importing: boolean;
  onImport: (content: LabSite) => Promise<void>;
};

const MAX_FILE_SIZE = 2 * 1024 * 1024;

export default function JsonImportPanel({ existingSlugs, importing, onImport }: Props) {
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [jsonText, setJsonText] = useState("");
  const [fileName, setFileName] = useState("");
  const [analysis, setAnalysis] = useState<SiteImportAnalysis | null>(null);
  const [message, setMessage] = useState("");

  const errorCount = useMemo(
    () => analysis?.issues.filter((item) => item.severity === "error").length ?? 0,
    [analysis],
  );
  const warningCount = useMemo(
    () => analysis?.issues.filter((item) => item.severity === "warning").length ?? 0,
    [analysis],
  );

  function resetResult() {
    setAnalysis(null);
    setMessage("");
  }

  function updateText(value: string, name = "") {
    setJsonText(value);
    setFileName(name);
    resetResult();
  }

  async function readFile(file?: File) {
    if (!file) return;
    setMessage("");
    if (!file.name.toLowerCase().endsWith(".json")) {
      setAnalysis(null);
      setMessage("Choose a .json file.");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setAnalysis(null);
      setMessage("The JSON file is larger than 2 MB. Split unusually large imports before continuing.");
      return;
    }
    try {
      updateText(await file.text(), file.name);
    } catch {
      setMessage("The selected file could not be read.");
    }
  }

  function validate() {
    setMessage("");
    if (!jsonText.trim()) {
      setAnalysis(null);
      setMessage("Upload a JSON file or paste JSON before validating.");
      return;
    }
    try {
      const parsed: unknown = JSON.parse(jsonText);
      const nextAnalysis = analyseSiteImport(parsed, existingSlugs);
      setAnalysis(nextAnalysis);
      setMessage(nextAnalysis.valid
        ? "Validation passed. Review the import report before creating the draft."
        : "Validation found errors. Correct them and validate again.");
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Invalid JSON syntax.";
      setAnalysis({
        valid: false,
        content: null,
        summary: null,
        issues: [{ severity: "error", path: "$", message: detail }],
      });
      setMessage("The file is not valid JSON.");
    }
  }

  async function confirmImport() {
    if (!analysis?.valid || !analysis.content) return;
    setMessage("");
    try {
      await onImport(analysis.content);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The draft could not be imported.");
    }
  }

  function loadExample() {
    updateText(JSON.stringify(exampleSiteImport, null, 2), "labnarrative-example.json");
    setMessage("Example JSON loaded. Change the slug and content before importing.");
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

  return (
    <section className="json-import-panel" aria-labelledby="json-import-title">
      <div className="json-import-heading">
        <div>
          <span className="admin-kicker">JSON Import</span>
          <h2 id="json-import-title">Create a complete private draft from one file.</h2>
          <p>
            The importer validates identity, design, page content, research programmes, publications,
            members, opportunities, image URLs, colors, and duplicate slugs before Supabase is changed.
          </p>
        </div>
        <span className="json-import-version">Format v1</span>
      </div>

      <div className="json-import-actions">
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(event) => void readFile(event.target.files?.[0])}
        />
        <button className="admin-factory-primary" type="button" onClick={() => fileInput.current?.click()}>
          Choose JSON file
        </button>
        <button className="admin-secondary-button" type="button" onClick={loadExample}>Load example</button>
        <button className="admin-secondary-button" type="button" onClick={downloadExample}>Download example</button>
        {jsonText && <button className="admin-quiet-button" type="button" onClick={() => updateText("")}>Clear</button>}
      </div>

      {fileName && <p className="json-import-file"><strong>Loaded:</strong> {fileName}</p>}

      <label className="json-import-textarea">
        <span>JSON content</span>
        <textarea
          value={jsonText}
          onChange={(event) => updateText(event.target.value, fileName)}
          placeholder='{"format":"labnarrative-site","version":1,"site":{…}}'
          spellCheck={false}
        />
      </label>

      <div className="json-import-validation-row">
        <button className="admin-primary-button" type="button" onClick={validate} disabled={!jsonText.trim() || importing}>
          Validate import
        </button>
        <span>Nothing is saved during validation.</span>
      </div>

      {analysis && (
        <div className={`json-import-report ${analysis.valid ? "valid" : "invalid"}`}>
          <div className="json-import-report-heading">
            <div>
              <span>{analysis.valid ? "Ready to import" : "Needs correction"}</span>
              <strong>{errorCount} errors · {warningCount} warnings</strong>
            </div>
            {analysis.summary && <code>{analysis.summary.slug || "missing-slug"}</code>}
          </div>

          {analysis.summary && (
            <dl className="json-import-summary">
              <div><dt>Laboratory</dt><dd>{analysis.summary.labName || "—"}</dd></div>
              <div><dt>PI</dt><dd>{analysis.summary.piName || "—"}</dd></div>
              <div><dt>Design</dt><dd>{analysis.summary.template}</dd></div>
              <div><dt>Research</dt><dd>{analysis.summary.researchCount}</dd></div>
              <div><dt>Publications</dt><dd>{analysis.summary.publicationCount}</dd></div>
              <div><dt>Members</dt><dd>{analysis.summary.memberCount}</dd></div>
              <div><dt>Opportunities</dt><dd>{analysis.summary.opportunityCount}</dd></div>
              <div><dt>Image URLs</dt><dd>{analysis.summary.imageCount}</dd></div>
            </dl>
          )}

          {analysis.issues.length > 0 && (
            <div className="json-import-issues">
              {analysis.issues.map((item, index) => (
                <div className={item.severity} key={`${item.path}-${index}`}>
                  <span>{item.severity}</span>
                  <code>{item.path}</code>
                  <p>{item.message}</p>
                </div>
              ))}
            </div>
          )}

          {analysis.valid && analysis.content && (
            <div className="json-import-confirm">
              <div>
                <strong>Create as a private Draft</strong>
                <span>No subdomain will be connected and nothing will become public.</span>
              </div>
              <button className="admin-factory-primary" type="button" onClick={() => void confirmImport()} disabled={importing}>
                {importing ? "Importing…" : "Import draft into LabNarrative"}
              </button>
            </div>
          )}
        </div>
      )}

      {message && <p className="json-import-message" role="status" aria-live="polite">{message}</p>}
    </section>
  );
}
