import Link from "next/link";
import { getAllSites } from "@/lib/sites";

const designLabels: Record<string, string> = {
  "scientific-minimal": "Scientific Minimal",
  editorial: "Editorial",
  "image-led": "Image-led",
  institutional: "Institutional",
  "bourdon-full": "Bourdon Full",
};

export default async function PlatformHome() {
  const sites = (await getAllSites()).sort((a, b) =>
    (a.labName || a.piName || a.slug).localeCompare(b.labName || b.piName || b.slug),
  );

  return (
    <main className="platform-home platform-directory-home">
      <header className="platform-header">
        <span className="platform-wordmark">LabNarrative</span>
        <div className="platform-header-actions">
          <span className="status-pill">{sites.length} public websites</span>
          <Link href="/admin">Administrator dashboard</Link>
        </div>
      </header>

      <section className="platform-hero platform-directory-hero">
        <p className="eyebrow">Database-connected scientific website platform</p>
        <h1>One platform.<br />A clear website directory.</h1>
        <p>
          Every public concept is rendered by the same secure LabNarrative application. The compact
          directory makes the growing portfolio easier to scan without turning every record into a large card.
        </p>
      </section>

      <section className="platform-directory" aria-label="Public PI websites">
        <div className="platform-directory-header" aria-hidden="true">
          <span>Website</span>
          <span>Principal investigator</span>
          <span>Institution</span>
          <span>Design</span>
          <span>Status</span>
          <span />
        </div>

        {sites.map((site) => {
          const designKey = site.design?.key || site.template || "scientific-minimal";
          return (
            <Link className="platform-directory-row" href={`/sites/${site.slug}`} key={site.slug}>
              <span className="platform-directory-name">
                <strong>{site.labName || site.piName || site.slug}</strong>
                <small>{site.slug}.labnarrative.com</small>
              </span>
              <span data-label="Principal investigator">{site.piName || "—"}</span>
              <span data-label="Institution">{site.institution || "—"}</span>
              <span data-label="Design">{designLabels[designKey] || designKey}</span>
              <span data-label="Status"><i className="platform-public-status">Public</i></span>
              <span className="platform-directory-open">Open →</span>
            </Link>
          );
        })}

        {sites.length === 0 && (
          <div className="platform-directory-empty">
            <strong>No public PI websites yet.</strong>
          </div>
        )}
      </section>

      <section className="architecture-note">
        <span>Platform model</span>
        <p>PI content is stored in Supabase and rendered dynamically by Vercel from one shared design system.</p>
      </section>
    </main>
  );
}
