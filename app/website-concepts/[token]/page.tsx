import { createClient } from "@supabase/supabase-js";
import { notFound } from "next/navigation";
import styles from "./preview.module.css";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Row = {
  company_name: string;
  slug: string;
  concept_config: Record<string, unknown> | null;
  version: number;
  status: string;
};

type Obj = Record<string, unknown>;

function obj(value: unknown): Obj {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Obj : {};
}
function text(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}
function arr(value: unknown): Obj[] {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === "object" && !Array.isArray(item)) as Obj[] : [];
}

export default async function WebsiteConceptPreview({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.rpc("websites_company_public_concept", { p_token: token });
  if (error || !Array.isArray(data) || !data[0]) notFound();

  const row = data[0] as Row;
  const config = obj(row.concept_config);
  const brand = obj(config.brand);
  const about = obj(config.about);
  const cta = obj(config.cta);
  const services = arr(config.services);
  const proof = arr(config.proof);
  const navigation = Array.isArray(config.navigation) ? config.navigation.filter((item): item is string => typeof item === "string") : ["About", "Products & Services", "Industries", "Contact"];

  const company = text(brand.companyName, row.company_name);
  const eyebrow = text(brand.eyebrow, "A modern commercial website concept");
  const headline = text(brand.headline, `${company}, presented with the clarity its business deserves.`);
  const subheadline = text(brand.subheadline, "A focused redesign concept built to improve credibility, product discovery and enquiry conversion.");
  const primaryAction = text(brand.primaryAction, "Request a quotation");
  const secondaryAction = text(brand.secondaryAction, "Explore capabilities");

  return (
    <main className={styles.page}>
      <div className={styles.previewFlag}>LabNarrative concept preview · illustrative design · v{row.version}</div>
      <header className={styles.header}>
        <div className={styles.logo}>{company}</div>
        <nav>{navigation.slice(0, 5).map((item) => <span key={item}>{item}</span>)}</nav>
        <button>{primaryAction}</button>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <p>{eyebrow}</p>
          <h1>{headline}</h1>
          <h2>{subheadline}</h2>
          <div className={styles.actions}><button>{primaryAction}</button><button className={styles.secondary}>{secondaryAction}</button></div>
        </div>
        <div className={styles.heroVisual}>
          <span>01</span>
          <strong>{text(brand.visualTitle, "Clearer products. Stronger credibility. Better enquiries.")}</strong>
          <p>{text(brand.visualBody, "This preview intentionally focuses on the highest-value commercial story rather than reproducing the existing website page by page.")}</p>
        </div>
      </section>

      <section className={styles.proof}>
        {(proof.length ? proof : [
          { value: "B2B", label: "Commercial clarity" },
          { value: "RFQ", label: "Conversion-first journey" },
          { value: "EN / AR", label: "Regional usability" },
        ]).slice(0,4).map((item, index) => <article key={index}><strong>{text(item.value, `0${index + 1}`)}</strong><span>{text(item.label, "Business proof point")}</span></article>)}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionIntro}><p>{text(about.kicker, "CAPABILITIES")}</p><h2>{text(about.title, "Make it immediately obvious what the company does — and why it matters.")}</h2><span>{text(about.body, "A stronger website should help a serious buyer understand the offer quickly, find the relevant capability and move naturally into an enquiry or RFQ.")}</span></div>
        <div className={styles.cards}>
          {(services.length ? services : [
            { title: "Products & solutions", description: "A cleaner, searchable route into the company’s core commercial offering." },
            { title: "Industries & applications", description: "Connect capabilities to the customer contexts where they create value." },
            { title: "RFQ & enquiry", description: "Turn interest into a structured commercial conversation with less friction." },
          ]).slice(0,6).map((service, index) => <article key={index}><span>0{index + 1}</span><h3>{text(service.title, `Capability ${index + 1}`)}</h3><p>{text(service.description, "Focused content designed around buyer understanding and conversion.")}</p></article>)}
        </div>
      </section>

      <section className={styles.cta}>
        <div><p>COMMERCIAL JOURNEY</p><h2>{text(cta.title, "From first impression to serious enquiry.")}</h2><span>{text(cta.body, "The concept is designed to shorten the distance between ‘Who are they?’ and ‘I want to speak with them.’")}</span></div>
        <button>{text(cta.action, primaryAction)}</button>
      </section>

      <footer><strong>{company}</strong><span>Concept designed by LabNarrative Websites</span><small>This is an illustrative redesign preview based on verified public information. It is not the company’s live website.</small></footer>
    </main>
  );
}
