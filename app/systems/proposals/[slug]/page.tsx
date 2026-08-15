import { createClient } from "@supabase/supabase-js";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import styles from "./proposal.module.css";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

type Prospect = {
  company_name: string;
  slug: string;
  demo_status: string;
  demo_config: Record<string, unknown> | null;
  industry: string | null;
  city: string | null;
  country: string | null;
};

type Proposal = {
  status: string;
  title: string;
  objective: string;
  priceSar: number;
  timeline: string;
  pilotWorkflow: string;
  deliverables: string;
  successMetrics: string;
  included: string;
  exclusions: string;
  integrationAssumptions: string;
  expansionPath: string;
  ongoingSubscriptionSar: string;
  ongoingSubscriptionNote: string;
  vatNote: string;
  nextStep: string;
};

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function asString(value: unknown) { return typeof value === "string" ? value : ""; }
function asNumber(value: unknown, fallback = 0) { return typeof value === "number" && Number.isFinite(value) ? value : fallback; }
function lines(value: string) { return value.split(/\n+/).map((line) => line.trim()).filter(Boolean); }

function readProposal(config: Record<string, unknown> | null): Proposal | null {
  const p = asObject(config?.pilotProposal);
  const status = asString(p.status);
  if (status !== "approved" && status !== "sent") return null;
  return {
    status,
    title: asString(p.title),
    objective: asString(p.objective),
    priceSar: asNumber(p.priceSar, 7500),
    timeline: asString(p.timeline),
    pilotWorkflow: asString(p.pilotWorkflow),
    deliverables: asString(p.deliverables),
    successMetrics: asString(p.successMetrics),
    included: asString(p.included),
    exclusions: asString(p.exclusions),
    integrationAssumptions: asString(p.integrationAssumptions),
    expansionPath: asString(p.expansionPath),
    ongoingSubscriptionSar: asString(p.ongoingSubscriptionSar),
    ongoingSubscriptionNote: asString(p.ongoingSubscriptionNote),
    vatNote: asString(p.vatNote),
    nextStep: asString(p.nextStep),
  };
}

async function getProspect(slug: string): Promise<{ prospect: Prospect; proposal: Proposal } | null> {
  const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await supabase.from("systems_outreach_prospects").select("company_name,slug,demo_status,demo_config,industry,city,country").eq("slug", slug).maybeSingle();
  if (error || !data?.demo_config) return null;
  const proposal = readProposal(data.demo_config as Record<string, unknown>);
  if (!proposal) return null;
  return { prospect: data as Prospect, proposal };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const result = await getProspect(slug);
  return {
    title: result ? `Private Pilot Proposal — ${result.prospect.company_name} | LabNarrative Systems` : "Private Pilot Proposal | LabNarrative Systems",
    description: result ? `A private LabNarrative Systems operational Pilot proposal for ${result.prospect.company_name}.` : "Private LabNarrative Systems Pilot proposal.",
    robots: { index: false, follow: false, nocache: true },
  };
}

export default async function PilotProposalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const result = await getProspect(slug);
  if (!result) notFound();
  const { prospect, proposal } = result;
  const location = [prospect.city, prospect.country].filter(Boolean).join(" · ");

  return <main className={styles.page}>
    <section className={styles.hero}>
      <div className={styles.heroTop}><div className={styles.brand}><span>Lab</span>Narrative <b>Systems</b></div><div className={styles.private}>Private Pilot Proposal</div></div>
      <div className={styles.heroGrid}><div><p className={styles.eyebrow}>Operational Pilot · discovery-led</p><h1>{proposal.title || `${prospect.company_name} — Operational Pilot`}</h1><p className={styles.lead}>{proposal.objective}</p><div className={styles.meta}>{prospect.industry ? <span>{prospect.industry}</span> : null}{location ? <span>{location}</span> : null}<span>Prepared by LabNarrative Systems</span></div></div><div className={styles.priceCard}><span>Pilot implementation</span><strong>SAR {proposal.priceSar.toLocaleString("en-US")}</strong><small>{proposal.vatNote || "VAT, if applicable, is handled separately."}</small></div></div>
    </section>

    <section className={styles.flow}><span>Focused Pilot first</span><b>Discovery</b><i>→</i><b>Operational Pilot</b><i>→</i><b>Validate value</b><i>→</i><b>Full system / integrations</b></section>

    <section className={styles.twoCol}>
      <article className={styles.card}><p className={styles.kicker}>Pilot workflow</p><h2>One real workflow, end to end</h2><div className={styles.workflow}>{proposal.pilotWorkflow}</div><p className={styles.note}>The Pilot is deliberately limited in scope so the team can validate the operating model before a broader rollout.</p></article>
      <article className={styles.card}><p className={styles.kicker}>Estimated implementation</p><h2>{proposal.timeline}</h2><p className={styles.note}>Timing begins after the final Pilot scope and required access/data are confirmed.</p>{prospect.demo_status === "ready" ? <a className={styles.demoLink} href={`/systems/demos/${prospect.slug}`} target="_blank" rel="noreferrer">Open the tailored operational demo ↗</a> : null}</article>
    </section>

    <section className={styles.section}><div className={styles.sectionTitle}><span>01</span><div><p>What the Pilot includes</p><h2>Focused deliverables</h2></div></div><div className={styles.listGrid}>{lines(proposal.deliverables).map((item) => <div className={styles.listItem} key={item}><b>✓</b><span>{item}</span></div>)}</div></section>

    <section className={styles.section}><div className={styles.sectionTitle}><span>02</span><div><p>How we judge the Pilot</p><h2>Success criteria</h2></div></div><div className={styles.listGrid}>{lines(proposal.successMetrics).map((item) => <div className={styles.listItem} key={item}><b>◆</b><span>{item}</span></div>)}</div></section>

    <section className={styles.twoCol}>
      <article className={styles.card}><p className={styles.kicker}>Included in SAR {proposal.priceSar.toLocaleString("en-US")}</p><h2>Pilot scope</h2><ul>{lines(proposal.included).map((item) => <li key={item}>{item}</li>)}</ul></article>
      <article className={`${styles.card} ${styles.boundaryCard}`}><p className={styles.kicker}>Separately scoped</p><h2>Not silently included</h2><ul>{lines(proposal.exclusions).map((item) => <li key={item}>{item}</li>)}</ul></article>
    </section>

    <section className={styles.section}><div className={styles.sectionTitle}><span>03</span><div><p>Existing systems</p><h2>Connect rather than replace</h2></div></div><p className={styles.body}>{proposal.integrationAssumptions}</p></section>

    <section className={styles.expansion}><div><p className={styles.kicker}>After a successful Pilot</p><h2>From proof of value to the full operating system</h2><p>{proposal.expansionPath}</p></div><div className={styles.steps}><span>01 <b>Pilot</b></span><span>02 <b>Full System</b></span><span>03 <b>Integrations</b></span><span>04 <b>Expansion</b></span></div></section>

    {proposal.ongoingSubscriptionSar ? <section className={styles.subscription}><div><span>Optional ongoing operation after Pilot</span><strong>SAR {Number(proposal.ongoingSubscriptionSar).toLocaleString("en-US")} / month</strong></div><p>{proposal.ongoingSubscriptionNote}</p></section> : proposal.ongoingSubscriptionNote ? <section className={styles.subscription}><div><span>Ongoing operation after Pilot</span><strong>Agreed separately</strong></div><p>{proposal.ongoingSubscriptionNote}</p></section> : null}

    <section className={styles.next}><p>Recommended next step</p><h2>{proposal.nextStep}</h2><div className={styles.contact}><strong>Dr. Khaled Azzahrani</strong><span>Founder · LabNarrative</span><span>khaled@labnarrative.com · +966-570575261</span></div></section>

    <footer><div className={styles.brand}><span>Lab</span>Narrative <b>Systems</b></div><p>This proposal is private and reflects the current agreed/discovered Pilot scope. Final technical details are confirmed before kickoff.</p></footer>
  </main>;
}
