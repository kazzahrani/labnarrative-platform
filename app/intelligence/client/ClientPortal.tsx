"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./client.module.css";
import { intelligenceAuth, intelligenceFunctionsBase } from "./authClient";

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

type PortalData = {
  workspace: {
    id: string;
    companyName: string;
    companyWebsite: string;
    contactName: string;
    contactEmail: string;
    targetGeography: string;
    clientNotes: string;
    onboardingStatus: string;
  };
  purchase: {
    id: string;
    packageName: string;
    productCount: number;
    amount: number;
    currency: string;
    paidAt?: string | null;
  };
  products: ProductRow[];
  sourceReport?: {
    id: string;
    companyName: string;
    productName: string;
    catalogNumber: string;
    opportunityCount: number;
    pdfUrl: string;
  } | null;
  profile: {
    email: string;
    fullName: string;
    companyName: string;
    companyWebsite: string;
    avatarInitials: string;
  };
  workspaceOptions: Array<{
    workspaceId: string;
    packageName: string;
    productCount: number;
    amount: number;
    currency: string;
    paidAt?: string | null;
    status: string;
    companyName: string;
  }>;
  activeWorkspaceId: string;
};

type Tab = "overview" | "analyses" | "reports" | "company" | "billing" | "profile";

const nav: Array<{ key: Tab; label: string; icon: string }> = [
  { key: "overview", label: "Overview", icon: "◌" },
  { key: "analyses", label: "My Analyses", icon: "◇" },
  { key: "reports", label: "Reports", icon: "▤" },
  { key: "company", label: "Company", icon: "▣" },
  { key: "billing", label: "Billing", icon: "$" },
  { key: "profile", label: "Profile", icon: "○" },
];

const statusLabel: Record<string, string> = {
  awaiting_product: "Available",
  submitted: "Submitted",
  queued: "Queued",
  researching: "AI research",
  scientific_review: "Scientific review",
  complete: "Complete",
  blocked: "Needs review",
};

function money(amount: number, currency: string) {
  try { return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount); }
  catch { return `$${amount}`; }
}
function date(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" }).format(d);
}
function hasIdentity(p: ProductRow) { return Boolean(p.productName.trim() || p.catalogNumber.trim() || p.productUrl.trim()); }

export default function ClientPortal() {
  const [tab, setTab] = useState<Tab>("overview");
  const [data, setData] = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [profileDraft, setProfileDraft] = useState({ fullName: "", companyName: "", companyWebsite: "" });

  async function portalCall(action: string, extra: Record<string, unknown> = {}) {
    const session = await intelligenceAuth.auth.getSession();
    const access = session.data.session?.access_token;
    if (!access) {
      window.location.href = "/intelligence/login";
      throw new Error("Sign in required.");
    }
    const response = await fetch(`${intelligenceFunctionsBase}/intelligence-client-portal`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${access}` },
      body: JSON.stringify({ action, workspaceId: data?.activeWorkspaceId, ...extra }),
    });
    const payload = await response.json().catch(() => ({})) as Record<string, any>;
    if (response.status === 401) {
      await intelligenceAuth.auth.signOut();
      window.location.href = "/intelligence/login";
      throw new Error("Your session expired. Please sign in again.");
    }
    if (!response.ok) throw new Error(String(payload.error || "Client portal request failed."));
    return payload as PortalData;
  }

  useEffect(() => {
    void intelligenceAuth.auth.getSession().then(async ({ data: sessionData }) => {
      if (!sessionData.session) {
        window.location.href = "/intelligence/login";
        return;
      }
      try {
        const result = await fetch(`${intelligenceFunctionsBase}/intelligence-client-portal`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionData.session.access_token}` },
          body: JSON.stringify({ action: "load" }),
        });
        const payload = await result.json();
        if (!result.ok) throw new Error(String(payload.error || "Portal could not be opened."));
        setData(payload as PortalData);
        setProfileDraft({ fullName: payload.profile?.fullName || "", companyName: payload.profile?.companyName || payload.workspace?.companyName || "", companyWebsite: payload.profile?.companyWebsite || payload.workspace?.companyWebsite || "" });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Portal could not be opened.");
      } finally {
        setLoading(false);
      }
    });
  }, []);

  const submitted = useMemo(() => data?.products.filter((p) => p.status !== "awaiting_product").length || 0, [data]);
  const active = useMemo(() => data?.products.filter((p) => ["submitted", "queued", "researching", "scientific_review"].includes(p.status)).length || 0, [data]);
  const complete = useMemo(() => data?.products.filter((p) => p.status === "complete").length || 0, [data]);
  const available = useMemo(() => data?.products.filter((p) => p.status === "awaiting_product").length || 0, [data]);
  const nextSlot = useMemo(() => data?.products.find((p) => p.status === "awaiting_product") || null, [data]);

  function updateProduct(position: number, field: keyof ProductRow, value: string) {
    setNotice("");
    setData((current) => current ? { ...current, products: current.products.map((p) => p.position === position ? { ...p, [field]: value } : p) } : current);
  }
  function payloadFromCurrent() {
    if (!data) return {};
    return {
      companyName: data.workspace.companyName,
      companyWebsite: data.workspace.companyWebsite,
      contactName: data.workspace.contactName,
      contactEmail: data.workspace.contactEmail,
      targetGeography: data.workspace.targetGeography,
      clientNotes: data.workspace.clientNotes,
      products: data.products.map((p) => ({ position: p.position, productName: p.productName, catalogNumber: p.catalogNumber, productUrl: p.productUrl, priority: p.priority, clientNotes: p.clientNotes })),
    };
  }

  async function saveDraft() {
    if (!data) return;
    setBusy("save"); setError(""); setNotice("");
    try { const refreshed = await portalCall("save", payloadFromCurrent()); setData(refreshed); setNotice("Draft saved. You can return anytime."); }
    catch (e) { setError(e instanceof Error ? e.message : "Draft could not be saved."); }
    finally { setBusy(""); }
  }
  async function startAnalysis(position: number) {
    if (!data) return;
    setBusy(`start-${position}`); setError(""); setNotice("");
    try { const refreshed = await portalCall("submit_product", { ...payloadFromCurrent(), position }); setData(refreshed); setShowNew(false); setNotice("Analysis submitted. The product is now in your Intelligence queue."); }
    catch (e) { setError(e instanceof Error ? e.message : "Analysis could not be started."); }
    finally { setBusy(""); }
  }
  async function saveCompany() {
    if (!data) return;
    setBusy("company"); setError(""); setNotice("");
    try { const refreshed = await portalCall("save", payloadFromCurrent()); setData(refreshed); setNotice("Company details updated."); }
    catch (e) { setError(e instanceof Error ? e.message : "Company details could not be saved."); }
    finally { setBusy(""); }
  }
  async function saveProfile() {
    setBusy("profile"); setError(""); setNotice("");
    try { const refreshed = await portalCall("update_profile", profileDraft); setData(refreshed); setNotice("Profile updated."); }
    catch (e) { setError(e instanceof Error ? e.message : "Profile could not be updated."); }
    finally { setBusy(""); }
  }
  async function signOut() {
    await intelligenceAuth.auth.signOut();
    window.location.href = "/intelligence/login";
  }

  if (loading) return <div className={styles.state}>Opening your Intelligence client portal…</div>;
  if (!data) return <div className={styles.state}><strong>Portal unavailable</strong><span>{error || "Your client account could not be loaded."}</span><a href="/intelligence/login">Return to sign in →</a></div>;

  const company = data.workspace.companyName || data.profile.companyName || "Client account";
  const reports = data.products.filter((p) => p.status === "complete");
  const analyses = data.products.filter((p) => p.status !== "awaiting_product");

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}><div className={styles.logo}>LI</div><div><strong>LabIntelligence</strong><span>Client Portal</span></div></div>
        <div className={styles.accountBadge}><span>CLIENT ACCOUNT</span><strong>{company}</strong><small>{data.purchase.packageName} · {available} analyses available</small></div>
        <nav className={styles.nav}>
          {nav.map((item) => <button key={item.key} className={tab === item.key ? styles.navActive : ""} onClick={() => setTab(item.key)}><span>{item.icon}</span>{item.label}</button>)}
        </nav>
        <div className={styles.sideBottom}>
          <div className={styles.liveDot}><i /> Account active</div>
          <button onClick={signOut}>↪ Sign out</button>
        </div>
      </aside>

      <section className={styles.main}>
        <header className={styles.topbar}>
          <div><span>LabIntelligence / {nav.find((n) => n.key === tab)?.label}</span></div>
          <div className={styles.topActions}><span className={styles.live}>● Live data</span><button className={styles.refresh} onClick={() => window.location.reload()}>Refresh</button><button className={styles.profileChip} onClick={() => setTab("profile")}><span>{data.profile.avatarInitials || "CL"}</span><b>{data.profile.fullName || data.profile.email}</b></button></div>
        </header>

        <div className={styles.content}>
          {notice ? <div className={styles.notice}>{notice}</div> : null}
          {error ? <div className={styles.error}>{error}</div> : null}

          {tab === "overview" ? (
            <>
              <div className={styles.pageHead}><div><p>CLIENT COMMAND CENTER</p><h1>Overview</h1><span>Your scientific commercial intelligence in one place.</span></div><button className={styles.primary} onClick={() => { setTab("analyses"); setShowNew(true); }} disabled={!available}>+ START NEW ANALYSIS</button></div>
              <div className={styles.metrics}>
                <article><span>Purchased</span><strong>{data.purchase.productCount}</strong><small>{data.purchase.packageName} package</small></article>
                <article><span>In progress</span><strong>{active}</strong><small>Queued, research or review</small></article>
                <article><span>Reports ready</span><strong>{complete}</strong><small>Approved Intelligence reports</small></article>
                <article><span>Available</span><strong>{available}</strong><small>Unused analysis credits</small></article>
              </div>
              <div className={styles.twoCol}>
                <section className={styles.panel}>
                  <div className={styles.panelHead}><div><h2>Active analyses</h2><span>Current portfolio activity</span></div><button onClick={() => setTab("analyses")}>View all</button></div>
                  {analyses.length ? analyses.slice(0,5).map((p) => <div className={styles.row} key={p.id}><div><strong>{p.productName || p.catalogNumber || `Product ${p.position}`}</strong><span>{p.catalogNumber || "Product analysis"}</span></div><span className={`${styles.status} ${styles[`status_${p.status}`] || ""}`}>{statusLabel[p.status] || p.status}</span></div>) : <div className={styles.empty}>No paid analyses started yet.</div>}
                </section>
                <section className={styles.panel}>
                  <div className={styles.panelHead}><div><h2>Intelligence reference</h2><span>Your complimentary report</span></div></div>
                  {data.sourceReport ? <div className={styles.reference}><span>COMPLIMENTARY REPORT</span><strong>{data.sourceReport.productName}</strong><small>{data.sourceReport.companyName}{data.sourceReport.catalogNumber ? ` · ${data.sourceReport.catalogNumber}` : ""}</small><div><b>{data.sourceReport.opportunityCount}</b><span>verified opportunities</span></div><a href={data.sourceReport.pdfUrl} target="_blank" rel="noreferrer">VIEW REPORT →</a></div> : <div className={styles.empty}>No complimentary report is attached to this account.</div>}
                </section>
              </div>
            </>
          ) : null}

          {tab === "analyses" ? (
            <>
              <div className={styles.pageHead}><div><p>PRODUCT INTELLIGENCE</p><h1>My Analyses</h1><span>Start one product now and use the remaining credits whenever you need them.</span></div><button className={styles.primary} onClick={() => setShowNew(true)} disabled={!available}>+ START NEW ANALYSIS</button></div>
              <div className={styles.creditBar}><div><strong>{available}</strong><span>analyses remaining</span></div><div className={styles.creditTrack}><i style={{ width: `${Math.min(100, (submitted / data.purchase.productCount) * 100)}%` }} /></div><small>{submitted} of {data.purchase.productCount} submitted</small></div>
              {showNew && nextSlot ? <section className={styles.newCard}>
                <div className={styles.panelHead}><div><p>NEW ANALYSIS · SLOT {String(nextSlot.position).padStart(2,"0")}</p><h2>Tell us which product to analyze.</h2><span>A product name, catalogue number, or direct product URL is enough to start.</span></div><button onClick={() => setShowNew(false)}>Close</button></div>
                <div className={styles.formGrid}>
                  <label><span>Product name</span><input value={nextSlot.productName} onChange={(e) => updateProduct(nextSlot.position,"productName",e.target.value)} placeholder="Product name" /></label>
                  <label><span>Catalogue / SKU</span><input value={nextSlot.catalogNumber} onChange={(e) => updateProduct(nextSlot.position,"catalogNumber",e.target.value)} placeholder="Optional" /></label>
                  <label className={styles.wide}><span>Product URL</span><input value={nextSlot.productUrl} onChange={(e) => updateProduct(nextSlot.position,"productUrl",e.target.value)} placeholder="https://…" /></label>
                  <label><span>Priority</span><select value={nextSlot.priority} onChange={(e) => updateProduct(nextSlot.position,"priority",e.target.value)}><option value="high">High</option><option value="normal">Normal</option><option value="low">Low</option></select></label>
                  <label className={styles.full}><span>Notes</span><input value={nextSlot.clientNotes} onChange={(e) => updateProduct(nextSlot.position,"clientNotes",e.target.value)} placeholder="Optional application, market or positioning note" /></label>
                </div>
                <div className={styles.actions}><button className={styles.secondary} onClick={saveDraft} disabled={busy!==""}>{busy==="save"?"SAVING…":"SAVE DRAFT"}</button><button className={styles.primary} onClick={() => startAnalysis(nextSlot.position)} disabled={busy!=="" || !hasIdentity(nextSlot)}>{busy===`start-${nextSlot.position}`?<><i className={styles.spinner}/> STARTING ANALYSIS…</>:"START THIS ANALYSIS →"}</button></div>
              </section> : null}
              <section className={styles.panel}>
                <div className={styles.panelHead}><div><h2>Submitted analyses</h2><span>{analyses.length} product{analyses.length===1?"":"s"} submitted</span></div></div>
                {analyses.length ? analyses.map((p) => <div className={styles.analysisRow} key={p.id}><div className={styles.analysisIndex}>{String(p.position).padStart(2,"0")}</div><div><strong>{p.productName || p.catalogNumber || `Product ${p.position}`}</strong><span>{p.catalogNumber || p.productUrl || "Product intelligence analysis"}</span></div><div className={styles.stageMini}><span className={p.status!=="awaiting_product"?styles.on:""}>Submitted</span><span className={["researching","scientific_review","complete"].includes(p.status)?styles.on:""}>AI discovery</span><span className={["scientific_review","complete"].includes(p.status)?styles.on:""}>Validation</span><span className={p.status==="complete"?styles.on:""}>Delivery</span></div><span className={`${styles.status} ${styles[`status_${p.status}`] || ""}`}>{statusLabel[p.status] || p.status}</span></div>) : <div className={styles.empty}>No paid product analysis has been submitted yet.</div>}
              </section>
            </>
          ) : null}

          {tab === "reports" ? (
            <>
              <div className={styles.pageHead}><div><p>DELIVERABLES</p><h1>Reports</h1><span>Approved Intelligence reports appear here as soon as scientific validation is complete.</span></div></div>
              <div className={styles.reportGrid}>
                {data.sourceReport ? <article className={styles.reportCard}><span>COMPLIMENTARY</span><h2>{data.sourceReport.productName}</h2><p>{data.sourceReport.companyName}</p><div><b>{data.sourceReport.opportunityCount}</b> verified opportunities</div><a href={data.sourceReport.pdfUrl} target="_blank" rel="noreferrer">OPEN PDF →</a></article> : null}
                {reports.map((p) => <article className={styles.reportCard} key={p.id}><span>PAID ANALYSIS</span><h2>{p.productName}</h2><p>{p.catalogNumber || "Scientific commercial intelligence"}</p><div><b>✓</b> Scientist-validated</div>{p.pdfReportUrl?<a href={p.pdfReportUrl} target="_blank" rel="noreferrer">OPEN PDF →</a>:null}{p.webReportUrl?<a href={p.webReportUrl} target="_blank" rel="noreferrer">OPEN WEB REPORT →</a>:null}</article>)}
                {!data.sourceReport && !reports.length ? <div className={styles.empty}>No reports available yet.</div> : null}
              </div>
            </>
          ) : null}

          {tab === "company" ? (
            <>
              <div className={styles.pageHead}><div><p>CLIENT ORGANIZATION</p><h1>Company</h1><span>Commercial context used across your Intelligence analyses.</span></div></div>
              <section className={styles.formPanel}>
                <div className={styles.formGrid}>
                  <label><span>Company name</span><input value={data.workspace.companyName} onChange={(e)=>setData({...data,workspace:{...data.workspace,companyName:e.target.value}})} /></label>
                  <label><span>Company website</span><input value={data.workspace.companyWebsite} onChange={(e)=>setData({...data,workspace:{...data.workspace,companyWebsite:e.target.value}})} /></label>
                  <label><span>Primary contact</span><input value={data.workspace.contactName} onChange={(e)=>setData({...data,workspace:{...data.workspace,contactName:e.target.value}})} /></label>
                  <label><span>Contact email</span><input value={data.workspace.contactEmail} onChange={(e)=>setData({...data,workspace:{...data.workspace,contactEmail:e.target.value}})} /></label>
                  <label><span>Target geography</span><input value={data.workspace.targetGeography} onChange={(e)=>setData({...data,workspace:{...data.workspace,targetGeography:e.target.value}})} placeholder="Global, GCC, US, Europe…" /></label>
                  <label className={styles.full}><span>Commercial notes</span><input value={data.workspace.clientNotes} onChange={(e)=>setData({...data,workspace:{...data.workspace,clientNotes:e.target.value}})} /></label>
                </div>
                <div className={styles.actions}><button className={styles.primary} onClick={saveCompany} disabled={busy!==""}>{busy==="company"?"SAVING…":"SAVE COMPANY →"}</button></div>
              </section>
            </>
          ) : null}

          {tab === "billing" ? (
            <>
              <div className={styles.pageHead}><div><p>PURCHASES</p><h1>Billing</h1><span>Your LabNarrative Intelligence packages and one-time payments.</span></div></div>
              <section className={styles.panel}>
                {data.workspaceOptions.map((w) => <div className={styles.billingRow} key={w.workspaceId}><div><span>{w.packageName}</span><strong>{w.productCount} product analyses</strong><small>Paid {date(w.paidAt)}</small></div><div><strong>{money(w.amount,w.currency)}</strong><span>One-time payment</span></div><span className={styles.status}>{w.status === "complete" ? "Complete" : "Active"}</span></div>)}
              </section>
            </>
          ) : null}

          {tab === "profile" ? (
            <>
              <div className={styles.pageHead}><div><p>ACCOUNT</p><h1>Profile</h1><span>Your personal client portal identity.</span></div></div>
              <section className={styles.profilePanel}>
                <div className={styles.avatarLarge}>{data.profile.avatarInitials || "CL"}</div>
                <div className={styles.formGrid}>
                  <label><span>Full name</span><input value={profileDraft.fullName} onChange={(e)=>setProfileDraft({...profileDraft,fullName:e.target.value})} /></label>
                  <label><span>Email</span><input value={data.profile.email} disabled /></label>
                  <label><span>Company</span><input value={profileDraft.companyName} onChange={(e)=>setProfileDraft({...profileDraft,companyName:e.target.value})} /></label>
                  <label><span>Company website</span><input value={profileDraft.companyWebsite} onChange={(e)=>setProfileDraft({...profileDraft,companyWebsite:e.target.value})} /></label>
                </div>
                <div className={styles.actions}><button className={styles.primary} onClick={saveProfile} disabled={busy!==""}>{busy==="profile"?"SAVING…":"SAVE PROFILE →"}</button><button className={styles.secondary} onClick={signOut}>SIGN OUT</button></div>
              </section>
            </>
          ) : null}
        </div>
      </section>
    </div>
  );
}
