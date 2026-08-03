"use client";

import { createClient } from "@supabase/supabase-js";
import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";

type SourceItem = {
  url: string;
  title?: string;
};

type GenerationResponse = {
  ok?: boolean;
  importData?: unknown;
  sources?: SourceItem[];
  warnings?: string[];
  model?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  };
  costEstimate?: {
    currency?: string;
    inputCost?: number;
    outputCost?: number;
    webSearchCost?: number;
    totalCost?: number;
    webSearchCalls?: number;
    note?: string;
  };
  quality?: {
    score?: number;
    label?: string;
    sourceCount?: number;
    publicationCount?: number;
    opportunityCount?: number;
    memberCount?: number;
    hasProfileImage?: boolean;
    hasVerifiedEmail?: boolean;
  };
  error?: string;
  setupRequired?: boolean;
};

type BatchStatus = "pending" | "generating" | "ready" | "failed" | "skipped";

type BatchRow = {
  id: string;
  piName: string;
  institution: string;
  profileUrl: string;
  country: string;
  slug: string;
  notes: string;
  status: BatchStatus;
  message: string;
  attempts: number;
  jsonText: string;
  fileName: string;
  qualityScore?: number;
  qualityLabel?: string;
  cost?: number;
  sourceCount?: number;
  publicationCount?: number;
  opportunityCount?: number;
  warnings?: string[];
  durationSeconds?: number;
};

type PersistedBatch = {
  rows: BatchRow[];
  planningCost: number;
  budgetCap: number;
  runLimit: number;
  updatedAt: string;
};

type Props = {
  existingSlugs: string[];
  onGenerated: (jsonText: string, fileName: string) => void;
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const DB_NAME = "labnarrative-batch-factory";
const DB_VERSION = 1;
const STORE_NAME = "state";
const CURRENT_KEY = "current";

function cleanSlug(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
}

function suggestedSlug(name: string): string {
  return cleanSlug(
    name
      .replace(/\b(professor|prof|doctor|dr|associate|assistant)\.?\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}


type MutableRecord = Record<string, unknown>;

function isRecord(value: unknown): value is MutableRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function textValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function ensureRecord(parent: MutableRecord, key: string): MutableRecord {
  const current = parent[key];
  if (isRecord(current)) return current;
  const created: MutableRecord = {};
  parent[key] = created;
  return created;
}

function fallbackLabName(piName: string): string {
  const cleaned = piName
    .replace(/\b(professor|prof|doctor|dr|associate|assistant)\.?\b/gi, " ")
    .split(",")[0]
    .replace(/\s+/g, " ")
    .trim();
  const surname = cleaned.split(" ").filter(Boolean).at(-1) || "Research";
  return `${surname} Lab`;
}

function supportedLink(value: unknown): string {
  const text = textValue(value);
  if (!text) return "";
  if (text.startsWith("/") || text.startsWith("#")) return text;
  try {
    const parsed = new URL(text);
    return ["http:", "https:", "mailto:"].includes(parsed.protocol) ? text : "";
  } catch {
    return "";
  }
}

function normalizedColor(value: unknown, fallback: string): string {
  const text = textValue(value).toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(text)) return text;
  if (/^#[0-9a-f]{3}$/.test(text)) {
    return `#${text.slice(1).split("").map((character) => character.repeat(2)).join("")}`;
  }
  const embedded = text.match(/#[0-9a-f]{6}/)?.[0];
  return embedded || fallback;
}

function normalizeGeneratedImportData(input: unknown, requestedPiName: string): unknown {
  if (!isRecord(input)) return input;

  const clone = JSON.parse(JSON.stringify(input)) as MutableRecord;
  const site = isRecord(clone.site) ? clone.site : clone;
  const identity = ensureRecord(site, "identity");
  const contact = ensureRecord(site, "contact");
  const pages = ensureRecord(site, "pages");
  const home = ensureRecord(pages, "home");
  const contactPage = ensureRecord(pages, "contact");

  const piName = textValue(site.piName) || textValue(identity.piName) || requestedPiName.trim();
  if (piName) {
    site.piName = piName;
    identity.piName = piName;
  }

  const labName = textValue(site.labName)
    || textValue(identity.labName)
    || textValue(home.footerLabName)
    || fallbackLabName(piName || requestedPiName);
  site.labName = labName;
  identity.labName = labName;
  if (!textValue(home.footerLabName)) home.footerLabName = labName;

  const profileFallback = supportedLink(contact.profileUrl)
    || supportedLink(site.profileUrl)
    || supportedLink(identity.profileUrl);
  contactPage.officialProfile = supportedLink(contactPage.officialProfile) || profileFallback;

  // Images are deliberately selected and uploaded manually by the LabNarrative editor.
  site.heroImage = "";
  for (const field of ["topPortrait", "homepageImage", "piImage"]) home[field] = "";
  contactPage.piImage = "";
  if (Array.isArray(site.research)) {
    site.research = site.research.map((item) => isRecord(item) ? { ...item, figureImage: "" } : item);
  }
  if (Array.isArray(site.members)) {
    site.members = site.members.map((item) => isRecord(item) ? { ...item, image: "" } : item);
  }

  const theme = ensureRecord(site, "theme");
  theme.background = normalizedColor(theme.background, "#f8f8f5");
  theme.surface = normalizedColor(theme.surface, "#ffffff");
  theme.foreground = normalizedColor(theme.foreground, "#132d3a");
  theme.muted = normalizedColor(theme.muted, "#647178");
  theme.accent = normalizedColor(theme.accent, "#117b79");

  return clone;
}

function uniqueSlug(baseValue: string, used: Set<string>): string {
  const base = cleanSlug(baseValue) || "pi-concept";
  let candidate = base;
  let index = 2;
  while (used.has(candidate)) {
    const suffix = `-${index}`;
    candidate = `${base.slice(0, Math.max(1, 63 - suffix.length))}${suffix}`;
    index += 1;
  }
  used.add(candidate);
  return candidate;
}

function makeId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function detectDelimiter(line: string): string {
  const candidates = ["\t", ",", ";"];
  return candidates
    .map((delimiter) => ({ delimiter, count: line.split(delimiter).length - 1 }))
    .sort((a, b) => b.count - a.count)[0]?.delimiter || ",";
}

function parseDelimited(text: string): string[][] {
  const source = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const firstLine = source.split("\n")[0] || "";
  const delimiter = detectDelimiter(firstLine);
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];

    if (character === '"') {
      if (quoted && next === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (!quoted && character === delimiter) {
      row.push(value.trim());
      value = "";
      continue;
    }

    if (!quoted && character === "\n") {
      row.push(value.trim());
      if (row.some((cell) => cell)) rows.push(row);
      row = [];
      value = "";
      continue;
    }

    value += character;
  }

  row.push(value.trim());
  if (row.some((cell) => cell)) rows.push(row);
  return rows;
}

function normalizedHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function headerIndex(headers: string[], options: string[]): number {
  const normalized = headers.map(normalizedHeader);
  return normalized.findIndex((header) => options.includes(header));
}

function rowsFromText(text: string, existingSlugs: string[]): BatchRow[] {
  const table = parseDelimited(text);
  if (table.length < 2) throw new Error("Add a header row and at least one PI record.");

  const headers = table[0];
  const piIndex = headerIndex(headers, ["piname", "pi", "name", "principalinvestigator"]);
  const institutionIndex = headerIndex(headers, ["institution", "university", "organisation", "organization", "affiliation"]);
  const profileIndex = headerIndex(headers, ["profileurl", "officialprofileurl", "profile", "url"]);
  const countryIndex = headerIndex(headers, ["country", "location"]);
  const slugIndex = headerIndex(headers, ["slug", "conceptslug", "subdomain"]);
  const notesIndex = headerIndex(headers, ["notes", "editorialdirection", "direction"]);

  if (piIndex < 0 || institutionIndex < 0) {
    throw new Error("The table must include PI name and institution columns.");
  }

  const used = new Set(existingSlugs.map(cleanSlug));
  const result: BatchRow[] = [];

  for (const cells of table.slice(1)) {
    const piName = (cells[piIndex] || "").trim();
    const institution = (cells[institutionIndex] || "").trim();
    if (!piName && !institution) continue;
    if (!piName || !institution) {
      result.push({
        id: makeId(),
        piName,
        institution,
        profileUrl: profileIndex >= 0 ? (cells[profileIndex] || "").trim() : "",
        country: countryIndex >= 0 ? (cells[countryIndex] || "").trim() : "",
        slug: "",
        notes: notesIndex >= 0 ? (cells[notesIndex] || "").trim() : "",
        status: "failed",
        message: "PI name and institution are both required.",
        attempts: 0,
        jsonText: "",
        fileName: "",
      });
      continue;
    }

    const requestedSlug = slugIndex >= 0 ? (cells[slugIndex] || "").trim() : "";
    const slug = uniqueSlug(requestedSlug || suggestedSlug(piName), used);
    result.push({
      id: makeId(),
      piName,
      institution,
      profileUrl: profileIndex >= 0 ? (cells[profileIndex] || "").trim() : "",
      country: countryIndex >= 0 ? (cells[countryIndex] || "").trim() : "",
      slug,
      notes: notesIndex >= 0 ? (cells[notesIndex] || "").trim() : "",
      status: "pending",
      message: "Ready for research.",
      attempts: 0,
      jsonText: "",
      fileName: "",
    });
  }

  if (result.length === 0) throw new Error("No PI records were found in the table.");
  return result;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Browser storage could not be opened."));
  });
}

async function loadPersistedBatch(): Promise<PersistedBatch | null> {
  if (typeof indexedDB === "undefined") return null;
  const database = await openDatabase();
  return await new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(CURRENT_KEY);
    request.onsuccess = () => resolve((request.result as PersistedBatch | undefined) ?? null);
    request.onerror = () => reject(request.error || new Error("Saved batch could not be read."));
    transaction.oncomplete = () => database.close();
  });
}

async function savePersistedBatch(state: PersistedBatch): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(state, CURRENT_KEY);
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => reject(transaction.error || new Error("Batch progress could not be saved."));
  });
}

async function clearPersistedBatch(): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(CURRENT_KEY);
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => reject(transaction.error || new Error("Saved batch could not be cleared."));
  });
}

function downloadText(content: string, fileName: string, type = "application/json"): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function templateCsv(): string {
  return [
    "pi_name,institution,profile_url,country,slug,notes",
    '"Dr Example Scientist","Example University","https://example.edu/profile","Country","example-scientist","Emphasise translational research."',
  ].join("\n");
}

function statusLabel(status: BatchStatus): string {
  if (status === "generating") return "Researching";
  if (status === "ready") return "Ready";
  if (status === "failed") return "Failed";
  if (status === "skipped") return "Skipped";
  return "Pending";
}

export default function BatchConceptFactoryPanel({ existingSlugs, onGenerated }: Props) {
  const fileInput = useRef<HTMLInputElement | null>(null);
  const pauseRequested = useRef(false);
  const [sourceText, setSourceText] = useState("");
  const [rows, setRows] = useState<BatchRow[]>([]);
  const [message, setMessage] = useState("");
  const [running, setRunning] = useState(false);
  const [planningCost, setPlanningCost] = useState(0.1);
  const [budgetCap, setBudgetCap] = useState(1);
  const [runLimit, setRunLimit] = useState(5);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    let active = true;
    void loadPersistedBatch()
      .then((saved) => {
        if (!active || !saved) return;
        const safeRows = saved.rows.map((row) => row.status === "generating"
          ? { ...row, status: "pending" as const, message: "Previous browser session ended before completion. Ready to retry." }
          : row);
        setRows(safeRows);
        setPlanningCost(saved.planningCost || 0.1);
        setBudgetCap(saved.budgetCap || 1);
        setRunLimit(saved.runLimit || 5);
        setMessage(`Restored ${safeRows.length} batch records from this browser.`);
      })
      .catch(() => setMessage("Saved batch progress could not be restored, but new batches can still be created."))
      .finally(() => {
        if (active) setRestored(true);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!restored) return;
    const timeout = window.setTimeout(() => {
      void savePersistedBatch({
        rows,
        planningCost,
        budgetCap,
        runLimit,
        updatedAt: new Date().toISOString(),
      }).catch(() => undefined);
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [rows, planningCost, budgetCap, runLimit, restored]);

  const readyRows = useMemo(() => rows.filter((row) => row.status === "ready"), [rows]);
  const pendingRows = useMemo(() => rows.filter((row) => row.status === "pending"), [rows]);
  const failedRows = useMemo(() => rows.filter((row) => row.status === "failed"), [rows]);
  const completedCost = useMemo(
    () => rows.reduce((total, row) => total + (typeof row.cost === "number" ? row.cost : 0), 0),
    [rows],
  );
  const observedAverage = readyRows.length > 0 ? completedCost / readyRows.length : 0;
  const forecastRate = observedAverage || planningCost;
  const projectedTotal = rows.filter((row) => row.status !== "skipped").length * forecastRate;

  async function readFile(file?: File) {
    if (!file) return;
    try {
      const text = await file.text();
      setSourceText(text);
      setMessage(`Loaded ${file.name}. Review it, then click Prepare batch.`);
    } catch {
      setMessage("The selected batch file could not be read.");
    }
  }

  function prepareBatch() {
    try {
      const prepared = rowsFromText(sourceText, existingSlugs);
      setRows(prepared);
      setMessage(`Prepared ${prepared.length} PI records. Nothing has been researched or saved to Supabase yet.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The PI table could not be parsed.");
    }
  }

  async function invokeGenerator(row: BatchRow): Promise<GenerationResponse> {
    const { data, error } = await supabase.functions.invoke("generate-pi-concept", {
      body: {
        piName: row.piName.trim(),
        institution: row.institution.trim(),
        profileUrl: row.profileUrl.trim(),
        country: row.country.trim(),
        slug: row.slug,
        notes: [row.notes.trim(), "Images will be selected and uploaded manually by the LabNarrative editor. Leave all image fields empty."].filter(Boolean).join("\n"),
      },
    });

    if (error) {
      let detail = error.message;
      const context = (error as { context?: Response }).context;
      if (context) {
        try {
          const body = await context.clone().json() as GenerationResponse;
          detail = body.error || detail;
          if (body.setupRequired) detail = `${detail} Check the OPENAI_API_KEY secret in Supabase.`;
        } catch {
          // Keep Supabase's message when the response is not JSON.
        }
      }
      throw new Error(detail);
    }

    const result = (data ?? {}) as GenerationResponse;
    if (!result.ok || !result.importData) throw new Error(result.error || "No import package was returned.");
    return result;
  }

  async function runBatch() {
    if (running) return;
    pauseRequested.current = false;
    setRunning(true);
    setMessage("Batch generation started. Keep this browser tab open; progress is saved locally after each PI.");

    const working = rows.map((row) => ({ ...row }));
    let generatedThisRun = 0;
    let costSoFar = working.reduce((total, row) => total + (row.cost || 0), 0);
    let observedCount = working.filter((row) => row.status === "ready" && typeof row.cost === "number").length;

    try {
      for (let index = 0; index < working.length; index += 1) {
        const row = working[index];
        if (pauseRequested.current) break;
        if (generatedThisRun >= Math.max(1, runLimit)) break;
        if (row.status !== "pending") continue;

        const currentRate = observedCount > 0 ? costSoFar / observedCount : planningCost;
        if (budgetCap > 0 && costSoFar + currentRate > budgetCap + 0.000001) {
          setMessage(`Paused before ${row.piName}: the next estimated run would exceed the $${budgetCap.toFixed(2)} batch cap.`);
          break;
        }

        row.status = "generating";
        row.message = "Researching current sources and writing the website JSON…";
        row.attempts += 1;
        setRows([...working]);
        const startedAt = Date.now();

        try {
          const result = await invokeGenerator(row);
          const normalizedImportData = normalizeGeneratedImportData(result.importData, row.piName);
          row.jsonText = JSON.stringify(normalizedImportData, null, 2);
          row.fileName = `${row.slug}-labnarrative-import.json`;
          row.status = "ready";
          row.qualityScore = result.quality?.score;
          row.qualityLabel = result.quality?.label;
          row.cost = result.costEstimate?.totalCost;
          row.sourceCount = result.sources?.length ?? result.quality?.sourceCount;
          row.publicationCount = result.quality?.publicationCount;
          row.opportunityCount = result.quality?.opportunityCount;
          row.warnings = result.warnings ?? [];
          row.durationSeconds = Math.round((Date.now() - startedAt) / 1000);
          row.message = "Generated and ready for human validation.";
          if (typeof row.cost === "number") {
            costSoFar += row.cost;
            observedCount += 1;
          }
        } catch (error) {
          row.status = "failed";
          row.durationSeconds = Math.round((Date.now() - startedAt) / 1000);
          row.message = error instanceof Error ? error.message : "Generation failed.";
        }

        generatedThisRun += 1;
        setRows([...working]);
        await savePersistedBatch({
          rows: working,
          planningCost,
          budgetCap,
          runLimit,
          updatedAt: new Date().toISOString(),
        }).catch(() => undefined);
      }

      if (pauseRequested.current) {
        setMessage("Batch paused after the current PI. Click Resume batch when ready.");
      } else if (working.every((row) => row.status !== "pending")) {
        setMessage("Batch run finished. Review each ready concept before importing it as a private Draft.");
      } else if (generatedThisRun >= Math.max(1, runLimit)) {
        setMessage(`Run limit reached after ${generatedThisRun} concept${generatedThisRun === 1 ? "" : "s"}. Review the results, then resume.`);
      }
    } finally {
      setRunning(false);
      pauseRequested.current = false;
    }
  }

  function pauseBatch() {
    pauseRequested.current = true;
    setMessage("Pause requested. The current PI will finish, then the batch will stop.");
  }

  function retryRow(id: string) {
    setRows((current) => current.map((row) => row.id === id
      ? { ...row, status: "pending", message: "Ready to retry.", jsonText: "", fileName: "" }
      : row));
  }

  function skipRow(id: string) {
    setRows((current) => current.map((row) => row.id === id
      ? { ...row, status: "skipped", message: "Skipped by administrator." }
      : row));
  }

  function restoreRow(id: string) {
    setRows((current) => current.map((row) => row.id === id
      ? { ...row, status: "pending", message: "Ready for research." }
      : row));
  }

  function removeRow(id: string) {
    setRows((current) => current.filter((row) => row.id !== id));
  }

  function normalizedRowJson(row: BatchRow): string {
    if (!row.jsonText) return "";
    try {
      return JSON.stringify(normalizeGeneratedImportData(JSON.parse(row.jsonText), row.piName), null, 2);
    } catch {
      return row.jsonText;
    }
  }

  function loadIntoValidator(row: BatchRow) {
    const jsonText = normalizedRowJson(row);
    if (!jsonText) return;
    onGenerated(jsonText, row.fileName || `${row.slug}-labnarrative-import.json`);
    window.setTimeout(() => document.querySelector(".json-import-panel")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  function downloadBatchArchive() {
    const archive = {
      format: "labnarrative-concept-batch",
      version: 1,
      exportedAt: new Date().toISOString(),
      completedCost,
      concepts: readyRows.map((row) => ({
        piName: row.piName,
        institution: row.institution,
        slug: row.slug,
        qualityScore: row.qualityScore,
        qualityLabel: row.qualityLabel,
        cost: row.cost,
        warnings: row.warnings,
        importData: JSON.parse(normalizedRowJson(row)),
      })),
    };
    downloadText(JSON.stringify(archive, null, 2), `labnarrative-batch-${new Date().toISOString().slice(0, 10)}.json`);
  }

  async function clearBatch() {
    if (running) return;
    setRows([]);
    setSourceText("");
    setMessage("Batch cleared from this browser.");
    await clearPersistedBatch().catch(() => undefined);
  }

  return (
    <section className="batch-factory-panel" aria-labelledby="batch-factory-title">
      <div className="batch-factory-heading">
        <div>
          <span className="admin-kicker">Controlled batch production</span>
          <h2 id="batch-factory-title">Generate a reviewed pipeline of PI concepts.</h2>
          <p>
            Upload a CSV exported from Excel, run concepts sequentially, pause safely, and load each completed JSON
            into the existing validator. Images remain empty for manual selection and placement.
          </p>
        </div>
        <span className="batch-factory-badge">No automatic import</span>
      </div>

      <div className="batch-factory-intake">
        <input
          ref={fileInput}
          type="file"
          accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
          hidden
          onChange={(event: ChangeEvent<HTMLInputElement>) => void readFile(event.target.files?.[0])}
        />
        <div className="batch-factory-actions">
          <button className="admin-factory-primary" type="button" onClick={() => fileInput.current?.click()} disabled={running}>
            Choose PI list
          </button>
          <button className="admin-secondary-button" type="button" onClick={() => downloadText(templateCsv(), "labnarrative-pi-batch-template.csv", "text/csv")}>
            Download CSV template
          </button>
          {rows.length > 0 && (
            <button className="admin-quiet-button" type="button" onClick={() => void clearBatch()} disabled={running}>
              Clear batch
            </button>
          )}
        </div>

        <label className="batch-factory-source">
          <span>Paste CSV or Excel table</span>
          <textarea
            value={sourceText}
            onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setSourceText(event.target.value)}
            placeholder={templateCsv()}
            rows={6}
            spellCheck={false}
            disabled={running}
          />
        </label>

        <button className="admin-primary-button" type="button" onClick={prepareBatch} disabled={!sourceText.trim() || running}>
          Prepare batch
        </button>
      </div>

      {rows.length > 0 && (
        <>
          <div className="batch-factory-controls">
            <label>
              <span>Planning estimate per concept</span>
              <div><span>$</span><input type="number" min="0.01" max="10" step="0.01" value={planningCost} onChange={(event: ChangeEvent<HTMLInputElement>) => setPlanningCost(Math.max(0.01, Number(event.target.value) || 0.01))} disabled={running} /></div>
            </label>
            <label>
              <span>Batch spending cap</span>
              <div><span>$</span><input type="number" min="0" max="1000" step="0.25" value={budgetCap} onChange={(event: ChangeEvent<HTMLInputElement>) => setBudgetCap(Math.max(0, Number(event.target.value) || 0))} disabled={running} /></div>
            </label>
            <label>
              <span>Maximum concepts this run</span>
              <input type="number" min="1" max="100" step="1" value={runLimit} onChange={(event: ChangeEvent<HTMLInputElement>) => setRunLimit(Math.max(1, Math.floor(Number(event.target.value) || 1)))} disabled={running} />
            </label>
            <div className="batch-factory-run-actions">
              {running ? (
                <button className="admin-secondary-button" type="button" onClick={pauseBatch}>Pause after current PI</button>
              ) : (
                <button className="admin-factory-primary" type="button" onClick={() => void runBatch()} disabled={pendingRows.length === 0}>
                  {readyRows.length > 0 ? "Resume batch" : "Start batch"}
                </button>
              )}
            </div>
          </div>

          <dl className="batch-factory-summary">
            <div><dt>Total</dt><dd>{rows.length}</dd></div>
            <div><dt>Pending</dt><dd>{pendingRows.length}</dd></div>
            <div><dt>Ready</dt><dd>{readyRows.length}</dd></div>
            <div><dt>Failed</dt><dd>{failedRows.length}</dd></div>
            <div><dt>Spent</dt><dd>${completedCost.toFixed(4)}</dd></div>
            <div><dt>Projected</dt><dd>${projectedTotal.toFixed(2)}</dd></div>
          </dl>

          <div className="batch-factory-table-wrap">
            <table className="batch-factory-table">
              <thead>
                <tr>
                  <th>PI and institution</th>
                  <th>Slug</th>
                  <th>Status</th>
                  <th>Quality</th>
                  <th>Coverage</th>
                  <th>Cost</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className={`batch-row-${row.status}`}>
                    <td><strong>{row.piName || "Missing PI name"}</strong><span>{row.institution || "Missing institution"}</span></td>
                    <td><code>{row.slug || "—"}</code></td>
                    <td><span className={`batch-status batch-status-${row.status}`}>{statusLabel(row.status)}</span><small>{row.message}</small></td>
                    <td>{typeof row.qualityScore === "number" ? <><strong>{row.qualityScore}/100</strong><span>{row.qualityLabel}</span></> : "—"}</td>
                    <td>{row.status === "ready" ? <><span>{row.sourceCount ?? 0} sources</span><span>{row.publicationCount ?? 0} publications</span><span>{row.opportunityCount ?? 0} opportunities</span></> : "—"}</td>
                    <td>{typeof row.cost === "number" ? `$${row.cost.toFixed(4)}` : "—"}</td>
                    <td>
                      <div className="batch-row-actions">
                        {row.status === "ready" && <button type="button" onClick={() => loadIntoValidator(row)}>Validate</button>}
                        {row.status === "ready" && <button type="button" onClick={() => downloadText(normalizedRowJson(row), row.fileName)}>Download</button>}
                        {row.status === "failed" && <button type="button" onClick={() => retryRow(row.id)} disabled={running}>Retry</button>}
                        {row.status === "pending" && <button type="button" onClick={() => skipRow(row.id)} disabled={running}>Skip</button>}
                        {row.status === "skipped" && <button type="button" onClick={() => restoreRow(row.id)} disabled={running}>Restore</button>}
                        {row.status !== "generating" && <button type="button" onClick={() => removeRow(row.id)} disabled={running}>Remove</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {readyRows.length > 0 && (
            <div className="batch-factory-export">
              <div><strong>Completed concept archive</strong><span>Exports all ready JSON packages together for backup. Import remains one concept at a time.</span></div>
              <button className="admin-secondary-button" type="button" onClick={downloadBatchArchive}>Download batch archive</button>
            </div>
          )}
        </>
      )}

      {message && <p className="batch-factory-message" role="status" aria-live="polite">{message}</p>}
    </section>
  );
}
