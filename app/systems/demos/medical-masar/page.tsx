"use client";

import { useMemo, useState } from "react";
import styles from "../../demo/page.module.css";

type Opportunity = {
  id: number;
  account: string;
  contact: string;
  region: "Riyadh" | "Jeddah" | "Dammam";
  division: string;
  value: number;
  score: number;
  stage: "New" | "Technical review" | "Quotation" | "Tender" | "Won";
  reason: string;
  next: string;
};

const initialOpportunities: Opportunity[] = [
  { id: 1, account: "University Research Lab", contact: "Dr. Sara A.", region: "Riyadh", division: "Molecular Diagnostics & Life Science", value: 128000, score: 94, stage: "Quotation", reason: "Detailed PCR workflow enquiry, clear product category, active purchasing window and research-lab fit.", next: "Send quotation follow-up with application note" },
  { id: 2, account: "Regional Diagnostic Center", contact: "Mr. Faisal M.", region: "Jeddah", division: "Hematology & Blood Banks", value: 215000, score: 89, stage: "Technical review", reason: "High-value analyzer requirement with defined throughput and implementation timeline.", next: "Assign application specialist and schedule technical call" },
  { id: 3, account: "Specialist Hospital Lab", contact: "Dr. Huda K.", region: "Riyadh", division: "Immunohistochemistry", value: 176000, score: 86, stage: "Tender", reason: "Institutional opportunity with strong category fit and an active procurement process.", next: "Track tender deadline and prepare required documents" },
  { id: 4, account: "Eastern Clinical Laboratory", contact: "Mr. Omar N.", region: "Dammam", division: "Microbiology & Parasitology", value: 74000, score: 78, stage: "New", reason: "Relevant product enquiry but specifications and decision timeline still require qualification.", next: "Ask technical qualification questions" },
  { id: 5, account: "Forensic Sciences Unit", contact: "Dr. Maha R.", region: "Jeddah", division: "Toxicology & Forensic", value: 98000, score: 83, stage: "Quotation", reason: "Strong application fit with a defined analytical use case and multiple requested items.", next: "Follow up on quotation and implementation timing" },
  { id: 6, account: "Private Medical Group", contact: "Mr. Khalid S.", region: "Riyadh", division: "Molecular Diagnostics & Life Science", value: 162000, score: 96, stage: "Won", reason: "High-fit account with decision-maker engagement and completed commercial approval.", next: "Coordinate delivery, installation and training" },
];

const stages: Opportunity["stage"][] = ["New", "Technical review", "Quotation", "Tender", "Won"];

function money(value: number) {
  return new Intl.NumberFormat("en-SA", { style: "currency", currency: "SAR", maximumFractionDigits: 0 }).format(value);
}

export default function MedicalMasarConceptPage() {
  const [active, setActive] = useState("Overview");
  const [items, setItems] = useState(initialOpportunities);
  const [selectedId, setSelectedId] = useState(1);
  const [sequenceEnabled, setSequenceEnabled] = useState(true);
  const [toast, setToast] = useState("");

  const selected = items.find((item) => item.id === selectedId) ?? items[0];
  const openValue = items.filter((item) => item.stage !== "Won").reduce((sum, item) => sum + item.value, 0);
  const highFit = items.filter((item) => item.score >= 85 && item.stage !== "Won").length;
  const wonValue = items.filter((item) => item.stage === "Won").reduce((sum, item) => sum + item.value, 0);
  const stageCounts = useMemo(() => Object.fromEntries(stages.map((stage) => [stage, items.filter((item) => item.stage === stage).length])), [items]);

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 1900);
  }

  function moveOpportunity(id: number, stage: Opportunity["stage"]) {
    setItems((current) => current.map((item) => item.id === id ? { ...item, stage } : item));
    notify(`Moved to ${stage}`);
  }

  function simulateEnquiry() {
    const id = Math.max(...items.map((item) => item.id)) + 1;
    setItems((current) => [{
      id,
      account: "New Hospital Laboratory",
      contact: "Dr. Reem A.",
      region: "Riyadh",
      division: "Molecular Diagnostics & Life Science",
      value: 84000,
      score: 91,
      stage: "New",
      reason: "The system matched the enquiry to molecular diagnostics, detected an institutional buyer and identified clear purchasing intent.",
      next: "Assign Riyadh rep and prepare first response",
    }, ...current]);
    setSelectedId(id);
    setActive("Opportunities");
    notify("Enquiry captured, routed and scored automatically");
  }

  return (
    <main className={styles.page}>
      {toast ? <div className={styles.toast}>{toast}</div> : null}

      <aside className={styles.sidebar}>
        <a href="/systems" className={styles.brand}><span>Lab</span>Narrative <b>Systems</b></a>
        <div className={styles.workspaceLabel}>Private concept · Medical Masar</div>
        <nav>
          {["Overview", "Opportunities", "Automation", "Reports"].map((item) => (
            <button key={item} className={active === item ? styles.activeNav : ""} onClick={() => setActive(item)}>
              <span>{item === "Overview" ? "◫" : item === "Opportunities" ? "◎" : item === "Automation" ? "↯" : "↗"}</span>{item}
            </button>
          ))}
        </nav>
        <div className={styles.sidebarBottom}>
          <span>Prepared for Medical Masar Al Shefaa</span>
          <small>Illustrative sales & quotation workflow</small>
          <a href="mailto:hello@labnarrative.com?subject=Medical%20Masar%20Systems%20concept">Discuss this concept ↗</a>
        </div>
      </aside>

      <section className={styles.main}>
        <header className={styles.topbar}>
          <div>
            <span className={styles.kicker}>Medical Masar Al Shefaa · concept</span>
            <h1>{active}</h1>
          </div>
          <div className={styles.topActions}>
            <span className={styles.live}><i /> Automation live</span>
            <button onClick={simulateEnquiry}>+ Simulate new enquiry</button>
          </div>
        </header>

        {active === "Overview" ? (
          <div className={styles.content}>
            <section className={styles.metrics}>
              <article><span>Open opportunity value</span><strong>{money(openValue)}</strong><small>Across {items.filter((x) => x.stage !== "Won").length} active opportunities</small></article>
              <article><span>High-fit opportunities</span><strong>{highFit}</strong><small>AI score ≥ 85</small></article>
              <article><span>Won this month</span><strong>{money(wonValue)}</strong><small>Illustrative converted account</small></article>
              <article><span>Follow-ups due</span><strong>6</strong><small>3 quotation follow-ups</small></article>
            </section>

            <section className={styles.twoCol}>
              <article className={styles.panel}>
                <div className={styles.panelHead}><div><span>Commercial pipeline</span><h2>Priority opportunities</h2></div><button onClick={() => setActive("Opportunities")}>View all →</button></div>
                <div className={styles.tableHead}><span>Account</span><span>AI fit</span><span>Stage</span><span>Value</span></div>
                {items.slice(0, 5).map((item) => (
                  <button className={styles.tableRow} key={item.id} onClick={() => { setSelectedId(item.id); setActive("Opportunities"); }}>
                    <div><strong>{item.account}</strong><small>{item.region} · {item.division}</small></div>
                    <b className={item.score >= 85 ? styles.highScore : ""}>{item.score}</b>
                    <em>{item.stage}</em>
                    <span>{money(item.value)}</span>
                  </button>
                ))}
              </article>

              <article className={styles.panel}>
                <div className={styles.panelHead}><div><span>Today</span><h2>Automation activity</h2></div></div>
                <div className={styles.activity}><i>✓</i><div><strong>Enquiry routed</strong><p>Molecular diagnostics enquiry assigned to Riyadh sales.</p><small>09:21</small></div></div>
                <div className={styles.activity}><i>↗</i><div><strong>Quotation follow-up prepared</strong><p>University Research Lab follow-up is ready for review.</p><small>08:47</small></div></div>
                <div className={styles.activity}><i>◎</i><div><strong>Technical specialist assigned</strong><p>Hematology opportunity routed to application support.</p><small>Yesterday</small></div></div>
                <div className={styles.activity}><i>✓</i><div><strong>Sequence stopped</strong><p>Private Medical Group replied and moved to Won.</p><small>Yesterday</small></div></div>
              </article>
            </section>

            <section className={styles.panel}>
              <div className={styles.panelHead}><div><span>Pipeline</span><h2>Commercial funnel</h2></div></div>
              <div className={styles.funnel}>
                {stages.slice(0,4).map((stage, index) => (
                  <div key={stage}><span>{stage}</span><strong>{stageCounts[stage]}</strong><div style={{ width: `${100 - index * 15}%` }} /></div>
                ))}
              </div>
            </section>
          </div>
        ) : null}

        {active === "Opportunities" ? (
          <div className={styles.content}>
            <section className={styles.leadLayout}>
              <div className={styles.panel}>
                <div className={styles.panelHead}><div><span>AI-ranked</span><h2>Opportunity list</h2></div><small>{items.length} accounts</small></div>
                <div className={styles.leadList}>
                  {items.map((item) => (
                    <button key={item.id} onClick={() => setSelectedId(item.id)} className={selectedId === item.id ? styles.selectedLead : ""}>
                      <div><strong>{item.account}</strong><small>{item.region} · {item.division}</small></div>
                      <b className={item.score >= 85 ? styles.highScore : ""}>{item.score}</b>
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.detailPanel}>
                <div className={styles.detailTop}>
                  <div><span>Opportunity</span><h2>{selected.account}</h2><p>{selected.contact} · {selected.region}</p></div>
                  <div className={styles.bigScore}><small>AI fit</small><strong>{selected.score}</strong></div>
                </div>
                <div className={styles.detailGrid}>
                  <div><span>Potential value</span><strong>{money(selected.value)}</strong></div>
                  <div><span>Division</span><strong>{selected.division}</strong></div>
                  <div><span>Current stage</span><strong>{selected.stage}</strong></div>
                </div>
                <div className={styles.aiBox}><span>AI qualification</span><h3>Why this opportunity matters</h3><p>{selected.reason}</p></div>
                <div className={styles.nextAction}><span>Recommended next action</span><strong>{selected.next}</strong><button onClick={() => notify("Context-aware follow-up prepared")}>Prepare with AI ↗</button></div>
                <div className={styles.stageControls}>
                  <span>Move stage</span>
                  <div>{stages.map((stage) => <button key={stage} className={selected.stage === stage ? styles.stageActive : ""} onClick={() => moveOpportunity(selected.id, stage)}>{stage}</button>)}</div>
                </div>
              </div>
            </section>
          </div>
        ) : null}

        {active === "Automation" ? (
          <div className={styles.content}>
            <section className={styles.automationHero}>
              <div><span>Suggested workflow</span><h2>Enquiry → right team → quotation → follow-up</h2><p>A concept for connecting inbound demand, regional sales, technical specialists, quotations and follow-up in one operating system.</p></div>
              <button className={sequenceEnabled ? styles.toggleOn : styles.toggleOff} onClick={() => setSequenceEnabled(!sequenceEnabled)}><i />{sequenceEnabled ? "Enabled" : "Paused"}</button>
            </section>
            <section className={styles.workflow}>
              {[
                ["01", "Enquiry captured", "Website, email or rep-created enquiry enters one opportunity record.", "Instant"],
                ["02", "Product division detected", "AI classifies the request into molecular diagnostics, microbiology, hematology, IHC or toxicology.", "Instant"],
                ["03", "Region & owner assigned", "The opportunity is routed to Riyadh, Jeddah or Dammam with a responsible sales owner.", "Automatic"],
                ["04", "Technical review", "Application support is added when specifications or workflow design are required.", "When needed"],
                ["05", "Quotation follow-up", "A context-aware follow-up is prepared and scheduled if the customer has not replied.", "+2–3 days"],
                ["06", "Reply / tender detected", "Human replies stop automation; tender opportunities surface deadlines and required actions.", "Automatic"],
              ].map(([n, title, copy, timing]) => (
                <article key={n}><span>{n}</span><div><h3>{title}</h3><p>{copy}</p></div><em>{timing}</em><i>✓</i></article>
              ))}
            </section>
          </div>
        ) : null}

        {active === "Reports" ? (
          <div className={styles.content}>
            <section className={styles.reportHeader}><div><span>Commercial performance</span><h2>Management summary</h2></div><button onClick={() => notify("Concept report generated")}>Generate report ↗</button></section>
            <section className={styles.metrics}>
              <article><span>New enquiries</span><strong>26</strong><small>Across three regions</small></article>
              <article><span>Qualified rate</span><strong>61%</strong><small>Illustrative concept KPI</small></article>
              <article><span>Quotation value</span><strong>SAR 691k</strong><small>Open commercial value</small></article>
              <article><span>Response rate</span><strong>47%</strong><small>Across follow-up sequences</small></article>
            </section>
            <section className={styles.twoCol}>
              <article className={styles.panel}><div className={styles.panelHead}><div><span>Region</span><h2>Opportunity distribution</h2></div></div><div className={styles.barList}>{[["Riyadh",92],["Jeddah",74],["Dammam",48]].map(([name,value]) => <div key={name}><span>{name}</span><div><i style={{width:`${value}%`}} /></div><strong>{value}</strong></div>)}</div></article>
              <article className={styles.panel}><div className={styles.panelHead}><div><span>AI management summary</span><h2>What deserves attention</h2></div></div><div className={styles.summaryBox}><p>High-value opportunities are concentrated in molecular diagnostics, hematology and institutional procurement. Several quotations have strong fit scores but need timely follow-up to prevent commercial momentum from being lost.</p><p><strong>Suggested focus:</strong> unify enquiry capture, make ownership visible across regions, automate quotation follow-up and surface tender deadlines in one management view.</p></div></article>
            </section>
            <p style={{fontSize:12,color:"#7c8982",marginTop:24}}>Private illustrative concept prepared independently by LabNarrative. Example accounts and values are fictional and do not represent Medical Masar customer data.</p>
          </div>
        ) : null}
      </section>
    </main>
  );
}
