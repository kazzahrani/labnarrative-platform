import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import {
  buildOfficialFeedHeaders,
  normalizeEtimadRecord,
  parseEtimadFeed,
  recordHash,
  validateOfficialFeedUrl,
  type NormalizedEtimadTender,
} from "../../../../../lib/tenders/etimad-official";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const SOURCE_SLUG = "etimad-open-data";
const CHUNK_SIZE = 150;

type SourceRow = {
  id: string;
  slug: string;
  source_type: string;
  base_url: string;
  status: string;
  metadata: Record<string, unknown> | null;
};

type SnapshotRow = {
  id: string;
  source_record_id: string;
  content_hash: string;
};

type ExistingTender = {
  id: string;
  reference_number: string | null;
  source_record_id: string | null;
};

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE?.trim();
  if (!url || !serviceKey) throw new Error("Supabase service configuration is missing for tender ingestion.");
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

function sourceMode(): "api" | "open_data" {
  return process.env.ETIMAD_TENDER_SOURCE_MODE?.trim().toLowerCase() === "api" ? "api" : "open_data";
}

function chunks<T>(items: T[], size = CHUNK_SIZE) {
  const output: T[][] = [];
  for (let index = 0; index < items.length; index += size) output.push(items.slice(index, index + size));
  return output;
}

function uniqueNormalized(records: NormalizedEtimadTender[]) {
  const byReference = new Map<string, NormalizedEtimadTender>();
  for (const record of records) {
    const key = record.reference_number || record.source_record_id;
    byReference.set(key, record);
  }
  return [...byReference.values()];
}

async function loadSnapshots(
  supabase: SupabaseClient,
  sourceId: string,
  normalized: NormalizedEtimadTender[],
) {
  const wanted = new Set(normalized.map((record) => `${record.source_record_id}::${recordHash(record.raw_payload)}`));
  const map = new Map<string, string>();
  for (const batch of chunks([...new Set(normalized.map((record) => record.source_record_id))], 100)) {
    const { data, error } = await supabase
      .from("tender_source_records")
      .select("id,source_record_id,content_hash")
      .eq("source_id", sourceId)
      .in("source_record_id", batch);
    if (error) throw error;
    for (const row of (data ?? []) as SnapshotRow[]) {
      const key = `${row.source_record_id}::${row.content_hash}`;
      if (wanted.has(key)) map.set(key, row.id);
    }
  }
  return map;
}

async function runIngestion(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const configuredFeedUrl = process.env.ETIMAD_TENDER_FEED_URL?.trim();
  if (!configuredFeedUrl) {
    return NextResponse.json({
      ok: true,
      status: "waiting_for_official_feed",
      message: "Connector is deployed, but ETIMAD_TENDER_FEED_URL is not configured yet. No scraping fallback will be used.",
    });
  }

  const feedUrl = validateOfficialFeedUrl(configuredFeedUrl).toString();
  const supabase = adminClient();
  const { data: sourceData, error: sourceError } = await supabase
    .from("tender_data_sources")
    .select("id,slug,source_type,base_url,status,metadata")
    .eq("slug", SOURCE_SLUG)
    .single();
  if (sourceError) throw sourceError;
  const source = sourceData as SourceRow;
  if (source.status === "inactive") throw new Error("Etimad tender source is inactive in LabNarrative.");

  const mode = sourceMode();
  const startedAt = new Date().toISOString();
  const { data: runData, error: runError } = await supabase
    .from("tender_ingestion_runs")
    .insert({ source_id: source.id, mode, status: "running", records_seen: 0, records_upserted: 0, started_at: startedAt })
    .select("id")
    .single();
  if (runError) throw runError;
  const runId = String(runData.id);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 40_000);
    let response: Response;
    try {
      response = await fetch(feedUrl, {
        method: "GET",
        cache: "no-store",
        redirect: "follow",
        signal: controller.signal,
        headers: buildOfficialFeedHeaders(),
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) throw new Error(`Official Etimad feed returned HTTP ${response.status}.`);
    const parsed = await parseEtimadFeed(response);
    if (!parsed.records.length) throw new Error("Official Etimad feed returned no machine-readable tender records.");

    const normalized = uniqueNormalized(
      parsed.records
        .map((record) => normalizeEtimadRecord(record, feedUrl))
        .filter((record): record is NormalizedEtimadTender => record !== null),
    );
    if (!normalized.length) throw new Error("Etimad records were received but none contained enough tender metadata to normalize safely.");

    const fetchedAt = new Date().toISOString();
    const snapshotPayload = normalized.map((record) => ({
      source_id: source.id,
      ingestion_run_id: runId,
      source_record_id: record.source_record_id,
      source_url: record.source_url,
      fetched_at: fetchedAt,
      published_at: record.published_at,
      content_type: parsed.contentType,
      http_status: response.status,
      content_hash: recordHash(record.raw_payload),
      raw_text: null,
      payload: record.raw_payload,
      document_urls: record.document_urls,
    }));

    for (const batch of chunks(snapshotPayload)) {
      const { error } = await supabase
        .from("tender_source_records")
        .upsert(batch, {
          onConflict: "source_id,source_record_id,content_hash",
          ignoreDuplicates: true,
        });
      if (error) throw error;
    }

    const snapshotIds = await loadSnapshots(supabase, source.id, normalized);
    const { data: existingData, error: existingError } = await supabase
      .from("tenders")
      .select("id,reference_number,source_record_id")
      .eq("source_id", source.id);
    if (existingError) throw existingError;
    const existing = (existingData ?? []) as ExistingTender[];
    const existingByReference = new Map(existing.filter((row) => row.reference_number).map((row) => [String(row.reference_number), row]));
    const existingByRecord = new Map(existing.filter((row) => row.source_record_id).map((row) => [String(row.source_record_id), row]));
    const now = new Date().toISOString();

    let inserted = 0;
    let updated = 0;
    for (const record of normalized) {
      const match = existingByReference.get(record.reference_number || "") || existingByRecord.get(record.source_record_id) || null;
      const contentHash = recordHash(record.raw_payload);
      const sourceRecordUuid = snapshotIds.get(`${record.source_record_id}::${contentHash}`) ?? null;
      const payload = {
        source_id: source.id,
        source_record_id: record.source_record_id,
        tender_number: record.tender_number,
        reference_number: record.reference_number,
        title_ar: record.title_ar,
        title_en: record.title_en,
        buyer_ar: record.buyer_ar,
        buyer_en: record.buyer_en,
        purpose_ar: record.purpose_ar,
        purpose_en: record.purpose_en,
        tender_type_ar: record.tender_type_ar,
        tender_type_en: record.tender_type_en,
        document_price_sar: record.document_price_sar,
        contract_duration_text: record.contract_duration_text,
        source_status_text: record.source_status_text,
        verification_state: record.verification_state,
        is_public: true,
        source_url: record.source_url,
        source_indexed_at: now,
        published_at: record.published_at,
        deadline_at: record.deadline_at,
        raw_payload: record.raw_payload,
        source_record_uuid: sourceRecordUuid,
        normalized_at: now,
        updated_at: now,
      };

      if (match) {
        const { error } = await supabase.from("tenders").update(payload).eq("id", match.id);
        if (error) throw error;
        updated += 1;
      } else {
        const { error } = await supabase.from("tenders").insert(payload);
        if (error) throw error;
        inserted += 1;
      }
    }

    const status = normalized.length < parsed.records.length ? "partial" : "succeeded";
    const finishedAt = new Date().toISOString();
    const notes = [
      `Official Etimad ${mode} connector; parser=${parsed.parser}.`,
      `Received ${parsed.records.length}, normalized ${normalized.length}, inserted ${inserted}, updated ${updated}.`,
      "Public visitor-page scraping is intentionally disabled.",
    ].join(" ");

    const { error: finishError } = await supabase
      .from("tender_ingestion_runs")
      .update({ status, records_seen: parsed.records.length, records_upserted: inserted + updated, notes, finished_at: finishedAt })
      .eq("id", runId);
    if (finishError) throw finishError;

    const metadata = {
      ...(source.metadata ?? {}),
      connector_ready: true,
      connector_mode: mode,
      last_ingestion_at: finishedAt,
      last_ingestion_status: status,
      last_parser: parsed.parser,
      last_records_seen: parsed.records.length,
      last_records_normalized: normalized.length,
      last_records_inserted: inserted,
      last_records_updated: updated,
      last_ingestion_error: null,
    };
    await supabase.from("tender_data_sources").update({ metadata, updated_at: finishedAt }).eq("id", source.id);

    return NextResponse.json({
      ok: true,
      status,
      source: SOURCE_SLUG,
      mode,
      parser: parsed.parser,
      run_id: runId,
      records_seen: parsed.records.length,
      records_normalized: normalized.length,
      inserted,
      updated,
      finished_at: finishedAt,
    });
  } catch (error) {
    const finishedAt = new Date().toISOString();
    const message = error instanceof Error ? error.message : "Unknown Etimad ingestion error.";
    await supabase
      .from("tender_ingestion_runs")
      .update({ status: "failed", notes: message.slice(0, 1500), finished_at: finishedAt })
      .eq("id", runId);
    await supabase
      .from("tender_data_sources")
      .update({
        metadata: {
          ...(source.metadata ?? {}),
          connector_ready: true,
          connector_mode: mode,
          last_ingestion_at: finishedAt,
          last_ingestion_status: "failed",
          last_ingestion_error: message.slice(0, 1000),
        },
        updated_at: finishedAt,
      })
      .eq("id", source.id);
    throw error;
  }
}

export async function GET(request: Request) {
  try {
    return await runIngestion(request);
  } catch (error) {
    console.error("official Etimad tender ingestion failed", error);
    return NextResponse.json({ error: "Official Etimad tender ingestion failed." }, { status: 500 });
  }
}
