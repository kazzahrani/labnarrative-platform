"use client";

import { createClient } from "@supabase/supabase-js";
import { FormEvent, useMemo, useState } from "react";

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

type Props = {
  existingSlugs: string[];
  onGenerated: (jsonText: string, fileName: string) => void;
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

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

export default function PiConceptFactoryPanel({ existingSlugs, onGenerated }: Props) {
  const [piName, setPiName] = useState("");
  const [institution, setInstitution] = useState("");
  const [profileUrl, setProfileUrl] = useState("");
  const [country, setCountry] = useState("");
  const [slug, setSlug] = useState("");
  const [notes, setNotes] = useState("");
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState("");
  const [sources, setSources] = useState<SourceItem[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [usage, setUsage] = useState<GenerationResponse["usage"]>(undefined);
  const [costEstimate, setCostEstimate] = useState<GenerationResponse["costEstimate"]>(undefined);
  const [quality, setQuality] = useState<GenerationResponse["quality"]>(undefined);
  const [model, setModel] = useState("");

  const effectiveSlug = useMemo(
    () => cleanSlug(slug || suggestedSlug(piName)),
    [slug, piName],
  );
  const duplicateSlug = effectiveSlug && existingSlugs.map(cleanSlug).includes(effectiveSlug);

  function updateName(value: string) {
    const previousSuggestion = suggestedSlug(piName);
    setPiName(value);
    if (!slug || slug === previousSuggestion) setSlug(suggestedSlug(value));
  }

  async function generate(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    setSources([]);
    setWarnings([]);
    setUsage(undefined);
    setCostEstimate(undefined);
    setQuality(undefined);
    setModel("");

    if (!piName.trim() || !institution.trim()) {
      setMessage("Enter the PI name and institution.");
      return;
    }
    if (!effectiveSlug) {
      setMessage("Enter a valid concept slug.");
      return;
    }
    if (duplicateSlug) {
      setMessage(`The slug “${effectiveSlug}” already exists. Choose another slug before research begins.`);
      return;
    }
    if (profileUrl.trim()) {
      try {
        const parsed = new URL(profileUrl.trim());
        if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("unsupported protocol");
      } catch {
        setMessage("The profile URL must be a complete http:// or https:// address.");
        return;
      }
    }

    setGenerating(true);
    setMessage("Researching the PI, verifying sources, and writing the website concept. This can take several minutes…");

    try {
      const { data, error } = await supabase.functions.invoke("generate-pi-concept", {
        body: {
          piName: piName.trim(),
          institution: institution.trim(),
          profileUrl: profileUrl.trim(),
          country: country.trim(),
          slug: effectiveSlug,
          notes: [
            notes.trim(),
            "Images will be selected and uploaded manually by the LabNarrative editor. Leave all image fields empty.",
          ].filter(Boolean).join("\n"),
        },
      });

      if (error) {
        let detail = error.message;
        const context = (error as { context?: Response }).context;
        if (context) {
          try {
            const body = await context.clone().json() as GenerationResponse;
            detail = body.error || detail;
            if (body.setupRequired) {
              detail = `${detail} Add OPENAI_API_KEY in Supabase Edge Function Secrets, then run the factory again.`;
            }
          } catch {
            // Keep the Supabase error message when the response is not JSON.
          }
        }
        throw new Error(detail);
      }

      const result = (data ?? {}) as GenerationResponse;
      if (!result.ok || !result.importData) {
        throw new Error(result.error || "The research generator returned no import package.");
      }

      const jsonText = JSON.stringify(result.importData, null, 2);
      onGenerated(jsonText, `${effectiveSlug}-labnarrative-import.json`);
      setSources(result.sources ?? []);
      setWarnings(result.warnings ?? []);
      setUsage(result.usage);
      setCostEstimate(result.costEstimate);
      setQuality(result.quality);
      setModel(result.model ?? "");
      setMessage("Concept research completed. The generated JSON is loaded below for validation and human review.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The PI concept could not be generated.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <section className="pi-factory-panel" aria-labelledby="pi-factory-title">
      <div className="pi-factory-heading">
        <div>
          <span className="admin-kicker">Automated PI Concept Factory</span>
          <h2 id="pi-factory-title">Research one PI and prepare the complete website JSON.</h2>
          <p>
            The server searches current public sources, expands publication and opportunity coverage,
            creates four research programmes, and sends the result into the existing validator. Images remain
            empty for manual selection and placement. Nothing is saved or published automatically.
          </p>
        </div>
        <span className="pi-factory-badge">Human approval required</span>
      </div>

      <form className="pi-factory-form" onSubmit={generate}>
        <label className="admin-field">
          <span>Principal investigator *</span>
          <input
            value={piName}
            onChange={(event) => updateName(event.target.value)}
            placeholder="Dr Sunali Mehta"
            autoComplete="off"
          />
        </label>

        <label className="admin-field">
          <span>University or institution *</span>
          <input
            value={institution}
            onChange={(event) => setInstitution(event.target.value)}
            placeholder="University of Waikato"
            autoComplete="organization"
          />
        </label>

        <label className="admin-field">
          <span>Official profile URL</span>
          <input
            value={profileUrl}
            onChange={(event) => setProfileUrl(event.target.value)}
            placeholder="https://university.edu/profile/name"
            inputMode="url"
          />
        </label>

        <label className="admin-field">
          <span>Country or location</span>
          <input
            value={country}
            onChange={(event) => setCountry(event.target.value)}
            placeholder="New Zealand"
            autoComplete="country-name"
          />
        </label>

        <label className="admin-field">
          <span>Concept slug</span>
          <input
            value={slug}
            onChange={(event) => setSlug(cleanSlug(event.target.value))}
            placeholder="sunali-mehta"
            spellCheck={false}
          />
          <small className={duplicateSlug ? "pi-factory-field-error" : "pi-factory-field-note"}>
            {duplicateSlug
              ? `Already used: ${effectiveSlug}`
              : effectiveSlug
                ? `Will prepare: ${effectiveSlug}.labnarrative.com`
                : "Generated automatically from the PI name."}
          </small>
        </label>

        <label className="admin-field admin-field-wide">
          <span>Optional editorial direction</span>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={3}
            placeholder="Examples: emphasise translational research; use a warmer visual direction; avoid listing unverified team members."
          />
        </label>

        <div className="pi-factory-submit admin-field-wide">
          <div>
            <strong>One controlled research run</strong>
            <span>Up to six bounded web searches · structured JSON · images added manually · no automatic database write</span>
          </div>
          <button
            className="admin-factory-primary"
            type="submit"
            disabled={generating || !piName.trim() || !institution.trim() || Boolean(duplicateSlug)}
          >
            {generating ? "Researching and writing…" : "Generate PI concept"}
          </button>
        </div>
      </form>

      {message && <p className="pi-factory-message" role="status" aria-live="polite">{message}</p>}

      {(sources.length > 0 || warnings.length > 0 || usage || model || quality || costEstimate) && (
        <div className="pi-factory-result">
          <div className="pi-factory-result-meta">
            <div><span>Quality</span><strong>{quality?.label ? `${quality.label} · ${quality.score ?? 0}/100` : "—"}</strong></div>
            <div><span>Sources</span><strong>{sources.length}</strong></div>
            <div><span>Search calls</span><strong>{costEstimate?.webSearchCalls ?? "—"}</strong></div>
            <div><span>Input tokens</span><strong>{usage?.input_tokens?.toLocaleString() ?? "—"}</strong></div>
            <div><span>Output tokens</span><strong>{usage?.output_tokens?.toLocaleString() ?? "—"}</strong></div>
            <div><span>Estimated API cost</span><strong>{typeof costEstimate?.totalCost === "number" ? `$${costEstimate.totalCost.toFixed(4)}` : "—"}</strong></div>
          </div>

          {quality && (
            <div className="pi-factory-quality">
              <strong>Quality coverage</strong>
              <div>
                <span>{quality.publicationCount ?? 0} publications</span>
                <span>{quality.opportunityCount ?? 0} opportunities</span>
                <span>{quality.memberCount ?? 0} verified member{quality.memberCount === 1 ? "" : "s"}</span>
                <span>Images selected manually</span>
                <span>{quality.hasVerifiedEmail ? "Email verified" : "Email missing"}</span>
              </div>
              {costEstimate?.note && <small>{costEstimate.note}</small>}
            </div>
          )}

          {warnings.length > 0 && (
            <div className="pi-factory-warnings">
              <strong>Research warnings</strong>
              {warnings.map((warning, index) => <p key={`${warning}-${index}`}>{warning}</p>)}
            </div>
          )}

          {sources.length > 0 && (
            <div className="pi-factory-sources">
              <strong>Sources consulted</strong>
              <div>
                {sources.slice(0, 20).map((source, index) => (
                  <a key={`${source.url}-${index}`} href={source.url} target="_blank" rel="noreferrer">
                    <span>{source.title || new URL(source.url).hostname}</span>
                    <small>{source.url}</small>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
