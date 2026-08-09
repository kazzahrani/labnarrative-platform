"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { browserSupabase as supabase } from "@/lib/supabase-browser";
import styles from "./proposal-builder.module.css";

type Proposal = {
  id: string;
  prospect_id: string;
  site_id: string | null;
  status: string;
  version: number;
  package_key: "starter" | "standard" | "pro" | "custom";
  package_name: string;
  title: string;
  summary_text: string;
  scope_items: string[];
  deliverable_items: string[];
  process_items: string[];
  timeline_label: string;
  price_amount: number | string;
  currency: string;
  deposit_percent: number | string;
  valid_until: string;
  terms_text: string;
  private_notes: string;
  share_token: string;
  share_enabled: boolean;
  sent_at: string | null;
  first_viewed_at: string | null;
  last_viewed_at: string | null;
  view_count: number;
  accepted_at: string | null;
  accepted_by_name: string | null;
  declined_at: string | null;
  updated_at: string;
};

type Prospect = {
  id: string;
  pi_name: string;
  institution: string;
  department?: string | null;
  email?: string | null;
  research_area?: string | null;
};

type Site = {
  id: string;
  slug: string;
  domain_url?: string | null;
  content?: { labName?: string; headline?: string } | null;
};

type Workspace = {
  stage: string;
  proposal_status: string;
  proposal_amount: number | null;
  proposal_currency: string;
  deposit_percent: number;
  meeting_notes?: string;
  notes?: string;
};

type ProposalData = {
  proposal: Proposal;
  prospect: Prospect;
  site: Site | null;
  workspace: Workspace;
  revisions: Array<{ id: string; version: number; created_at: string }>;
};

type FormState = {
  packageKey: Proposal["package_key"];
  packageName: string;
  title: string;
  summary: string;
  scope: string[];
  deliverables: string[];
  process: string[];
  timeline: string;
  price: string;
  currency: string;
  depositPercent: string;
  validUntil: string;
  terms: string;
  privateNotes: string;
};

const presets = {
  starter: { name: "Starter", price: "250", timeline: "7 days" },
  standard: { name: "Standard", price: "450", timeline: "10 days" },
  pro: { name: "Pro", price: "650", timeline: "14 days" },
} as const;

function proposalToForm(proposal: Proposal): FormState {
  return {
    packageKey: proposal.package_key,
    packageName: proposal.package_name || "Custom",
    title: proposal.title || "Laboratory Website Proposal",
    summary: proposal.summary_text || "",
    scope: Array.isArray(proposal.scope_items) ? proposal.scope_items : [],
    deliverables: Array.isArray(proposal.deliverable_items) ? proposal.deliverable_items : [],
    process: Array.isArray(proposal.process_items) ? proposal.process_items : [],
    timeline: proposal.timeline_label || "",
    price: String(proposal.price_amount ?? ""),
    currency: proposal.currency || "USD",
    depositPercent: String(proposal.deposit_percent ?? 25),
    validUntil: proposal.valid_until || "",
    terms: proposal.terms_text || "",
    privateNotes: proposal.private_notes || "",
  };
}

function label(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Riyadh" }).format(date);
}

function money(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD", maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${currency || "USD"} ${amount.toFixed(2)}`;
  }
}

export default function ProposalBuilderPage() {
  const params = useParams<{ prospectId: string }>();
  const prospectId = String(params?.prospectId || "");
  const [data, setData] = useState<ProposalData | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!prospectId) return;
    setLoading(true);
    setError("");
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      setError("Administrator sign-in is required.");
      setLoading(false);
      return;
    }
    const { data: result, error: rpcError } = await supabase.rpc("sales_proposal_admin_get", { p_prospect_id: prospectId });
    if (rpcError) {
      setError(rpcError.message);
      setLoading(false);
      return;
    }
    const next = result as ProposalData;
    setData(next);
    setForm(proposalToForm(next.proposal));
    setLoading(false);
  }, [prospectId]);

  useEffect(() => { void load(); }, [load]);

  const amount = Number(form?.price || 0) || 0;
  const depositPercent = Number(form?.depositPercent || 0) || 0;
  const depositAmount = useMemo(() => Math.round(amount * depositPercent) / 100, [amount, depositPercent]);
  const balanceAmount = Math.max(0, amount - depositAmount);
  const websiteUrl = data?.site?.domain_url || (data?.site?.slug ? `https://${data.site.slug}.labnarrative.com` : "");
  const shareUrl = data?.proposal.share_enabled ? `https://labnarrative.com/proposal/${data.proposal.share_token}` : "";
  const locked = data?.proposal.status === "accepted" || data?.proposal.status === "declined";

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => current ? { ...current, [key]: value } : current);
    setNotice("");
  }

  function applyPreset(key: "starter" | "standard" | "pro" | "custom") {
    if (!form) return;
    if (key === "custom") {
      setForm({ ...form, packageKey: "custom", packageName: form.packageName || "Custom" });
      return;
    }
    const preset = presets[key];
    setForm({ ...form, packageKey: key, packageName: preset.name, price: preset.price, timeline: preset.timeline });
  }

  function updateList(key: "scope" | "deliverables" | "process", index: number, value: string) {
    if (!form) return;
    const next = [...form[key]];
    next[index] = value;
    update(key, next);
  }

  function addListItem(key: "scope" | "deliverables" | "process") {
    if (!form) return;
    update(key, [...form[key], ""]);
  }

  function removeListItem(key: "scope" | "deliverables" | "process", index: number) {
    if (!form) return;
    update(key, form[key].filter((_, itemIndex) => itemIndex !== index));
  }

  async function save(showNotice = true) {
    if (!data || !form || locked) return false;
    setSaving(true);
    setError("");
    const { data: result, error: rpcError } = await supabase.rpc("sales_proposal_admin_save", {
      p_proposal_id: data.proposal.id,
      p_package_key: form.packageKey,
      p_package_name: form.packageName,
      p_title: form.title,
      p_summary_text: form.summary,
      p_scope_items: form.scope.filter((item) => item.trim()),
      p_deliverable_items: form.deliverables.filter((item) => item.trim()),
      p_process_items: form.process.filter((item) => item.trim()),
      p_timeline_label: form.timeline,
      p_price_amount: amount,
      p_currency: form.currency,
      p_deposit_percent: depositPercent,
      p_valid_until: form.validUntil,
      p_terms_text: form.terms,
      p_private_notes: form.privateNotes,
    });
    if (rpcError) {
      setError(rpcError.message);
      setSaving(false);
      return false;
    }
    const proposal = result as Proposal;
    setData((current) => current ? { ...current, proposal } : current);
    setForm(proposalToForm(proposal));
    if (showNotice) setNotice("Proposal draft saved.");
    setSaving(false);
    return true;
  }

  async function prepareShare() {
    const saved = await save(false);
    if (!saved || !data) return;
    setSaving(true);
    const { data: result, error: rpcError } = await supabase.rpc("sales_proposal_admin_prepare_share", { p_proposal_id: data.proposal.id });
    if (rpcError) setError(rpcError.message);
    else {
      const proposal = result as Proposal;
      setData((current) => current ? { ...current, proposal } : current);
      setForm(proposalToForm(proposal));
      const url = `https://labnarrative.com/proposal/${proposal.share_token}`;
      try { await navigator.clipboard.writeText(url); } catch { /* clipboard can be unavailable */ }
      setNotice("Private proposal link prepared and copied. Nothing has been sent.");
    }
    setSaving(false);
  }

  async function markSent() {
    if (!data) return;
    setSaving(true);
    setError("");
    const { data: result, error: rpcError } = await supabase.rpc("sales_proposal_admin_mark_sent", { p_proposal_id: data.proposal.id });
    if (rpcError) setError(rpcError.message);
    else {
      const proposal = result as Proposal;
      setData((current) => current ? { ...current, proposal } : current);
      setForm(proposalToForm(proposal));
      setNotice("Proposal marked as sent. Sales stage and follow-up action were updated; no email was sent by LabNarrative.");
    }
    setSaving(false);
  }

  async function revokeLink() {
    if (!data) return;
    setSaving(true);
    const { data: result, error: rpcError } = await supabase.rpc("sales_proposal_admin_revoke", { p_proposal_id: data.proposal.id });
    if (rpcError) setError(rpcError.message);
    else {
      const proposal = result as Proposal;
      setData((current) => current ? { ...current, proposal } : current);
      setForm(proposalToForm(proposal));
      setNotice("Client link disabled.");
    }
    setSaving(false);
  }

  async function copyLink() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setNotice("Proposal link copied.");
    } catch {
      setNotice(shareUrl);
    }
  }

  if (loading) return <main className={styles.statePage}>Preparing Proposal Builder…</main>;
  if (!data || !form) return <main className={styles.statePage}><section><h1>Proposal unavailable.</h1><p>{error || "The proposal could not be loaded."}</p><Link href={`/admin/sales/${prospectId}`}>Return to lead</Link></section></main>;

  const { proposal, prospect } = data;

  return (
    <main className={styles.page}>
      <header className={styles.adminBar}>
        <div className={styles.adminBrand}>
          <Link href={`/admin/sales/${prospectId}`}>← Sales workspace</Link>
          <strong>Proposal Builder</strong>
          <span>{prospect.pi_name}</span>
        </div>
        <div className={styles.adminActions}>
          <div className={styles.modeSwitch}>
            <button type="button" className={mode === "edit" ? styles.active : undefined} onClick={() => setMode("edit")}>Edit</button>
            <button type="button" className={mode === "preview" ? styles.active : undefined} onClick={() => setMode("preview")}>Preview</button>
          </div>
          {shareUrl ? <button type="button" onClick={() => void copyLink()}>Copy link</button> : null}
          {shareUrl ? <a href={shareUrl} target="_blank" rel="noreferrer">Open client view ↗</a> : null}
          <button type="button" onClick={() => void save()} disabled={saving || locked}>{saving ? "Saving…" : "Save draft"}</button>
        </div>
      </header>

      <div className={styles.statusStrip}>
        <span className={`${styles.status} ${styles[`status_${proposal.status}`] || ""}`}>{label(proposal.status)}</span>
        <span>Version {proposal.version}</span>
        <span>{proposal.view_count || 0} client view{proposal.view_count === 1 ? "" : "s"}</span>
        {proposal.last_viewed_at ? <span>Last viewed {formatDate(proposal.last_viewed_at)}</span> : null}
        {locked ? <strong>This proposal is locked.</strong> : null}
      </div>

      {notice ? <p className={styles.notice}>{notice}</p> : null}
      {error ? <p className={styles.error}>{error}</p> : null}

      <section className={styles.proposalPaper} data-mode={mode}>
        <header className={styles.proposalHeader}>
          <div>
            <div className={styles.logo}>LabNarrative</div>
            <p>Scientific websites for research groups</p>
          </div>
          <div className={styles.proposalMeta}>
            <span>Proposal #{proposal.id.slice(0, 8).toUpperCase()}</span>
            <span>Version {proposal.version}</span>
            <span>Valid until {formatDate(form.validUntil)}</span>
          </div>
        </header>

        <section className={styles.hero}>
          <div>
            <p className={styles.eyebrow}>Prepared for</p>
            <h1>{prospect.pi_name}</h1>
            <p className={styles.institution}>{prospect.institution}{prospect.department ? ` · ${prospect.department}` : ""}</p>
          </div>
          {mode === "edit" && !locked ? (
            <input className={styles.titleInput} value={form.title} onChange={(event) => update("title", event.target.value)} />
          ) : <h2>{form.title}</h2>}
        </section>

        {websiteUrl ? (
          <section className={styles.conceptBanner}>
            <div><span>Prepared concept</span><strong>{data.site?.content?.labName || `${prospect.pi_name} laboratory website`}</strong></div>
            <a href={websiteUrl} target="_blank" rel="noreferrer">View current concept ↗</a>
          </section>
        ) : null}

        {mode === "edit" && !locked ? (
          <textarea className={styles.summaryEditor} rows={5} value={form.summary} onChange={(event) => update("summary", event.target.value)} />
        ) : <p className={styles.summary}>{form.summary}</p>}

        <section className={styles.sectionBlock}>
          <div className={styles.sectionHeading}><span>01</span><h3>Scope of work</h3></div>
          <EditableList mode={mode} locked={locked} items={form.scope} onChange={(index, value) => updateList("scope", index, value)} onRemove={(index) => removeListItem("scope", index)} onAdd={() => addListItem("scope")} addLabel="Add scope item" />
        </section>

        <section className={styles.sectionBlock}>
          <div className={styles.sectionHeading}><span>02</span><h3>Deliverables</h3></div>
          <EditableList mode={mode} locked={locked} items={form.deliverables} onChange={(index, value) => updateList("deliverables", index, value)} onRemove={(index) => removeListItem("deliverables", index)} onAdd={() => addListItem("deliverables")} addLabel="Add deliverable" />
        </section>

        <section className={styles.commercialGrid}>
          <article>
            <span>Package</span>
            {mode === "edit" && !locked ? (
              <div className={styles.packageEditor}>
                <div className={styles.presetButtons}>
                  {(["starter","standard","pro","custom"] as const).map((key) => <button type="button" key={key} className={form.packageKey === key ? styles.selectedPreset : undefined} onClick={() => applyPreset(key)}>{key === "custom" ? "Custom" : presets[key].name}</button>)}
                </div>
                <input value={form.packageName} onChange={(event) => update("packageName", event.target.value)} />
              </div>
            ) : <strong>{form.packageName}</strong>}
          </article>
          <article>
            <span>Timeline</span>
            {mode === "edit" && !locked ? <input value={form.timeline} onChange={(event) => update("timeline", event.target.value)} /> : <strong>{form.timeline}</strong>}
          </article>
          <article className={styles.investment}>
            <span>Investment</span>
            {mode === "edit" && !locked ? <div className={styles.amountEditor}><input inputMode="decimal" value={form.price} onChange={(event) => { update("price", event.target.value); if (form.packageKey !== "custom") update("packageKey", "custom"); }} /><input value={form.currency} maxLength={3} onChange={(event) => update("currency", event.target.value.toUpperCase())} /></div> : <strong>{money(amount, form.currency)}</strong>}
          </article>
        </section>

        <section className={styles.sectionBlock}>
          <div className={styles.sectionHeading}><span>03</span><h3>Project process</h3></div>
          <EditableList mode={mode} locked={locked} items={form.process} onChange={(index, value) => updateList("process", index, value)} onRemove={(index) => removeListItem("process", index)} onAdd={() => addListItem("process")} addLabel="Add process step" numbered />
        </section>

        <section className={styles.paymentPanel}>
          <div>
            <p className={styles.eyebrow}>Payment structure</p>
            <h3>{depositPercent}% deposit to begin</h3>
            <p>The remaining balance is due before final handover.</p>
          </div>
          <dl>
            <div><dt>Project total</dt><dd>{money(amount, form.currency)}</dd></div>
            <div><dt>Deposit</dt><dd>{money(depositAmount, form.currency)}</dd></div>
            <div><dt>Remaining balance</dt><dd>{money(balanceAmount, form.currency)}</dd></div>
          </dl>
          {mode === "edit" && !locked ? <label className={styles.depositEditor}><span>Deposit %</span><input inputMode="decimal" value={form.depositPercent} onChange={(event) => update("depositPercent", event.target.value)} /></label> : null}
        </section>

        <section className={styles.sectionBlock}>
          <div className={styles.sectionHeading}><span>04</span><h3>Terms & validity</h3></div>
          {mode === "edit" && !locked ? (
            <div className={styles.termsEditor}>
              <textarea rows={6} value={form.terms} onChange={(event) => update("terms", event.target.value)} />
              <label><span>Valid until</span><input type="date" value={form.validUntil} onChange={(event) => update("validUntil", event.target.value)} /></label>
            </div>
          ) : <p className={styles.terms}>{form.terms}</p>}
        </section>

        <footer className={styles.proposalFooter}>
          <div><strong>LabNarrative</strong><span>Research deserves a clear digital home.</span></div>
          <div><span>Prepared by</span><strong>Khaled Azzahrani, Ph.D.</strong></div>
        </footer>
      </section>

      {mode === "edit" ? (
        <section className={styles.controlPanel}>
          <article>
            <p className={styles.eyebrow}>Private notes</p>
            <h3>Internal proposal context</h3>
            <textarea rows={4} value={form.privateNotes} onChange={(event) => update("privateNotes", event.target.value)} disabled={locked} placeholder="Negotiation notes, requested changes, special pricing context…" />
          </article>
          <article>
            <p className={styles.eyebrow}>Share & status</p>
            <h3>Client delivery</h3>
            <p>Preparing a link does not send anything. After you manually send it, mark the proposal as sent so Sales schedules the follow-up.</p>
            <div className={styles.shareActions}>
              {!proposal.share_enabled && !locked ? <button type="button" onClick={() => void prepareShare()} disabled={saving}>Prepare private link</button> : null}
              {proposal.share_enabled ? <button type="button" onClick={() => void copyLink()}>Copy private link</button> : null}
              {proposal.share_enabled && !["sent","viewed","accepted","declined"].includes(proposal.status) ? <button type="button" className={styles.primaryAction} onClick={() => void markSent()} disabled={saving}>Mark as sent</button> : null}
              {proposal.share_enabled && !locked ? <button type="button" className={styles.secondaryDanger} onClick={() => void revokeLink()} disabled={saving}>Disable link</button> : null}
              {shareUrl ? <a href={shareUrl} target="_blank" rel="noreferrer">Open client view ↗</a> : null}
            </div>
          </article>
          {data.revisions.length ? <article><p className={styles.eyebrow}>History</p><h3>Previous sent versions</h3><div className={styles.revisions}>{data.revisions.map((revision) => <div key={revision.id}><strong>Version {revision.version}</strong><span>{formatDate(revision.created_at)}</span></div>)}</div></article> : null}
        </section>
      ) : null}
    </main>
  );
}

function EditableList({ mode, locked, items, onChange, onRemove, onAdd, addLabel, numbered = false }: {
  mode: "edit" | "preview";
  locked: boolean;
  items: string[];
  onChange: (index: number, value: string) => void;
  onRemove: (index: number) => void;
  onAdd: () => void;
  addLabel: string;
  numbered?: boolean;
}) {
  if (mode === "preview" || locked) {
    return <ol className={numbered ? styles.numberedList : styles.cleanList}>{items.filter(Boolean).map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ol>;
  }
  return (
    <div className={styles.listEditor}>
      {items.map((item, index) => (
        <div key={index} className={styles.listRow}>
          <span>{numbered ? String(index + 1).padStart(2,"0") : "•"}</span>
          <input value={item} onChange={(event) => onChange(index, event.target.value)} />
          <button type="button" onClick={() => onRemove(index)} aria-label="Remove item">×</button>
        </div>
      ))}
      <button type="button" className={styles.addItem} onClick={onAdd}>+ {addLabel}</button>
    </div>
  );
}
