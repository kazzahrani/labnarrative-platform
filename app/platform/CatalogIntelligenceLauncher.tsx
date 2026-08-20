"use client";

import { createClient, type Session } from "@supabase/supabase-js";
import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./catalog-intelligence.module.css";

type Org = { id: string; name: string };
type Product = {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  manufacturer: string | null;
  manufacturer_part_number: string | null;
  nupco_code: string | null;
  aliases: string[] | null;
  brand: string | null;
  unit: string | null;
  stock_qty: number;
  reserved_qty: number;
  metadata: Record<string, unknown> | null;
};
type MatchSummary = {
  tender_id: string;
  matched_count: number;
  requirement_count: number;
  coverage: number;
  score: number;
  decision: "BID" | "REVIEW" | "NO-BID";
  exact_count: number;
  equivalent_count: number;
  stock_available_count: number;
  requires_sourcing_count: number;
  match_version: string;
  computed_at: string;
  rationale: Record<string, unknown> | null;
};
type Tender = {
  id: string;
  tender_number: string | null;
  reference_number: string | null;
  title_ar: string;
  title_en: string | null;
  buyer_ar: string | null;
  buyer_en: string | null;
  source_url: string;
  deadline_at: string | null;
};
type TenderCard = Tender & MatchSummary;
type Bucket = "we_supply" | "possible_equivalent" | "missing";
type ReviewRow = {
  total_count: number;
  requirement_id: string;
  source_line_number: number | null;
  item_code: string | null;
  requested_item: string;
  requested_qty: number | null;
  requested_unit: string | null;
  product_id: string | null;
  product_sku: string | null;
  product_name: string | null;
  product_nupco_code: string | null;
  manufacturer_part_number: string | null;
  manufacturer: string | null;
  brand: string | null;
  product_unit: string | null;
  match_type: string | null;
  match_score: number | null;
  available_stock: number | null;
  bucket: Bucket;
};
type ImportResult = {
  count: number;
  sheet: string;
  header_row: number;
  skipped_rows: number;
  duplicate_rows_collapsed: number;
  generated_sku_count: number;
  with_nupco_code: number;
  with_manufacturer_part_number: number;
  with_description: number;
  illustrative_products_deactivated: number;
  rematch_request_id: number | null;
  rematch_warning: string | null;
};

type CatalogStats = {
  active: number;
  imported: number;
  demo: number;
  nupco: number;
  mpn: number;
  description: number;
  manufacturers: number;
  brands: number;
};

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
const fmt = (value: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value || 0);
const percent = (part: number, total: number) => total ? Math.round((part / total) * 100) : 0;
const dateLabel = (value: string | null) => value ? new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value)) : "Verify at source";
const matchTypeLabel = (value: string | null) => ({
  nupco_code_exact: "Exact NUPCO code",
  catalog_code_exact: "Exact catalog / part code",
  name_phrase_exact: "Exact product-name phrase",
  alias_phrase_exact: "Exact alias phrase",
  lexical_strong: "Strong description match",
}[value || ""] || "Catalog match");

export default function CatalogIntelligenceLauncher() {
  const [session, setSession] = useState<Session | null>(null);
  const [open, setOpen] = useState(false);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [orgId, setOrgId] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [tenders, setTenders] = useState<TenderCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [selectedTender, setSelectedTender] = useState<TenderCard | null>(null);
  const [bucket, setBucket] = useState<Bucket>("we_supply");
  const [bucketRows, setBucketRows] = useState<ReviewRow[]>([]);
  const [bucketCounts, setBucketCounts] = useState<Record<Bucket, number>>({ we_supply: 0, possible_equivalent: 0, missing: 0 });
  const [bucketPage, setBucketPage] = useState(0);
  const [bucketLoading, setBucketLoading] = useState(false);
  const [startingBid, setStartingBid] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (open && session) void loadOrganizations();
  }, [open, session]);

  useEffect(() => {
    if (open && session && orgId) void loadWorkspace(orgId);
  }, [open, orgId, session]);

  const stats = useMemo<CatalogStats>(() => {
    const real = products.filter((product) => product.metadata?.catalog_intelligence_version === "v1" || product.metadata?.catalog_intelligence_version === "v2");
    return {
      active: products.length,
      imported: real.length,
      demo: products.filter((product) => product.metadata?.illustrative === true).length,
      nupco: products.filter((product) => Boolean(product.nupco_code)).length,
      mpn: products.filter((product) => Boolean(product.manufacturer_part_number)).length,
      description: products.filter((product) => Boolean(product.description)).length,
      manufacturers: new Set(products.map((product) => product.manufacturer).filter(Boolean)).size,
      brands: new Set(products.map((product) => product.brand).filter(Boolean)).size,
    };
  }, [products]);

  const positiveTenders = useMemo(() => tenders.filter((tender) => tender.matched_count > 0), [tenders]);

  async function loadOrganizations() {
    setError("");
    const { data: memberships, error: membershipError } = await supabase.from("ln_organization_members").select("org_id").eq("status", "active");
    if (membershipError) { setError(membershipError.message); return; }
    const ids = (memberships ?? []).map((row) => String(row.org_id));
    if (!ids.length) { setOrgs([]); setOrgId(""); return; }
    const { data, error: orgError } = await supabase.from("ln_organizations").select("id,name").in("id", ids).order("created_at");
    if (orgError) { setError(orgError.message); return; }
    const rows = (data ?? []) as Org[];
    setOrgs(rows);
    setOrgId((current) => current && rows.some((org) => org.id === current) ? current : rows[0]?.id ?? "");
  }

  async function loadWorkspace(nextOrgId: string) {
    setLoading(true);
    setError("");
    try {
      const [productResult, matchResult] = await Promise.all([
        supabase.from("ln_products").select("id,sku,name,description,manufacturer,manufacturer_part_number,nupco_code,aliases,brand,unit,stock_qty,reserved_qty,metadata").eq("org_id", nextOrgId).eq("active", true).order("name"),
        supabase.from("tender_matches").select("tender_id,matched_count,requirement_count,coverage,score,decision,exact_count,equivalent_count,stock_available_count,requires_sourcing_count,match_version,computed_at,rationale").eq("org_id", nextOrgId).order("score", { ascending: false }),
      ]);
      if (productResult.error) throw productResult.error;
      if (matchResult.error) throw matchResult.error;
      const productRows = (productResult.data ?? []) as Product[];
      const matches = (matchResult.data ?? []) as MatchSummary[];
      setProducts(productRows);

      const ids = matches.map((match) => match.tender_id);
      if (!ids.length) { setTenders([]); return; }
      const { data: tenderRows, error: tenderError } = await supabase.from("tenders").select("id,tender_number,reference_number,title_ar,title_en,buyer_ar,buyer_en,source_url,deadline_at").in("id", ids);
      if (tenderError) throw tenderError;
      const tenderMap = new Map(((tenderRows ?? []) as Tender[]).map((tender) => [tender.id, tender]));
      const combined = matches.map((match) => ({ ...tenderMap.get(match.tender_id)!, ...match })).filter((row) => Boolean(row.id));
      combined.sort((a, b) => b.matched_count - a.matched_count || b.score - a.score);
      setTenders(combined);
      if (selectedTender) {
        const refreshed = combined.find((tender) => tender.id === selectedTender.id) ?? null;
        setSelectedTender(refreshed);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load catalog intelligence.");
    } finally {
      setLoading(false);
    }
  }

  async function importCatalog(file: File) {
    if (!session || !orgId) return;
    setUploading(true);
    setError("");
    setNotice("");
    setImportResult(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("orgId", orgId);
      const response = await fetch("/api/platform/import-products", { method: "POST", headers: { Authorization: `Bearer ${session.access_token}` }, body: form });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(payload.error || "Catalog import failed."));
      setImportResult(payload as ImportResult);
      setNotice(`${payload.count ?? 0} products imported. Tender rematching has been requested automatically.`);
      await loadWorkspace(orgId);
      window.setTimeout(() => void loadWorkspace(orgId), 3000);
      window.setTimeout(() => void loadWorkspace(orgId), 8000);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Catalog import failed.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function rpcBucket(tenderId: string, nextBucket: Bucket, page: number, limit = 50) {
    const { data, error: rpcError } = await supabase.rpc("ln_tender_bid_review", {
      p_org_id: orgId,
      p_tender_id: tenderId,
      p_bucket: nextBucket,
      p_limit: limit,
      p_offset: page * limit,
    });
    if (rpcError) throw rpcError;
    return (data ?? []) as ReviewRow[];
  }

  async function openTenderReview(tender: TenderCard) {
    setSelectedTender(tender);
    setBucket("we_supply");
    setBucketPage(0);
    setBucketLoading(true);
    setError("");
    try {
      const [supply, equivalent, missing] = await Promise.all([
        rpcBucket(tender.id, "we_supply", 0, 50),
        rpcBucket(tender.id, "possible_equivalent", 0, 1),
        rpcBucket(tender.id, "missing", 0, 1),
      ]);
      setBucketRows(supply);
      setBucketCounts({
        we_supply: supply[0]?.total_count ?? 0,
        possible_equivalent: equivalent[0]?.total_count ?? 0,
        missing: missing[0]?.total_count ?? 0,
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load tender item review.");
    } finally {
      setBucketLoading(false);
    }
  }

  async function changeBucket(nextBucket: Bucket, page = 0) {
    if (!selectedTender) return;
    setBucket(nextBucket);
    setBucketPage(page);
    setBucketLoading(true);
    setError("");
    try {
      const rows = await rpcBucket(selectedTender.id, nextBucket, page, 50);
      setBucketRows(rows);
      if (page === 0) setBucketCounts((current) => ({ ...current, [nextBucket]: rows[0]?.total_count ?? 0 }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load tender item review.");
    } finally {
      setBucketLoading(false);
    }
  }

  async function ensureOpportunity(tender: TenderCard) {
    const { data: existing, error: existingError } = await supabase.from("ln_opportunities").select("id").eq("org_id", orgId).eq("source_tender_id", tender.id).maybeSingle();
    if (existingError) throw existingError;
    if (existing?.id) return String(existing.id);
    const rationale = tender.rationale && typeof tender.rationale === "object" ? tender.rationale : {};
    const reasons = Array.isArray(rationale.reasons) ? rationale.reasons.filter((item): item is string => typeof item === "string") : [];
    const { data, error: insertError } = await supabase.from("ln_opportunities").insert({
      org_id: orgId,
      source_tender_id: tender.id,
      external_ref: tender.reference_number || tender.tender_number,
      buyer: tender.buyer_en || tender.buyer_ar || "Government entity",
      title: tender.title_en || tender.title_ar,
      source: "NUPCO",
      source_url: tender.source_url,
      deadline_at: tender.deadline_at,
      match_score: Math.round(Number(tender.coverage || 0) * 100),
      bid_score: tender.score,
      matched_items: tender.matched_count,
      total_items: tender.requirement_count,
      status: "reviewing",
      recommendation: tender.decision,
      summary: `${tender.matched_count} strong catalog matches across ${tender.requirement_count} tender items using ${tender.match_version}.`,
      reasons,
    }).select("id").single();
    if (insertError) throw insertError;
    return String(data.id);
  }

  async function startBid() {
    if (!selectedTender || !session) return;
    setStartingBid(true);
    setError("");
    try {
      const opportunityId = await ensureOpportunity(selectedTender);
      const { error: decisionError } = await supabase.from("tender_decisions").insert({
        org_id: orgId,
        tender_id: selectedTender.id,
        decision: "BID",
        note: "Human Start Bid action from Catalog Intelligence.",
        decided_by: session.user.id,
      });
      if (decisionError) throw decisionError;
      const { data: lnTenderId, error: bidError } = await supabase.rpc("ln_start_bid", { p_opportunity_id: opportunityId });
      if (bidError) throw bidError;
      const { count } = await supabase.from("ln_tender_bid_items").select("id", { count: "exact", head: true }).eq("ln_tender_id", String(lnTenderId));
      setNotice(`Bid workspace created with ${count ?? selectedTender.matched_count} matched catalog item${(count ?? selectedTender.matched_count) === 1 ? "" : "s"}. Open Tenders in the main workspace to continue.`);
      await loadWorkspace(orgId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not start the bid workflow.");
    } finally {
      setStartingBid(false);
    }
  }

  if (!session) return null;

  const currentTotal = bucketCounts[bucket];
  const canNext = (bucketPage + 1) * 50 < currentTotal;

  return <>
    <button className={styles.launcher} onClick={() => { setOpen(true); setError(""); }}>
      ◎ Catalog Intelligence{positiveTenders.length ? <span>{positiveTenders.length}</span> : null}
    </button>

    {open ? <div className={styles.backdrop} onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className={styles.modal}>
        <header className={styles.head}>
          <div>
            <div className={styles.eyebrow}>LabNarrative · Catalog Intelligence</div>
            <h2>Turn the supplier catalog into tender-level commercial intelligence.</h2>
            <p>Import the company&apos;s existing Excel/CSV catalog. LabNarrative maps codes, descriptions, manufacturers and stock against the live tender evidence already collected from NUPCO.</p>
          </div>
          <button className={styles.close} onClick={() => setOpen(false)}>×</button>
        </header>

        <div className={styles.body}>
          <div className={styles.toolbar}>
            <label><span>Organization</span><select value={orgId} onChange={(event) => { setOrgId(event.target.value); setSelectedTender(null); setImportResult(null); }}>
              {orgs.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}
            </select></label>
            <input ref={inputRef} className={styles.file} type="file" accept=".xlsx,.csv" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importCatalog(file); }} />
            <button className={styles.importButton} disabled={uploading || !orgId} onClick={() => inputRef.current?.click()}>{uploading ? "Importing…" : "Import supplier catalog"}</button>
            <button className={styles.refresh} disabled={loading || !orgId} onClick={() => void loadWorkspace(orgId)}>{loading ? "Refreshing…" : "Refresh"}</button>
          </div>

          <div className={styles.hint}>Accepted columns are detected automatically in English or Arabic. Best results: SKU / internal code, product name, long description, manufacturer, manufacturer part number, NUPCO or generic code, brand, UOM, stock and price.</div>
          {error ? <div className={styles.error}>{error}</div> : null}
          {notice ? <div className={styles.notice}>{notice}</div> : null}

          <section className={styles.metrics}>
            <article><span>Active catalog</span><strong>{fmt(stats.active)}</strong><small>{stats.demo ? `${stats.demo} illustrative` : `${stats.imported} imported`}</small></article>
            <article><span>NUPCO-coded</span><strong>{percent(stats.nupco, stats.active)}%</strong><small>{fmt(stats.nupco)} products</small></article>
            <article><span>Manufacturer part #</span><strong>{percent(stats.mpn, stats.active)}%</strong><small>{fmt(stats.mpn)} products</small></article>
            <article><span>Rich descriptions</span><strong>{percent(stats.description, stats.active)}%</strong><small>{fmt(stats.description)} products</small></article>
            <article><span>Manufacturers / brands</span><strong>{stats.manufacturers} / {stats.brands}</strong><small>catalog diversity</small></article>
          </section>

          {importResult ? <section className={styles.importResult}>
            <div><strong>{fmt(importResult.count)} products imported</strong><span>{importResult.sheet} · header row {importResult.header_row}</span></div>
            <div><strong>{fmt(importResult.with_nupco_code)}</strong><span>NUPCO codes</span></div>
            <div><strong>{fmt(importResult.with_manufacturer_part_number)}</strong><span>manufacturer part #</span></div>
            <div><strong>{fmt(importResult.with_description)}</strong><span>long descriptions</span></div>
            <div><strong>{fmt(importResult.generated_sku_count)}</strong><span>SKUs safely generated from other codes</span></div>
            <div><strong>{fmt(importResult.illustrative_products_deactivated)}</strong><span>demo products deactivated</span></div>
          </section> : null}

          <section className={styles.split}>
            <div className={styles.tenderPane}>
              <div className={styles.sectionHead}>
                <div><strong>Tender opportunities</strong><span>{positiveTenders.length ? `${positiveTenders.length} with strong matches` : "No strong matches yet"}</span></div>
              </div>
              <div className={styles.tenderList}>
                {(positiveTenders.length ? positiveTenders : tenders.slice(0, 12)).map((tender) => <button key={tender.id} className={`${styles.tenderCard} ${selectedTender?.id === tender.id ? styles.selected : ""}`} onClick={() => void openTenderReview(tender)}>
                  <div className={styles.tenderScore}><strong>{tender.score}</strong><span>score</span></div>
                  <div className={styles.tenderCopy}>
                    <span>{tender.buyer_en || tender.buyer_ar || "Government entity"}</span>
                    <strong>{tender.title_en || tender.title_ar}</strong>
                    <small>{tender.tender_number || tender.reference_number || "NUPCO tender"} · {dateLabel(tender.deadline_at)}</small>
                  </div>
                  <div className={styles.tenderMatch}><strong>{tender.matched_count}</strong><span>strong matches</span><small>{tender.exact_count} exact · {tender.equivalent_count} description</small></div>
                  <div className={styles.decision}>{tender.decision}</div>
                </button>)}
              </div>
            </div>

            <div className={styles.reviewPane}>
              {!selectedTender ? <div className={styles.emptyReview}>
                <strong>{stats.imported ? "Select a tender to review its item-level matches." : "Import a real supplier catalog to begin the commercial test."}</strong>
                <p>{stats.imported ? "Exact codes are separated from possible equivalents, and every unmatched tender line remains visible for sourcing." : "The six current products are illustrative only. A real catalog upload will deactivate them automatically and trigger v6 rematching."}</p>
              </div> : <>
                <div className={styles.reviewHead}>
                  <div><span>{selectedTender.tender_number || "Tender review"}</span><strong>{selectedTender.title_en || selectedTender.title_ar}</strong><small>{selectedTender.matched_count} strong matches across {fmt(selectedTender.requirement_count)} tender items</small></div>
                  <div className={styles.reviewActions}><a href={selectedTender.source_url} target="_blank" rel="noreferrer">Source ↗</a><button disabled={startingBid || selectedTender.matched_count === 0} onClick={() => void startBid()}>{startingBid ? "Starting…" : "Start Bid"}</button></div>
                </div>

                <div className={styles.tabs}>
                  <button className={bucket === "we_supply" ? styles.activeTab : ""} onClick={() => void changeBucket("we_supply", 0)}>We supply <b>{bucketCounts.we_supply}</b></button>
                  <button className={bucket === "possible_equivalent" ? styles.activeTab : ""} onClick={() => void changeBucket("possible_equivalent", 0)}>Possible equivalent <b>{bucketCounts.possible_equivalent}</b></button>
                  <button className={bucket === "missing" ? styles.activeTab : ""} onClick={() => void changeBucket("missing", 0)}>Missing / source externally <b>{bucketCounts.missing}</b></button>
                </div>

                {bucketLoading ? <div className={styles.loading}>Loading item evidence…</div> : <div className={styles.rows}>
                  {bucketRows.map((row) => <article className={styles.row} key={row.requirement_id}>
                    <div className={styles.requested}>
                      <span>{row.item_code ? `NUPCO ${row.item_code}` : row.source_line_number ? `Line ${row.source_line_number}` : "Tender item"}</span>
                      <strong>{row.requested_item}</strong>
                      <small>{row.requested_qty != null ? `${fmt(Number(row.requested_qty))} ${row.requested_unit || ""}` : row.requested_unit || "Quantity not structured"}</small>
                    </div>
                    <div className={styles.arrow}>→</div>
                    <div className={styles.offered}>
                      {row.product_id ? <>
                        <span>{matchTypeLabel(row.match_type)} · {Math.round(Number(row.match_score || 0) * 100)}%</span>
                        <strong>{row.product_name}</strong>
                        <small>{row.product_sku}{row.product_nupco_code ? ` · NUPCO ${row.product_nupco_code}` : ""}{row.manufacturer_part_number ? ` · MPN ${row.manufacturer_part_number}` : ""}</small>
                        <small>{row.manufacturer || row.brand || "Manufacturer not stored"} · available {fmt(Number(row.available_stock || 0))}</small>
                      </> : <>
                        <span>No strong catalog match</span>
                        <strong>Source externally / review catalog gap</strong>
                        <small>This line remains unmatched rather than being forced to a weak product candidate.</small>
                      </>}
                    </div>
                  </article>)}
                  {!bucketRows.length ? <div className={styles.emptyRows}>No items in this bucket.</div> : null}
                </div>}

                <div className={styles.pagination}>
                  <span>{currentTotal ? `${bucketPage * 50 + 1}–${Math.min((bucketPage + 1) * 50, currentTotal)} of ${fmt(currentTotal)}` : "0 items"}</span>
                  <div><button disabled={bucketPage === 0 || bucketLoading} onClick={() => void changeBucket(bucket, Math.max(0, bucketPage - 1))}>Previous</button><button disabled={!canNext || bucketLoading} onClick={() => void changeBucket(bucket, bucketPage + 1)}>Next</button></div>
                </div>
              </>}
            </div>
          </section>
        </div>
      </section>
    </div> : null}
  </>;
}
