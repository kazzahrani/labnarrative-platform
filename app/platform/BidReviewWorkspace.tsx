"use client";

import { createClient, type Session } from "@supabase/supabase-js";
import { useEffect, useMemo, useState } from "react";
import styles from "./bid-review.module.css";

type Org = { id: string; name: string };
type Tender = {
  id: string;
  org_id: string;
  ref: string;
  buyer: string;
  title: string;
  deadline_at: string | null;
  readiness: number;
  missing_count: number;
  status: string;
};
type Bucket = "we_supply" | "possible_equivalent" | "missing" | "source_externally" | "ignore";
type Summary = {
  total: number;
  we_supply: number;
  possible_equivalent: number;
  missing: number;
  source_externally: number;
  ignored: number;
  reviewed: number;
};
type BidRow = {
  requirement_id: string;
  source_tender_id: string;
  item_code: string | null;
  requested_item: string;
  quantity: number | null;
  unit: string | null;
  bucket: Bucket;
  reviewed: boolean;
  product_id: string | null;
  sku: string | null;
  product_name: string | null;
  manufacturer: string | null;
  manufacturer_part_number: string | null;
  product_nupco_code: string | null;
  match_type: string | null;
  match_score: number;
  available_stock: number;
  note: string | null;
};
type QuoteInfo = { ref: string; items_count: number; verified_count: number; error_count: number; amount: number; status: string };

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
const PAGE_SIZE = 80;
const emptySummary: Summary = { total: 0, we_supply: 0, possible_equivalent: 0, missing: 0, source_externally: 0, ignored: 0, reviewed: 0 };
const number = (value: number | null | undefined) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Number(value || 0));
const date = (value: string | null) => value ? new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value)) : "—";
const label = (value: string | null) => value ? value.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase()) : "—";

export default function BidReviewWorkspace() {
  const [session, setSession] = useState<Session | null>(null);
  const [open, setOpen] = useState(false);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [orgId, setOrgId] = useState("");
  const [tenders, setTenders] = useState<Tender[]>([]);
  const [tenderId, setTenderId] = useState("");
  const [summary, setSummary] = useState<Summary>(emptySummary);
  const [bucket, setBucket] = useState<Bucket>("we_supply");
  const [rows, setRows] = useState<BidRow[]>([]);
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [quote, setQuote] = useState<QuoteInfo | null>(null);

  const selectedTender = useMemo(() => tenders.find((item) => item.id === tenderId) ?? null, [tenders, tenderId]);
  const bucketCount = bucket === "ignore" ? summary.ignored : summary[bucket];
  const resolved = Math.max(0, summary.total - summary.missing - summary.possible_equivalent);
  const reviewProgress = summary.total ? Math.round((resolved / summary.total) * 100) : 0;

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (open && session) void loadOrganizations();
  }, [open, session]);

  useEffect(() => {
    if (open && orgId) void loadTenders(orgId);
  }, [open, orgId]);

  useEffect(() => {
    if (open && tenderId) {
      setOffset(0);
      setQuote(null);
      void loadReview(tenderId, bucket, search, 0);
    }
  }, [open, tenderId]);

  useEffect(() => {
    if (open && tenderId) void loadReview(tenderId, bucket, search, offset);
  }, [bucket, offset]);

  async function loadOrganizations() {
    setError("");
    const { data: memberships, error: membershipError } = await supabase.from("ln_organization_members").select("org_id").eq("status", "active");
    if (membershipError) { setError(membershipError.message); return; }
    const ids = [...new Set((memberships ?? []).map((row) => String(row.org_id)))];
    if (!ids.length) { setOrgs([]); setOrgId(""); return; }
    const { data, error: orgError } = await supabase.from("ln_organizations").select("id,name").in("id", ids).order("created_at");
    if (orgError) { setError(orgError.message); return; }
    const next = (data ?? []) as Org[];
    setOrgs(next);
    setOrgId((current) => current && next.some((org) => org.id === current) ? current : next[0]?.id ?? "");
  }

  async function loadTenders(nextOrgId: string) {
    setError("");
    const { data, error: tenderError } = await supabase
      .from("ln_tenders")
      .select("id,org_id,ref,buyer,title,deadline_at,readiness,missing_count,status")
      .eq("org_id", nextOrgId)
      .not("opportunity_id", "is", null)
      .order("created_at", { ascending: false });
    if (tenderError) { setError(tenderError.message); return; }
    const next = (data ?? []) as Tender[];
    setTenders(next);
    setTenderId((current) => current && next.some((item) => item.id === current) ? current : next[0]?.id ?? "");
  }

  async function loadReview(nextTenderId: string, nextBucket = bucket, nextSearch = search, nextOffset = offset) {
    setLoading(true);
    setError("");
    try {
      const [summaryResult, rowsResult] = await Promise.all([
        supabase.rpc("ln_get_bid_review_summary", { p_ln_tender_id: nextTenderId }),
        supabase.rpc("ln_get_bid_review", {
          p_ln_tender_id: nextTenderId,
          p_bucket: nextBucket,
          p_search: nextSearch.trim() || null,
          p_limit: PAGE_SIZE,
          p_offset: nextOffset,
        }),
      ]);
      if (summaryResult.error) throw summaryResult.error;
      if (rowsResult.error) throw rowsResult.error;
      setSummary({ ...emptySummary, ...((summaryResult.data ?? {}) as Partial<Summary>) });
      setRows((rowsResult.data ?? []) as BidRow[]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load bid review.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  async function applySearch() {
    setOffset(0);
    if (tenderId) await loadReview(tenderId, bucket, search, 0);
  }

  async function setDisposition(row: BidRow, disposition: "we_supply" | "source_externally" | "ignore" | "reset") {
    if (!tenderId) return;
    setBusyId(row.requirement_id);
    setError("");
    setNotice("");
    try {
      const { error: reviewError } = await supabase.rpc("ln_set_bid_item_disposition", {
        p_ln_tender_id: tenderId,
        p_requirement_id: row.requirement_id,
        p_disposition: disposition,
        p_product_id: disposition === "we_supply" ? row.product_id : null,
        p_note: null,
      });
      if (reviewError) throw reviewError;
      setNotice(disposition === "source_externally" ? "Line moved to Source Externally." : disposition === "ignore" ? "Line excluded from this bid review." : disposition === "reset" ? "Manual review reset." : "Line confirmed as We Supply.");
      await loadReview(tenderId, bucket, search, offset);
      await loadTenders(orgId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to update bid line.");
    } finally {
      setBusyId(null);
    }
  }

  async function buildQuotation() {
    if (!tenderId) return;
    setBuilding(true);
    setError("");
    setNotice("");
    try {
      const { data: quotationId, error: quoteError } = await supabase.rpc("ln_build_quotation_from_bid", { p_ln_tender_id: tenderId });
      if (quoteError) throw quoteError;
      const { data, error: loadError } = await supabase.from("ln_quotations").select("ref,items_count,verified_count,error_count,amount,status").eq("id", String(quotationId)).single();
      if (loadError) throw loadError;
      setQuote(data as QuoteInfo);
      setNotice("Draft quotation rebuilt from the reviewed tender lines. Prices remain blank where the catalog has no verified selling price.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to build quotation.");
    } finally {
      setBuilding(false);
    }
  }

  if (!session) return null;

  const tabs: Array<{ id: Bucket; name: string; count: number }> = [
    { id: "we_supply", name: "We Supply", count: summary.we_supply },
    { id: "possible_equivalent", name: "Possible Equivalent", count: summary.possible_equivalent },
    { id: "missing", name: "Missing", count: summary.missing },
    { id: "source_externally", name: "Source Externally", count: summary.source_externally },
    { id: "ignore", name: "Ignored", count: summary.ignored },
  ];

  return <>
    <button className={styles.launcher} onClick={() => { setOpen(true); setError(""); setNotice(""); }}>▤ Bid Review{summary.we_supply ? <span>{summary.we_supply}</span> : null}</button>
    {open ? <div className={styles.backdrop} onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className={styles.modal}>
        <header className={styles.head}>
          <div>
            <div className={styles.eyebrow}>LabNarrative · Tender Execution</div>
            <h2>Bid Review</h2>
            <p>Turn tender intelligence into an executable bid: confirm what the company supplies, flag lines that require external sourcing, exclude irrelevant lines, then build a quotation from only the reviewed scope.</p>
          </div>
          <button className={styles.close} onClick={() => setOpen(false)}>×</button>
        </header>

        <div className={styles.body}>
          <div className={styles.toolbar}>
            <label><span>Organization</span><select value={orgId} onChange={(event) => { setOrgId(event.target.value); setTenderId(""); setSummary(emptySummary); setRows([]); }}>{orgs.map((org) => <option value={org.id} key={org.id}>{org.name}</option>)}</select></label>
            <label><span>Operational tender</span><select value={tenderId} onChange={(event) => setTenderId(event.target.value)}>{tenders.map((item) => <option value={item.id} key={item.id}>{item.ref} · {item.title}</option>)}</select></label>
            <button className={styles.refresh} disabled={!tenderId || loading} onClick={() => tenderId && void loadReview(tenderId, bucket, search, offset)}>{loading ? "Syncing…" : "Refresh"}</button>
          </div>

          {selectedTender ? <section className={styles.hero}>
            <div className={styles.heroCopy}>
              <span>{selectedTender.ref} · {selectedTender.buyer}</span>
              <strong>{selectedTender.title}</strong>
              <small>Deadline {date(selectedTender.deadline_at)} · {label(selectedTender.status)}</small>
            </div>
            <div className={styles.progressCard}><span>Review readiness</span><strong>{reviewProgress}%</strong><div><i style={{ width: `${reviewProgress}%` }} /></div></div>
            <div className={styles.heroActions}><button className={styles.primary} disabled={building || !summary.we_supply && !summary.source_externally} onClick={() => void buildQuotation()}>{building ? "Building…" : "Build Quotation"}</button></div>
          </section> : null}

          <section className={styles.metrics}>
            <article><span>Tender lines</span><strong>{number(summary.total)}</strong><small>Shared source evidence</small></article>
            <article><span>We supply</span><strong>{number(summary.we_supply)}</strong><small>Exact / confirmed catalog fit</small></article>
            <article><span>Possible equivalent</span><strong>{number(summary.possible_equivalent)}</strong><small>Needs human technical review</small></article>
            <article><span>Missing</span><strong>{number(summary.missing)}</strong><small>Unresolved scope</small></article>
            <article><span>Source externally</span><strong>{number(summary.source_externally)}</strong><small>Human sourcing decision</small></article>
            <article><span>Ignored</span><strong>{number(summary.ignored)}</strong><small>Excluded by reviewer</small></article>
          </section>

          {error ? <div className={styles.error}>{error}</div> : null}
          {notice ? <div className={styles.notice}>{notice}</div> : null}
          {quote ? <div className={styles.quoteResult}><div><span>Draft quotation</span><strong>{quote.ref}</strong></div><div><span>Lines</span><strong>{quote.items_count}</strong></div><div><span>We supply</span><strong>{quote.verified_count}</strong></div><div><span>Source externally</span><strong>{quote.error_count}</strong></div><div><span>Priced amount</span><strong>{quote.amount ? number(quote.amount) : "Not priced"}</strong></div></div> : null}

          <div className={styles.tabs}>{tabs.map((tab) => <button key={tab.id} className={bucket === tab.id ? styles.activeTab : ""} onClick={() => { setBucket(tab.id); setOffset(0); }}><span>{tab.name}</span><b>{number(tab.count)}</b></button>)}</div>

          <div className={styles.searchbar}>
            <input value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void applySearch(); }} placeholder="Search NUPCO code, tender description or SKU…" />
            <button onClick={() => void applySearch()}>Search</button>
            {search ? <button className={styles.secondary} onClick={() => { setSearch(""); setOffset(0); if (tenderId) void loadReview(tenderId, bucket, "", 0); }}>Clear</button> : null}
          </div>

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>Tender requirement</th><th>Requested</th><th>Catalog / sourcing</th><th>Evidence</th><th>Action</th></tr></thead>
              <tbody>{rows.map((row) => {
                const busy = busyId === row.requirement_id;
                return <tr key={row.requirement_id}>
                  <td><strong>{row.item_code || "No item code"}</strong><small>{row.requested_item}</small></td>
                  <td><strong>{row.quantity == null ? "—" : number(row.quantity)}</strong><small>{row.unit || "Unit not normalized"}</small></td>
                  <td>{row.product_name ? <><strong>{row.product_name}</strong><small>{row.sku || "No SKU"}{row.manufacturer ? ` · ${row.manufacturer}` : ""}</small><small>{row.product_nupco_code ? `NUPCO ${row.product_nupco_code}` : "No supplier NUPCO code"} · stock {number(row.available_stock)}</small></> : <><strong>{row.bucket === "source_externally" ? "External sourcing required" : row.bucket === "ignore" ? "Excluded from bid" : "No strong catalog match"}</strong><small>Supplier/product not selected</small></>}</td>
                  <td><span className={`${styles.evidence} ${row.match_type?.includes("exact") ? styles.exact : ""}`}>{row.match_type ? label(row.match_type) : "No match"}</span><small>{row.match_score ? `${Math.round(Number(row.match_score) * 100)}% signal` : row.reviewed ? "Human reviewed" : "Unreviewed"}</small></td>
                  <td><div className={styles.actions}>
                    {row.bucket === "possible_equivalent" ? <button disabled={busy || !row.product_id} onClick={() => void setDisposition(row, "we_supply")}>Accept supply</button> : null}
                    {!["source_externally", "ignore"].includes(row.bucket) ? <button disabled={busy} onClick={() => void setDisposition(row, "source_externally")}>Source externally</button> : null}
                    {row.bucket !== "ignore" ? <button disabled={busy} onClick={() => void setDisposition(row, "ignore")}>Ignore</button> : null}
                    {row.reviewed ? <button className={styles.secondary} disabled={busy} onClick={() => void setDisposition(row, "reset")}>Reset</button> : null}
                  </div></td>
                </tr>;
              })}</tbody>
            </table>
            {!loading && !rows.length ? <div className={styles.empty}>No rows in this bucket{search ? " for this search" : ""}.</div> : null}
            {loading ? <div className={styles.loading}>Loading reviewed tender evidence…</div> : null}
          </div>

          <div className={styles.pagination}><span>Showing {rows.length ? `${offset + 1}–${offset + rows.length}` : "0"} of {number(bucketCount)} in {label(bucket)}</span><div><button disabled={offset === 0 || loading} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>Previous</button><button disabled={loading || offset + rows.length >= bucketCount} onClick={() => setOffset(offset + PAGE_SIZE)}>Next</button></div></div>
          <p className={styles.caveat}>“We Supply” means the current organization catalog has an exact/confirmed product match; it does not claim inventory availability. “Source Externally” is a human sourcing decision. Prices are never fabricated.</p>
        </div>
      </section>
    </div> : null}
  </>;
}
