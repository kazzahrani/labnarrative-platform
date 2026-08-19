"use client";

import { createClient, type Session } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import styles from "./automatic-tender-feed.module.css";

type Org = { id: string; name: string };
type MatchProduct = { id: string; sku: string; name: string; category: string | null; brand: string | null; available_stock: number };
type RequirementMatch = {
  requirement_id: string;
  requirement: string;
  confidence: number;
  possible_match: boolean;
  match_score: number;
  product: MatchProduct | null;
};
type FeedOpportunity = {
  id: string;
  source_record_id: string | null;
  reference_number: string | null;
  tender_number: string | null;
  title_ar: string;
  title_en: string | null;
  buyer_ar: string | null;
  buyer_en: string | null;
  purpose_ar: string | null;
  purpose_en: string | null;
  source_status_text: string | null;
  verification_state: string;
  source_url: string;
  published_at: string | null;
  deadline_at: string | null;
  days_left: number | null;
  catalog_products: number;
  requirement_count: number;
  matched_signal_count: number;
  metadata_coverage: number;
  score: number;
  score_components: { metadata_coverage: number; timing_fit: number; source_verification: number; metadata_completeness: number };
  recommendation: "BID" | "REVIEW" | "NO-BID";
  decision_basis: string;
  reasons: string[];
  requirement_matches: RequirementMatch[];
  source: { name: string; base_url: string; cadence: string | null; attribution_text: string | null } | null;
  saved_opportunity: { id: string; source_tender_id: string | null; status: string } | null;
};
type FeedPayload = {
  generated_at: string;
  org_id: string;
  catalog_products: number;
  scanned: number;
  new_matches: number;
  opportunities: FeedOpportunity[];
  caveat: string;
};

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
const dateLabel = (value: string | null) => value ? new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value)) : "Verify at source";

export default function AutomaticTenderFeed() {
  const [session, setSession] = useState<Session | null>(null);
  const [open, setOpen] = useState(false);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [orgId, setOrgId] = useState("");
  const [feed, setFeed] = useState<FeedPayload | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (open && session) void loadOrganizations();
  }, [open, session]);

  useEffect(() => {
    if (open && session && orgId) void loadFeed(orgId, session);
  }, [open, orgId, session]);

  async function loadOrganizations() {
    setError("");
    const { data: memberships, error: membershipError } = await supabase
      .from("ln_organization_members")
      .select("org_id")
      .eq("status", "active");
    if (membershipError) { setError(membershipError.message); return; }
    const ids = (memberships ?? []).map((row) => String(row.org_id));
    if (!ids.length) { setOrgs([]); setOrgId(""); return; }
    const { data, error: orgError } = await supabase
      .from("ln_organizations")
      .select("id,name")
      .in("id", ids)
      .order("created_at");
    if (orgError) { setError(orgError.message); return; }
    const rows = (data ?? []) as Org[];
    setOrgs(rows);
    setOrgId((current) => current && rows.some((org) => org.id === current) ? current : rows[0]?.id ?? "");
  }

  async function loadFeed(nextOrgId: string, activeSession: Session) {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/platform/tenders/feed?org_id=${encodeURIComponent(nextOrgId)}`, {
        cache: "no-store",
        headers: { Authorization: `Bearer ${activeSession.access_token}` },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(payload.error || "Unable to load opportunity feed."));
      setFeed(payload as FeedPayload);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load opportunity feed.");
      setFeed(null);
    } finally {
      setLoading(false);
    }
  }

  function opportunityRecord(item: FeedOpportunity, status: "discovered" | "reviewing") {
    return {
      org_id: orgId,
      source_tender_id: item.id,
      external_ref: item.reference_number || item.tender_number || item.source_record_id,
      buyer: item.buyer_en || item.buyer_ar || "Government entity",
      title: item.title_en || item.title_ar,
      source: item.source?.name || "Official tender source",
      source_url: item.source_url,
      published_at: item.published_at,
      deadline_at: item.deadline_at,
      estimated_value: null,
      match_score: item.metadata_coverage,
      bid_score: item.score,
      matched_items: item.matched_signal_count,
      total_items: item.requirement_count,
      status,
      recommendation: item.recommendation,
      summary: `${item.metadata_coverage}% public-metadata overlap across ${item.requirement_count} stored requirement signals. BoQ analysis is still required for technical coverage.`,
      reasons: item.reasons,
    };
  }

  async function ensureOpportunity(item: FeedOpportunity, status: "discovered" | "reviewing") {
    if (item.saved_opportunity?.id) return item.saved_opportunity.id;
    const { data, error: insertError } = await supabase
      .from("ln_opportunities")
      .insert(opportunityRecord(item, status))
      .select("id")
      .single();
    if (insertError) {
      if (insertError.code === "23505") {
        const { data: existing, error: existingError } = await supabase
          .from("ln_opportunities")
          .select("id")
          .eq("org_id", orgId)
          .eq("source_tender_id", item.id)
          .single();
        if (existingError) throw existingError;
        return String(existing.id);
      }
      throw insertError;
    }
    return String(data.id);
  }

  async function saveForReview(item: FeedOpportunity) {
    setBusyId(item.id);
    setError("");
    try {
      await ensureOpportunity(item, "reviewing");
      if (session) await loadFeed(orgId, session);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save the opportunity.");
    } finally {
      setBusyId(null);
    }
  }

  async function startBid(item: FeedOpportunity) {
    setBusyId(item.id);
    setError("");
    try {
      const opportunityId = await ensureOpportunity(item, "discovered");
      const { error: decisionError } = await supabase.from("tender_decisions").insert({
        org_id: orgId,
        tender_id: item.id,
        decision: "BID",
        note: "Human Start Bid action from the LabNarrative automatic opportunity feed.",
        decided_by: session?.user.id ?? null,
      });
      if (decisionError) throw decisionError;
      const { error: bidError } = await supabase.rpc("ln_start_bid", { p_opportunity_id: opportunityId });
      if (bidError) throw bidError;
      window.location.reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not start the bid workflow.");
      setBusyId(null);
    }
  }

  if (!session) return null;

  return <>
    <button className={styles.launcher} onClick={() => { setOpen(true); setError(""); }}>
      ✦ Opportunity Feed{feed?.new_matches ? <span>{feed.new_matches}</span> : null}
    </button>
    {open ? <div className={styles.backdrop} onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className={styles.modal}>
        <header className={styles.head}>
          <div>
            <div className={styles.eyebrow}>LabNarrative · Automatic Saudi Tender Intelligence</div>
            <h2>{feed?.new_matches ? `${feed.new_matches} new opportunities matched to your company` : "Official-source opportunities, matched to your company"}</h2>
            <p>One shared public tender record can match each LabNarrative organization differently. Scores below use your organization catalog and keep source verification separate from the commercial decision.</p>
          </div>
          <button className={styles.close} onClick={() => setOpen(false)}>×</button>
        </header>

        <div className={styles.body}>
          <div className={styles.toolbar}>
            <label><span>Organization</span><select value={orgId} onChange={(event) => { setOrgId(event.target.value); setFeed(null); }}>
              {orgs.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}
            </select></label>
            <div className={styles.stat}><span>Catalog</span><strong>{feed ? `${feed.catalog_products} active products` : "—"}</strong></div>
            <div className={styles.stat}><span>Shared records scanned</span><strong>{feed?.scanned ?? "—"}</strong></div>
            <button className={styles.refresh} disabled={loading || !session || !orgId} onClick={() => session && void loadFeed(orgId, session)}>{loading ? "Refreshing…" : "Refresh"}</button>
          </div>

          {error ? <div className={styles.error}>{error}</div> : null}
          {loading && !feed ? <div className={styles.loading}>Matching official-source records against this organization…</div> : null}
          {!loading && feed && !feed.opportunities.length ? <div className={styles.empty}>No shared tender records are available yet. The feed will remain empty rather than generate fictional opportunities.</div> : null}

          {feed ? <div className={styles.feed}>
            {feed.opportunities.map((item) => {
              const expanded = openId === item.id;
              const expired = item.days_left !== null && item.days_left < 0;
              const busy = busyId === item.id;
              return <article className={`${styles.card} ${expired ? styles.expired : ""}`} key={item.id}>
                <button className={styles.cardTop} onClick={() => setOpenId(expanded ? null : item.id)}>
                  <div className={styles.score}><strong>{item.score}%</strong><span>opportunity score</span></div>
                  <div className={styles.copy}>
                    <span>{item.buyer_en || item.buyer_ar || "Government entity"}</span>
                    <h3>{item.title_en || item.title_ar}</h3>
                    <p>{item.reference_number ? `Ref ${item.reference_number}` : item.tender_number ? `Tender ${item.tender_number}` : "Official source record"} · {item.days_left === null ? "deadline needs verification" : item.days_left < 0 ? "stored deadline passed" : `${item.days_left} days left`}</p>
                  </div>
                  <div className={styles.coverage}><strong>{item.metadata_coverage}%</strong><span>metadata overlap</span><small>{item.matched_signal_count}/{item.requirement_count} signals</small></div>
                  <div className={`${styles.decision} ${styles[item.recommendation.replace("-", "").toLowerCase()]}`}>{item.recommendation}</div>
                  <span className={styles.chevron}>{expanded ? "−" : "+"}</span>
                </button>

                {expanded ? <div className={styles.detail}>
                  <div className={styles.grid}>
                    <div><span>Published</span><strong>{dateLabel(item.published_at)}</strong></div>
                    <div><span>Deadline</span><strong>{dateLabel(item.deadline_at)}</strong></div>
                    <div><span>Source status</span><strong>{item.source_status_text || "Verify at source"}</strong></div>
                    <div><span>Verification</span><strong>{item.verification_state.replaceAll("_", " ")}</strong></div>
                  </div>

                  <div className={styles.scoreBreakdown}>
                    <div><span>Catalog metadata</span><strong>{item.score_components.metadata_coverage}%</strong></div>
                    <div><span>Preparation window</span><strong>{item.score_components.timing_fit}%</strong></div>
                    <div><span>Source verification</span><strong>{item.score_components.source_verification}%</strong></div>
                    <div><span>Metadata completeness</span><strong>{item.score_components.metadata_completeness}%</strong></div>
                  </div>

                  <div className={styles.reasonBox}>
                    <strong>Why LabNarrative recommends {item.recommendation}</strong>
                    {item.reasons.map((reason) => <p key={reason}>• {reason}</p>)}
                  </div>

                  {item.requirement_matches.length ? <div className={styles.matches}>
                    <div className={styles.sectionHead}><strong>Public requirement signals</strong><span>Possible product overlap ≠ technical equivalence</span></div>
                    {item.requirement_matches.map((match) => <div className={styles.matchRow} key={match.requirement_id}>
                      <span className={match.possible_match ? styles.hit : styles.miss}>{match.possible_match ? "✓" : "—"}</span>
                      <div><strong>{match.requirement}</strong><small>{Math.round(match.confidence * 100)}% source extraction confidence</small></div>
                      <div>{match.product ? <><strong>{match.product.name}</strong><small>{match.product.sku}{match.product.brand ? ` · ${match.product.brand}` : ""} · available {match.product.available_stock}</small></> : <strong>No catalog signal</strong>}</div>
                    </div>)}
                  </div> : null}

                  <div className={styles.footer}>
                    <div className={styles.source}>
                      <span>Provenance</span>
                      <strong>{item.source?.name || "Official tender source"}</strong>
                      <small>{item.source?.attribution_text || "Source retained by LabNarrative for audit."}</small>
                    </div>
                    <div className={styles.actions}>
                      <a href={item.source_url} target="_blank" rel="noreferrer">Open source ↗</a>
                      <button disabled={busy || Boolean(item.saved_opportunity)} onClick={() => void saveForReview(item)}>{item.saved_opportunity ? "Saved to Opportunities" : busy ? "Saving…" : "Review"}</button>
                      <button className={styles.primary} disabled={busy || expired} onClick={() => void startBid(item)}>{busy ? "Working…" : "Start Bid"}</button>
                    </div>
                  </div>
                </div> : null}
              </article>;
            })}
          </div> : null}

          {feed ? <div className={styles.caveat}>{feed.caveat}</div> : null}
        </div>
      </section>
    </div> : null}
  </>;
}
