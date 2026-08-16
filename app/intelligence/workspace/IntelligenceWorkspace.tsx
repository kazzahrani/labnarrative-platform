"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./workspace.module.css";

type ProductRow = {
  id: string;
  position: number;
  productName: string;
  catalogNumber: string;
  productUrl: string;
  priority: string;
  clientNotes: string;
  status: string;
  reportId: string;
  webReportUrl: string;
  pdfReportUrl: string;
};

type WorkspacePayload = {
  workspace: {
    id: string;
    companyName: string;
    companyWebsite: string;
    contactName: string;
    contactEmail: string;
    targetGeography: string;
    clientNotes: string;
    onboardingStatus: string;
    submittedAt?: string | null;
  };
  purchase: {
    id: string;
    packageName: string;
    productCount: number;
    amount: number;
    currency: string;
    paidAt?: string | null;
    payerName: string;
    payerEmail: string;
  };
  products: ProductRow[];
  sourceReport?: {
    id: string;
    companyName: string;
    companyWebsite: string;
    productName: string;
    catalogNumber: string;
    productUrl: string;
    target: string;
    opportunityCount: number;
    pdfUrl: string;
    createdAt?: string;
    updatedAt?: string;
  } | null;
};

const statusLabel: Record<string, string> = {
  awaiting_product: "Awaiting product",
  submitted: "Submitted",
  queued: "Queued",
  researching: "AI research",
  scientific_review: "Scientific review",
  complete: "Complete",
  blocked: "Needs review",
};

const workspaceStatusLabel: Record<string, string> = {
  awaiting_details: "Onboarding",
  collecting_products: "Portfolio setup",
  ready_for_research: "Ready for research",
  in_progress: "In progress",
  complete: "Complete",
};

const stageIndex: Record<string, number> = {
  awaiting_product: 0,
  submitted: 1,
  queued: 1,
  researching: 2,
  scientific_review: 3,
  complete: 4,
  blocked: 2,
};

function formatDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" }).format(date);
}

function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD", maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `$${amount}`;
  }
}

export default function IntelligenceWorkspace() {
  const [token, setToken] = useState("");
  const [data, setData] = useState<WorkspacePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const endpoint = `${String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "")}/functions/v1/intelligence-workspace`;

  async function callWorkspace(action: "load" | "save", payload: Record<string, unknown> = {}) {
    if (!endpoint.startsWith("https://")) throw new Error("Workspace service is unavailable.");
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, token, ...payload }),
    });
    const result = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) throw new Error(String(result.error || "Workspace request failed."));
    return result as unknown as WorkspacePayload;
  }

  useEffect(() => {
    const queryToken = new URLSearchParams(window.location.search).get("token") || "";
    setToken(queryToken);
  }, []);

  useEffect(() => {
    if (!token) {
      if (typeof window !== "undefined" && new URLSearchParams(window.location.search).has("token")) return;
      setLoading(false);
      return;
    }
    void callWorkspace("load")
      .then((result) => setData(result))
      .catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : "Workspace could not be opened."))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const submittedCount = useMemo(() => data?.products.filter((item) => item.status !== "awaiting_product").length || 0, [data]);
  const completedCount = useMemo(() => data?.products.filter((item) => item.status === "complete").length || 0, [data]);
  const researchCount = useMemo(() => data?.products.filter((item) => ["researching", "scientific_review"].includes(item.status)).length || 0, [data]);

  function updateWorkspace(field: keyof WorkspacePayload["workspace"], value: string) {
    setSaved(false);
    setData((current) => current ? { ...current, workspace: { ...current.workspace, [field]: value } } : current);
  }

  function updateProduct(position: number, field: keyof ProductRow, value: string) {
    setSaved(false);
    setData((current) => current ? {
      ...current,
      products: current.products.map((item) => item.position === position ? { ...item, [field]: value } : item),
    } : current);
  }

  async function saveWorkspace() {
    if (!data) return;
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      const refreshed = await callWorkspace("save", {
        companyName: data.workspace.companyName,
        companyWebsite: data.workspace.companyWebsite,
        contactName: data.workspace.contactName,
        contactEmail: data.workspace.contactEmail,
        targetGeography: data.workspace.targetGeography,
        clientNotes: data.workspace.clientNotes,
        products: data.products.map((item) => ({
          position: item.position,
          productName: item.productName,
          catalogNumber: item.catalogNumber,
          productUrl: item.productUrl,
          priority: item.priority,
          clientNotes: item.clientNotes,
        })),
      });
      setData(refreshed);
      setSaved(true);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Workspace could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <section className={styles.statePage}><p>Opening your private Intelligence workspace…</p></section>;
  }

  if (!token || error && !data) {
    return (
      <section className={styles.statePage}>
        <p className={styles.eyebrow}>Private workspace</p>
        <h1>{!token ? "A workspace access link is required." : "This workspace could not be opened."}</h1>
        <p>{error || "Use the secure workspace link provided immediately after your LabNarrative Intelligence payment."}</p>
        <a href="mailto:hello@labnarrative.com">Contact LabNarrative →</a>
      </section>
    );
  }

  if (!data) return null;

  const companyReady = Boolean(data.workspace.companyName && data.workspace.contactName && data.workspace.contactEmail);
  const liveWorkspaceStatus = workspaceStatusLabel[data.workspace.onboardingStatus] || "Active";

  return (
    <>
      <section className={styles.hero}>
        <p className={styles.eyebrow}>Client Intelligence workspace</p>
        <div className={styles.heroGrid}>
          <div>
            <h1>Your scientific portfolio,<br /><em>under active intelligence.</em></h1>
            <p className={styles.heroCopy}>AI-powered discovery and evidence analysis, followed by scientific validation before client delivery.</p>
          </div>
          <div className={styles.packageCard}>
            <span>Purchased package</span>
            <strong>{data.purchase.packageName}</strong>
            <div><b>{data.purchase.productCount}</b> product analyses</div>
            <div className={styles.paymentLine}><b>{formatMoney(data.purchase.amount, data.purchase.currency)}</b><span>{data.purchase.currency}</span></div>
            <small>{data.purchase.paidAt ? `Paid ${formatDate(data.purchase.paidAt)}` : "Payment confirmed"}</small>
          </div>
        </div>
      </section>

      <section className={styles.summaryStrip} aria-label="Workspace summary">
        <div><span>Products submitted</span><strong>{submittedCount} / {data.purchase.productCount}</strong></div>
        <div><span>In research / review</span><strong>{researchCount}</strong></div>
        <div><span>Reports complete</span><strong>{completedCount}</strong></div>
        <div><span>Workspace status</span><strong>{liveWorkspaceStatus}</strong></div>
      </section>

      {data.sourceReport ? (
        <section className={styles.complimentary}>
          <div>
            <p className={styles.eyebrow}>Your complimentary report</p>
            <h2>{data.sourceReport.productName}</h2>
            <p>{data.sourceReport.companyName}{data.sourceReport.catalogNumber ? ` · ${data.sourceReport.catalogNumber}` : ""}</p>
          </div>
          <div className={styles.complimentaryMetric}>
            <span>Verified opportunities</span>
            <strong>{data.sourceReport.opportunityCount}</strong>
          </div>
          <a href={data.sourceReport.pdfUrl} target="_blank" rel="noreferrer">VIEW COMPLIMENTARY PDF →</a>
        </section>
      ) : null}

      <section className={styles.details} id="details">
        <div className={styles.sectionHead}>
          <div>
            <p className={styles.eyebrow}>01 · Client details</p>
            <h2>Tell us who the portfolio belongs to.</h2>
          </div>
          <p>These details anchor the engagement and help us interpret the products in the correct commercial context.</p>
        </div>
        <div className={styles.formGrid}>
          <label><span>Company name *</span><input value={data.workspace.companyName} onChange={(e) => updateWorkspace("companyName", e.target.value)} placeholder="Company name" /></label>
          <label><span>Company website</span><input value={data.workspace.companyWebsite} onChange={(e) => updateWorkspace("companyWebsite", e.target.value)} placeholder="https://…" /></label>
          <label><span>Contact name *</span><input value={data.workspace.contactName} onChange={(e) => updateWorkspace("contactName", e.target.value)} placeholder="Name" /></label>
          <label><span>Contact email *</span><input type="email" value={data.workspace.contactEmail} onChange={(e) => updateWorkspace("contactEmail", e.target.value)} placeholder="name@company.com" /></label>
          <label><span>Target geography</span><input value={data.workspace.targetGeography} onChange={(e) => updateWorkspace("targetGeography", e.target.value)} placeholder="Global, GCC, US, Europe…" /></label>
          <label><span>Commercial notes</span><input value={data.workspace.clientNotes} onChange={(e) => updateWorkspace("clientNotes", e.target.value)} placeholder="Optional priorities or context" /></label>
        </div>
      </section>

      <section className={styles.portfolio} id="portfolio">
        <div className={styles.sectionHead}>
          <div>
            <p className={styles.eyebrow}>02 · Product portfolio</p>
            <h2>Choose the products we should analyze.</h2>
          </div>
          <p>You can use a product name, catalogue number, direct product URL, or all three. Submitted products become the queue for the Intelligence team.</p>
        </div>

        <div className={styles.productList}>
          {data.products.map((item) => {
            const locked = !["awaiting_product", "submitted"].includes(item.status);
            return (
              <article className={styles.productCard} key={item.id}>
                <header>
                  <div><span className={styles.productNumber}>{String(item.position).padStart(2, "0")}</span><strong>Product analysis</strong></div>
                  <span className={`${styles.status} ${styles[`status_${item.status}`] || ""}`}>{statusLabel[item.status] || item.status}</span>
                </header>
                <div className={styles.productFields}>
                  <label><span>Product name</span><input disabled={locked} value={item.productName} onChange={(e) => updateProduct(item.position, "productName", e.target.value)} placeholder="Product name" /></label>
                  <label><span>Catalogue / SKU</span><input disabled={locked} value={item.catalogNumber} onChange={(e) => updateProduct(item.position, "catalogNumber", e.target.value)} placeholder="Optional" /></label>
                  <label className={styles.urlField}><span>Product URL</span><input disabled={locked} value={item.productUrl} onChange={(e) => updateProduct(item.position, "productUrl", e.target.value)} placeholder="https://…" /></label>
                  <label><span>Priority</span><select disabled={locked} value={item.priority} onChange={(e) => updateProduct(item.position, "priority", e.target.value)}><option value="high">High</option><option value="normal">Normal</option><option value="low">Low</option></select></label>
                  <label className={styles.notesField}><span>Notes</span><input disabled={locked} value={item.clientNotes} onChange={(e) => updateProduct(item.position, "clientNotes", e.target.value)} placeholder="Optional application, market or positioning note" /></label>
                </div>
                {item.status === "complete" ? (
                  <footer className={styles.reportActions}>
                    {item.webReportUrl ? <a href={item.webReportUrl} target="_blank" rel="noreferrer">VIEW WEB REPORT →</a> : null}
                    {item.pdfReportUrl ? <a href={item.pdfReportUrl} target="_blank" rel="noreferrer">DOWNLOAD PDF →</a> : null}
                  </footer>
                ) : (
                  <footer className={styles.stageLine}>
                    {['Submitted','AI discovery','Scientific validation','Delivery'].map((label, index) => <span key={label} className={stageIndex[item.status] >= index + 1 ? styles.stageActive : ""}>{label}</span>)}
                  </footer>
                )}
              </article>
            );
          })}
        </div>

        <div className={styles.saveBar}>
          <div>
            <strong>{submittedCount} of {data.purchase.productCount} product slots filled</strong>
            <span>{companyReady ? "Client details complete" : "Complete company name, contact name and email"}</span>
          </div>
          <button type="button" onClick={saveWorkspace} disabled={saving}>{saving ? "SAVING…" : "SAVE & SUBMIT PORTFOLIO →"}</button>
        </div>
        {saved ? <p className={styles.saved}>{data.workspace.onboardingStatus === "in_progress" ? "Submitted. Your products are now queued in the Intelligence engagement." : "Saved. Your workspace details are up to date."}</p> : null}
        {error ? <p className={styles.error}>{error}</p> : null}
      </section>

      <section className={styles.process} id="process">
        <div className={styles.sectionHead}>
          <div>
            <p className={styles.eyebrow}>03 · How the work is produced</p>
            <h2>AI-scale research. Scientist-level validation.</h2>
          </div>
          <p>The client buys validated scientific commercial intelligence—not raw AI output.</p>
        </div>
        <div className={styles.processGrid}>
          <div><span>01</span><h3>AI discovery</h3><p>Large-scale scientific search identifies candidate laboratories, publications, methods and product-fit signals.</p></div>
          <div><span>02</span><h3>Evidence analysis</h3><p>AI structures, cross-checks and ranks the scientific evidence while removing weak or unverifiable matches.</p></div>
          <div><span>03</span><h3>Scientific validation</h3><p>A scientific review gate checks relevance, evidence quality and interpretation before client delivery.</p></div>
          <div><span>04</span><h3>Intelligence delivery</h3><p>Approved results are released here as polished web and PDF reports for commercial use.</p></div>
        </div>
      </section>
    </>
  );
}
