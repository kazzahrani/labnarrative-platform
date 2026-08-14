"use client";

import { useMemo, useState } from "react";
import styles from "./page.module.css";

type Lead = {
  id: number;
  company: string;
  contact: string;
  email: string;
  source: string;
  value: number;
  score: number;
  stage: "New" | "Qualified" | "Proposal" | "Won";
  reason: string;
  next: string;
};

const initialLeads: Lead[] = [
  { id: 1, company: "Northstar Bio", contact: "Maya Chen", email: "maya@northstar.example", source: "Website", value: 18000, score: 92, stage: "Qualified", reason: "Strong fit, clear buying intent and high-value service need.", next: "Send tailored discovery email" },
  { id: 2, company: "Atlas Consulting", contact: "Omar Rahman", email: "omar@atlas.example", source: "Referral", value: 9500, score: 81, stage: "Proposal", reason: "Warm referral with an active operations project and near-term timeline.", next: "Follow up on proposal" },
  { id: 3, company: "Nexa Health", contact: "Sarah Miller", email: "sarah@nexa.example", source: "LinkedIn", value: 14000, score: 74, stage: "New", reason: "Relevant company profile, but buying urgency still needs qualification.", next: "Ask 3 qualification questions" },
  { id: 4, company: "Vertex Labs", contact: "Daniel Park", email: "daniel@vertex.example", source: "Website", value: 22000, score: 88, stage: "Qualified", reason: "High-value account with multiple workflow pain points and executive engagement.", next: "Book workflow mapping call" },
  { id: 5, company: "Meridian Group", contact: "Lina Haddad", email: "lina@meridian.example", source: "Campaign", value: 7200, score: 67, stage: "New", reason: "Good fit but limited engagement so far.", next: "Send case-study follow-up" },
  { id: 6, company: "Axiom Research", contact: "Thomas Reed", email: "thomas@axiom.example", source: "Referral", value: 16500, score: 95, stage: "Won", reason: "Excellent fit, urgent need and decision-maker involvement.", next: "Kickoff scheduled" },
];

const stages: Lead["stage"][] = ["New", "Qualified", "Proposal", "Won"];

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

export default function SystemsDemoPage() {
  const [active, setActive] = useState("Overview");
  const [leads, setLeads] = useState(initialLeads);
  const [selectedId, setSelectedId] = useState(1);
  const [sequenceEnabled, setSequenceEnabled] = useState(true);
  const [toast, setToast] = useState("");

  const selected = leads.find((lead) => lead.id === selectedId) ?? leads[0];
  const pipelineValue = leads.filter((lead) => lead.stage !== "Won").reduce((sum, lead) => sum + lead.value, 0);
  const qualified = leads.filter((lead) => lead.score >= 80 && lead.stage !== "Won").length;
  const wonValue = leads.filter((lead) => lead.stage === "Won").reduce((sum, lead) => sum + lead.value, 0);

  const stageCounts = useMemo(() => Object.fromEntries(stages.map((stage) => [stage, leads.filter((lead) => lead.stage === stage).length])), [leads]);

  function moveLead(id: number, stage: Lead["stage"]) {
    setLeads((current) => current.map((lead) => lead.id === id ? { ...lead, stage } : lead));
    setToast(`Moved to ${stage}`);
    window.setTimeout(() => setToast(""), 1800);
  }

  function simulateLead() {
    const id = Math.max(...leads.map((lead) => lead.id)) + 1;
    setLeads((current) => [
      { id, company: "Helix Partners", contact: "Alex Morgan", email: "alex@helix.example", source: "Website", value: 12500, score: 86, stage: "New", reason: "AI detected strong service fit and clear operational pain in the enquiry.", next: "Send personalised introduction" },
      ...current,
    ]);
    setSelectedId(id);
    setActive("Leads");
    setToast("New lead captured and scored automatically");
    window.setTimeout(() => setToast(""), 2200);
  }

  return (
    <main className={styles.page}>
      {toast ? <div className={styles.toast}>{toast}</div> : null}

      <aside className={styles.sidebar}>
        <a href="/systems" className={styles.brand}><span>Lab</span>Narrative <b>Systems</b></a>
        <div className={styles.workspaceLabel}>Demo workspace</div>
        <nav>
          {["Overview", "Leads", "Automation", "Reports"].map((item) => (
            <button key={item} className={active === item ? styles.activeNav : ""} onClick={() => setActive(item)}>
              <span>{item === "Overview" ? "◫" : item === "Leads" ? "◎" : item === "Automation" ? "↯" : "↗"}</span>{item}
            </button>
          ))}
        </nav>
        <div className={styles.sidebarBottom}>
          <span>Flagship demo</span>
          <small>Sales & follow-up system</small>
          <a href="mailto:hello@labnarrative.com?subject=Build%20a%20system%20like%20this">Build a system like this ↗</a>
        </div>
      </aside>

      <section className={styles.main}>
        <header className={styles.topbar}>
          <div>
            <span className={styles.kicker}>Northstar Services</span>
            <h1>{active}</h1>
          </div>
          <div className={styles.topActions}>
            <span className={styles.live}><i /> Automation live</span>
            <button onClick={simulateLead}>+ Simulate new lead</button>
          </div>
        </header>

        {active === "Overview" ? (
          <div className={styles.content}>
            <section className={styles.metrics}>
              <article><span>Open pipeline</span><strong>{money(pipelineValue)}</strong><small>Across {leads.filter((l) => l.stage !== "Won").length} opportunities</small></article>
              <article><span>High-fit leads</span><strong>{qualified}</strong><small>AI score ≥ 80</small></article>
              <article><span>Won this month</span><strong>{money(wonValue)}</strong><small>1 converted account</small></article>
              <article><span>Follow-ups due</span><strong>4</strong><small>2 high priority</small></article>
            </section>

            <section className={styles.twoCol}>
              <article className={styles.panel}>
                <div className={styles.panelHead}><div><span>Pipeline</span><h2>Priority opportunities</h2></div><button onClick={() => setActive("Leads")}>View all →</button></div>
                <div className={styles.tableHead}><span>Account</span><span>AI fit</span><span>Stage</span><span>Value</span></div>
                {leads.slice(0, 5).map((lead) => (
                  <button className={styles.tableRow} key={lead.id} onClick={() => { setSelectedId(lead.id); setActive("Leads"); }}>
                    <div><strong>{lead.company}</strong><small>{lead.contact}</small></div>
                    <b className={lead.score >= 85 ? styles.highScore : ""}>{lead.score}</b>
                    <em>{lead.stage}</em>
                    <span>{money(lead.value)}</span>
                  </button>
                ))}
              </article>

              <article className={styles.panel}>
                <div className={styles.panelHead}><div><span>Today</span><h2>Automation activity</h2></div></div>
                <div className={styles.activity}><i>✓</i><div><strong>Lead qualified</strong><p>Northstar Bio scored 92/100.</p><small>09:14</small></div></div>
                <div className={styles.activity}><i>↗</i><div><strong>Follow-up prepared</strong><p>Atlas Consulting proposal follow-up is ready.</p><small>08:42</small></div></div>
                <div className={styles.activity}><i>✓</i><div><strong>Sequence stopped</strong><p>Axiom Research replied and moved to Won.</p><small>Yesterday</small></div></div>
                <div className={styles.activity}><i>◎</i><div><strong>New enquiry captured</strong><p>Nexa Health added from website form.</p><small>Yesterday</small></div></div>
              </article>
            </section>

            <section className={styles.panel}>
              <div className={styles.panelHead}><div><span>Funnel</span><h2>Current pipeline</h2></div></div>
              <div className={styles.funnel}>
                {stages.map((stage, index) => (
                  <div key={stage}><span>{stage}</span><strong>{stageCounts[stage]}</strong><div style={{ width: `${100 - index * 17}%` }} /></div>
                ))}
              </div>
            </section>
          </div>
        ) : null}

        {active === "Leads" ? (
          <div className={styles.content}>
            <section className={styles.leadLayout}>
              <div className={styles.panel}>
                <div className={styles.panelHead}><div><span>AI-ranked</span><h2>Opportunity list</h2></div><small>{leads.length} accounts</small></div>
                <div className={styles.leadList}>
                  {leads.map((lead) => (
                    <button key={lead.id} onClick={() => setSelectedId(lead.id)} className={selectedId === lead.id ? styles.selectedLead : ""}>
                      <div><strong>{lead.company}</strong><small>{lead.contact} · {lead.source}</small></div>
                      <b className={lead.score >= 85 ? styles.highScore : ""}>{lead.score}</b>
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.detailPanel}>
                <div className={styles.detailTop}>
                  <div><span>Opportunity</span><h2>{selected.company}</h2><p>{selected.contact} · {selected.email}</p></div>
                  <div className={styles.bigScore}><small>AI fit</small><strong>{selected.score}</strong></div>
                </div>
                <div className={styles.detailGrid}>
                  <div><span>Potential value</span><strong>{money(selected.value)}</strong></div>
                  <div><span>Source</span><strong>{selected.source}</strong></div>
                  <div><span>Current stage</span><strong>{selected.stage}</strong></div>
                </div>
                <div className={styles.aiBox}><span>AI qualification</span><h3>Why this lead matters</h3><p>{selected.reason}</p></div>
                <div className={styles.nextAction}><span>Recommended next action</span><strong>{selected.next}</strong><button onClick={() => { setToast("Personalised follow-up prepared"); window.setTimeout(() => setToast(""), 1800); }}>Prepare with AI ↗</button></div>
                <div className={styles.stageControls}>
                  <span>Move stage</span>
                  <div>{stages.map((stage) => <button key={stage} className={selected.stage === stage ? styles.stageActive : ""} onClick={() => moveLead(selected.id, stage)}>{stage}</button>)}</div>
                </div>
              </div>
            </section>
          </div>
        ) : null}

        {active === "Automation" ? (
          <div className={styles.content}>
            <section className={styles.automationHero}>
              <div><span>Active workflow</span><h2>Inbound lead → qualified opportunity</h2><p>This demo shows how one enquiry can move through qualification and follow-up without disappearing into an inbox.</p></div>
              <button className={sequenceEnabled ? styles.toggleOn : styles.toggleOff} onClick={() => setSequenceEnabled(!sequenceEnabled)}><i />{sequenceEnabled ? "Enabled" : "Paused"}</button>
            </section>

            <section className={styles.workflow}>
              {[
                ["01", "Lead captured", "Website form creates the contact and opportunity record.", "Instant"],
                ["02", "AI qualification", "The system scores fit, intent, value and urgency from the enquiry.", "Instant"],
                ["03", "Human review", "High-fit leads are surfaced with the reasoning and recommended next action.", "If score ≥ 75"],
                ["04", "Personalised outreach", "A tailored first response is prepared using the lead context.", "After approval"],
                ["05", "Follow-up", "If there is no reply, the next touch is scheduled automatically.", "+3 days"],
                ["06", "Reply detected", "A genuine reply stops the sequence and returns the opportunity to a human.", "Automatic"],
              ].map(([n, title, copy, timing]) => (
                <article key={n}><span>{n}</span><div><h3>{title}</h3><p>{copy}</p></div><em>{timing}</em><i>✓</i></article>
              ))}
            </section>
          </div>
        ) : null}

        {active === "Reports" ? (
          <div className={styles.content}>
            <section className={styles.reportHeader}><div><span>Sales performance</span><h2>August operating summary</h2></div><button onClick={() => { setToast("Demo report generated"); window.setTimeout(() => setToast(""), 1800); }}>Generate report ↗</button></section>
            <section className={styles.metrics}>
              <article><span>New opportunities</span><strong>18</strong><small>+28% vs July</small></article>
              <article><span>Qualified rate</span><strong>53%</strong><small>+9 pts vs July</small></article>
              <article><span>Proposal value</span><strong>$71k</strong><small>Current open proposals</small></article>
              <article><span>Response rate</span><strong>41%</strong><small>Across automated sequences</small></article>
            </section>
            <section className={styles.twoCol}>
              <article className={styles.panel}><div className={styles.panelHead}><div><span>Source quality</span><h2>Where the best leads came from</h2></div></div><div className={styles.barList}>{[["Referral",88],["Website",82],["LinkedIn",71],["Campaign",64]].map(([name,value]) => <div key={name}><span>{name}</span><div><i style={{width:`${value}%`}} /></div><strong>{value}</strong></div>)}</div></article>
              <article className={styles.panel}><div className={styles.panelHead}><div><span>Management summary</span><h2>AI-generated interpretation</h2></div></div><div className={styles.summaryBox}><p>Pipeline quality improved this month, driven primarily by referrals and website enquiries. High-fit opportunities are moving into proposal faster, while campaign-sourced leads require more qualification.</p><p><strong>Recommended focus:</strong> prioritise referral partnerships, shorten response time for website leads and review the campaign targeting criteria before increasing volume.</p></div></article>
            </section>
          </div>
        ) : null}
      </section>
    </main>
  );
}
