import Link from "next/link";
import { getAllSites } from "@/lib/sites";

export default function PlatformHome() {
  const sites = getAllSites();

  return (
    <main className="platform-home">
      <header className="platform-header">
        <span className="platform-wordmark">LabNarrative</span>
        <span className="status-pill">Platform core v0.1</span>
      </header>

      <section className="platform-hero">
        <p className="eyebrow">Multi-tenant proof of concept</p>
        <h1>One platform. Many scientific identities.</h1>
        <p>
          These two pilot concepts are rendered by the same application. A future PI will be added as a
          new content record—not as a new website codebase.
        </p>
      </section>

      <section className="platform-grid" aria-label="Pilot concepts">
        {sites.map((site) => (
          <Link className="platform-card" href={`/sites/${site.slug}`} key={site.slug}>
            <span className="platform-card-label">{site.slug}.labnarrative.com</span>
            <h2>{site.labName}</h2>
            <p>{site.headline}</p>
            <span className="open-label">Open concept →</span>
          </Link>
        ))}
      </section>

      <section className="architecture-note">
        <span>Current stage</span>
        <p>Content is stored in code for this first test. Supabase will replace it in the next milestone.</p>
      </section>
    </main>
  );
}
