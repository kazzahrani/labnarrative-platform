"use client";

import { createClient, type Session } from "@supabase/supabase-js";
import { useEffect, useMemo, useState } from "react";
import styles from "./quotation-pricing.module.css";

type Org = { id: string; name: string; currency: string };
type Quote = {
  id: string;
  org_id: string;
  tender_id: string | null;
  ref: string;
  customer_name: string;
  amount: number;
  items_count: number;
  verified_count: number;
  error_count: number;
  priced_count: number;
  costed_count: number;
  gross_cost: number;
  gross_profit: number | null;
  gross_margin_pct: number | null;
  status: string;
  next_action: string | null;
};
type QuoteItem = {
  id: string;
  quotation_id: string;
  disposition: "we_supply" | "source_externally";
  item_code: string | null;
  requested_item: string;
  quantity: number | null;
  unit: string | null;
  sku: string | null;
  product_name: string | null;
  manufacturer: string | null;
  manufacturer_part_number: string | null;
  nupco_code: string | null;
  match_type: string | null;
  match_score: number;
  unit_cost: number | null;
  unit_price: number | null;
  line_total: number | null;
};
type Draft = { cost: string; price: string };

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
const number = (value: number | null | undefined, decimals = 0) => new Intl.NumberFormat("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(Number(value || 0));
const money = (value: number | null | undefined, currency = "SAR") => new Intl.NumberFormat("en-SA", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(value || 0));
const label = (value: string | null) => value ? value.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "—";

export default function QuotationPricingWorkspace() {
  const [session, setSession] = useState<Session | null>(null);
  const [open, setOpen] = useState(false);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [orgId, setOrgId] = useState("");
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [quoteId, setQuoteId] = useState("");
  const [items, setItems] = useState<QuoteItem[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [readyBusy, setReadyBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const selectedOrg = useMemo(() => orgs.find((org) => org.id === orgId) ?? null, [orgs, orgId]);
  const selectedQuote = useMemo(() => quotes.find((quote) => quote.id === quoteId) ?? null, [quotes, quoteId]);
  const pricingPct = selectedQuote?.items_count ? Math.round((selectedQuote.priced_count / selectedQuote.items_count) * 100) : 0;
  const costingPct = selectedQuote?.items_count ? Math.round((selectedQuote.costed_count / selectedQuote.items_count) * 100) : 0;

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => { if (open && session) void loadOrganizations(); }, [open, session]);
  useEffect(() => { if (open && orgId) void loadQuotes(orgId); }, [open, orgId]);
  useEffect(() => { if (open && quoteId) void loadItems(quoteId); }, [open, quoteId]);

  async function loadOrganizations() {
    setError("");
    const { data: memberships, error: memberError } = await supabase.from("ln_organization_members").select("org_id").eq("status", "active");
    if (memberError) { setError(memberError.message); return; }
    const ids = [...new Set((memberships ?? []).map((row) => String(row.org_id)))];
    if (!ids.length) return;
    const { data, error } = await supabase.from("ln_organizations").select("id,name,currency").in("id", ids).order("created_at");
    if (error) { setError(error.message); return; }
    const next = (data ?? []) as Org[];
    setOrgs(next);
    setOrgId((current) => current && next.some((org) => org.id === current) ? current : next[0]?.id ?? "");
  }

  async function loadQuotes(nextOrgId: string) {
    setError("");
    const { data, error } = await supabase.from("ln_quotations")
      .select("id,org_id,tender_id,ref,customer_name,amount,items_count,verified_count,error_count,priced_count,costed_count,gross_cost,gross_profit,gross_margin_pct,status,next_action")
      .eq("org_id", nextOrgId).order("created_at", { ascending: false });
    if (error) { setError(error.message); return; }
    const next = (data ?? []) as Quote[];
    setQuotes(next);
    setQuoteId((current) => current && next.some((quote) => quote.id === current) ? current : next[0]?.id ?? "");
  }

  async function loadItems(nextQuoteId: string) {
    setLoading(true); setError("");
    const { data, error } = await supabase.from("ln_quotation_items")
      .select("id,quotation_id,disposition,item_code,requested_item,quantity,unit,sku,product_name,manufacturer,manufacturer_part_number,nupco_code,match_type,match_score,unit_cost,unit_price,line_total")
      .eq("quotation_id", nextQuoteId).order("item_code", { ascending: true, nullsFirst: false });
    if (error) { setError(error.message); setLoading(false); return; }
    const next = (data ?? []) as QuoteItem[];
    setItems(next);
    setDrafts(Object.fromEntries(next.map((item) => [item.id, { cost: item.unit_cost == null ? "" : String(item.unit_cost), price: item.unit_price == null ? "" : String(item.unit_price) }])));
    setLoading(false);
  }

  async function refresh() {
    if (!orgId) return;
    await loadQuotes(orgId);
    if (quoteId) await loadItems(quoteId);
  }

  async function saveItem(item: QuoteItem) {
    const draft = drafts[item.id] ?? { cost: "", price: "" };
    const cost = draft.cost.trim() === "" ? null : Number(draft.cost);
    const price = draft.price.trim() === "" ? null : Number(draft.price);
    if ((cost != null && (!Number.isFinite(cost) || cost < 0)) || (price != null && (!Number.isFinite(price) || price < 0))) { setError("Cost and selling price must be non-negative numbers."); return; }
    setBusyId(item.id); setError(""); setNotice("");
    try {
      const { error } = await supabase.rpc("ln_update_quotation_item_pricing", { p_item_id: item.id, p_unit_cost: cost, p_unit_price: price });
      if (error) throw error;
      setNotice(`Saved pricing for ${item.item_code || item.sku || "quotation line"}.`);
      await loadQuotes(orgId);
      await loadItems(quoteId);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to save line pricing."); }
    finally { setBusyId(null); }
  }

  async function markReady() {
    if (!quoteId) return;
    setReadyBusy(true); setError(""); setNotice("");
    try {
      const { error } = await supabase.rpc("ln_mark_quotation_ready", { p_quotation_id: quoteId });
      if (error) throw error;
      setNotice("Quotation pricing is complete and the draft is marked ready for commercial approval.");
      await loadQuotes(orgId);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to mark quotation ready."); }
    finally { setReadyBusy(false); }
  }

  if (!session) return null;
  const currency = selectedOrg?.currency || "SAR";

  return <>
    <button className={styles.launcher} onClick={() => { setOpen(true); setError(""); setNotice(""); }}>﷼ Quotation Pricing{selectedQuote?.items_count ? <span>{selectedQuote.priced_count}/{selectedQuote.items_count}</span> : null}</button>
    {open ? <div className={styles.backdrop} onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className={styles.modal}>
        <header className={styles.head}><div><div className={styles.eyebrow}>LabNarrative · Commercial Review</div><h2>Quotation Pricing</h2><p>Price only the reviewed bid scope. Costs and selling prices are entered by the commercial team; LabNarrative computes totals and margin but never invents prices.</p></div><button className={styles.close} onClick={() => setOpen(false)}>×</button></header>
        <div className={styles.body}>
          <div className={styles.toolbar}>
            <label><span>Organization</span><select value={orgId} onChange={(e) => { setOrgId(e.target.value); setQuoteId(""); setItems([]); }}>{orgs.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}</select></label>
            <label><span>Quotation</span><select value={quoteId} onChange={(e) => setQuoteId(e.target.value)}>{quotes.map((quote) => <option key={quote.id} value={quote.id}>{quote.ref} · {quote.customer_name}</option>)}</select></label>
            <button className={styles.refresh} disabled={loading} onClick={() => void refresh()}>{loading ? "Syncing…" : "Refresh"}</button>
          </div>

          {selectedQuote ? <section className={styles.hero}>
            <div><span>{selectedQuote.ref} · {selectedQuote.customer_name}</span><strong>{label(selectedQuote.status)}</strong><small>{selectedQuote.next_action || "—"}</small></div>
            <article><span>Quoted amount</span><strong>{money(selectedQuote.amount, currency)}</strong><small>{selectedQuote.priced_count}/{selectedQuote.items_count} lines priced</small></article>
            <article><span>Pricing</span><strong>{pricingPct}%</strong><small>selling price completeness</small></article>
            <article><span>Costing</span><strong>{costingPct}%</strong><small>cost completeness</small></article>
            <article><span>Gross margin</span><strong>{selectedQuote.gross_margin_pct == null ? "Pending" : `${number(selectedQuote.gross_margin_pct, 2)}%`}</strong><small>{selectedQuote.gross_profit == null ? "Requires complete costs + prices" : money(selectedQuote.gross_profit, currency)}</small></article>
            <button className={styles.primary} disabled={readyBusy || selectedQuote.priced_count !== selectedQuote.items_count || !selectedQuote.items_count} onClick={() => void markReady()}>{readyBusy ? "Checking…" : "Mark Ready"}</button>
          </section> : null}

          {error ? <div className={styles.error}>{error}</div> : null}
          {notice ? <div className={styles.notice}>{notice}</div> : null}

          <div className={styles.tableWrap}><table className={styles.table}>
            <thead><tr><th>Requirement / product</th><th>Qty</th><th>Disposition</th><th>Unit cost</th><th>Selling price</th><th>Line total</th><th>Margin</th><th>Action</th></tr></thead>
            <tbody>{items.map((item) => {
              const draft = drafts[item.id] ?? { cost: "", price: "" };
              const cost = draft.cost === "" ? null : Number(draft.cost);
              const price = draft.price === "" ? null : Number(draft.price);
              const total = price != null && Number.isFinite(price) && item.quantity != null ? price * Number(item.quantity) : null;
              const margin = cost != null && price != null && price > 0 && Number.isFinite(cost) && Number.isFinite(price) ? ((price - cost) / price) * 100 : null;
              return <tr key={item.id}>
                <td><strong>{item.item_code || "No item code"}</strong><small>{item.requested_item}</small>{item.product_name ? <small>{item.sku || "No SKU"} · {item.product_name}{item.manufacturer ? ` · ${item.manufacturer}` : ""}</small> : <small>External source not selected yet</small>}</td>
                <td><strong>{item.quantity == null ? "—" : number(item.quantity)}</strong><small>{item.unit || "—"}</small></td>
                <td><span className={`${styles.badge} ${item.disposition === "we_supply" ? styles.good : styles.warn}`}>{label(item.disposition)}</span><small>{item.match_type ? label(item.match_type) : "Human sourcing"}</small></td>
                <td><input type="number" min="0" step="0.01" value={draft.cost} onChange={(e) => setDrafts((current) => ({ ...current, [item.id]: { ...draft, cost: e.target.value } }))} placeholder="Cost" /></td>
                <td><input type="number" min="0" step="0.01" value={draft.price} onChange={(e) => setDrafts((current) => ({ ...current, [item.id]: { ...draft, price: e.target.value } }))} placeholder="Price" /></td>
                <td><strong>{total == null ? "—" : money(total, currency)}</strong></td>
                <td><strong>{margin == null ? "—" : `${number(margin, 2)}%`}</strong></td>
                <td><button className={styles.save} disabled={busyId === item.id} onClick={() => void saveItem(item)}>{busyId === item.id ? "Saving…" : "Save"}</button></td>
              </tr>;
            })}</tbody>
          </table>{!loading && !items.length ? <div className={styles.empty}>No quotation lines yet. Build a quotation from Bid Review first.</div> : null}{loading ? <div className={styles.loading}>Loading quotation lines…</div> : null}</div>
          <p className={styles.caveat}>A quotation can be marked Ready only after every included line has a selling price. Gross margin is intentionally withheld until every line also has a unit cost.</p>
        </div>
      </section>
    </div> : null}
  </>;
}
